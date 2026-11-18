import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Check,
  Edit3,
  Layers,
  MapPin,
  Plus,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  Block,
  LatLngTuple,
  Territory,
  TerritoryType,
} from '../types/territory';
import { getPolygonCentroid } from '../services/kmlImporter';

interface MapEditorViewProps {
  territories: Territory[];
  blocks: Block[];
  onSaveTerritory: (updated: Territory) => void;
  onCreateTerritory: (newTerr: Territory) => void;
  onDeleteTerritory: (territoryId: string) => void;
  onSaveBlock: (updated: Block) => void;
  onCreateBlock: (newBlock: Block) => void;
  onDeleteBlock: (blockId: string) => void;
}

export const MapEditorView: React.FC<MapEditorViewProps> = ({
  territories,
  blocks,
  onSaveTerritory,
  onCreateTerritory,
  onDeleteTerritory,
  onSaveBlock,
  onCreateBlock,
  onDeleteBlock,
}) => {
  // Vista satelital por defecto en todos los mapas
  const [mapStyle, setMapStyle] = useState<'satelite' | 'calles'>('satelite');

  // Modo de selección: editar un Territorio o una Manzana
  const [editTargetType, setEditTargetType] = useState<'territory' | 'block'>(
    'territory'
  );
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>(
    territories[0]?.id || ''
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string>(
    blocks[0]?.id || ''
  );

  // Modo herramienta en el mapa: 'mover_esquinas' | 'agregar_esquina' | 'borrar_esquina'
  const [vertexTool, setVertexTool] = useState<
    'mover_esquinas' | 'agregar_esquina' | 'borrar_esquina'
  >('mover_esquinas');

  // Estado temporal del elemento que se está editando
  const [draftName, setDraftName] = useState<string>('');
  const [draftCodeOrNumber, setDraftCodeOrNumber] = useState<string>('');
  const [draftParentTerritoryId, setDraftParentTerritoryId] =
    useState<string>('');
  const [draftTerritoryType, setDraftTerritoryType] =
    useState<TerritoryType>('urbano');
  const [draftPolygon, setDraftPolygon] = useState<LatLngTuple[]>([]);
  const [savedToast, setSavedToast] = useState<string>('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const selectedTerritory = useMemo(
    () => territories.find((t) => t.id === selectedTerritoryId) || null,
    [territories, selectedTerritoryId]
  );

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId]
  );

  const blocksOfSelectedTerritory = useMemo(
    () =>
      blocks
        .filter((b) => b.territoryId === selectedTerritoryId)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [blocks, selectedTerritoryId]
  );

  // Cargar los datos en el borrador cuando cambia el territorio o manzana seleccionada
  useEffect(() => {
    if (editTargetType === 'territory' && selectedTerritory) {
      setDraftName(selectedTerritory.name);
      setDraftCodeOrNumber(String(selectedTerritory.number));
      setDraftTerritoryType(selectedTerritory.type);
      setDraftPolygon(selectedTerritory.polygon.map((pt) => [pt[0], pt[1]]));
    } else if (editTargetType === 'block' && selectedBlock) {
      setDraftName(selectedBlock.name);
      setDraftCodeOrNumber(selectedBlock.code);
      setDraftParentTerritoryId(selectedBlock.territoryId);
      setDraftPolygon(selectedBlock.polygon.map((pt) => [pt[0], pt[1]]));
    }
  }, [editTargetType, selectedTerritory, selectedBlock]);

  // Inicializar Mapa con Satélite por defecto
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter: LatLngTuple = selectedTerritory?.polygon?.length
      ? getPolygonCentroid(selectedTerritory.polygon)
      : [-34.612, -58.443];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
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

    if (selectedTerritory?.polygon && selectedTerritory.polygon.length >= 2) {
      map.fitBounds(L.latLngBounds(selectedTerritory.polygon), {
        padding: [36, 36],
        maxZoom: 16,
      });
    }

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

  // Permitir clic en el mapa cuando la herramienta es 'agregar_esquina'
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (vertexTool !== 'agregar_esquina') return;
      const newPt: LatLngTuple = [
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6)),
      ];
      setDraftPolygon((prev) => [...prev, newPt]);
    };

    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [vertexTool]);

  // Dibujar polígonos de referencia + el polígono editable con sus vértices arrastrables
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;

    group.clearLayers();

    // 1. Dibujar los demás territorios en segundo plano
    territories.forEach((t) => {
      const isCurrentlyEditingThis =
        editTargetType === 'territory' && t.id === selectedTerritoryId;
      if (isCurrentlyEditingThis || t.polygon.length < 3) return;

      const poly = L.polygon(t.polygon, {
        color: '#60a5fa',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#3b82f6',
        fillOpacity: 0.05,
      }).addTo(group);

      poly.on('click', () => {
        if (vertexTool === 'mover_esquinas') {
          setEditTargetType('territory');
          setSelectedTerritoryId(t.id);
        }
      });
    });

    // 2. Dibujar las manzanas del territorio actual en segundo plano
    blocks
      .filter((b) => b.territoryId === selectedTerritoryId)
      .forEach((b) => {
        const isCurrentlyEditingThis =
          editTargetType === 'block' && b.id === selectedBlockId;
        if (isCurrentlyEditingThis || b.polygon.length < 3) return;

        const poly = L.polygon(b.polygon, {
          color: '#34d399',
          weight: 2,
          fillColor: '#10b981',
          fillOpacity: 0.12,
        }).addTo(group);

        poly.on('click', (e: L.LeafletMouseEvent) => {
          if (vertexTool === 'mover_esquinas') {
            L.DomEvent.stopPropagation(e);
            setEditTargetType('block');
            setSelectedBlockId(b.id);
          }
        });

        const centroid = getPolygonCentroid(b.polygon);
        const label = L.divIcon({
          className: 'custom-block-label',
          html: `<div style="background:rgba(15,23,42,0.8);color:#fff;padding:2px 6px;border-radius:6px;font-weight:800;font-size:11px;">${b.code}</div>`,
          iconSize: [36, 20],
          iconAnchor: [18, 10],
        });
        L.marker(centroid, { icon: label, interactive: false }).addTo(group);
      });

    // 3. Dibujar el POLÍGONO ACTIVO EN EDICIÓN con bordes amarillos brillantes
    if (draftPolygon.length >= 2) {
      L.polygon(draftPolygon, {
        color: '#facc15',
        weight: 3.5,
        fillColor: '#eab308',
        fillOpacity: 0.25,
      }).addTo(group);
    }

    // 4. Dibujar cada VÉRTICE (Esquina) como marcador arrastrable
    draftPolygon.forEach((pt, idx) => {
      const isDeleteMode = vertexTool === 'borrar_esquina';
      const vertexIcon = L.divIcon({
        className: 'custom-gps-dot',
        html: `<div style="width:18px;height:18px;border-radius:999px;background:${
          isDeleteMode ? '#dc2626' : '#facc15'
        };border:3px solid #0f172a;box-shadow:0 2px 6px rgba(0,0,0,0.6);cursor:${
          isDeleteMode ? 'pointer' : 'grab'
        };display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:${
          isDeleteMode ? '#fff' : '#0f172a'
        };">${idx + 1}</div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marker = L.marker(pt, {
        icon: vertexIcon,
        draggable: !isDeleteMode,
      }).addTo(group);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setDraftPolygon((prev) =>
          prev.map((item, i) =>
            i === idx
              ? [Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6))]
              : item
          )
        );
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (vertexTool === 'borrar_esquina' && draftPolygon.length > 3) {
          setDraftPolygon((prev) => prev.filter((_, i) => i !== idx));
        }
      });

      // 5. Punto intermedio "+" entre esta esquina y la siguiente para insertar una nueva esquina con 1 clic
      if (draftPolygon.length >= 3 && vertexTool === 'mover_esquinas') {
        const nextIdx = (idx + 1) % draftPolygon.length;
        const nextPt = draftPolygon[nextIdx];
        const midLat = Number(((pt[0] + nextPt[0]) / 2).toFixed(6));
        const midLng = Number(((pt[1] + nextPt[1]) / 2).toFixed(6));

        const midIcon = L.divIcon({
          className: 'custom-gps-dot',
          html: `<div title="Tocar para insertar esquina aquí" style="width:14px;height:14px;border-radius:999px;background:#38bdf8;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#0f172a;">+</div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const midMarker = L.marker([midLat, midLng], {
          icon: midIcon,
        }).addTo(group);

        midMarker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          setDraftPolygon((prev) => {
            const copy = [...prev];
            copy.splice(idx + 1, 0, [midLat, midLng]);
            return copy;
          });
        });
      }
    });
  }, [
    territories,
    blocks,
    editTargetType,
    selectedTerritoryId,
    selectedBlockId,
    draftPolygon,
    vertexTool,
  ]);

  const handleFitSelectedOnMap = () => {
    if (!mapRef.current || draftPolygon.length < 2) return;
    mapRef.current.fitBounds(L.latLngBounds(draftPolygon), {
      padding: [36, 36],
      maxZoom: 16,
    });
  };

  const handleSaveCurrentChanges = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftPolygon.length < 3) return;

    if (editTargetType === 'territory' && selectedTerritory) {
      const parsedNum =
        parseInt(draftCodeOrNumber, 10) || selectedTerritory.number;
      onSaveTerritory({
        ...selectedTerritory,
        number: parsedNum,
        name: draftName.trim() || `Territorio ${parsedNum}`,
        type: draftTerritoryType,
        polygon: draftPolygon,
      });
      setSavedToast(`✅ Territorio "${draftName}" guardado en la nube.`);
    } else if (editTargetType === 'block' && selectedBlock) {
      const cleanCode = draftCodeOrNumber.trim().toUpperCase() || '1A';
      onSaveBlock({
        ...selectedBlock,
        code: cleanCode,
        name: draftName.trim() || `Manzana ${cleanCode}`,
        territoryId: draftParentTerritoryId || selectedBlock.territoryId,
        polygon: draftPolygon,
      });
      setSavedToast(`✅ Manzana "${cleanCode}" guardada en la nube.`);
    }
    setTimeout(() => setSavedToast(''), 3500);
  };

  const handleCreateNewTerritory = () => {
    const center = mapRef.current
      ? ([
          mapRef.current.getCenter().lat,
          mapRef.current.getCenter().lng,
        ] as LatLngTuple)
      : ([-34.612, -58.443] as LatLngTuple);

    const nextNum =
      territories.reduce((max, t) => Math.max(max, t.number), 0) + 1;
    const d = 0.0018;
    const newTerr: Territory = {
      id: `terr-${Date.now()}`,
      number: nextNum,
      name: `Territorio ${nextNum}`,
      type: 'urbano',
      status: 'en_curso',
      startedAt: new Date().toISOString().slice(0, 10),
      polygon: [
        [Number((center[0] + d).toFixed(6)), Number((center[1] - d).toFixed(6))],
        [Number((center[0] + d).toFixed(6)), Number((center[1] + d).toFixed(6))],
        [Number((center[0] - d).toFixed(6)), Number((center[1] + d).toFixed(6))],
        [Number((center[0] - d).toFixed(6)), Number((center[1] - d).toFixed(6))],
      ],
    };

    onCreateTerritory(newTerr);
    setEditTargetType('territory');
    setSelectedTerritoryId(newTerr.id);
    setSavedToast(
      `✨ Creado ${newTerr.name}. Arrastra sus esquinas amarillas para ajustar el borde.`
    );
    setTimeout(() => setSavedToast(''), 4000);
  };

  const handleCreateNewBlock = () => {
    const parentTerr = selectedTerritory || territories[0];
    if (!parentTerr) return;

    const center = mapRef.current
      ? ([
          mapRef.current.getCenter().lat,
          mapRef.current.getCenter().lng,
        ] as LatLngTuple)
      : getPolygonCentroid(parentTerr.polygon);

    const existingBlocks = blocks.filter(
      (b) => b.territoryId === parentTerr.id
    );
    const nextLetter = String.fromCharCode(65 + existingBlocks.length);
    const code = `${parentTerr.number}${nextLetter}`;
    const d = 0.0007;

    const newBlk: Block = {
      id: `block-${Date.now()}`,
      territoryId: parentTerr.id,
      code,
      name: `Manzana ${code}`,
      status: 'pendiente',
      polygon: [
        [Number((center[0] + d).toFixed(6)), Number((center[1] - d).toFixed(6))],
        [Number((center[0] + d).toFixed(6)), Number((center[1] + d).toFixed(6))],
        [Number((center[0] - d).toFixed(6)), Number((center[1] + d).toFixed(6))],
        [Number((center[0] - d).toFixed(6)), Number((center[1] - d).toFixed(6))],
      ],
    };

    onCreateBlock(newBlk);
    setEditTargetType('block');
    setSelectedBlockId(newBlk.id);
    setSavedToast(
      `✨ Creada Manzana ${code}. Arrastra sus esquinas amarillas en el mapa.`
    );
    setTimeout(() => setSavedToast(''), 4000);
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden shadow-sm">
      {/* Barra superior del Editor de Mapas */}
      <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Edit3 className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-black text-base sm:text-lg leading-tight">
              Editor Visual de Bordes y Nombres (Territorios y Manzanas)
            </h2>
            <p className="text-xs text-slate-300">
              Arrastra los puntos amarillos para mover bordes, toca los puntos
              azules (+) para añadir esquinas o cambia cualquier nombre.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleCreateNewTerritory}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo Territorio
          </button>

          <button
            type="button"
            onClick={handleCreateNewBlock}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva Manzana
          </button>

          <button
            type="button"
            onClick={() =>
              setMapStyle(mapStyle === 'satelite' ? 'calles' : 'satelite')
            }
            className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-amber-300" />
            {mapStyle === 'satelite' ? '🗺️ Ver Calles' : '🛰️ Ver Satélite'}
          </button>
        </div>
      </div>

      {savedToast && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs sm:text-sm font-extrabold flex items-center justify-between">
          <span>{savedToast}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Panel lateral izquierdo de propiedades y herramientas (4 columnas) */}
        <form
          onSubmit={handleSaveCurrentChanges}
          className="lg:col-span-4 p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-slate-200 space-y-4 bg-slate-50"
        >
          {/* Qué estamos editando: Territorio vs Manzana */}
          <div className="grid grid-cols-2 gap-2 bg-slate-200/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setEditTargetType('territory')}
              className={`py-2 px-3 rounded-lg font-extrabold text-xs sm:text-sm cursor-pointer transition ${
                editTargetType === 'territory'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🗺️ Editar Territorio
            </button>
            <button
              type="button"
              onClick={() => {
                setEditTargetType('block');
                if (
                  blocksOfSelectedTerritory[0] &&
                  !blocksOfSelectedTerritory.some(
                    (b) => b.id === selectedBlockId
                  )
                ) {
                  setSelectedBlockId(blocksOfSelectedTerritory[0].id);
                }
              }}
              className={`py-2 px-3 rounded-lg font-extrabold text-xs sm:text-sm cursor-pointer transition ${
                editTargetType === 'block'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🧱 Editar Manzana
            </button>
          </div>

          {/* Selector del Territorio */}
          <div>
            <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
              Seleccionar Territorio:
            </label>
            <div className="flex gap-2">
              <select
                value={selectedTerritoryId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedTerritoryId(nextId);
                  const firstBlock = blocks.find(
                    (b) => b.territoryId === nextId
                  );
                  if (firstBlock) setSelectedBlockId(firstBlock.id);
                }}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm"
              >
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (#{t.number})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleFitSelectedOnMap}
                className="px-3 py-2 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-xs cursor-pointer"
                title="Centrar en el mapa"
              >
                <MapPin className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Si está en modo Editar Manzana, selector de la manzana */}
          {editTargetType === 'block' && (
            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                Seleccionar Manzana:
              </label>
              <select
                value={selectedBlockId}
                onChange={(e) => setSelectedBlockId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm"
              >
                {blocksOfSelectedTerritory.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Campos de Nombre y Código/Número */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="text-xs font-black uppercase text-blue-900">
              {editTargetType === 'territory'
                ? 'Nombre y Número del Territorio'
                : 'Código y Nombre de la Manzana'}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {editTargetType === 'territory' ? 'N° Terr.' : 'Código (1A)'}
                </label>
                <input
                  type="text"
                  value={draftCodeOrNumber}
                  onChange={(e) => setDraftCodeOrNumber(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 font-black text-sm text-center"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Nombre Completo:
                </label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-sm"
                />
              </div>
            </div>

            {editTargetType === 'territory' ? (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Tipo de Territorio:
                </label>
                <select
                  value={draftTerritoryType}
                  onChange={(e) =>
                    setDraftTerritoryType(e.target.value as TerritoryType)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                >
                  <option value="urbano">Urbano (Por Manzanas)</option>
                  <option value="rural">Rural (Casas individuales)</option>
                  <option value="mixto">Mixto</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Pertenece al Territorio:
                </label>
                <select
                  value={draftParentTerritoryId}
                  onChange={(e) => setDraftParentTerritoryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                >
                  {territories.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Herramientas de Edición de Esquinas del Borde */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
            <div className="text-xs font-black uppercase text-slate-700">
              Herramienta de Bordes ({draftPolygon.length} esquinas):
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setVertexTool('mover_esquinas')}
                className={`py-2 px-2 rounded-lg font-extrabold text-xs border cursor-pointer ${
                  vertexTool === 'mover_esquinas'
                    ? 'bg-amber-500 text-slate-950 border-amber-600'
                    : 'bg-slate-50 text-slate-700 border-slate-300'
                }`}
              >
                ✋ Mover / +
              </button>
              <button
                type="button"
                onClick={() => setVertexTool('agregar_esquina')}
                className={`py-2 px-2 rounded-lg font-extrabold text-xs border cursor-pointer ${
                  vertexTool === 'agregar_esquina'
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-slate-50 text-slate-700 border-slate-300'
                }`}
              >
                ➕ Tocar y Añadir
              </button>
              <button
                type="button"
                onClick={() => setVertexTool('borrar_esquina')}
                className={`py-2 px-2 rounded-lg font-extrabold text-xs border cursor-pointer ${
                  vertexTool === 'borrar_esquina'
                    ? 'bg-red-600 text-white border-red-700'
                    : 'bg-slate-50 text-slate-700 border-slate-300'
                }`}
              >
                🗑️ Quitar Esquina
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              {vertexTool === 'mover_esquinas' &&
                'Arrastra los círculos amarillos (1, 2, 3...) para mover el borde, o toca los circulitos azules (+) para agregar una esquina intermedia.'}
              {vertexTool === 'agregar_esquina' &&
                'Toca cualquier punto sobre el mapa satelital para añadir una nueva esquina al polígono.'}
              {vertexTool === 'borrar_esquina' &&
                'Toca sobre cualquiera de las esquinas rojas para eliminarla del borde.'}
            </p>
          </div>

          {/* Botones de Guardar y Eliminar */}
          <div className="space-y-2 pt-1">
            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Save className="w-4 h-4" />
              Guardar Cambios de Nombre y Bordes
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (editTargetType === 'territory' && selectedTerritory) {
                    setDraftPolygon(
                      selectedTerritory.polygon.map((pt) => [pt[0], pt[1]])
                    );
                  } else if (editTargetType === 'block' && selectedBlock) {
                    setDraftPolygon(
                      selectedBlock.polygon.map((pt) => [pt[0], pt[1]])
                    );
                  }
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Deshacer
              </button>

              <button
                type="button"
                onClick={() => {
                  if (editTargetType === 'territory' && selectedTerritory) {
                    onDeleteTerritory(selectedTerritory.id);
                    const nextT = territories.find(
                      (t) => t.id !== selectedTerritory.id
                    );
                    if (nextT) setSelectedTerritoryId(nextT.id);
                  } else if (editTargetType === 'block' && selectedBlock) {
                    onDeleteBlock(selectedBlock.id);
                    const nextB = blocks.find((b) => b.id !== selectedBlock.id);
                    if (nextB) setSelectedBlockId(nextB.id);
                  }
                }}
                className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar{' '}
                {editTargetType === 'territory' ? 'Territorio' : 'Manzana'}
              </button>
            </div>
          </div>
        </form>

        {/* Mapa Satelital Grande a la derecha (8 columnas) */}
        <div className="lg:col-span-8 relative">
          <div ref={mapContainerRef} className="h-[68vh] lg:h-[76vh] w-full z-0" />
          <div className="absolute bottom-3 right-3 z-[1000] bg-slate-900/90 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg">
            <Check className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Editando:{' '}
              {editTargetType === 'territory'
                ? draftName
                : `Manzana ${draftCodeOrNumber}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
