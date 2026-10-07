import * as THREE from 'three';
import { mulberry32 } from './util.js';

const cache = new Map();
function canvasTex(key, w, h, draw, { repeat = true, srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function noise(g, w, h, amt, seed = 1, alpha = 0.08) {
  const r = mulberry32(seed);
  for (let i = 0; i < amt; i++) {
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

export function carpetTex() {
  return canvasTex('carpet', 256, 256, (g, w, h) => {
    g.fillStyle = '#2b3442'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 9000, 3, 0.25);
    g.strokeStyle = 'rgba(120,150,190,0.08)'; g.lineWidth = 2;
    for (let i = 0; i < w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  });
}

export function tileTex() {
  return canvasTex('tile', 256, 256, (g, w, h) => {
    const r = mulberry32(9);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 200 + Math.floor(r() * 30);
      g.fillStyle = (x + y) % 2 ? `rgb(${v - 150},${v - 150},${v - 140})` : `rgb(${v},${v - 5},${v - 15})`;
      g.fillRect(x * 64, y * 64, 64, 64);
    }
    noise(g, w, h, 4000, 4, 0.15);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  });
}

export function concreteTex() {
  return canvasTex('concrete', 256, 256, (g, w, h) => {
    g.fillStyle = '#5a5b5e'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 12000, 5, 0.18);
    const r = mulberry32(6);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 * r()})`;
      g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 50, 0, Math.PI * 2); g.fill();
    }
  });
}

export function ceilingTex() {
  return canvasTex('ceiling', 256, 256, (g, w, h) => {
    g.fillStyle = '#bdb8ad'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 6000, 7, 0.2);
    g.strokeStyle = '#6d6a63'; g.lineWidth = 4;
    for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  });
}

const WALL_VARIANTS = [
  { paper: '#5d4a3a', stripe: '#6a5442', wains: '#2e1d12' },
  { paper: '#3d4a52', stripe: '#46545d', wains: '#1e2328' },
  { paper: '#5a3d44', stripe: '#674650', wains: '#2a1518' },
  { paper: '#4a4f3a', stripe: '#545a42', wains: '#22251a' },
];
export const WALL_PX = 32; // pixels per world unit
// Back wall texture for one floor: wallpaper, wainscot and see-through windows (alpha holes).
export function wallTex(variant, width, height, windows) {
  const key = `wall${variant}_${windows.join(',')}`;
  return canvasTex(key, Math.round(width * WALL_PX), Math.round(height * WALL_PX), (g, w, h) => {
    const v = WALL_VARIANTS[variant % WALL_VARIANTS.length];
    g.fillStyle = v.paper; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 24) { g.fillStyle = v.stripe; g.fillRect(x, 0, 8, h); }
    noise(g, w, h, 16000, 11 + variant, 0.12);
    const wainH = 1.0 * WALL_PX;
    g.fillStyle = v.wains; g.fillRect(0, h - wainH, w, wainH);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x < w; x += 64) g.fillRect(x + 6, h - wainH + 6, 52, wainH - 14);
    g.fillStyle = '#c9a66b'; g.fillRect(0, h - wainH - 4, w, 4); // chair rail
    g.fillStyle = '#111'; g.fillRect(0, h - 6, w, 6); // baseboard
    // windows: cleared rectangles with frame and mullions
    for (const cx of windows) {
      const px = (cx + width / 2) * WALL_PX;
      const ww = 2.6 * WALL_PX, wy0 = h - 3.35 * WALL_PX, wh = 2.15 * WALL_PX;
      g.fillStyle = '#15171a'; g.fillRect(px - ww / 2 - 6, wy0 - 6, ww + 12, wh + 12);
      g.clearRect(px - ww / 2, wy0, ww, wh);
      g.fillStyle = '#15171a';
      g.fillRect(px - 2, wy0, 4, wh);
      g.fillRect(px - ww / 2, wy0 + wh * 0.4, ww, 3);
    }
  }, { repeat: false });
}

export function garageWallTex(width, height) {
  return canvasTex('garagewall', Math.round(width * 16), Math.round(height * 16), (g, w, h) => {
    g.fillStyle = '#4b4c4f'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 20000, 21, 0.2);
    g.fillStyle = '#c9a227';
    for (let x = 0; x < w; x += 40) { g.save(); g.translate(x, h - 22); g.transform(1, 0, -0.6, 1, 0, 0); g.fillRect(0, 0, 18, 22); g.restore(); }
    g.fillStyle = '#222'; g.fillRect(0, h - 26, w, 3);
    g.font = 'bold 40px Impact, sans-serif'; g.fillStyle = 'rgba(230,200,60,0.85)';
    g.fillText('P  LEVEL G', 40, 70);
  }, { repeat: false });
}

export function facadeTex() {
  return canvasTex('facade', 256, 512, (g, w, h) => {
    g.fillStyle = '#2a2622'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 12000, 31, 0.2);
    const r = mulberry32(32);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 2; x++) {
      const lit = r() < 0.35;
      g.fillStyle = lit ? `rgb(${200 + r() * 55},${160 + r() * 60},${80 + r() * 40})` : '#0d1015';
      g.fillRect(28 + x * 120, 12 + y * 64, 80, 40);
      g.fillStyle = '#3a342e'; g.fillRect(24 + x * 120, 54 + y * 64, 88, 6);
    }
  });
}

export function roofTex() {
  return canvasTex('roof', 256, 256, (g, w, h) => {
    g.fillStyle = '#26282b'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 20000, 41, 0.35);
  });
}

export function woodPanelTex() {
  return canvasTex('woodpanel', 128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#5b3518'); grd.addColorStop(0.5, '#7a4a22'); grd.addColorStop(1, '#5b3518');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const r = mulberry32(51);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(30,15,5,${0.2 * r()})`; g.beginPath(); const x = r() * w; g.moveTo(x, 0); g.bezierCurveTo(x + 8, h / 3, x - 8, 2 * h / 3, x + 4, h); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
  });
}

// Night skyline layer: silhouettes with lit windows, transparent sky
export function skylineTex(seed, color, litChance, h0, h1) {
  return canvasTex(`sky${seed}`, 2048, 1024, (g, w, h) => {
    const r = mulberry32(seed);
    let x = 0;
    while (x < w) {
      const bw = 40 + r() * 120;
      const bh = h * (h0 + r() * (h1 - h0));
      g.fillStyle = color;
      g.fillRect(x, h - bh, bw, bh);
      if (r() < 0.25) g.fillRect(x + bw * 0.3, h - bh - 30 - r() * 60, bw * 0.4, 100); // setback / spire
      if (r() < 0.15) { g.fillRect(x + bw / 2 - 1, h - bh - 140, 2, 140); g.fillStyle = '#ff2a2a'; g.fillRect(x + bw / 2 - 3, h - bh - 142, 6, 6); }
      for (let wy = h - bh + 8; wy < h - 6; wy += 11) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
          if (r() < litChance) {
            const t = r();
            g.fillStyle = t < 0.7 ? `rgba(255,${190 + r() * 50},${110 + r() * 60},${0.55 + r() * 0.45})` : `rgba(140,200,255,${0.5 + r() * 0.4})`;
            g.fillRect(wx, wy, 4, 6);
          }
        }
      }
      x += bw + r() * 6;
    }
  }, { repeat: false });
}

export function labelTex(text, opts = {}) {
  const { w = 256, h = 128, font = 'bold 96px "Bebas Neue", Impact, sans-serif', color = 'rgba(255,255,255,0.85)', stroke = null, glow = null } = opts;
  return canvasTex(`label_${text}_${w}_${h}_${color}_${font}`, w, h, (g) => {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (glow) { g.shadowColor = glow; g.shadowBlur = 24; }
    if (stroke) { g.lineWidth = 6; g.strokeStyle = stroke; g.strokeText(text, w / 2, h / 2); }
    g.fillStyle = color; g.fillText(text, w / 2, h / 2);
    if (glow) { g.shadowBlur = 8; g.fillText(text, w / 2, h / 2); }
  }, { repeat: false });
}

export function glowSprite() {
  return canvasTex('glow', 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

export function skyGradientTex() {
  return canvasTex('skygrad', 16, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#02030a'); grd.addColorStop(0.45, '#0b1030'); grd.addColorStop(0.75, '#2a1f45'); grd.addColorStop(1, '#5a2d48');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

export function starsTex() {
  return canvasTex('stars', 1024, 512, (g, w, h) => {
    const r = mulberry32(77);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.8})`; g.fillRect(r() * w, r() * h * 0.7, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1); }
    // moon
    const mx = w * 0.78, my = h * 0.18;
    const grd = g.createRadialGradient(mx, my, 0, mx, my, 90);
    grd.addColorStop(0, 'rgba(255,250,230,0.35)'); grd.addColorStop(1, 'rgba(255,250,230,0)');
    g.fillStyle = grd; g.fillRect(mx - 90, my - 90, 180, 180);
    g.fillStyle = '#f4efdc'; g.beginPath(); g.arc(mx, my, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(180,170,150,0.5)'; g.beginPath(); g.arc(mx - 8, my - 6, 6, 0, Math.PI * 2); g.arc(mx + 9, my + 8, 4, 0, Math.PI * 2); g.fill();
  }, { repeat: false });
}

export function neonSignTex(text) {
  return canvasTex('neon_' + text, 1024, 256, (g, w, h) => {
    g.font = 'bold 170px "Bebas Neue", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff2fa0'; g.shadowBlur = 30; g.strokeStyle = '#ff4fb5'; g.lineWidth = 10;
    g.strokeText(text, w / 2, h / 2 + 8);
    g.shadowBlur = 6; g.strokeStyle = '#ffd6f0'; g.lineWidth = 3; g.strokeText(text, w / 2, h / 2 + 8);
  }, { repeat: false });
}

// Rewrite a BoxGeometry's UVs so textures tile in world units (1 / scale units per repeat).
export function worldUV(geo, scale = 0.5) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, x * scale, z * scale);
    else if (nx > 0.5) uv.setXY(i, z * scale, y * scale);
    else uv.setXY(i, x * scale, y * scale);
  }
  uv.needsUpdate = true;
  return geo;
}
