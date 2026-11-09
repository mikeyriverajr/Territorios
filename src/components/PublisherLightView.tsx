import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Check,
  CheckCircle2,
  Crosshair,
  ExternalLink,
  Home,
  MapPin,
  Navigation,
  PlusCircle,
  X,
} from 'lucide-react';
import {
  Block,
  HousePoint,
  HousePointStatus,
  LatLngTuple,
  ScheduleSlot,
  Territory,
} from '../types/territory';
import { getPolygonCentroid } from '../services/kmlImporter';
import { findBlockForCoordinates } from '../services/storageAndSync';
import { getGoogleMapsNavigationUrl } from '../services/notificationHelper';

interface PublisherLightViewProps {
  slot: ScheduleSlot;
  territories: Territory[];
  blocks: Block[];
  housePoints: HousePoint[];
  onAddNotAtHome: (point: {
    territoryId: string;
    blockId?: string;
    blockCode?: string;
    lat: number;
    lng: number;
    label: string;
    notes?: string;
  }) => void;
  onMarkHouseVisited: (pointId: string, newStatus: HousePointStatus) => void;
  onExitPreview?: () => void;
}

const QUICK_CHIPS = [
  'Casa sin número',
  'Reja negra',
  'Portón blanco',
  'Casa de esquina',
  'Puerta de madera',
  '2do piso / Timbre B',
  'Pasillo al fondo',
];

export const PublisherLightView: React.FC<PublisherLightViewProps> = ({
  slot,
  territories,
  blocks,
  housePoints,
  onAddNotAtHome,
  onMarkHouseVisited,
  onExitPreview,
}) => {
  const assignedTerritories = useMemo(
    () => territories.filter((t) => slot.territoryIds.includes(t.id)),
    [territories, slot.territoryIds]
  );

  const [activeTerritoryId, setActiveTerritoryId] = useState<string>(
    assignedTerritories[0]?.id || territories[0]?.id || 'terr-1'
  );

  const activeTerritory = useMemo(
    () =>
      assignedTerritories.find((t) => t.id === activeTerritoryId) ||
      assignedTerritories[0] ||
      territories[0],
    [assignedTerritories, territories, activeTerritoryId]
  );

  const territoryBlocks = useMemo(
    () =>
      blocks
        .filter((b) => b.territoryId === activeTerritory?.id)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [blocks, activeTerritory]
  );

  const territoryPoints = useMemo(
    () => housePoints.filter((p) => p.territoryId === activeTerritory?.id),
    [housePoints, activeTerritory]
  );

  const pendingNotAtHome = useMemo(
    () =>
      territoryPoints.filter(
        (p) =>
          p.status === 'no_en_casa' ||
          (p.category === 'casa_rural' && p.status === 'pendiente')
      ),
    [territoryPoints]
  );

  // Estados para anotar un "No en casa" frente a la puerta
  const [formDraft, setFormDraft] = useState<{
    lat: number;
    lng: number;
    blockId?: string;
    blockCode?: string;
    houseNumber: string;
    chips: string[];
    notes: string;
  } | null>(null);

  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [userGps, setUserGps] = useState<LatLngTuple | null>(null);
  const [isPickingOnMap, setIsPickingOnMap] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const selectedPoint = useMemo(
    () => territoryPoints.find((p) => p.id === selectedPointId) || null,
    [territoryPoints, selectedPointId]
  );

  // Inicializar el mapa pequeño inferior
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const center: LatLngTuple = activeTerritory?.polygon?.length
      ? getPolygonCentroid(activeTerritory.polygon)
      : [-34.612, -58.443];

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 16,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Ajustar vista al territorio activo
  useEffect(() => {
    if (!mapRef.current || !activeTerritory?.polygon?.length) return;
    const bounds = L.latLngBounds(activeTerritory.polygon);
    mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
  }, [activeTerritory?.id]);

  // Permitir tocar en el mapa pequeño si el publicador quiere afinar el punto exacto
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      if (!isPickingOnMap || !activeTerritory) return;
      const coords: LatLngTuple = [e.latlng.lat, e.latlng.lng];
      const matchedBlock = findBlockForCoordinates(
        blocks,
        activeTerritory.id,
        coords
      );
      setIsPickingOnMap(false);
      setFormDraft({
        lat: coords[0],
        lng: coords[1],
        blockId: matchedBlock?.id,
        blockCode: matchedBlock?.code,
        houseNumber: '',
        chips: [],
        notes: '',
      });
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [isPickingOnMap, activeTerritory, blocks]);

  // Dibujar manzanas y pines en la nube
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group || !activeTerritory) return;

    group.clearLayers();

    if (activeTerritory.polygon.length >= 3) {
      L.polygon(activeTerritory.polygon, {
        color: '#1e3a8a',
        weight: 2.5,
        dashArray: '6, 6',
        fillOpacity: 0.03,
      }).addTo(group);
    }

    territoryBlocks.forEach((b) => {
      if (b.polygon.length < 3) return;
      const isDone = b.status === 'completada';
      const poly = L.polygon(b.polygon, {
        color: isDone ? '#059669' : '#2563eb',
        weight: 2,
        fillColor: isDone ? '#10b981' : '#3b82f6',
        fillOpacity: 0.18,
      }).addTo(group);

      poly.on('click', (e: L.LeafletMouseEvent) => {
        if (isPickingOnMap) {
          L.DomEvent.stopPropagation(e);
          setIsPickingOnMap(false);
          setFormDraft({
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            blockId: b.id,
            blockCode: b.code,
            houseNumber: '',
            chips: [],
            notes: '',
          });
        }
      });

      const centroid = getPolygonCentroid(b.polygon);
      const labelIcon = L.divIcon({
        className: 'custom-block-label',
        html: `<div style="background:${
          isDone ? '#059669' : '#1e40af'
        };color:#fff;padding:2px 8px;border-radius:999px;font-weight:900;font-size:12px;box-shadow:0 2px 5px rgba(0,0,0,0.3);">
          ${b.code}${isDone ? ' ✓' : ''}
        </div>`,
        iconSize: [44, 22],
        iconAnchor: [22, 11],
      });
      L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(group);
    });

    // Pines de No en casa pendientes y alertas NO VISITAR (solo lectura)
    territoryPoints.forEach((pt) => {
      if (pt.status === 'atendido') return;

      const isNoVisitar = pt.category === 'no_visitar';
      const bg = isNoVisitar ? '#dc2626' : '#ea580c';
      const icon = isNoVisitar ? '🛑' : '🏠';
      const tag = isNoVisitar
        ? 'NO VISITAR'
        : pt.blockCode
        ? `${pt.blockCode}`
        : 'No en casa';

      const pinIcon = L.divIcon({
        className: 'custom-house-pin',
        html: `<div style="background:${bg};color:#fff;padding:4px 8px;border-radius:10px;border:2px solid #fff;font-weight:800;font-size:12px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">
          <span>${icon}</span>
          <span>${tag}</span>
        </div>`,
        iconSize: [86, 28],
        iconAnchor: [43, 14],
      });

      const m = L.marker([pt.lat, pt.lng], { icon: pinIcon }).addTo(group);
      m.on('click', () => setSelectedPointId(pt.id));
    });

    if (userGps) {
      const gpsIcon = L.divIcon({
        className: 'custom-gps-dot',
        html: `<div style="width:18px;height:18px;border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 5px rgba(37,99,235,0.3);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker(userGps, { icon: gpsIcon }).addTo(group);
    }
  }, [
    activeTerritory,
    territoryBlocks,
    territoryPoints,
    userGps,
    isPickingOnMap,
  ]);

  // Capturar GPS frente a la casa y abrir el cuadro rápido de "No en casa"
  const handleMarkInFrontOfHouse = () => {
    if (!activeTerritory) return;

    const openWithCoords = (coords: LatLngTuple) => {
      setUserGps(coords);
      const matchedBlock = findBlockForCoordinates(
        blocks,
        activeTerritory.id,
        coords
      );
      setFormDraft({
        lat: coords[0],
        lng: coords[1],
        blockId: matchedBlock?.id,
        blockCode: matchedBlock?.code,
        houseNumber: '',
        chips: [],
        notes: '',
      });
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          openWithCoords([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {
          // Respaldo si se prueba desde una computadora o sin permisos de ubicación
          const targetBlock =
            territoryBlocks.find((b) => b.status !== 'completada') ||
            territoryBlocks[0];
          const center = targetBlock
            ? getPolygonCentroid(targetBlock.polygon)
            : getPolygonCentroid(activeTerritory.polygon);
          openWithCoords([
            Number((center[0] + (Math.random() - 0.5) * 0.0005).toFixed(6)),
            Number((center[1] + (Math.random() - 0.5) * 0.0005).toFixed(6)),
          ]);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      const center = getPolygonCentroid(activeTerritory.polygon);
      openWithCoords(center);
    }
  };

  const handleSaveNotAtHome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDraft || !activeTerritory) return;

    const parts: string[] = [];
    if (formDraft.houseNumber.trim()) {
      parts.push(formDraft.houseNumber.trim());
    }
    if (formDraft.chips.length > 0) {
      parts.push(formDraft.chips.join(', '));
    }
    const label = parts.join(' — ') || 'Casa sin número (Pin GPS)';

    onAddNotAtHome({
      territoryId: activeTerritory.id,
      blockId: formDraft.blockId,
      blockCode: formDraft.blockCode,
      lat: formDraft.lat,
      lng: formDraft.lng,
      label,
      notes: formDraft.notes.trim() || undefined,
    });

    setFormDraft(null);
    setSavedToast(
      `✅ Guardado en la nube: "${label}"${
        formDraft.blockCode ? ` (Manzana ${formDraft.blockCode})` : ''
      }`
    );
    setTimeout(() => setSavedToast(null), 4000);
  };

  const toggleChip = (chip: string) => {
    if (!formDraft) return;
    const exists = formDraft.chips.includes(chip);
    setFormDraft({
      ...formDraft,
      chips: exists
        ? formDraft.chips.filter((c) => c !== chip)
        : [...formDraft.chips, chip],
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Encabezado ligero para el Publicador */}
      <header className="bg-blue-950 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
            Modo Publicador • {slot.dayName} ({slot.time} hs)
          </div>
          <div className="font-black text-base sm:text-lg">
            {activeTerritory?.name} — Conductor: {slot.conductorName}
          </div>
        </div>
        {onExitPreview && (
          <button
            onClick={onExitPreview}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer"
          >
            Salir de vista Publicador
          </button>
        )}
      </header>

      <div className="max-w-xl w-full mx-auto px-3 sm:px-4 py-4 space-y-4 flex-1">
        {savedToast && (
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl font-extrabold text-sm shadow-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{savedToast}</span>
          </div>
        )}

        {/* Selector si hay más de 1 territorio en la salida */}
        {assignedTerritories.length > 1 && (
          <div className="flex gap-2">
            {assignedTerritories.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTerritoryId(t.id)}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-sm border-2 cursor-pointer ${
                  activeTerritory?.id === t.id
                    ? 'bg-blue-700 text-white border-blue-800'
                    : 'bg-white text-slate-800 border-slate-300'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* 1. ACCIÓN PRINCIPAL ULTRA-LIGERA: BOTÓN GIGANTE FRENTE A LA CASA */}
        <div className="bg-white rounded-3xl border-2 border-amber-400 shadow-lg p-5 text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold uppercase">
            <Crosshair className="w-3.5 h-3.5" />
            Registro Rápido sin Contraseña
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">
            ¿Nadie atendió en esta casa?
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Párese frente a la puerta y toque el botón naranja para guardar la
            ubicación GPS como <strong>"No en casa"</strong> en la nube del
            territorio.
          </p>

          <button
            onClick={handleMarkInFrontOfHouse}
            className="w-full py-5 px-5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-black text-lg sm:text-xl rounded-2xl shadow-xl flex items-center justify-center gap-3 cursor-pointer transition"
          >
            <PlusCircle className="w-7 h-7 shrink-0" />
            <span>ESTOY FRENTE A LA CASA: ANOTAR "NO EN CASA"</span>
          </button>

          <button
            onClick={() => setIsPickingOnMap(!isPickingOnMap)}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-blue-800 hover:underline pt-1 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            {isPickingOnMap
              ? 'Toque ahora la ubicación en el mapa de abajo...'
              : 'O tocar el punto manualmente en el mapa de abajo'}
          </button>
        </div>

        {/* 2. MAPA PEQUEÑO OPCIONAL ABAJO + PINES "NO EN CASA" EN LA NUBE */}
        <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="font-extrabold text-xs sm:text-sm text-slate-800 flex items-center gap-1.5">
              <Home className="w-4 h-4 text-amber-600" />
              <span>
                Mapa de {activeTerritory?.name} ({pendingNotAtHome.length} "No
                en casa" pendientes)
              </span>
            </div>
            <span className="text-[11px] font-bold text-slate-500">
              Toque un pin para ir o marcar visitado
            </span>
          </div>

          {isPickingOnMap && (
            <div className="bg-amber-500 text-white px-4 py-2 text-xs font-extrabold flex items-center justify-between">
              <span>👆 Toque en el mapa dónde está la casa "No en casa"</span>
              <button
                onClick={() => setIsPickingOnMap(false)}
                className="underline font-black cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}

          <div ref={mapContainerRef} className="h-72 w-full z-0" />

          {/* Si el publicador tocó un pin en el mapa pequeño (ej. cuando va a hacer 1 No en casa pendiente) */}
          {selectedPoint && (
            <div className="p-4 bg-amber-50 border-t-2 border-amber-300 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-black uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                    {selectedPoint.category === 'no_visitar'
                      ? '🛑 NO VISITAR (Solo lectura)'
                      : `🏠 No en Casa Pendiente${
                          selectedPoint.blockCode
                            ? ` • Manzana ${selectedPoint.blockCode}`
                            : ''
                        }`}
                  </span>
                  <div className="font-black text-base text-slate-900 mt-1">
                    {selectedPoint.label}
                  </div>
                  {selectedPoint.notes && (
                    <div className="text-xs text-slate-700">
                      {selectedPoint.notes}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedPointId(null)}
                  className="p-1 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {selectedPoint.category !== 'no_visitar' && (
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={getGoogleMapsNavigationUrl(
                      selectedPoint.lat,
                      selectedPoint.lng
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Navigation className="w-4 h-4" />
                    Cómo llegar (Maps)
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    onClick={() => {
                      onMarkHouseVisited(selectedPoint.id, 'atendido');
                      setSelectedPointId(null);
                      setSavedToast('✅ Casa marcada como atendida en la nube');
                      setTimeout(() => setSavedToast(null), 3500);
                    }}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    ¡Ya atendieron!
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lista compacta debajo del mapa de los No en casa pendientes */}
          {pendingNotAtHome.length > 0 && (
            <div className="p-3.5 border-t border-slate-200 space-y-2">
              <div className="text-xs font-extrabold uppercase text-slate-500">
                Casas "No en casa" pendientes en este territorio:
              </div>
              {pendingNotAtHome.map((pt) => (
                <div
                  key={pt.id}
                  onClick={() => {
                    setSelectedPointId(pt.id);
                    mapRef.current?.setView([pt.lat, pt.lng], 18);
                  }}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="text-xs sm:text-sm font-bold text-slate-900">
                    {pt.blockCode && (
                      <span className="font-black text-amber-800 mr-1.5">
                        [{pt.blockCode}]
                      </span>
                    )}
                    {pt.label}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={getGoogleMapsNavigationUrl(pt.lat, pt.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-900 font-extrabold text-xs"
                    >
                      Ir
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkHouseVisited(pt.id, 'atendido');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-extrabold text-xs cursor-pointer"
                    >
                      ✓ Atendió
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL SIMPLE PARA ANOTAR EL "NO EN CASA" (SIN OPCIÓN DE "NO VISITAR") */}
      {formDraft && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveNotAtHome}
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl border-t-4 border-amber-500"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-extrabold uppercase text-amber-700">
                  📍 Ubicación GPS Lista
                  {formDraft.blockCode
                    ? ` • Manzana ${formDraft.blockCode}`
                    : ''}
                </span>
                <h2 className="text-xl font-black text-slate-900">
                  Anotar Casa "No en Casa"
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormDraft(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {territoryBlocks.length > 0 && (
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                  Manzana:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {territoryBlocks.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() =>
                        setFormDraft({
                          ...formDraft,
                          blockId: b.id,
                          blockCode: b.code,
                        })
                      }
                      className={`px-3 py-1.5 rounded-xl font-extrabold text-xs border-2 cursor-pointer ${
                        formDraft.blockCode === b.code
                          ? 'bg-blue-700 text-white border-blue-800'
                          : 'bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      {b.code}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                Número de puerta o referencia corta (Opcional):
              </label>
              <input
                type="text"
                value={formDraft.houseNumber}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, houseNumber: e.target.value })
                }
                placeholder="Ej. N° 432..."
                className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-300 focus:border-amber-600 focus:outline-none font-bold text-base"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                O toque una descripción rápida:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CHIPS.map((chip) => {
                  const active = formDraft.chips.includes(chip);
                  return (
                    <button
                      type="button"
                      key={chip}
                      onClick={() => toggleChip(chip)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                        active
                          ? 'bg-amber-100 border-amber-500 text-amber-950'
                          : 'bg-slate-100 border-slate-300 text-slate-700'
                      }`}
                    >
                      {active ? `✓ ${chip}` : `+ ${chip}`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                Nota adicional (Opcional):
              </label>
              <input
                type="text"
                value={formDraft.notes}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, notes: e.target.value })
                }
                placeholder="Ej. Timbre de arriba..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFormDraft(null)}
                className="w-1/3 py-3.5 rounded-xl border-2 border-slate-300 font-bold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-2/3 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-base shadow-md cursor-pointer"
              >
                Guardar "No en Casa"
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
