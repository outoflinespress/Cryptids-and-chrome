import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flame,
  Play,
  RotateCcw,
  Trash2,
  Truck,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { GarageModal } from './components/GarageModal';
import { HudOverlay } from './components/HudOverlay';
import { MonsterArtwork } from './components/MonsterArtwork';
import { MonsterRadioWidget } from './components/MonsterRadioWidget';
import { soundEngine } from './game/audio';
import { monsterRadio } from './game/monsterRadio';
import {
  countAffordableUpgrades,
  DEFAULT_SAVE,
  getBike,
  getRider,
  loadSave,
  persistSave,
  RIDERS,
} from './game/catalog';
import { CryptidGame3DEngine, type TouchControlId } from './game/engine3d';
import {
  GameScreen,
  HudSnapshot,
  PlayerSave,
  RiderId,
  RunSummaryData,
  ScareMechanicId,
} from './game/types';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CryptidGame3DEngine | null>(null);

  const [save, setSave] = useState<PlayerSave>(() => loadSave());
  const [screen, setScreen] = useState<GameScreen>('TITLE');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [summary, setSummary] = useState<RunSummaryData | null>(null);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const saveRef = useRef(save);
  saveRef.current = save;

  const screenRef = useRef(screen);
  screenRef.current = screen;

  const updateSave = useCallback((updater: (prev: PlayerSave) => PlayerSave) => {
    setSave((prev) => {
      const next = updater(prev);
      persistSave(next);
      engineRef.current?.syncSave(next);
      return next;
    });
  }, []);

  // Mount Three.js engine once cleanly
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new CryptidGame3DEngine(mount, saveRef.current, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onMonsterRescued: (riderId: RiderId) => {
        setSave((prev) => {
          const unlocked = prev.unlockedRiders.includes(riderId)
            ? prev.unlockedRiders
            : [...prev.unlockedRiders, riderId];
          const rescued = prev.rescuedRiders.includes(riderId)
            ? prev.rescuedRiders
            : [...prev.rescuedRiders, riderId];
          const next: PlayerSave = {
            ...prev,
            unlockedRiders: unlocked,
            rescuedRiders: rescued,
          };
          persistSave(next);
          engineRef.current?.syncSave(next);
          return next;
        });
      },
      onRunComplete: (data: RunSummaryData) => {
        setSave((prev) => {
          const next: PlayerSave = {
            ...prev,
            dread: prev.dread + data.dreadEarned,
            totalDreadEarned: prev.totalDreadEarned + data.dreadEarned,
            totalWrecked: prev.totalWrecked + data.wreckedCount,
            totalHijacked: prev.totalHijacked + data.hijackedCount,
            bestRunDread: Math.max(prev.bestRunDread, data.dreadEarned),
            bestCombo: Math.max(prev.bestCombo, data.bestCombo),
            runsCompleted: prev.runsCompleted + 1,
          };
          persistSave(next);
          engineRef.current?.syncSave(next);
          return next;
        });
        setSummary(data);
        setScreen('SUMMARY');
      },
      onPauseRequest: () => {
        if (screenRef.current === 'PLAYING') {
          engineRef.current?.setScreen('PAUSED');
          setScreen('PAUSED');
        }
      },
    });

    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync screen changes to engine
  const transitionScreen = useCallback((next: GameScreen) => {
    setConfirmReset(false);
    setScreen(next);
    engineRef.current?.setScreen(next);
  }, []);

  const handleStartRun = useCallback(() => {
    soundEngine.playGarageClick();
    monsterRadio.ensureStarted();
    setSummary(null);
    setConfirmReset(false);
    setScreen('PLAYING');
    engineRef.current?.startNewRun();
  }, []);

  const handleBankAndExit = useCallback(() => {
    soundEngine.playGarageClick();
    engineRef.current?.bankAndExitRun();
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleResetSave = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const fresh = structuredClone(DEFAULT_SAVE);
    persistSave(fresh);
    setSave(fresh);
    engineRef.current?.syncSave(fresh);
    setConfirmReset(false);
    transitionScreen('TITLE');
  }, [confirmReset, transitionScreen]);

  // Global keyboard shortcuts (Enter/Space on Title, H to toggle dock, Esc to resume)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'KeyR') {
        e.preventDefault();
        monsterRadio.nextStation();
        return;
      }
      if (e.code === 'KeyM') {
        e.preventDefault();
        monsterRadio.togglePower();
        return;
      }

      if (screenRef.current === 'TITLE') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartRun();
        }
      } else if (screenRef.current === 'PLAYING') {
        if (e.code === 'KeyH') {
          setDockCollapsed((prev) => !prev);
        }
      } else if (screenRef.current === 'PAUSED') {
        if (e.code === 'Escape') {
          e.preventDefault();
          transitionScreen('PLAYING');
        }
      } else if (screenRef.current === 'GARAGE') {
        if (e.code === 'Escape') {
          e.preventDefault();
          transitionScreen('TITLE');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartRun, transitionScreen]);

  const activeRider = useMemo(
    () => getRider(save.equipped.rider),
    [save.equipped.rider],
  );
  const activeBike = useMemo(
    () => getBike(save.equipped.bike),
    [save.equipped.bike],
  );
  const affordableCount = useMemo(() => countAffordableUpgrades(save), [save]);
  const quickSwitchRiders = useMemo(
    () => save.unlockedRiders.slice(0, 6).map((id) => getRider(id)),
    [save.unlockedRiders],
  );

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-[#0b0e18] text-[#f4efe6] select-none">
      {/* Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="absolute inset-0 z-0 touch-none" />

      {/* TITLE OVERLAY (No backdrop blur, open center/right to show live 3D monster on motorcycle) */}
      {screen === 'TITLE' && (
        <div className="fixed inset-0 z-10 flex flex-col justify-between p-5 sm:p-8 pointer-events-none">
          {/* Top Bar */}
          <div className="flex items-start justify-between gap-4">
            {/* Bespoke SVG Title Lockup */}
            <div className="max-w-lg pointer-events-auto">
              <div className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase text-[#ff7a29]">
                Out of Lines Press · 3D Midnight Highway Chase
              </div>
              <svg
                viewBox="0 0 560 108"
                className="w-full max-w-[460px] h-auto mt-1 drop-shadow-[0_4px_0_rgba(8,10,16,0.95)]"
                role="heading"
                aria-level={1}
                aria-label="Cryptids and Chrome: Halloween is Every Day"
              >
                <defs>
                  <linearGradient id="chromeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff8ec" />
                    <stop offset="48%" stopColor="#ff9b54" />
                    <stop offset="100%" stopColor="#ff4d12" />
                  </linearGradient>
                </defs>
                <text
                  x="0"
                  y="62"
                  fill="url(#chromeGrad)"
                  stroke="#0b0e18"
                  strokeWidth="7"
                  paintOrder="stroke"
                  fontFamily="Big Shoulders Display, sans-serif"
                  fontWeight="800"
                  fontSize="72"
                  letterSpacing="2"
                >
                  CRYPTIDS &amp; CHROME
                </text>
                <rect x="2" y="74" width="420" height="3" fill="#8cff2e" />
                <text
                  x="2"
                  y="99"
                  fill="#f4efe6"
                  stroke="#0b0e18"
                  strokeWidth="4"
                  paintOrder="stroke"
                  fontFamily="Big Shoulders Display, sans-serif"
                  fontWeight="700"
                  fontSize="26"
                  letterSpacing="5.5"
                >
                  HALLOWEEN IS EVERY DAY
                </text>
              </svg>
            </div>

            {/* Right Stats + Monster Radio + Mute */}
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <div className="flex items-center gap-2.5">
                <div className="bg-[#0e111a]/90 border-2 border-[#2a3142] px-3.5 py-2 text-right hidden sm:block">
                  <div className="font-mono text-[10px] uppercase text-[#9aa3b2]">
                    Dread Bank · Roster
                  </div>
                  <div className="font-mono text-sm font-bold tabular-nums">
                    <span className="text-[#ff7a29]">
                      {save.dread.toLocaleString()} Dread
                    </span>
                    <span className="text-[#4c566a] mx-2">·</span>
                    <span className="text-[#8cff2e]">
                      {save.unlockedRiders.length}/{RIDERS.length} Cryptids
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
                  className="bg-[#0e111a]/90 hover:bg-[#1a2030] border-2 border-[#2a3142] hover:border-[#8cff2e] p-2.5 transition-colors cursor-pointer"
                >
                  {muted ? (
                    <VolumeX className="w-5 h-5 text-[#9aa3b2]" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-[#f4efe6]" />
                  )}
                </button>
              </div>
              <MonsterRadioWidget variant="title" />
            </div>
          </div>

          {/* Left-Anchored Starter Switcher & Primary CTA */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="pointer-events-auto max-w-md space-y-3">
              {/* Current Cryptid Preview Card */}
              <div className="bg-[#0e111a]/92 border-2 border-[#2b3346] p-3 flex items-center gap-3.5 shadow-xl">
                <MonsterArtwork
                  rider={activeRider}
                  className="w-20 h-20 shrink-0 border-2 border-[#39435a]"
                />
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[#8cff2e]">
                    Ready to Ride · {activeBike.name}
                  </div>
                  <div className="font-display text-2xl font-extrabold tracking-wide uppercase text-[#f4efe6] leading-tight">
                    {activeRider.name}
                  </div>
                  <div className="text-xs text-[#b8c1d1] truncate">
                    Signature [Q]: {activeRider.signatureName}
                  </div>
                  <div className="text-[11px] text-[#8f99ad] truncate">
                    Passive: {activeRider.passiveName}
                  </div>
                </div>
              </div>

              {/* Quick Switcher for Unlocked Starters */}
              <div className="flex flex-wrap items-center gap-1.5">
                {quickSwitchRiders.map((r) => {
                  const active = r.id === save.equipped.rider;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playGarageClick();
                        updateSave((prev) => ({
                          ...prev,
                          equipped: { ...prev.equipped, rider: r.id },
                        }));
                      }}
                      className={`px-2.5 py-1 text-xs font-display tracking-wider uppercase font-bold border-2 transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#8cff2e] text-[#0b0e18] border-[#8cff2e]'
                          : 'bg-[#0e111a]/90 text-[#d0d7e3] border-[#2d3548] hover:border-[#ff7a29]'
                      }`}
                    >
                      {r.name}
                    </button>
                  );
                })}
                {save.unlockedRiders.length > 6 && (
                  <button
                    type="button"
                    onClick={() => transitionScreen('GARAGE')}
                    className="px-2.5 py-1 text-xs font-mono text-[#ff7a29] bg-[#0e111a]/90 border border-[#2d3548] hover:border-[#ff7a29] cursor-pointer"
                  >
                    +{save.unlockedRiders.length - 6} more
                  </button>
                )}
              </div>

              {/* Primary Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleStartRun}
                  className="bg-[#ff5412] hover:bg-[#ff6d33] text-[#0c0e14] font-display text-2xl font-extrabold tracking-wider uppercase px-7 py-3 flex items-center gap-2 border-2 border-[#ffb08a] shadow-lg transition-colors cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Hit the Highway</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playGarageClick();
                    transitionScreen('GARAGE');
                  }}
                  className="bg-[#121622]/95 hover:bg-[#1c2336] text-[#f4efe6] font-display text-xl font-bold tracking-wider uppercase px-5 py-3 flex items-center gap-2 border-2 border-[#343e56] hover:border-[#ff7a29] transition-colors cursor-pointer"
                >
                  <Wrench className="w-4 h-4 text-[#ff7a29]" />
                  <span>Garage &amp; 51 Monsters</span>
                  {affordableCount > 0 && (
                    <span className="font-mono text-[11px] font-bold bg-[#8cff2e] text-[#0b0e18] px-2 py-0.5">
                      {affordableCount}{' '}
                      {affordableCount === 1 ? 'Upgrade Ready' : 'Upgrades Ready'}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Bottom Right Compact Control Strip */}
            <div className="bg-[#0e111a]/90 border border-[#2a3142] px-3.5 py-2 text-[11px] font-mono text-[#b4bdce] max-w-xl">
              Drag Road / Left-Right / A-D Steer · Gas-Brake / W-S Speed · Tap or 1–5 / Space Scares · Q Signature · F Hijack / Rescue · Shift Nitro · R / M Monster Radio
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE HIGHWAY HUD */}
      {screen === 'PLAYING' && hud && (
        <HudOverlay
          hud={hud}
          muted={muted}
          dockCollapsed={dockCollapsed}
          onToggleDock={() => setDockCollapsed((p) => !p)}
          onToggleMute={handleToggleMute}
          onPause={() => transitionScreen('PAUSED')}
          onSelectScare={(id: ScareMechanicId) =>
            engineRef.current?.selectAndTriggerScare(id)
          }
          onTriggerSignature={() => engineRef.current?.triggerSignaturePower()}
          onTriggerLeapOrHijack={() => engineRef.current?.triggerLeapOrHijack()}
          onTriggerNitro={() => engineRef.current?.triggerNitro()}
          onTouchInput={(control: TouchControlId, active: boolean) =>
            engineRef.current?.setTouchInput(control, active)
          }
        />
      )}

      {/* LIVE 3D GARAGE & 51-MONSTER ROSTER */}
      {screen === 'GARAGE' && (
        <GarageModal
          save={save}
          onUpdateSave={updateSave}
          onClose={() => transitionScreen('TITLE')}
          onPlayNow={handleStartRun}
        />
      )}

      {/* PAUSE MODAL */}
      {screen === 'PAUSED' && (
        <div className="fixed inset-0 z-30 bg-[#080a12]/80 flex items-center justify-center p-4">
          <div className="ink-panel w-full max-w-sm p-5 space-y-3.5 max-h-[92dvh] overflow-y-auto ink-scroll">
            <div className="text-center">
              <div className="font-mono text-xs uppercase tracking-widest text-[#ff7a29]">
                Highway Paused
              </div>
              <h2 className="font-display text-4xl font-extrabold uppercase tracking-wide text-[#f4efe6] mt-0.5">
                {activeRider.name}
              </h2>
              {hud && (
                <div className="mt-1 font-mono text-xs text-[#9aa3b2] tabular-nums">
                  Current Haul: +{hud.dreadThisRun.toLocaleString()} Dread ·{' '}
                  {hud.wreckedCount} Wrecks · {hud.hijackedCount} Hijacks
                </div>
              )}
            </div>

            <MonsterRadioWidget variant="modal" />

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => transitionScreen('PLAYING')}
                className="w-full py-2.5 bg-[#8cff2e] hover:bg-[#a6ff59] text-[#0c0e14] font-display text-xl font-extrabold tracking-wider uppercase cursor-pointer"
              >
                Resume Chase
              </button>

              <button
                type="button"
                onClick={handleBankAndExit}
                className="w-full py-2.5 bg-[#ff7a29] hover:bg-[#ff944d] text-[#0c0e14] font-display text-xl font-extrabold tracking-wider uppercase cursor-pointer"
              >
                Bank Haul &amp; End Run
              </button>

              <button
                type="button"
                onClick={handleStartRun}
                className="w-full py-2 bg-[#1a2030] hover:bg-[#242c42] border border-[#343d54] text-[#f4efe6] font-display text-lg font-bold tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Highway Run</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                className="w-full py-2 bg-[#141824] hover:bg-[#1e2436] border border-[#2d3548] text-[#c9d0dc] text-xs font-mono uppercase flex items-center justify-center gap-2 cursor-pointer"
              >
                {muted ? (
                  <>
                    <VolumeX className="w-4 h-4" />
                    <span>Sound: Muted (Click to Unmute)</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span>Sound: On (Click to Mute)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetSave}
                className="w-full py-1.5 text-xs font-mono text-[#ff6b81] hover:text-[#ff99a8] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {confirmReset
                    ? 'Click Again to Confirm Full Progress Reset'
                    : 'Reset Save Progress'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RUN SUMMARY MODAL */}
      {screen === 'SUMMARY' && summary && (
        <div className="fixed inset-0 z-30 bg-[#080a12]/85 flex items-center justify-center p-4">
          <div className="ink-panel w-full max-w-lg p-6 space-y-5 max-h-[92vh] overflow-y-auto ink-scroll">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-[#ff7a29]">
                  {summary.endedByDefeat
                    ? 'Wiped Out on the Expressway'
                    : 'Midnight Haul Banked'}
                </div>
                <h2 className="font-display text-4xl font-extrabold uppercase tracking-wide text-[#f4efe6] leading-none mt-1">
                  Run Complete
                </h2>
              </div>
              {summary.isNewRecord && (
                <div className="bg-[#8cff2e] text-[#0c0e14] font-mono text-xs font-bold uppercase px-2.5 py-1">
                  New Record
                </div>
              )}
            </div>

            {/* Primary Haul Box */}
            <div className="bg-[#121622] border-2 border-[#ff7a29]/60 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Flame className="w-6 h-6 text-[#ff7a29]" />
                <div>
                  <div className="font-mono text-[11px] uppercase text-[#9aa3b2]">
                    Dread Banked
                  </div>
                  <div className="font-mono text-3xl font-bold text-[#ff7a29] tabular-nums leading-none">
                    +{summary.dreadEarned.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-[11px] uppercase text-[#9aa3b2]">
                  Total Bank
                </div>
                <div className="text-lg font-bold text-[#f4efe6] tabular-nums">
                  {save.dread.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2.5 font-mono text-center">
              <div className="ink-card p-2.5">
                <div className="text-[10px] uppercase text-[#9aa3b2]">Wrecks</div>
                <div className="text-xl font-bold text-[#f4efe6] tabular-nums mt-0.5">
                  {summary.wreckedCount}
                </div>
              </div>
              <div className="ink-card p-2.5">
                <div className="text-[10px] uppercase text-[#9aa3b2]">Hijacks</div>
                <div className="text-xl font-bold text-[#ff7a29] tabular-nums mt-0.5">
                  {summary.hijackedCount}
                </div>
              </div>
              <div className="ink-card p-2.5">
                <div className="text-[10px] uppercase text-[#9aa3b2]">Best Combo</div>
                <div className="text-xl font-bold text-[#8cff2e] tabular-nums mt-0.5">
                  {summary.bestCombo}×
                </div>
              </div>
              <div className="ink-card p-2.5">
                <div className="text-[10px] uppercase text-[#9aa3b2]">Top Speed</div>
                <div className="text-base font-bold text-[#f4efe6] tabular-nums mt-0.5">
                  {summary.maxMph} MPH
                </div>
              </div>
              <div className="ink-card p-2.5">
                <div className="text-[10px] uppercase text-[#9aa3b2]">Distance</div>
                <div className="text-base font-bold text-[#f4efe6] tabular-nums mt-0.5">
                  {summary.distanceMiles.toFixed(2)} mi
                </div>
              </div>
              <div className="ink-card p-2.5">
                <div className="text-[10px] uppercase text-[#9aa3b2]">Roadside Props</div>
                <div className="text-base font-bold text-[#f4efe6] tabular-nums mt-0.5">
                  {summary.propsTriggered}
                </div>
              </div>
            </div>

            {/* Rescued Cryptids Showcase */}
            {summary.rescuedRiders.length > 0 && (
              <div className="bg-[#131b18] border-2 border-[#8cff2e]/60 p-3.5">
                <div className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-[#8cff2e]">
                  <Truck className="w-4 h-4" />
                  <span>
                    Rescued &amp; Unlocked ({summary.rescuedRiders.length})
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {summary.rescuedRiders.map((rid) => {
                    const r = getRider(rid);
                    return (
                      <div
                        key={rid}
                        className="bg-[#121622] border border-[#2f3b32] p-1.5"
                      >
                        <MonsterArtwork rider={r} className="w-full h-24" />
                        <div className="mt-1 font-display text-sm uppercase text-[#f4efe6] truncate">
                          {r.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#8cff2e]">
                          Now Playable in Garage
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playGarageClick();
                  transitionScreen('GARAGE');
                }}
                className="py-3 bg-[#1a2030] hover:bg-[#242c42] border-2 border-[#3a455e] hover:border-[#ff7a29] text-[#f4efe6] font-display text-xl font-bold tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
              >
                <Wrench className="w-5 h-5 text-[#ff7a29]" />
                <span>Open Garage</span>
                {affordableCount > 0 && (
                  <span className="font-mono text-[11px] font-bold bg-[#8cff2e] text-[#0b0e18] px-2 py-0.5">
                    {affordableCount}{' '}
                    {affordableCount === 1 ? 'Upgrade Ready' : 'Upgrades Ready'}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleStartRun}
                className="py-3 bg-[#ff5412] hover:bg-[#ff6d33] text-[#0c0e14] font-display text-xl font-extrabold tracking-wider uppercase flex items-center justify-center gap-2 border-2 border-[#ffb08a] cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Hit Highway Again</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
