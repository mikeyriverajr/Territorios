import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  Save,
  Share2,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  Download,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FolderGit2,
  HelpCircle,
  Home,
  LayoutGrid,
  Link2,
  List,
  Map,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AppDatabase,
  Block,
  ConductorUser,
  HousePoint,
  MeetingLocation,
  PushNotificationTemplate,
  ScheduleSlot,
  Territory,
  TerritoryAssignee,
} from '../types/territory';
import {
  downloadKmlFile,
  exportMapsToGoogleKml,
  extractKmlTextFromFile,
  parseBlocksAndHousesKml,
  parseTerritoriesKml,
} from '../services/kmlImporter';
import {
  buildWeeklyScheduleWhatsAppMessage,
  copyTextToClipboard,
  formatScheduleSlotMessage,
  getGoogleMapsNavigationUrl,
  getPublisherTerritoryLink,
  openWhatsAppShare,
  renderPushTemplate,
  triggerBrowserNotification,
} from '../services/notificationHelper';
import {
  CloudSyncConfig,
  getEnvCloudConfig,
  getSlotConductorLabel,
  getSlotConductors,
  getTerritoryAssignees,
  loadCloudConfig,
  pushDatabaseToSupabase,
  sanitizeDatabase,
  saveCloudConfig,
} from '../services/storageAndSync';
import {
  downloadS13Pdf,
  getAvailableServiceYears,
  getCurrentServiceYear,
} from '../services/s13PdfGenerator';
import { MapEditorFocusRequest, MapEditorView } from './MapEditorView';
import { HelpCenterModal } from './HelpCenterModal';
import { compareBlockCodes } from '../services/mapGeometry';

const DAYS_OF_WEEK = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

function dayOfWeekFromDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return 'Lunes';
  return DAYS_OF_WEEK[new Date(y, m - 1, d).getDay()];
}

/** Mueve la fecha a la próxima ocurrencia (desde la fecha actual) del día de semana elegido */
function shiftDateToDayOfWeek(iso: string, targetDay: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = y && m && d ? new Date(y, m - 1, d) : new Date();
  const targetIdx = DAYS_OF_WEEK.indexOf(targetDay);
  const diff = (targetIdx - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `${base.getFullYear()}-${mm}-${dd}`;
}

interface AdminDashboardProps {
  db: AppDatabase;
  onOpenTerritoryInMap: (territoryId: string) => void;
  onOpenGeneralMap: () => void;
  onImportMapsData: (
    newTerritories: Territory[],
    newBlocks: Block[],
    newPoints: HousePoint[],
    replaceAll: boolean
  ) => void;
  onAddConductor: (name: string, pin: string, isAdmin?: boolean) => void;
  onToggleConductorAdmin: (conductorId: string) => void;
  onDeleteConductor: (conductorId: string) => void;
  onAddScheduleSlot: (
    slot: Omit<ScheduleSlot, 'id'>,
    assignmentModes?: Record<string, 'add' | 'replace'>
  ) => void;
  onUpdateScheduleSlot: (
    slot: ScheduleSlot,
    assignmentModes?: Record<string, 'add' | 'replace'>
  ) => void;
  onDeleteScheduleSlot: (slotId: string) => void;
  onSaveTerritory: (t: Territory) => void;
  onCreateTerritory: (t: Territory) => void;
  onDeleteTerritory: (territoryId: string) => void;
  onSaveBlock: (b: Block) => void;
  onCreateBlock: (b: Block) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdateNotificationTemplate: (updated: PushNotificationTemplate) => void;
  onSendPushNotificationToConductor: (params: {
    conductorId: string;
    conductorName: string;
    recipients?: Array<{ conductorId: string; conductorName: string }>;
    slotId?: string;
    title: string;
    body: string;
  }) => void;
  onCompleteWholeTerritory: (territoryId: string) => void;
  onResetTerritory: (territoryId: string) => void;
  onUpdateTerritoryAssignees: (
    territoryId: string,
    assignees: TerritoryAssignee[],
    assignmentNotes?: string
  ) => void;
  onUpdateCustomLocations: (locations: MeetingLocation[]) => void;
  onUpdateCongregationSettings: (name: string, pin: string) => void;
  onRestoreFullBackup: (backupDb: AppDatabase) => void;
  onLaunchStartupWizard?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  db: rawDb,
  onOpenTerritoryInMap,
  onOpenGeneralMap,
  onImportMapsData,
  onAddConductor,
  onToggleConductorAdmin,
  onDeleteConductor,
  onAddScheduleSlot,
  onUpdateScheduleSlot,
  onDeleteScheduleSlot,
  onSaveTerritory,
  onCreateTerritory,
  onDeleteTerritory,
  onSaveBlock,
  onCreateBlock,
  onDeleteBlock,
  onUpdateNotificationTemplate,
  onSendPushNotificationToConductor,
  onCompleteWholeTerritory,
  onResetTerritory,
  onUpdateTerritoryAssignees,
  onUpdateCustomLocations,
  onUpdateCongregationSettings,
  onRestoreFullBackup,
  onLaunchStartupWizard,
}) => {
  const db = useMemo(() => sanitizeDatabase(rawDb || {}), [rawDb]);

  const [activeTab, setActiveTab] = useState<
    'programa' | 'notificaciones' | 'nube_s13' | 'editor' | 'ajustes' | 'ayuda'
  >('programa');

  // Estados para Conductores
  const [newConductorName, setNewConductorName] = useState<string>('');
  const [newConductorPin, setNewConductorPin] = useState<string>('');
  const [newConductorIsAdmin, setNewConductorIsAdmin] = useState<boolean>(false);

  // Estados para Programa Semanal (asignación por fecha + día + múltiples encargados)
  const todayIso = new Date().toISOString().slice(0, 10);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotDate, setSlotDate] = useState<string>(todayIso);
  const [dayOfWeek, setDayOfWeek] = useState<string>(dayOfWeekFromDate(todayIso));
  const [shiftLabel, setShiftLabel] = useState<string>('Mañana');
  const [time, setTime] = useState<string>('09:30');
  const [selectedConductorIds, setSelectedConductorIds] = useState<string[]>(
    () => (db.conductors[0]?.id ? [db.conductors[0].id] : [])
  );
  const [conductorToAdd, setConductorToAdd] = useState<string>('');
  const [meetingPointName, setMeetingPointName] = useState<string>('');
  const [meetingPointUrl, setMeetingPointUrl] = useState<string>('');
  const [selectedTerritoryIds, setSelectedTerritoryIds] = useState<string[]>([]);
  const [territoryToAdd, setTerritoryToAdd] = useState<string>('');
  const [slotNotes, setSlotNotes] = useState<string>('');
  const [territoryAssignmentModes, setTerritoryAssignmentModes] = useState<
    Record<string, 'add' | 'replace'>
  >({});
  const [assignmentConflictModal, setAssignmentConflictModal] = useState<{
    territory: Territory;
    existingNames: string[];
    newConductorNames: string[];
    source: 'select' | 'submit';
  } | null>(null);

  // Estados para el Módulo Exclusivo de Notificaciones Push
  const [previewSlotId, setPreviewSlotId] = useState<string>(
    db.schedule[0]?.id || ''
  );
  const [pushFeedback, setPushFeedback] = useState<string>('');

  // Estados para la importación de los 2 archivos KML/KMZ separados
  const [file1Name, setFile1Name] = useState<string>('');
  const [file2Name, setFile2Name] = useState<string>('');
  const [parsedTerritoriesPreview, setParsedTerritoriesPreview] = useState<
    Territory[]
  >([]);
  const [parsedBlocksPreview, setParsedBlocksPreview] = useState<Block[]>([]);
  const [parsedPointsPreview, setParsedPointsPreview] = useState<HousePoint[]>(
    []
  );
  const [replaceExistingOnImport, setReplaceExistingOnImport] =
    useState<boolean>(true);
  const [importStatusMsg, setImportStatusMsg] = useState<string>('');

  // Estados de Ajustes
  const [congNameEdit, setCongNameEdit] = useState<string>(db.congregationName);
  const [cloudCfg, setCloudCfg] = useState<CloudSyncConfig>(() =>
    loadCloudConfig()
  );
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string>('');
  const [cloudSyncStatusMsg, setCloudSyncStatusMsg] = useState<string>('');
  const [backupStatusMsg, setBackupStatusMsg] = useState<string>('');
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [assignmentNotesDraft, setAssignmentNotesDraft] = useState<
    Record<string, string>
  >({});
  const [showLocationManager, setShowLocationManager] =
    useState<boolean>(false);
  const [newLocName, setNewLocName] = useState<string>('');
  const [newLocUrl, setNewLocUrl] = useState<string>('');

  // Estados de la pestaña Territorios y S-13
  const [territoriesSubTab, setTerritoriesSubTab] = useState<
    'territories' | 's13'
  >('territories');
  const [territoryStatusFilter, setTerritoryStatusFilter] = useState<
    'all' | 'unassigned' | 'assigned' | 'en_curso' | 'completado' | 'rural_mixto'
  >('all');
  const [territoryViewMode, setTerritoryViewMode] = useState<'list' | 'cards'>(
    'list'
  );
  const [territoryPage, setTerritoryPage] = useState<number>(1);
  const [territoryPageSize, setTerritoryPageSize] = useState<number>(25);
  const [expandedTerritoryIds, setExpandedTerritoryIds] = useState<
    Record<string, boolean>
  >({});
  const [copiedTerritoryLinkId, setCopiedTerritoryLinkId] = useState<
    string | null
  >(null);
  const [selectedServiceYear, setSelectedServiceYear] = useState<string>(() =>
    getCurrentServiceYear()
  );
  const [territorySortBy, setTerritorySortBy] = useState<
    'number' | 'oldest_worked' | 'recent_completed' | 'status' | 'assignee'
  >('number');
  const [territorySearchQuery, setTerritorySearchQuery] = useState<string>('');
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<MapEditorFocusRequest | null>(null);
  const hasEnvSupabase = getEnvCloudConfig().enabled;

  const openMapEditor = (
    territoryId?: string,
    action: 'edit_territory' | 'draw_block' | 'draw_territory' = 'edit_territory'
  ) => {
    setEditorFocusRequest({
      territoryId,
      action,
      nonce: Date.now(),
    });
    setActiveTab('editor');
  };

  const handleExportGoogleMapsKml = (
    targetTerritories: Territory[],
    fileNameBase: string
  ) => {
    const territoryIdSet = new Set(targetTerritories.map((t) => t.id));
    const filteredBlocks = db.blocks.filter((b) =>
      territoryIdSet.has(b.territoryId)
    );
    const filteredPoints = db.housePoints.filter((p) =>
      territoryIdSet.has(p.territoryId)
    );
    const kmlText = exportMapsToGoogleKml({
      congregationName: db.congregationName,
      territories: targetTerritories,
      blocks: filteredBlocks,
      housePoints: filteredPoints,
    });
    const safeName = fileNameBase.trim().replace(/\s+/g, '_');
    downloadKmlFile(kmlText, `${safeName}.kml`);
  };

  const handleCreateConductor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConductorName.trim() || !newConductorPin.trim()) return;
    onAddConductor(
      newConductorName.trim(),
      newConductorPin.trim(),
      newConductorIsAdmin
    );
    setNewConductorName('');
    setNewConductorPin('');
    setNewConductorIsAdmin(false);
  };

  const handleDownloadFullBackup = () => {
    const jsonStr = JSON.stringify(db, null, 2);
    const blob = new Blob([jsonStr], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (db.congregationName || 'Congregacion')
      .trim()
      .replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `Respaldo_Territorios_${safeName}_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupStatusMsg(
      '✅ Copia de seguridad descargada. Guárdela en un lugar seguro.'
    );
  };

  const handleRestoreBackupFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppDatabase>;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.territories)
      ) {
        setBackupStatusMsg('❌ El archivo seleccionado no es un respaldo válido.');
        return;
      }
      const restored = sanitizeDatabase({ ...parsed, isConfigured: true });
      onRestoreFullBackup(restored);
      setBackupStatusMsg(
        `✅ Copia restaurada (${restored.territories.length} territorios, ${restored.conductors.length} conductores) y enviada a la nube.`
      );
    } catch {
      setBackupStatusMsg(
        '❌ No se pudo leer el archivo .json. Verifique que no esté dañado.'
      );
    }
  };

  const resetSlotForm = () => {
    setEditingSlotId(null);
    setSlotDate(todayIso);
    setDayOfWeek(dayOfWeekFromDate(todayIso));
    setShiftLabel('Mañana');
    setTime('09:30');
    setSelectedConductorIds(db.conductors[0]?.id ? [db.conductors[0].id] : []);
    setConductorToAdd('');
    setMeetingPointName('');
    setMeetingPointUrl('');
    setSelectedTerritoryIds([]);
    setTerritoryAssignmentModes({});
    setAssignmentConflictModal(null);
    setSlotNotes('');
  };

  const handleStartEditSlot = (slot: ScheduleSlot) => {
    setEditingSlotId(slot.id);
    setSlotDate(slot.date || todayIso);
    setDayOfWeek(slot.dayOfWeek || dayOfWeekFromDate(slot.date || todayIso));
    const shift = slot.dayName.replace(slot.dayOfWeek || '', '').trim();
    setShiftLabel(shift || 'Mañana');
    setTime(slot.time);
    const slotCondIds = getSlotConductors(slot)
      .map((c) => c.id)
      .filter(Boolean);
    setSelectedConductorIds(
      slotCondIds.length > 0
        ? slotCondIds
        : slot.conductorId
        ? [slot.conductorId]
        : []
    );
    setConductorToAdd('');
    setMeetingPointName(slot.meetingPointName);
    setMeetingPointUrl(slot.meetingPointUrl);
    setSelectedTerritoryIds(slot.territoryIds);
    setTerritoryAssignmentModes({});
    setAssignmentConflictModal(null);
    setSlotNotes(slot.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getConflictingAssigneeNames = (
    terr: Territory,
    conductorIds: string[]
  ): string[] => {
    const selectedSet = new Set(conductorIds);
    const selectedNameSet = new Set(
      db.conductors
        .filter((c) => selectedSet.has(c.id))
        .map((c) => c.name)
    );
    return getTerritoryAssignees(terr)
      .filter(
        (a) =>
          !(a.id && selectedSet.has(a.id)) &&
          !(a.name && selectedNameSet.has(a.name))
      )
      .map((a) => a.name)
      .filter(Boolean);
  };

  const submitSlotWithModes = (modes: Record<string, 'add' | 'replace'>) => {
    const selectedConds = selectedConductorIds
      .map((id) => db.conductors.find((c) => c.id === id))
      .filter((c): c is ConductorUser => Boolean(c));
    if (
      selectedConds.length === 0 ||
      !meetingPointName.trim() ||
      selectedTerritoryIds.length === 0
    ) {
      return;
    }

    const primary = selectedConds[0];
    const payload: Omit<ScheduleSlot, 'id'> = {
      dayName: `${dayOfWeek} ${shiftLabel}`.trim(),
      dayOfWeek,
      date: slotDate,
      time,
      conductorId: primary.id,
      conductorName: primary.name,
      conductorIds: selectedConds.map((c) => c.id),
      conductorNames: selectedConds.map((c) => c.name),
      meetingPointName: meetingPointName.trim(),
      meetingPointUrl:
        meetingPointUrl.trim() ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          meetingPointName.trim()
        )}`,
      territoryIds: selectedTerritoryIds,
      notes: slotNotes.trim() || undefined,
    };

    if (editingSlotId) {
      onUpdateScheduleSlot({ ...payload, id: editingSlotId }, modes);
    } else {
      onAddScheduleSlot(payload, modes);
    }
    resetSlotForm();
  };

  const handleCreateSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedConds = selectedConductorIds
      .map((id) => db.conductors.find((c) => c.id === id))
      .filter((c): c is ConductorUser => Boolean(c));
    if (
      selectedConds.length === 0 ||
      !meetingPointName.trim() ||
      selectedTerritoryIds.length === 0
    ) {
      return;
    }

    // Si algún territorio tiene otros asignados y aún no se eligió Agregar o Reemplazar, preguntar
    for (const tid of selectedTerritoryIds) {
      if (territoryAssignmentModes[tid]) continue;
      const terr = db.territories.find((t) => t.id === tid);
      if (!terr) continue;
      const conflicts = getConflictingAssigneeNames(terr, selectedConductorIds);
      if (conflicts.length > 0) {
        setAssignmentConflictModal({
          territory: terr,
          existingNames: conflicts,
          newConductorNames: selectedConds.map((c) => c.name),
          source: 'submit',
        });
        return;
      }
    }

    submitSlotWithModes(territoryAssignmentModes);
  };

  const [copiedScheduleToast, setCopiedScheduleToast] = useState<string | null>(null);

  const customLocations = useMemo(
    () => db.customLocations || [],
    [db.customLocations]
  );

  const getTerritoryLastWorkedDate = (t: Territory): string => {
    const dates: string[] = [];
    if (t.completedAt) dates.push(t.completedAt);
    if (t.lastCompletedAt) dates.push(t.lastCompletedAt);
    db.s13History
      .filter((r) => r.territoryId === t.id && r.completedAt)
      .forEach((r) => dates.push(r.completedAt));
    db.blocks
      .filter((b) => b.territoryId === t.id)
      .forEach((b) => {
        const d = b.completedAt || b.lastCompletedAt || b.lastWorkedAt;
        if (d) dates.push(d);
      });
    if (dates.length === 0) return '';
    return dates.sort((a, b) => b.localeCompare(a))[0];
  };

  const getTerritoryLastCompletedDate = (t: Territory): string => {
    const latestS13 = db.s13History.find((r) => r.territoryId === t.id);
    return (
      t.completedAt ||
      t.lastCompletedAt ||
      latestS13?.completedAt ||
      ''
    );
  };

  const sortedTerritoriesForTab = useMemo(() => {
    const list = [...db.territories];
    list.sort((a, b) => {
      if (territorySortBy === 'oldest_worked') {
        const da = getTerritoryLastWorkedDate(a);
        const dbDate = getTerritoryLastWorkedDate(b);
        if (!da && dbDate) return -1;
        if (da && !dbDate) return 1;
        const cmp = da.localeCompare(dbDate);
        return cmp !== 0 ? cmp : a.number - b.number;
      }
      if (territorySortBy === 'recent_completed') {
        const da = getTerritoryLastCompletedDate(a);
        const dbDate = getTerritoryLastCompletedDate(b);
        if (!da && dbDate) return 1;
        if (da && !dbDate) return -1;
        const cmp = dbDate.localeCompare(da);
        return cmp !== 0 ? cmp : a.number - b.number;
      }
      if (territorySortBy === 'status') {
        if (a.status !== b.status) {
          return a.status === 'en_curso' ? -1 : 1;
        }
        return a.number - b.number;
      }
      if (territorySortBy === 'assignee') {
        const aa = getTerritoryAssignees(a)
          .map((x) => x.name)
          .join(', ');
        const ab = getTerritoryAssignees(b)
          .map((x) => x.name)
          .join(', ');
        if (!aa && ab) return 1;
        if (aa && !ab) return -1;
        const cmp = aa.localeCompare(ab);
        return cmp !== 0 ? cmp : a.number - b.number;
      }
      return a.number - b.number;
    });
    return list;
  }, [db.territories, db.blocks, db.s13History, territorySortBy]);

  const territoryFilterCounts = useMemo(() => {
    const list = db.territories;
    return {
      all: list.length,
      unassigned: list.filter((t) => getTerritoryAssignees(t).length === 0)
        .length,
      assigned: list.filter((t) => getTerritoryAssignees(t).length > 0).length,
      en_curso: list.filter((t) => t.status !== 'completado').length,
      completado: list.filter((t) => t.status === 'completado').length,
      rural_mixto: list.filter((t) => t.type === 'rural' || t.type === 'mixto')
        .length,
    };
  }, [db.territories]);

  const filteredTerritoriesForTab = useMemo(() => {
    const normalizeText = (val: string) =>
      val
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const q = normalizeText(territorySearchQuery);

    return sortedTerritoriesForTab.filter((t) => {
      const assignees = getTerritoryAssignees(t);
      if (territoryStatusFilter === 'unassigned' && assignees.length > 0)
        return false;
      if (territoryStatusFilter === 'assigned' && assignees.length === 0)
        return false;
      if (territoryStatusFilter === 'en_curso' && t.status === 'completado')
        return false;
      if (territoryStatusFilter === 'completado' && t.status !== 'completado')
        return false;
      if (
        territoryStatusFilter === 'rural_mixto' &&
        t.type !== 'rural' &&
        t.type !== 'mixto'
      ) {
        return false;
      }

      if (!q) return true;

      const assigneeNames = assignees.map((a) => a.name).join(' ');
      const slotAssignees = (db.schedule || [])
        .filter((s) => (s.territoryIds || []).includes(t.id))
        .map((s) => getSlotConductorLabel(s))
        .join(' ');
      const searchable = normalizeText(
        `${t.name} ${t.number} ${t.description || ''} ${assigneeNames} ${slotAssignees}`
      );
      return searchable.includes(q);
    });
  }, [
    sortedTerritoriesForTab,
    territorySearchQuery,
    territoryStatusFilter,
    db.schedule,
  ]);

  useEffect(() => {
    setTerritoryPage(1);
  }, [territorySearchQuery, territoryStatusFilter, territorySortBy, territoryPageSize]);

  const totalTerritoryPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(filteredTerritoriesForTab.length / territoryPageSize)
      ),
    [filteredTerritoriesForTab.length, territoryPageSize]
  );

  const safeTerritoryPage = Math.min(territoryPage, totalTerritoryPages);

  const paginatedTerritoriesForTab = useMemo(() => {
    const start = (safeTerritoryPage - 1) * territoryPageSize;
    return filteredTerritoriesForTab.slice(start, start + territoryPageSize);
  }, [filteredTerritoriesForTab, safeTerritoryPage, territoryPageSize]);

  const availableServiceYears = useMemo(
    () => getAvailableServiceYears(db),
    [db]
  );

  const sortedSchedule = useMemo(() => {
    return [...(db.schedule || [])]
      .filter(Boolean)
      .sort((a, b) =>
        `${a?.date || ''} ${a?.time || ''}`.localeCompare(
          `${b?.date || ''} ${b?.time || ''}`
        )
      );
  }, [db.schedule]);

  const handleCopyWeeklyScheduleText = async () => {
    const text = buildWeeklyScheduleWhatsAppMessage(
      db.congregationName,
      sortedSchedule,
      db.territories
    );
    await copyTextToClipboard(text);
    setCopiedScheduleToast('📋 ¡Programa semanal copiado! Listo para pegar en WhatsApp');
    setTimeout(() => setCopiedScheduleToast(null), 3500);
  };

  const handleShareWeeklyScheduleWhatsApp = async () => {
    const text = buildWeeklyScheduleWhatsAppMessage(
      db.congregationName,
      sortedSchedule,
      db.territories
    );
    await copyTextToClipboard(text);
    openWhatsAppShare(text);
  };

  const handleShareSingleSlot = async (slot: ScheduleSlot) => {
    const text = formatScheduleSlotMessage(slot);
    await copyTextToClipboard(text);
    openWhatsAppShare(text);
  };

  const handleCopySingleSlotText = async (slot: ScheduleSlot) => {
    const text = formatScheduleSlotMessage(slot);
    await copyTextToClipboard(text);
    setCopiedScheduleToast(`📋 Salida de ${slot.dayName} copiada con emoticonos`);
    setTimeout(() => setCopiedScheduleToast(null), 3500);
  };

  const handleDuplicateSlot = (slot: ScheduleSlot) => {
    let nextDate = slot.date;
    try {
      const d = new Date(slot.date + 'T12:00:00');
      d.setDate(d.getDate() + 7);
      nextDate = d.toISOString().slice(0, 10);
    } catch {
      // fallback
    }
    setEditingSlotId(null);
    setSlotDate(nextDate);
    setDayOfWeek(slot.dayOfWeek || dayOfWeekFromDate(nextDate));
    const shift = slot.dayName.replace(slot.dayOfWeek || '', '').trim();
    setShiftLabel(shift || 'Mañana');
    setTime(slot.time);
    const slotCondIds = getSlotConductors(slot)
      .map((c) => c.id)
      .filter(Boolean);
    setSelectedConductorIds(
      slotCondIds.length > 0
        ? slotCondIds
        : slot.conductorId
        ? [slot.conductorId]
        : []
    );
    setConductorToAdd('');
    setMeetingPointName(slot.meetingPointName);
    setMeetingPointUrl(slot.meetingPointUrl);
    setSelectedTerritoryIds(slot.territoryIds);
    setTerritoryAssignmentModes({});
    setSlotNotes(slot.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCopiedScheduleToast(`📋 Salida clonada (+7 días: ${nextDate}). Modifique los datos y pulse Publicar Salida`);
    setTimeout(() => setCopiedScheduleToast(null), 4000);
  };

  const handleDuplicateWholeWeek = () => {
    if (sortedSchedule.length === 0) return;
    const defaultAddModes: Record<string, 'add' | 'replace'> = {};
    sortedSchedule.forEach((slot) => {
      let nextDate = slot.date;
      try {
        const d = new Date(slot.date + 'T12:00:00');
        d.setDate(d.getDate() + 7);
        nextDate = d.toISOString().slice(0, 10);
      } catch {
        // fallback
      }
      const conds = getSlotConductors(slot);
      slot.territoryIds.forEach((tid) => {
        defaultAddModes[tid] = 'add';
      });
      onAddScheduleSlot(
        {
          dayName: slot.dayName,
          dayOfWeek: slot.dayOfWeek,
          date: nextDate,
          time: slot.time,
          conductorId: slot.conductorId,
          conductorName: slot.conductorName,
          conductorIds: conds.map((c) => c.id),
          conductorNames: conds.map((c) => c.name),
          meetingPointName: slot.meetingPointName,
          meetingPointUrl: slot.meetingPointUrl,
          territoryIds: slot.territoryIds,
          notes: slot.notes,
        },
        defaultAddModes
      );
    });
    setCopiedScheduleToast(`✅ ${sortedSchedule.length} salidas duplicadas para la próxima semana (+7 días)`);
    setTimeout(() => setCopiedScheduleToast(null), 4000);
  };

  const handleDispatchPushFromTemplate = async (
    tpl: PushNotificationTemplate,
    slot: ScheduleSlot
  ) => {
    const slotConds = getSlotConductors(slot);
    const recipients =
      slotConds.length > 0
        ? slotConds.map((c) => ({ conductorId: c.id, conductorName: c.name }))
        : [{ conductorId: slot.conductorId, conductorName: slot.conductorName }];

    const rendered = renderPushTemplate(
      tpl,
      slot,
      db.territories,
      db.housePoints
    );

    onSendPushNotificationToConductor({
      conductorId: recipients[0].conductorId,
      conductorName: recipients[0].conductorName,
      recipients,
      slotId: slot.id,
      title: rendered.title,
      body: rendered.body,
    });

    await triggerBrowserNotification(rendered.title, rendered.body);
    setPushFeedback(
      `🔔 Notificación Push enviada a ${getSlotConductorLabel(slot)}: "${rendered.title}"`
    );
    setTimeout(() => setPushFeedback(''), 4000);
  };

  const handleFile1Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFile1Name(file.name);
      const kmlText = await extractKmlTextFromFile(file);
      const territories = parseTerritoriesKml(kmlText);
      setParsedTerritoriesPreview(territories);
      setImportStatusMsg(
        `✅ Archivo 1 leído: ${territories.length} territorio(s). Ahora suba el Archivo 2 (Manzanas / Casas).`
      );
    } catch (err) {
      setImportStatusMsg(
        `❌ Error leyendo Archivo 1: ${
          err instanceof Error ? err.message : 'Formato inválido'
        }`
      );
    }
  };

  const handleFile2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFile2Name(file.name);
      const kmlText = await extractKmlTextFromFile(file);
      const baseTerritories =
        parsedTerritoriesPreview.length > 0
          ? parsedTerritoriesPreview
          : db.territories;

      const { blocks, ruralAndAlertPoints, updatedTerritories } =
        parseBlocksAndHousesKml(kmlText, baseTerritories);

      setParsedTerritoriesPreview(updatedTerritories);
      setParsedBlocksPreview(blocks);
      setParsedPointsPreview(ruralAndAlertPoints);
      setImportStatusMsg(
        `✅ Archivo 2 vinculado: ${blocks.length} manzanas y ${ruralAndAlertPoints.length} casas/puntos unidos a los territorios.`
      );
    } catch (err) {
      setImportStatusMsg(
        `❌ Error leyendo Archivo 2: ${
          err instanceof Error ? err.message : 'Formato inválido'
        }`
      );
    }
  };

  const handleLoadSampleTwoFiles = async () => {
    try {
      const [res1, res2] = await Promise.all([
        fetch('./ejemplos/archivo1_territorios_ejemplo.kml'),
        fetch('./ejemplos/archivo2_manzanas_y_casas_ejemplo.kml'),
      ]);
      const kml1 = await res1.text();
      const kml2 = await res2.text();

      const territories = parseTerritoriesKml(kml1);
      const { blocks, ruralAndAlertPoints, updatedTerritories } =
        parseBlocksAndHousesKml(kml2, territories);

      setFile1Name('archivo1_territorios_ejemplo.kml');
      setFile2Name('archivo2_manzanas_y_casas_ejemplo.kml');
      setParsedTerritoriesPreview(updatedTerritories);
      setParsedBlocksPreview(blocks);
      setParsedPointsPreview(ruralAndAlertPoints);
      setImportStatusMsg(
        `✅ Prueba de 2 archivos lista: ${updatedTerritories.length} territorios del Archivo 1 unidos con ${blocks.length} manzanas y ${ruralAndAlertPoints.length} casas rurales del Archivo 2.`
      );
    } catch {
      setImportStatusMsg('Error cargando los archivos de ejemplo.');
    }
  };

  const handleConfirmImport = () => {
    if (
      parsedTerritoriesPreview.length === 0 &&
      parsedBlocksPreview.length === 0
    ) {
      return;
    }
    onImportMapsData(
      parsedTerritoriesPreview,
      parsedBlocksPreview,
      parsedPointsPreview,
      replaceExistingOnImport
    );
    setImportStatusMsg('🎉 ¡Mapas importados y guardados en la nube!');
  };

  const handleExportS13Csv = () => {
    const headers = [
      'Territorio',
      'Conductor Asignado',
      'Fecha Inicio',
      'Fecha Completado',
      'Manzanas',
      'Casas No en Casa Atendidas',
      'Notas',
    ];
    const rows = db.s13History.map((r) => [
      `"${r.territoryName}"`,
      `"${r.assignedTo}"`,
      r.startedAt,
      r.completedAt,
      r.totalBlocks,
      r.totalNotAtHomeResolved,
      `"${r.notes || ''}"`,
    ]);
    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Registro_S13_${db.congregationName.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewSlot =
    db.schedule.find((s) => s.id === previewSlotId) || db.schedule[0];

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 space-y-6 pb-24">
      {/* Modal de elección al asignar territorio en Programa Semanal (Agregar vs Reemplazar) */}
      {assignmentConflictModal && (
        <div
          className="fixed inset-0 z-[2100] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border-2 border-amber-500 p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-black uppercase">
                  Territorio ya asignado
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  {assignmentConflictModal.territory.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAssignmentConflictModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs sm:text-sm space-y-1">
              <div>
                <strong>Actualmente asignado a:</strong>{' '}
                {assignmentConflictModal.existingNames.join(', ')}
              </div>
              <div>
                <strong>Encargado(s) de esta salida:</strong>{' '}
                {assignmentConflictModal.newConductorNames.join(', ') ||
                  'Sin seleccionar'}
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              ¿Deseas agregar al nuevo encargado junto con quienes ya lo tienen,
              o reemplazar la asignación anterior?
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const tid = assignmentConflictModal.territory.id;
                  const nextModes: Record<string, 'add' | 'replace'> = {
                    ...territoryAssignmentModes,
                    [tid]: 'add',
                  };
                  setTerritoryAssignmentModes(nextModes);
                  const src = assignmentConflictModal.source;
                  setAssignmentConflictModal(null);
                  if (src === 'select') {
                    if (!selectedTerritoryIds.includes(tid)) {
                      setSelectedTerritoryIds([...selectedTerritoryIds, tid]);
                    }
                  } else {
                    // Verificar si hay otro territorio sin resolver antes de publicar
                    for (const id of selectedTerritoryIds) {
                      if (nextModes[id]) continue;
                      const terr = db.territories.find((t) => t.id === id);
                      if (!terr) continue;
                      const conflicts = getConflictingAssigneeNames(
                        terr,
                        selectedConductorIds
                      );
                      if (conflicts.length > 0) {
                        const selectedCondNames = selectedConductorIds
                          .map((cid) => db.conductors.find((c) => c.id === cid)?.name)
                          .filter((n): n is string => Boolean(n));
                        setAssignmentConflictModal({
                          territory: terr,
                          existingNames: conflicts,
                          newConductorNames: selectedCondNames,
                          source: 'submit',
                        });
                        return;
                      }
                    }
                    submitSlotWithModes(nextModes);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-black text-xs sm:text-sm cursor-pointer"
              >
                👥 Agregar junto a los actuales
              </button>

              <button
                type="button"
                onClick={() => {
                  const tid = assignmentConflictModal.territory.id;
                  const nextModes: Record<string, 'add' | 'replace'> = {
                    ...territoryAssignmentModes,
                    [tid]: 'replace',
                  };
                  setTerritoryAssignmentModes(nextModes);
                  const src = assignmentConflictModal.source;
                  setAssignmentConflictModal(null);
                  if (src === 'select') {
                    if (!selectedTerritoryIds.includes(tid)) {
                      setSelectedTerritoryIds([...selectedTerritoryIds, tid]);
                    }
                  } else {
                    for (const id of selectedTerritoryIds) {
                      if (nextModes[id]) continue;
                      const terr = db.territories.find((t) => t.id === id);
                      if (!terr) continue;
                      const conflicts = getConflictingAssigneeNames(
                        terr,
                        selectedConductorIds
                      );
                      if (conflicts.length > 0) {
                        const selectedCondNames = selectedConductorIds
                          .map((cid) => db.conductors.find((c) => c.id === cid)?.name)
                          .filter((n): n is string => Boolean(n));
                        setAssignmentConflictModal({
                          territory: terr,
                          existingNames: conflicts,
                          newConductorNames: selectedCondNames,
                          source: 'submit',
                        });
                        return;
                      }
                    }
                    submitSlotWithModes(nextModes);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm cursor-pointer"
              >
                🔄 Reemplazar asignación anterior
              </button>

              <button
                type="button"
                onClick={() => setAssignmentConflictModal(null)}
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pestañas del Siervo de Territorios / Admin + Acceso rápido al Mapa General */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-2 flex flex-wrap items-center gap-1.5 shadow-xs">
        {(
          [
            { key: 'programa', label: 'Programa y Conductores', icon: Calendar },
            { key: 'notificaciones', label: 'Notificaciones Push', icon: Bell },
            { key: 'nube_s13', label: 'Territorios y S-13', icon: FileSpreadsheet },
            { key: 'editor', label: 'Editor de Mapas', icon: Edit3 },
            { key: 'ajustes', label: 'Ajustes', icon: Cloud },
            { key: 'ayuda', label: 'Ayuda y Manual', icon: HelpCircle },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setEditorFocusRequest(null);
                setActiveTab(tab.key);
              }}
              className={`flex-1 min-w-[125px] py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 text-center leading-tight cursor-pointer transition ${
                activeTab === tab.key
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenGeneralMap}
          className="py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition shrink-0"
          title="Ver mapa general de todos los territorios con GPS"
        >
          <Map className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Mapa General</span>
        </button>
      </div>

      {/* PROGRAMA SEMANAL, ASIGNACIÓN DE TERRITORIOS Y CONDUCTORES */}
      {activeTab === 'programa' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 min-w-0 space-y-6">
            <form
              onSubmit={handleCreateSlot}
              className={`bg-white rounded-2xl border-2 p-4 sm:p-6 space-y-4 shadow-xs ${
                editingSlotId ? 'border-amber-400' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-black text-slate-900">
                  {editingSlotId ? '✏️ Editar Salida' : 'Nueva Salida'}
                </h2>
                {editingSlotId && (
                  <button
                    type="button"
                    onClick={resetSlotForm}
                    className="text-xs font-bold text-slate-600 hover:underline cursor-pointer"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              {/* Fecha + Día de la semana + Turno + Hora */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="min-w-0">
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Fecha:
                  </label>
                  <input
                    type="date"
                    value={slotDate}
                    onChange={(e) => {
                      setSlotDate(e.target.value);
                      setDayOfWeek(dayOfWeekFromDate(e.target.value));
                    }}
                    className="w-full min-w-0 h-[42px] px-2.5 rounded-xl border border-slate-300 font-semibold text-sm bg-white"
                    required
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Día:
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => {
                      setDayOfWeek(e.target.value);
                      setSlotDate(shiftDateToDayOfWeek(slotDate, e.target.value));
                    }}
                    className="w-full min-w-0 h-[42px] px-2.5 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Turno:
                  </label>
                  <select
                    value={shiftLabel}
                    onChange={(e) => setShiftLabel(e.target.value)}
                    className="w-full min-w-0 h-[42px] px-2.5 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                  >
                    <option value="Mañana">Mañana</option>
                    <option value="Tarde">Tarde</option>
                    <option value="Noche">Noche</option>
                    <option value="">(Sin turno)</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Hora:
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full min-w-0 h-[42px] px-2.5 rounded-xl border border-slate-300 font-semibold text-sm bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div className="min-w-0">
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Encargado(s):
                  </label>
                  <select
                    value={conductorToAdd}
                    onChange={(e) => {
                      const cid = e.target.value;
                      if (cid && !selectedConductorIds.includes(cid)) {
                        setSelectedConductorIds([...selectedConductorIds, cid]);
                      }
                      setConductorToAdd('');
                    }}
                    className="w-full min-w-0 h-[42px] px-3 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                  >
                    <option value="">+ Agregar encargado...</option>
                    {db.conductors
                      .filter((c) => !selectedConductorIds.includes(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  {selectedConductorIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedConductorIds.map((cid, idx) => {
                        const c = db.conductors.find((x) => x.id === cid);
                        return (
                          <span
                            key={cid}
                            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-indigo-100 text-indigo-950 text-xs font-extrabold"
                          >
                            <span>
                              {c?.name || cid}
                              {idx === 0 ? ' (Principal)' : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedConductorIds(
                                  selectedConductorIds.filter((x) => x !== cid)
                                )
                              }
                              className="w-5 h-5 rounded hover:bg-indigo-200 flex items-center justify-center cursor-pointer"
                              title="Quitar encargado"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">
                      Seleccione al menos un encargado.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-extrabold uppercase text-slate-600">
                      Ubicación:
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowLocationManager((v) => !v)}
                      className="shrink-0 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-2 py-0.5 cursor-pointer"
                    >
                      {showLocationManager ? 'Cerrar lista' : '✏️ Personalizar'}
                    </button>
                  </div>
                  <select
                    value={meetingPointName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMeetingPointName(val);
                      const found = customLocations.find(
                        (l) => l.name === val
                      );
                      if (found) {
                        setMeetingPointUrl(found.url || '');
                      }
                    }}
                    className="w-full min-w-0 h-[42px] px-3 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                    required
                  >
                    <option value="" disabled>
                      Elegir ubicación...
                    </option>
                    {customLocations.map((loc) => (
                      <option key={loc.id} value={loc.name}>
                        {loc.name}
                      </option>
                    ))}
                    {meetingPointName &&
                      !customLocations.some(
                        (l) => l.name === meetingPointName
                      ) && (
                        <option value={meetingPointName}>
                          {meetingPointName}
                        </option>
                      )}
                  </select>
                </div>
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Punto de Encuentro (Link Maps):
                </label>
                <input
                  type="text"
                  value={meetingPointUrl}
                  onChange={(e) => setMeetingPointUrl(e.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full min-w-0 h-[42px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
                />
              </div>

              {showLocationManager && (
                <div className="bg-slate-50 border border-blue-200 rounded-2xl p-3.5 space-y-3">
                  <div className="text-xs font-black uppercase text-blue-900">
                    Lista Personalizable de Ubicaciones ({customLocations.length})
                  </div>

                  {customLocations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {customLocations.map((loc) => (
                        <span
                          key={loc.id}
                          className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-800"
                        >
                          <span>{loc.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = customLocations.filter(
                                (x) => x.id !== loc.id
                              );
                              onUpdateCustomLocations(next);
                              if (meetingPointName === loc.name) {
                                setMeetingPointName('');
                                setMeetingPointUrl('');
                              }
                            }}
                            className="w-5 h-5 rounded hover:bg-red-100 text-red-600 flex items-center justify-center cursor-pointer font-black"
                            title="Eliminar ubicación"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    <input
                      type="text"
                      value={newLocName}
                      onChange={(e) => setNewLocName(e.target.value)}
                      placeholder="Nombre (ej. Plaza Norte)"
                      className="sm:col-span-2 w-full min-w-0 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                    />
                    <input
                      type="text"
                      value={newLocUrl}
                      onChange={(e) => setNewLocUrl(e.target.value)}
                      placeholder="Link Google Maps (opcional)"
                      className="sm:col-span-2 w-full min-w-0 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cleanName = newLocName.trim();
                        if (!cleanName) return;
                        const cleanUrl = newLocUrl.trim();
                        const newLoc: MeetingLocation = {
                          id: `loc-${Date.now()}`,
                          name: cleanName,
                          url: cleanUrl || undefined,
                        };
                        onUpdateCustomLocations([...customLocations, newLoc]);
                        setMeetingPointName(cleanName);
                        setMeetingPointUrl(cleanUrl);
                        setNewLocName('');
                        setNewLocUrl('');
                      }}
                      className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-black text-xs cursor-pointer"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>
              )}

              {/* Selector enriquecido de territorios */}
              <div className="min-w-0">
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Territorio(s):
                </label>
                <div className="min-w-0">
                  <select
                    value={territoryToAdd}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTerritoryToAdd('');
                      if (!id || selectedTerritoryIds.includes(id)) return;
                      const terr = db.territories.find((t) => t.id === id);
                      if (terr && selectedConductorIds.length > 0) {
                        const conflicts = getConflictingAssigneeNames(
                          terr,
                          selectedConductorIds
                        );
                        if (conflicts.length > 0 && !territoryAssignmentModes[terr.id]) {
                          const newNames = selectedConductorIds
                            .map((cid) => db.conductors.find((c) => c.id === cid)?.name)
                            .filter((n): n is string => Boolean(n));
                          setAssignmentConflictModal({
                            territory: terr,
                            existingNames: conflicts,
                            newConductorNames: newNames,
                            source: 'select',
                          });
                          return;
                        }
                      }
                      setSelectedTerritoryIds([...selectedTerritoryIds, id]);
                    }}
                    className="w-full min-w-0 h-[42px] px-3 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                  >
                    <option value="">+ Agregar territorio...</option>
                    {db.territories
                      .filter((t) => !selectedTerritoryIds.includes(t.id))
                      .sort((a, b) => a.number - b.number)
                      .map((t) => {
                        const lastWorked = getTerritoryLastWorkedDate(t);
                        const assignees = getTerritoryAssignees(t);
                        const assigneeText =
                          assignees.length > 0
                            ? `Asignado: ${assignees.map((a) => a.name).join(', ')}`
                            : 'Sin asignar';
                        return (
                          <option key={t.id} value={t.id}>
                            {t.name} — Últ. vez: {lastWorked || 'Sin fecha'} —{' '}
                            {assigneeText}
                          </option>
                        );
                      })}
                  </select>
                </div>
                {selectedTerritoryIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedTerritoryIds.map((id) => {
                      const t = db.territories.find((x) => x.id === id);
                      const mode = territoryAssignmentModes[id];
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-blue-100 text-blue-900 text-xs font-extrabold"
                        >
                          <span>
                            {t?.name || id}
                            {mode === 'add'
                              ? ' (Compartido)'
                              : mode === 'replace'
                              ? ' (Reemplaza)'
                              : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedTerritoryIds(
                                selectedTerritoryIds.filter((x) => x !== id)
                              )
                            }
                            className="w-5 h-5 rounded hover:bg-blue-200 flex items-center justify-center cursor-pointer"
                            title="Quitar"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Elija al menos un territorio.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Notas para el conductor:
                </label>
                <input
                  type="text"
                  value={slotNotes}
                  onChange={(e) => setSlotNotes(e.target.value)}
                  placeholder="Ej. Hay 1 No en casa en 1A y continuar con 1B..."
                  className="w-full min-w-0 h-[42px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={selectedConductorIds.length === 0}
                className={`w-full sm:w-auto px-6 py-3 disabled:opacity-50 text-white font-black text-sm rounded-xl shadow-sm inline-flex items-center justify-center gap-2 cursor-pointer ${
                  editingSlotId
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-blue-700 hover:bg-blue-800'
                }`}
              >
                {editingSlotId ? (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar Cambios
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Publicar Salida
                  </>
                )}
              </button>
            </form>

            {/* Notificación de copiado / acción */}
            {copiedScheduleToast && (
              <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{copiedScheduleToast}</span>
              </div>
            )}

            {/* Programa semanal publicado */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 sm:p-5 space-y-4 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="font-black text-lg text-slate-900">
                    Programa Semanal ({sortedSchedule.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mensaje con formato y emoticonos listos para WhatsApp.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {sortedSchedule.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDuplicateWholeWeek}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer border border-slate-300 transition"
                      title="Clonar todas las salidas para la próxima semana (+7 días)"
                    >
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>Duplicar Semana (+7 días)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyWeeklyScheduleText}
                    disabled={sortedSchedule.length === 0}
                    className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 disabled:opacity-50 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Mensaje</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleShareWeeklyScheduleWhatsApp}
                    disabled={sortedSchedule.length === 0}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Abrir en WhatsApp</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {sortedSchedule.map((slot) => {
                  const safeTerritoryIds = Array.isArray(slot?.territoryIds) ? slot.territoryIds : [];
                  const terrNames = (db.territories || [])
                    .filter((t) => safeTerritoryIds.includes(t.id))
                    .map((t) => t.name)
                    .join(', ');

                  return (
                    <div
                      key={slot.id}
                      className={`p-3.5 sm:p-4 rounded-xl border space-y-3 min-w-0 ${
                        editingSlotId === slot.id
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="font-extrabold text-sm sm:text-base text-slate-900 flex flex-wrap items-center gap-1.5">
                          <span>🔹</span>
                          <span>
                            {slot.dayOfWeek || slot.dayName} {slot.date ? `(${slot.date})` : ''} - {slot.time} hs
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 space-y-0.5 min-w-0">
                          <div>👤 <strong>Encargado(s):</strong> {getSlotConductorLabel(slot)}</div>
                          <div>📍 <strong>Ubicación:</strong> {slot.meetingPointName}</div>
                          {slot.meetingPointUrl && (
                            <div className="text-[11px] text-blue-700 flex items-baseline gap-1 min-w-0">
                              <span className="shrink-0">
                                🗺️ <strong>Punto de Encuentro:</strong>
                              </span>
                              <a
                                href={slot.meetingPointUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline truncate min-w-0"
                              >
                                {slot.meetingPointUrl}
                              </a>
                            </div>
                          )}
                          {terrNames && (
                            <div className="text-[11px] text-slate-500">
                              🧭 Territorio(s): {terrNames}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-200/80">
                        <button
                          type="button"
                          onClick={() => handleCopySingleSlotText(slot)}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          title="Copiar texto de esta salida para WhatsApp"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copiar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareSingleSlot(slot)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          title="Enviar esta salida individual a WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>WhatsApp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateSlot(slot)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          title="Clonar salida para la próxima semana (+7 días)"
                        >
                          <Plus className="w-3.5 h-3.5 text-blue-600" />
                          <span>Duplicar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditSlot(slot)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        {safeTerritoryIds[0] && (
                          <button
                            type="button"
                            onClick={() => onOpenTerritoryInMap(safeTerritoryIds[0])}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Map className="w-3.5 h-3.5" />
                            <span>Mapa</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (editingSlotId === slot.id) resetSlotForm();
                            onDeleteScheduleSlot(slot.id);
                          }}
                          className="ml-auto p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer"
                          title="Eliminar salida"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vista previa en vivo del texto tal cual se enviará a WhatsApp */}
              {sortedSchedule.length > 0 && (
                <div className="bg-slate-50 border border-slate-300 rounded-2xl p-4 space-y-2 mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      💬 Vista previa del mensaje de WhatsApp:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyWeeklyScheduleText}
                      className="text-xs font-extrabold px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-800 rounded-lg border border-blue-200 flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copiar todo
                    </button>
                  </div>
                  <div className="text-xs font-mono bg-white p-3.5 rounded-xl border border-slate-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-slate-800 select-all leading-relaxed shadow-inner">
                    {buildWeeklyScheduleWhatsAppMessage(
                      db.congregationName,
                      sortedSchedule,
                      db.territories
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>


          {/* Columna derecha (1/3): Gestión de Conductores y sus PINs de 4 dígitos */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 sm:p-5 space-y-4 h-fit min-w-0">
            <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-700 shrink-0" />
              Conductores y PINs de Acceso
            </h3>
            <p className="text-xs text-slate-600">
              Cada conductor ingresa con su nombre y su PIN de 4 dígitos, y solo
              ve sus propios días asignados.
            </p>

            <form onSubmit={handleCreateConductor} className="space-y-2.5">
              <input
                type="text"
                value={newConductorName}
                onChange={(e) => setNewConductorName(e.target.value)}
                placeholder="Nombre (Ej. Hno. Luis Vega)"
                className="w-full min-w-0 px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                required
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={newConductorPin}
                  onChange={(e) => setNewConductorPin(e.target.value)}
                  placeholder="PIN 4 dígitos (Ej. 5555)"
                  className="flex-1 w-full min-w-0 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                  required
                />
                <button
                  type="submit"
                  className="shrink-0 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-black text-xs rounded-xl cursor-pointer"
                >
                  + Agregar
                </button>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={newConductorIsAdmin}
                  onChange={(e) => setNewConductorIsAdmin(e.target.checked)}
                  className="w-4 h-4 accent-amber-600"
                />
                <span>🛡️ Dar permisos de Administrador</span>
              </label>
            </form>

            <div className="space-y-2 pt-2 border-t border-slate-200">
              {(() => {
                const adminCount = db.conductors.filter((x) => x.isAdmin).length;
                return db.conductors.map((c) => {
                  const isOnlyAdmin = Boolean(c.isAdmin) && adminCount <= 1;
                  return (
                    <div
                      key={c.id}
                      className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm ${
                        c.isAdmin
                          ? 'bg-amber-50/70 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span className="break-words">{c.name}</span>
                          {c.isAdmin && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-200 text-amber-950 text-[10px] font-black uppercase">
                              🛡️ Admin
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          PIN de acceso:{' '}
                          <strong className="font-mono">{c.pin}</strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleConductorAdmin(c.id)}
                          disabled={isOnlyAdmin}
                          title={
                            isOnlyAdmin
                              ? 'Debe quedar al menos un Administrador'
                              : c.isAdmin
                              ? 'Quitar permisos de Administrador'
                              : 'Dar permisos de Administrador'
                          }
                          className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition ${
                            isOnlyAdmin
                              ? 'border-slate-200 text-slate-400 bg-slate-100 cursor-not-allowed'
                              : c.isAdmin
                              ? 'border-amber-300 bg-white hover:bg-amber-100 text-amber-900 cursor-pointer'
                              : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer'
                          }`}
                        >
                          {c.isAdmin ? 'Quitar Admin' : 'Hacer Admin'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteConductor(c.id)}
                          disabled={isOnlyAdmin}
                          className={`p-1.5 rounded-lg ${
                            isOnlyAdmin
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-red-600 hover:bg-red-50 cursor-pointer'
                          }`}
                          title={
                            isOnlyAdmin
                              ? 'No puede eliminar al único Administrador'
                              : 'Eliminar conductor'
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MÓDULO 2 (EXCLUSIVO DEL ADMIN): EDITOR DE PLANTILLAS DE NOTIFICACIONES PUSH */}
      {activeTab === 'notificaciones' && (
        <div className="bg-white rounded-2xl border-2 border-amber-400 p-5 sm:p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold uppercase bg-amber-100 text-amber-900">
                <Bell className="w-3.5 h-3.5" />
                Módulo Exclusivo del Administrador
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                Configuración y Plantillas de Notificaciones Push para
                Conductores
              </h2>
              <p className="text-sm text-slate-600">
                Solo usted como administrador ve esta sección. Edite aquí qué
                dice cada notificación Push que reciben los conductores.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1 shrink-0">
              <div className="font-extrabold text-slate-700">
                Variables automáticas disponibles:
              </div>
              <div className="font-mono text-[11px] text-blue-900">
                {'{conductor}'} {'{dia}'} {'{hora}'} {'{territorio}'}
              </div>
              <div className="font-mono text-[11px] text-blue-900">
                {'{punto_encuentro}'} {'{no_en_casa_pendientes}'}{' '}
                {'{no_visitar}'}
              </div>
            </div>
          </div>

          {pushFeedback && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 font-extrabold text-sm">
              {pushFeedback}
            </div>
          )}

          {/* Selector de salida para previsualizar y enviar Push inmediato */}
          {db.schedule.length > 0 && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs sm:text-sm font-bold text-blue-950">
                Previsualizar o enviar notificación Push para la salida:
              </div>
              <select
                value={previewSlot?.id || ''}
                onChange={(e) => setPreviewSlotId(e.target.value)}
                className="px-3.5 py-2 rounded-xl border-2 border-blue-400 bg-white font-extrabold text-xs sm:text-sm text-slate-900"
              >
                {db.schedule.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.dayName} ({s.time} hs) — {getSlotConductorLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tarjetas editables de las 3 Plantillas Push */}
          <div className="grid grid-cols-1 gap-5">
            {db.notificationTemplates.map((tpl) => {
              const preview = previewSlot
                ? renderPushTemplate(
                    tpl,
                    previewSlot,
                    db.territories,
                    db.housePoints
                  )
                : null;

              return (
                <div
                  key={tpl.id}
                  className="rounded-2xl border-2 border-slate-200 p-4 sm:p-5 space-y-4 bg-slate-50/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-black text-base sm:text-lg text-slate-900">
                        {tpl.name}
                      </h3>
                      <p className="text-xs text-slate-600">
                        {tpl.description}
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tpl.enabled}
                        onChange={(e) =>
                          onUpdateNotificationTemplate({
                            ...tpl,
                            enabled: e.target.checked,
                          })
                        }
                        className="w-4 h-4"
                      />
                      Push Automático Activo
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                          Título de la Notificación Push:
                        </label>
                        <input
                          type="text"
                          value={tpl.titleTemplate}
                          onChange={(e) =>
                            onUpdateNotificationTemplate({
                              ...tpl,
                              titleTemplate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                          Mensaje que verá el Conductor:
                        </label>
                        <textarea
                          rows={3}
                          value={tpl.bodyTemplate}
                          onChange={(e) =>
                            onUpdateNotificationTemplate({
                              ...tpl,
                              bodyTemplate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                          Momento de disparo programado:
                        </label>
                        <input
                          type="text"
                          value={tpl.triggerTimingLabel}
                          onChange={(e) =>
                            onUpdateNotificationTemplate({
                              ...tpl,
                              triggerTimingLabel: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                        />
                      </div>
                    </div>

                    {/* Vista previa en vivo del Push Notification */}
                    <div className="flex flex-col justify-between bg-white rounded-2xl border-2 border-amber-300 p-4 space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-black uppercase text-amber-800">
                          📱 Vista Previa en el Celular de{' '}
                          {previewSlot
                            ? getSlotConductorLabel(previewSlot)
                            : 'Conductor'}
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900 text-white space-y-1 shadow-md">
                          <div className="font-extrabold text-xs sm:text-sm text-amber-300">
                            {preview?.title}
                          </div>
                          <div className="text-xs text-slate-100 leading-relaxed">
                            {preview?.body}
                          </div>
                        </div>
                      </div>

                      {previewSlot && (
                        <button
                          onClick={() =>
                            handleDispatchPushFromTemplate(tpl, previewSlot)
                          }
                          className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition"
                        >
                          <Send className="w-4 h-4" />
                          Enviar esta Notificación Push a{' '}
                          {getSlotConductorLabel(previewSlot)} Ahora
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MÓDULO 3: TERRITORIOS, ASIGNACIONES Y FORMULARIO S-13 */}
      {activeTab === 'nube_s13' && (
        <div className="space-y-5">
          {/* Sub-pestañas para separar Territorios de Historial/PDF S-13 */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-1.5 inline-flex flex-wrap gap-1.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setTerritoriesSubTab('territories')}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs sm:text-sm cursor-pointer transition ${
                territoriesSubTab === 'territories'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              🗺️ Territorios ({db.territories.length})
            </button>
            <button
              type="button"
              onClick={() => setTerritoriesSubTab('s13')}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs sm:text-sm cursor-pointer transition ${
                territoriesSubTab === 's13'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              📄 Historial y PDF S-13 ({db.s13History.length})
            </button>
          </div>

          {territoriesSubTab === 'territories' && (
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 sm:p-6 space-y-4">
              {/* Encabezado, buscador, ordenamiento y vista */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    Territorios y Asignaciones
                  </h2>
                  <p className="text-xs text-slate-500">
                    Mostrando {paginatedTerritoriesForTab.length} de{' '}
                    {filteredTerritoriesForTab.length} territorio(s)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                  <button
                    type="button"
                    onClick={() => openMapEditor(undefined, 'draw_territory')}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Dibujar Territorio</span>
                  </button>

                  <div className="relative flex-1 sm:flex-initial sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={territorySearchQuery}
                      onChange={(e) => setTerritorySearchQuery(e.target.value)}
                      placeholder="Buscar N°, nombre o asignado..."
                      aria-label="Buscar por territorio o asignado"
                      className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                    />
                    {territorySearchQuery && (
                      <button
                        type="button"
                        onClick={() => setTerritorySearchQuery('')}
                        title="Limpiar búsqueda"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <select
                    id="territory-sort-select"
                    value={territorySortBy}
                    onChange={(e) =>
                      setTerritorySortBy(
                        e.target.value as
                          | 'number'
                          | 'oldest_worked'
                          | 'recent_completed'
                          | 'status'
                          | 'assignee'
                      )
                    }
                    aria-label="Ordenar territorios por"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-xs sm:text-sm text-slate-800 cursor-pointer"
                  >
                    <option value="number">Orden: Número (1 → N)</option>
                    <option value="oldest_worked">
                      Más antiguos primero (Prioridad)
                    </option>
                    <option value="recent_completed">
                      Completados recientemente
                    </option>
                    <option value="status">Estado (En curso primero)</option>
                    <option value="assignee">Asignado a (A → Z)</option>
                  </select>

                  <div className="inline-flex rounded-xl border border-slate-300 bg-slate-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setTerritoryViewMode('list')}
                      title="Vista lista compacta"
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer ${
                        territoryViewMode === 'list'
                          ? 'bg-white text-blue-800 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Lista</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerritoryViewMode('cards')}
                      title="Vista tarjetas"
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer ${
                        territoryViewMode === 'cards'
                          ? 'bg-white text-blue-800 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Tarjetas</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Píldoras rápidas de filtro */}
              <div className="flex flex-wrap gap-1.5 pb-1">
                {(
                  [
                    {
                      key: 'all',
                      label: `Todos (${territoryFilterCounts.all})`,
                    },
                    {
                      key: 'unassigned',
                      label: `Sin asignar (${territoryFilterCounts.unassigned})`,
                    },
                    {
                      key: 'assigned',
                      label: `Asignados (${territoryFilterCounts.assigned})`,
                    },
                    {
                      key: 'en_curso',
                      label: `En curso (${territoryFilterCounts.en_curso})`,
                    },
                    {
                      key: 'completado',
                      label: `Completados (${territoryFilterCounts.completado})`,
                    },
                    {
                      key: 'rural_mixto',
                      label: `Rurales / Mixtos (${territoryFilterCounts.rural_mixto})`,
                    },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setTerritoryStatusFilter(chip.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-extrabold border cursor-pointer transition ${
                      territoryStatusFilter === chip.key
                        ? 'bg-blue-700 text-white border-blue-800'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {filteredTerritoriesForTab.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-2">
                  <div className="text-sm font-black text-slate-800">
                    No se encontraron territorios con ese filtro
                  </div>
                  <p className="text-xs text-slate-500">
                    Prueba cambiando el filtro o limpiando la búsqueda.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTerritorySearchQuery('');
                      setTerritoryStatusFilter('all');
                    }}
                    className="mt-1 px-3 py-1.5 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-900 font-extrabold text-xs cursor-pointer"
                  >
                    Mostrar todos los territorios
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className={
                      territoryViewMode === 'list'
                        ? 'space-y-2.5'
                        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                    }
                  >
                    {paginatedTerritoriesForTab.map((t) => {
                      const tBlocks = db.blocks
                        .filter((b) => b.territoryId === t.id)
                        .sort((a, b) => compareBlockCodes(a.code, b.code));
                      const doneBlocks = tBlocks.filter(
                        (b) => b.status === 'completada'
                      );
                      const tNotAtHome = db.housePoints.filter(
                        (p) =>
                          p.territoryId === t.id && p.status === 'no_en_casa'
                      );
                      const tNoVisitar = db.housePoints.filter(
                        (p) =>
                          p.territoryId === t.id && p.category === 'no_visitar'
                      );
                      const latestS13ForTerritory = db.s13History.find(
                        (r) => r.territoryId === t.id
                      );
                      const lastCompletedDate =
                        t.completedAt ||
                        t.lastCompletedAt ||
                        latestS13ForTerritory?.completedAt;
                      const currentNoteDraft =
                        assignmentNotesDraft[t.id] ?? t.assignmentNotes ?? '';
                      const assignees = getTerritoryAssignees(t);
                      const isExpanded =
                        territoryViewMode === 'cards' ||
                        Boolean(expandedTerritoryIds[t.id]);
                      const blockPct =
                        tBlocks.length > 0
                          ? Math.round(
                              (doneBlocks.length / tBlocks.length) * 100
                            )
                          : 0;

                      const renderDetailsBody = () => (
                        <div className="space-y-3 pt-2">
                          {/* Asignación Directa / Personal (Varias personas) */}
                          <div className="bg-white rounded-xl p-3 border border-blue-200 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[11px] font-black uppercase text-blue-900 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                Asignado a ({assignees.length}):
                              </label>
                              <button
                                type="button"
                                onClick={async () => {
                                  await copyTextToClipboard(
                                    getPublisherTerritoryLink(t.id)
                                  );
                                  setCopiedTerritoryLinkId(t.id);
                                  setTimeout(
                                    () => setCopiedTerritoryLinkId(null),
                                    2500
                                  );
                                }}
                                className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                title="Copiar enlace de publicadores para este territorio"
                              >
                                <Link2 className="w-3 h-3" />
                                {copiedTerritoryLinkId === t.id
                                  ? '¡Link copiado!'
                                  : 'Link Publicadores'}
                              </button>
                            </div>

                            {assignees.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {assignees.map((a, idx) => (
                                  <span
                                    key={`${a.id}-${a.name}-${idx}`}
                                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-950 text-xs font-bold"
                                  >
                                    <span>
                                      {a.name}
                                      {idx === 0 && assignees.length > 1
                                        ? ' (1° S-13)'
                                        : ''}
                                    </span>
                                    {a.assignedAt && (
                                      <span className="text-[10px] text-blue-700 font-normal">
                                        {a.assignedAt}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = assignees.filter(
                                          (_, i) => i !== idx
                                        );
                                        onUpdateTerritoryAssignees(
                                          t.id,
                                          next,
                                          currentNoteDraft
                                        );
                                      }}
                                      className="w-4 h-4 rounded hover:bg-blue-200 flex items-center justify-center cursor-pointer font-black"
                                      title="Quitar persona"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}

                            <select
                              value=""
                              onChange={(e) => {
                                const cid = e.target.value;
                                if (!cid) return;
                                const cond = db.conductors.find(
                                  (c) => c.id === cid
                                );
                                if (!cond) return;
                                const next: TerritoryAssignee[] = [
                                  ...assignees,
                                  {
                                    id: cond.id,
                                    name: cond.name,
                                    assignedAt: todayIso,
                                  },
                                ];
                                onUpdateTerritoryAssignees(
                                  t.id,
                                  next,
                                  currentNoteDraft
                                );
                              }}
                              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-bold text-xs text-slate-900"
                            >
                              <option value="">
                                + Agregar persona asignada...
                              </option>
                              {db.conductors
                                .filter(
                                  (c) =>
                                    !assignees.some(
                                      (a) => a.id === c.id || a.name === c.name
                                    )
                                )
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                            </select>

                            {assignees.length > 0 && (
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={currentNoteDraft}
                                  onChange={(e) =>
                                    setAssignmentNotesDraft((prev) => ({
                                      ...prev,
                                      [t.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Nota opcional para el asignado..."
                                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateTerritoryAssignees(
                                      t.id,
                                      assignees,
                                      currentNoteDraft
                                    )
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 font-extrabold text-[11px] cursor-pointer shrink-0"
                                >
                                  Guardar nota
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Estado y fecha de completado de cada manzana */}
                          {tBlocks.length > 0 && (
                            <div className="bg-white rounded-xl p-2.5 border border-slate-200 space-y-1.5">
                              <div className="text-[11px] font-black uppercase text-slate-600">
                                Fechas por Manzana ({tBlocks.length}):
                              </div>
                              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                {tBlocks.map((b) => {
                                  const blockDoneDate =
                                    b.completedAt ||
                                    b.lastCompletedAt ||
                                    b.lastWorkedAt;
                                  const isDone = b.status === 'completada';
                                  return (
                                    <div
                                      key={b.id}
                                      className="flex items-center justify-between gap-2 text-[11px] py-1 px-2 rounded-lg bg-slate-50 border border-slate-200"
                                    >
                                      <span className="font-extrabold text-slate-800">
                                        Mz {b.code}
                                      </span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span
                                          className={`px-1.5 py-0.5 rounded font-bold ${
                                            isDone
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : b.status === 'en_progreso'
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-slate-200 text-slate-700'
                                          }`}
                                        >
                                          {isDone
                                            ? '✓ Completada'
                                            : b.status === 'en_progreso'
                                            ? 'En progreso'
                                            : 'Pendiente'}
                                        </span>
                                        <span className="font-mono text-slate-600">
                                          {blockDoneDate || 'Sin fecha'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Lista rápida de los No en casa de ese territorio */}
                          {tNotAtHome.length > 0 && (
                            <div className="bg-white rounded-xl p-2.5 border border-amber-200 space-y-1.5 max-h-36 overflow-y-auto">
                              {tNotAtHome.map((p) => (
                                <div
                                  key={p.id}
                                  className="text-xs flex items-center justify-between gap-2"
                                >
                                  <span className="truncate">
                                    <Home className="w-3 h-3 inline text-amber-600 mr-1" />
                                    {p.blockCode ? `[${p.blockCode}] ` : ''}
                                    {p.label}
                                  </span>
                                  <a
                                    href={getGoogleMapsNavigationUrl(
                                      p.lat,
                                      p.lng
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-700 font-bold hover:underline shrink-0"
                                  >
                                    Maps
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => onOpenTerritoryInMap(t.id)}
                              className="flex-1 min-w-[140px] py-2 px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs cursor-pointer"
                            >
                              🗺️ Abrir en Mapa
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                openMapEditor(t.id, 'edit_territory')
                              }
                              className="flex-1 min-w-[130px] py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer"
                            >
                              ✏️ Editar bordes
                            </button>

                            <button
                              type="button"
                              onClick={() => openMapEditor(t.id, 'draw_block')}
                              className="flex-1 min-w-[145px] py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                            >
                              + Dibujar Manzana
                            </button>

                            {t.status !== 'completado' && (
                              <button
                                type="button"
                                onClick={() => onCompleteWholeTerritory(t.id)}
                                className="flex-1 min-w-[140px] py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                              >
                                ✓ Marcar Completo
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `¿Reiniciar ${t.name} para un nuevo ciclo? Se limpiarán las marcas de manzanas y casas "No en casa", conservando todas las direcciones "NO VISITAR".`
                                  )
                                ) {
                                  onResetTerritory(t.id);
                                }
                              }}
                              className="flex-1 min-w-[160px] py-2 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Reiniciar (Conserva NO VISITAR)
                            </button>
                          </div>
                        </div>
                      );

                      if (territoryViewMode === 'list') {
                        return (
                          <div
                            key={t.id}
                            className={`rounded-2xl border-2 p-3.5 transition ${
                              t.status === 'completado'
                                ? 'border-emerald-300 bg-emerald-50/40'
                                : 'border-slate-200 bg-slate-50/70'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              {/* Identificación */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-9 h-9 rounded-xl bg-slate-900 text-white font-black text-sm flex items-center justify-center shrink-0">
                                  {t.number}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-black text-sm sm:text-base text-slate-900">
                                      {t.name}
                                    </span>
                                    {t.type !== 'urbano' && (
                                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                                        {t.type}
                                      </span>
                                    )}
                                    <span
                                      className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                                        t.status === 'completado'
                                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                          : 'bg-blue-100 text-blue-900'
                                      }`}
                                    >
                                      {t.status === 'completado'
                                        ? 'Completado — Listo para reiniciar'
                                        : 'En curso'}
                                    </span>
                                  </div>

                                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                    <span>
                                      <strong>Asignado:</strong>{' '}
                                      {assignees.length > 0
                                        ? assignees.map((a) => a.name).join(', ')
                                        : 'Sin asignar'}
                                    </span>
                                    {lastCompletedDate && (
                                      <span>
                                        <strong>Últ. completado:</strong>{' '}
                                        {lastCompletedDate}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Métricas rápidas y botones */}
                              <div className="flex flex-wrap items-center gap-2 ml-auto">
                                {tBlocks.length > 0 && (
                                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold">
                                    <div className="w-12 h-2 bg-slate-200 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-emerald-600"
                                        style={{ width: `${blockPct}%` }}
                                      />
                                    </div>
                                    <span className="text-slate-800">
                                      {doneBlocks.length}/{tBlocks.length} mz
                                    </span>
                                  </div>
                                )}

                                {tNotAtHome.length > 0 && (
                                  <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-extrabold">
                                    🏠 {tNotAtHome.length}
                                  </span>
                                )}

                                {tNoVisitar.length > 0 && (
                                  <span className="px-2 py-1 rounded-lg bg-red-100 text-red-900 text-xs font-extrabold">
                                    🛑 {tNoVisitar.length}
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => onOpenTerritoryInMap(t.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs cursor-pointer"
                                >
                                  Mapa
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openMapEditor(t.id, 'edit_territory')
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer"
                                >
                                  Editar
                                </button>

                                {t.status === 'completado' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `¿Reiniciar ${t.name} para el próximo ciclo? Se limpiarán manzanas y casas "No en casa", conservando los "NO VISITAR".`
                                        )
                                      ) {
                                        onResetTerritory(t.id);
                                      }
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    Reiniciar
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedTerritoryIds((prev) => ({
                                      ...prev,
                                      [t.id]: !prev[t.id],
                                    }))
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span>
                                    {isExpanded ? 'Ocultar' : 'Gestionar'}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                {renderDetailsBody()}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Vista Tarjetas
                      return (
                        <div
                          key={t.id}
                          className="rounded-2xl border-2 border-slate-200 p-4 space-y-2.5 bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-base text-slate-900">
                              {t.name}
                            </span>
                            <span
                              className={`text-xs font-extrabold px-2.5 py-0.5 rounded uppercase ${
                                t.status === 'completado'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-blue-100 text-blue-900'
                              }`}
                            >
                              {t.status === 'completado'
                                ? 'Completado'
                                : 'En curso'}
                            </span>
                          </div>

                          <div className="text-xs text-slate-700 space-y-1">
                            <div>
                              • Última vez completado:{' '}
                              <strong className="text-emerald-800">
                                {lastCompletedDate || 'Aún no registrado'}
                              </strong>
                            </div>
                            <div>
                              • Manzanas completadas:{' '}
                              <strong>
                                {doneBlocks.length}/{tBlocks.length}
                              </strong>
                            </div>
                            <div>
                              • Casas "No en casa":{' '}
                              <strong className="text-amber-800">
                                {tNotAtHome.length}
                              </strong>
                            </div>
                            <div>
                              • Direcciones NO VISITAR:{' '}
                              <strong className="text-red-700">
                                {tNoVisitar.length}
                              </strong>
                            </div>
                          </div>

                          {renderDetailsBody()}
                        </div>
                      );
                    })}
                  </div>

                  {/* Paginación */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-600">Mostrar:</span>
                      <select
                        value={territoryPageSize}
                        onChange={(e) =>
                          setTerritoryPageSize(Number(e.target.value))
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                      >
                        <option value={25}>25 por página</option>
                        <option value={50}>50 por página</option>
                        <option value={9999}>Ver todos</option>
                      </select>
                    </div>

                    {totalTerritoryPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safeTerritoryPage <= 1}
                          onClick={() =>
                            setTerritoryPage((p) => Math.max(1, p - 1))
                          }
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-bold text-slate-800 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Anterior
                        </button>
                        <span className="font-extrabold text-slate-700">
                          Página {safeTerritoryPage} de {totalTerritoryPages}
                        </span>
                        <button
                          type="button"
                          disabled={safeTerritoryPage >= totalTerritoryPages}
                          onClick={() =>
                            setTerritoryPage((p) =>
                              Math.min(totalTerritoryPages, p + 1)
                            )
                          }
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-bold text-slate-800 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Siguiente
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Sub-pestaña Historial y Descarga Oficial S-13 (PDF + CSV) */}
          {territoriesSubTab === 's13' && (
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    Registro Oficial de Asignación de Territorio (S-13)
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                    Descarga la hoja oficial S-13-S lista para guardar o
                    imprimir, o exporta la tabla a Excel.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
                    <label
                      htmlFor="s13-service-year"
                      className="text-xs font-extrabold text-slate-700"
                    >
                      Año de servicio:
                    </label>
                    <select
                      id="s13-service-year"
                      value={selectedServiceYear}
                      onChange={(e) => setSelectedServiceYear(e.target.value)}
                      className="bg-transparent font-black text-xs sm:text-sm text-blue-900 focus:outline-none cursor-pointer"
                    >
                      {availableServiceYears.map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                      <option value="todos">Todos los años</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => downloadS13Pdf(db, selectedServiceYear)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-black text-xs sm:text-sm cursor-pointer shadow-sm"
                  >
                    <FileDown className="w-4 h-4 text-amber-300" />
                    Descargar PDF Oficial (S-13)
                  </button>

                  <button
                    type="button"
                    onClick={handleExportS13Csv}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    CSV / Excel
                  </button>
                </div>
              </div>

              {db.s13History.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-600">
                  Aún no hay ciclos completados en el historial S-13. Cuando un
                  conductor o administrador marque un territorio como completado,
                  aparecerá aquí. (Igualmente puedes descargar el formulario PDF
                  con las asignaciones activas o en blanco).
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th className="py-2.5 px-3 font-extrabold">
                          Territorio
                        </th>
                        <th className="py-2.5 px-3 font-extrabold">
                          Asignado a (1° en ciclo)
                        </th>
                        <th className="py-2.5 px-3 font-extrabold">
                          Fecha Inicio
                        </th>
                        <th className="py-2.5 px-3 font-extrabold">
                          Fecha Completado
                        </th>
                        <th className="py-2.5 px-3 font-extrabold">Notas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {db.s13History.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {rec.territoryName}
                          </td>
                          <td className="py-2.5 px-3">{rec.assignedTo}</td>
                          <td className="py-2.5 px-3">{rec.startedAt}</td>
                          <td className="py-2.5 px-3 font-bold text-emerald-700">
                            {rec.completedAt}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {rec.notes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MÓDULO EDITOR DE MAPAS (BORDES DE TERRITORIOS Y MANZANAS) */}
      {activeTab === 'editor' && (
        <MapEditorView
          territories={db.territories}
          blocks={db.blocks}
          housePoints={db.housePoints}
          focusRequest={editorFocusRequest}
          onSaveTerritory={onSaveTerritory}
          onCreateTerritory={onCreateTerritory}
          onDeleteTerritory={onDeleteTerritory}
          onSaveBlock={onSaveBlock}
          onCreateBlock={onCreateBlock}
          onDeleteBlock={onDeleteBlock}
        />
      )}

      {/* MÓDULO 5: AJUSTES Y CONECTOR NUBE */}
      {activeTab === 'ajustes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-4">
              <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-700" />
                Datos de la Congregación y Acceso Admin
              </h3>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Nombre de la Congregación:
                </label>
                <input
                  type="text"
                  value={congNameEdit}
                  onChange={(e) => setCongNameEdit(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-semibold text-sm"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950">
                <strong>Acceso unificado:</strong> Los permisos de Administrador
                se asignan directamente a cada conductor desde la pestaña{' '}
                <strong>Programa y Conductores</strong>. Quien tenga permisos
                puede alternar entre su vista de conductor y este panel desde la
                barra superior.
              </div>

              <button
                onClick={() => {
                  onUpdateCongregationSettings(congNameEdit, db.adminPin);
                  setSettingsSavedMsg('✅ Nombre de la congregación guardado.');
                  setTimeout(() => setSettingsSavedMsg(''), 3000);
                }}
                className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-black text-sm rounded-xl cursor-pointer"
              >
                Guardar Nombre
              </button>

              {settingsSavedMsg && (
                <div className="text-xs font-bold text-emerald-700">
                  {settingsSavedMsg}
                </div>
              )}

              {onLaunchStartupWizard && (
                <div className="pt-3 border-t border-slate-200">
                  <button
                    onClick={onLaunchStartupWizard}
                    className="w-full py-2.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-extrabold text-xs sm:text-sm rounded-xl cursor-pointer transition"
                  >
                    🪄 Abrir Asistente de Configuración Inicial (Desde Cero)
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-indigo-700" />
                  Sincronización en la Nube (Supabase)
                </h3>
                {hasEnvSupabase && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-black">
                    ✓ Configurado por Variables de Entorno
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                Todos los dispositivos conectados sincronizan automáticamente los
                territorios, manzanas, "No en casa" y notificaciones usando la
                tabla <code>congregation_state</code> de Supabase.
              </p>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Supabase Project URL:
                </label>
                <input
                  type="text"
                  value={cloudCfg.supabaseUrl}
                  onChange={(e) =>
                    setCloudCfg({ ...cloudCfg, supabaseUrl: e.target.value })
                  }
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Supabase Anon Key:
                </label>
                <input
                  type="password"
                  value={cloudCfg.supabaseAnonKey}
                  onChange={(e) =>
                    setCloudCfg({
                      ...cloudCfg,
                      supabaseAnonKey: e.target.value,
                    })
                  }
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  ID de Congregación (por defecto: main):
                </label>
                <input
                  type="text"
                  value={cloudCfg.congregationId || 'main'}
                  onChange={(e) =>
                    setCloudCfg({ ...cloudCfg, congregationId: e.target.value })
                  }
                  placeholder="main"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <button
                type="button"
                disabled={isSyncingCloud}
                onClick={async () => {
                  const cleanCfg: CloudSyncConfig = {
                    supabaseUrl: cloudCfg.supabaseUrl.trim(),
                    supabaseAnonKey: cloudCfg.supabaseAnonKey.trim(),
                    congregationId:
                      (cloudCfg.congregationId || 'main').trim() || 'main',
                    enabled: Boolean(
                      cloudCfg.supabaseUrl.trim() &&
                        cloudCfg.supabaseAnonKey.trim()
                    ),
                  };
                  saveCloudConfig(cleanCfg);
                  setCloudCfg(cleanCfg);
                  if (!cleanCfg.enabled) {
                    setCloudSyncStatusMsg(
                      '⚠️ Ingrese Supabase Project URL y Anon Key para activar la nube.'
                    );
                    return;
                  }
                  setIsSyncingCloud(true);
                  setCloudSyncStatusMsg(
                    '⏳ Subiendo datos actuales a Supabase...'
                  );
                  const result = await pushDatabaseToSupabase(db, cleanCfg);
                  setIsSyncingCloud(false);
                  if (result.ok) {
                    setCloudSyncStatusMsg(
                      '✅ Conectado y datos actuales guardados en Supabase.'
                    );
                  } else {
                    setCloudSyncStatusMsg(
                      `❌ ${result.error || 'No se pudo conectar con Supabase.'}`
                    );
                  }
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSyncingCloud
                  ? 'Sincronizando...'
                  : '☁️ Guardar y Subir Datos Actuales a Supabase'}
              </button>
              {cloudSyncStatusMsg && (
                <div className="text-xs font-bold p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800">
                  {cloudSyncStatusMsg}
                </div>
              )}
            </div>
          </div>

          {/* Copia de Seguridad Completa (.json) */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
                  <Download className="w-5 h-5 text-emerald-700" />
                  Copia de Seguridad Completa (.json)
                </h3>
                <p className="text-xs text-slate-600">
                  Descargue todo el sistema en un archivo (territorios, manzanas,
                  casas, conductores, programa e historial S-13) o restáurelo en
                  otra URL o dispositivo.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDownloadFullBackup}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                💾 Descargar Copia de Seguridad (.json)
              </button>

              <label className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 font-black text-sm rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer">
                <FileUp className="w-4 h-4 text-blue-700" />
                📂 Restaurar Copia de Seguridad (.json)
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreBackupFile}
                  className="hidden"
                />
              </label>
            </div>

            {backupStatusMsg && (
              <div className="text-xs font-bold p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900">
                {backupStatusMsg}
              </div>
            )}
          </div>

        {/* Sección Importar y Exportar Mapas KML dentro de Ajustes */}
        <div className="mt-8 pt-8 border-t-2 border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FileUp className="w-5 h-5 text-blue-700" />
              Importar o Exportar Mapas (Google My Maps)
            </h3>
            <button
              type="button"
              onClick={() =>
                handleExportGoogleMapsKml(
                  db.territories,
                  `Mapas_${db.congregationName || 'Congregacion'}_Google_Maps`
                )
              }
              disabled={db.territories.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              🌍 Exportar Todo para Google Maps (.KML)
            </button>
          </div>
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 sm:p-6 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Importar los 2 Archivos desde Google My Maps (`.kml` o `.kmz`)
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Suba por separado el <strong>Archivo 1 (Territorios)</strong> y
                el <strong>Archivo 2 (Manzanas y Casas)</strong>.
              </p>
            </div>
            <button
              onClick={handleLoadSampleTwoFiles}
              className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 font-extrabold text-xs sm:text-sm cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Probar con los 2 KML de ejemplo
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/40 p-5 space-y-3">
              <span className="px-2.5 py-1 rounded-lg bg-blue-700 text-white font-black text-xs uppercase">
                Archivo 1 • Territorios Individuales
              </span>
              <h3 className="font-extrabold text-base text-slate-900">
                Mapa de Contornos de Territorios (Territorio 1, 2, 3...)
              </h3>
              <label className="block w-full py-3 px-4 bg-white hover:bg-blue-50 text-blue-900 border-2 border-blue-300 rounded-xl font-extrabold text-sm text-center cursor-pointer transition">
                📂 Seleccionar Archivo 1 (.kml / .kmz)
                <input
                  type="file"
                  accept=".kml,.kmz,.xml"
                  onChange={handleFile1Upload}
                  className="hidden"
                />
              </label>
              {file1Name && (
                <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                  ✓ Cargado: {file1Name} ({parsedTerritoriesPreview.length}{' '}
                  territorios)
                </div>
              )}
            </div>

            <div className="rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50/40 p-5 space-y-3">
              <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-black text-xs uppercase">
                Archivo 2 • Manzanas y Casas
              </span>
              <h3 className="font-extrabold text-base text-slate-900">
                Mapa de Manzanas (1A, 1B, 2A...) y Casas Rurales
              </h3>
              <label className="block w-full py-3 px-4 bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-400 rounded-xl font-extrabold text-sm text-center cursor-pointer transition">
                📂 Seleccionar Archivo 2 (.kml / .kmz)
                <input
                  type="file"
                  accept=".kml,.kmz,.xml"
                  onChange={handleFile2Upload}
                  className="hidden"
                />
              </label>
              {file2Name && (
                <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                  ✓ Cargado: {file2Name} ({parsedBlocksPreview.length} manzanas,{' '}
                  {parsedPointsPreview.length} casas/puntos)
                </div>
              )}
            </div>
          </div>

          {importStatusMsg && (
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 font-bold text-sm text-slate-900">
              {importStatusMsg}
            </div>
          )}

          {(parsedTerritoriesPreview.length > 0 ||
            parsedBlocksPreview.length > 0) && (
            <div className="border-2 border-emerald-400 bg-emerald-50/40 rounded-2xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-black text-base text-emerald-950 flex items-center gap-2">
                  <FolderGit2 className="w-5 h-5 text-emerald-700" />
                  Vista Previa de Vinculación (Archivo 1 + Archivo 2)
                </h4>

                <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceExistingOnImport}
                    onChange={(e) =>
                      setReplaceExistingOnImport(e.target.checked)
                    }
                    className="w-4 h-4"
                  />
                  Reemplazar mapas anteriores al guardar
                </label>
              </div>

              <button
                onClick={handleConfirmImport}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base rounded-xl shadow-md cursor-pointer transition"
              >
                ✅ Confirmar y Guardar Estos Mapas en la Nube
              </button>
            </div>
          )}
        </div>
        </div>
        </div>
      )}

      {/* MÓDULO 6: CENTRO DE AYUDA Y MANUAL DE USUARIO */}
      {activeTab === 'ayuda' && (
        <HelpCenterModal
          inline={true}
          initialCategory="admin"
          congregationName={db.congregationName}
        />
      )}
    </div>
  );
};
