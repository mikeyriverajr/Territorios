import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowLeft,
  Crosshair,
  Layers,
  Maximize2,
  MapPin,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Block, LatLngTuple, Territory } from '../types/territory';
import { getPolygonCentroid, isPointInPolygon } from '../services/kmlImporter';
import { getTerritoryAssignees } from '../services/storageAndSync';

interface GeneralMapViewProps {
  territories: Territory[];
  blocks: Block[];
  congregationName?: string;
  onBack: () => void;
}

// Paleta de 16 colores de alto contraste ordenada para diferenciar territorios contiguos
const TERRITORY_COLORS = [
  '#2563eb', // Azul
  '#ea580c', // Naranja
  '#059669', // Esmeralda
  '#db2777', // Rosa fuerte
  '#7c3aed', // Violeta
  '#d97706', // Ámbar
  '#0891b2', // Cian
  '#dc2626', // Rojo
  '#65a30d', // Lima
  '#4f46e5', // Índigo
  '#0d9488', // Turquesa
  '#c026d3', // Fucsia
  '#e11d48', // Carmesí
  '#0284c7', // Celeste
  '#b45309', // Ocre
  '#15803d', // Verde bosque
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GeneralMapView: React.FC<GeneralMapViewProps> = ({
  territories,
  blocks,
  congregationName,
  onBack,
}) => {
  const [mapStyle, setMapStyle] = useState<'satelite' | 'calles'>('satelite');
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userGps, setUserGps] = useState<LatLngTuple | null>(null);
  const [gpsActive, setGpsActive] = useState<boolean>(false);
  const [gpsMessage, setGpsMessage] = useState<string>('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const currentTileStyleRef = useRef<'satelite' | 'calles' | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);

  const sortedTerritories = useMemo(
    () => [...territories].sort((a, b) => a.number - b.number),
    [territories]
  );

  const territoryColorMap = useMemo(() => {
    const map = new Map<string, string>();
    sortedTerritories.forEach((t, idx) => {
      map.set(t.id, TERRITORY_COLORS[idx % TERRITORY_COLORS.length]);
    });
    return map;
  }, [sortedTerritories]);

  const filteredTerritoriesForJump = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedTerritories;
    return sortedTerritories.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        String(t.number).includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }, [sortedTerritories, searchQuery]);

  const selectedTerritory = useMemo(
    () => sortedTerritories.find((t) => t.id === selectedTerritoryId) || null,
    [sortedTerritories, selectedTerritoryId]
  );

  const currentGpsTerritory = useMemo(() => {
    if (!userGps) return null;
    return (
      sortedTerritories.find(
        (t) => t.polygon.length >= 3 && isPointInPolygon(userGps, t.polygon)
      ) || null
    );
  }, [userGps, sortedTerritories]);

  const allTerritoryCoords = useMemo(
    () => sortedTerritories.flatMap((t) => t.polygon),
    [sortedTerritories]
  );

  const fitAllTerritories = (mapInstance?: L.Map | null) => {
    const map = mapInstance || mapRef.current;
    if (!map || allTerritoryCoords.length === 0) return;
    const bounds = L.latLngBounds(allTerritoryCoords);
    if (bounds.isValid()) {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    }
  };

  const focusTerritory = (territory: Territory) => {
    setSelectedTerritoryId(territory.id);
    const map = mapRef.current;
    if (!map || territory.polygon.length === 0) return;
    const bounds = L.latLngBounds(territory.polygon);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
    }
  };

  // Inicializar mapa de solo lectura
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const firstWithPoly = sortedTerritories.find((t) => t.polygon.length >= 3);
    const initialCenter: LatLngTuple = firstWithPoly
      ? getPolygonCentroid(firstWithPoly.polygon)
      : [-34.612, -58.443];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

    const tileLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        maxNativeZoom: 17,
        attribution: '© Esri Satellite',
      }
    ).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    tileLayerRef.current = tileLayer;
    currentTileStyleRef.current = 'satelite';
    layerGroupRef.current = group;

    fitAllTerritories(map);

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
      if (gpsWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      currentTileStyleRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Alternar capa Satélite / Calles sin parpadeo inicial
  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !tileLayerRef.current ||
      currentTileStyleRef.current === mapStyle
    ) {
      return;
    }

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
    currentTileStyleRef.current = mapStyle;
  }, [mapStyle]);

  // Dibujar todos los territorios con colores distintivos + marcador GPS
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;

    group.clearLayers();

    sortedTerritories.forEach((t) => {
      if (t.polygon.length < 3) return;
      const color = territoryColorMap.get(t.id) || '#2563eb';
      const isSelected = t.id === selectedTerritoryId;

      const poly = L.polygon(t.polygon, {
        color: isSelected ? '#ffffff' : color,
        weight: isSelected ? 4.5 : 2.5,
        fillColor: color,
        fillOpacity: isSelected ? 0.45 : 0.28,
      }).addTo(group);

      if (isSelected) {
        poly.bringToFront();
      }

      poly.on('click', () => {
        setSelectedTerritoryId(t.id);
      });

      const centroid = getPolygonCentroid(t.polygon);
      const shortLabel = escapeHtml(
        t.name.length > 18 ? `T${t.number}` : t.name
      );
      const labelIcon = L.divIcon({
        className: 'custom-overview-label',
        html: `<div style="display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;">
          <span style="display:inline-flex;align-items:center;gap:5px;background:${
            isSelected ? '#0f172a' : 'rgba(15,23,42,0.84)'
          };color:#ffffff;padding:2px 8px;border-radius:999px;font-weight:900;font-size:11px;border:${
          isSelected ? '2px solid #facc15' : '1.5px solid rgba(255,255,255,0.85)'
        };box-shadow:0 2px 6px rgba(0,0,0,0.45);white-space:nowrap;">
            <span style="width:9px;height:9px;border-radius:999px;background:${color};border:1px solid #fff;flex-shrink:0;"></span>
            <span>${shortLabel}</span>
          </span>
        </div>`,
        iconSize: [120, 24],
        iconAnchor: [60, 12],
      });

      const labelMarker = L.marker(centroid, { icon: labelIcon }).addTo(group);
      labelMarker.on('click', () => {
        setSelectedTerritoryId(t.id);
      });
    });

    if (userGps) {
      const gpsIcon = L.divIcon({
        className: 'custom-google-maps-gps',
        html: `<div style="position:relative;width:44px;height:44px;pointer-events:none;">
          <div style="position:absolute;top:8px;left:8px;width:28px;height:28px;border-radius:9999px;background:rgba(37,99,235,0.3);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:absolute;top:14px;left:14px;width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>
        </div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      L.marker(userGps, { icon: gpsIcon, zIndexOffset: 1000 })
        .bindTooltip('Tu ubicación GPS actual', { direction: 'top' })
        .addTo(group);
    }
  }, [sortedTerritories, territoryColorMap, selectedTerritoryId, userGps]);

  const handleActivateGps = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsMessage('Tu navegador o dispositivo no tiene GPS disponible.');
      return;
    }

    setGpsMessage('Buscando tu ubicación GPS...');
    setGpsActive(true);

    const onSuccess = (pos: GeolocationPosition, centerMap: boolean) => {
      const coords: LatLngTuple = [pos.coords.latitude, pos.coords.longitude];
      setUserGps(coords);
      setGpsMessage('');
      if (centerMap && mapRef.current) {
        mapRef.current.setView(coords, 16);
      }
    };

    const onError = (err: GeolocationPositionError) => {
      setGpsActive(false);
      if (err.code === err.PERMISSION_DENIED) {
        setGpsMessage(
          'Permiso de ubicación denegado. Activa el GPS y permite la ubicación en tu navegador.'
        );
      } else {
        setGpsMessage(
          'No se pudo obtener tu señal GPS. Verifica que la ubicación del teléfono esté activada.'
        );
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => onSuccess(pos, true),
      onError,
      { enableHighAccuracy: true, timeout: 10000 }
    );

    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
    }
    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => onSuccess(pos, false),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  const selectedColor = selectedTerritory
    ? territoryColorMap.get(selectedTerritory.id) || '#2563eb'
    : '#2563eb';
  const selectedBlocks = selectedTerritory
    ? blocks.filter((b) => b.territoryId === selectedTerritory.id)
    : [];
  const selectedDoneBlocks = selectedBlocks.filter(
    (b) => b.status === 'completada'
  );
  const selectedAssignees = selectedTerritory
    ? getTerritoryAssignees(selectedTerritory)
    : [];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-100 overflow-hidden">
      {/* Barra superior compacta */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 z-10 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver</span>
          </button>

          <div className="min-w-0">
            <h1 className="font-black text-sm sm:text-base text-slate-900 truncate">
              Mapa General de Territorios ({sortedTerritories.length})
            </h1>
            {congregationName && (
              <p className="text-[11px] text-slate-500 font-semibold truncate">
                {congregationName} — Solo lectura
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar territorio..."
              aria-label="Filtrar territorios"
              className="w-36 sm:w-44 pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-600 focus:outline-none text-xs font-bold"
            />
          </div>

          <select
            value={selectedTerritoryId || ''}
            onChange={(e) => {
              const found = sortedTerritories.find(
                (t) => t.id === e.target.value
              );
              if (found) focusTerritory(found);
            }}
            aria-label="Ir a un territorio"
            className="max-w-[180px] px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-xs text-slate-800 cursor-pointer"
          >
            <option value="">Ir a territorio...</option>
            {filteredTerritoriesForJump.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (#{t.number})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSelectedTerritoryId(null);
              fitAllTerritories();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer"
            title="Mostrar todos los territorios"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Ver todos</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setMapStyle(mapStyle === 'satelite' ? 'calles' : 'satelite')
            }
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-amber-300" />
            <span>{mapStyle === 'satelite' ? '🗺️ Calles' : '🛰️ Satélite'}</span>
          </button>
        </div>
      </div>

      {/* Aviso de ubicación GPS */}
      {(gpsMessage || userGps) && (
        <div
          className={`px-4 py-1.5 text-xs font-bold flex items-center justify-between gap-2 z-10 ${
            gpsMessage && !userGps
              ? 'bg-amber-100 text-amber-950 border-b border-amber-300'
              : 'bg-blue-900 text-white'
          }`}
        >
          <span>
            {gpsMessage
              ? gpsMessage
              : currentGpsTerritory
              ? `📍 Estás dentro de ${currentGpsTerritory.name}`
              : '📍 Ubicación GPS activa (fuera de los límites de un territorio)'}
          </span>
          {currentGpsTerritory && (
            <button
              type="button"
              onClick={() => focusTerritory(currentGpsTerritory)}
              className="px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-[11px] font-extrabold cursor-pointer"
            >
              Ver detalles
            </button>
          )}
        </div>
      )}

      {/* Contenedor del mapa */}
      <div className="relative flex-1 min-h-0 w-full">
        {sortedTerritories.filter((t) => t.polygon.length >= 3).length === 0 ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 max-w-md text-center space-y-3 shadow-sm">
              <MapPin className="w-10 h-10 text-blue-700 mx-auto" />
              <h2 className="font-black text-lg text-slate-900">
                Aún no hay mapas cargados
              </h2>
              <p className="text-sm text-slate-600">
                Cuando el encargado cargue los territorios de la congregación,
                podrás recorrerlos todos aquí con sus colores.
              </p>
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 rounded-xl bg-blue-700 text-white font-bold text-sm cursor-pointer"
              >
                Volver al inicio
              </button>
            </div>
          </div>
        ) : (
          <div ref={mapContainerRef} className="w-full h-full z-0 bg-slate-900" />
        )}

        {/* Botón flotante de GPS */}
        <div className="absolute bottom-4 left-3 z-[1000] pointer-events-none">
          <button
            type="button"
            onClick={handleActivateGps}
            className={`pointer-events-auto py-2.5 px-3.5 rounded-xl font-extrabold text-xs sm:text-sm shadow-xl border-2 flex items-center gap-1.5 cursor-pointer transition ${
              gpsActive && userGps
                ? 'bg-blue-700 text-white border-white'
                : 'bg-white/95 hover:bg-white text-blue-900 border-blue-600'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span>Mi ubicación GPS</span>
          </button>
        </div>

        {/* Tarjeta flotante informativa al tocar un territorio (solo lectura) */}
        {selectedTerritory && (
          <div className="absolute bottom-16 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-88 z-[1001] bg-white rounded-2xl shadow-2xl border-2 border-slate-900 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-slate-900/30 shrink-0"
                    style={{ backgroundColor: selectedColor }}
                  />
                  <span className="font-black text-base text-slate-900">
                    {selectedTerritory.name}
                  </span>
                  <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {selectedTerritory.type}
                  </span>
                  <span
                    className={`text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                      selectedTerritory.status === 'completado'
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-blue-100 text-blue-900'
                    }`}
                  >
                    {selectedTerritory.status === 'completado'
                      ? 'Completado'
                      : 'En curso'}
                  </span>
                </div>
                {selectedTerritory.description && (
                  <p className="text-xs text-slate-600 mt-1">
                    {selectedTerritory.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedTerritoryId(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer shrink-0"
                aria-label="Cerrar tarjeta"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <div className="text-[10px] font-extrabold uppercase text-slate-500">
                  Manzanas
                </div>
                <div className="font-black text-slate-900 mt-0.5">
                  {selectedBlocks.length > 0
                    ? `${selectedDoneBlocks.length}/${selectedBlocks.length} listas`
                    : 'Sin manzanas'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <div className="text-[10px] font-extrabold uppercase text-slate-500 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Asignado a
                </div>
                <div className="font-bold text-slate-900 mt-0.5 truncate">
                  {selectedAssignees.length > 0
                    ? selectedAssignees.map((a) => a.name).join(', ')
                    : 'Sin asignar'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => focusTerritory(selectedTerritory)}
              className="w-full py-2.5 px-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-300" />
              <span>Centrar mapa en {selectedTerritory.name}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
