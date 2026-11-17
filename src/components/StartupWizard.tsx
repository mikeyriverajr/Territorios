import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Cloud,
  Copy,
  FileUp,
  FolderGit2,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  AppDatabase,
  Block,
  ConductorUser,
  HousePoint,
  ScheduleSlot,
  Territory,
} from '../types/territory';
import {
  extractKmlTextFromFile,
  parseBlocksAndHousesKml,
  parseTerritoriesKml,
} from '../services/kmlImporter';
import {
  CONGREGATION_STATE_SQL,
  connectAndFetchFromSupabase,
  getDefaultNotificationTemplates,
  getDemoDatabase,
  loadCloudConfig,
  sanitizeDatabase,
  saveCloudConfig,
  SupabaseConnectResult,
} from '../services/storageAndSync';

interface StartupWizardProps {
  onCompleteWizard: (configuredDb: AppDatabase) => void;
  onCancel?: () => void;
}

export const StartupWizard: React.FC<StartupWizardProps> = ({
  onCompleteWizard,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Paso 1: Congregación y Conexión a Supabase
  const [congregationName, setCongregationName] = useState<string>('');
  const [step1Error, setStep1Error] = useState<string>('');
  const initialCloud = loadCloudConfig();
  const [showSupabaseSetup, setShowSupabaseSetup] = useState<boolean>(true);
  const [supaUrl, setSupaUrl] = useState<string>(initialCloud.supabaseUrl);
  const [supaKey, setSupaKey] = useState<string>(initialCloud.supabaseAnonKey);
  const [supaCongId, setSupaCongId] = useState<string>(
    initialCloud.congregationId || 'main'
  );
  const [isConnectingSupabase, setIsConnectingSupabase] =
    useState<boolean>(false);
  const [supabaseResult, setSupabaseResult] =
    useState<SupabaseConnectResult | null>(null);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);
  const [backupRestoreMsg, setBackupRestoreMsg] = useState<string>('');

  // Paso 2: Los 2 Archivos KML/KMZ de Google My Maps
  const [file1Name, setFile1Name] = useState<string>('');
  const [file2Name, setFile2Name] = useState<string>('');
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [housePoints, setHousePoints] = useState<HousePoint[]>([]);
  const [mapImportMsg, setMapImportMsg] = useState<string>('');

  // Paso 3: Conductores, PINs y Permisos de Administrador
  const [conductors, setConductors] = useState<ConductorUser[]>([]);
  const [condNameInput, setCondNameInput] = useState<string>('');
  const [condPinInput, setCondPinInput] = useState<string>('');
  const [condIsAdmin, setCondIsAdmin] = useState<boolean>(true);
  const [step3Error, setStep3Error] = useState<string>('');

  // Paso 4: Primera Salida del Programa Semanal (Opcional)
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [dayName, setDayName] = useState<string>('Sábado Mañana');
  const [time, setTime] = useState<string>('09:30');
  const [selectedConductorId, setSelectedConductorId] = useState<string>('');
  const [meetingPointName, setMeetingPointName] = useState<string>('');
  const [meetingPointUrl, setMeetingPointUrl] = useState<string>('');
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>('');

  // Paso 1 -> Paso 2
  const handleNextFromStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!congregationName.trim()) {
      setStep1Error('Por favor escriba el nombre de la congregación.');
      return;
    }
    if (supaUrl.trim() && supaKey.trim()) {
      saveCloudConfig({
        supabaseUrl: supaUrl.trim(),
        supabaseAnonKey: supaKey.trim(),
        enabled: true,
        congregationId: supaCongId.trim() || 'main',
      });
    }
    setStep1Error('');
    setStep(2);
  };

  const handleConnectSupabase = async () => {
    setIsConnectingSupabase(true);
    setSupabaseResult(null);
    const res = await connectAndFetchFromSupabase({
      supabaseUrl: supaUrl,
      supabaseAnonKey: supaKey,
      congregationId: supaCongId,
      enabled: true,
    });
    setIsConnectingSupabase(false);
    setSupabaseResult(res);
    if (res.status === 'loaded' && res.db) {
      onCompleteWizard(res.db);
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(CONGREGATION_STATE_SQL);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 3000);
    } catch {
      setSqlCopied(false);
    }
  };

  const handleRestoreJsonInWizard = async (
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
        setBackupRestoreMsg(
          '❌ El archivo seleccionado no es un respaldo válido.'
        );
        return;
      }
      if (supaUrl.trim() && supaKey.trim()) {
        saveCloudConfig({
          supabaseUrl: supaUrl.trim(),
          supabaseAnonKey: supaKey.trim(),
          enabled: true,
          congregationId: supaCongId.trim() || 'main',
        });
      }
      const restored = sanitizeDatabase({ ...parsed, isConfigured: true });
      onCompleteWizard(restored);
    } catch {
      setBackupRestoreMsg('❌ No se pudo leer el archivo .json.');
    }
  };

  // Subida del Archivo 1 (Territorios individuales)
  const handleFile1Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFile1Name(file.name);
      const kmlText = await extractKmlTextFromFile(file);
      const parsedTerrs = parseTerritoriesKml(kmlText);
      setTerritories(parsedTerrs);
      if (parsedTerrs[0]) setSelectedTerritoryId(parsedTerrs[0].id);
      setMapImportMsg(
        `✅ Archivo 1 cargado: ${parsedTerrs.length} territorio(s) detectado(s). Ahora suba el Archivo 2 (Manzanas / Casas).`
      );
    } catch (err) {
      setMapImportMsg(
        `❌ Error al leer el Archivo 1: ${
          err instanceof Error ? err.message : 'Archivo inválido'
        }`
      );
    }
  };

  // Subida del Archivo 2 (Manzanas y Casas Rurales)
  const handleFile2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFile2Name(file.name);
      const kmlText = await extractKmlTextFromFile(file);
      const {
        blocks: parsedBlocks,
        ruralAndAlertPoints,
        updatedTerritories,
      } = parseBlocksAndHousesKml(kmlText, territories);
      setTerritories(updatedTerritories);
      setBlocks(parsedBlocks);
      setHousePoints(ruralAndAlertPoints);
      if (updatedTerritories[0] && !selectedTerritoryId) {
        setSelectedTerritoryId(updatedTerritories[0].id);
      }
      setMapImportMsg(
        `✅ Archivo 2 vinculado: ${parsedBlocks.length} manzanas (1A, 1B...) y ${ruralAndAlertPoints.length} casas rurales unidas automáticamente a sus territorios.`
      );
    } catch (err) {
      setMapImportMsg(
        `❌ Error al leer el Archivo 2: ${
          err instanceof Error ? err.message : 'Archivo inválido'
        }`
      );
    }
  };

  // Cargar los 2 archivos KML de muestra por si el usuario aún no exportó su Google My Maps
  const handleUseSampleKmlFiles = async () => {
    try {
      const [res1, res2] = await Promise.all([
        fetch('./ejemplos/archivo1_territorios_ejemplo.kml'),
        fetch('./ejemplos/archivo2_manzanas_y_casas_ejemplo.kml'),
      ]);
      const kml1 = await res1.text();
      const kml2 = await res2.text();

      const parsedTerrs = parseTerritoriesKml(kml1);
      const {
        blocks: parsedBlocks,
        ruralAndAlertPoints,
        updatedTerritories,
      } = parseBlocksAndHousesKml(kml2, parsedTerrs);

      setFile1Name('archivo1_territorios_ejemplo.kml');
      setFile2Name('archivo2_manzanas_y_casas_ejemplo.kml');
      setTerritories(updatedTerritories);
      setBlocks(parsedBlocks);
      setHousePoints(ruralAndAlertPoints);
      if (updatedTerritories[0]) {
        setSelectedTerritoryId(updatedTerritories[0].id);
      }
      setMapImportMsg(
        `✅ Mapas de ejemplo cargados (${updatedTerritories.length} territorios, ${parsedBlocks.length} manzanas y ${ruralAndAlertPoints.length} casas rurales). Podrás reemplazarlos en cualquier momento desde el panel Admin.`
      );
    } catch {
      setMapImportMsg('No se pudieron cargar los KML de ejemplo.');
    }
  };

  // Agregar conductor en Paso 3
  const handleAddConductor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!condNameInput.trim()) return;
    if (condPinInput.trim().length < 4) {
      setStep3Error('El PIN del conductor debe tener al menos 4 dígitos.');
      return;
    }
    const newCond: ConductorUser = {
      id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: condNameInput.trim(),
      pin: condPinInput.trim(),
      isAdmin: condIsAdmin,
    };
    const nextList = [...conductors, newCond];
    setConductors(nextList);
    if (!selectedConductorId) {
      setSelectedConductorId(newCond.id);
    }
    setCondNameInput('');
    setCondPinInput('');
    setCondIsAdmin(false);
    setStep3Error('');
  };

  // Agregar primera salida en Paso 4
  const handleAddFirstSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const cond =
      conductors.find((c) => c.id === selectedConductorId) || conductors[0];
    if (!cond || !meetingPointName.trim()) return;

    const terrId = selectedTerritoryId || territories[0]?.id || 'terr-1';
    const newSlot: ScheduleSlot = {
      id: `sched-${Date.now()}`,
      dayName,
      date: new Date().toISOString().slice(0, 10),
      time,
      conductorId: cond.id,
      conductorName: cond.name,
      meetingPointName: meetingPointName.trim(),
      meetingPointUrl:
        meetingPointUrl.trim() ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          meetingPointName.trim()
        )}`,
      territoryIds: [terrId],
    };
    setSchedule([...schedule, newSlot]);
    setMeetingPointName('');
    setMeetingPointUrl('');
  };

  // Finalizar el Asistente y dejar la aplicación en vivo
  const handleFinishLiveSetup = () => {
    const normalizedConductors = conductors.map((c, idx) => ({
      ...c,
      isAdmin: conductors.some((x) => x.isAdmin) ? Boolean(c.isAdmin) : idx === 0,
    }));
    const finalDb: AppDatabase = {
      isConfigured: true,
      congregationName: congregationName.trim(),
      adminPin: '',
      conductors: normalizedConductors,
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
    onCompleteWizard(finalDb);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-900 flex flex-col justify-between py-6 px-3 sm:px-6">
      <div className="max-w-3xl w-full mx-auto space-y-6">
        {/* Barra superior del Asistente */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/90 border border-slate-700 rounded-2xl px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl shadow-md">
              🪄
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                Configuración Inicial • Paso {step} de 4
              </div>
              <h1 className="text-lg sm:text-xl font-black">
                Preparar Sistema en Vivo para la Congregación
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={() => onCompleteWizard(getDemoDatabase())}
              className="text-xs font-bold text-slate-300 hover:text-white underline cursor-pointer shrink-0"
            >
              O cargar con datos de demostración
            </button>
          </div>
        </div>

        {/* Indicador visual de los 4 pasos */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { n: 1, label: '1. Congregación' },
            { n: 2, label: '2. Mapas KML' },
            { n: 3, label: '3. Conductores' },
            { n: 4, label: '4. Programa' },
          ].map((item) => (
            <div
              key={item.n}
              className={`py-2 px-3 rounded-xl text-center font-extrabold text-xs sm:text-sm border transition ${
                step === item.n
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : step > item.n
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {step > item.n ? `✓ ${item.label}` : item.label}
            </div>
          ))}
        </div>

        {/* CONTENIDO DEL PASO ACTUAL */}
        <div className="bg-white rounded-3xl shadow-2xl border-2 border-slate-200 p-6 sm:p-8">
          {/* PASO 1: CONGREGACIÓN Y CONEXIÓN OPCIONAL A SUPABASE */}
          {step === 1 && (
            <form onSubmit={handleNextFromStep1} className="space-y-5">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-blue-100 text-blue-900">
                  <ShieldCheck className="w-4 h-4" />
                  Paso 1 de 4
                </span>
                <h2 className="text-2xl font-black text-slate-900">
                  Nombre de la Congregación
                </h2>
                <p className="text-sm text-slate-600">
                  En el Paso 3 registrarás a los conductores y elegirás quiénes
                  tienen permisos de Administrador (para subir mapas, armar el
                  programa y alternar entre su vista de conductor y el panel
                  Admin).
                </p>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                  Nombre de tu Congregación:
                </label>
                <input
                  type="text"
                  value={congregationName}
                  onChange={(e) => setCongregationName(e.target.value)}
                  placeholder="Ej. Congregación Norte / Villa del Parque..."
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-300 focus:border-blue-700 focus:outline-none font-bold text-base"
                  required
                />
              </div>

              <div className="border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSupabaseSetup((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-extrabold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-indigo-600" />
                    Conexión a la Nube / Supabase (Opcional — para otra congregación)
                  </span>
                  <span>{showSupabaseSetup ? '▲' : '▼'}</span>
                </button>
                {showSupabaseSetup && (
                  <div className="p-4 pt-2 border-t border-slate-200 space-y-3 bg-white">
                    <p className="text-xs text-slate-600">
                      Si esta congregación usa su propio proyecto de Supabase o un
                      ID distinto en <code>congregation_state</code>, ingrésalo
                      aquí:
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        Supabase Project URL:
                      </label>
                      <input
                        type="text"
                        value={supaUrl}
                        onChange={(e) => setSupaUrl(e.target.value)}
                        placeholder="https://xyzcompany.supabase.co"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        Supabase Anon Key:
                      </label>
                      <input
                        type="password"
                        value={supaKey}
                        onChange={(e) => setSupaKey(e.target.value)}
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        ID de Congregación (por defecto: main):
                      </label>
                      <input
                        type="text"
                        value={supaCongId}
                        onChange={(e) => setSupaCongId(e.target.value)}
                        placeholder="main"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isConnectingSupabase}
                      onClick={handleConnectSupabase}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black text-xs sm:text-sm rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <Cloud className="w-4 h-4" />
                      {isConnectingSupabase
                        ? 'Conectando con Supabase...'
                        : '🔌 Conectar y Cargar desde Supabase'}
                    </button>

                    {supabaseResult && (
                      <div
                        className={`p-3 rounded-xl border text-xs space-y-2 ${
                          supabaseResult.status === 'error'
                            ? 'bg-red-50 border-red-300 text-red-900'
                            : supabaseResult.status === 'missing_table'
                            ? 'bg-amber-50 border-amber-300 text-amber-950'
                            : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        }`}
                      >
                        <div className="font-bold">{supabaseResult.message}</div>

                        {supabaseResult.existingTables &&
                          supabaseResult.existingTables.length > 0 && (
                            <div className="text-[11px]">
                              <strong>Tablas encontradas en Supabase:</strong>{' '}
                              {supabaseResult.existingTables.join(', ')}
                            </div>
                          )}

                        {supabaseResult.status === 'empty' && (
                          <div className="text-[11px]">
                            Puedes restaurar una copia <code>.json</code> abajo o
                            completar los 4 pasos para guardar la congregación en
                            Supabase.
                          </div>
                        )}

                        {supabaseResult.status === 'missing_table' && (
                          <div className="space-y-2 pt-1">
                            <div className="text-[11px]">
                              Copia este script SQL y ejecútalo en Supabase →{' '}
                              <strong>SQL Editor</strong> para crear la tabla{' '}
                              <code>congregation_state</code>:
                            </div>
                            <button
                              type="button"
                              onClick={handleCopySql}
                              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {sqlCopied
                                ? '✓ ¡SQL Copiado al portapapeles!'
                                : '📋 Copiar Script SQL para crear la tabla'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl border border-dashed border-emerald-400 bg-emerald-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs text-emerald-950">
                  <strong>¿Ya tienes una copia de seguridad?</strong> Restaura
                  tu archivo <code>.json</code> directamente aquí.
                </div>
                <label className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                  <FileUp className="w-4 h-4" />
                  📂 Restaurar desde Copia de Seguridad (.json)
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleRestoreJsonInWizard}
                    className="hidden"
                  />
                </label>
              </div>

              {backupRestoreMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold">
                  {backupRestoreMsg}
                </div>
              )}

              {step1Error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold">
                  {step1Error}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-6 py-4 bg-blue-700 hover:bg-blue-800 text-white font-black text-base rounded-2xl shadow-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Siguiente: Subir Mapas de Google My Maps</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </form>
          )}

          {/* PASO 2: SUBIR LOS 2 ARCHIVOS KML/KMZ DE GOOGLE MY MAPS */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-blue-100 text-blue-900">
                    <FileUp className="w-4 h-4" />
                    Paso 2 de 4
                  </span>
                  <h2 className="text-2xl font-black text-slate-900">
                    Importar los 2 Mapas de la Congregación (`.kml` / `.kmz`)
                  </h2>
                  <p className="text-sm text-slate-600">
                    Sube el <strong>Archivo 1 (Territorios)</strong> y el{' '}
                    <strong>Archivo 2 (Manzanas y Casas)</strong> exportados de
                    Google My Maps.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleUseSampleKmlFiles}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 font-extrabold text-xs cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Probar con KML de ejemplo por ahora
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/40 p-5 space-y-3">
                  <span className="px-2.5 py-1 rounded-lg bg-blue-700 text-white font-black text-xs uppercase">
                    Archivo 1 • Territorios Individuales
                  </span>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Polígonos de Territorios (Territorio 1, 2, 3...)
                  </h3>
                  <label className="block w-full py-3 px-4 bg-white hover:bg-blue-50 text-blue-900 border-2 border-blue-300 rounded-xl font-extrabold text-sm text-center cursor-pointer transition">
                    📂 Subir Archivo 1 (.kml / .kmz)
                    <input
                      type="file"
                      accept=".kml,.kmz,.xml"
                      onChange={handleFile1Upload}
                      className="hidden"
                    />
                  </label>
                  {file1Name && (
                    <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                      ✓ {file1Name} ({territories.length} territorios)
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50/40 p-5 space-y-3">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-black text-xs uppercase">
                    Archivo 2 • Manzanas y Casas
                  </span>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Manzanas (1A, 1B...) y Casas Rurales
                  </h3>
                  <label className="block w-full py-3 px-4 bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-400 rounded-xl font-extrabold text-sm text-center cursor-pointer transition">
                    📂 Subir Archivo 2 (.kml / .kmz)
                    <input
                      type="file"
                      accept=".kml,.kmz,.xml"
                      onChange={handleFile2Upload}
                      className="hidden"
                    />
                  </label>
                  {file2Name && (
                    <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                      ✓ {file2Name} ({blocks.length} manzanas,{' '}
                      {housePoints.length} casas rurales)
                    </div>
                  )}
                </div>
              </div>

              {mapImportMsg && (
                <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-300 text-xs sm:text-sm font-bold text-slate-800">
                  {mapImportMsg}
                </div>
              )}

              {territories.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 space-y-2">
                  <div className="font-black text-sm text-emerald-950 flex items-center gap-1.5">
                    <FolderGit2 className="w-4 h-4 text-emerald-700" />
                    Resumen de territorios detectados ({territories.length}):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {territories.map((t) => {
                      const bCount = blocks.filter(
                        (b) => b.territoryId === t.id
                      ).length;
                      const pCount = housePoints.filter(
                        (p) => p.territoryId === t.id
                      ).length;
                      return (
                        <span
                          key={t.id}
                          className="px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-xs font-bold text-slate-800"
                        >
                          {t.name}: {bCount} manzanas, {pCount} casas
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-xl border-2 border-slate-300 font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Atrás
                </button>

                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-6 py-4 bg-blue-700 hover:bg-blue-800 text-white font-black text-base rounded-2xl shadow-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>
                    {territories.length > 0
                      ? 'Siguiente: Registrar Conductores'
                      : 'Omitir por ahora e ir a Conductores'}
                  </span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: REGISTRAR CONDUCTORES Y SUS PINs DE 4 DÍGITOS */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-blue-100 text-blue-900">
                  <UserPlus className="w-4 h-4" />
                  Paso 3 de 4
                </span>
                <h2 className="text-2xl font-black text-slate-900">
                  Registrar a los Conductores de Predicación
                </h2>
                <p className="text-sm text-slate-600">
                  Agrega a los hermanos que conducen salidas y asígnales un PIN
                  corto de 4 dígitos. Cuando ellos entren a la app, solo verán
                  sus propios días asignados.
                </p>
              </div>

              <form
                onSubmit={handleAddConductor}
                className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                      Nombre del Conductor:
                    </label>
                    <input
                      type="text"
                      value={condNameInput}
                      onChange={(e) => setCondNameInput(e.target.value)}
                      placeholder="Ej. Hno. Carlos Gómez"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                      PIN (4 dígitos):
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={condPinInput}
                        onChange={(e) => setCondPinInput(e.target.value)}
                        placeholder="1111"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-black text-sm text-center tracking-widest"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-black text-xs rounded-xl shrink-0 cursor-pointer"
                      >
                        + Agregar
                      </button>
                    </div>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={condIsAdmin}
                    onChange={(e) => setCondIsAdmin(e.target.checked)}
                    className="w-4 h-4 accent-amber-600"
                  />
                  <span>
                    🛡️ Dar permisos de Administrador (Siervo de Territorios)
                  </span>
                </label>
              </form>

              {step3Error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold">
                  {step3Error}
                </div>
              )}

              {conductors.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500">
                  Aún no has agregado conductores. Agrega al menos uno con
                  permisos de Administrador arriba.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {conductors.map((c) => (
                    <div
                      key={c.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        c.isAdmin
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-emerald-50 border-emerald-300'
                      }`}
                    >
                      <div>
                        <div className="font-black text-sm text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>👤 {c.name}</span>
                          {c.isAdmin && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-black">
                              🛡️ Admin
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700">
                          PIN asignado:{' '}
                          <strong className="font-mono">{c.pin}</strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setConductors(
                              conductors.map((item) =>
                                item.id === c.id
                                  ? { ...item, isAdmin: !item.isAdmin }
                                  : item
                              )
                            )
                          }
                          className="px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
                        >
                          {c.isAdmin ? 'Quitar Admin' : 'Hacer Admin'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConductors(
                              conductors.filter((item) => item.id !== c.id)
                            )
                          }
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-3 rounded-xl border-2 border-slate-300 font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Atrás
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      conductors.length === 0 ||
                      !conductors.some((c) => c.isAdmin)
                    ) {
                      setStep3Error(
                        'Agrega al menos un conductor con permisos de Administrador para poder administrar la app.'
                      );
                      return;
                    }
                    setStep3Error('');
                    setStep(4);
                  }}
                  className="px-6 py-4 bg-blue-700 hover:bg-blue-800 text-white font-black text-base rounded-2xl shadow-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Siguiente: Programa Semanal</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* PASO 4: PRIMERA SALIDA DEL PROGRAMA SEMANAL Y FINALIZAR */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-emerald-100 text-emerald-900">
                  <Calendar className="w-4 h-4" />
                  Paso 4 de 4 • ¡Último paso!
                </span>
                <h2 className="text-2xl font-black text-slate-900">
                  Programar Primera Salida (Opcional) y Lanzar en Vivo
                </h2>
                <p className="text-sm text-slate-600">
                  Puedes dejar cargada una salida ahora mismo o finalizar y
                  hacerlo desde tu panel de Administrador.
                </p>
              </div>

              {conductors.length > 0 && territories.length > 0 && (
                <form
                  onSubmit={handleAddFirstSlot}
                  className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                        Día y Turno:
                      </label>
                      <input
                        type="text"
                        value={dayName}
                        onChange={(e) => setDayName(e.target.value)}
                        placeholder="Ej. Sábado Mañana"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                        Hora:
                      </label>
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                        Conductor:
                      </label>
                      <select
                        value={selectedConductorId || conductors[0]?.id || ''}
                        onChange={(e) => setSelectedConductorId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold"
                      >
                        {conductors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                        Punto de Encuentro:
                      </label>
                      <input
                        type="text"
                        value={meetingPointName}
                        onChange={(e) => setMeetingPointName(e.target.value)}
                        placeholder="Ej. Salón del Reino"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                        Link Google Maps (Opcional):
                      </label>
                      <input
                        type="text"
                        value={meetingPointUrl}
                        onChange={(e) => setMeetingPointUrl(e.target.value)}
                        placeholder="https://maps.app.goo.gl/..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                        Territorio:
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={selectedTerritoryId || territories[0]?.id || ''}
                          onChange={(e) =>
                            setSelectedTerritoryId(e.target.value)
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold"
                        >
                          {territories.map((t: Territory) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-black text-xs rounded-xl shrink-0 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          Añadir
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              )}

              {schedule.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-extrabold uppercase text-slate-500">
                    Salidas listas para publicar ({schedule.length}):
                  </div>
                  {schedule.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs sm:text-sm"
                    >
                      <span className="font-bold text-slate-900">
                        <CheckCircle2 className="w-4 h-4 inline text-emerald-600 mr-1.5" />
                        {s.dayName} ({s.time} hs) — {s.conductorName} • 📍{' '}
                        {s.meetingPointName}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs sm:text-sm text-blue-950 space-y-1">
                <div className="font-black">
                  🎉 Resumen de tu configuración en vivo:
                </div>
                <div>
                  • <strong>Congregación:</strong> {congregationName}
                </div>
                <div>
                  • <strong>Administradores:</strong>{' '}
                  {conductors
                    .filter((c) => c.isAdmin)
                    .map((c) => c.name)
                    .join(', ') || 'Primer conductor'}
                </div>
                <div>
                  • <strong>Mapas cargados:</strong> {territories.length}{' '}
                  territorios, {blocks.length} manzanas, {housePoints.length}{' '}
                  casas rurales
                </div>
                <div>
                  • <strong>Conductores registrados:</strong>{' '}
                  {conductors.length}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-3 rounded-xl border-2 border-slate-300 font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Atrás
                </button>

                <button
                  type="button"
                  onClick={handleFinishLiveSetup}
                  className="px-7 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base sm:text-lg rounded-2xl shadow-xl inline-flex items-center gap-2.5 cursor-pointer transition"
                >
                  <Rocket className="w-6 h-6" />
                  <span>¡Finalizar y Abrir Aplicación en Vivo!</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
