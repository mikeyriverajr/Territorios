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
  Map,
  MapPin,
  Navigation,
  Share2,
  ShieldAlert,
  Users,
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
  copyTextToClipboard,
  getPublisherGroupLink,
  getPublisherTerritoryLink,
  triggerBrowserNotification,
} from '../services/notificationHelper';
import {
  getSlotConductors,
  getTerritoryAssignees,
  isSlotAssignedTo,
  isTerritoryAssignedTo,
} from '../services/storageAndSync';

interface ConductorPortalProps {
  conductor: ConductorUser;
  schedule: ScheduleSlot[];
  territories: Territory[];
  blocks: Block[];
  housePoints: HousePoint[];
  pushNotifications: PushNotificationItem[];
  onOpenSlotMap: (slot: ScheduleSlot) => void;
  onOpenTerritoryMap: (territoryId: string) => void;
  onOpenGeneralMap: () => void;
  onCompleteWholeTerritory: (
    territoryId: string,
    conductorName: string
  ) => void;
  onMarkNotificationRead: (notifId: string) => void;
}

const CARD_THEMES = [
  {
    border: 'border-blue-300',
    headerBg: 'bg-blue-50 border-blue-200',
    accentBar: 'bg-blue-700',
    indexBadge: 'bg-blue-700 text-white',
    chipBg: 'bg-white border-blue-200 text-blue-950',
  },
  {
    border: 'border-emerald-300',
    headerBg: 'bg-emerald-50 border-emerald-200',
    accentBar: 'bg-emerald-600',
    indexBadge: 'bg-emerald-700 text-white',
    chipBg: 'bg-white border-emerald-200 text-emerald-950',
  },
  {
    border: 'border-amber-300',
    headerBg: 'bg-amber-50 border-amber-200',
    accentBar: 'bg-amber-500',
    indexBadge: 'bg-amber-600 text-white',
    chipBg: 'bg-white border-amber-200 text-amber-950',
  },
  {
    border: 'border-violet-300',
    headerBg: 'bg-violet-50 border-violet-200',
    accentBar: 'bg-violet-600',
    indexBadge: 'bg-violet-700 text-white',
    chipBg: 'bg-white border-violet-200 text-violet-950',
  },
  {
    border: 'border-cyan-300',
    headerBg: 'bg-cyan-50 border-cyan-200',
    accentBar: 'bg-cyan-600',
    indexBadge: 'bg-cyan-700 text-white',
    chipBg: 'bg-white border-cyan-200 text-cyan-950',
  },
];

export const ConductorPortal: React.FC<ConductorPortalProps> = ({
  conductor,
  schedule,
  territories,
  blocks,
  housePoints,
  pushNotifications,
  onOpenSlotMap,
  onOpenTerritoryMap,
  onOpenGeneralMap,
  onCompleteWholeTerritory,
  onMarkNotificationRead,
}) => {
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);

  // Salidas del programa asignadas a este conductor (ordenadas por fecha y hora)
  const myAssignedSlots = [...schedule]
    .filter((s) => isSlotAssignedTo(s, conductor))
    .sort((a, b) =>
      `${a.date || ''} ${a.time || ''}`.localeCompare(
        `${b.date || ''} ${b.time || ''}`
      )
    );

  // Territorios ya cubiertos por una salida programada de este conductor
  const slotCoveredTerritoryIds = new Set(
    myAssignedSlots.flatMap((s) => s.territoryIds || [])
  );

  // Territorios personales / directos que no están ya dentro de una salida programada
  const standalonePersonalTerritories = territories.filter(
    (t) =>
      !slotCoveredTerritoryIds.has(t.id) &&
      isTerritoryAssignedTo(t, conductor)
  );

  type UnifiedAssignment =
    | {
        kind: 'slot';
        key: string;
        slot: ScheduleSlot;
        itemTerritories: Territory[];
      }
    | {
        kind: 'personal';
        key: string;
        territory: Territory;
        itemTerritories: Territory[];
      };

  const unifiedAssignments: UnifiedAssignment[] = [
    ...myAssignedSlots.map((slot) => ({
      kind: 'slot' as const,
      key: `slot-${slot.id}`,
      slot,
      itemTerritories: territories.filter((t) =>
        slot.territoryIds.includes(t.id)
      ),
    })),
    ...standalonePersonalTerritories.map((territory) => ({
      kind: 'personal' as const,
      key: `personal-${territory.id}`,
      territory,
      itemTerritories: [territory],
    })),
  ];

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

  const handleCopyPublisherLink = async (key: string, link: string) => {
    await copyTextToClipboard(link);
    setCopiedLinkKey(key);
    setTimeout(() => setCopiedLinkKey(null), 3000);
  };

  const handleSharePublisherLinkNative = async (params: {
    key: string;
    title: string;
    text: string;
    url: string;
  }) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: params.title,
          text: params.text,
          url: params.url,
        });
        return;
      } catch {
        // Fallback a copiar
      }
    }
    await handleCopyPublisherLink(params.key, params.url);
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-5 space-y-6 pb-24">
      {/* Encabezado simplificado del Conductor */}
      <div className="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 rounded-3xl p-5 sm:p-6 text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black">
            Hola, {conductor.name}
          </h1>
          <p className="text-blue-100 text-sm mt-1">
            Tus territorios y salidas asignadas.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenGeneralMap}
          className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition shadow-xs shrink-0"
          title="Ver el mapa completo de todos los territorios de la congregación"
        >
          <Map className="w-4 h-4 text-amber-300" />
          <span>Mapa General</span>
        </button>
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

      {/* Lista unificada y cohesiva de asignaciones */}
      {unifiedAssignments.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-8 text-center">
          <div className="text-lg font-black text-slate-800">
            No tienes asignaciones activas.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500">
              Tus Asignaciones ({unifiedAssignments.length})
            </h2>
          </div>

          {unifiedAssignments.map((item, idx) => {
            const theme = CARD_THEMES[idx % CARD_THEMES.length];
            const itemTerritoryIds = item.itemTerritories.map((t) => t.id);
            const itemBlocks = blocks.filter((b) =>
              itemTerritoryIds.includes(b.territoryId)
            );
            const completedBlocks = itemBlocks.filter(
              (b) => b.status === 'completada'
            );
            const itemPoints = housePoints.filter((p) =>
              itemTerritoryIds.includes(p.territoryId)
            );
            const pendingNotAtHome = itemPoints.filter(
              (p) => p.status === 'no_en_casa'
            );
            const noVisitarList = itemPoints.filter(
              (p) => p.category === 'no_visitar'
            );

            const isSlot = item.kind === 'slot';
            const slot = isSlot ? item.slot : null;
            const personalTerr = !isSlot ? item.territory : null;
            const assignmentDate = isSlot
              ? slot?.date
              : personalTerr?.assignedAt || personalTerr?.startedAt;
            const assignmentNotes = isSlot
              ? slot?.notes
              : personalTerr?.assignmentNotes;
            const territoryTitle =
              item.itemTerritories.map((t) => t.name).join(', ') ||
              'Territorio asignado';
            const isAllCompleted =
              item.itemTerritories.length > 0 &&
              item.itemTerritories.every((t) => t.status === 'completado');

            // Personas adicionales que comparten esta salida o territorio
            const otherSharedNames = Array.from(
              new Set([
                ...(slot ? getSlotConductors(slot).map((c) => c.name) : []),
                ...item.itemTerritories.flatMap((t) =>
                  getTerritoryAssignees(t).map((a) => a.name)
                ),
              ])
            ).filter((name) => Boolean(name) && name !== conductor.name);

            const publisherLinkUrl =
              isSlot && slot
                ? getPublisherGroupLink(slot.id)
                : personalTerr
                ? getPublisherTerritoryLink(personalTerr.id)
                : '';
            const publisherShareTitle =
              isSlot && slot
                ? `Grupo de Predicación — ${slot.dayName}`
                : `Territorio Personal — ${territoryTitle}`;
            const publisherShareText =
              isSlot && slot
                ? `Link para anotar casas "No en casa" hoy (${slot.dayName} ${slot.time} hs):`
                : `Link para anotar casas "No en casa" en ${territoryTitle}:`;

            return (
              <div
                key={item.key}
                className={`bg-white rounded-3xl border-2 ${theme.border} shadow-md overflow-hidden flex flex-col`}
              >
                {/* Franja superior distintiva */}
                <div className={`h-2 w-full ${theme.accentBar}`} />

                {/* Encabezado cohesivo */}
                <div
                  className={`${theme.headerBg} px-5 py-4 border-b flex flex-wrap items-center justify-between gap-2.5`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isSlot && slot ? (
                      <span className="inline-flex items-center gap-1.5 bg-slate-900 text-white font-black px-3.5 py-1.5 rounded-xl text-sm sm:text-base shadow-xs">
                        <Clock className="w-4 h-4 text-amber-300 shrink-0" />
                        {slot.dayName} — {slot.time} hs
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 bg-slate-900 text-white font-black px-3.5 py-1.5 rounded-xl text-sm sm:text-base shadow-xs">
                        Territorio Personal
                      </span>
                    )}

                    {assignmentDate && (
                      <span
                        className={`inline-flex items-center gap-1.5 border font-bold px-2.5 py-1 rounded-xl text-xs ${theme.chipBg}`}
                      >
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        {assignmentDate}
                      </span>
                    )}

                    <span
                      className={`inline-flex items-center gap-1 border font-extrabold px-2.5 py-1 rounded-xl text-xs ${
                        isAllCompleted
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-white/90 text-slate-700 border-slate-300'
                      }`}
                    >
                      {isAllCompleted ? '✓ Completado' : 'En curso'}
                    </span>

                    {otherSharedNames.length > 0 && (
                      <span className="inline-flex items-center gap-1 border border-indigo-300 bg-indigo-50 text-indigo-900 font-bold px-2.5 py-1 rounded-xl text-xs">
                        <Users className="w-3.5 h-3.5 shrink-0 text-indigo-700" />
                        Compartido con: {otherSharedNames.join(', ')}
                      </span>
                    )}
                  </div>

                  <div className="font-black text-base sm:text-lg text-slate-900">
                    {territoryTitle}
                  </div>
                </div>

                {/* Cuerpo unificado */}
                <div className="p-5 space-y-4">
                  <div
                    className={`grid grid-cols-1 ${
                      isSlot ? 'md:grid-cols-2' : ''
                    } gap-3.5`}
                  >
                    {isSlot && slot && (
                      <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                          Lugar de encuentro
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-black text-sm sm:text-base text-slate-900 flex items-start gap-1.5 min-w-0">
                            <MapPin className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <span className="truncate">
                              {slot.meetingPointName}
                            </span>
                          </div>
                          {slot.meetingPointUrl && (
                            <a
                              href={slot.meetingPointUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-blue-800 border border-blue-300 font-bold py-2 px-3 rounded-xl text-xs transition"
                            >
                              <Navigation className="w-3.5 h-3.5 text-blue-600" />
                              Maps
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        Falta por hacer
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-bold">
                        {itemBlocks.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Manzanas: {completedBlocks.length}/
                            {itemBlocks.length}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-300">
                          <Home className="w-3.5 h-3.5 text-amber-600" />
                          No en casa: {pendingNotAtHome.length}
                        </span>
                        {noVisitarList.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-900 border border-red-300 font-extrabold">
                            <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                            NO VISITAR: {noVisitarList.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {assignmentNotes && (
                    <div className="bg-slate-100 border border-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl space-y-1">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        Notas
                      </div>
                      <div className="text-xs sm:text-sm font-medium">
                        {assignmentNotes}
                      </div>
                    </div>
                  )}

                  {publisherLinkUrl && (
                    <div className="bg-amber-50/90 border border-amber-300 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-black uppercase text-amber-900 flex items-center gap-1.5">
                        <Link2 className="w-4 h-4" />
                        Link para Publicadores
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() =>
                            handleCopyPublisherLink(item.key, publisherLinkUrl)
                          }
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-950 border border-amber-400 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedLinkKey === item.key ? '¡Copiado!' : 'Copiar'}
                        </button>

                        <button
                          onClick={() =>
                            handleSharePublisherLinkNative({
                              key: item.key,
                              title: publisherShareTitle,
                              text: publisherShareText,
                              url: publisherLinkUrl,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Compartir
                        </button>
                      </div>
                    </div>
                  )}

                  {/* BOTÓN PRINCIPAL */}
                  <button
                    onClick={() => {
                      if (isSlot && slot) {
                        onOpenSlotMap(slot);
                      } else if (personalTerr) {
                        onOpenTerritoryMap(personalTerr.id);
                      }
                    }}
                    className="w-full py-4 px-5 bg-blue-700 hover:bg-blue-800 text-white font-black text-base sm:text-lg rounded-2xl shadow-md flex items-center justify-center gap-2.5 cursor-pointer transition"
                  >
                    <MapPin className="w-6 h-6 text-amber-300 shrink-0" />
                    <span>ABRIR EL MAPA</span>
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
