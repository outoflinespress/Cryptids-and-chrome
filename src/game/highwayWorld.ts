import * as THREE from 'three';
import { getCutoutSpriteTexture, getOpaqueImageTexture, HORROR_ASSETS } from './cutoutTextures';
import { buildMonsterFromRiderDef } from './models/monsterBuilder';
import { RiderDef } from './types';

export type HumanVehicleKind = 'sedan' | 'muscle' | 'van' | 'bike' | 'police';

export interface HighwayVehicle {
  id: number;
  kind: HumanVehicleKind;
  group: THREE.Group;
  panicBarBg: THREE.Mesh;
  panicBarFill: THREE.Mesh;
  hijackRing: THREE.Mesh;
  shieldRing?: THREE.Mesh;
  spotlightCone?: THREE.Mesh;
  policeStrobeL?: THREE.Mesh;
  policeStrobeR?: THREE.Mesh;
  policeGlowPool?: THREE.Mesh;
  laneIndex: number; // 0..3
  x: number;
  z: number;
  speed: number;
  panic: number; // 0..100
  shieldActive: boolean;
  wrecking: boolean;
  wreckTimer: number;
  spinVel: number;
  driftVx: number;
  baseDread: number;
  active: boolean;
  isPolice?: boolean;
  pursuitTimer?: number;
  flankSide?: number;
  ramTimer?: number;
}

export interface CaptiveTruck {
  group: THREE.Group;
  cageBars: THREE.Group;
  captiveSilhouette: THREE.Group;
  strobeL: THREE.Mesh;
  strobeR: THREE.Mesh;
  hpBarFill: THREE.Mesh;
  hijackRing: THREE.Mesh;
  rider: RiderDef;
  x: number;
  z: number;
  speed: number;
  hp: number;
  maxHp: number;
  freed: boolean;
  freedTimer: number;
}

export interface RoadsideProp {
  kind: 'lamp' | 'barrel' | 'billboard';
  group: THREE.Group;
  effectMesh: THREE.Mesh;
  lampBulb?: THREE.Mesh;
  x: number;
  z: number;
  triggered: boolean;
  activeTimer: number;
}

export interface HighwayWorld {
  root: THREE.Group;
  roadMesh: THREE.Mesh;
  roadTexture: THREE.CanvasTexture;
  sceneryChunks: THREE.Group[];
  props: RoadsideProp[];
  moon: THREE.Mesh;
  laneXs: number[];
  roadHalfWidth: number;
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>;
}

export const LANE_XS = [-6.6, -2.2, 2.2, 6.6];
export const ROAD_HALF_WIDTH = 10.2;

function makeWetForestRoadTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Dark rain-slicked mountain highway asphalt
  ctx.fillStyle = '#12151f';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle tire grooves along all 4 lanes
  for (const cx of [84, 192, 320, 428]) {
    const g = ctx.createLinearGradient(cx - 34, 0, cx + 34, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(4,5,10,0.52)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 34, 0, 68, 512);
  }

  // Ink-grit weathering & subtle asphalt cracks
  ctx.strokeStyle = 'rgba(244, 239, 230, 0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 512; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - 40, 512);
    ctx.stroke();
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.24)';
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 3);
  }

  // Outer autumn-orange weathered shoulder lines
  ctx.fillStyle = '#d95b16';
  ctx.fillRect(24, 0, 9, 512);
  ctx.fillRect(479, 0, 9, 512);

  // Double amber center highway divider
  ctx.fillStyle = '#e69f17';
  ctx.fillRect(247, 0, 6, 512);
  ctx.fillRect(259, 0, 6, 512);

  // Weathered white dashed lane dividers + eerie lime reflector studs
  for (let y = 14; y < 512; y += 84) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(137, y, 6, 44);
    ctx.fillRect(369, y, 6, 44);
    ctx.fillStyle = '#8cff2e';
    ctx.fillRect(136, y + 58, 7, 7);
    ctx.fillRect(369, y + 58, 7, 7);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 22);
  map.anisotropy = maxAniso;

  // Wet rain-puddle roughness map
  const rc = document.createElement('canvas');
  rc.width = 256;
  rc.height = 256;
  const rctx = rc.getContext('2d')!;
  rctx.fillStyle = '#bdbdbd';
  rctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 18; i++) {
    const px = 26 + ((i * 53) % 204);
    const py = (i * 39) % 256;
    const rx = 18 + (i % 4) * 10;
    const ry = 28 + (i % 3) * 14;
    const pg = rctx.createRadialGradient(px, py, 2, px, py, ry);
    pg.addColorStop(0, '#1e1e1e');
    pg.addColorStop(0.65, '#464646');
    pg.addColorStop(1, 'rgba(189,189,189,0)');
    rctx.fillStyle = pg;
    rctx.beginPath();
    rctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    rctx.fill();
  }

  const roughnessMap = new THREE.CanvasTexture(rc);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(1, 22);
  roughnessMap.anisotropy = maxAniso;

  return { map, roughnessMap };
}

function makeBillboardTexture(label: string, accent: string, maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#161321');
  bg.addColorStop(1, '#090b12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.strokeStyle = '#efe4cf';
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, 468, 212);

  ctx.fillStyle = '#07080d';
  ctx.font = 'bold 50px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 260, 108);
  ctx.fillStyle = '#efe4cf';
  ctx.fillText(label, 256, 104);

  ctx.fillStyle = accent;
  ctx.font = 'bold 25px monospace';
  ctx.fillText('HALLOWEEN IS EVERY DAY', 256, 174);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function buildHighwayWorld(renderer: THREE.WebGLRenderer): HighwayWorld {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const root = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  // 1. Illustrated Dark Gritty Horror Haunted Pine Forest & Harvest Moon Panorama Backdrop!
  const skyTex = getOpaqueImageTexture(HORROR_ASSETS.sky, 1024, 512);
  skyTex.anisotropy = maxAniso;
  disposables.push(skyTex);

  // Curved wide panoramic canvas ahead of the highway so the giant harvest moon & pine mountains fill the sky!
  const backdropGeo = new THREE.CylinderGeometry(
    245,
    245,
    145,
    36,
    1,
    true,
    Math.PI * 0.62,
    Math.PI * 0.76,
  );
  // Flip UV horizontally so inner concave side reads cleanly
  backdropGeo.scale(-1, 1, 1);
  const backdropMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.FrontSide,
    fog: false,
    depthWrite: false,
  });
  const skyBackdrop = new THREE.Mesh(backdropGeo, backdropMat);
  skyBackdrop.position.set(0, 56, 20);
  root.add(skyBackdrop);
  disposables.push(backdropGeo, backdropMat);

  // Dummy moon reference for interface compatibility (the real illustrated harvest moon is on the panorama!)
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 4, 4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  root.add(moon);

  // 2. Dark Mossy Forest Floor extending far into horizon fog
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0b1015,
    roughness: 0.96,
    metalness: 0.04,
  });
  const groundGeo = new THREE.PlaneGeometry(460, 540);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -120);
  ground.receiveShadow = true;
  root.add(ground);
  disposables.push(groundGeo, groundMat);

  // 3. Wet Reflective 4-Lane Haunted Forest Highway Strip
  const { map: roadTexture, roughnessMap: roadRoughness } =
    makeWetForestRoadTextures(maxAniso);
  const roadGeo = new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 + 2.6, 420);
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTexture,
    roughnessMap: roadRoughness,
    roughness: 0.72,
    metalness: 0.28,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.set(0, 0.01, -110);
  roadMesh.receiveShadow = true;
  root.add(roadMesh);
  disposables.push(roadTexture, roadRoughness, roadGeo, roadMat);

  // 4. Scrolling Scenery Chunks with Layered 2.5D Illustrated Haunted Pine & Jack-o'-Lantern Cutouts!
  const sceneryChunks: THREE.Group[] = [];
  const props: RoadsideProp[] = [];

  const pinesTex = getCutoutSpriteTexture(HORROR_ASSETS.pines, { maxDim: 640 });
  const pinesMatNear = new THREE.MeshBasicMaterial({
    map: pinesTex,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
  });
  const pinesMatFar = new THREE.MeshBasicMaterial({
    map: pinesTex,
    color: 0x7c869c, // Slightly darker misty silhouette for depth layering!
    transparent: true,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
  });
  const pinePlaneGeo = new THREE.PlaneGeometry(14.5, 14.5);

  const railMat = new THREE.MeshStandardMaterial({
    color: 0x5c6778,
    metalness: 0.78,
    roughness: 0.32,
  });
  const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xff5a14 });
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x1e2330,
    metalness: 0.76,
    roughness: 0.34,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0xd9480f,
    roughness: 0.48,
    metalness: 0.2,
  });
  const barrelStripeMat = new THREE.MeshBasicMaterial({ color: 0xefe4cf });

  const bbTex1 = makeBillboardTexture('CRYPTIDS & CHROME', '#FF5412', maxAniso);
  const bbTex2 = makeBillboardTexture('OUT OF LINES PRESS', '#8CFF2E', maxAniso);
  const bbTex3 = makeBillboardTexture('ROUTE 666 · PINES', '#FF2A54', maxAniso);
  disposables.push(bbTex1, bbTex2, bbTex3, pinePlaneGeo, pinesMatNear, pinesMatFar);

  const bbMats = [
    new THREE.MeshBasicMaterial({ map: bbTex1 }),
    new THREE.MeshBasicMaterial({ map: bbTex2 }),
    new THREE.MeshBasicMaterial({ map: bbTex3 }),
  ];

  // Low rolling ground-mist strip material along the forest shoulders
  const mistMat = new THREE.MeshBasicMaterial({
    color: 0x3b445e,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mistGeo = new THREE.PlaneGeometry(24, 5.2);
  disposables.push(mistGeo, mistMat);

  for (let i = 0; i < 8; i++) {
    const chunk = new THREE.Group();
    const zPos = 40 - i * 40;
    chunk.position.z = zPos;

    for (const side of [-1, 1]) {
      // Weathered steel guardrails with amber reflectors
      const rx = side * (ROAD_HALF_WIDTH + 1.15);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 40), railMat);
      rail.position.set(rx, 0.68, 0);
      chunk.add(rail);

      for (let p = -15; p <= 15; p += 10) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.88, 0.2), poleMat);
        post.position.set(rx, 0.44, p);
        const refl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.26), reflectorMat);
        refl.position.set(rx - side * 0.13, 0.74, p);
        chunk.add(post, refl);
      }

      // FOREGROUND Illustrated Haunted Pine & Jack-o'-Lantern Cutouts right beside the highway!
      for (let t = 0; t < 2; t++) {
        const sc = 0.88 + ((i + t) % 3) * 0.2;
        const tree = new THREE.Mesh(pinePlaneGeo, pinesMatNear);
        const flip = (i + t + (side > 0 ? 1 : 0)) % 2 === 0 ? 1 : -1;
        tree.scale.set(flip * sc, sc, 1);
        tree.position.set(
          side * (ROAD_HALF_WIDTH + 7.2 + t * 2.2),
          6.8 * sc,
          -14 + t * 20,
        );
        tree.rotation.y = -side * 0.16;
        chunk.add(tree);
      }

      // MIDGROUND Misty Pine Forest Wall behind foreground trees for deep Pacific Northwest parallax!
      for (let t = 0; t < 2; t++) {
        const sc = 1.25 + ((i * 2 + t) % 3) * 0.22;
        const bgTree = new THREE.Mesh(pinePlaneGeo, pinesMatFar);
        const flip = (i + t) % 2 === 0 ? -1 : 1;
        bgTree.scale.set(flip * sc, sc, 1);
        bgTree.position.set(
          side * (ROAD_HALF_WIDTH + 16.5 + t * 5.5),
          8.6 * sc,
          -4 + t * 20,
        );
        chunk.add(bgTree);
      }

      // Subtle creeping forest fog ribbon near the tree roots
      const mist = new THREE.Mesh(mistGeo, mistMat);
      mist.position.set(side * (ROAD_HALF_WIDTH + 9.5), 1.8, 0);
      chunk.add(mist);
    }

    root.add(chunk);
    sceneryChunks.push(chunk);

    // Interactive Roadside Props:
    // 1. Moody Streetlamp with volumetric warm amber light cone
    const lampSide = i % 2 === 0 ? -1 : 1;
    const lampGroup = new THREE.Group();
    const lx = lampSide * (ROAD_HALF_WIDTH + 0.95);
    lampGroup.position.set(lx, 0, zPos - 8);
    const lPole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 8.6, 8), poleMat);
    lPole.position.y = 4.3;
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.16), poleMat);
    lArm.position.set(-lampSide * 1.35, 8.45, 0);
    const lBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd27d }),
    );
    lBulb.position.set(-lampSide * 2.65, 8.22, 0);

    const lampCone = new THREE.Mesh(
      new THREE.ConeGeometry(4.4, 8.4, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff9e3d,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    lampCone.position.set(-lampSide * 2.65, 4.1, 0);

    const sparkFX = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.14, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.92 }),
    );
    sparkFX.position.set(-lampSide * 2.65, 7.9, 0);
    sparkFX.rotation.x = Math.PI / 2;
    sparkFX.visible = false;
    lampGroup.add(lPole, lArm, lBulb, lampCone, sparkFX);
    root.add(lampGroup);
    props.push({
      kind: 'lamp',
      group: lampGroup,
      effectMesh: sparkFX,
      lampBulb: lBulb,
      x: lx,
      z: zPos - 8,
      triggered: false,
      activeTimer: 0,
    });

    // 2. Explosive Roadwork Barrel
    const barSide = -lampSide;
    const barGroup = new THREE.Group();
    const bx = barSide * (ROAD_HALF_WIDTH - 0.55);
    barGroup.position.set(bx, 0, zPos + 6);
    const barBody = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.48, 1.28, 10), barrelMat);
    barBody.position.y = 0.64;
    const barStripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.26, 10),
      barrelStripeMat,
    );
    barStripe.position.y = 0.78;
    const boomBall = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.3, 1),
      new THREE.MeshBasicMaterial({ color: 0xff5412, transparent: true, opacity: 0.88 }),
    );
    boomBall.position.y = 1.65;
    boomBall.visible = false;
    barGroup.add(barBody, barStripe, boomBall);
    root.add(barGroup);
    props.push({
      kind: 'barrel',
      group: barGroup,
      effectMesh: boomBall,
      x: bx,
      z: zPos + 6,
      triggered: false,
      activeTimer: 0,
    });

    // 3. Weathered Horror Highway Billboard every 3rd chunk
    if (i % 3 === 0) {
      const bbSide = i % 6 === 0 ? 1 : -1;
      const bbGroup = new THREE.Group();
      const bbx = bbSide * (ROAD_HALF_WIDTH + 4.8);
      bbGroup.position.set(bbx, 0, zPos - 20);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 6.2, 8), poleMat);
      leg.position.y = 3.1;
      const board = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.8, 0.32), [
        poleMat,
        poleMat,
        poleMat,
        poleMat,
        bbMats[i % bbMats.length],
        poleMat,
      ]);
      board.position.set(0, 6.8, 0);
      board.rotation.y = -bbSide * 0.26;
      const zapRing = new THREE.Mesh(
        new THREE.RingGeometry(3.0, 3.8, 22),
        new THREE.MeshBasicMaterial({
          color: 0x8cff2e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        }),
      );
      zapRing.position.set(0, 6.8, 0.35);
      zapRing.visible = false;
      bbGroup.add(leg, board, zapRing);
      root.add(bbGroup);
      props.push({
        kind: 'billboard',
        group: bbGroup,
        effectMesh: zapRing,
        x: bbx,
        z: zPos - 20,
        triggered: false,
        activeTimer: 0,
      });
    }
  }

  return {
    root,
    roadMesh,
    roadTexture,
    sceneryChunks,
    props,
    moon,
    laneXs: LANE_XS,
    roadHalfWidth: ROAD_HALF_WIDTH,
    disposables,
  };
}

// ================================================================
// BUILD DETAILED DARK GRITTY HORROR 2.5D ILLUSTRATED HUMAN VEHICLES
// ================================================================
export function buildHumanVehicleMesh(
  kind: HumanVehicleKind,
  colorHex: number,
): {
  group: THREE.Group;
  panicBarBg: THREE.Mesh;
  panicBarFill: THREE.Mesh;
  hijackRing: THREE.Mesh;
  shieldRing?: THREE.Mesh;
  spotlightCone?: THREE.Mesh;
  policeStrobeL?: THREE.Mesh;
  policeStrobeR?: THREE.Mesh;
  policeGlowPool?: THREE.Mesh;
} {
  const group = new THREE.Group();
  let shieldRing: THREE.Mesh | undefined;
  let spotlightCone: THREE.Mesh | undefined;
  let policeStrobeL: THREE.Mesh | undefined;
  let policeStrobeR: THREE.Mesh | undefined;
  let policeGlowPool: THREE.Mesh | undefined;

  let assetUrl: string = HORROR_ASSETS.muscleCar;
  let spriteW = 3.85;
  let spriteH = 2.88;
  let spriteY = spriteH * 0.42;
  let barY = 2.95;
  let tintHex: number | undefined;
  let tintStrength = 0;
  let bgThreshold = 212;

  if (kind === 'bike') {
    assetUrl = HORROR_ASSETS.streetbike;
    spriteW = 2.35;
    spriteH = 2.35;
    spriteY = spriteH * 0.47;
    barY = 2.65;
    bgThreshold = 216;
  } else if (kind === 'van') {
    assetUrl = HORROR_ASSETS.patrolVan;
    spriteW = 4.45;
    spriteH = 3.34;
    spriteY = spriteH * 0.47;
    barY = 3.7;
    bgThreshold = 218;
  } else if (kind === 'police') {
    // High-speed Highway Patrol Police Interceptor Cruiser
    assetUrl = HORROR_ASSETS.muscleCar;
    spriteW = 4.05;
    spriteH = 3.04;
    spriteY = spriteH * 0.42;
    barY = 3.35;
    tintHex = 0x0f172a;
    tintStrength = 0.24;
    bgThreshold = 212;
  } else if (kind === 'sedan') {
    assetUrl = HORROR_ASSETS.muscleCar;
    spriteW = 3.65;
    spriteH = 2.74;
    spriteY = spriteH * 0.42;
    barY = 2.85;
    tintHex = colorHex;
    tintStrength = 0.28;
    bgThreshold = 212;
  } else {
    // Straight-rear matte-black GHOST 70 muscle car
    assetUrl = HORROR_ASSETS.muscleCar;
    spriteW = 3.95;
    spriteH = 2.96;
    spriteY = spriteH * 0.42;
    barY = 3.05;
    bgThreshold = 212;
  }

  const tex = getCutoutSpriteTexture(assetUrl, {
    tintHex,
    tintStrength,
    maxDim: 640,
    bgThreshold,
    satThreshold: 26,
  });

  const vehicleSprite = new THREE.Mesh(
    new THREE.PlaneGeometry(spriteW, spriteH),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.12,
      side: THREE.DoubleSide,
    }),
  );
  vehicleSprite.position.set(0, spriteY, 0);
  group.add(vehicleSprite);

  // Ground contact shadow + subtle crimson taillight reflection pool on the wet road!
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(spriteW * 0.46, 20),
    new THREE.MeshBasicMaterial({
      color: 0x040508,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.0, 0.85, 1);
  shadow.position.y = 0.03;
  group.add(shadow);

  const tailGlowPool = new THREE.Mesh(
    new THREE.CircleGeometry(spriteW * 0.42, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff1e42,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  tailGlowPool.rotation.x = -Math.PI / 2;
  tailGlowPool.position.set(0, 0.04, 1.35);
  group.add(tailGlowPool);

  // Skeptic Patrol Van 3D Energy Shield Ring + Searchlight Warning Cone
  if (kind === 'van') {
    shieldRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.65, 0.12, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
    );
    shieldRing.rotation.x = Math.PI / 2;
    shieldRing.position.y = 1.2;
    group.add(shieldRing);

    const coneGeo = new THREE.CircleGeometry(11.0, 18, -0.35, 0.7);
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.rotateY(Math.PI / 2);
    spotlightCone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    spotlightCone.position.set(0, 0.14, -2.2);
    group.add(spotlightCone);
  }

  // Police Interceptor 3D Roof Lightbar, Flashing Red/Blue Strobes, Wet-Road Glow & POLICE Badge
  if (kind === 'police') {
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.16, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7, roughness: 0.3 }),
    );
    barBase.position.set(0, 1.98, 0.08);
    group.add(barBase);

    const redLens = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.22, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xff1e42 }),
    );
    redLens.position.set(-0.42, 2.08, 0.1);
    const blueLens = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.22, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x2563eb }),
    );
    blueLens.position.set(0.42, 2.08, 0.1);
    group.add(redLens, blueLens);

    policeStrobeL = new THREE.Mesh(
      new THREE.CircleGeometry(0.88, 18),
      new THREE.MeshBasicMaterial({
        color: 0xff1e42,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    policeStrobeL.position.set(-0.46, 2.1, 0.28);

    policeStrobeR = new THREE.Mesh(
      new THREE.CircleGeometry(0.88, 18),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    policeStrobeR.position.set(0.46, 2.1, 0.28);
    group.add(policeStrobeL, policeStrobeR);

    // Wide flashing Red/Blue reflection pool on the midnight wet highway!
    policeGlowPool = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff1e42,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    policeGlowPool.rotation.x = -Math.PI / 2;
    policeGlowPool.position.set(0, 0.05, 0.2);
    group.add(policeGlowPool);

    // Bold white & navy POLICE trunk stripe plate
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 256;
    plateCanvas.height = 64;
    const pg = plateCanvas.getContext('2d');
    if (pg) {
      pg.fillStyle = '#0f172a';
      pg.fillRect(0, 0, 256, 64);
      pg.strokeStyle = '#f8fafc';
      pg.lineWidth = 6;
      pg.strokeRect(4, 4, 248, 56);
      pg.fillStyle = '#f8fafc';
      pg.font = '900 40px "Big Shoulders Display", Impact, sans-serif';
      pg.textAlign = 'center';
      pg.textBaseline = 'middle';
      pg.fillText('POLICE', 128, 35);
    }
    const plateTex = new THREE.CanvasTexture(plateCanvas);
    plateTex.colorSpace = THREE.SRGBColorSpace;
    const policePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.36),
      new THREE.MeshBasicMaterial({ map: plateTex, side: THREE.DoubleSide }),
    );
    policePlate.position.set(0, 0.92, 0.14);
    group.add(policePlate);
  }

  // Floating 3D Panic Bar above vehicle
  const panicBarBg = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.32),
    new THREE.MeshBasicMaterial({ color: 0x0b0e16, side: THREE.DoubleSide }),
  );
  panicBarBg.position.set(0, barY, 0.08);
  panicBarBg.visible = false;

  const panicBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(2.26, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xff5412, side: THREE.DoubleSide }),
  );
  panicBarFill.position.set(0, barY, 0.1);
  panicBarFill.visible = false;

  // Hijack Target Ring around vehicle
  const hijackRing = new THREE.Mesh(
    new THREE.RingGeometry(kind === 'bike' ? 1.5 : 2.45, kind === 'bike' ? 1.85 : 2.85, 28),
    new THREE.MeshBasicMaterial({
      color: 0x8cff2e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  hijackRing.rotation.x = -Math.PI / 2;
  hijackRing.position.y = 0.09;
  hijackRing.visible = false;

  group.add(panicBarBg, panicBarFill, hijackRing);
  return {
    group,
    panicBarBg,
    panicBarFill,
    hijackRing,
    shieldRing,
    spotlightCone,
    policeStrobeL,
    policeStrobeR,
    policeGlowPool,
  };
}

// ================================================================
// BUILD MASSIVE ILLUSTRATED ARMORED CAPTIVE CONTAINMENT TRUCK
// (Displays Your EXACT Trapped Coloring-Book Monster Behind 3D Cage Bars!)
// ================================================================
export function buildCaptiveTruckMesh(rider: RiderDef): CaptiveTruck {
  const group = new THREE.Group();

  // 1. Detailed Dark Gritty Horror Armored Prison Semi-Truck Cutout (Dead-Straight Rear View!)
  const truckTex = getCutoutSpriteTexture(HORROR_ASSETS.prisonTruck, {
    maxDim: 768,
    bgThreshold: 215,
    satThreshold: 26,
  });
  const truckSprite = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 5.7),
    new THREE.MeshBasicMaterial({
      map: truckTex,
      transparent: true,
      alphaTest: 0.12,
      side: THREE.DoubleSide,
    }),
  );
  truckSprite.position.set(0, 2.8, 0);
  group.add(truckSprite);

  // Heavy grounded truck shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(3.8, 24),
    new THREE.MeshBasicMaterial({
      color: 0x040508,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.05, 1.35, 1);
  shadow.position.y = 0.03;
  group.add(shadow);

  // 2. Your EXACT Coloring-Book Monster trapped visibly inside the centered rear prison cage!
  const captiveSilhouette = new THREE.Group();
  captiveSilhouette.position.set(0, 1.62, 0.22);
  const captiveRig = buildMonsterFromRiderDef(rider, [], 'captive');
  captiveRig.root.scale.setScalar(0.92);
  captiveRig.contactShadow.visible = false;
  captiveSilhouette.add(captiveRig.root);
  group.add(captiveSilhouette);

  // 3. 3D Steel Cage Lock Bars overlaid centered in front of the trapped monster (burst apart when freed!)
  const cageBars = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({
    color: 0xd6dce5,
    emissive: 0xff5412,
    emissiveIntensity: 0.35,
    metalness: 0.9,
    roughness: 0.2,
  });
  const barGeo = new THREE.CylinderGeometry(0.055, 0.055, 2.55, 8);
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(i * 0.44, 2.75, 0.36);
    cageBars.add(bar);
  }
  const lockPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.68, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xff2a54 }),
  );
  lockPad.position.set(0, 2.7, 0.42);
  cageBars.add(lockPad);
  group.add(cageBars);

  // 4. Flashing Orange & Toxic-Green Roof Emergency Beacon Flares!
  const strobeL = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff5412,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  strobeL.position.set(-1.32, 4.92, 0.22);
  const strobeR = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({
      color: 0x8cff2e,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  strobeR.position.set(1.32, 4.92, 0.22);
  group.add(strobeL, strobeR);

  // 5. Floating Cage Lock HP Bar
  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 0.4),
    new THREE.MeshBasicMaterial({ color: 0x0b0e16, side: THREE.DoubleSide }),
  );
  hpBg.position.set(0, 5.85, 0.25);
  const hpBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(3.42, 0.26),
    new THREE.MeshBasicMaterial({ color: 0x8cff2e, side: THREE.DoubleSide }),
  );
  hpBarFill.position.set(0, 5.85, 0.28);
  group.add(hpBg, hpBarFill);

  // 6. Break-In Target Ring behind the cage
  const hijackRing = new THREE.Mesh(
    new THREE.RingGeometry(2.8, 3.35, 28),
    new THREE.MeshBasicMaterial({
      color: 0x8cff2e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  hijackRing.rotation.x = -Math.PI / 2;
  hijackRing.position.set(0, 0.12, 1.8);
  hijackRing.visible = false;
  group.add(hijackRing);

  return {
    group,
    cageBars,
    captiveSilhouette,
    strobeL,
    strobeR,
    hpBarFill,
    hijackRing,
    rider,
    x: 0,
    z: -110,
    speed: 24,
    hp: 100,
    maxHp: 100,
    freed: false,
    freedTimer: 0,
  };
}
