import JSZip from 'jszip';
import { Block, HousePoint, LatLngTuple, Territory } from '../types/territory';

/**
 * Lee el texto XML de un archivo .kml o descomprime el doc.kml de un archivo .kmz
 */
export async function extractKmlTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.kmz')) {
    const zip = await JSZip.loadAsync(file);
    const kmlFile = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.kml')
    );
    if (!kmlFile) {
      throw new Error('No se encontró ningún archivo .kml dentro del archivo .kmz');
    }
    return await kmlFile.async('string');
  }
  return await file.text();
}

/**
 * Convierte una cadena de coordenadas KML ("lng,lat,alt lng,lat,alt...") en un arreglo de [lat, lng]
 */
export function parseKmlCoordinates(coordText: string): LatLngTuple[] {
  const points: LatLngTuple[] = [];
  const rawTokens = coordText
    .trim()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const token of rawTokens) {
    const parts = token.split(',');
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        points.push([lat, lng]);
      }
    }
  }
  return points;
}

/**
 * Calcula el centroide aproximado [lat, lng] de un polígono
 */
export function getPolygonCentroid(polygon: LatLngTuple[]): LatLngTuple {
  if (polygon.length === 0) return [0, 0];
  let latSum = 0;
  let lngSum = 0;
  for (const [lat, lng] of polygon) {
    latSum += lat;
    lngSum += lng;
  }
  return [latSum / polygon.length, lngSum / polygon.length];
}

/**
 * Algoritmo Ray-Casting para verificar si un punto [lat, lng] cae físicamente dentro de un polígono
 */
export function isPointInPolygon(point: LatLngTuple, polygon: LatLngTuple[]): boolean {
  if (polygon.length < 3) return false;
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersect =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI + 1e-12) + latI;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calcula la distancia en metros entre dos coordenadas GPS (fórmula de Haversine)
 */
export function getDistanceMeters(a: LatLngTuple, b: LatLngTuple): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Extrae el número de territorio de nombres como "Territorio 1", "Territorio 12 (Rural)", "T3", "1"
 */
export function extractTerritoryNumber(name: string): number | null {
  const clean = name.trim();
  // Caso 1: "Territorio 14" o "Terr. 4" o "T-4"
  const matchTerr = clean.match(/(?:territorio|terr\.?|t)[\s\-_#]*(\d+)/i);
  if (matchTerr) {
    return parseInt(matchTerr[1], 10);
  }
  // Caso 2: Empieza con número seguido de fin o espacio, ej. "1" o "1 - Centro"
  const matchNum = clean.match(/^(\d+)(?:\b|\s|$)/);
  if (matchNum) {
    return parseInt(matchNum[1], 10);
  }
  return null;
}

/**
 * Extrae el código limpio de una manzana (ej. "Manzana 1A" -> "1A", "1B" -> "1B")
 * y el número del territorio al que pertenece por código (ej. "1A" -> 1, "12C" -> 12)
 */
export function parseBlockCodeAndTerritoryNumber(rawName: string): {
  code: string;
  territoryNumber: number | null;
} {
  const clean = rawName.trim().replace(/^manzana\s+/i, '').replace(/^mz\.?\s*/i, '').trim();
  const match = clean.match(/^(\d+)\s*[-_]?([A-Za-z0-9]+)?$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const suffix = (match[2] || '').toUpperCase();
    return {
      code: `${num}${suffix}`,
      territoryNumber: num,
    };
  }
  // Si el nombre incluye un patrón como "1A" dentro del texto
  const embedded = clean.match(/\b(\d+[A-Za-z])\b/);
  if (embedded) {
    const code = embedded[1].toUpperCase();
    const numMatch = code.match(/^(\d+)/);
    return {
      code,
      territoryNumber: numMatch ? parseInt(numMatch[1], 10) : null,
    };
  }
  return {
    code: clean.toUpperCase() || 'S/N',
    territoryNumber: null,
  };
}

/**
 * ARCHIVO 1: Importa el archivo KML/KMZ de los Territorios Individuales (Polígonos generales)
 */
export function parseTerritoriesKml(kmlText: string): Territory[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
  const placemarks = Array.from(xmlDoc.getElementsByTagName('Placemark'));
  const territories: Territory[] = [];

  placemarks.forEach((pm, index) => {
    const nameEl = pm.getElementsByTagName('name')[0];
    const descEl = pm.getElementsByTagName('description')[0];
    const rawName = nameEl?.textContent?.trim() || `Territorio ${index + 1}`;
    const rawDesc = descEl?.textContent?.trim() || '';

    const polygons = Array.from(pm.getElementsByTagName('Polygon'));
    if (polygons.length === 0) return;

    const coordsEl = polygons[0].getElementsByTagName('coordinates')[0];
    if (!coordsEl || !coordsEl.textContent) return;

    const polygon = parseKmlCoordinates(coordsEl.textContent);
    if (polygon.length < 3) return;

    const extractedNum = extractTerritoryNumber(rawName);
    const number = extractedNum ?? index + 1;
    const isRuralByName = /rural|campo|quinta/i.test(rawName + ' ' + rawDesc);

    territories.push({
      id: `terr-${number}`,
      number,
      name: rawName.toLowerCase().includes('territorio') ? rawName : `Territorio ${rawName}`,
      description: rawDesc || undefined,
      type: isRuralByName ? 'rural' : 'urbano',
      status: 'en_curso',
      polygon,
      startedAt: new Date().toISOString().slice(0, 10),
    });
  });

  return territories.sort((a, b) => a.number - b.number);
}

/**
 * Encuentra a qué territorio pertenece una manzana o punto de casa usando:
 * 1) Número de territorio explícito en el código de la manzana (ej. "1A" -> Territorio 1) o carpeta KML
 * 2) Punto dentro de Polígono (Ray-Casting geográfico sobre los polígonos del Archivo 1)
 * 3) Polígono más cercano por distancia GPS si quedó justo sobre la calle divisoria
 */
function matchTerritoryForFeature(
  pointOrCentroid: LatLngTuple,
  codeTerritoryNumber: number | null,
  folderTerritoryNumber: number | null,
  territories: Territory[]
): Territory | null {
  if (territories.length === 0) return null;

  // 1. Por código de manzana directo (ej. "1A" -> Territorio 1)
  if (codeTerritoryNumber !== null) {
    const byNum = territories.find((t) => t.number === codeTerritoryNumber);
    if (byNum) return byNum;
  }

  // 2. Por intersección geográfica: ¿dentro de qué polígono de territorio cae el punto/centroide?
  for (const terr of territories) {
    if (isPointInPolygon(pointOrCentroid, terr.polygon)) {
      return terr;
    }
  }

  // 3. Por nombre de la carpeta KML contenedora (ej. <Folder><name>Territorio 3</name>...)
  if (folderTerritoryNumber !== null) {
    const byFolder = territories.find((t) => t.number === folderTerritoryNumber);
    if (byFolder) return byFolder;
  }

  // 4. Respaldo: el territorio cuyo centroide esté más cerca físicamente
  let closest = territories[0];
  let minDistance = Infinity;
  for (const terr of territories) {
    const centroid = getPolygonCentroid(terr.polygon);
    const dist = getDistanceMeters(pointOrCentroid, centroid);
    if (dist < minDistance) {
      minDistance = dist;
      closest = terr;
    }
  }
  return closest;
}

/**
 * ARCHIVO 2: Importa el archivo KML/KMZ de las Manzanas (1A, 1B...) y/o Casas Rurales
 * y las vincula automáticamente con los Territorios del Archivo 1.
 */
export function parseBlocksAndHousesKml(
  kmlText: string,
  territories: Territory[]
): {
  blocks: Block[];
  ruralAndAlertPoints: HousePoint[];
  updatedTerritories: Territory[];
} {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
  const placemarks = Array.from(xmlDoc.getElementsByTagName('Placemark'));

  const blocks: Block[] = [];
  const ruralAndAlertPoints: HousePoint[] = [];

  placemarks.forEach((pm, index) => {
    const nameEl = pm.getElementsByTagName('name')[0];
    const descEl = pm.getElementsByTagName('description')[0];
    const rawName = nameEl?.textContent?.trim() || `Elemento ${index + 1}`;
    const rawDesc = descEl?.textContent?.trim() || '';

    // Verificar si está dentro de un <Folder> con nombre de territorio
    let folderTerritoryNumber: number | null = null;
    let parent = pm.parentElement;
    while (parent) {
      if (parent.tagName.toLowerCase() === 'folder') {
        const folderNameEl = Array.from(parent.children).find(
          (c) => c.tagName.toLowerCase() === 'name'
        );
        if (folderNameEl?.textContent) {
          folderTerritoryNumber = extractTerritoryNumber(folderNameEl.textContent);
          if (folderTerritoryNumber !== null) break;
        }
      }
      parent = parent.parentElement;
    }

    const polygons = Array.from(pm.getElementsByTagName('Polygon'));
    const points = Array.from(pm.getElementsByTagName('Point'));

    // CASO A: Es un polígono -> Es una Manzana (ej. 1A, 1B, 2A...)
    if (polygons.length > 0) {
      const coordsEl = polygons[0].getElementsByTagName('coordinates')[0];
      if (!coordsEl?.textContent) return;
      const polygon = parseKmlCoordinates(coordsEl.textContent);
      if (polygon.length < 3) return;

      const centroid = getPolygonCentroid(polygon);
      const { code, territoryNumber } = parseBlockCodeAndTerritoryNumber(rawName);
      const matchedTerritory = matchTerritoryForFeature(
        centroid,
        territoryNumber,
        folderTerritoryNumber,
        territories
      );

      const territoryId = matchedTerritory ? matchedTerritory.id : 'terr-1';

      blocks.push({
        id: `block-${territoryId}-${code}-${index}`,
        territoryId,
        code,
        name: rawName.toLowerCase().includes('manzana') ? rawName : `Manzana ${code}`,
        description: rawDesc || undefined,
        status: 'pendiente',
        polygon,
      });
      return;
    }

    // CASO B: Es un punto -> Es una Casa Rural mapeada (o alerta de No visitar / Advertencia)
    if (points.length > 0) {
      const coordsEl = points[0].getElementsByTagName('coordinates')[0];
      if (!coordsEl?.textContent) return;
      const parsedPts = parseKmlCoordinates(coordsEl.textContent);
      if (parsedPts.length === 0) return;

      const [lat, lng] = parsedPts[0];
      const matchedTerritory = matchTerritoryForFeature(
        [lat, lng],
        null,
        folderTerritoryNumber,
        territories
      );
      const territoryId = matchedTerritory ? matchedTerritory.id : 'terr-1';

      const combinedText = `${rawName} ${rawDesc}`.toLowerCase();
      const isNoVisitar = combinedText.includes('no visitar') || combinedText.includes('no tocar');

      // También verificar si cae dentro de alguna manzana ya leída
      const matchingBlock = blocks.find(
        (b) => b.territoryId === territoryId && isPointInPolygon([lat, lng], b.polygon)
      );

      const now = new Date().toISOString();
      ruralAndAlertPoints.push({
        id: `pt-imported-${index}-${Date.now()}`,
        territoryId,
        blockId: matchingBlock?.id,
        blockCode: matchingBlock?.code,
        lat,
        lng,
        category: isNoVisitar ? 'no_visitar' : 'casa_rural',
        status: isNoVisitar ? 'permanente' : 'pendiente',
        label: rawName,
        notes: rawDesc || undefined,
        createdAt: now,
        updatedAt: now,
        attempts: [],
      });
    }
  });

  // Ajustar automáticamente el tipo de cada territorio según lo que cayó adentro (urbano, rural o mixto)
  const updatedTerritories = territories.map((t) => {
    const terrBlocks = blocks.filter((b) => b.territoryId === t.id);
    const terrRuralHouses = ruralAndAlertPoints.filter(
      (p) => p.territoryId === t.id && p.category === 'casa_rural'
    );
    let type = t.type;
    if (terrBlocks.length > 0 && terrRuralHouses.length > 0) {
      type = 'mixto';
    } else if (terrRuralHouses.length > 0 && terrBlocks.length === 0) {
      type = 'rural';
    } else if (terrBlocks.length > 0) {
      type = 'urbano';
    }
    return { ...t, type };
  });

  return {
    blocks,
    ruralAndAlertPoints,
    updatedTerritories,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatKmlPolygonCoordinates(polygon: LatLngTuple[]): string {
  if (polygon.length === 0) return '';
  const ring = [...polygon];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
  return ring.map(([lat, lng]) => `${lng},${lat},0`).join(' ');
}

/**
 * Exporta territorios, manzanas y puntos de casas a formato KML 2.2 estándar
 * compatible con Google My Maps y Google Earth.
 */
export function exportMapsToGoogleKml(params: {
  congregationName?: string;
  territories: Territory[];
  blocks: Block[];
  housePoints: HousePoint[];
}): string {
  const { congregationName, territories, blocks, housePoints } = params;
  const docName = congregationName?.trim()
    ? `Territorios - ${congregationName.trim()}`
    : 'Territorios de la Congregación';

  const territoryById = new Map(territories.map((t) => [t.id, t]));

  const territoryPlacemarks = territories
    .filter((t) => t.polygon.length >= 3)
    .map((t) => {
      const descLines = [
        `Tipo: ${t.type}`,
        `Estado: ${t.status === 'completado' ? 'Completado' : 'En curso'}`,
        t.assignedToName ? `Asignado a: ${t.assignedToName}` : null,
        t.assignedAt ? `Fecha asignación: ${t.assignedAt}` : null,
        t.completedAt || t.lastCompletedAt
          ? `Última vez completado: ${t.completedAt || t.lastCompletedAt}`
          : null,
        t.description || null,
      ]
        .filter(Boolean)
        .join('\n');

      return `      <Placemark>
        <name>${escapeXml(t.name)}</name>
        <description>${escapeXml(descLines)}</description>
        <styleUrl>#style-territory</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${formatKmlPolygonCoordinates(t.polygon)}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>`;
    })
    .join('\n');

  const blockPlacemarks = blocks
    .filter((b) => b.polygon.length >= 3)
    .map((b) => {
      const parentName = territoryById.get(b.territoryId)?.name || b.territoryId;
      const doneDate = b.completedAt || b.lastCompletedAt || b.lastWorkedAt;
      const descLines = [
        `Territorio: ${parentName}`,
        `Código: ${b.code}`,
        `Estado: ${b.status}`,
        doneDate ? `Fecha completado/trabajado: ${doneDate}` : null,
        b.lastConductor ? `Conductor: ${b.lastConductor}` : null,
        b.description || null,
      ]
        .filter(Boolean)
        .join('\n');

      const styleUrl =
        b.status === 'completada' ? '#style-block-done' : '#style-block-pending';

      return `      <Placemark>
        <name>${escapeXml(b.name || `Manzana ${b.code}`)}</name>
        <description>${escapeXml(descLines)}</description>
        <styleUrl>${styleUrl}</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${formatKmlPolygonCoordinates(b.polygon)}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>`;
    })
    .join('\n');

  const pointPlacemarks = housePoints
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => {
      const parentName = territoryById.get(p.territoryId)?.name || p.territoryId;
      const categoryLabel =
        p.category === 'no_visitar'
          ? 'NO VISITAR'
          : p.category === 'casa_rural'
          ? 'Casa Rural'
          : 'No en casa';
      const titlePrefix = p.shortCode ? `[${p.shortCode}] ` : '';
      const descLines = [
        `Territorio: ${parentName}`,
        p.blockCode ? `Manzana: ${p.blockCode}` : null,
        `Categoría: ${categoryLabel}`,
        `Estado: ${p.status}`,
        p.notes ? `Notas: ${p.notes}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const styleUrl =
        p.category === 'no_visitar'
          ? '#style-point-novisitar'
          : p.status === 'atendido'
          ? '#style-point-done'
          : p.category === 'casa_rural'
          ? '#style-point-rural'
          : '#style-point-notathome';

      return `      <Placemark>
        <name>${escapeXml(`${titlePrefix}${p.label}`)}</name>
        <description>${escapeXml(descLines)}</description>
        <styleUrl>${styleUrl}</styleUrl>
        <Point>
          <coordinates>${p.lng},${p.lat},0</coordinates>
        </Point>
      </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(docName)}</name>
    <description>${escapeXml('Exportado para Google My Maps / Google Earth')}</description>
    <Style id="style-territory">
      <LineStyle>
        <color>ff8a3a1e</color>
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>1f3b82f6</color>
      </PolyStyle>
    </Style>
    <Style id="style-block-pending">
      <LineStyle>
        <color>ffeb6325</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>33f6823b</color>
      </PolyStyle>
    </Style>
    <Style id="style-block-done">
      <LineStyle>
        <color>ff699605</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>4481b910</color>
      </PolyStyle>
    </Style>
    <Style id="style-point-notathome">
      <IconStyle>
        <color>ff1673f9</color>
      </IconStyle>
    </Style>
    <Style id="style-point-novisitar">
      <IconStyle>
        <color>ff2626dc</color>
      </IconStyle>
    </Style>
    <Style id="style-point-rural">
      <IconStyle>
        <color>ffeb6325</color>
      </IconStyle>
    </Style>
    <Style id="style-point-done">
      <IconStyle>
        <color>ff4aa316</color>
      </IconStyle>
    </Style>
    <Folder>
      <name>Territorios</name>
${territoryPlacemarks}
    </Folder>
    <Folder>
      <name>Manzanas</name>
${blockPlacemarks}
    </Folder>
    <Folder>
      <name>Casas y Puntos</name>
${pointPlacemarks}
    </Folder>
  </Document>
</kml>`;
}

export function downloadKmlFile(kmlText: string, fileName: string): void {
  const blob = new Blob([kmlText], {
    type: 'application/vnd.google-earth.kml+xml;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.toLowerCase().endsWith('.kml')
    ? fileName
    : `${fileName}.kml`;
  a.click();
  URL.revokeObjectURL(url);
}
