import { ScareMechanicId, VehicleControlMode } from './types';

export interface SpatialSirenSource {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Relative velocity in listener/player chase frame (m/s) */
  vx: number;
  vz: number;
  /** Optional override for stolen player cruiser */
  isPlayerOwned?: boolean;
}

interface SpatialSirenVoice {
  oscMain: OscillatorNode;
  oscHarm: OscillatorNode;
  lfo: OscillatorNode;
  lfoDepthMain: GainNode;
  lfoDepthHarm: GainNode;
  airFilter: BiquadFilterNode;
  hornFilter: BiquadFilterNode;
  voiceGain: GainNode;
  panner: PannerNode;
  style: 'wail' | 'yelp';
  baseFreq: number;
}

interface EngineProfile {
  /** Base firing frequency at idle (Hz) */
  idleHz: number;
  /** Firing frequency span across gear RPM range (Hz) */
  rpmSpanHz: number;
  /** Second cylinder bank harmonic ratio (1.5 = V8/V6, 1.33 = V-twin, 1.25 = heavy diesel/V8 van) */
  bank2Ratio: number;
  /** Muffler lowpass cutoff range [idle, fullLoad] (Hz) */
  mufflerMinHz: number;
  mufflerMaxHz: number;
  /** Exhaust resonator body frequency (Hz) */
  bodyHz: number;
  /** Engine voice level relative to road noise */
  engineLevel: number;
  /** Exhaust airflow / combustion rumble noise level */
  exhaustAirLevel: number;
  /** Tire & asphalt rolling noise level */
  roadLevel: number;
  /** Cylinder chug depth at low speed */
  chugDepth: number;
}

const ENGINE_PROFILES: Record<Exclude<VehicleControlMode, 'on_foot'>, EngineProfile> = {
  stolen_muscle: {
    idleHz: 34,
    rpmSpanHz: 56,
    bank2Ratio: 1.5,
    mufflerMinHz: 155,
    mufflerMaxHz: 460,
    bodyHz: 112,
    engineLevel: 0.14,
    exhaustAirLevel: 0.16,
    roadLevel: 0.085,
    chugDepth: 0.24,
  },
  stolen_police: {
    idleHz: 36,
    rpmSpanHz: 60,
    bank2Ratio: 1.5,
    mufflerMinHz: 160,
    mufflerMaxHz: 480,
    bodyHz: 116,
    engineLevel: 0.14,
    exhaustAirLevel: 0.16,
    roadLevel: 0.085,
    chugDepth: 0.22,
  },
  stolen_sedan: {
    idleHz: 38,
    rpmSpanHz: 54,
    bank2Ratio: 1.5,
    mufflerMinHz: 140,
    mufflerMaxHz: 380,
    bodyHz: 125,
    engineLevel: 0.11,
    exhaustAirLevel: 0.12,
    roadLevel: 0.09,
    chugDepth: 0.14,
  },
  stolen_van: {
    idleHz: 30,
    rpmSpanHz: 44,
    bank2Ratio: 1.25,
    mufflerMinHz: 130,
    mufflerMaxHz: 340,
    bodyHz: 96,
    engineLevel: 0.135,
    exhaustAirLevel: 0.17,
    roadLevel: 0.105,
    chugDepth: 0.22,
  },
  own_bike: {
    idleHz: 36,
    rpmSpanHz: 58,
    bank2Ratio: 1.333,
    mufflerMinHz: 160,
    mufflerMaxHz: 450,
    bodyHz: 118,
    engineLevel: 0.125,
    exhaustAirLevel: 0.15,
    roadLevel: 0.075,
    chugDepth: 0.26,
  },
  stolen_bike: {
    idleHz: 44,
    rpmSpanHz: 68,
    bank2Ratio: 1.5,
    mufflerMinHz: 175,
    mufflerMaxHz: 490,
    bodyHz: 138,
    engineLevel: 0.115,
    exhaustAirLevel: 0.14,
    roadLevel: 0.08,
    chugDepth: 0.18,
  },
};

const GEAR_THRESHOLDS = [0, 0.21, 0.41, 0.63, 0.84, 1.05];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private runningEngine = false;
  private muteListeners = new Set<(muted: boolean) => void>();

  // Realistic multi-layer car/engine audio graph
  private engineMasterGain: GainNode | null = null;
  private bank1Osc: OscillatorNode | null = null;
  private bank2Osc: OscillatorNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private bank1Gain: GainNode | null = null;
  private bank2Gain: GainNode | null = null;
  private subGain: GainNode | null = null;
  private exhaustShaper: WaveShaperNode | null = null;
  private bodyPeak: BiquadFilterNode | null = null;
  private buzzCut: BiquadFilterNode | null = null;
  private mufflerLP1: BiquadFilterNode | null = null;
  private mufflerLP2: BiquadFilterNode | null = null;
  private engineToneGain: GainNode | null = null;

  // Combustion airflow turbulence + cylinder chug LFO
  private exhaustNoiseSrc: AudioBufferSourceNode | null = null;
  private exhaustNoiseFilter: BiquadFilterNode | null = null;
  private exhaustNoiseGain: GainNode | null = null;
  private chugLfo: OscillatorNode | null = null;
  private chugLfoGain: GainNode | null = null;

  // Asphalt tire & highway wind layer
  private roadNoiseSrc: AudioBufferSourceNode | null = null;
  private roadNoiseFilter: BiquadFilterNode | null = null;
  private roadNoiseGain: GainNode | null = null;

  // 3D Spatialized Doppler Police Siren Pool (one HRTF PannerNode per pursuing cruiser)
  private sirenBusGain: GainNode | null = null;
  private spatialSirens = new Map<number, SpatialSirenVoice>();
  private listenerX = 0;
  private listenerY = 3.15;
  private listenerZ = 6.2;

  // Shared buffers & waves
  private brownNoiseBuf: AudioBuffer | null = null;
  private engineWave: PeriodicWave | null = null;

  // Smooth gear-shift simulation state
  private currentGear = 1;
  private shiftDipUntil = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public onMuteChange(cb: (muted: boolean) => void): () => void {
    this.muteListeners.add(cb);
    return () => {
      this.muteListeners.delete(cb);
    };
  }

  public setMuted(val: boolean): void {
    this.muted = val;
    if (this.engineMasterGain && this.ctx) {
      this.engineMasterGain.gain.setTargetAtTime(
        val || !this.runningEngine ? 0 : 1,
        this.ctx.currentTime,
        0.05,
      );
    }
    if (this.sirenBusGain && this.ctx) {
      this.sirenBusGain.gain.setTargetAtTime(
        val || !this.runningEngine ? 0 : 1,
        this.ctx.currentTime,
        0.05,
      );
    }
    for (const cb of this.muteListeners) cb(val);
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public getAudioContext(): AudioContext | null {
    return this.ensureContext();
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getBrownNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.brownNoiseBuf) return this.brownNoiseBuf;
    const length = Math.floor(ctx.sampleRate * 3.0);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Warm pink/brown-weighted spectrum (rich low-mid rumble, no harsh hiss)
      lastOut = (lastOut + 0.045 * white) / 1.045;
      data[i] = Math.max(-1, Math.min(1, lastOut * 3.8 + white * 0.14));
    }
    // Seamless loop crossfade over last 4096 samples
    const fadeLen = Math.min(4096, Math.floor(length * 0.05));
    for (let i = 0; i < fadeLen; i++) {
      const t = i / fadeLen;
      const tailIdx = length - fadeLen + i;
      data[tailIdx] = data[tailIdx] * (1 - t) + data[i] * t;
    }
    this.brownNoiseBuf = buffer;
    return buffer;
  }

  private getEngineWave(ctx: AudioContext): PeriodicWave {
    if (this.engineWave) return this.engineWave;
    // Warm 4-stroke exhaust harmonic profile (strong fundamental + 2nd/3rd/4th, soft roll-off)
    const real = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const imag = new Float32Array([
      0,
      1.0,
      0.72,
      0.46,
      0.28,
      0.16,
      0.09,
      0.045,
      0.02,
      0.01,
    ]);
    this.engineWave = ctx.createPeriodicWave(real, imag, {
      disableNormalization: false,
    });
    return this.engineWave;
  }

  private makeWarmExhaustCurve(): Float32Array<ArrayBuffer> {
    const samples = 512;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      // Gentle asymmetric tube/exhaust warmth — adds body without harsh buzz
      curve[i] = Math.tanh(x * 1.85);
    }
    return curve;
  }

  public startEngine(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.runningEngine = true;

    if (!this.engineMasterGain) {
      const wave = this.getEngineWave(ctx);
      const noiseBuf = this.getBrownNoiseBuffer(ctx);

      this.engineMasterGain = ctx.createGain();
      this.engineMasterGain.gain.value = 0;
      this.engineMasterGain.connect(ctx.destination);

      // --- 1. MULTI-CYLINDER COMBUSTION ENGINE CORE ---
      this.bank1Osc = ctx.createOscillator();
      this.bank1Osc.setPeriodicWave(wave);
      this.bank1Osc.frequency.value = 42;

      this.bank2Osc = ctx.createOscillator();
      this.bank2Osc.setPeriodicWave(wave);
      this.bank2Osc.frequency.value = 63;
      this.bank2Osc.detune.value = 6; // Subtle natural mechanical beating

      this.subOsc = ctx.createOscillator();
      this.subOsc.type = 'sine';
      this.subOsc.frequency.value = 21;

      this.bank1Gain = ctx.createGain();
      this.bank1Gain.gain.value = 0.52;
      this.bank2Gain = ctx.createGain();
      this.bank2Gain.gain.value = 0.34;
      this.subGain = ctx.createGain();
      this.subGain.gain.value = 0.42;

      this.exhaustShaper = ctx.createWaveShaper();
      this.exhaustShaper.curve = this.makeWarmExhaustCurve();
      this.exhaustShaper.oversample = '2x';

      // Muffler acoustic body resonance (~115 Hz)
      this.bodyPeak = ctx.createBiquadFilter();
      this.bodyPeak.type = 'peaking';
      this.bodyPeak.frequency.value = 115;
      this.bodyPeak.Q.value = 1.1;
      this.bodyPeak.gain.value = 4.5;

      // Notch out the harsh "synth buzz / kazoo" band around 720 Hz
      this.buzzCut = ctx.createBiquadFilter();
      this.buzzCut.type = 'peaking';
      this.buzzCut.frequency.value = 720;
      this.buzzCut.Q.value = 0.9;
      this.buzzCut.gain.value = -9.5;

      // Smooth 24dB/oct Butterworth muffler lowpass (NO resonant whistle!)
      this.mufflerLP1 = ctx.createBiquadFilter();
      this.mufflerLP1.type = 'lowpass';
      this.mufflerLP1.frequency.value = 240;
      this.mufflerLP1.Q.value = 0.72;

      this.mufflerLP2 = ctx.createBiquadFilter();
      this.mufflerLP2.type = 'lowpass';
      this.mufflerLP2.frequency.value = 320;
      this.mufflerLP2.Q.value = 0.65;

      this.engineToneGain = ctx.createGain();
      this.engineToneGain.gain.value = 0.1;

      this.bank1Osc.connect(this.bank1Gain);
      this.bank2Osc.connect(this.bank2Gain);
      this.subOsc.connect(this.subGain);

      this.bank1Gain.connect(this.exhaustShaper);
      this.bank2Gain.connect(this.exhaustShaper);
      this.subGain.connect(this.exhaustShaper);

      this.exhaustShaper.connect(this.bodyPeak);
      this.bodyPeak.connect(this.buzzCut);
      this.buzzCut.connect(this.mufflerLP1);
      this.mufflerLP1.connect(this.mufflerLP2);
      this.mufflerLP2.connect(this.engineToneGain);
      this.engineToneGain.connect(this.engineMasterGain);

      // --- 2. COMBUSTION EXHAUST AIRFLOW + CYLINDER CHUG MODULATION ---
      this.exhaustNoiseSrc = ctx.createBufferSource();
      this.exhaustNoiseSrc.buffer = noiseBuf;
      this.exhaustNoiseSrc.loop = true;

      this.exhaustNoiseFilter = ctx.createBiquadFilter();
      this.exhaustNoiseFilter.type = 'bandpass';
      this.exhaustNoiseFilter.frequency.value = 180;
      this.exhaustNoiseFilter.Q.value = 0.85;

      this.exhaustNoiseGain = ctx.createGain();
      this.exhaustNoiseGain.gain.value = 0.12;

      // Cylinder firing cadence LFO modulates exhaust airflow for authentic V8/cruiser burble
      this.chugLfo = ctx.createOscillator();
      this.chugLfo.type = 'sine';
      this.chugLfo.frequency.value = 14;
      this.chugLfoGain = ctx.createGain();
      this.chugLfoGain.gain.value = 0.03;
      this.chugLfo.connect(this.chugLfoGain);
      this.chugLfoGain.connect(this.exhaustNoiseGain.gain);

      this.exhaustNoiseSrc.connect(this.exhaustNoiseFilter);
      this.exhaustNoiseFilter.connect(this.exhaustNoiseGain);
      this.exhaustNoiseGain.connect(this.engineMasterGain);

      // --- 3. REALISTIC TIRE-ON-ASPHALT & HIGHWAY WIND LAYER ---
      this.roadNoiseSrc = ctx.createBufferSource();
      this.roadNoiseSrc.buffer = noiseBuf;
      this.roadNoiseSrc.loop = true;

      this.roadNoiseFilter = ctx.createBiquadFilter();
      this.roadNoiseFilter.type = 'lowpass';
      this.roadNoiseFilter.frequency.value = 280;
      this.roadNoiseFilter.Q.value = 0.55;

      this.roadNoiseGain = ctx.createGain();
      this.roadNoiseGain.gain.value = 0.04;

      this.roadNoiseSrc.connect(this.roadNoiseFilter);
      this.roadNoiseFilter.connect(this.roadNoiseGain);
      this.roadNoiseGain.connect(this.engineMasterGain);

      // Start all continuous voices
      this.bank1Osc.start();
      this.bank2Osc.start();
      this.subOsc.start();
      this.chugLfo.start();
      this.exhaustNoiseSrc.start();
      this.roadNoiseSrc.start();
    }

    if (this.engineMasterGain) {
      this.engineMasterGain.gain.setTargetAtTime(
        this.muted ? 0 : 1,
        ctx.currentTime,
        0.1,
      );
    }
  }

  public updateEngine(
    speedRatio: number,
    onFoot: boolean,
    nitro: boolean,
    controlMode: VehicleControlMode = 'own_bike',
    throttle = 0,
  ): void {
    if (
      !this.ctx ||
      !this.engineMasterGain ||
      !this.bank1Osc ||
      !this.bank2Osc ||
      !this.subOsc ||
      !this.bodyPeak ||
      !this.mufflerLP1 ||
      !this.mufflerLP2 ||
      !this.engineToneGain ||
      !this.exhaustNoiseFilter ||
      !this.exhaustNoiseGain ||
      !this.chugLfo ||
      !this.chugLfoGain ||
      !this.roadNoiseFilter ||
      !this.roadNoiseGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    if (this.muted || !this.runningEngine) {
      this.engineMasterGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    this.engineMasterGain.gain.setTargetAtTime(1, now, 0.08);
    const clampedSpeed = Math.max(0, Math.min(1.15, speedRatio));

    if (onFoot || controlMode === 'on_foot') {
      // On foot: shut off engine completely, keep only subtle midnight highway air
      this.engineToneGain.gain.setTargetAtTime(0, now, 0.09);
      this.exhaustNoiseGain.gain.setTargetAtTime(0, now, 0.09);
      this.chugLfoGain.gain.setTargetAtTime(0, now, 0.09);
      this.roadNoiseFilter.frequency.setTargetAtTime(240 + clampedSpeed * 180, now, 0.12);
      this.roadNoiseGain.gain.setTargetAtTime(0.025 + clampedSpeed * 0.025, now, 0.1);
      return;
    }

    const profile = ENGINE_PROFILES[controlMode] ?? ENGINE_PROFILES.stolen_muscle;

    // 5-speed automatic transmission gear lookup with hysteresis
    let targetGear = 1;
    for (let g = 1; g <= 5; g++) {
      if (clampedSpeed >= GEAR_THRESHOLDS[g - 1]) {
        targetGear = g;
      }
    }
    if (targetGear > this.currentGear) {
      this.currentGear = targetGear;
      this.shiftDipUntil = now + 0.14;
    } else if (targetGear < this.currentGear && clampedSpeed < GEAR_THRESHOLDS[this.currentGear - 1] - 0.05) {
      this.currentGear = targetGear;
    }

    const gearLow = GEAR_THRESHOLDS[this.currentGear - 1];
    const gearHigh = GEAR_THRESHOLDS[this.currentGear];
    const inGearFrac = Math.max(
      0,
      Math.min(1, (clampedSpeed - gearLow) / Math.max(0.08, gearHigh - gearLow)),
    );

    // Realistic RPM curve: stays warm and natural across gears instead of screaming higher forever
    const gearBaseRpm = 0.24 + (this.currentGear - 1) * 0.075;
    let rpmFrac = Math.min(1.12, gearBaseRpm + inGearFrac * 0.62);
    if (nitro) rpmFrac = Math.min(1.22, rpmFrac + 0.16);
    if (throttle < 0) rpmFrac = Math.max(0.12, rpmFrac - 0.14);

    const shifting = now < this.shiftDipUntil;
    const throttleLoad = nitro ? 1.0 : throttle > 0 ? 0.88 : throttle < 0 ? 0.22 : 0.52;

    const firingHz =
      profile.idleHz + rpmFrac * profile.rpmSpanHz * (shifting ? 0.86 : 1.0);

    // Smooth pitch tracking (real engines have flywheel inertia)
    const pitchTau = shifting ? 0.09 : 0.085;
    this.bank1Osc.frequency.setTargetAtTime(firingHz, now, pitchTau);
    this.bank2Osc.frequency.setTargetAtTime(firingHz * profile.bank2Ratio, now, pitchTau);
    this.subOsc.frequency.setTargetAtTime(firingHz * 0.5, now, pitchTau);

    // Warm muffler filter opens smoothly under throttle & nitro, relaxes on coast/braking
    const mufflerCut =
      profile.mufflerMinHz +
      (profile.mufflerMaxHz - profile.mufflerMinHz) * (rpmFrac * 0.65 + throttleLoad * 0.35) +
      (nitro ? 95 : 0);

    this.bodyPeak.frequency.setTargetAtTime(profile.bodyHz + rpmFrac * 24, now, 0.1);
    this.mufflerLP1.frequency.setTargetAtTime(mufflerCut, now, 0.09);
    this.mufflerLP2.frequency.setTargetAtTime(mufflerCut * 1.32, now, 0.09);

    const toneGain =
      profile.engineLevel * (0.68 + throttleLoad * 0.38) * (shifting ? 0.78 : 1.0) +
      (nitro ? 0.025 : 0);
    this.engineToneGain.gain.setTargetAtTime(toneGain, now, 0.08);

    // Exhaust combustion rumble air layer (gives real car exhaust texture!)
    const exhaustBandHz = 125 + rpmFrac * 185 + (nitro ? 75 : 0);
    const exhaustAirGain =
      profile.exhaustAirLevel * (0.55 + throttleLoad * 0.55) * (shifting ? 0.82 : 1.0) +
      (nitro ? 0.045 : 0);
    this.exhaustNoiseFilter.frequency.setTargetAtTime(exhaustBandHz, now, 0.09);
    this.exhaustNoiseGain.gain.setTargetAtTime(exhaustAirGain, now, 0.08);

    // Cylinder firing chug (pronounced rumble at lower speed, silky purr at highway speed)
    const chugRate = Math.max(9, firingHz * 0.36);
    const chugAmt = exhaustAirGain * profile.chugDepth * (1.15 - clampedSpeed * 0.45);
    this.chugLfo.frequency.setTargetAtTime(chugRate, now, 0.08);
    this.chugLfoGain.gain.setTargetAtTime(Math.max(0.004, chugAmt), now, 0.08);

    // Tire-on-asphalt rolling rumble + night wind
    const roadCut = 190 + clampedSpeed * 340 + (nitro ? 110 : 0);
    const roadGain = profile.roadLevel * (0.25 + clampedSpeed * 0.95);
    this.roadNoiseFilter.frequency.setTargetAtTime(roadCut, now, 0.12);
    this.roadNoiseGain.gain.setTargetAtTime(roadGain, now, 0.1);
  }

  public stopEngine(): void {
    this.runningEngine = false;
    if (this.engineMasterGain && this.ctx) {
      this.engineMasterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.07);
    }
    this.clearSpatialSirens();
  }

  private ensureSirenBus(ctx: AudioContext): GainNode {
    if (!this.sirenBusGain) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.attack.value = 0.008;
      comp.release.value = 0.14;

      const bus = ctx.createGain();
      bus.gain.value = this.muted || !this.runningEngine ? 0 : 1;
      bus.connect(comp);
      comp.connect(ctx.destination);
      this.sirenBusGain = bus;
    }
    return this.sirenBusGain;
  }

  /**
   * Syncs the Web Audio 3D AudioListener position & orientation with the Three.js chase camera.
   */
  public updateSpatialListener(
    x: number,
    y: number,
    z: number,
    fwdX = 0,
    fwdY = -0.12,
    fwdZ = -1,
  ): void {
    this.listenerX = x;
    this.listenerY = y;
    this.listenerZ = z;
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;

    if (listener.positionX) {
      listener.positionX.setTargetAtTime(x, now, 0.04);
      listener.positionY.setTargetAtTime(y, now, 0.04);
      listener.positionZ.setTargetAtTime(z, now, 0.04);
      listener.forwardX.setTargetAtTime(fwdX, now, 0.04);
      listener.forwardY.setTargetAtTime(fwdY, now, 0.04);
      listener.forwardZ.setTargetAtTime(fwdZ, now, 0.04);
      listener.upX.setTargetAtTime(0, now, 0.04);
      listener.upY.setTargetAtTime(1, now, 0.04);
      listener.upZ.setTargetAtTime(0, now, 0.04);
    } else if (typeof listener.setPosition === 'function') {
      listener.setPosition(x, y, z);
      listener.setOrientation(fwdX, fwdY, fwdZ, 0, 1, 0);
    }
  }

  private createSpatialSirenVoice(
    ctx: AudioContext,
    id: number,
  ): SpatialSirenVoice {
    const bus = this.ensureSirenBus(ctx);
    const style: 'wail' | 'yelp' = Math.abs(id) % 2 === 0 ? 'wail' : 'yelp';
    const baseFreq = style === 'wail' ? 680 : 740;

    // Dual-harmonic siren tone (warm triangle core + subtle 2nd harmonic overtone)
    const oscMain = ctx.createOscillator();
    oscMain.type = 'triangle';
    oscMain.frequency.value = baseFreq;

    const oscHarm = ctx.createOscillator();
    oscHarm.type = 'sine';
    oscHarm.frequency.value = baseFreq * 2;

    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.24;

    // Wail/Yelp pitch modulation LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = style === 'wail' ? 0.65 : 1.35;

    const lfoDepthMain = ctx.createGain();
    lfoDepthMain.gain.value = style === 'wail' ? 235 : 275;
    const lfoDepthHarm = ctx.createGain();
    lfoDepthHarm.gain.value = style === 'wail' ? 470 : 550;

    lfo.connect(lfoDepthMain);
    lfo.connect(lfoDepthHarm);
    lfoDepthMain.connect(oscMain.frequency);
    lfoDepthHarm.connect(oscHarm.frequency);

    // Distance-based air-absorption lowpass (bright up close, muted in the distance)
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 1800;
    airFilter.Q.value = 0.7;

    // Siren horn megaphone presence shaping
    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'bandpass';
    hornFilter.frequency.value = 980;
    hornFilter.Q.value = 1.2;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.0001;

    // True 3D HRTF Spatial PannerNode
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 7.5;
    panner.maxDistance = 95;
    panner.rolloffFactor = 1.15;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 1;

    oscMain.connect(hornFilter);
    oscHarm.connect(harmGain);
    harmGain.connect(hornFilter);
    hornFilter.connect(airFilter);
    airFilter.connect(voiceGain);
    voiceGain.connect(panner);
    panner.connect(bus);

    oscMain.start();
    oscHarm.start();
    lfo.start();

    return {
      oscMain,
      oscHarm,
      lfo,
      lfoDepthMain,
      lfoDepthHarm,
      airFilter,
      hornFilter,
      voiceGain,
      panner,
      style,
      baseFreq,
    };
  }

  private stopAndDisposeSirenVoice(voice: SpatialSirenVoice): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      voice.voiceGain.gain.cancelScheduledValues(now);
      voice.voiceGain.gain.setTargetAtTime(0, now, 0.045);
      const stopAt = now + 0.16;
      voice.oscMain.stop(stopAt);
      voice.oscHarm.stop(stopAt);
      voice.lfo.stop(stopAt);
    } catch {
      // Ignore already-stopped oscillator errors
    }
  }

  public clearSpatialSirens(): void {
    for (const voice of this.spatialSirens.values()) {
      this.stopAndDisposeSirenVoice(voice);
    }
    this.spatialSirens.clear();
    if (this.sirenBusGain && this.ctx) {
      this.sirenBusGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    }
  }

  /**
   * Updates all active 3D spatialized Doppler police siren loops when Wanted Stars are active.
   * Each police cruiser gets its own HRTF 3D PannerNode, radial-velocity Doppler pitch shift,
   * and proximity-scaled frequency, cadence, air-absorption brightness, and volume.
   */
  public updateSpatialPoliceSirens(
    sources: SpatialSirenSource[],
    wantedStars: number,
  ): void {
    if (!this.ctx || !this.runningEngine) return;
    const now = this.ctx.currentTime;

    const shouldPlay = !this.muted && (wantedStars >= 1 || sources.some((s) => s.isPlayerOwned));
    if (!shouldPlay || sources.length === 0) {
      if (this.spatialSirens.size > 0) {
        this.clearSpatialSirens();
      }
      return;
    }

    const bus = this.ensureSirenBus(this.ctx);
    bus.gain.setTargetAtTime(1, now, 0.06);

    const activeIds = new Set<number>();
    // Tuned acoustic speed-of-sound for crisp highway-chase Doppler shift (approaching sharp, receding flat)
    const C_SOUND = 140;

    for (const src of sources) {
      activeIds.add(src.id);
      let voice = this.spatialSirens.get(src.id);
      if (!voice) {
        voice = this.createSpatialSirenVoice(this.ctx, src.id);
        this.spatialSirens.set(src.id, voice);
      }

      // Position panner in 3D world space
      if (voice.panner.positionX) {
        voice.panner.positionX.setTargetAtTime(src.x, now, 0.04);
        voice.panner.positionY.setTargetAtTime(src.y, now, 0.04);
        voice.panner.positionZ.setTargetAtTime(src.z, now, 0.04);
      } else if (typeof voice.panner.setPosition === 'function') {
        voice.panner.setPosition(src.x, src.y, src.z);
      }

      // Vector from source to listener for distance & Doppler radial velocity
      const dx = this.listenerX - src.x;
      const dy = this.listenerY - src.y;
      const dz = this.listenerZ - src.z;
      const dist = Math.max(1.5, Math.hypot(dx, dy, dz));

      // Normalized proximity (0 = far ~75m, 1 = right beside player)
      const proximity = Math.max(0, Math.min(1, 1 - dist / 78));
      const proxCurve = Math.pow(proximity, 1.35);

      // Radial closing velocity along source->listener axis (>0 approaching, <0 receding)
      const radialClosingSpeed = (src.vx * dx + src.vz * dz) / dist;
      const dopplerFactor = src.isPlayerOwned
        ? 1.0
        : Math.max(0.76, Math.min(1.36, C_SOUND / Math.max(45, C_SOUND - radialClosingSpeed)));

      // Both carrier pitch AND wail/yelp modulation frequency rise as police close in + Doppler shift!
      const proximityPitchBoost = src.isPlayerOwned ? 1.0 : 1.0 + proximity * 0.24;
      const starUrgency = 1 + Math.max(0, wantedStars - 1) * 0.05;
      const targetMainHz = voice.baseFreq * proximityPitchBoost * dopplerFactor;
      const targetLfoHz =
        (voice.style === 'wail' ? 0.58 + proximity * 0.85 : 1.15 + proximity * 1.15) *
        starUrgency *
        (0.88 + dopplerFactor * 0.12);

      voice.oscMain.frequency.setTargetAtTime(targetMainHz, now, 0.06);
      voice.oscHarm.frequency.setTargetAtTime(targetMainHz * 2, now, 0.06);
      voice.lfo.frequency.setTargetAtTime(targetLfoHz, now, 0.08);

      // Sweep depth widens slightly when close & urgent
      const sweepScale = (0.85 + proximity * 0.35) * dopplerFactor;
      const baseDepth = voice.style === 'wail' ? 235 : 275;
      voice.lfoDepthMain.gain.setTargetAtTime(baseDepth * sweepScale, now, 0.08);
      voice.lfoDepthHarm.gain.setTargetAtTime(baseDepth * 2 * sweepScale, now, 0.08);

      // Air absorption: distant sirens sound muffled & eerie, close cruisers cut bright & clear
      const airCut = 750 + proxCurve * 2450;
      voice.airFilter.frequency.setTargetAtTime(airCut, now, 0.08);
      voice.hornFilter.frequency.setTargetAtTime(targetMainHz * 1.18, now, 0.08);

      // Volume rises smoothly with proximity (in addition to 3D PannerNode inverse-distance rolloff)
      const starVolBoost = 1 + Math.max(0, wantedStars - 1) * 0.06;
      const targetGain = src.isPlayerOwned
        ? 0.032
        : Math.min(0.11, (0.012 + proxCurve * 0.088) * starVolBoost);
      voice.voiceGain.gain.setTargetAtTime(targetGain, now, 0.08);
    }

    // Fade out & clean up any cruisers that wrecked, got hijacked, or despawned
    for (const [id, voice] of this.spatialSirens.entries()) {
      if (!activeIds.has(id)) {
        this.stopAndDisposeSirenVoice(voice);
        this.spatialSirens.delete(id);
      }
    }
  }

  public playPoliceSirenBurst(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Punchy two-cycle highway patrol siren yelp on Wanted Star increase!
    const osc = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(560, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.36);
    osc.frequency.exponentialRampToValueAtTime(1240, now + 0.54);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.74);

    bp.type = 'bandpass';
    bp.frequency.value = 980;
    bp.Q.value = 1.5;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.04);
    gain.gain.setValueAtTime(0.1, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.76);

    osc.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.78);
  }

  public playScare(kind: ScareMechanicId | 'signature', onFoot = false): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (kind === 'thunder_rev') {
      // Realistic throaty V8/exhaust throttle rev + deep exhaust bark (no raw sawtooth buzz!)
      const wave = this.getEngineWave(ctx);
      const revBus = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(220, now);
      lp.frequency.exponentialRampToValueAtTime(580, now + 0.13);
      lp.frequency.exponentialRampToValueAtTime(170, now + 0.48);
      lp.Q.value = 0.8;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const sub = ctx.createOscillator();
      osc1.setPeriodicWave(wave);
      osc2.setPeriodicWave(wave);
      sub.type = 'sine';

      const startHz = onFoot ? 72 : 58;
      const peakHz = onFoot ? 118 : 138;
      const tailHz = onFoot ? 46 : 44;

      osc1.frequency.setValueAtTime(startHz, now);
      osc1.frequency.exponentialRampToValueAtTime(peakHz, now + 0.12);
      osc1.frequency.exponentialRampToValueAtTime(tailHz, now + 0.48);

      osc2.frequency.setValueAtTime(startHz * 1.5, now);
      osc2.frequency.exponentialRampToValueAtTime(peakHz * 1.5, now + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(tailHz * 1.5, now + 0.48);

      sub.frequency.setValueAtTime(startHz * 0.5, now);
      sub.frequency.exponentialRampToValueAtTime(peakHz * 0.5, now + 0.12);
      sub.frequency.exponentialRampToValueAtTime(tailHz * 0.5, now + 0.48);

      revBus.gain.setValueAtTime(0.001, now);
      revBus.gain.linearRampToValueAtTime(0.26, now + 0.04);
      revBus.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc1.connect(lp);
      osc2.connect(lp);
      sub.connect(lp);
      lp.connect(revBus);
      revBus.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      sub.start(now);
      osc1.stop(now + 0.52);
      osc2.stop(now + 0.52);
      sub.stop(now + 0.52);

      // Exhaust blast airflow burst
      const air = ctx.createBufferSource();
      air.buffer = this.getBrownNoiseBuffer(ctx);
      const airBp = ctx.createBiquadFilter();
      airBp.type = 'bandpass';
      airBp.frequency.setValueAtTime(190, now);
      airBp.frequency.exponentialRampToValueAtTime(420, now + 0.14);
      airBp.frequency.exponentialRampToValueAtTime(120, now + 0.44);
      airBp.Q.value = 0.9;
      const airG = ctx.createGain();
      airG.gain.setValueAtTime(0.001, now);
      airG.gain.linearRampToValueAtTime(0.28, now + 0.05);
      airG.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
      air.connect(airBp);
      airBp.connect(airG);
      airG.connect(ctx.destination);
      air.start(now);
      air.stop(now + 0.48);
    } else if (kind === 'highbeam_loom') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.36);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (kind === 'prop_havoc') {
      [420, 700, 280].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(f, now + idx * 0.04);
        osc.frequency.exponentialRampToValueAtTime(
          f * 0.42,
          now + idx * 0.04 + 0.18,
        );
        gain.gain.setValueAtTime(0.1, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          now + idx * 0.04 + 0.2,
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.22);
      });
    } else if (kind === 'banshee_wail' || kind === 'signature') {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc2.type = 'triangle';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(1350, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.62);
      osc2.frequency.setValueAtTime(380, now);
      osc2.frequency.exponentialRampToValueAtTime(175, now + 0.62);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(lp);
      osc2.connect(lp);
      lp.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 0.66);
      osc2.stop(now + 0.66);
    } else {
      const bufferSize = ctx.sampleRate * 0.45;
      const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(480, now);
      filter.frequency.exponentialRampToValueAtTime(135, now + 0.42);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    }
  }

  public playWreckExplosion(combo: number): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.38);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Rising combo chime
    const chime = ctx.createOscillator();
    const cg = ctx.createGain();
    chime.type = 'triangle';
    const f = Math.min(980, 420 + combo * 45);
    chime.frequency.setValueAtTime(f, now + 0.04);
    chime.frequency.exponentialRampToValueAtTime(f * 1.45, now + 0.22);
    cg.gain.setValueAtTime(0.12, now + 0.04);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    chime.connect(cg);
    cg.connect(ctx.destination);
    chime.start(now + 0.04);
    chime.stop(now + 0.28);
  }

  public playHijackLeap(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + 0.18);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playDriverThrow(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Heavy monster heave whoosh
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = this.getBrownNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(240, now);
    bp.frequency.exponentialRampToValueAtTime(1150, now + 0.14);
    bp.frequency.exponentialRampToValueAtTime(320, now + 0.3);
    bp.Q.value = 1.4;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.001, now);
    wg.gain.linearRampToValueAtTime(0.24, now + 0.05);
    wg.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    whoosh.connect(bp);
    bp.connect(wg);
    wg.connect(ctx.destination);
    whoosh.start(now);
    whoosh.stop(now + 0.34);

    // 2. Comic panicked "WHOAAA!" descending Doppler yell
    const yellStart = now + 0.11;
    const voice = ctx.createOscillator();
    const formant = ctx.createBiquadFilter();
    const vg = ctx.createGain();

    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(520, yellStart);
    voice.frequency.exponentialRampToValueAtTime(640, yellStart + 0.09);
    voice.frequency.exponentialRampToValueAtTime(250, yellStart + 0.62);

    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(1050, yellStart);
    formant.frequency.exponentialRampToValueAtTime(620, yellStart + 0.6);
    formant.Q.value = 2.6;

    vg.gain.setValueAtTime(0.001, yellStart);
    vg.gain.linearRampToValueAtTime(0.16, yellStart + 0.06);
    vg.gain.exponentialRampToValueAtTime(0.001, yellStart + 0.65);

    voice.connect(formant);
    formant.connect(vg);
    vg.connect(ctx.destination);
    voice.start(yellStart);
    voice.stop(yellStart + 0.68);
  }

  public playDriverSmack(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Brief startled dual-tone car horn + comic hood bounce thud
    [392, 493.88].forEach((hz) => {
      const horn = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const hg = ctx.createGain();
      horn.type = 'sawtooth';
      horn.frequency.setValueAtTime(hz, now);
      lp.type = 'lowpass';
      lp.frequency.value = 1250;
      hg.gain.setValueAtTime(0.001, now);
      hg.gain.linearRampToValueAtTime(0.09, now + 0.015);
      hg.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      horn.connect(lp);
      lp.connect(hg);
      hg.connect(ctx.destination);
      horn.start(now);
      horn.stop(now + 0.3);
    });

    const thud = ctx.createOscillator();
    const tg = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(160, now);
    thud.frequency.exponentialRampToValueAtTime(48, now + 0.16);
    tg.gain.setValueAtTime(0.24, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    thud.connect(tg);
    tg.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.2);
  }

  public playRescueFanfare(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, now + i * 0.08);
      gain.gain.setValueAtTime(0.15, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.36);
    });
  }

  public playPropTrigger(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.14);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playHit(heavy: boolean): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep metallic thud + filtered crash noise
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 115 : 155, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + (heavy ? 0.32 : 0.2));
    gain.gain.setValueAtTime(heavy ? 0.32 : 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.34 : 0.22));
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);

    const crunch = ctx.createBufferSource();
    crunch.buffer = this.getBrownNoiseBuffer(ctx);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(heavy ? 0.26 : 0.16, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.24 : 0.15));
    crunch.connect(cg);
    cg.connect(ctx.destination);
    crunch.start(now);
    crunch.stop(now + 0.26);
  }

  public playNitro(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Pressurized nitrous whoosh + warm low-end exhaust surge + subtle turbo spool
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = this.getBrownNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(320, now);
    bp.frequency.exponentialRampToValueAtTime(1450, now + 0.22);
    bp.frequency.exponentialRampToValueAtTime(520, now + 0.55);
    bp.Q.value = 1.1;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.001, now);
    wg.gain.linearRampToValueAtTime(0.24, now + 0.06);
    wg.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
    whoosh.connect(bp);
    bp.connect(wg);
    wg.connect(ctx.destination);
    whoosh.start(now);
    whoosh.stop(now + 0.58);

    // Subtle turbo turbine whistle (clean sine, not raw sawtooth)
    const turbo = ctx.createOscillator();
    const tg = ctx.createGain();
    turbo.type = 'sine';
    turbo.frequency.setValueAtTime(620, now);
    turbo.frequency.exponentialRampToValueAtTime(1650, now + 0.32);
    tg.gain.setValueAtTime(0.001, now);
    tg.gain.linearRampToValueAtTime(0.055, now + 0.08);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    turbo.connect(tg);
    tg.connect(ctx.destination);
    turbo.start(now);
    turbo.stop(now + 0.44);
  }

  public playGarageClick(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [520, 780].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(0.11, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + i * 0.055 + 0.1,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.12);
    });
  }
}

export const soundEngine = new SoundEngine();
