import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw, ShieldCheck, User } from 'lucide-react';
import {
  AppDatabase,
  Block,
  BlockStatus,
  ConductorUser,
  HousePoint,
  HousePointCategory,
  HousePointStatus,
  MeetingLocation,
  PushNotificationItem,
  PushNotificationTemplate,
  ScheduleSlot,
  Territory,
} from './types/territory';
import {
  appendSyncAction,
  fetchCloudDatabase,
  generateHouseShortCode,
  loadDatabase,
  markWholeTerritoryCompleted,
  resetTerritoryForNewCycle,
  sanitizeDatabase,
  saveDatabase,
} from './services/storageAndSync';
import { StartupWizard } from './components/StartupWizard';
import { LoginView } from './components/LoginView';
import { ConductorPortal } from './components/ConductorPortal';
import { PublisherLightView } from './components/PublisherLightView';
import { FieldMapView } from './components/FieldMapView';
import { AdminDashboard } from './components/AdminDashboard';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error no controlado capturado por ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="bg-slate-800 border-2 border-red-500 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-4 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-900/60 text-red-400 flex items-center justify-center mx-auto text-3xl">
              ⚠️
            </div>
            <h1 className="text-xl font-black">Se produjo un problema al cargar el panel</h1>
            <p className="text-xs text-slate-300">
              El sistema ha evitado que la pantalla quede en blanco.
            </p>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-700 text-left font-mono text-xs text-red-300 max-h-40 overflow-y-auto">
              {this.state.error?.message || 'Error desconocido'}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 font-extrabold text-xs rounded-xl cursor-pointer"
              >
                Reintentar / Recargar
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = window.location.pathname;
                }}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 font-bold text-xs rounded-xl cursor-pointer"
              >
                Volver al Inicio
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const [db, setDb] = useState<AppDatabase>(() => loadDatabase());

  // Estado de autenticación (Rol 1: Admin, Rol 2: Conductor, Rol 3: Publicador por link sin login)
  const [authRole, setAuthRole] = useState<
    'admin' | 'conductor' | 'publisher_link' | null
  >(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('grupo') || params.get('salida')) {
      return 'publisher_link';
    }
    return null;
  });

  const [loggedConductor, setLoggedConductor] = useState<ConductorUser | null>(
    null
  );

  const [publisherSlotId, setPublisherSlotId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('grupo') || params.get('salida') || null;
  });

  const [mapOpenForTerritoryId, setMapOpenForTerritoryId] = useState<
    string | null
  >(null);
  const [activeSlotForMap, setActiveSlotForMap] = useState<ScheduleSlot | null>(
    null
  );

  const [initialCloudCheckDone, setInitialCloudCheckDone] = useState<boolean>(
    () => Boolean(loadDatabase().isConfigured)
  );
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);

  // Sincronización periódica con la nube (Supabase o /api/cloud-state)
  useEffect(() => {
    let active = true;

    const syncFromCloud = async () => {
      try {
        const cloudDb = await fetchCloudDatabase();
        if (!active) return;
        if (cloudDb && cloudDb.isConfigured) {
          setDb((prev) => {
            if (cloudDb.lastUpdated !== prev.lastUpdated) {
              return cloudDb;
            }
            return prev;
          });
        }
      } finally {
        if (active) {
          setInitialCloudCheckDone(true);
        }
      }
    };

    syncFromCloud();
    const interval = setInterval(syncFromCloud, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Mantener sincronizado el conductor logueado si cambian sus datos o permisos de Admin
  useEffect(() => {
    if (!loggedConductor) return;
    const updated = db.conductors.find((c) => c.id === loggedConductor.id);
    if (!updated) {
      setLoggedConductor(null);
      setAuthRole(null);
      return;
    }
    if (
      updated.isAdmin !== loggedConductor.isAdmin ||
      updated.name !== loggedConductor.name ||
      updated.pin !== loggedConductor.pin
    ) {
      setLoggedConductor(updated);
      if (authRole === 'admin' && !updated.isAdmin) {
        setAuthRole('conductor');
      }
    }
  }, [db.conductors, loggedConductor, authRole]);

  useEffect(() => {
    const handleOnline = () => {
      setDb((prev) => {
        if (prev.offlineQueue.length === 0) return prev;
        return saveDatabase({ ...prev, offlineQueue: [] });
      });
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const handleAddHousePoint = (
    pointData: {
      territoryId: string;
      blockId?: string;
      blockCode?: string;
      lat: number;
      lng: number;
      category: HousePointCategory;
      label: string;
      notes?: string;
    },
    recordedByRole: 'publicador' | 'conductor' | 'admin'
  ) => {
    const now = new Date().toISOString();
    const safeCategory: HousePointCategory =
      recordedByRole === 'publicador' ? 'no_en_casa' : pointData.category;
    const isPermanent = safeCategory === 'no_visitar';

    const { seqNumber, shortCode } = generateHouseShortCode(
      db,
      pointData.territoryId,
      pointData.blockCode,
      safeCategory
    );

    const newPoint: HousePoint = {
      id: `hp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      territoryId: pointData.territoryId,
      blockId: pointData.blockId,
      blockCode: pointData.blockCode,
      lat: pointData.lat,
      lng: pointData.lng,
      category: safeCategory,
      status: isPermanent ? 'permanente' : 'no_en_casa',
      label: pointData.label?.trim() ? pointData.label : `#${shortCode}`,
      notes: pointData.notes,
      seqNumber,
      shortCode,
      recordedByRole,
      createdAt: now,
      updatedAt: now,
      attempts: isPermanent
        ? []
        : [{ date: now.slice(0, 10), outcome: 'no_en_casa' }],
    };

    let nextDb: AppDatabase = {
      ...db,
      housePoints: [newPoint, ...db.housePoints],
    };

    if (pointData.blockId) {
      nextDb = {
        ...nextDb,
        blocks: nextDb.blocks.map((b) =>
          b.id === pointData.blockId && b.status === 'pendiente'
            ? {
                ...b,
                status: 'en_progreso',
                lastWorkedAt: now.slice(0, 10),
              }
            : b
        ),
      };
    }

    nextDb = appendSyncAction(
      nextDb,
      `Registró ${safeCategory} (${pointData.label})`
    );
    setDb(saveDatabase(nextDb));
  };

  const handleUpdateHouseStatus = (
    pointId: string,
    newStatus: HousePointStatus,
    note?: string
  ) => {
    const targetPoint = db.housePoints.find((p) => p.id === pointId);
    if (!targetPoint) return;

    const now = new Date().toISOString();
    const updatedPoints = db.housePoints.map((p) => {
      if (p.id !== pointId) return p;
      return {
        ...p,
        status: newStatus,
        updatedAt: now,
        attempts: [
          ...p.attempts,
          {
            date: now.slice(0, 10),
            outcome: (newStatus === 'atendido' ? 'atendido' : 'no_en_casa') as
              | 'atendido'
              | 'no_en_casa',
            note,
          },
        ],
      };
    });

    let nextDb: AppDatabase = {
      ...db,
      housePoints: updatedPoints,
    };

    nextDb = appendSyncAction(
      nextDb,
      `Actualizó casa "${targetPoint.label}" a ${newStatus}`
    );
    setDb(saveDatabase(nextDb));
  };

  const handleDeleteHousePoint = (pointId: string) => {
    const nextDb: AppDatabase = {
      ...db,
      housePoints: db.housePoints.filter((p) => p.id !== pointId),
    };
    setDb(saveDatabase(nextDb));
  };

  const handleUpdateBlockStatus = (
    blockId: string,
    status: BlockStatus,
    conductorName?: string
  ) => {
    const targetBlock = db.blocks.find((b) => b.id === blockId);
    if (!targetBlock) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    let nextDb: AppDatabase = {
      ...db,
      blocks: db.blocks.map((b) => {
        if (b.id !== blockId) return b;
        if (status === 'completada') {
          return {
            ...b,
            status,
            lastWorkedAt: todayStr,
            completedAt: todayStr,
            lastCompletedAt: todayStr,
            lastConductor: conductorName || b.lastConductor,
          };
        }
        return {
          ...b,
          status,
          completedAt: undefined,
          lastCompletedAt: b.completedAt || b.lastCompletedAt || b.lastWorkedAt,
          lastConductor: conductorName || b.lastConductor,
        };
      }),
    };

    nextDb = appendSyncAction(
      nextDb,
      `Marcó Manzana ${targetBlock.code} como ${status}`
    );
    setDb(saveDatabase(nextDb));
  };

  const handleAssignTerritory = (
    territoryId: string,
    conductorId: string,
    assignmentNotes?: string
  ) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const assignedUser = conductorId
      ? db.conductors.find((c) => c.id === conductorId)
      : undefined;

    const nextDb: AppDatabase = {
      ...db,
      territories: db.territories.map((t) => {
        if (t.id !== territoryId) return t;
        if (assignedUser) {
          return {
            ...t,
            assignedToId: assignedUser.id,
            assignedToName: assignedUser.name,
            assignedAt: todayStr,
            assignmentNotes: assignmentNotes?.trim() || undefined,
            lastConductor: assignedUser.name,
            startedAt: t.startedAt || todayStr,
          };
        }
        return {
          ...t,
          assignedToId: undefined,
          assignedToName: undefined,
          assignedAt: undefined,
          assignmentNotes: undefined,
        };
      }),
    };

    setDb(saveDatabase(nextDb));
  };

  const handleCompleteWholeTerritory = (
    territoryId: string,
    conductorName?: string
  ) => {
    const nextDb = markWholeTerritoryCompleted(
      db,
      territoryId,
      conductorName || loggedConductor?.name || 'Administrador'
    );
    setDb(nextDb);
  };

  const handleResetTerritory = (
    territoryId: string,
    conductorName?: string
  ) => {
    const nextDb = resetTerritoryForNewCycle(db, territoryId, conductorName);
    setDb(nextDb);
  };

  // ESPERA INICIAL DE SINCRONIZACIÓN CON LA NUBE ANTES DE MOSTRAR EL ASISTENTE
  if (!db.isConfigured && !initialCloudCheckDone && !isWizardOpen) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 max-w-sm w-full text-center space-y-3 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto text-3xl animate-pulse">
            🗺️
          </div>
          <h1 className="text-lg font-black">
            Sincronizando datos de la congregación...
          </h1>
          <p className="text-xs text-slate-300">
            Conectando con la nube para cargar territorios y salidas.
          </p>
        </div>
      </div>
    );
  }

  // PROTECCIÓN PARA LINKS DE PUBLICADOR (?grupo=...): Nunca enviar a un publicador al Asistente Admin si está offline
  if (authRole === 'publisher_link' && !db.isConfigured && !isWizardOpen) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-600 flex items-center justify-center mx-auto text-3xl">
            📡
          </div>
          <h1 className="text-xl font-black">
            No se pudo cargar la salida desde la nube
          </h1>
          <p className="text-sm text-slate-300">
            Verifique su conexión a Internet y vuelva a intentar para abrir el
            mapa del grupo.
          </p>
          <button
            type="button"
            onClick={async () => {
              setInitialCloudCheckDone(false);
              const cloudDb = await fetchCloudDatabase();
              if (cloudDb && cloudDb.isConfigured) {
                setDb(cloudDb);
              }
              setInitialCloudCheckDone(true);
            }}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar Conexión
          </button>
        </div>
      </div>
    );
  }

  // ASISTENTE DE CONFIGURACIÓN INICIAL (STARTUP WIZARD) CUANDO LA APP NO HA SIDO CONFIGURADA O EL ADMIN LO ABRE
  if (!db.isConfigured || isWizardOpen) {
    return (
      <StartupWizard
        onCancel={db.isConfigured ? () => setIsWizardOpen(false) : undefined}
        onCompleteWizard={(configuredDb) => {
          const sanitized = sanitizeDatabase(configuredDb);
          const saved = saveDatabase(sanitized);
          setDb(saved);
          setIsWizardOpen(false);
          const firstAdmin =
            saved.conductors.find((c) => c.isAdmin) ||
            saved.conductors[0] ||
            null;
          setLoggedConductor(firstAdmin);
          setAuthRole('admin');
          setMapOpenForTerritoryId(null);
        }}
      />
    );
  }

  // ROL 3: Si es un Publicador que entró con el link especial (?grupo=ID), mostrar la vista Ultra-Ligera sin Login
  if (authRole === 'publisher_link') {
    const slotList = db.schedule || [];
    const slot =
      slotList.find((s) => s.id === publisherSlotId) || slotList[0];
    if (slot) {
      return (
        <ErrorBoundary>
          <PublisherLightView
            slot={slot}
            territories={db.territories}
            blocks={db.blocks}
            housePoints={db.housePoints}
            onAddNotAtHome={(pt) =>
              handleAddHousePoint(
                { ...pt, category: 'no_en_casa' },
                'publicador'
              )
            }
            onMarkHouseVisited={(pointId, newStatus) =>
              handleUpdateHouseStatus(pointId, newStatus)
            }
          />
        </ErrorBoundary>
      );
    }
  }

  // Si no ha iniciado sesión, mostrar la pantalla de Login para Conductores y Siervo de Territorios / Admin
  if (!authRole) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen flex flex-col bg-slate-100">
          <header className="h-16 bg-slate-900 text-white px-4 sm:px-6 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-lg">
                🗺️
              </div>
              <span className="font-black text-base">{db.congregationName}</span>
            </div>
          </header>

          <LoginView
            congregationName={db.congregationName}
            adminPin={db.adminPin}
            conductors={db.conductors}
            onLoginSuccess={(role, conductor) => {
              setAuthRole(role);
              setLoggedConductor(conductor || null);
              setMapOpenForTerritoryId(null);
            }}
          />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-100">
      <header className="h-16 bg-slate-900 text-white px-3 sm:px-6 flex items-center justify-between shadow-md z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-lg">
            🗺️
          </div>
          <div>
            <div className="font-black text-sm sm:text-base leading-tight">
              {db.congregationName}
            </div>
            <div className="text-[11px] text-slate-300 flex items-center gap-2">
              {authRole === 'admin' ? (
                <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                  <ShieldCheck className="w-3 h-3" />{' '}
                  {loggedConductor
                    ? `Admin: ${loggedConductor.name}`
                    : 'Siervo de Territorios (Admin)'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-blue-300 font-bold">
                  <User className="w-3 h-3" /> Conductor: {loggedConductor?.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {loggedConductor?.isAdmin && (
            <button
              onClick={() => {
                setMapOpenForTerritoryId(null);
                setActiveSlotForMap(null);
                setAuthRole((prev) =>
                  prev === 'admin' ? 'conductor' : 'admin'
                );
              }}
              className={`px-3 py-2 rounded-xl font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition shadow-sm ${
                authRole === 'admin'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
              title={
                authRole === 'admin'
                  ? 'Cambiar a mi vista de Conductor'
                  : 'Abrir el Panel de Administrador'
              }
            >
              {authRole === 'admin' ? (
                <>
                  <User className="w-4 h-4" />
                  <span>Mi Vista Conductor</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Panel Admin</span>
                </>
              )}
            </button>
          )}

          {mapOpenForTerritoryId && (
            <button
              onClick={() => setMapOpenForTerritoryId(null)}
              className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs sm:text-sm cursor-pointer"
            >
              Volver al Panel
            </button>
          )}

          <button
            onClick={() => {
              setAuthRole(null);
              setLoggedConductor(null);
              setMapOpenForTerritoryId(null);
              setActiveSlotForMap(null);
            }}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        {mapOpenForTerritoryId ? (
          <FieldMapView
            territories={db.territories}
            blocks={db.blocks}
            housePoints={db.housePoints}
            activeTerritoryId={mapOpenForTerritoryId}
            activeSlot={activeSlotForMap}
            canSwitchAllTerritories={authRole === 'admin'}
            allowedTerritoryIds={
              authRole === 'admin'
                ? undefined
                : activeSlotForMap
                ? activeSlotForMap.territoryIds
                : loggedConductor
                ? db.territories
                    .filter(
                      (t) =>
                        t.assignedToId === loggedConductor.id ||
                        (t.assignedToName &&
                          t.assignedToName === loggedConductor.name) ||
                        t.id === mapOpenForTerritoryId
                    )
                    .map((t) => t.id)
                : [mapOpenForTerritoryId]
            }
            onSelectTerritory={(id) => setMapOpenForTerritoryId(id)}
            onBack={() => setMapOpenForTerritoryId(null)}
            onAddHousePoint={(pt) =>
              handleAddHousePoint(
                pt,
                authRole === 'admin' ? 'admin' : 'conductor'
              )
            }
            onUpdateHouseStatus={handleUpdateHouseStatus}
            onDeleteHousePoint={handleDeleteHousePoint}
            onUpdateBlockStatus={handleUpdateBlockStatus}
            onCompleteWholeTerritory={handleCompleteWholeTerritory}
            onResetTerritory={handleResetTerritory}
          />
        ) : authRole === 'conductor' && loggedConductor ? (
          <ConductorPortal
            conductor={loggedConductor}
            schedule={db.schedule}
            territories={db.territories}
            blocks={db.blocks}
            housePoints={db.housePoints}
            pushNotifications={db.pushNotifications}
            onOpenSlotMap={(slot) => {
              setActiveSlotForMap(slot);
              setMapOpenForTerritoryId(
                slot.territoryIds[0] || db.territories[0]?.id || 'terr-1'
              );
            }}
            onOpenTerritoryMap={(territoryId) => {
              setActiveSlotForMap(null);
              setMapOpenForTerritoryId(territoryId);
            }}
            onCompleteWholeTerritory={(territoryId, condName) =>
              handleCompleteWholeTerritory(territoryId, condName)
            }
            onMarkNotificationRead={(notifId) => {
              const nextDb = saveDatabase({
                ...db,
                pushNotifications: db.pushNotifications.map((n) =>
                  n.id === notifId ? { ...n, readByConductor: true } : n
                ),
              });
              setDb(nextDb);
            }}
          />
        ) : (
          <AdminDashboard
            db={db}
            onOpenTerritoryInMap={(territoryId) => {
              setActiveSlotForMap(null);
              setMapOpenForTerritoryId(territoryId);
            }}
            onImportMapsData={(
              newTerritories: Territory[],
              newBlocks: Block[],
              newPoints: HousePoint[],
              replaceAll: boolean
            ) => {
              const nextDb: AppDatabase = replaceAll
                ? {
                    ...db,
                    territories:
                      newTerritories.length > 0
                        ? newTerritories
                        : db.territories,
                    blocks: newBlocks,
                    housePoints: [
                      ...db.housePoints.filter(
                        (p) => p.category === 'no_visitar'
                      ),
                      ...newPoints,
                    ],
                  }
                : {
                    ...db,
                    territories: [...db.territories, ...newTerritories],
                    blocks: [...db.blocks, ...newBlocks],
                    housePoints: [...db.housePoints, ...newPoints],
                  };
              setDb(saveDatabase(nextDb));
            }}
            onAddConductor={(name, pin, isAdmin) => {
              const newCond: ConductorUser = {
                id: `cond-${Date.now()}`,
                name,
                pin,
                isAdmin: Boolean(isAdmin),
              };
              setDb(
                saveDatabase({
                  ...db,
                  conductors: [...db.conductors, newCond],
                })
              );
            }}
            onToggleConductorAdmin={(conductorId) => {
              const target = db.conductors.find((c) => c.id === conductorId);
              if (!target) return;
              const adminCount = db.conductors.filter((c) => c.isAdmin).length;
              if (target.isAdmin && adminCount <= 1) {
                return;
              }
              setDb(
                saveDatabase({
                  ...db,
                  conductors: db.conductors.map((c) =>
                    c.id === conductorId ? { ...c, isAdmin: !c.isAdmin } : c
                  ),
                })
              );
            }}
            onDeleteConductor={(conductorId) => {
              const target = db.conductors.find((c) => c.id === conductorId);
              const adminCount = db.conductors.filter((c) => c.isAdmin).length;
              if (target?.isAdmin && adminCount <= 1) {
                return;
              }
              setDb(
                saveDatabase({
                  ...db,
                  conductors: db.conductors.filter((c) => c.id !== conductorId),
                })
              );
            }}
            onAddScheduleSlot={(slotData) => {
              const newSlot: ScheduleSlot = {
                ...slotData,
                id: `sched-${Date.now()}`,
              };
              const assignDate = slotData.date || new Date().toISOString().slice(0, 10);
              const slotTerritorySet = new Set(slotData.territoryIds);
              setDb(
                saveDatabase({
                  ...db,
                  schedule: [...db.schedule, newSlot],
                  territories: db.territories.map((t) =>
                    slotTerritorySet.has(t.id)
                      ? {
                          ...t,
                          assignedToId: slotData.conductorId,
                          assignedToName: slotData.conductorName,
                          assignedAt: assignDate,
                          lastConductor: slotData.conductorName,
                          startedAt: t.startedAt || assignDate,
                        }
                      : t
                  ),
                })
              );
            }}
            onDeleteScheduleSlot={(slotId) => {
              setDb(
                saveDatabase({
                  ...db,
                  schedule: db.schedule.filter((s) => s.id !== slotId),
                })
              );
            }}
            onUpdateScheduleSlot={(updatedSlot) => {
              const assignDate =
                updatedSlot.date || new Date().toISOString().slice(0, 10);
              const slotTerritorySet = new Set(updatedSlot.territoryIds);
              setDb(
                saveDatabase({
                  ...db,
                  schedule: db.schedule.map((s) =>
                    s.id === updatedSlot.id ? updatedSlot : s
                  ),
                  territories: db.territories.map((t) =>
                    slotTerritorySet.has(t.id)
                      ? {
                          ...t,
                          assignedToId: updatedSlot.conductorId,
                          assignedToName: updatedSlot.conductorName,
                          assignedAt: assignDate,
                          lastConductor: updatedSlot.conductorName,
                          startedAt: t.startedAt || assignDate,
                        }
                      : t
                  ),
                })
              );
            }}
            onUpdateCustomLocations={(locations: MeetingLocation[]) => {
              setDb(
                saveDatabase({
                  ...db,
                  customLocations: locations,
                })
              );
            }}
            onSaveTerritory={(updatedTerr) => {
              setDb(
                saveDatabase({
                  ...db,
                  territories: db.territories.map((t) =>
                    t.id === updatedTerr.id ? updatedTerr : t
                  ),
                })
              );
            }}
            onCreateTerritory={(newTerr) => {
              setDb(
                saveDatabase({
                  ...db,
                  territories: [...db.territories, newTerr],
                })
              );
            }}
            onDeleteTerritory={(territoryId) => {
              setDb(
                saveDatabase({
                  ...db,
                  territories: db.territories.filter((t) => t.id !== territoryId),
                  blocks: db.blocks.filter((b) => b.territoryId !== territoryId),
                  housePoints: db.housePoints.filter(
                    (hp) => hp.territoryId !== territoryId
                  ),
                })
              );
            }}
            onSaveBlock={(updatedBlock) => {
              setDb(
                saveDatabase({
                  ...db,
                  blocks: db.blocks.map((b) =>
                    b.id === updatedBlock.id ? updatedBlock : b
                  ),
                })
              );
            }}
            onCreateBlock={(newBlock) => {
              setDb(
                saveDatabase({
                  ...db,
                  blocks: [...db.blocks, newBlock],
                })
              );
            }}
            onDeleteBlock={(blockId) => {
              setDb(
                saveDatabase({
                  ...db,
                  blocks: db.blocks.filter((b) => b.id !== blockId),
                  housePoints: db.housePoints.filter((hp) => hp.blockId !== blockId),
                })
              );
            }}
            onUpdateNotificationTemplate={(updated: PushNotificationTemplate) => {
              setDb(
                saveDatabase({
                  ...db,
                  notificationTemplates: db.notificationTemplates.map((t) =>
                    t.id === updated.id ? updated : t
                  ),
                })
              );
            }}
            onSendPushNotificationToConductor={(params) => {
              const newPush: PushNotificationItem = {
                id: `push-${Date.now()}`,
                conductorId: params.conductorId,
                conductorName: params.conductorName,
                slotId: params.slotId,
                title: params.title,
                body: params.body,
                createdAt: new Date().toISOString(),
                readByConductor: false,
              };
              setDb(
                saveDatabase({
                  ...db,
                  pushNotifications: [newPush, ...db.pushNotifications],
                })
              );
            }}
            onCompleteWholeTerritory={(territoryId) =>
              handleCompleteWholeTerritory(territoryId, 'Administrador')
            }
            onResetTerritory={(territoryId) =>
              handleResetTerritory(territoryId, 'Administrador')
            }
            onAssignTerritory={handleAssignTerritory}
            onUpdateCongregationSettings={(name, pin) => {
              setDb(
                saveDatabase({
                  ...db,
                  congregationName: name.trim() || db.congregationName,
                  adminPin: pin.trim() || db.adminPin,
                })
              );
            }}
            onRestoreFullBackup={(backupDb) =>
              setDb(saveDatabase(sanitizeDatabase(backupDb)))
            }
            onLaunchStartupWizard={() => {
              const confirmed = window.confirm(
                '¿Desea abrir el Asistente de Configuración Inicial para empezar desde cero o configurar otra congregación? Sus datos actuales no se perderán hasta que complete el asistente.'
              );
              if (confirmed) {
                setIsWizardOpen(true);
              }
            }}
          />
        )}
      </main>
    </div>
  </ErrorBoundary>
);
};
export default App;
