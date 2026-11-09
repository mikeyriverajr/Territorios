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
    { id: 'cond-1', name: 'Hno. Carlos Gómez', pin: '1111' },
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

export function loadDatabase(): AppDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const blank = getBlankLiveDatabase();
      return blank;
    }
    const parsed = JSON.parse(raw) as AppDatabase;
    if (!parsed.notificationTemplates) {
      return {
        ...parsed,
        notificationTemplates: getDefaultNotificationTemplates(),
      };
    }
    return parsed;
  } catch {
    return getBlankLiveDatabase();
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
    // 1. Sincronizar con el servidor en la nube integrado (/api/cloud-state)
    fetch('/api/cloud-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});

    // 2. Si el Admin configuró Supabase externo, sincronizar también con Supabase
    const supa = loadCloudConfig();
    if (supa.enabled && supa.supabaseUrl && supa.supabaseAnonKey) {
      const cleanUrl = supa.supabaseUrl.replace(/\/$/, '');
      fetch(`${cleanUrl}/rest/v1/congregation_state?id=eq.main`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supa.supabaseAnonKey,
          Authorization: `Bearer ${supa.supabaseAnonKey}`,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          id: 'main',
          payload: updated,
          updated_at: updated.lastUpdated,
        }),
      }).catch(() => {});
    }
  }

  return updated;
}

export async function fetchCloudDatabase(): Promise<AppDatabase | null> {
  try {
    // 1. Si hay Supabase externo activo, consultar primero ahí
    const supa = loadCloudConfig();
    if (supa.enabled && supa.supabaseUrl && supa.supabaseAnonKey) {
      const cleanUrl = supa.supabaseUrl.replace(/\/$/, '');
      const res = await fetch(
        `${cleanUrl}/rest/v1/congregation_state?id=eq.main&select=payload`,
        {
          headers: {
            apikey: supa.supabaseAnonKey,
            Authorization: `Bearer ${supa.supabaseAnonKey}`,
          },
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]?.payload) {
          const remoteDb = rows[0].payload as AppDatabase;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteDb));
          return remoteDb;
        }
      }
    }

    // 2. Consultar el servidor en la nube integrado (/api/cloud-state)
    const res = await fetch('/api/cloud-state', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as AppDatabase | null;
    if (data && data.isConfigured) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
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

export function loadCloudConfig(): CloudSyncConfig {
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
    if (!raw) return { supabaseUrl: '', supabaseAnonKey: '', enabled: false };
    return JSON.parse(raw) as CloudSyncConfig;
  } catch {
    return { supabaseUrl: '', supabaseAnonKey: '', enabled: false };
  }
}

export function saveCloudConfig(cfg: CloudSyncConfig): void {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(cfg));
}
