import { col, shade, pick, randRange, randInt } from './util.js';
import { SHOP_TYPES, AWNING_COLS } from './config.js';
import * as MD from './models.js';
import {
  fq, uvq, litOf, facade, boxWalls, gableRoof, hipRoof, flatRoof, aoDecal, gableTri, plinth, cornice, chimney, hedge,
  picketFence, parkedCar, balconyRow, solarPanels, sign, awning, shopProps, BIN_COLS, STONE, WHITE,
} from './buildgen.js';

// ---------------------------------------------------------------------------
// Residential archetypes. Every house picks one style family (plaster with a
// window style, half-timbering, brick, slate, timber, quarry stone, modern),
// one roof form and material, and a few additions (dormers, Zwerchhaus, oriel,
// tower, garage, canopy) so that neighbouring houses rarely look alike.
// Lots are 1x1 with the street at local +z.
// ---------------------------------------------------------------------------

const C = col;
const W1 = [1, 1, 1];
const PK_ALL = ['cream', 'yellow', 'pink', 'salmon', 'mint', 'blue', 'white', 'sand'];
const WIN_COLS = {
  win_s: PK_ALL, win_p: PK_ALL,
  win_a: ['white', 'cream', 'sand', 'yellow', 'pink'],
  win_o: ['white', 'cream', 'blue', 'yellow', 'mint'],
  win_b: ['white', 'cream', 'salmon', 'pink', 'sand'],
  win_r: ['cream', 'white', 'yellow', 'sand'],
  win_g: ['white', 'cream', 'salmon', 'pink'],
};
const DEFAULT_WINS = [['win_s', 3], ['win_r', 2], ['win_g', 2], ['win_p', 2], ['win_a', 1.4], ['win_o', 1], ['win_b', 0.9]];

export function wpick(rng, table) {
  let t = 0;
  for (const [, w] of table) t += w;
  let r = rng() * t;
  for (const [it, w] of table) { r -= w; if (r <= 0) return it; }
  return table[0][0];
}

// ------------------------------------------------------------------ styles
function plasterStyle(rng, wins = DEFAULT_WINS, pkPref = null) {
  const ws = wpick(rng, wins);
  let cols = WIN_COLS[ws];
  if (pkPref) { const f = cols.filter((c) => pkPref.includes(c)); if (f.length) cols = f; }
  const pk = pick(rng, cols);
  const side = rng() < 0.5 && ws !== 'win_b' ? ws : 'win_p';
  const g = ws === 'win_b' ? 'win_p' : ws;
  return {
    kind: 'plaster', pk,
    g: { win: `${g}_${pk}`, side: `${side}_${pk}`, wall: `wall_${pk}`, door: `door_${pk}` },
    u: { win: `${ws}_${pk}`, side: `${side}_${pk}`, wall: `wall_${pk}` },
    gable: `gable_${pk}`, attic: `win_p_${pk}`, dwall: `wall_${pk}`, trim: C(pk === 'white' ? '#e6e2d8' : '#f6f2ea'),
  };
}
const RUBBLE = { win: 'rubble_win', side: 'rubble_win', wall: 'rubble_win', door: 'rubble_door' };

export function houseStyle(rng, kind, opts = {}) {
  let S;
  if (kind === 'plaster') S = plasterStyle(rng, opts.wins || DEFAULT_WINS, opts.pk);
  else if (kind === 'fach' || kind === 'bauern') {
    const fw = rng() < 0.7 ? 'brown' : 'red';
    const base = plasterStyle(rng, [['win_p', 2], ['win_s', 2], ['win_r', 1.5], ['win_g', 1]], ['cream', 'white', 'sand', 'yellow', 'pink']);
    S = {
      ...base, kind,
      g: kind === 'bauern' ? RUBBLE : base.g,
      u: { win: `fw_win_${fw}`, side: `fw_win_${fw}`, wall: `fw_wall_${fw}`, rhythm: true },
      gable: `fw_gable_${fw}`, dwall: `fw_wall_${fw}`, jetty: kind === 'bauern' ? 0 : 0.018, beam: C(fw === 'brown' ? '#4b2f20' : '#6e2a22'),
    };
  } else if (kind === 'bfw') {
    S = {
      kind, pk: 'white', g: { win: 'bfw_win', side: 'bfw_win', wall: 'bfw_wall', door: 'br_door_red', rhythm: true },
      u: { win: 'bfw_win', side: 'bfw_win', wall: 'bfw_wall', rhythm: true }, gable: 'bfw_wall', attic: 'win_p_white', dwall: 'bfw_wall',
      beam: C('#3d2a1e'), trim: C('#efe9df'),
    };
  } else if (kind === 'slate') {
    const b = plasterStyle(rng, [['win_p', 2], ['win_s', 1], ['win_g', 1]], ['white', 'cream', 'sand']);
    S = { ...b, kind, g: rng() < 0.35 ? RUBBLE : b.g, u: { win: 'slate_win', side: 'slate_win', wall: 'slate_wall' }, gable: 'slate_wall', dwall: 'slate_wall' };
  } else if (kind === 'wood') {
    const b = plasterStyle(rng, [['win_p', 1]], ['white', 'cream']);
    S = { ...b, kind, g: rng() < 0.5 ? RUBBLE : b.g, u: { win: 'wood_win', side: 'wood_win', wall: 'wood_wall', rhythm: true }, gable: 'wood_wall', dwall: 'wood_wall' };
  } else if (kind === 'brick') {
    const k = rng() < 0.6 ? 'red' : 'dark';
    const L = { win: `br_win_${k}`, side: `br_win_${k}`, wall: `br_wall_${k}`, door: 'br_door_red' };
    S = { kind, pk: 'white', g: L, u: L, gable: `br_wall_${k}`, attic: 'win_p_white', dwall: `br_wall_${k}`, trim: C('#f1ede4') };
  } else {
    const ak = pick(rng, ['white', 'white', 'grey', 'beige']);
    const L = { win: 'modern_win', side: 'modern_win', wall: `apt_wall_${ak}`, door: `apt_door_${ak}` };
    S = { kind: 'modern', pk: 'white', g: L, u: { ...L }, gable: `apt_wall_${ak}`, attic: 'modern_win', dwall: `apt_wall_${ak}`, trim: C('#4a4f55') };
  }
  S.roof = opts.roof || roofStyle(rng, kind);
  return S;
}

const TILE_REDS = ['#c55a33', '#b6482f', '#d06c3c', '#a8412c', '#8d4b33'];
export function roofStyle(rng, kind = 'plaster') {
  const w = kind === 'slate' ? [['slate', 6], ['dark', 1]]
    : kind === 'bfw' || kind === 'brick' ? [['tile', 3], ['pantile', 3], ['dark', 1.5], ['slate', 0.5]]
      : kind === 'modern' ? [['dark', 3], ['slate', 1]]
        : [['tile', 5], ['pantile', 2.2], ['slate', 1.4], ['dark', 1]];
  const r = wpick(rng, w);
  if (r === 'tile') return { bk: 'roof', rc: C(pick(rng, TILE_REDS)) };
  if (r === 'pantile') return { bk: 'pantile', rc: C(pick(rng, ['#e8956a', '#df8a5e', '#ea9f73', '#d98058'])) };
  if (r === 'slate') return { bk: 'slate', rc: C(pick(rng, ['#9aa2ae', '#8c95a2', '#a3a8b0'])) };
  return { bk: 'roof', rc: C(pick(rng, ['#6a6e75', '#5f646b', '#6e564c'])) };
}

// ------------------------------------------------------------------ walls
// one storey after the other; half-timbered upper floors jut out a little
export function body(B, rng, S, w, d, floors, fh, o = {}) {
  let y = o.y0 || 0, W = w, D = d;
  const nbF = o.nbF || Math.max(1, Math.round(w / 0.2));
  const doorK = o.doorK ?? Math.floor(nbF / 2);
  const blank = o.blank || [];
  for (let f = 0; f < floors; f++) {
    if (f > 0 && S.jetty && !o.noJetty) {
      W += 2 * S.jetty; D += 2 * S.jetty;
      B.box('solid', -W / 2 - 0.004, y - 0.016, -D / 2 - 0.004, W / 2 + 0.004, y + 0.005, D / 2 + 0.004, S.beam);
    } else if (f > 0 && o.bands) {
      cornice(B, -W / 2, -D / 2, W / 2, D / 2, y - 0.008, 0.014, 0.008, S.trim || WHITE);
    }
    const L = f === 0 ? S.g : S.u;
    const h = Array.isArray(fh) ? fh[f] : fh;
    boxWalls(B, rng, -W / 2, -D / 2, W / 2, D / 2, y, [h], (s, ff, k, nb) => {
      if (blank.includes(s)) return L.wall;
      if (f === 0 && s === 0 && k === doorK && !o.noDoor) return o.shop ? 'shopdoor' : L.door;
      if (f === 0 && s === 0 && o.shop) return `shop_${o.shop.k}`;
      if (o.cell) { const c = o.cell(s, f, k, nb, L); if (c) return c; }
      if (s === 0) return L.win;
      if (L.rhythm && k % 2 === 1) return L.wall;
      if ((s === 1 || s === 3) && nb >= 3 && k === 1 && !L.rhythm) return L.wall;
      return L.side;
    }, W / nbF);
    y += h;
  }
  return { W, D, yw: y, nbF, bay: w / nbF };
}

function ftri(B, rng, cell, p0, p1, p2) {
  const u = uvq(cell);
  B.tri('facade', p0, p1, p2, W1, [u[0], u[1], u[2], u[5], u[0], u[5]], litOf(cell, rng));
}
// gable triangle, optionally cut flat at ycut (half-hip)
function gableWall(B, rng, cell, ax, az, bx, bz, y0, h, ycut = null) {
  if (ycut === null || ycut >= y0 + h - 1e-4) { gableTri(B, rng, ax, az, bx, bz, y0, h, cell); return; }
  const q = uvq(cell), u0 = q[0], u1 = q[2], v0 = q[1], v1 = q[5];
  const t = (ycut - y0) / h, mx = (ax + bx) / 2, mz = (az + bz) / 2, um = (u0 + u1) / 2, vt = v0 + (v1 - v0) * t;
  const pL = [ax + (mx - ax) * t, ycut, az + (mz - az) * t], pR = [bx + (mx - bx) * t, ycut, bz + (mz - bz) * t];
  B.quad('facade', [ax, y0, az], [bx, y0, bz], pR, pL, W1, [u0, v0, u1, v0, u1 + (um - u1) * t, vt, u0 + (um - u0) * t, vt], litOf(cell, rng));
}

// ------------------------------------------------------------------ roofs
export function halfHipRoof(B, w, d, y0, h, rs, k = 0.62) {
  const o = 0.045, og = 0.03, t = 0.022, Sx = 0.36;
  const ex = w / 2 + og, ez = d / 2 + o, yr = y0 + h, ye = y0 - o * h / (d / 2);
  const yk = y0 + h * k, zk = ez * (yr - yk) / (yr - ye);
  const rx = Math.max(0.03, ex - zk * 0.9);
  const c = rs.rc, bk = rs.bk;
  const uv = (p) => [p[0] / Sx, Math.hypot(ez - Math.abs(p[2]), p[1] - ye) / Sx];
  const poly = (pts) => { for (let i = 1; i < pts.length - 1; i++) B.tri(bk, pts[0], pts[i], pts[i + 1], c, [...uv(pts[0]), ...uv(pts[i]), ...uv(pts[i + 1])]); };
  poly([[-ex, ye, ez], [ex, ye, ez], [ex, yk, zk], [rx, yr, 0], [-rx, yr, 0], [-ex, yk, zk]]);
  poly([[ex, ye, -ez], [-ex, ye, -ez], [-ex, yk, -zk], [-rx, yr, 0], [rx, yr, 0], [ex, yk, -zk]]);
  const Lh = Math.hypot(ex - rx, yr - yk) / Sx;
  B.tri(bk, [ex, yk, zk], [ex, yk, -zk], [rx, yr, 0], c, [zk / Sx, 0, -zk / Sx, 0, 0, Lh]);
  B.tri(bk, [-ex, yk, -zk], [-ex, yk, zk], [-rx, yr, 0], c, [-zk / Sx, 0, zk / Sx, 0, 0, Lh]);
  const fc = shade(c, 0.55);
  B.quad('solid', [-ex, ye - t, ez], [ex, ye - t, ez], [ex, ye, ez], [-ex, ye, ez], fc);
  B.quad('solid', [ex, ye - t, -ez], [-ex, ye - t, -ez], [-ex, ye, -ez], [ex, ye, -ez], fc);
  B.quad('solid', [ex, ye - t, ez], [ex, yk - t, zk], [ex, yk, zk], [ex, ye, ez], fc);
  B.quad('solid', [ex, yk - t, -zk], [ex, ye - t, -ez], [ex, ye, -ez], [ex, yk, -zk], fc);
  B.quad('solid', [-ex, yk - t, zk], [-ex, ye - t, ez], [-ex, ye, ez], [-ex, yk, zk], fc);
  B.quad('solid', [-ex, ye - t, -ez], [-ex, yk - t, -zk], [-ex, yk, -zk], [-ex, ye, -ez], fc);
  B.quad('solid', [ex, yk - t, zk], [ex, yk - t, -zk], [ex, yk, -zk], [ex, yk, zk], fc);
  B.quad('solid', [-ex, yk - t, -zk], [-ex, yk - t, zk], [-ex, yk, zk], [-ex, yk, -zk], fc);
  B.box('solid', -rx, yr - 0.012, -0.018, rx, yr + 0.018, 0.018, shade(c, 0.78));
  return yk;
}

const MROOF = { bk: 'slate', rc: C('#9aa2ae') };
export function mansardRoof(B, S, w, d, y0, h1, h2, ins) {
  const o = 0.03, rs = S.roof, lo = S.mroof || S.roof || MROOF;
  const ex0 = w / 2 + o, ez0 = d / 2 + o, ye = y0 - 0.012;
  const ex1 = w / 2 - ins, ez1 = d / 2 - ins, y1 = y0 + h1;
  const Sx = 0.36, L = Math.hypot(ins + o, h1 + 0.012) / Sx;
  const c = lo.rc, bk = lo.bk;
  B.quad(bk, [-ex0, ye, ez0], [ex0, ye, ez0], [ex1, y1, ez1], [-ex1, y1, ez1], c, [-ex0 / Sx, 0, ex0 / Sx, 0, ex1 / Sx, L, -ex1 / Sx, L]);
  B.quad(bk, [ex0, ye, -ez0], [-ex0, ye, -ez0], [-ex1, y1, -ez1], [ex1, y1, -ez1], c, [-ex0 / Sx, 0, ex0 / Sx, 0, ex1 / Sx, L, -ex1 / Sx, L]);
  B.quad(bk, [ex0, ye, ez0], [ex0, ye, -ez0], [ex1, y1, -ez1], [ex1, y1, ez1], c, [-ez0 / Sx, 0, ez0 / Sx, 0, ez1 / Sx, L, -ez1 / Sx, L]);
  B.quad(bk, [-ex0, ye, -ez0], [-ex0, ye, ez0], [-ex1, y1, ez1], [-ex1, y1, -ez1], c, [-ez0 / Sx, 0, ez0 / Sx, 0, ez1 / Sx, L, -ez1 / Sx, L]);
  B.box('solid', -ex0, ye - 0.02, -ez0, ex0, ye, ez0, S.trim || WHITE, { noTop: true });
  B.box('solid', -ex1 - 0.006, y1 - 0.006, -ez1 - 0.006, ex1 + 0.006, y1 + 0.004, ez1 + 0.006, C('#6d7178'));
  hipRoof(B, 2 * ex1, 2 * ez1, y1 + 0.004, h2, rs.rc, { over: 0.012, bucket: rs.bk });
  return { ye, y1, ez0, ez1, ex0, ex1 };
}
export function mansardDormerAt(B, rng, S, x, m, dw) { mansardDormer(B, rng, S, x, m, dw); }
function mansardDormer(B, rng, S, x, m, dw) {
  const zs = (y) => m.ez0 - (m.ez0 - m.ez1) * (y - m.ye) / (m.y1 - m.ye);
  const yb = m.ye + (m.y1 - m.ye) * 0.12, yt = m.ye + (m.y1 - m.ye) * 0.82;
  const zf = zs(yb) + 0.004, zt = zs(yt), zb = zs(Math.min(m.y1, yt + 0.04));
  fq(B, S.attic, [x - dw / 2, yb, zf], [x + dw / 2, yb, zf], [x + dw / 2, yt, zf], [x - dw / 2, yt, zf], rng);
  ftri(B, rng, S.dwall, [x + dw / 2, yb, zf], [x + dw / 2, yt, zt], [x + dw / 2, yt, zf]);
  ftri(B, rng, S.dwall, [x - dw / 2, yb, zf], [x - dw / 2, yt, zf], [x - dw / 2, yt, zt]);
  const rh = dw * 0.36;
  gableTri(B, rng, x - dw / 2, zf, x + dw / 2, zf, yt, rh, S.dwall);
  const lo = S.mroof || S.roof || MROOF;
  B.push(x, (zf + zb) / 2, Math.PI / 2);
  gableRoof(B, zf - zb + 0.01, dw, yt, rh, lo.rc, { over: 0.014, gover: 0.012, t: 0.01, ridge: false, bucket: lo.bk });
  B.pop();
}

// roof over a box W x D (ridge along x, or along z when along === 'z'); returns its height
function mainRoof(B, rng, S, kind, along, W, D, yw, pitch) {
  if (along === 'z') {
    B.push(0, 0, Math.PI / 2);
    const r = mainRoof(B, rng, S, kind, 'x', D, W, yw, pitch);
    B.pop();
    return r;
  }
  const rs = S.roof;
  if (kind === 'flat') {
    flatRoof(B, -W / 2, -D / 2, W / 2, D / 2, yw, { parapet: 0.028, pcol: S.kind === 'modern' ? '#4a4f55' : '#d9d6cf', col: '#b9b7b0' });
    return { h: 0.03 };
  }
  if (kind === 'hip') {
    const h = Math.min(W, D) / 2 * Math.tan(pitch * 0.85);
    hipRoof(B, W, D, yw, h, rs.rc, { bucket: rs.bk });
    return { h };
  }
  if (kind === 'mansard') {
    const h1 = 0.2, h2 = 0.09, ins = 0.07;
    const m = mansardRoof(B, S, W, D, yw, h1, h2, ins);
    return { h: h1 + h2, m };
  }
  const h = (D / 2) * Math.tan(pitch);
  if (kind === 'halfhip') {
    const yk = halfHipRoof(B, W, D, yw, h, rs, randRange(rng, 0.55, 0.7));
    gableWall(B, rng, S.gable, W / 2, D / 2, W / 2, -D / 2, yw, h, yk);
    gableWall(B, rng, S.gable, -W / 2, -D / 2, -W / 2, D / 2, yw, h, yk);
    return { h };
  }
  gableRoof(B, W, D, yw, h, rs.rc, { bucket: rs.bk });
  gableWall(B, rng, S.gable, W / 2, D / 2, W / 2, -D / 2, yw, h);
  gableWall(B, rng, S.gable, -W / 2, -D / 2, -W / 2, D / 2, yw, h);
  return { h };
}

// ------------------------------------------------------------ additions
function gableDormer(B, rng, S, x, D, yw, h, dw = 0.13, pos = 0.62) {
  const zf = D / 2 * pos, yb = yw + h * (1 - pos), dh = 0.1, depth = 0.15;
  fq(B, S.attic, [x - dw / 2, yb - 0.04, zf], [x + dw / 2, yb - 0.04, zf], [x + dw / 2, yb + dh, zf], [x - dw / 2, yb + dh, zf], rng);
  fq(B, S.dwall, [x + dw / 2, yb - 0.04, zf], [x + dw / 2, yb - 0.04, zf - depth], [x + dw / 2, yb + dh, zf - depth], [x + dw / 2, yb + dh, zf], rng);
  fq(B, S.dwall, [x - dw / 2, yb - 0.04, zf - depth], [x - dw / 2, yb - 0.04, zf], [x - dw / 2, yb + dh, zf], [x - dw / 2, yb + dh, zf - depth], rng);
  const rh = dw * 0.45;
  gableTri(B, rng, x - dw / 2, zf, x + dw / 2, zf, yb + dh, rh, S.dwall);
  B.push(x, zf - depth / 2, Math.PI / 2);
  gableRoof(B, depth, dw, yb + dh, rh, S.roof.rc, { over: 0.018, gover: 0.02, t: 0.012, ridge: false, bucket: S.roof.bk });
  B.pop();
}
// Schleppgaube: a wide dormer under a shallow lean-to roof
function shedDormer(B, rng, S, x, dwid, D, yw, h, pos = 0.6) {
  const zf = D / 2 * pos, yb = yw + h * (1 - pos), dh = 0.105, y1 = yb + dh, sl = 0.3;
  const ym = (z) => yw + h * (1 - z / (D / 2));
  const zm = Math.max(0.01, (yw + h - y1 - sl * zf) / (h / (D / 2) - sl));
  const n = Math.max(1, Math.round(dwid / 0.13));
  for (let i = 0; i < n; i++) {
    const a = x - dwid / 2 + dwid * i / n, b = a + dwid / n;
    fq(B, S.attic, [a, yb - 0.03, zf], [b, yb - 0.03, zf], [b, y1, zf], [a, y1, zf], rng);
  }
  ftri(B, rng, S.dwall, [x + dwid / 2, yb - 0.03, zf], [x + dwid / 2, ym(zm), zm], [x + dwid / 2, y1, zf]);
  ftri(B, rng, S.dwall, [x - dwid / 2, yb - 0.03, zf], [x - dwid / 2, y1, zf], [x - dwid / 2, ym(zm), zm]);
  const o = 0.022, ex = dwid / 2 + 0.016, rs = S.roof, Sx = 0.36;
  const yf = y1 - sl * o + 0.004, yz = ym(zm) + 0.006, L = Math.hypot(zf + o - zm, yz - yf) / Sx;
  B.quad(rs.bk, [x - ex, yf, zf + o], [x + ex, yf, zf + o], [x + ex, yz, zm], [x - ex, yz, zm], rs.rc, [-ex / Sx, 0, ex / Sx, 0, ex / Sx, L, -ex / Sx, L]);
  B.box('solid', x - ex, yf - 0.012, zf + o - 0.004, x + ex, yf, zf + o, shade(rs.rc, 0.55));
}
function dormers(B, rng, S, W, D, yw, h, type, n = null) {
  if (h < 0.16) return;
  if (type === 'shed') { shedDormer(B, rng, S, randRange(rng, -0.04, 0.04), Math.min(W * 0.55, 0.36), D, yw, h); return; }
  n = n ?? (W > 0.56 && rng() < 0.55 ? 2 : 1);
  const xs = n === 1 ? [0] : n === 2 ? [-W / 4, W / 4] : [-W / 3, 0, W / 3];
  for (const x of xs) gableDormer(B, rng, S, x, D, yw, h);
}
// Zwerchhaus: the front wall rises through the eaves under its own gable
function zwerchhaus(B, rng, S, cx, zw, D, yw, h, fh2, pitch) {
  let hz = (zw / 2) * Math.tan(pitch);
  if (fh2 + hz > h * 0.93) { const k = (h * 0.93) / (fh2 + hz); fh2 *= k; hz *= k; }
  const zf = D / 2;
  const n = Math.max(1, Math.round(zw / 0.17));
  facade(B, rng, cx - zw / 2, zf, cx + zw / 2, zf, yw, [fh2], () => S.u.win, zw / n);
  gableWall(B, rng, S.gable, cx - zw / 2, zf, cx + zw / 2, zf, yw + fh2, hz);
  const zMeet = Math.max(0, (D / 2) * (1 - fh2 / h));
  ftri(B, rng, S.dwall, [cx + zw / 2, yw, zf], [cx + zw / 2, yw + fh2, zMeet], [cx + zw / 2, yw + fh2, zf]);
  ftri(B, rng, S.dwall, [cx - zw / 2, yw, zf], [cx - zw / 2, yw + fh2, zf], [cx - zw / 2, yw + fh2, zMeet]);
  const zr = Math.max(-D / 2 + 0.02, (D / 2) * (1 - (fh2 + hz) / h) - 0.02);
  const len = zf - zr;
  B.push(cx, zr + len / 2, Math.PI / 2);
  gableRoof(B, len, zw, yw + fh2, hz, S.roof.rc, { bucket: S.roof.bk, gover: 0.03, over: 0.035 });
  B.pop();
}
// oriel window on an upper floor
function erker(B, rng, S, cx, zf, y0, y1, w, dp) {
  const nf = Math.max(1, Math.round((y1 - y0) / 0.24)), fh = (y1 - y0) / nf;
  for (let f = 0; f < nf; f++) {
    const a = y0 + f * fh, b = a + fh;
    fq(B, S.u.win, [cx - w / 2, a, zf + dp], [cx + w / 2, a, zf + dp], [cx + w / 2, b, zf + dp], [cx - w / 2, b, zf + dp], rng);
    fq(B, S.u.wall, [cx + w / 2, a, zf + dp], [cx + w / 2, a, zf], [cx + w / 2, b, zf], [cx + w / 2, b, zf + dp], rng);
    fq(B, S.u.wall, [cx - w / 2, a, zf], [cx - w / 2, a, zf + dp], [cx - w / 2, b, zf + dp], [cx - w / 2, b, zf], rng);
  }
  B.box('solid', cx - w / 2 - 0.004, y0 - 0.016, zf, cx + w / 2 + 0.004, y0, zf + dp + 0.006, C('#d8d2c6'));
  B.box('solid', cx - w / 2 + 0.02, y0 - 0.05, zf, cx + w / 2 - 0.02, y0 - 0.016, zf + dp * 0.6, C('#cfc8bb'));
  const o = 0.012, rh = 0.055;
  const copper = rng() < 0.45;
  const bk = copper ? 'metal' : S.roof.bk, rc = copper ? C('#7fb59d') : S.roof.rc;
  const fl = [cx - w / 2 - o, y1, zf + dp + o], fr = [cx + w / 2 + o, y1, zf + dp + o];
  const tl = [cx - w / 2 - o, y1 + rh, zf], tr = [cx + w / 2 + o, y1 + rh, zf];
  B.quad(bk, fl, fr, tr, tl, rc, [0, 0, (w + 2 * o) / 0.36, 0, (w + 2 * o) / 0.36, 0.25, 0, 0.25]);
  B.tri(bk, fr, [cx + w / 2 + o, y1, zf], tr, rc);
  B.tri(bk, [cx - w / 2 - o, y1, zf], fl, tl, rc);
}
function cone(B, rs, cx, cz, y0, r, h, n = 8) {
  const Sx = 0.36;
  const P = (i) => { const a = i / n * Math.PI * 2 + Math.PI / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; };
  const side = 2 * r * Math.sin(Math.PI / n), slant = Math.hypot(r * Math.cos(Math.PI / n), h);
  for (let i = 0; i < n; i++) {
    const a = P(i + 1), b = P(i);
    B.tri(rs.bk, [a[0], y0, a[1]], [b[0], y0, b[1]], [cx, y0 + h, cz], rs.rc, [-side / 2 / Sx, 0, side / 2 / Sx, 0, 0, slant / Sx]);
  }
}
// octagonal corner tower with a pointed roof
function tower(B, rng, S, cx, cz, r, levels, fh, roofH, rs) {
  const n = 8;
  const P = (i) => { const a = i / n * Math.PI * 2 + Math.PI / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; };
  let y = 0;
  for (let f = 0; f < levels; f++) {
    const L = f === 0 ? S.g : S.u;
    for (let i = 0; i < n; i++) {
      const a = P(i + 1), b = P(i);
      fq(B, i % 2 ? L.wall : L.win, [a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + fh, b[1]], [a[0], y + fh, a[1]], rng);
    }
    y += fh;
  }
  B.cyl('solid', cx, y - 0.012, cz, r * 1.08 + 0.008, 0.016, n, S.trim || WHITE);
  cone(B, rs, cx, cz, y + 0.004, r * 1.08 + 0.02, roofH, n);
  B.cyl('solid', cx, y + roofH - 0.01, cz, 0.004, 0.05, 4, C('#3a3a3a'));
  return y + roofH;
}
function canopy(B, rs, x, zf, y, w = 0.17, dp = 0.075) {
  const Sx = 0.36;
  B.quad(rs.bk, [x - w / 2, y, zf + dp], [x + w / 2, y, zf + dp], [x + w / 2, y + 0.04, zf], [x - w / 2, y + 0.04, zf], rs.rc, [0, 0, w / Sx, 0, w / Sx, dp / Sx, 0, dp / Sx]);
  const fc = shade(rs.rc, 0.55);
  B.box('solid', x - w / 2, y - 0.008, zf + dp - 0.006, x + w / 2, y, zf + dp, fc);
  for (const s of [-1, 1]) B.box('solid', x + s * (w / 2 - 0.012) - 0.004, y - 0.045, zf, x + s * (w / 2 - 0.012) + 0.004, y, zf + dp * 0.8, C('#3b2b20'));
}
function steps(B, x, zf, w = 0.1) {
  B.box('solid', x - w / 2, 0, zf, x + w / 2, 0.022, zf + 0.035, C('#c9c2b6'));
  B.box('solid', x - w / 2 - 0.01, 0, zf + 0.035, x + w / 2 + 0.01, 0.011, zf + 0.06, C('#c9c2b6'));
}
function garage(B, rng, S, x0, x1, z0, z1, h = 0.2) {
  const cell = S.kind === 'modern' ? 'garage_grey' : rng() < 0.6 ? 'garage_wood' : 'garage_grey';
  boxWalls(B, rng, x0, z0, x1, z1, 0, [h], (s) => (s === 0 ? cell : S.g.wall === 'rubble_win' ? `wall_${S.pk}` : S.g.wall), x1 - x0);
  flatRoof(B, x0, z0, x1, z1, h, { parapet: 0.016, pcol: S.kind === 'modern' ? '#4a4f55' : '#d9d6cf' });
  aoDecal(B, x0, z0, x1, z1, 0.05);
}
function carport(B, x0, x1, z0, z1, h = 0.19, wood = true) {
  const pc = C(wood ? '#7a5434' : '#3f444a');
  for (const x of [x0 + 0.012, x1 - 0.012]) for (const z of [z0 + 0.012, z1 - 0.012]) B.box('solid', x - 0.008, 0, z - 0.008, x + 0.008, h, z + 0.008, pc);
  B.box('solid', x0 - 0.01, h, z0 - 0.01, x1 + 0.01, h + 0.022, z1 + 0.01, pc);
  B.box('solid', x0, h + 0.022, z0, x1, h + 0.026, z1, C('#9aa3a0'));
}

// ------------------------------------------------------------ gardens
function trampoline(B, x, z, rng) {
  B.cyl('solid', x, 0.034, z, 0.088, 0.007, 14, C(pick(rng, ['#2f6db5', '#3f8f4a', '#d64545'])));
  B.cyl('solid', x, 0.041, z, 0.074, 0.002, 14, C('#1d1d1f'));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; B.box('solid', x + Math.cos(a) * 0.08 - 0.004, 0, z + Math.sin(a) * 0.08 - 0.004, x + Math.cos(a) * 0.08 + 0.004, 0.034, z + Math.sin(a) * 0.08 + 0.004, C('#7a7d80')); }
}
function pool(B, x, z) {
  B.box('solid', x - 0.12, 0, z - 0.075, x + 0.12, 0.018, z + 0.075, C('#ece8df'));
  B.rect('glass', x - 0.104, z - 0.06, x + 0.104, z + 0.06, 0.0195, C('#5cc8e8'), 1);
  B.box('solid', x + 0.13, 0, z - 0.03, x + 0.16, 0.02, z + 0.05, C('#f4f4f2'));
}
function shed(B, rng, x, z, rs) {
  const w = 0.13, d = 0.11, h = 0.09;
  boxWalls(B, rng, x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, [h], () => 'wood_wall', w);
  B.box('solid', x - 0.02, 0, z + d / 2, x + 0.02, 0.07, z + d / 2 + 0.003, C('#3f2b1e'));
  B.push(x, z);
  gableRoof(B, w, d, h, 0.05, rs.rc, { over: 0.018, gover: 0.015, t: 0.01, bucket: rs.bk });
  gableTri(B, rng, w / 2, d / 2, w / 2, -d / 2, h, 0.05, 'wood_wall');
  gableTri(B, rng, -w / 2, -d / 2, -w / 2, d / 2, h, 0.05, 'wood_wall');
  B.pop();
}
function greenhouse(B, x, z) {
  const w = 0.14, d = 0.09, h = 0.06, f = C('#f2f2ee');
  B.box('glass', x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, C('#cfe6ea'));
  B.quad('glass', [x - w / 2, h, z + d / 2], [x + w / 2, h, z + d / 2], [x + w / 2, h + 0.035, z], [x - w / 2, h + 0.035, z], C('#cfe6ea'));
  B.quad('glass', [x + w / 2, h, z - d / 2], [x - w / 2, h, z - d / 2], [x - w / 2, h + 0.035, z], [x + w / 2, h + 0.035, z], C('#cfe6ea'));
  for (const xx of [x - w / 2, x, x + w / 2]) B.box('solid', xx - 0.003, 0, z + d / 2 - 0.003, xx + 0.003, h, z + d / 2 + 0.002, f);
  B.box('solid', x - w / 2, h + 0.03, z - 0.004, x + w / 2, h + 0.038, z + 0.004, f);
}
function sandbox(B, rng, x, z) {
  const wc = C('#a07444');
  B.box('solid', x - 0.07, 0, z - 0.07, x + 0.07, 0.02, z - 0.06, wc); B.box('solid', x - 0.07, 0, z + 0.06, x + 0.07, 0.02, z + 0.07, wc);
  B.box('solid', x - 0.07, 0, z - 0.06, x - 0.06, 0.02, z + 0.06, wc); B.box('solid', x + 0.06, 0, z - 0.06, x + 0.07, 0.02, z + 0.06, wc);
  B.rect('sand', x - 0.06, z - 0.06, x + 0.06, z + 0.06, 0.016, C('#f0dfb0'), 0.5);
  for (let i = 0; i < 3; i++) B.box('solid', x - 0.04 + i * 0.03, 0.016, z - 0.02 + (i % 2) * 0.03, x - 0.03 + i * 0.03, 0.026, z - 0.01 + (i % 2) * 0.03, C(pick(rng, ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'])));
}
function woodpile(B, x, z) {
  for (let i = 0; i < 3; i++) B.box('solid', x - 0.07, i * 0.016, z - 0.025, x + 0.07, i * 0.016 + 0.015, z + 0.025, shade(C('#9b6a3e'), 1 - i * 0.08));
  B.quad('roof', [x - 0.08, 0.06, z + 0.04], [x + 0.08, 0.06, z + 0.04], [x + 0.08, 0.075, z - 0.035], [x - 0.08, 0.075, z - 0.035], C('#6b5a4a'));
}
function laundry(B, rng, x, z) {
  const pc = C('#8d8d8d');
  B.cyl('solid', x - 0.18, 0, z, 0.005, 0.11, 4, pc); B.cyl('solid', x + 0.18, 0, z, 0.005, 0.11, 4, pc);
  B.box('solid', x - 0.18, 0.105, z - 0.002, x + 0.18, 0.108, z + 0.002, C('#dddddd'));
  const cc = ['#ffffff', '#e74c3c', '#3498db', '#f1c40f', '#ff9ec7', '#2ecc71', '#f39c12'];
  for (let xx = x - 0.15; xx < x + 0.15; xx += 0.05) B.box('solid', xx, 0.06, z - 0.001, xx + 0.036, 0.105, z + 0.001, C(pick(rng, cc)));
}
function veggies(B, rng, x, z) {
  B.rect('dirt', x - 0.12, z - 0.07, x + 0.12, z + 0.07, 0.008, C('#9a7a5a'), 1);
  for (let xx = x - 0.1; xx < x + 0.1; xx += 0.04) for (let zz = z - 0.05; zz < z + 0.06; zz += 0.035) B.sphere('solid', xx, 0.016, zz, 0.014, 0.012, 0.014, C(rng() < 0.3 ? '#d9442b' : '#5f9a3c'), 5, 3);
}
function swing(B, x, z) {
  const wc = C('#8a5a35');
  B.box('solid', x - 0.12, 0, z - 0.005, x - 0.11, 0.13, z + 0.005, wc); B.box('solid', x + 0.11, 0, z - 0.005, x + 0.12, 0.13, z + 0.005, wc);
  B.box('solid', x - 0.12, 0.13, z - 0.007, x + 0.12, 0.14, z + 0.007, wc);
  for (const xx of [-0.05, 0.05]) {
    B.box('solid', x + xx - 0.002, 0.04, z - 0.001, x + xx + 0.002, 0.13, z + 0.001, C('#999'));
    B.box('solid', x + xx - 0.022, 0.035, z - 0.01, x + xx + 0.022, 0.042, z + 0.01, C(xx < 0 ? '#d33' : '#36c'));
  }
}
const BIKE_COLS = ['#c0392b', '#2c3e50', '#16a085', '#f1c40f', '#8e44ad', '#ecf0f1', '#2980b9'];
function bikes(B, rng, x, z, n = 2, a = 0) {
  for (let i = 0; i < n; i++) MD.bicycle(B, x + i * 0.035 * Math.sin(a + Math.PI / 2), z + i * 0.035 * Math.cos(a + Math.PI / 2), a, C(pick(rng, BIKE_COLS)));
}

const EXTRAS = ['trampoline', 'pool', 'shed', 'greenhouse', 'sandbox', 'laundry', 'veggies', 'swing', 'table', 'woodpile', 'bikes', 'flowers'];
function extra(B, rng, kind, x, z, S, meta) {
  switch (kind) {
    case 'trampoline': trampoline(B, x, z, rng); break;
    case 'pool': pool(B, x, z); break;
    case 'shed': shed(B, rng, x, z, S.roof.bk === 'slate' ? { bk: 'roof', rc: C('#5c6067') } : S.roof); break;
    case 'greenhouse': greenhouse(B, x, z); break;
    case 'sandbox': sandbox(B, rng, x, z); break;
    case 'laundry': laundry(B, rng, x, z); break;
    case 'veggies': veggies(B, rng, x, z); break;
    case 'swing': swing(B, x, z); break;
    case 'table': MD.umbrellaTable(B, x, z, C(pick(rng, ['#e74c3c', '#f1c40f', '#ffffff', '#2e86de', '#2e7d4f']))); break;
    case 'woodpile': woodpile(B, x, z); break;
    case 'bikes': bikes(B, rng, x - 0.03, z, 2); break;
    default: MD.flowerBed(B, x, z, 0.06, Math.floor(rng() * 1000)); break;
  }
}

// lawn, paths, boundaries and garden life around a house
// o: { fz (front wall z), z0 (back wall z), x0, x1 (house extent), doorX, drive: [x0, x1] or null, modern, farm }
function yard(B, rng, meta, S, o) {
  const lawn = o.farm ? ['#eef0d8', '#e8ecd2'] : ['#f2f6e6', '#e6eed6', '#f6f2dc', '#eaf2dc'];
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C(pick(rng, lawn)), 3);
  const pathCol = C(pick(rng, ['#ece4d6', '#e2d8c8', '#d8d2c8', '#efe9df']));
  B.rect(o.modern ? 'flat' : 'cobble', o.doorX - 0.036, o.fz, o.doorX + 0.036, 0.5, 0.007, pathCol, o.modern ? 0.5 : 1.1);
  if (o.drive) B.rect(o.modern ? 'flat' : 'cobble', o.drive[0], o.driveZ ?? 0.0, o.drive[1], 0.5, 0.0072, C(o.modern ? '#cfcac0' : '#ddd5c8'), o.modern ? 0.5 : 1.1);
  // back boundary
  const back = rng();
  if (back < 0.55) hedge(B, -0.48, -0.48, 0.48, -0.43);
  else {
    const wc = C(pick(rng, ['#9a6a42', '#7a5434', '#a88b6a']));
    for (let x = -0.47; x <= 0.47; x += 0.06) B.box('solid', x - 0.006, 0, -0.475, x + 0.006, 0.07, -0.465, wc);
    B.box('solid', -0.47, 0.03, -0.473, 0.47, 0.06, -0.467, wc);
  }
  // side hedges (not across the drive)
  for (const s of [-1, 1]) {
    const x = s * 0.455;
    if (o.drive && x > o.drive[0] - 0.03 && x < o.drive[1] + 0.03) continue;
    if (rng() < 0.6) hedge(B, x - 0.02, -0.43, x + 0.02, 0.38, 0.06);
  }
  // front boundary, interrupted for the path and the drive
  const gaps = [[o.doorX - 0.055, o.doorX + 0.055]];
  if (o.drive) gaps.push([o.drive[0] - 0.005, o.drive[1] + 0.005]);
  gaps.sort((a, b) => a[0] - b[0]);
  const segs = [];
  let x = -0.47;
  for (const [a, b] of gaps) { if (a > x) segs.push([x, a]); x = Math.max(x, b); }
  if (x < 0.47) segs.push([x, 0.47]);
  const ft = o.modern ? (rng() < 0.6 ? 'none' : 'wall') : wpick(rng, [['picket', 3], ['hedge', 3], ['wall', 1.5], ['lattice', 1.5], ['none', 0.6]]);
  for (const [a, b] of segs) {
    if (b - a < 0.02) continue;
    if (ft === 'picket') picketFence(B, a, b, 0.465, null, 0.06, rng() < 0.7 ? WHITE : C('#9a6a42'));
    else if (ft === 'hedge') hedge(B, a, 0.44, b, 0.48, 0.05, '#55853a');
    else if (ft === 'wall') {
      B.box('solid', a, 0, 0.45, b, 0.035, 0.48, C(o.modern ? '#d6d3cc' : '#bdb3a2'));
      if (!o.modern) for (let xx = a + 0.01; xx < b; xx += 0.022) B.box('solid', xx, 0.035, 0.463, xx + 0.004, 0.07, 0.467, C('#2f3236'));
    } else if (ft === 'lattice') {
      // Jägerzaun: crossed laths between posts
      const wc = C('#a0754a');
      for (let xx = a; xx < b - 0.01; xx += 0.07) {
        B.box('solid', xx - 0.005, 0, 0.46, xx + 0.005, 0.07, 0.47, wc);
        const e = Math.min(b, xx + 0.07);
        B.quad('solid', [xx, 0.012, 0.466], [e, 0.06, 0.466], [e, 0.066, 0.466], [xx, 0.018, 0.466], wc);
        B.quad('solid', [xx, 0.06, 0.464], [e, 0.012, 0.464], [e, 0.018, 0.464], [xx, 0.066, 0.464], wc);
      }
    }
  }
  // bins and a letterbox at the path
  const bx = o.drive ? (o.drive[0] + o.drive[1]) / 2 + (o.drive[0] > 0 ? -0.15 : 0.15) : (o.doorX > 0 ? -0.36 : 0.36);
  const nb = randInt(rng, 2, 3);
  for (let i = 0; i < nb; i++) MD.bin(B, clampX(bx + (i - 1) * 0.046), 0.41, C(BIN_COLS[(i + Math.floor(rng() * 5)) % 5]));
  B.box('solid', o.doorX + 0.06, 0, 0.452, o.doorX + 0.066, 0.06, 0.458, C('#3a3d42'));
  B.box('solid', o.doorX + 0.052, 0.06, 0.446, o.doorX + 0.074, 0.08, 0.462, C(pick(rng, ['#e8b21e', '#2f3236', '#b03a2e', '#2f6db5'])));
  // flowers along the front wall
  for (let i = 0; i < 6; i++) {
    const fx = o.x0 + 0.04 + rng() * (o.x1 - o.x0 - 0.08);
    if (Math.abs(fx - o.doorX) < 0.06) continue;
    B.sphere('solid', fx, 0.018, o.fz + 0.03, 0.022, 0.02, 0.018, C(pick(rng, ['#e23b4b', '#ff6f91', '#ffcf3f', '#b54ad8', '#ffffff', '#4f8f3a'])), 6, 3);
  }
  if (rng() < 0.35 && !o.modern) bikes(B, rng, o.doorX + (o.doorX > 0 ? -0.12 : 0.1), o.fz + 0.07, randInt(rng, 1, 2));
  // back garden: up to three activities on free slots
  const room = o.z0 + 0.47;
  const ts = rng() < 0.5 ? -1 : 1;
  const slots = (room > 0.3 ? [[-0.27, -0.33], [0.0, -0.36], [0.27, -0.33]] : [[-0.3, -0.4], [0.3, -0.4]]).filter((sl) => Math.sign(sl[0]) !== ts);
  const n = room > 0.3 ? randInt(rng, 1, 3) : 1;
  const used = new Set();
  const pool2 = o.modern ? ['pool', 'pool', 'table', 'trampoline', 'flowers'] : o.farm ? ['veggies', 'woodpile', 'laundry', 'shed', 'veggies'] : EXTRAS;
  for (let i = 0; i < n; i++) {
    const s = slots[Math.floor(rng() * slots.length)];
    const key = s.join();
    if (used.has(key)) continue;
    used.add(key);
    let k = pick(rng, pool2);
    if ((k === 'pool' || k === 'laundry') && s[0] !== 0 && room > 0.3) k = 'sandbox';
    extra(B, rng, k, s[0], s[1], S, meta);
  }
  meta.trees.push([ts * 0.37, -0.37, pick(rng, ['round', 'round', 'fruit', 'conifer', 'tall']), randRange(rng, 0.75, 1.05)]);
  if (rng() < 0.5) meta.trees.push([o.x0 - 0.03, o.fz + 0.05, 'bush', randRange(rng, 0.7, 1)]);
  if (rng() < 0.5 && !o.drive) meta.trees.push([o.x1 + 0.03, o.fz + 0.05, 'bush', randRange(rng, 0.7, 1)]);
}
function clampX(x) { return Math.max(-0.44, Math.min(0.44, x)); }

// ============================================================ archetypes L1
function finish(meta, door, height, shell) { meta.door = door; meta.height = height; meta.shell = shell; }

// Traufhaus: eaves to the street, dormers or a Zwerchhaus
function trauf(B, rng, meta) {
  const kind = wpick(rng, [['plaster', 6], ['fach', 3], ['slate', 1], ['wood', 0.6], ['brick', 1.1], ['bfw', 0.8]]);
  const S = houseStyle(rng, kind);
  const w = randRange(rng, 0.56, 0.66), d = randRange(rng, 0.44, 0.5);
  const floors = rng() < 0.3 ? 1 : 2, fh = 0.25;
  const fz = 0.31, hx = randRange(rng, -0.05, 0.05);
  const nbF = Math.max(2, Math.round(w / 0.2)), doorK = rng() < 0.6 ? Math.floor(nbF / 2) : 0;
  const doorX = hx - w / 2 + (doorK + 0.5) * w / nbF;
  const j = (S.jetty || 0) * (floors - 1);
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2 - j, x1: hx + w / 2 + j });
  B.push(hx, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK });
  const pitch = randRange(rng, 0.78, 0.98);
  const rk = wpick(rng, [['gable', 5], ['halfhip', 3], ['hip', 1]]);
  const { h } = mainRoof(B, rng, S, rk, 'x', W, D, yw, pitch);
  const add = rng();
  if (add < 0.38 && rk !== 'hip') zwerchhaus(B, rng, S, pick(rng, [0, 0, -(W / 2 - 0.17), W / 2 - 0.17]), 0.27, D, yw, h, fh * 0.85, pitch + 0.12);
  else if (add < 0.8) dormers(B, rng, S, W, D, yw, h, rng() < 0.45 ? 'shed' : 'gable');
  if (rng() < 0.7) chimney(B, (rng() < 0.5 ? -1 : 1) * W * 0.24, -D * 0.14, yw + h * 0.35, yw + h + 0.07, rng() < 0.5 ? '#9b4a35' : '#8d8a84');
  if (rng() < 0.55) canopy(B, S.roof, doorX - hx, d / 2, fh * 0.8);
  steps(B, doorX - hx, d / 2);
  B.pop();
  finish(meta, [doorX, fz + 0.03], yw + h, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: Array(floors).fill(fh), roofH: h, mat: 'brick' });
}

// Giebelhaus: narrow and deep, gable to the street
function giebel(B, rng, meta) {
  const kind = wpick(rng, [['plaster', 5], ['fach', 4], ['slate', 1.2], ['bfw', 1], ['brick', 0.8]]);
  const S = houseStyle(rng, kind);
  const w = randRange(rng, 0.44, 0.52), d = randRange(rng, 0.56, 0.62);
  const floors = 2, fh = 0.25, fz = 0.34, hx = randRange(rng, -0.12, 0.12);
  const nbF = 2, doorK = rng() < 0.5 ? 0 : 1;
  const doorX = hx - w / 2 + (doorK + 0.5) * w / nbF;
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2 });
  B.push(hx, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK });
  const pitch = randRange(rng, 0.92, 1.06);
  const rk = wpick(rng, [['gable', 4], ['halfhip', 2]]);
  const { h } = mainRoof(B, rng, S, rk, 'z', W, D, yw, pitch);
  // dormer on the long side facing the camera
  if (rng() < 0.45) {
    B.push(0, 0, Math.PI / 2);
    dormers(B, rng, S, D, W, yw, h, rng() < 0.5 ? 'shed' : 'gable', 1);
    B.pop();
  }
  if (S.kind === 'plaster' && rng() < 0.3) erker(B, rng, S, 0, D / 2, fh + 0.03, 2 * fh - 0.02, 0.17, 0.06);
  else if (rng() < 0.25) balconyRow(B, -0.1, 0.1, D / 2, fh * 2 + 0.01, 0.06, 'iron');
  if (rng() < 0.7) chimney(B, W * 0.2, -D * 0.2, yw + h * 0.3, yw + h + 0.06);
  if (rng() < 0.5) canopy(B, S.roof, doorX - hx, d / 2, fh * 0.8, 0.15);
  steps(B, doorX - hx, d / 2, 0.09);
  B.pop();
  finish(meta, [doorX, fz + 0.03], yw + h, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh, fh], roofH: h, mat: 'brick' });
}

// Winkelhaus: main house plus a gabled wing towards the street
function winkel(B, rng, meta) {
  const kind = wpick(rng, [['plaster', 5], ['fach', 2.5], ['brick', 1], ['bfw', 0.8], ['slate', 0.7]]);
  const S = houseStyle(rng, kind);
  const fh = 0.25, floors = rng() < 0.35 ? 1 : 2;
  const mw = 0.62, md = 0.38, mz = -0.1;
  const side = rng() < 0.5 ? 1 : -1;
  const ww = 0.26, wz1 = 0.33, wx = side * (mw / 2 - ww / 2);
  const wz0 = mz + md / 2 - 0.02, wd = wz1 - wz0;
  const doorX = -side * 0.1;
  yard(B, rng, meta, S, { doorX, fz: mz + md / 2, z0: mz - md / 2, x0: -mw / 2, x1: mw / 2 });
  // main
  B.push(0, mz);
  plinth(B, -mw / 2, -md / 2, mw / 2, md / 2);
  aoDecal(B, -mw / 2, -md / 2, mw / 2, md / 2);
  const nbF = 3, doorK = side > 0 ? 1 : 1;
  const m = body(B, rng, S, mw, md, floors, fh, { nbF, doorK, noJetty: true });
  const pitch = randRange(rng, 0.82, 0.98);
  const r1 = mainRoof(B, rng, S, rng() < 0.7 ? 'gable' : 'halfhip', 'x', m.W, m.D, m.yw, pitch);
  if (rng() < 0.5) chimney(B, -side * mw * 0.25, -md * 0.15, m.yw + r1.h * 0.35, m.yw + r1.h + 0.07);
  if (rng() < 0.6) canopy(B, S.roof, doorX, md / 2, fh * 0.8);
  steps(B, doorX, md / 2);
  B.pop();
  // wing
  B.push(wx, (wz0 + wz1) / 2);
  aoDecal(B, -ww / 2, -wd / 2, ww / 2, wd / 2);
  const wg = body(B, rng, S, ww, wd, floors, fh, { nbF: 1, noDoor: true, noJetty: true, blank: [2] });
  B.push(0, -0.08);
  const r2 = mainRoof(B, rng, S, 'gable', 'z', wg.W, wg.D + 0.16, wg.yw, pitch);
  B.pop();
  if (rng() < 0.35) balconyRow(B, -0.09, 0.09, wd / 2, fh * floors + 0.01 - fh, 0.05, 'iron');
  B.pop();
  finish(meta, [doorX, mz + md / 2 + 0.03], m.yw + Math.max(r1.h, r2.h), { x0: -mw / 2, z0: mz - md / 2, x1: mw / 2, z1: wz1, fhs: Array(floors).fill(fh), roofH: r1.h, mat: 'brick' });
}

// Villa: square body under a hip roof, oriel or corner tower, veranda
function villa(B, rng, meta) {
  const S = houseStyle(rng, 'plaster', { wins: [['win_a', 3], ['win_o', 2.5], ['win_g', 1.5], ['win_s', 1], ['win_b', 1]], pk: ['white', 'cream', 'yellow', 'blue', 'sand', 'mint'] });
  if (rng() < 0.5) S.roof = roofStyle(rng, 'slate');
  const w = randRange(rng, 0.5, 0.56), d = Math.min(w, randRange(rng, 0.48, 0.54));
  const floors = 2, fh = 0.27, fz = 0.3, hx = randRange(rng, -0.08, 0.04);
  const nbF = 3, doorK = 1, doorX = hx;
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2 });
  B.push(hx, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.055, C('#b9b0a2'));
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK, bands: true });
  cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.022, 0.026, 0.02, S.trim);
  const pitch = randRange(rng, 0.62, 0.78);
  const rk = rng() < 0.25 ? 'mansard' : 'hip';
  const r = mainRoof(B, rng, S, rk, 'x', W, D, yw, pitch);
  let top = yw + r.h;
  if (rk === 'mansard') { for (const x of [-W / 4, W / 4]) mansardDormer(B, rng, S, x, r.m, 0.11); }
  else gableDormer(B, rng, S, 0, D, yw, Math.min(W, D) / 2 * Math.tan(pitch * 0.85), 0.13, 0.55);
  if (rng() < 0.5) {
    const tx = W / 2 - 0.02, tz = D / 2 - 0.02;
    top = Math.max(top, tower(B, rng, S, tx, tz, 0.085, 3, fh, 0.24, S.roof));
  } else erker(B, rng, S, -W / 4 - 0.02, D / 2, fh + 0.03, 2 * fh - 0.02, 0.17, 0.065);
  // veranda with columns
  const vx0 = -W / 2 + 0.02, vx1 = -W / 2 + 0.28;
  if (rng() < 0.6) {
    for (const x of [vx0 + 0.01, vx1 - 0.01]) B.box('solid', x - 0.008, 0, D / 2 + 0.07, x + 0.008, fh * 0.92, D / 2 + 0.086, S.trim);
    B.box('solid', vx0, fh * 0.92, D / 2, vx1, fh * 0.92 + 0.02, D / 2 + 0.095, S.trim);
    balconyRow(B, vx0 + 0.005, vx1 - 0.005, D / 2, fh * 0.92 + 0.02, 0.085, 'iron');
    B.box('solid', vx0, 0, D / 2, vx1, 0.03, D / 2 + 0.09, C('#cfc8bb'));
  } else canopy(B, S.roof, 0, d / 2, fh * 0.82, 0.2);
  steps(B, 0, d / 2, 0.12);
  if (rng() < 0.6) chimney(B, -W * 0.2, -D * 0.1, yw + r.h * 0.3, yw + r.h + 0.06, '#a39d92');
  B.pop();
  finish(meta, [doorX, fz + 0.03], top, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh, fh], roofH: r.h, mat: 'brick' });
}

// Siedlungshaus: small, steep roof, garage and a car in the drive
function siedlung(B, rng, meta) {
  const S = houseStyle(rng, rng() < 0.85 ? 'plaster' : 'brick', { wins: [['win_s', 2], ['win_r', 2], ['win_p', 2], ['win_g', 1]], pk: ['white', 'cream', 'sand', 'yellow', 'pink', 'salmon'] });
  const side = rng() < 0.5 ? 1 : -1;
  const w = randRange(rng, 0.44, 0.48), d = 0.4, fh = 0.25, fz = 0.3;
  const hx = -side * 0.14;
  const drive = side > 0 ? [0.17, 0.43] : [-0.43, -0.17];
  const nbF = 2, doorK = side > 0 ? 1 : 0, doorX = hx - w / 2 + (doorK + 0.5) * w / nbF;
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2, drive, driveZ: -0.02 });
  B.push(hx, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, 1, fh, { nbF, doorK });
  const ridgeZ = rng() < 0.35;
  const pitch = randRange(rng, 0.95, 1.05);
  const { h } = mainRoof(B, rng, S, rng() < 0.75 ? 'gable' : 'halfhip', ridgeZ ? 'z' : 'x', W, D, yw, pitch);
  if (!ridgeZ) dormers(B, rng, S, W, D, yw, h, rng() < 0.6 ? 'gable' : 'shed', 1);
  if (rng() < 0.6) chimney(B, -W * 0.2, -D * 0.15, yw + h * 0.3, yw + h + 0.06);
  canopy(B, S.roof, doorX - hx, d / 2, fh * 0.8, 0.15);
  B.pop();
  const gx0 = drive[0] + 0.01, gx1 = drive[1] - 0.01;
  if (rng() < 0.7) garage(B, rng, S, gx0, gx1, -0.46, -0.02, 0.2);
  else carport(B, gx0, gx1, -0.46, -0.02, 0.19);
  if (rng() < 0.85) parkedCar(B, (drive[0] + drive[1]) / 2, 0.25, -Math.PI / 2, rng);
  finish(meta, [doorX, fz + 0.03], yw + h, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh], roofH: h, mat: 'brick' });
}

// Doppelhaus: two halves, each painted by its own owner
function doppel(B, rng, meta) {
  const roof = roofStyle(rng);
  const S1 = houseStyle(rng, 'plaster', { roof }), S2 = houseStyle(rng, 'plaster', { roof });
  const w = randRange(rng, 0.74, 0.8), d = randRange(rng, 0.42, 0.46), fh = 0.25, floors = rng() < 0.3 ? 1 : 2, fz = 0.3;
  const hw = w / 2, d1 = -0.75 * hw, d2 = 0.75 * hw;
  yard(B, rng, meta, S1, { doorX: d1, fz, z0: fz - d, x0: -hw, x1: hw });
  B.rect('cobble', d2 - 0.036, fz, d2 + 0.036, 0.5, 0.007, C('#e2d8c8'), 1.1);
  hedge(B, -0.01, -0.43, 0.01, fz - d - 0.02, 0.06);
  B.push(0, fz - d / 2);
  plinth(B, -hw, -d / 2, hw, d / 2);
  aoDecal(B, -hw, -d / 2, hw, d / 2);
  for (const [S, cx, doorK] of [[S1, -hw / 2, 0], [S2, hw / 2, 1]]) {
    B.push(cx, 0);
    body(B, rng, S, hw, d, floors, fh, { nbF: 2, doorK, blank: [cx < 0 ? 1 : 3] });
    canopy(B, roof, (doorK - 0.5) * hw / 2, d / 2, fh * 0.8, 0.13, 0.06);
    B.pop();
  }
  const yw = floors * fh, pitch = randRange(rng, 0.8, 0.95);
  const h = (d / 2) * Math.tan(pitch);
  gableRoof(B, w, d, yw, h, roof.rc, { bucket: roof.bk });
  gableWall(B, rng, S2.gable, w / 2, d / 2, w / 2, -d / 2, yw, h);
  gableWall(B, rng, S1.gable, -w / 2, -d / 2, -w / 2, d / 2, yw, h);
  for (const [S, cx] of [[S1, -hw / 2], [S2, hw / 2]]) {
    B.push(cx, 0);
    if (rng() < 0.7) { const t = rng() < 0.5 ? 'shed' : 'gable'; if (t === 'shed') shedDormer(B, rng, S, 0, 0.2, d, yw, h); else gableDormer(B, rng, S, 0, d, yw, h); }
    B.pop();
  }
  chimney(B, -hw * 0.5, -d * 0.12, yw + h * 0.4, yw + h + 0.06);
  B.pop();
  finish(meta, [d1, fz + 0.03], yw + h, { x0: -hw, z0: fz - d, x1: hw, z1: fz, fhs: Array(floors).fill(fh), roofH: h, mat: 'brick' });
}

// modern cube with an offset upper floor, carport and pool
function modern(B, rng, meta) {
  const S = houseStyle(rng, 'modern');
  const side = rng() < 0.5 ? 1 : -1;
  const w = 0.48, d = 0.42, fh = 0.26, fz = 0.32, hx = -side * 0.1;
  const drive = side > 0 ? [0.2, 0.44] : [-0.44, -0.2];
  const doorX = hx + side * 0.12;
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2, drive, driveZ: -0.05, modern: true });
  B.push(hx, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  body(B, rng, S, w, d, 1, fh, { nbF: 2, doorK: side > 0 ? 1 : 0 });
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, fh, { parapet: 0.012, pcol: '#4a4f55', col: '#b9b7b0' });
  // upper box, shifted and cantilevered, partly clad in larch
  const ux = -side * 0.05, uw = 0.42, ud = 0.36, uz = 0.04;
  B.push(ux, uz);
  const wood = rng() < 0.7;
  body(B, rng, S, uw, ud, 1, fh, { y0: fh, nbF: 2, noDoor: true, cell: (s, f, k) => (wood && (s === 3 || (s === 0 && k === 0)) ? 'wood_wall' : null) });
  flatRoof(B, -uw / 2, -ud / 2, uw / 2, ud / 2, 2 * fh, { parapet: 0.02, pcol: '#4a4f55', col: '#b9b7b0' });
  if (rng() < 0.6) solarPanels(B, -uw / 2 + 0.04, -ud / 2 + 0.04, uw / 2 - 0.04, ud / 2 - 0.06, 2 * fh);
  B.pop();
  B.box('solid', doorX - hx - 0.08, fh * 0.86, d / 2, doorX - hx + 0.08, fh * 0.86 + 0.012, d / 2 + 0.08, C('#4a4f55'));
  B.pop();
  carport(B, drive[0] + 0.01, drive[1] - 0.01, -0.3, 0.12, 0.2, false);
  parkedCar(B, (drive[0] + drive[1]) / 2, -0.07, -Math.PI / 2, rng);
  finish(meta, [doorX, fz + 0.03], 2 * fh + 0.02, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh, fh], roofH: 0, mat: 'conc' });
}

// farmhouse: quarry stone below, timber framing above, and a tractor in the yard
function bauern(B, rng, meta) {
  const S = houseStyle(rng, 'bauern');
  const w = randRange(rng, 0.66, 0.72), d = randRange(rng, 0.4, 0.44), fh = 0.25, fz = 0.3, hx = 0;
  const nbF = 3, doorK = 1, doorX = hx;
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2, farm: true });
  B.push(hx, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, 2, fh, { nbF, doorK });
  const pitch = randRange(rng, 0.85, 0.98);
  const { h } = mainRoof(B, rng, S, rng() < 0.6 ? 'halfhip' : 'gable', 'x', W, D, yw, pitch);
  if (rng() < 0.6) dormers(B, rng, S, W, D, yw, h, 'gable', 1);
  chimney(B, W * 0.22, -D * 0.12, yw + h * 0.35, yw + h + 0.07, '#8d8a84');
  B.pop();
  if (rng() < 0.7) MD.tractor(B, pick(rng, [-0.36, 0.36]), 0.36, rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, C(pick(rng, ['#c8231b', '#2f7d32', '#c8231b'])));
  finish(meta, [doorX, fz + 0.03], yw + h, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh, fh], roofH: h, mat: 'brick' });
}

const L1 = { trauf, giebel, winkel, villa, siedlung, doppel, modern, bauern };
export function resL1(B, rng, meta) {
  const t = wpick(rng, [['trauf', 22], ['giebel', 17], ['winkel', 12], ['villa', 9], ['siedlung', 12], ['doppel', 11], ['modern', 7], ['bauern', 6]]);
  L1[t](B, rng, meta);
}

// ============================================================ town houses L2
// one narrow town house of the old-town row (local frame: front at z = d/2)
function narrowHouse(B, rng, S, w, d, floors, fh, opts = {}) {
  const nbF = 2;
  const doorK = opts.doorK ?? 0;
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK, shop: opts.shop, blank: opts.blank, bands: S.kind === 'plaster' });
  const gableFront = opts.gableFront;
  const pitch = gableFront ? randRange(rng, 0.98, 1.1) : randRange(rng, 0.85, 0.98);
  const rk = gableFront ? (rng() < 0.75 ? 'gable' : 'halfhip') : 'gable';
  if (!gableFront && S.kind === 'plaster') cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.02, 0.022, 0.016, S.trim);
  const { h } = mainRoof(B, rng, S, rk, gableFront ? 'z' : 'x', W, D, yw, pitch);
  if (!gableFront) dormers(B, rng, S, W, D, yw, h, rng() < 0.4 ? 'shed' : 'gable', 1);
  else if (S.kind === 'plaster' && rng() < 0.35) erker(B, rng, S, 0, D / 2, fh * (floors - 2) + 0.03, fh * (floors - 1) - 0.02, 0.16, 0.055);
  if (rng() < 0.6) chimney(B, W * 0.18, -D * 0.2, yw + h * 0.3, yw + h + 0.05);
  return yw + h;
}
function rowPair(B, rng, meta) {
  const fz = 0.44, mixed = rng() < 0.3;
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, fz - 0.01, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  hedge(B, -0.48, -0.48, 0.48, -0.44);
  meta.trees.push([randRange(rng, -0.3, 0.3), -0.38, pick(rng, ['round', 'tall', 'fruit']), randRange(rng, 0.8, 1.05)]);
  let top = 0, doorX = 0, shell = null;
  const shopSide = mixed ? (rng() < 0.5 ? 0 : 1) : -1;
  for (let i = 0; i < 2; i++) {
    const kind = wpick(rng, [['plaster', 6], ['fach', 3], ['slate', 0.8], ['bfw', 0.6], ['brick', 0.6]]);
    const S = houseStyle(rng, kind, { wins: [['win_s', 2], ['win_r', 1.5], ['win_g', 1.5], ['win_p', 1.5], ['win_a', 1.2], ['win_o', 1], ['win_b', 1]] });
    const w = randRange(rng, 0.43, 0.46), d = randRange(rng, 0.5, 0.58), floors = randInt(rng, 3, 4), fh = randRange(rng, 0.24, 0.27);
    const cx = (i === 0 ? -1 : 1) * 0.235;
    const shop = i === shopSide ? pick(rng, SHOP_TYPES) : null;
    B.push(cx, fz - d / 2);
    plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.04);
    aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
    const doorK = i === 0 ? 1 : 0;
    const t = narrowHouse(B, rng, S, w, d, floors, fh, { doorK, shop, gableFront: rng() < 0.62, blank: [i === 0 ? 1 : 3] });
    if (shop) {
      sign(B, rng, shop.sign, (doorK === 0 ? w / 4 : -w / 4), fh - 0.06, d / 2, 0.18);
      awning(B, doorK === 0 ? 0.005 : -w / 2 + 0.02, doorK === 0 ? w / 2 - 0.02 : -0.005, fh - 0.066, d / 2, 0.11, 0.05, pick(rng, AWNING_COLS));
      meta.shop = shop;
    } else if (rng() < 0.5) canopy(B, S.roof, (doorK - 0.5) * w / 2, d / 2, fh * 0.8, 0.13, 0.06);
    B.pop();
    if (t > top) top = t;
    if (i === 0) { doorX = cx + (doorK - 0.5) * w / 2; shell = { x0: -0.47, z0: fz - d, x1: 0.47, z1: fz, fhs: Array(floors).fill(fh), roofH: 0.3, mat: 'brick' }; }
  }
  for (let i = 0; i < 3; i++) MD.bin(B, 0.38 - i * 0.045, -0.15, C(BIN_COLS[i]));
  if (rng() < 0.5) bikes(B, rng, 0.0, fz + 0.03, 2);
  finish(meta, [doorX, fz + 0.03], top, shell);
}
// wide Bürgerhaus with a central Zwerchhaus or a mansard roof
function buerger(B, rng, meta) {
  const S = houseStyle(rng, rng() < 0.85 ? 'plaster' : 'brick', { wins: [['win_o', 2], ['win_a', 2], ['win_b', 1.5], ['win_g', 1], ['win_r', 1], ['win_s', 1]] });
  const w = randRange(rng, 0.84, 0.9), d = randRange(rng, 0.54, 0.6), fz = 0.42, floors = randInt(rng, 3, 4), fh = 0.26;
  const mixed = rng() < 0.3, shop = mixed ? pick(rng, SHOP_TYPES) : null;
  B.rect('grass', -0.5, -0.5, 0.5, fz - d, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, fz - 0.01, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  hedge(B, -0.48, -0.48, 0.48, -0.44);
  meta.trees.push([randRange(rng, -0.3, 0.3), -0.36, pick(rng, ['round', 'tall']), randRange(rng, 0.8, 1.1)]);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.05);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nbF = 4, doorK = mixed ? 3 : rng() < 0.5 ? 1 : 2;
  const fhs = Array(floors).fill(fh); if (mixed) fhs[0] = 0.3;
  const { W, D, yw } = body(B, rng, S, w, d, floors, fhs, { nbF, doorK, shop, bands: true });
  cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.024, 0.028, 0.02, S.trim);
  if (shop) {
    sign(B, rng, shop.sign, -w / 2 + (w / nbF) * 1.5, fhs[0] - 0.062, d / 2, 0.26);
    awning(B, -w / 2 + 0.02, -w / 2 + (w / nbF) * 3 - 0.01, fhs[0] - 0.068, d / 2, 0.12, 0.05, pick(rng, AWNING_COLS));
    meta.shop = shop;
  }
  const rk = wpick(rng, [['gable', 3], ['mansard', 2], ['hip', 1.5], ['halfhip', 1.5]]);
  const pitch = randRange(rng, 0.82, 0.95);
  const r = mainRoof(B, rng, S, rk, 'x', W, D, yw, pitch);
  if (rk === 'mansard') for (let i = 0; i < 3; i++) mansardDormer(B, rng, S, -W / 3 + i * W / 3, r.m, 0.11);
  else if (rk !== 'hip' && rng() < 0.6) zwerchhaus(B, rng, S, 0, 0.3, D, yw, r.h, fh * 0.9, pitch + 0.1);
  else dormers(B, rng, S, W, D, yw, r.h, 'gable', rk === 'hip' ? 2 : 3);
  if (rng() < 0.35 && S.kind === 'plaster') erker(B, rng, S, W / 2 - 0.13, D / 2, fh + 0.03, yw - fh - 0.02, 0.17, 0.06);
  else if (rng() < 0.5) for (let f = 1; f < floors; f++) balconyRow(B, -0.09, 0.09, D / 2, f * fh + 0.01, 0.05, 'iron');
  chimney(B, W * 0.3, -D * 0.18, yw + r.h * 0.3, yw + r.h + 0.06);
  chimney(B, -W * 0.3, -D * 0.18, yw + r.h * 0.3, yw + r.h + 0.06);
  B.pop();
  for (let i = 0; i < 3; i++) MD.bin(B, 0.38 - i * 0.045, fz - d - 0.05, C(BIN_COLS[i]));
  finish(meta, [-w / 2 + (doorK + 0.5) * w / nbF, fz + 0.03], yw + r.h, { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: r.h, mat: 'brick' });
}
export function resL2(B, rng, meta) {
  if (rng() < 0.6) rowPair(B, rng, meta); else buerger(B, rng, meta);
}

// ============================================================ blocks L3
// Gründerzeit block: ornate windows, mansard roof, corner oriel
function gruenderzeit(B, rng, meta) {
  const S = houseStyle(rng, 'plaster', { wins: [['win_o', 3], ['win_a', 2], ['win_b', 1]], pk: ['cream', 'yellow', 'white', 'sand', 'blue', 'pink'] });
  S.roof = rng() < 0.6 ? { bk: 'slate', rc: C('#8c95a2') } : roofStyle(rng);
  const w = 0.9, d = 0.66, fz = 0.42, floors = 5, fh = 0.27;
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, 0.36, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  meta.trees.push([-0.36, -0.38, 'round', 0.9], [0.36, -0.38, pick(rng, ['round', 'tall']), 0.9]);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.06, C('#b5aa98'));
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nbF = 4, doorK = 1 + Math.floor(rng() * 2);
  const ground = rng() < 0.5 ? { win: 'stone_win_beige', side: 'stone_win_beige', wall: 'stone_wall_beige', door: 'stone_door' } : S.g;
  const alt = `win_a_${['white', 'cream', 'sand', 'yellow', 'pink'].includes(S.pk) ? S.pk : 'white'}`;
  const { W, D, yw } = body(B, rng, { ...S, g: ground }, w, d, floors, fh, { nbF, doorK, bands: true, cell: (s, f, k, nb, L) => (f >= 3 && s !== 2 && L.win.startsWith('win_o') ? alt : null) });
  cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.028, 0.034, 0.024, S.trim);
  const r = mainRoof(B, rng, S, rng() < 0.65 ? 'mansard' : 'hip', 'x', W, D, yw, 0.7);
  if (r.m) for (let i = 0; i < 4; i++) mansardDormer(B, rng, S, -W * 3 / 8 + i * W / 4, r.m, 0.1);
  else dormers(B, rng, S, W, D, yw, r.h, 'gable', 3);
  if (rng() < 0.55) erker(B, rng, S, W / 2 - 0.14, D / 2, fh + 0.03, yw - fh * 0.2, 0.18, 0.065);
  for (let f = 1; f < floors - 1; f++) if (rng() < 0.7) balconyRow(B, -w / 2 + w / nbF * doorK + 0.015, -w / 2 + w / nbF * (doorK + 1) - 0.015, d / 2, f * fh + 0.012, 0.06, 'iron');
  chimney(B, -W * 0.3, -0.05, yw + r.h * 0.5, yw + r.h + 0.05);
  chimney(B, W * 0.3, -0.05, yw + r.h * 0.5, yw + r.h + 0.05);
  B.pop();
  finish(meta, [-w / 2 + (doorK + 0.5) * w / nbF, fz + 0.03], yw + r.h, { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs: Array(floors).fill(fh), roofH: r.h, mat: 'brick' });
}
// red or dark clinker block
function klinker(B, rng, meta) {
  const S = houseStyle(rng, 'brick');
  const w = 0.9, d = 0.64, fz = 0.42, floors = randInt(rng, 4, 5), fh = 0.27;
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, 0.36, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  meta.trees.push([-0.36, -0.38, 'round', 0.9], [0.36, -0.38, 'tall', 0.9]);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.06, C('#8d8a84'));
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nbF = 4, doorK = 1;
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK, bands: true });
  cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.024, 0.03, 0.02, S.trim);
  const r = mainRoof(B, rng, S, rng() < 0.5 ? 'hip' : 'gable', 'x', W, D, yw, 0.78);
  dormers(B, rng, S, W, D, yw, r.h, rng() < 0.5 ? 'shed' : 'gable', 2);
  for (let f = 1; f < floors; f++) {
    balconyRow(B, -W / 2 + 0.02, -W / 2 + W / nbF - 0.02, D / 2, f * fh + 0.01, 0.06, 'iron');
    balconyRow(B, W / 2 - W / nbF + 0.02, W / 2 - 0.02, D / 2, f * fh + 0.01, 0.06, 'iron');
  }
  B.pop();
  finish(meta, [-w / 2 + (doorK + 0.5) * w / nbF, fz + 0.03], yw + r.h, { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs: Array(floors).fill(fh), roofH: r.h, mat: 'brick' });
}
export function resL3(B, rng, meta, classic) {
  const t = wpick(rng, [['gz', 4], ['klinker', 2], ['classic', 4]]);
  if (t === 'gz') gruenderzeit(B, rng, meta);
  else if (t === 'klinker') klinker(B, rng, meta);
  else classic(B, rng, meta);
}
