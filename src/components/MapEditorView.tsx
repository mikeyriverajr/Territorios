import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertCircle,
  Check,
  Edit3,
  Layers,
  MapPin,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Undo2,
  X,
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clonePolygon(poly: LatLngTuple[]): LatLngTuple[] {
  return poly.map((pt) => [pt[0], pt[1]]);
}

/**
 * Distancia al cuadrado entre un punto P y el segmento AB (corrigiendo escala de longitud por latitud)
 */
function pointToSegmentDistSq(
  p: LatLngTuple,
  a: LatLngTuple,
  b: LatLngTuple
): number {
  const cosLat = Math.cos((p[0] * Math.PI) / 180) || 1;
  const px = p[1] * cosLat;
  const py = p[0];
  const ax = a[1] * cosLat;
  const ay = a[0];
  const bx = b[1] * cosLat;
  const by = b[0];

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return (px - ax) * (px - ax) + (py - ay) * (py - ay);
  }
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)
  );
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

/**
 * Inserta una nueva esquina sobre el lado del polígono más cercano al punto tocado
 */
function insertVertexOnNearestEdge(
  polygon: LatLngTuple[],
  newPt: LatLngTuple
): LatLngTuple[] {
  if (polygon.length < 2) {
    return [...polygon, newPt];
  }
  let bestIdx = polygon.length - 1;
  let bestDistSq = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dSq = pointToSegmentDistSq(newPt, a, b);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = i;
    }
  }
  const next = [...polygon];
  next.splice(bestIdx + 1, 0, newPt);
  return next;
}

/**
 * Genera códigos A..Z, AA..AZ sin colisiones dentro del mismo territorio
 */
function getNextAvailableBlockCode(
  territoryNumber: number,
  existingBlocks: Block[]
): string {
  const usedCodes = new Set(
    existingBlocks.map((b) => b.code.trim().toUpperCase())
  );
  const indexToLetters = (idx: number): string => {
    let n = idx;
    let res = '';
    do {
      res = String.fromCharCode(65 + (n % 26)) + res;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return res;
  };
  for (let i = 0; i < 702; i++) {
    const candidate = `${territoryNumber}${indexToLetters(i)}`;
    if (!usedCodes.has(candidate.toUpperCase())) {
      return candidate;
    }
  }
  return `${territoryNumber}-${existingBlocks.length + 1}`;
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
  const sortedTerritories = useMemo(
    () => [...territories].sort((a, b) => a.number - b.number),
    [territories]
  );

  const [mapStyle, setMapStyle] = useState<'satelite' | 'calles'>('satelite');
  const [editTargetType, setEditTargetType] = useState<'territory' | 'block'>(
    'territory'
  );
  const [territoryFilterQuery, setTerritoryFilterQuery] = useState<string>('');
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>(
    () => sortedTerritories[0]?.id || ''
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string>(() => {
    const firstTerrId = sortedTerritories[0]?.id;
    if (!firstTerrId) return '';
    return (
      blocks
        .filter((b) => b.territoryId === firstTerrId)
        .sort((a, b) =>
          a.code.localeCompare(b.code, undefined, { numeric: true })
        )[0]?.id || ''
    );
  });

  const [vertexTool, setVertexTool] = useState<
    'mover_esquinas' | 'agregar_esquina' | 'borrar_esquina'
  >('mover_esquinas');

  // Borrador activo
  const [draftName, setDraftName] = useState<string>('');
  const [draftCodeOrNumber, setDraftCodeOrNumber] = useState<string>('');
  const [draftParentTerritoryId, setDraftParentTerritoryId] =
    useState<string>('');
  const [draftTerritoryType, setDraftTerritoryType] =
    useState<TerritoryType>('urbano');
  const [draftPolygon, setDraftPolygon] = useState<LatLngTuple[]>([]);
  const [polygonHistory, setPolygonHistory] = useState<LatLngTuple[][]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const [savedToast, setSavedToast] = useState<string>('');
  const [errorToast, setErrorToast] = useState<string>('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const currentTileStyleRef = useRef<'satelite' | 'calles' | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const activePolygonRef = useRef<L.Polygon | null>(null);
  const loadedEntityKeyRef = useRef<string>('');
  const lastFittedKeyRef = useRef<string>('');
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string, isError = false) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    if (isError) {
      setSavedToast('');
      setErrorToast(msg);
    } else {
      setErrorToast('');
      setSavedToast(msg);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setSavedToast('');
      setErrorToast('');
    }, 4000);
  };

  const filteredTerritories = useMemo(() => {
    const q = territoryFilterQuery.trim().toLowerCase();
    if (!q) return sortedTerritories;
    return sortedTerritories.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        String(t.number).includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }, [sortedTerritories, territoryFilterQuery]);

  // Asegurar que selectedTerritoryId siga existiendo
  useEffect(() => {
    if (
      selectedTerritoryId &&
      sortedTerritories.some((t) => t.id === selectedTerritoryId)
    ) {
      return;
    }
    setSelectedTerritoryId(sortedTerritories[0]?.id || '');
  }, [sortedTerritories, selectedTerritoryId]);

  const selectedTerritory = useMemo(
    () => sortedTerritories.find((t) => t.id === selectedTerritoryId) || null,
    [sortedTerritories, selectedTerritoryId]
  );

  const blocksOfSelectedTerritory = useMemo(
    () =>
      blocks
        .filter((b) => b.territoryId === selectedTerritoryId)
        .sort((a, b) =>
          a.code.localeCompare(b.code, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        ),
    [blocks, selectedTerritoryId]
  );

  // Asegurar que selectedBlockId pertenezca SIEMPRE al territorio seleccionado (o '' si no tiene manzanas)
  useEffect(() => {
    if (blocksOfSelectedTerritory.length === 0) {
      if (selectedBlockId !== '') setSelectedBlockId('');
      return;
    }
    if (!blocksOfSelectedTerritory.some((b) => b.id === selectedBlockId)) {
      setSelectedBlockId(blocksOfSelectedTerritory[0].id);
    }
  }, [blocksOfSelectedTerritory, selectedBlockId]);

  const selectedBlock = useMemo(
    () =>
      blocksOfSelectedTerritory.find((b) => b.id === selectedBlockId) || null,
    [blocksOfSelectedTerritory, selectedBlockId]
  );

  const hydrateFromEntity = (
    targetType: 'territory' | 'block',
    territory: Territory | null,
    block: Block | null
  ) => {
    if (targetType === 'territory' && territory) {
      const cloned = clonePolygon(territory.polygon);
      setDraftName(territory.name);
      setDraftCodeOrNumber(String(territory.number));
      setDraftTerritoryType(territory.type);
      setDraftPolygon(cloned);
      setPolygonHistory([cloned]);
      setHistoryIdx(0);
      setIsDirty(false);
    } else if (targetType === 'block' && block) {
      const cloned = clonePolygon(block.polygon);
      setDraftName(block.name);
      setDraftCodeOrNumber(block.code);
      setDraftParentTerritoryId(block.territoryId);
      setDraftPolygon(cloned);
      setPolygonHistory([cloned]);
      setHistoryIdx(0);
      setIsDirty(false);
    } else {
      setDraftName('');
      setDraftCodeOrNumber('');
      setDraftParentTerritoryId(territory?.id || '');
      setDraftPolygon([]);
      setPolygonHistory([]);
      setHistoryIdx(-1);
      setIsDirty(false);
    }
  };

  // Hidratar borrador SOLO cuando cambia la entidad seleccionada (evita que la nube borre cambios sin guardar)
  const activeEntityKey =
    editTargetType === 'territory'
      ? `territory:${selectedTerritory?.id || ''}`
      : `block:${selectedBlock?.id || ''}`;

  useEffect(() => {
    if (loadedEntityKeyRef.current === activeEntityKey) return;
    loadedEntityKeyRef.current = activeEntityKey;
    hydrateFromEntity(editTargetType, selectedTerritory, selectedBlock);
  }, [activeEntityKey, editTargetType, selectedTerritory, selectedBlock]);

  const commitPolygonEdit = (nextPoly: LatLngTuple[]) => {
    const cloned = clonePolygon(nextPoly);
    setDraftPolygon(cloned);
    setPolygonHistory((prev) => {
      const sliced = prev.slice(0, historyIdx + 1);
      const updated = [...sliced, cloned];
      setHistoryIdx(updated.length - 1);
      return updated;
    });
    setIsDirty(true);
  };

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx >= 0 && historyIdx < polygonHistory.length - 1;

  const handleUndoPolygon = () => {
    if (!canUndo) return;
    const nextIdx = historyIdx - 1;
    setHistoryIdx(nextIdx);
    setDraftPolygon(clonePolygon(polygonHistory[nextIdx]));
    setIsDirty(true);
  };

  const handleRedoPolygon = () => {
    if (!canRedo) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    setDraftPolygon(clonePolygon(polygonHistory[nextIdx]));
    setIsDirty(true);
  };

  const handleDiscardChanges = () => {
    hydrateFromEntity(editTargetType, selectedTerritory, selectedBlock);
    setErrorToast('');
    showToast('Cambios descartados.');
  };

  const confirmLeaveDirtyIfNeeded = (): boolean => {
    if (!isDirty) return true;
    return window.confirm(
      'Tienes cambios sin guardar en este elemento. ¿Deseas descartarlos y continuar?'
    );
  };

  // Inicializar Mapa con Satélite por defecto (sin montaje doble) + ResizeObserver
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
    currentTileStyleRef.current = 'satelite';
    layerGroupRef.current = group;

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
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      currentTileStyleRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Alternar entre Satélite y Calles (solo si cambió)
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

  // Ajustar zoom del mapa automáticamente al seleccionar otro territorio o manzana
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastFittedKeyRef.current === activeEntityKey) return;

    const coords =
      editTargetType === 'territory'
        ? selectedTerritory?.polygon
        : selectedBlock?.polygon || selectedTerritory?.polygon;

    if (coords && coords.length >= 2) {
      const bounds = L.latLngBounds(coords);
      if (bounds.isValid()) {
        lastFittedKeyRef.current = activeEntityKey;
        map.invalidateSize();
        map.fitBounds(bounds, {
          padding: [42, 42],
          maxZoom: editTargetType === 'block' ? 17 : 16,
        });
      }
    }
  }, [activeEntityKey, editTargetType, selectedTerritory, selectedBlock]);

  // Cambiar cursor del mapa según herramienta activa
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    el.style.cursor = vertexTool === 'agregar_esquina' ? 'crosshair' : '';
  }, [vertexTool]);

  // Permitir clic en el mapa cuando la herramienta es 'agregar_esquina' (insertando en el borde más cercano)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (vertexTool !== 'agregar_esquina') return;
      if (editTargetType === 'block' && !selectedBlock) return;
      const newPt: LatLngTuple = [
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6)),
      ];
      commitPolygonEdit(insertVertexOnNearestEdge(draftPolygon, newPt));
    };

    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [vertexTool, editTargetType, selectedBlock, draftPolygon, historyIdx]);

  // Dibujar polígonos de referencia + polígono editable con vértices grandes y arrastre en vivo
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;

    group.clearLayers();
    activePolygonRef.current = null;

    // 1. Demás territorios en segundo plano con etiqueta de nombre
    sortedTerritories.forEach((t) => {
      const isCurrentlyEditingThis =
        editTargetType === 'territory' && t.id === selectedTerritoryId;
      if (isCurrentlyEditingThis || t.polygon.length < 3) return;

      const isSelectedParent =
        editTargetType === 'block' && t.id === selectedTerritoryId;

      const poly = L.polygon(t.polygon, {
        color: isSelectedParent ? '#93c5fd' : '#60a5fa',
        weight: isSelectedParent ? 2.5 : 1.8,
        dashArray: '6, 6',
        fillColor: '#3b82f6',
        fillOpacity: isSelectedParent ? 0.06 : 0.04,
      }).addTo(group);

      poly.on('click', () => {
        if (vertexTool !== 'mover_esquinas') return;
        if (!confirmLeaveDirtyIfNeeded()) return;
        setEditTargetType('territory');
        setSelectedTerritoryId(t.id);
      });

      const centroid = getPolygonCentroid(t.polygon);
      const safeTName = escapeHtml(t.name);
      const terrLabel = L.divIcon({
        className: 'custom-readonly-terr-label',
        html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;display:inline-block;background:rgba(15,23,42,0.72);color:#cbd5e1;padding:2px 7px;border-radius:999px;font-weight:800;font-size:10px;border:1px solid rgba(255,255,255,0.35);pointer-events:none;">${safeTName}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(centroid, { icon: terrLabel, interactive: false }).addTo(group);
    });

    // 2. Manzanas del territorio actual en segundo plano
    blocksOfSelectedTerritory.forEach((b) => {
      const isCurrentlyEditingThis =
        editTargetType === 'block' && b.id === selectedBlockId;
      if (isCurrentlyEditingThis || b.polygon.length < 3) return;

      const poly = L.polygon(b.polygon, {
        color: '#34d399',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.14,
      }).addTo(group);

      poly.on('click', (e: L.LeafletMouseEvent) => {
        if (vertexTool !== 'mover_esquinas') return;
        L.DomEvent.stopPropagation(e);
        if (!confirmLeaveDirtyIfNeeded()) return;
        setEditTargetType('block');
        setSelectedBlockId(b.id);
      });

      const centroid = getPolygonCentroid(b.polygon);
      const safeCode = escapeHtml(b.code);
      const label = L.divIcon({
        className: 'custom-block-label',
        html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;display:inline-block;background:rgba(15,23,42,0.85);color:#fff;padding:2px 7px;border-radius:6px;font-weight:800;font-size:11px;border:1px solid rgba(255,255,255,0.5);pointer-events:none;">${safeCode}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(centroid, { icon: label, interactive: false }).addTo(group);
    });

    const isMissingBlockTarget = editTargetType === 'block' && !selectedBlock;
    if (isMissingBlockTarget) return;

    // 3. Polígono activo en edición
    const workingPoly = clonePolygon(draftPolygon);
    if (draftPolygon.length >= 2) {
      activePolygonRef.current = L.polygon(draftPolygon, {
        color: '#facc15',
        weight: 3.5,
        fillColor: '#eab308',
        fillOpacity: 0.28,
        interactive: false,
      }).addTo(group);
    }

    // 4. Vértices grandes y fáciles de arrastrar
    draftPolygon.forEach((pt, idx) => {
      const isDeleteMode = vertexTool === 'borrar_esquina';
      const vertexIcon = L.divIcon({
        className: 'custom-editor-vertex',
        html: `<div style="width:24px;height:24px;border-radius:999px;background:${
          isDeleteMode ? '#dc2626' : '#facc15'
        };border:3px solid #0f172a;box-shadow:0 2px 6px rgba(0,0,0,0.6);cursor:${
          isDeleteMode ? 'pointer' : 'grab'
        };display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:${
          isDeleteMode ? '#fff' : '#0f172a'
        };">${idx + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker(pt, {
        icon: vertexIcon,
        draggable: !isDeleteMode,
      }).addTo(group);

      marker.on('drag', () => {
        const pos = marker.getLatLng();
        workingPoly[idx] = [
          Number(pos.lat.toFixed(6)),
          Number(pos.lng.toFixed(6)),
        ];
        if (activePolygonRef.current) {
          activePolygonRef.current.setLatLngs(workingPoly);
        }
      });

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const nextPoly = draftPolygon.map((item, i) =>
          i === idx
            ? ([
                Number(pos.lat.toFixed(6)),
                Number(pos.lng.toFixed(6)),
              ] as LatLngTuple)
            : item
        );
        commitPolygonEdit(nextPoly);
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (vertexTool === 'borrar_esquina') {
          if (draftPolygon.length <= 3) {
            showToast(
              'Un borde necesita al menos 3 esquinas.',
              true
            );
            return;
          }
          commitPolygonEdit(draftPolygon.filter((_, i) => i !== idx));
        }
      });

      // 5. Punto intermedio "+" más grande entre esquinas consecutivas
      if (draftPolygon.length >= 3 && vertexTool === 'mover_esquinas') {
        const nextIdx = (idx + 1) % draftPolygon.length;
        const nextPt = draftPolygon[nextIdx];
        const midLat = Number(((pt[0] + nextPt[0]) / 2).toFixed(6));
        const midLng = Number(((pt[1] + nextPt[1]) / 2).toFixed(6));

        const midIcon = L.divIcon({
          className: 'custom-editor-midpoint',
          html: `<div title="Tocar para agregar esquina aquí" style="width:20px;height:20px;border-radius:999px;background:#38bdf8;border:2px solid #ffffff;box-shadow:0 1px 5px rgba(0,0,0,0.55);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#0f172a;">+</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const midMarker = L.marker([midLat, midLng], {
          icon: midIcon,
        }).addTo(group);

        midMarker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const copy = [...draftPolygon];
          copy.splice(idx + 1, 0, [midLat, midLng]);
          commitPolygonEdit(copy);
        });
      }
    });
  }, [
    sortedTerritories,
    blocksOfSelectedTerritory,
    editTargetType,
    selectedTerritoryId,
    selectedBlockId,
    selectedBlock,
    draftPolygon,
    vertexTool,
    isDirty,
    historyIdx,
  ]);

  const handleFitSelectedOnMap = () => {
    if (!mapRef.current || draftPolygon.length < 2) return;
    mapRef.current.fitBounds(L.latLngBounds(draftPolygon), {
      padding: [42, 42],
      maxZoom: editTargetType === 'block' ? 17 : 16,
    });
  };

  const handleSaveCurrentChanges = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftPolygon.length < 3) {
      showToast(
        'El polígono debe tener al menos 3 esquinas antes de guardar.',
        true
      );
      return;
    }

    if (editTargetType === 'territory' && selectedTerritory) {
      const parsedNum =
        parseInt(draftCodeOrNumber, 10) || selectedTerritory.number;
      const cleanName = draftName.trim() || `Territorio ${parsedNum}`;
      onSaveTerritory({
        ...selectedTerritory,
        number: parsedNum,
        name: cleanName,
        type: draftTerritoryType,
        polygon: clonePolygon(draftPolygon),
      });
      setIsDirty(false);
      showToast(`✅ Territorio "${cleanName}" guardado correctamente.`);
    } else if (editTargetType === 'block' && selectedBlock) {
      const cleanCode = draftCodeOrNumber.trim().toUpperCase() || '1A';
      const cleanName = draftName.trim() || `Manzana ${cleanCode}`;
      const nextParentId = draftParentTerritoryId || selectedBlock.territoryId;
      onSaveBlock({
        ...selectedBlock,
        code: cleanCode,
        name: cleanName,
        territoryId: nextParentId,
        polygon: clonePolygon(draftPolygon),
      });
      if (nextParentId !== selectedTerritoryId) {
        setSelectedTerritoryId(nextParentId);
      }
      setIsDirty(false);
      showToast(`✅ Manzana "${cleanCode}" guardada correctamente.`);
    }
  };

  const computeScaledSpan = (fraction: number, minDeg: number, maxDeg: number) => {
    const map = mapRef.current;
    if (!map) return (minDeg + maxDeg) / 2;
    const bounds = map.getBounds();
    const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth());
    return Math.max(minDeg, Math.min(maxDeg, (latSpan * fraction) / 2));
  };

  const handleCreateNewTerritory = () => {
    if (!confirmLeaveDirtyIfNeeded()) return;

    const center = mapRef.current
      ? ([
          mapRef.current.getCenter().lat,
          mapRef.current.getCenter().lng,
        ] as LatLngTuple)
      : ([-34.612, -58.443] as LatLngTuple);

    const nextNum =
      sortedTerritories.reduce((max, t) => Math.max(max, t.number), 0) + 1;
    const dLat = computeScaledSpan(0.24, 0.0005, 0.015);
    const dLng = dLat * 1.2;

    const newTerr: Territory = {
      id: `terr-${Date.now()}`,
      number: nextNum,
      name: `Territorio ${nextNum}`,
      type: 'urbano',
      status: 'en_curso',
      polygon: [
        [
          Number((center[0] + dLat).toFixed(6)),
          Number((center[1] - dLng).toFixed(6)),
        ],
        [
          Number((center[0] + dLat).toFixed(6)),
          Number((center[1] + dLng).toFixed(6)),
        ],
        [
          Number((center[0] - dLat).toFixed(6)),
          Number((center[1] + dLng).toFixed(6)),
        ],
        [
          Number((center[0] - dLat).toFixed(6)),
          Number((center[1] - dLng).toFixed(6)),
        ],
      ],
    };

    onCreateTerritory(newTerr);
    setEditTargetType('territory');
    setSelectedTerritoryId(newTerr.id);
    setIsDirty(false);
    showToast(
      `✨ Creado ${newTerr.name}. Arrastra las esquinas amarillas para ajustar el borde.`
    );
  };

  const handleCreateNewBlock = () => {
    const parentTerr = selectedTerritory || sortedTerritories[0];
    if (!parentTerr) {
      showToast('Primero crea un territorio para poder agregar manzanas.', true);
      return;
    }
    if (!confirmLeaveDirtyIfNeeded()) return;

    const center = mapRef.current
      ? ([
          mapRef.current.getCenter().lat,
          mapRef.current.getCenter().lng,
        ] as LatLngTuple)
      : getPolygonCentroid(parentTerr.polygon);

    const existingBlocks = blocks.filter(
      (b) => b.territoryId === parentTerr.id
    );
    const code = getNextAvailableBlockCode(parentTerr.number, existingBlocks);
    const dLat = computeScaledSpan(0.12, 0.00025, 0.006);
    const dLng = dLat * 1.2;

    const newBlk: Block = {
      id: `block-${Date.now()}`,
      territoryId: parentTerr.id,
      code,
      name: `Manzana ${code}`,
      status: 'pendiente',
      polygon: [
        [
          Number((center[0] + dLat).toFixed(6)),
          Number((center[1] - dLng).toFixed(6)),
        ],
        [
          Number((center[0] + dLat).toFixed(6)),
          Number((center[1] + dLng).toFixed(6)),
        ],
        [
          Number((center[0] - dLat).toFixed(6)),
          Number((center[1] + dLng).toFixed(6)),
        ],
        [
          Number((center[0] - dLat).toFixed(6)),
          Number((center[1] - dLng).toFixed(6)),
        ],
      ],
    };

    onCreateBlock(newBlk);
    setSelectedTerritoryId(parentTerr.id);
    setEditTargetType('block');
    setSelectedBlockId(newBlk.id);
    setIsDirty(false);
    showToast(
      `✨ Creada Manzana ${code}. Arrastra las esquinas amarillas en el mapa.`
    );
  };

  const handleDeleteCurrent = () => {
    if (editTargetType === 'territory' && selectedTerritory) {
      const ok = window.confirm(
        `⚠️ ¿Eliminar "${selectedTerritory.name}"?\n\nSe borrarán también todas sus manzanas y casas anotadas. Esta acción no se puede deshacer.`
      );
      if (!ok) return;
      const nextT = sortedTerritories.find(
        (t) => t.id !== selectedTerritory.id
      );
      onDeleteTerritory(selectedTerritory.id);
      setIsDirty(false);
      setSelectedTerritoryId(nextT?.id || '');
      setSelectedBlockId('');
      showToast(`🗑️ Territorio "${selectedTerritory.name}" eliminado.`);
    } else if (editTargetType === 'block' && selectedBlock) {
      const ok = window.confirm(
        `⚠️ ¿Eliminar la Manzana "${selectedBlock.code}"?`
      );
      if (!ok) return;
      const nextB = blocksOfSelectedTerritory.find(
        (b) => b.id !== selectedBlock.id
      );
      onDeleteBlock(selectedBlock.id);
      setIsDirty(false);
      setSelectedBlockId(nextB?.id || '');
      showToast(`🗑️ Manzana "${selectedBlock.code}" eliminada.`);
    }
  };

  const canEditFields =
    editTargetType === 'territory'
      ? Boolean(selectedTerritory)
      : Boolean(selectedBlock);

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden shadow-sm">
      {/* Barra superior del Editor de Mapas */}
      <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Edit3 className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-base sm:text-lg leading-tight">
                Editor Visual de Mapas
              </h2>
              {isDirty && (
                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[11px] uppercase">
                  Cambios sin guardar
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300">
              Arrastra las esquinas amarillas para mover bordes o toca (+) para
              agregar una esquina intermedia.
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
            {mapStyle === 'satelite' ? '🗺️ Calles' : '🛰️ Satélite'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Panel lateral izquierdo */}
        <form
          onSubmit={handleSaveCurrentChanges}
          className="lg:col-span-4 p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-slate-200 space-y-4 bg-slate-50"
        >
          {/* Qué estamos editando */}
          <div className="grid grid-cols-2 gap-2 bg-slate-200/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                if (editTargetType === 'territory') return;
                if (!confirmLeaveDirtyIfNeeded()) return;
                setEditTargetType('territory');
              }}
              className={`py-2 px-3 rounded-lg font-extrabold text-xs sm:text-sm cursor-pointer transition ${
                editTargetType === 'territory'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🗺️ Territorio
            </button>
            <button
              type="button"
              onClick={() => {
                if (editTargetType === 'block') return;
                if (!confirmLeaveDirtyIfNeeded()) return;
                setEditTargetType('block');
              }}
              className={`py-2 px-3 rounded-lg font-extrabold text-xs sm:text-sm cursor-pointer transition ${
                editTargetType === 'block'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🧱 Manzana
            </button>
          </div>

          {/* Buscador + Selector de Territorio */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold uppercase text-slate-600">
              Seleccionar Territorio ({sortedTerritories.length}):
            </label>
            {sortedTerritories.length > 6 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={territoryFilterQuery}
                  onChange={(e) => setTerritoryFilterQuery(e.target.value)}
                  placeholder="Filtrar por número o nombre..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                />
                {territoryFilterQuery && (
                  <button
                    type="button"
                    onClick={() => setTerritoryFilterQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <select
                value={selectedTerritoryId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  if (nextId === selectedTerritoryId) return;
                  if (!confirmLeaveDirtyIfNeeded()) return;
                  setSelectedTerritoryId(nextId);
                  const firstBlock = blocks
                    .filter((b) => b.territoryId === nextId)
                    .sort((a, b) =>
                      a.code.localeCompare(b.code, undefined, { numeric: true })
                    )[0];
                  setSelectedBlockId(firstBlock?.id || '');
                }}
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm"
              >
                {filteredTerritories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (#{t.number})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleFitSelectedOnMap}
                className="px-3 py-2 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-xs cursor-pointer shrink-0"
                title="Centrar en el mapa"
              >
                <MapPin className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Selector de Manzana cuando está en modo Manzana */}
          {editTargetType === 'block' && (
            <div>
              <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                Seleccionar Manzana ({blocksOfSelectedTerritory.length}):
              </label>
              {blocksOfSelectedTerritory.length === 0 ? (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2 text-xs text-amber-950">
                  <div className="font-bold">
                    Este territorio aún no tiene manzanas cargadas.
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateNewBlock}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Crear primera manzana
                  </button>
                </div>
              ) : (
                <select
                  value={selectedBlockId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (nextId === selectedBlockId) return;
                    if (!confirmLeaveDirtyIfNeeded()) return;
                    setSelectedBlockId(nextId);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm"
                >
                  {blocksOfSelectedTerritory.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {canEditFields && (
            <>
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
                      {editTargetType === 'territory' ? 'N° Terr.' : 'Código'}
                    </label>
                    <input
                      type="text"
                      value={draftCodeOrNumber}
                      onChange={(e) => {
                        setDraftCodeOrNumber(e.target.value);
                        setIsDirty(true);
                      }}
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
                      onChange={(e) => {
                        setDraftName(e.target.value);
                        setIsDirty(true);
                      }}
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
                      onChange={(e) => {
                        setDraftTerritoryType(e.target.value as TerritoryType);
                        setIsDirty(true);
                      }}
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
                      onChange={(e) => {
                        setDraftParentTerritoryId(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                    >
                      {sortedTerritories.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Herramientas de Bordes */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase text-slate-700">
                    Bordes ({draftPolygon.length} esquinas)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleUndoPolygon}
                      disabled={!canUndo}
                      title="Deshacer último movimiento de esquina"
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Atrás</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRedoPolygon}
                      disabled={!canRedo}
                      title="Rehacer movimiento"
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setVertexTool('mover_esquinas')}
                    className={`py-2 px-1.5 rounded-lg font-extrabold text-xs border cursor-pointer whitespace-nowrap ${
                      vertexTool === 'mover_esquinas'
                        ? 'bg-amber-500 text-slate-950 border-amber-600'
                        : 'bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                  >
                    ✋ Mover
                  </button>
                  <button
                    type="button"
                    onClick={() => setVertexTool('agregar_esquina')}
                    className={`py-2 px-1.5 rounded-lg font-extrabold text-xs border cursor-pointer whitespace-nowrap ${
                      vertexTool === 'agregar_esquina'
                        ? 'bg-blue-600 text-white border-blue-700'
                        : 'bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                  >
                    ➕ Añadir
                  </button>
                  <button
                    type="button"
                    onClick={() => setVertexTool('borrar_esquina')}
                    className={`py-2 px-1.5 rounded-lg font-extrabold text-xs border cursor-pointer whitespace-nowrap ${
                      vertexTool === 'borrar_esquina'
                        ? 'bg-red-600 text-white border-red-700'
                        : 'bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                  >
                    🗑️ Quitar
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {vertexTool === 'mover_esquinas' &&
                    'Arrastra los círculos amarillos (1, 2, 3...) para mover el borde, o toca los círculos azules (+) para agregar una esquina intermedia.'}
                  {vertexTool === 'agregar_esquina' &&
                    'Toca cualquier punto del mapa para insertar una esquina nueva en el lado más cercano del borde.'}
                  {vertexTool === 'borrar_esquina' &&
                    'Toca sobre cualquier círculo rojo para quitar esa esquina (mínimo 3 esquinas).'}
                </p>
              </div>

              {/* Botones de Guardar, Descartar y Eliminar */}
              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <Save className="w-4 h-4" />
                  Guardar Cambios
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    disabled={!isDirty}
                    className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Descartar
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteCurrent}
                    className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar{' '}
                    {editTargetType === 'territory' ? 'Territorio' : 'Manzana'}
                  </button>
                </div>
              </div>
            </>
          )}
        </form>

        {/* Mapa Satelital Grande a la derecha */}
        <div className="lg:col-span-8 relative">
          <div
            ref={mapContainerRef}
            className="h-[68vh] lg:h-[76vh] w-full z-0 bg-slate-900"
          />

          {/* Barra flotante rápida de herramienta dentro del mapa (cómoda en móvil) */}
          {canEditFields && (
            <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1 bg-slate-900/90 backdrop-blur-xs p-1 rounded-xl border border-white/20 shadow-lg">
              <button
                type="button"
                onClick={() => setVertexTool('mover_esquinas')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer ${
                  vertexTool === 'mover_esquinas'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                Mover
              </button>
              <button
                type="button"
                onClick={() => setVertexTool('agregar_esquina')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer ${
                  vertexTool === 'agregar_esquina'
                    ? 'bg-blue-500 text-white'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                + Añadir
              </button>
              <button
                type="button"
                onClick={() => setVertexTool('borrar_esquina')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer ${
                  vertexTool === 'borrar_esquina'
                    ? 'bg-red-600 text-white'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                Quitar
              </button>
            </div>
          )}

          {/* Toast flotante visible sobre el mapa */}
          {(savedToast || errorToast) && (
            <div
              className={`absolute top-14 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-md z-[1001] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold shadow-xl flex items-center gap-2 ${
                errorToast
                  ? 'bg-red-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {errorToast ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <Check className="w-4 h-4 shrink-0" />
              )}
              <span>{errorToast || savedToast}</span>
            </div>
          )}

          <div className="absolute bottom-3 right-3 z-[1000] bg-slate-900/90 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg">
            <Check className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Editando:{' '}
              {editTargetType === 'territory'
                ? draftName || 'Sin selección'
                : selectedBlock
                ? `Manzana ${draftCodeOrNumber}`
                : 'Sin manzanas'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
