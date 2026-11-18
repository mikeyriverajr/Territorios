import React, { useMemo, useState } from 'react';
import {
  Edit3,
  Save,
  Share2,
  Bell,
  Calendar,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  FileSpreadsheet,
  FileUp,
  FolderGit2,
  Home,
  Map,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
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
  openWhatsAppShare,
  renderPushTemplate,
  triggerBrowserNotification,
} from '../services/notificationHelper';
import {
  CloudSyncConfig,
  getEnvCloudConfig,
  loadCloudConfig,
  pushDatabaseToSupabase,
  sanitizeDatabase,
  saveCloudConfig,
} from '../services/storageAndSync';
import { MapEditorView } from './MapEditorView';

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
  onImportMapsData: (
    newTerritories: Territory[],
    newBlocks: Block[],
    newPoints: HousePoint[],
    replaceAll: boolean
  ) => void;
  onAddConductor: (name: string, pin: string, isAdmin?: boolean) => void;
  onToggleConductorAdmin: (conductorId: string) => void;
  onDeleteConductor: (conductorId: string) => void;
  onAddScheduleSlot: (slot: Omit<ScheduleSlot, 'id'>) => void;
  onUpdateScheduleSlot: (slot: ScheduleSlot) => void;
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
    slotId?: string;
    title: string;
    body: string;
  }) => void;
  onCompleteWholeTerritory: (territoryId: string) => void;
  onResetTerritory: (territoryId: string) => void;
  onAssignTerritory: (
    territoryId: string,
    conductorId: string,
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
  onAssignTerritory,
  onUpdateCustomLocations,
  onUpdateCongregationSettings,
  onRestoreFullBackup,
  onLaunchStartupWizard,
}) => {
  const db = useMemo(() => sanitizeDatabase(rawDb || {}), [rawDb]);

  const [activeTab, setActiveTab] = useState<
    'programa' | 'notificaciones' | 'nube_s13' | 'editor' | 'ajustes'
  >('programa');

  // Estados para Conductores
  const [newConductorName, setNewConductorName] = useState<string>('');
  const [newConductorPin, setNewConductorPin] = useState<string>('');
  const [newConductorIsAdmin, setNewConductorIsAdmin] = useState<boolean>(false);

  // Estados para Programa Semanal (asignación por fecha + día de la semana)
  const todayIso = new Date().toISOString().slice(0, 10);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotDate, setSlotDate] = useState<string>(todayIso);
  const [dayOfWeek, setDayOfWeek] = useState<string>(dayOfWeekFromDate(todayIso));
  const [shiftLabel, setShiftLabel] = useState<string>('Mañana');
  const [time, setTime] = useState<string>('09:30');
  const [selectedConductorId, setSelectedConductorId] = useState<string>(
    db.conductors[0]?.id || ''
  );
  const [meetingPointName, setMeetingPointName] = useState<string>('');
  const [meetingPointUrl, setMeetingPointUrl] = useState<string>('');
  const [selectedTerritoryIds, setSelectedTerritoryIds] = useState<string[]>([]);
  const [territoryToAdd, setTerritoryToAdd] = useState<string>('');
  const [slotNotes, setSlotNotes] = useState<string>('');

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
  const [confirmedReassignments, setConfirmedReassignments] = useState<
    Record<string, string>
  >({});
  const [territorySortBy, setTerritorySortBy] = useState<
    'number' | 'oldest_worked' | 'recent_completed' | 'status' | 'assignee'
  >('number');
  const hasEnvSupabase = getEnvCloudConfig().enabled;

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
    setMeetingPointName('');
    setMeetingPointUrl('');
    setSelectedTerritoryIds([]);
    setConfirmedReassignments({});
    setSlotNotes('');
  };

  const handleStartEditSlot = (slot: ScheduleSlot) => {
    setEditingSlotId(slot.id);
    setSlotDate(slot.date || todayIso);
    setDayOfWeek(slot.dayOfWeek || dayOfWeekFromDate(slot.date || todayIso));
    const shift = slot.dayName.replace(slot.dayOfWeek || '', '').trim();
    setShiftLabel(shift || 'Mañana');
    setTime(slot.time);
    setSelectedConductorId(slot.conductorId);
    setMeetingPointName(slot.meetingPointName);
    setMeetingPointUrl(slot.meetingPointUrl);
    setSelectedTerritoryIds(slot.territoryIds);
    setConfirmedReassignments({});
    setSlotNotes(slot.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const cond = db.conductors.find((c) => c.id === selectedConductorId);
    if (!cond || !meetingPointName.trim() || selectedTerritoryIds.length === 0)
      return;

    const conflictingTerritories = selectedTerritoryIds
      .map((id) => db.territories.find((t) => t.id === id))
      .filter((t): t is Territory => {
        if (!t) return false;
        if (confirmedReassignments[t.id] === cond.id) return false;
        return (
          (Boolean(t.assignedToId) && t.assignedToId !== cond.id) ||
          (Boolean(t.assignedToName) && t.assignedToName !== cond.name)
        );
      });

    if (conflictingTerritories.length > 0) {
      const detail = conflictingTerritories
        .map(
          (t) =>
            `• ${t.name} (asignado actualmente a ${t.assignedToName || 'otro hermano'})`
        )
        .join('\n');
      const confirmed = window.confirm(
        `⚠️ Atención: los siguientes territorios pertenecen a otra persona:\n${detail}\n\n¿Desea reasignarlos a ${cond.name}?`
      );
      if (!confirmed) return;
    }

    const payload: Omit<ScheduleSlot, 'id'> = {
      dayName: `${dayOfWeek} ${shiftLabel}`.trim(),
      dayOfWeek,
      date: slotDate,
      time,
      conductorId: cond.id,
      conductorName: cond.name,
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
      onUpdateScheduleSlot({ ...payload, id: editingSlotId });
    } else {
      onAddScheduleSlot(payload);
    }
    resetSlotForm();
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
        const aa = a.assignedToName || '';
        const ab = b.assignedToName || '';
        if (!aa && ab) return 1;
        if (aa && !ab) return -1;
        const cmp = aa.localeCompare(ab);
        return cmp !== 0 ? cmp : a.number - b.number;
      }
      return a.number - b.number;
    });
    return list;
  }, [db.territories, db.blocks, db.s13History, territorySortBy]);

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
    setSelectedConductorId(slot.conductorId);
    setMeetingPointName(slot.meetingPointName);
    setMeetingPointUrl(slot.meetingPointUrl);
    setSelectedTerritoryIds(slot.territoryIds);
    setConfirmedReassignments({});
    setSlotNotes(slot.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCopiedScheduleToast(`📋 Salida clonada (+7 días: ${nextDate}). Modifique los datos y pulse Publicar Salida`);
    setTimeout(() => setCopiedScheduleToast(null), 4000);
  };

  const handleDuplicateWholeWeek = () => {
    if (sortedSchedule.length === 0) return;
    sortedSchedule.forEach((slot) => {
      let nextDate = slot.date;
      try {
        const d = new Date(slot.date + 'T12:00:00');
        d.setDate(d.getDate() + 7);
        nextDate = d.toISOString().slice(0, 10);
      } catch {
        // fallback
      }
      onAddScheduleSlot({
        dayName: slot.dayName,
        dayOfWeek: slot.dayOfWeek,
        date: nextDate,
        time: slot.time,
        conductorId: slot.conductorId,
        conductorName: slot.conductorName,
        meetingPointName: slot.meetingPointName,
        meetingPointUrl: slot.meetingPointUrl,
        territoryIds: slot.territoryIds,
        notes: slot.notes,
      });
    });
    setCopiedScheduleToast(`✅ ${sortedSchedule.length} salidas duplicadas para la próxima semana (+7 días)`);
    setTimeout(() => setCopiedScheduleToast(null), 4000);
  };

  const handleDispatchPushFromTemplate = async (
    tpl: PushNotificationTemplate,
    slot: ScheduleSlot
  ) => {
    const rendered = renderPushTemplate(
      tpl,
      slot,
      db.territories,
      db.housePoints
    );
    onSendPushNotificationToConductor({
      conductorId: slot.conductorId,
      conductorName: slot.conductorName,
      slotId: slot.id,
      title: rendered.title,
      body: rendered.body,
    });
    await triggerBrowserNotification(rendered.title, rendered.body);
    setPushFeedback(
      `🔔 Notificación Push enviada a ${slot.conductorName}: "${rendered.title}"`
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
            {/* Pestañas del Siervo de Territorios / Admin (sin números) */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-2 flex flex-wrap gap-1.5 shadow-xs">
        {(
          [
            { key: 'programa', label: 'Programa y Conductores', icon: Calendar },
            { key: 'notificaciones', label: 'Notificaciones Push', icon: Bell },
            { key: 'nube_s13', label: 'Territorios y S-13', icon: FileSpreadsheet },
            { key: 'editor', label: 'Editor de Mapas', icon: Edit3 },
            { key: 'ajustes', label: 'Ajustes', icon: Cloud },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition ${
                activeTab === tab.key
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* PROGRAMA SEMANAL, ASIGNACIÓN DE TERRITORIOS Y CONDUCTORES */}
      {activeTab === 'programa' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <form
              onSubmit={handleCreateSlot}
              className={`bg-white rounded-2xl border-2 p-5 sm:p-6 space-y-4 shadow-xs ${
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
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
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-semibold text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Día:
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => {
                      setDayOfWeek(e.target.value);
                      setSlotDate(shiftDateToDayOfWeek(slotDate, e.target.value));
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Turno:
                  </label>
                  <select
                    value={shiftLabel}
                    onChange={(e) => setShiftLabel(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                  >
                    <option value="Mañana">Mañana</option>
                    <option value="Tarde">Tarde</option>
                    <option value="Noche">Noche</option>
                    <option value="">(Sin turno)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Hora:
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-semibold text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Encargado:
                  </label>
                  <select
                    value={selectedConductorId}
                    onChange={(e) => setSelectedConductorId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                    required
                  >
                    <option value="" disabled>
                      Elegir encargado...
                    </option>
                    {db.conductors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-extrabold uppercase text-slate-600">
                      Ubicación:
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowLocationManager((v) => !v)}
                      className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-2 py-0.5 cursor-pointer"
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
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-sm bg-white"
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
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Punto de Encuentro (Link Maps):
                  </label>
                  <input
                    type="text"
                    value={meetingPointUrl}
                    onChange={(e) => setMeetingPointUrl(e.target.value)}
                    placeholder="https://maps.app.goo.gl/..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
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
                      className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                    />
                    <input
                      type="text"
                      value={newLocUrl}
                      onChange={(e) => setNewLocUrl(e.target.value)}
                      placeholder="Link Google Maps (opcional)"
                      className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
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
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Territorio(s):
                </label>
                <div className="flex gap-2">
                  <select
                    value={territoryToAdd}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id && !selectedTerritoryIds.includes(id)) {
                        const terr = db.territories.find((t) => t.id === id);
                        const cond = db.conductors.find(
                          (c) => c.id === selectedConductorId
                        );
                        if (terr && cond) {
                          const assignedToOther =
                            (Boolean(terr.assignedToId) &&
                              terr.assignedToId !== cond.id) ||
                            (Boolean(terr.assignedToName) &&
                              terr.assignedToName !== cond.name);
                          if (assignedToOther) {
                            const confirmed = window.confirm(
                              `⚠️ El ${terr.name} ya está asignado a ${
                                terr.assignedToName || 'otra persona'
                              }.\n\n¿Desea reasignarlo a ${cond.name}?`
                            );
                            if (!confirmed) {
                              setTerritoryToAdd('');
                              return;
                            }
                            setConfirmedReassignments((prev) => ({
                              ...prev,
                              [terr.id]: cond.id,
                            }));
                          }
                        }
                        setSelectedTerritoryIds([...selectedTerritoryIds, id]);
                      }
                      setTerritoryToAdd('');
                    }}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-sm bg-white"
                  >
                    <option value="">+ Agregar territorio...</option>
                    {db.territories
                      .filter((t) => !selectedTerritoryIds.includes(t.id))
                      .map((t) => {
                        const lastWorked = getTerritoryLastWorkedDate(t);
                        const assigneeText = t.assignedToName
                          ? `Asignado: ${t.assignedToName}`
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
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-blue-100 text-blue-900 text-xs font-extrabold"
                        >
                          {t?.name || id}
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

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Notas para el conductor:
                </label>
                <input
                  type="text"
                  value={slotNotes}
                  onChange={(e) => setSlotNotes(e.target.value)}
                  placeholder="Ej. Hay 1 No en casa en 1A y continuar con 1B..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <button
                type="submit"
                className={`w-full sm:w-auto px-6 py-3 text-white font-black text-sm rounded-xl shadow-sm inline-flex items-center justify-center gap-2 cursor-pointer ${
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
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
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
                      className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                        editingSlotId === slot.id
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-1.5">
                          <span>🔹</span>
                          <span>
                            {slot.dayOfWeek || slot.dayName} {slot.date ? `(${slot.date})` : ''} - {slot.time} hs
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 space-y-0.5">
                          <div>👤 <strong>Encargado:</strong> {slot.conductorName}</div>
                          <div>📍 <strong>Ubicación:</strong> {slot.meetingPointName}</div>
                          {slot.meetingPointUrl && (
                            <div className="text-[11px] text-blue-700 truncate max-w-md">
                              🗺️ <strong>Punto de Encuentro:</strong>{' '}
                              <a href={slot.meetingPointUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
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

                      <div className="flex flex-wrap items-center gap-1.5">
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
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer"
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
                  <div className="flex items-center justify-between">
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
                  <div className="text-xs font-mono bg-white p-3.5 rounded-xl border border-slate-200 whitespace-pre-wrap text-slate-800 select-all leading-relaxed shadow-inner">
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
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-4 h-fit">
            <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-700" />
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
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                required
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={newConductorPin}
                  onChange={(e) => setNewConductorPin(e.target.value)}
                  placeholder="PIN 4 dígitos (Ej. 5555)"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-black text-xs rounded-xl cursor-pointer"
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
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs sm:text-sm ${
                        c.isAdmin
                          ? 'bg-amber-50/70 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>{c.name}</span>
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
                    {s.dayName} ({s.time} hs) — {s.conductorName}
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
                          {previewSlot?.conductorName || 'Conductor'}
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
                          {previewSlot.conductorName} Ahora
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

      {/* MÓDULO 3: NUBE DE "NO EN CASA", "NO VISITAR" Y REGISTRO S-13 */}
      {activeTab === 'nube_s13' && (
        <div className="space-y-6">
          {/* Resumen por territorio en la nube */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-slate-900">
                Estado de Territorios, Asignaciones y Lista de "No en Casa"
              </h2>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="territory-sort-select"
                  className="text-xs font-extrabold uppercase text-slate-600"
                >
                  Ordenar por:
                </label>
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
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-xs sm:text-sm text-slate-800 cursor-pointer"
                >
                  <option value="number">Número (1 → N)</option>
                  <option value="oldest_worked">
                    Trabajados hace más tiempo (Prioridad)
                  </option>
                  <option value="recent_completed">
                    Completados recientemente
                  </option>
                  <option value="status">Estado (En curso primero)</option>
                  <option value="assignee">Asignado a (A → Z)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sortedTerritoriesForTab.map((t) => {
                const tBlocks = db.blocks
                  .filter((b) => b.territoryId === t.id)
                  .sort((a, b) => a.code.localeCompare(b.code));
                const doneBlocks = tBlocks.filter(
                  (b) => b.status === 'completada'
                );
                const tNotAtHome = db.housePoints.filter(
                  (p) => p.territoryId === t.id && p.status === 'no_en_casa'
                );
                const tNoVisitar = db.housePoints.filter(
                  (p) => p.territoryId === t.id && p.category === 'no_visitar'
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

                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border-2 border-slate-200 p-4 space-y-3 bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
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
                        {t.status === 'completado' ? 'Completado' : 'En curso'}
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
                        • Casas "No en casa" en la nube:{' '}
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

                    {/* Asignación Directa / Territorio Personal */}
                    <div className="bg-white rounded-xl p-3 border border-blue-200 space-y-2">
                      <label className="block text-[11px] font-black uppercase text-blue-900">
                        Asignación Directa / Personal:
                      </label>
                      <select
                        value={t.assignedToId || ''}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          onAssignTerritory(t.id, selectedId, currentNoteDraft);
                        }}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-bold text-xs text-slate-900"
                      >
                        <option value="">
                          Sin asignar (Solo programa general)
                        </option>
                        {db.conductors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      {t.assignedToId && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold text-blue-800">
                            Asignado el: {t.assignedAt || 'Activo'}
                          </div>
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
                                onAssignTerritory(
                                  t.id,
                                  t.assignedToId || '',
                                  currentNoteDraft
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 font-extrabold text-[11px] cursor-pointer shrink-0"
                            >
                              Guardar
                            </button>
                          </div>
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
                              href={getGoogleMapsNavigationUrl(p.lat, p.lng)}
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

                    <div className="flex flex-col gap-1.5 pt-1">
                      <button
                        onClick={() => onOpenTerritoryInMap(t.id)}
                        className="w-full py-2 px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs cursor-pointer"
                      >
                        🗺️ Abrir en Mapa Interactivo
                      </button>

                      {t.status !== 'completado' && (
                        <button
                          onClick={() => onCompleteWholeTerritory(t.id)}
                          className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                        >
                          ✓ Marcar Territorio Completo
                        </button>
                      )}

                      <button
                        onClick={() => onResetTerritory(t.id)}
                        className="w-full py-2 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reiniciar (Conserva NO VISITAR)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Historial S-13 */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  Historial de Territorios Completados (S-13)
                </h2>
                <p className="text-xs sm:text-sm text-slate-600">
                  Registro automático cada vez que un conductor o administrador
                  marca un territorio como completado.
                </p>
              </div>
              <button
                onClick={handleExportS13Csv}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                Descargar Planilla CSV / Excel (S-13)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-extrabold">Territorio</th>
                    <th className="py-2.5 px-3 font-extrabold">Conductor</th>
                    <th className="py-2.5 px-3 font-extrabold">Fecha Inicio</th>
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
          </div>
        </div>
      )}

      
      {/* MÓDULO EDITOR DE MAPAS (BORDES DE TERRITORIOS Y MANZANAS) */}
      {activeTab === 'editor' && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-3 sm:p-5 shadow-xs">
          <MapEditorView
            territories={db.territories}
            blocks={db.blocks}
            onSaveTerritory={onSaveTerritory}
            onCreateTerritory={onCreateTerritory}
            onDeleteTerritory={onDeleteTerritory}
            onSaveBlock={onSaveBlock}
            onCreateBlock={onCreateBlock}
            onDeleteBlock={onDeleteBlock}
          />
        </div>
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
    </div>
  );
};
