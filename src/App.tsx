import React, { useEffect, useState } from 'react';
import { LogOut, ShieldCheck, User, Wifi, WifiOff } from 'lucide-react';
import {
  AppDatabase,
  Block,
  BlockStatus,
  ConductorUser,
  HousePoint,
  HousePointCategory,
  HousePointStatus,
  PushNotificationItem,
  PushNotificationTemplate,
  ScheduleSlot,
  Territory,
} from './types/territory';
import {
  appendSyncAction,
  fetchCloudDatabase,
  generateHouseShortCode,
  getBlankLiveDatabase,
  loadDatabase,
  markWholeTerritoryCompleted,
  resetTerritoryForNewCycle,
  saveDatabase,
} from './services/storageAndSync';
import { StartupWizard } from './components/StartupWizard';
import { LoginView } from './components/LoginView';
import { ConductorPortal } from './components/ConductorPortal';
import { PublisherLightView } from './components/PublisherLightView';
import { FieldMapView } from './components/FieldMapView';
import { AdminDashboard } from './components/AdminDashboard';

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

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Sincronización periódica con la nube (/api/cloud-state)
  useEffect(() => {
    let active = true;

    const syncFromCloud = async () => {
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
    };

    syncFromCloud();
    const interval = setInterval(syncFromCloud, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setDb((prev) => {
        if (prev.offlineQueue.length === 0) return prev;
        return saveDatabase({ ...prev, offlineQueue: [] });
      });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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
      blocks: db.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              status,
              lastWorkedAt: todayStr,
              lastConductor: conductorName || b.lastConductor,
            }
          : b
      ),
    };

    nextDb = appendSyncAction(
      nextDb,
      `Marcó Manzana ${targetBlock.code} como ${status}`
    );
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

  // ASISTENTE DE CONFIGURACIÓN INICIAL (STARTUP WIZARD) CUANDO LA APP NO HA SIDO CONFIGURADA AÚN
  if (!db.isConfigured) {
    return (
      <StartupWizard
        onCompleteWizard={(configuredDb) => {
          const saved = saveDatabase(configuredDb);
          setDb(saved);
          setAuthRole('admin');
        }}
      />
    );
  }

  // ROL 3: Si es un Publicador que entró con el link especial (?grupo=ID), mostrar la vista Ultra-Ligera sin Login
  if (authRole === 'publisher_link') {
    const slot =
      db.schedule.find((s) => s.id === publisherSlotId) || db.schedule[0];
    if (slot) {
      return (
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
      );
    }
  }

  // Si no ha iniciado sesión, mostrar la pantalla de Login para Conductores y Siervo de Territorios / Admin
  if (!authRole) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-100">
        <header className="h-16 bg-slate-900 text-white px-4 sm:px-6 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-lg">
              🗺️
            </div>
            <span className="font-black text-base">{db.congregationName}</span>
          </div>
          <div className="text-xs text-slate-300 flex items-center gap-1.5">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                <Wifi className="w-3.5 h-3.5" /> Nube Conectada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                <WifiOff className="w-3.5 h-3.5" /> Modo Offline
              </span>
            )}
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
    );
  }

  return (
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
                  <ShieldCheck className="w-3 h-3" /> Siervo de Territorios
                  (Admin)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-blue-300 font-bold">
                  <User className="w-3 h-3" /> Conductor: {loggedConductor?.name}
                </span>
              )}
              <span>•</span>
              {isOnline ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <Wifi className="w-3 h-3" /> Nube Activa
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                  <WifiOff className="w-3 h-3" /> Sin señal (
                  {db.offlineQueue.length})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      <main className="flex-1">
        {mapOpenForTerritoryId ? (
          <FieldMapView
            territories={db.territories}
            blocks={db.blocks}
            housePoints={db.housePoints}
            activeTerritoryId={mapOpenForTerritoryId}
            activeSlot={activeSlotForMap}
            canSwitchAllTerritories={authRole === 'admin'}
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
            onAddConductor={(name, pin) => {
              const newCond: ConductorUser = {
                id: `cond-${Date.now()}`,
                name,
                pin,
              };
              setDb(
                saveDatabase({
                  ...db,
                  conductors: [...db.conductors, newCond],
                })
              );
            }}
            onDeleteConductor={(conductorId) => {
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
              setDb(
                saveDatabase({
                  ...db,
                  schedule: [...db.schedule, newSlot],
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
              setDb(
                saveDatabase({
                  ...db,
                  schedule: db.schedule.map((s) =>
                    s.id === updatedSlot.id ? updatedSlot : s
                  ),
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
            onUpdateCongregationSettings={(name, pin) => {
              setDb(
                saveDatabase({
                  ...db,
                  congregationName: name.trim() || db.congregationName,
                  adminPin: pin.trim() || db.adminPin,
                })
              );
            }}
            onRestoreFullBackup={(backupDb) => setDb(saveDatabase(backupDb))}
            onLaunchStartupWizard={() => {
              const blank = getBlankLiveDatabase();
              setDb(saveDatabase(blank));
              setAuthRole(null);
            }}
          />
        )}
      </main>
    </div>
  );
};
export default App;
