import * as THREE from 'three';
import { RiderDef } from './types';

// Shared cached ink-outline material for crisp graphic-novel / coloring-book silhouettes
let cachedInkOutlineMat: THREE.MeshBasicMaterial | null = null;
export function getInkOutlineMaterial(): THREE.MeshBasicMaterial {
  if (!cachedInkOutlineMat) {
    cachedInkOutlineMat = new THREE.MeshBasicMaterial({
      color: 0x05060b,
      side: THREE.BackSide,
    });
  }
  return cachedInkOutlineMat;
}

/**
 * Adds a crisp graphic-novel BackSide ink outline shell to a mesh.
 */
export function addInkOutline(mesh: THREE.Mesh, thickness = 1.06): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, getInkOutlineMaterial());
  outline.scale.setScalar(thickness);
  outline.renderOrder = -1;
  mesh.add(outline);
  return outline;
}

let cachedCrosshatchTex: THREE.CanvasTexture | null = null;
export function getCrosshatchBumpTexture(): THREE.CanvasTexture {
  if (cachedCrosshatchTex) return cachedCrosshatchTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, 256, 256);

  // Hand-inked coloring book crosshatching & fur grit
  ctx.strokeStyle = 'rgba(20,20,25,0.45)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 120, 256);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  for (let i = -256; i < 512; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 256);
    ctx.lineTo(i + 90, 0);
    ctx.stroke();
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  cachedCrosshatchTex = tex;
  return tex;
}

let cachedLeatherTex: THREE.CanvasTexture | null = null;
export function getLeatherTexture(): THREE.CanvasTexture {
  if (cachedLeatherTex) return cachedLeatherTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#17151c';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle quilted biker leather grain & stitching
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  // Chrome studs at intersections
  ctx.fillStyle = '#9aa3b2';
  for (let y = 16; y < 256; y += 32) {
    for (let x = 16; x < 256; x += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cachedLeatherTex = tex;
  return tex;
}

const flameTankCache = new Map<string, THREE.CanvasTexture>();
export function getFlameTankTexture(baseColor: string): THREE.CanvasTexture {
  const existing = flameTankCache.get(baseColor);
  if (existing) return existing;

  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  // Rich metallic base gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, baseColor);
  grad.addColorStop(0.5, baseColor);
  grad.addColorStop(1, '#0d0f17');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Hot-rod Halloween flame licks along both sides
  const flameGrad = ctx.createLinearGradient(0, 60, 0, 210);
  flameGrad.addColorStop(0, '#fff3b0');
  flameGrad.addColorStop(0.45, '#ff7a29');
  flameGrad.addColorStop(1, '#d90429');
  ctx.fillStyle = flameGrad;
  ctx.strokeStyle = '#07080d';
  ctx.lineWidth = 5;

  for (const offsetY of [55, 195]) {
    ctx.beginPath();
    ctx.moveTo(0, offsetY);
    for (let x = 0; x <= 512; x += 64) {
      ctx.quadraticCurveTo(x + 24, offsetY - 42, x + 48, offsetY - 6);
      ctx.quadraticCurveTo(x + 56, offsetY + 18, x + 64, offsetY);
    }
    ctx.lineTo(512, offsetY + 26);
    ctx.lineTo(0, offsetY + 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Center chrome pinstripe + stylized Halloween skull emblem
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 118, 512, 20);
  ctx.fillStyle = '#090b12';
  ctx.fillRect(0, 123, 512, 10);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  flameTankCache.set(baseColor, tex);
  return tex;
}

let cachedHazardTex: THREE.CanvasTexture | null = null;
export function getHazardStripeTexture(): THREE.CanvasTexture {
  if (cachedHazardTex) return cachedHazardTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#12151f';
  for (let i = -256; i < 512; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 24, 0);
    ctx.lineTo(i - 104, 256);
    ctx.lineTo(i - 128, 256);
    ctx.closePath();
    ctx.fill();
  }

  // Grit & scratches
  for (let i = 0; i < 350; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  cachedHazardTex = tex;
  return tex;
}

let cachedSkyTex: THREE.CanvasTexture | null = null;
export function getMidnightSkyTexture(): THREE.CanvasTexture {
  if (cachedSkyTex) return cachedSkyTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Dramatic Midnight Halloween Gradient: Deep Cosmic Indigo -> Twilight Violet -> Glowing Pumpkin Horizon
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.0, '#070812');
  sky.addColorStop(0.28, '#13112b');
  sky.addColorStop(0.46, '#2a163d');
  sky.addColorStop(0.55, '#6e2336');
  sky.addColorStop(0.61, '#c84b1f');
  sky.addColorStop(0.66, '#ff7a29');
  sky.addColorStop(0.72, '#1d1428');
  sky.addColorStop(1.0, '#090a12');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  // Crisp stars in upper dome
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 230;
    const r = 0.6 + Math.random() * 1.4;
    ctx.fillStyle =
      i % 7 === 0
        ? 'rgba(255, 190, 120, 0.9)'
        : i % 11 === 0
          ? 'rgba(140, 255, 46, 0.7)'
          : 'rgba(244, 239, 230, 0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stylized graphic-novel ink-wash clouds across mid-sky
  for (let i = 0; i < 18; i++) {
    const cx = (i * 73) % 1024;
    const cy = 175 + ((i * 29) % 115);
    const rx = 55 + ((i * 19) % 80);
    const ry = 12 + ((i * 11) % 16);
    const cg = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
    cg.addColorStop(0, 'rgba(18, 12, 32, 0.78)');
    cg.addColorStop(0.65, 'rgba(72, 24, 52, 0.35)');
    cg.addColorStop(1, 'rgba(18, 12, 32, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant jagged haunted mountains + city skyline silhouette right on horizon!
  ctx.fillStyle = '#0c0b16';
  ctx.beginPath();
  ctx.moveTo(0, 345);
  for (let x = 0; x <= 1024; x += 16) {
    const peak =
      Math.sin(x * 0.025) * 18 +
      Math.cos(x * 0.07) * 10 +
      ((x % 64 === 0) ? -14 : 0);
    ctx.lineTo(x, 316 + peak);
  }
  ctx.lineTo(1024, 370);
  ctx.lineTo(0, 370);
  ctx.closePath();
  ctx.fill();

  // Distant orange & lime city lights twinkling along the horizon base
  for (let i = 0; i < 95; i++) {
    const x = Math.random() * 1024;
    const y = 324 + Math.random() * 18;
    ctx.fillStyle = i % 5 === 0 ? '#8cff2e' : i % 3 === 0 ? '#ff7a29' : '#ffd166';
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedSkyTex = tex;
  return tex;
}

let cachedMoonTex: THREE.CanvasTexture | null = null;
export function getHarvestMoonTexture(): THREE.CanvasTexture {
  if (cachedMoonTex) return cachedMoonTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const g = ctx.createRadialGradient(220, 210, 20, 256, 256, 260);
  g.addColorStop(0, '#fff7d6');
  g.addColorStop(0.55, '#ffd08a');
  g.addColorStop(0.85, '#ff8c38');
  g.addColorStop(1, '#c84b1f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  // Hand-inked moon craters
  const craters = [
    [150, 170, 52],
    [320, 140, 38],
    [260, 300, 66],
    [140, 330, 32],
    [370, 280, 44],
    [220, 110, 24],
    [310, 380, 30],
  ];
  for (const [x, y, r] of craters) {
    ctx.fillStyle = 'rgba(130, 52, 18, 0.28)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70, 22, 8, 0.35)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedMoonTex = tex;
  return tex;
}

let cachedJackOLanternTex: THREE.CanvasTexture | null = null;
export function getJackOLanternTexture(): THREE.CanvasTexture {
  if (cachedJackOLanternTex) return cachedJackOLanternTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#e85d12';
  ctx.fillRect(0, 0, 256, 128);

  // Vertical pumpkin ribs
  ctx.strokeStyle = 'rgba(40, 12, 4, 0.45)';
  ctx.lineWidth = 4;
  for (let x = 0; x < 256; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }

  // Glowing carved face
  ctx.fillStyle = '#fff59d';
  // Left & Right triangle eyes
  ctx.beginPath();
  ctx.moveTo(96, 56);
  ctx.lineTo(116, 36);
  ctx.lineTo(122, 58);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(160, 56);
  ctx.lineTo(140, 36);
  ctx.lineTo(134, 58);
  ctx.closePath();
  ctx.fill();

  // Jagged grin
  ctx.beginPath();
  ctx.moveTo(86, 78);
  ctx.lineTo(106, 92);
  ctx.lineTo(120, 82);
  ctx.lineTo(136, 94);
  ctx.lineTo(150, 82);
  ctx.lineTo(170, 78);
  ctx.lineTo(152, 104);
  ctx.lineTo(104, 104);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedJackOLanternTex = tex;
  return tex;
}

/**
 * Generates a high-contrast Wanted / Captive Containment side banner for the truck
 * and dynamically draws the rider's actual coloring-book artwork once loaded!
 */
export function createCaptiveBannerTexture(rider: RiderDef): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const drawFrame = (img?: HTMLImageElement) => {
    ctx.fillStyle = '#111521';
    ctx.fillRect(0, 0, 512, 256);

    // Hazard top & bottom bars
    ctx.fillStyle = '#ff5412';
    ctx.fillRect(0, 0, 512, 18);
    ctx.fillRect(0, 238, 512, 18);

    // Portrait frame on left
    ctx.fillStyle = '#f4efe6';
    ctx.fillRect(18, 30, 176, 196);
    if (img) {
      ctx.drawImage(
        img,
        rider.art.x,
        rider.art.y,
        rider.art.w,
        rider.art.h,
        22,
        34,
        168,
        188,
      );
    }
    ctx.strokeStyle = '#080a10';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 30, 176, 196);

    // Text on right
    ctx.fillStyle = '#ff7a29';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`CAPTIVE · ${rider.poolNumber.toUpperCase()}`, 212, 68);

    ctx.fillStyle = '#f4efe6';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(rider.name.toUpperCase().slice(0, 14), 212, 126);

    ctx.fillStyle = '#8cff2e';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('BREAK CAGE TO RESCUE!', 212, 172);

    ctx.fillStyle = '#9aa3b2';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('PRESS [F] OR SCARE BLAST', 212, 208);
  };

  drawFrame();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    drawFrame(img);
    tex.needsUpdate = true;
  };
  img.src = rider.art.sheet;

  return tex;
}
