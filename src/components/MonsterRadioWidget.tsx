import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Power,
  Radio,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  monsterRadio,
  RADIO_STATIONS,
  type MonsterRadioState,
} from '../game/monsterRadio';

interface MonsterRadioWidgetProps {
  variant?: 'hud' | 'title' | 'modal';
}

const EQ_PHASES = [0.42, 0.85, 0.62, 0.94, 0.5];

export function MonsterRadioWidget({ variant = 'hud' }: MonsterRadioWidgetProps) {
  const [state, setState] = useState<MonsterRadioState>(() =>
    monsterRadio.getState(),
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    return monsterRadio.subscribe(setState);
  }, []);

  const { station, enabled, playing, muted, tuningStatic, beatStep } = state;
  const active = playing && !muted;

  const stopCanvasPointer = (e: ReactPointerEvent) => {
    e.stopPropagation();
  };

  const renderEqBars = (compact = false) => (
    <div
      className={`flex items-end gap-[2px] shrink-0 ${compact ? 'h-3.5' : 'h-4'}`}
      aria-hidden="true"
    >
      {EQ_PHASES.map((phase, idx) => {
        let pct = 18;
        if (tuningStatic && enabled && !muted) {
          pct = 30 + (((beatStep + idx * 7) * 37) % 70);
        } else if (active) {
          const wave = Math.abs(Math.sin(beatStep * 0.72 + idx * 1.25));
          pct = Math.round(24 + wave * phase * 76);
        }
        return (
          <span
            key={idx}
            className="w-[3px] transition-[height] duration-75"
            style={{
              height: `${pct}%`,
              backgroundColor: !enabled || muted
                ? '#394154'
                : tuningStatic
                  ? '#f4efe6'
                  : station.accent,
            }}
          />
        );
      })}
    </div>
  );

  // Full inline head-unit for Pause Modal
  if (variant === 'modal') {
    return (
      <div
        onPointerDown={stopCanvasPointer}
        className="bg-[#111521] border-2 p-3 space-y-2.5"
        style={{ borderColor: active ? `${station.accent}99` : '#2d3548' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Radio
              className="w-4 h-4 shrink-0"
              style={{ color: active ? station.accent : '#6b7280' }}
            />
            <span className="font-display text-sm tracking-widest uppercase text-[#f4efe6] font-bold">
              Monster Radio
            </span>
            {renderEqBars()}
          </div>

          <button
            type="button"
            onClick={() => monsterRadio.togglePower()}
            title="Toggle Monster Radio [M]"
            className={`px-2 py-0.5 border font-mono text-[10px] font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
              enabled
                ? 'bg-[#1a2234] border-[#8cff2e] text-[#8cff2e]'
                : 'bg-[#141824] border-[#343d54] text-[#8d96a8]'
            }`}
          >
            <Power className="w-3 h-3" />
            <span>{enabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Active Station Banner */}
        <div className="bg-[#0b0e16] border border-[#262e40] px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="font-mono text-xs font-bold"
              style={{ color: enabled ? station.accent : '#6b7280' }}
            >
              {station.freq}
            </span>
            <span className="font-display text-base font-extrabold uppercase tracking-wide text-[#f4efe6] truncate">
              {station.name}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] font-mono">
            <span className="text-[#c9d0dc] truncate">
              {tuningStatic
                ? '— TUNING SIGNAL —'
                : enabled
                  ? `♪ ${state.trackTitle}`
                  : 'Radio Powered Off'}
            </span>
            <span className="text-[#7c8599] shrink-0">{station.dj}</span>
          </div>
          {enabled && (
            <div className="mt-1 text-[10px] text-[#9aa3b2] italic leading-snug">
              “{state.djLine}”
            </div>
          )}
        </div>

        {/* Station Selector Grid */}
        <div className="grid grid-cols-1 gap-1">
          {RADIO_STATIONS.map((st, idx) => {
            const selected = idx === state.stationIndex;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => monsterRadio.selectStation(idx)}
                className={`px-2 py-1 border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  selected
                    ? 'bg-[#1b2233] text-[#f4efe6]'
                    : 'bg-[#121622] hover:bg-[#191f30] border-[#262e40] text-[#b4bdce]'
                }`}
                style={selected ? { borderColor: st.accent } : undefined}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="font-mono text-[10px] font-bold shrink-0"
                    style={{ color: st.accent }}
                  >
                    {st.freq}
                  </span>
                  <span className="font-display text-sm font-bold uppercase tracking-wide truncate">
                    {st.name}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#848e9f] shrink-0">
                  {st.genre}
                </span>
              </button>
            );
          })}
        </div>

        {/* Volume Bar */}
        <div className="flex items-center gap-2 pt-0.5">
          {muted || state.volume === 0 ? (
            <VolumeX className="w-3.5 h-3.5 text-[#8d96a8] shrink-0" />
          ) : (
            <Volume2
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: station.accent }}
            />
          )}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(state.volume * 100)}
            onChange={(e) => monsterRadio.setVolume(Number(e.target.value) / 100)}
            aria-label="Monster Radio Volume"
            className="w-full h-1.5 bg-[#1c2233] cursor-pointer"
            style={{ accentColor: station.accent }}
          />
          <span className="font-mono text-[10px] text-[#9aa3b2] tabular-nums w-8 text-right shrink-0">
            {Math.round(state.volume * 100)}%
          </span>
        </div>
      </div>
    );
  }

  // Compact HUD / Title Dashboard Tuner with Expandable Station Drawer
  const isTitle = variant === 'title';

  return (
    <div
      onPointerDown={stopCanvasPointer}
      className="pointer-events-auto relative select-none"
    >
      {/* Compact Head Unit */}
      <div
        className={`bg-[#0e111a]/92 border-2 shadow-lg transition-colors ${
          isTitle
            ? 'px-2.5 py-1.5 min-w-[208px] sm:min-w-[248px]'
            : 'px-2 py-1.5 sm:px-2.5 min-w-[132px] sm:min-w-[205px] max-w-[196px] sm:max-w-[248px]'
        }`}
        style={{
          borderColor: active ? `${station.accent}aa` : '#2a3142',
        }}
      >
        {/* Top Line: Icon + Freq + Controls */}
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => {
              monsterRadio.ensureStarted();
              setExpanded((prev) => !prev);
            }}
            title="Open Monster Radio Dial"
            className="touch-manipulation flex items-center gap-1.5 min-w-0 text-left cursor-pointer group"
          >
            <Radio
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: active ? station.accent : '#6b7280' }}
            />
            <span
              className="font-mono text-[11px] font-bold tabular-nums shrink-0"
              style={{ color: enabled && !muted ? station.accent : '#8d96a8' }}
            >
              {station.freq}
            </span>
            {renderEqBars(true)}
          </button>

          {/* Compact Tuner Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => monsterRadio.prevStation()}
              aria-label="Previous Monster Radio Station"
              title="Previous Station"
              className="touch-manipulation p-1 bg-[#141824] hover:bg-[#20273b] border border-[#2d3548] text-[#d0d7e3] hover:text-[#f4efe6] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => monsterRadio.nextStation()}
              aria-label="Next Monster Radio Station"
              title="Next Station [R]"
              className="touch-manipulation p-1 bg-[#141824] hover:bg-[#20273b] border border-[#2d3548] text-[#d0d7e3] hover:text-[#f4efe6] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => monsterRadio.togglePower()}
              aria-label={enabled ? 'Turn Off Monster Radio' : 'Turn On Monster Radio'}
              title={enabled ? 'Turn Off Radio [M]' : 'Turn On Radio [M]'}
              className={`touch-manipulation p-1 border transition-colors cursor-pointer ${
                enabled && !muted
                  ? 'bg-[#192132] border-[#8cff2e]/70 text-[#8cff2e]'
                  : 'bg-[#141824] border-[#2d3548] text-[#7c8599] hover:text-[#f4efe6]'
              }`}
            >
              <Power className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                monsterRadio.ensureStarted();
                setExpanded((prev) => !prev);
              }}
              aria-label={expanded ? 'Close Station Dial' : 'Open Station Dial'}
              title="Station List & Volume"
              className="touch-manipulation p-1 bg-[#141824] hover:bg-[#20273b] border border-[#2d3548] text-[#9aa3b2] hover:text-[#f4efe6] transition-colors cursor-pointer"
            >
              {expanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        {/* Station Name & Track Ticker */}
        <button
          type="button"
          onClick={() => {
            monsterRadio.ensureStarted();
            setExpanded((prev) => !prev);
          }}
          className="touch-manipulation mt-1 w-full text-left block cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="font-display text-xs sm:text-sm font-bold tracking-wide uppercase text-[#f4efe6] truncate leading-none">
              {station.name}
            </span>
            <span className="font-mono text-[9px] uppercase text-[#7c8599] shrink-0 hidden sm:inline">
              [R]
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#9aa3b2] truncate leading-tight">
            {muted
              ? 'Master Muted'
              : !enabled
                ? 'Radio Off · [M]'
                : tuningStatic
                  ? '— TUNING —'
                  : `♪ ${state.trackTitle}`}
          </div>
        </button>
      </div>

      {/* Expandable Station Picker & Volume Drawer */}
      {expanded && (
        <div
          className={`absolute top-full mt-1.5 z-40 w-[264px] bg-[#0e111a]/96 border-2 p-2.5 shadow-2xl space-y-2 ${
            isTitle ? 'right-0' : 'left-0'
          }`}
          style={{ borderColor: station.accent }}
        >
          <div className="flex items-center justify-between border-b border-[#252c3d] pb-1.5">
            <div>
              <div className="font-display text-sm font-extrabold uppercase tracking-wider text-[#f4efe6] leading-none">
                Monster Radio FM
              </div>
              <div className="font-mono text-[10px] text-[#8d96a8] mt-0.5">
                {station.dj} · {station.genre}
              </div>
            </div>
            <span className="font-mono text-[9px] text-[#9aa3b2] uppercase">
              [R] Tune · [M] Power
            </span>
          </div>

          {enabled && !muted && (
            <div className="bg-[#121622] border border-[#262e40] px-2 py-1 text-[10px] text-[#c9d0dc] italic leading-snug">
              “{state.djLine}”
            </div>
          )}

          <div className="space-y-1">
            {RADIO_STATIONS.map((st, idx) => {
              const selected = idx === state.stationIndex;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => monsterRadio.selectStation(idx)}
                  className={`touch-manipulation w-full px-2 py-1.5 border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#1a2234] text-[#f4efe6]'
                      : 'bg-[#121622] hover:bg-[#192032] border-[#262e40] text-[#b4bdce]'
                  }`}
                  style={selected ? { borderColor: st.accent } : undefined}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="font-mono text-[10px] font-bold shrink-0"
                        style={{ color: st.accent }}
                      >
                        {st.freq}
                      </span>
                      <span className="font-display text-sm font-bold uppercase tracking-wide truncate">
                        {st.name}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-[9px] text-[#848e9f] shrink-0">
                    {st.genre}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2 pt-1 border-t border-[#252c3d]">
            {muted || state.volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-[#8d96a8] shrink-0" />
            ) : (
              <Volume2
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: station.accent }}
              />
            )}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(state.volume * 100)}
              onChange={(e) =>
                monsterRadio.setVolume(Number(e.target.value) / 100)
              }
              aria-label="Monster Radio Volume"
              className="w-full h-1.5 bg-[#1c2233] cursor-pointer"
              style={{ accentColor: station.accent }}
            />
            <span className="font-mono text-[10px] text-[#9aa3b2] tabular-nums w-8 text-right shrink-0">
              {Math.round(state.volume * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
