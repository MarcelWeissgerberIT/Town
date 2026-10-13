import { col, shade, pick, randRange, randInt, clamp } from './util.js';
import { SHOP_TYPES, AWNING_COLS } from './config.js';
import * as MD from './models.js';
import {
  fq, uvq, tintOf, setTint, litOf, facade, boxWalls, gableRoof, hipRoof, flatRoof, aoDecal, gableTri, plinth, cornice, chimney, hedge,
  picketFence, parkedCar, balconyRow, solarPanels, sign, awning, rooftopStuff, BIN_COLS, WHITE, resL3 as resL3Old, resL4 as resL4Old,
} from './buildgen.js';

// ---------------------------------------------------------------------------
// Residential catalogue: 40+ variants from timber framing to modern. Every
// variant fixes a style family (facade textures), a building form and a roof;
// plaster colours come from a large palette and are tinted per house, so even
// two houses of the same variant rarely look alike. Lots are 1x1 (towers 2x2)
// with the street at local +z.
// ---------------------------------------------------------------------------

const C = col;

export function wpick(rng, table) {
  let t = 0;
  for (const [, w] of table) t += w;
  let r = rng() * t;
  for (const [it, w] of table) { r -= w; if (r <= 0) return it; }
  return table[0][0];
}

// ------------------------------------------------------------------ colours
const FACADE = {
  warm: ['#efe2c3', '#f0c862', '#e9a39b', '#e58f6c', '#dbbf96', '#e8d9a8', '#d9a066', '#f3d9a4', '#e7b8a0', '#f6e7c8', '#d7b98e', '#e9c46a', '#dfa86a', '#f1d1c4', '#c97b5a'],
  cool: ['#a7cf9f', '#9db8d6', '#b8c9a3', '#c9d6c2', '#a9c3cf', '#d5c6e0', '#9fb6a3', '#c2d1de', '#bcd4c4'],
  light: ['#f2efe8', '#efe8d8', '#e6dccb', '#cfd3cf', '#f6e7c8', '#efe2c3'],
};
function hexToHsl(h) {
  const n = parseInt(h.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh / 6, s, l];
}
function hslToHex(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
}
// a plaster colour with a little individual variation
export function facadeColor(rng, family = null) {
  const fam = family || wpick(rng, [['warm', 6], ['cool', 2.5], ['light', 2.5]]);
  const [h, s, l] = hexToHsl(pick(rng, FACADE[fam]));
  return hslToHex((h + (rng() - 0.5) * 0.025 + 1) % 1, clamp(s * (0.9 + rng() * 0.2), 0, 1), clamp(l + (rng() - 0.5) * 0.06, 0.45, 0.95));
}
const TILE_REDS = ['#c55a33', '#b6482f', '#d06c3c', '#a8412c', '#8d4b33', '#b85a3c'];
export function roofStyle(rng, kind = 'plaster') {
  const w = kind === 'slate' || kind === 'jug' ? [['slate', 6], ['dark', 1]]
    : kind === 'bfw' || kind === 'brick' || kind === 'kl90' || kind === 'hanse' ? [['tile', 3], ['pantile', 3], ['dark', 1.5], ['slate', 0.5]]
      : kind === 'modern' || kind === 'dark' ? [['dark', 3], ['slate', 1]]
        : [['tile', 5], ['pantile', 2.2], ['slate', 1.4], ['dark', 1]];
  const r = wpick(rng, w);
  if (r === 'tile') return { bk: 'roof', rc: C(pick(rng, TILE_REDS)) };
  if (r === 'pantile') return { bk: 'pantile', rc: C(pick(rng, ['#e8956a', '#df8a5e', '#ea9f73', '#d98058'])) };
  if (r === 'slate') return { bk: 'slate', rc: C(pick(rng, ['#9aa2ae', '#8c95a2', '#a3a8b0'])) };
  return { bk: 'roof', rc: C(pick(rng, ['#6a6e75', '#5f646b', '#6e564c'])) };
}
const THATCH = () => ({ bk: 'thatch', rc: C('#f4efe6') });
const SHINGLE = () => ({ bk: 'shingle', rc: C('#cfc9c0') });
const METAL = (rng) => ({ bk: 'metal', rc: C(pick(rng, ['#55595f', '#4a4e54', '#6b6f75'])) });

// ------------------------------------------------------------------ styles
// g: ground floor cells, u: upper floors; tint: plaster colour for tintable cells
const SHUTTERS = ['win_s', 'win_sw', 'win_r', 'win_g'];
const RUBBLE = { win: 'rubble_win', side: 'rubble_win', wall: 'rubble_win', door: 'rubble_door' };
function L(win, side, wall, door, rhythm = false) { return { win, side: side || win, wall: wall || win, door: door || 'door', rhythm }; }
function plasterStyle(rng, o = {}) {
  const ws = o.win || wpick(rng, [['shut', 5], ['win_p', 2], ['win_a', 1.4], ['win_o', 1], ['win_b', 0.9]]);
  const w = ws === 'shut' ? pick(rng, SHUTTERS) : ws;
  const side = rng() < 0.5 && w !== 'win_b' ? w : 'win_p';
  return {
    kind: 'plaster', tint: o.tint || facadeColor(rng, o.fam),
    g: L(w === 'win_b' ? 'win_p' : w, side, 'wall', 'door'), u: L(w, side, 'wall'),
    gable: 'gable', attic: 'win_p', dwall: 'wall', trim: C('#f6f2ea'),
  };
}
export function houseStyle(rng, kind, o = {}) {
  let S;
  const ground = (fam = 'light') => plasterStyle(rng, { win: pick(rng, ['win_p', 'win_s', 'win_r', 'win_g']), fam });
  switch (kind) {
    case 'fach': case 'bauern': {
      const fw = rng() < 0.7 ? 'brown' : 'red';
      const b = ground();
      S = { ...b, kind, g: kind === 'bauern' ? RUBBLE : b.g, u: L(`fw_win_${fw}`, null, `fw_wall_${fw}`, null, true), gable: `fw_gable_${fw}`, dwall: `fw_wall_${fw}`, jetty: kind === 'bauern' ? 0 : 0.018, beam: C(fw === 'brown' ? '#4b2f20' : '#6e2a22') };
      break;
    }
    case 'fwfr': case 'fwsw': {
      const b = ground(kind === 'fwsw' ? 'light' : 'warm');
      const u = L(`${kind}_win`, null, `${kind}_wall`, null, true);
      S = { ...b, kind, g: rng() < 0.4 ? { ...u, door: 'fw_door_brown' } : b.g, u, gable: `${kind}_wall`, dwall: `${kind}_wall`, jetty: 0.02, beam: C(kind === 'fwsw' ? '#1d1b19' : '#5a3020') };
      break;
    }
    case 'bfw':
      S = { kind, tint: '#efe9df', g: L('bfw_win', null, 'bfw_wall', 'br_door_red', true), u: L('bfw_win', null, 'bfw_wall', null, true), gable: 'bfw_wall', attic: 'win_p', dwall: 'bfw_wall', beam: C('#3d2a1e'), trim: C('#efe9df') };
      break;
    case 'slate': {
      const b = ground();
      S = { ...b, kind, g: rng() < 0.35 ? RUBBLE : b.g, u: L('slate_win', null, 'slate_wall'), gable: 'slate_wall', dwall: 'slate_wall' };
      break;
    }
    case 'wood': {
      const b = ground();
      S = { ...b, kind, g: rng() < 0.5 ? RUBBLE : b.g, u: L('wood_win', null, 'wood_wall', null, true), gable: 'wood_wall', dwall: 'wood_wall' };
      break;
    }
    case 'shingle': {
      const b = plasterStyle(rng, { win: 'win_s', fam: 'light' });
      S = { ...b, kind, g: rng() < 0.5 ? RUBBLE : b.g, u: L('shingle_win', null, 'shingle_wall', null, true), gable: 'shingle_wall', dwall: 'shingle_wall' };
      break;
    }
    case 'alp':
      S = { kind, tint: '#f4f1ea', g: L('alp_win', 'alp_win', 'wall', 'door'), u: L('alp_balc', 'wood_win', 'wood_wall'), gable: 'wood_wall', attic: 'wood_win', dwall: 'wood_wall', trim: C('#f4f1ea') };
      break;
    case 'brick': {
      const k = rng() < 0.6 ? 'red' : 'dark';
      const l = L(`br_win_${k}`, null, `br_wall_${k}`, 'br_door_red');
      S = { kind, tint: '#efe9df', g: l, u: l, gable: `br_wall_${k}`, attic: 'win_p', dwall: `br_wall_${k}`, trim: C('#f1ede4') };
      break;
    }
    case 'kl90': {
      const l = L('kl90_win', null, 'kl90_win', 'kl90_door');
      S = { kind, tint: '#f2efe8', g: l, u: l, gable: 'br_wall_red', attic: 'win_p', dwall: 'br_wall_red', trim: C('#f1ede4') };
      break;
    }
    case 'hanse': {
      const l = L('hanse_win', null, 'hanse_wall', 'br_door_red');
      S = { kind, tint: '#f2efe8', g: l, u: l, gable: 'hanse_wall', attic: 'win_p', dwall: 'hanse_wall', trim: C('#e9e4da') };
      break;
    }
    case 'jug':
      S = { kind, tint: o.tint || facadeColor(rng, pick(rng, ['light', 'warm', 'cool'])), g: L('win_p', 'win_p', 'wall', 'door'), u: L('jug_win', 'win_a', 'jug_wall'), gable: 'jug_wall', attic: 'win_a', dwall: 'wall', trim: C('#f6f2ea') };
      break;
    case 'f50':
      S = { kind, tint: o.tint || facadeColor(rng, pick(rng, ['warm', 'cool', 'cool'])), g: L('f50_win', null, 'wall', 'door'), u: L('f50_win', null, 'wall'), gable: 'wall', attic: 'f50_win', dwall: 'wall', trim: C('#d9d6cf') };
      break;
    case 'f70':
      S = { kind, tint: '#d8ccb4', g: L('f70_win', null, 'apt_wall', 'apt_door'), u: L('f70_win', null, 'apt_wall'), gable: 'apt_wall', attic: 'f70_win', dwall: 'apt_wall', trim: C('#4a3426') };
      break;
    case 'bh':
      S = { kind, tint: '#f6f4ef', g: L('bh_win', 'bh_win', 'apt_wall', 'apt_door'), u: L('bh_win', 'bh_win', 'apt_wall'), gable: 'apt_wall', attic: 'bh_win', dwall: 'apt_wall', trim: C('#f6f4ef') };
      break;
    case 'dark':
      S = { kind, tint: '#5e6165', g: L('dk_win', null, 'dk_win', 'apt_door'), u: L('dk_win'), gable: 'dk_win', attic: 'dk_win', dwall: 'dk_win', trim: C('#3a3d42') };
      break;
    case 'eco':
      S = { kind, tint: '#f4f2ec', g: L('eco_win', null, 'wood_wall', 'apt_door'), u: L('eco_win', 'wood_win', 'wood_wall'), gable: 'wood_wall', attic: 'eco_win', dwall: 'wood_wall', trim: C('#4a4f55') };
      break;
    case 'plat':
      S = { kind, tint: '#d9d3c4', g: L('plat_win', null, 'plat_win', 'apt_door'), u: L('plat_win'), gable: 'plat_win', attic: 'plat_win', dwall: 'plat_win', trim: C('#cfcabd') };
      break;
    case 'modern': {
      const t = pick(rng, ['#f4f2ec', '#f4f2ec', '#d9d9d6', '#e6dccb']);
      S = { kind, tint: t, g: L('modern_win', null, 'apt_wall', 'apt_door'), u: L('modern_win', null, 'apt_wall'), gable: 'apt_wall', attic: 'modern_win', dwall: 'apt_wall', trim: C('#4a4f55') };
      break;
    }
    default: S = plasterStyle(rng, o);
  }
  if (o.tint) S.tint = o.tint;
  S.roof = o.roof || roofStyle(rng, kind);
  return S;
}
const use = (S) => setTint(S.tint || null);

// ------------------------------------------------------------------ walls
// one storey after the other; half-timbered upper floors jut out a little
export function body(B, rng, S, w, d, floors, fh, o = {}) {
  use(S);
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
    const Lv = f === 0 ? S.g : S.u;
    const h = Array.isArray(fh) ? fh[f] : fh;
    boxWalls(B, rng, -W / 2, -D / 2, W / 2, D / 2, y, [h], (s, ff, k, nb) => {
      if (blank.includes(s)) return Lv.wall;
      if (f === 0 && s === 0 && k === doorK && !o.noDoor) return o.shop ? 'shopdoor' : Lv.door;
      if (f === 0 && s === 0 && o.shop) return `shop_${o.shop.k}`;
      if (o.cell) { const c = o.cell(s, f, k, nb, Lv); if (c) return c; }
      if (s === 0) return Lv.win;
      if (Lv.rhythm && k % 2 === 1) return Lv.wall;
      if ((s === 1 || s === 3) && nb >= 3 && k === 1 && !Lv.rhythm) return Lv.wall;
      return Lv.side;
    }, W / nbF);
    y += h;
  }
  return { W, D, yw: y, nbF, bay: w / nbF };
}

function ftri(B, rng, cell, p0, p1, p2) {
  const u = uvq(cell);
  B.tri('facade', p0, p1, p2, tintOf(cell), [u[0], u[1], u[2], u[5], u[0], u[5]], litOf(cell, rng));
}
// gable triangle, optionally cut flat at ycut (half-hip)
function gableWall(B, rng, cell, ax, az, bx, bz, y0, h, ycut = null) {
  if (ycut === null || ycut >= y0 + h - 1e-4) { gableTri(B, rng, ax, az, bx, bz, y0, h, cell); return; }
  const q = uvq(cell), u0 = q[0], u1 = q[2], v0 = q[1], v1 = q[5];
  const t = (ycut - y0) / h, mx = (ax + bx) / 2, mz = (az + bz) / 2, um = (u0 + u1) / 2, vt = v0 + (v1 - v0) * t;
  const pL = [ax + (mx - ax) * t, ycut, az + (mz - az) * t], pR = [bx + (mx - bx) * t, ycut, bz + (mz - bz) * t];
  B.quad('facade', [ax, y0, az], [bx, y0, bz], pR, pL, tintOf(cell), [u0, v0, u1, v0, u1 + (um - u1) * t, vt, u0 + (um - u0) * t, vt], litOf(cell, rng));
}

// ------------------------------------------------------------------ roofs
export function halfHipRoof(B, w, d, y0, h, rs, k = 0.62, o = {}) {
  const ov = o.over ?? 0.045, og = o.gover ?? 0.03, t = 0.022, Sx = 0.36;
  const ex = w / 2 + og, ez = d / 2 + ov, yr = y0 + h, ye = y0 - ov * h / (d / 2);
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
  const Sx = 0.36, Lm = Math.hypot(ins + o, h1 + 0.012) / Sx;
  const c = lo.rc, bk = lo.bk;
  B.quad(bk, [-ex0, ye, ez0], [ex0, ye, ez0], [ex1, y1, ez1], [-ex1, y1, ez1], c, [-ex0 / Sx, 0, ex0 / Sx, 0, ex1 / Sx, Lm, -ex1 / Sx, Lm]);
  B.quad(bk, [ex0, ye, -ez0], [-ex0, ye, -ez0], [-ex1, y1, -ez1], [ex1, y1, -ez1], c, [-ex0 / Sx, 0, ex0 / Sx, 0, ex1 / Sx, Lm, -ex1 / Sx, Lm]);
  B.quad(bk, [ex0, ye, ez0], [ex0, ye, -ez0], [ex1, y1, -ez1], [ex1, y1, ez1], c, [-ez0 / Sx, 0, ez0 / Sx, 0, ez1 / Sx, Lm, -ez1 / Sx, Lm]);
  B.quad(bk, [-ex0, ye, -ez0], [-ex0, ye, ez0], [-ex1, y1, ez1], [-ex1, y1, -ez1], c, [-ez0 / Sx, 0, ez0 / Sx, 0, ez1 / Sx, Lm, -ez1 / Sx, Lm]);
  B.box('solid', -ex0, ye - 0.02, -ez0, ex0, ye, ez0, S.trim || WHITE, { noTop: true });
  B.box('solid', -ex1 - 0.006, y1 - 0.006, -ez1 - 0.006, ex1 + 0.006, y1 + 0.004, ez1 + 0.006, C('#6d7178'));
  hipRoof(B, 2 * ex1, 2 * ez1, y1 + 0.004, h2, rs.rc, { over: 0.012, bucket: rs.bk });
  return { ye, y1, ez0, ez1, ex0, ex1 };
}
export function mansardDormerAt(B, rng, S, x, m, dw) { mansardDormer(B, rng, S, x, m, dw); }
function mansardDormer(B, rng, S, x, m, dw) {
  if (S.tint !== undefined) use(S);
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

// roof over a box W x D (ridge along x, or along z when along === 'z'); returns { h, m? }
export function mainRoof(B, rng, S, kind, along, W, D, yw, pitch, o = {}) {
  use(S);
  if (along === 'z') {
    B.push(0, 0, Math.PI / 2);
    const r = mainRoof(B, rng, S, kind, 'x', D, W, yw, pitch, o);
    B.pop();
    return r;
  }
  const rs = S.roof;
  if (kind === 'flat') {
    const dark = S.kind === 'modern' || S.kind === 'dark' || S.kind === 'eco';
    if (o.green) B.rect('greenroof', -W / 2 + 0.02, -D / 2 + 0.02, W / 2 - 0.02, D / 2 - 0.02, yw + 0.004, C('#ffffff'), 0.4);
    flatRoof(B, -W / 2, -D / 2, W / 2, D / 2, o.green ? yw - 0.002 : yw, { parapet: 0.028, pcol: o.pcol || (dark ? '#4a4f55' : '#d9d6cf'), col: o.green ? '#8f8d86' : '#b9b7b0' });
    return { h: 0.03 };
  }
  if (kind === 'hip') {
    const h = Math.min(W, D) / 2 * Math.tan(pitch * 0.85);
    hipRoof(B, W, D, yw, h, rs.rc, { bucket: rs.bk, over: o.over });
    return { h };
  }
  if (kind === 'mansard') {
    const m = mansardRoof(B, S, W, D, yw, 0.2, 0.09, 0.07);
    return { h: 0.29, m };
  }
  const h = (D / 2) * Math.tan(pitch);
  if (kind === 'halfhip') {
    const yk = halfHipRoof(B, W, D, yw, h, rs, o.k ?? randRange(rng, 0.55, 0.7), o);
    gableWall(B, rng, S.gable, W / 2, D / 2, W / 2, -D / 2, yw, h, yk);
    gableWall(B, rng, S.gable, -W / 2, -D / 2, -W / 2, D / 2, yw, h, yk);
    return { h };
  }
  gableRoof(B, W, D, yw, h, rs.rc, { bucket: rs.bk, over: o.over, gover: o.gover, t: o.t });
  gableWall(B, rng, S.gable, W / 2, D / 2, W / 2, -D / 2, yw, h);
  gableWall(B, rng, S.gable, -W / 2, -D / 2, -W / 2, D / 2, yw, h);
  return { h };
}

// Treppengiebel: stepped brick gables on the street front and back (ridge along z)
function steppedGable(B, rng, S, W, D, yw, h, n = 5) {
  use(S);
  const top = h + 0.07, hs = top / n, bc = C('#6a2f24');
  for (const zf of [D / 2, -D / 2]) {
    const sgn = zf > 0 ? 1 : -1, zo = zf + sgn * 0.012;
    for (let i = 0; i < n; i++) {
      const wi = W * (1 - i / n) + 0.01, y0 = yw + i * hs, y1 = y0 + hs;
      if (sgn > 0) fq(B, S.gable, [-wi / 2, y0, zo], [wi / 2, y0, zo], [wi / 2, y1, zo], [-wi / 2, y1, zo], rng);
      else fq(B, S.gable, [wi / 2, y0, zo], [-wi / 2, y0, zo], [-wi / 2, y1, zo], [wi / 2, y1, zo], rng);
      B.box('solid', -wi / 2, y0, Math.min(zf, zo), wi / 2, y1, Math.max(zf, zo), bc, { noTop: true });
      B.box('solid', -wi / 2 - 0.006, y1 - 0.008, Math.min(zf, zo) - 0.004, wi / 2 + 0.006, y1 + 0.004, Math.max(zf, zo) + 0.004, C('#d9d2c6'));
    }
  }
}

// ------------------------------------------------------------ additions
function gableDormer(B, rng, S, x, D, yw, h, dw = 0.13, pos = 0.62) {
  use(S);
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
  use(S);
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
  const yf = y1 - sl * o + 0.004, yz = ym(zm) + 0.006, Lr = Math.hypot(zf + o - zm, yz - yf) / Sx;
  B.quad(rs.bk, [x - ex, yf, zf + o], [x + ex, yf, zf + o], [x + ex, yz, zm], [x - ex, yz, zm], rs.rc, [-ex / Sx, 0, ex / Sx, 0, ex / Sx, Lr, -ex / Sx, Lr]);
  B.box('solid', x - ex, yf - 0.012, zf + o - 0.004, x + ex, yf, zf + o, shade(rs.rc, 0.55));
}
function dormers(B, rng, S, W, D, yw, h, type, n = null) {
  if (h < 0.16 || type === 'none') return;
  if (type === 'shed') { shedDormer(B, rng, S, randRange(rng, -0.04, 0.04), Math.min(W * 0.55, 0.36), D, yw, h); return; }
  n = n ?? (W > 0.56 && rng() < 0.55 ? 2 : 1);
  const xs = n === 1 ? [0] : n === 2 ? [-W / 4, W / 4] : [-W / 3, 0, W / 3];
  for (const x of xs) gableDormer(B, rng, S, x, D, yw, h);
}
// Zwerchhaus: the front wall rises through the eaves under its own gable
function zwerchhaus(B, rng, S, cx, zw, D, yw, h, fh2, pitch) {
  use(S);
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
// oriel window on the upper floors
function erker(B, rng, S, cx, zf, y0, y1, w, dp) {
  use(S);
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
export function cone(B, rs, cx, cz, y0, r, h, n = 8) {
  const Sx = 0.36;
  const P = (i) => { const a = i / n * Math.PI * 2 + Math.PI / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; };
  const side = 2 * r * Math.sin(Math.PI / n), slant = Math.hypot(r * Math.cos(Math.PI / n), h);
  for (let i = 0; i < n; i++) {
    const a = P(i + 1), b = P(i);
    B.tri(rs.bk, [a[0], y0, a[1]], [b[0], y0, b[1]], [cx, y0 + h, cz], rs.rc, [-side / 2 / Sx, 0, side / 2 / Sx, 0, 0, slant / Sx]);
  }
}
// octagonal corner tower with a pointed roof
export function tower(B, rng, S, cx, cz, r, levels, fh, roofH, rs) {
  use(S);
  const n = 8;
  const P = (i) => { const a = i / n * Math.PI * 2 + Math.PI / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; };
  let y = 0;
  for (let f = 0; f < levels; f++) {
    const Lv = f === 0 ? S.g : S.u;
    for (let i = 0; i < n; i++) {
      const a = P(i + 1), b = P(i);
      fq(B, i % 2 ? Lv.wall : Lv.win, [a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + fh, b[1]], [a[0], y + fh, a[1]], rng);
    }
    y += fh;
  }
  B.cyl('solid', cx, y - 0.012, cz, r * 1.08 + 0.008, 0.016, n, S.trim || WHITE);
  cone(B, rs, cx, cz, y + 0.004, r * 1.08 + 0.02, roofH, n);
  B.cyl('solid', cx, y + roofH - 0.01, cz, 0.004, 0.05, 4, C('#3a3a3a'));
  return y + roofH;
}
export function canopy(B, rs, x, zf, y, w = 0.17, dp = 0.075) {
  const Sx = 0.36;
  B.quad(rs.bk, [x - w / 2, y, zf + dp], [x + w / 2, y, zf + dp], [x + w / 2, y + 0.04, zf], [x - w / 2, y + 0.04, zf], rs.rc, [0, 0, w / Sx, 0, w / Sx, dp / Sx, 0, dp / Sx]);
  const fc = shade(rs.rc, 0.55);
  B.box('solid', x - w / 2, y - 0.008, zf + dp - 0.006, x + w / 2, y, zf + dp, fc);
  for (const s of [-1, 1]) B.box('solid', x + s * (w / 2 - 0.012) - 0.004, y - 0.045, zf, x + s * (w / 2 - 0.012) + 0.004, y, zf + dp * 0.8, C('#3b2b20'));
}
export function steps(B, x, zf, w = 0.1) {
  B.box('solid', x - w / 2, 0, zf, x + w / 2, 0.022, zf + 0.035, C('#c9c2b6'));
  B.box('solid', x - w / 2 - 0.01, 0, zf + 0.035, x + w / 2 + 0.01, 0.011, zf + 0.06, C('#c9c2b6'));
}
function garage(B, rng, S, x0, x1, z0, z1, h = 0.2) {
  use(S);
  const cell = S.kind === 'modern' || S.kind === 'dark' || S.kind === 'kl90' ? 'garage_grey' : rng() < 0.6 ? 'garage_wood' : 'garage_grey';
  const wall = S.g.wall === 'rubble_win' ? 'wall' : S.g.wall.endsWith('_win') ? 'apt_wall' : S.g.wall;
  boxWalls(B, rng, x0, z0, x1, z1, 0, [h], (s) => (s === 0 ? cell : wall), x1 - x0);
  flatRoof(B, x0, z0, x1, z1, h, { parapet: 0.016, pcol: S.kind === 'modern' || S.kind === 'dark' ? '#4a4f55' : '#d9d6cf' });
  aoDecal(B, x0, z0, x1, z1, 0.05);
}
function carport(B, x0, x1, z0, z1, h = 0.19, wood = true) {
  const pc = C(wood ? '#7a5434' : '#3f444a');
  for (const x of [x0 + 0.012, x1 - 0.012]) for (const z of [z0 + 0.012, z1 - 0.012]) B.box('solid', x - 0.008, 0, z - 0.008, x + 0.008, h, z + 0.008, pc);
  B.box('solid', x0 - 0.01, h, z0 - 0.01, x1 + 0.01, h + 0.022, z1 + 0.01, pc);
  B.box('solid', x0, h + 0.022, z0, x1, h + 0.026, z1, C('#9aa3a0'));
}
export function railing(B, x0, z0, x1, z1, y, c = C('#3a3d42')) {
  const h = 0.045;
  for (const [ax, az, bx, bz] of [[x0, z1, x1, z1], [x1, z0, x1, z1], [x0, z0, x0, z1]]) {
    B.box('solid', Math.min(ax, bx) - 0.003, y + h, Math.min(az, bz) - 0.003, Math.max(ax, bx) + 0.003, y + h + 0.005, Math.max(az, bz) + 0.003, c);
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.05));
    for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; B.box('solid', x - 0.002, y, z - 0.002, x + 0.002, y + h, z + 0.002, c); }
  }
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
  setTint(null);
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
export function bikes(B, rng, x, z, n = 2, a = 0) {
  for (let i = 0; i < n; i++) MD.bicycle(B, x + i * 0.035 * Math.sin(a + Math.PI / 2), z + i * 0.035 * Math.cos(a + Math.PI / 2), a, C(pick(rng, BIKE_COLS)));
}
const EXTRAS = ['trampoline', 'pool', 'shed', 'greenhouse', 'sandbox', 'laundry', 'veggies', 'swing', 'table', 'woodpile', 'bikes', 'flowers'];
function extra(B, rng, kind, x, z, S) {
  switch (kind) {
    case 'trampoline': trampoline(B, x, z, rng); break;
    case 'pool': pool(B, x, z); break;
    case 'shed': shed(B, rng, x, z, S.roof.bk === 'roof' || S.roof.bk === 'pantile' ? S.roof : { bk: 'roof', rc: C('#5c6067') }); break;
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
function clampX(x) { return Math.max(-0.44, Math.min(0.44, x)); }

// lawn, paths, boundaries and garden life around a house
// o: { fz, z0, x0, x1, doorX, doors, drive: [x0, x1], driveZ, modern, farm }
function yard(B, rng, meta, S, o) {
  const lawn = o.farm ? ['#eef0d8', '#e8ecd2'] : ['#f2f6e6', '#e6eed6', '#f6f2dc', '#eaf2dc'];
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C(pick(rng, lawn)), 3);
  const pathCol = C(pick(rng, ['#ece4d6', '#e2d8c8', '#d8d2c8', '#efe9df']));
  const doors = o.doors || [o.doorX];
  for (const dx of doors) B.rect(o.modern ? 'flat' : 'cobble', dx - 0.036, o.fz, dx + 0.036, 0.5, 0.007, pathCol, o.modern ? 0.5 : 1.1);
  if (o.drive) B.rect(o.modern ? 'flat' : 'cobble', o.drive[0], o.driveZ ?? 0.0, o.drive[1], 0.5, 0.0072, C(o.modern ? '#cfcac0' : '#ddd5c8'), o.modern ? 0.5 : 1.1);
  if (rng() < 0.55) hedge(B, -0.48, -0.48, 0.48, -0.43);
  else {
    const wc = C(pick(rng, ['#9a6a42', '#7a5434', '#a88b6a']));
    for (let x = -0.47; x <= 0.47; x += 0.06) B.box('solid', x - 0.006, 0, -0.475, x + 0.006, 0.07, -0.465, wc);
    B.box('solid', -0.47, 0.03, -0.473, 0.47, 0.06, -0.467, wc);
  }
  for (const s of [-1, 1]) {
    const x = s * 0.455;
    if (o.drive && x > o.drive[0] - 0.03 && x < o.drive[1] + 0.03) continue;
    if (rng() < 0.6) hedge(B, x - 0.02, -0.43, x + 0.02, 0.38, 0.06);
  }
  const gaps = doors.map((dx) => [dx - 0.055, dx + 0.055]);
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
      const wc = C('#a0754a');
      for (let xx = a; xx < b - 0.01; xx += 0.07) {
        B.box('solid', xx - 0.005, 0, 0.46, xx + 0.005, 0.07, 0.47, wc);
        const e = Math.min(b, xx + 0.07);
        B.quad('solid', [xx, 0.012, 0.466], [e, 0.06, 0.466], [e, 0.066, 0.466], [xx, 0.018, 0.466], wc);
        B.quad('solid', [xx, 0.06, 0.464], [e, 0.012, 0.464], [e, 0.018, 0.464], [xx, 0.066, 0.464], wc);
      }
    }
  }
  const bx = o.drive ? (o.drive[0] + o.drive[1]) / 2 + (o.drive[0] > 0 ? -0.15 : 0.15) : (doors[0] > 0 ? -0.36 : 0.36);
  const nb = randInt(rng, 2, 3);
  for (let i = 0; i < nb; i++) MD.bin(B, clampX(bx + (i - 1) * 0.046), 0.41, C(BIN_COLS[(i + Math.floor(rng() * 5)) % 5]));
  for (const dx of doors) {
    B.box('solid', dx + 0.06, 0, 0.452, dx + 0.066, 0.06, 0.458, C('#3a3d42'));
    B.box('solid', dx + 0.052, 0.06, 0.446, dx + 0.074, 0.08, 0.462, C(pick(rng, ['#e8b21e', '#2f3236', '#b03a2e', '#2f6db5'])));
  }
  for (let i = 0; i < 6; i++) {
    const fx = o.x0 + 0.04 + rng() * (o.x1 - o.x0 - 0.08);
    if (doors.some((dx) => Math.abs(fx - dx) < 0.06)) continue;
    B.sphere('solid', fx, 0.018, o.fz + 0.03, 0.022, 0.02, 0.018, C(pick(rng, ['#e23b4b', '#ff6f91', '#ffcf3f', '#b54ad8', '#ffffff', '#4f8f3a'])), 6, 3);
  }
  if (rng() < 0.35 && !o.modern) bikes(B, rng, doors[0] + (doors[0] > 0 ? -0.12 : 0.1), o.fz + 0.07, randInt(rng, 1, 2));
  const room = o.z0 + 0.47;
  const ts = rng() < 0.5 ? -1 : 1;
  const slots = (room > 0.3 ? [[-0.27, -0.33], [0.0, -0.36], [0.27, -0.33]] : [[-0.3, -0.4], [0.3, -0.4]]).filter((sl) => Math.sign(sl[0]) !== ts);
  const n = room > 0.3 ? randInt(rng, 1, 2) : 1;
  const used = new Set();
  const pool2 = o.modern ? ['pool', 'pool', 'table', 'trampoline', 'flowers'] : o.farm ? ['veggies', 'woodpile', 'laundry', 'shed', 'veggies'] : EXTRAS;
  for (let i = 0; i < n; i++) {
    const s = slots[Math.floor(rng() * slots.length)];
    if (!s || used.has(s.join())) continue;
    used.add(s.join());
    let k = pick(rng, pool2);
    if ((k === 'pool' || k === 'laundry') && s[0] !== 0 && room > 0.3) k = 'sandbox';
    extra(B, rng, k, s[0], s[1], S);
  }
  meta.trees.push([ts * 0.37, -0.37, pick(rng, ['round', 'round', 'fruit', 'conifer', 'tall']), randRange(rng, 0.75, 1.05)]);
  if (rng() < 0.5) meta.trees.push([o.x0 - 0.03, o.fz + 0.05, 'bush', randRange(rng, 0.7, 1)]);
  if (rng() < 0.5 && !o.drive) meta.trees.push([o.x1 + 0.03, o.fz + 0.05, 'bush', randRange(rng, 0.7, 1)]);
}
export function townYard(B, rng, meta, fz, d) {
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, fz - 0.01, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  hedge(B, -0.48, -0.48, 0.48, -0.44);
  meta.trees.push([randRange(rng, -0.3, 0.3), -0.38, pick(rng, ['round', 'tall', 'fruit']), randRange(rng, 0.8, 1.05)]);
  for (let i = 0; i < 3; i++) MD.bin(B, 0.38 - i * 0.045, fz - d - 0.05, C(BIN_COLS[i]));
}

function finish(meta, door, height, shell) { meta.door = door; meta.height = height; meta.shell = shell; }

// ============================================================ L1 forms
// Traufhaus: eaves to the street, dormers or a Zwerchhaus. o.rk: roof kind
function trauf(B, rng, meta, o = {}) {
  const S = houseStyle(rng, o.kind || wpick(rng, [['plaster', 6], ['fach', 3], ['slate', 1], ['brick', 1]]), { win: o.win });
  if (o.rs) S.roof = o.rs(rng);
  const w = o.w ?? randRange(rng, 0.56, 0.66), d = o.d ?? randRange(rng, 0.44, 0.5);
  const floors = o.floors ?? (rng() < 0.3 ? 1 : 2), fh = 0.25;
  const fz = 0.31, hx = randRange(rng, -0.05, 0.05);
  const nbF = Math.max(2, Math.round(w / 0.2)), doorK = rng() < 0.6 ? Math.floor(nbF / 2) : 0;
  const doorX = hx - w / 2 + (doorK + 0.5) * w / nbF;
  const j = (S.jetty || 0) * (floors - 1);
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2 - j, x1: hx + w / 2 + j, farm: o.farm });
  B.push(hx, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK });
  const pitch = o.pitch ?? randRange(rng, 0.78, 0.98);
  const rk = o.rk || wpick(rng, [['gable', 5], ['halfhip', 3], ['hip', 1]]);
  const { h } = mainRoof(B, rng, S, rk, 'x', W, D, yw, pitch, { over: o.over, gover: o.gover, k: o.k });
  const add = o.zwerch === true ? 0 : o.zwerch === false ? 0.5 : rng();
  if (add < 0.38 && rk !== 'hip' && o.dormer !== 'none') zwerchhaus(B, rng, S, pick(rng, [0, 0, -(W / 2 - 0.17), W / 2 - 0.17]), 0.27, D, yw, h, fh * 0.85, pitch + 0.12);
  else if (add < 0.8 || o.dormer) dormers(B, rng, S, W, D, yw, h, o.dormer || (rng() < 0.45 ? 'shed' : 'gable'));
  if (o.balcony) balconyRow(B, -W / 2 + 0.02, W / 2 - 0.02, D / 2, fh * (floors - 1) + 0.006, 0.07, 'iron');
  if (rng() < 0.7) chimney(B, (rng() < 0.5 ? -1 : 1) * W * 0.24, -D * 0.14, yw + h * 0.35, yw + h + 0.07, rng() < 0.5 ? '#9b4a35' : '#8d8a84');
  if (rng() < 0.55) canopy(B, S.roof.bk === 'thatch' || S.roof.bk === 'shingle' ? { bk: 'roof', rc: C('#7a5434') } : S.roof, doorX - hx, d / 2, fh * 0.8);
  steps(B, doorX - hx, d / 2);
  B.pop();
  if (o.tractor && rng() < 0.7) MD.tractor(B, pick(rng, [-0.36, 0.36]), 0.36, rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, C(pick(rng, ['#c8231b', '#2f7d32'])));
  finish(meta, [doorX, fz + 0.03], yw + h, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: Array(floors).fill(fh), roofH: h, mat: 'brick' });
}

// Giebelhaus: narrow and deep, gable to the street; o.barn: modern barn house without eaves
function giebel(B, rng, meta, o = {}) {
  const S = houseStyle(rng, o.kind || wpick(rng, [['plaster', 5], ['fach', 4], ['slate', 1.2], ['bfw', 1]]));
  if (o.rs) S.roof = o.rs(rng);
  const w = randRange(rng, 0.44, 0.52), d = randRange(rng, 0.56, 0.62);
  const floors = o.floors ?? 2, fh = 0.25, fz = 0.34, hx = randRange(rng, -0.12, 0.12);
  const nbF = 2, doorK = rng() < 0.5 ? 0 : 1;
  const doorX = hx - w / 2 + (doorK + 0.5) * w / nbF;
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2, modern: o.barn });
  B.push(hx, fz - d / 2);
  if (!o.barn) plinth(B, -w / 2, -d / 2, w / 2, d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK });
  const pitch = o.pitch ?? randRange(rng, 0.92, 1.06);
  const rk = o.rk || wpick(rng, [['gable', 4], ['halfhip', 2]]);
  const { h } = mainRoof(B, rng, S, rk, 'z', W, D, yw, pitch, o.barn ? { over: 0.008, gover: 0.008, t: 0.012 } : {});
  if (!o.barn && rng() < 0.45) {
    B.push(0, 0, Math.PI / 2);
    dormers(B, rng, S, D, W, yw, h, rng() < 0.5 ? 'shed' : 'gable', 1);
    B.pop();
  }
  if (S.kind === 'plaster' && rng() < 0.3) erker(B, rng, S, 0, D / 2, fh + 0.03, 2 * fh - 0.02, 0.17, 0.06);
  else if (!o.barn && rng() < 0.25) balconyRow(B, -0.1, 0.1, D / 2, fh * 2 + 0.01, 0.06, 'iron');
  if (!o.barn && rng() < 0.7) chimney(B, W * 0.2, -D * 0.2, yw + h * 0.3, yw + h + 0.06);
  if (!o.barn && rng() < 0.5) canopy(B, S.roof, doorX - hx, d / 2, fh * 0.8, 0.15);
  if (o.barn) B.box('solid', doorX - hx - 0.07, fh * 0.86, d / 2, doorX - hx + 0.07, fh * 0.86 + 0.012, d / 2 + 0.07, C('#3a3d42'));
  steps(B, doorX - hx, d / 2, 0.09);
  B.pop();
  finish(meta, [doorX, fz + 0.03], yw + h, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: Array(floors).fill(fh), roofH: h, mat: 'brick' });
}

// Winkelhaus: main house plus a gabled wing towards the street
function winkel(B, rng, meta) {
  const S = houseStyle(rng, wpick(rng, [['plaster', 5], ['fach', 2.5], ['brick', 1], ['bfw', 0.8], ['slate', 0.7]]));
  const fh = 0.25, floors = rng() < 0.35 ? 1 : 2;
  const mw = 0.62, md = 0.38, mz = -0.1;
  const side = rng() < 0.5 ? 1 : -1;
  const ww = 0.26, wz1 = 0.33, wx = side * (mw / 2 - ww / 2);
  const wz0 = mz + md / 2 - 0.02, wd = wz1 - wz0;
  const doorX = -side * 0.1;
  yard(B, rng, meta, S, { doorX, fz: mz + md / 2, z0: mz - md / 2, x0: -mw / 2, x1: mw / 2 });
  B.push(0, mz);
  plinth(B, -mw / 2, -md / 2, mw / 2, md / 2);
  aoDecal(B, -mw / 2, -md / 2, mw / 2, md / 2);
  const m = body(B, rng, S, mw, md, floors, fh, { nbF: 3, doorK: 1, noJetty: true });
  const pitch = randRange(rng, 0.82, 0.98);
  const r1 = mainRoof(B, rng, S, rng() < 0.7 ? 'gable' : 'halfhip', 'x', m.W, m.D, m.yw, pitch);
  if (rng() < 0.5) chimney(B, -side * mw * 0.25, -md * 0.15, m.yw + r1.h * 0.35, m.yw + r1.h + 0.07);
  if (rng() < 0.6) canopy(B, S.roof, doorX, md / 2, fh * 0.8);
  steps(B, doorX, md / 2);
  B.pop();
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

// Villa: square body under a hip or mansard roof, oriel or corner tower, veranda
function villa(B, rng, meta, o = {}) {
  const S = houseStyle(rng, o.kind || 'plaster', { win: pick(rng, ['win_a', 'win_o', 'win_g', 'win_sw', 'win_b']), fam: pick(rng, ['light', 'warm', 'cool']) });
  if (rng() < 0.5 || o.kind === 'jug') S.roof = roofStyle(rng, 'slate');
  const w = randRange(rng, 0.5, 0.56), d = Math.min(w, randRange(rng, 0.48, 0.54));
  const floors = 2, fh = 0.27, fz = 0.3, hx = randRange(rng, -0.08, 0.04);
  yard(B, rng, meta, S, { doorX: hx, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2 });
  B.push(hx, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.055, C('#b9b0a2'));
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF: 3, doorK: 1, bands: true });
  cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.022, 0.026, 0.02, S.trim);
  const pitch = randRange(rng, 0.62, 0.78);
  const rk = o.rk || (rng() < 0.25 ? 'mansard' : 'hip');
  const r = mainRoof(B, rng, S, rk, 'x', W, D, yw, pitch);
  let top = yw + r.h;
  if (rk === 'mansard') { for (const x of [-W / 4, W / 4]) mansardDormer(B, rng, S, x, r.m, 0.11); }
  else gableDormer(B, rng, S, 0, D, yw, r.h, 0.13, 0.55);
  if (o.tower ?? rng() < 0.5) top = Math.max(top, tower(B, rng, S, W / 2 - 0.02, D / 2 - 0.02, 0.085, 3, fh, 0.24, S.roof));
  else erker(B, rng, S, -W / 4 - 0.02, D / 2, fh + 0.03, 2 * fh - 0.02, 0.17, 0.065);
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
  finish(meta, [hx, fz + 0.03], top, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh, fh], roofH: r.h, mat: 'brick' });
}

// Siedlungshaus: small, steep roof, garage and a car in the drive
function siedlung(B, rng, meta, o = {}) {
  const S = houseStyle(rng, o.kind || 'plaster', { win: pick(rng, ['win_s', 'win_r', 'win_p', 'win_g', 'win_sw']) });
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
  yard(B, rng, meta, S1, { doors: [d1, d2], doorX: d1, fz, z0: fz - d, x0: -hw, x1: hw });
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
  use(S2); gableWall(B, rng, S2.gable, w / 2, d / 2, w / 2, -d / 2, yw, h);
  use(S1); gableWall(B, rng, S1.gable, -w / 2, -d / 2, -w / 2, d / 2, yw, h);
  for (const [S, cx] of [[S1, -hw / 2], [S2, hw / 2]]) {
    B.push(cx, 0);
    if (rng() < 0.7) { if (rng() < 0.5) shedDormer(B, rng, S, 0, 0.2, d, yw, h); else gableDormer(B, rng, S, 0, d, yw, h); }
    B.pop();
  }
  chimney(B, -hw * 0.5, -d * 0.12, yw + h * 0.4, yw + h + 0.06);
  B.pop();
  finish(meta, [d1, fz + 0.03], yw + h, { x0: -hw, z0: fz - d, x1: hw, z1: fz, fhs: Array(floors).fill(fh), roofH: h, mat: 'brick' });
}

// Reihenhauszeile: three narrow brick houses under one roof
function reihe(B, rng, meta) {
  const S = houseStyle(rng, 'kl90');
  const fh = 0.25, d = 0.42, fz = 0.3, hw = 0.3, n = 3;
  const doors = [];
  for (let i = 0; i < n; i++) doors.push(-hw + i * hw + (i % 2 ? 0.075 : -0.075));
  yard(B, rng, meta, S, { doors, doorX: doors[0], fz, z0: fz - d, x0: -0.45, x1: 0.45 });
  for (let i = 1; i < n; i++) hedge(B, -0.45 + i * hw - 0.008, fz + 0.03, -0.45 + i * hw + 0.008, 0.44, 0.05);
  B.push(0, fz - d / 2);
  plinth(B, -0.45, -d / 2, 0.45, d / 2, 0.03);
  aoDecal(B, -0.45, -d / 2, 0.45, d / 2);
  for (let i = 0; i < n; i++) {
    B.push(-hw + i * hw, 0);
    body(B, rng, S, hw, d, 2, fh, { nbF: 2, doorK: i % 2 ? 1 : 0, blank: i === 0 ? [1] : i === n - 1 ? [3] : [1, 3] });
    canopy(B, { bk: 'roof', rc: C(pick(rng, ['#4a4f55', '#7a3a2a', '#2f5f3a'])) }, (i % 2 ? 0.075 : -0.075), d / 2, fh * 0.8, 0.12, 0.06);
    B.pop();
  }
  const yw = 2 * fh, pitch = randRange(rng, 0.7, 0.85), h = (d / 2) * Math.tan(pitch);
  gableRoof(B, 0.9, d, yw, h, S.roof.rc, { bucket: S.roof.bk });
  use(S);
  gableWall(B, rng, S.gable, 0.45, d / 2, 0.45, -d / 2, yw, h);
  gableWall(B, rng, S.gable, -0.45, -d / 2, -0.45, d / 2, yw, h);
  for (let i = 0; i < n; i++) { B.push(-hw + i * hw, 0); if (rng() < 0.7) gableDormer(B, rng, S, 0, d, yw, h, 0.12); B.pop(); }
  B.pop();
  finish(meta, [doors[0], fz + 0.03], yw + h, { x0: -0.45, z0: fz - d, x1: 0.45, z1: fz, fhs: [fh, fh], roofH: h, mat: 'brick' });
}

// modern cube with an offset upper floor, carport and pool
function modern(B, rng, meta, o = {}) {
  const S = houseStyle(rng, o.kind || 'modern');
  const side = rng() < 0.5 ? 1 : -1;
  const w = 0.48, d = 0.42, fh = 0.26, fz = 0.32, hx = -side * 0.1;
  const drive = side > 0 ? [0.2, 0.44] : [-0.44, -0.2];
  const doorX = hx + side * 0.12;
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2, drive, driveZ: -0.05, modern: true });
  B.push(hx, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  body(B, rng, S, w, d, 1, fh, { nbF: 2, doorK: side > 0 ? 1 : 0 });
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, fh, { parapet: 0.012, pcol: '#4a4f55', col: '#b9b7b0' });
  const ux = -side * 0.05, uw = 0.42, ud = 0.36, uz = 0.04;
  B.push(ux, uz);
  const wood = o.kind !== 'eco' && rng() < 0.7;
  body(B, rng, S, uw, ud, 1, fh, { y0: fh, nbF: 2, noDoor: true, cell: (s, f, k) => (wood && (s === 3 || (s === 0 && k === 0)) ? 'wood_wall' : null) });
  mainRoof(B, rng, S, 'flat', 'x', uw, ud, 2 * fh, 0, { green: o.kind === 'eco' || rng() < 0.3 });
  if (o.kind !== 'eco' && rng() < 0.6) solarPanels(B, -uw / 2 + 0.04, -ud / 2 + 0.04, uw / 2 - 0.04, ud / 2 - 0.06, 2 * fh);
  B.pop();
  B.box('solid', doorX - hx - 0.08, fh * 0.86, d / 2, doorX - hx + 0.08, fh * 0.86 + 0.012, d / 2 + 0.08, C('#4a4f55'));
  B.pop();
  carport(B, drive[0] + 0.01, drive[1] - 0.01, -0.3, 0.12, 0.2, false);
  parkedCar(B, (drive[0] + drive[1]) / 2, -0.07, -Math.PI / 2, rng);
  finish(meta, [doorX, fz + 0.03], 2 * fh + 0.02, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh, fh], roofH: 0, mat: 'conc' });
}

// Bauhaus villa: white cubes, ribbon windows and a roof terrace
function bauhausVilla(B, rng, meta) {
  const S = houseStyle(rng, 'bh');
  const w = 0.56, d = 0.42, fh = 0.26, fz = 0.32, hx = randRange(rng, -0.06, 0.06);
  yard(B, rng, meta, S, { doorX: hx + 0.18, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2, modern: true });
  B.push(hx, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  body(B, rng, S, w, d, 1, fh, { nbF: 3, doorK: 2 });
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, fh, { parapet: 0.012, pcol: '#f6f4ef', col: '#c9c6be' });
  const side = rng() < 0.5 ? -1 : 1, uw = 0.34, ud = 0.34;
  B.push(side * (w / 2 - uw / 2), -0.03);
  body(B, rng, S, uw, ud, 1, fh, { y0: fh, nbF: 2, noDoor: true });
  flatRoof(B, -uw / 2, -ud / 2, uw / 2, ud / 2, 2 * fh, { parapet: 0.012, pcol: '#f6f4ef', col: '#c9c6be' });
  B.pop();
  const tx0 = side > 0 ? -w / 2 + 0.02 : w / 2 - 0.2, tx1 = tx0 + 0.18;
  railing(B, tx0, -d / 2 + 0.02, tx1, d / 2 - 0.02, fh + 0.012);
  B.box('solid', 0.06, fh * 0.9, d / 2, 0.26, fh * 0.9 + 0.012, d / 2 + 0.08, C('#f6f4ef'));
  B.cyl('solid', -side * (w / 2 - 0.07), fh, -d / 2 + 0.07, 0.05, fh, 10, C('#f6f4ef'));
  B.pop();
  finish(meta, [hx + 0.18, fz + 0.03], 2 * fh, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh, fh], roofH: 0, mat: 'conc' });
}

// 1970s bungalow: wide, low, dark wood windows, flat or shallow hip roof
function bungalow(B, rng, meta) {
  const S = houseStyle(rng, 'f70');
  const side = rng() < 0.5 ? 1 : -1;
  const w = 0.6, d = 0.42, fh = 0.25, fz = 0.3, hx = -side * 0.08;
  const drive = side > 0 ? [0.25, 0.45] : [-0.45, -0.25];
  const doorX = hx - side * 0.2;
  yard(B, rng, meta, S, { doorX, fz, z0: fz - d, x0: hx - w / 2, x1: hx + w / 2, drive, driveZ: -0.1 });
  B.push(hx, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  body(B, rng, S, w, d, 1, fh, { nbF: 3, doorK: side > 0 ? 0 : 2 });
  let h;
  if (rng() < 0.5) {
    flatRoof(B, -w / 2 - 0.03, -d / 2 - 0.03, w / 2 + 0.03, d / 2 + 0.03, fh, { parapet: 0.03, pcol: '#4a3426', col: '#9c9a93' });
    h = 0.03;
  } else {
    S.roof = { bk: 'roof', rc: C(pick(rng, ['#5f646b', '#6e564c', '#4f4a46'])) };
    h = Math.min(w, d) / 2 * Math.tan(0.36);
    hipRoof(B, w, d, fh, h, S.roof.rc, { bucket: 'roof', over: 0.08 });
  }
  B.pop();
  carport(B, drive[0] + 0.01, drive[1] - 0.01, -0.3, 0.12, 0.2, true);
  parkedCar(B, (drive[0] + drive[1]) / 2, -0.06, -Math.PI / 2, rng);
  finish(meta, [doorX, fz + 0.03], fh + h, { x0: hx - w / 2, z0: fz - d, x1: hx + w / 2, z1: fz, fhs: [fh], roofH: h, mat: 'conc' });
}

// ============================================================ L2 forms
// one narrow town house of the old-town row (local frame: front at z = d/2)
function narrowHouse(B, rng, S, w, d, floors, fh, o = {}) {
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF: 2, doorK: o.doorK ?? 0, shop: o.shop, blank: o.blank, bands: S.kind === 'plaster' || S.kind === 'jug' });
  if (o.flat) {
    const r = mainRoof(B, rng, S, 'flat', 'x', W, D, yw, 0, { green: rng() < 0.4 });
    return yw + r.h;
  }
  const gableFront = o.gableFront;
  const pitch = gableFront ? randRange(rng, 0.98, 1.1) : randRange(rng, 0.85, 0.98);
  const rk = o.stepped ? 'gable' : gableFront ? (rng() < 0.75 ? 'gable' : 'halfhip') : 'gable';
  if (!gableFront && (S.kind === 'plaster' || S.kind === 'jug')) cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.02, 0.022, 0.016, S.trim);
  const { h } = mainRoof(B, rng, S, rk, gableFront ? 'z' : 'x', W, D, yw, pitch, o.stepped ? { gover: -0.006 } : {});
  if (o.stepped) steppedGable(B, rng, S, W, D, yw, h, 5);
  if (!gableFront) dormers(B, rng, S, W, D, yw, h, rng() < 0.4 ? 'shed' : 'gable', 1);
  else if ((S.kind === 'plaster' || S.kind === 'jug') && rng() < 0.35) erker(B, rng, S, 0, D / 2, fh * (floors - 2) + 0.03, fh * (floors - 1) - 0.02, 0.16, 0.055);
  if (!o.stepped && rng() < 0.6) chimney(B, W * 0.18, -D * 0.2, yw + h * 0.3, yw + h + 0.05);
  return yw + h + (o.stepped ? 0.07 : 0);
}
// a pair of narrow houses filling the lot frontage (rows form along the street)
function rowPair(B, rng, meta, o = {}) {
  const fz = 0.44, mixed = o.shops ?? rng() < 0.3;
  townYard(B, rng, meta, fz, 0.55);
  let top = 0, doorX = 0, shell = null;
  const shopSide = mixed ? (rng() < 0.5 ? 0 : 1) : -1;
  for (let i = 0; i < 2; i++) {
    const kind = o.kinds ? pick(rng, o.kinds) : wpick(rng, [['plaster', 6], ['fach', 3], ['slate', 0.8], ['bfw', 0.6], ['brick', 0.6]]);
    const S = houseStyle(rng, kind);
    const w = randRange(rng, 0.43, 0.46), d = randRange(rng, 0.5, 0.58), floors = o.floors ? pick(rng, o.floors) : randInt(rng, 3, 4), fh = randRange(rng, 0.24, 0.27);
    const cx = (i === 0 ? -1 : 1) * 0.235;
    const shop = i === shopSide ? pick(rng, SHOP_TYPES) : null;
    B.push(cx, fz - d / 2);
    plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.04);
    aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
    const doorK = i === 0 ? 1 : 0;
    const t = narrowHouse(B, rng, S, w, d, floors, fh, { doorK, shop, gableFront: o.gableFront ?? rng() < 0.62, blank: [i === 0 ? 1 : 3], stepped: o.stepped, flat: o.flat });
    if (shop) {
      sign(B, rng, shop.sign, (doorK === 0 ? w / 4 : -w / 4), fh - 0.06, d / 2, 0.18);
      awning(B, doorK === 0 ? 0.005 : -w / 2 + 0.02, doorK === 0 ? w / 2 - 0.02 : -0.005, fh - 0.066, d / 2, 0.11, 0.05, pick(rng, AWNING_COLS));
      meta.shop = shop;
    } else if (rng() < 0.5 && !o.flat) canopy(B, S.roof, (doorK - 0.5) * w / 2, d / 2, fh * 0.8, 0.13, 0.06);
    B.pop();
    if (t > top) top = t;
    if (i === 0) { doorX = cx + (doorK - 0.5) * w / 2; shell = { x0: -0.47, z0: fz - d, x1: 0.47, z1: fz, fhs: Array(floors).fill(fh), roofH: 0.3, mat: 'brick' }; }
  }
  if (rng() < 0.5) bikes(B, rng, 0.0, fz + 0.03, 2);
  finish(meta, [doorX, fz + 0.03], top, shell);
}
// wide Bürgerhaus; o.kind: facade family, o.rk: roof, o.tower: corner tower, o.plain: no ornament
export function buerger(B, rng, meta, o = {}) {
  const S = houseStyle(rng, o.kind || 'plaster', { win: o.win || pick(rng, ['win_o', 'win_a', 'win_b', 'win_g', 'win_r', 'win_s']) });
  const w = randRange(rng, 0.84, 0.9), d = randRange(rng, 0.54, 0.6), fz = 0.42, floors = o.floors ?? randInt(rng, 3, 4), fh = 0.26;
  const mixed = o.shops ?? rng() < 0.3, shop = mixed ? pick(rng, SHOP_TYPES) : null;
  B.rect('grass', -0.5, -0.5, 0.5, fz - d, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, fz - 0.01, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  hedge(B, -0.48, -0.48, 0.48, -0.44);
  meta.trees.push([randRange(rng, -0.3, 0.3), -0.36, pick(rng, ['round', 'tall']), randRange(rng, 0.8, 1.1)]);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.05);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nbF = 4, doorK = mixed ? 3 : rng() < 0.5 ? 1 : 2;
  const fhs = Array(floors).fill(fh); if (mixed) fhs[0] = 0.3;
  const { W, D, yw } = body(B, rng, S, w, d, floors, fhs, { nbF, doorK, shop, bands: !o.plain });
  if (!o.plain) cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.024, 0.028, 0.02, S.trim);
  if (shop) {
    sign(B, rng, shop.sign, -w / 2 + (w / nbF) * 1.5, fhs[0] - 0.062, d / 2, 0.26);
    awning(B, -w / 2 + 0.02, -w / 2 + (w / nbF) * 3 - 0.01, fhs[0] - 0.068, d / 2, 0.12, 0.05, pick(rng, AWNING_COLS));
    meta.shop = shop;
  }
  const rk = o.rk || wpick(rng, [['gable', 3], ['mansard', 2], ['hip', 1.5], ['halfhip', 1.5]]);
  const pitch = randRange(rng, 0.82, 0.95);
  const r = mainRoof(B, rng, S, rk, 'x', W, D, yw, pitch);
  let top = yw + r.h;
  if (rk === 'mansard') for (let i = 0; i < 3; i++) mansardDormer(B, rng, S, -W / 3 + i * W / 3, r.m, 0.11);
  else if (rk !== 'hip' && (o.zwerch ?? rng() < 0.6)) zwerchhaus(B, rng, S, 0, 0.3, D, yw, r.h, fh * 0.9, pitch + 0.1);
  else dormers(B, rng, S, W, D, yw, r.h, o.plain ? 'shed' : 'gable', rk === 'hip' ? 2 : 3);
  if (o.tower) top = Math.max(top, tower(B, rng, S, W / 2 - 0.02, D / 2 - 0.02, 0.1, floors + 1, fh, 0.3, S.roof));
  else if (!o.plain && rng() < 0.35) erker(B, rng, S, W / 2 - 0.13, D / 2, fh + 0.03, yw - fh - 0.02, 0.17, 0.06);
  else if (!o.plain && rng() < 0.5) for (let f = 1; f < floors; f++) balconyRow(B, -0.09, 0.09, D / 2, f * fh + 0.01, 0.05, 'iron');
  chimney(B, W * 0.3, -D * 0.18, yw + r.h * 0.3, yw + r.h + 0.06);
  chimney(B, -W * 0.3, -D * 0.18, yw + r.h * 0.3, yw + r.h + 0.06);
  B.pop();
  for (let i = 0; i < 3; i++) MD.bin(B, 0.38 - i * 0.045, fz - d - 0.05, C(BIN_COLS[i]));
  finish(meta, [-w / 2 + (doorK + 0.5) * w / nbF, fz + 0.03], top, { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: r.h, mat: 'brick' });
}
// big timber-framed town house with jetties (Ackerbürgerhaus)
function fachBig(B, rng, meta) {
  const S = houseStyle(rng, pick(rng, ['fach', 'fwfr', 'fwsw']));
  const w = 0.8, d = 0.52, fz = 0.42, fh = 0.25;
  townYard(B, rng, meta, fz, d);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.05);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, 3, fh, { nbF: 4, doorK: 1 });
  const gableFront = rng() < 0.5;
  const pitch = randRange(rng, 0.95, 1.08);
  const { h } = mainRoof(B, rng, S, gableFront || rng() < 0.5 ? 'gable' : 'halfhip', gableFront ? 'z' : 'x', W, D, yw, pitch);
  if (!gableFront) zwerchhaus(B, rng, S, 0, 0.3, D, yw, h, fh * 0.9, pitch + 0.1);
  chimney(B, W * 0.25, -D * 0.15, yw + h * 0.3, yw + h + 0.06);
  B.pop();
  finish(meta, [-w / 2 + 1.5 * w / 4, fz + 0.03], yw + h, { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs: [fh, fh, fh], roofH: h, mat: 'brick' });
}

// ============================================================ L3 forms
// Gründerzeit / Jugendstil block: ornate windows, mansard roof, corner oriel
function gruenderzeit(B, rng, meta, o = {}) {
  const S = o.kind === 'jug' ? houseStyle(rng, 'jug') : houseStyle(rng, 'plaster', { win: pick(rng, ['win_o', 'win_o', 'win_a', 'win_b']), fam: pick(rng, ['warm', 'light', 'cool']) });
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
  const { W, D, yw } = body(B, rng, { ...S, g: ground }, w, d, floors, fh, { nbF, doorK, bands: true, cell: (s, f, k, nb, Lv) => (o.kind !== 'jug' && f >= 3 && s !== 2 && Lv.win === 'win_o' ? 'win_a' : null) });
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
// clinker block with balconies
function klinker(B, rng, meta) {
  const S = houseStyle(rng, 'brick');
  const w = 0.9, d = 0.64, fz = 0.42, floors = randInt(rng, 4, 5), fh = 0.27;
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, 0.36, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  meta.trees.push([-0.36, -0.38, 'round', 0.9], [0.36, -0.38, 'tall', 0.9]);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.06, C('#8d8a84'));
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nbF = 4;
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK: 1, bands: true });
  cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.024, 0.03, 0.02, S.trim);
  const r = mainRoof(B, rng, S, rng() < 0.5 ? 'hip' : 'gable', 'x', W, D, yw, 0.78);
  dormers(B, rng, S, W, D, yw, r.h, rng() < 0.5 ? 'shed' : 'gable', 2);
  for (let f = 1; f < floors; f++) {
    balconyRow(B, -W / 2 + 0.02, -W / 2 + W / nbF - 0.02, D / 2, f * fh + 0.01, 0.06, 'iron');
    balconyRow(B, W / 2 - W / nbF + 0.02, W / 2 - 0.02, D / 2, f * fh + 0.01, 0.06, 'iron');
  }
  B.pop();
  finish(meta, [-w / 2 + 1.5 * w / nbF, fz + 0.03], yw + r.h, { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs: Array(floors).fill(fh), roofH: r.h, mat: 'brick' });
}
// flat roofed slab blocks (Plattenbau, Bauhaus): cells by column
function slab(B, rng, meta, o) {
  const S = houseStyle(rng, o.kind);
  const w = 0.94, d = 0.6, fz = 0.42, floors = o.floors, fh = 0.26;
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#e9eedd'), 3);
  B.rect('cobble', -0.5, 0.36, 0.5, 0.5, 0.006, C('#dcd8cf'), 1.1);
  meta.trees.push([-0.38, -0.4, 'tall', 0.95], [0.38, -0.4, 'round', 0.9]);
  B.push(0, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nbF = 4, doorK = 1;
  const { W, D, yw } = body(B, rng, S, w, d, floors, fh, { nbF, doorK, cell: o.cell });
  mainRoof(B, rng, S, 'flat', 'x', W, D, yw, 0, { pcol: o.pcol });
  if (o.kind === 'plat') {
    B.box('solid', -0.12, yw, -0.12, 0.08, yw + 0.1, 0.06, C('#cfcabd'));
    B.box('solid', -w / 2 + w / nbF * doorK - 0.02, fh * 0.85, D / 2, -w / 2 + w / nbF * (doorK + 1) + 0.02, fh * 0.85 + 0.016, D / 2 + 0.09, C('#cfcabd'));
  } else {
    for (let f = 1; f < floors; f++) {
      B.box('solid', W / 2 - 0.28, f * fh - 0.01, D / 2, W / 2 - 0.02, f * fh, D / 2 + 0.08, C('#f6f4ef'));
      railing(B, W / 2 - 0.28, D / 2, W / 2 - 0.02, D / 2 + 0.08, f * fh);
    }
  }
  B.pop();
  MD.bench(B, 0.3, 0.46, 0);
  finish(meta, [-w / 2 + (doorK + 0.5) * w / nbF, fz + 0.03], yw + 0.1, { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs: Array(floors).fill(fh), roofH: 0, mat: 'conc' });
}

// ============================================================ L4 towers (2x2)
function wohnturm(B, rng, meta, LW, LD, o) {
  B.rect('cobble', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#ebe4d8'), 1.1);
  for (const [x, z] of [[-LW / 2 + 0.22, LD / 2 - 0.2], [LW / 2 - 0.22, LD / 2 - 0.2], [-LW / 2 + 0.2, -LD / 2 + 0.2], [LW / 2 - 0.2, -LD / 2 + 0.2]]) {
    B.cyl('solid', x, 0, z, 0.1, 0.035, 10, C('#bdb6aa'), { top: C('#5f8f3a') });
    meta.trees.push([x, z, pick(rng, ['round', 'tall']), randRange(rng, 0.9, 1.15)]);
  }
  const w = randRange(rng, 1.0, 1.15), d = randRange(rng, 0.9, 1.0);
  const floors = randInt(rng, o.floors[0], o.floors[1]), fh = 0.27;
  setTint(o.tint || null);
  B.push(0, -0.12);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2, 0.12);
  const nb = Math.round(w / 0.22);
  const fhs = Array(floors).fill(fh);
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k, n) => {
    if (f === 0) return (s === 0 && k === Math.floor(n / 2)) ? 'apt_door' : o.ground || 'glass_dark';
    return o.cell(s, f, k, n);
  }, w / nb);
  const yw = floors * fh;
  if (o.slabs) for (let f = 1; f < floors; f++) B.box('solid', -w / 2 - 0.04, f * fh - 0.012, -d / 2 - 0.04, w / 2 + 0.04, f * fh, d / 2 + 0.04, C(o.slabs));
  if (o.planters) {
    for (let f = 2; f < floors; f++) {
      const y = f * fh, hh = 0.045 + ((f * 7) % 3) * 0.012;
      B.box('hedge', -w / 2 - 0.04, y, d / 2 + 0.005, w / 2 + 0.04, y + hh, d / 2 + 0.04, C('#a9c49a'), { s: 0.18 });
      B.box('hedge', w / 2 + 0.005, y, -d / 2 - 0.04, w / 2 + 0.04, y + hh, d / 2 + 0.04, C('#a9c49a'), { s: 0.18 });
      if (f % 3 === 0) for (const x of [-w / 3, w / 4]) B.sphere('hedge', x, y + 0.08, d / 2 + 0.025, 0.06, 0.07, 0.04, C('#9dbb8c'), 7, 5);
    }
  }
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, yw, { parapet: 0.05 });
  let top = yw + 0.2;
  if (o.crown) {
    const cw = w * 0.6, cd = d * 0.6;
    boxWalls(B, rng, -cw / 2, -cd / 2, cw / 2, cd / 2, yw, [fh, fh], () => o.crown, cw / 3);
    flatRoof(B, -cw / 2, -cd / 2, cw / 2, cd / 2, yw + 2 * fh, { parapet: 0.04 });
    top = yw + 2 * fh;
  } else B.box('solid', -0.2, yw, -0.15, 0.15, yw + 0.18, 0.12, C('#cfcabd'));
  rooftopStuff(B, rng, -w / 2, -d / 2, w / 2, d / 2, yw, 2);
  B.pop();
  meta.door = [0, -0.12 + d / 2 + 0.04];
  meta.height = top;
  meta.lamps.push([-0.8, 0.85], [0.8, 0.85]);
  MD.lampPost(B, -0.8, 0.85); MD.lampPost(B, 0.8, 0.85);
  MD.bench(B, -0.4, 0.75, 0); MD.bench(B, 0.4, 0.75, 0);
  meta.shell = { x0: -w / 2, z0: -0.12 - d / 2, x1: w / 2, z1: -0.12 + d / 2, fhs, roofH: 0, mat: 'conc' };
}

// ============================================================ catalogue
const V = (name, lvl, w, fn) => ({ name, lvl, w, fn });
export const RES_VARIANTS = [
  // ---- Einfamilienhäuser
  V('Fränkisches Fachwerkhaus', 1, 3, (B, r, m) => giebel(B, r, m, { kind: 'fwfr' })),
  V('Niedersächsisches Fachwerkhaus', 1, 3, (B, r, m) => trauf(B, r, m, { kind: 'fwsw', floors: 2 })),
  V('Fachwerkhaus mit Zwerchhaus', 1, 3, (B, r, m) => trauf(B, r, m, { kind: 'fach', floors: 2, zwerch: true })),
  V('Backstein-Fachwerkhaus', 1, 2, (B, r, m) => giebel(B, r, m, { kind: 'bfw' })),
  V('Bauernhaus', 1, 2, (B, r, m) => trauf(B, r, m, { kind: 'bauern', floors: 2, w: 0.7, d: 0.42, rk: 'halfhip', farm: true, tractor: true, zwerch: false })),
  V('Schwarzwaldhaus', 1, 2, (B, r, m) => trauf(B, r, m, { kind: 'shingle', floors: 2, w: 0.66, d: 0.5, rk: 'halfhip', k: 0.5, pitch: 1.0, rs: SHINGLE, dormer: 'none', zwerch: false, balcony: true })),
  V('Alpenhaus', 1, 2, (B, r, m) => trauf(B, r, m, { kind: 'alp', floors: 2, w: 0.64, d: 0.5, rk: 'gable', pitch: 0.45, over: 0.11, gover: 0.12, dormer: 'none', zwerch: false, rs: (rr) => (rr() < 0.5 ? SHINGLE() : { bk: 'roof', rc: C('#6e564c') }) })),
  V('Friesenhaus mit Reetdach', 1, 2, (B, r, m) => trauf(B, r, m, { kind: 'kl90', floors: 1, w: 0.66, d: 0.46, rk: 'hip', pitch: 1.12, rs: THATCH, zwerch: false, dormer: 'none' })),
  V('Schieferhaus', 1, 2, (B, r, m) => trauf(B, r, m, { kind: 'slate', floors: 2 })),
  V('Landhaus mit Klappläden', 1, 4, (B, r, m) => trauf(B, r, m, { kind: 'plaster', win: 'shut', rk: 'halfhip' })),
  V('Traufhaus mit Gauben', 1, 4, (B, r, m) => trauf(B, r, m, { kind: 'plaster', zwerch: false })),
  V('Giebelhaus', 1, 3, (B, r, m) => giebel(B, r, m, { kind: 'plaster' })),
  V('Winkelhaus', 1, 3, (B, r, m) => winkel(B, r, m)),
  V('Gründerzeit-Villa mit Turm', 1, 2, (B, r, m) => villa(B, r, m, { tower: true })),
  V('Jugendstil-Villa', 1, 1.5, (B, r, m) => villa(B, r, m, { kind: 'jug', rk: 'mansard', tower: false })),
  V('Stadtvilla mit Walmdach', 1, 2, (B, r, m) => villa(B, r, m, { tower: false, rk: 'hip' })),
  V('Bauhaus-Villa', 1, 1.2, (B, r, m) => bauhausVilla(B, r, m)),
  V('50er-Jahre-Siedlungshaus', 1, 3, (B, r, m) => siedlung(B, r, m, { kind: 'f50' })),
  V('Siedlungshaus mit Garage', 1, 3, (B, r, m) => siedlung(B, r, m)),
  V('70er-Jahre-Bungalow', 1, 2, (B, r, m) => bungalow(B, r, m)),
  V('Klinker-Reihenhäuser', 1, 2.5, (B, r, m) => reihe(B, r, m)),
  V('Doppelhaus', 1, 3, (B, r, m) => doppel(B, r, m)),
  V('Modernes Holzhaus', 1, 1.5, (B, r, m) => modern(B, r, m, { kind: 'eco' })),
  V('Weißer Kubus', 1, 1.5, (B, r, m) => modern(B, r, m, { kind: 'modern' })),
  V('Anthrazit-Kubus', 1, 1.2, (B, r, m) => modern(B, r, m, { kind: 'dark' })),
  V('Scheunenhaus (Neubau)', 1, 1.2, (B, r, m) => giebel(B, r, m, { kind: 'dark', barn: true, rk: 'gable', pitch: 0.85, rs: METAL })),
  // ---- Stadthäuser
  V('Altstadt-Häuserzeile', 2, 5, (B, r, m) => rowPair(B, r, m)),
  V('Fachwerk-Altstadtzeile', 2, 3, (B, r, m) => rowPair(B, r, m, { kinds: ['fach', 'fwfr', 'fwsw', 'fach'], gableFront: true })),
  V('Ackerbürgerhaus', 2, 2, (B, r, m) => fachBig(B, r, m)),
  V('Hanseatische Giebelhäuser', 2, 1.2, (B, r, m) => rowPair(B, r, m, { kinds: ['hanse'], gableFront: true, stepped: true, floors: [3, 4] })),
  V('Bürgerhaus mit Zwerchhaus', 2, 3, (B, r, m) => buerger(B, r, m, { rk: 'gable', zwerch: true })),
  V('Barockes Bürgerhaus', 2, 2, (B, r, m) => buerger(B, r, m, { rk: 'mansard', win: 'win_o' })),
  V('Jugendstil-Stadthaus', 2, 2, (B, r, m) => buerger(B, r, m, { kind: 'jug', rk: 'mansard' })),
  V('Gründerzeit-Eckhaus mit Turm', 2, 1.5, (B, r, m) => buerger(B, r, m, { rk: 'hip', tower: true })),
  V('Wiederaufbau-Haus (50er)', 2, 2, (B, r, m) => buerger(B, r, m, { kind: 'f50', rk: 'gable', plain: true, zwerch: false })),
  V('Moderne Stadthäuser', 2, 2, (B, r, m) => rowPair(B, r, m, { kinds: ['modern', 'dark', 'eco'], flat: true, shops: false })),
  // ---- Mehrfamilienhäuser
  V('Gründerzeit-Block', 3, 3, (B, r, m) => gruenderzeit(B, r, m)),
  V('Jugendstil-Block', 3, 2, (B, r, m) => gruenderzeit(B, r, m, { kind: 'jug' })),
  V('Klinker-Block', 3, 2, (B, r, m) => klinker(B, r, m)),
  V('Plattenbau (WBS 70)', 3, 2, (B, r, m) => slab(B, r, m, { kind: 'plat', floors: 6, cell: (s, f, k) => (f > 0 && (s === 0 || s === 2) && k % 2 === 1 ? 'plat_bal' : 'plat_win'), pcol: '#cfcabd' })),
  V('Bauhaus-Wohnblock', 3, 1.5, (B, r, m) => slab(B, r, m, { kind: 'bh', floors: 4, cell: (s, f, k) => (s === 1 || s === 3 ? (k % 2 ? 'apt_wall' : 'bh_win') : null), pcol: '#f6f4ef' })),
  V('Stadtvilla-Block', 3, 2, (B, r, m) => resL3Old(B, r, m, 'classic')),
  V('Moderner Wohnblock', 3, 2.5, (B, r, m) => resL3Old(B, r, m, 'modern')),
  // ---- Wohntürme
  V('Wohnturm', 4, 2, (B, r, m, LW, LD) => resL4Old(B, r, m, LW, LD)),
  V('70er-Jahre-Hochhaus', 4, 2, (B, r, m, LW, LD) => wohnturm(B, r, m, LW, LD, { floors: [14, 20], cell: () => 'hh70_win', ground: 'glass_silver' })),
  V('Grüner Wohnturm', 4, 1.5, (B, r, m, LW, LD) => wohnturm(B, r, m, LW, LD, { floors: [16, 24], tint: '#f4f2ec', cell: (s, f, k) => (k % 3 === 1 ? 'wood_win' : 'apt_bal'), planters: true, slabs: '#e8e6e0' })),
  V('Gläserner Wohnturm', 4, 1.5, (B, r, m, LW, LD) => wohnturm(B, r, m, LW, LD, { floors: [18, 28], cell: (s, f, k) => (k % 2 ? 'glass_silver' : 'glass_teal'), slabs: '#dfe3e6', crown: 'glass_dark' })),
];

// test hook: globalThis.__vmap = { 'x,z': 'Variant name' } forces the variant of a lot
export function forcedVariant(list, b) {
  const m = globalThis.__vmap;
  const name = m && b && m[`${b.x},${b.z}`];
  return (name && list.find((x) => x.name === name)) || null;
}
function pickVariant(rng, lvl, b) {
  return forcedVariant(RES_VARIANTS, b) || wpick(rng, RES_VARIANTS.filter((v) => v.lvl === lvl).map((v) => [v, v.w]));
}
function run(lvl) {
  return (B, rng, meta, LW, LD, b) => {
    const v = pickVariant(rng, lvl, b);
    meta.variant = v.name;
    v.fn(B, rng, meta, LW, LD);
    setTint(null);
  };
}
export const resL1 = run(1);
export const resL2 = run(2);
export const resL3 = run(3);
export const resL4 = run(4);
