import * as THREE from 'three';
import { RiderDef } from './types';

import skyImgUrl from '../assets/images/haunted_pine_sky_1795169939516.jpg';
import pinesImgUrl from '../assets/images/haunted_pines_cutout_1795169939588.jpg';
import muscleCarImgUrl from '../assets/images/muscle_car_straight_rear_1795177283510.jpg';
import patrolVanImgUrl from '../assets/images/patrol_van_rear_clean_1795177320803.jpg';
import streetbikeImgUrl from '../assets/images/streetbike_rear_clean_1795177320262.jpg';
import prisonTruckImgUrl from '../assets/images/prison_truck_straight_rear_1795177286470.jpg';

import bigfoot3dUrl from '../assets/images/bigfoot_3d_rear_1795171437480.jpg';
import mothman3dUrl from '../assets/images/mothman_3d_rear_1795171440384.jpg';
import banshee3dUrl from '../assets/images/banshee_3d_rear_1795171439959.jpg';
import paleRider3dUrl from '../assets/images/pale_rider_3d_rear_1795171438267.jpg';
import grimReaper3dUrl from '../assets/images/grim_reaper_3d_rear_1795171440080.jpg';
import nessie3dUrl from '../assets/images/nessie_3d_rear_1795171439107.jpg';
import cryptidChopper3dUrl from '../assets/images/cryptid_chopper_3d_rear_1795171438206.jpg';

export const HORROR_ASSETS = {
  sky: skyImgUrl,
  pines: pinesImgUrl,
  muscleCar: muscleCarImgUrl,
  patrolVan: patrolVanImgUrl,
  streetbike: streetbikeImgUrl,
  prisonTruck: prisonTruckImgUrl,
} as const;

export const RIDER_3D_ASSETS = {
  bigfoot: bigfoot3dUrl,
  mothman: mothman3dUrl,
  banshee: banshee3dUrl,
  pale_rider: paleRider3dUrl,
  grim_reaper: grimReaper3dUrl,
  nessie: nessie3dUrl,
  cryptid_chopper: cryptidChopper3dUrl,
} as const;

const loadedImages = new Map<string, Promise<HTMLImageElement>>();
const cutoutTextureCache = new Map<string, THREE.CanvasTexture>();
const opaqueTextureCache = new Map<string, THREE.CanvasTexture>();
const monsterStandeeCache = new Map<string, THREE.CanvasTexture>();

function loadImageCached(url: string): Promise<HTMLImageElement> {
  let promise = loadedImages.get(url);
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (/^https?:\/\//i.test(url) && !url.startsWith(window.location.origin)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = url;
    });
    loadedImages.set(url, promise);
  }
  return promise;
}

/**
 * Loads an opaque image into a fixed-size CanvasTexture (allocated up front so WebGL2
 * immutable texStorage2D always accepts the async upload cleanly).
 */
export function getOpaqueImageTexture(
  url: string,
  width = 1024,
  height = 512,
): THREE.CanvasTexture {
  const key = `${url}|${width}x${height}`;
  const cached = opaqueTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b0c15';
  ctx.fillRect(0, 0, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  opaqueTextureCache.set(key, tex);

  loadImageCached(url)
    .then((img) => {
      ctx.drawImage(img, 0, 0, width, height);
      tex.needsUpdate = true;
    })
    .catch(() => {
      // Keep dark sky fallback
    });

  return tex;
}

/**
 * Loads an isolated white-background dark horror illustration or 3D render and performs
 * an edge-connected BFS flood-fill alpha cutout so exterior white becomes cleanly transparent
 * while preserving all interior bright details (silver hair, chrome blades, glowing taillights).
 * Uses fixed canvas dimensions allocated before CanvasTexture creation so WebGL2 immutable
 * texStorage2D always uploads the finished cutout cleanly without GL_INVALID_VALUE errors.
 */
export function getCutoutSpriteTexture(
  url: string,
  options?: {
    tintHex?: number;
    tintStrength?: number;
    maxDim?: number;
    bgThreshold?: number;
    satThreshold?: number;
    cropTopFrac?: number;
  },
): THREE.CanvasTexture {
  const w = Math.min(768, Math.max(256, options?.maxDim ?? 512));
  const h = w;
  const key = `${url}|${w}x${h}|${options?.tintHex ?? 'none'}|${options?.tintStrength ?? 0}|${options?.bgThreshold ?? 168}|${options?.cropTopFrac ?? 1}`;
  const cached = cutoutTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cutoutTextureCache.set(key, tex);

  loadImageCached(url)
    .then((img) => {
      const cropFrac = options?.cropTopFrac ?? 1;
      const srcH = Math.max(16, Math.round(img.naturalHeight * cropFrac));
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, img.naturalWidth, srcH, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Edge-connected BFS flood-fill removing exterior white background cleanly
      const total = w * h;
      const visited = new Uint8Array(total);
      const queue = new Int32Array(total);
      let head = 0;
      let tail = 0;

      const bgLumMin = options?.bgThreshold ?? 168;
      const bgSatMax = options?.satThreshold ?? 34;

      const isExteriorBg = (idx: number): boolean => {
        const p = idx * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC - minC;
        const lum = (r * 3 + g * 4 + b) >> 3;
        return lum > bgLumMin && sat < bgSatMax;
      };

      const enqueue = (idx: number) => {
        if (visited[idx]) return;
        if (!isExteriorBg(idx)) return;
        visited[idx] = 1;
        queue[tail++] = idx;
      };

      for (let x = 0; x < w; x++) {
        enqueue(x);
        enqueue((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        enqueue(y * w);
        enqueue(y * w + (w - 1));
      }

      while (head < tail) {
        const cur = queue[head++];
        const x = cur % w;
        const y = (cur - x) / w;
        if (x > 0) enqueue(cur - 1);
        if (x < w - 1) enqueue(cur + 1);
        if (y > 0) enqueue(cur - w);
        if (y < h - 1) enqueue(cur + w);
      }

      for (let i = 0; i < total; i++) {
        if (visited[i]) {
          data[i * 4 + 3] = 0;
        }
      }

      // 2-pass halo de-fringe: pixels directly adjacent to transparent that are bright neutral
      const fringeLum = Math.min(bgLumMin - 18, 210);
      for (let pass = 0; pass < 2; pass++) {
        const toClear: number[] = [];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            const p = idx * 4;
            if (data[p + 3] === 0) continue;
            const lum = (data[p] * 3 + data[p + 1] * 4 + data[p + 2]) >> 3;
            const sat =
              Math.max(data[p], data[p + 1], data[p + 2]) -
              Math.min(data[p], data[p + 1], data[p + 2]);
            if (lum > fringeLum && sat < bgSatMax + 6) {
              if (
                data[(idx - 1) * 4 + 3] === 0 ||
                data[(idx + 1) * 4 + 3] === 0 ||
                data[(idx - w) * 4 + 3] === 0 ||
                data[(idx + w) * 4 + 3] === 0
              ) {
                toClear.push(idx);
              }
            }
          }
        }
        for (const idx of toClear) {
          data[idx * 4 + 3] = pass === 0 ? 0 : 75;
        }
      }

      // Optional atmospheric paint/fur tint (preserves glowing red taillights & bright eyes)
      if (options?.tintHex !== undefined && (options.tintStrength ?? 0) > 0) {
        const tr = (options.tintHex >> 16) & 255;
        const tg = (options.tintHex >> 8) & 255;
        const tb = options.tintHex & 255;
        const s = options.tintStrength ?? 0.25;
        for (let i = 0; i < total; i++) {
          const p = i * 4;
          if (data[p + 3] === 0) continue;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          // Don't tint bright glowing red taillights or yellow lightbars!
          if (r > 145 && r > g + 55) continue;
          if (r > 180 && g > 150 && b < 100) continue;
          data[p] = Math.round(r * (1 - s) + tr * s);
          data[p + 1] = Math.round(g * (1 - s) + tg * s);
          data[p + 2] = Math.round(b * (1 - s) + tb * s);
        }
      }

      // Soft bottom feather when cropped to upper body for on-foot/hijacked roof riding
      if (cropFrac < 0.99) {
        const fadeRows = Math.max(8, Math.round(h * 0.14));
        for (let y = h - fadeRows; y < h; y++) {
          const factor = Math.max(0, (h - 1 - y) / fadeRows);
          for (let x = 0; x < w; x++) {
            const p = (y * w + x) * 4;
            data[p + 3] = Math.round(data[p + 3] * factor);
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      tex.needsUpdate = true;
    })
    .catch(() => {
      // Leave fallback canvas empty without crashing
    });

  return tex;
}

/**
 * Selects the exact rear three-quarter chase-view 3D render derived from the user's
 * coloring-book artwork for the 6 flagship riders, and archetype-matched tinted 3D renders
 * for all other 45 rescuable monsters so EVERY rider faces forward down the highway!
 */
export function getRider3DRenderTexture(
  rider: RiderDef,
  variant: 'full' | 'upper' | 'head' = 'full',
): { texture: THREE.CanvasTexture; aspect: number; isWide: boolean } {
  let url: string;
  let isWide = false;
  let isBespoke = false;
  let bgThreshold = 222;
  let satThreshold = 24;

  if (rider.id === 'bigfoot') {
    url = RIDER_3D_ASSETS.bigfoot;
    isBespoke = true;
  } else if (rider.id === 'mothman') {
    url = RIDER_3D_ASSETS.mothman;
    isBespoke = true;
  } else if (rider.id === 'banshee') {
    url = RIDER_3D_ASSETS.banshee;
    isBespoke = true;
    bgThreshold = 230;
    satThreshold = 18;
  } else if (rider.id === 'pale_rider') {
    url = RIDER_3D_ASSETS.pale_rider;
    isWide = true;
    isBespoke = true;
    bgThreshold = 226;
  } else if (rider.id === 'grim_reaper') {
    url = RIDER_3D_ASSETS.grim_reaper;
    isBespoke = true;
    bgThreshold = 226;
  } else if (rider.id === 'nessie') {
    url = RIDER_3D_ASSETS.nessie;
    isWide = true;
    isBespoke = true;
  } else {
    // Archetype-matched 3D rear-chase render for the other 45 Pool monsters
    switch (rider.archetype) {
      case 'winged_moth':
      case 'avian_winged':
        url = RIDER_3D_ASSETS.mothman;
        break;
      case 'spectral_banshee':
      case 'witch_crone':
      case 'catrina_hat':
        url = RIDER_3D_ASSETS.banshee;
        bgThreshold = 230;
        satThreshold = 18;
        break;
      case 'skull_reaper':
      case 'headless_knight':
      case 'alien_hood':
      case 'nightcrawler':
        url = RIDER_3D_ASSETS.grim_reaper;
        bgThreshold = 226;
        break;
      case 'serpent_nessie':
      case 'frog_kappa':
      case 'catfish_namazu':
      case 'equine_kelpie':
        url = RIDER_3D_ASSETS.nessie;
        isWide = true;
        break;
      case 'ape_bigfoot':
      case 'cyclops_brute':
      case 'blemmyes_torso':
      case 'canine_beast':
      case 'fox_kitsune':
      case 'jackal_anubis':
        url = RIDER_3D_ASSETS.bigfoot;
        break;
      default:
        url = RIDER_3D_ASSETS.cryptid_chopper;
        break;
    }
  }

  const baseAspect = isWide ? 4 / 3 : 1;
  const cropTopFrac =
    variant === 'head'
      ? isWide
        ? 0.42
        : 0.33
      : variant === 'upper'
        ? isWide
          ? 0.68
          : 0.52
        : 1;
  const aspect = baseAspect / cropTopFrac;

  const tintHex = isBespoke ? undefined : new THREE.Color(rider.accentColor).getHex();
  const tintStrength = isBespoke ? 0 : 0.22;

  const texture = getCutoutSpriteTexture(url, {
    maxDim: 896,
    bgThreshold,
    satThreshold,
    tintHex,
    tintStrength,
    cropTopFrac,
  });

  return { texture, aspect, isWide };
}

/**
 * Generates a high-resolution, ragged torn-ink comic-panel die-cut standee texture
 * directly from the user's EXACT uploaded Out of Lines Press coloring-book artwork.
 * Never redraws or alters the monster — preserves 100% of the exact linework with
 * moody harvest-moon parchment contrast and a glowing signature aura border!
 */
export function getExactMonsterStandeeTexture(
  rider: RiderDef,
  mode: 'mounted' | 'on_foot' | 'captive',
): { texture: THREE.CanvasTexture; aspect: number } {
  const isWide = rider.collection === 'free';
  const aspect =
    mode === 'on_foot'
      ? isWide
        ? 1.12
        : 0.78
      : mode === 'captive'
        ? isWide
          ? 1.25
          : 0.72
        : isWide
          ? 1.55
          : 0.68;

  const key = `${rider.id}|${mode}`;
  const cached = monsterStandeeCache.get(key);
  if (cached) return { texture: cached, aspect };

  const cw = isWide ? 680 : 480;
  const ch = Math.round(cw / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;

  const drawPlaceholder = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#181422';
    ctx.fillRect(16, 16, cw - 32, ch - 32);
    ctx.strokeStyle = rider.accentColor;
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, cw - 32, ch - 32);
  };
  drawPlaceholder();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  monsterStandeeCache.set(key, tex);

  loadImageCached(rider.art.sheet)
    .then((img) => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, cw, ch);

      const pad = 22;
      const iw = cw - pad * 2;
      const ih = ch - pad * 2;

      // Build an organic hand-torn graphic-novel comic panel polygon path
      const buildTornPath = (inset: number) => {
        const left = pad + inset;
        const top = pad + inset;
        const right = cw - pad - inset;
        const bottom = ch - pad - inset;
        const pts: Array<[number, number]> = [];
        const stepsX = 14;
        const stepsY = 14;
        const seed = rider.id.split('').reduce((a, chCode) => a + chCode.charCodeAt(0), 0);

        const jitter = (n: number, amp: number) =>
          Math.sin(n * 12.9898 + seed * 4.1414) * amp;

        for (let i = 0; i <= stepsX; i++) {
          const t = i / stepsX;
          pts.push([left + (right - left) * t, top + jitter(i + 1, 5.5)]);
        }
        for (let i = 1; i <= stepsY; i++) {
          const t = i / stepsY;
          pts.push([right + jitter(i + 31, 5.5), top + (bottom - top) * t]);
        }
        for (let i = 1; i <= stepsX; i++) {
          const t = 1 - i / stepsX;
          pts.push([left + (right - left) * t, bottom + jitter(i + 61, 5.5)]);
        }
        for (let i = 1; i < stepsY; i++) {
          const t = 1 - i / stepsY;
          pts.push([left + jitter(i + 91, 5.5), top + (bottom - top) * t]);
        }

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
      };

      // 1. Subtle supernatural outer glow behind the torn ink edge
      ctx.save();
      ctx.shadowColor = mode === 'on_foot' ? '#ffd166' : rider.accentColor;
      ctx.shadowBlur = 18;
      buildTornPath(0);
      ctx.fillStyle = '#07080d';
      ctx.fill();
      ctx.restore();

      // 2. Clip inside torn ink border and draw the user's EXACT coloring-book art!
      ctx.save();
      buildTornPath(6);
      ctx.clip();

      // Moonlit aged parchment fill
      ctx.fillStyle = '#e7dcc4';
      ctx.fillRect(0, 0, cw, ch);

      // Compute clean source crop (trim bottom caption strip on Bigfoot!)
      let sx = rider.art.x;
      let sy = rider.art.y;
      let sw = rider.art.w;
      let sh = rider.art.h;
      if (rider.id === 'bigfoot') {
        sh = Math.round(sh * 0.905); // Cleanly removes the black caption bar below Bigfoot
      }
      if (mode === 'on_foot') {
        // Zoom slightly tighter onto the monster character itself when leaping on foot!
        const zx = sw * 0.12;
        const zy = sh * 0.04;
        sx += zx;
        sy += zy;
        sw -= zx * 2;
        sh -= sh * 0.22;
      }

      // Draw exact artwork with deep crisp comic ink contrast
      ctx.filter = 'contrast(1.18) brightness(0.95)';
      ctx.drawImage(img, sx, sy, sw, sh, pad + 4, pad + 4, iw - 8, ih - 8);
      ctx.filter = 'none';

      // Subtle harvest-moon warm parchment & dark-horror edge multiply glaze
      // (keeps 100% of linework crystal clear while harmonizing with the midnight forest!)
      ctx.globalCompositeOperation = 'multiply';
      const glaze = ctx.createRadialGradient(
        cw * 0.5,
        ch * 0.44,
        cw * 0.18,
        cw * 0.5,
        ch * 0.5,
        Math.max(cw, ch) * 0.65,
      );
      glaze.addColorStop(0, '#f4e7ce');
      glaze.addColorStop(0.72, '#d5c1a0');
      glaze.addColorStop(1, '#5c4b44');
      ctx.fillStyle = glaze;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'source-over';

      // Subtle inner ink vignette frame
      const vig = ctx.createRadialGradient(
        cw * 0.5,
        ch * 0.5,
        Math.min(cw, ch) * 0.34,
        cw * 0.5,
        ch * 0.5,
        Math.max(cw, ch) * 0.62,
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(7,8,14,0.52)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, cw, ch);

      // Subtle dark horror ink bottom strip with monster name on Captive Truck cage
      if (mode === 'captive') {
        ctx.fillStyle = 'rgba(10, 12, 18, 0.88)';
        ctx.fillRect(0, ch - 66, cw, 66);
        ctx.fillStyle = '#8cff2e';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rider.name.toUpperCase(), cw * 0.5, ch - 34);
      }

      ctx.restore();

      // 3. Crisp heavy black comic ink border + colored rim highlight around the torn silhouette
      buildTornPath(3);
      ctx.strokeStyle = '#07080d';
      ctx.lineWidth = 10;
      ctx.stroke();

      buildTornPath(1);
      ctx.strokeStyle = mode === 'on_foot' ? '#ffd166' : rider.accentColor;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      tex.needsUpdate = true;
    })
    .catch(() => {
      // Keep placeholder
    });

  return { texture: tex, aspect };
}
