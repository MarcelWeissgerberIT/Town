import * as THREE from 'three';
import { mulberry32 } from './util.js';

// ---------------------------------------------------------------------------
// Procedural textures. Everything is painted on canvases at start-up so the
// game ships without image files and stays sharp at any zoom level.
// ---------------------------------------------------------------------------

export const PLASTER = {
  cream: { c: '#efe2c3', sh: '#3f6b45', door: '#6b4329' },
  yellow: { c: '#f0c862', sh: '#3d6a46', door: '#5d3b24' },
  pink: { c: '#e9a39b', sh: '#5b7d58', door: '#3b5f43' },
  salmon: { c: '#e58f6c', sh: '#6d4a33', door: '#6d4a33' },
  mint: { c: '#a7cf9f', sh: '#f1ede4', door: '#7a2f2a' },
  blue: { c: '#9db8d6', sh: '#f3efe6', door: '#3b4f6b' },
  white: { c: '#f2efe8', sh: '#2e5d43', door: '#3b5f43' },
  sand: { c: '#dbbf96', sh: '#7b3a2a', door: '#5d3b24' },
};
export const PLASTER_KEYS = Object.keys(PLASTER);
export const APT = { white: '#eeede8', grey: '#c6c9c6', beige: '#e2d1b4', terracotta: '#cf8e6a' };
export const GLASS = {
  blue: ['#9cc3e2', '#4f7ea6', '#22405d'],
  teal: ['#a6d8d0', '#4b9790', '#1d4a48'],
  dark: ['#8b9bb0', '#3a4a5e', '#121a25'],
  silver: ['#e2ebf0', '#9fb0bd', '#5e6f7d'],
};

export const SIGNS = {
  baeckerei: { t: 'Bäckerei', bg: '#5a3a22', fg: '#f2d18b', serif: true, icon: 'pretzel' },
  cafe: { t: 'Café', bg: '#23463a', fg: '#f4ead2', serif: true, icon: 'cup' },
  metzgerei: { t: 'Metzgerei', bg: '#7a1f1f', fg: '#f6efe6', serif: true },
  blumen: { t: 'Blumen', bg: '#3c5a3a', fg: '#ffd6e2', serif: true, icon: 'flower' },
  apotheke: { t: 'Apotheke', bg: '#f4f4f0', fg: '#c4161c', icon: 'apo' },
  buecher: { t: 'Bücher', bg: '#3a2c4a', fg: '#efe6d0', serif: true },
  mode: { t: 'Mode', bg: '#1f1f22', fg: '#ffffff' },
  markt: { t: 'Obst & Gemüse', bg: '#2b4a2a', fg: '#f7e7a8', serif: true },
  eis: { t: 'Eiscafé', bg: '#f3b8c8', fg: '#7a2b45', serif: true },
  friseur: { t: 'Friseur', bg: '#2e3f52', fg: '#f0f0f0' },
  kiosk: { t: 'Kiosk', bg: '#c23b22', fg: '#fff1d0' },
  bank: { t: 'Bank', bg: '#0f3d6e', fg: '#ffffff' },
  hotel: { t: 'Hotel', bg: '#1c1c1c', fg: '#e8c56a', serif: true },
  kino: { t: 'Kino', bg: '#5e1a2b', fg: '#ffd36b' },
  post: { t: 'Post', bg: '#ffcc00', fg: '#1d1d1d' },
  supermarkt: { t: 'Supermarkt', bg: '#d6402b', fg: '#ffffff' },
  restaurant: { t: 'Restaurant', bg: '#2c2a28', fg: '#e9d7b0', serif: true },
  kaufhaus: { t: 'Kaufhaus', bg: '#24365c', fg: '#ffffff' },
  gasthaus: { t: 'Gasthaus', bg: '#4a2e1f', fg: '#f2d18b', serif: true },
  rathaus: { t: 'Rathaus', bg: '#d9cba9', fg: '#3a2a1a', serif: true },
  feuerwehr: { t: 'Feuerwehr', bg: '#b3261e', fg: '#ffffff' },
  polizei: { t: 'Polizei', bg: '#1f4f8f', fg: '#ffffff' },
  krankenhaus: { t: 'Krankenhaus', bg: '#f4f4f2', fg: '#c4161c' },
  schule: { t: 'Schule', bg: '#f1e3c0', fg: '#3c5a7a' },
  werkstatt: { t: 'Werkstatt', bg: '#3d4a4f', fg: '#f2c14e' },
  fabrik: { t: 'Metallwerk', bg: '#5b2e22', fg: '#f0e0c8' },
  logistik: { t: 'Logistik', bg: '#e4e6e3', fg: '#1b5e9c' },
  buero: { t: 'Büro-Center', bg: '#22313f', fg: '#cfe3f2' },
  tower: { t: 'Tower', bg: '#14202b', fg: '#9ad0ff' },
  stadion: { t: 'Stadion', bg: '#1d3b2a', fg: '#ffffff' },
  wohnen: { t: 'Wohnpark', bg: '#e8e2d4', fg: '#38506b' },
  kirche: { t: '', bg: '#d6c09a', fg: '#3a2a1a' },
};

function tex(canvas, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h || w;
  return c;
}

// --------------------------------------------------------------- the painter
// paints into colour, emissive and ORM (occlusion/roughness/metalness) layers
// in a 100x100 unit coordinate system per atlas cell
class Painter {
  constructor(cc, ec, oc, cell, ecell) {
    this.cc = cc; this.ec = ec; this.oc = oc; this.cell = cell; this.ecell = ecell;
    this.rng = mulberry32(1234);
  }
  begin(idx, wCells = 1) {
    const cx = idx % 16, cy = Math.floor(idx / 16);
    const s = this.cell / 100, se = this.ecell / 100;
    for (const [ctx, sc, cs] of [[this.cc, s, this.cell], [this.oc, se, this.ecell], [this.ec, se, this.ecell]]) {
      ctx.setTransform(sc, 0, 0, sc, cx * cs, cy * cs);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, 100 * wCells, 100); ctx.clip();
    }
    this.ec.fillStyle = '#000'; this.ec.fillRect(0, 0, 100 * wCells, 100);
    this.w = 100 * wCells;
  }
  end() { this.cc.restore(); this.oc.restore(); this.ec.restore(); }
  orm(r, m) { return `rgb(255,${Math.round(r * 255)},${Math.round(m * 255)})`; }
  // generic shape fill on all layers
  fill(path, c, r = 0.9, m = 0, e = null) {
    this.cc.fillStyle = c; path(this.cc); this.cc.fill();
    this.oc.fillStyle = this.orm(r, m); path(this.oc); this.oc.fill();
    this.ec.fillStyle = e || '#000'; path(this.ec); this.ec.fill();
  }
  rect(x, y, w, h, c, r = 0.9, m = 0, e = null) {
    this.fill((ctx) => { ctx.beginPath(); ctx.rect(x, y, w, h); }, c, r, m, e);
  }
  circle(x, y, rad, c, r = 0.9, m = 0, e = null) {
    this.fill((ctx) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); }, c, r, m, e);
  }
  // colour-only overlay (shadows, highlights)
  ov(fn) { this.cc.save(); fn(this.cc); this.cc.restore(); }
  noise(x, y, w, h, amount = 260, a = 0.05) {
    const ctx = this.cc, rng = this.rng;
    const n = Math.round(amount * (w * h) / 10000);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 1.1})`;
      const s = 0.5 + rng() * 1.3;
      ctx.fillRect(x + rng() * w, y + rng() * h, s, s);
    }
  }
  grime(x, y, w, h, a = 0.08) {
    const g = this.cc.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(70,50,30,0)'); g.addColorStop(1, `rgba(70,50,30,${a})`);
    this.cc.fillStyle = g; this.cc.fillRect(x, y, w, h);
  }
}

// ------------------------------------------------------------- cell helpers
function plaster(p, c, rough = 0.93) {
  p.rect(0, 0, p.w, 100, c, rough, 0);
  p.noise(0, 0, p.w, 100, 320, 0.045);
  p.grime(0, 40, p.w, 60, 0.07);
}

function glass(p, x, y, w, h, opts = {}) {
  const top = opts.top || '#d4e6f0', mid = opts.mid || '#86a9c0', bot = opts.bot || '#3d5a6f';
  const g = p.cc.createLinearGradient(x, y, x + w * 0.3, y + h);
  g.addColorStop(0, top); g.addColorStop(0.5, mid); g.addColorStop(1, bot);
  p.cc.fillStyle = g; p.cc.fillRect(x, y, w, h);
  p.oc.fillStyle = p.orm(opts.r ?? 0.08, opts.m ?? 0.35); p.oc.fillRect(x, y, w, h);
  // night light
  const e = opts.emis === undefined ? 'warm' : opts.emis;
  if (e) {
    const eg = p.ec.createLinearGradient(0, y, 0, y + h);
    if (e === 'warm') { eg.addColorStop(0, '#ffd99a'); eg.addColorStop(1, '#f2a24a'); }
    else if (e === 'cool') { eg.addColorStop(0, '#e8f0ff'); eg.addColorStop(1, '#9fb4d8'); }
    else { eg.addColorStop(0, e); eg.addColorStop(1, e); }
    p.ec.fillStyle = eg; p.ec.fillRect(x, y, w, h);
  }
  // reflection streak
  p.ov((ctx) => {
    ctx.globalAlpha = 0.22; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x + w * 0.15, y + h); ctx.lineTo(x + w * 0.45, y); ctx.lineTo(x + w * 0.62, y); ctx.lineTo(x + w * 0.32, y + h); ctx.fill();
    // lintel shadow
    const sg = ctx.createLinearGradient(0, y, 0, y + Math.min(10, h * 0.25));
    sg.addColorStop(0, 'rgba(0,0,0,0.45)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = sg; ctx.fillRect(x, y, w, Math.min(10, h * 0.25));
  });
  if (opts.curtain) {
    p.ov((ctx) => { ctx.fillStyle = 'rgba(240,232,215,0.55)'; ctx.fillRect(x, y, w * 0.22, h); ctx.fillRect(x + w * 0.78, y, w * 0.22, h); });
  }
}

function windowFrame(p, x, y, w, h, frame = '#f4f1ea', opts = {}) {
  // reveal shadow
  p.ov((ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x - 1.2, y - 1.2, w + 3.2, h + 3.2); });
  p.rect(x, y, w, h, frame, 0.55);
  const fw = opts.fw || 3;
  glass(p, x + fw, y + fw, w - fw * 2, h - fw * 2, opts);
  if (opts.mullions !== false) {
    p.rect(x + w / 2 - 1.2, y + fw, 2.4, h - fw * 2, frame, 0.55);
    p.rect(x + fw, y + h * 0.36, w - fw * 2, 2.2, frame, 0.55);
  }
}

function sill(p, x, y, w, c = '#e3ddd2') {
  p.rect(x, y, w, 3.6, c, 0.85);
  p.ov((ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, y + 3.6, w, 2.5); });
}

function shutters(p, x, y, w, h, c) {
  for (const sx of [x - 15.5, x + w + 1.5]) {
    p.rect(sx, y, 14, h, c, 0.7);
    p.ov((ctx) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.9;
      for (let yy = y + 3; yy < y + h - 1; yy += 3.6) { ctx.beginPath(); ctx.moveTo(sx + 1.5, yy); ctx.lineTo(sx + 12.5, yy); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.2; ctx.strokeRect(sx + 0.6, y + 0.6, 12.8, h - 1.2);
    });
  }
}

const FLOWER_COLS = ['#e23b4b', '#ff6f91', '#ffffff', '#ffcf3f', '#b54ad8', '#ff8a3d'];
function flowerBox(p, x, y, w, rng, palette = null) {
  const pal = palette || [FLOWER_COLS[Math.floor(rng() * 3)], FLOWER_COLS[3 + Math.floor(rng() * 3)]];
  for (let i = 0; i < 12; i++) p.circle(x + 2 + rng() * (w - 4), y - 2 - rng() * 4, 2.6 + rng() * 1.4, rng() < 0.5 ? '#3f7a32' : '#4f8f3a', 0.9);
  for (let i = 0; i < 11; i++) p.circle(x + 3 + rng() * (w - 6), y - 3 - rng() * 5, 2 + rng() * 1.3, pal[i % pal.length], 0.8);
  p.rect(x, y, w, 7, '#9c5134', 0.85);
  p.rect(x, y, w, 1.5, '#b8694a', 0.85);
}

function door(p, x, y, w, h, c, opts = {}) {
  const r = w / 2;
  // stone surround
  p.fill((ctx) => { ctx.beginPath(); ctx.moveTo(x - 4, y + h); ctx.lineTo(x - 4, y + r); ctx.arc(x + r, y + r, r + 4, Math.PI, 0); ctx.lineTo(x + w + 4, y + h); ctx.closePath(); }, opts.surround || '#e6dfd2', 0.85);
  p.fill((ctx) => { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }, c, 0.7);
  // transom glass
  p.fill((ctx) => { ctx.beginPath(); ctx.moveTo(x + 3, y + r); ctx.arc(x + r, y + r, r - 3, Math.PI, 0); ctx.closePath(); }, '#7f9fb4', 0.1, 0.3, '#ffcf80');
  // panels
  p.ov((ctx) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.3;
    const py = y + r + 3, ph = (h - r - 10) / 2 - 2;
    ctx.strokeRect(x + 4, py, w / 2 - 6, ph); ctx.strokeRect(x + w / 2 + 2, py, w / 2 - 6, ph);
    ctx.strokeRect(x + 4, py + ph + 4, w / 2 - 6, ph); ctx.strokeRect(x + w / 2 + 2, py + ph + 4, w / 2 - 6, ph);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y + r, 2, h - r);
  });
  p.circle(x + w - 5, y + h * 0.62, 1.4, '#d9b04a', 0.3, 0.9);
  // step
  p.rect(x - 7, y + h - 4, w + 14, 4, '#bdb6aa', 0.9);
  if (opts.lamp !== false) {
    p.rect(x - 14, y + r - 6, 6, 9, '#2a2a2a', 0.5, 0.4);
    p.rect(x - 13, y + r - 5, 4, 6, '#f6d38c', 0.3, 0, '#ffd27a');
  }
}

function bricks(p, x, y, w, h, base, mortar, rng, bw = 12, bh = 5) {
  p.rect(x, y, w, h, mortar, 0.95);
  const bc = new THREE.Color(base);
  const hsl = {}; bc.getHSL(hsl);
  for (let row = 0, yy = y; yy < y + h; row++, yy += bh + 1) {
    const off = (row % 2) * (bw / 2);
    for (let xx = x - off; xx < x + w; xx += bw + 1) {
      const l = THREE.MathUtils.clamp(hsl.l + (rng() - 0.5) * 0.09, 0, 1);
      const cc = new THREE.Color().setHSL(hsl.h + (rng() - 0.5) * 0.02, hsl.s, l);
      p.cc.fillStyle = '#' + cc.getHexString();
      p.cc.fillRect(xx, yy, bw, bh);
    }
  }
  p.noise(x, y, w, h, 200, 0.05);
}

function stoneBlocks(p, base, rng, rowH = 12.5) {
  p.rect(0, 0, p.w, 100, base, 0.88);
  const bc = new THREE.Color(base); const hsl = {}; bc.getHSL(hsl);
  for (let r = 0, y = 0; y < 100; r++, y += rowH) {
    const off = (r % 2) * 17;
    for (let x = -off; x < p.w; x += 34) {
      const cc = new THREE.Color().setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + (rng() - 0.5) * 0.06, 0, 1));
      p.cc.fillStyle = '#' + cc.getHexString(); p.cc.fillRect(x + 0.6, y + 0.6, 33 - 0.6, rowH - 1.2);
    }
  }
  p.noise(0, 0, p.w, 100, 300, 0.05);
  p.grime(0, 50, p.w, 50, 0.06);
}

// --------------------------------------------------------------- the atlas
export class Atlas {
  constructor(cellPx, ecellPx) {
    this.cell = cellPx;
    this.ecell = ecellPx || Math.max(32, cellPx / 2);
    this.size = cellPx * 16;
    this.cells = {};
    this.next = 0;
    this.nextSign = 16 * 8;
    this.cColor = canvas(this.size);
    this.cEmis = canvas(this.ecell * 16);
    this.cOrm = canvas(this.ecell * 16);
    const cc = this.cColor.getContext('2d');
    const ec = this.cEmis.getContext('2d');
    const oc = this.cOrm.getContext('2d');
    ec.fillStyle = '#000'; ec.fillRect(0, 0, this.cEmis.width, this.cEmis.width);
    oc.fillStyle = 'rgb(255,230,0)'; oc.fillRect(0, 0, this.cOrm.width, this.cOrm.width);
    this.p = new Painter(cc, ec, oc, this.cell, this.ecell);
  }
  add(name, fn, wCells = 1) {
    let idx;
    if (wCells > 1) { idx = this.nextSign; this.nextSign += wCells; }
    else idx = this.next++;
    this.cells[name] = { idx, w: wCells };
    this.p.rng = mulberry32(idx * 7919 + 13);
    this.p.begin(idx, wCells);
    fn(this.p, this.p.rng);
    this.p.end();
  }
  // [u0, v0, u1, v1] (v0 bottom)
  uv(name) {
    const c = this.cells[name] || this.cells.wall_cream;
    const cx = c.idx % 16, cy = Math.floor(c.idx / 16);
    const inset = 0.012 / 16;
    return [cx / 16 + inset, 1 - (cy + 1) / 16 + inset, (cx + c.w) / 16 - inset, 1 - cy / 16 - inset];
  }
  has(name) { return !!this.cells[name]; }
  build() {
    this.map = tex(this.cColor, true);
    this.emissive = tex(this.cEmis, true);
    this.orm = tex(this.cOrm, false);
  }
}

function buildAtlas(cellPx) {
  const A = new Atlas(cellPx);

  // ---- plastered houses
  for (const k of PLASTER_KEYS) {
    const pc = PLASTER[k];
    A.add(`win_s_${k}`, (p, rng) => {
      plaster(p, pc.c);
      windowFrame(p, 35, 20, 30, 50, '#f6f3ec', { curtain: rng() < 0.6 });
      shutters(p, 35, 20, 30, 50, pc.sh);
      flowerBox(p, 32, 70, 36, rng);
      sill(p, 31, 77, 38);
    });
    A.add(`win_p_${k}`, (p, rng) => {
      plaster(p, pc.c);
      // stucco surround
      p.ov((ctx) => { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(26, 12, 48, 70); });
      windowFrame(p, 31, 17, 38, 56, '#f7f4ee', { curtain: rng() < 0.5 });
      sill(p, 27, 73, 46);
      p.ov((ctx) => { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(26, 10, 48, 4); });
    });
    A.add(`door_${k}`, (p) => {
      plaster(p, pc.c);
      door(p, 33, 30, 34, 70, pc.door);
    });
    A.add(`wall_${k}`, (p) => { plaster(p, pc.c); });
    A.add(`gable_${k}`, (p, rng) => {
      plaster(p, pc.c);
      if (rng() < 0.5) {
        p.circle(50, 62, 9.5, '#f6f3ec', 0.5);
        p.fill((ctx) => { ctx.beginPath(); ctx.arc(50, 62, 7, 0, Math.PI * 2); }, '#5f7f95', 0.08, 0.3, '#ffcf80');
        p.rect(49, 55, 2, 14, '#f6f3ec', 0.5);
      } else {
        windowFrame(p, 41, 50, 18, 26, '#f6f3ec');
        sill(p, 39, 76, 22);
      }
    });
  }

  // ---- half timbered (Fachwerk)
  const FW = { brown: ['#efe2c4', '#4b2f20'], red: ['#f1ebe0', '#6e2a22'] };
  for (const k in FW) {
    const [inf, beam] = FW[k];
    const beamLine = (p, x0, y0, x1, y1, w = 5.5) => {
      p.fill((ctx) => {
        const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2;
        ctx.beginPath(); ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x1 + nx, y1 + ny); ctx.lineTo(x1 - nx, y1 - ny); ctx.lineTo(x0 - nx, y0 - ny); ctx.closePath();
      }, beam, 0.8);
    };
    const frame = (p) => {
      plaster(p, inf, 0.95);
      p.rect(0, 0, 3, 100, beam, 0.8); p.rect(97, 0, 3, 100, beam, 0.8);
      p.rect(0, 0, 100, 6, beam, 0.8); p.rect(0, 94, 100, 6, beam, 0.8);
    };
    A.add(`fw_win_${k}`, (p, rng) => {
      frame(p);
      p.rect(24, 6, 6, 88, beam, 0.8); p.rect(70, 6, 6, 88, beam, 0.8);
      p.rect(24, 17, 52, 6, beam, 0.8); p.rect(24, 72, 52, 6, beam, 0.8);
      beamLine(p, 3, 92, 24, 75); beamLine(p, 97, 92, 76, 75);
      beamLine(p, 3, 8, 24, 22); beamLine(p, 97, 8, 76, 22);
      windowFrame(p, 31, 24, 38, 47, '#f4efe2', { curtain: rng() < 0.5 });
      p.rect(31, 24 + 47 * 0.66, 38, 1.8, '#f4efe2', 0.5);
      flowerBox(p, 30, 69, 40, rng);
    });
    A.add(`fw_wall_${k}`, (p) => {
      frame(p);
      p.rect(47, 6, 6, 88, beam, 0.8);
      beamLine(p, 3, 8, 47, 92); beamLine(p, 3, 92, 47, 8);
      beamLine(p, 53, 8, 97, 92); beamLine(p, 53, 92, 97, 8);
    });
    A.add(`fw_door_${k}`, (p) => {
      frame(p);
      p.rect(24, 6, 6, 88, beam, 0.8); p.rect(70, 6, 6, 88, beam, 0.8);
      p.rect(24, 22, 52, 6, beam, 0.8);
      door(p, 32, 30, 36, 70, '#5a3a24', { surround: beam, lamp: false });
    });
    A.add(`fw_gable_${k}`, (p) => {
      plaster(p, inf, 0.95);
      p.rect(47, 0, 6, 52, beam, 0.8);
      p.rect(0, 48, 100, 6, beam, 0.8); p.rect(0, 94, 100, 6, beam, 0.8);
      beamLine(p, 50, 54, 18, 94); beamLine(p, 50, 54, 82, 94);
      windowFrame(p, 40, 62, 20, 24, '#f4efe2', { mullions: true });
    });
  }

  // ---- brick
  const BR = { red: ['#a8503a', '#d9cbb8'], dark: ['#7a3b2c', '#c9bba6'] };
  for (const k in BR) {
    const [bc, mc] = BR[k];
    A.add(`br_wall_${k}`, (p, rng) => { bricks(p, 0, 0, 100, 100, bc, mc, rng); p.grime(0, 50, 100, 50, 0.08); });
    A.add(`br_win_${k}`, (p, rng) => {
      bricks(p, 0, 0, 100, 100, bc, mc, rng);
      p.fill((ctx) => { ctx.beginPath(); ctx.moveTo(28, 26); ctx.quadraticCurveTo(50, 12, 72, 26); ctx.lineTo(72, 30); ctx.lineTo(28, 30); ctx.closePath(); }, '#6b2e22', 0.9);
      windowFrame(p, 32, 26, 36, 46, '#f2efe8');
      sill(p, 29, 72, 42, '#d9d2c4');
    });
    A.add(`br_ind_${k}`, (p, rng) => {
      bricks(p, 0, 0, 100, 100, bc, mc, rng);
      p.fill((ctx) => { ctx.beginPath(); ctx.moveTo(10, 22); ctx.quadraticCurveTo(50, 4, 90, 22); ctx.lineTo(90, 26); ctx.lineTo(10, 26); ctx.closePath(); }, '#6b2e22', 0.9);
      p.rect(12, 22, 76, 60, '#36424a', 0.5, 0.6);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) glass(p, 14 + i * 18.5, 24 + j * 14.5, 16.5, 12.5, { top: '#aac3cf', mid: '#6d8796', bot: '#3c4f5a', emis: '#ffe6b0' });
      sill(p, 10, 82, 80, '#cfc7b8');
    });
  }
  A.add('br_door_red', (p, rng) => { bricks(p, 0, 0, 100, 100, BR.red[0], BR.red[1], rng); door(p, 32, 30, 36, 70, '#3b4f6b', { surround: '#d9d2c4' }); });
  A.add('garage_red', (p, rng) => {
    bricks(p, 0, 0, 100, 100, BR.red[0], BR.red[1], rng);
    p.rect(6, 12, 88, 88, '#e9e4da', 0.8);
    p.rect(9, 15, 82, 85, '#c3271f', 0.5, 0.2);
    p.ov((ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 22; y < 100; y += 10) ctx.fillRect(9, y, 82, 1.5); });
    for (let i = 0; i < 4; i++) glass(p, 13 + i * 19.5, 26, 16, 7, { emis: '#ffe4b0' });
  });
  A.add('garage_grey', (p, rng) => {
    bricks(p, 0, 0, 100, 100, BR.dark[0], BR.dark[1], rng);
    p.rect(8, 16, 84, 84, '#9aa1a6', 0.5, 0.5);
    p.ov((ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 20; y < 100; y += 6) ctx.fillRect(8, y, 84, 1.2); });
  });

  // ---- shop fronts
  const SHOPS = {
    bakery: '#5a3a22', grocer: '#2b4a2a', cafe: '#23463a', flowers: '#3c5a3a', fashion: '#222226',
    books: '#3a2c4a', pharmacy: '#1f5f4f', butcher: '#6b1f1f', icecream: '#b04a6a', general: '#2e3f52',
  };
  for (const k in SHOPS) {
    A.add(`shop_${k}`, (p, rng) => {
      const fc = SHOPS[k];
      p.rect(0, 0, 100, 100, fc, 0.6);
      p.rect(0, 0, 100, 3, 'rgba(255,255,255,0.15)');
      // interior
      const ix = 7, iy = 14, iw = 86, ih = 70;
      const g = p.cc.createLinearGradient(0, iy, 0, iy + ih);
      g.addColorStop(0, '#f1e3c4'); g.addColorStop(1, '#b89a72');
      p.cc.fillStyle = g; p.cc.fillRect(ix, iy, iw, ih);
      p.oc.fillStyle = p.orm(0.1, 0.25); p.oc.fillRect(ix, iy, iw, ih);
      p.ec.fillStyle = '#ffe2ae'; p.ec.fillRect(ix, iy, iw, ih);
      const ctx = p.cc;
      const shelf = (y) => { ctx.fillStyle = '#7a5532'; ctx.fillRect(ix, y, iw, 2.4); };
      if (k === 'bakery') {
        shelf(36); shelf(58);
        for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#b8763b' : '#c98a45'; ctx.beginPath(); ctx.ellipse(ix + 8 + i * 12, 32, 5.5, 3.6, 0, 0, 7); ctx.fill(); }
        for (let i = 0; i < 6; i++) { ctx.strokeStyle = '#8a5124'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ix + 10 + i * 13, 52, 4, 0, 7); ctx.stroke(); }
        ctx.fillStyle = '#e9dfd2'; ctx.fillRect(ix, 66, iw, 18);
        for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#f0c6cf', '#fff', '#8a5124', '#f5d38c'][i % 4]; ctx.beginPath(); ctx.arc(ix + 10 + i * 16, 68, 5, Math.PI, 0); ctx.fill(); }
      } else if (k === 'grocer') {
        for (let r = 0; r < 3; r++) {
          ctx.fillStyle = '#8a6239'; ctx.fillRect(ix + 2, 40 + r * 15, iw - 4, 8);
          for (let i = 0; i < 12; i++) { ctx.fillStyle = ['#d7262e', '#f39c1f', '#7bb33a', '#f4d03f', '#8e3b8e'][(i + r) % 5]; ctx.beginPath(); ctx.arc(ix + 5 + i * 7, 39 + r * 15, 2.8, 0, 7); ctx.fill(); }
        }
      } else if (k === 'cafe') {
        ctx.fillStyle = '#5e3d27'; ctx.fillRect(ix, 70, iw, 14);
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#3b2a1e'; ctx.fillRect(ix + 10 + i * 27, 52, 14, 3); ctx.fillRect(ix + 16 + i * 27, 55, 2, 15); ctx.fillStyle = '#fff'; ctx.fillRect(ix + 13 + i * 27, 49, 3, 3); }
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#fff3c8'; ctx.beginPath(); ctx.arc(ix + 17 + i * 27, 24, 4, 0, Math.PI); ctx.fill(); ctx.fillRect(ix + 16.5 + i * 27, iy, 1, 10); }
      } else if (k === 'flowers') {
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = '#2f4f2f'; ctx.fillRect(ix + 4 + i * 14, 60, 10, 22);
          for (let j = 0; j < 7; j++) { ctx.fillStyle = FLOWER_COLS[(i + j) % FLOWER_COLS.length]; ctx.beginPath(); ctx.arc(ix + 6 + i * 14 + rng() * 7, 50 + rng() * 10, 2.6, 0, 7); ctx.fill(); }
        }
        for (let j = 0; j < 14; j++) { ctx.fillStyle = '#4f8f3a'; ctx.beginPath(); ctx.arc(ix + rng() * iw, 22 + rng() * 14, 3, 0, 7); ctx.fill(); }
      } else if (k === 'fashion') {
        for (let i = 0; i < 3; i++) {
          const cx = ix + 16 + i * 27;
          ctx.fillStyle = '#e8d8c8'; ctx.beginPath(); ctx.arc(cx, 28, 4, 0, 7); ctx.fill();
          ctx.fillStyle = ['#c0392b', '#2c3e50', '#d4a017'][i]; ctx.beginPath(); ctx.moveTo(cx - 7, 34); ctx.lineTo(cx + 7, 34); ctx.lineTo(cx + 10, 66); ctx.lineTo(cx - 10, 66); ctx.fill();
          ctx.fillStyle = '#444'; ctx.fillRect(cx - 1, 66, 2, 14);
        }
      } else if (k === 'books') {
        for (let r = 0; r < 3; r++) { shelf(36 + r * 17); for (let i = 0; i < 26; i++) { ctx.fillStyle = ['#7a2b2b', '#2b4a7a', '#d9b44a', '#3f6b45', '#e9e4d6', '#5a3a6a'][Math.floor(rng() * 6)]; const h = 9 + rng() * 5; ctx.fillRect(ix + 2 + i * 3.2, 36 + r * 17 - h, 2.8, h); } }
      } else if (k === 'pharmacy') {
        ctx.fillStyle = '#f8f8f6'; ctx.fillRect(ix, iy, iw, ih);
        for (let r = 0; r < 3; r++) { ctx.fillStyle = '#d9dcdc'; ctx.fillRect(ix, 36 + r * 16, iw, 1.6); for (let i = 0; i < 14; i++) { ctx.fillStyle = ['#2f9e6e', '#ffffff', '#3a7bd5', '#f2c14e', '#e85d75'][Math.floor(rng() * 5)]; ctx.fillRect(ix + 3 + i * 6, 29 + r * 16, 4.5, 7); } }
        ctx.fillStyle = '#18a058'; ctx.fillRect(ix + 40, 18, 6, 14); ctx.fillRect(ix + 36, 22, 14, 6);
      } else if (k === 'butcher') {
        ctx.fillStyle = '#f4f2ee'; ctx.fillRect(ix, iy, iw, ih);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.5; for (let x = ix; x < ix + iw; x += 6) { ctx.beginPath(); ctx.moveTo(x, iy); ctx.lineTo(x, iy + ih); ctx.stroke(); } for (let y = iy; y < iy + ih; y += 6) { ctx.beginPath(); ctx.moveTo(ix, y); ctx.lineTo(ix + iw, y); ctx.stroke(); }
        for (let i = 0; i < 9; i++) { ctx.fillStyle = '#9b3b2f'; ctx.beginPath(); ctx.ellipse(ix + 8 + i * 9, 30, 2.4, 7, 0, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#cfd6d8'; ctx.fillRect(ix, 62, iw, 22);
        for (let i = 0; i < 8; i++) { ctx.fillStyle = ['#c0504d', '#e8a0a0', '#b5651d'][i % 3]; ctx.fillRect(ix + 4 + i * 10, 64, 8, 5); }
      } else if (k === 'icecream') {
        ctx.fillStyle = '#fbeff2'; ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = '#d9e6ea'; ctx.fillRect(ix, 58, iw, 26);
        for (let i = 0; i < 10; i++) { ctx.fillStyle = ['#f6d6e0', '#fff4c2', '#c9e8c9', '#7a4a2a', '#f39cb0', '#e8f0ff'][i % 6]; ctx.beginPath(); ctx.arc(ix + 6 + i * 8.4, 60, 3.6, Math.PI, 0); ctx.fill(); }
        ctx.fillStyle = '#d99a4a'; ctx.beginPath(); ctx.moveTo(ix + 37, 30); ctx.lineTo(ix + 49, 30); ctx.lineTo(ix + 43, 48); ctx.fill();
        ctx.fillStyle = '#f39cb0'; ctx.beginPath(); ctx.arc(ix + 43, 28, 6.5, 0, 7); ctx.fill();
      } else {
        for (let r = 0; r < 3; r++) { shelf(38 + r * 16); for (let i = 0; i < 16; i++) { ctx.fillStyle = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#ecf0f1', '#e67e22'][Math.floor(rng() * 6)]; ctx.fillRect(ix + 3 + i * 5.2, 30 + r * 16, 4.2, 8); } }
      }
      // reflection + frame bars
      p.ov((c) => { c.globalAlpha = 0.18; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(ix + 10, iy + ih); c.lineTo(ix + 40, iy); c.lineTo(ix + 52, iy); c.lineTo(ix + 22, iy + ih); c.fill(); });
      p.rect(48.5, iy, 3, ih, fc, 0.6);
      p.rect(0, 84, 100, 16, fc, 0.6);
      p.ov((c) => { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 84, 100, 1.5); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(ix, iy, iw, 2.5); });
    });
  }
  A.add('shopdoor', (p) => {
    p.rect(0, 0, 100, 100, '#2e3a36', 0.6);
    glass(p, 8, 14, 84, 30, { top: '#e7ddc6', mid: '#c6ab84', bot: '#9a7a55', emis: '#ffe2ae', r: 0.1 });
    p.rect(24, 50, 52, 50, '#1f2724', 0.5);
    glass(p, 28, 54, 44, 46, { emis: '#ffe2ae' });
    p.rect(49, 54, 2, 46, '#1f2724', 0.5);
    p.rect(30, 74, 18, 2, '#c9c9c9', 0.3, 0.9); p.rect(52, 74, 18, 2, '#c9c9c9', 0.3, 0.9);
  });

  // ---- modern apartments
  for (const k in APT) {
    const c = APT[k];
    const smooth = (p) => { p.rect(0, 0, 100, 100, c, 0.85); p.noise(0, 0, 100, 100, 140, 0.03); p.grime(0, 60, 100, 40, 0.05); };
    A.add(`apt_win_${k}`, (p, rng) => { smooth(p); windowFrame(p, 20, 22, 60, 50, '#4a4f55', { fw: 2.5, curtain: rng() < 0.5 }); sill(p, 18, 72, 64, '#b9bcbf'); });
    A.add(`apt_bal_${k}`, (p, rng) => {
      smooth(p);
      windowFrame(p, 22, 16, 56, 78, '#4a4f55', { fw: 2.5, curtain: rng() < 0.5 });
      p.rect(20, 58, 60, 2.4, '#3c4045', 0.4, 0.7);
      for (let x = 22; x < 80; x += 4.5) p.rect(x, 60, 1.2, 34, '#3c4045', 0.4, 0.7);
      p.rect(20, 92, 60, 2.4, '#3c4045', 0.4, 0.7);
    });
    A.add(`apt_wall_${k}`, (p) => { smooth(p); });
    A.add(`apt_door_${k}`, (p) => {
      smooth(p);
      p.rect(20, 14, 60, 6, '#3c4045', 0.4, 0.5);
      p.rect(24, 22, 52, 78, '#3c4045', 0.4, 0.5);
      glass(p, 27, 25, 46, 75, { emis: '#fff0cc' });
      p.rect(49, 25, 2, 75, '#3c4045', 0.4, 0.5);
      p.rect(84, 30, 6, 6, '#1f4f8f', 0.5, 0, '#5b8fd8');
    });
  }

  // ---- offices: glass curtain wall + stone
  for (const k in GLASS) {
    const [t, m, b] = GLASS[k];
    A.add(`glass_${k}`, (p, rng) => {
      const g = p.cc.createLinearGradient(0, 0, 60, 100);
      g.addColorStop(0, t); g.addColorStop(0.55, m); g.addColorStop(1, b);
      p.cc.fillStyle = g; p.cc.fillRect(0, 0, 100, 100);
      p.oc.fillStyle = p.orm(0.06, 0.55); p.oc.fillRect(0, 0, 100, 100);
      // office interior lights
      p.ec.fillStyle = '#5f7598'; p.ec.fillRect(0, 0, 100, 82);
      p.ec.fillStyle = '#eef4ff'; p.ec.fillRect(4, 6, 40, 5); p.ec.fillRect(56, 6, 40, 5);
      p.ec.fillStyle = '#c9d6ee'; p.ec.fillRect(0, 40, 100, 42);
      p.ov((ctx) => { ctx.globalAlpha = 0.16; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(10, 82); ctx.lineTo(40, 0); ctx.lineTo(56, 0); ctx.lineTo(26, 82); ctx.fill(); });
      p.rect(0, 82, 100, 18, b, 0.3, 0.5);
      p.ov((ctx) => { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, 82, 100, 2); });
      for (const x of [0, 49, 98]) p.rect(x, 0, 2, 100, '#c6ccd2', 0.35, 0.8);
      p.rect(0, 0, 100, 1.6, '#c6ccd2', 0.35, 0.8);
    });
  }
  A.add('glass_door', (p) => {
    p.rect(0, 0, 100, 100, '#3a4652', 0.3, 0.6);
    p.rect(0, 0, 100, 16, '#2a333c', 0.3, 0.6);
    glass(p, 6, 20, 88, 80, { top: '#dfe9f0', mid: '#9db4c6', bot: '#3e5566', emis: '#fff2d6', m: 0.5 });
    for (const x of [6, 28, 50, 72, 94]) p.rect(x - 1, 20, 2, 80, '#c6ccd2', 0.35, 0.8);
  });
  const STONE = { beige: '#d8ccb4', grey: '#bdbcb6' };
  for (const k in STONE) {
    A.add(`stone_win_${k}`, (p, rng) => {
      stoneBlocks(p, STONE[k], rng, 25);
      windowFrame(p, 27, 12, 46, 74, '#3b3530', { fw: 2.5, emis: rng() < 0.5 ? 'warm' : 'cool' });
      sill(p, 24, 86, 52, '#e8e1d1');
    });
    A.add(`stone_wall_${k}`, (p, rng) => { stoneBlocks(p, STONE[k], rng, 25); });
  }
  A.add('stone_door', (p, rng) => {
    stoneBlocks(p, STONE.beige, rng, 25);
    p.rect(14, 10, 72, 90, '#2f2a26', 0.5, 0.3);
    glass(p, 18, 14, 64, 86, { emis: '#fff0cc' });
    p.rect(49, 14, 2, 86, '#2f2a26', 0.5, 0.3);
    p.rect(8, 94, 84, 6, '#cfc6b2', 0.9);
  });

  // ---- industrial cladding
  const MET = { grey: '#a5adb3', blue: '#5d7d9a', white: '#e2e5e3' };
  for (const k in MET) {
    A.add(`metal_${k}`, (p) => {
      p.rect(0, 0, 100, 100, MET[k], 0.5, 0.5);
      p.ov((ctx) => { for (let x = 0; x < 100; x += 5) { ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(x, 0, 1.6, 100); ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(x + 2.6, 0, 1.2, 100); } });
      p.grime(0, 60, 100, 40, 0.1);
    });
  }
  A.add('metal_dock', (p) => {
    p.rect(0, 0, 100, 100, MET.grey, 0.5, 0.5);
    p.rect(12, 20, 76, 80, '#c9cdd0', 0.45, 0.6);
    p.ov((ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (let y = 22; y < 100; y += 4) ctx.fillRect(12, y, 76, 1); });
    for (let y = 20; y < 100; y += 8) { p.rect(6, y, 6, 4, '#f2c14e', 0.6); p.rect(6, y + 4, 6, 4, '#222', 0.6); p.rect(88, y, 6, 4, '#f2c14e', 0.6); p.rect(88, y + 4, 6, 4, '#222', 0.6); }
    p.rect(40, 8, 20, 6, '#333', 0.5, 0, '#ffe9b0');
  });

  // ---- church / historic stone
  A.add('ch_wall', (p, rng) => { stoneBlocks(p, '#d6c09a', rng); });
  A.add('ch_win', (p, rng) => {
    stoneBlocks(p, '#d6c09a', rng);
    const path = (ctx) => { ctx.beginPath(); ctx.moveTo(36, 88); ctx.lineTo(36, 34); ctx.quadraticCurveTo(36, 16, 50, 10); ctx.quadraticCurveTo(64, 16, 64, 34); ctx.lineTo(64, 88); ctx.closePath(); };
    p.fill(path, '#3a3a40', 0.4, 0.2);
    const cols = ['#2c5aa0', '#b8322a', '#e3b23c', '#3f8f5a', '#6a3d9a'];
    for (let y = 14; y < 88; y += 7) for (let x = 38; x < 63; x += 6.3) {
      const c = cols[Math.floor(rng() * cols.length)];
      p.cc.save(); path(p.cc); p.cc.clip(); p.cc.fillStyle = c; p.cc.fillRect(x, y, 5.5, 6.2); p.cc.restore();
      p.ec.save(); path(p.ec); p.ec.clip(); p.ec.fillStyle = c; p.ec.fillRect(x, y, 5.5, 6.2); p.ec.restore();
    }
    p.ov((ctx) => { ctx.strokeStyle = '#c8b28a'; ctx.lineWidth = 3; path(ctx); ctx.stroke(); });
  });
  A.add('ch_rose', (p, rng) => {
    stoneBlocks(p, '#d6c09a', rng);
    p.circle(50, 58, 26, '#c8b28a', 0.8);
    const cols = ['#2c5aa0', '#b8322a', '#e3b23c', '#3f8f5a'];
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      p.fill((ctx) => { ctx.beginPath(); ctx.moveTo(50, 58); ctx.arc(50, 58, 22, a0, a1); ctx.closePath(); }, cols[i % 4], 0.3, 0.1, cols[i % 4]);
    }
    p.circle(50, 58, 7, '#e3b23c', 0.3, 0.1, '#ffd36b');
  });
  A.add('ch_door', (p, rng) => {
    stoneBlocks(p, '#d6c09a', rng);
    const path = (ctx) => { ctx.beginPath(); ctx.moveTo(26, 100); ctx.lineTo(26, 46); ctx.quadraticCurveTo(26, 22, 50, 14); ctx.quadraticCurveTo(74, 22, 74, 46); ctx.lineTo(74, 100); ctx.closePath(); };
    p.fill(path, '#5a3a24', 0.7);
    p.ov((ctx) => { ctx.strokeStyle = '#b39a70'; ctx.lineWidth = 4; path(ctx); ctx.stroke(); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(49, 30, 2, 70); });
  });
  A.add('clock', (p, rng) => {
    stoneBlocks(p, '#d6c09a', rng);
    p.circle(50, 50, 38, '#c9a54a', 0.3, 0.9);
    p.circle(50, 50, 34, '#f6f2e6', 0.6, 0, '#fff6d8');
    p.ov((ctx) => {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(50 + Math.cos(a) * 27, 50 + Math.sin(a) * 27); ctx.lineTo(50 + Math.cos(a) * 32, 50 + Math.sin(a) * 32); ctx.stroke(); }
      ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(50, 50); ctx.lineTo(50, 28); ctx.stroke();
      ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(50, 50); ctx.lineTo(64, 56); ctx.stroke();
    });
  });
  A.add('hospital_win', (p, rng) => {
    p.rect(0, 0, 100, 100, '#f4f4f1', 0.85); p.noise(0, 0, 100, 100, 100, 0.03);
    windowFrame(p, 12, 20, 76, 50, '#9aa6ae', { fw: 2, emis: 'cool', curtain: rng() < 0.4 });
    p.rect(0, 80, 100, 8, '#7fb3d5', 0.6);
  });

  // ---- raw construction
  A.add('raw_conc', (p, rng) => {
    p.rect(0, 0, 100, 100, '#aaa9a2', 0.95); p.noise(0, 0, 100, 100, 400, 0.06);
    p.ov((ctx) => { ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 24; y < 100; y += 25) ctx.fillRect(0, y, 100, 1); for (let x = 12; x < 100; x += 25) for (let y = 12; y < 100; y += 25) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 7); ctx.fill(); } });
  });
  A.add('raw_conc_win', (p, rng) => {
    p.rect(0, 0, 100, 100, '#aaa9a2', 0.95); p.noise(0, 0, 100, 100, 400, 0.06);
    p.rect(28, 22, 44, 52, '#2a2a28', 0.95);
    p.ov((ctx) => { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(28, 72, 44, 2); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 49, 28, 1); ctx.fillRect(72, 49, 28, 1); });
  });
  const poroton = (p, rng) => {
    p.rect(0, 0, 100, 100, '#e7d7c0', 0.95);
    for (let r = 0, y = 0; y < 100; r++, y += 12.5) {
      const off = (r % 2) * 12.5;
      for (let x = -off; x < 100; x += 25) { p.cc.fillStyle = `hsl(14, ${46 + rng() * 10}%, ${50 + rng() * 6}%)`; p.cc.fillRect(x + 0.6, y + 0.6, 23.8, 11.3); }
    }
    p.noise(0, 0, 100, 100, 260, 0.06);
  };
  A.add('raw_brick', (p, rng) => poroton(p, rng));
  A.add('raw_brick_win', (p, rng) => { poroton(p, rng); p.rect(30, 24, 40, 50, '#2c2622', 0.95); p.rect(28, 20, 44, 5, '#9a9a94', 0.9); });

  paintSigns(A);
  A.build();
  return A;
}

// signs carry German lettering, so they are always painted here (also on top of the photo atlas)
function paintSigns(A) {
  A.add('redcross', (p) => {
    p.rect(0, 0, 100, 100, '#f7f7f5', 0.6, 0, '#fafafa');
    p.rect(38, 14, 24, 72, '#d8161c', 0.6, 0, '#ff2a2a'); p.rect(14, 38, 72, 24, '#d8161c', 0.6, 0, '#ff2a2a');
  });
  // ---- signs (4 cells wide)
  for (const k in SIGNS) {
    const s = SIGNS[k];
    A.add(`sign_${k}`, (p) => {
      p.rect(0, 0, 400, 100, s.bg, 0.6, 0, null);
      p.ov((ctx) => { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.strokeRect(6, 8, 388, 84); });
      if (!s.t) return;
      let x = 200;
      const font = s.serif ? '700 62px Georgia, "Times New Roman", serif' : '700 60px "Fredoka", "Trebuchet MS", Arial, sans-serif';
      for (const ctx of [p.cc, p.ec]) {
        ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(s.t).width;
        const sc = Math.min(1, (s.icon ? 300 : 360) / tw);
        ctx.save(); ctx.translate(s.icon ? 230 : 200, 54); ctx.scale(sc, 1);
        ctx.fillStyle = s.fg; ctx.fillText(s.t, 0, 0);
        ctx.restore();
      }
      if (s.icon) {
        x = 48;
        const draw = (ctx) => {
          ctx.save(); ctx.translate(x, 50);
          ctx.strokeStyle = s.fg; ctx.fillStyle = s.fg; ctx.lineWidth = 7;
          if (s.icon === 'pretzel') { ctx.beginPath(); ctx.arc(-11, 4, 14, 0.4, Math.PI * 2 - 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(11, 4, 14, Math.PI + 0.2, Math.PI * 3 - 0.4); ctx.stroke(); }
          if (s.icon === 'cup') { ctx.fillRect(-18, -8, 30, 26); ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(14, 4, 8, -1.5, 1.5); ctx.stroke(); ctx.fillRect(-24, 20, 42, 4); }
          if (s.icon === 'flower') { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 8, 0, 7); ctx.fill(); } ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); }
          if (s.icon === 'apo') { ctx.font = '900 76px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 0, 6); }
          ctx.restore();
        };
        draw(p.cc); draw(p.ec);
      }
    }, 4);
  }
}

// --------------------------------------------------------------- tileables
function wrapDraw(size, fn) {
  // draw shape at position and wrapped copies near edges
  return (x, y, r, ...rest) => {
    for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) {
      if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
      fn(x + ox, y + oy, r, ...rest);
    }
  };
}

function grassTex(size, seed = 7) {
  const c = canvas(size), ctx = c.getContext('2d'), rng = mulberry32(seed);
  ctx.fillStyle = '#7aa64e'; ctx.fillRect(0, 0, size, size);
  const blob = wrapDraw(size, (x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); });
  for (let i = 0; i < 90; i++) blob(rng() * size, rng() * size, 20 + rng() * 50, `rgba(${rng() < 0.5 ? '60,95,40' : '150,175,90'},0.10)`);
  const blade = wrapDraw(size, (x, y, r, col, a) => { ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke(); });
  for (let i = 0; i < size * 30; i++) {
    const g = 95 + rng() * 85;
    blade(rng() * size, rng() * size, 3 + rng() * 5, `rgba(${g * 0.6 | 0},${g | 0},${g * 0.4 | 0},0.5)`, -Math.PI / 2 + (rng() - 0.5) * 1.2);
  }
  for (let i = 0; i < 70; i++) blob(rng() * size, rng() * size, 1.6, ['#fff', '#ffe066', '#f5a3c7'][i % 3]);
  return c;
}

function cobbleTex(size, seed = 3) {
  const c = canvas(size), ctx = c.getContext('2d'), rng = mulberry32(seed);
  ctx.fillStyle = '#7d776c'; ctx.fillRect(0, 0, size, size);
  const n = 16, cs = size / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const off = (j % 2) * cs * 0.5;
    const x = i * cs + off + (rng() - 0.5) * 2, y = j * cs + (rng() - 0.5) * 2;
    const l = 180 + rng() * 40, w = cs - 3 - rng() * 2, h = cs - 3 - rng() * 2;
    for (const ox of [0, -size]) {
      const g = ctx.createLinearGradient(x + ox, y, x + ox, y + h);
      g.addColorStop(0, `rgb(${l + 18},${l + 14},${l + 6})`); g.addColorStop(1, `rgb(${l - 30},${l - 34},${l - 40})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x + ox + 1.5, y + 1.5, w, h, cs * 0.28); ctx.fill();
    }
  }
  return c;
}

function noiseTex(size, base, specks, seed = 5, a = 0.25) {
  const c = canvas(size), ctx = c.getContext('2d'), rng = mulberry32(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.04})`; ctx.beginPath(); ctx.arc(rng() * size, rng() * size, 20 + rng() * 60, 0, 7); ctx.fill(); }
  for (let i = 0; i < size * size * 0.05; i++) {
    ctx.fillStyle = specks[Math.floor(rng() * specks.length)];
    ctx.globalAlpha = a * rng();
    const s = 1 + rng() * 2;
    ctx.fillRect(rng() * size, rng() * size, s, s);
  }
  ctx.globalAlpha = 1;
  return c;
}

function roofTileTex(size) {
  const c = canvas(size), ctx = c.getContext('2d'), rng = mulberry32(11);
  ctx.fillStyle = '#9a8f88'; ctx.fillRect(0, 0, size, size);
  const rows = 8, cols = 8, rh = size / rows, cw = size / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * cw * 0.5;
    for (let i = -1; i <= cols; i++) {
      const x = i * cw + off, y = r * rh;
      const l = 225 + rng() * 30;
      const g = ctx.createLinearGradient(x, y, x + cw, y);
      g.addColorStop(0, `rgb(${l - 40},${l - 44},${l - 46})`); g.addColorStop(0.45, `rgb(${l},${l - 4},${l - 6})`); g.addColorStop(1, `rgb(${l - 55},${l - 60},${l - 62})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + cw - 1, y); ctx.lineTo(x + cw - 1, y + rh - cw * 0.3); ctx.quadraticCurveTo(x + cw / 2, y + rh + cw * 0.12, x + 1, y + rh - cw * 0.3); ctx.closePath(); ctx.fill();
    }
    const sh = ctx.createLinearGradient(0, r * rh + rh * 0.6, 0, r * rh + rh);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = sh; ctx.fillRect(0, r * rh, size, rh);
  }
  return c;
}

function metalRoofTex(size) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#d6d8da'; ctx.fillRect(0, 0, size, size);
  const n = 8, w = size / n;
  for (let i = 0; i < n; i++) {
    const g = ctx.createLinearGradient(i * w, 0, i * w + w, 0);
    g.addColorStop(0, '#f2f3f4'); g.addColorStop(0.08, '#bfc2c5'); g.addColorStop(0.5, '#dfe1e3'); g.addColorStop(1, '#c9ccce');
    ctx.fillStyle = g; ctx.fillRect(i * w, 0, w, size);
  }
  return c;
}

function fieldTex(size) {
  const c = canvas(size), ctx = c.getContext('2d'), rng = mulberry32(21);
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 8) { ctx.fillStyle = `rgba(0,0,0,${0.10 + rng() * 0.06})`; ctx.fillRect(0, y, size, 3); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, y + 4, size, 2); }
  for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},0.06)`; ctx.fillRect(rng() * size, rng() * size, 2, 2); }
  return c;
}

function waterNormalTex(size) {
  // height from summed sines -> normal map (tileable)
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rng = mulberry32(99);
  const waves = [];
  for (let i = 0; i < 9; i++) waves.push({ kx: Math.round((rng() - 0.5) * 12), ky: Math.round((rng() - 0.5) * 12) || 1, p: rng() * 6.28, a: 0.5 + rng() });
  const h = (x, y) => { let s = 0; for (const w of waves) s += w.a * Math.sin((w.kx * x + w.ky * y) * Math.PI * 2 / size + w.p); return s; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    let nx = -dx * 1.2, ny = -dy * 1.2, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * size + x) * 4;
    img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function radialTex(size, stops) {
  const c = canvas(size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

function aoTex(size) {
  // soft square shadow used under buildings (contact shadow)
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = Math.abs(x / (size - 1) * 2 - 1), v = Math.abs(y / (size - 1) * 2 - 1);
    const d = Math.max(u, v);
    const a = d < 0.5 ? 1 : Math.max(0, 1 - (d - 0.5) / 0.5);
    const o = (y * size + x) * 4;
    img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 0; img.data[o + 3] = Math.round(Math.pow(a, 1.6) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`Bild fehlt: ${url}`));
    im.src = url;
  });
}

// realistic textures generated with OpenArt (see tools/process_assets.py)
async function loadPhotoTextures(quality) {
  const big = (quality.atlas || 128) >= 256;
  const base = 'assets/';
  const res = await fetch(base + 'atlas/atlas.json');
  if (!res.ok) throw new Error('atlas.json fehlt');
  const manifest = await res.json();
  const [ci, ei, oi] = await Promise.all([
    loadImage(`${base}atlas/facade_color_${big ? '4k' : '2k'}.jpg`),
    loadImage(`${base}atlas/facade_emis_${big ? '2k' : '1k'}.jpg`),
    loadImage(`${base}atlas/facade_orm_${big ? '2k' : '1k'}.jpg`),
  ]);
  const A = new Atlas(ci.width / 16, ei.width / 16);
  A.cColor.getContext('2d').drawImage(ci, 0, 0);
  A.cEmis.getContext('2d').drawImage(ei, 0, 0);
  A.cOrm.getContext('2d').drawImage(oi, 0, 0);
  let maxIdx = 0;
  for (const [n, idx] of Object.entries(manifest.cells)) { A.cells[n] = { idx, w: 1 }; maxIdx = Math.max(maxIdx, idx); }
  A.next = maxIdx + 1;
  A.nextSign = manifest.signStart;
  paintSigns(A);
  A.build();
  A.photo = true;
  const names = ['grass', 'cobble', 'asphalt', 'dirt', 'sand', 'gravel', 'field', 'roof_tile', 'roof_metal', 'leaves', 'needles'];
  const imgs = await Promise.all(names.map((n) => loadImage(`${base}tex/${n}.jpg`)));
  const out = { atlas: A };
  names.forEach((n, i) => {
    const t = new THREE.Texture(imgs[i]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.needsUpdate = true;
    out[n] = t;
  });
  return {
    atlas: A, grass: out.grass, cobble: out.cobble, asphalt: out.asphalt, dirt: out.dirt, sand: out.sand,
    gravel: out.gravel, field: out.field, roofTile: out.roof_tile, roofMetal: out.roof_metal,
    leaves: out.leaves, needles: out.needles, photo: true,
  };
}

function commonTextures(T) {
  T.waterNormal = tex(waterNormalTex(256), false, true);
  T.glow = tex(radialTex(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]));
  T.pool = tex(radialTex(128, [[0, 'rgba(255,214,150,0.9)'], [0.4, 'rgba(255,190,110,0.35)'], [1, 'rgba(255,170,90,0)']]));
  T.soft = tex(radialTex(64, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]));
  T.ao = tex(aoTex(64), false);
  T.ao.colorSpace = THREE.NoColorSpace;
  return T;
}

export async function loadTextures(quality) {
  if (!quality.procedural) {
    try { return commonTextures(await loadPhotoTextures(quality)); } catch (e) { console.warn('Fotoreale Texturen nicht verfügbar, nutze prozedurale.', e); }
  }
  return makeTextures(quality);
}

export function makeTextures(quality) {
  const cellPx = quality.atlas || 128;
  const atlas = buildAtlas(cellPx);
  const gs = quality.ground || 512;
  const T = {
    atlas,
    grass: tex(grassTex(gs), true, true),
    cobble: tex(cobbleTex(gs), true, true),
    asphalt: tex(noiseTex(gs, '#626568', ['#2b2d30', '#8a8d90', '#3f4245'], 5, 0.5), true, true),
    dirt: tex(noiseTex(gs, '#d9c4a8', ['#6b4f36', '#a88a68', '#f0e2cc'], 8, 0.6), true, true),
    sand: tex(noiseTex(gs / 2, '#efe0b8', ['#c9b182', '#fff6dc'], 9, 0.6), true, true),
    gravel: tex(noiseTex(gs / 2, '#d4d4d0', ['#8d8d88', '#f4f4f0', '#a9a39a'], 12, 0.7), true, true),
    field: tex(fieldTex(gs / 2), true, true),
    roofTile: tex(roofTileTex(256), true, true),
    roofMetal: tex(metalRoofTex(128), true, true),
    photo: false,
  };
  return commonTextures(T);
}
