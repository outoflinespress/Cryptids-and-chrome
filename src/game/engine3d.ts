import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from './audio';
import {
  computeLoadoutStats,
  getBike,
  getRider,
  getScareMechanic,
  RIDERS,
  SCARE_MECHANICS,
} from './catalog';
import {
  buildCaptiveTruckMesh,
  buildHighwayWorld,
  buildHumanVehicleMesh,
  CaptiveTruck,
  HighwayVehicle,
  HighwayWorld,
  HumanVehicleKind,
  LANE_XS,
  ROAD_HALF_WIDTH,
} from './highwayWorld';
import { BikeRig, buildMotorcycleRig } from './models/bikeBuilder';
import { buildMonsterFromRiderDef, buildMonsterRig, MonsterRig } from './models/monsterBuilder';
import {
  CaptiveHudInfo,
  ComputedStats,
  FloatingCallout,
  GameScreen,
  HudSnapshot,
  PlayerSave,
  RiderId,
  RunSummaryData,
  ScareMechanicId,
  ScareSlotState,
  VehicleControlMode,
} from './types';

// Reusable scratch math objects (Zero GC in tick loop)
const _v1 = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _camLookGoal = new THREE.Vector3();
const _camLookCurr = new THREE.Vector3();
const CALLOUT_DURATION = 1.0;
const CALLOUT_MAX_QUEUE = 6;
const HIJACK_RANGE_AHEAD = 26;
const HIJACK_RANGE_BEHIND = 9;
const HIJACK_MAX_DX = 7.5;
const RESCUE_RANGE_AHEAD = 28;
const RESCUE_RANGE_BEHIND = 11;
const RESCUE_MAX_DX = 11.5;

interface ShockWaveFX {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  maxAge: number;
  maxScale: number;
  isCone: boolean;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  active: boolean;
  age: number;
  maxAge: number;
}

export type TouchControlId = 'left' | 'right' | 'throttle' | 'brake';

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRunComplete: (summary: RunSummaryData) => void;
  onMonsterRescued: (riderId: RiderId) => void;
  onPauseRequest: () => void;
}

const HUMAN_CAR_COLORS = [0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x06b6d4];

export class CryptidGame3DEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private world: HighwayWorld;

  private save: PlayerSave;
  private stats: ComputedStats;
  private screen: GameScreen = 'TITLE';

  private bikeRig!: BikeRig;
  private monsterRig!: MonsterRig;
  private hijackBustRig!: MonsterRig;
  private stolenVehicleGroup: THREE.Group | null = null;
  private actorRoot = new THREE.Group();
  private trafficRoot = new THREE.Group();

  // Loop & timing
  private frameId = 0;
  private disposed = false;
  private lastTimestamp = 0;
  private elapsed = 0;
  private hudThrottle = 0;

  // Player highway state (player stays near z = 0; world & traffic move relative to playerSpeed)
  private playerX = 2.2;
  private playerVx = 0;
  private playerSpeed = 30;
  private bikeLean = 0;
  private wheelieTimer = 0;
  private loomTimer = 0;
  private leapAnimTimer = 0;
  private footRunCycle = 0;
  private controlMode: VehicleControlMode = 'own_bike';
  private hijackTarget: HighwayVehicle | null = null;

  // Traffic & Captive Truck
  private vehicles: HighwayVehicle[] = [];
  private nextVehicleId = 1;
  private vehicleSpawnTimer = 0;
  private runElapsed = 0;
  private captiveTruck: CaptiveTruck | null = null;
  private captiveSpawnTimer = 10; // First Captive Truck appears quickly!

  // Run telemetry
  private hp = 4;
  private maxHp = 4;
  private invulnTimer = 0;
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private distanceMeters = 0;
  private dreadThisRun = 0;
  private wreckedCount = 0;
  private hijackedCount = 0;
  private propsTriggered = 0;
  private rescuedThisRun: RiderId[] = [];
  private combo = 0;
  private bestCombo = 0;
  private comboTimer = 0;
  private maxMph = 0;
  private nitroFrac = 0.55;
  private nitroActive = false;
  private nitroTimer = 0;
  private darknessTimer = 0;
  private spotlightExposure = 0;
  private inSpotlightWarning = false;

  // Cooldowns
  private scareCooldowns: Record<ScareMechanicId, number> = {
    thunder_rev: 0,
    highbeam_loom: 0,
    prop_havoc: 0,
    banshee_wail: 0,
    hellfire_scorch: 0,
  };
  private signatureCooldown = 0;
  private selectedScare: ScareMechanicId = 'thunder_rev';
  private statusToast: string | null = null;
  private statusToastTimer = 0;

  // Callouts & VFX
  private callouts: FloatingCallout[] = [];
  private nextCalloutId = 1;
  private shockwaves: ShockWaveFX[] = [];
  private sparks: SparkParticle[] = [];
  private neonTrailTimer = 0;
  private headlightPointLight!: THREE.PointLight;
  private underglowPointLight!: THREE.PointLight;
  private emberPoints!: THREE.Points;
  private speedStreaks: THREE.Mesh[] = [];

  // Inputs (Keyboard + Multi-touch On-Screen Controls + Canvas Drag-to-Steer)
  private held = new Set<string>();
  private justPressed = new Set<string>();
  private touchHeld: Record<TouchControlId, boolean> = {
    left: false,
    right: false,
    throttle: false,
    brake: false,
  };
  private dragPointerId: number | null = null;
  private dragSteerActive = false;
  private dragStartX = 0;
  private dragPlayerStartX = 0;
  private dragTargetX = 0;
  private showcaseAngle = 0.62;

  constructor(container: HTMLElement, initialSave: PlayerSave, callbacks: EngineCallbacks) {
    this.container = container;
    this.save = initialSave;
    this.callbacks = callbacks;
    this.stats = computeLoadoutStats(initialSave.equipped);
    this.selectedScare = initialSave.equipped.activeScare;

    // 1. Software WebGL probe
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // 3. Dark Gritty Haunted Pine Forest Atmosphere + RoomEnvironment reflections
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c15);
    this.scene.fog = new THREE.FogExp2(0x10131e, 0.0046);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 4. Camera (wider far plane so full panoramic haunted pine harvest moon renders crisply)
    this.camera = new THREE.PerspectiveCamera(
      58,
      (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.2,
      500,
    );
    this.camera.position.set(-0.9, 1.85, 5.2);
    _camLookCurr.set(-0.7, 1.5, -2.0);

    // 5. Dramatic Graphic-Novel Lighting: Moon Key + Indigo Fill + Orange/Lime Dual Rims
    const hemi = new THREE.HemisphereLight(0x9eaee8, 0x261530, 1.15);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffd29e, 1.85);
    keyLight.position.set(-22, 36, 18);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -28;
    keyLight.shadow.camera.right = 28;
    keyLight.shadow.camera.top = 35;
    keyLight.shadow.camera.bottom = -35;
    keyLight.shadow.camera.near = 4;
    keyLight.shadow.camera.far = 110;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimOrange = new THREE.DirectionalLight(0xff5a1f, 1.15);
    rimOrange.position.set(22, 12, -24);
    this.scene.add(rimOrange);

    const rimLime = new THREE.DirectionalLight(0x8cff2e, 0.55);
    rimLime.position.set(-18, 8, -16);
    this.scene.add(rimLime);

    // Dynamic Player Headlight & Chassis Underglow Lights (illuminate wet asphalt!)
    this.headlightPointLight = new THREE.PointLight(0xffdfa0, 8, 26, 1.6);
    this.headlightPointLight.position.set(0, 1.4, -3.5);
    this.scene.add(this.headlightPointLight);

    this.underglowPointLight = new THREE.PointLight(0xff5412, 6, 12, 1.5);
    this.underglowPointLight.position.set(0, 0.65, 0);
    this.scene.add(this.underglowPointLight);

    // 6. Build Highway World + VFX + Atmosphere + Player Rig
    this.world = buildHighwayWorld(this.renderer);
    this.scene.add(this.world.root);
    this.scene.add(this.trafficRoot);
    this.scene.add(this.actorRoot);

    this.initVfxPools();
    this.initAtmosphereParticles();
    this.rebuildPlayerMeshes();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 7. Listeners (Keyboard + Pointer Drag-to-Steer on 3D Canvas)
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.renderer.domElement.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handleCanvasPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handleCanvasPointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.lastTimestamp = performance.now();
    this.tick();
  }

  private initVfxPools(): void {
    for (let i = 0; i < 14; i++) {
      const isCone = i >= 12;
      const geo = isCone
        ? new THREE.CircleGeometry(1, 20, -0.38, 0.76)
        : new THREE.TorusGeometry(1, 0.1, 8, 32);
      if (isCone) {
        geo.rotateX(-Math.PI / 2);
        geo.rotateY(Math.PI / 2);
      } else {
        geo.rotateX(Math.PI / 2);
      }
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff7a29,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({
        mesh,
        active: false,
        age: 0,
        maxAge: 0.52,
        maxScale: 14,
        isCone,
      });
    }

    const pGeo = new THREE.OctahedronGeometry(0.22, 0);
    for (let i = 0; i < 64; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff5412,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(pGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        vel: new THREE.Vector3(),
        active: false,
        age: 0,
        maxAge: 0.75,
      });
    }
  }

  private initAtmosphereParticles(): void {
    // Drifting glowing Halloween embers / fireflies across the midnight highway
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 46;
      positions[i * 3 + 1] = 0.6 + Math.random() * 14;
      positions[i * 3 + 2] = -140 + Math.random() * 165;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff8c38,
      size: 0.34,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.emberPoints = new THREE.Points(geo, mat);
    this.scene.add(this.emberPoints);

    // High-speed neon wind streaks whipping past during highway chase & Nitro!
    const streakGeo = new THREE.BoxGeometry(0.06, 0.06, 5.5);
    for (let i = 0; i < 18; i++) {
      const sMat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0x8cff2e : i % 3 === 1 ? 0xff7a29 : 0x38bdf8,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(streakGeo, sMat);
      mesh.position.set(
        (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 14),
        0.8 + Math.random() * 7.5,
        -120 + Math.random() * 145,
      );
      this.scene.add(mesh);
      this.speedStreaks.push(mesh);
    }
  }

  private stepAtmosphere(dt: number, speed: number): void {
    if (this.emberPoints) {
      const posAttr = this.emberPoints.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let z = posAttr.getZ(i) + (speed * 0.55 + 4) * dt;
        let y = posAttr.getY(i) + Math.sin(this.elapsed * 2 + i) * 0.4 * dt;
        if (z > 24) {
          z = -135 - Math.random() * 25;
          y = 0.6 + Math.random() * 13;
        }
        posAttr.setY(i, y);
        posAttr.setZ(i, z);
      }
      posAttr.needsUpdate = true;
    }

    const showStreaks = this.screen === 'PLAYING' && speed > 26;
    const streakOpacity = this.nitroActive ? 0.62 : 0.24;
    for (const s of this.speedStreaks) {
      s.visible = showStreaks;
      if (!showStreaks) continue;
      s.position.z += speed * 2.1 * dt;
      s.scale.z = this.nitroActive ? 2.1 : 1.0;
      (s.material as THREE.MeshBasicMaterial).opacity = streakOpacity;
      if (s.position.z > 20) {
        s.position.z = -110 - Math.random() * 45;
        s.position.x = (Math.random() < 0.5 ? -1 : 1) * (5.5 + Math.random() * 12);
        s.position.y = 0.7 + Math.random() * 6.8;
      }
    }

    // Keep player dynamic lights synced to active vehicle & rider accent
    const rider = getRider(this.save.equipped.rider);
    const px = this.screen === 'PLAYING' ? this.playerX : 0;
    this.headlightPointLight.position.set(px, 1.5, -4.8);
    this.headlightPointLight.intensity = this.controlMode === 'on_foot' ? 2.5 : 10;
    this.underglowPointLight.position.set(px, 0.65, 0);
    this.underglowPointLight.color.set(
      this.controlMode === 'stolen_bike'
        ? '#38bdf8'
        : this.controlMode.startsWith('stolen_')
          ? '#8cff2e'
          : rider.accentColor,
    );
    this.underglowPointLight.intensity = this.nitroActive ? 12 : 7.5;
  }

  public syncSave(newSave: PlayerSave): void {
    const prevEq = this.save.equipped;
    this.save = newSave;
    this.stats = computeLoadoutStats(newSave.equipped);
    this.selectedScare = newSave.equipped.activeScare;

    const visualChanged =
      prevEq.rider !== newSave.equipped.rider ||
      prevEq.bike !== newSave.equipped.bike ||
      prevEq.parts.exhaust !== newSave.equipped.parts.exhaust ||
      prevEq.parts.wheels !== newSave.equipped.parts.wheels ||
      prevEq.parts.headlight !== newSave.equipped.parts.headlight ||
      prevEq.parts.nitro !== newSave.equipped.parts.nitro ||
      prevEq.cosmetics.join(',') !== newSave.equipped.cosmetics.join(',');

    if (visualChanged) {
      this.rebuildPlayerMeshes();
    }
  }

  public setScreen(screen: GameScreen): void {
    this.screen = screen;
    this.trafficRoot.visible =
      screen === 'PLAYING' || screen === 'PAUSED' || screen === 'SUMMARY';
    if (screen === 'PLAYING') {
      soundEngine.startEngine();
    } else {
      soundEngine.stopEngine();
      this.held.clear();
      this.justPressed.clear();
      this.clearTouchInputs();
    }
  }

  public setTouchInput(control: TouchControlId, active: boolean): void {
    this.touchHeld[control] = active;
  }

  public clearTouchInputs(): void {
    this.touchHeld.left = false;
    this.touchHeld.right = false;
    this.touchHeld.throttle = false;
    this.touchHeld.brake = false;
    this.dragPointerId = null;
    this.dragSteerActive = false;
  }

  public startNewRun(): void {
    this.clearTouchInputs();
    this.stats = computeLoadoutStats(this.save.equipped);
    this.playerX = 2.2;
    this.playerVx = 0;
    this.playerSpeed = this.stats.topSpeed * 0.72;
    this.bikeLean = 0;
    this.wheelieTimer = 0;
    this.loomTimer = 0;
    this.leapAnimTimer = 0;
    this.controlMode = 'own_bike';
    this.clearStolenVehicleMesh();
    this.attachMonsterForMode('own_bike');
    this.bikeRig.root.position.set(this.playerX, 0, 0);
    this.bikeRig.root.rotation.set(0, Math.PI, 0);

    this.maxHp = this.stats.maxHp;
    this.hp = this.maxHp;
    this.invulnTimer = 0;
    this.hitstopTimer = 0;
    this.shakeIntensity = 0;
    this.distanceMeters = 0;
    this.dreadThisRun = 0;
    this.wreckedCount = 0;
    this.hijackedCount = 0;
    this.propsTriggered = 0;
    this.rescuedThisRun = [];
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.maxMph = 0;
    this.nitroFrac = 0.6;
    this.nitroActive = false;
    this.nitroTimer = 0;
    this.darknessTimer = 0;
    this.spotlightExposure = 0;
    this.inSpotlightWarning = false;

    for (const m of SCARE_MECHANICS) this.scareCooldowns[m.id] = 0;
    this.signatureCooldown = 0;
    this.callouts = [];

    // Clear existing traffic & captive truck
    for (const v of this.vehicles) this.trafficRoot.remove(v.group);
    this.vehicles = [];
    if (this.captiveTruck) {
      this.trafficRoot.remove(this.captiveTruck.group);
      this.captiveTruck = null;
    }
    this.vehicleSpawnTimer = 0.25;
    this.runElapsed = 0;
    this.captiveSpawnTimer = 10.5; // First captive rescue truck rolls in ~10s!

    // Populate the opening highway stretch immediately with 9 well-spaced civilian vehicles
    // so the player has plenty of targets to scare and weave around from second one!
    const openingZs = [-22, -36, -50, -64, -78, -94, -110, -126, -142];
    for (let i = 0; i < openingZs.length; i++) {
      this.spawnHumanVehicle(openingZs[i], i < 6);
    }

    this.setToast('Scare drivers to 100% Panic to wreck them — press F beside cars to HIJACK!', 4.2);
    this.trafficRoot.visible = true;
    this.screen = 'PLAYING';
    soundEngine.startEngine();
    this.emitHud();
  }

  public bankAndExitRun(): void {
    if (this.screen !== 'PLAYING' && this.screen !== 'PAUSED') return;
    this.finishRun(false);
  }

  private rebuildPlayerMeshes(): void {
    while (this.actorRoot.children.length > 0) {
      this.actorRoot.remove(this.actorRoot.children[0]);
    }
    this.bikeRig = buildMotorcycleRig(this.save.equipped);
    this.monsterRig = buildMonsterRig(this.save.equipped);
    this.hijackBustRig = buildMonsterFromRiderDef(
      getRider(this.save.equipped.rider),
      [],
      'hijack_bust',
    );
    this.hijackBustRig.contactShadow.visible = false;
    // Rotate bike so front faces -Z down the highway!
    this.bikeRig.root.rotation.y = Math.PI;
    this.actorRoot.add(this.bikeRig.root);
    this.stolenVehicleGroup = null;
    this.attachMonsterForMode(this.controlMode);
  }

  private clearStolenVehicleMesh(): void {
    if (this.stolenVehicleGroup) {
      this.actorRoot.remove(this.stolenVehicleGroup);
      this.stolenVehicleGroup = null;
    }
  }

  private attachMonsterForMode(mode: VehicleControlMode): void {
    if (!this.bikeRig || !this.monsterRig || !this.hijackBustRig) return;
    this.bikeRig.bodyGroup.remove(this.monsterRig.root);
    this.actorRoot.remove(this.monsterRig.root);
    this.hijackBustRig.root.parent?.remove(this.hijackBustRig.root);
    if (this.stolenVehicleGroup) {
      this.stolenVehicleGroup.remove(this.monsterRig.root);
    }

    if (mode === 'own_bike' || mode === 'stolen_bike') {
      // Single clean motorcycle — never stack two bikes on top of each other!
      this.bikeRig.root.visible = true;
      this.monsterRig.root.visible = false;
      this.hijackBustRig.root.visible = false;
      this.monsterRig.root.scale.setScalar(1);
      if (this.monsterRig.eyeballOrbit) {
        this.bikeRig.bodyGroup.add(this.monsterRig.eyeballOrbit);
        this.monsterRig.eyeballOrbit.position.set(0, 2.55, 0);
      }
    } else if (mode === 'on_foot') {
      this.bikeRig.root.visible = false;
      this.monsterRig.root.visible = true;
      this.hijackBustRig.root.visible = false;
      this.monsterRig.root.scale.setScalar(1);
      this.actorRoot.add(this.monsterRig.root);
      this.monsterRig.root.position.set(this.playerX, 0, 0);
      this.monsterRig.root.rotation.set(0, 0, 0);
      this.monsterRig.contactShadow.visible = true;
      if (this.monsterRig.eyeballOrbit) {
        this.monsterRig.torsoGroup.add(this.monsterRig.eyeballOrbit);
      }
    } else if (this.stolenVehicleGroup) {
      // Single stolen car/van with ONLY the monster's head & shoulders tucked cleanly inside the roofline!
      this.bikeRig.root.visible = false;
      this.monsterRig.root.visible = false;
      this.hijackBustRig.root.visible = true;
      this.stolenVehicleGroup.add(this.hijackBustRig.root);
      const roofY = mode === 'stolen_van' ? 2.45 : 1.72;
      this.hijackBustRig.root.scale.setScalar(mode === 'stolen_van' ? 0.68 : 0.6);
      // Place slightly AHEAD (-Z) of the car's rear plane so the roof cleanly masks the waist
      this.hijackBustRig.root.position.set(0, roofY, -0.14);
      this.hijackBustRig.root.rotation.set(0, 0, 0);
      this.hijackBustRig.contactShadow.visible = false;
    }
  }

  // ================================================================
  // PUBLIC CONTROLS (Hotkeys & HUD Dock Buttons)
  // ================================================================
  public selectAndTriggerScare(id: ScareMechanicId): void {
    if (this.screen !== 'PLAYING') return;
    if ((this.save.scareLevels[id] ?? 0) <= 0) {
      this.setToast('Unlock this Scare Mechanic in the Garage!', 1.8);
      return;
    }
    this.selectedScare = id;
    this.triggerScareMechanic(id);
  }

  public triggerPrimaryScare(): void {
    if (this.screen !== 'PLAYING') return;
    this.triggerScareMechanic(this.selectedScare);
  }

  public triggerSignaturePower(): void {
    if (this.screen !== 'PLAYING') return;
    if (this.signatureCooldown > 0) return;

    const rider = getRider(this.save.equipped.rider);
    const darkCd = this.darknessTimer > 0 && this.stats.darkSpeedBonus > 0 ? 0.75 : 1;
    this.signatureCooldown = rider.signatureCooldown * this.stats.scareCooldownMult * darkCd;

    soundEngine.playScare('signature', this.controlMode === 'on_foot');
    _v1.set(this.playerX, 0.3, 0);
    const radius = (22 + this.stats.scareRadiusBonus) * this.stats.scareRadiusMult;

    this.spawnShockwave(_v1, radius, rider.signatureColor, false, 0.72);
    this.spawnShockwave(_v1, radius * 0.65, '#F4EFE6', false, 0.48);
    this.spawnSparkBurst(_v1, rider.signatureColor, 20);

    this.shakeIntensity = Math.max(this.shakeIntensity, 0.68);
    this.hitstopTimer = 0.045;
    if (this.controlMode === 'on_foot') this.loomTimer = 0.7;
    else this.wheelieTimer = 0.7;

    this.pushCallout(
      rider.signatureName.toUpperCase() + '!',
      'CRYPTID SIGNATURE',
      rider.signatureColor,
      50,
      34,
    );

    this.applyHighwayScarePulse(
      radius,
      3 + this.stats.scarePowerBonus,
      95,
      1.55,
      true,
      undefined,
      rider.signatureColor,
    );
    this.nitroFrac = Math.min(1, this.nitroFrac + 0.25);
  }

  private advanceCombo(amount = 1): number {
    this.combo += amount;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.comboTimer = this.stats.comboWindow;
    return 1 + Math.min(3.5, (this.combo - 1) * 0.22);
  }

  private isCaptiveTruckInRange(truck: CaptiveTruck): boolean {
    return (
      !truck.freed &&
      truck.z >= -RESCUE_RANGE_AHEAD &&
      truck.z <= RESCUE_RANGE_BEHIND &&
      Math.abs(truck.x - this.playerX) <= RESCUE_MAX_DX
    );
  }

  private isVehicleHijackable(v: HighwayVehicle): boolean {
    return (
      v.active &&
      !v.wrecking &&
      v.z >= -HIJACK_RANGE_AHEAD &&
      v.z <= HIJACK_RANGE_BEHIND &&
      Math.abs(v.x - this.playerX) <= HIJACK_MAX_DX
    );
  }

  private findBestHijackTarget(): HighwayVehicle | null {
    let best: HighwayVehicle | null = null;
    let bestDist = Infinity;
    for (const v of this.vehicles) {
      if (!this.isVehicleHijackable(v)) continue;
      const dist = Math.hypot(v.x - this.playerX, v.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = v;
      }
    }
    return best;
  }

  public triggerLeapOrHijack(): void {
    if (this.screen !== 'PLAYING') return;

    // 1. Always prioritize breaking the Captive Containment Truck cage when in range!
    if (this.captiveTruck && this.isCaptiveTruckInRange(this.captiveTruck)) {
      this.leapAnimTimer = 0.45;
      soundEngine.playHijackLeap();
      this.damageCaptiveTruck(55, 'CAGE BREAK-IN LEAP!');
      this.hudThrottle = 0.065;
      return;
    }

    // 2. Otherwise prioritize hijacking any vehicle in range (never drop on foot if a target is near!)
    const target =
      this.hijackTarget && this.isVehicleHijackable(this.hijackTarget)
        ? this.hijackTarget
        : this.findBestHijackTarget();
    if (target) {
      this.performVehicleHijack(target);
      this.hudThrottle = 0.065;
      return;
    }

    // 3. Only toggle Own Custom Bike <-> On-Foot when NO rescue or hijack target is in range!
    if (this.controlMode === 'on_foot') {
      // Recall & vault back onto your custom motorcycle!
      this.controlMode = 'own_bike';
      this.clearStolenVehicleMesh();
      this.attachMonsterForMode('own_bike');
      this.leapAnimTimer = 0.38;
      this.playerSpeed = Math.max(this.playerSpeed, this.stats.topSpeed * 0.75);
      soundEngine.playHijackLeap();
      this.pushCallout('BACK ON CHROME!', 'ARMORED & FAST', '#8CFF2E', 50, 42);
      this.setToast('Back in your custom saddle — Armored & Ready!', 1.8);
    } else {
      // Leap OFF vehicle onto the highway on foot!
      this.controlMode = 'on_foot';
      this.clearStolenVehicleMesh();
      this.attachMonsterForMode('on_foot');
      this.leapAnimTimer = 0.42;
      soundEngine.playHijackLeap();
      this.pushCallout('LEAPED ON FOOT!', 'VULNERABLE · 2.2× AMBUSH SCARE', '#FFD166', 50, 42);
      this.setToast('ON FOOT: 2× Damage Taken · 2.2× Ambush Scare · Press F to Hijack or Recall Bike!', 3.2);
    }
    this.hudThrottle = 0.065;
  }

  private performVehicleHijack(target: HighwayVehicle): void {
    const modeMap: Record<HumanVehicleKind, VehicleControlMode> = {
      sedan: 'stolen_sedan',
      muscle: 'stolen_muscle',
      van: 'stolen_van',
      bike: 'stolen_bike',
    };
    const labelMap: Record<HumanVehicleKind, string> = {
      sedan: 'STOLEN SEDAN',
      muscle: 'STOLEN MUSCLE CAR',
      van: 'STOLEN SKEPTIC VAN',
      bike: 'STOLEN STREETBIKE',
    };

    // Move player cleanly onto the stolen vehicle's lane & remove AI vehicle
    this.playerX = target.x;
    this.hijackedCount++;
    const comboMult = this.advanceCombo(1);
    const bonus = Math.round(90 * this.stats.dreadMultiplier * (1 + Math.min(1.5, (comboMult - 1) * 0.5)));
    this.dreadThisRun += bonus;
    this.nitroFrac = Math.min(1, this.nitroFrac + 0.22);

    // Replace player's vehicle cleanly (never leave two vehicles stacked!)
    this.clearStolenVehicleMesh();
    this.controlMode = modeMap[target.kind];

    if (target.kind !== 'bike') {
      const stolenColor =
        target.kind === 'van'
          ? 0xfacc15
          : target.kind === 'muscle'
            ? 0xff2a54
            : 0x6366f1;
      const built = buildHumanVehicleMesh(target.kind, stolenColor);
      built.panicBarBg.visible = false;
      built.panicBarFill.visible = false;
      built.hijackRing.visible = false;
      if (built.shieldRing) built.shieldRing.visible = false;
      if (built.spotlightCone) built.spotlightCone.visible = false;

      // Subtle hijacked underglow ring so the player's stolen ride pops cleanly
      const hijackGlow = new THREE.Mesh(
        new THREE.CircleGeometry(target.kind === 'van' ? 2.4 : 2.1, 24),
        new THREE.MeshBasicMaterial({
          color: 0x8cff2e,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      hijackGlow.rotation.x = -Math.PI / 2;
      hijackGlow.position.y = 0.04;
      built.group.add(hijackGlow);

      this.stolenVehicleGroup = built.group;
      this.stolenVehicleGroup.position.set(this.playerX, 0, 0);
      this.actorRoot.add(this.stolenVehicleGroup);
    }

    this.attachMonsterForMode(this.controlMode);

    // Immediately remove the hijacked AI target from scene AND vehicles array
    target.active = false;
    this.trafficRoot.remove(target.group);
    const targetIdx = this.vehicles.indexOf(target);
    if (targetIdx !== -1) this.vehicles.splice(targetIdx, 1);
    this.hijackTarget = null;

    this.leapAnimTimer = 0.45;
    this.shakeIntensity = 0.38;
    this.hitstopTimer = 0.035;
    soundEngine.playHijackLeap();

    _v1.set(this.playerX, 1.0, 0);
    this.spawnSparkBurst(_v1, '#8CFF2E', 14);
    this.pushCallout(
      `HIJACKED ${labelMap[target.kind]}!`,
      `+${bonus} DREAD · DRIVER EJECTED!`,
      '#8CFF2E',
      50,
      38,
    );
    this.setToast(`Driving ${labelMap[target.kind]} — Press F to leap onto another ride or bail!`, 2.8);
  }

  public triggerNitro(): void {
    if (this.screen !== 'PLAYING') return;
    if (this.nitroActive || this.nitroFrac < 0.22) return;
    this.nitroActive = true;
    this.nitroTimer = this.stats.nitroDuration * this.nitroFrac;
    soundEngine.playNitro();
    this.shakeIntensity = Math.max(this.shakeIntensity, 0.35);
    this.pushCallout(
      this.controlMode === 'on_foot' ? 'CRYPTID SPRINT!' : 'NITRO OVERDRIVE!',
      undefined,
      '#FF5412',
      50,
      54,
    );
  }

  private triggerScareMechanic(id: ScareMechanicId): void {
    const level = this.save.scareLevels[id] ?? 0;
    if (level <= 0) return;
    if (this.scareCooldowns[id] > 0) return;

    const def = getScareMechanic(id);
    const darkCd = this.darknessTimer > 0 && this.stats.darkSpeedBonus > 0 ? 0.75 : 1;
    this.scareCooldowns[id] = def.cooldown * this.stats.scareCooldownMult * darkCd;

    _v1.set(this.playerX, 0.32, 0);
    const radius =
      (def.baseRadius + (level - 1) * def.radiusPerLevel + this.stats.scareRadiusBonus) *
      this.stats.scareRadiusMult;
    const power = def.basePower + (level >= 3 ? 1 : 0) + this.stats.scarePowerBonus;
    const panicAmt = def.panicDamage * (1 + (level - 1) * 0.25);
    const mult = def.dreadMultiplier * (1 + (level - 1) * 0.22);

    soundEngine.playScare(id, this.controlMode === 'on_foot');

    if (id === 'highbeam_loom') {
      if (this.controlMode === 'on_foot') this.loomTimer = 0.72;
      else this.wheelieTimer = 0.72;
      this.spawnShockwave(_v1, radius, def.color, true, 0.52);
      this.spawnSparkBurst(_v1, def.color, 10);
    } else if (id === 'banshee_wail') {
      this.spawnShockwave(_v1, radius, def.color, false, 0.65);
      this.spawnShockwave(_v1, radius * 0.68, '#F4EFE6', false, 0.45);
      this.spawnSparkBurst(_v1, def.color, 16);
    } else if (id === 'hellfire_scorch') {
      this.spawnShockwave(_v1, radius, '#FF4500', false, 0.68);
      this.spawnShockwave(_v1, radius * 0.8, '#FFD166', false, 0.5);
      this.spawnSparkBurst(_v1, '#FF5412', 22);
    } else {
      this.spawnShockwave(_v1, radius, def.color, false, 0.5);
      this.spawnSparkBurst(_v1, def.color, 12);
    }

    this.shakeIntensity = Math.max(this.shakeIntensity, id === 'hellfire_scorch' ? 0.52 : 0.32);

    const shout = def.shoutWords[Math.floor(Math.random() * def.shoutWords.length)];
    this.pushCallout(
      shout,
      this.controlMode === 'on_foot' ? 'AMBUSH 2.2×' : def.category.toUpperCase(),
      def.color,
      48,
      40,
    );

    const wrecks = this.applyHighwayScarePulse(
      radius,
      power,
      panicAmt,
      mult,
      Boolean(def.triggersProps) || this.controlMode === 'on_foot',
      def.coneAngle,
      def.color,
    );
    if (wrecks > 0) this.hitstopTimer = 0.045;
  }

  private applyHighwayScarePulse(
    radius: number,
    power: number,
    panicDamage: number,
    dreadMult: number,
    canTriggerProps: boolean,
    coneAngle: number | undefined,
    fxColor: string,
  ): number {
    const ambushMult = this.controlMode === 'on_foot' ? 2.2 : 1.0;
    let wrecksTriggered = 0;
    let scaredDrivers = 0;
    let scaredDread = 0;

    // 1. Trigger Roadside Environmental Props (Streetlamps -> Darkness, Barrels -> Explosion, Billboards -> Sparks!)
    if (canTriggerProps) {
      for (const prop of this.world.props) {
        if (prop.triggered) continue;
        const dist = Math.hypot(prop.x - this.playerX, prop.z);
        if (dist <= radius + 4.5) {
          this.triggerRoadsideProp(prop, ambushMult);
        }
      }
    }

    // 2. Hit Captive Containment Truck locks!
    if (this.captiveTruck && !this.captiveTruck.freed) {
      const dist = Math.hypot(this.captiveTruck.x - this.playerX, this.captiveTruck.z);
      if (dist <= radius + 4.2) {
        const lockDmg = Math.round((24 + power * 10) * ambushMult);
        this.damageCaptiveTruck(lockDmg, 'CAGE LOCK CRACKED!');
      }
    }

    // 3. Spike Panic on all human vehicles in range!
    for (const v of this.vehicles) {
      if (!v.active || v.wrecking) continue;
      const dx = v.x - this.playerX;
      const dz = v.z; // ahead is negative Z!
      const dist = Math.hypot(dx, dz);
      if (dist > radius) continue;

      if (coneAngle !== undefined && dist > 2.5) {
        // Forward vector is (0, -1) in (x, z)
        const dot = -dz / dist;
        if (dot < Math.cos(coneAngle)) continue;
      }

      // Skeptic Patrol Van shield check
      if (v.shieldActive) {
        if (power >= 2 || this.controlMode === 'on_foot') {
          v.shieldActive = false;
          if (v.shieldRing) v.shieldRing.visible = false;
          if (v.spotlightCone) v.spotlightCone.visible = false;
          this.advanceCombo(1);
          const shieldBonus = Math.round(20 * this.stats.dreadMultiplier);
          this.dreadThisRun += shieldBonus;
          this.pushCallout('PATROL SHIELD BROKEN!', `SKEPTIC EXPOSED · +${shieldBonus}`, '#FACC15', 52, 34);
        } else {
          this.pushCallout('SHIELDED VAN!', 'USE LOOM / WAIL / AMBUSH', '#94A3B8', 52, 36);
          continue;
        }
      }

      const addedPanic = panicDamage * ambushMult;
      v.panic = Math.min(100, v.panic + addedPanic);
      v.driftVx += (dx >= 0 ? 1 : -1) * 4.5;
      _v1.set(v.x, 1.1, v.z);
      this.spawnSparkBurst(_v1, fxColor, 6);

      if (v.panic >= 100) {
        this.wreckVehicle(v, dreadMult * ambushMult);
        wrecksTriggered++;
      } else {
        const comboMult = this.advanceCombo(1);
        const rattleDread = Math.round(28 * dreadMult * this.stats.dreadMultiplier * comboMult);
        this.dreadThisRun += rattleDread;
        scaredDrivers++;
        scaredDread += rattleDread;
        this.nitroFrac = Math.min(1, this.nitroFrac + 0.07);
      }
    }

    if (scaredDrivers > 0 && wrecksTriggered === 0) {
      this.pushCallout(
        `SCARED${scaredDrivers > 1 ? ` ×${scaredDrivers}` : ''}! +${scaredDread}`,
        this.combo >= 2 ? `${this.combo}× SCARE COMBO` : 'DREAD EARNED',
        fxColor,
        50,
        42,
      );
    }

    return wrecksTriggered;
  }

  private triggerRoadsideProp(prop: HighwayWorld['props'][number], ambushMult: number): void {
    prop.triggered = true;
    prop.activeTimer = 4.5;
    prop.effectMesh.visible = true;
    this.propsTriggered++;
    soundEngine.playPropTrigger();

    let title = 'ROADSIDE HAVOC!';
    let color = '#2EC4B6';
    if (prop.kind === 'lamp') {
      if (prop.lampBulb) {
        (prop.lampBulb.material as THREE.MeshBasicMaterial).color.setHex(0x1f2937);
      }
      this.darknessTimer = Math.max(this.darknessTimer, 6.5);
      title = 'HIGHWAY BLACKOUT!';
      color = '#67E8F9';
    } else if (prop.kind === 'barrel') {
      title = 'BARREL DETONATION!';
      color = '#FF5412';
    } else {
      title = 'BILLBOARD SHORT-OUT!';
      color = '#8CFF2E';
    }

    const comboMult = this.advanceCombo(1);
    const bonus = Math.round(
      45 * ambushMult * this.stats.propDreadMultiplier * this.stats.dreadMultiplier * comboMult,
    );
    this.dreadThisRun += bonus;
    _v1.set(prop.x, 1.2, prop.z);
    this.spawnShockwave(_v1, 14, color, false, 0.55);
    this.spawnSparkBurst(_v1, color, 10);
    this.pushCallout(
      title,
      this.combo >= 2 ? `+${bonus} CHAIN DREAD · ${this.combo}× COMBO` : `+${bonus} CHAIN DREAD`,
      color,
      42,
      32,
    );

    // Chain-panic nearby cars!
    for (const v of this.vehicles) {
      if (!v.active || v.wrecking) continue;
      if (Math.hypot(v.x - prop.x, v.z - prop.z) < 15.5) {
        v.shieldActive = false;
        if (v.shieldRing) v.shieldRing.visible = false;
        if (v.spotlightCone) v.spotlightCone.visible = false;
        v.panic = Math.min(100, v.panic + 72);
        if (v.panic >= 100) {
          this.wreckVehicle(v, 1.5 * this.stats.propDreadMultiplier);
        } else {
          const chainComboMult = this.advanceCombo(1);
          const chainRattleDread = Math.round(24 * this.stats.dreadMultiplier * chainComboMult);
          this.dreadThisRun += chainRattleDread;
          this.nitroFrac = Math.min(1, this.nitroFrac + 0.05);
        }
      }
    }
  }

  private wreckVehicle(v: HighwayVehicle, bonusMult: number): void {
    if (v.wrecking) return;
    v.wrecking = true;
    v.wreckTimer = 1.1;
    v.spinVel = (Math.random() < 0.5 ? -1 : 1) * (6.5 + Math.random() * 4);
    v.driftVx = (v.x >= this.playerX ? 1 : -1) * (11 + Math.random() * 6);
    v.panicBarBg.visible = false;
    v.panicBarFill.visible = false;
    v.hijackRing.visible = false;

    this.wreckedCount++;
    const comboMult = this.advanceCombo(1);
    const earned = Math.round(v.baseDread * bonusMult * this.stats.dreadMultiplier * comboMult);
    this.dreadThisRun += earned;
    this.nitroFrac = Math.min(1, this.nitroFrac + 0.16);

    _v1.set(v.x, 1.0, v.z);
    this.spawnShockwave(_v1, 9.5, '#FF5412', false, 0.45);
    this.spawnSparkBurst(_v1, '#FF5412', 16);
    this.spawnSparkBurst(_v1, '#FFD166', 10);
    this.shakeIntensity = Math.max(this.shakeIntensity, 0.45);
    soundEngine.playWreckExplosion(this.combo);

    this.pushCallout(
      `WRECKED! +${earned}`,
      this.combo >= 2 ? `${this.combo}× PANIC COMBO` : 'DRIVER LOST CONTROL!',
      '#FF5412',
      54,
      46,
    );
  }

  private damageCaptiveTruck(amount: number, label: string): void {
    const truck = this.captiveTruck;
    if (!truck || truck.freed) return;
    truck.hp = Math.max(0, truck.hp - amount);
    this.advanceCombo(1);

    _v1.set(truck.x, 2.2, truck.z + 3.2);
    this.spawnSparkBurst(_v1, '#8CFF2E', 14);
    this.shakeIntensity = Math.max(this.shakeIntensity, 0.48);
    this.hitstopTimer = 0.04;

    if (truck.hp <= 0) {
      // CAPTIVE RESCUED!!
      truck.freed = true;
      truck.freedTimer = 2.6;
      truck.cageBars.visible = false;
      truck.hijackRing.visible = false;

      const rescuedId = truck.rider.id;
      if (!this.rescuedThisRun.includes(rescuedId)) {
        this.rescuedThisRun.push(rescuedId);
      }
      const rescueDread = Math.round(250 * this.stats.dreadMultiplier);
      this.dreadThisRun += rescueDread;
      this.hp = Math.min(this.maxHp, this.hp + 1); // Bonus repair on rescue!
      this.nitroFrac = 1.0;

      this.spawnShockwave(_v1, 22, truck.rider.accentColor, false, 0.8);
      this.spawnSparkBurst(_v1, truck.rider.accentColor, 26);
      this.spawnSparkBurst(_v1, '#8CFF2E', 18);
      soundEngine.playRescueFanfare();

      this.pushCallout(
        `${truck.rider.name.toUpperCase()} RESCUED!`,
        `UNLOCKED IN GARAGE · +${rescueDread} DREAD`,
        '#8CFF2E',
        50,
        30,
      );
      this.setToast(`RESCUED ${truck.rider.name} (${truck.rider.poolNumber})! Permanently unlocked!`, 4.5);
      this.callbacks.onMonsterRescued(rescuedId);
    } else {
      const lockBonus = Math.round(25 * this.stats.dreadMultiplier);
      this.dreadThisRun += lockBonus;
      soundEngine.playHit(false);
      this.pushCallout(
        label,
        `CAGE ${Math.round((truck.hp / truck.maxHp) * 100)}% · +${lockBonus} DREAD`,
        '#FFD166',
        50,
        34,
      );
    }
  }

  private spawnHumanVehicle(zStart = -120, civilianOnly = false): boolean {
    // Keep at least 2 lanes clear in any 15m longitudinal band so the player can always weave cleanly
    let bandCount = 0;
    for (const other of this.vehicles) {
      if (other.active && !other.wrecking && Math.abs(other.z - zStart) < 15) {
        bandCount++;
      }
    }
    if (bandCount >= 2) return false;

    // Shuffle all 4 highway lanes and pick the first one with safe longitudinal clearance
    const laneOrder = [0, 1, 2, 3];
    for (let i = laneOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = laneOrder[i];
      laneOrder[i] = laneOrder[j];
      laneOrder[j] = tmp;
    }

    let chosenLane = -1;
    for (const li of laneOrder) {
      const lx = LANE_XS[li];
      let blocked = false;
      for (const other of this.vehicles) {
        if (
          other.active &&
          !other.wrecking &&
          Math.abs(other.x - lx) < 2.6 &&
          Math.abs(other.z - zStart) < 20
        ) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        chosenLane = li;
        break;
      }
    }
    if (chosenLane < 0) return false;

    const x = LANE_XS[chosenLane];
    const inOpening = this.runElapsed < 30;
    const roll = Math.random();
    let kind: HumanVehicleKind;
    if (civilianOnly) {
      kind = roll < 0.45 ? 'sedan' : roll < 0.78 ? 'muscle' : 'bike';
    } else if (inOpening) {
      // Heavy civilian traffic in the first 30s (only ~8% patrol vans)
      kind =
        roll < 0.4 ? 'sedan' : roll < 0.7 ? 'muscle' : roll < 0.92 ? 'bike' : 'van';
    } else {
      kind =
        roll < 0.35 ? 'sedan' : roll < 0.64 ? 'muscle' : roll < 0.85 ? 'bike' : 'van';
    }

    const color =
      kind === 'van'
        ? 0x1e293b
        : HUMAN_CAR_COLORS[this.nextVehicleId % HUMAN_CAR_COLORS.length];

    const built = buildHumanVehicleMesh(kind, color);
    built.group.position.set(x, 0, zStart);
    this.trafficRoot.add(built.group);

    // Scale civilian speed comfortably below player cruise speed (0.76 * topSpeed)
    // so traffic steadily flows toward the player for constant scare & hijack opportunities!
    const speedRatio =
      kind === 'muscle'
        ? 0.48
        : kind === 'bike'
          ? 0.45
          : kind === 'van'
            ? 0.38
            : 0.4;
    const vehicleSpeed =
      this.stats.topSpeed * (speedRatio + Math.random() * 0.08);

    this.vehicles.push({
      id: this.nextVehicleId++,
      kind,
      group: built.group,
      panicBarBg: built.panicBarBg,
      panicBarFill: built.panicBarFill,
      hijackRing: built.hijackRing,
      shieldRing: built.shieldRing,
      spotlightCone: built.spotlightCone,
      laneIndex: chosenLane,
      x,
      z: zStart,
      speed: vehicleSpeed,
      panic: 0,
      shieldActive: kind === 'van',
      wrecking: false,
      wreckTimer: 0,
      spinVel: 0,
      driftVx: 0,
      baseDread: kind === 'van' ? 120 : kind === 'muscle' ? 85 : kind === 'bike' ? 75 : 65,
      active: true,
    });
    return true;
  }

  private spawnCaptiveTruck(): void {
    // Pick a locked coloring-book monster not yet unlocked or rescued this run!
    const locked = RIDERS.filter(
      (r) =>
        !this.save.unlockedRiders.includes(r.id) &&
        !this.rescuedThisRun.includes(r.id),
    );
    if (locked.length === 0) return;

    const captive = locked[Math.floor(Math.random() * locked.length)];
    const truck = buildCaptiveTruckMesh(captive);
    truck.x = Math.random() < 0.5 ? -2.2 : 2.2;
    truck.z = -125;
    truck.speed = Math.max(24, this.stats.topSpeed * 0.64);
    truck.group.position.set(truck.x, 0, truck.z);
    this.trafficRoot.add(truck.group);
    this.captiveTruck = truck;

    this.setToast(
      `CAPTIVE TRUCK AHEAD! Free ${captive.name} (${captive.poolNumber}) with Scares or Leap On [F]!`,
      4.5,
    );
    this.pushCallout(
      `CAPTIVE: ${captive.name.toUpperCase()}`,
      'BREAK THE CAGE TO UNLOCK!',
      '#8CFF2E',
      50,
      26,
    );
  }

  private takeDamage(baseAmount: number, reason: string): void {
    if (this.invulnTimer > 0) return;
    const bike = getBike(this.save.equipped.bike);
    const modeMult =
      this.controlMode === 'on_foot'
        ? this.stats.footDamageMult
        : this.controlMode === 'stolen_van'
          ? 0.55
          : bike.armorScale;

    const dmg = Math.max(1, Math.round(baseAmount * modeMult));
    this.hp = Math.max(0, this.hp - dmg);
    this.invulnTimer = 1.25;
    this.combo = 0;
    this.comboTimer = 0;
    this.shakeIntensity = 0.78;
    this.hitstopTimer = 0.055;
    soundEngine.playHit(this.controlMode === 'on_foot');

    this.pushCallout(
      `-${dmg} INTEGRITY`,
      this.controlMode === 'on_foot' ? `${reason} · VULNERABLE ON FOOT!` : reason,
      '#FF2A54',
      50,
      36,
    );

    if (this.hp <= 0) {
      this.finishRun(true);
    }
  }

  private finishRun(endedByDefeat: boolean): void {
    this.screen = 'SUMMARY';
    soundEngine.stopEngine();
    this.held.clear();
    this.justPressed.clear();
    this.clearTouchInputs();
    this.callbacks.onRunComplete({
      dreadEarned: this.dreadThisRun,
      wreckedCount: this.wreckedCount,
      hijackedCount: this.hijackedCount,
      propsTriggered: this.propsTriggered,
      rescuedRiders: [...this.rescuedThisRun],
      bestCombo: this.bestCombo,
      maxMph: this.maxMph,
      distanceMiles: Number((this.distanceMeters / 1609).toFixed(2)),
      endedByDefeat,
      isNewRecord: this.dreadThisRun > this.save.bestRunDread,
    });
  }

  // ================================================================
  // MAIN SIMULATION & RENDER LOOP (GPU rAF / Software WebGL afterDraw)
  // ================================================================
  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsed += dt;

    if (this.screen === 'PLAYING') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.stepGameplay(dt);
      }
      this.stepVfx(dt);
      this.stepAtmosphere(dt, this.playerSpeed);
      this.updateChaseCamera(dt);
    } else if (this.screen === 'TITLE' || this.screen === 'GARAGE') {
      this.stepShowcase(dt);
      this.stepAtmosphere(dt, 14);
      this.stepVfx(dt);
    }

    this.justPressed.clear();
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private stepShowcase(dt: number): void {
    this.showcaseAngle += dt * (this.screen === 'GARAGE' ? 0.65 : 0.28);

    // Roll road gently under idling hero motorcycle!
    this.world.roadTexture.offset.y -= dt * 0.45;
    this.scrollScenery(dt, 14);

    if (this.controlMode !== 'own_bike') {
      this.controlMode = 'own_bike';
      this.clearStolenVehicleMesh();
      this.attachMonsterForMode('own_bike');
    }

    this.bikeRig.bodyGroup.rotation.set(0, 0, 0);
    this.bikeRig.bodyGroup.position.y = Math.sin(this.elapsed * 22) * 0.016;
    this.bikeRig.frontWheel.rotation.x += dt * 7;
    for (const rw of this.bikeRig.rearWheels) rw.rotation.x += dt * 7;
    this.animateMonsterDetails(dt, 0.35);

    if (this.screen === 'GARAGE') {
      // Dynamically frame the selected rider & bike dead-center in the open LEFT viewport
      // beside the right-anchored Garage panel across all desktop widths!
      const sway = Math.sin(this.elapsed * 0.9) * 0.14;
      this.bikeRig.root.visible = true;
      this.bikeRig.root.position.set(0, 0, 0);
      this.bikeRig.root.rotation.set(0, Math.PI + sway, 0);
      this.bikeRig.bodyGroup.rotation.z = Math.sin(this.elapsed * 1.3) * 0.04;

      const viewW = this.container.clientWidth || window.innerWidth;
      const panelW = viewW >= 1280 ? 740 : viewW >= 1024 ? 680 : 0;
      const dist = 5.6;
      const targetFov = 54;
      const halfW =
        dist * Math.tan(THREE.MathUtils.degToRad(targetFov / 2)) * this.camera.aspect;
      // Place rider at the horizontal center of the open left window (NDC = -panelW / viewW)
      const camOffsetX = panelW > 0 ? (panelW / Math.max(1, viewW)) * halfW : 0;

      _camGoal.set(camOffsetX, 1.85, dist);
      _camLookGoal.set(camOffsetX, 1.62, 0);
    } else {
      // Heroic Title cover shot: your 3D monster roaring down the haunted pine highway
      // framed right against the giant illustrated harvest moon!
      const sway = Math.sin(this.elapsed * 0.65) * 0.09;
      this.bikeRig.root.visible = true;
      this.bikeRig.root.position.set(0.85, 0, 0.1);
      this.bikeRig.root.rotation.set(0, Math.PI + sway, 0);
      this.bikeRig.bodyGroup.rotation.z = Math.sin(this.elapsed * 1.1) * 0.035;
      _camGoal.set(-0.85, 1.95, 5.4);
      _camLookGoal.set(-0.65, 1.55, -2.0);
    }

    // Flicker exhaust flames subtly on Title/Garage idle so the bike feels alive!
    for (const fl of this.bikeRig.exhaustFlames) {
      fl.visible = true;
      const flick = 0.55 + Math.sin(this.elapsed * 28) * 0.25;
      fl.scale.set(0.85, flick, 0.85);
    }

    const showcaseFov = this.screen === 'GARAGE' ? 54 : 58;
    if (Math.abs(this.camera.fov - showcaseFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, showcaseFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camGoal.x, 5.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camGoal.y, 5.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camGoal.z, 5.5, dt);
    _camLookCurr.lerp(_camLookGoal, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(_camLookCurr);
  }

  private scrollScenery(dt: number, speed: number): void {
    const dz = speed * dt;
    for (const chunk of this.world.sceneryChunks) {
      chunk.position.z += dz;
      if (chunk.position.z > 65) {
        chunk.position.z -= 320;
      }
    }
    for (const prop of this.world.props) {
      prop.z += dz;
      if (prop.z > 45) {
        prop.z -= 320;
        prop.triggered = false;
        prop.activeTimer = 0;
        prop.effectMesh.visible = false;
        if (prop.lampBulb) {
          (prop.lampBulb.material as THREE.MeshBasicMaterial).color.setHex(0xffd27d);
        }
      }
      prop.group.position.z = prop.z;
      if (prop.activeTimer > 0) {
        prop.activeTimer -= dt;
        prop.effectMesh.rotation.z += dt * 8;
        if (prop.kind === 'barrel') {
          const s = 1 + Math.sin(this.elapsed * 20) * 0.25;
          prop.effectMesh.scale.setScalar(s);
        }
        if (prop.activeTimer <= 0) prop.effectMesh.visible = false;
      }
    }
  }

  private stepGameplay(dt: number): void {
    // Edge-triggered actions
    if (this.justPressed.has('Escape') || this.justPressed.has('KeyP')) {
      this.callbacks.onPauseRequest();
      return;
    }
    if (this.justPressed.has('KeyF')) this.triggerLeapOrHijack();
    if (this.justPressed.has('Space')) this.triggerPrimaryScare();
    if (this.justPressed.has('KeyQ')) this.triggerSignaturePower();
    if (this.justPressed.has('ShiftLeft') || this.justPressed.has('ShiftRight')) {
      this.triggerNitro();
    }
    if (this.justPressed.has('Digit1')) this.selectAndTriggerScare('thunder_rev');
    if (this.justPressed.has('Digit2')) this.selectAndTriggerScare('highbeam_loom');
    if (this.justPressed.has('Digit3')) this.selectAndTriggerScare('prop_havoc');
    if (this.justPressed.has('Digit4')) this.selectAndTriggerScare('banshee_wail');
    if (this.justPressed.has('Digit5')) this.selectAndTriggerScare('hellfire_scorch');

    // Timers
    this.runElapsed += dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.wheelieTimer > 0) this.wheelieTimer -= dt;
    if (this.loomTimer > 0) this.loomTimer -= dt;
    if (this.leapAnimTimer > 0) this.leapAnimTimer = Math.max(0, this.leapAnimTimer - dt);
    if (this.darknessTimer > 0) this.darknessTimer = Math.max(0, this.darknessTimer - dt);
    if (this.statusToastTimer > 0) {
      this.statusToastTimer -= dt;
      if (this.statusToastTimer <= 0) this.statusToast = null;
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    for (const m of SCARE_MECHANICS) {
      if (this.scareCooldowns[m.id] > 0) {
        this.scareCooldowns[m.id] = Math.max(0, this.scareCooldowns[m.id] - dt);
      }
    }
    if (this.signatureCooldown > 0) {
      this.signatureCooldown = Math.max(0, this.signatureCooldown - dt);
    }
    if (this.nitroActive) {
      this.nitroTimer -= dt;
      this.nitroFrac = Math.max(0, this.nitroTimer / Math.max(0.5, this.stats.nitroDuration));
      if (this.nitroTimer <= 0) {
        this.nitroActive = false;
        this.nitroFrac = 0;
      }
    }

    // Inputs (Keyboard + On-Screen Touch Pads + 3D Canvas Drag-to-Steer)
    const kbThrottle =
      (this.held.has('KeyW') || this.held.has('ArrowUp') ? 1 : 0) -
      (this.held.has('KeyS') || this.held.has('ArrowDown') ? 1 : 0);
    const touchThrottle =
      (this.touchHeld.throttle ? 1 : 0) - (this.touchHeld.brake ? 1 : 0);
    const throttle = THREE.MathUtils.clamp(kbThrottle + touchThrottle, -1, 1);

    const kbSteer =
      (this.held.has('KeyD') || this.held.has('ArrowRight') ? 1 : 0) -
      (this.held.has('KeyA') || this.held.has('ArrowLeft') ? 1 : 0);
    const touchBtnSteer =
      (this.touchHeld.right ? 1 : 0) - (this.touchHeld.left ? 1 : 0);

    let steer = THREE.MathUtils.clamp(kbSteer + touchBtnSteer, -1, 1);
    if (steer === 0 && this.dragSteerActive) {
      steer = THREE.MathUtils.clamp((this.dragTargetX - this.playerX) * 0.9, -1, 1);
    }

    // Determine top & cruise speed based on active vehicle / on-foot mode!
    const darkBoost = this.darknessTimer > 0 ? 1 + this.stats.darkSpeedBonus : 1;
    let modeTop = this.stats.topSpeed;
    let modeSteer = this.stats.turnRate;
    if (this.controlMode === 'on_foot') {
      modeTop = 23; // Vulnerable slower highway sprint
      modeSteer = 14.5;
    } else if (this.controlMode === 'stolen_muscle') {
      modeTop = this.stats.topSpeed * 1.15;
      modeSteer = 15.5;
    } else if (this.controlMode === 'stolen_van') {
      modeTop = this.stats.topSpeed * 0.94;
      modeSteer = 11.5;
    } else if (this.controlMode === 'stolen_sedan') {
      modeTop = this.stats.topSpeed * 0.98;
      modeSteer = 13.5;
    } else if (this.controlMode === 'stolen_bike') {
      modeTop = this.stats.topSpeed * 1.06;
      modeSteer = 17.5;
    }

    const maxSpd =
      (modeTop + (this.nitroActive ? this.stats.nitroSpeedBonus : 0)) * darkBoost;
    const minCruise = this.controlMode === 'on_foot' ? 14 : maxSpd * 0.48;
    const targetSpeed =
      this.nitroActive
        ? maxSpd
        : throttle > 0
          ? maxSpd
          : throttle < 0
            ? minCruise
            : maxSpd * 0.76;

    this.playerSpeed = THREE.MathUtils.damp(this.playerSpeed, targetSpeed, 3.2, dt);
    this.playerVx = THREE.MathUtils.damp(this.playerVx, steer * modeSteer, 11, dt);
    this.playerX = THREE.MathUtils.clamp(
      this.playerX + this.playerVx * dt,
      -ROAD_HALF_WIDTH + 0.85,
      ROAD_HALF_WIDTH - 0.85,
    );

    // Distance & highway scrolling
    this.distanceMeters += this.playerSpeed * dt;
    this.world.roadTexture.offset.y -= (this.playerSpeed * dt) / 19.2;
    this.scrollScenery(dt, this.playerSpeed);

    const mph = Math.round(this.playerSpeed * 2.15);
    if (mph > this.maxMph) this.maxMph = mph;

    // Animate player rig (leap arc, bike lean into corners, wheelie, on-foot sprint!)
    const leapY = this.leapAnimTimer > 0 ? Math.sin((this.leapAnimTimer / 0.45) * Math.PI) * 2.5 : 0;
    const targetLean = steer * 0.22;
    this.bikeLean = THREE.MathUtils.damp(this.bikeLean, targetLean, 10, dt);

    if (this.controlMode === 'own_bike' || this.controlMode === 'stolen_bike') {
      this.bikeRig.root.position.set(this.playerX, leapY, 0);
      this.bikeRig.bodyGroup.rotation.z = this.bikeLean;
      const wPitch = this.wheelieTimer > 0 ? -0.34 : 0;
      this.bikeRig.bodyGroup.rotation.x = THREE.MathUtils.damp(
        this.bikeRig.bodyGroup.rotation.x,
        wPitch,
        10,
        dt,
      );
      this.bikeRig.steerGroup.rotation.y = THREE.MathUtils.damp(
        this.bikeRig.steerGroup.rotation.y,
        -steer * 0.3,
        12,
        dt,
      );
      const wheelSpin = this.playerSpeed * dt * 1.1;
      this.bikeRig.frontWheel.rotation.x += wheelSpin;
      for (const rw of this.bikeRig.rearWheels) rw.rotation.x += wheelSpin;

      const showFlame = this.nitroActive || throttle > 0;
      for (const f of this.bikeRig.exhaustFlames) {
        f.visible = showFlame;
        if (showFlame) {
          f.scale.set(1, (this.nitroActive ? 1.9 : 0.9) + Math.sin(this.elapsed * 45) * 0.25, 1);
        }
      }
      const hlMat = this.bikeRig.headlightCone.material as THREE.MeshBasicMaterial;
      hlMat.opacity = this.wheelieTimer > 0 ? 0.42 : 0.14;
    } else if (this.controlMode === 'on_foot') {
      this.footRunCycle += dt * (this.nitroActive ? 18 : 13);
      const stride = Math.sin(this.footRunCycle);
      this.monsterRig.root.position.set(
        this.playerX,
        leapY + Math.abs(stride) * 0.26,
        0,
      );
      this.monsterRig.root.rotation.set(0, 0, -steer * 0.18 + stride * 0.06);
      const loomScale = this.loomTimer > 0 ? 1.42 : 1.0;
      this.monsterRig.root.scale.setScalar(
        THREE.MathUtils.damp(this.monsterRig.root.scale.x, loomScale, 12, dt),
      );
    } else if (this.stolenVehicleGroup) {
      this.stolenVehicleGroup.position.set(this.playerX, leapY, 0);
      this.stolenVehicleGroup.rotation.z = this.bikeLean * 0.28;
      this.stolenVehicleGroup.rotation.y = 0;
    }

    // Cosmetic Out of Lines Neon Trail
    if (this.save.equipped.cosmetics.includes('out_of_lines_aura')) {
      this.neonTrailTimer -= dt;
      if (this.neonTrailTimer <= 0) {
        this.neonTrailTimer = 0.055;
        const colors = ['#FF5412', '#8CFF2E', '#67E8F9', '#FF2A54'];
        _v1.set(this.playerX, 0.35, 1.4);
        this.spawnSparkBurst(_v1, colors[Math.floor(this.elapsed * 7) % colors.length], 1);
      }
    }

    this.animateMonsterDetails(dt, Math.min(1, this.playerSpeed / 50));
    soundEngine.updateEngine(
      Math.min(1, this.playerSpeed / Math.max(1, this.stats.topSpeed)),
      this.controlMode === 'on_foot',
      this.nitroActive,
      this.controlMode,
      throttle,
    );

    // Step Highway Traffic & Captive Containment Truck
    this.stepTrafficAndCaptive(dt);

    // Advance only the active front announcement in the FIFO queue (~1s each)
    if (this.callouts.length > 0) {
      this.callouts[0].age += dt;
      if (this.callouts[0].age >= CALLOUT_DURATION) {
        this.callouts.shift();
        this.hudThrottle = 0.065;
      }
    }

    this.hudThrottle += dt;
    if (this.hudThrottle >= 0.065) {
      this.hudThrottle = 0;
      this.emitHud();
    }
  }

  private stepTrafficAndCaptive(dt: number): void {
    // Count live non-wrecking cars currently ahead in the visible highway chase zone
    let aheadVisibleCount = 0;
    for (const v of this.vehicles) {
      if (v.active && !v.wrecking && v.z < 4 && v.z > -105) {
        aheadVisibleCount++;
      }
    }

    const inOpening = this.runElapsed < 30;
    const maxTraffic = inOpening ? 20 : 18;
    const minAheadVisible = inOpening ? 4 : 3;

    // Keep the highway steadily populated with civilian targets ahead to scare & weave around
    this.vehicleSpawnTimer -= dt;
    if (this.vehicles.length < maxTraffic && (this.vehicleSpawnTimer <= 0 || aheadVisibleCount < minAheadVisible)) {
      const zSpawn =
        aheadVisibleCount < minAheadVisible
          ? -74 - Math.random() * 28
          : -105 - Math.random() * 34;
      const spawned = this.spawnHumanVehicle(zSpawn, inOpening && Math.random() < 0.65);
      if (spawned) {
        this.vehicleSpawnTimer = inOpening
          ? 0.42 + Math.random() * 0.28
          : 0.52 + Math.random() * 0.34;
      } else {
        this.vehicleSpawnTimer = 0.16;
      }
    }

    // Spawn Captive Containment Truck periodically if locked monsters remain
    if (!this.captiveTruck) {
      this.captiveSpawnTimer -= dt;
      if (this.captiveSpawnTimer <= 0) {
        this.spawnCaptiveTruck();
        this.captiveSpawnTimer = 22;
      }
    }

    let bestHijack: HighwayVehicle | null = null;
    let bestHijackDist = Infinity;
    let exposedToSpotlight = false;

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (!v.active) {
        this.vehicles.splice(i, 1);
        continue;
      }

      if (v.wrecking) {
        v.wreckTimer -= dt;
        v.z += (this.playerSpeed - v.speed * 0.25) * dt;
        v.x += v.driftVx * dt;
        v.group.position.set(v.x, Math.max(0, Math.sin(v.wreckTimer * 6) * 0.9), v.z);
        v.group.rotation.y += v.spinVel * dt;
        v.group.rotation.z += v.spinVel * 0.4 * dt;
        if (v.wreckTimer <= 0 || v.z > 32) {
          this.trafficRoot.remove(v.group);
          this.vehicles.splice(i, 1);
        }
        continue;
      }

      // Relative movement along highway (positive z moves behind player)
      const relSpeed = this.playerSpeed - v.speed;
      v.z += relSpeed * dt;
      v.x = THREE.MathUtils.clamp(v.x + v.driftVx * dt, -ROAD_HALF_WIDTH + 1.1, ROAD_HALF_WIDTH - 1.1);
      v.driftVx = THREE.MathUtils.damp(v.driftVx, 0, 3.5, dt);

      // Subtle panicked swerving when Panic > 30%
      if (v.panic > 30) {
        v.group.rotation.y = Math.sin(this.elapsed * 14 + v.id) * 0.14;
      } else {
        v.group.rotation.y = 0;
      }
      v.group.position.set(v.x, 0, v.z);

      // Update floating Panic Bar
      if (v.panic > 0) {
        v.panicBarBg.visible = true;
        v.panicBarFill.visible = true;
        const frac = THREE.MathUtils.clamp(v.panic / 100, 0.05, 1);
        v.panicBarFill.scale.x = frac;
        v.panicBarFill.position.x = -(1 - frac) * 1.04;
      }

      // Check hijack proximity (~25m ahead through ~9m passing alongside)
      const dx = Math.abs(v.x - this.playerX);
      const dz = Math.abs(v.z);
      const dist = Math.hypot(dx, dz);
      v.hijackRing.visible = false;
      if (this.isVehicleHijackable(v) && dist < bestHijackDist) {
        bestHijackDist = dist;
        bestHijack = v;
      }

      // Skeptic Patrol Van Spotlight check!
      if (v.kind === 'van' && v.shieldActive && v.z > -1.5 && v.z < 12 && dx < 3.6) {
        exposedToSpotlight = true;
      }

      // Collision check with player
      const hitW = v.kind === 'bike' ? 1.15 : 1.75;
      const hitL = v.kind === 'bike' ? 1.9 : 3.2;
      if (dx < hitW && dz < hitL && this.leapAnimTimer <= 0.05) {
        if ((this.nitroActive || this.controlMode === 'stolen_van') && this.controlMode !== 'on_foot') {
          // Smash straight through into an instant wreck!
          this.wreckVehicle(v, 1.25);
        } else {
          this.takeDamage(1, v.kind === 'bike' ? 'BIKER CLIP' : 'HIGHWAY BUMPER');
          v.driftVx = v.x >= this.playerX ? 7 : -7;
          this.playerVx = v.x >= this.playerX ? -8 : 8;
        }
      }

      // Despawn cleanly once behind camera or far beyond horizon
      if (v.z > 22 || v.z < -195) {
        this.trafficRoot.remove(v.group);
        this.vehicles.splice(i, 1);
      }
    }

    this.hijackTarget = bestHijack;
    if (bestHijack) {
      bestHijack.hijackRing.visible = true;
      bestHijack.hijackRing.rotation.z += dt * 3;
    }

    // Spotlight danger (extra punishing when vulnerable on foot!)
    this.inSpotlightWarning = exposedToSpotlight;
    if (exposedToSpotlight && !this.stats.immuneToFlash) {
      this.spotlightExposure += dt * (this.controlMode === 'on_foot' ? 1.9 : 0.75);
      if (this.spotlightExposure >= 0.85) {
        this.spotlightExposure = 0;
        this.takeDamage(1, 'SKEPTIC SPOTLIGHT');
      }
    } else {
      this.spotlightExposure = Math.max(0, this.spotlightExposure - dt * 1.4);
    }

    // Update Captive Containment Truck!
    if (this.captiveTruck) {
      const truck = this.captiveTruck;
      // Keep truck hovering around playable range (-65..+14) while active so player can catch & battle it!
      let truckSpeed = truck.speed;
      if (!truck.freed) {
        if (truck.z < -26) truckSpeed = Math.max(16, this.playerSpeed - 12);
        else if (truck.z > -8) truckSpeed = Math.min(this.playerSpeed + 6, this.stats.topSpeed * 0.92);
        else truckSpeed = this.playerSpeed * 0.94;
      } else {
        truckSpeed = 12;
        truck.freedTimer -= dt;
        // Rescued monster leaps upward & cheers!
        truck.captiveSilhouette.position.y += dt * 5.2;
        truck.captiveSilhouette.rotation.y += dt * 8;
      }

      truck.z += (this.playerSpeed - truckSpeed) * dt;
      truck.group.position.set(truck.x, 0, truck.z);

      // Flash strobes
      const flash = Math.sin(this.elapsed * 18) > 0;
      (truck.strobeL.material as THREE.MeshBasicMaterial).color.setHex(flash ? 0xff5412 : 0x222836);
      (truck.strobeR.material as THREE.MeshBasicMaterial).color.setHex(flash ? 0x222836 : 0x8cff2e);

      // Update Cage HP bar
      const hpFrac = THREE.MathUtils.clamp(truck.hp / truck.maxHp, 0.02, 1);
      truck.hpBarFill.scale.x = hpFrac;
      truck.hpBarFill.position.x = -(1 - hpFrac) * 1.52;

      const nearTruck = this.isCaptiveTruckInRange(truck);
      truck.hijackRing.visible = nearTruck;
      if (nearTruck) truck.hijackRing.rotation.z += dt * 3;

      // Solid bumper collision with truck body (avoid getting stuck inside)
      if (!truck.freed && Math.abs(truck.x - this.playerX) < 2.2 && Math.abs(truck.z) < 4.8 && this.leapAnimTimer <= 0.05) {
        this.playerX += this.playerX >= truck.x ? 1.5 : -1.5;
        this.takeDamage(1, 'ARMORED TRUCK');
      }

      if ((truck.freed && truck.freedTimer <= 0) || truck.z > 42) {
        this.trafficRoot.remove(truck.group);
        this.captiveTruck = null;
        this.captiveSpawnTimer = 20;
      }
    }
  }

  private animateMonsterDetails(dt: number, speedNorm: number): void {
    if (!this.monsterRig) return;
    for (let i = 0; i < this.monsterRig.wings.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.monsterRig.wings[i].rotation.y =
        side * (0.28 + Math.sin(this.elapsed * (6 + speedNorm * 9)) * 0.25);
    }
    if (this.monsterRig.cape) {
      this.monsterRig.cape.rotation.x =
        0.4 + speedNorm * 0.7 + Math.sin(this.elapsed * 14) * 0.14;
    }
    if (this.monsterRig.eyeballOrbit) {
      this.monsterRig.eyeballOrbit.rotation.y += dt * 2.4;
    }
  }

  private spawnShockwave(
    pos: THREE.Vector3,
    maxScale: number,
    hexColor: string,
    isCone: boolean,
    maxAge: number,
  ): void {
    const slot = this.shockwaves.find((s) => !s.active && s.isCone === isCone);
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.maxScale = maxScale;
    slot.mesh.position.set(pos.x, 0.32, pos.z);
    slot.mesh.scale.setScalar(1);
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(hexColor);
    mat.opacity = isCone ? 0.48 : 0.92;
    slot.mesh.visible = true;
  }

  private spawnSparkBurst(pos: THREE.Vector3, hexColor: string, count: number): void {
    let spawned = 0;
    for (const sp of this.sparks) {
      if (sp.active) continue;
      sp.active = true;
      sp.age = 0;
      sp.maxAge = 0.45 + Math.random() * 0.35;
      sp.mesh.position.set(pos.x, pos.y + Math.random() * 0.7, pos.z);
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 9;
      sp.vel.set(Math.cos(ang) * spd, 4 + Math.random() * 6, Math.sin(ang) * spd + 8);
      (sp.mesh.material as THREE.MeshBasicMaterial).color.set(hexColor);
      sp.mesh.scale.setScalar(0.8 + Math.random() * 0.8);
      sp.mesh.visible = true;
      spawned++;
      if (spawned >= count) break;
    }
  }

  private stepVfx(dt: number): void {
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;
      sw.age += dt;
      const t = Math.min(1, sw.age / sw.maxAge);
      const ease = 1 - Math.pow(1 - t, 3);
      sw.mesh.scale.setScalar(1 + ease * (sw.maxScale - 1));
      const mat = sw.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (sw.isCone ? 0.45 : 0.92) * (1 - t);
      if (sw.age >= sw.maxAge) {
        sw.active = false;
        sw.mesh.visible = false;
      }
    }

    for (const sp of this.sparks) {
      if (!sp.active) continue;
      sp.age += dt;
      sp.vel.y -= 15 * dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      sp.mesh.rotation.x += dt * 7;
      sp.mesh.rotation.y += dt * 5;
      const t = Math.min(1, sp.age / sp.maxAge);
      sp.mesh.scale.setScalar(Math.max(0.01, 1 - t));
      if (sp.age >= sp.maxAge) {
        sp.active = false;
        sp.mesh.visible = false;
      }
    }
  }

  private updateChaseCamera(dt: number): void {
    const isFoot = this.controlMode === 'on_foot';
    const zBack = this.nitroActive ? 6.6 : isFoot ? 5.1 : 5.7;
    const height = isFoot ? 2.05 : 2.25;

    _camGoal.set(this.playerX * 0.88, height, zBack);
    _camLookGoal.set(this.playerX * 0.92, 1.85, -24);

    if (this.shakeIntensity > 0.01) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.5);
      _camGoal.x += (Math.random() - 0.5) * this.shakeIntensity * 0.9;
      _camGoal.y += (Math.random() - 0.5) * this.shakeIntensity * 0.65;
    }

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camGoal.x, 7.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camGoal.y, 7.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camGoal.z, 7.5, dt);

    _camLookCurr.x = THREE.MathUtils.damp(_camLookCurr.x, _camLookGoal.x, 9, dt);
    _camLookCurr.y = THREE.MathUtils.damp(_camLookCurr.y, _camLookGoal.y, 9, dt);
    _camLookCurr.z = THREE.MathUtils.damp(_camLookCurr.z, _camLookGoal.z, 9, dt);
    this.camera.lookAt(_camLookCurr);

    const targetFov = this.nitroActive ? 70 : isFoot ? 55 : 60;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private pushCallout(
    text: string,
    subtext: string | undefined,
    color: string,
    _xPct: number,
    _yPct: number,
  ): void {
    const tail = this.callouts[this.callouts.length - 1];
    if (tail && tail.text === text && tail.subtext === subtext) return;

    this.callouts.push({
      id: this.nextCalloutId++,
      text,
      subtext,
      color,
      xPct: 50,
      yPct: 38,
      age: 0,
    });
    // Keep queue fresh without cutting off the currently showing announcement
    if (this.callouts.length > CALLOUT_MAX_QUEUE) {
      this.callouts.splice(1, 1);
    }
    if (this.callouts.length === 1) {
      this.hudThrottle = 0.065;
    }
  }

  private setToast(msg: string, duration = 2.4): void {
    this.statusToast = msg;
    this.statusToastTimer = duration;
  }

  private getVehicleLabel(): string {
    switch (this.controlMode) {
      case 'own_bike':
        return getBike(this.save.equipped.bike).name;
      case 'stolen_sedan':
        return 'Stolen Sedan';
      case 'stolen_muscle':
        return 'Stolen Muscle Car';
      case 'stolen_van':
        return 'Stolen Skeptic Van';
      case 'stolen_bike':
        return 'Stolen Streetbike';
      case 'on_foot':
        return 'On Foot · Vulnerable';
    }
  }

  private emitHud(): void {
    const rider = getRider(this.save.equipped.rider);
    const scareSlots: ScareSlotState[] = SCARE_MECHANICS.map((m) => {
      const level = this.save.scareLevels[m.id] ?? 0;
      const cd = this.scareCooldowns[m.id] ?? 0;
      const maxCd = Math.max(0.2, m.cooldown * this.stats.scareCooldownMult);
      return {
        id: m.id,
        hotkey: m.hotkey,
        name: m.name,
        category: m.category,
        level,
        readyFrac: level <= 0 ? 0 : THREE.MathUtils.clamp(1 - cd / maxCd, 0, 1),
        color: m.color,
        selected: this.selectedScare === m.id,
      };
    });

    const sigMax = Math.max(0.5, rider.signatureCooldown * this.stats.scareCooldownMult);

    let captiveInfo: CaptiveHudInfo | null = null;
    if (this.captiveTruck && !this.captiveTruck.freed) {
      captiveInfo = {
        riderId: this.captiveTruck.rider.id,
        riderName: this.captiveTruck.rider.name,
        poolNumber: this.captiveTruck.rider.poolNumber,
        hpFrac: THREE.MathUtils.clamp(this.captiveTruck.hp / this.captiveTruck.maxHp, 0, 1),
        distanceAhead: Math.round(-this.captiveTruck.z),
        canLeapToBreak: this.isCaptiveTruckInRange(this.captiveTruck),
      };
    }

    const hijackTargetLabel = this.hijackTarget
      ? this.hijackTarget.kind === 'van'
        ? 'Hijack Patrol Van'
        : this.hijackTarget.kind === 'muscle'
          ? 'Hijack Muscle Car'
          : this.hijackTarget.kind === 'bike'
            ? 'Hijack Bike'
            : 'Hijack Sedan'
      : null;

    this.callbacks.onHudUpdate({
      dreadThisRun: this.dreadThisRun,
      bankDread: this.save.dread + this.dreadThisRun,
      wreckedCount: this.wreckedCount,
      hijackedCount: this.hijackedCount,
      propsTriggered: this.propsTriggered,
      distanceMiles: Number((this.distanceMeters / 1609).toFixed(2)),
      combo: this.combo,
      bestCombo: this.bestCombo,
      comboTimerFrac:
        this.combo > 0 ? THREE.MathUtils.clamp(this.comboTimer / this.stats.comboWindow, 0, 1) : 0,
      hp: this.hp,
      maxHp: this.maxHp,
      mph: Math.round(this.playerSpeed * 2.15),
      nitroFrac: this.nitroFrac,
      nitroActive: this.nitroActive,
      controlMode: this.controlMode,
      vehicleLabel: this.getVehicleLabel(),
      hijackTargetLabel,
      inDarkness: this.darknessTimer > 0,
      inSpotlightWarning: this.inSpotlightWarning,
      captiveTruck: captiveInfo,
      rescuedThisRun: [...this.rescuedThisRun],
      signatureName: rider.signatureName,
      signatureReadyFrac: THREE.MathUtils.clamp(1 - this.signatureCooldown / sigMax, 0, 1),
      signatureColor: rider.signatureColor,
      scareSlots,
      statusToast: this.statusToast,
      callouts: this.callouts.length > 0 ? [{ ...this.callouts[0] }] : [],
    });
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (
      this.screen === 'PLAYING' &&
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
    ) {
      e.preventDefault();
    }
    if (!this.held.has(e.code)) {
      this.justPressed.add(e.code);
    }
    this.held.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private handleBlur = (): void => {
    this.held.clear();
    this.justPressed.clear();
    this.clearTouchInputs();
  };

  private handleCanvasPointerDown = (e: PointerEvent): void => {
    if (this.screen !== 'PLAYING') return;
    if (e.target !== this.renderer.domElement) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.dragPointerId = e.pointerId;
    this.dragSteerActive = true;
    this.dragStartX = e.clientX;
    this.dragPlayerStartX = this.playerX;
    this.dragTargetX = this.playerX;
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors on synthetic events
    }
  };

  private handleCanvasPointerMove = (e: PointerEvent): void => {
    if (!this.dragSteerActive || e.pointerId !== this.dragPointerId) return;
    if (this.screen !== 'PLAYING') {
      this.dragSteerActive = false;
      this.dragPointerId = null;
      return;
    }

    const viewportW = Math.max(260, this.container.clientWidth || window.innerWidth);
    const roadSpan = (ROAD_HALF_WIDTH - 0.85) * 2;
    const dxPx = e.clientX - this.dragStartX;
    const sensitivity = roadSpan / (viewportW * 0.65);
    this.dragTargetX = THREE.MathUtils.clamp(
      this.dragPlayerStartX + dxPx * sensitivity,
      -ROAD_HALF_WIDTH + 0.85,
      ROAD_HALF_WIDTH - 0.85,
    );
  };

  private handleCanvasPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragPointerId) return;
    this.dragSteerActive = false;
    this.dragPointerId = null;
    try {
      if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    soundEngine.stopEngine();

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handleCanvasPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handleCanvasPointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    for (const d of this.world.disposables) d.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
