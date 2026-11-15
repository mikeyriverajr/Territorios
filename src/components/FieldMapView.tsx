import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crosshair,
  ExternalLink,
  Home,
  Layers,
  Link2,
  MapPin,
  Navigation,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  Block,
  BlockStatus,
  HousePoint,
  HousePointCategory,
  HousePointStatus,
  LatLngTuple,
  ScheduleSlot,
  Territory,
} from '../types/territory';
import { getPolygonCentroid } from '../services/kmlImporter';
import { findBlockForCoordinates } from '../services/storageAndSync';
import {
  getGoogleMapsNavigationUrl,
  getPublisherGroupLink,
} from '../services/notificationHelper';

interface FieldMapViewProps {
  territories: Territory[];
  blocks: Block[];
  housePoints: HousePoint[];
  activeTerritoryId: string;
  activeSlot: ScheduleSlot | null;
  canSwitchAllTerritories?: boolean;
  onSelectTerritory: (territoryId: string) => void;
  onBack: () => void;
  onAddHousePoint: (point: {
    territoryId: string;
    blockId?: string;
    blockCode?: string;
    lat: number;
    lng: number;
    category: HousePointCategory;
    label: string;
    notes?: string;
  }) => void;
  onUpdateHouseStatus: (
    pointId: string,
    newStatus: HousePointStatus,
    note?: string
  ) => void;
  onDeleteHousePoint: (pointId: string) => void;
  onUpdateBlockStatus: (
    blockId: string,
    status: BlockStatus,
    conductorName?: string
  ) => void;
  onCompleteWholeTerritory: (
    territoryId: string,
    conductorName?: string
  ) => void;
  onResetTerritory: (territoryId: string, conductorName?: string) => void;
}

const QUICK_DESCRIPTIONS = [
  'Casa sin número',
  'Reja negra',
  'Portón blanco',
  'Casa de esquina',
  'Puerta de madera',
  '2do piso / Escalera',
  'Pasillo al fondo',
  'Ladrillo a la vista',
];

export const FieldMapView: React.FC<FieldMapViewProps> = ({
  territories,
  blocks,
  housePoints,
  activeTerritoryId,
  activeSlot,
  canSwitchAllTerritories = false,
  onSelectTerritory,
  onBack,
  onAddHousePoint,
  onUpdateHouseStatus,
  onDeleteHousePoint,
  onUpdateBlockStatus,
  onCompleteWholeTerritory,
  onResetTerritory,
}) => {
  const selectableTerritories = useMemo(() => {
    if (canSwitchAllTerritories || !activeSlot) return territories;
    const assigned = territories.filter((t) =>
      activeSlot.territoryIds.includes(t.id)
    );
    return assigned.length > 0 ? assigned : territories;
  }, [territories, activeSlot, canSwitchAllTerritories]);

  const activeTerritory = useMemo(
    () =>
      selectableTerritories.find((t) => t.id === activeTerritoryId) ||
      selectableTerritories[0] ||
      territories[0],
    [selectableTerritories, territories, activeTerritoryId]
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
    () => territoryPoints.filter((p) => p.status === 'no_en_casa'),
    [territoryPoints]
  );

  const doNotCallList = useMemo(
    () => territoryPoints.filter((p) => p.category === 'no_visitar'),
    [territoryPoints]
  );

  const [mapStyle, setMapStyle] = useState<'calles' | 'satelite'>('satelite');
  const [showInitialBriefing, setShowInitialBriefing] = useState<boolean>(true);
  const [isPickingOnMap, setIsPickingOnMap] = useState<boolean>(false);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [copiedPublisherLink, setCopiedPublisherLink] =
    useState<boolean>(false);

  const [userGps, setUserGps] = useState<LatLngTuple | null>(null);
  const [gpsStatusText, setGpsStatusText] = useState<string>('');

  const [newPointDraft, setNewPointDraft] = useState<{
    lat: number;
    lng: number;
    blockId?: string;
    blockCode?: string;
    category: 'no_en_casa' | 'no_visitar';
    houseNumber: string;
    selectedChips: string[];
    notes: string;
  } | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const currentTileStyleRef = useRef<'calles' | 'satelite' | null>(null);
  const overlaysGroupRef = useRef<L.LayerGroup | null>(null);

  const hasActiveTerritory = Boolean(activeTerritory);

  const selectedPoint = useMemo(
    () => territoryPoints.find((p) => p.id === selectedPointId) || null,
    [territoryPoints, selectedPointId]
  );

  const currentUserBlock = useMemo(() => {
    if (!userGps || !activeTerritory) return undefined;
    return findBlockForCoordinates(blocks, activeTerritory.id, userGps);
  }, [userGps, blocks, activeTerritory]);

  useEffect(() => {
    if (!hasActiveTerritory || !mapContainerRef.current || mapInstanceRef.current) {
      return;
    }

    const initialCenter: LatLngTuple = activeTerritory?.polygon?.length
      ? getPolygonCentroid(activeTerritory.polygon)
      : [-34.612, -58.443];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 16,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    const tileLayer = (
      mapStyle === 'satelite'
        ? L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
              maxZoom: 19,
              attribution: '© Esri Satellite',
            }
          )
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
          })
    ).addTo(map);

    const overlays = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    tileLayerRef.current = tileLayer;
    currentTileStyleRef.current = mapStyle;
    overlaysGroupRef.current = overlays;

    const containerEl = mapContainerRef.current;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.invalidateSize();
          })
        : null;
    resizeObserver?.observe(containerEl);

    const rafId = requestAnimationFrame(() => {
      map.invalidateSize();
    });

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      currentTileStyleRef.current = null;
      overlaysGroupRef.current = null;
    };
  }, [hasActiveTerritory]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const rafId = requestAnimationFrame(() => {
      map.invalidateSize();
    });
    return () => cancelAnimationFrame(rafId);
  }, [showInitialBriefing]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !tileLayerRef.current || currentTileStyleRef.current === mapStyle) {
      return;
    }

    map.removeLayer(tileLayerRef.current);

    const newTileLayer =
      mapStyle === 'satelite'
        ? L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
              maxZoom: 19,
              attribution: '© Esri Satellite',
            }
          )
        : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
          });

    newTileLayer.addTo(map);
    tileLayerRef.current = newTileLayer;
    currentTileStyleRef.current = mapStyle;
  }, [mapStyle]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!activeTerritory) return;
      setSelectedPointId(null);
      const coords: LatLngTuple = [e.latlng.lat, e.latlng.lng];
      const matchedBlock = findBlockForCoordinates(
        blocks,
        activeTerritory.id,
        coords
      );
      setIsPickingOnMap(false);
      setNewPointDraft({
        lat: coords[0],
        lng: coords[1],
        blockId: matchedBlock?.id,
        blockCode: matchedBlock?.code,
        category: 'no_en_casa',
        houseNumber: '',
        selectedChips: [],
        notes: '',
      });
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [isPickingOnMap, activeTerritory, blocks]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeTerritory) return;

    const coordsToFit: LatLngTuple[] =
      activeTerritory.polygon.length > 0
        ? activeTerritory.polygon
        : [
            ...territoryBlocks.flatMap((b) => b.polygon),
            ...territoryPoints.map((p): LatLngTuple => [p.lat, p.lng]),
          ];

    if (coordsToFit.length === 0) return;
    const bounds = L.latLngBounds(coordsToFit);
    if (!bounds.isValid()) return;

    map.invalidateSize();
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 17 });
  }, [activeTerritory?.id, hasActiveTerritory]);

  useEffect(() => {
    const group = overlaysGroupRef.current;
    if (!group || !activeTerritory) return;

    group.clearLayers();

    if (activeTerritory.polygon.length >= 3) {
      L.polygon(activeTerritory.polygon, {
        color: '#1e3a8a',
        weight: 3,
        dashArray: '8, 6',
        fillColor: '#3b82f6',
        fillOpacity: territoryBlocks.length === 0 ? 0.08 : 0.02,
      }).addTo(group);
    }

    territoryBlocks.forEach((block) => {
      if (block.polygon.length < 3) return;

      const strokeColor =
        block.status === 'completada'
          ? '#059669'
          : block.status === 'en_progreso'
          ? '#d97706'
          : '#2563eb';
      const fillColor =
        block.status === 'completada'
          ? '#10b981'
          : block.status === 'en_progreso'
          ? '#f59e0b'
          : '#3b82f6';

      const poly = L.polygon(block.polygon, {
        color: strokeColor,
        weight: 2.5,
        fillColor,
        fillOpacity: 0.22,
      }).addTo(group);

      // Tocar dentro de una manzana abre el registro directamente en ese punto
      poly.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        setIsPickingOnMap(false);
        setSelectedPointId(null);
        setNewPointDraft({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          blockId: block.id,
          blockCode: block.code,
          category: 'no_en_casa',
          houseNumber: '',
          selectedChips: [],
          notes: '',
        });
      });

      const centroid = getPolygonCentroid(block.polygon);
      const badgeBg =
        block.status === 'completada'
          ? 'background:#059669;color:#fff;border:2px solid #ecfdf5;'
          : block.status === 'en_progreso'
          ? 'background:#d97706;color:#fff;border:2px solid #fffbeb;'
          : 'background:#1e40af;color:#fff;border:2px solid #eff6ff;';

      const blockLabelIcon = L.divIcon({
        className: 'custom-block-label',
        html: `<div style="${badgeBg}padding:3px 9px;border-radius:999px;font-weight:900;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;display:inline-flex;align-items:center;gap:4px;">
          <span>${block.code}</span>
          ${block.status === 'completada' ? '<span>✓</span>' : ''}
        </div>`,
        iconSize: [52, 26],
        iconAnchor: [26, 13],
      });

      L.marker(centroid, { icon: blockLabelIcon, interactive: false }).addTo(
        group
      );
    });

    territoryPoints.forEach((pt, idx) => {
      // Iconos circulares pequeños (22px) con el número corto para que no se encimen
      let bg = '#f97316';
      let label = String(pt.seqNumber ?? idx + 1);

      if (pt.category === 'no_visitar') {
        bg = '#dc2626';
        label = '!';
      } else if (pt.status === 'atendido') {
        bg = '#16a34a';
        label = '✓';
      } else if (pt.category === 'casa_rural' && pt.status === 'pendiente') {
        bg = '#2563eb';
      }

      const isSelected = pt.id === selectedPointId;
      const ring = isSelected
        ? 'box-shadow:0 0 0 3px #fde047, 0 2px 8px rgba(0,0,0,0.6);'
        : 'box-shadow:0 2px 6px rgba(0,0,0,0.6);';

      const markerIcon = L.divIcon({
        className: 'custom-house-pin',
        html: `<div title="${pt.shortCode || ''}" style="width:22px;height:22px;border-radius:999px;background:${bg};color:#fff;border:2px solid #fff;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;${ring}">${label}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([pt.lat, pt.lng], { icon: markerIcon }).addTo(
        group
      );
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        setSelectedPointId(pt.id);
      });
    });

    if (userGps) {
      const gpsIcon = L.divIcon({
        className: 'custom-gps-dot',
        html: `<div style="width:22px;height:22px;border-radius:999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 0 0 6px rgba(37,99,235,0.32),0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker(userGps, { icon: gpsIcon })
        .bindTooltip('📍 Tu ubicación GPS actual', { direction: 'top' })
        .addTo(group);
    }
  }, [
    activeTerritory,
    territoryBlocks,
    territoryPoints,
    selectedPointId,
    userGps,
    isPickingOnMap,
  ]);

  const handleLocateMeGps = (
    openAddDialogAfter = false,
    defaultCategory: 'no_en_casa' | 'no_visitar' = 'no_en_casa'
  ) => {
    if (!('geolocation' in navigator)) {
      handleSimulateGpsInTerritory(openAddDialogAfter, defaultCategory);
      return;
    }

    setGpsStatusText('Buscando señal GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: LatLngTuple = [
          pos.coords.latitude,
          pos.coords.longitude,
        ];
        setUserGps(coords);
        setGpsStatusText('📍 Ubicación GPS actualizada');
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView(coords, 18);
        }
        if (openAddDialogAfter && activeTerritory) {
          const matchedBlock = findBlockForCoordinates(
            blocks,
            activeTerritory.id,
            coords
          );
          setNewPointDraft({
            lat: coords[0],
            lng: coords[1],
            blockId: matchedBlock?.id,
            blockCode: matchedBlock?.code,
            category: defaultCategory,
            houseNumber: '',
            selectedChips: [],
            notes: '',
          });
        }
        setTimeout(() => setGpsStatusText(''), 3500);
      },
      () => {
        handleSimulateGpsInTerritory(openAddDialogAfter, defaultCategory);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const handleSimulateGpsInTerritory = (
    openAddDialogAfter = false,
    defaultCategory: 'no_en_casa' | 'no_visitar' = 'no_en_casa'
  ) => {
    if (!activeTerritory) return;
    const targetBlock =
      territoryBlocks.find((b) => b.status !== 'completada') ||
      territoryBlocks[0];
    const baseCenter: LatLngTuple = targetBlock?.polygon?.length
      ? getPolygonCentroid(targetBlock.polygon)
      : activeTerritory.polygon.length
      ? getPolygonCentroid(activeTerritory.polygon)
      : [-34.612, -58.443];

    const offsetLat = (Math.random() - 0.5) * 0.0006;
    const offsetLng = (Math.random() - 0.5) * 0.0006;
    const simulatedCoords: LatLngTuple = [
      Number((baseCenter[0] + offsetLat).toFixed(6)),
      Number((baseCenter[1] + offsetLng).toFixed(6)),
    ];

    setUserGps(simulatedCoords);
    const matchedBlock = findBlockForCoordinates(
      blocks,
      activeTerritory.id,
      simulatedCoords
    );
    setGpsStatusText(
      matchedBlock
        ? `📍 Ubicado en Manzana ${matchedBlock.code}`
        : `📍 Ubicado en ${activeTerritory.name}`
    );

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(simulatedCoords, 18);
    }

    if (openAddDialogAfter) {
      setNewPointDraft({
        lat: simulatedCoords[0],
        lng: simulatedCoords[1],
        blockId: matchedBlock?.id,
        blockCode: matchedBlock?.code,
        category: defaultCategory,
        houseNumber: '',
        selectedChips: [],
        notes: '',
      });
    }
    setTimeout(() => setGpsStatusText(''), 4000);
  };

  const handleSaveNewPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPointDraft || !activeTerritory) return;

    const parts: string[] = [];
    if (newPointDraft.houseNumber.trim()) {
      parts.push(newPointDraft.houseNumber.trim());
    }
    if (newPointDraft.selectedChips.length > 0) {
      parts.push(newPointDraft.selectedChips.join(', '));
    }
    const finalLabel =
      parts.join(' — ') ||
      (newPointDraft.category === 'no_visitar'
        ? 'Dirección NO VISITAR'
        : 'Casa sin número (Pin GPS)');

    onAddHousePoint({
      territoryId: activeTerritory.id,
      blockId: newPointDraft.blockId,
      blockCode: newPointDraft.blockCode,
      lat: newPointDraft.lat,
      lng: newPointDraft.lng,
      category: newPointDraft.category,
      label: finalLabel,
      notes: newPointDraft.notes.trim() || undefined,
    });

    setNewPointDraft(null);
  };

  const toggleChip = (chip: string) => {
    if (!newPointDraft) return;
    const exists = newPointDraft.selectedChips.includes(chip);
    setNewPointDraft({
      ...newPointDraft,
      selectedChips: exists
        ? newPointDraft.selectedChips.filter((c) => c !== chip)
        : [...newPointDraft.selectedChips, chip],
    });
  };

  const handleCopyGroupLink = () => {
    const slotId = activeSlot?.id || 'sched-1';
    const url = getPublisherGroupLink(slotId);
    navigator.clipboard.writeText(url);
    setCopiedPublisherLink(true);
    setTimeout(() => setCopiedPublisherLink(false), 3000);
  };

  if (!activeTerritory) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="text-lg font-black text-slate-900">
            No hay territorios disponibles para mostrar en el mapa
          </div>
          <p className="text-sm text-slate-600">
            Verifique que existan territorios cargados en la congregación o
            vuelva al panel de salidas.
          </p>
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Mis Salidas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)] lg:h-[calc(100vh-64px)] bg-slate-100 lg:overflow-hidden">
      {/* MODAL DE AVISO INICIAL AL ABRIR EL TERRITORIO (Muestra NO VISITAR y No en Casa en la Nube) */}
      {showInitialBriefing && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-blue-900 p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold uppercase bg-blue-100 text-blue-900">
                  Vista del Conductor
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                  {activeTerritory.name}
                  {activeSlot ? ` — ${activeSlot.conductorName}` : ''}
                </h2>
              </div>
              <button
                onClick={() => setShowInitialBriefing(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* 1. Direcciones NO VISITAR en este territorio */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-red-800 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                1. Direcciones "NO VISITAR" en este territorio (
                {doNotCallList.length})
              </h3>
              {doNotCallList.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-3 rounded-xl font-medium">
                  ✅ No hay direcciones "NO VISITAR" registradas en este
                  territorio.
                </div>
              ) : (
                <div className="space-y-2">
                  {doNotCallList.map((w) => (
                    <div
                      key={w.id}
                      className="p-3 rounded-xl border-2 bg-red-50 border-red-400 text-red-950"
                    >
                      <div className="font-extrabold text-sm">
                        🛑 NO VISITAR
                        {w.blockCode ? ` — Manzana ${w.blockCode}` : ''}
                      </div>
                      <div className="font-bold text-sm mt-0.5">{w.label}</div>
                      {w.notes && (
                        <div className="text-xs opacity-90 mt-0.5">
                          {w.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Resumen en la nube de Manzanas y Casas No en Casa */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Home className="w-4 h-4 text-blue-700" />
                2. Estado en la Nube ({activeTerritory.name})
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-sm">
                {territoryBlocks.length > 0 && (
                  <div>
                    <strong>Manzanas por completar: </strong>
                    {territoryBlocks
                      .filter((b) => b.status !== 'completada')
                      .map((b) => b.code)
                      .join(', ') || '¡Todas las manzanas marcadas como listas!'}
                  </div>
                )}
                <div>
                  <strong>Casas "No en casa" en la nube: </strong>
                  <span className="font-bold text-amber-800">
                    {pendingNotAtHome.length} casa(s) pendientes
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowInitialBriefing(false)}
              className="w-full py-4 bg-blue-700 hover:bg-blue-800 text-white font-black text-base sm:text-lg rounded-xl shadow-md cursor-pointer transition"
            >
              Entendido — Abrir Mapa del Territorio
            </button>
          </div>
        </div>
      )}

      {/* MODAL DEL CONDUCTOR PARA ANOTAR "NO EN CASA" O "🛑 NO VISITAR" */}
      {newPointDraft && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveNewPoint}
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border-t-4 sm:border-2 border-blue-900 p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                  📍 Punto GPS capturado{' '}
                  {newPointDraft.blockCode
                    ? `en Manzana ${newPointDraft.blockCode}`
                    : `en ${activeTerritory.name}`}
                </span>
                <h3 className="text-xl font-black text-slate-900">
                  Registrar en el Mapa (Conductor)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNewPointDraft(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {territoryBlocks.length > 0 && (
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                  Manzana:
                </label>
                <div className="flex flex-wrap gap-2">
                  {territoryBlocks.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() =>
                        setNewPointDraft({
                          ...newPointDraft,
                          blockId: b.id,
                          blockCode: b.code,
                        })
                      }
                      className={`px-3.5 py-2 rounded-xl font-extrabold text-sm border-2 cursor-pointer transition ${
                        newPointDraft.blockCode === b.code
                          ? 'bg-blue-700 text-white border-blue-800'
                          : 'bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      Manzana {b.code}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* El Conductor es quien tiene el permiso exclusivo de elegir entre "No en casa" o "NO VISITAR" */}
            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                Categoría (Exclusivo para Conductores):
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setNewPointDraft({
                      ...newPointDraft,
                      category: 'no_en_casa',
                    })
                  }
                  className={`p-3 rounded-xl border-2 font-extrabold text-sm text-center cursor-pointer ${
                    newPointDraft.category === 'no_en_casa'
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-slate-50 text-slate-800 border-slate-200'
                  }`}
                >
                  🏠 No en Casa
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNewPointDraft({
                      ...newPointDraft,
                      category: 'no_visitar',
                    })
                  }
                  className={`p-3 rounded-xl border-2 font-extrabold text-sm text-center cursor-pointer ${
                    newPointDraft.category === 'no_visitar'
                      ? 'bg-red-600 text-white border-red-700'
                      : 'bg-slate-50 text-slate-800 border-slate-200'
                  }`}
                >
                  🛑 NO VISITAR
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                Número de puerta o dirección:
              </label>
              <input
                type="text"
                value={newPointDraft.houseNumber}
                onChange={(e) =>
                  setNewPointDraft({
                    ...newPointDraft,
                    houseNumber: e.target.value,
                  })
                }
                placeholder="Ej. N° 432..."
                className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:outline-none text-base font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                O toque una descripción rápida:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DESCRIPTIONS.map((chip) => {
                  const active = newPointDraft.selectedChips.includes(chip);
                  return (
                    <button
                      type="button"
                      key={chip}
                      onClick={() => toggleChip(chip)}
                      className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold border transition cursor-pointer ${
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
                value={newPointDraft.notes}
                onChange={(e) =>
                  setNewPointDraft({ ...newPointDraft, notes: e.target.value })
                }
                placeholder="Nota breve (sin datos personales)..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setNewPointDraft(null)}
                className="w-1/3 py-3.5 rounded-xl border-2 border-slate-300 font-bold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`w-2/3 py-3.5 rounded-xl text-white font-black text-base shadow-md cursor-pointer ${
                  newPointDraft.category === 'no_visitar'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                💾 Guardar en la Nube
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COLUMNA IZQUIERDA: MAPA INTERACTIVO */}
      <div className="relative h-[68vh] sm:h-[72vh] shrink-0 lg:h-full lg:flex-1 lg:min-w-0 lg:min-h-0 flex flex-col">
        <div className="bg-white border-b border-slate-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Mis Salidas
            </button>

            <select
              value={activeTerritory.id}
              onChange={(e) => {
                onSelectTerritory(e.target.value);
                setSelectedPointId(null);
              }}
              className="px-3 py-1.5 rounded-xl border-2 border-blue-700 bg-blue-50 text-blue-950 font-extrabold text-sm cursor-pointer"
            >
              {selectableTerritories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (
                  {t.status === 'completado' ? 'Completado ✓' : 'En curso'})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyGroupLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 font-extrabold text-xs cursor-pointer"
            >
              {copiedPublisherLink ? (
                <>
                  <Copy className="w-3.5 h-3.5 text-emerald-700" />
                  ¡Link de Publicadores Copiado!
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5 text-amber-800" />
                  Link para Publicadores
                </>
              )}
            </button>

            <button
              onClick={() =>
                setMapStyle(mapStyle === 'calles' ? 'satelite' : 'calles')
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-amber-300" />
              {mapStyle === 'calles' ? '🛰️ Satélite' : '🗺️ Calles'}
            </button>
          </div>
        </div>

        {isPickingOnMap && (
          <div className="bg-amber-500 text-white px-4 py-2.5 font-extrabold text-sm flex items-center justify-between shadow-md z-20">
            <span>
              👆 Toque exactamente sobre el mapa donde está la dirección...
            </span>
            <button
              onClick={() => setIsPickingOnMap(false)}
              className="bg-white text-amber-900 px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        )}

        {(gpsStatusText || currentUserBlock) && (
          <div className="bg-blue-900 text-white px-3.5 py-1.5 text-xs sm:text-sm font-bold flex items-center justify-between z-10">
            <span>
              {gpsStatusText ||
                (currentUserBlock
                  ? `📍 Tu GPS indica que estás en la Manzana ${currentUserBlock.code}`
                  : '')}
            </span>
          </div>
        )}

        <div
          ref={mapContainerRef}
          className="flex-1 min-h-[260px] lg:min-h-0 w-full z-0 bg-slate-900"
        />

        {/* Tarjeta flotante al tocar un pin en el mapa */}
        {selectedPoint && (
          <div className="absolute top-16 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-[1000] bg-white rounded-2xl shadow-2xl border-2 border-blue-900 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                    selectedPoint.category === 'no_visitar'
                      ? 'bg-red-100 text-red-900'
                      : selectedPoint.status === 'atendido'
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-orange-100 text-orange-900'
                  }`}
                >
                  {selectedPoint.category === 'no_visitar'
                    ? '🛑 NO VISITAR'
                    : selectedPoint.category === 'casa_rural'
                    ? '🏡 Casa Rural'
                    : '🏠 Casa No en Casa'}
                  {selectedPoint.shortCode
                    ? ` • #${selectedPoint.shortCode}`
                    : selectedPoint.blockCode
                    ? ` • Manzana ${selectedPoint.blockCode}`
                    : ''}
                </span>
                <h4 className="font-black text-base text-slate-900 mt-1">
                  {selectedPoint.label}
                </h4>
                {selectedPoint.notes && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    {selectedPoint.notes}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedPointId(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <a
              href={getGoogleMapsNavigationUrl(
                selectedPoint.lat,
                selectedPoint.lng
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition"
            >
              <Navigation className="w-4 h-4 text-amber-300" />
              Cómo llegar a esta puerta (Google Maps)
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {(selectedPoint.category === 'no_en_casa' ||
              selectedPoint.category === 'casa_rural') && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    onUpdateHouseStatus(
                      selectedPoint.id,
                      'atendido',
                      'Se encontró a la persona y se predicó'
                    );
                    setSelectedPointId(null);
                  }}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  ¡Ya Atendió!
                </button>
                <button
                  onClick={() => {
                    onUpdateHouseStatus(
                      selectedPoint.id,
                      'no_en_casa',
                      'Se volvió a tocar y no había nadie'
                    );
                    setSelectedPointId(null);
                  }}
                  className="py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  Sigue sin haber nadie
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-400">
              <span>
                Intentos registrados: {selectedPoint.attempts.length || 1}
              </span>
              <button
                onClick={() => {
                  onDeleteHousePoint(selectedPoint.id);
                  setSelectedPointId(null);
                }}
                className="text-red-600 hover:underline inline-flex items-center gap-1 font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Borrar punto
              </button>
            </div>
          </div>
        )}

        {/* BARRA INFERIOR DEL CONDUCTOR: ANOTAR "NO EN CASA" O "🛑 NO VISITAR" */}
        <div className="bg-white border-t-2 border-slate-200 p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 z-10">
          <button
            onClick={() => handleLocateMeGps(true, 'no_en_casa')}
            className="flex-1 min-w-[170px] py-3.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>+ ANOTAR "NO EN CASA"</span>
          </button>

          <button
            onClick={() => handleLocateMeGps(true, 'no_visitar')}
            className="py-3.5 px-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>+ NO VISITAR</span>
          </button>

          <button
            onClick={() => setIsPickingOnMap(!isPickingOnMap)}
            className={`py-3.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm border-2 flex items-center justify-center gap-1 cursor-pointer transition ${
              isPickingOnMap
                ? 'bg-amber-100 border-amber-600 text-amber-950'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
          >
            <MapPin className="w-4 h-4 text-amber-700" />
            <span>Tocar Mapa</span>
          </button>

          <button
            onClick={() => handleLocateMeGps(false)}
            title="Ubicar mi posición GPS"
            className="py-3.5 px-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border-2 border-blue-300 text-blue-900 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Crosshair className="w-4 h-4 text-blue-700" />
          </button>
        </div>
      </div>

      {/* PANEL DERECHO DEL CONDUCTOR: COMPLETAR MANZANAS, COMPLETAR TERRITORIO Y LISTA EN LA NUBE */}
      <div className="w-full lg:w-[420px] shrink-0 bg-white border-t-2 lg:border-t-0 lg:border-l-2 border-slate-200 flex flex-col lg:h-full lg:overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* 1. CONTROL DE MANZANAS (1A, 1B...) Y COMPLETAR TODO EL TERRITORIO */}
          <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Control de Manzanas y Territorio ({activeTerritory.name})
              </h3>
              <span
                className={`text-xs font-black px-2 py-0.5 rounded ${
                  activeTerritory.status === 'completado'
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-blue-100 text-blue-900'
                }`}
              >
                {activeTerritory.status === 'completado'
                  ? '✓ Completado'
                  : 'En curso'}
              </span>
            </div>

            {territoryBlocks.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {territoryBlocks.map((block) => {
                  const isDone = block.status === 'completada';
                  return (
                    <button
                      key={block.id}
                      onClick={() =>
                        onUpdateBlockStatus(
                          block.id,
                          isDone ? 'pendiente' : 'completada',
                          activeSlot?.conductorName
                        )
                      }
                      className={`p-3 rounded-xl border-2 text-left transition cursor-pointer flex items-center justify-between ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : 'bg-white border-slate-300 text-slate-900 hover:border-blue-500'
                      }`}
                    >
                      <div>
                        <div className="font-black text-sm">
                          Manzana {block.code}
                        </div>
                        <div className="text-[11px] font-bold opacity-90">
                          {isDone ? '✓ Completada' : 'Toque para completar'}
                        </div>
                      </div>
                      <CheckCircle2
                        className={`w-5 h-5 ${
                          isDone ? 'text-white' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Botón directo del Conductor para marcar TODO EL TERRITORIO como completado */}
            {activeTerritory.status !== 'completado' ? (
              <button
                onClick={() =>
                  onCompleteWholeTerritory(
                    activeTerritory.id,
                    activeSlot?.conductorName
                  )
                }
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                Marcar TODO el {activeTerritory.name} como Completado
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-2 rounded-xl">
                  🎉 Este territorio ya fue marcado como completado y registrado
                  en el S-13.
                </div>
                <button
                  onClick={() =>
                    onResetTerritory(
                      activeTerritory.id,
                      activeSlot?.conductorName
                    )
                  }
                  className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reiniciar Territorio para Próxima Vuelta
                </button>
              </div>
            )}
          </div>

          {/* 2. LISTA EN LA NUBE DE CASAS "NO EN CASA" PENDIENTES */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {activeTerritory.type === 'rural'
                ? `Casas Rurales en la Nube (${territoryPoints.length})`
                : `Casas "No en Casa" en la Nube (${pendingNotAtHome.length})`}
            </h3>

            {activeTerritory.type === 'rural' ? (
              <div className="space-y-2">
                {territoryPoints.map((pt) => (
                  <div
                    key={pt.id}
                    onClick={() => {
                      setSelectedPointId(pt.id);
                      mapInstanceRef.current?.setView([pt.lat, pt.lng], 17);
                    }}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition ${
                      pt.status === 'atendido'
                        ? 'bg-emerald-50/70 border-emerald-300'
                        : pt.status === 'no_en_casa'
                        ? 'bg-amber-50 border-amber-400'
                        : 'bg-white border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                          {pt.status === 'atendido'
                            ? '✅ Visitada'
                            : pt.status === 'no_en_casa'
                            ? '🏠 No en casa'
                            : '🏡 Pendiente'}
                        </span>
                        <div className="font-bold text-sm text-slate-900 mt-1">
                          {pt.label}
                        </div>
                      </div>
                      <a
                        href={getGoogleMapsNavigationUrl(pt.lat, pt.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-blue-700 text-white font-bold text-xs"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Ir
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : pendingNotAtHome.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-sm text-slate-600">
                No hay casas "No en casa" pendientes en la nube para{' '}
                {activeTerritory.name}.
              </div>
            ) : (
              <div className="space-y-2">
                {pendingNotAtHome.map((pt) => (
                  <div
                    key={pt.id}
                    onClick={() => {
                      setSelectedPointId(pt.id);
                      mapInstanceRef.current?.setView([pt.lat, pt.lng], 18);
                    }}
                    className="p-3 rounded-xl bg-amber-50/80 border-2 border-amber-300 hover:border-amber-500 cursor-pointer transition space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-block text-xs font-black px-2 py-0.5 rounded bg-amber-500 text-white mr-1.5">
                          #{pt.shortCode || pt.blockCode || 'S/N'}
                        </span>
                        <span className="font-extrabold text-sm text-slate-900">
                          {pt.label}
                        </span>
                        {pt.notes && (
                          <div className="text-xs text-slate-600 mt-0.5">
                            {pt.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={getGoogleMapsNavigationUrl(pt.lat, pt.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 py-2 px-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Cómo llegar (Maps)
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateHouseStatus(pt.id, 'atendido');
                        }}
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Ya atendió
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. DIRECCIONES "NO VISITAR" REGISTRADAS POR CONDUCTORES */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-red-700 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Direcciones "NO VISITAR" ({doNotCallList.length})
            </h3>
            {doNotCallList.length === 0 ? (
              <div className="text-xs text-slate-500">
                Ninguna dirección marcada como NO VISITAR en este territorio.
              </div>
            ) : (
              doNotCallList.map((w) => (
                <div
                  key={w.id}
                  onClick={() => {
                    setSelectedPointId(w.id);
                    mapInstanceRef.current?.setView([w.lat, w.lng], 18);
                  }}
                  className="p-2.5 rounded-xl bg-red-50 border border-red-300 text-red-950 text-xs cursor-pointer"
                >
                  <div className="font-extrabold">
                    🛑 NO VISITAR
                    {w.blockCode ? ` (Manzana ${w.blockCode})` : ''}: {w.label}
                  </div>
                  {w.notes && <div className="opacity-85 mt-0.5">{w.notes}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
