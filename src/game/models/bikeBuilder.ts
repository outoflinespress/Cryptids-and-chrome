import * as THREE from 'three';
import { getBike, getRider } from '../catalog';
import { getRider3DRenderTexture } from '../cutoutTextures';
import { EquippedLoadout } from '../types';

export interface BikeRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  steerGroup: THREE.Group;
  frontWheel: THREE.Group;
  rearWheels: THREE.Group[];
  exhaustFlames: THREE.Mesh[];
  headlightCone: THREE.Mesh;
  headlightGlow: THREE.Mesh;
  locatorBeacon: THREE.Group;
  seatAnchor: THREE.Vector3;
}

/**
 * Builds the Hero Dark-Horror 3D Rear-Chase Monster + Motorcycle Rig
 * generated directly from the user's Out of Lines Press coloring-book art.
 * Cleanly alpha-cutout with zero box/card border, facing forward down the highway,
 * paired with dynamic 3D volumetric headlights, roaring exhaust flames, neon underglow, and cosmetics.
 */
export function buildMotorcycleRig(loadout: EquippedLoadout): BikeRig {
  const bike = getBike(loadout.bike);
  const rider = getRider(loadout.rider);

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const steerGroup = new THREE.Group();
  const frontWheel = new THREE.Group();
  const rearWheels: THREE.Group[] = [];
  root.add(bodyGroup);
  bodyGroup.add(steerGroup);

  // 1. High-Detail Rear-Chase 3D Render of Your Monster + Motorcycle (Zero Rectangular Card!)
  const { texture, aspect, isWide } = getRider3DRenderTexture(rider, 'full');
  const renderH = isWide ? 2.85 : 3.25;
  const renderW = renderH * aspect;

  const riderGeo = new THREE.PlaneGeometry(renderW, renderH);
  const riderMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.14,
    side: THREE.DoubleSide,
  });
  const riderMesh = new THREE.Mesh(riderGeo, riderMat);
  // Rotate PI on Y so when bikeRig.root.rotation.y = PI (facing down -Z highway),
  // the rear-chase 3D monster faces directly away down the highway un-mirrored!
  riderMesh.position.set(0, renderH * 0.5 - 0.04, 0);
  riderMesh.rotation.y = Math.PI;
  bodyGroup.add(riderMesh);

  // 2. Ground Contact Shadow + Live Bike-Tier Neon Underglow Pool on Wet Asphalt!
  const underglowColor = bike.isDragster
    ? 0x38bdf8
    : bike.isSport
      ? 0xa855f7
      : bike.isTrike
        ? 0x8cff2e
        : bike.isChopper
          ? 0xff5412
          : new THREE.Color(rider.accentColor).getHex();

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(isWide ? 1.85 : 1.35, 24),
    new THREE.MeshBasicMaterial({
      color: 0x040508,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(1.0, 0.78, 1);
  contactShadow.position.y = 0.03;
  root.add(contactShadow);

  const neonGlowPool = new THREE.Mesh(
    new THREE.CircleGeometry(isWide ? 2.25 : 1.72, 24),
    new THREE.MeshBasicMaterial({
      color: underglowColor,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  neonGlowPool.rotation.x = -Math.PI / 2;
  neonGlowPool.scale.set(1.0, 0.9, 1);
  neonGlowPool.position.y = 0.04;
  root.add(neonGlowPool);

  // 3. Real 3D Volumetric Headlight Beam Shooting Forward Ahead of Your Monster!
  const hlId = loadout.parts.headlight;
  const hlColor =
    hlId === 'headlight_demon_halo'
      ? 0xff2a54
      : hlId === 'headlight_skull_grille'
        ? 0x8cff2e
        : hlId === 'headlight_cursed_beacon'
          ? 0x67e8f9
          : 0xffe49e;

  const headlightGlow = new THREE.Mesh(
    new THREE.CircleGeometry(hlId === 'headlight_cursed_beacon' ? 0.36 : 0.24, 16),
    new THREE.MeshBasicMaterial({
      color: hlColor,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  headlightGlow.position.set(0, 1.05, 0.42);
  steerGroup.add(headlightGlow);

  const coneLen = hlId === 'headlight_cursed_beacon' ? 19 : 14.5;
  const coneRad = hlId === 'headlight_cursed_beacon' ? 4.4 : 3.2;
  const coneGeo = new THREE.ConeGeometry(coneRad, coneLen, 18, 1, true);
  coneGeo.translate(0, -coneLen * 0.5, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const headlightCone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({
      color: hlColor,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  headlightCone.position.set(0, 0.95, 0.45);
  headlightCone.rotation.x = 0.08;
  steerGroup.add(headlightCone);

  // 4. Real 3D Roaring Exhaust Flame Plumes Positioned Right Behind the Chrome Pipes!
  const exhaustFlames: THREE.Mesh[] = [];
  const exhaustId = loadout.parts.exhaust;
  const flameColor =
    exhaustId === 'exhaust_ectoplasm'
      ? 0x8cff2e
      : exhaustId === 'exhaust_hellfire'
        ? 0xff3b12
        : 0xff9f1c;
  const flameMat = new THREE.MeshBasicMaterial({
    color: flameColor,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfff8cc,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const addFlame = (x: number, y: number, z: number, scale = 1) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.15 * scale, 1.25 * scale, 8),
      flameMat,
    );
    flame.rotation.x = -Math.PI / 2 + 0.12;
    flame.position.set(x, y, z);
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.08 * scale, 0.72 * scale, 6),
      flameCoreMat,
    );
    core.position.y = -0.16 * scale;
    flame.add(core);
    flame.visible = false;
    bodyGroup.add(flame);
    exhaustFlames.push(flame);
  };

  // Match twin rear exhaust positions on the rear-chase 3D motorcycle renders
  const pipeX = isWide ? 0.78 : 0.62;
  if (exhaustId === 'exhaust_stock') {
    addFlame(-pipeX, 0.78, -0.45, 0.85);
    addFlame(pipeX, 0.78, -0.45, 0.85);
  } else if (exhaustId === 'exhaust_twin_chrome') {
    addFlame(-pipeX, 0.8, -0.52, 1.05);
    addFlame(pipeX, 0.8, -0.52, 1.05);
  } else if (exhaustId === 'exhaust_hellfire') {
    addFlame(-pipeX, 0.86, -0.58, 1.22);
    addFlame(pipeX, 0.86, -0.58, 1.22);
    addFlame(-pipeX * 0.82, 0.56, -0.52, 0.9);
    addFlame(pipeX * 0.82, 0.56, -0.52, 0.9);
  } else {
    // Ectoplasm afterburners
    addFlame(-pipeX, 0.82, -0.64, 1.32);
    addFlame(pipeX, 0.82, -0.64, 1.32);
  }

  // 5. Glowing 3D Cosmetic FX Layered Around Your 3D Monster Render!
  if (loadout.cosmetics.includes('skull_sissy_bar')) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.05, 8, 22),
      new THREE.MeshBasicMaterial({
        color: 0xff5412,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.set(0, renderH + 0.1, -0.08);
    bodyGroup.add(halo);
  }

  if (loadout.cosmetics.includes('bull_horns')) {
    const hornMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.68, 7), hornMat);
      h.position.set(side * 1.05, renderH * 0.78, 0.06);
      h.rotation.z = -side * 0.95;
      bodyGroup.add(h);
    }
  }

  if (loadout.cosmetics.includes('shadow_cape')) {
    const auraWings = new THREE.Mesh(
      new THREE.CircleGeometry(renderW * 0.65, 24),
      new THREE.MeshBasicMaterial({
        color: 0x6b0f2a,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    auraWings.position.set(0, renderH * 0.56, -0.14);
    bodyGroup.add(auraWings);
  }

  // Parked Bike Locator Beacon (visible when player leaps on foot)
  const locatorBeacon = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.52, 9.5, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x8cff2e,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 4.75;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.9, 24),
    new THREE.MeshBasicMaterial({
      color: 0x8cff2e,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  locatorBeacon.add(beam, ring);
  locatorBeacon.visible = false;
  root.add(locatorBeacon);

  return {
    root,
    bodyGroup,
    steerGroup,
    frontWheel,
    rearWheels,
    exhaustFlames,
    headlightCone,
    headlightGlow,
    locatorBeacon,
    seatAnchor: new THREE.Vector3(0, 1.0, 0),
  };
}
