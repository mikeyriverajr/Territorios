import L from 'leaflet';
import { Block, LatLngTuple, Territory } from '../types/territory';

export function clonePolygon(poly: LatLngTuple[]): LatLngTuple[] {
  return poly.map((pt) => [pt[0], pt[1]]);
}

/**
 * Distancia al cuadrado entre un punto P y el segmento AB
 * (corrigiendo escala de longitud por latitud).
 */
export function pointToSegmentDistSq(
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
 * Inserta una nueva esquina sobre el lado del polígono más cercano al punto tocado.
 */
export function insertVertexOnNearestEdge(
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
 * Orden natural para códigos de manzana (1A..1Z antes que 1AA..1AZ,
 * y prefijos/partes numéricas ordenadas numéricamente).
 */
export function compareBlockCodes(a: string, b: string): number {
  const cleanA = a.trim().toUpperCase();
  const cleanB = b.trim().toUpperCase();

  const matchA = cleanA.match(/^(\d+)([A-Z]+)$/);
  const matchB = cleanB.match(/^(\d+)([A-Z]+)$/);

  if (matchA && matchB) {
    const numA = parseInt(matchA[1], 10);
    const numB = parseInt(matchB[1], 10);
    if (numA !== numB) return numA - numB;

    const lettersA = matchA[2];
    const lettersB = matchB[2];
    if (lettersA.length !== lettersB.length) {
      return lettersA.length - lettersB.length;
    }
    return lettersA < lettersB ? -1 : lettersA > lettersB ? 1 : 0;
  }

  return cleanA.localeCompare(cleanB, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Genera códigos A..Z, AA..AZ sin colisiones dentro del mismo territorio.
 */
export function getNextAvailableBlockCode(
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

/**
 * Devuelve el siguiente número de territorio disponible (máximo existente + 1).
 */
export function getNextAvailableTerritoryNumber(
  territories: Territory[]
): number {
  return (
    territories.reduce(
      (max, t) => Math.max(max, Number.isFinite(t.number) ? t.number : 0),
      0
    ) + 1
  );
}

/**
 * Indica si un nombre de territorio coincide con el nombre por defecto "Territorio N" (o está vacío).
 */
export function isDefaultTerritoryName(name: string, number: number): boolean {
  const clean = name.trim().toLowerCase();
  return !clean || clean === `territorio ${number}`;
}

/**
 * Indica si un nombre de manzana coincide con el nombre por defecto "Manzana CODIGO" (o está vacío).
 */
export function isDefaultBlockName(name: string, code: string): boolean {
  const clean = name.trim().toLowerCase();
  return !clean || clean === `manzana ${code.trim().toLowerCase()}`;
}

/**
 * Genera un rectángulo de 4 esquinas en sentido horario alrededor de un centro.
 */
export function createRectangleAround(
  center: LatLngTuple,
  halfLat: number,
  halfLng: number
): LatLngTuple[] {
  const round = (val: number) => Number(val.toFixed(6));
  return [
    [round(center[0] + halfLat), round(center[1] - halfLng)],
    [round(center[0] + halfLat), round(center[1] + halfLng)],
    [round(center[0] - halfLat), round(center[1] + halfLng)],
    [round(center[0] - halfLat), round(center[1] - halfLng)],
  ];
}

/**
 * Busca un vértice candidato dentro de un umbral en píxeles de pantalla para snapping magnético.
 */
export function findSnapVertex(
  map: L.Map,
  targetLatLng: L.LatLng,
  candidates: LatLngTuple[],
  thresholdPx = 14
): LatLngTuple | null {
  if (candidates.length === 0) return null;
  const targetPt = map.latLngToContainerPoint(targetLatLng);
  let bestCandidate: LatLngTuple | null = null;
  let bestDistSq = thresholdPx * thresholdPx;

  for (const cand of candidates) {
    const candPt = map.latLngToContainerPoint(L.latLng(cand[0], cand[1]));
    const dx = targetPt.x - candPt.x;
    const dy = targetPt.y - candPt.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      bestCandidate = cand;
    }
  }

  return bestCandidate;
}

/**
 * Calcula la distancia en píxeles de pantalla entre dos coordenadas geográficas.
 */
export function getScreenDistancePx(
  map: L.Map,
  a: LatLngTuple,
  b: LatLngTuple
): number {
  const ptA = map.latLngToContainerPoint(L.latLng(a[0], a[1]));
  const ptB = map.latLngToContainerPoint(L.latLng(b[0], b[1]));
  const dx = ptA.x - ptB.x;
  const dy = ptA.y - ptB.y;
  return Math.sqrt(dx * dx + dy * dy);
}
