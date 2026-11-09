import React, { useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Home,
  Link2,
  MapPin,
  Navigation,
  Share2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  Block,
  ConductorUser,
  HousePoint,
  PushNotificationItem,
  ScheduleSlot,
  Territory,
} from '../types/territory';
import {
  getPublisherGroupLink,
  triggerBrowserNotification,
} from '../services/notificationHelper';

interface ConductorPortalProps {
  conductor: ConductorUser;
  schedule: ScheduleSlot[];
  territories: Territory[];
  blocks: Block[];
  housePoints: HousePoint[];
  pushNotifications: PushNotificationItem[];
  onOpenSlotMap: (slot: ScheduleSlot) => void;
  onCompleteWholeTerritory: (
    territoryId: string,
    conductorName: string
  ) => void;
  onMarkNotificationRead: (notifId: string) => void;
}

export const ConductorPortal: React.FC<ConductorPortalProps> = ({
  conductor,
  schedule,
  territories,
  blocks,
  housePoints,
  pushNotifications,
  onOpenSlotMap,
  onCompleteWholeTerritory,
  onMarkNotificationRead,
}) => {
  const [copiedSlotId, setCopiedSlotId] = useState<string | null>(null);

  // El Conductor SOLO ve sus propios días asignados
  const myAssignedSlots = schedule.filter(
    (s) => s.conductorId === conductor.id || s.conductorName === conductor.name
  );

  // Notificaciones Push dirigidas a este conductor
  const myUnreadNotifications = pushNotifications.filter(
    (n) =>
      (n.conductorId === conductor.id || n.conductorId === 'all') &&
      !n.readByConductor
  );

  // Disparar notificación nativa en el celular del conductor cuando llega un Push nuevo del Admin
  useEffect(() => {
    if (myUnreadNotifications.length > 0) {
      const latest = myUnreadNotifications[0];
      triggerBrowserNotification(latest.title, latest.body);
    }
  }, [myUnreadNotifications.length]);

  const handleCopyPublisherLink = (slotId: string) => {
    const link = getPublisherGroupLink(slotId);
    navigator.clipboard.writeText(link);
    setCopiedSlotId(slotId);
    setTimeout(() => setCopiedSlotId(null), 3000);
  };

  const handleSharePublisherLinkNative = async (slot: ScheduleSlot) => {
    const link = getPublisherGroupLink(slot.id);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Grupo de Predicación — ${slot.dayName}`,
          text: `Link para anotar casas "No en casa" hoy (${slot.dayName} ${slot.time} hs):`,
          url: link,
        });
        return;
      } catch {
        // Fallback a copiar
      }
    }
    handleCopyPublisherLink(slot.id);
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-5 space-y-6 pb-24">
      {/* Encabezado exclusivo del Conductor */}
      <div className="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 rounded-3xl p-5 sm:p-6 text-white shadow-lg">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-800 text-amber-300 mb-2">
          <Calendar className="w-3.5 h-3.5" />
          Panel del Conductor
        </span>
        <h1 className="text-2xl sm:text-3xl font-black">
          Hola, {conductor.name}
        </h1>
        <p className="text-blue-100 text-sm sm:text-base mt-1">
          Aquí están únicamente tus días asignados para conducir. Abre tu
          territorio para ver las casas <strong>"No en casa"</strong> en la
          nube, marcar manzanas o compartir el link con los publicadores de tu
          grupo.
        </p>
      </div>

      {/* Bandeja de Notificaciones Push recibidas del Administrador */}
      {myUnreadNotifications.length > 0 && (
        <div className="space-y-2.5">
          {myUnreadNotifications.map((notif) => (
            <div
              key={notif.id}
              className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 text-amber-950 shadow-sm flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 mt-0.5">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-black text-sm sm:text-base">
                    {notif.title}
                  </div>
                  <p className="text-xs sm:text-sm mt-0.5">{notif.body}</p>
                </div>
              </div>
              <button
                onClick={() => onMarkNotificationRead(notif.id)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 text-xs font-extrabold cursor-pointer"
              >
                Entendido
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lista de días asignados a este conductor */}
      {myAssignedSlots.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 text-center space-y-2">
          <div className="text-lg font-black text-slate-800">
            No tienes salidas asignadas como conductor esta semana.
          </div>
          <p className="text-sm text-slate-500">
            Cuando el Siervo de Territorios te asigne una salida en el programa,
            aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 px-1">
            Tus Salidas Asignadas ({myAssignedSlots.length})
          </h2>

          {myAssignedSlots.map((slot) => {
            const slotTerritories = territories.filter((t) =>
              slot.territoryIds.includes(t.id)
            );
            const slotBlocks = blocks.filter((b) =>
              slot.territoryIds.includes(b.territoryId)
            );
            const completedBlocks = slotBlocks.filter(
              (b) => b.status === 'completada'
            );
            const slotPoints = housePoints.filter((p) =>
              slot.territoryIds.includes(p.territoryId)
            );
            const pendingNotAtHome = slotPoints.filter(
              (p) => p.status === 'no_en_casa'
            );
            const noVisitarList = slotPoints.filter(
              (p) => p.category === 'no_visitar'
            );

            const publisherLink = getPublisherGroupLink(slot.id);

            return (
              <div
                key={slot.id}
                className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Encabezado de la salida */}
                <div className="bg-slate-100 px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-blue-900 text-white font-black px-3.5 py-1.5 rounded-xl text-sm sm:text-base">
                    <Clock className="w-4 h-4 text-amber-300" />
                    {slot.dayName} — {slot.time} hs
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-slate-700">
                    Territorio(s):{' '}
                    {slotTerritories.map((t) => t.name).join(', ')}
                  </span>
                </div>

                <div className="p-5 space-y-4">
                  {/* Punto de encuentro y Estado en la Nube */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-xs font-extrabold uppercase text-slate-500">
                          Punto de Encuentro
                        </div>
                        <div className="font-black text-base text-slate-900 mt-1 flex items-start gap-1.5">
                          <MapPin className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                          <span>{slot.meetingPointName}</span>
                        </div>
                      </div>
                      <a
                        href={slot.meetingPointUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-blue-800 border-2 border-blue-200 font-bold py-2.5 px-3 rounded-xl text-xs sm:text-sm transition"
                      >
                        <Navigation className="w-4 h-4 text-blue-600" />
                        Ubicación en Google Maps
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
                      <div className="text-xs font-extrabold uppercase text-slate-500">
                        Resumen en la Nube del Territorio
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs sm:text-sm font-bold">
                        {slotBlocks.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Manzanas: {completedBlocks.length}/
                            {slotBlocks.length} listas
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-300">
                          <Home className="w-4 h-4 text-amber-600" />
                          {pendingNotAtHome.length} "No en casa" en la nube
                        </span>
                        {noVisitarList.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-900 border border-red-300 font-extrabold">
                            <ShieldAlert className="w-4 h-4 text-red-600" />
                            {noVisitarList.length} NO VISITAR
                          </span>
                        )}
                      </div>

                      {/* Acción rápida para marcar todo el territorio como completado */}
                      {slotTerritories.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between pt-1"
                        >
                          <span className="text-xs font-extrabold text-slate-700">
                            {t.name}:{' '}
                            {t.status === 'completado'
                              ? '✓ Completado'
                              : 'En curso'}
                          </span>
                          {t.status !== 'completado' && (
                            <button
                              onClick={() =>
                                onCompleteWholeTerritory(t.id, conductor.name)
                              }
                              className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-lg cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              Marcar {t.name} Completo
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {slot.notes && (
                    <div className="text-xs sm:text-sm bg-blue-50 border border-blue-200 text-blue-950 px-4 py-2.5 rounded-xl">
                      <strong>Nota del territorio:</strong> {slot.notes}
                    </div>
                  )}

                  {/* Caja de Link Especial para los Publicadores del Grupo */}
                  <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-black uppercase text-amber-900 flex items-center gap-1.5">
                        <Link2 className="w-4 h-4" />
                        Link Especial para los Publicadores de tu Grupo
                      </div>
                      <p className="text-xs text-amber-950">
                        Compártelo con las parejas de hoy. Les abrirá la versión
                        ultra-ligera (sin login) donde solo pueden anotar{' '}
                        <strong>"No en casa"</strong>.
                      </p>
                      <div className="text-[11px] font-mono text-amber-900 truncate max-w-md pt-0.5">
                        {publisherLink}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCopyPublisherLink(slot.id)}
                        className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-amber-100 text-amber-950 border-2 border-amber-400 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                        {copiedSlotId === slot.id ? '¡Copiado!' : 'Copiar Link'}
                      </button>

                      <button
                        onClick={() => handleSharePublisherLinkNative(slot)}
                        className="px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <Share2 className="w-4 h-4" />
                        Compartir al Grupo
                      </button>
                    </div>
                  </div>

                  {/* BOTÓN PRINCIPAL DEL CONDUCTOR PARA ABRIR EL MAPA DEL TERRITORIO */}
                  <button
                    onClick={() => onOpenSlotMap(slot)}
                    className="w-full py-4 px-5 bg-blue-700 hover:bg-blue-800 text-white font-black text-base sm:text-lg rounded-2xl shadow-md flex items-center justify-center gap-3 cursor-pointer transition"
                  >
                    <MapPin className="w-6 h-6 text-amber-300 shrink-0" />
                    <span>
                      ABRIR MAPA DEL TERRITORIO — Marcar Manzanas, No en Casa y
                      NO VISITAR
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
