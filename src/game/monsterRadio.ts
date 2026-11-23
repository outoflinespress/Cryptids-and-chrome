import { soundEngine } from './audio';

export type RadioStationId =
  | 'hellbent_metal'
  | 'cryptid_synth'
  | 'graveyard_surf'
  | 'phantom_organ'
  | 'swamp_blues';

export interface RadioStation {
  id: RadioStationId;
  freq: string;
  name: string;
  genre: string;
  dj: string;
  accent: string;
  bpm: number;
  tracks: string[];
  djLines: string[];
}

export interface MonsterRadioState {
  enabled: boolean;
  playing: boolean;
  stationIndex: number;
  station: RadioStation;
  trackIndex: number;
  trackTitle: string;
  djLine: string;
  volume: number; // 0..1
  muted: boolean;
  beatStep: number;
  tuningStatic: boolean;
}

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'hellbent_metal',
    freq: '66.6 FM',
    name: 'Hellbent Metal',
    genre: 'Outlaw Thrash',
    dj: 'DJ Skullcrusher',
    accent: '#ff5412',
    bpm: 148,
    tracks: [
      'Chrome & Brimstone',
      'Asphalt Reaper',
      'Full Throttle Funeral',
      'Outlaw of Route 666',
    ],
    djLines: [
      'Crank the pipes & wake the dead on Route 666!',
      'Skeptic Patrol spotted ahead — smash those shields!',
      'Halloween is Every Day on 66.6 FM!',
    ],
  },
  {
    id: 'cryptid_synth',
    freq: '103.1 FM',
    name: 'Cryptid Synthwave',
    genre: 'Midnight Horror Synth',
    dj: 'Mothman Midnight',
    accent: '#8cff2e',
    bpm: 122,
    tracks: [
      'Neon Pine Overpass',
      'Harvest Moon Chase',
      'Eyes in the High-Beams',
      'Midnight Mothman Run',
    ],
    djLines: [
      'Broadcasting live from the bridge under the red moon...',
      'Keep your high-beams cursed and your combo climbing.',
      'All 51 cryptids tuned in across the pine expressway.',
    ],
  },
  {
    id: 'graveyard_surf',
    freq: '99.9 FM',
    name: 'Graveyard Surf',
    genre: 'Horror Surf Punk',
    dj: 'Baroness Banshee',
    accent: '#ffd166',
    bpm: 162,
    tracks: [
      'Banshee Surf Club',
      'Graveyard Dragstrip',
      'Swamp Thing Boogie',
      'Skeleton Sidecar',
    ],
    djLines: [
      'Reverb cranked to 11 — shred the midnight lanes!',
      'Captive trucks rolling tonight — crack those cages!',
      'Nothing outruns a Banshee wail on 99.9 FM!',
    ],
  },
  {
    id: 'phantom_organ',
    freq: '88.3 FM',
    name: 'Phantom Organ',
    genre: 'Gothic Doom',
    dj: 'Count Chrome',
    accent: '#a855f7',
    bpm: 98,
    tracks: [
      'Cathedral of Chrome',
      'Toccata on Highway 9',
      'Wraith in the Rearview',
      'Midnight Bell Toll',
    ],
    djLines: [
      'Pipe organ thunder for creatures of the midnight road.',
      'Short out the streetlamps and ride in pure blackout.',
      'Every panic wreck is a symphony on 88.3 FM.',
    ],
  },
  {
    id: 'swamp_blues',
    freq: '107.7 FM',
    name: 'Swamp Boogie',
    genre: 'Roadhouse Blues',
    dj: 'Bigfoot Slim',
    accent: '#38bdf8',
    bpm: 114,
    tracks: [
      'Sasquatch Stomp Blues',
      'Bayou Chopper',
      'Mudflaps & Moonshine',
      'Loch Ness Roadhouse',
    ],
    djLines: [
      'Heavy boots, loud exhaust, and greasy roadhouse riffs.',
      'Bigfoot Slim spinning swampy thunder all night long.',
      'Hijack a muscle car and let the subwoofers rumble!',
    ],
  },
];

const RADIO_STORAGE_KEY = 'cryptids_chrome_monster_radio_v1';

// Helper: MIDI note number -> frequency in Hz
function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface StoredRadioPrefs {
  enabled: boolean;
  stationIndex: number;
  volume: number;
}

class MonsterRadioEngine {
  private enabled = true;
  private playing = false;
  private stationIndex = 0;
  private trackIndex = 0;
  private djIndex = 0;
  private volume = 0.42;
  private beatStep = 0;
  private tuningStatic = false;

  private schedulerTimer: number | null = null;
  private staticTimer: number | null = null;
  private nextStepTime = 0;
  private stepsOnTrack = 0;

  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private listeners = new Set<(state: MonsterRadioState) => void>();

  constructor() {
    this.loadPrefs();
    soundEngine.onMuteChange(() => {
      this.syncGain();
      this.emit();
    });
  }

  private loadPrefs(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(RADIO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredRadioPrefs>;
      if (typeof parsed.enabled === 'boolean') this.enabled = parsed.enabled;
      if (
        typeof parsed.stationIndex === 'number' &&
        parsed.stationIndex >= 0 &&
        parsed.stationIndex < RADIO_STATIONS.length
      ) {
        this.stationIndex = parsed.stationIndex;
      }
      if (typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1) {
        this.volume = parsed.volume;
      }
    } catch {
      // Ignore storage errors
    }
  }

  private savePrefs(): void {
    if (typeof window === 'undefined') return;
    try {
      const prefs: StoredRadioPrefs = {
        enabled: this.enabled,
        stationIndex: this.stationIndex,
        volume: this.volume,
      };
      window.localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage errors
    }
  }

  public getState(): MonsterRadioState {
    const station = RADIO_STATIONS[this.stationIndex];
    return {
      enabled: this.enabled,
      playing: this.playing && this.enabled && !soundEngine.isMuted(),
      stationIndex: this.stationIndex,
      station,
      trackIndex: this.trackIndex,
      trackTitle: station.tracks[this.trackIndex % station.tracks.length],
      djLine: station.djLines[this.djIndex % station.djLines.length],
      volume: this.volume,
      muted: soundEngine.isMuted(),
      beatStep: this.beatStep,
      tuningStatic: this.tuningStatic,
    };
  }

  public subscribe(cb: (state: MonsterRadioState) => void): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(): void {
    const snap = this.getState();
    for (const cb of this.listeners) cb(snap);
  }

  private ensureMasterBus(ctx: AudioContext): GainNode {
    if (!this.masterGain) {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.12;

      const gain = ctx.createGain();
      gain.gain.value = this.getEffectiveGain();
      gain.connect(compressor);
      compressor.connect(ctx.destination);
      this.masterGain = gain;
    }
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.masterGain;
  }

  private getEffectiveGain(): number {
    if (!this.enabled || soundEngine.isMuted()) return 0;
    return this.volume * 0.34;
  }

  private syncGain(): void {
    const ctx = soundEngine.getAudioContext();
    if (!ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(this.getEffectiveGain(), ctx.currentTime, 0.04);
  }

  /**
   * Starts playback if Monster Radio is enabled (safe to call on any user interaction).
   */
  public ensureStarted(): void {
    if (!this.enabled) return;
    if (this.playing) {
      this.syncGain();
      return;
    }
    const ctx = soundEngine.getAudioContext();
    if (!ctx) return;
    this.ensureMasterBus(ctx);
    this.playing = true;
    this.nextStepTime = ctx.currentTime + 0.06;
    this.syncGain();
    this.startScheduler();
    this.emit();
  }

  public togglePower(): void {
    this.enabled = !this.enabled;
    this.savePrefs();
    if (this.enabled) {
      this.ensureStarted();
      this.playTuningStatic();
    } else {
      this.stopScheduler();
      this.playing = false;
      this.syncGain();
    }
    this.emit();
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.savePrefs();
    this.syncGain();
    this.emit();
  }

  public selectStation(index: number): void {
    const nextIdx = ((index % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    this.stationIndex = nextIdx;
    this.trackIndex = Math.floor(Math.random() * RADIO_STATIONS[nextIdx].tracks.length);
    this.djIndex = Math.floor(Math.random() * RADIO_STATIONS[nextIdx].djLines.length);
    this.stepsOnTrack = 0;
    this.beatStep = 0;
    if (!this.enabled) {
      this.enabled = true;
    }
    this.savePrefs();
    this.ensureStarted();
    this.playTuningStatic();
    this.emit();
  }

  public nextStation(): void {
    this.selectStation(this.stationIndex + 1);
  }

  public prevStation(): void {
    this.selectStation(this.stationIndex - 1);
  }

  private playTuningStatic(): void {
    if (soundEngine.isMuted() || !this.enabled) return;
    const ctx = soundEngine.getAudioContext();
    if (!ctx) return;
    const bus = this.ensureMasterBus(ctx);
    if (!this.noiseBuffer) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, now);
    bp.frequency.exponentialRampToValueAtTime(2800, now + 0.08);
    bp.frequency.exponentialRampToValueAtTime(950, now + 0.17);
    bp.Q.value = 1.6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    src.connect(bp);
    bp.connect(g);
    g.connect(bus);
    src.start(now);
    src.stop(now + 0.19);

    this.tuningStatic = true;
    if (this.staticTimer !== null) window.clearTimeout(this.staticTimer);
    this.staticTimer = window.setTimeout(() => {
      this.tuningStatic = false;
      this.emit();
    }, 220);
  }

  private startScheduler(): void {
    if (this.schedulerTimer !== null) return;
    this.schedulerTimer = window.setInterval(() => {
      this.scheduleAhead();
    }, 35);
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private scheduleAhead(): void {
    if (!this.playing || !this.enabled) return;
    const ctx = soundEngine.getAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    const bus = this.ensureMasterBus(ctx);

    const station = RADIO_STATIONS[this.stationIndex];
    const stepDuration = 60 / station.bpm / 4; // 16th note

    // Prevent catch-up burst after background tab pause
    if (this.nextStepTime < ctx.currentTime - 0.35) {
      this.nextStepTime = ctx.currentTime + 0.04;
    }

    let emittedBeat = false;
    while (this.nextStepTime < ctx.currentTime + 0.14) {
      this.scheduleStep(ctx, bus, station.id, this.beatStep, this.nextStepTime, stepDuration);
      this.nextStepTime += stepDuration;
      this.beatStep = (this.beatStep + 1) % 64;
      this.stepsOnTrack++;

      // Rotate track & DJ line every ~128 16th-notes (~16–22s)
      if (this.stepsOnTrack >= 192) {
        this.stepsOnTrack = 0;
        this.trackIndex = (this.trackIndex + 1) % station.tracks.length;
        this.djIndex = (this.djIndex + 1) % station.djLines.length;
        emittedBeat = true;
      } else if (this.beatStep % 2 === 0) {
        emittedBeat = true;
      }
    }

    if (emittedBeat) {
      this.emit();
    }
  }

  // =====================================================================
  // PROCEDURAL SYNTHESIS VOICE HELPERS (Drums, Bass, Leads, Organs, Pads)
  // =====================================================================
  private playKick(ctx: AudioContext, bus: GainNode, t: number, punch = 0.65): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(132, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(punch, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  private playSnare(ctx: AudioContext, bus: GainNode, t: number, level = 0.32, toneHz = 190): void {
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1100;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(level, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      src.connect(hp);
      hp.connect(ng);
      ng.connect(bus);
      src.start(t);
      src.stop(t + 0.14);
    }

    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(toneHz, t);
    body.frequency.exponentialRampToValueAtTime(92, t + 0.07);
    bg.gain.setValueAtTime(level * 0.65, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    body.connect(bg);
    bg.connect(bus);
    body.start(t);
    body.stop(t + 0.1);
  }

  private playHat(ctx: AudioContext, bus: GainNode, t: number, open = false, level = 0.11): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6800;
    const g = ctx.createGain();
    const dur = open ? 0.14 : 0.04;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(bus);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  private playTone(
    ctx: AudioContext,
    bus: GainNode,
    t: number,
    midi: number,
    dur: number,
    opts: {
      type: OscillatorType;
      gain: number;
      filterHz: number;
      filterQ?: number;
      detune?: number;
      slideToMidi?: number;
    },
  ): void {
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = opts.type;
    const f0 = midiToHz(midi);
    osc.frequency.setValueAtTime(f0, t);
    if (opts.slideToMidi !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(midiToHz(opts.slideToMidi), t + dur * 0.75);
    }
    if (opts.detune) osc.detune.value = opts.detune;

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(opts.filterHz, t);
    filt.Q.value = opts.filterQ ?? 1.5;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    osc.connect(filt);
    filt.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // =====================================================================
  // 5 DISTINCT STATION SEQUENCERS
  // =====================================================================
  private scheduleStep(
    ctx: AudioContext,
    bus: GainNode,
    stationId: RadioStationId,
    step: number,
    t: number,
    stepDur: number,
  ): void {
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;

    if (stationId === 'hellbent_metal') {
      // 66.6 FM HELLBENT METAL — Driving E-Phrygian outlaw biker thrash
      if (s16 === 0 || s16 === 2 || s16 === 6 || s16 === 8 || s16 === 10 || (bar === 3 && s16 === 14)) {
        this.playKick(ctx, bus, t, 0.7);
      }
      if (s16 === 4 || s16 === 12) this.playSnare(ctx, bus, t, 0.36, 210);
      if (s16 % 2 === 0) this.playHat(ctx, bus, t, s16 === 14, 0.11);

      // Crunchy palm-muted power chord chugs
      const riffBars = [
        [40, 40, 41, 40, 40, 43, 40, 40, 40, 40, 45, 40, 43, 41, 40, 0],
        [40, 40, 41, 40, 40, 43, 40, 45, 47, 47, 45, 43, 41, 41, 40, 0],
        [43, 43, 45, 43, 43, 47, 43, 43, 41, 41, 43, 41, 40, 38, 40, 0],
        [40, 40, 41, 40, 43, 40, 45, 40, 47, 45, 43, 41, 43, 41, 40, 38],
      ];
      const root = riffBars[bar][s16];
      if (root > 0) {
        this.playTone(ctx, bus, t, root, stepDur * 0.85, {
          type: 'sawtooth',
          gain: 0.24,
          filterHz: 780,
          filterQ: 2.8,
        });
        // Fifth power chord bite
        this.playTone(ctx, bus, t, root + 7, stepDur * 0.8, {
          type: 'sawtooth',
          gain: 0.15,
          filterHz: 1150,
          detune: 7,
        });
      }

      // Blazing lead guitar licks on bars 1 & 3
      const lead = [64, 0, 65, 67, 0, 71, 67, 65, 64, 0, 67, 64, 65, 64, 62, 64];
      if ((bar === 1 || bar === 3) && lead[s16] > 0) {
        this.playTone(ctx, bus, t, lead[s16], stepDur * 1.3, {
          type: 'sawtooth',
          gain: 0.12,
          filterHz: 2400,
          filterQ: 3.5,
        });
      }
      return;
    }

    if (stationId === 'cryptid_synth') {
      // 103.1 FM CRYPTID SYNTHWAVE — Carpenter horror-neon highway pulse
      if (s16 === 0 || s16 === 4 || s16 === 8 || s16 === 12) {
        this.playKick(ctx, bus, t, 0.64);
      }
      if (s16 === 4 || s16 === 12) this.playSnare(ctx, bus, t, 0.34, 165);
      if (s16 % 2 === 1) this.playHat(ctx, bus, t, s16 === 15, 0.09);

      // Rolling 16th-note octave bassline (Dm -> Bb -> C -> Am)
      const bassRoots = [38, 34, 36, 33];
      const base = bassRoots[bar];
      const bassNote = s16 % 2 === 0 ? base : base + 12;
      this.playTone(ctx, bus, t, bassNote, stepDur * 0.88, {
        type: 'sawtooth',
        gain: 0.22,
        filterHz: s16 % 4 === 0 ? 920 : 560,
        filterQ: 3.2,
      });

      // Eerie glowing arpeggio
      const arpOffsets = [0, 7, 12, 15, 19, 15, 12, 7];
      const arpNote = base + 24 + arpOffsets[s16 % arpOffsets.length];
      this.playTone(ctx, bus, t, arpNote, stepDur * 1.15, {
        type: 'triangle',
        gain: 0.14,
        filterHz: 2600,
      });

      // Haunted dark pad chord on beat 1 of each bar
      if (s16 === 0) {
        const chord = [base + 12, base + 15, base + 19];
        for (const c of chord) {
          this.playTone(ctx, bus, t, c, stepDur * 14, {
            type: 'sawtooth',
            gain: 0.055,
            filterHz: 950,
            detune: 5,
          });
        }
      }
      return;
    }

    if (stationId === 'graveyard_surf') {
      // 99.9 FM GRAVEYARD SURF PUNK — Fast twangy horror-surf riff
      if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 14) {
        this.playKick(ctx, bus, t, 0.6);
      }
      if (s16 === 4 || s16 === 12 || (bar === 3 && (s16 === 14 || s16 === 15))) {
        this.playSnare(ctx, bus, t, 0.34, 230);
      }
      if (s16 % 2 === 0) this.playHat(ctx, bus, t, false, 0.1);

      // Driving surf bass (A -> A -> D -> E)
      const roots = [45, 45, 50, 52];
      const br = roots[bar];
      if (s16 % 2 === 0) {
        const walk = [0, 0, 3, 4, 7, 7, 5, 4];
        this.playTone(ctx, bus, t, br - 12 + walk[(s16 / 2) % 8], stepDur * 1.6, {
          type: 'triangle',
          gain: 0.28,
          filterHz: 620,
        });
      }

      // Twangy Pulp/Misfits tremolo surf guitar melody (A harmonic minor)
      const surfLead = [
        [69, 69, 71, 72, 76, 76, 77, 76, 72, 0, 71, 69, 68, 69, 71, 0],
        [69, 69, 72, 76, 80, 80, 81, 80, 76, 0, 72, 71, 69, 0, 0, 0],
        [74, 74, 76, 77, 81, 81, 77, 76, 74, 0, 72, 71, 69, 0, 71, 0],
        [76, 76, 77, 80, 81, 80, 77, 76, 74, 72, 71, 68, 69, 0, 0, 0],
      ];
      const n = surfLead[bar][s16];
      if (n > 0) {
        this.playTone(ctx, bus, t, n, stepDur * 1.25, {
          type: 'square',
          gain: 0.13,
          filterHz: 2900,
          filterQ: 2.2,
        });
      }
      return;
    }

    if (stationId === 'phantom_organ') {
      // 88.3 FM PHANTOM ORGAN — Gothic Cathedral Doom & Haunted Pipe Organ
      if (s16 === 0 || s16 === 10) this.playKick(ctx, bus, t, 0.72);
      if (s16 === 8) this.playSnare(ctx, bus, t, 0.3, 145);
      if (s16 % 4 === 2) this.playHat(ctx, bus, t, true, 0.08);

      // Heavy cathedral bass pedal (C -> Ab -> G -> G7)
      const pedal = [36, 32, 31, 31][bar];
      if (s16 === 0 || s16 === 8) {
        this.playTone(ctx, bus, t, pedal, stepDur * 7.5, {
          type: 'sawtooth',
          gain: 0.24,
          filterHz: 420,
        });
      }

      // Spooky Baroque pipe-organ arpeggio
      const organBars = [
        [60, 63, 67, 72, 71, 67, 63, 60, 60, 63, 67, 72, 75, 72, 67, 63],
        [56, 60, 63, 68, 67, 63, 60, 56, 56, 60, 63, 68, 72, 68, 63, 60],
        [55, 59, 62, 67, 65, 62, 59, 55, 55, 59, 62, 67, 71, 67, 62, 59],
        [72, 71, 72, 67, 68, 67, 63, 62, 60, 59, 60, 63, 67, 63, 62, 59],
      ];
      const oNote = organBars[bar][s16];
      this.playTone(ctx, bus, t, oNote, stepDur * 1.4, {
        type: 'sawtooth',
        gain: 0.11,
        filterHz: 2100,
      });
      this.playTone(ctx, bus, t, oNote + 12, stepDur * 1.2, {
        type: 'triangle',
        gain: 0.08,
        filterHz: 3200,
      });
      return;
    }

    // 107.7 FM SWAMP BOOGIE — Gritty G-blues roadhouse shuffle
    if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 14) {
      this.playKick(ctx, bus, t, 0.65);
    }
    if (s16 === 4 || s16 === 12) this.playSnare(ctx, bus, t, 0.34, 180);
    if (s16 % 2 === 0) this.playHat(ctx, bus, t, s16 === 10, 0.1);

    // Classic 12-bar blues boogie shuffle bass (G -> G -> C -> D)
    const bluesRoots = [43, 43, 48, 50];
    const root = bluesRoots[bar];
    const boogiePattern = [0, 0, 3, 4, 7, 7, 9, 10, 7, 7, 4, 3, 0, 0, 7, 5];
    if (s16 % 2 === 0) {
      this.playTone(ctx, bus, t, root - 12 + boogiePattern[s16], stepDur * 1.7, {
        type: 'sawtooth',
        gain: 0.24,
        filterHz: 680,
      });
    }

    // Gritty slide-guitar blues licks
    const slideSteps: Record<number, [number, number]> = {
      0: [67, 67],
      3: [70, 71],
      6: [74, 74],
      10: [73, 70],
      13: [67, 67],
    };
    const lick = slideSteps[s16];
    if (lick) {
      const transpose = bar === 2 ? 5 : bar === 3 ? 7 : 0;
      this.playTone(ctx, bus, t, lick[0] + transpose, stepDur * 2.1, {
        type: 'sawtooth',
        gain: 0.13,
        filterHz: 1950,
        filterQ: 2.5,
        slideToMidi: lick[1] + transpose,
      });
    }
  }
}

export const monsterRadio = new MonsterRadioEngine();
