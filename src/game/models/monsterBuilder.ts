import * as THREE from 'three';
import { getRider } from '../catalog';
import { getExactMonsterStandeeTexture, getRider3DRenderTexture } from '../cutoutTextures';
import { EquippedLoadout, RiderDef } from '../types';

export interface MonsterRig {
  root: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  wings: THREE.Group[];
  cape: THREE.Mesh | null;
  eyeballOrbit: THREE.Group | null;
  contactShadow: THREE.Mesh;
}

export function buildMonsterRig(loadout: EquippedLoadout): MonsterRig {
  const rider = getRider(loadout.rider);
  return buildMonsterFromRiderDef(rider, loadout.cosmetics);
}

/**
 * Builds the Monster Cutout Rig used when:
 * 1) Leaping On Foot onto the highway (clean rear-chase 3D render facing forward!)
 * 2) Riding atop a Hijacked Human Car, Patrol Van, or Streetbike
 * 3) Trapped inside an Armored Captive Containment Truck (shows the exact coloring-book card behind bars!)
 */
export function buildMonsterFromRiderDef(
  rider: RiderDef,
  cosmetics: string[] = [],
  mode: 'on_foot' | 'captive' | 'hijack_bust' = 'on_foot',
): MonsterRig {
  const root = new THREE.Group();
  const torsoGroup = new THREE.Group();
  const headGroup = new THREE.Group();
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  root.add(torsoGroup);
  torsoGroup.add(headGroup, armL, armR, legL, legR);

  let texture: THREE.CanvasTexture;
  let aspect: number;
  let cardH: number;

  if (mode === 'captive') {
    // Inside the Captive Truck cage: show the exact coloring-book monster artwork & name!
    const exact = getExactMonsterStandeeTexture(rider, 'captive');
    texture = exact.texture;
    aspect = exact.aspect;
    cardH = 2.45;
  } else if (mode === 'hijack_bust') {
    // Head & upper shoulders only (zero handlebars/motorcycle) peeking from a hijacked car roof!
    const render = getRider3DRenderTexture(rider, 'head');
    texture = render.texture;
    aspect = render.aspect;
    cardH = 1.15;
  } else {
    // On foot: clean alpha-cutout 3D rear-chase monster facing forward!
    const render = getRider3DRenderTexture(rider, 'upper');
    texture = render.texture;
    aspect = render.aspect;
    cardH = 1.85;
  }
  const cardW = cardH * aspect;

  const cutoutMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(cardW, cardH),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.14,
      side: THREE.DoubleSide,
    }),
  );
  cutoutMesh.position.set(0, cardH * 0.5 + 0.08, 0);
  torsoGroup.add(cutoutMesh);

  // Ground contact shadow + amber vulnerability ring when running on foot!
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.min(1.15, cardW * 0.42), 20),
    new THREE.MeshBasicMaterial({
      color: 0x050609,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.03;

  if (mode === 'on_foot') {
    const dangerRing = new THREE.Mesh(
      new THREE.RingGeometry(cardW * 0.52, cardW * 0.64, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    dangerRing.position.z = 0.01;
    contactShadow.add(dangerRing);
  }
  root.add(contactShadow);

  // Cosmetic: Orbiting Cursed Eyeballs
  let eyeballOrbit: THREE.Group | null = null;
  if (cosmetics.includes('cursed_eyeballs')) {
    eyeballOrbit = new THREE.Group();
    eyeballOrbit.position.y = cardH * 0.88;
    const scleraMat = new THREE.MeshStandardMaterial({
      color: 0xf4efe6,
      emissive: 0x65a30d,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x8cff2e });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const eyeBall = new THREE.Group();
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), scleraMat);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), pupilMat);
      pupil.position.z = 0.12;
      eyeBall.add(sphere, pupil);
      eyeBall.position.set(
        Math.cos(a) * (cardW * 0.65),
        Math.sin(a * 2) * 0.18,
        Math.sin(a) * 0.8,
      );
      eyeballOrbit.add(eyeBall);
    }
    torsoGroup.add(eyeballOrbit);
  }

  return {
    root,
    torsoGroup,
    headGroup,
    armL,
    armR,
    legL,
    legR,
    wings: [],
    cape: null,
    eyeballOrbit,
    contactShadow,
  };
}
