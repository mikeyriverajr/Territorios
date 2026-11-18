export type LatLngTuple = [number, number]; // [lat, lng]

export type TerritoryType = 'urbano' | 'rural' | 'mixto';

export type TerritoryStatus = 'en_curso' | 'completado';

export type BlockStatus = 'pendiente' | 'en_progreso' | 'completada';

export interface ConductorUser {
  id: string;
  name: string;           // Ej. "Hno. Carlos Gómez"
  pin: string;            // PIN corto de 4 dígitos (ej. "1111")
  phone?: string;
  isAdmin?: boolean;      // Si tiene privilegios de Siervo de Territorios / Admin
}

export interface Block {
  id: string;
  territoryId: string;
  code: string;           // Ej. "1A", "1B", "2A"
  name: string;           // Ej. "Manzana 1A"
  description?: string;
  status: BlockStatus;
  polygon: LatLngTuple[]; // Coordenadas [lat, lng]
  lastWorkedAt?: string;
  completedAt?: string;
  lastCompletedAt?: string;
  lastConductor?: string;
}

export type HousePointCategory =
  | 'no_en_casa'   // Casa donde no atendieron (pueden marcarla Publicadores, Conductores y Admin)
  | 'casa_rural'   // Casa mapeada de antemano en territorio rural
  | 'no_visitar';  // Permanente: Solicitud de NO VISITAR (EXCLUSIVO para Conductores y Admin)

export type HousePointStatus =
  | 'pendiente'    // Falta visitar (en rural: aún no se pasó)
  | 'no_en_casa'   // Se tocó y no había nadie (volver en otra ocasión)
  | 'atendido'     // Ya se encontró a alguien y se predicó
  | 'permanente';  // Para "no_visitar" (no se borra al reiniciar el territorio)

export interface HouseAttempt {
  date: string;
  note?: string;
  recordedBy?: string;
  outcome: 'no_en_casa' | 'atendido';
}

export interface HousePoint {
  id: string;
  territoryId: string;
  blockId?: string;       // Ej. ID de la manzana "1A"
  blockCode?: string;     // Ej. "1A"
  seqNumber?: number;     // Ej. 1, 2, 3 (número correlativo dentro de su manzana o territorio)
  shortCode?: string;     // Ej. "1A-1", "1A-2", "T3-1" (identificador único de la casa)
  lat: number;
  lng: number;
  category: HousePointCategory;
  status: HousePointStatus;
  label: string;          // Ej. "Casa #142 - Reja negra"
  notes?: string;         // Nota adicional opcional
  recordedByRole?: 'publicador' | 'conductor' | 'admin';
  createdAt: string;
  updatedAt: string;
  attempts: HouseAttempt[];
}

export interface Territory {
  id: string;
  number: number;         // Ej. 1, 2, 3
  name: string;           // Ej. "Territorio 1"
  description?: string;
  type: TerritoryType;
  status: TerritoryStatus;// 'en_curso' | 'completado'
  polygon: LatLngTuple[]; // Polígono general del territorio (del Archivo 1)
  startedAt?: string;     // Fecha de inicio del ciclo actual (para S-13)
  completedAt?: string;   // Fecha de cierre (para S-13)
  lastCompletedAt?: string; // Última fecha en que se completó el territorio
  lastConductor?: string;
  assignedToId?: string;    // ID del usuario/conductor asignado directamente (territorio personal)
  assignedToName?: string;  // Nombre del usuario asignado directamente
  assignedAt?: string;      // Fecha de asignación directa
  assignmentNotes?: string; // Notas opcionales de la asignación
}

export interface ScheduleSlot {
  id: string;
  dayName: string;        // Ej. "Martes", "Sábado Mañana"
  dayOfWeek?: string;     // Ej. "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"
  date: string;           // YYYY-MM-DD
  time: string;           // Ej. "09:30"
  conductorId: string;    // ID del conductor asignado
  conductorName: string;  // Ej. "Hno. Carlos Gómez"
  meetingPointName: string; // Ej. "Plaza Primera Junta"
  meetingPointUrl: string;  // Link de Google Maps del punto de encuentro
  territoryIds: string[]; // Territorios asignados para esta salida
  notes?: string;
}

export type PushTemplateType =
  | 'antes_salida'
  | 'inicio_alertas'
  | 'cierre_salida';

export interface PushNotificationTemplate {
  id: string;
  type: PushTemplateType;
  name: string;
  description: string;
  titleTemplate: string;
  bodyTemplate: string;
  triggerTimingLabel: string; // Ej. "2 horas antes de la salida"
  enabled: boolean;
}

export interface PushNotificationItem {
  id: string;
  conductorId: string;    // ID del conductor destinatario (o 'all')
  conductorName: string;
  slotId?: string;
  title: string;
  body: string;
  createdAt: string;
  readByConductor: boolean;
}

export interface S13Record {
  id: string;
  territoryId: string;
  territoryName: string;
  assignedTo: string;     // Conductor que completó
  startedAt: string;
  completedAt: string;
  totalBlocks: number;
  totalNotAtHomeResolved: number;
  notes?: string;
}

export interface OfflineSyncItem {
  id: string;
  timestamp: string;
  actionDescription: string;
  synced: boolean;
}

export interface AppDatabase {
  isConfigured?: boolean;
  congregationName: string;
  adminPin: string;
  conductors: ConductorUser[];
  territories: Territory[];
  blocks: Block[];
  housePoints: HousePoint[];
  schedule: ScheduleSlot[];
  notificationTemplates: PushNotificationTemplate[];
  pushNotifications: PushNotificationItem[];
  s13History: S13Record[];
  offlineQueue: OfflineSyncItem[];
  lastUpdated: string;
}
