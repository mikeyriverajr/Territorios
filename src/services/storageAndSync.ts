import {
  AppDatabase,
  Block,
  BlockStatus,
  ConductorUser,
  HousePoint,
  HousePointStatus,
  LatLngTuple,
  PushNotificationTemplate,
  S13Record,
  ScheduleSlot,
  Territory,
} from '../types/territory';
import { isPointInPolygon } from './kmlImporter';

const STORAGE_KEY = 'territorios_congregacion_db_v3';
const SUPABASE_CONFIG_KEY = 'territorios_supabase_config_v1';

export interface CloudSyncConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  enabled: boolean;
  congregationId?: string;
}

export function getEnvCloudConfig(): CloudSyncConfig {
  const envUrl = (
    import.meta.env.VITE_SUPABASE_URL ||
    'https://dhfouiudukuehkrynher.supabase.co'
  ).trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const envCongId =
    (import.meta.env.VITE_CONGREGATION_ID || 'main').trim() || 'main';
  return {
    supabaseUrl: envUrl,
    supabaseAnonKey: envKey,
    enabled: Boolean(envUrl && envKey),
    congregationId: envCongId,
  };
}

function getSupabaseRowId(cfg: CloudSyncConfig): string {
  return (cfg.congregationId || 'main').trim() || 'main';
}

export function getDefaultNotificationTemplates(): PushNotificationTemplate[] {
  return [
    {
      id: 'tpl-antes',
      type: 'antes_salida',
      name: '1. Recordatorio Previo a la Salida',
      description: 'Se envía antes de la salida al celular del conductor.',
      titleTemplate: '📅 Salida de hoy ({hora} hs) — {territorio}',
      bodyTemplate:
        'Hola {conductor}, te recordamos tu salida hoy ({dia} a las {hora} hs). Punto de encuentro: {punto_encuentro}. Territorio asignado: {territorio}.',
      triggerTimingLabel: '2 horas antes de la salida',
      enabled: true,
    },
    {
      id: 'tpl-inicio',
      type: 'inicio_alertas',
      name: '2. Aviso de Inicio: NO VISITAR y No en Casa',
      description:
        'Recuerda al conductor las casas NO VISITAR y las casas No en casa pendientes al iniciar.',
      titleTemplate: '⚠️ Avisos importantes en {territorio}',
      bodyTemplate:
        '{conductor}: En {territorio} hay {no_visitar} dirección(es) NO VISITAR y {no_en_casa_pendientes} casa(s) No en casa pendientes en la nube. Comparte el link del grupo con los publicadores.',
      triggerTimingLabel: 'Al iniciar la hora de la salida',
      enabled: true,
    },
    {
      id: 'tpl-cierre',
      type: 'cierre_salida',
      name: '3. Recordatorio al Finalizar la Predicación',
      description:
        'Recuerda al conductor marcar las manzanas completadas hoy o si se terminó todo el territorio.',
      titleTemplate: '✅ ¿Terminó la predicación en {territorio}?',
      bodyTemplate:
        'Hola {conductor}, por favor recuerda marcar en la app qué manzanas se completaron hoy en {territorio} (o si se completó todo el territorio).',
      triggerTimingLabel: '90 minutos después de iniciar la salida',
      enabled: true,
    },
  ];
}

/**
 * Base de datos limpia para el Asistente de Configuración Inicial (Startup Wizard)
 */
export function getBlankLiveDatabase(): AppDatabase {
  return {
    isConfigured: false,
    congregationName: '',
    adminPin: '',
    conductors: [],
    territories: [],
    blocks: [],
    housePoints: [],
    schedule: [],
    notificationTemplates: getDefaultNotificationTemplates(),
    pushNotifications: [],
    s13History: [],
    offlineQueue: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Base de datos de demostración opcional (por si desean cargar datos de ejemplo desde el asistente)
 */
export function getDemoDatabase(): AppDatabase {
  const today = new Date().toISOString().slice(0, 10);

  const conductors: ConductorUser[] = [
    { id: 'cond-1', name: 'Hno. Carlos Gómez', pin: '1111', isAdmin: true },
    { id: 'cond-2', name: 'Hno. Daniel Paredes', pin: '2222' },
    { id: 'cond-3', name: 'Hno. Marcos Silva', pin: '3333' },
    { id: 'cond-4', name: 'Hno. Roberto Fernández', pin: '4444' },
  ];

  const territories: Territory[] = [
    {
      id: 'terr-1',
      number: 1,
      name: 'Territorio 1',
      description: 'Zona Urbana Centro — Manzanas 1A a 1D',
      type: 'urbano',
      status: 'en_curso',
      startedAt: '2026-11-01',
      lastConductor: 'Hno. Carlos Gómez',
      polygon: [
        [-34.6110, -58.4455],
        [-34.6110, -58.4405],
        [-34.6150, -58.4405],
        [-34.6150, -58.4455],
      ],
    },
    {
      id: 'terr-2',
      number: 2,
      name: 'Territorio 2',
      description: 'Zona Urbana Norte — Manzanas 2A a 2C',
      type: 'urbano',
      status: 'en_curso',
      startedAt: '2026-10-18',
      lastConductor: 'Hno. Daniel Paredes',
      polygon: [
        [-34.6072, -58.4455],
        [-34.6072, -58.4405],
        [-34.6108, -58.4405],
        [-34.6108, -58.4455],
      ],
    },
    {
      id: 'terr-3',
      number: 3,
      name: 'Territorio 3 (Rural)',
      description: 'Sector Rural Camino Viejo — Casas marcadas individualmente',
      type: 'rural',
      status: 'en_curso',
      startedAt: '2026-11-03',
      lastConductor: 'Hno. Marcos Silva',
      polygon: [
        [-34.6085, -58.4525],
        [-34.6085, -58.4460],
        [-34.6145, -58.4460],
        [-34.6145, -58.4525],
      ],
    },
  ];

  const blocks: Block[] = [
    {
      id: 'block-1A',
      territoryId: 'terr-1',
      code: '1A',
      name: 'Manzana 1A',
      description: 'Av. Rivadavia y Cachimayo',
      status: 'completada',
      lastWorkedAt: '2026-11-05',
      lastConductor: 'Hno. Carlos Gómez',
      polygon: [
        [-34.6112, -58.4452],
        [-34.6112, -58.4431],
        [-34.6129, -58.4431],
        [-34.6129, -58.4452],
      ],
    },
    {
      id: 'block-1B',
      territoryId: 'terr-1',
      code: '1B',
      name: 'Manzana 1B',
      description: 'Cachimayo y Nicolás Videla',
      status: 'en_progreso',
      lastWorkedAt: '2026-11-05',
      lastConductor: 'Hno. Carlos Gómez',
      polygon: [
        [-34.6112, -58.4429],
        [-34.6112, -58.4408],
        [-34.6129, -58.4408],
        [-34.6129, -58.4429],
      ],
    },
    {
      id: 'block-1C',
      territoryId: 'terr-1',
      code: '1C',
      name: 'Manzana 1C',
      description: 'Valle y Cachimayo',
      status: 'pendiente',
      polygon: [
        [-34.6131, -58.4452],
        [-34.6131, -58.4431],
        [-34.6148, -58.4431],
        [-34.6148, -58.4452],
      ],
    },
    {
      id: 'block-1D',
      territoryId: 'terr-1',
      code: '1D',
      name: 'Manzana 1D',
      description: 'José Bonifacio y Riglos',
      status: 'pendiente',
      polygon: [
        [-34.6131, -58.4429],
        [-34.6131, -58.4408],
        [-34.6148, -58.4408],
        [-34.6148, -58.4429],
      ],
    },
    {
      id: 'block-2A',
      territoryId: 'terr-2',
      code: '2A',
      name: 'Manzana 2A',
      status: 'completada',
      lastWorkedAt: '2026-10-25',
      lastConductor: 'Hno. Daniel Paredes',
      polygon: [
        [-34.6075, -58.4452],
        [-34.6075, -58.4431],
        [-34.6091, -58.4431],
        [-34.6091, -58.4452],
      ],
    },
    {
      id: 'block-2B',
      territoryId: 'terr-2',
      code: '2B',
      name: 'Manzana 2B',
      status: 'completada',
      lastWorkedAt: '2026-10-29',
      lastConductor: 'Hno. Daniel Paredes',
      polygon: [
        [-34.6075, -58.4429],
        [-34.6075, -58.4408],
        [-34.6091, -58.4408],
        [-34.6091, -58.4429],
      ],
    },
    {
      id: 'block-2C',
      territoryId: 'terr-2',
      code: '2C',
      name: 'Manzana 2C',
      status: 'pendiente',
      lastWorkedAt: '2026-11-02',
      lastConductor: 'Hno. Daniel Paredes',
      polygon: [
        [-34.6093, -58.4452],
        [-34.6093, -58.4408],
        [-34.6106, -58.4408],
        [-34.6106, -58.4452],
      ],
    },
  ];

  const housePoints: HousePoint[] = [
    {
      id: 'hp-1',
      territoryId: 'terr-1',
      blockId: 'block-1A',
      blockCode: '1A',
      seqNumber: 1,
      shortCode: '1A-1',
      lat: -34.6118,
      lng: -58.4445,
      category: 'no_en_casa',
      status: 'no_en_casa',
      label: 'N° 432 — Casa reja negra (2 timbres)',
      recordedByRole: 'publicador',
      createdAt: '2026-11-05T10:15:00Z',
      updatedAt: '2026-11-05T10:15:00Z',
      attempts: [{ date: '2026-11-05', outcome: 'no_en_casa' }],
    },
    {
      id: 'hp-3',
      territoryId: 'terr-1',
      blockId: 'block-1B',
      blockCode: '1B',
      seqNumber: 1,
      shortCode: '1B-NV1',
      lat: -34.6116,
      lng: -58.4418,
      category: 'no_visitar',
      status: 'permanente',
      label: 'Cachimayo 215 (Puerta roja esq.) — NO VISITAR',
      recordedByRole: 'conductor',
      createdAt: '2026-03-14T11:00:00Z',
      updatedAt: '2026-03-14T11:00:00Z',
      attempts: [],
    },
    {
      id: 'hp-rural-1',
      territoryId: 'terr-3',
      seqNumber: 1,
      shortCode: 'T3-1',
      lat: -34.6098,
      lng: -58.4508,
      category: 'casa_rural',
      status: 'pendiente',
      label: 'Casa Rural 1 — Tranquera Roja',
      createdAt: '2026-11-03T09:40:00Z',
      updatedAt: '2026-11-03T09:40:00Z',
      attempts: [],
    },
    {
      id: 'hp-rural-2',
      territoryId: 'terr-3',
      seqNumber: 2,
      shortCode: 'T3-2',
      lat: -34.6105,
      lng: -58.4488,
      category: 'casa_rural',
      status: 'no_en_casa',
      label: 'Casa Rural 2 — Quinta Los Pinos',
      createdAt: '2026-11-03T10:05:00Z',
      updatedAt: '2026-11-03T10:05:00Z',
      attempts: [{ date: '2026-11-03', outcome: 'no_en_casa' }],
    },
  ];

  const schedule: ScheduleSlot[] = [
    {
      id: 'sched-1',
      dayName: 'Martes Mañana',
      date: today,
      time: '09:30',
      conductorId: 'cond-1',
      conductorName: 'Hno. Carlos Gómez',
      meetingPointName: 'Plaza Primera Junta (Av. Rivadavia y Cachimayo)',
      meetingPointUrl:
        'https://www.google.com/maps/search/?api=1&query=-34.6120,-58.4430',
      territoryIds: ['terr-1'],
      notes: 'Hacer el No en casa de 1A y continuar por 1B, 1C y 1D.',
    },
    {
      id: 'sched-2',
      dayName: 'Jueves Tarde',
      date: today,
      time: '17:00',
      conductorId: 'cond-2',
      conductorName: 'Hno. Daniel Paredes',
      meetingPointName: 'Esquina Cachimayo y Méndez de Andes',
      meetingPointUrl:
        'https://www.google.com/maps/search/?api=1&query=-34.6088,-58.4430',
      territoryIds: ['terr-2'],
    },
  ];

  return {
    isConfigured: true,
    congregationName: 'Congregación Central',
    adminPin: '1914',
    conductors,
    territories,
    blocks,
    housePoints,
    schedule,
    notificationTemplates: getDefaultNotificationTemplates(),
    pushNotifications: [],
    s13History: [],
    offlineQueue: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Asegura que una base de datos deserializada tenga todas sus colecciones como arrays válidos
 */
export function sanitizeDatabase(parsed: Partial<AppDatabase>): AppDatabase {
  const blank = getBlankLiveDatabase();
  const rawConductors = Array.isArray(parsed.conductors)
    ? parsed.conductors
    : [];
  const hasAnyAdmin = rawConductors.some((c) => Boolean(c?.isAdmin));
  const normalizedConductors: ConductorUser[] = rawConductors.map((c, idx) => ({
    ...c,
    isAdmin: hasAnyAdmin ? Boolean(c.isAdmin) : idx === 0,
  }));

  return {
    ...blank,
    ...parsed,
    isConfigured: parsed.isConfigured ?? false,
    congregationName: parsed.congregationName || '',
    adminPin: parsed.adminPin || '',
    conductors: normalizedConductors,
    territories: Array.isArray(parsed.territories) ? parsed.territories : [],
    blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    housePoints: Array.isArray(parsed.housePoints) ? parsed.housePoints : [],
    schedule: Array.isArray(parsed.schedule)
      ? parsed.schedule.map((s) => ({
          ...s,
          territoryIds: Array.isArray(s?.territoryIds) ? s.territoryIds : [],
        }))
      : [],
    notificationTemplates:
      Array.isArray(parsed.notificationTemplates) &&
      parsed.notificationTemplates.length > 0
        ? parsed.notificationTemplates
        : getDefaultNotificationTemplates(),
    pushNotifications: Array.isArray(parsed.pushNotifications)
      ? parsed.pushNotifications
      : [],
    s13History: Array.isArray(parsed.s13History) ? parsed.s13History : [],
    offlineQueue: Array.isArray(parsed.offlineQueue) ? parsed.offlineQueue : [],
    lastUpdated: parsed.lastUpdated || new Date().toISOString(),
  };
}

export function loadDatabase(): AppDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getBlankLiveDatabase();
    }
    const parsed = JSON.parse(raw) as Partial<AppDatabase>;
    return sanitizeDatabase(parsed);
  } catch {
    return getBlankLiveDatabase();
  }
}

export async function pushDatabaseToSupabase(
  db: AppDatabase,
  customCfg?: CloudSyncConfig
): Promise<{ ok: boolean; error?: string }> {
  const supa = customCfg || loadCloudConfig();
  const cleanUrl = supa.supabaseUrl.trim().replace(/\/$/, '');
  const cleanKey = supa.supabaseAnonKey.trim();
  const rowId = getSupabaseRowId(supa);

  if (!supa.enabled || !cleanUrl || !cleanKey) {
    return {
      ok: false,
      error: 'Falta ingresar Supabase Project URL y Anon Key.',
    };
  }

  try {
    const res = await fetch(
      `${cleanUrl}/rest/v1/congregation_state?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cleanKey,
          Authorization: `Bearer ${cleanKey}`,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          id: rowId,
          payload: db,
          updated_at: db.lastUpdated || new Date().toISOString(),
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: `Error Supabase (${res.status}): ${text || res.statusText}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Error de red al conectar con Supabase.',
    };
  }
}

export function saveDatabase(db: AppDatabase): AppDatabase {
  const updated: AppDatabase = {
    ...db,
    lastUpdated: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error guardando en almacenamiento local:', e);
  }

  if (typeof window !== 'undefined') {
    const supa = loadCloudConfig();
    if (supa.enabled && supa.supabaseUrl && supa.supabaseAnonKey) {
      // 1. Sincronizar con Supabase (almacenamiento en la nube principal)
      pushDatabaseToSupabase(updated, supa).catch(() => {});
    } else {
      // 2. Respaldo local con servidor Node integrado (/api/cloud-state) si existe
      fetch('/api/cloud-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});
    }
  }

  return updated;
}

export async function fetchCloudDatabase(): Promise<AppDatabase | null> {
  try {
    // 1. Si hay Supabase activo (por variables de entorno o ajuste manual), consultar ahí
    const supa = loadCloudConfig();
    if (supa.enabled && supa.supabaseUrl && supa.supabaseAnonKey) {
      const cleanUrl = supa.supabaseUrl.trim().replace(/\/$/, '');
      const cleanKey = supa.supabaseAnonKey.trim();
      const rowId = getSupabaseRowId(supa);
      const res = await fetch(
        `${cleanUrl}/rest/v1/congregation_state?id=eq.${encodeURIComponent(
          rowId
        )}&select=payload`,
        {
          headers: {
            apikey: cleanKey,
            Authorization: `Bearer ${cleanKey}`,
          },
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]?.payload) {
          const remoteDb = sanitizeDatabase(rows[0].payload as AppDatabase);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteDb));
          return remoteDb;
        }
      }
      return null;
    }

    // 2. Respaldo: consultar el servidor en la nube integrado (/api/cloud-state)
    const res = await fetch('/api/cloud-state', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as AppDatabase | null;
    if (data && data.isConfigured) {
      const sanitized = sanitizeDatabase(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      return sanitized;
    }
    return null;
  } catch {
    return null;
  }
}

export function appendSyncAction(
  db: AppDatabase,
  actionDescription: string
): AppDatabase {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (isOnline) return db;

  const newItem = {
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    actionDescription,
    synced: false,
  };
  return {
    ...db,
    offlineQueue: [newItem, ...db.offlineQueue],
  };
}

export function markWholeTerritoryCompleted(
  db: AppDatabase,
  territoryId: string,
  conductorName?: string
): AppDatabase {
  const territory = db.territories.find((t) => t.id === territoryId);
  if (!territory) return db;

  const todayStr = new Date().toISOString().slice(0, 10);
  const terrBlocks = db.blocks.filter((b) => b.territoryId === territoryId);
  const terrPoints = db.housePoints.filter((p) => p.territoryId === territoryId);
  const resolvedCount = terrPoints.filter(
    (p) => p.status === 'atendido'
  ).length;

  const updatedTerritories = db.territories.map((t) =>
    t.id === territoryId
      ? {
          ...t,
          status: 'completado' as const,
          completedAt: todayStr,
          lastCompletedAt: todayStr,
          lastConductor: conductorName || t.lastConductor,
        }
      : t
  );

  const updatedBlocks = db.blocks.map((b) =>
    b.territoryId === territoryId
      ? {
          ...b,
          status: 'completada' as BlockStatus,
          lastWorkedAt: todayStr,
          completedAt: todayStr,
          lastCompletedAt: todayStr,
          lastConductor: conductorName || b.lastConductor,
        }
      : b
  );

  const newS13Record: S13Record = {
    id: `s13-${Date.now()}`,
    territoryId: territory.id,
    territoryName: territory.name,
    assignedTo: conductorName || territory.lastConductor || 'Conductor asignado',
    startedAt: territory.startedAt || todayStr,
    completedAt: todayStr,
    totalBlocks: terrBlocks.length,
    totalNotAtHomeResolved: resolvedCount,
    notes: 'Marcado como completado por el conductor',
  };

  return saveDatabase({
    ...db,
    territories: updatedTerritories,
    blocks: updatedBlocks,
    s13History: [newS13Record, ...db.s13History],
  });
}

export function resetTerritoryForNewCycle(
  db: AppDatabase,
  territoryId: string,
  newConductor?: string
): AppDatabase {
  const todayStr = new Date().toISOString().slice(0, 10);

  const updatedTerritories = db.territories.map((t) =>
    t.id === territoryId
      ? {
          ...t,
          status: 'en_curso' as const,
          startedAt: todayStr,
          completedAt: undefined,
          lastCompletedAt: t.completedAt || t.lastCompletedAt,
          lastConductor: newConductor || t.lastConductor,
        }
      : t
  );

  const updatedBlocks = db.blocks.map((b) =>
    b.territoryId === territoryId
      ? {
          ...b,
          status: 'pendiente' as BlockStatus,
          lastWorkedAt: undefined,
          completedAt: undefined,
          lastCompletedAt: b.completedAt || b.lastWorkedAt || b.lastCompletedAt,
        }
      : b
  );

  const updatedPoints = db.housePoints
    .filter((p) => {
      if (p.territoryId !== territoryId) return true;
      return p.category === 'no_visitar' || p.category === 'casa_rural';
    })
    .map((p) => {
      if (p.territoryId === territoryId && p.category === 'casa_rural') {
        return {
          ...p,
          status: 'pendiente' as HousePointStatus,
          attempts: [],
        };
      }
      return p;
    });

  return saveDatabase({
    ...db,
    territories: updatedTerritories,
    blocks: updatedBlocks,
    housePoints: updatedPoints,
  });
}

export function findBlockForCoordinates(
  blocks: Block[],
  territoryId: string,
  point: LatLngTuple
): Block | undefined {
  const terrBlocks = blocks.filter((b) => b.territoryId === territoryId);
  return terrBlocks.find((b) => isPointInPolygon(point, b.polygon));
}

/**
 * Genera el identificador único por Manzana + Número correlativo (ej. "1A-1", "1A-2", o "T3-1" en rural)
 */
export function generateHouseShortCode(
  db: AppDatabase,
  territoryId: string,
  blockCode?: string,
  category?: string
): { seqNumber: number; shortCode: string } {
  const territory = db.territories.find((t) => t.id === territoryId);
  const prefix = blockCode
    ? blockCode.toUpperCase()
    : `T${territory?.number ?? 1}`;

  if (category === 'no_visitar') {
    const existingNV = db.housePoints.filter(
      (p) =>
        p.territoryId === territoryId &&
        (blockCode ? p.blockCode === blockCode : true) &&
        p.category === 'no_visitar'
    );
    const nextNum = existingNV.length + 1;
    return { seqNumber: nextNum, shortCode: `${prefix}-NV${nextNum}` };
  }

  const sameGroupPoints = db.housePoints.filter(
    (p) =>
      p.territoryId === territoryId &&
      (blockCode ? p.blockCode === blockCode : !p.blockCode) &&
      p.category !== 'no_visitar'
  );

  const maxSeq = sameGroupPoints.reduce(
    (max, p, idx) => Math.max(max, p.seqNumber ?? idx + 1),
    0
  );
  const nextSeq = maxSeq + 1;
  return {
    seqNumber: nextSeq,
    shortCode: `${prefix}-${nextSeq}`,
  };
}

export function loadCloudConfig(): CloudSyncConfig {
  const envCfg = getEnvCloudConfig();
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
    if (!raw) return envCfg;
    const parsed = JSON.parse(raw) as Partial<CloudSyncConfig>;
    const supabaseUrl = (parsed.supabaseUrl || envCfg.supabaseUrl || '').trim();
    const supabaseAnonKey = (
      parsed.supabaseAnonKey ||
      envCfg.supabaseAnonKey ||
      ''
    ).trim();
    const congregationId =
      (parsed.congregationId || envCfg.congregationId || 'main').trim() ||
      'main';
    const enabled =
      parsed.enabled !== undefined
        ? Boolean(parsed.enabled && supabaseUrl && supabaseAnonKey)
        : Boolean(supabaseUrl && supabaseAnonKey);
    return {
      supabaseUrl,
      supabaseAnonKey,
      enabled,
      congregationId,
    };
  } catch {
    return envCfg;
  }
}

export function saveCloudConfig(cfg: CloudSyncConfig): void {
  localStorage.setItem(
    SUPABASE_CONFIG_KEY,
    JSON.stringify({
      ...cfg,
      supabaseUrl: cfg.supabaseUrl.trim(),
      supabaseAnonKey: cfg.supabaseAnonKey.trim(),
      congregationId: (cfg.congregationId || 'main').trim() || 'main',
    })
  );
}

export const CONGREGATION_STATE_SQL = `create table if not exists public.congregation_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

alter table public.congregation_state enable row level security;

drop policy if exists "Allow anon read congregation_state" on public.congregation_state;
create policy "Allow anon read congregation_state"
  on public.congregation_state
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow anon insert congregation_state" on public.congregation_state;
create policy "Allow anon insert congregation_state"
  on public.congregation_state
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Allow anon update congregation_state" on public.congregation_state;
create policy "Allow anon update congregation_state"
  on public.congregation_state
  for update
  to anon, authenticated
  using (true)
  with check (true);`;

export interface SupabaseConnectResult {
  status: 'loaded' | 'empty' | 'missing_table' | 'error';
  db?: AppDatabase;
  message: string;
  existingTables?: string[];
}

export async function connectAndFetchFromSupabase(
  cfg: CloudSyncConfig
): Promise<SupabaseConnectResult> {
  const cleanUrl = cfg.supabaseUrl.trim().replace(/\/$/, '');
  const cleanKey = cfg.supabaseAnonKey.trim();
  const rowId = getSupabaseRowId(cfg);

  if (!cleanUrl || !cleanKey) {
    return {
      status: 'error',
      message: '❌ Ingrese Supabase Project URL y Anon Key.',
    };
  }

  saveCloudConfig({
    supabaseUrl: cleanUrl,
    supabaseAnonKey: cleanKey,
    enabled: true,
    congregationId: rowId,
  });

  const fetchExistingTables = async (): Promise<string[]> => {
    try {
      const schemaRes = await fetch(`${cleanUrl}/rest/v1/`, {
        headers: {
          apikey: cleanKey,
          Authorization: `Bearer ${cleanKey}`,
        },
        cache: 'no-store',
      });
      if (!schemaRes.ok) return [];
      const spec = (await schemaRes.json()) as {
        paths?: Record<string, unknown>;
      };
      if (!spec?.paths) return [];
      return Object.keys(spec.paths)
        .map((p) => p.replace(/^\//, ''))
        .filter((name) => Boolean(name) && !name.startsWith('rpc/'));
    } catch {
      return [];
    }
  };

  try {
    const res = await fetch(
      `${cleanUrl}/rest/v1/congregation_state?id=eq.${encodeURIComponent(
        rowId
      )}&select=payload`,
      {
        headers: {
          apikey: cleanKey,
          Authorization: `Bearer ${cleanKey}`,
        },
        cache: 'no-store',
      }
    );

    if (res.ok) {
      const rows = (await res.json()) as Array<{ payload?: AppDatabase }>;
      if (Array.isArray(rows) && rows[0]?.payload) {
        const remoteDb = sanitizeDatabase({
          ...rows[0].payload,
          isConfigured: true,
        });
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteDb));
        } catch {
          // Ignore storage quota issues
        }
        return {
          status: 'loaded',
          db: remoteDb,
          message: '✅ ¡Datos de la congregación cargados desde Supabase!',
        };
      }

      const existingTables = await fetchExistingTables();
      return {
        status: 'empty',
        existingTables,
        message: `✅ Conectado a Supabase correctamente, pero la tabla "congregation_state" aún no tiene datos guardados para el ID "${rowId}".`,
      };
    }

    const errText = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      return {
        status: 'error',
        message:
          '❌ Clave Supabase Anon Key inválida o sin permisos (401/403). Verifica que copiaste la clave "anon public".',
      };
    }

    if (
      res.status === 404 ||
      errText.includes('PGRST205') ||
      errText.includes('congregation_state')
    ) {
      const existingTables = await fetchExistingTables();
      return {
        status: 'missing_table',
        existingTables,
        message:
          '⚠️ Conectado a tu proyecto de Supabase, pero aún no existe la tabla "congregation_state".',
      };
    }

    return {
      status: 'error',
      message: `❌ Error de Supabase (${res.status}): ${errText || res.statusText}`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: `❌ No se pudo conectar con Supabase: ${
        err instanceof Error ? err.message : 'Error de red'
      }`,
    };
  }
}
