import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Flame,
  Lock,
  Pause,
  ShieldAlert,
  Truck,
  Volume2,
  VolumeX,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Bike,
  Car,
} from 'lucide-react';
import type { TouchControlId } from '../game/engine3d';
import { HudSnapshot, ScareMechanicId } from '../game/types';
import { MonsterRadioWidget } from './MonsterRadioWidget';

interface HudOverlayProps {
  hud: HudSnapshot;
  muted: boolean;
  dockCollapsed: boolean;
  onToggleDock: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onSelectScare: (id: ScareMechanicId) => void;
  onTriggerSignature: () => void;
  onTriggerLeapOrHijack: () => void;
  onTriggerNitro: () => void;
  onTouchInput: (control: TouchControlId, active: boolean) => void;
}

export function HudOverlay({
  hud,
  muted,
  dockCollapsed,
  onToggleDock,
  onToggleMute,
  onPause,
  onSelectScare,
  onTriggerSignature,
  onTriggerLeapOrHijack,
  onTriggerNitro,
  onTouchInput,
}: HudOverlayProps) {
  const [activeTouch, setActiveTouch] = useState<Record<TouchControlId, boolean>>({
    left: false,
    right: false,
    throttle: false,
    brake: false,
  });

  const setControl = useCallback(
    (control: TouchControlId, active: boolean) => {
      onTouchInput(control, active);
      setActiveTouch((prev) =>
        prev[control] === active ? prev : { ...prev, [control]: active },
      );
    },
    [onTouchInput],
  );

  // Always release any held touch inputs if HUD unmounts (e.g. pause / run end)
  useEffect(() => {
    return () => {
      onTouchInput('left', false);
      onTouchInput('right', false);
      onTouchInput('throttle', false);
      onTouchInput('brake', false);
    };
  }, [onTouchInput]);

  const bindHoldButton = (control: TouchControlId) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failures
      }
      setControl(control, true);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setControl(control, false);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setControl(control, false);
    },
    onLostPointerCapture: () => {
      setControl(control, false);
    },
    onContextMenu: (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
    },
  });

  const isOnFoot = hud.controlMode === 'on_foot';
  const isStolen = hud.controlMode.startsWith('stolen_');

  // Contextual [F] button label & accent
  let leapActionTitle = 'Leap On Foot';
  let leapActionSub = 'Vulnerable · 2.2× Scare';
  let leapAccent = '#f4efe6';
  let leapHighlighted = false;

  if (hud.captiveTruck?.canLeapToBreak) {
    leapActionTitle = 'Break Cage';
    leapActionSub = `Free ${hud.captiveTruck.riderName}`;
    leapAccent = '#8cff2e';
    leapHighlighted = true;
  } else if (hud.hijackTargetLabel) {
    leapActionTitle = hud.hijackTargetLabel;
    leapActionSub = 'Steal Vehicle!';
    leapAccent = '#ff7a29';
    leapHighlighted = true;
  } else if (isOnFoot) {
    leapActionTitle = 'Recall Bike';
    leapActionSub = 'Vault Back On Chrome';
    leapAccent = '#8cff2e';
    leapHighlighted = true;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2 sm:p-4">
      {/* TOP PERIMETER BAR */}
      <div className="relative z-20 flex items-start justify-between gap-2 sm:gap-3">
        {/* TOP-LEFT: Dread, Combo, Wreck/Hijack Telemetry + Monster Radio Tuner */}
        <div className="flex flex-col items-start gap-1.5 shrink-0">
          <div className="bg-[#0e111a]/90 border-2 border-[#2a3142] px-2.5 py-2 sm:px-3.5 sm:py-2.5 min-w-[132px] sm:min-w-[205px] shadow-lg">
            <div className="flex items-baseline justify-between gap-2 sm:gap-4">
              <span className="font-display text-[11px] sm:text-xs tracking-widest uppercase text-[#9aa3b2]">
                Dread
              </span>
              <span className="font-mono text-base sm:text-xl font-bold text-[#ff7a29] tabular-nums">
                +{hud.dreadThisRun.toLocaleString()}
              </span>
            </div>

            <div className="mt-0.5 sm:mt-1 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-mono text-[#c9d0dc] tabular-nums">
              <span>{hud.wreckedCount}W</span>
              <span className="text-[#4c566a]">·</span>
              <span>{hud.hijackedCount}H</span>
              <span className="text-[#4c566a]">·</span>
              <span>{hud.distanceMiles.toFixed(1)}mi</span>
            </div>

            {hud.combo > 1 && (
              <div className="mt-1.5 sm:mt-2 pt-1 sm:pt-1.5 border-t border-[#262c3b]">
                <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono">
                  <span className="font-bold text-[#8cff2e] tracking-wide">
                    {hud.combo}× COMBO
                  </span>
                  <span className="text-[#9aa3b2] tabular-nums hidden sm:inline">
                    Best {hud.bestCombo}×
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full bg-[#1a1f2c] overflow-hidden">
                  <div
                    className="h-full bg-[#8cff2e] transition-[width] duration-75"
                    style={{ width: `${Math.round(hud.comboTimerFrac * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {hud.rescuedThisRun.length > 0 && (
              <div className="mt-1 text-[10px] sm:text-[11px] font-mono text-[#8cff2e]">
                {hud.rescuedThisRun.length} Rescued
              </div>
            )}
          </div>

          <MonsterRadioWidget variant="hud" />
        </div>

        {/* TOP-CENTER: Captive Containment Truck Alert OR Status Toast */}
        <div className="flex-1 hidden md:flex flex-col items-center max-w-md mx-auto">
          {hud.captiveTruck ? (
            <div
              className="w-full bg-[#121622]/95 border-2 px-3.5 py-2 shadow-lg"
              style={{
                borderColor: hud.captiveTruck.canLeapToBreak ? '#8cff2e' : '#ff7a29',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Truck className="w-4 h-4 text-[#ff7a29] shrink-0" />
                  <span className="font-display text-base tracking-wide uppercase text-[#f4efe6] truncate">
                    Captive: {hud.captiveTruck.riderName}
                  </span>
                  <span className="font-mono text-[11px] text-[#9aa3b2] shrink-0">
                    {hud.captiveTruck.poolNumber}
                  </span>
                </div>
                <span className="font-mono text-xs text-[#ffd166] tabular-nums shrink-0">
                  {hud.captiveTruck.distanceAhead >= 0
                    ? `${hud.captiveTruck.distanceAhead}m ahead`
                    : `${Math.abs(hud.captiveTruck.distanceAhead)}m behind`}
                </span>
              </div>

              {/* Cage Lock HP Bar */}
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase text-[#9aa3b2] shrink-0">
                  Cage Lock
                </span>
                <div className="flex-1 h-2 bg-[#1c2231] border border-[#323a4d]">
                  <div
                    className="h-full transition-[width] duration-100"
                    style={{
                      width: `${Math.round(hud.captiveTruck.hpFrac * 100)}%`,
                      backgroundColor:
                        hud.captiveTruck.hpFrac < 0.35 ? '#8cff2e' : '#ff7a29',
                    }}
                  />
                </div>
                {hud.captiveTruck.canLeapToBreak && (
                  <span className="font-mono text-[11px] font-bold text-[#8cff2e] shrink-0">
                    TAP [F]
                  </span>
                )}
              </div>
            </div>
          ) : hud.statusToast ? (
            <div className="bg-[#0e111a]/90 border border-[#343c50] px-4 py-1.5 text-center shadow-md">
              <span className="text-xs font-medium text-[#f4efe6] tracking-wide">
                {hud.statusToast}
              </span>
            </div>
          ) : null}

          {hud.inSpotlightWarning && (
            <div className="mt-2 bg-[#361116]/95 border-2 border-[#ff3b5c] px-3.5 py-1.5 flex items-center gap-2 shadow-lg">
              <ShieldAlert className="w-4 h-4 text-[#ff3b5c] shrink-0" />
              <span className="font-mono text-xs font-bold tracking-wider uppercase text-[#ffd6dc]">
                Skeptic Spotlight Lock — Swerve or Shatter Shield!
              </span>
            </div>
          )}

          {hud.inDarkness && (
            <div className="mt-1.5 bg-[#121024]/90 border border-[#7c5cff] px-3 py-0.5 text-[11px] font-mono text-[#c5b5ff]">
              Blackout Zone Active · Night Ambush Boost
            </div>
          )}
        </div>

        {/* TOP-RIGHT: Integrity, MPH, Vehicle Mode, Audio & Prominent Pause */}
        <div className="flex items-start gap-1.5 sm:gap-2 shrink-0">
          <div className="bg-[#0e111a]/90 border-2 border-[#2a3142] px-2.5 py-2 sm:px-3.5 sm:py-2.5 min-w-[126px] sm:min-w-[200px] shadow-lg">
            {/* Integrity Plates */}
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <span className="font-display text-[11px] sm:text-xs tracking-widest uppercase text-[#9aa3b2] hidden sm:inline">
                Integrity
              </span>
              <div className="flex items-center gap-1">
                {Array.from({ length: hud.maxHp }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2.5 w-4 sm:w-5 border ${
                      i < hud.hp
                        ? isOnFoot
                          ? 'bg-[#ffd166] border-[#fff1b8]'
                          : 'bg-[#ff5412] border-[#ffa07a]'
                        : 'bg-[#1a1f2c] border-[#2e3547]'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Speed & Vehicle Mode */}
            <div className="mt-1 sm:mt-1.5 flex items-baseline justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-semibold truncate max-w-[78px] sm:max-w-none">
                {isOnFoot ? (
                  <Footprints className="w-3.5 h-3.5 text-[#ffd166] shrink-0" />
                ) : isStolen ? (
                  <Car className="w-3.5 h-3.5 text-[#ff7a29] shrink-0" />
                ) : (
                  <Bike className="w-3.5 h-3.5 text-[#8cff2e] shrink-0" />
                )}
                <span
                  className={`truncate ${
                    isOnFoot
                      ? 'text-[#ffd166]'
                      : isStolen
                        ? 'text-[#ff7a29]'
                        : 'text-[#e5e9f0]'
                  }`}
                >
                  {hud.vehicleLabel}
                </span>
              </div>
              <div className="font-mono text-base sm:text-lg font-bold text-[#f4efe6] tabular-nums shrink-0">
                {hud.mph}
                <span className="text-[9px] sm:text-[10px] font-normal text-[#9aa3b2] ml-0.5 sm:ml-1">
                  MPH
                </span>
              </div>
            </div>

            {isOnFoot && (
              <div className="mt-0.5 text-[9px] sm:text-[10px] font-mono font-bold tracking-wider uppercase text-[#ff5c77]">
                2× DMG · 2.2× SCARE
              </div>
            )}
          </div>

          {/* Touch-friendly Pause & Mute at Top-Right */}
          <div className="pointer-events-auto flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onPause}
              aria-label="Pause Game"
              title="Pause (Esc)"
              className="touch-manipulation min-w-[44px] min-h-[44px] bg-[#0e111a]/95 hover:bg-[#1a2030] active:bg-[#ff5412] active:text-[#0c0e14] border-2 border-[#ff7a29]/80 hover:border-[#ff7a29] text-[#f4efe6] flex items-center justify-center shadow-lg transition-colors cursor-pointer"
            >
              <Pause className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              title={muted ? 'Unmute Audio' : 'Mute Audio'}
              className="touch-manipulation min-w-[44px] min-h-[38px] bg-[#0e111a]/90 hover:bg-[#1a2030] active:bg-[#232b40] border-2 border-[#2a3142] hover:border-[#8cff2e] text-[#f4efe6] flex items-center justify-center shadow-lg transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-[#9aa3b2]" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE COMPACT CAPTIVE / WARNING BANNER (below top bar on narrow phone screens) */}
      {(hud.captiveTruck || hud.inSpotlightWarning) && (
        <div className="relative z-20 md:hidden mt-1.5 flex flex-col items-center gap-1">
          {hud.captiveTruck && (
            <div
              className="w-full max-w-xs bg-[#121622]/95 border-2 px-2.5 py-1.5 shadow-lg"
              style={{
                borderColor: hud.captiveTruck.canLeapToBreak ? '#8cff2e' : '#ff7a29',
              }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Truck className="w-3.5 h-3.5 text-[#ff7a29] shrink-0" />
                  <span className="font-display text-sm uppercase text-[#f4efe6] truncate">
                    {hud.captiveTruck.riderName}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#ffd166] tabular-nums shrink-0">
                  {hud.captiveTruck.distanceAhead >= 0
                    ? `${hud.captiveTruck.distanceAhead}m`
                    : `${Math.abs(hud.captiveTruck.distanceAhead)}m back`}
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-[#1c2231] border border-[#323a4d]">
                <div
                  className="h-full transition-[width] duration-100"
                  style={{
                    width: `${Math.round(hud.captiveTruck.hpFrac * 100)}%`,
                    backgroundColor:
                      hud.captiveTruck.hpFrac < 0.35 ? '#8cff2e' : '#ff7a29',
                  }}
                />
              </div>
            </div>
          )}
          {hud.inSpotlightWarning && (
            <div className="bg-[#361116]/95 border border-[#ff3b5c] px-2.5 py-1 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-[#ff3b5c] shrink-0" />
              <span className="font-mono text-[10px] font-bold uppercase text-[#ffd6dc]">
                Spotlight Lock — Swerve!
              </span>
            </div>
          )}
        </div>
      )}

      {/* QUEUED CENTER-SCREEN ANNOUNCEMENT (one at a time, safely below top HUD & Integrity bar) */}
      <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
        {hud.callouts[0] &&
          (() => {
            const c = hud.callouts[0];
            const progress = Math.min(1, c.age / 1.0);
            const opacity =
              progress < 0.1
                ? progress / 0.1
                : progress < 0.78
                  ? 1
                  : Math.max(0, 1 - (progress - 0.78) / 0.22);
            const liftPx = progress * 10;
            return (
              <div
                key={c.id}
                className="absolute left-1/2 w-full max-w-[min(86vw,480px)] px-3 text-center"
                style={{
                  top: 'max(140px, 36%)',
                  opacity,
                  transform: `translate(-50%, ${-liftPx}px)`,
                }}
              >
                <div
                  className="font-display text-2xl sm:text-3xl font-extrabold tracking-wider uppercase leading-tight drop-shadow-[0_3px_0_rgba(8,10,16,0.95)]"
                  style={{ color: c.color }}
                >
                  {c.text}
                </div>
                {c.subtext && (
                  <div className="font-mono text-[11px] font-bold tracking-wider uppercase text-[#f4efe6] drop-shadow-[0_2px_0_rgba(8,10,16,0.95)] mt-0.5">
                    {c.subtext}
                  </div>
                )}
              </div>
            );
          })()}
      </div>

      {/* BOTTOM CONTROLS: Persistent Hijack/Rescue Prompt + Action Dock + Bottom Thumb Controls */}
      <div className="mt-auto flex flex-col gap-2">
        {/* PERSISTENT HIJACK / RESCUE PROMPT (stays on screen for the full ~25m range) */}
        {(hud.captiveTruck?.canLeapToBreak || hud.hijackTargetLabel) && (
          <div className="relative z-20 flex justify-center">
            <button
              type="button"
              onClick={onTriggerLeapOrHijack}
              className="pointer-events-auto touch-manipulation bg-[#0e111a]/95 hover:bg-[#192032] active:scale-[0.98] border-2 px-4 py-2 shadow-2xl flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 transition-all cursor-pointer"
              style={{
                borderColor: hud.captiveTruck?.canLeapToBreak ? '#8cff2e' : '#ff7a29',
              }}
            >
              <span
                className="font-display text-base sm:text-lg font-extrabold tracking-wider uppercase leading-tight"
                style={{
                  color: hud.captiveTruck?.canLeapToBreak ? '#8cff2e' : '#ff7a29',
                }}
              >
                {hud.captiveTruck?.canLeapToBreak
                  ? 'PRESS [F] · RESCUE — BREAK CAGE'
                  : 'PRESS [F] — HIJACK'}
              </span>
              <span className="font-mono text-[11px] sm:text-xs font-bold uppercase text-[#f4efe6]">
                {hud.captiveTruck?.canLeapToBreak
                  ? `Free ${hud.captiveTruck.riderName}`
                  : hud.hijackTargetLabel?.replace(/^Hijack\s+/i, '')}
              </span>
            </button>
          </div>
        )}

        {/* Desktop XL puts Steer Left | Action Dock | Brake/Throttle on one clean row;
            smaller viewports stack Action Dock cleanly above the thumb pads so zero controls overlap! */}
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-2">
          {/* ACTION DOCK (Middle on XL, Stacked above thumb pads on Phones/Tablets) */}
          <div className="flex flex-col items-center order-1 xl:order-2 min-w-0">
            <div className="pointer-events-auto mb-1">
              <button
                type="button"
                onClick={onToggleDock}
                className="touch-manipulation bg-[#0e111a]/90 hover:bg-[#1a2030] border border-[#2f3649] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-mono text-[#9aa3b2] hover:text-[#f4efe6] flex items-center gap-1 transition-colors cursor-pointer"
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Show Dock [H]</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Hide Dock [H]</span>
                  </>
                )}
              </button>
            </div>

            {!dockCollapsed && (
              <div className="pointer-events-auto bg-[#0e111a]/92 border-2 border-[#2a3142] px-1.5 py-1.5 sm:px-2.5 sm:py-2 shadow-xl flex flex-nowrap sm:flex-wrap items-stretch justify-start sm:justify-center gap-1 sm:gap-1.5 max-w-full overflow-x-auto ink-scroll">
                {/* 5 SCARE MECHANIC SLOTS (1-5) */}
                {hud.scareSlots.map((slot) => {
                  const locked = slot.level <= 0;
                  const ready = !locked && slot.readyFrac >= 0.99;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={locked}
                      onClick={() => onSelectScare(slot.id)}
                      className={`touch-manipulation shrink-0 relative overflow-hidden min-w-[82px] sm:min-w-[104px] max-w-[124px] px-1.5 py-1 sm:px-2 sm:py-1.5 text-left border-2 transition-colors ${
                        locked
                          ? 'bg-[#12151f] border-[#232836] opacity-55 cursor-not-allowed'
                          : slot.selected
                            ? 'bg-[#1b2030] cursor-pointer'
                            : 'bg-[#141824] hover:bg-[#1c2233] active:bg-[#252d44] border-[#2d3447] cursor-pointer'
                      }`}
                      style={
                        !locked && slot.selected
                          ? { borderColor: slot.color }
                          : undefined
                      }
                    >
                      {/* Cooldown fill bar */}
                      {!locked && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-1 transition-[width] duration-75"
                          style={{
                            width: `${Math.round(slot.readyFrac * 100)}%`,
                            backgroundColor: ready ? slot.color : '#525c73',
                          }}
                        />
                      )}

                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span
                          className="font-bold px-1 bg-[#0b0e16] border border-[#30384b]"
                          style={{ color: locked ? '#6b7280' : slot.color }}
                        >
                          {slot.hotkey}
                        </span>
                        {locked ? (
                          <Lock className="w-3 h-3 text-[#6b7280]" />
                        ) : (
                          <span className="text-[#9aa3b2]">Lv{slot.level}</span>
                        )}
                      </div>

                      <div className="mt-0.5 sm:mt-1 font-display text-xs sm:text-sm tracking-wide uppercase text-[#f4efe6] leading-tight whitespace-normal">
                        {slot.name}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-[#8d96a8] leading-tight whitespace-normal hidden sm:block">
                        {locked ? 'Buy in Garage' : slot.category}
                      </div>
                    </button>
                  );
                })}

                <div className="w-px bg-[#2a3142] mx-0.5 hidden sm:block" />

                {/* CRYPTID SIGNATURE POWER (Q) */}
                <button
                  type="button"
                  onClick={onTriggerSignature}
                  className="touch-manipulation shrink-0 relative overflow-hidden min-w-[94px] sm:min-w-[126px] max-w-[152px] px-1.5 py-1 sm:px-2.5 sm:py-1.5 text-left border-2 bg-[#161a27] hover:bg-[#20263a] active:bg-[#2a324d] transition-colors cursor-pointer"
                  style={{
                    borderColor:
                      hud.signatureReadyFrac >= 0.99 ? hud.signatureColor : '#30384b',
                  }}
                >
                  <div
                    className="absolute bottom-0 left-0 h-1 transition-[width] duration-75"
                    style={{
                      width: `${Math.round(hud.signatureReadyFrac * 100)}%`,
                      backgroundColor: hud.signatureColor,
                    }}
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span
                      className="font-bold px-1 bg-[#0b0e16] border border-[#30384b]"
                      style={{ color: hud.signatureColor }}
                    >
                      Q
                    </span>
                    <Flame
                      className="w-3.5 h-3.5"
                      style={{
                        color:
                          hud.signatureReadyFrac >= 0.99
                            ? hud.signatureColor
                            : '#556078',
                      }}
                    />
                  </div>
                  <div className="mt-0.5 sm:mt-1 font-display text-xs sm:text-sm tracking-wide uppercase text-[#f4efe6] leading-tight whitespace-normal">
                    {hud.signatureName}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-[#8d96a8] leading-tight whitespace-normal hidden sm:block">
                    {hud.signatureReadyFrac >= 0.99 ? 'Signature Ready' : 'Charging'}
                  </div>
                </button>

                {/* CONTEXTUAL HIJACK / LEAP / BREAK CAGE (F) */}
                <button
                  type="button"
                  onClick={onTriggerLeapOrHijack}
                  className="touch-manipulation shrink-0 relative overflow-hidden min-w-[104px] sm:min-w-[154px] max-w-[186px] px-1.5 py-1 sm:px-2.5 sm:py-1.5 text-left border-2 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: leapHighlighted ? '#1f1b17' : '#141824',
                    borderColor: leapHighlighted ? leapAccent : '#2d3447',
                  }}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                    <span
                      className="font-bold px-1 bg-[#0b0e16] border border-[#30384b]"
                      style={{ color: leapAccent }}
                    >
                      F
                    </span>
                    <span className="text-[#9aa3b2] text-[9px] sm:text-[10px]">
                      {hud.captiveTruck?.canLeapToBreak
                        ? 'RESCUE'
                        : hud.hijackTargetLabel
                          ? 'STEAL'
                          : isOnFoot
                            ? 'MOUNT'
                            : 'STUNT'}
                    </span>
                  </div>
                  <div
                    className="mt-0.5 sm:mt-1 font-display text-xs sm:text-sm tracking-wide uppercase leading-tight whitespace-normal"
                    style={{ color: leapHighlighted ? leapAccent : '#f4efe6' }}
                  >
                    {leapActionTitle}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-[#9aa3b2] leading-tight whitespace-normal hidden sm:block">
                    {leapActionSub}
                  </div>
                </button>

                {/* NITRO BOOST (SHIFT) */}
                <button
                  type="button"
                  onClick={onTriggerNitro}
                  className="touch-manipulation shrink-0 relative overflow-hidden min-w-[72px] sm:min-w-[88px] px-1.5 py-1 sm:px-2 sm:py-1.5 text-left border-2 bg-[#141824] hover:bg-[#1c2233] active:bg-[#242e47] transition-colors cursor-pointer"
                  style={{
                    borderColor: hud.nitroActive
                      ? '#38bdf8'
                      : hud.nitroFrac >= 0.25
                        ? '#ff7a29'
                        : '#2d3447',
                  }}
                >
                  <div
                    className="absolute bottom-0 left-0 h-1.5 transition-[width] duration-75"
                    style={{
                      width: `${Math.round(hud.nitroFrac * 100)}%`,
                      backgroundColor: hud.nitroActive ? '#38bdf8' : '#ff7a29',
                    }}
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="font-bold px-1 bg-[#0b0e16] border border-[#30384b] text-[#38bdf8]">
                      SHIFT
                    </span>
                    <Zap
                      className="w-3.5 h-3.5"
                      style={{
                        color: hud.nitroFrac >= 0.25 ? '#38bdf8' : '#525c73',
                      }}
                    />
                  </div>
                  <div className="mt-0.5 sm:mt-1 font-display text-xs sm:text-sm tracking-wide uppercase text-[#f4efe6] leading-tight">
                    Nitro
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-mono text-[#8d96a8] tabular-nums">
                    {Math.round(hud.nitroFrac * 100)}%
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* BOTTOM THUMB CONTROLS ROW (Bottom-Left Steer + Bottom-Right Brake/Throttle) */}
          <div className="order-2 xl:contents flex items-end justify-between gap-3">
            {/* BOTTOM-LEFT: STEER LEFT / STEER RIGHT */}
            <div className="pointer-events-auto xl:order-1 flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label="Steer Left"
                {...bindHoldButton('left')}
                className={`touch-none select-none w-16 h-16 sm:w-[70px] sm:h-[70px] border-2 flex flex-col items-center justify-center shadow-xl transition-colors cursor-pointer ${
                  activeTouch.left
                    ? 'bg-[#ff5412] border-[#ffd6c2] text-[#0c0e14]'
                    : 'bg-[#0e111a]/90 border-[#343e56] hover:border-[#ff7a29] text-[#f4efe6]'
                }`}
              >
                <ChevronLeft className="w-8 h-8 stroke-[2.5]" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider leading-none -mt-0.5">
                  Left
                </span>
              </button>

              <button
                type="button"
                aria-label="Steer Right"
                {...bindHoldButton('right')}
                className={`touch-none select-none w-16 h-16 sm:w-[70px] sm:h-[70px] border-2 flex flex-col items-center justify-center shadow-xl transition-colors cursor-pointer ${
                  activeTouch.right
                    ? 'bg-[#ff5412] border-[#ffd6c2] text-[#0c0e14]'
                    : 'bg-[#0e111a]/90 border-[#343e56] hover:border-[#ff7a29] text-[#f4efe6]'
                }`}
              >
                <ChevronRight className="w-8 h-8 stroke-[2.5]" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider leading-none -mt-0.5">
                  Right
                </span>
              </button>
            </div>

            {/* BOTTOM-RIGHT: BRAKE & THROTTLE */}
            <div className="pointer-events-auto xl:order-3 flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label="Brake"
                {...bindHoldButton('brake')}
                className={`touch-none select-none w-16 h-16 sm:w-[70px] sm:h-[70px] border-2 flex flex-col items-center justify-center shadow-xl transition-colors cursor-pointer ${
                  activeTouch.brake
                    ? 'bg-[#ff2a54] border-[#ffc2cf] text-[#0c0e14]'
                    : 'bg-[#0e111a]/90 border-[#4d2834] hover:border-[#ff2a54] text-[#ff8aa0]'
                }`}
              >
                <ChevronDown className="w-7 h-7 stroke-[2.5]" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider leading-none">
                  Brake
                </span>
              </button>

              <button
                type="button"
                aria-label="Throttle"
                {...bindHoldButton('throttle')}
                className={`touch-none select-none w-16 h-16 sm:w-[70px] sm:h-[70px] border-2 flex flex-col items-center justify-center shadow-xl transition-colors cursor-pointer ${
                  activeTouch.throttle
                    ? 'bg-[#8cff2e] border-[#e2ffc7] text-[#0c0e14]'
                    : 'bg-[#0e111a]/90 border-[#334d28] hover:border-[#8cff2e] text-[#8cff2e]'
                }`}
              >
                <ChevronUp className="w-7 h-7 stroke-[2.5]" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider leading-none">
                  Gas
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
