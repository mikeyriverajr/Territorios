import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Crosshair,
  ExternalLink,
  Home,
  Layers,
  MapPin,
  Navigation,
  Share2,
  ShieldAlert,
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
import {
  findBlockForCoordinates,
  getSlotConductorLabel,
  getTerritoryAssignees,
} from '../services/storageAndSync';
import {
  buildPublisherLinkWhatsAppMessage,
  buildPublisherTerritoryWhatsAppMessage,
  copyTextToClipboard,
  getGoogleMapsNavigationUrl,
  getPublisherGroupLink,
  getPublisherTerritoryLink,
  openWhatsAppShare,
} from '../services/notificationHelper';

interface FieldMapViewProps {
  territories: Territory[];
  blocks: Block[];
  housePoints: HousePoint[];
  activeTerritoryId: string;
  activeSlot: ScheduleSlot | null;
  canSwitchAllTerritories?: boolean;
  allowedTerritoryIds?: string[];
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
  onCompleteAndReturnTerritory?: (
    territoryId: string,
    conductorName?: string
  ) => void;
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
  allowedTerritoryIds,
  onSelectTerritory,
  onBack,
  onAddHousePoint,
  onUpdateHouseStatus,
  onDeleteHousePoint,
  onUpdateBlockStatus,
  onCompleteWholeTerritory,
  onResetTerritory,
  onCompleteAndReturnTerritory,
}) => {
  const selectableTerritories = useMemo(() => {
    if (canSwitchAllTerritories) return territories;
    if (allowedTerritoryIds && allowedTerritoryIds.length > 0) {
      const assigned = territories.filter((t) =>
        allowedTerritoryIds.includes(t.id)
      );
      if (assigned.length > 0) return assigned;
    }
    if (activeSlot) {
      const assigned = territories.filter((t) =>
        activeSlot.territoryIds.includes(t.id)
      );
      if (assigned.length > 0) return assigned;
    }
    const single = territories.find((t) => t.id === activeTerritoryId);
    return single ? [single] : territories;
  }, [
    territories,
    activeSlot,
    canSwitchAllTerritories,
    allowedTerritoryIds,
    activeTerritoryId,
  ]);

  const selectableTerritoryIdSet = useMemo(
    () => new Set(selectableTerritories.map((t) => t.id)),
    [selectableTerritories]
  );

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
  const [showReturnConfirmModal, setShowReturnConfirmModal] =
    useState<boolean>(false);
  const [isChangingBlock, setIsChangingBlock] = useState<boolean>(false);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const [userGps, setUserGps] = useState<LatLngTuple | null>(null);
  const [gpsStatusText, setGpsStatusText] = useState<string>('');
  const [copiedPubLink, setCopiedPubLink] = useState<boolean>(false);

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
      zoom: 15,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

    const tileLayer = (
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
              maxNativeZoom: 17,
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
      setIsChangingBlock(false);
      const coords: LatLngTuple = [e.latlng.lat, e.latlng.lng];
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
  }, [activeTerritory, blocks]);

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
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
  }, [activeTerritory?.id, hasActiveTerritory]);

  useEffect(() => {
    const group = overlaysGroupRef.current;
    if (!group || !activeTerritory) return;

    group.clearLayers();

    // Dibujar los demás territorios de la congregación como polígonos de solo lectura con su nombre
    territories
      .filter((t) => t.id !== activeTerritory.id && t.polygon.length >= 3)
      .forEach((t) => {
        L.polygon(t.polygon, {
          color: '#64748b',
          weight: 2,
          dashArray: '6, 6',
          fillColor: '#94a3b8',
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(group);

        const safeName = t.name
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const terrCentroid = getPolygonCentroid(t.polygon);
        const terrLabelIcon = L.divIcon({
          className: 'custom-readonly-terr-label',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:160px;height:24px;pointer-events:none;"><span style="background:rgba(15,23,42,0.75);color:#e2e8f0;padding:2px 8px;border-radius:999px;font-weight:800;font-size:11px;border:1px solid rgba(255,255,255,0.5);box-shadow:0 1px 4px rgba(0,0,0,0.35);white-space:nowrap;">${safeName}</span></div>`,
          iconSize: [160, 24],
          iconAnchor: [80, 12],
        });
        L.marker(terrCentroid, {
          icon: terrLabelIcon,
          interactive: false,
        }).addTo(group);
      });

    if (activeTerritory.polygon.length >= 3) {
      L.polygon(activeTerritory.polygon, {
        color: '#1e3a8a',
        weight: 3,
        dashArray: '8, 6',
        fillColor: '#3b82f6',
        fillOpacity: territoryBlocks.length === 0 ? 0.08 : 0.02,
        interactive: false,
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
        setIsChangingBlock(false);
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
    territories,
    territoryBlocks,
    territoryPoints,
    selectedPointId,
    userGps,
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
          mapInstanceRef.current.setView(coords, 17);
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
      mapInstanceRef.current.setView(simulatedCoords, 17);
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
    setIsChangingBlock(false);
  };

  const handleConfirmReturnTerritory = () => {
    if (!activeTerritory) return;
    const firstAssigneeName = getTerritoryAssignees(activeTerritory)[0]?.name;
    const conductorName =
      firstAssigneeName ||
      activeSlot?.conductorName ||
      activeTerritory.assignedToName;
    setShowReturnConfirmModal(false);
    if (onCompleteAndReturnTerritory) {
      onCompleteAndReturnTerritory(activeTerritory.id, conductorName);
    } else {
      onCompleteWholeTerritory(activeTerritory.id, conductorName);
      onBack();
    }
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

  const handleSharePublisherLink = () => {
    if (!activeTerritory) return;
    if (activeSlot) {
      const slotTerrNames = territories
        .filter((t) => activeSlot.territoryIds.includes(t.id))
        .map((t) => t.name);
      const message = buildPublisherLinkWhatsAppMessage(activeSlot, slotTerrNames);
      openWhatsAppShare(message);
      void copyTextToClipboard(getPublisherGroupLink(activeSlot.id));
    } else {
      const assignees = getTerritoryAssignees(activeTerritory)
        .map((a) => a.name)
        .filter(Boolean)
        .join(' / ');
      const message = buildPublisherTerritoryWhatsAppMessage(
        activeTerritory,
        assignees || undefined
      );
      openWhatsAppShare(message);
      void copyTextToClipboard(getPublisherTerritoryLink(activeTerritory.id));
    }
    setCopiedPubLink(true);
    setTimeout(() => setCopiedPubLink(false), 3000);
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
      {/* MODAL DE AVISO INICIAL AL ABRIR EL TERRITORIO */}
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
                  {activeSlot
                    ? ` — ${getSlotConductorLabel(activeSlot)}`
                    : (() => {
                        const names = getTerritoryAssignees(activeTerritory)
                          .map((a) => a.name)
                          .filter(Boolean);
                        return names.length > 0 ? ` — ${names.join(' / ')}` : '';
                      })()}
                </h2>
                {(activeSlot?.date || activeTerritory.assignedAt) && (
                  <div className="text-xs font-bold text-slate-600 mt-0.5">
                    Fecha:{' '}
                    {activeSlot?.date || activeTerritory.assignedAt}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowInitialBriefing(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Direcciones NO VISITAR en este territorio */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-red-800 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                Direcciones "NO VISITAR" en este territorio (
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

            {/* Falta por hacer */}
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Home className="w-4 h-4 text-blue-700" />
                Falta por hacer ({activeTerritory.name})
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
                  <strong>Casas "No en casa": </strong>
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

      {/* MODAL DE CONFIRMACIÓN PARA COMPLETAR Y DEVOLVER EL TERRITORIO */}
      {showReturnConfirmModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border-2 border-emerald-600 p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-slate-900">
                  ¿Completar y devolver {activeTerritory.name}?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReturnConfirmModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              ¿Deseas marcar este territorio como completado y devolverlo? Al
              confirmar, quedará guardado en el historial S-13 y ya no aparecerá
              en tus asignaciones ni en las salidas de quienes lo tenían. El
              administrador decidirá cuándo reiniciarlo para la próxima vez.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowReturnConfirmModal(false)}
                className="w-1/2 py-3 rounded-xl border-2 border-slate-300 font-bold text-slate-700 text-sm cursor-pointer hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReturnTerritory}
                className="w-1/2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md cursor-pointer"
              >
                Sí, devolver territorio
              </button>
            </div>
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
                  Anotar en el Mapa
                </span>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <h3 className="text-xl font-black text-slate-900 leading-tight">
                    {newPointDraft.blockCode
                      ? `Manzana ${newPointDraft.blockCode}`
                      : activeTerritory.name}
                  </h3>
                  {territoryBlocks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsChangingBlock(!isChangingBlock)}
                      className="px-2.5 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-blue-700 font-extrabold text-xs cursor-pointer border border-slate-300 transition"
                    >
                      {isChangingBlock ? 'Cerrar' : 'Cambiar'}
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewPointDraft(null);
                  setIsChangingBlock(false);
                }}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

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
                        setNewPointDraft({
                          ...newPointDraft,
                          blockId: b.id,
                          blockCode: b.code,
                        });
                        setIsChangingBlock(false);
                      }}
                      className={`px-3 py-1 rounded-lg font-extrabold text-xs border cursor-pointer transition ${
                        newPointDraft.blockCode === b.code
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

            {/* El Conductor es quien tiene el permiso exclusivo de elegir entre "No en casa" o "NO VISITAR" */}
            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1.5">
                Categoría:
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
                autoFocus
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
                Descripción rápida:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DESCRIPTIONS.map((chip) => {
                  const active = newPointDraft.selectedChips.includes(chip);
                  return (
                    <button
                      type="button"
                      key={chip}
                      onClick={() => toggleChip(chip)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
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
                onClick={() => {
                  setNewPointDraft(null);
                  setIsChangingBlock(false);
                }}
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
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COLUMNA IZQUIERDA: MAPA INTERACTIVO */}
      <div className="relative h-[68vh] sm:h-[72vh] shrink-0 lg:h-full lg:flex-1 lg:min-w-0 lg:min-h-0 flex flex-col">
        {/* Encabezado limpio en una sola fila */}
        <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Salidas
            </button>

            {selectableTerritories.length > 1 ? (
              <select
                value={activeTerritory.id}
                onChange={(e) => {
                  if (!selectableTerritoryIdSet.has(e.target.value)) return;
                  onSelectTerritory(e.target.value);
                  setSelectedPointId(null);
                }}
                className="min-w-0 px-2.5 py-1.5 rounded-xl border-2 border-blue-700 bg-blue-50 text-blue-950 font-extrabold text-xs sm:text-sm cursor-pointer truncate"
              >
                {selectableTerritories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-black text-sm sm:text-base text-slate-900 truncate">
                {activeTerritory.name}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSharePublisherLink}
            title="Copiar y compartir link para publicadores por WhatsApp"
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 font-extrabold text-xs cursor-pointer shadow-2xs transition"
          >
            <Share2 className="w-3.5 h-3.5 shrink-0" />
            <span>{copiedPubLink ? '¡Link copiado!' : 'Link Publicadores'}</span>
          </button>
        </div>

        {(gpsStatusText || currentUserBlock) && (
          <div className="bg-blue-900 text-white px-3.5 py-1.5 text-xs sm:text-sm font-bold flex items-center justify-between z-10">
            <span>
              {gpsStatusText ||
                (currentUserBlock
                  ? `📍 Estás en Manzana ${currentUserBlock.code}`
                  : '')}
            </span>
          </div>
        )}

        {/* Contenedor del mapa con controles flotantes */}
        <div className="relative flex-1 min-h-[280px] lg:min-h-0 w-full">
          <div
            ref={mapContainerRef}
            className="w-full h-full z-0 bg-slate-900"
          />

          {/* Fila flotante superior: aviso táctil + botón Satélite/Calles */}
          <div className="absolute top-2.5 left-12 right-2.5 z-[1000] flex items-center justify-between gap-2 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-xs text-white px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold shadow-md border border-white/15 flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                Toque una casa en el mapa para anotar
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setMapStyle(mapStyle === 'calles' ? 'satelite' : 'calles')
              }
              className="pointer-events-auto shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-950 text-white font-bold text-xs shadow-lg border border-white/20 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-amber-300" />
              <span>{mapStyle === 'calles' ? '🛰️ Satélite' : '🗺️ Calles'}</span>
            </button>
          </div>

          {/* Fila flotante inferior dentro del mapa: GPS */}
          <div className="absolute bottom-3 left-3 right-3 z-[1000] flex items-center justify-start gap-2 pointer-events-none">
            <button
              type="button"
              onClick={() => handleLocateMeGps(false)}
              title="Ubicar mi posición GPS"
              className="pointer-events-auto py-2.5 px-3 rounded-xl bg-white/95 hover:bg-white text-blue-900 font-extrabold text-xs shadow-xl border-2 border-blue-600 flex items-center gap-1.5 cursor-pointer"
            >
              <Crosshair className="w-4 h-4 text-blue-700" />
              <span>Mi GPS</span>
            </button>
          </div>

          {/* Tarjeta flotante al tocar un pin en el mapa */}
          {selectedPoint && (
            <div className="absolute bottom-16 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-[1001] bg-white rounded-2xl shadow-2xl border-2 border-blue-900 p-4 space-y-3">
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
        </div>
      </div>

      {/* PANEL DEL CONDUCTOR: MANZANAS Y LISTAS SIMPLIFICADAS */}
      <div className="w-full lg:w-[400px] shrink-0 bg-white border-t-2 lg:border-t-0 lg:border-l-2 border-slate-200 flex flex-col lg:h-full lg:overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* 1. Manzanas en píldoras compactas */}
          {territoryBlocks.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Manzanas (
                  {
                    territoryBlocks.filter((b) => b.status === 'completada')
                      .length
                  }
                  /{territoryBlocks.length})
                </h3>
                <span className="text-[11px] font-semibold text-slate-400">
                  Toque para marcar
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
                {territoryBlocks.map((block) => {
                  const isDone = block.status === 'completada';
                  return (
                    <button
                      key={block.id}
                      onClick={() =>
                        onUpdateBlockStatus(
                          block.id,
                          isDone ? 'pendiente' : 'completada',
                          activeSlot?.conductorName ||
                            activeTerritory.assignedToName
                        )
                      }
                      className={`py-2 px-2.5 rounded-xl border-2 font-black text-xs flex items-center justify-between gap-1 transition cursor-pointer ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-blue-500'
                      }`}
                    >
                      <span>{block.code}</span>
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${
                          isDone ? 'text-white' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Lista de casas "No en Casa" pendientes */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {activeTerritory.type === 'rural'
                ? `Casas Rurales (${territoryPoints.length})`
                : `Casas "No en Casa" (${pendingNotAtHome.length})`}
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
                No hay casas "No en casa" pendientes para{' '}
                {activeTerritory.name}.
              </div>
            ) : (
              <div className="space-y-2">
                {pendingNotAtHome.map((pt) => (
                  <div
                    key={pt.id}
                    onClick={() => {
                      setSelectedPointId(pt.id);
                      mapInstanceRef.current?.setView([pt.lat, pt.lng], 17);
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

          {/* 3. Direcciones "NO VISITAR" */}
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
                    mapInstanceRef.current?.setView([w.lat, w.lng], 17);
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

          {/* 4. Marcar Territorio Completado */}
          <div className="pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowReturnConfirmModal(true)}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>Marcar Territorio Completado</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
