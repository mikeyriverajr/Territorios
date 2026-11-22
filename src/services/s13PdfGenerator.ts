import { AppDatabase, S13Record, Territory } from '../types/territory';
import { getFirstAssigneeName, getTerritoryAssignees } from './storageAndSync';

interface S13Cycle {
  assignedTo: string;
  startedAt: string;
  completedAt: string;
}

interface S13TableRow {
  territoryNumber: string;
  lastCompletedDate: string;
  cycles: S13Cycle[];
}

export function getCurrentServiceYear(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = enero, 8 = septiembre
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function getAvailableServiceYears(db: AppDatabase): string[] {
  const years = new Set<string>([getCurrentServiceYear()]);
  const addDateYear = (iso?: string) => {
    if (!iso || iso.length < 7) return;
    const [yStr, mStr] = iso.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return;
    years.add(m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`);
  };

  db.s13History.forEach((r) => {
    addDateYear(r.completedAt);
    addDateYear(r.startedAt);
  });
  db.territories.forEach((t) => {
    addDateYear(t.startedAt);
    addDateYear(t.completedAt);
    addDateYear(t.lastCompletedAt);
    getTerritoryAssignees(t).forEach((a) => addDateYear(a.assignedAt));
  });

  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

function parseServiceYearRange(
  serviceYear: string
): { start: string; end: string } | null {
  const clean = serviceYear.trim();
  if (!clean || clean.toLowerCase() === 'todos') return null;
  const match = clean.match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  if (match) {
    return {
      start: `${match[1]}-09-01`,
      end: `${match[2]}-08-31`,
    };
  }
  const singleYear = clean.match(/^(\d{4})$/);
  if (singleYear) {
    const y = Number(singleYear[1]);
    return {
      start: `${y - 1}-09-01`,
      end: `${y}-08-31`,
    };
  }
  return null;
}

function formatDateShort(iso?: string): string {
  if (!iso) return '';
  const clean = iso.trim().slice(0, 10);
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return clean;
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

// Codifica texto Unicode a cadena literal PDF con WinAnsiEncoding (ASCII 7-bit + escapes octales)
function encodePdfWinAnsi(text: string): string {
  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...');

  let out = '(';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code === 40 || code === 41 || code === 92) {
      out += '\\' + normalized[i];
    } else if (code >= 32 && code <= 126) {
      out += normalized[i];
    } else if (code >= 160 && code <= 255) {
      out += '\\' + code.toString(8).padStart(3, '0');
    }
    // Ignorar emojis u otros símbolos fuera de WinAnsi
  }
  out += ')';
  return out;
}

function estimateTextWidth(
  text: string,
  fontSize: number,
  bold: boolean
): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ('ilI1.,:;/\'|!¡ '.includes(ch)) {
      units += 0.3;
    } else if ('MWm@'.includes(ch)) {
      units += 0.82;
    } else if (ch >= 'A' && ch <= 'Z') {
      units += 0.67;
    } else if ('023456789'.includes(ch)) {
      units += 0.56;
    } else {
      units += 0.52;
    }
  }
  return units * fontSize * (bold ? 1.05 : 1);
}

function fitTextToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  bold: boolean
): string {
  const clean = text.trim();
  if (!clean) return '';
  if (estimateTextWidth(clean, fontSize, bold) <= maxWidth) return clean;
  let cut = clean;
  while (
    cut.length > 1 &&
    estimateTextWidth(cut + '...', fontSize, bold) > maxWidth
  ) {
    cut = cut.slice(0, -1);
  }
  return cut.trimEnd() + '...';
}

function buildTerritoryRows(
  db: AppDatabase,
  serviceYear: string
): S13TableRow[] {
  const range = parseServiceYearRange(serviceYear);
  const sortedTerritories = [...db.territories].sort(
    (a, b) => a.number - b.number
  );

  // Agrupar historial por territoryId
  const historyByTerritory = new Map<string, S13Record[]>();
  db.s13History.forEach((rec) => {
    const list = historyByTerritory.get(rec.territoryId) || [];
    list.push(rec);
    historyByTerritory.set(rec.territoryId, list);
  });

  const pagesRows: S13TableRow[][] = [];
  // Primero armamos la secuencia completa por territorio y luego paginamos bloques de 4 ciclos
  const territorySeries: Array<{
    territory: Territory;
    initialLastCompleted: string;
    cycles: S13Cycle[];
  }> = sortedTerritories.map((t) => {
    const recs = [...(historyByTerritory.get(t.id) || [])].sort((a, b) => {
      const cmpStart = (a.startedAt || '').localeCompare(b.startedAt || '');
      if (cmpStart !== 0) return cmpStart;
      return (a.completedAt || '').localeCompare(b.completedAt || '');
    });

    let initialLastCompleted = '';
    let filteredRecs = recs;

    if (range) {
      const beforeDates = recs
        .map((r) => r.completedAt)
        .filter((d) => Boolean(d) && d < range.start);
      if (t.lastCompletedAt && t.lastCompletedAt < range.start) {
        beforeDates.push(t.lastCompletedAt);
      }
      if (beforeDates.length > 0) {
        initialLastCompleted = beforeDates.sort((a, b) =>
          b.localeCompare(a)
        )[0];
      }

      filteredRecs = recs.filter((r) => {
        const compInRange =
          Boolean(r.completedAt) &&
          r.completedAt >= range.start &&
          r.completedAt <= range.end;
        const startInRange =
          Boolean(r.startedAt) &&
          r.startedAt >= range.start &&
          r.startedAt <= range.end;
        return compInRange || (!r.completedAt && startInRange);
      });
    } else if (recs.length === 0 && t.lastCompletedAt) {
      initialLastCompleted = t.lastCompletedAt;
    }

    const cycles: S13Cycle[] = filteredRecs.map((r) => ({
      assignedTo: r.assignedTo || '',
      startedAt: r.startedAt || '',
      completedAt: r.completedAt || '',
    }));

    const assignees = getTerritoryAssignees(t);
    if (assignees.length > 0 && t.status !== 'completado') {
      const startDate = assignees[0].assignedAt || t.startedAt || '';
      const includeActive =
        !range ||
        !startDate ||
        (startDate >= range.start && startDate <= range.end);
      if (includeActive) {
        cycles.push({
          assignedTo: getFirstAssigneeName(t),
          startedAt: startDate,
          completedAt: '',
        });
      }
    }

    return {
      territory: t,
      initialLastCompleted,
      cycles,
    };
  });

  // Organizar en páginas de 20 filas; si un territorio tiene más de 4 ciclos, crear páginas de continuación
  const ROWS_PER_PAGE = 20;
  for (let start = 0; start < territorySeries.length; start += ROWS_PER_PAGE) {
    const slice = territorySeries.slice(start, start + ROWS_PER_PAGE);
    const maxCycles = Math.max(
      4,
      ...slice.map((item) => item.cycles.length || 0)
    );
    const cyclePages = Math.ceil(maxCycles / 4);

    for (let cp = 0; cp < cyclePages; cp++) {
      const pageRows: S13TableRow[] = slice
        .filter((item) => cp === 0 || item.cycles.length > cp * 4)
        .map((item) => {
          const prevCycle = cp > 0 ? item.cycles[cp * 4 - 1] : null;
          const lastCompleted =
            cp === 0
              ? item.initialLastCompleted
              : prevCycle?.completedAt || item.initialLastCompleted;
          return {
            territoryNumber: String(item.territory.number),
            lastCompletedDate: formatDateShort(lastCompleted),
            cycles: item.cycles.slice(cp * 4, cp * 4 + 4),
          };
        });
      pagesRows.push(pageRows);
    }
  }

  if (pagesRows.length === 0) {
    pagesRows.push([]);
  }

  return pagesRows.flatMap((page) => {
    const padded = [...page];
    while (padded.length < ROWS_PER_PAGE) {
      padded.push({
        territoryNumber: '',
        lastCompletedDate: '',
        cycles: [],
      });
    }
    return padded;
  });
}

function renderS13PageStream(
  rows: S13TableRow[],
  serviceYearLabel: string
): string {
  const cmds: string[] = [];

  const drawText = (
    text: string,
    x: number,
    y: number,
    fontSize: number,
    bold = false
  ) => {
    if (!text) return;
    cmds.push(
      `BT /${bold ? 'F2' : 'F1'} ${fontSize.toFixed(1)} Tf ${x.toFixed(
        2
      )} ${y.toFixed(2)} Td ${encodePdfWinAnsi(text)} Tj ET`
    );
  };

  const drawCenteredText = (
    text: string,
    xLeft: number,
    width: number,
    y: number,
    fontSize: number,
    bold = false
  ) => {
    if (!text) return;
    const fitted = fitTextToWidth(text, width - 4, fontSize, bold);
    const w = estimateTextWidth(fitted, fontSize, bold);
    const x = xLeft + Math.max(2, (width - w) / 2);
    drawText(fitted, x, y, fontSize, bold);
  };

  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineWidth: number
  ) => {
    cmds.push(
      `${lineWidth.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(
        2
      )} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  };

  // Título centrado (igual al S-13-S 1/22)
  drawCenteredText(
    'REGISTRO DE ASIGNACIÓN DE TERRITORIO',
    36,
    540,
    736,
    14,
    true
  );

  // Año de servicio
  drawText('Año de servicio:', 36, 711, 10.5, true);
  drawLine(134, 709, 276, 709, 0.9);
  if (serviceYearLabel) {
    drawCenteredText(serviceYearLabel, 134, 142, 712, 10, false);
  }

  // Coordenadas de la tabla (20 filas, 4 bloques de asignación)
  const xStart = 36;
  const col1W = 38; // Núm. de terr.
  const col2W = 66; // Última fecha en que se completó*
  const blockW = 109; // Asignado a (4 * 109 = 436)
  const subDateW = blockW / 2; // 54.5
  const totalW = col1W + col2W + 4 * blockW; // 540
  const xEnd = xStart + totalW; // 576

  const yTop = 696;
  const headerH = 38;
  const yHeaderMid = yTop - 15; // 681
  const yHeaderBottom = yTop - headerH; // 658
  const rowH = 30;
  const rowSubH = 15;
  const rowsCount = 20;
  const yBottom = yHeaderBottom - rowsCount * rowH; // 58

  // Fondo gris del encabezado
  cmds.push('0.85 g');
  cmds.push(
    `${xStart.toFixed(2)} ${yHeaderBottom.toFixed(2)} ${totalW.toFixed(
      2
    )} ${headerH.toFixed(2)} re f`
  );
  cmds.push('0 g 0 G');

  // Textos del encabezado
  drawCenteredText('Núm.', xStart, col1W, yTop - 17, 7.8, true);
  drawCenteredText('de terr.', xStart, col1W, yTop - 27, 7.8, true);

  const col2X = xStart + col1W;
  drawCenteredText('Última fecha', col2X, col2W, yTop - 12, 7.6, true);
  drawCenteredText('en que se', col2X, col2W, yTop - 21.5, 7.6, true);
  drawCenteredText('completó*', col2X, col2W, yTop - 31, 7.6, true);

  for (let b = 0; b < 4; b++) {
    const bx = col2X + col2W + b * blockW;
    drawCenteredText('Asignado a', bx, blockW, yTop - 10.5, 8, false);
    drawCenteredText('Fecha en que', bx, subDateW, yHeaderMid - 10, 6.8, false);
    drawCenteredText('se asignó', bx, subDateW, yHeaderMid - 18.5, 6.8, false);
    drawCenteredText(
      'Fecha en que',
      bx + subDateW,
      subDateW,
      yHeaderMid - 10,
      6.8,
      false
    );
    drawCenteredText(
      'se completó',
      bx + subDateW,
      subDateW,
      yHeaderMid - 18.5,
      6.8,
      false
    );
  }

  // Datos de las 20 filas
  for (let r = 0; r < rowsCount; r++) {
    const rowData = rows[r];
    if (!rowData) continue;
    const rowTop = yHeaderBottom - r * rowH;
    const rowMid = rowTop - rowSubH;
    const rowBot = rowTop - rowH;

    if (rowData.territoryNumber) {
      drawCenteredText(
        rowData.territoryNumber,
        xStart,
        col1W,
        rowBot + 11.5,
        9.5,
        true
      );
    }

    if (rowData.lastCompletedDate) {
      drawCenteredText(
        rowData.lastCompletedDate,
        col2X,
        col2W,
        rowBot + 11.5,
        8,
        false
      );
    }

    for (let b = 0; b < 4; b++) {
      const cycle = rowData.cycles[b];
      if (!cycle) continue;
      const bx = col2X + col2W + b * blockW;
      if (cycle.assignedTo) {
        const fittedName = fitTextToWidth(
          cycle.assignedTo,
          blockW - 6,
          7.8,
          false
        );
        drawText(fittedName, bx + 3.5, rowMid + 4.5, 7.8, false);
      }
      if (cycle.startedAt) {
        drawCenteredText(
          formatDateShort(cycle.startedAt),
          bx,
          subDateW,
          rowBot + 4.5,
          7.8,
          false
        );
      }
      if (cycle.completedAt) {
        drawCenteredText(
          formatDateShort(cycle.completedAt),
          bx + subDateW,
          subDateW,
          rowBot + 4.5,
          7.8,
          false
        );
      }
    }
  }

  // Líneas finas internas de los 4 bloques (encabezado + filas)
  for (let b = 0; b < 4; b++) {
    const bx = col2X + col2W + b * blockW;
    drawLine(bx, yHeaderMid, bx + blockW, yHeaderMid, 0.55);
    drawLine(bx + subDateW, yHeaderMid, bx + subDateW, yHeaderBottom, 0.55);

    for (let r = 0; r < rowsCount; r++) {
      const rowTop = yHeaderBottom - r * rowH;
      const rowMid = rowTop - rowSubH;
      const rowBot = rowTop - rowH;
      drawLine(bx, rowMid, bx + blockW, rowMid, 0.5);
      drawLine(bx + subDateW, rowMid, bx + subDateW, rowBot, 0.5);
    }
  }

  // Líneas gruesas horizontales de filas y encabezado
  drawLine(xStart, yHeaderBottom, xEnd, yHeaderBottom, 1.3);
  for (let r = 1; r < rowsCount; r++) {
    const ry = yHeaderBottom - r * rowH;
    drawLine(xStart, ry, xEnd, ry, 1.15);
  }

  // Líneas gruesas verticales principales
  drawLine(col2X, yTop, col2X, yBottom, 1.3);
  drawLine(col2X + col2W, yTop, col2X + col2W, yBottom, 1.3);
  for (let b = 1; b < 4; b++) {
    const bx = col2X + col2W + b * blockW;
    drawLine(bx, yTop, bx, yBottom, 1.3);
  }

  // Borde exterior grueso de toda la tabla
  cmds.push('1.6 w');
  cmds.push(
    `${xStart.toFixed(2)} ${yBottom.toFixed(2)} ${totalW.toFixed(2)} ${(
      yTop - yBottom
    ).toFixed(2)} re S`
  );

  // Nota al pie e identificador del formulario oficial
  drawText(
    '*Cuando comience una nueva página, anote en esta columna la última fecha en que los territorios se completaron.',
    36,
    45,
    7.6,
    false
  );
  drawText('S-13-S  1/22', 36, 29, 8.5, false);

  return cmds.join('\n');
}

export function generateS13PdfBytes(
  db: AppDatabase,
  serviceYear: string = getCurrentServiceYear()
): Uint8Array {
  const allRows = buildTerritoryRows(db, serviceYear);
  const ROWS_PER_PAGE = 20;
  const pageCount = Math.max(1, Math.ceil(allRows.length / ROWS_PER_PAGE));
  const yearLabel =
    serviceYear.trim().toLowerCase() === 'todos' ? '' : serviceYear.trim();

  const pageStreams: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const slice = allRows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    pageStreams.push(renderS13PageStream(slice, yearLabel));
  }

  // Objetos PDF:
  // 1 = Catalog, 2 = Pages, 3 = Helvetica, 4 = Helvetica-Bold
  // Por cada página i: obj (5 + 2*i) = Page, obj (6 + 2*i) = Content stream
  const objects: string[] = [];
  const pageObjNums = pageStreams.map((_, i) => 5 + i * 2);

  objects.push(
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`
  );
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums
      .map((n) => `${n} 0 R`)
      .join(' ')}] /Count ${pageObjNums.length} >>\nendobj\n`
  );
  objects.push(
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`
  );
  objects.push(
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`
  );

  pageStreams.forEach((stream, i) => {
    const pageObjId = 5 + i * 2;
    const contentObjId = 6 + i * 2;
    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  });

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // objeto 0 libre
  let currentOffset = 0;

  const pushStr = (s: string) => {
    const bytes = encoder.encode(s);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  pushStr('%PDF-1.4\n');
  for (const objStr of objects) {
    offsets.push(currentOffset);
    pushStr(objStr);
  }

  const xrefOffset = currentOffset;
  const totalObjects = objects.length + 1;
  pushStr(`xref\n0 ${totalObjects}\n`);
  pushStr('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalBytes);
  let pos = 0;
  for (const c of chunks) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
}

export function downloadS13Pdf(
  db: AppDatabase,
  serviceYear: string = getCurrentServiceYear()
): void {
  const bytes = generateS13PdfBytes(db, serviceYear);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeCong = (db.congregationName || 'Congregacion')
    .trim()
    .replace(/\s+/g, '_');
  const safeYear = (serviceYear || 'S13').trim().replace(/\s+/g, '_');
  a.href = url;
  a.download = `Registro_S13_${safeCong}_${safeYear}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
