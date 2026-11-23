import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertCircle,
  Check,
  Edit3,
  Home,
  Layers,
  Magnet,
  MapPin,
  Maximize2,
  PenTool,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  Block,
  HousePoint,
  LatLngTuple,
  Territory,
  TerritoryType,
} from '../types/territory';
import { getPolygonCentroid } from '../services/kmlImporter';
import {
  clonePolygon,
  compareBlockCodes,
  createRectangleAround,
  findSnapVertex,
  getNextAvailableBlockCode,
  getNextAvailableTerritoryNumber,
  getScreenDistancePx,
  insertVertexOnNearestEdge,
  isDefaultBlockName,
  isDefaultTerritoryName,
} from '../services/mapGeometry';

export interface MapEditorFocusRequest {
  territoryId?: string;
  action?: 'edit_territory' | 'draw_block' | 'draw_territory';
  nonce: number;
}

interface MapEditorViewProps {
  territories: Territory[];
  blocks: Block[];
  housePoints?: HousePoint[];
  focusRequest?: MapEditorFocusRequest | null;
  onSaveTerritory: (updated: Territory) => void;
  onCreateTerritory: (newTerr: Territory) => void;
  onDeleteTerritory: (territoryId: string) => void;
  onSaveBlock: (updated: Block) => void;
  onCreateBlock: (newBlock: Block) => void;
  onDeleteBlock: (blockId: string) => void;
}

type EditorMode =
  | 'edit_territory'
  | 'edit_block'
  | 'draw_territory'
  | 'draw_block';

type VertexTool = 'mover_esquinas' | 'agregar_esquina' | 'borrar_esquina';

interface PolygonHistory {
  stack: LatLngTuple[][];
  index: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function roundCoord(val: number): number {
  return Number(val.toFixed(6));
}

export const MapEditorView: React.FC<MapEditorViewProps> = ({
  territories,
  blocks,
  housePoints = [],
  focusRequest,
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
  const [mode, setMode] = useState<EditorMode>('edit_territory');
  const [isPlacingPoints, setIsPlacingPoints] = useState<boolean>(false);
  const [vertexTool, setVertexTool] = useState<VertexTool>('mover_esquinas');
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [showHousePoints, setShowHousePoints] = useState<boolean>(false);

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
        .sort((a, b) => compareBlockCodes(a.code, b.code))[0]?.id || ''
    );
  });

  // Borrador activo
  const [draftName, setDraftName] = useState<string>('');
  const [draftCodeOrNumber, setDraftCodeOrNumber] = useState<string>('');
  const [draftDescription, setDraftDescription] = useState<string>('');
  const [draftParentTerritoryId, setDraftParentTerritoryId] =
    useState<string>('');
  const [draftTerritoryType, setDraftTerritoryType] =
    useState<TerritoryType>('urbano');
  const [history, setHistory] = useState<PolygonHistory>({
    stack: [],
    index: -1,
  });
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const [savedToast, setSavedToast] = useState<string>('');
  const [errorToast, setErrorToast] = useState<string>('');

  const draftPolygon = useMemo(
    () => (history.index >= 0 ? history.stack[history.index] ?? [] : []),
    [history]
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const currentTileStyleRef = useRef<'satelite' | 'calles' | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const previewLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const previewLineRef = useRef<L.Polyline | null>(null);
  const snapRingRef = useRef<L.CircleMarker | null>(null);
  const activePolygonRef = useRef<L.Polygon | L.Polyline | null>(null);

  const loadedEntityKeyRef = useRef<string>('');
  const lastFittedKeyRef = useRef<string>('');
  const toastTimerRef = useRef<number | null>(null);
  const handledFocusNonceRef = useRef<number | null>(null);
  const pendingCreatedEntityRef = useRef<{
    type: 'territory' | 'block';
    id: string;
  } | null>(null);
  const recentlyCreatedTerritoryRef = useRef<Territory | null>(null);

  // Refs sincronizados para listeners de Leaflet y atajos de teclado
  const modeRef = useRef<EditorMode>(mode);
  const isPlacingPointsRef = useRef<boolean>(isPlacingPoints);
  const vertexToolRef = useRef<VertexTool>(vertexTool);
  const snapEnabledRef = useRef<boolean>(snapEnabled);
  const altPressedRef = useRef<boolean>(false);
  const draftPolygonRef = useRef<LatLngTuple[]>(draftPolygon);
  const selectedBlockIdRef = useRef<string>(selectedBlockId);
  const isDirtyRef = useRef<boolean>(isDirty);
  const snapTargetsRef = useRef<LatLngTuple[]>([]);

  modeRef.current = mode;
  isPlacingPointsRef.current = isPlacingPoints;
  vertexToolRef.current = vertexTool;
  snapEnabledRef.current = snapEnabled;
  draftPolygonRef.current = draftPolygon;
  selectedBlockIdRef.current = selectedBlockId;
  isDirtyRef.current = isDirty;

  const isDrawingNew = mode === 'draw_territory' || mode === 'draw_block';
  const isEditingBlock = mode === 'edit_block' || mode === 'draw_block';

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
    }, 4500);
  };

  const clearPreviewGraphics = () => {
    const previewGroup = previewLayerGroupRef.current;
    if (previewLineRef.current && previewGroup) {
      previewGroup.removeLayer(previewLineRef.current);
      previewLineRef.current = null;
    }
    if (snapRingRef.current && previewGroup) {
      previewGroup.removeLayer(snapRingRef.current);
      snapRingRef.current = null;
    }
  };

  const updateSnapRing = (pt: LatLngTuple | null) => {
    const previewGroup = previewLayerGroupRef.current;
    if (!previewGroup) return;
    if (!pt) {
      if (snapRingRef.current) {
        previewGroup.removeLayer(snapRingRef.current);
        snapRingRef.current = null;
      }
      return;
    }
    if (snapRingRef.current) {
      snapRingRef.current.setLatLng(pt);
    } else {
      snapRingRef.current = L.circleMarker(pt, {
        radius: 10,
        color: '#22d3ee',
        weight: 3,
        fillColor: '#06b6d4',
        fillOpacity: 0.25,
        interactive: false,
      }).addTo(previewGroup);
    }
  };

  const updatePreviewLine = (cursorPt: LatLngTuple | null) => {
    const previewGroup = previewLayerGroupRef.current;
    const poly = draftPolygonRef.current;
    if (!previewGroup || !cursorPt || !isPlacingPointsRef.current || poly.length === 0) {
      if (previewLineRef.current && previewGroup) {
        previewGroup.removeLayer(previewLineRef.current);
        previewLineRef.current = null;
      }
      return;
    }
    const pts: LatLngTuple[] =
      poly.length >= 2
        ? [poly[poly.length - 1], cursorPt, poly[0]]
        : [poly[poly.length - 1], cursorPt];

    if (previewLineRef.current) {
      previewLineRef.current.setLatLngs(pts);
    } else {
      previewLineRef.current = L.polyline(pts, {
        color: '#fde047',
        weight: 2.5,
        dashArray: '6, 6',
        opacity: 0.9,
        interactive: false,
      }).addTo(previewGroup);
    }
  };

  const blockCountByTerritory = useMemo(() => {
    const counts = new Map<string, number>();
    blocks.forEach((b) => {
      counts.set(b.territoryId, (counts.get(b.territoryId) || 0) + 1);
    });
    return counts;
  }, [blocks]);

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

  // Asegurar que selectedTerritoryId siga existiendo (sin interrumpir creación nueva ni entidad recién creada)
  useEffect(() => {
    if (mode === 'draw_territory') return;
    const pending = pendingCreatedEntityRef.current;
    if (pending?.type === 'territory' && pending.id === selectedTerritoryId) {
      if (sortedTerritories.some((t) => t.id === selectedTerritoryId)) {
        pendingCreatedEntityRef.current = null;
        if (recentlyCreatedTerritoryRef.current?.id === selectedTerritoryId) {
          recentlyCreatedTerritoryRef.current = null;
        }
      }
      return;
    }
    if (
      selectedTerritoryId &&
      sortedTerritories.some((t) => t.id === selectedTerritoryId)
    ) {
      return;
    }
    setSelectedTerritoryId(sortedTerritories[0]?.id || '');
  }, [sortedTerritories, selectedTerritoryId, mode]);

  const selectedTerritory = useMemo(() => {
    const found = sortedTerritories.find((t) => t.id === selectedTerritoryId);
    if (found) return found;
    if (
      recentlyCreatedTerritoryRef.current &&
      recentlyCreatedTerritoryRef.current.id === selectedTerritoryId
    ) {
      return recentlyCreatedTerritoryRef.current;
    }
    return null;
  }, [sortedTerritories, selectedTerritoryId]);

  // Territorio padre activo en pantalla (para listar manzanas y mostrar referencia)
  const activeParentTerritoryId = useMemo(() => {
    if (mode === 'draw_block' || mode === 'edit_block') {
      return draftParentTerritoryId || selectedTerritoryId;
    }
    return selectedTerritoryId;
  }, [mode, draftParentTerritoryId, selectedTerritoryId]);

  const activeParentTerritory = useMemo(() => {
    const found = sortedTerritories.find(
      (t) => t.id === activeParentTerritoryId
    );
    if (found) return found;
    if (
      recentlyCreatedTerritoryRef.current &&
      recentlyCreatedTerritoryRef.current.id === activeParentTerritoryId
    ) {
      return recentlyCreatedTerritoryRef.current;
    }
    return selectedTerritory;
  }, [sortedTerritories, activeParentTerritoryId, selectedTerritory]);

  const blocksOfSelectedTerritory = useMemo(
    () =>
      blocks
        .filter((b) => b.territoryId === selectedTerritoryId)
        .sort((a, b) => compareBlockCodes(a.code, b.code)),
    [blocks, selectedTerritoryId]
  );

  // Asegurar que selectedBlockId pertenezca SIEMPRE al territorio seleccionado
  useEffect(() => {
    if (isDrawingNew) return;
    const pending = pendingCreatedEntityRef.current;
    if (pending?.type === 'block' && pending.id === selectedBlockId) {
      if (blocksOfSelectedTerritory.some((b) => b.id === selectedBlockId)) {
        pendingCreatedEntityRef.current = null;
      }
      return;
    }
    if (blocksOfSelectedTerritory.length === 0) {
      if (selectedBlockId !== '') setSelectedBlockId('');
      return;
    }
    if (!blocksOfSelectedTerritory.some((b) => b.id === selectedBlockId)) {
      setSelectedBlockId(blocksOfSelectedTerritory[0].id);
    }
  }, [blocksOfSelectedTerritory, selectedBlockId, isDrawingNew]);

  const selectedBlock = useMemo(
    () =>
      blocksOfSelectedTerritory.find((b) => b.id === selectedBlockId) || null,
    [blocksOfSelectedTerritory, selectedBlockId]
  );

  // Vértices candidatos para snapping magnético (excluye los del polígono actualmente en edición)
  const snapTargets = useMemo(() => {
    const targets: LatLngTuple[] = [];
    sortedTerritories.forEach((t) => {
      if (mode === 'edit_territory' && t.id === selectedTerritoryId) return;
      t.polygon.forEach((pt) => targets.push(pt));
    });
    blocks.forEach((b) => {
      if (mode === 'edit_block' && b.id === selectedBlockId) return;
      b.polygon.forEach((pt) => targets.push(pt));
    });
    return targets;
  }, [sortedTerritories, blocks, mode, selectedTerritoryId, selectedBlockId]);

  snapTargetsRef.current = snapTargets;

  const hydrateFromEntity = (
    targetMode: 'edit_territory' | 'edit_block',
    territory: Territory | null,
    block: Block | null
  ) => {
    clearPreviewGraphics();
    setIsPlacingPoints(false);
    setVertexTool('mover_esquinas');

    if (targetMode === 'edit_territory' && territory) {
      const cloned = clonePolygon(territory.polygon);
      setDraftName(territory.name);
      setDraftCodeOrNumber(String(territory.number));
      setDraftDescription(territory.description || '');
      setDraftTerritoryType(territory.type);
      setDraftParentTerritoryId(territory.id);
      setHistory({ stack: [cloned], index: 0 });
      setIsDirty(false);
    } else if (targetMode === 'edit_block' && block) {
      const cloned = clonePolygon(block.polygon);
      setDraftName(block.name);
      setDraftCodeOrNumber(block.code);
      setDraftDescription(block.description || '');
      setDraftParentTerritoryId(block.territoryId);
      setHistory({ stack: [cloned], index: 0 });
      setIsDirty(false);
    } else {
      setDraftName('');
      setDraftCodeOrNumber('');
      setDraftDescription('');
      setDraftParentTerritoryId(territory?.id || '');
      setHistory({ stack: [], index: -1 });
      setIsDirty(false);
    }
  };

  // Hidratar borrador SOLO cuando cambia la entidad seleccionada en modo edición
  const activeEntityKey =
    mode === 'edit_territory'
      ? `edit_territory:${selectedTerritory?.id || 'none'}`
      : mode === 'edit_block'
      ? `edit_block:${selectedBlock?.id || 'none'}`
      : mode;

  useEffect(() => {
    if (mode === 'draw_territory' || mode === 'draw_block') return;
    if (loadedEntityKeyRef.current === activeEntityKey) return;
    const pending = pendingCreatedEntityRef.current;
    if (
      (mode === 'edit_territory' &&
        pending?.type === 'territory' &&
        pending.id === selectedTerritoryId) ||
      (mode === 'edit_block' &&
        pending?.type === 'block' &&
        pending.id === selectedBlockId)
    ) {
      return;
    }
    loadedEntityKeyRef.current = activeEntityKey;
    hydrateFromEntity(mode, selectedTerritory, selectedBlock);
  }, [
    activeEntityKey,
    mode,
    selectedTerritory,
    selectedBlock,
    selectedTerritoryId,
    selectedBlockId,
  ]);

  const commitPolygonEdit = (nextPoly: LatLngTuple[]) => {
    const cloned = clonePolygon(nextPoly);
    draftPolygonRef.current = cloned;
    setHistory((prev) => {
      const baseIndex = prev.index >= 0 ? prev.index : -1;
      const sliced = prev.stack.slice(0, baseIndex + 1);
      const updated = [...sliced, cloned];
      return {
        stack: updated,
        index: updated.length - 1,
      };
    });
    setIsDirty(true);
  };

  const canUndo = history.index > 0;
  const canRedo =
    history.index >= 0 && history.index < history.stack.length - 1;

  const handleUndoPolygon = () => {
    if (!canUndo) return;
    const nextIdx = history.index - 1;
    const currentPoly = history.stack[history.index] || [];
    const targetPoly = history.stack[nextIdx] || [];
    draftPolygonRef.current = targetPoly;
    setHistory((prev) =>
      prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev
    );
    // Si el usuario pulsó "Redibujar" y deshizo inmediatamente para volver al polígono previo
    if (
      !isDrawingNew &&
      isPlacingPoints &&
      currentPoly.length === 0 &&
      targetPoly.length >= 3
    ) {
      setIsPlacingPoints(false);
      clearPreviewGraphics();
    }
    setIsDirty(true);
  };

  const handleRedoPolygon = () => {
    if (!canRedo) return;
    const nextIdx = history.index + 1;
    const targetPoly = history.stack[nextIdx] || [];
    draftPolygonRef.current = targetPoly;
    setHistory((prev) =>
      prev.index < prev.stack.length - 1
        ? { ...prev, index: prev.index + 1 }
        : prev
    );
    setIsDirty(true);
  };

  const confirmLeaveDirtyIfNeeded = (): boolean => {
    if (!isDirty && !(isDrawingNew && draftPolygon.length > 0)) return true;
    return window.confirm(
      'Tienes cambios o un dibujo sin guardar. ¿Deseas descartarlos y continuar?'
    );
  };

  const computeScaledSpan = (
    fraction: number,
    minDeg: number,
    maxDeg: number
  ) => {
    const map = mapRef.current;
    if (!map) return (minDeg + maxDeg) / 2;
    const bounds = map.getBounds();
    const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth());
    return Math.max(minDeg, Math.min(maxDeg, (latSpan * fraction) / 2));
  };

  const startDrawTerritory = (skipDirtyConfirm = false) => {
    if (!skipDirtyConfirm && !confirmLeaveDirtyIfNeeded()) return;
    clearPreviewGraphics();
    const nextNum = getNextAvailableTerritoryNumber(sortedTerritories);
    loadedEntityKeyRef.current = 'draw_territory';
    setMode('draw_territory');
    setIsPlacingPoints(true);
    setVertexTool('mover_esquinas');
    setDraftCodeOrNumber(String(nextNum));
    setDraftName(`Territorio ${nextNum}`);
    setDraftDescription('');
    setDraftTerritoryType('urbano');
    setDraftParentTerritoryId('');
    draftPolygonRef.current = [];
    setHistory({ stack: [[]], index: 0 });
    setIsDirty(false);
    showToast(
      `✏️ Toca en el mapa para marcar las esquinas del Territorio ${nextNum}. Toca el punto 1 (verde) o doble clic para cerrar.`
    );
  };

  const startDrawBlock = (
    explicitParent?: Territory | null,
    overrideTerritories?: Territory[],
    overrideBlocksForParent?: Block[],
    options?: {
      skipDirtyConfirm?: boolean;
      useQuickBox?: boolean;
      fitParent?: boolean;
    }
  ) => {
    const terrList = overrideTerritories || sortedTerritories;
    const parentTerr =
      explicitParent ||
      terrList.find((t) => t.id === selectedTerritoryId) ||
      terrList[0];

    if (!parentTerr) {
      showToast('Primero dibuja o selecciona un territorio.', true);
      return;
    }
    if (!options?.skipDirtyConfirm && !confirmLeaveDirtyIfNeeded()) return;

    clearPreviewGraphics();
    const existingBlocks =
      overrideBlocksForParent !== undefined
        ? overrideBlocksForParent
        : blocks.filter((b) => b.territoryId === parentTerr.id);
    const nextCode = getNextAvailableBlockCode(parentTerr.number, existingBlocks);

    loadedEntityKeyRef.current = 'draw_block';
    setSelectedTerritoryId(parentTerr.id);
    setMode('draw_block');
    setVertexTool('mover_esquinas');
    setDraftParentTerritoryId(parentTerr.id);
    setDraftCodeOrNumber(nextCode);
    setDraftName(`Manzana ${nextCode}`);
    setDraftDescription('');

    const map = mapRef.current;
    if (map && parentTerr.polygon.length >= 2) {
      const parentBounds = L.latLngBounds(parentTerr.polygon);
      if (
        parentBounds.isValid() &&
        (options?.fitParent || !map.getBounds().intersects(parentBounds))
      ) {
        map.invalidateSize();
        map.fitBounds(parentBounds, { padding: [42, 42], maxZoom: 17 });
      }
    }

    if (options?.useQuickBox) {
      const center: LatLngTuple =
        parentTerr.polygon.length >= 3
          ? getPolygonCentroid(parentTerr.polygon)
          : map
          ? [map.getCenter().lat, map.getCenter().lng]
          : [-34.612, -58.443];
      const dLat = computeScaledSpan(0.14, 0.00025, 0.004);
      const box = createRectangleAround(center, dLat, dLat * 1.2);
      setIsPlacingPoints(false);
      draftPolygonRef.current = box;
      setHistory({ stack: [box], index: 0 });
      setIsDirty(true);
      showToast(
        `🧱 Caja inicial para Manzana ${nextCode}. Ajusta sus esquinas y pulsa Guardar.`
      );
    } else {
      setIsPlacingPoints(true);
      draftPolygonRef.current = [];
      setHistory({ stack: [[]], index: 0 });
      setIsDirty(false);
      showToast(
        `✏️ Toca las esquinas de la Manzana ${nextCode} dentro de ${parentTerr.name}. Toca el punto 1 (verde) o doble clic para cerrar.`
      );
    }
  };

  const handleCancelDrawing = () => {
    clearPreviewGraphics();
    setIsPlacingPoints(false);
    setIsDirty(false);
    if (mode === 'draw_block') {
      if (selectedBlock) {
        loadedEntityKeyRef.current = '';
        setMode('edit_block');
      } else {
        loadedEntityKeyRef.current = '';
        setMode('edit_territory');
      }
    } else {
      loadedEntityKeyRef.current = '';
      setMode('edit_territory');
    }
    showToast('Dibujo cancelado.');
  };

  const handleInsertQuickBoxWhileDrawing = () => {
    const map = mapRef.current;
    const parent =
      mode === 'draw_block' ? activeParentTerritory : null;
    const center: LatLngTuple =
      parent && parent.polygon.length >= 3 && (!map || !map.getBounds().intersects(L.latLngBounds(parent.polygon)))
        ? getPolygonCentroid(parent.polygon)
        : map
        ? [map.getCenter().lat, map.getCenter().lng]
        : parent && parent.polygon.length >= 3
        ? getPolygonCentroid(parent.polygon)
        : [-34.612, -58.443];
    const dLat =
      mode === 'draw_territory'
        ? computeScaledSpan(0.24, 0.0005, 0.012)
        : computeScaledSpan(0.14, 0.00025, 0.004);
    const box = createRectangleAround(center, dLat, dLat * 1.2);
    clearPreviewGraphics();
    setIsPlacingPoints(false);
    commitPolygonEdit(box);
    showToast(
      '📐 Rectángulo base colocado. Arrastra las esquinas amarillas y pulsa Guardar.'
    );
  };

  const handleStartRedrawExisting = () => {
    clearPreviewGraphics();
    setIsPlacingPoints(true);
    setVertexTool('mover_esquinas');
    commitPolygonEdit([]);
    showToast(
      '🔄 Toca en el mapa para trazar el nuevo borde desde cero. (Pulsa Atrás si quieres recuperar el anterior).'
    );
  };

  // Responder a solicitudes externas desde otras pestañas (ej. Territorios -> "+ Dibujar Manzana")
  useEffect(() => {
    if (!focusRequest || handledFocusNonceRef.current === focusRequest.nonce) {
      return;
    }
    handledFocusNonceRef.current = focusRequest.nonce;

    if (focusRequest.action === 'draw_territory') {
      startDrawTerritory(true);
      return;
    }

    const targetTerr = focusRequest.territoryId
      ? sortedTerritories.find((t) => t.id === focusRequest.territoryId)
      : selectedTerritory || sortedTerritories[0];

    if (focusRequest.action === 'draw_block') {
      if (targetTerr) {
        startDrawBlock(targetTerr, undefined, undefined, {
          skipDirtyConfirm: true,
          fitParent: true,
        });
      }
      return;
    }

    if (targetTerr) {
      loadedEntityKeyRef.current = '';
      lastFittedKeyRef.current = '';
      setMode('edit_territory');
      setIsPlacingPoints(false);
      setSelectedTerritoryId(targetTerr.id);
    }
  }, [focusRequest, sortedTerritories, blocks]);

  // Inicializar Mapa con Satélite por defecto + ResizeObserver + listeners estables
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
    const previewGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    tileLayerRef.current = tile;
    currentTileStyleRef.current = 'satelite';
    layerGroupRef.current = group;
    previewLayerGroupRef.current = previewGroup;

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
      previewLineRef.current = null;
      snapRingRef.current = null;
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      currentTileStyleRef.current = null;
      layerGroupRef.current = null;
      previewLayerGroupRef.current = null;
    };
  }, []);

  // Alternar entre Satélite y Calles
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

  // Ajustar zoom automáticamente al seleccionar otro territorio o manzana en modo edición
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isDrawingNew || isPlacingPoints) return;
    if (lastFittedKeyRef.current === activeEntityKey) return;

    const coords =
      mode === 'edit_territory'
        ? selectedTerritory?.polygon
        : selectedBlock?.polygon || selectedTerritory?.polygon;

    if (coords && coords.length >= 2) {
      const bounds = L.latLngBounds(coords);
      if (bounds.isValid()) {
        lastFittedKeyRef.current = activeEntityKey;
        map.invalidateSize();
        map.fitBounds(bounds, {
          padding: [42, 42],
          maxZoom: mode === 'edit_block' ? 17 : 16,
        });
      }
    }
  }, [
    activeEntityKey,
    mode,
    isDrawingNew,
    isPlacingPoints,
    selectedTerritory,
    selectedBlock,
  ]);

  // Deshabilitar zoom por doble clic mientras trazamos puntos y cambiar cursor
  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      if (isPlacingPoints) {
        map.doubleClickZoom.disable();
      } else {
        map.doubleClickZoom.enable();
      }
    }
    const el = mapContainerRef.current;
    if (el) {
      el.style.cursor =
        isPlacingPoints || vertexTool === 'agregar_esquina' ? 'crosshair' : '';
    }
  }, [isPlacingPoints, vertexTool]);

  // Ref de callbacks de mapa para listeners permanentes
  const mapActionsRef = useRef<{
    onClick: (e: L.LeafletMouseEvent) => void;
    onMouseMove: (e: L.LeafletMouseEvent) => void;
    onDblClick: (e: L.LeafletMouseEvent) => void;
    onMouseOut: () => void;
  }>({
    onClick: () => {},
    onMouseMove: () => {},
    onDblClick: () => {},
    onMouseOut: () => {},
  });

  mapActionsRef.current = {
    onClick: (e: L.LeafletMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      const useSnap = snapEnabledRef.current && !altPressedRef.current;
      const snapped = useSnap
        ? findSnapVertex(map, e.latlng, snapTargetsRef.current, 14)
        : null;
      const newPt: LatLngTuple = snapped || [
        roundCoord(e.latlng.lat),
        roundCoord(e.latlng.lng),
      ];

      if (isPlacingPointsRef.current) {
        const currentPoly = draftPolygonRef.current;
        if (currentPoly.length > 0) {
          const lastPt = currentPoly[currentPoly.length - 1];
          if (getScreenDistancePx(map, lastPt, newPt) < 6) {
            return;
          }
        }
        commitPolygonEdit([...currentPoly, newPt]);
        return;
      }

      if (vertexToolRef.current === 'agregar_esquina') {
        if (modeRef.current === 'edit_block' && !selectedBlockIdRef.current) {
          return;
        }
        commitPolygonEdit(
          insertVertexOnNearestEdge(draftPolygonRef.current, newPt)
        );
      }
    },

    onMouseMove: (e: L.LeafletMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;
      if (!isPlacingPointsRef.current) {
        if (previewLineRef.current && previewLayerGroupRef.current) {
          previewLayerGroupRef.current.removeLayer(previewLineRef.current);
          previewLineRef.current = null;
        }
        return;
      }

      const useSnap = snapEnabledRef.current && !altPressedRef.current;
      const snapped = useSnap
        ? findSnapVertex(map, e.latlng, snapTargetsRef.current, 14)
        : null;
      updateSnapRing(snapped);

      const cursorPt: LatLngTuple = snapped || [e.latlng.lat, e.latlng.lng];
      updatePreviewLine(cursorPt);
    },

    onDblClick: (e: L.LeafletMouseEvent) => {
      if (!isPlacingPointsRef.current) return;
      L.DomEvent.stop(e);
      if (draftPolygonRef.current.length >= 3) {
        clearPreviewGraphics();
        setIsPlacingPoints(false);
        showToast(
          '✅ Borde cerrado. Ajusta cualquier esquina si deseas o pulsa Guardar.'
        );
      }
    },

    onMouseOut: () => {
      if (isPlacingPointsRef.current) {
        clearPreviewGraphics();
      }
    },
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleClick = (e: L.LeafletMouseEvent) =>
      mapActionsRef.current.onClick(e);
    const handleMouseMove = (e: L.LeafletMouseEvent) =>
      mapActionsRef.current.onMouseMove(e);
    const handleDblClick = (e: L.LeafletMouseEvent) =>
      mapActionsRef.current.onDblClick(e);
    const handleMouseOut = () => mapActionsRef.current.onMouseOut();

    map.on('click', handleClick);
    map.on('mousemove', handleMouseMove);
    map.on('dblclick', handleDblClick);
    map.on('mouseout', handleMouseOut);
    return () => {
      map.off('click', handleClick);
      map.off('mousemove', handleMouseMove);
      map.off('dblclick', handleDblClick);
      map.off('mouseout', handleMouseOut);
    };
  }, []);

  // Atajos de teclado (Ctrl+Z, Ctrl+Y, Backspace, Enter, Escape, Alt para pausar imán)
  const keyboardHandlersRef = useRef<{
    undo: () => void;
    redo: () => void;
    closeShape: () => void;
    cancelDraw: () => void;
    setMoveTool: () => void;
  }>({
    undo: () => {},
    redo: () => {},
    closeShape: () => {},
    cancelDraw: () => {},
    setMoveTool: () => {},
  });

  keyboardHandlersRef.current = {
    undo: handleUndoPolygon,
    redo: handleRedoPolygon,
    closeShape: () => {
      clearPreviewGraphics();
      setIsPlacingPoints(false);
      showToast('✅ Borde cerrado. Ajusta cualquier esquina o pulsa Guardar.');
    },
    cancelDraw: handleCancelDrawing,
    setMoveTool: () => setVertexTool('mover_esquinas'),
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altPressedRef.current = true;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          keyboardHandlersRef.current.redo();
        } else {
          keyboardHandlersRef.current.undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        keyboardHandlersRef.current.redo();
        return;
      }
      if (e.key === 'Backspace' && isPlacingPointsRef.current) {
        e.preventDefault();
        keyboardHandlersRef.current.undo();
        return;
      }
      if (
        e.key === 'Enter' &&
        isPlacingPointsRef.current &&
        draftPolygonRef.current.length >= 3
      ) {
        e.preventDefault();
        keyboardHandlersRef.current.closeShape();
        return;
      }
      if (e.key === 'Escape') {
        if (
          modeRef.current === 'draw_territory' ||
          modeRef.current === 'draw_block'
        ) {
          e.preventDefault();
          keyboardHandlersRef.current.cancelDraw();
        } else if (isPlacingPointsRef.current) {
          e.preventDefault();
          keyboardHandlersRef.current.undo();
        } else if (vertexToolRef.current !== 'mover_esquinas') {
          e.preventDefault();
          keyboardHandlersRef.current.setMoveTool();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altPressedRef.current = false;
      }
    };
    const handleBlur = () => {
      altPressedRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Dibujar polígonos de referencia, casas opcionales y polígono activo con vértices/puntos medios
  useEffect(() => {
    const group = layerGroupRef.current;
    const map = mapRef.current;
    if (!group) return;

    group.clearLayers();
    activePolygonRef.current = null;

    // 1. Territorios de referencia en segundo plano
    sortedTerritories.forEach((t) => {
      const isCurrentlyEditingThis =
        mode === 'edit_territory' && t.id === selectedTerritoryId;
      if (isCurrentlyEditingThis || t.polygon.length < 3) return;

      const isSelectedParent =
        (mode === 'edit_block' || mode === 'draw_block') &&
        t.id === activeParentTerritoryId;

      const canClickToSelectTerritory =
        !isPlacingPoints &&
        !isDrawingNew &&
        !isSelectedParent &&
        vertexTool === 'mover_esquinas';

      const poly = L.polygon(t.polygon, {
        color: isSelectedParent ? '#38bdf8' : '#60a5fa',
        weight: isSelectedParent ? 3 : 1.8,
        dashArray: isSelectedParent ? '7, 5' : '6, 6',
        fillColor: isSelectedParent ? '#0ea5e9' : '#3b82f6',
        fillOpacity: isSelectedParent ? 0.06 : 0.04,
        interactive: canClickToSelectTerritory,
      }).addTo(group);

      if (canClickToSelectTerritory) {
        poly.on('click', () => {
          if (!confirmLeaveDirtyIfNeeded()) return;
          setMode('edit_territory');
          setSelectedTerritoryId(t.id);
        });
      }

      const centroid = getPolygonCentroid(t.polygon);
      const safeTName = escapeHtml(t.name);
      const terrLabel = L.divIcon({
        className: 'custom-readonly-terr-label',
        html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;display:inline-block;background:rgba(15,23,42,0.74);color:#cbd5e1;padding:2px 7px;border-radius:999px;font-weight:800;font-size:10px;border:1px solid rgba(255,255,255,0.35);pointer-events:none;">${safeTName}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(centroid, { icon: terrLabel, interactive: false }).addTo(group);
    });

    // 2. Manzanas del territorio actual / padre en segundo plano
    const parentIdForBlocks = activeParentTerritoryId;
    const siblingBlocks = blocks
      .filter((b) => b.territoryId === parentIdForBlocks)
      .sort((a, b) => compareBlockCodes(a.code, b.code));

    siblingBlocks.forEach((b) => {
      const isCurrentlyEditingThis =
        mode === 'edit_block' && b.id === selectedBlockId;
      if (isCurrentlyEditingThis || b.polygon.length < 3) return;

      const canClickToSelectBlock =
        !isPlacingPoints && !isDrawingNew && vertexTool === 'mover_esquinas';

      const poly = L.polygon(b.polygon, {
        color: '#34d399',
        weight: 2.2,
        fillColor: '#10b981',
        fillOpacity: 0.16,
        interactive: canClickToSelectBlock,
      }).addTo(group);

      if (canClickToSelectBlock) {
        poly.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (!confirmLeaveDirtyIfNeeded()) return;
          setMode('edit_block');
          setSelectedBlockId(b.id);
        });
      }

      const centroid = getPolygonCentroid(b.polygon);
      const safeCode = escapeHtml(b.code);
      const label = L.divIcon({
        className: 'custom-block-label',
        html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;display:inline-block;background:rgba(15,23,42,0.86);color:#fff;padding:2px 7px;border-radius:6px;font-weight:800;font-size:11px;border:1px solid rgba(255,255,255,0.55);pointer-events:none;">${safeCode}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(centroid, { icon: label, interactive: false }).addTo(group);
    });

    // 3. Puntos de casas opcionales de solo lectura
    if (showHousePoints && parentIdForBlocks) {
      housePoints
        .filter(
          (hp) =>
            hp.territoryId === parentIdForBlocks &&
            Number.isFinite(hp.lat) &&
            Number.isFinite(hp.lng)
        )
        .forEach((hp) => {
          const color =
            hp.category === 'no_visitar'
              ? '#dc2626'
              : hp.status === 'atendido'
              ? '#16a34a'
              : hp.category === 'casa_rural'
              ? '#2563eb'
              : '#f97316';
          const houseIcon = L.divIcon({
            className: 'custom-editor-house-dot',
            html: `<div style="width:12px;height:12px;border-radius:999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.55);pointer-events:none;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });
          L.marker([hp.lat, hp.lng], {
            icon: houseIcon,
            interactive: false,
          }).addTo(group);
        });
    }

    const isMissingBlockTarget = mode === 'edit_block' && !selectedBlock;
    const isMissingTerrTarget = mode === 'edit_territory' && !selectedTerritory;
    if (isMissingBlockTarget || isMissingTerrTarget) return;

    // 4. Polígono o línea activa en edición/dibujo
    const workingPoly = clonePolygon(draftPolygon);
    if (draftPolygon.length >= 3) {
      activePolygonRef.current = L.polygon(draftPolygon, {
        color: '#facc15',
        weight: 3.5,
        fillColor: '#eab308',
        fillOpacity: isPlacingPoints ? 0.2 : 0.28,
        dashArray: isPlacingPoints ? '6, 4' : undefined,
        interactive: false,
      }).addTo(group);
    } else if (draftPolygon.length === 2) {
      activePolygonRef.current = L.polyline(draftPolygon, {
        color: '#facc15',
        weight: 3.5,
        dashArray: '6, 4',
        interactive: false,
      }).addTo(group);
    }

    const midMarkers: Array<L.Marker | null> = new Array(
      draftPolygon.length
    ).fill(null);

    const refreshAdjacentMidpoints = (cornerIdx: number) => {
      if (workingPoly.length < 3 || midMarkers.length === 0) return;
      const len = workingPoly.length;
      const prevIdx = (cornerIdx - 1 + len) % len;
      const nextIdx = (cornerIdx + 1) % len;

      const midBefore = midMarkers[prevIdx];
      if (midBefore) {
        const a = workingPoly[prevIdx];
        const b = workingPoly[cornerIdx];
        midBefore.setLatLng([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
      const midAfter = midMarkers[cornerIdx];
      if (midAfter) {
        const a = workingPoly[cornerIdx];
        const b = workingPoly[nextIdx];
        midAfter.setLatLng([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
    };

    // 5. Vértices
    draftPolygon.forEach((pt, idx) => {
      const isCloseTarget =
        isPlacingPoints && idx === 0 && draftPolygon.length >= 3;
      const isDeleteMode = !isPlacingPoints && vertexTool === 'borrar_esquina';

      const vertexIcon = isCloseTarget
        ? L.divIcon({
            className: 'custom-editor-vertex',
            html: `<div title="Tocar para cerrar el polígono" style="width:28px;height:28px;border-radius:999px;background:#10b981;border:3px solid #ffffff;box-shadow:0 0 0 4px rgba(16,185,129,0.45),0 2px 8px rgba(0,0,0,0.6);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#ffffff;">✓</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          })
        : L.divIcon({
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
        zIndexOffset: isCloseTarget ? 500 : 100,
      }).addTo(group);

      marker.on('drag', () => {
        const rawPos = marker.getLatLng();
        const useSnap = snapEnabledRef.current && !altPressedRef.current && map;
        const snapped = useSnap
          ? findSnapVertex(map, rawPos, snapTargetsRef.current, 14)
          : null;
        if (snapped) {
          marker.setLatLng(snapped);
          updateSnapRing(snapped);
        } else {
          updateSnapRing(null);
        }
        workingPoly[idx] = snapped || [
          roundCoord(rawPos.lat),
          roundCoord(rawPos.lng),
        ];
        if (activePolygonRef.current) {
          activePolygonRef.current.setLatLngs(workingPoly);
        }
        refreshAdjacentMidpoints(idx);
      });

      marker.on('dragend', () => {
        updateSnapRing(null);
        const rawPos = marker.getLatLng();
        const useSnap = snapEnabledRef.current && !altPressedRef.current && map;
        const snapped = useSnap
          ? findSnapVertex(map, rawPos, snapTargetsRef.current, 14)
          : null;
        const finalPt: LatLngTuple = snapped || [
          roundCoord(rawPos.lat),
          roundCoord(rawPos.lng),
        ];
        const nextPoly = draftPolygon.map((item, i) =>
          i === idx ? finalPt : item
        );
        commitPolygonEdit(nextPoly);
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (isCloseTarget) {
          clearPreviewGraphics();
          setIsPlacingPoints(false);
          showToast(
            '✅ Borde cerrado. Ajusta cualquier esquina si deseas o pulsa Guardar.'
          );
          return;
        }
        if (isPlacingPoints) return;
        if (vertexTool === 'borrar_esquina') {
          if (draftPolygon.length <= 3) {
            showToast('Un borde necesita al menos 3 esquinas.', true);
            return;
          }
          commitPolygonEdit(draftPolygon.filter((_, i) => i !== idx));
        }
      });

      marker.on('contextmenu', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        if (isPlacingPoints) {
          commitPolygonEdit(draftPolygon.filter((_, i) => i !== idx));
          return;
        }
        if (draftPolygon.length <= 3) {
          showToast('Un borde necesita al menos 3 esquinas.', true);
          return;
        }
        commitPolygonEdit(draftPolygon.filter((_, i) => i !== idx));
      });

      // 6. Puntos intermedios (+) arrastrables o tocables para crear esquinas
      if (
        !isPlacingPoints &&
        draftPolygon.length >= 3 &&
        vertexTool === 'mover_esquinas'
      ) {
        const nextIdx = (idx + 1) % draftPolygon.length;
        const nextPt = draftPolygon[nextIdx];
        const midLat = roundCoord((pt[0] + nextPt[0]) / 2);
        const midLng = roundCoord((pt[1] + nextPt[1]) / 2);

        const midIcon = L.divIcon({
          className: 'custom-editor-midpoint',
          html: `<div title="Toca o arrastra para crear esquina aquí" style="width:20px;height:20px;border-radius:999px;background:#38bdf8;border:2px solid #ffffff;box-shadow:0 1px 5px rgba(0,0,0,0.55);cursor:grab;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#0f172a;">+</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const midMarker = L.marker([midLat, midLng], {
          icon: midIcon,
          draggable: true,
        }).addTo(group);
        midMarkers[idx] = midMarker;

        let wasDragged = false;
        let midWorkingPoly: LatLngTuple[] | null = null;

        midMarker.on('dragstart', () => {
          wasDragged = false;
          const pos = midMarker.getLatLng();
          midWorkingPoly = clonePolygon(workingPoly);
          midWorkingPoly.splice(idx + 1, 0, [
            roundCoord(pos.lat),
            roundCoord(pos.lng),
          ]);
        });

        midMarker.on('drag', () => {
          wasDragged = true;
          if (!midWorkingPoly) return;
          const rawPos = midMarker.getLatLng();
          const useSnap =
            snapEnabledRef.current && !altPressedRef.current && map;
          const snapped = useSnap
            ? findSnapVertex(map, rawPos, snapTargetsRef.current, 14)
            : null;
          if (snapped) {
            midMarker.setLatLng(snapped);
            updateSnapRing(snapped);
          } else {
            updateSnapRing(null);
          }
          midWorkingPoly[idx + 1] = snapped || [
            roundCoord(rawPos.lat),
            roundCoord(rawPos.lng),
          ];
          if (activePolygonRef.current) {
            activePolygonRef.current.setLatLngs(midWorkingPoly);
          }
        });

        midMarker.on('dragend', () => {
          updateSnapRing(null);
          if (wasDragged && midWorkingPoly) {
            commitPolygonEdit(midWorkingPoly);
          }
          midWorkingPoly = null;
        });

        midMarker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (wasDragged) {
            wasDragged = false;
            return;
          }
          const copy = clonePolygon(draftPolygon);
          copy.splice(idx + 1, 0, [midLat, midLng]);
          commitPolygonEdit(copy);
        });
      }
    });
  }, [
    sortedTerritories,
    blocks,
    housePoints,
    showHousePoints,
    mode,
    selectedTerritoryId,
    selectedBlockId,
    selectedTerritory,
    selectedBlock,
    activeParentTerritoryId,
    draftPolygon,
    vertexTool,
    isPlacingPoints,
    isDrawingNew,
    isDirty,
    history,
  ]);

  const handleFitSelectedOnMap = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords =
      draftPolygon.length >= 2
        ? draftPolygon
        : activeParentTerritory?.polygon || selectedTerritory?.polygon;
    if (!coords || coords.length < 2) return;
    const bounds = L.latLngBounds(coords);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [42, 42],
        maxZoom: isEditingBlock ? 17 : 16,
      });
    }
  };

  const handleFitAllTerritories = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords = sortedTerritories.flatMap((t) => t.polygon);
    if (coords.length < 2) return;
    const bounds = L.latLngBounds(coords);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    }
  };

  const validateAndBuildSavePayload = ():
    | { kind: 'create_territory'; territory: Territory }
    | { kind: 'update_territory'; territory: Territory }
    | { kind: 'create_block'; block: Block }
    | { kind: 'update_block'; block: Block }
    | null => {
    if (draftPolygon.length < 3) {
      showToast(
        'El polígono debe tener al menos 3 esquinas antes de guardar.',
        true
      );
      return null;
    }

    if (mode === 'draw_territory' || mode === 'edit_territory') {
      const parsedNum = parseInt(draftCodeOrNumber.trim(), 10);
      if (!Number.isFinite(parsedNum) || parsedNum <= 0) {
        showToast(
          'Ingresa un número de territorio válido (mayor a 0).',
          true
        );
        return null;
      }
      const cleanName = draftName.trim() || `Territorio ${parsedNum}`;
      const cleanDesc = draftDescription.trim() || undefined;

      if (mode === 'draw_territory') {
        return {
          kind: 'create_territory',
          territory: {
            id: `terr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            number: parsedNum,
            name: cleanName,
            description: cleanDesc,
            type: draftTerritoryType,
            status: 'en_curso',
            polygon: clonePolygon(draftPolygon),
            startedAt: new Date().toISOString().slice(0, 10),
          },
        };
      }

      if (!selectedTerritory) return null;
      return {
        kind: 'update_territory',
        territory: {
          ...selectedTerritory,
          number: parsedNum,
          name: cleanName,
          description: cleanDesc,
          type: draftTerritoryType,
          polygon: clonePolygon(draftPolygon),
        },
      };
    }

    const cleanCode = draftCodeOrNumber.trim().toUpperCase();
    if (!cleanCode) {
      showToast('Ingresa un código para la manzana (ej. 1A).', true);
      return null;
    }
    const cleanName = draftName.trim() || `Manzana ${cleanCode}`;
    const cleanDesc = draftDescription.trim() || undefined;
    const targetParentId = draftParentTerritoryId || selectedTerritoryId;
    if (!targetParentId) {
      showToast('Selecciona un territorio para esta manzana.', true);
      return null;
    }

    if (mode === 'draw_block') {
      return {
        kind: 'create_block',
        block: {
          id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          territoryId: targetParentId,
          code: cleanCode,
          name: cleanName,
          description: cleanDesc,
          status: 'pendiente',
          polygon: clonePolygon(draftPolygon),
        },
      };
    }

    if (!selectedBlock) return null;
    return {
      kind: 'update_block',
      block: {
        ...selectedBlock,
        code: cleanCode,
        name: cleanName,
        description: cleanDesc,
        territoryId: targetParentId,
        polygon: clonePolygon(draftPolygon),
      },
    };
  };

  const handleSaveCurrentChanges = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const res = validateAndBuildSavePayload();
    if (!res) return;

    clearPreviewGraphics();
    setIsPlacingPoints(false);

    if (res.kind === 'create_territory') {
      onCreateTerritory(res.territory);
      recentlyCreatedTerritoryRef.current = res.territory;
      pendingCreatedEntityRef.current = {
        type: 'territory',
        id: res.territory.id,
      };
      loadedEntityKeyRef.current = `edit_territory:${res.territory.id}`;
      lastFittedKeyRef.current = `edit_territory:${res.territory.id}`;
      setSelectedTerritoryId(res.territory.id);
      setMode('edit_territory');
      setIsDirty(false);
      showToast(`✅ Territorio "${res.territory.name}" creado y guardado.`);
    } else if (res.kind === 'update_territory') {
      onSaveTerritory(res.territory);
      setIsDirty(false);
      showToast(`✅ Territorio "${res.territory.name}" guardado.`);
    } else if (res.kind === 'create_block') {
      onCreateBlock(res.block);
      pendingCreatedEntityRef.current = {
        type: 'block',
        id: res.block.id,
      };
      loadedEntityKeyRef.current = `edit_block:${res.block.id}`;
      lastFittedKeyRef.current = `edit_block:${res.block.id}`;
      setSelectedTerritoryId(res.block.territoryId);
      setSelectedBlockId(res.block.id);
      setMode('edit_block');
      setIsDirty(false);
      showToast(`✅ Manzana "${res.block.code}" creada y guardada.`);
    } else if (res.kind === 'update_block') {
      onSaveBlock(res.block);
      if (res.block.territoryId !== selectedTerritoryId) {
        pendingCreatedEntityRef.current = {
          type: 'block',
          id: res.block.id,
        };
        loadedEntityKeyRef.current = `edit_block:${res.block.id}`;
        lastFittedKeyRef.current = `edit_block:${res.block.id}`;
        setSelectedTerritoryId(res.block.territoryId);
        setSelectedBlockId(res.block.id);
      }
      setIsDirty(false);
      showToast(`✅ Manzana "${res.block.code}" guardada.`);
    }
  };

  const handleSaveTerritoryAndDrawBlocks = () => {
    const res = validateAndBuildSavePayload();
    if (!res || res.kind !== 'create_territory') return;
    onCreateTerritory(res.territory);
    recentlyCreatedTerritoryRef.current = res.territory;
    pendingCreatedEntityRef.current = {
      type: 'territory',
      id: res.territory.id,
    };
    const nextTerrList = [...sortedTerritories, res.territory];
    startDrawBlock(res.territory, nextTerrList, [], {
      skipDirtyConfirm: true,
    });
    showToast(
      `✅ ${res.territory.name} guardado. Toca en el mapa para dibujar la Manzana ${res.territory.number}A.`
    );
  };

  const handleSaveBlockAndDrawAnother = () => {
    const res = validateAndBuildSavePayload();
    if (!res || res.kind !== 'create_block') return;
    onCreateBlock(res.block);

    const parentTerr =
      sortedTerritories.find((t) => t.id === res.block.territoryId) ||
      recentlyCreatedTerritoryRef.current ||
      activeParentTerritory;

    if (!parentTerr) {
      setMode('edit_block');
      setIsPlacingPoints(false);
      setIsDirty(false);
      return;
    }

    const updatedParentBlocks = [
      ...blocks.filter((b) => b.territoryId === parentTerr.id),
      res.block,
    ];
    const nextCode = getNextAvailableBlockCode(
      parentTerr.number,
      updatedParentBlocks
    );
    clearPreviewGraphics();
    setMode('draw_block');
    setIsPlacingPoints(true);
    setVertexTool('mover_esquinas');
    setDraftParentTerritoryId(parentTerr.id);
    setDraftCodeOrNumber(nextCode);
    setDraftName(`Manzana ${nextCode}`);
    setDraftDescription('');
    draftPolygonRef.current = [];
    setHistory({ stack: [[]], index: 0 });
    setIsDirty(false);
    showToast(
      `✅ Manzana "${res.block.code}" guardada. Toca en el mapa para dibujar "${nextCode}".`
    );
  };

  const handleDiscardChanges = () => {
    if (mode === 'draw_territory' || mode === 'draw_block') {
      handleCancelDrawing();
      return;
    }
    hydrateFromEntity(mode, selectedTerritory, selectedBlock);
    setErrorToast('');
    showToast('Cambios descartados.');
  };

  const handleDeleteTerritory = (terr: Territory) => {
    const terrBlocksCount = blocks.filter(
      (b) => b.territoryId === terr.id
    ).length;
    const terrPointsCount = housePoints.filter(
      (hp) => hp.territoryId === terr.id
    ).length;

    const ok = window.confirm(
      `⚠️ ¿Eliminar "${terr.name}"?\n\nSe borrarán ${terrBlocksCount} manzana(s) y ${terrPointsCount} casa(s)/punto(s) asociados, y se retirará de las salidas programadas. Esta acción no se puede deshacer.`
    );
    if (!ok) return;

    const nextT = sortedTerritories.find((t) => t.id !== terr.id);
    onDeleteTerritory(terr.id);
    clearPreviewGraphics();
    setIsPlacingPoints(false);
    setIsDirty(false);
    loadedEntityKeyRef.current = '';
    setMode('edit_territory');
    setSelectedTerritoryId(nextT?.id || '');
    setSelectedBlockId('');
    showToast(`🗑️ Territorio "${terr.name}" eliminado.`);
  };

  const handleDeleteBlock = (blk: Block) => {
    const blkPointsCount = housePoints.filter(
      (hp) => hp.blockId === blk.id
    ).length;
    const preserveNote =
      blkPointsCount > 0
        ? `\n\nLas ${blkPointsCount} dirección(es) anotadas (incluyendo NO VISITAR) se conservarán en el territorio.`
        : '';

    const ok = window.confirm(
      `⚠️ ¿Eliminar la Manzana "${blk.code}" (${blk.name})?${preserveNote}`
    );
    if (!ok) return;

    const remainingSiblings = blocksOfSelectedTerritory.filter(
      (b) => b.id !== blk.id
    );
    onDeleteBlock(blk.id);
    if (mode === 'edit_block' && selectedBlockId === blk.id) {
      clearPreviewGraphics();
      setIsPlacingPoints(false);
      setIsDirty(false);
      loadedEntityKeyRef.current = '';
      if (remainingSiblings.length > 0) {
        setSelectedBlockId(remainingSiblings[0].id);
      } else {
        setSelectedBlockId('');
        setMode('edit_territory');
      }
    }
    showToast(`🗑️ Manzana "${blk.code}" eliminada.`);
  };

  // Advertencias por duplicado en tiempo real
  const duplicateTerritoryMatch = useMemo(() => {
    if (mode !== 'edit_territory' && mode !== 'draw_territory') return null;
    const parsedNum = parseInt(draftCodeOrNumber.trim(), 10);
    if (!Number.isFinite(parsedNum) || parsedNum <= 0) return null;
    return (
      sortedTerritories.find(
        (t) =>
          t.number === parsedNum &&
          (mode === 'draw_territory' || t.id !== selectedTerritoryId)
      ) || null
    );
  }, [mode, draftCodeOrNumber, sortedTerritories, selectedTerritoryId]);

  const duplicateBlockMatch = useMemo(() => {
    if (mode !== 'edit_block' && mode !== 'draw_block') return null;
    const cleanCode = draftCodeOrNumber.trim().toUpperCase();
    if (!cleanCode) return null;
    const targetParentId = draftParentTerritoryId || selectedTerritoryId;
    return (
      blocks.find(
        (b) =>
          b.territoryId === targetParentId &&
          b.code.trim().toUpperCase() === cleanCode &&
          (mode === 'draw_block' || b.id !== selectedBlockId)
      ) || null
    );
  }, [
    mode,
    draftCodeOrNumber,
    draftParentTerritoryId,
    selectedTerritoryId,
    blocks,
    selectedBlockId,
  ]);

  const suggestedCodeForMovedParent = useMemo(() => {
    if (
      mode !== 'edit_block' ||
      !selectedBlock ||
      !draftParentTerritoryId ||
      draftParentTerritoryId === selectedBlock.territoryId
    ) {
      return null;
    }
    const targetParent = sortedTerritories.find(
      (t) => t.id === draftParentTerritoryId
    );
    if (!targetParent) return null;
    const targetBlocks = blocks.filter(
      (b) => b.territoryId === draftParentTerritoryId
    );
    return getNextAvailableBlockCode(targetParent.number, targetBlocks);
  }, [mode, selectedBlock, draftParentTerritoryId, sortedTerritories, blocks]);

  const modeBadge = useMemo(() => {
    switch (mode) {
      case 'draw_territory':
        return {
          label: 'Dibujando Territorio',
          cls: 'bg-blue-500 text-white',
        };
      case 'draw_block':
        return {
          label: 'Dibujando Manzana',
          cls: 'bg-emerald-500 text-white',
        };
      case 'edit_block':
        return {
          label: 'Editando Manzana',
          cls: 'bg-amber-400 text-slate-950',
        };
      default:
        return {
          label: 'Editando Territorio',
          cls: 'bg-sky-400 text-slate-950',
        };
    }
  }, [mode]);

  const showInspectorForm =
    isDrawingNew ||
    (mode === 'edit_territory' && Boolean(selectedTerritory)) ||
    (mode === 'edit_block' && Boolean(selectedBlock));

  const parentTerritoryForStatus =
    activeParentTerritory || selectedTerritory;

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden shadow-sm">
      {/* Barra superior del Editor de Mapas */}
      <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Edit3 className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-base sm:text-lg leading-tight">
                Editor Visual de Mapas
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full font-black text-[11px] uppercase ${modeBadge.cls}`}
              >
                {modeBadge.label}
              </span>
              {isDirty && (
                <span className="px-2 py-0.5 rounded-full bg-amber-300 text-slate-950 font-black text-[11px] uppercase">
                  Sin guardar
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 truncate">
              {isPlacingPoints
                ? 'Toca en el mapa para ir marcando cada esquina; toca el punto 1 (verde) o doble clic para cerrar.'
                : 'Arrastra las esquinas amarillas o los círculos azules (+) para ajustar bordes con precisión.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => startDrawTerritory()}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <PenTool className="w-3.5 h-3.5" />
            + Dibujar Territorio
          </button>

          <button
            type="button"
            disabled={sortedTerritories.length === 0}
            onClick={() =>
              startDrawBlock(selectedTerritory || sortedTerritories[0])
            }
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            + Dibujar Manzana
          </button>

          <button
            type="button"
            onClick={() => setShowHousePoints((v) => !v)}
            title="Mostrar u ocultar pines de casas anotadas como referencia"
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer border ${
              showHousePoints
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>Casas</span>
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
          className="lg:col-span-4 p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-slate-200 space-y-4 bg-slate-50 lg:max-h-[78vh] lg:overflow-y-auto"
        >
          {/* SECCIÓN 1: TERRITORIO ACTIVO */}
          {sortedTerritories.length === 0 && mode !== 'draw_territory' ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-blue-300 p-5 text-center space-y-3">
              <div className="text-sm font-black text-slate-900">
                Aún no hay territorios creados
              </div>
              <p className="text-xs text-slate-600">
                Dibuja el contorno del primer territorio directamente sobre el
                mapa satelital.
              </p>
              <button
                type="button"
                onClick={() => startDrawTerritory()}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <PenTool className="w-4 h-4" />
                + Dibujar Primer Territorio
              </button>
            </div>
          ) : (
            mode !== 'draw_territory' &&
            sortedTerritories.length > 0 && (
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-extrabold uppercase text-slate-600">
                    Territorio ({sortedTerritories.length}):
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleFitSelectedOnMap}
                      className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 cursor-pointer"
                      title="Centrar selección en el mapa"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleFitAllTerritories}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                      title="Ver todos los territorios"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {sortedTerritories.length > 5 && (
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

                <select
                  value={selectedTerritoryId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (nextId === selectedTerritoryId) return;
                    if (!confirmLeaveDirtyIfNeeded()) return;
                    clearPreviewGraphics();
                    setIsPlacingPoints(false);
                    setMode('edit_territory');
                    setSelectedTerritoryId(nextId);
                    const firstBlock = blocks
                      .filter((b) => b.territoryId === nextId)
                      .sort((a, b) => compareBlockCodes(a.code, b.code))[0];
                    setSelectedBlockId(firstBlock?.id || '');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm"
                >
                  {filteredTerritories.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.number} — {t.name} ({blockCountByTerritory.get(t.id) || 0}{' '}
                      mz)
                    </option>
                  ))}
                </select>

                {selectedTerritory && (
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (mode === 'edit_territory') return;
                        if (!confirmLeaveDirtyIfNeeded()) return;
                        clearPreviewGraphics();
                        setIsPlacingPoints(false);
                        setMode('edit_territory');
                      }}
                      className={`py-2 px-2.5 rounded-lg font-extrabold text-xs border cursor-pointer transition text-center ${
                        mode === 'edit_territory'
                          ? 'bg-sky-600 text-white border-sky-700 shadow-2xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      ✏️ Borde territorio
                    </button>
                    <button
                      type="button"
                      onClick={() => startDrawBlock(selectedTerritory)}
                      className="py-2 px-2.5 rounded-lg font-extrabold text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition inline-flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Dibujar manzana
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {/* SECCIÓN 2: MANZANAS DEL TERRITORIO SELECCIONADO (siempre visible) */}
          {mode !== 'draw_territory' && selectedTerritory && (
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase text-slate-700">
                  Manzanas ({blocksOfSelectedTerritory.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => startDrawBlock(selectedTerritory)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    title="Dibujar tocando las esquinas en el mapa"
                  >
                    <PenTool className="w-3 h-3" />
                    + Dibujar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startDrawBlock(selectedTerritory, undefined, undefined, {
                        useQuickBox: true,
                      })
                    }
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    title="Insertar rectángulo rápido de 4 esquinas para ajustar"
                  >
                    <Square className="w-3 h-3" />
                    + Caja
                  </button>
                </div>
              </div>

              {blocksOfSelectedTerritory.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center space-y-2">
                  <div className="text-xs font-bold text-amber-950">
                    Este territorio aún no tiene manzanas.
                  </div>
                  <button
                    type="button"
                    onClick={() => startDrawBlock(selectedTerritory)}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Dibujar primera manzana ({selectedTerritory.number}A)
                  </button>
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                  {blocksOfSelectedTerritory.map((b) => {
                    const isActive =
                      mode === 'edit_block' && b.id === selectedBlockId;
                    const statusDot =
                      b.status === 'completada'
                        ? 'bg-emerald-500'
                        : b.status === 'en_progreso'
                        ? 'bg-amber-500'
                        : 'bg-blue-500';
                    return (
                      <div
                        key={b.id}
                        className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition ${
                          isActive
                            ? 'bg-amber-50 border-amber-400 shadow-2xs'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isActive) return;
                            if (!confirmLeaveDirtyIfNeeded()) return;
                            clearPreviewGraphics();
                            setIsPlacingPoints(false);
                            setMode('edit_block');
                            setSelectedBlockId(b.id);
                          }}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`}
                          />
                          <span className="font-black text-slate-900 shrink-0">
                            {b.code}
                          </span>
                          <span className="text-slate-600 truncate">
                            {b.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                            ({b.polygon.length})
                          </span>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (!isActive && !confirmLeaveDirtyIfNeeded()) {
                                return;
                              }
                              clearPreviewGraphics();
                              setIsPlacingPoints(false);
                              setMode('edit_block');
                              setSelectedBlockId(b.id);
                              if (mapRef.current && b.polygon.length >= 2) {
                                mapRef.current.fitBounds(
                                  L.latLngBounds(b.polygon),
                                  { padding: [42, 42], maxZoom: 18 }
                                );
                              }
                            }}
                            title="Acercar en mapa"
                            className="p-1 rounded-md hover:bg-white text-blue-700 cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBlock(b)}
                            title={`Eliminar manzana ${b.code}`}
                            className="p-1 rounded-md hover:bg-red-100 text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECCIÓN 3: FORMULARIO CONTEXTUAL (DIBUJO O EDICIÓN) */}
          {showInspectorForm && (
            <>
              {isDrawingNew && (
                <div
                  className={`p-3 rounded-xl border-2 text-xs space-y-1.5 ${
                    mode === 'draw_territory'
                      ? 'bg-blue-50 border-blue-300 text-blue-950'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  }`}
                >
                  <div className="font-black flex items-center justify-between gap-2">
                    <span>
                      {mode === 'draw_territory'
                        ? '📐 Dibujando nuevo territorio'
                        : `🧱 Dibujando nueva manzana en ${
                            parentTerritoryForStatus?.name || 'territorio'
                          }`}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/80 font-black text-[11px]">
                      {draftPolygon.length} pt
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {isPlacingPoints
                      ? 'Haz clic o toca en el mapa cada esquina. Al tener 3 o más puntos, toca el círculo verde (1) o haz doble clic para cerrar.'
                      : 'Figura lista: arrastra las esquinas amarillas o los (+) azules para afinarla y luego guarda.'}
                  </p>
                </div>
              )}

              {/* Campos de Nombre, Código/Número y Descripción */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-black uppercase text-blue-900">
                  {isEditingBlock
                    ? 'Datos de la Manzana'
                    : 'Datos del Territorio'}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      {isEditingBlock ? 'Código' : 'N° Terr.'}
                    </label>
                    <input
                      type="text"
                      value={draftCodeOrNumber}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        if (isEditingBlock) {
                          if (isDefaultBlockName(draftName, draftCodeOrNumber)) {
                            const clean = nextVal.trim().toUpperCase();
                            setDraftName(clean ? `Manzana ${clean}` : '');
                          }
                        } else {
                          const prevNum = parseInt(draftCodeOrNumber.trim(), 10);
                          const nextNum = parseInt(nextVal.trim(), 10);
                          if (
                            isDefaultTerritoryName(
                              draftName,
                              Number.isFinite(prevNum) ? prevNum : 0
                            )
                          ) {
                            setDraftName(
                              Number.isFinite(nextNum) && nextNum > 0
                                ? `Territorio ${nextNum}`
                                : ''
                            );
                          }
                        }
                        setDraftCodeOrNumber(nextVal);
                        setIsDirty(true);
                      }}
                      placeholder={isEditingBlock ? '1A' : '1'}
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
                      placeholder={
                        isEditingBlock ? 'Manzana 1A' : 'Territorio 1'
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-sm"
                    />
                  </div>
                </div>

                {duplicateTerritoryMatch && (
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-950">
                    ⚠️ Ya existe otro territorio con el número{' '}
                    {duplicateTerritoryMatch.number} (
                    {duplicateTerritoryMatch.name}).
                  </div>
                )}

                {duplicateBlockMatch && (
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-950">
                    ⚠️ Ya existe otra manzana con el código "
                    {duplicateBlockMatch.code}" en este territorio.
                  </div>
                )}

                {!isEditingBlock ? (
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
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-500">
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
                          #{t.number} — {t.name}
                        </option>
                      ))}
                    </select>
                    {suggestedCodeForMovedParent && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isDefaultBlockName(draftName, draftCodeOrNumber)) {
                            setDraftName(`Manzana ${suggestedCodeForMovedParent}`);
                          }
                          setDraftCodeOrNumber(suggestedCodeForMovedParent);
                          setIsDirty(true);
                        }}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 font-bold text-[11px] cursor-pointer text-left"
                      >
                        ✨ Sugerir código para nuevo territorio →{' '}
                        <strong>{suggestedCodeForMovedParent}</strong>
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Descripción / Referencia (Opcional):
                  </label>
                  <input
                    type="text"
                    value={draftDescription}
                    onChange={(e) => {
                      setDraftDescription(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder={
                      isEditingBlock
                        ? 'Ej. Entre calles Rivadavia y Mitre'
                        : 'Ej. Zona Centro — Manzanas 1A a 1D'
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium"
                  />
                </div>
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
                      onClick={() => setSnapEnabled((s) => !s)}
                      title="Activar/desactivar ajuste magnético a esquinas vecinas (también puedes mantener Alt)"
                      className={`px-2 py-1 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer border ${
                        snapEnabled
                          ? 'bg-cyan-50 text-cyan-900 border-cyan-300'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      <Magnet className="w-3 h-3" />
                      <span>Imán</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUndoPolygon}
                      disabled={!canUndo}
                      title="Deshacer (Ctrl+Z)"
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRedoPolygon}
                      disabled={!canRedo}
                      title="Rehacer (Ctrl+Y)"
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isPlacingPoints ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        disabled={draftPolygon.length < 3}
                        onClick={() => {
                          clearPreviewGraphics();
                          setIsPlacingPoints(false);
                        }}
                        className="py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs cursor-pointer disabled:cursor-not-allowed"
                      >
                        ✓ Terminar trazo
                      </button>
                      <button
                        type="button"
                        onClick={handleInsertQuickBoxWhileDrawing}
                        className="py-2 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs cursor-pointer"
                      >
                        📐 Usar rectángulo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
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

                    <button
                      type="button"
                      onClick={handleStartRedrawExisting}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer"
                    >
                      🔄 Redibujar borde desde cero
                    </button>
                  </div>
                )}

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {isPlacingPoints &&
                    'Toca en el mapa para marcar cada esquina. Backspace deshace el último punto. Enter cierra cuando hay 3+.'}
                  {!isPlacingPoints &&
                    vertexTool === 'mover_esquinas' &&
                    'Arrastra esquinas amarillas, toca o arrastra los (+) azules para crear esquinas, o clic derecho en una esquina para quitarla.'}
                  {!isPlacingPoints &&
                    vertexTool === 'agregar_esquina' &&
                    'Toca cualquier punto del mapa para insertar una esquina nueva en el lado más cercano.'}
                  {!isPlacingPoints &&
                    vertexTool === 'borrar_esquina' &&
                    'Toca sobre cualquier círculo rojo para quitar esa esquina (mínimo 3 esquinas).'}
                </p>
              </div>

              {/* Botones de Acción */}
              {isDrawingNew ? (
                <div className="space-y-2 pt-1">
                  <button
                    type="submit"
                    disabled={draftPolygon.length < 3}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white font-black text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed transition"
                  >
                    <Save className="w-4 h-4" />
                    {mode === 'draw_territory'
                      ? 'Guardar Territorio'
                      : 'Guardar Manzana'}
                  </button>

                  {mode === 'draw_block' && (
                    <button
                      type="button"
                      disabled={draftPolygon.length < 3}
                      onClick={handleSaveBlockAndDrawAnother}
                      className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-45 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition"
                    >
                      <Plus className="w-4 h-4" />
                      Guardar y dibujar otra manzana
                    </button>
                  )}

                  {mode === 'draw_territory' && (
                    <button
                      type="button"
                      disabled={draftPolygon.length < 3}
                      onClick={handleSaveTerritoryAndDrawBlocks}
                      className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-45 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition"
                    >
                      <Plus className="w-4 h-4" />
                      Guardar y dibujar manzanas
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCancelDrawing}
                    className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancelar dibujo
                  </button>
                </div>
              ) : (
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
                      onClick={() => {
                        if (mode === 'edit_territory' && selectedTerritory) {
                          handleDeleteTerritory(selectedTerritory);
                        } else if (mode === 'edit_block' && selectedBlock) {
                          handleDeleteBlock(selectedBlock);
                        }
                      }}
                      className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar{' '}
                      {mode === 'edit_territory' ? 'Territorio' : 'Manzana'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </form>

        {/* Mapa Satelital Grande a la derecha */}
        <div className="lg:col-span-8 relative">
          <div
            ref={mapContainerRef}
            className="h-[68vh] lg:h-[78vh] w-full z-0 bg-slate-900"
          />

          {/* Barra flotante rápida de herramienta dentro del mapa */}
          {showInspectorForm && (
            <div className="absolute top-3 right-3 left-12 sm:left-auto z-[1000] flex flex-wrap items-center justify-end gap-1 bg-slate-900/90 backdrop-blur-xs p-1.5 rounded-xl border border-white/20 shadow-lg">
              {isPlacingPoints ? (
                <>
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={handleUndoPolygon}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold text-white hover:bg-white/10 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    ↩️ Deshacer
                  </button>
                  <button
                    type="button"
                    onClick={() => setSnapEnabled((s) => !s)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer ${
                      snapEnabled
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    🧲 Imán
                  </button>
                  {draftPolygon.length >= 3 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          clearPreviewGraphics();
                          setIsPlacingPoints(false);
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-amber-400 text-slate-950 cursor-pointer"
                      >
                        ✏️ Ajustar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveCurrentChanges()}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-500 text-white cursor-pointer"
                      >
                        ✓ Guardar
                      </button>
                      {mode === 'draw_block' && (
                        <button
                          type="button"
                          onClick={handleSaveBlockAndDrawAnother}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-blue-500 text-white cursor-pointer"
                        >
                          + Otra
                        </button>
                      )}
                    </>
                  )}
                  {isDrawingNew && (
                    <button
                      type="button"
                      onClick={handleCancelDrawing}
                      className="px-2 py-1 rounded-lg text-[11px] font-extrabold text-red-300 hover:bg-red-500/20 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </>
              ) : (
                <>
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
                  <span className="w-px h-4 bg-white/20 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => setSnapEnabled((s) => !s)}
                    title="Imán a esquinas vecinas"
                    className={`px-2 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer ${
                      snapEnabled
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    🧲
                  </button>
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={handleUndoPolygon}
                    title="Deshacer"
                    className="px-1.5 py-1 rounded-lg text-[11px] font-extrabold text-white hover:bg-white/10 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                  >
                    ↩️
                  </button>
                  <button
                    type="button"
                    disabled={!canRedo}
                    onClick={handleRedoPolygon}
                    title="Rehacer"
                    className="px-1.5 py-1 rounded-lg text-[11px] font-extrabold text-white hover:bg-white/10 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                  >
                    ↪️
                  </button>
                  {(isDirty || isDrawingNew) && draftPolygon.length >= 3 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveCurrentChanges()}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-500 hover:bg-emerald-400 text-white cursor-pointer"
                      >
                        💾 Guardar
                      </button>
                      {mode === 'draw_block' && (
                        <button
                          type="button"
                          onClick={handleSaveBlockAndDrawAnother}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-blue-500 hover:bg-blue-400 text-white cursor-pointer"
                        >
                          + Otra
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Navegación rápida abajo a la izquierda */}
          <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleFitSelectedOnMap}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-950 text-white text-xs font-bold shadow-lg border border-white/15 inline-flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-300" />
              <span>Centrar</span>
            </button>
            <button
              type="button"
              onClick={handleFitAllTerritories}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-950 text-white text-xs font-bold shadow-lg border border-white/15 inline-flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 text-sky-300" />
              <span>Ver todos</span>
            </button>
          </div>

          {/* Toast flotante visible sobre el mapa */}
          {(savedToast || errorToast) && (
            <div
              className={`absolute top-16 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-md z-[1001] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold shadow-xl flex items-center gap-2 ${
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

          <div className="absolute bottom-3 right-3 z-[1000] bg-slate-900/90 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg border border-white/15">
            <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              {modeBadge.label}:{' '}
              {isEditingBlock
                ? draftCodeOrNumber
                  ? `Manzana ${draftCodeOrNumber}`
                  : 'Sin código'
                : draftName || 'Sin selección'}{' '}
              ({draftPolygon.length} pts)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
