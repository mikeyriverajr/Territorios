import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Check,
  CheckCircle2,
  Crosshair,
  ExternalLink,
  HelpCircle,
  Home,
  Layers,
  MapPin,
  Navigation,
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
import { getPolygonCentroid, isPointInPolygon } from '../services/kmlImporter';
import { compareBlockCodes } from '../services/mapGeometry';
import {
  findBlockForCoordinates,
  getSlotConductorLabel,
  getTerritoryAssignees,
} from '../services/storageAndSync';
import { getGoogleMapsNavigationUrl } from '../services/notificationHelper';
import { HelpCenterModal } from './HelpCenterModal';
import { TerriMapLogo } from './TerriMapLogo';

interface PublisherLightViewProps {
  slot?: ScheduleSlot | null;
  personalTerritoryId?: string | null;
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

export const PublisherLightView: React.FC<PublisherLightViewProps> = ({
  slot,
  personalTerritoryId,
  territories,
  blocks,
  housePoints,
  onAddNotAtHome,
  onMarkHouseVisited,
  onExitPreview,
}) => {
  const assignedTerritories = useMemo(() => {
    if (slot) {
      return territories.filter((t) => slot.territoryIds.includes(t.id));
    }
    if (personalTerritoryId) {
      const found = territories.find((t) => t.id === personalTerritoryId);
      return found ? [found] : [];
    }
    return [];
  }, [territories, slot, personalTerritoryId]);

  const [activeTerritoryId, setActiveTerritoryId] = useState<string>(
    assignedTerritories[0]?.id || territories[0]?.id || 'terr-1'
  );

  // Vista satelital por defecto
  const [mapStyle, setMapStyle] = useState<'satelite' | 'calles'>('satelite');

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
        .sort((a, b) => compareBlockCodes(a.code, b.code)),
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

  // Borrador al tocar el mapa (o usar GPS)
  const [formDraft, setFormDraft] = useState<{
    lat: number;
    lng: number;
    blockId?: string;
    blockCode?: string;
    previewCode: string;
    description: string;
  } | null>(null);

  const [isChangingBlock, setIsChangingBlock] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [userGps, setUserGps] = useState<LatLngTuple | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasAutoZoomedRef = useRef<boolean>(false);

  const selectedPoint = useMemo(
    () => territoryPoints.find((p) => p.id === selectedPointId) || null,
    [territoryPoints, selectedPointId]
  );

  // Calcular código único previsto (ej. 1A-1, 1A-2)
  const computeNextShortCode = (blockCode?: string) => {
    const prefix = blockCode || `T${activeTerritory?.number ?? 1}`;
    const sameGroup = territoryPoints.filter(
      (p) =>
        (blockCode ? p.blockCode === blockCode : !p.blockCode) &&
        p.category !== 'no_visitar'
    );
    const maxSeq = sameGroup.reduce(
      (max, p, idx) => Math.max(max, p.seqNumber ?? idx + 1),
      0
    );
    return `${prefix}-${maxSeq + 1}`;
  };

  const openDraftAtCoordinates = (coords: LatLngTuple, explicitBlock?: Block) => {
    if (!activeTerritory) return;
    const matchedBlock =
      explicitBlock ||
      findBlockForCoordinates(blocks, activeTerritory.id, coords);
    const bCode = matchedBlock?.code;
    setIsChangingBlock(false);
    setFormDraft({
      lat: Number(coords[0].toFixed(6)),
      lng: Number(coords[1].toFixed(6)),
      blockId: matchedBlock?.id,
      blockCode: bCode,
      previewCode: computeNextShortCode(bCode),
      description: '',
    });
  };

  // Inicializar Mapa Grande con Satélite por defecto
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const center: LatLngTuple = activeTerritory?.polygon?.length
      ? getPolygonCentroid(activeTerritory.polygon)
      : [-34.612, -58.443];

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 15,
    });

    const tile = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        maxNativeZoom: 17,
        attribution: '© Esri Satellite',
      }
    ).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    tileLayerRef.current = tile;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Alternar entre Satélite y Calles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileLayerRef.current) return;

    map.removeLayer(tileLayerRef.current);

    const nextTile =
      mapStyle === 'satelite'
        ? L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
              maxZoom: 19,
              maxNativeZoom: 17,
              attribution: '© Esri Satellite',
            }
          )
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
          });

    nextTile.addTo(map);
    tileLayerRef.current = nextTile;
  }, [mapStyle]);

  // Ajustar vista al territorio activo
  useEffect(() => {
    if (!mapRef.current || !activeTerritory?.polygon?.length) return;
    const bounds = L.latLngBounds(activeTerritory.polygon);
    mapRef.current.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
  }, [activeTerritory?.id]);

  // ACTIVACIÓN AUTOMÁTICA DEL GPS AL ENTRAR Y SEGUIMIENTO CONTINUO
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: LatLngTuple = [pos.coords.latitude, pos.coords.longitude];
        setUserGps(coords);

        if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
          setUserHeading(pos.coords.heading);
        }

        // Auto-zoom a la manzana donde está el publicador al recibir señal GPS
        if (!hasAutoZoomedRef.current && mapRef.current) {
          const currentTerrId = activeTerritory?.id || '';
          let matchedBlock = findBlockForCoordinates(blocks, currentTerrId, coords);

          // Si no está en el territorio activo, buscar en los otros territorios asignados a la salida
          if (!matchedBlock) {
            for (const t of assignedTerritories) {
              if (t.id === currentTerrId) continue;
              const b = findBlockForCoordinates(blocks, t.id, coords);
              if (b) {
                matchedBlock = b;
                setActiveTerritoryId(t.id);
                break;
              }
            }
          }

          if (matchedBlock && matchedBlock.polygon.length >= 3) {
            hasAutoZoomedRef.current = true;
            mapRef.current.fitBounds(L.latLngBounds(matchedBlock.polygon), {
              padding: [45, 45],
              maxZoom: 17,
            });
          } else {
            hasAutoZoomedRef.current = true;
            mapRef.current.setView(coords, 17);
          }
        }
      },
      (err) => {
        console.warn('GPS no disponible o esperando señal:', err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 12000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [activeTerritory?.id, assignedTerritories, blocks]);

  // SEGUIMIENTO DE ORIENTACIÓN / BRÚJULA PARA APUNTAR EL HAZ DE DIRECCIÓN
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      // iOS Safari proporciona webkitCompassHeading (0-360 respecto al Norte)
      if ((e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading !== undefined) {
        const heading = (e as unknown as { webkitCompassHeading: number }).webkitCompassHeading;
        if (heading !== null && !isNaN(heading)) {
          setUserHeading(heading);
        }
      } else if (e.alpha !== null && !isNaN(e.alpha)) {
        // Android / W3C: alpha es rotación en eje Z
        setUserHeading(360 - e.alpha);
      }
    };

    const eventName =
      'deviceorientationabsolute' in window
        ? 'deviceorientationabsolute'
        : 'deviceorientation';

    window.addEventListener(eventName, handleOrientation as EventListener);
    return () => {
      window.removeEventListener(eventName, handleOrientation as EventListener);
    };
  }, []);

  // PRIORIDAD #1: Tocar cualquier parte del mapa abre inmediatamente el registro de "No en casa"
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      openDraftAtCoordinates([e.latlng.lat, e.latlng.lng]);
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [activeTerritory, blocks, territoryPoints]);

  // Dibujar manzanas e iconos circulares pequeños (22x22px) con número único
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group || !activeTerritory) return;

    group.clearLayers();

    if (activeTerritory.polygon.length >= 3) {
      L.polygon(activeTerritory.polygon, {
        color: '#60a5fa',
        weight: 2.5,
        dashArray: '6, 6',
        fillOpacity: 0.02,
      }).addTo(group);
    }

    territoryBlocks.forEach((b) => {
      if (b.polygon.length < 3) return;
      const isDone = b.status === 'completada';
      const poly = L.polygon(b.polygon, {
        color: isDone ? '#34d399' : '#60a5fa',
        weight: 2.5,
        fillColor: isDone ? '#10b981' : '#3b82f6',
        fillOpacity: 0.14,
      }).addTo(group);

      // Tocar dentro de una manzana coloca el "No en casa" directamente en ese punto exacto
      poly.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        openDraftAtCoordinates([e.latlng.lat, e.latlng.lng], b);
      });

      const centroid = getPolygonCentroid(b.polygon);
      const safeCode = b.code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const labelIcon = L.divIcon({
        className: 'custom-block-label',
        html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;display:inline-flex;align-items:center;gap:3px;background:${
          isDone ? 'rgba(5,150,105,0.9)' : 'rgba(30,64,175,0.9)'
        };color:#fff;padding:2px 7px;border-radius:999px;font-weight:900;font-size:11px;border:1.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.5);">
          ${safeCode}${isDone ? ' ✓' : ''}
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(group);
    });

    // Iconos circulares pequeños (22x22px) para que no se encimen aunque haya muchos
    territoryPoints.forEach((pt, idx) => {
      if (pt.status === 'atendido') return;

      const isNoVisitar = pt.category === 'no_visitar';
      const bg = isNoVisitar ? '#dc2626' : '#f97316';
      const displayNum = isNoVisitar
        ? '!'
        : String(pt.seqNumber ?? idx + 1);

      const pinIcon = L.divIcon({
        className: 'custom-house-pin',
        html: `<div title="${pt.shortCode || ''} ${
          pt.label
        }" style="width:22px;height:22px;border-radius:999px;background:${bg};color:#ffffff;border:2px solid #ffffff;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.6);cursor:pointer;">
          ${displayNum}
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const m = L.marker([pt.lat, pt.lng], { icon: pinIcon }).addTo(group);
      m.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        setSelectedPointId(pt.id);
      });
    });

    // MARCADOR AZUL ESTILO GOOGLE MAPS CON HAZ DE DIRECCIÓN ROTATIVO
    if (userGps) {
      const beamHtml =
        userHeading !== null
          ? `<div style="position:absolute;top:0;left:0;width:64px;height:64px;transform:rotate(${Math.round(
              userHeading
            )}deg);transform-origin:32px 32px;pointer-events:none;transition:transform 0.2s ease-out;">
              <svg width="64" height="64" viewBox="0 0 64 64">
                <defs>
                  <radialGradient id="userBeamGrad" cx="50%" cy="100%" r="100%">
                    <stop offset="0%" stop-color="#2563eb" stop-opacity="0.6"/>
                    <stop offset="65%" stop-color="#3b82f6" stop-opacity="0.2"/>
                    <stop offset="100%" stop-color="#60a5fa" stop-opacity="0"/>
                  </radialGradient>
                </defs>
                <path d="M 32 32 L 14 2 A 35 35 0 0 1 50 2 Z" fill="url(#userBeamGrad)" />
              </svg>
            </div>`
          : '';

      const gpsIcon = L.divIcon({
        className: 'custom-google-maps-gps',
        html: `<div style="position:relative;width:64px;height:64px;pointer-events:none;">
          ${beamHtml}
          <div style="position:absolute;top:20px;left:20px;width:24px;height:24px;border-radius:9999px;background:rgba(37,99,235,0.25);animation:ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position:absolute;top:24px;left:24px;width:16px;height:16px;border-radius:9999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 1px 5px rgba(0,0,0,0.45);"></div>
        </div>`,
        iconSize: [64, 64],
        iconAnchor: [32, 32],
      });
      L.marker(userGps, { icon: gpsIcon, zIndexOffset: 1000 }).addTo(group);
    }
  }, [activeTerritory, territoryBlocks, territoryPoints, userGps, userHeading]);

  const handleUseMyCurrentGps = () => {
    if (!activeTerritory) return;

    const centerOnCoords = (coords: LatLngTuple) => {
      setUserGps(coords);
      mapRef.current?.setView(coords, 17);
      openDraftAtCoordinates(coords);
    };

    if (userGps) {
      centerOnCoords(userGps);
      return;
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: LatLngTuple = [
            pos.coords.latitude,
            pos.coords.longitude,
          ];
          centerOnCoords(coords);
        },
        () => {
          const center = mapRef.current
            ? ([
                mapRef.current.getCenter().lat,
                mapRef.current.getCenter().lng,
              ] as LatLngTuple)
            : getPolygonCentroid(activeTerritory.polygon);
          openDraftAtCoordinates(center);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  const handleSaveNotAtHome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDraft || !activeTerritory) return;

    const label = formDraft.description.trim() || 'Casa sin número';

    onAddNotAtHome({
      territoryId: activeTerritory.id,
      blockId: formDraft.blockId,
      blockCode: formDraft.blockCode,
      lat: formDraft.lat,
      lng: formDraft.lng,
      label,
    });

    setSavedToast(
      `✅ Guardado ${formDraft.previewCode}: "${label}"`
    );
    setFormDraft(null);
    setIsChangingBlock(false);
    setTimeout(() => setSavedToast(null), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Encabezado compacto */}
      <header className="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <TerriMapLogo className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 truncate">
              {slot
                ? `${slot.dayName} (${slot.time} hs) • Conductor: ${getSlotConductorLabel(slot)}`
                : (() => {
                    const assignees = activeTerritory
                      ? getTerritoryAssignees(activeTerritory)
                      : [];
                    const names = assignees.map((a) => a.name).filter(Boolean);
                    return names.length > 0
                      ? `Territorio Personal • ${names.join(' / ')}`
                      : 'Territorio Personal • Mapa para Publicadores';
                  })()}
            </div>
            <div className="font-black text-sm sm:text-base truncate">
              {activeTerritory?.name} — Toque la casa en el mapa para anotar "No
              en casa"
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 inline-flex items-center justify-center cursor-pointer transition shrink-0"
            title="Ayuda"
            aria-label="Abrir Ayuda"
          >
            <HelpCircle className="w-4 h-4 text-amber-300" />
          </button>

          <button
            onClick={() =>
              setMapStyle(mapStyle === 'satelite' ? 'calles' : 'satelite')
            }
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer border border-slate-700"
          >
            <Layers className="w-3.5 h-3.5 text-amber-300" />
            {mapStyle === 'satelite' ? '🗺️ Calles' : '🛰️ Satélite'}
          </button>

          {onExitPreview && (
            <button
              onClick={onExitPreview}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer"
            >
              Salir
            </button>
          )}
        </div>
      </header>

      {/* Selector de territorio si la salida tiene más de uno */}
      {assignedTerritories.length > 1 && (
        <div className="bg-white border-b border-slate-200 px-3 py-2 flex gap-2">
          {assignedTerritories.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTerritoryId(t.id)}
              className={`flex-1 py-1.5 px-3 rounded-xl font-black text-xs border cursor-pointer ${
                activeTerritory?.id === t.id
                  ? 'bg-blue-700 text-white border-blue-800'
                  : 'bg-slate-100 text-slate-800 border-slate-300'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {savedToast && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedToast}</span>
        </div>
      )}

      {/* 1. MAPA SATELITAL GRANDE (70vh) — TOCAR EL MAPA ES LA PRIORIDAD */}
      <div className="relative w-full h-[68vh] sm:h-[72vh] bg-slate-900">
        {/* Cinta superior flotante indicando que tocar el mapa anota directamente */}
        <div className="absolute top-2.5 left-12 right-3 z-[1000] pointer-events-none flex justify-between items-center">
          <div className="bg-slate-900/85 backdrop-blur-xs text-white px-3 py-1.5 rounded-xl text-xs font-extrabold shadow-lg border border-slate-700 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Toque directamente sobre la casa en el mapa para anotar "No en
              casa"
            </span>
          </div>
        </div>

        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Botón auxiliar flotante abajo para usar GPS actual */}
        <div className="absolute bottom-3 left-3 right-3 z-[1000] flex items-center justify-between gap-2 pointer-events-none">
          <button
            type="button"
            onClick={handleUseMyCurrentGps}
            className="pointer-events-auto py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-xl flex items-center gap-2 cursor-pointer border-2 border-white"
          >
            <Crosshair className="w-4 h-4" />
            <span>Anotar en mi ubicación GPS actual</span>
          </button>
        </div>

        {/* Detalle flotante si tocó un pin existente en el mapa */}
        {selectedPoint && (
          <div className="absolute bottom-16 left-3 right-3 sm:left-auto sm:right-3 sm:w-88 z-[1000] bg-white rounded-2xl shadow-2xl border-2 border-amber-500 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-block text-xs font-black uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                  {selectedPoint.category === 'no_visitar'
                    ? `🛑 NO VISITAR (${selectedPoint.shortCode || 'NV'})`
                    : `🏠 Casa #${selectedPoint.shortCode || selectedPoint.seqNumber || 1}`}
                </span>
                <div className="font-black text-sm sm:text-base text-slate-900 mt-1">
                  {selectedPoint.label}
                </div>
                {selectedPoint.notes && (
                  <div className="text-xs text-slate-600">
                    {selectedPoint.notes}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedPointId(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
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
                  className="py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Cómo llegar
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  onClick={() => {
                    onMarkHouseVisited(selectedPoint.id, 'atendido');
                    setSelectedPointId(null);
                    setSavedToast(
                      `✅ Casa ${selectedPoint.shortCode || ''} marcada como atendida`
                    );
                    setTimeout(() => setSavedToast(null), 3500);
                  }}
                  className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  ¡Ya atendieron!
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. LISTA COMPACTA DE "NO EN CASA" PENDIENTES CON SU IDENTIFICADOR ÚNICO (1A-1, 1A-2...) */}
      <div className="max-w-3xl w-full mx-auto p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Home className="w-4 h-4 text-amber-600" />
            Casas "No en casa" en {activeTerritory?.name} (
            {pendingNotAtHome.length})
          </h2>
        </div>

        {pendingNotAtHome.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-3 text-center text-xs text-slate-500">
            No hay casas "No en casa" pendientes en este territorio. Toque
            cualquier casa en el mapa satelital arriba para agregar una.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pendingNotAtHome.map((pt, idx) => {
              const code =
                pt.shortCode ||
                `${pt.blockCode || `T${activeTerritory?.number ?? 1}`}-${
                  pt.seqNumber ?? idx + 1
                }`;
              return (
                <div
                  key={pt.id}
                  onClick={() => {
                    setSelectedPointId(pt.id);
                    mapRef.current?.setView([pt.lat, pt.lng], 17);
                  }}
                  className="p-2.5 rounded-xl bg-white hover:bg-amber-50 border border-slate-200 flex items-center justify-between gap-2 cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 px-2 py-1 rounded-lg bg-amber-500 text-white font-black text-xs">
                      {code}
                    </span>
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {pt.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={getGoogleMapsNavigationUrl(pt.lat, pt.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-1 rounded-lg bg-blue-100 text-blue-900 font-extrabold text-[11px]"
                    >
                      Ir
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkHouseVisited(pt.id, 'atendido');
                      }}
                      className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[11px] cursor-pointer"
                    >
                      ✓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL PARA GUARDAR EL "NO EN CASA" AL TOCAR EL MAPA */}
      {formDraft && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveNotAtHome}
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl border-t-4 border-amber-500"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-white font-black text-sm">
                  #{formDraft.previewCode}
                </span>
                <div>
                  <span className="text-[11px] font-extrabold uppercase text-amber-800 block">
                    Nuevo "No en Casa"
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h2 className="text-lg font-black text-slate-900 leading-tight">
                      {formDraft.blockCode
                        ? `Manzana ${formDraft.blockCode}`
                        : activeTerritory?.name}
                    </h2>
                    {territoryBlocks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsChangingBlock(!isChangingBlock)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-blue-700 font-extrabold text-xs cursor-pointer border border-slate-300 transition"
                      >
                        {isChangingBlock ? 'Cerrar' : 'Cambiar'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormDraft(null);
                  setIsChangingBlock(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Selector de manzana solo visible al pulsar 'Cambiar' */}
            {isChangingBlock && territoryBlocks.length > 0 && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <label className="block text-xs font-extrabold uppercase text-slate-600">
                  Seleccionar Manzana:
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {territoryBlocks.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => {
                        setFormDraft({
                          ...formDraft,
                          blockId: b.id,
                          blockCode: b.code,
                          previewCode: computeNextShortCode(b.code),
                        });
                        setIsChangingBlock(false);
                      }}
                      className={`px-3 py-1 rounded-lg font-extrabold text-xs border cursor-pointer ${
                        formDraft.blockCode === b.code
                          ? 'bg-blue-700 text-white border-blue-800 shadow-xs'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {b.code}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                Descripción de la casa:
              </label>
              <input
                type="text"
                autoFocus
                value={formDraft.description}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, description: e.target.value })
                }
                placeholder="Ej. Portón blanco, reja negra, N° 432..."
                className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-300 focus:border-amber-600 focus:outline-none font-bold text-base"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setFormDraft(null);
                  setIsChangingBlock(false);
                }}
                className="w-1/3 py-3 rounded-xl border-2 border-slate-300 font-bold text-slate-700 text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-2/3 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm shadow-md cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      <HelpCenterModal
        isOpen={isHelpOpen}
        initialCategory="publicador"
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
};
