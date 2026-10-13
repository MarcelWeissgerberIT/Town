import { col, shade, pick, randRange, randInt, mulberry32 } from './util.js';
import { PLASTER_KEYS, APT, GLASS } from './textures.js';
import { ROOF_COLS, AWNING_COLS, SHOP_TYPES, CAR_COLS } from './config.js';
import * as MD from './models.js';
import { VEH } from './vehicles.js';
import * as H from './houses.js';
import * as CM from './commerce.js';

// ---------------------------------------------------------------------------
// Procedural buildings. Every generator draws into a Builder whose transform
// is already set to the lot centre; the lot's street side is local +z.
// ---------------------------------------------------------------------------

let A = null;
export function initBuildgen(atlas) { A = atlas; }

const C = col;
const W1 = [1, 1, 1];
export const STONE = C('#a39d92');
export const WHITE = C('#f3f1ec');
const DARKM = C('#3a3d42');

// ---- facade tints: plaster cells are stored once (neutral) and tinted per house.
// `wall_cream` resolves to the base `wall` with the cream tint; an unsuffixed
// tintable cell takes the tint set for the house currently being generated.
export const PALETTE = {
  cream: '#efe2c3', yellow: '#f0c862', pink: '#e9a39b', salmon: '#e58f6c', mint: '#a7cf9f', blue: '#9db8d6', white: '#f2efe8', sand: '#dbbf96',
  grey: '#c6c9c6', beige: '#e2d1b4', terracotta: '#cf8e6a',
};
const SUFFIX = /^(.+)_(cream|yellow|pink|salmon|mint|blue|white|sand|grey|beige|terracotta)$/;
const RES = new Map();
let TINT = null;
const tmpC = { r: 0, g: 0, b: 0 };
function lin(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
export function tintColor(hex) {
  const c = col(hex);
  const n = A.neutral;
  return [c[0] / lin(n[0]), c[1] / lin(n[1]), c[2] / lin(n[2])];
}
const TC = new Map();
function tintOfHex(hex) { let t = TC.get(hex); if (!t) { t = tintColor(hex); TC.set(hex, t); } return t; }
// sets the plaster colour for the following tintable cells (hex or null)
export function setTint(hex) { TINT = hex ? tintOfHex(hex) : null; }
function resolve(cell) {
  let r = RES.get(cell);
  if (r) return r;
  r = { cell, tint: null };
  if (A.tint.has(cell)) r.tint = 'cur';
  else if (!A.cells[cell] || A.photo) {
    const m = SUFFIX.exec(cell);
    if (m) {
      let base = m[1];
      if (base === 'win_s' && (m[2] === 'mint' || m[2] === 'blue' || m[2] === 'pink')) base = 'win_sw';
      if (A.tint.has(base)) r = { cell: base, tint: tintOfHex(PALETTE[m[2]]) };
    }
  }
  RES.set(cell, r);
  return r;
}
export function tintOf(cell) { const r = resolve(cell); return r.tint === 'cur' ? (TINT || W1) : (r.tint || W1); }
export function uvq(cell) { const u = A.uv(resolve(cell).cell); return [u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]]; }
const NOLIT = /^(wall_|fw_wall|br_wall|apt_wall|stone_wall|raw|ch_wall|metal_(grey|blue|white))/;
export function litOf(cell, rng) {
  if (cell.startsWith('sign_') || cell === 'redcross' || cell === 'clock') return 0.01;
  if (cell.startsWith('shop')) return 0.025 + rng() * 0.05;
  if (NOLIT.test(cell)) return 0;
  if (cell.includes('door') || cell.startsWith('ch_') || cell === 'metal_dock') return 0.02 + rng() * 0.08;
  return 0.06 + rng() * 0.94;
}
export function fq(B, cell, p0, p1, p2, p3, rng) { B.quad('facade', p0, p1, p2, p3, tintOf(cell), uvq(cell), litOf(cell, rng)); }

// wall from a to b (outside is to the right when walking a->b seen from above)
export function facade(B, rng, ax, az, bx, bz, y0, fhs, pickCell, bay = 0.2) {
  const len = Math.hypot(bx - ax, bz - az);
  const nb = Math.max(1, Math.round(len / bay));
  let y = y0;
  for (let f = 0; f < fhs.length; f++) {
    const h = fhs[f];
    for (let k = 0; k < nb; k++) {
      const t0 = k / nb, t1 = (k + 1) / nb;
      const cell = pickCell(f, k, nb);
      if (!cell) continue;
      fq(B, cell, [ax + (bx - ax) * t0, y, az + (bz - az) * t0], [ax + (bx - ax) * t1, y, az + (bz - az) * t1],
        [ax + (bx - ax) * t1, y + h, az + (bz - az) * t1], [ax + (bx - ax) * t0, y + h, az + (bz - az) * t0], rng);
    }
    y += h;
  }
  return nb;
}
// sides: 0 front (+z), 1 right (+x), 2 back (-z), 3 left (-x)
export function boxWalls(B, rng, x0, z0, x1, z1, y0, fhs, pickSide, bay = 0.2) {
  facade(B, rng, x0, z1, x1, z1, y0, fhs, (f, k, nb) => pickSide(0, f, k, nb), bay);
  facade(B, rng, x1, z1, x1, z0, y0, fhs, (f, k, nb) => pickSide(1, f, k, nb), bay);
  facade(B, rng, x1, z0, x0, z0, y0, fhs, (f, k, nb) => pickSide(2, f, k, nb), bay);
  facade(B, rng, x0, z0, x0, z1, y0, fhs, (f, k, nb) => pickSide(3, f, k, nb), bay);
}
export function gableTri(B, rng, ax, az, bx, bz, y0, h, cell) {
  const u = uvq(cell);
  B.tri('facade', [ax, y0, az], [bx, y0, bz], [(ax + bx) / 2, y0 + h, (az + bz) / 2], tintOf(cell), [u[0], u[1], u[2], u[1], (u[0] + u[2]) / 2, u[5]], litOf(cell, rng));
}

// ---- roofs
export function gableRoof(B, w, d, y0, h, rc, opts = {}) {
  const o = opts.over ?? 0.045, og = opts.gover ?? 0.03, t = opts.t ?? 0.022;
  const ex = w / 2 + og, ez = d / 2 + o, yr = y0 + h, ye = y0 - o * h / (d / 2);
  const L = Math.hypot(ez, yr - ye), S = opts.S || 0.36;
  const c = Array.isArray(rc) ? rc : C(rc);
  const bk = opts.bucket || 'roof';
  const uv = [-ex / S, 0, ex / S, 0, ex / S, L / S, -ex / S, L / S];
  B.quad(bk, [-ex, ye, ez], [ex, ye, ez], [ex, yr, 0], [-ex, yr, 0], c, uv);
  B.quad(bk, [ex, ye, -ez], [-ex, ye, -ez], [-ex, yr, 0], [ex, yr, 0], c, uv);
  const fc = opts.fascia ? C(opts.fascia) : shade(c, 0.55);
  B.quad('solid', [-ex, ye - t, ez], [ex, ye - t, ez], [ex, ye, ez], [-ex, ye, ez], fc);
  B.quad('solid', [ex, ye - t, -ez], [-ex, ye - t, -ez], [-ex, ye, -ez], [ex, ye, -ez], fc);
  B.quad('solid', [ex, ye - t, ez], [ex, yr - t, 0], [ex, yr, 0], [ex, ye, ez], fc);
  B.quad('solid', [ex, yr - t, 0], [ex, ye - t, -ez], [ex, ye, -ez], [ex, yr, 0], fc);
  B.quad('solid', [-ex, yr - t, 0], [-ex, ye - t, ez], [-ex, ye, ez], [-ex, yr, 0], fc);
  B.quad('solid', [-ex, ye - t, -ez], [-ex, yr - t, 0], [-ex, yr, 0], [-ex, ye, -ez], fc);
  if (opts.ridge !== false) B.box('solid', -ex, yr - 0.012, -0.018, ex, yr + 0.018, 0.018, shade(c, 0.78));
}
export function hipRoof(B, w, d, y0, h, rc, opts = {}) {
  if (d > w) { B.push(0, 0, Math.PI / 2); hipRoof(B, d, w, y0, h, rc, opts); B.pop(); return; }
  const o = opts.over ?? 0.045, t = 0.022;
  const ex = w / 2 + o, ez = d / 2 + o, yr = y0 + h, ye = y0 - o * h / (d / 2);
  const rx = Math.max(0, ex - ez);
  const c = Array.isArray(rc) ? rc : C(rc);
  const bk = opts.bucket || 'roof', S = 0.36;
  const L = Math.hypot(ez, yr - ye);
  B.quad(bk, [-ex, ye, ez], [ex, ye, ez], [rx, yr, 0], [-rx, yr, 0], c, [-ex / S, 0, ex / S, 0, rx / S, L / S, -rx / S, L / S]);
  B.quad(bk, [ex, ye, -ez], [-ex, ye, -ez], [-rx, yr, 0], [rx, yr, 0], c, [-ex / S, 0, ex / S, 0, rx / S, L / S, -rx / S, L / S]);
  B.tri(bk, [ex, ye, ez], [ex, ye, -ez], [rx, yr, 0], c, [-ez / S, 0, ez / S, 0, 0, L / S]);
  B.tri(bk, [-ex, ye, -ez], [-ex, ye, ez], [-rx, yr, 0], c, [-ez / S, 0, ez / S, 0, 0, L / S]);
  const fc = shade(c, 0.55);
  B.quad('solid', [-ex, ye - t, ez], [ex, ye - t, ez], [ex, ye, ez], [-ex, ye, ez], fc);
  B.quad('solid', [ex, ye - t, -ez], [-ex, ye - t, -ez], [-ex, ye, -ez], [ex, ye, -ez], fc);
  B.quad('solid', [ex, ye - t, ez], [ex, ye - t, -ez], [ex, ye, -ez], [ex, ye, ez], fc);
  B.quad('solid', [-ex, ye - t, -ez], [-ex, ye - t, ez], [-ex, ye, ez], [-ex, ye, -ez], fc);
  if (rx > 0.01) B.box('solid', -rx, yr - 0.012, -0.016, rx, yr + 0.016, 0.016, shade(c, 0.78));
  if (opts.spire) {
    B.cyl('solid', 0, yr, 0, 0.012, opts.spire, 6, C('#3a3a3a'), { r1: 0.002 });
  }
}
export function flatRoof(B, x0, z0, x1, z1, y, opts = {}) {
  B.rect('flat', x0, z0, x1, z1, y + 0.001, opts.col ? C(opts.col) : C('#c9c6be'), 0.5);
  const ph = opts.parapet ?? 0.035, t = 0.022, pc = opts.pcol ? C(opts.pcol) : C('#d9d6cf');
  if (ph > 0) {
    B.box('solid', x0 - 0.004, y, z1 - t, x1 + 0.004, y + ph, z1 + 0.004, pc);
    B.box('solid', x0 - 0.004, y, z0 - 0.004, x1 + 0.004, y + ph, z0 + t, pc);
    B.box('solid', x0 - 0.004, y, z0 + t, x0 + t, y + ph, z1 - t, pc);
    B.box('solid', x1 - t, y, z0 + t, x1 + 0.004, y + ph, z1 - t, pc);
  }
}
export function rooftopStuff(B, rng, x0, z0, x1, z1, y, n = 3) {
  for (let i = 0; i < n; i++) {
    const w = randRange(rng, 0.06, 0.14), d = randRange(rng, 0.06, 0.12), h = randRange(rng, 0.04, 0.09);
    const x = randRange(rng, x0 + 0.05 + w / 2, x1 - 0.05 - w / 2), z = randRange(rng, z0 + 0.05 + d / 2, z1 - 0.05 - d / 2);
    const c = pick(rng, ['#b9bcbf', '#9fa4a8', '#d4d6d8', '#8d9296']);
    B.box('solid', x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, C(c));
    if (rng() < 0.4) B.cyl('solid', x, y + h, z, Math.min(w, d) * 0.3, 0.012, 8, C('#6f7478'));
  }
}
export function solarPanels(B, x0, z0, x1, z1, y) {
  for (let x = x0; x + 0.09 <= x1; x += 0.11) for (let z = z0; z + 0.07 <= z1; z += 0.1) {
    B.quad('glass', [x, y + 0.01, z + 0.07], [x + 0.09, y + 0.01, z + 0.07], [x + 0.09, y + 0.045, z], [x, y + 0.045, z], C('#1f3554'));
  }
}
export function dormer(B, rng, x, zf, yb, dw, dh, depth, winCell, sideCell, rc, bucket = 'roof') {
  fq(B, winCell, [x - dw / 2, yb - 0.04, zf], [x + dw / 2, yb - 0.04, zf], [x + dw / 2, yb + dh, zf], [x - dw / 2, yb + dh, zf], rng);
  fq(B, sideCell, [x + dw / 2, yb - 0.04, zf], [x + dw / 2, yb - 0.04, zf - depth], [x + dw / 2, yb + dh, zf - depth], [x + dw / 2, yb + dh, zf], rng);
  fq(B, sideCell, [x - dw / 2, yb - 0.04, zf - depth], [x - dw / 2, yb - 0.04, zf], [x - dw / 2, yb + dh, zf], [x - dw / 2, yb + dh, zf - depth], rng);
  const rh = dw * 0.42;
  gableTri(B, rng, x - dw / 2, zf, x + dw / 2, zf, yb + dh, rh, sideCell);
  B.push(x, zf - depth / 2, Math.PI / 2);
  gableRoof(B, depth, dw, yb + dh, rh, rc, { over: 0.018, gover: 0.02, t: 0.012, ridge: false, bucket });
  B.pop();
}
export function chimney(B, x, z, y0, y1, c = '#9b4a35') {
  B.box('solid', x - 0.032, y0, z - 0.032, x + 0.032, y1, z + 0.032, C(c));
  B.box('solid', x - 0.04, y1, z - 0.04, x + 0.04, y1 + 0.018, z + 0.04, C('#5d5a56'));
}
export function plinth(B, x0, z0, x1, z1, h = 0.045, c = STONE) {
  B.box('solid', x0 - 0.01, 0, z0 - 0.01, x1 + 0.01, h, z1 + 0.01, c);
}
export function cornice(B, x0, z0, x1, z1, y, h = 0.022, o = 0.014, c = WHITE) {
  B.box('solid', x0 - o, y, z0 - o, x1 + o, y + h, z1 + o, c);
}
export function aoDecal(B, x0, z0, x1, z1, m = 0.09) {
  B.quad('ao', [x0 - m, 0.0085, z1 + m], [x1 + m, 0.0085, z1 + m], [x1 + m, 0.0085, z0 - m], [x0 - m, 0.0085, z0 - m], W1, [0, 0, 1, 0, 1, 1, 0, 1]);
}
export function sign(B, rng, key, cx, y, z, w) {
  const h = w / 4;
  B.box('solid', cx - w / 2 - 0.006, y - 0.006, z, cx + w / 2 + 0.006, y + h + 0.006, z + 0.01, C('#2b2b2b'));
  fq(B, `sign_${key}`, [cx - w / 2, y, z + 0.0105], [cx + w / 2, y, z + 0.0105], [cx + w / 2, y + h, z + 0.0105], [cx - w / 2, y + h, z + 0.0105], rng);
}
export function awning(B, x0, x1, yTop, z, depth, drop, cols) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.032));
  const zo = z + depth, yl = yTop - drop;
  for (let i = 0; i < n; i++) {
    const a = x0 + (x1 - x0) * i / n, b = x0 + (x1 - x0) * (i + 1) / n;
    const c = C(cols[i % 2]);
    B.quad('solid', [a, yl, zo], [b, yl, zo], [b, yTop, z], [a, yTop, z], c);
    B.quad('solid', [a, yl - 0.022, zo], [b, yl - 0.022, zo], [b, yl, zo], [a, yl, zo], shade(c, 0.9));
  }
  B.tri('solid', [x1, yl - 0.022, zo], [x1, yTop, z], [x1, yl, zo], C(cols[0]));
  B.tri('solid', [x0, yTop, z], [x0, yl - 0.022, zo], [x0, yl, zo], C(cols[0]));
}
let PHOTO = false;
export function setPhotoMode(on) { PHOTO = on; }
export function hedge(B, x0, z0, x1, z1, h = 0.07, c = '#4b7a33') {
  if (PHOTO) B.box('hedge', x0, 0, z0, x1, h, z1, C('#a9c49a'), { s: 0.18 });
  else B.box('grass', x0, 0, z0, x1, h, z1, C(c), { s: 0.5 });
}
export function picketFence(B, x0, x1, z, gapX = null, h = 0.06, c = WHITE) {
  for (let x = x0; x <= x1 + 1e-6; x += 0.042) {
    if (gapX !== null && Math.abs(x - gapX) < 0.055) continue;
    B.box('solid', x - 0.005, 0, z - 0.005, x + 0.005, h, z + 0.005, c);
  }
  const segs = gapX === null ? [[x0, x1]] : [[x0, gapX - 0.055], [gapX + 0.055, x1]];
  for (const [a, b] of segs) if (b > a) {
    B.box('solid', a, h * 0.3, z - 0.003, b, h * 0.3 + 0.008, z + 0.003, c);
    B.box('solid', a, h * 0.72, z - 0.003, b, h * 0.72 + 0.008, z + 0.003, c);
  }
}
const PARK_PAINT = { fire: '#d42a1f', police: '#f4f5f4', ambulance: '#f6f6f2' };
export function parkedCar(B, x, z, a, rng, kind = 'car') {
  B.push(x, z, a);
  if (kind === 'car') kind = pick(rng, ['car', 'car', 'hatch', 'hatch', 'kombi']);
  const pc = C(PARK_PAINT[kind] || pick(rng, CAR_COLS));
  VEH[kind](B, 'veh', pc, { parked: true });
  B.pop();
}
export function parking(B, rng, x0, z0, x1, z1, along = 'x', cars = 0.6) {
  B.rect('asphalt', x0, z0, x1, z1, 0.005, C('#d0d0d0'), 2);
  if (along === 'x') {
    for (let x = x0 + 0.02; x + 0.2 <= x1; x += 0.22) {
      B.box('solid', x, 0.005, z0 + 0.02, x + 0.012, 0.0075, z1 - 0.02, WHITE);
      if (rng() < cars) parkedCar(B, x + 0.11, (z0 + z1) / 2, Math.PI / 2, rng);
    }
  } else {
    for (let z = z0 + 0.02; z + 0.2 <= z1; z += 0.22) {
      B.box('solid', x0 + 0.02, 0.005, z, x1 - 0.02, 0.0075, z + 0.012, WHITE);
      if (rng() < cars) parkedCar(B, (x0 + x1) / 2, z + 0.11, 0, rng);
    }
  }
}
export const BIN_COLS = ['#4a4f55', '#2f5fae', '#6b4a2a', '#e6b422', '#3f7a3a'];

export function balconyRow(B, x0, x1, z, y, depth = 0.07, rail = 'glass') {
  B.box('solid', x0, y - 0.012, z, x1, y, z + depth, C('#e8e6e0'));
  if (rail === 'glass') {
    B.box('glass', x0, y, z + depth - 0.006, x1, y + 0.055, z + depth, C('#9fc1d6'));
    B.box('solid', x0 - 0.002, y + 0.055, z + depth - 0.008, x1 + 0.002, y + 0.06, z + depth + 0.002, C('#4a4f55'));
  } else {
    for (let x = x0 + 0.005; x < x1; x += 0.018) B.box('solid', x, y, z + depth - 0.004, x + 0.004, y + 0.05, z + depth, C('#2f3236'));
    B.box('solid', x0, y + 0.05, z + depth - 0.006, x1, y + 0.058, z + depth + 0.002, C('#2f3236'));
  }
  B.box('solid', x0, y, z, x0 + 0.006, y + 0.055, z + depth, C('#e8e6e0'));
  B.box('solid', x1 - 0.006, y, z, x1, y + 0.055, z + depth, C('#e8e6e0'));
}

export function resL3(B, rng, meta, force) {
  const modern = force ? force === 'modern' : rng() < 0.5;
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, 0.36, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  meta.trees.push([-0.36, -0.38, 'round', 0.9], [0.36, -0.38, pick(rng, ['round', 'tall']), 0.9]);
  if (!modern) {
    const pk = pick(rng, ['cream', 'yellow', 'white', 'sand', 'pink', 'blue']);
    const ws = pick(rng, ['win_p', 'win_p', 'win_a', 'win_s', 'win_g', 'win_r']);
    const w = 0.9, d = 0.66, fz = 0.42, floors = 5, fh = 0.27;
    B.push(0, fz - d / 2);
    plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.06, C('#b5aa98'));
    aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
    const fhs = Array(floors).fill(fh);
    const nb = 4, doorK = 1 + Math.floor(rng() * 2);
    boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
      if (s === 0 && f === 0 && k === doorK) return `door_${pk}`;
      if (s % 2 === 1 && k % 2 === 1) return `wall_${pk}`;
      return `${ws}_${pk}`;
    }, w / nb);
    for (let f = 1; f < floors; f++) cornice(B, -w / 2, -d / 2, w / 2, d / 2, f * fh - 0.008, 0.014, 0.008, WHITE);
    const yw = floors * fh;
    cornice(B, -w / 2, -d / 2, w / 2, d / 2, yw - 0.025, 0.03, 0.022, WHITE);
    for (let f = 1; f < floors - 1; f++) if (rng() < 0.7) balconyRow(B, -w / 2 + w / nb * doorK + 0.015, -w / 2 + w / nb * (doorK + 1) - 0.015, d / 2, f * fh + 0.012, 0.06, 'iron');
    const h = 0.32;
    const rs = H.roofStyle(rng);
    const rc = rs.rc;
    hipRoof(B, w, d, yw, h, rc, { bucket: rs.bk });
    for (let i = 0; i < 3; i++) dormer(B, rng, -w / 2 + w * (i + 0.5) / 3, d / 2 * 0.55, yw + h * 0.4, 0.12, 0.1, 0.14, `win_p_${pk}`, `wall_${pk}`, rc);
    chimney(B, -w * 0.3, -0.05, yw + h * 0.5, yw + h + 0.05);
    chimney(B, w * 0.3, -0.05, yw + h * 0.5, yw + h + 0.05);
    B.pop();
    meta.door = [-w / 2 + (doorK + 0.5) * w / nb, fz + 0.03];
    meta.height = yw + h;
    meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: h, mat: 'brick' };
  } else {
    const ak = pick(rng, Object.keys(APT));
    const w = 0.88, d = 0.68, fz = 0.4, floors = randInt(rng, 5, 7), fh = 0.27;
    B.push(0, fz - d / 2);
    aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
    const fhs = Array(floors).fill(fh);
    const nb = 4;
    boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
      if (s === 0 && f === 0) return k === 1 ? `apt_door_${ak}` : `apt_win_${ak}`;
      if (s === 1 || s === 3) return (k % 2 === 0) ? `apt_win_${ak}` : `apt_wall_${ak}`;
      return (k === 1 || k === 2) ? `apt_bal_${ak}` : `apt_win_${ak}`;
    }, w / nb);
    const yw = floors * fh;
    for (let f = 1; f < floors; f++) {
      balconyRow(B, -w / 2 + 0.01, -w / 2 + w / 2 - 0.01, d / 2, f * fh + 0.005, 0.075);
      balconyRow(B, 0.01, w / 2 - 0.01, d / 2, f * fh + 0.005, 0.075);
      B.push(0, 0, Math.PI);
      balconyRow(B, -w / 4, w / 4, d / 2, f * fh + 0.005, 0.06, 'iron');
      B.pop();
    }
    flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, yw, { parapet: 0.04 });
    B.box('solid', -0.12, yw, -0.1, 0.08, yw + 0.12, 0.08, C(APT[ak]));
    solarPanels(B, -w / 2 + 0.06, -d / 2 + 0.06, -0.15, d / 2 - 0.06, yw);
    solarPanels(B, 0.12, -d / 2 + 0.06, w / 2 - 0.06, d / 2 - 0.08, yw);
    B.pop();
    meta.door = [-w / 2 + 1.5 * w / nb, fz + 0.03];
    meta.height = yw + 0.12;
    meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: 0, mat: 'conc' };
    // bike racks & benches
    MD.bench(B, 0.3, 0.46, 0);
  }
}

export function plazaGround(B, rng, LW, LD, meta) {
  B.rect('cobble', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#ebe4d8'), 1.1);
  for (const [x, z] of [[-LW / 2 + 0.22, LD / 2 - 0.2], [LW / 2 - 0.22, LD / 2 - 0.2], [-LW / 2 + 0.2, -LD / 2 + 0.2], [LW / 2 - 0.2, -LD / 2 + 0.2]]) {
    B.cyl('solid', x, 0, z, 0.1, 0.035, 10, C('#bdb6aa'), { top: C('#5f8f3a') });
    meta.trees.push([x, z, pick(rng, ['round', 'tall']), randRange(rng, 0.9, 1.15)]);
  }
}

export function resL4(B, rng, meta, LW, LD) {
  plazaGround(B, rng, LW, LD, meta);
  const ak = pick(rng, Object.keys(APT));
  const w = randRange(rng, 1.05, 1.2), d = randRange(rng, 0.9, 1.05);
  const floors = randInt(rng, 14, 26), fh = 0.27;
  const fhs = Array(floors).fill(fh);
  B.push(0, -0.12);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2, 0.12);
  const nb = Math.round(w / 0.22);
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k, n) => {
    if (f === 0) return (s === 0 && k === Math.floor(n / 2)) ? `apt_door_${ak}` : 'glass_dark';
    if ((k === 0 || k === n - 1)) return `apt_win_${ak}`;
    return (f % 2 === 0) ? `apt_bal_${ak}` : `apt_win_${ak}`;
  }, w / nb);
  // floor slabs for a banded look
  for (let f = 1; f < floors; f++) {
    if (f % 2) cornice(B, -w / 2, -d / 2, w / 2, d / 2, f * fh - 0.006, 0.014, 0.01, C('#e9e7e1'));
  }
  const yw = floors * fh;
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, yw, { parapet: 0.05 });
  B.box('solid', -0.2, yw, -0.15, 0.15, yw + 0.18, 0.12, C(APT[ak]));
  rooftopStuff(B, rng, -w / 2, -d / 2, w / 2, d / 2, yw, 3);
  B.cyl('solid', 0.3, yw, 0.25, 0.08, 0.12, 10, C('#9da3a8'));
  B.pop();
  meta.door = [0, -0.12 + d / 2 + 0.04];
  meta.height = yw + 0.2;
  meta.lamps.push([-0.8, 0.85], [0.8, 0.85]);
  MD.lampPost(B, -0.8, 0.85); MD.lampPost(B, 0.8, 0.85);
  MD.bench(B, -0.4, 0.75, 0); MD.bench(B, 0.4, 0.75, 0);
  meta.shell = { x0: -w / 2, z0: -0.12 - d / 2, x1: w / 2, z1: -0.12 + d / 2, fhs, roofH: 0, mat: 'conc' };
}

// --------------------------------------------------------- commercial
export function shopProps(B, rng, out, fz, w) {
  if (out === 'cafe') {
    const uc = pick(rng, [C('#ffffff'), C('#e74c3c'), C('#2e7d4f'), C('#f2c230')]);
    for (let i = 0; i < 3; i++) MD.umbrellaTable(B, -w / 2 + 0.12 + i * (w - 0.24) / 2, fz + 0.11, uc);
  } else if (out === 'grocer') {
    const fr = ['#d7262e', '#f39c1f', '#7bb33a', '#f4d03f', '#8e3b8e', '#e8582a'];
    for (let i = 0; i < 4; i++) MD.crate(B, -w / 2 + 0.1 + i * 0.075, fz + 0.06, C(fr[i % fr.length]));
    for (let i = 0; i < 3; i++) MD.crate(B, w / 2 - 0.25 + i * 0.075, fz + 0.06, C(fr[(i + 3) % fr.length]));
  } else if (out === 'bakery') {
    MD.bench(B, -w / 4, fz + 0.1, 0);
    B.push(w / 4, fz + 0.09, 0.2);
    B.quad('solid', [-0.025, 0, 0.012], [0.025, 0, 0.012], [0.025, 0.07, 0], [-0.025, 0.07, 0], C('#2b2b2b'));
    B.quad('solid', [0.025, 0, -0.012], [-0.025, 0, -0.012], [-0.025, 0.07, 0], [0.025, 0.07, 0], C('#2b2b2b'));
    B.pop();
  } else if (out === 'flowers') {
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 0.08 + i * 0.06;
      B.cyl('solid', x, 0, fz + 0.06, 0.018, 0.03, 6, C('#3b5a3b'));
      B.sphere('solid', x, 0.045, fz + 0.06, 0.024, 0.02, 0.024, C(pick(rng, ['#e23b4b', '#ff6f91', '#ffcf3f', '#b54ad8', '#ffffff'])), 6, 3);
    }
  }
}

export function comL1(B, rng, meta) {
  const shop = pick(rng, SHOP_TYPES);
  meta.shop = shop;
  const pk = pick(rng, PLASTER_KEYS);
  const w = randRange(rng, 0.7, 0.8), d = randRange(rng, 0.46, 0.52);
  const fz = shop.out ? 0.27 : 0.35;
  B.rect('cobble', -0.5, fz - 0.02, 0.5, 0.5, 0.005, C('#efe7da'), 1.1);
  B.rect('grass', -0.5, -0.5, 0.5, fz - 0.02, 0.004, C('#eef2e0'), 3);
  hedge(B, -0.48, -0.48, 0.48, -0.44);
  for (let i = 0; i < 2; i++) MD.bin(B, 0.4 - i * 0.045, fz - d - 0.04, C(BIN_COLS[i + 1]));
  if (rng() < 0.6) meta.trees.push([pick(rng, [-0.32, 0.32]), -0.34, 'round', 0.9]);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.03);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const fh0 = 0.31, fh = 0.25, ups = rng() < 0.35 ? 2 : 1;
  const upWin = `${pick(rng, ['win_s', 'win_r', 'win_g', 'win_p', 'win_a', 'win_b'])}_${pk}`;
  const nb = Math.max(3, Math.round(w / 0.2));
  const doorK = rng() < 0.5 ? nb - 1 : 0;
  const fhs = [fh0]; for (let i = 0; i < ups; i++) fhs.push(fh);
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
    if (f === 0) {
      if (s === 0) return k === doorK ? 'shopdoor' : `shop_${shop.k}`;
      return rng() < 0.5 ? `wall_${pk}` : `win_p_${pk}`;
    }
    return (s === 0 || k % 2 === 0) ? upWin : `win_p_${pk}`;
  }, w / nb);
  const yw = fhs.reduce((a, b) => a + b, 0);
  const sx0 = doorK === 0 ? -w / 2 + w / nb : -w / 2, sx1 = doorK === 0 ? w / 2 : w / 2 - w / nb;
  sign(B, rng, shop.sign, (sx0 + sx1) / 2, fh0 - 0.04, d / 2, Math.min(0.3, (sx1 - sx0) * 0.8));
  awning(B, sx0 + 0.01, sx1 - 0.01, fh0 - 0.045, d / 2, 0.13, 0.055, pick(rng, AWNING_COLS));
  const rs = H.roofStyle(rng);
  const rc = rs.rc;
  let h;
  const rr = rng();
  if (rr < 0.25) {
    h = (d / 2) * Math.tan(0.85);
    const yk = H.halfHipRoof(B, w, d, yw, h, rs, 0.62);
    gableTri(B, rng, w / 2, d / 2, w / 2, -d / 2, yw, yk - yw, `wall_${pk}`);
    gableTri(B, rng, -w / 2, -d / 2, -w / 2, d / 2, yw, yk - yw, `wall_${pk}`);
  } else if (rr < 0.65) {
    h = (d / 2) * Math.tan(0.85);
    gableRoof(B, w, d, yw, h, rc, { bucket: rs.bk });
    gableTri(B, rng, w / 2, d / 2, w / 2, -d / 2, yw, h, `gable_${pk}`);
    gableTri(B, rng, -w / 2, -d / 2, -w / 2, d / 2, yw, h, `gable_${pk}`);
    if (rng() < 0.6) dormer(B, rng, 0, d / 2 * 0.62, yw + h * 0.38, 0.13, 0.1, 0.15, `win_p_${pk}`, `wall_${pk}`, rc, rs.bk);
  } else {
    h = (w / 2) * Math.tan(0.9);
    B.push(0, 0, Math.PI / 2); gableRoof(B, d, w, yw, h, rc, { bucket: rs.bk }); B.pop();
    gableTri(B, rng, -w / 2, d / 2, w / 2, d / 2, yw, h, `gable_${pk}`);
    gableTri(B, rng, w / 2, -d / 2, -w / 2, -d / 2, yw, h, `gable_${pk}`);
  }
  if (rng() < 0.6) chimney(B, -w * 0.28, -d * 0.15, yw + h * 0.3, yw + h + 0.06);
  B.pop();
  shopProps(B, rng, shop.out, fz, w);
  meta.door = [-w / 2 + (doorK + 0.5) * w / nb, fz + 0.03];
  meta.height = yw + h;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: h, mat: 'brick' };
}

export function comL2(B, rng, meta) {
  const shop = pick(rng, SHOP_TYPES);
  meta.shop = shop;
  const stone = rng() < 0.5;
  const pk = pick(rng, PLASTER_KEYS), sk = pick(rng, ['beige', 'grey']);
  const w = 0.9, d = randRange(rng, 0.62, 0.7), fz = 0.4, floors = randInt(rng, 3, 4);
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C('#e8e1d4'), 1.1);
  B.push(0, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const fhs = [0.32]; for (let i = 1; i < floors; i++) fhs.push(0.27);
  const nb = 4, doorK = rng() < 0.5 ? 0 : 3;
  const up = stone ? `stone_win_${sk}` : `${pick(rng, ['win_o', 'win_a', 'win_p', 'win_b', 'win_g'])}_${pk}`;
  const side = stone ? `stone_wall_${sk}` : `wall_${pk}`;
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
    if (f === 0) {
      if (s === 0) return k === doorK ? 'shopdoor' : `shop_${shop.k}`;
      if (s === 1 || s === 3) return k === 0 ? `shop_${shop.k}` : side;
      return side;
    }
    if (s === 2 && rng() < 0.3) return side;
    return up;
  }, w / nb);
  const yw = fhs.reduce((a, b) => a + b, 0);
  cornice(B, -w / 2, -d / 2, w / 2, d / 2, fhs[0] - 0.012, 0.02, 0.012, C('#e9e5dc'));
  sign(B, rng, shop.sign, 0, fhs[0] - 0.05, d / 2, 0.36);
  if (rng() < 0.6) awning(B, -w / 2 + 0.02, w / 2 - 0.02, fhs[0] - 0.056, d / 2, 0.12, 0.05, pick(rng, AWNING_COLS));
  let h = 0;
  if (rng() < 0.5) {
    cornice(B, -w / 2, -d / 2, w / 2, d / 2, yw - 0.03, 0.035, 0.025, C('#efebe2'));
    flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, yw + 0.005, { parapet: 0.03 });
    rooftopStuff(B, rng, -w / 2, -d / 2, w / 2, d / 2, yw, 2);
    h = 0.06;
  } else {
    h = 0.28;
    const rs = H.roofStyle(rng);
    const rc = rs.rc;
    hipRoof(B, w, d, yw, h, rc, { bucket: rs.bk });
    for (let i = 0; i < 3; i++) dormer(B, rng, -w / 2 + w * (i + 0.5) / 3, d / 2 * 0.55, yw + h * 0.4, 0.11, 0.09, 0.14, up, side, rc);
  }
  B.pop();
  shopProps(B, rng, shop.out === 'cafe' ? null : shop.out, fz, w);
  meta.door = [-w / 2 + (doorK + 0.5) * w / nb, fz + 0.03];
  meta.height = yw + h;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: h, mat: 'conc' };
}

export function comL3(B, rng, meta) {
  const type = pick(rng, ['kaufhaus', 'bank', 'hotel', 'buero', 'supermarkt', 'kino', 'post', 'restaurant']);
  meta.signKey = type;
  const glassy = type === 'buero' || type === 'bank' ? rng() < 0.7 : rng() < 0.35;
  const gk = pick(rng, Object.keys(GLASS)), sk = pick(rng, ['beige', 'grey']);
  const w = 0.92, d = 0.86, fz = 0.45, floors = randInt(rng, 6, 9);
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C('#e5e0d6'), 1.1);
  B.push(0, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const fhs = [0.34]; for (let i = 1; i < floors; i++) fhs.push(0.28);
  const nb = 4;
  const up = glassy ? `glass_${gk}` : `stone_win_${sk}`;
  const shopCell = type === 'supermarkt' ? 'shop_general' : type === 'restaurant' ? 'shop_cafe' : type === 'kaufhaus' ? 'shop_fashion' : 'glass_door';
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
    if (f === 0) {
      if (s === 0) return k === 1 || k === 2 ? (glassy ? 'glass_door' : 'stone_door') : shopCell;
      return glassy ? `glass_${gk}` : (k % 2 ? shopCell : `stone_wall_${sk}`);
    }
    return up;
  }, w / nb);
  const yw = fhs.reduce((a, b) => a + b, 0);
  B.box('solid', -0.24, fhs[0] - 0.02, d / 2, 0.24, fhs[0] - 0.005, d / 2 + 0.1, C('#3a4048'));
  sign(B, rng, type, 0, yw - 0.12, d / 2, 0.44);
  if (!glassy) cornice(B, -w / 2, -d / 2, w / 2, d / 2, yw - 0.02, 0.035, 0.022, C('#e9e5dc'));
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, yw + 0.01, { parapet: 0.035, pcol: glassy ? '#aab3bb' : '#e2dccd' });
  rooftopStuff(B, rng, -w / 2, -d / 2, w / 2, d / 2, yw, 3);
  B.pop();
  meta.door = [0, fz + 0.03];
  meta.height = yw + 0.1;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: 0, mat: 'conc' };
  MD.lampPost(B, -0.42, 0.47); MD.lampPost(B, 0.42, 0.47);
  meta.lamps.push([-0.42, 0.47], [0.42, 0.47]);
}

export function comL4(B, rng, meta, LW, LD) {
  plazaGround(B, rng, LW, LD, meta);
  const gk = pick(rng, Object.keys(GLASS));
  const total = randInt(rng, 26, 42), fh = 0.29;
  const t1 = Math.floor(total * randRange(rng, 0.45, 0.6)), t2 = Math.floor(total * randRange(rng, 0.75, 0.88));
  const s0 = randRange(rng, 1.25, 1.4), s1 = s0 - randRange(rng, 0.15, 0.25), s2 = s1 - randRange(rng, 0.15, 0.25);
  const zc = -0.1;
  B.push(0, zc);
  aoDecal(B, -s0 / 2, -s0 / 2, s0 / 2, s0 / 2, 0.14);
  let y = 0;
  const tiers = [[s0, t1], [s1, t2 - t1], [s2, total - t2]];
  tiers.forEach(([s, n], ti) => {
    const fhs = Array(n).fill(fh);
    if (ti === 0) fhs[0] = 0.36;
    boxWalls(B, rng, -s / 2, -s / 2, s / 2, s / 2, y, fhs, (side, f, k, nb) => {
      if (ti === 0 && f === 0) return (side === 0 && (k === Math.floor(nb / 2) || k === Math.floor(nb / 2) - 1)) ? 'glass_door' : `glass_dark`;
      return `glass_${gk}`;
    }, 0.25);
    y += fhs.reduce((a, b) => a + b, 0);
    flatRoof(B, -s / 2, -s / 2, s / 2, s / 2, y, { parapet: 0.04, pcol: '#aeb6bd' });
    if (ti < 2) rooftopStuff(B, rng, -s / 2, -s / 2, s / 2, s / 2, y, 2);
  });
  B.box('solid', -s0 / 2 - 0.02, 0.33, -s0 / 2 - 0.02, s0 / 2 + 0.02, 0.36, s0 / 2 + 0.02, C('#2c3540'));
  sign(B, rng, rng() < 0.5 ? 'tower' : 'bank', 0, 0.37, s0 / 2, 0.5);
  // crown
  const top = y;
  if (rng() < 0.45) {
    B.cyl('solid', 0, top, 0, 0.22, 0.03, 16, C('#3f4650'));
    B.cyl('solid', 0, top + 0.03, 0, 0.17, 0.004, 16, C('#f2c230'));
    B.cyl('solid', 0, top + 0.031, 0, 0.15, 0.004, 16, C('#3f4650'));
    B.box('solid', -0.06, top + 0.034, -0.008, -0.045, top + 0.038, 0.09, WHITE);
    B.box('solid', 0.045, top + 0.034, -0.008, 0.06, top + 0.038, 0.09, WHITE);
    B.box('solid', -0.05, top + 0.034, 0.035, 0.05, top + 0.038, 0.047, WHITE);
  } else {
    B.box('solid', -s2 / 2 + 0.08, top, -s2 / 2 + 0.08, s2 / 2 - 0.08, top + 0.25, s2 / 2 - 0.08, C('#55606b'));
    B.cyl('solid', 0, top + 0.25, 0, 0.02, 0.9, 6, C('#c9ccd0'), { r1: 0.006 });
    B.box('glow', -0.015, top + 1.15, -0.015, 0.015, top + 1.18, 0.015, C('#ff3020'), { lit: 0.01 });
    meta.beacon = [0, -0.1 + 0, top + 1.17];
  }
  B.pop();
  meta.door = [0, zc + s0 / 2 + 0.04];
  meta.height = top + 0.3;
  for (const x of [-0.85, 0.85]) { MD.lampPost(B, x, 0.88); meta.lamps.push([x, 0.88]); }
  meta.shell = { x0: -s0 / 2, z0: zc - s0 / 2, x1: s0 / 2, z1: zc + s0 / 2, fhs: Array(total).fill(fh), roofH: 0, mat: 'conc' };
}

// --------------------------------------------------------- industrial
function indL1(B, rng, meta) {
  const bk = rng() < 0.5 ? 'red' : 'dark';
  const w = randRange(rng, 0.7, 0.8), d = randRange(rng, 0.5, 0.58), fz = 0.3;
  B.rect('asphalt', -0.5, fz - 0.02, 0.5, 0.5, 0.005, C('#d8d8d8'), 2);
  B.rect('dirt', -0.5, -0.5, 0.5, fz - 0.02, 0.004, C('#c9c3b8'), 1.5);
  B.push(0, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const fhs = [0.36];
  const nb = 3;
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
    if (s === 0) return k === 1 ? 'garage_grey' : (k === 0 ? `br_door_red` : `br_ind_${bk}`);
    return k % 2 ? `br_wall_${bk}` : `br_ind_${bk}`;
  }, w / nb);
  const rcol = pick(rng, ['#8f9aa3', '#6d8a7a', '#a35a45', '#5f7896']);
  const h = 0.12;
  gableRoof(B, w, d, 0.36, h, rcol, { bucket: 'metal', S: 0.5 });
  gableTri(B, rng, w / 2, d / 2, w / 2, -d / 2, 0.36, h, `br_wall_${bk}`);
  gableTri(B, rng, -w / 2, -d / 2, -w / 2, d / 2, 0.36, h, `br_wall_${bk}`);
  sign(B, rng, 'werkstatt', w / 2 - w / nb / 2, 0.37 - 0.08, d / 2, 0.2);
  B.pop();
  // yard
  for (let i = 0; i < 3; i++) B.box('solid', -0.42 + i * 0.09, 0, -0.4, -0.35 + i * 0.09, 0.03 + (i % 2) * 0.03, -0.32, C('#b08a5a'));
  for (let i = 0; i < 3; i++) B.cyl('solid', 0.3 + i * 0.05, 0, -0.38, 0.02, 0.055, 8, C(pick(rng, ['#2f6fa8', '#c0392b', '#3c3c3c'])));
  if (rng() < 0.6) parkedCar(B, -0.19, fz + 0.12, 0, rng, 'van');
  meta.door = [-w / 2 + 0.5 * w / nb, fz + 0.03];
  meta.height = 0.48;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: h, mat: 'brick' };
}

function sawtooth(B, x0, z0, x1, z1, y, n, rc) {
  const dz = (z1 - z0) / n, h = 0.1;
  for (let i = 0; i < n; i++) {
    const za = z0 + i * dz, zb = za + dz;
    B.quad('metal', [x0, y, zb], [x1, y, zb], [x1, y + h, za], [x0, y + h, za], C(rc), [x0 * 2, 0, x1 * 2, 0, x1 * 2, 1, x0 * 2, 1]);
    B.quad('glass', [x1, y, za], [x0, y, za], [x0, y + h, za], [x1, y + h, za], C('#8fb2c8'));
    B.tri('solid', [x1, y, zb], [x1, y, za], [x1, y + h, za], C('#9a9fa4'));
    B.tri('solid', [x0, y, za], [x0, y, zb], [x0, y + h, za], C('#9a9fa4'));
  }
}

function indL2(B, rng, meta) {
  const bk = rng() < 0.6 ? 'red' : 'dark';
  const w = 0.86, d = 0.66, fz = 0.36;
  B.rect('asphalt', -0.5, -0.5, 0.5, 0.5, 0.005, C('#d4d4d4'), 2);
  B.push(-0.04, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const fhs = [0.24, 0.22];
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k, nb) => {
    if (s === 0 && f === 0 && k === nb - 1) return 'garage_grey';
    if (f === 0 && s === 0 && k === 0) return 'br_door_red';
    return `br_ind_${bk}`;
  }, 0.22);
  sawtooth(B, -w / 2, -d / 2, w / 2, d / 2, 0.46, 3, pick(rng, ['#8f9aa3', '#a35a45']));
  sign(B, rng, 'fabrik', -0.1, 0.38, d / 2, 0.26);
  B.pop();
  // chimney
  const cx = 0.4, cz = -0.38;
  B.cyl('solid', cx, 0, cz, 0.06, 1.15, 12, C('#9b4a35'), { r1: 0.045 });
  for (let y = 0.3; y < 1.1; y += 0.25) B.cyl('solid', cx, y, cz, 0.062 - y * 0.014, 0.02, 12, C('#7a3a2a'));
  B.cyl('solid', cx, 1.13, cz, 0.05, 0.03, 12, C('#3a3a3a'));
  meta.smoke.push([cx, 1.18, cz]);
  // silos
  for (let i = 0; i < 2; i++) {
    B.cyl('shiny', -0.36 + i * 0.13, 0, -0.38, 0.055, 0.42, 12, C('#e6e8ea'));
    B.cyl('shiny', -0.36 + i * 0.13, 0.42, -0.38, 0.055, 0.04, 12, C('#d0d3d6'), { r1: 0.01 });
  }
  parkedCar(B, 0.0, 0.42, 0, rng, 'truck');
  meta.door = [-0.04 - w / 2 + 0.11, fz + 0.03];
  meta.height = 0.6;
  meta.shell = { x0: -0.04 - w / 2, z0: fz - d, x1: -0.04 + w / 2, z1: fz, fhs, roofH: 0.1, mat: 'brick' };
}

function indL3(B, rng, meta, LW, LD) {
  const mk = pick(rng, ['grey', 'blue', 'white']);
  B.rect('asphalt', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#d0d0d0'), 2);
  const w = 1.7, d = 1.15, zc = -0.4;
  B.push(0, zc);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2, 0.12);
  const fhs = [0.3, 0.26];
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
    if (s === 0 && f === 0) return k % 2 ? 'metal_dock' : `metal_${mk}`;
    if (f === 1 && k % 3 === 1) return 'glass_silver';
    return `metal_${mk}`;
  }, 0.24);
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, 0.56, { parapet: 0.02, col: '#b8bcbf', pcol: '#9aa1a6' });
  for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.3) B.box('glass', x, 0.56, -d / 2 + 0.15, x + 0.12, 0.6, d / 2 - 0.15, C('#a9c4d6'));
  sign(B, rng, 'logistik', -w / 2 + 0.3, 0.42, d / 2, 0.36);
  B.pop();
  // trucks at docks
  const nDock = Math.round(w / 0.24);
  for (let k = 1; k < nDock; k += 2) {
    if (rng() < 0.7) parkedCar(B, -w / 2 + (k + 0.5) * w / nDock, zc + d / 2 + 0.375, -Math.PI / 2, rng, 'truck');
  }
  for (let x = -0.9; x <= 0.9; x += 0.3) B.box('solid', x, 0.005, 0.85, x + 0.15, 0.008, 0.87, C('#f2c230'));
  meta.door = [-w / 2 + 0.12, zc + d / 2 + 0.04];
  meta.height = 0.65;
  meta.lamps.push([-0.9, 0.9], [0.9, 0.9]);
  MD.lampPost(B, -0.9, 0.9, 0.3); MD.lampPost(B, 0.9, 0.9, 0.3);
  meta.shell = { x0: -w / 2, z0: zc - d / 2, x1: w / 2, z1: zc + d / 2, fhs, roofH: 0, mat: 'conc' };
}

// ----------------------------------------------------------- services
function park(B, rng, meta) {
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#f4fae4'), 3);
  const pc = C('#e8dcc4');
  if (rng() < 0.5) {
    B.rect('cobble', -0.05, -0.5, 0.05, 0.5, 0.007, pc, 1.1);
    B.rect('cobble', -0.5, -0.05, 0.5, 0.05, 0.0072, pc, 1.1);
  } else {
    B.push(0, 0, Math.PI / 4); B.rect('cobble', -0.06, -0.68, 0.06, 0.68, 0.007, pc, 1.1); B.pop();
    B.push(0, 0, -Math.PI / 4); B.rect('cobble', -0.06, -0.68, 0.06, 0.68, 0.0072, pc, 1.1); B.pop();
  }
  if (rng() < 0.35) {
    B.cyl('solid', 0.24, 0, -0.24, 0.16, 0.012, 16, C('#9a9284'));
    B.cyl('glass', 0.24, 0.0, -0.24, 0.145, 0.014, 16, C('#3f8fae'));
    meta.trees.push([-0.28, -0.3, 'round', 1.1], [-0.3, 0.28, 'tall', 1], [0.3, 0.3, 'round', 1.05]);
  } else {
    meta.trees.push([-0.28, -0.3, 'round', 1.1], [0.28, -0.28, 'round', 0.95], [-0.3, 0.28, 'tall', 1], [0.3, 0.3, 'round', 1.05]);
  }
  MD.flowerBed(B, 0, 0, 0.09, 3);
  MD.bench(B, -0.16, 0.1, 0); MD.bench(B, 0.16, -0.1, Math.PI);
  MD.lampPost(B, 0.1, 0.1); meta.lamps.push([0.1, 0.1]);
  meta.trees.push([0.42, -0.05, 'bush', 0.9], [-0.42, 0.05, 'bush', 0.9]);
  meta.wander = true;
  meta.height = 0.3;
}

function playground(B, rng, meta) {
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#f4fae4'), 3);
  B.rect('sand', -0.42, -0.42, 0.42, 0.18, 0.006, C('#ffffff'), 0.6);
  hedge(B, -0.49, -0.49, 0.49, -0.45, 0.06);
  hedge(B, -0.49, -0.45, -0.45, 0.3, 0.06);
  hedge(B, 0.45, -0.45, 0.49, 0.3, 0.06);
  const wd = C('#a8703f');
  // swings
  B.push(-0.22, -0.26);
  for (const x of [-0.13, 0.13]) {
    B.box('solid', x - 0.008, 0, -0.05, x + 0.008, 0.16, -0.035, wd); B.box('solid', x - 0.008, 0, 0.035, x + 0.008, 0.16, 0.05, wd);
  }
  B.box('solid', -0.14, 0.155, -0.012, 0.14, 0.17, 0.012, wd);
  for (const x of [-0.06, 0.06]) {
    B.box('solid', x - 0.02, 0.002 + 0.002, -0.001, x - 0.018, 0.158, 0.001, C('#888'));
    B.box('solid', x + 0.018, 0.004, -0.001, x + 0.02, 0.158, 0.001, C('#888'));
    B.box('solid', x - 0.026, 0.045, -0.014, x + 0.026, 0.052, 0.014, C(x < 0 ? '#e74c3c' : '#3498db'));
  }
  B.pop();
  // climbing tower with slide
  B.push(0.16, -0.24);
  for (const [x, z] of [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]]) B.box('solid', x - 0.008, 0, z - 0.008, x + 0.008, 0.23, z + 0.008, wd);
  B.box('solid', -0.08, 0.11, -0.08, 0.08, 0.125, 0.08, wd);
  B.box('solid', -0.08, 0.125, -0.081, 0.08, 0.17, -0.075, C('#2e7d4f'));
  hipRoof(B, 0.16, 0.16, 0.23, 0.07, '#d64534', { over: 0.015 });
  B.quad('shiny', [0.08, 0.125, 0.04], [0.08, 0.125, -0.04], [0.3, 0.01, -0.04], [0.3, 0.01, 0.04], C('#e74c3c'));
  B.quad('shiny', [0.3, 0.01, 0.04], [0.3, 0.01, -0.04], [0.08, 0.125, -0.04], [0.08, 0.125, 0.04], C('#e74c3c'));
  for (let y = 0.02; y < 0.12; y += 0.03) B.box('solid', -0.12, y, -0.03, -0.08, y + 0.008, 0.03, wd);
  B.pop();
  // sandbox
  B.box('solid', -0.32, 0, -0.02, -0.08, 0.025, 0.0, wd); B.box('solid', -0.32, 0, 0.14, -0.08, 0.025, 0.16, wd);
  B.box('solid', -0.32, 0, 0.0, -0.3, 0.025, 0.14, wd); B.box('solid', -0.1, 0, 0.0, -0.08, 0.025, 0.14, wd);
  B.box('solid', -0.25, 0.006, 0.05, -0.22, 0.03, 0.08, C('#f1c40f'));
  B.box('solid', -0.16, 0.006, 0.07, -0.13, 0.02, 0.1, C('#e74c3c'));
  // seesaw
  B.box('solid', 0.12, 0, 0.06, 0.14, 0.035, 0.08, C('#555'));
  B.box('solid', 0.0, 0.03, 0.06, 0.26, 0.04, 0.08, C('#f39c12'));
  MD.bench(B, -0.25, 0.35, 0); MD.bench(B, 0.25, 0.35, 0);
  meta.trees.push([-0.38, 0.38, 'round', 1.0], [0.38, 0.4, 'round', 0.95]);
  meta.kids = true; meta.wander = true;
  meta.height = 0.3;
}

function plaza(B, rng, meta) {
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C('#f2e8d6'), 1.1);
  const st = C('#d9d0be');
  B.cyl('solid', 0, 0, 0, 0.22, 0.05, 20, st);
  B.cyl('glass', 0, 0.0, 0, 0.195, 0.052, 20, C('#4aa3c0'));
  B.cyl('solid', 0, 0.05, 0, 0.04, 0.12, 10, st);
  B.cyl('solid', 0, 0.16, 0, 0.09, 0.025, 14, st, { r1: 0.1 });
  B.cyl('glass', 0, 0.165, 0, 0.08, 0.022, 14, C('#4aa3c0'));
  B.cyl('solid', 0, 0.18, 0, 0.022, 0.07, 8, st);
  B.sphere('solid', 0, 0.26, 0, 0.022, 0.022, 0.022, st, 8, 5);
  meta.fountain = [0, 0.28, 0];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    MD.bench(B, Math.cos(a) * 0.33, Math.sin(a) * 0.33, -a + Math.PI / 2);
  }
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) { MD.lampPost(B, x, z); meta.lamps.push([x, z]); }
  for (const [x, z] of [[0, -0.42], [0, 0.42], [-0.42, 0], [0.42, 0]]) {
    B.box('solid', x - 0.05, 0, z - 0.035, x + 0.05, 0.04, z + 0.035, C('#b56a45'));
    for (let i = 0; i < 5; i++) B.sphere('solid', x - 0.035 + i * 0.0175, 0.05, z, 0.016, 0.014, 0.016, C(['#e23b4b', '#ffcf3f', '#ff6f91', '#ffffff', '#b54ad8'][i]), 5, 3);
  }
  meta.pigeons = true; meta.wander = true;
  meta.height = 0.3;
}

function firestation(B, rng, meta, LW, LD) {
  B.rect('asphalt', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#c9c9c9'), 2);
  const w = 1.4, d = 0.62, x0 = -0.95, fz = 0.18;
  B.push(x0 + w / 2, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const fhs = [0.34, 0.27];
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k, nb) => {
    if (s === 0 && f === 0) return k < nb - 1 ? 'garage_red' : 'br_door_red';
    return 'br_win_red';
  }, 0.24);
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, 0.61, { parapet: 0.04, pcol: '#d6cfc3' });
  sign(B, rng, 'feuerwehr', -0.12, 0.37, d / 2, 0.4);
  B.pop();
  // hose tower
  B.push(0.62, -0.1);
  const tw = 0.3;
  boxWalls(B, rng, -tw / 2, -tw / 2, tw / 2, tw / 2, 0, [0.3, 0.3, 0.3, 0.3], (s, f) => (f === 3 ? 'br_win_red' : 'br_wall_red'), 0.15);
  hipRoof(B, tw, tw, 1.2, 0.2, '#4a4f55', { spire: 0.12 });
  B.pop();
  // engines stand half way out of the open bays
  for (let i = 0; i < 2; i++) {
    const bx = x0 + 0.12 + i * 0.48;
    B.quad('solid', [bx - 0.115, 0.004, fz + 0.003], [bx + 0.115, 0.004, fz + 0.003], [bx + 0.115, 0.3, fz + 0.003], [bx - 0.115, 0.3, fz + 0.003], C('#17181a'));
    parkedCar(B, bx, 0.036, -Math.PI / 2, rng, 'fire');
  }
  for (let i = 0; i < 4; i++) B.cyl('solid', 0.35 + i * 0.07, 0, 0.42, 0.015, 0.045, 6, C('#ff6a1a'), { r1: 0.002 });
  B.cyl('solid', 0.9, 0, 0.4, 0.006, 0.5, 6, C('#d6d6d6'));
  B.box('solid', 0.9, 0.4, 0.4, 0.98, 0.47, 0.402, C('#c0392b'));
  meta.door = [x0 + w - 0.1, fz + 0.03];
  meta.height = 1.5;
  meta.station = 'fire';
}

function police(B, rng, meta) {
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C('#e2ddd3'), 1.1);
  const w = 0.82, d = 0.56, fz = 0.3;
  B.push(0, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const fhs = [0.3, 0.26, 0.26];
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
    if (s === 0 && f === 0 && k === 1) return 'apt_door_grey';
    return 'apt_win_white';
  }, 0.205);
  B.box('solid', -w / 2 - 0.006, 0.28, -d / 2 - 0.006, w / 2 + 0.006, 0.31, d / 2 + 0.006, C('#1f4f8f'));
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, 0.82, { parapet: 0.035 });
  B.cyl('solid', 0.25, 0.82, -0.1, 0.006, 0.3, 4, C('#888'));
  sign(B, rng, 'polizei', 0.1, 0.32, d / 2, 0.26);
  B.pop();
  parkedCar(B, -0.255, 0.4, 0, rng, 'police');
  parkedCar(B, 0.245, 0.4, 0, rng, 'police');
  meta.door = [-w / 2 + 1.5 * 0.205, fz + 0.03];
  meta.height = 0.9;
  meta.station = 'police';
}

function school(B, rng, meta, LW, LD) {
  B.rect('grass', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.004, C('#eef4de'), 3);
  B.rect('asphalt', -0.92, -0.92, 0.3, 0.05, 0.006, C('#e6c9b9'), 2);
  const pk = pick(rng, ['yellow', 'salmon', 'cream', 'pink']);
  const rc = pick(rng, ['#c55a33', '#b6482f']);
  // main wing
  B.push(0, 0.35);
  const w = 1.7, d = 0.46, fhs = [0.28, 0.27, 0.27];
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k, nb) => (s === 0 && f === 0 && k === Math.floor(nb / 2)) ? `door_${pk}` : `win_p_${pk}`, 0.22);
  hipRoof(B, w, d, 0.82, 0.25, rc);
  B.box('solid', -0.06, 0.82 + 0.12, 0.08, 0.06, 0.82 + 0.3, 0.2, C(PLASTER_COL(pk)));
  sign(B, rng, 'schule', 0, 0.3, d / 2, 0.36);
  B.pop();
  // side wing
  B.push(0.62, -0.42);
  const w2 = 0.46, d2 = 0.9;
  aoDecal(B, -w2 / 2, -d2 / 2, w2 / 2, d2 / 2);
  boxWalls(B, rng, -w2 / 2, -d2 / 2, w2 / 2, d2 / 2, 0, [0.28, 0.27], () => `win_p_${pk}`, 0.22);
  hipRoof(B, w2, d2, 0.55, 0.22, rc);
  B.pop();
  // yard: hopscotch, basketball
  for (let i = 0; i < 5; i++) B.box('solid', -0.6 + i * 0.06, 0.006, -0.2, -0.55 + i * 0.06, 0.008, -0.15, WHITE);
  B.box('solid', -0.15, 0, -0.85, -0.14, 0.22, -0.84, C('#555'));
  B.box('solid', -0.2, 0.2, -0.84, -0.09, 0.27, -0.835, WHITE);
  B.cyl('solid', -0.145, 0.2, -0.8, 0.025, 0.004, 8, C('#e67e22'));
  for (const [x, z] of [[-0.8, -0.8], [-0.8, -0.2], [0.2, -0.85]]) meta.trees.push([x, z, 'round', 1.1]);
  MD.bench(B, -0.4, -0.05, 0); MD.bench(B, 0.1, -0.5, Math.PI / 2);
  meta.door = [0, 0.35 + d / 2 + 0.03];
  meta.kids = true;
  meta.height = 1.2;
}
function PLASTER_COL(pk) { return { yellow: '#f0c862', salmon: '#e58f6c', cream: '#efe2c3', pink: '#e9a39b' }[pk] || '#efe2c3'; }

function hospital(B, rng, meta, LW, LD) {
  B.rect('cobble', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#e9e6df'), 1.1);
  const w = 1.6, d = 0.95, zc = -0.32, floors = 5;
  const fhs = [0.32]; for (let i = 1; i < floors; i++) fhs.push(0.27);
  B.push(0, zc);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2, 0.12);
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k, nb) => {
    if (s === 0 && f === 0 && (k === Math.floor(nb / 2) || k === Math.floor(nb / 2) - 1)) return 'glass_door';
    return 'hospital_win';
  }, 0.24);
  const yw = fhs.reduce((a, b) => a + b, 0);
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, yw, { parapet: 0.04 });
  // helipad
  B.cyl('solid', 0.3, yw, -0.05, 0.3, 0.02, 20, C('#4a4f55'));
  B.cyl('solid', 0.3, yw + 0.02, -0.05, 0.25, 0.003, 20, C('#f2c230'));
  B.cyl('solid', 0.3, yw + 0.0205, -0.05, 0.23, 0.003, 20, C('#4a4f55'));
  B.box('solid', 0.22, yw + 0.021, -0.15, 0.25, yw + 0.025, 0.05, WHITE);
  B.box('solid', 0.35, yw + 0.021, -0.15, 0.38, yw + 0.025, 0.05, WHITE);
  B.box('solid', 0.25, yw + 0.021, -0.065, 0.35, yw + 0.025, -0.035, WHITE);
  // red cross board on roof
  B.box('solid', -0.45, yw, d / 2 - 0.08, -0.15, yw + 0.3, d / 2 - 0.06, C('#d0d0d0'));
  fq(B, 'redcross', [-0.44, yw + 0.01, d / 2 - 0.059], [-0.16, yw + 0.01, d / 2 - 0.059], [-0.16, yw + 0.29, d / 2 - 0.059], [-0.44, yw + 0.29, d / 2 - 0.059], rng);
  sign(B, rng, 'krankenhaus', 0, yw - 0.2, d / 2, 0.6);
  // canopy
  B.box('solid', -0.3, 0.3, d / 2, 0.3, 0.33, d / 2 + 0.28, C('#e9ecef'));
  for (const x of [-0.27, 0.27]) B.box('solid', x - 0.012, 0, d / 2 + 0.25, x + 0.012, 0.3, d / 2 + 0.274, C('#c9ced3'));
  B.pop();
  parkedCar(B, 0.05, zc + d / 2 + 0.15, 0, rng, 'ambulance');
  parking(B, rng, -0.95, 0.55, 0.95, 0.95, 'x', 0.7);
  meta.door = [0, zc + d / 2 + 0.04];
  meta.height = yw + 0.3;
  meta.station = 'health';
}

function townhall(B, rng, meta, LW, LD) {
  B.rect('cobble', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#efe6d4'), 1.1);
  const w = 1.5, d = 0.6, fz = 0.25;
  const fhs = [0.32, 0.29, 0.29];
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.06, C('#b8ad98'));
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f) => (s === 0 && f === 0 ? 'stone_win_beige' : (s % 2 ? 'stone_wall_beige' : 'stone_win_beige')), 0.21);
  const yw = 0.9;
  cornice(B, -w / 2, -d / 2, w / 2, d / 2, 0.31, 0.02, 0.012, C('#efe8d8'));
  cornice(B, -w / 2, -d / 2, w / 2, d / 2, yw - 0.03, 0.035, 0.025, C('#efe8d8'));
  hipRoof(B, w, d, yw, 0.36, '#b6482f');
  for (const x of [-0.5, -0.25, 0.25, 0.5]) dormer(B, rng, x, d / 2 * 0.55, yw + 0.36 * 0.4, 0.1, 0.09, 0.12, 'stone_win_beige', 'stone_wall_beige', '#b6482f');
  // clock tower
  const tw = 0.32;
  B.push(0, d / 2 - tw / 2 + 0.06);
  boxWalls(B, rng, -tw / 2, -tw / 2, tw / 2, tw / 2, 0, [0.32, 0.29, 0.29, 0.3, 0.3], (s, f) => {
    if (f === 0 && s === 0) return 'stone_door';
    if (f === 4) return 'clock';
    return f === 3 ? 'stone_wall_beige' : 'stone_win_beige';
  }, 0.32);
  cornice(B, -tw / 2, -tw / 2, tw / 2, tw / 2, 1.48, 0.03, 0.02, C('#efe8d8'));
  hipRoof(B, tw, tw, 1.5, 0.42, '#5f9e8a', { spire: 0.18 });
  B.pop();
  sign(B, rng, 'rathaus', 0, 0.98, d / 2 + 0.07, 0.26);
  B.pop();
  for (const x of [-0.85, 0.85]) {
    B.cyl('solid', x, 0, 0.4, 0.007, 0.6, 6, C('#d6d6d6'));
    B.box('solid', x, 0.48, 0.399, x + 0.12, 0.52, 0.401, C('#111'));
    B.box('solid', x, 0.52, 0.399, x + 0.12, 0.56, 0.401, C('#d00'));
    B.box('solid', x, 0.56, 0.399, x + 0.12, 0.6, 0.401, C('#f2c230'));
  }
  MD.flowerBed(B, -0.5, 0.38, 0.08, 7); MD.flowerBed(B, 0.5, 0.38, 0.08, 9);
  meta.door = [0, fz + 0.1];
  meta.height = 2.1;
}

function church(B, rng, meta, LW, LD) {
  B.rect('grass', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.004, C('#eef4de'), 3);
  B.rect('cobble', -0.08, 0.6, 0.08, LD / 2, 0.006, C('#e6dccb'), 1.1);
  const nw = 0.54, nd = 1.2, nz = -0.05;
  B.push(0, nz);
  aoDecal(B, -nw / 2, -nd / 2, nw / 2, nd / 2);
  plinth(B, -nw / 2, -nd / 2, nw / 2, nd / 2, 0.05, C('#b8ad98'));
  boxWalls(B, rng, -nw / 2, -nd / 2, nw / 2, nd / 2, 0, [0.55], (s) => (s === 0 ? 'ch_door' : 'ch_win'), 0.24);
  const h = 0.42;
  B.push(0, 0, Math.PI / 2); gableRoof(B, nd, nw, 0.55, h, '#50565e'); B.pop();
  gableTri(B, rng, -nw / 2, nd / 2, nw / 2, nd / 2, 0.55, h, 'ch_rose');
  gableTri(B, rng, nw / 2, -nd / 2, -nw / 2, -nd / 2, 0.55, h, 'ch_wall');
  // apse
  B.cyl('solid', 0, 0, -nd / 2, 0.2, 0.48, 10, C('#d6c09a'));
  B.cyl('roof', 0, 0.48, -nd / 2, 0.22, 0.2, 10, C('#50565e'), { r1: 0.0 });
  B.pop();
  // tower
  const tw = 0.3, tz = nz + nd / 2 + tw / 2 - 0.02;
  B.push(0, tz);
  aoDecal(B, -tw / 2, -tw / 2, tw / 2, tw / 2);
  const tf = [0.32, 0.3, 0.3, 0.3, 0.26];
  boxWalls(B, rng, -tw / 2, -tw / 2, tw / 2, tw / 2, 0, tf, (s, f) => {
    if (f === 0 && s === 0) return 'ch_door';
    if (f === 4) return 'clock';
    return f === 3 ? 'ch_win' : 'ch_wall';
  }, 0.3);
  cornice(B, -tw / 2, -tw / 2, tw / 2, tw / 2, 1.46, 0.025, 0.02, C('#c8b28a'));
  hipRoof(B, tw, tw, 1.48, 0.75, '#5f9e8a', { over: 0.02 });
  B.box('solid', -0.006, 2.22, -0.006, 0.006, 2.38, 0.006, C('#d4af37'));
  B.box('solid', -0.04, 2.31, -0.006, 0.04, 2.322, 0.006, C('#d4af37'));
  B.pop();
  // graveyard
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
    const x = (i < 2 ? -0.42 + i * 0.07 : 0.35 + (i - 2) * 0.07), z = -0.7 + r * 0.15;
    B.box('solid', x - 0.02, 0, z - 0.006, x + 0.02, 0.05, z + 0.006, C('#9a9a94'));
    B.rect('grass', x - 0.025, z + 0.008, x + 0.025, z + 0.07, 0.006, C('#8fb36a'), 1);
  }
  meta.trees.push([-0.38, 0.75, 'round', 1.1], [0.38, 0.72, 'round', 1.0], [-0.4, -0.9, 'conifer', 1.1], [0.4, -0.92, 'conifer', 1.0]);
  MD.bench(B, 0.25, 0.6, -Math.PI / 2);
  meta.door = [0, tz + tw / 2 + 0.03];
  meta.height = 2.4;
}

function stadium(B, rng, meta, LW, LD) {
  B.rect('asphalt', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#cfcfcf'), 2);
  const pw = 1.5, pd = 1.0;
  for (let i = 0; i < 10; i++) B.rect('grass', -pw / 2 + i * pw / 10, -pd / 2, -pw / 2 + (i + 1) * pw / 10, pd / 2, 0.01, C(i % 2 ? '#d8f0c0' : '#c4e4a8'), 2);
  const lw = 0.008, y = 0.0115;
  B.box('solid', -pw / 2 + 0.04, y - 0.001, -pd / 2 + 0.04, pw / 2 - 0.04, y, -pd / 2 + 0.04 + lw, WHITE);
  B.box('solid', -pw / 2 + 0.04, y - 0.001, pd / 2 - 0.04 - lw, pw / 2 - 0.04, y, pd / 2 - 0.04, WHITE);
  B.box('solid', -pw / 2 + 0.04, y - 0.001, -pd / 2 + 0.04, -pw / 2 + 0.04 + lw, y, pd / 2 - 0.04, WHITE);
  B.box('solid', pw / 2 - 0.04 - lw, y - 0.001, -pd / 2 + 0.04, pw / 2 - 0.04, y, pd / 2 - 0.04, WHITE);
  B.box('solid', -lw / 2, y - 0.001, -pd / 2 + 0.04, lw / 2, y, pd / 2 - 0.04, WHITE);
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2, r = 0.13;
    B.quad('solid', [Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a0) * (r + lw), y, Math.sin(a0) * (r + lw)], [Math.cos(a1) * (r + lw), y, Math.sin(a1) * (r + lw)], [Math.cos(a1) * r, y, Math.sin(a1) * r], WHITE);
  }
  for (const s of [-1, 1]) {
    B.box('solid', s * (pw / 2 - 0.04) - (s > 0 ? 0.2 : 0), y - 0.001, -0.22, s * (pw / 2 - 0.04) + (s > 0 ? 0 : 0.2), y, -0.22 + lw, WHITE);
    B.box('solid', s * (pw / 2 - 0.04) - (s > 0 ? 0.2 : 0), y - 0.001, 0.22 - lw, s * (pw / 2 - 0.04) + (s > 0 ? 0 : 0.2), y, 0.22, WHITE);
    B.box('solid', s * (pw / 2 - 0.24) - lw / 2, y - 0.001, -0.22, s * (pw / 2 - 0.24) + lw / 2, y, 0.22, WHITE);
    B.box('solid', s * (pw / 2 - 0.02) - 0.006, 0, -0.07, s * (pw / 2 - 0.02) + 0.006, 0.06, 0.07, WHITE);
  }
  // stands on four sides
  const seatCols = ['#c0392b', '#e9e9e9', '#2f5f9e'];
  const stands = [[pw / 2, pd / 2 + 0.06, pw, 0], [pw / 2, pd / 2 + 0.06, pw, Math.PI], [pd / 2, pw / 2 + 0.06, pd, Math.PI / 2], [pd / 2, pw / 2 + 0.06, pd, -Math.PI / 2]];
  for (const [, off, len, a] of stands) {
    B.push(0, 0, a);
    for (let r = 0; r < 6; r++) {
      const z0 = off + r * 0.06, yy = 0.05 + r * 0.045;
      B.box('solid', -len / 2 - 0.06 - r * 0.05, 0, z0, len / 2 + 0.06 + r * 0.05, yy, z0 + 0.06, C('#b9bcbf'), { top: C(seatCols[r % 3]) });
    }
    const zb = off + 0.36;
    B.box('solid', -len / 2 - 0.4, 0, zb, len / 2 + 0.4, 0.42, zb + 0.04, C('#e3e5e7'));
    B.box('shiny', -len / 2 - 0.36, 0.42, off + 0.02, len / 2 + 0.36, 0.44, zb + 0.04, C('#f2f3f4'));
    B.pop();
  }
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    B.cyl('solid', x, 0, z, 0.025, 1.1, 8, C('#9aa1a6'));
    B.box('glow', x - 0.08, 1.1, z - 0.03, x + 0.08, 1.2, z + 0.03, C('#fffbe8'), { lit: 0.01 });
    meta.lamps.push([x * 0.8, z * 0.8]);
  }
  sign(B, rng, 'stadion', 0, 0.28, pd / 2 + 0.06 + 0.4, 0.5);
  meta.door = [0, 1.45];
  meta.height = 1.2;
}

function tvtower(B, rng, meta, LW, LD) {
  plazaGround(B, rng, LW, LD, meta);
  const cc = C('#dedcd5');
  boxWalls(B, rng, -0.45, -0.45, 0.45, 0.45, 0, [0.3, 0.26], (s, f) => (f === 0 && s === 0 ? 'glass_door' : 'glass_dark'), 0.22);
  flatRoof(B, -0.45, -0.45, 0.45, 0.45, 0.56, { parapet: 0.02 });
  B.cyl('solid', 0, 0.56, 0, 0.19, 5.6, 18, cc, { r1: 0.12, cap: false });
  B.sphere('shiny', 0, 6.35, 0, 0.5, 0.5, 0.5, C('#c4ccd4'), 22, 14);
  B.cyl('glass', 0, 6.2, 0, 0.505, 0.14, 22, C('#2a3d52'));
  B.cyl('solid', 0, 6.82, 0, 0.09, 1.1, 12, cc, { r1: 0.07 });
  for (let i = 0; i < 6; i++) B.cyl('solid', 0, 7.92 + i * 0.18, 0, 0.04 - i * 0.004, 0.18, 8, C(i % 2 ? '#d22' : '#f4f4f4'), { r1: 0.036 - i * 0.004 });
  B.box('glow', -0.02, 9.0, -0.02, 0.02, 9.05, 0.02, C('#ff3020'), { lit: 0.01 });
  meta.beacon = [0, 0, 9.03];
  meta.door = [0, 0.5];
  meta.height = 9.1;
}

const GEN = {
  res1: H.resL1, res2: H.resL2, res3: H.resL3, res4: H.resL4,
  com1: CM.comL1, com2: CM.comL2, com3: CM.comL3, com4: CM.comL4,
  ind1: indL1, ind2: indL2, ind3: indL3,
  park, playground, plaza, firestation, police, school, hospital, townhall, church, stadium, tvtower,
};

// local lot size for a building facing direction rot
export function localSize(b) {
  const swap = b.rot === 1 || b.rot === 3;
  return swap ? [b.h, b.w] : [b.w, b.h];
}

export function genBuilding(B, b) {
  const rng = mulberry32(b.seed);
  TINT = null;
  const meta = { door: [0, 0.45], trees: [], lamps: [], smoke: [], fountain: null, height: 0.6, shell: null };
  const [LW, LD] = localSize(b);
  const fn = GEN[b.type];
  if (fn) fn(B, rng, meta, LW, LD, b);
  return meta;
}

export function hasGen(type) { return !!GEN[type]; }
