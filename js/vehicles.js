import * as THREE from 'three';

// Textured vehicles. Every body part is a side profile that is extruded across
// the vehicle width with rounded edges. A procedural atlas holds the side art
// (windows, doors, liveries) and an "unrolled" band texture for the surfaces
// around the profile (bumper, bonnet, windscreen, roof, back). Paintwork is
// white with a paint mask in the red channel of the ORM map, so instance or
// vertex colours tint only the bodywork and never glass, lights or liveries.
// Vehicles face +x and stand on y = 0.

const WH = [1, 1, 1];
let PX = 512;
let AW = 2048, AH = 2048;
const PARTS = {};
const ARTS = {};
const SW = {};
let READY = null;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fract = (v) => v - Math.floor(v);
const HX = new Map();
function hx(h) {
  let v = HX.get(h);
  if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; HX.set(h, v); }
  return v;
}
function lin(h) { const c = hx(h); return c.map((v) => Math.pow(v / 255, 2.2)); }

const BODY = { c: '#efefef', m: 1, r: 0.3, me: 0.18 };
const HEAD = lin('#f4f1e4'), TAIL = lin('#c42218'), BLUE = lin('#2f6bff'), AMBER = lin('#ffa31a');

// ------------------------------------------------------------------ profiles
function expand(spec) {
  const raw = [];
  for (const e of spec) {
    if (!e.arch) { raw.push(e); continue; }
    const [cx, cy, R] = e.arch, yb = e.yb, n = 10;
    if (yb >= cy) {
      const a = Math.asin(Math.min(1, (yb - cy) / R));
      for (let k = 0; k <= n; k++) {
        const t = Math.PI - a - (Math.PI - 2 * a) * k / n;
        raw.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R, 0, k === n ? (e.tag || 'under') : 'arch']);
      }
    } else {
      raw.push([cx - R, yb, 0, 'arch']);
      for (let k = 0; k <= n; k++) { const t = Math.PI - Math.PI * k / n; raw.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R, 0, 'arch']); }
      raw.push([cx + R, yb, 0, e.tag || 'under']);
    }
  }
  return raw;
}

// rounds corners with radius r; the tag of a point names the segment that starts there
function fillet(raw) {
  const out = [], N = raw.length;
  for (let i = 0; i < N; i++) {
    const [x, y, r, tag] = raw[i];
    const p = raw[(i + N - 1) % N], q = raw[(i + 1) % N];
    if (!r) { out.push({ x, y, tag }); continue; }
    let ax = p[0] - x, ay = p[1] - y, bx = q[0] - x, by = q[1] - y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    ax /= la; ay /= la; bx /= lb; by /= lb;
    const th = Math.acos(clamp(ax * bx + ay * by, -1, 1));
    if (th > 3.05 || th < 0.05) { out.push({ x, y, tag }); continue; }
    const tn = Math.tan(th / 2);
    const t = Math.min(r / tn, la * 0.48, lb * 0.48), rr = t * tn;
    const mx = ax + bx, my = ay + by, ml = Math.hypot(mx, my);
    const dc = rr / Math.sin(th / 2);
    const cx = x + mx / ml * dc, cy = y + my / ml * dc;
    const a1 = Math.atan2(y + ay * t - cy, x + ax * t - cx);
    let da = Math.atan2(y + by * t - cy, x + bx * t - cx) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(da) / 0.26));
    const ptag = p[3];
    for (let k = 0; k <= n; k++) { const a = a1 + da * k / n; out.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, tag: k < n / 2 ? ptag : tag }); }
  }
  const res = [];
  for (const p of out) {
    const l = res[res.length - 1];
    if (l && Math.hypot(l.x - p.x, l.y - p.y) < 1e-5) { l.tag = p.tag; continue; }
    res.push(p);
  }
  if (res.length > 2) { const f = res[0], l = res[res.length - 1]; if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-5) res.pop(); }
  return res;
}

function offsetPts(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    let n1x = b.y - a.y, n1y = a.x - b.x; const l1 = Math.hypot(n1x, n1y) || 1; n1x /= l1; n1y /= l1;
    let n2x = c.y - b.y, n2y = b.x - c.x; const l2 = Math.hypot(n2x, n2y) || 1; n2x /= l2; n2y /= l2;
    let x = n1x + n2x, y = n1y + n2y; const l = Math.hypot(x, y) || 1; x /= l; y /= l;
    const k = d / Math.max(0.45, x * n2x + y * n2y);
    out.push([b.x - x * k, b.y - y * k]);
  }
  return out;
}

function prep(P) {
  const pts = fillet(expand(P.prof));
  const n = pts.length;
  let A2 = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; A2 += a.x * b.y - b.x * a.y; }
  if (A2 < 0) console.warn('Fahrzeugprofil nicht gegen den Uhrzeigersinn:', P.name);
  const sn = [], S = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1e-6;
    sn.push([dy / l, -dx / l]); S.push(S[i] + l);
  }
  const vn = [], smooth = [];
  for (let i = 0; i < n; i++) {
    const a = sn[(i + n - 1) % n], b = sn[i];
    let x = a[0] + b[0], y = a[1] + b[1]; const l = Math.hypot(x, y) || 1;
    vn.push([x / l, y / l]); smooth.push(a[0] * b[0] + a[1] * b[1] > 0.72);
  }
  const q = offsetPts(pts, P.bev);
  // runs of equal tags (for shaders that need a position within a surface)
  const run = new Array(n);
  let i0 = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || pts[i].tag !== pts[i0].tag) { const r = [S[i0], S[i]]; for (let k = i0; k < i; k++) run[k] = r; i0 = i; }
  }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const mg = 0.006;
  Object.assign(P, { pts, n, sn, S, perim: S[n], vn, smooth, q, run, x0: x0 - mg, x1: x1 + mg, y0: y0 - mg, y1: y1 + mg });
}

// x of the outline at height y (front: max, back: min)
function profX(P, y, front) {
  let best = front ? -1e9 : 1e9;
  for (let i = 0; i < P.n; i++) {
    const a = P.pts[i], b = P.pts[(i + 1) % P.n];
    if ((y - a.y) * (y - b.y) > 0 || a.y === b.y) continue;
    const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
    best = front ? Math.max(best, x) : Math.min(best, x);
  }
  return best;
}
// y of the top outline at x
function profTop(P, x) {
  let best = -1e9;
  for (let i = 0; i < P.n; i++) {
    const a = P.pts[i], b = P.pts[(i + 1) % P.n];
    if ((x - a.x) * (x - b.x) > 0 || a.x === b.x) continue;
    best = Math.max(best, a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
  }
  return best;
}

// ------------------------------------------------------------- shader output
class Out {
  set(h, m = 0, r = 0.5, me = 0) { const c = hx(h); this.r = c[0]; this.g = c[1]; this.b = c[2]; this.m = m; this.ro = r; this.me = me; return this; }
  P(p) { return this.set(p.c, p.m, p.r, p.me); }
  mul(f) { this.r *= f; this.g *= f; this.b *= f; return this; }
  mix(h, a) { const c = hx(h); this.r += (c[0] - this.r) * a; this.g += (c[1] - this.g) * a; this.b += (c[2] - this.b) * a; return this; }
}

function glassPx(o, u, v) {
  o.set('#1e2a35', 0, 0.06, 0.55);
  o.mix('#5f7789', clamp(0.15 + 0.55 * v + 0.1 * Math.sin(u * 4 + v * 2), 0, 1));
  const d = u * 1.2 - v * 0.55 - 0.32;
  o.mix('#d6e5ee', 0.32 * Math.exp(-(d * d) / 0.006) + 0.16 * Math.exp(-((d - 0.2) * (d - 0.2)) / 0.002));
  return o;
}
function plate(o, u, v, front) {
  o.set('#f1f1ec', 0, 0.4, 0);
  if (front ? u > 0.74 : u < -0.74) return o.set('#1f4fa8', 0, 0.4, 0);
  if (v < 0.1 || v > 0.9 || Math.abs(u) > 0.96) return o.set('#202020', 0, 0.5, 0);
  if (v > 0.28 && v < 0.72 && Math.abs(u) < 0.62 && fract((u + 1) * 6) < 0.62) o.set('#2a2a2a', 0, 0.5, 0);
  return o;
}
function headlamp(o, u, v) {
  o.set('#d9e0e5', 0, 0.08, 0.75);
  const d = Math.hypot((u - 0.5) * 1.6, v - 0.5);
  if (d < 0.32) o.set('#f8f6ee', 0, 0.05, 0.4);
  if (v < 0.12) o.set('#9aa2a9', 0, 0.2, 0.8);
  return o;
}
function taillamp(o, u, v) {
  o.set('#9c160f', 0, 0.18, 0.1);
  if (v > 0.3 && v < 0.7) o.set('#d93a24', 0, 0.15, 0.1);
  if (u > 0.82) o.set('#f2f0ea', 0, 0.1, 0.2);
  return o;
}
function under(o) { return o.set('#141416', 0, 0.9, 0); }

// ------------------------------------------------------------------- drawers
function rrPath(g, x0, y0, x1, y1, r) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  r = Math.min(r, (bx - ax) / 2, (by - ay) / 2);
  g.moveTo(ax + r, ay); g.lineTo(bx - r, ay); g.arcTo(bx, ay, bx, ay + r, r); g.lineTo(bx, by - r);
  g.arcTo(bx, by, bx - r, by, r); g.lineTo(ax + r, by); g.arcTo(ax, by, ax, by - r, r); g.lineTo(ax, ay + r);
  g.arcTo(ax, ay, ax + r, ay, r); g.closePath();
}
function polyPath(g, pts) { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
const ormStr = (m, r, me) => `rgb(${Math.round(m * 255)},${Math.round(r * 255)},${Math.round(me * 255)})`;

// draws side art in vehicle coordinates (x forward, y up); flip paints the
// left side, where the front is on the left but text must stay readable
class Drawer {
  constructor(cc, oc) { this.cc = cc; this.oc = oc; }
  begin(R, P, flip) {
    Object.assign(this, { R, P, flip, x0: P.x0, x1: P.x1, y1: P.y1 });
    for (const g of [this.cc, this.oc]) {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
      if (flip) g.setTransform(-PX, 0, 0, -PX, R.x + P.x1 * PX, R.y + P.y1 * PX);
      else g.setTransform(PX, 0, 0, -PX, R.x - P.x0 * PX, R.y + P.y1 * PX);
    }
  }
  end() { this.cc.restore(); this.oc.restore(); }
  fill(path, c, m = 0, r = 0.5, me = 0) {
    if (typeof c === 'object' && c.c) { m = c.m; r = c.r; me = c.me; c = c.c; }
    const cc = this.cc, oc = this.oc;
    cc.fillStyle = c; cc.beginPath(); path(cc); cc.fill();
    oc.fillStyle = ormStr(m, r, me); oc.beginPath(); path(oc); oc.fill();
  }
  all(c, m, r, me) { const P = this.P; this.fill((g) => g.rect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0), c, m, r, me); }
  rect(x0, y0, x1, y1, c, m, r, me) { this.fill((g) => g.rect(x0, y0, x1 - x0, y1 - y0), c, m, r, me); }
  rr(x0, y0, x1, y1, rad, c, m, r, me) { this.fill((g) => rrPath(g, x0, y0, x1, y1, rad), c, m, r, me); }
  poly(pts, c, m, r, me) { this.fill((g) => polyPath(g, pts), c, m, r, me); }
  circ(x, y, rad, c, m, r, me) { this.fill((g) => g.arc(x, y, rad, 0, Math.PI * 2), c, m, r, me); }
  ov(fn) { this.cc.save(); fn(this.cc); this.cc.restore(); }
  line(x0, y0, x1, y1, w, c) { this.ov((g) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }); }
  shade(y0, y1, a = 0.2) {
    const P = this.P;
    this.ov((g) => {
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.5, 'rgba(0,0,0,0.03)'); gr.addColorStop(0.85, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.04)');
      g.fillStyle = gr; g.fillRect(P.x0, y0, P.x1 - P.x0, y1 - y0);
    });
  }
  arches(list, R) {
    this.ov((g) => {
      g.strokeStyle = 'rgba(10,10,12,0.75)'; g.lineWidth = 0.007;
      for (const [x, y] of list) { g.beginPath(); g.arc(x, y, R + 0.0015, 0, Math.PI); g.stroke(); }
    });
  }
  glass(pts) {
    let y0 = 1e9, y1 = -1e9;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const gr = this.cc.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#1b2630'); gr.addColorStop(0.55, '#34495a'); gr.addColorStop(1, '#7590a3');
    this.fill((g) => polyPath(g, pts), gr, 0, 0.06, 0.55);
    this.ov((g) => {
      g.beginPath(); polyPath(g, pts); g.clip();
      g.fillStyle = 'rgba(225,238,246,0.2)';
      const h = y1 - y0;
      for (const [o, w] of [[0.0, 0.03], [0.07, 0.012], [0.26, 0.05]]) {
        const x = this.P.x0 + o + (this.P.x1 - this.P.x0) * 0.3;
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x + w, y0); g.lineTo(x + w + h * 0.8, y1); g.lineTo(x + h * 0.8, y1); g.closePath(); g.fill();
      }
    });
  }
  text(str, x, y, size, c, opts = {}) {
    const R = this.R;
    const px = this.flip ? R.x + (this.x1 - x) * PX : R.x + (x - this.x0) * PX;
    const py = R.y + (this.y1 - y) * PX;
    for (const [g, col] of [[this.cc, c], [this.oc, opts.orm || 'rgb(0,90,0)']]) {
      g.save(); g.setTransform(1, 0, 0, 1, px, py);
      g.font = `${opts.weight || 700} ${Math.max(4, size * PX)}px ${opts.font || 'Arial, Helvetica, sans-serif'}`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
      if (opts.maxW) g.fillText(str, 0, 0, opts.maxW * PX); else g.fillText(str, 0, 0);
      g.restore();
    }
  }
}

// text on the band texture of a vertical face (front or back)
class BandDrawer {
  constructor(P, cc, oc) { this.P = P; this.cc = cc; this.oc = oc; }
  sAtY(tag, y) {
    const P = this.P;
    for (let i = 0; i < P.n; i++) {
      const a = P.pts[i], b = P.pts[(i + 1) % P.n];
      if (a.tag !== tag || a.y === b.y || (y - a.y) * (y - b.y) > 0) continue;
      return P.S[i] + (y - a.y) / (b.y - a.y) * (P.S[i + 1] - P.S[i]);
    }
    return null;
  }
  faceText(tag, str, y, z, size, col, front = true, opts = {}) {
    const s = this.sAtY(tag, y);
    if (s === null) return;
    const s2 = this.sAtY(tag, y + 0.002);
    const up = s2 === null ? 1 : Math.sign(s2 - s) || 1;
    const P = this.P, R = P.rBand;
    const px = R.x + s * PX, py = R.y + (z + P.hw) * PX;
    let ry = front ? -1 : 1;
    if (opts.mirror) ry = -ry;
    for (const [g, c] of [[this.cc, col], [this.oc, opts.orm || 'rgb(0,90,0)']]) {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
      g.setTransform(0, ry, -up, 0, px, py);
      g.font = `${opts.weight || 700} ${Math.max(4, size * PX)}px ${opts.font || 'Arial, Helvetica, sans-serif'}`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = c;
      if (opts.maxW) g.fillText(str, 0, 0, opts.maxW * PX); else g.fillText(str, 0, 0);
      g.restore();
    }
  }
}

// ------------------------------------------------------------- vehicle specs
const CARS = {
  sedan: {
    L: 0.23, hw: 0.093, hwc: 0.078, wr: 0.043, ar: 0.053, xf: 0.145, xr: -0.14, belt: 0.101, mx: 0.07,
    seams: [0.088, -0.03, -0.142], handles: [0.0, -0.105], bp: -0.03,
    cp: [[-0.172, 0.09], [-0.101, 0.17], [-0.078, 0.17], [-0.118, 0.09]], roofX: -0.043, roofY: 0.159,
    lo: [
      [-0.224, 0.034, 0.012, 'under'],
      { arch: [-0.14, 0.043, 0.053], yb: 0.034 },
      { arch: [0.145, 0.043, 0.053], yb: 0.034 },
      [0.226, 0.034, 0.012, 'fbump'], [0.234, 0.06, 0.012, 'front'], [0.226, 0.086, 0.02, 'hood'],
      [0.07, 0.101, 0.03, 'shoulder'], [-0.15, 0.103, 0.025, 'trunk'], [-0.228, 0.096, 0.016, 'back'], [-0.232, 0.062, 0.012, 'rbump'],
    ],
    cab: [[-0.165, 0.094, 0, 'cbase'], [0.088, 0.094, 0, 'wind'], [0.012, 0.158, 0.022, 'roof'], [-0.098, 0.16, 0.026, 'rglass']],
  },
  hatch: {
    L: 0.204, hw: 0.09, hwc: 0.076, wr: 0.042, ar: 0.052, xf: 0.128, xr: -0.122, belt: 0.102, mx: 0.055,
    seams: [0.07, -0.045, -0.13], handles: [-0.015, -0.112], bp: -0.045,
    cp: [[-0.2, 0.09], [-0.172, 0.17], [-0.138, 0.17], [-0.152, 0.09]], roofX: -0.08, roofY: 0.157,
    lo: [
      [-0.198, 0.034, 0.012, 'under'],
      { arch: [-0.122, 0.042, 0.052], yb: 0.034 },
      { arch: [0.128, 0.042, 0.052], yb: 0.034 },
      [0.2, 0.034, 0.012, 'fbump'], [0.207, 0.06, 0.012, 'front'], [0.198, 0.088, 0.022, 'hood'],
      [0.058, 0.102, 0.03, 'shoulder'], [-0.178, 0.104, 0.012, 'trunk'], [-0.2, 0.1, 0.014, 'back'], [-0.205, 0.06, 0.012, 'rbump'],
    ],
    cab: [[-0.192, 0.094, 0, 'cbase'], [0.072, 0.094, 0, 'wind'], [0.0, 0.156, 0.022, 'roof'], [-0.168, 0.157, 0.02, 'rglass']],
  },
  kombi: {
    L: 0.234, hw: 0.093, hwc: 0.078, wr: 0.043, ar: 0.053, xf: 0.148, xr: -0.142, belt: 0.101, mx: 0.073,
    seams: [0.09, -0.035, -0.145], handles: [0.0, -0.11], bp: -0.035, cpx: -0.135,
    cp: [[-0.24, 0.09], [-0.212, 0.17], [-0.188, 0.17], [-0.203, 0.09]], roofX: -0.06, roofY: 0.157,
    lo: [
      [-0.228, 0.034, 0.012, 'under'],
      { arch: [-0.142, 0.043, 0.053], yb: 0.034 },
      { arch: [0.148, 0.043, 0.053], yb: 0.034 },
      [0.23, 0.034, 0.012, 'fbump'], [0.238, 0.06, 0.012, 'front'], [0.23, 0.086, 0.02, 'hood'],
      [0.075, 0.101, 0.03, 'shoulder'], [-0.2, 0.104, 0.014, 'trunk'], [-0.232, 0.1, 0.014, 'back'], [-0.236, 0.062, 0.012, 'rbump'],
    ],
    cab: [[-0.226, 0.094, 0, 'cbase'], [0.092, 0.094, 0, 'wind'], [0.015, 0.157, 0.022, 'roof'], [-0.205, 0.156, 0.018, 'rglass']],
  },
};

const VAN = {
  hw: 0.1, wr: 0.045, ar: 0.056, xf: 0.19, xr: -0.175,
  prof: [
    [-0.286, 0.036, 0.012, 'under'],
    { arch: [-0.175, 0.045, 0.056], yb: 0.036 },
    { arch: [0.19, 0.045, 0.056], yb: 0.036 },
    [0.284, 0.036, 0.012, 'fbump'], [0.292, 0.072, 0.014, 'front'], [0.276, 0.118, 0.03, 'hood'],
    [0.192, 0.14, 0.018, 'wind'], [0.09, 0.248, 0.035, 'roof'], [-0.28, 0.252, 0.03, 'back'], [-0.29, 0.06, 0.012, 'rbump'],
  ],
};
const BOX = {
  hw: 0.104, wr: 0.046, ar: 0.057, xf: 0.2, xr: -0.175,
  prof: [
    [-0.296, 0.036, 0.012, 'under'],
    { arch: [-0.175, 0.046, 0.057], yb: 0.036 },
    { arch: [0.2, 0.046, 0.057], yb: 0.036 },
    [0.294, 0.036, 0.012, 'fbump'], [0.302, 0.072, 0.014, 'front'], [0.286, 0.118, 0.03, 'hood'],
    [0.2, 0.14, 0.018, 'wind'], [0.112, 0.24, 0.012, 'cabroof'], [0.07, 0.245, 0.006, 'boxfront'],
    [0.064, 0.31, 0.03, 'roof'], [-0.296, 0.31, 0.03, 'back'], [-0.3, 0.06, 0.012, 'rbump'],
  ],
};
const BUS = {
  hw: 0.118, wr: 0.05, ar: 0.063, xf: 0.33, xr: -0.25,
  prof: [
    [-0.515, 0.04, 0.02, 'under'],
    { arch: [-0.25, 0.05, 0.063], yb: 0.04 },
    { arch: [0.33, 0.05, 0.063], yb: 0.04 },
    [0.515, 0.04, 0.02, 'fbump'], [0.524, 0.085, 0.015, 'front'], [0.516, 0.3, 0.045, 'roof'],
    [-0.51, 0.305, 0.045, 'back'], [-0.52, 0.075, 0.015, 'rbump'],
  ],
};
// cab-over truck cab in local coordinates (rear wall at x = 0)
const CAB = {
  hw: 0.112, off: 0.253, wr: 0.05,
  prof: [
    [0, 0.045, 0, 'under'],
    { arch: [0.115, 0.05, 0.064], yb: 0.045 },
    [0.215, 0.045, 0.01, 'fbump'], [0.222, 0.105, 0.012, 'front'], [0.218, 0.168, 0.012, 'wind'],
    [0.204, 0.302, 0.03, 'roof'], [0.0, 0.308, 0.012, 'cabback'],
  ],
};
const FIREBODY = {
  hw: 0.112,
  prof: [
    [-0.465, 0.06, 0.012, 'under'],
    { arch: [-0.25, 0.05, 0.064], yb: 0.06 },
    [0.245, 0.06, 0, 'bfront'], [0.245, 0.31, 0, 'roof'], [-0.46, 0.31, 0.02, 'back'], [-0.468, 0.075, 0.012, 'rbump'],
  ],
};
const GARBBODY = {
  hw: 0.11,
  prof: [
    [-0.37, 0.065, 0, 'under'],
    { arch: [-0.29, 0.05, 0.064], yb: 0.065 },
    { arch: [-0.16, 0.05, 0.064], yb: 0.065 },
    [0.245, 0.065, 0, 'bfront'], [0.245, 0.29, 0.03, 'roof'], [-0.37, 0.3, 0, 'back'],
  ],
};
const GARBTAIL = {
  hw: 0.116,
  prof: [
    [-0.478, 0.07, 0.01, 'under'], [-0.36, 0.07, 0, 'tfront'], [-0.36, 0.312, 0.05, 'roof'],
    [-0.452, 0.3, 0.06, 'back'], [-0.484, 0.15, 0.02, 'hopper'],
  ],
};
const TRUCKBOX = {
  hw: 0.114,
  prof: [[-0.475, 0.1, 0.008, 'under'], [0.235, 0.1, 0, 'bfront'], [0.235, 0.35, 0.012, 'roof'], [-0.475, 0.35, 0.012, 'back']],
};

// ------------------------------------------------------------ art: cars
function carLoSide(C, opt = {}) {
  return (d, P) => {
    const L = C.L;
    d.all(BODY);
    d.shade(0.03, C.belt + 0.004);
    if (opt.police) {
      d.poly([[P.x0, 0.02], [P.x1, 0.02], [P.x1, 0.07], [L - 0.06, 0.079], [P.x0, 0.081]], '#1d4fa6', 0, 0.3, 0.15);
      d.poly([[P.x0, 0.081], [L - 0.06, 0.079], [P.x1, 0.07], [P.x1, 0.074], [L - 0.06, 0.083], [P.x0, 0.085]], '#c9ced4', 0, 0.25, 0.7);
      d.text('POLIZEI', -0.025, 0.058, 0.027, '#ffffff', { maxW: 0.2 });
    }
    d.line(P.x0, C.belt - 0.012, P.x1, C.belt - 0.01, 0.0025, 'rgba(255,255,255,0.35)');
    d.line(P.x0, C.belt - 0.0155, P.x1, C.belt - 0.0135, 0.0015, 'rgba(0,0,0,0.2)');
    d.rect(C.xr + 0.04, 0.02, C.xf - 0.04, 0.043, '#1f2023', 0, 0.6, 0);
    d.rect(L - 0.06, 0.02, P.x1, 0.045, '#1f2023', 0, 0.6, 0);
    d.rect(P.x0, 0.02, -L + 0.055, 0.046, '#1f2023', 0, 0.6, 0);
    d.arches([[C.xf, C.wr], [C.xr, C.wr]], C.ar);
    for (const x of C.seams) d.line(x, 0.046, x, C.belt + 0.002, 0.0018, 'rgba(0,0,0,0.5)');
    for (const x of C.handles) d.rr(x - 0.012, C.belt - 0.019, x + 0.01, C.belt - 0.0125, 0.002, '#d3d7db', 0, 0.2, 0.9);
    d.rr(L - 0.036, 0.066, P.x1, 0.084, 0.006, '#e6ebee', 0, 0.08, 0.7);
    d.rr(P.x0, 0.07, -L + 0.03, 0.09, 0.005, '#b01d16', 0, 0.2, 0.1);
    d.rr(L - 0.072, 0.07, L - 0.06, 0.075, 0.002, '#f0a020', 0, 0.3, 0);
  };
}
function carLoBand(C, opt = {}) {
  return (o, x, y, z, tag, I) => {
    const hw = I.hw, az = Math.abs(z);
    if (tag === 'under' || tag === 'arch') return under(o);
    o.P(BODY);
    const front = tag === 'front' || tag === 'fbump', back = tag === 'back' || tag === 'rbump';
    if (front || back) {
      if (y < 0.045) { o.set('#1d1e21', 0, 0.6, 0); if (front && az < hw * 0.6 && y > 0.036) o.set('#0d0e10', 0, 0.7, 0); return o; }
      const p0 = front ? 0.047 : 0.05;
      if (az < 0.028 && y > p0 && y < p0 + 0.012) return plate(o, z / 0.028, (y - p0) / 0.012, front);
      if (front) {
        if (y > 0.064 && y < 0.083 && az > hw - 0.05 && az < hw - 0.007) return headlamp(o, (az - hw + 0.05) / 0.043, (y - 0.064) / 0.019);
        if (y > 0.061 && y < 0.081 && az < 0.044) {
          o.set(fract(y * 420) < 0.5 ? '#141518' : '#33363b', 0, 0.45, 0.3);
          if (az > 0.039 || y > 0.0775 || y < 0.0645) o.set('#cfd4d8', 0, 0.2, 0.9);
          return o;
        }
      } else {
        if (y > 0.068 && y < 0.09 && az > hw - 0.047 && az < hw - 0.006) return taillamp(o, (az - hw + 0.047) / 0.041, (y - 0.068) / 0.022);
        if (Math.abs(y - 0.065) < 0.001 && az < hw - 0.05) o.mul(0.7);
      }
      if (opt.police && y < 0.07) o.set('#1d4fa6', 0, 0.3, 0.15);
      return o;
    }
    o.mul(1 - 0.07 * (az / hw) * (az / hw));
    if (tag === 'hood' && Math.abs(az - hw * 0.5) < 0.0012) o.mul(0.88);
    if (tag === 'hood' && I.iu > 0.94) o.set('#18191b', 0, 0.6, 0);
    return o;
  };
}
function carCabSide(C) {
  return (d, P) => {
    d.all(BODY);
    d.glass(offsetPts(P.pts, 0.0075));
    d.rect(P.x0, P.y0, P.x1, C.belt + 0.003, BODY);
    d.rect(P.x0, C.belt + 0.0005, P.x1, C.belt + 0.0042, '#cfd4d9', 0, 0.2, 0.9);
    d.rect(C.bp - 0.0065, C.belt, C.bp + 0.0065, 0.2, '#15161a', 0, 0.4, 0.1);
    if (C.cpx) d.rect(C.cpx - 0.005, C.belt, C.cpx + 0.005, 0.2, '#15161a', 0, 0.4, 0.1);
    d.poly(C.cp, BODY);
  };
}
function cabBandGlass(o, x, y, z, tag, I) {
  const az = Math.abs(z), e = I.hw - 0.011;
  if (tag === 'cbase') return under(o);
  if (tag === 'wind' || tag === 'rglass') {
    if (az > e) return o.P(BODY);
    if (tag === 'wind' && I.iu < 0.05) return o.set('#141518', 0, 0.6, 0);
    glassPx(o, I.iu, (z + e) / (2 * e));
    return o;
  }
  o.P(BODY);
  return o.mul(1 - 0.08 * (az / I.hw) * (az / I.hw));
}

// ------------------------------------------------------------ art: vans
function vanSide(opt = {}) {
  return (d, P) => {
    d.all(BODY);
    d.shade(0.03, 0.25, 0.16);
    d.rect(P.x0, 0.02, P.x1, 0.05, '#232427', 0, 0.6, 0);
    d.rect(VAN.xr + 0.06, 0.062, VAN.xf - 0.06, 0.072, '#2a2b2e', 0, 0.6, 0);
    d.arches([[VAN.xf, VAN.wr], [VAN.xr, VAN.wr]], VAN.ar);
    if (opt.post) {
      d.rect(P.x0, 0.074, P.x1, 0.08, '#1a1a1a', 0, 0.4, 0);
      d.text('Post', -0.07, 0.16, 0.052, '#1a1a1a', { maxW: 0.22 });
      d.ov((g) => { g.strokeStyle = '#1a1a1a'; g.lineWidth = 0.006; g.beginPath(); g.arc(-0.2, 0.165, 0.022, 0, Math.PI * 2); g.stroke(); });
      d.circ(-0.2, 0.165, 0.008, '#1a1a1a', 0, 0.4, 0);
    }
    d.glass([[0.168, 0.15], [0.1, 0.232], [0.014, 0.232], [0.014, 0.15]]);
    d.line(0.175, 0.05, 0.175, 0.145, 0.0018, 'rgba(0,0,0,0.5)');
    d.line(0.008, 0.05, 0.008, 0.246, 0.0018, 'rgba(0,0,0,0.5)');
    d.line(-0.16, 0.05, -0.16, 0.246, 0.0018, 'rgba(0,0,0,0.5)');
    d.line(-0.16, 0.205, -0.272, 0.205, 0.003, 'rgba(0,0,0,0.35)');
    d.line(-0.272, 0.05, -0.272, 0.246, 0.0018, 'rgba(0,0,0,0.5)');
    for (const x of [0.03, -0.14]) d.rr(x - 0.012, 0.132, x + 0.01, 0.139, 0.002, '#26282b', 0, 0.5, 0);
    d.rr(0.255, 0.086, P.x1, 0.11, 0.008, '#e6ebee', 0, 0.08, 0.7);
    d.rr(P.x0, 0.09, -0.277, 0.19, 0.004, '#b01d16', 0, 0.2, 0.1);
  };
}
function vanFront(o, y, z, I, x) {
  const hw = I.hw, az = Math.abs(z);
  if (y < 0.06) {
    o.set('#202124', 0, 0.6, 0);
    if (az < 0.028 && y > 0.046 && y < 0.058) plate(o, z / 0.028, (y - 0.046) / 0.012, true);
    return o;
  }
  if (y > 0.082 && y < 0.11 && az > hw - 0.045 && az < hw - 0.008) return headlamp(o, (az - hw + 0.045) / 0.037, (y - 0.082) / 0.028);
  if (y > 0.07 && y < 0.108 && az < hw - 0.05) {
    o.set(fract(y * 300) < 0.5 ? '#141518' : '#2e3135', 0, 0.45, 0.2);
    if (az < 0.012 && Math.abs(y - 0.089) < 0.007) o.set('#cfd4d8', 0, 0.2, 0.9);
    return o;
  }
  return o.P(BODY);
}
function vanBack(o, y, z, I, opt = {}) {
  const hw = I.hw, az = Math.abs(z);
  if (y < 0.06) {
    o.set('#202124', 0, 0.6, 0);
    if (opt.step && az < hw - 0.03 && y > 0.045) o.set('#8f959b', 0, 0.4, 0.6);
    return o;
  }
  if (az < 0.028 && y > 0.064 && y < 0.076) return plate(o, z / 0.028, (y - 0.064) / 0.012, false);
  if (az > hw - 0.017 && y > 0.09 && y < (opt.tallLamps ? 0.25 : 0.19)) return taillamp(o, (az - hw + 0.017) / 0.017, (y - 0.09) / 0.1);
  o.P(BODY);
  if (az < 0.0012 && !opt.noSeam) o.set('#2a2b2e', 0, 0.5, 0);
  return o;
}
function vanBand(opt = {}) {
  return (o, x, y, z, tag, I) => {
    const hw = I.hw, az = Math.abs(z);
    if (tag === 'under' || tag === 'arch') return under(o);
    if (tag === 'front' || tag === 'fbump') return vanFront(o, y, z, I, x);
    if (tag === 'back' || tag === 'rbump') {
      vanBack(o, y, z, I);
      if (y > 0.155 && y < 0.228 && az > 0.012 && az < hw - 0.02) glassPx(o, (az - 0.012) / (hw - 0.032), (y - 0.155) / 0.073);
      return o;
    }
    if (tag === 'wind') {
      if (az > hw - 0.012) return o.P(BODY);
      if (I.iu < 0.07) return o.set('#141518', 0, 0.6, 0);
      return glassPx(o, I.iu, (z + hw) / (2 * hw));
    }
    o.P(BODY).mul(1 - 0.07 * (az / hw) * (az / hw));
    if (tag === 'roof' && fract(x * 28) < 0.1 && az < hw - 0.02) o.mul(0.9);
    return o;
  };
}

function boxSide(kind) {
  return (d, P) => {
    d.all(BODY);
    d.shade(0.03, 0.3, 0.14);
    d.rect(P.x0, 0.02, P.x1, 0.05, '#232427', 0, 0.6, 0);
    d.arches([[BOX.xf, BOX.wr], [BOX.xr, BOX.wr]], BOX.ar);
    d.glass([[0.178, 0.15], [0.114, 0.228], [0.026, 0.228], [0.026, 0.15]]);
    d.line(0.185, 0.05, 0.185, 0.145, 0.0018, 'rgba(0,0,0,0.5)');
    d.line(0.02, 0.05, 0.02, 0.24, 0.0018, 'rgba(0,0,0,0.5)');
    d.rr(0.026, 0.132, 0.048, 0.139, 0.002, '#26282b', 0, 0.5, 0);
    d.rr(0.265, 0.086, P.x1, 0.11, 0.008, '#e6ebee', 0, 0.08, 0.7);
    if (kind === 'amb') {
      d.rect(P.x0, 0.1, P.x1, 0.124, '#d21c1c', 0, 0.3, 0.1);
      d.rect(P.x0, 0.131, P.x1, 0.137, '#d21c1c', 0, 0.3, 0.1);
      d.rr(-0.055, 0.18, 0.0, 0.25, 0.006, '#d6dde2', 0, 0.12, 0.3);
      d.line(-0.03, 0.05, -0.03, 0.3, 0.0018, 'rgba(0,0,0,0.4)');
      d.line(-0.29, 0.05, -0.29, 0.305, 0.0018, 'rgba(0,0,0,0.4)');
      const cx = -0.165, cy = 0.215;
      d.rect(cx - 0.037, cy - 0.037, cx + 0.037, cy + 0.037, '#ffffff', 0, 0.3, 0);
      d.rect(cx - 0.011, cy - 0.032, cx + 0.011, cy + 0.032, '#d21c1c', 0, 0.3, 0);
      d.rect(cx - 0.032, cy - 0.011, cx + 0.032, cy + 0.011, '#d21c1c', 0, 0.3, 0);
      d.text('RETTUNGSDIENST', -0.13, 0.158, 0.019, '#d21c1c', { maxW: 0.3 });
      d.rr(P.x0, 0.19, -0.284, 0.28, 0.004, '#b01d16', 0, 0.2, 0.1);
    } else {
      d.rect(P.x0, 0.07, 0.07, 0.31, '#f2f3f1', 0, 0.4, 0.05);
      for (let x = -0.24; x < 0.07; x += 0.065) d.line(x, 0.075, x, 0.31, 0.0015, 'rgba(0,0,0,0.1)');
      d.rect(P.x0, 0.06, 0.07, 0.078, '#8e949a', 0, 0.4, 0.6);
      d.poly([[P.x0, 0.082], [0.07, 0.082], [0.07, 0.1], [-0.05, 0.118], [P.x0, 0.112]], '#1f5aa6', 0, 0.35, 0.05);
      d.text('UMZÜGE', -0.115, 0.215, 0.05, '#1f5aa6', { maxW: 0.33, weight: 800 });
      d.text('Lindenau · schnell & sicher', -0.115, 0.165, 0.017, '#4a5560', { maxW: 0.33, weight: 600 });
      d.line(0.07, 0.06, 0.07, 0.31, 0.003, 'rgba(0,0,0,0.35)');
      d.rr(P.x0, 0.09, -0.288, 0.15, 0.004, '#b01d16', 0, 0.2, 0.1);
    }
  };
}
function boxBand(kind) {
  return (o, x, y, z, tag, I) => {
    const hw = I.hw, az = Math.abs(z);
    if (tag === 'under' || tag === 'arch') return under(o);
    if (tag === 'front' || tag === 'fbump') return vanFront(o, y, z, I, x);
    if (tag === 'wind') {
      if (az > hw - 0.012) return o.P(BODY);
      if (I.iu < 0.07) return o.set('#141518', 0, 0.6, 0);
      return glassPx(o, I.iu, (z + hw) / (2 * hw));
    }
    const boxPart = x < 0.075;
    if (tag === 'back' || tag === 'rbump') {
      vanBack(o, y, z, I, { step: true, tallLamps: kind === 'amb', noSeam: kind !== 'amb' });
      if (o.m === 1 && kind !== 'amb') {
        o.set('#eceeec', 0, 0.4, 0.1);
        if (fract(y * 95) < 0.16) o.mul(0.86);
        if (y < 0.085) o.set('#8e949a', 0, 0.4, 0.6);
      }
      if (kind === 'amb') {
        if (y > 0.19 && y < 0.265 && az > 0.01 && az < hw - 0.022) o.set('#d6dde2', 0, 0.12, 0.3);
        if (y > 0.068 && y < 0.15 && az < hw - 0.018) o.set(fract((z * 1.2 + y) * 16) < 0.5 ? '#d21c1c' : '#f4d21e', 0, 0.3, 0.05);
      }
      return o;
    }
    if (boxPart && kind !== 'amb') { o.set('#f2f3f1', 0, 0.4, 0.05); if (tag === 'roof' && fract(x * 15) < 0.06) o.mul(0.92); return o; }
    o.P(BODY).mul(1 - 0.07 * (az / hw) * (az / hw));
    if (kind === 'amb' && tag === 'roof' && az < 0.04 && ((x > -0.08 && x < -0.03) || (x > -0.22 && x < -0.18))) o.set('#c9ced3', 0, 0.4, 0.4);
    return o;
  };
}

// --------------------------------------------------------------- art: bus
function busSide(d, P) {
  d.all(BODY);
  d.shade(0.035, 0.31, 0.14);
  d.ov((g) => { g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(P.x0, 0.02, P.x1 - P.x0, 0.052); });
  d.rect(P.x0, 0.036, P.x1, 0.046, '#2a2b2e', 0, 0.6, 0);
  d.arches([[BUS.xf, BUS.wr], [BUS.xr, BUS.wr]], BUS.ar);
  d.rr(-0.5, 0.142, 0.505, 0.273, 0.012, '#121a21', 0, 0.06, 0.5);
  d.glass([[-0.49, 0.147], [0.4, 0.147], [0.4, 0.268], [-0.49, 0.268]]);
  for (let x = -0.4; x < 0.36; x += 0.13) d.rect(x, 0.145, x + 0.009, 0.27, '#0f1418', 0, 0.3, 0.3);
  for (const [a, b] of [[0.395, 0.49], [-0.025, 0.085]]) {
    d.rr(a, 0.052, b, 0.274, 0.006, '#101418', 0, 0.3, 0.2);
    d.glass([[a + 0.006, 0.06], [(a + b) / 2 - 0.002, 0.06], [(a + b) / 2 - 0.002, 0.268], [a + 0.006, 0.268]]);
    d.glass([[(a + b) / 2 + 0.002, 0.06], [b - 0.006, 0.06], [b - 0.006, 0.268], [(a + b) / 2 + 0.002, 0.268]]);
  }
  d.rr(0.25, 0.242, 0.37, 0.264, 0.003, '#0b0b0c', 0, 0.4, 0);
  d.text('4  Markt', 0.31, 0.253, 0.016, '#ffb22e', { maxW: 0.11, orm: 'rgb(0,60,0)' });
  d.text('Stadtbus Lindenau', -0.17, 0.105, 0.03, '#2b5c8f', { maxW: 0.38 });
  d.rr(0.5, 0.068, P.x1, 0.095, 0.006, '#e6ebee', 0, 0.08, 0.7);
  d.rr(P.x0, 0.09, -0.505, 0.16, 0.004, '#b01d16', 0, 0.2, 0.1);
  d.line(P.x0, 0.29, P.x1, 0.29, 0.002, 'rgba(0,0,0,0.15)');
}
function busBand(o, x, y, z, tag, I) {
  const hw = I.hw, az = Math.abs(z);
  if (tag === 'under' || tag === 'arch') return under(o);
  if (tag === 'front' || tag === 'fbump') {
    if (y < 0.062) {
      o.set('#202124', 0, 0.6, 0);
      if (az < 0.03 && y > 0.046 && y < 0.059) plate(o, z / 0.03, (y - 0.046) / 0.013, true);
      return o;
    }
    if (y > 0.064 && y < 0.084 && az > hw - 0.05 && az < hw - 0.008) return headlamp(o, (az - hw + 0.05) / 0.042, (y - 0.064) / 0.02);
    if (y > 0.268 && y < 0.293 && az < hw - 0.018) return o.set('#0b0b0c', 0, 0.4, 0);
    if (y > 0.112 && y < 0.266 && az < hw - 0.009) {
      if (az < 0.0025) return o.set('#111417', 0, 0.4, 0);
      return glassPx(o, (y - 0.112) / 0.154, (z + hw) / (2 * hw));
    }
    o.P(BODY);
    if (y > 0.09 && y < 0.104 && az < 0.04) o.set('#2b2d31', 0, 0.4, 0.3);
    return o;
  }
  if (tag === 'back' || tag === 'rbump') {
    if (y < 0.07) return o.set('#202124', 0, 0.6, 0);
    if (az < 0.03 && y > 0.074 && y < 0.087) return plate(o, z / 0.03, (y - 0.074) / 0.013, false);
    if (az > hw - 0.026 && y > 0.09 && y < 0.165) return taillamp(o, (az - hw + 0.026) / 0.026, (y - 0.09) / 0.075);
    if (y > 0.19 && y < 0.278 && az < hw - 0.022) return glassPx(o, (y - 0.19) / 0.088, (z + hw) / (2 * hw));
    if (y > 0.1 && y < 0.17 && az < hw - 0.035) return o.set(fract(y * 160) < 0.45 ? '#1b1c1f' : '#3a3d42', 0, 0.5, 0.3);
    return o.P(BODY);
  }
  o.P(BODY).mul(1 - 0.06 * (az / hw) * (az / hw));
  if (tag === 'roof') o.mix('#ffffff', 0.12);
  return o;
}
function busBandDraw(bd) {
  bd.faceText('front', '4  Markt', 0.2805, 0, 0.017, '#ffb22e', true, { maxW: 0.19, orm: 'rgb(0,60,0)' });
}

// ----------------------------------------------------------- art: trucks
function cabSide(kind) {
  return (d, P) => {
    d.all(BODY);
    d.shade(0.045, 0.31, 0.12);
    if (kind === 'fire') {
      d.rect(P.x0, P.y0, P.x1, 0.108, '#ecedeb', 0, 0.35, 0.2);
      d.rect(P.x0, 0.112, P.x1, 0.125, '#f3d21b', 0, 0.3, 0.05);
      d.text('FEUERWEHR', 0.13, 0.162, 0.019, '#ffffff', { maxW: 0.12 });
    } else if (kind === 'garb') {
      d.rect(P.x0, P.y0, P.x1, 0.1, '#8d9196', 0, 0.45, 0.4);
      d.rect(P.x0, 0.105, P.x1, 0.112, '#f2f2ee', 0, 0.3, 0.05);
    } else {
      d.rect(P.x0, P.y0, P.x1, 0.07, '#3a3d42', 0, 0.5, 0.2);
    }
    d.arches([[0.115, 0.05]], 0.064);
    d.line(0.055, 0.118, 0.055, 0.3, 0.002, 'rgba(0,0,0,0.5)');
    d.line(0.192, 0.118, 0.199, 0.3, 0.002, 'rgba(0,0,0,0.5)');
    d.line(0.055, 0.118, 0.192, 0.118, 0.002, 'rgba(0,0,0,0.5)');
    d.glass([[0.068, 0.198], [0.19, 0.198], [0.198, 0.29], [0.068, 0.29]]);
    d.rr(0.07, 0.178, 0.094, 0.185, 0.002, '#26282b', 0, 0.5, 0);
    for (let y = 0.06; y < 0.11; y += 0.022) d.rect(0.008, y, 0.048, y + 0.008, '#1f2023', 0, 0.6, 0.2);
    d.rr(0.2, 0.062, P.x1, 0.086, 0.006, '#e6ebee', 0, 0.08, 0.7);
  };
}
function cabBand(kind) {
  return (o, x, y, z, tag, I) => {
    const hw = I.hw, az = Math.abs(z);
    if (tag === 'under' || tag === 'arch') return under(o);
    if (tag === 'fbump') {
      if (kind === 'fire') o.set('#ecedeb', 0, 0.35, 0.2);
      else if (kind === 'garb') o.set('#8d9196', 0, 0.45, 0.4);
      else o.set('#3a3d42', 0, 0.5, 0.2);
      if (y < 0.052) return o.set('#202124', 0, 0.6, 0);
      if (az < 0.03 && y > 0.054 && y < 0.067) return plate(o, z / 0.03, (y - 0.054) / 0.013, true);
      if (y > 0.062 && y < 0.088 && az > hw - 0.05 && az < hw - 0.01) return headlamp(o, (az - hw + 0.05) / 0.04, (y - 0.062) / 0.026);
      if (kind === 'fire' && y > 0.09) o.set('#f3d21b', 0, 0.3, 0.05);
      return o;
    }
    if (tag === 'front') {
      o.P(BODY);
      if (kind !== 'fire' && y > 0.112 && y < 0.163 && az < hw - 0.03) o.set(fract(y * 190) < 0.5 ? '#16171a' : '#3a3d42', 0, 0.45, 0.3);
      return o;
    }
    if (tag === 'wind') {
      if (az > hw - 0.011) return o.P(BODY);
      if (I.iu < 0.04) return o.set('#16171a', 0, 0.6, 0);
      if (I.iu > 0.93) return o.set('#1d1f22', 0, 0.5, 0.1);
      glassPx(o, I.iu, (z + hw) / (2 * hw));
      if (I.iu < 0.2 && Math.abs(az - 0.04) < 0.0015 + I.iu * 0.01 && I.iu > 0.05) o.set('#111', 0, 0.5, 0);
      return o;
    }
    o.P(BODY).mul(1 - 0.07 * (az / hw) * (az / hw));
    if (tag === 'cabback') o.mul(0.8);
    return o;
  };
}
function fireCabDraw(bd) { bd.faceText('front', 'FEUERWEHR', 0.138, 0, 0.026, '#ffffff', true, { maxW: 0.17 }); }

function shutter(d, x0, y0, x1, y1) {
  d.rect(x0, y0, x1, y1, '#c4c9ce', 0, 0.35, 0.75);
  d.ov((g) => {
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 0.0016;
    for (let y = y0 + 0.008; y < y1; y += 0.009) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.001;
    for (let y = y0 + 0.0095; y < y1; y += 0.009) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
  });
  d.rect(x0, y0, x1, y0 + 0.009, '#6f757b', 0, 0.4, 0.6);
}
function fireBodySide(d, P) {
  d.all(BODY);
  d.shade(0.06, 0.31, 0.1);
  d.rect(P.x0, P.y0, P.x1, 0.1, '#ecedeb', 0, 0.35, 0.2);
  d.rect(P.x0, 0.084, P.x1, 0.095, '#f3d21b', 0, 0.3, 0.05);
  for (const [a, b, y0] of [[0.018, 0.232, 0.104], [-0.178, 0.004, 0.104], [-0.308, -0.192, 0.128], [-0.452, -0.322, 0.104]]) shutter(d, a, y0, b, 0.278);
  d.text('FEUERWEHR', -0.11, 0.295, 0.022, '#ffffff', { maxW: 0.3 });
  d.text('112', 0.17, 0.295, 0.02, '#ffffff');
  d.rr(P.x0, 0.075, -0.452, 0.1, 0.003, '#b01d16', 0, 0.2, 0.1);
}
function fireBodyBand(o, x, y, z, tag, I) {
  const hw = I.hw, az = Math.abs(z);
  if (tag === 'under' || tag === 'arch') return under(o);
  if (tag === 'roof') {
    o.set('#aeb3b8', 0, 0.45, 0.7);
    if (fract((x + z) * 90) < 0.12 || fract((x - z) * 90) < 0.12) o.mul(0.82);
    if (az > hw - 0.012) o.P(BODY);
    return o;
  }
  if (tag === 'back' || tag === 'rbump') {
    o.P(BODY);
    if (y < 0.075) return o.set('#202124', 0, 0.6, 0);
    if (y < 0.1) {
      o.set(fract((z + y) * 22) < 0.5 ? '#d21c1c' : '#f2f2ee', 0, 0.3, 0.05);
      if (az > hw - 0.03) taillamp(o, (az - hw + 0.03) / 0.03, (y - 0.075) / 0.025);
      return o;
    }
    if (y > 0.104 && y < 0.278 && az < hw - 0.022) {
      o.set('#c4c9ce', 0, 0.35, 0.75);
      if (fract(y * 111) < 0.18) o.mul(0.78);
      if (y < 0.113) o.set('#6f757b', 0, 0.4, 0.6);
    }
    return o;
  }
  return o.P(BODY);
}

function garbBodySide(d, P) {
  d.all(BODY);
  d.shade(0.065, 0.3, 0.1);
  d.ov((g) => {
    for (let x = -0.35; x < 0.24; x += 0.06) {
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 0.085, 0.007, 0.19);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 0.007, 0.085, 0.002, 0.19);
    }
  });
  d.rect(P.x0, P.y0, P.x1, 0.083, '#6d7176', 0, 0.45, 0.5);
  d.rect(P.x0, 0.277, P.x1, 0.284, '#d65f10', 0, 0.35, 0.2);
  d.text('Stadtreinigung Lindenau', -0.04, 0.2, 0.024, '#ffffff', { maxW: 0.4 });
  d.ov((g) => { g.fillStyle = '#ffffff'; g.fillRect(-0.24, 0.17, 0.4, 0.003); });
  d.arches([[-0.29, 0.05], [-0.16, 0.05]], 0.064);
}
function garbBodyBand(o, x, y, z, tag, I) {
  const hw = I.hw, az = Math.abs(z);
  if (tag === 'under' || tag === 'arch') return under(o);
  o.P(BODY).mul(1 - 0.06 * (az / hw) * (az / hw));
  if (tag === 'roof' && fract(x * 16.6) < 0.12) o.mul(0.82);
  return o;
}
function garbTailSide(d, P) {
  d.all(BODY);
  d.shade(0.07, 0.31, 0.12);
  d.poly([[-0.49, 0.06], [-0.43, 0.06], [-0.445, 0.165], [-0.49, 0.165]], '#1c1c1e', 0, 0.6, 0);
  d.line(-0.365, 0.12, -0.425, 0.272, 0.009, '#9aa0a6');
  d.line(-0.365, 0.12, -0.425, 0.272, 0.003, '#e5e8eb');
  d.line(-0.362, 0.07, -0.362, 0.31, 0.003, 'rgba(0,0,0,0.5)');
  d.rr(-0.47, 0.18, -0.455, 0.25, 0.003, '#b01d16', 0, 0.2, 0.1);
}
function garbTailBand(o, x, y, z, tag, I) {
  const hw = I.hw, az = Math.abs(z);
  if (tag === 'under' || tag === 'tfront') return under(o);
  if (tag === 'hopper') {
    if (az > hw - 0.014) return o.P(BODY);
    o.set('#18191b', 0, 0.7, 0);
    if (I.iu > 0.86) o.set('#9aa0a6', 0, 0.35, 0.7);
    if (I.iu < 0.12) o.set('#4a4e53', 0, 0.5, 0.4);
    return o;
  }
  o.P(BODY).mul(1 - 0.06 * (az / hw) * (az / hw));
  if (tag === 'back') {
    if (az > hw - 0.028 && I.iu > 0.25) o.set(fract((y + az) * 26) < 0.5 ? '#d21c1c' : '#f2f2ee', 0, 0.3, 0.05);
    if (az > hw - 0.028 && I.iu > 0.55 && I.iu < 0.75) taillamp(o, 0.5, (I.iu - 0.55) / 0.2);
  }
  return o;
}

function truckBoxSide(d, P) {
  d.all('#f1f2f0', 0, 0.4, 0.05);
  d.shade(0.1, 0.35, 0.08);
  for (let x = -0.4; x < 0.23; x += 0.1) d.line(x, 0.11, x, 0.34, 0.0015, 'rgba(0,0,0,0.12)');
  d.rect(P.x0, 0.335, P.x1, P.y1, '#c3c7cc', 0, 0.3, 0.8);
  d.rect(P.x0, P.y0, P.x1, 0.115, '#9da2a8', 0, 0.35, 0.7);
  d.rect(P.x0, 0.135, P.x1, 0.152, '#1f5aa6', 0, 0.35, 0.05);
  d.text('LINDENAU LOGISTIK', -0.12, 0.25, 0.042, '#1f5aa6', { maxW: 0.6, weight: 800 });
  d.text('Regional · Zuverlässig', -0.12, 0.2, 0.02, '#5a6570', { maxW: 0.5, weight: 600 });
}
function truckBoxBand(o, x, y, z, tag, I) {
  const hw = I.hw, az = Math.abs(z);
  if (tag === 'under') return under(o);
  o.set('#f1f2f0', 0, 0.4, 0.05);
  if (tag === 'roof') { if (fract(x * 12) < 0.05) o.mul(0.9); return o; }
  if (tag === 'back') {
    if (az < 0.0015) return o.set('#55595e', 0, 0.4, 0.4);
    if (y < 0.118) return o.set('#9da2a8', 0, 0.35, 0.7);
    if ((Math.abs(az - 0.03) < 0.003 || Math.abs(az - 0.085) < 0.003) && y > 0.12 && y < 0.33) return o.set('#8d9298', 0, 0.3, 0.8);
    if (az > hw - 0.006) return o.set('#c3c7cc', 0, 0.3, 0.8);
  }
  return o;
}

// ------------------------------------------------------- part registry
function reg(name, spec) { PARTS[name] = { name, ...spec }; }
for (const k in CARS) {
  const C = CARS[k];
  reg(`${k}_lo`, { prof: C.lo, hw: C.hw, bev: 0.012, side: carLoSide(C), band: carLoBand(C) });
  reg(`${k}_cab`, { prof: C.cab, hw: C.hwc, bev: 0.015, side: carCabSide(C), band: cabBandGlass });
}
reg('sedan_lo_pol', { prof: CARS.sedan.lo, hw: CARS.sedan.hw, bev: 0.012, side: carLoSide(CARS.sedan, { police: true }), band: carLoBand(CARS.sedan, { police: true }) });
reg('van', { prof: VAN.prof, hw: VAN.hw, bev: 0.016, side: vanSide(), band: vanBand() });
reg('van_post', { prof: VAN.prof, hw: VAN.hw, bev: 0.016, side: vanSide({ post: true }), band: vanBand() });
reg('amb', { prof: BOX.prof, hw: BOX.hw, bev: 0.018, side: boxSide('amb'), band: boxBand('amb'), draw: (bd) => bd.faceText('boxfront', 'RETTUNGSDIENST', 0.277, 0, 0.018, '#d21c1c', true, { mirror: true, maxW: 0.17 }) });
reg('boxvan', { prof: BOX.prof, hw: BOX.hw, bev: 0.018, side: boxSide('move'), band: boxBand('move') });
reg('bus', { prof: BUS.prof, hw: BUS.hw, bev: 0.024, side: busSide, band: busBand, draw: busBandDraw });
reg('cab', { prof: CAB.prof, hw: CAB.hw, bev: 0.016, side: cabSide(''), band: cabBand('') });
reg('cab_fire', { prof: CAB.prof, hw: CAB.hw, bev: 0.016, side: cabSide('fire'), band: cabBand('fire'), draw: fireCabDraw });
reg('cab_garb', { prof: CAB.prof, hw: CAB.hw, bev: 0.016, side: cabSide('garb'), band: cabBand('garb') });
reg('fire_body', { prof: FIREBODY.prof, hw: FIREBODY.hw, bev: 0.012, side: fireBodySide, band: fireBodyBand });
reg('garb_body', { prof: GARBBODY.prof, hw: GARBBODY.hw, bev: 0.014, side: garbBodySide, band: garbBodyBand });
reg('garb_tail', { prof: GARBTAIL.prof, hw: GARBTAIL.hw, bev: 0.016, side: garbTailSide, band: garbTailBand });
reg('truck_box', { prof: TRUCKBOX.prof, hw: TRUCKBOX.hw, bev: 0.01, side: truckBoxSide, band: truckBoxBand });

// small pixel arts (wheels, taxi sign, colour swatches)
function orm(g, m, r, me) { g.fillStyle = ormStr(m, r, me); }
ARTS.rim_car = {
  w: 64, h: 64,
  draw(c, o) {
    for (const [g, isO] of [[c, 0], [o, 1]]) {
      g.beginPath(); g.arc(32, 32, 31.5, 0, 7); if (isO) orm(g, 0, 0.9, 0); else g.fillStyle = '#1c1c1f'; g.fill();
      g.beginPath(); g.arc(32, 32, 21, 0, 7); if (isO) orm(g, 0, 0.25, 0.85); else g.fillStyle = '#c3c8ce'; g.fill();
      for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 2 / 5 + Math.PI / 5;
        g.beginPath(); g.moveTo(32 + Math.cos(a - 0.36) * 7, 32 + Math.sin(a - 0.36) * 7);
        g.arc(32, 32, 18, a - 0.3, a + 0.3); g.lineTo(32 + Math.cos(a + 0.36) * 7, 32 + Math.sin(a + 0.36) * 7); g.closePath();
        if (isO) orm(g, 0, 0.6, 0.3); else g.fillStyle = '#2b2e33'; g.fill();
      }
      g.beginPath(); g.arc(32, 32, 5.5, 0, 7); if (isO) orm(g, 0, 0.3, 0.8); else g.fillStyle = '#8f959c'; g.fill();
    }
    c.strokeStyle = '#eef1f4'; c.lineWidth = 1.4; c.beginPath(); c.arc(32, 32, 20.3, 0, 7); c.stroke();
    c.strokeStyle = '#2c2c30'; c.lineWidth = 1; c.beginPath(); c.arc(32, 32, 27, 0, 7); c.stroke();
  },
};
ARTS.rim_truck = {
  w: 64, h: 64,
  draw(c, o) {
    for (const [g, isO] of [[c, 0], [o, 1]]) {
      g.beginPath(); g.arc(32, 32, 31.5, 0, 7); if (isO) orm(g, 0, 0.9, 0); else g.fillStyle = '#1c1c1f'; g.fill();
      g.beginPath(); g.arc(32, 32, 20, 0, 7); if (isO) orm(g, 0, 0.35, 0.75); else g.fillStyle = '#c7ccd1'; g.fill();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        g.beginPath(); g.arc(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 2.6, 0, 7); if (isO) orm(g, 0, 0.6, 0.3); else g.fillStyle = '#3a3e43'; g.fill();
      }
      g.beginPath(); g.arc(32, 32, 9, 0, 7); if (isO) orm(g, 0, 0.35, 0.7); else g.fillStyle = '#9aa0a6'; g.fill();
    }
    c.fillStyle = '#e1e5e9';
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.39; c.beginPath(); c.arc(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6, 1.3, 0, 7); c.fill(); }
  },
};
ARTS.taxisign = {
  w: 96, h: 32,
  draw(c, o) {
    c.fillStyle = '#f5c518'; c.fillRect(0, 0, 96, 32); orm(o, 0, 0.4, 0); o.fillRect(0, 0, 96, 32);
    c.fillStyle = '#121212'; c.font = '800 24px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('TAXI', 48, 17, 88);
  },
};
const SWATCHES = {
  body: [BODY.c, 1, BODY.r, BODY.me], white: ['#f3f4f3', 0, 0.3, 0.15], black: ['#1b1c1f', 0, 0.55, 0], tire: ['#1d1d20', 0, 0.92, 0],
  chrome: ['#dfe3e7', 0, 0.15, 0.95], alu: ['#b8bdc3', 0, 0.35, 0.75], steel: ['#7b8087', 0, 0.5, 0.6], dark: ['#33363b', 0, 0.6, 0.1],
  chassis: ['#2a2c30', 0, 0.7, 0.2], glass: ['#2a3a48', 0, 0.06, 0.6], red: ['#c41f17', 0, 0.32, 0.2], orange: ['#ef7b1a', 0, 0.32, 0.2],
  ladder: ['#d0d4d8', 0, 0.3, 0.8], taxi: ['#f5c518', 0, 0.4, 0], grey: ['#9ca1a7', 0, 0.5, 0.2], drumw: ['#eeeeea', 0, 0.35, 0.2],
  drumo: ['#e8662a', 0, 0.35, 0.2], hose: ['#cfd3d6', 0, 0.5, 0.1],
};
ARTS.pal = {
  w: 128, h: 32,
  draw(c, o) {
    let i = 0;
    for (const k in SWATCHES) {
      const [col, m, r, me] = SWATCHES[k];
      const x = (i % 16) * 8, y = Math.floor(i / 16) * 8;
      c.fillStyle = col; c.fillRect(x, y, 8, 8);
      orm(o, m, r, me); o.fillRect(x, y, 8, 8);
      SW[k] = [x + 4, y + 4];
      i++;
    }
  },
};

// ------------------------------------------------------------ atlas build
function pack(list, W) {
  list.sort((a, b) => b.h - a.h);
  const pad = 6;
  let x = 0, y = 0, rowH = 0;
  for (const r of list) {
    if (x + r.w + pad > W) { x = 0; y += rowH + pad; rowH = 0; }
    r.x = x + pad / 2; r.y = y + pad / 2; x += r.w + pad; rowH = Math.max(rowH, r.h);
  }
  return y + rowH + pad;
}

function paintBand(P, cc, oc) {
  const R = P.rBand, w = R.w, h = R.h;
  const ci = cc.getImageData(R.x, R.y, w, h), oi = oc.getImageData(R.x, R.y, w, h);
  const cd = ci.data, od = oi.data;
  const o = new Out();
  const I = { hw: P.hw, iu: 0, ilen: 0, s: 0, nx: 0, ny: 0 };
  let seg = 0;
  for (let px = 0; px < w; px++) {
    const s = Math.min(P.perim - 1e-6, (px + 0.5) / PX);
    while (seg < P.n - 1 && s > P.S[seg + 1]) seg++;
    const t = (s - P.S[seg]) / Math.max(1e-6, P.S[seg + 1] - P.S[seg]);
    const a = P.pts[seg], b = P.pts[(seg + 1) % P.n];
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    const rn = P.run[seg];
    I.s = s; I.iu = (s - rn[0]) / Math.max(1e-6, rn[1] - rn[0]); I.ilen = rn[1] - rn[0]; I.nx = P.sn[seg][0]; I.ny = P.sn[seg][1];
    for (let py = 0; py < h; py++) {
      const z = (py + 0.5) / PX - P.hw;
      o.set('#808080');
      P.band(o, x, y, z, a.tag, I);
      const k = (py * w + px) * 4;
      cd[k] = o.r; cd[k + 1] = o.g; cd[k + 2] = o.b; cd[k + 3] = 255;
      od[k] = o.m * 255; od[k + 1] = o.ro * 255; od[k + 2] = o.me * 255; od[k + 3] = 255;
    }
  }
  cc.putImageData(ci, R.x, R.y);
  oc.putImageData(oi, R.x, R.y);
}

function buildAtlas(px) {
  PX = px;
  const regs = [];
  for (const k in PARTS) {
    const P = PARTS[k];
    prep(P);
    const sw = Math.ceil((P.x1 - P.x0) * PX), sh = Math.ceil((P.y1 - P.y0) * PX);
    P.rSide = { w: sw, h: sh }; P.rSide2 = { w: sw, h: sh };
    P.rBand = { w: Math.ceil(P.perim * PX) + 1, h: Math.ceil(2 * P.hw * PX) + 1 };
    regs.push(P.rSide, P.rSide2, P.rBand);
  }
  for (const k in ARTS) { ARTS[k].r = { w: ARTS[k].w, h: ARTS[k].h }; regs.push(ARTS[k].r); }
  AW = 2048;
  AH = Math.ceil(pack(regs, AW) / 64) * 64;
  const cvC = document.createElement('canvas'), cvO = document.createElement('canvas');
  cvC.width = cvO.width = AW; cvC.height = cvO.height = AH;
  const cc = cvC.getContext('2d', { willReadFrequently: true }), oc = cvO.getContext('2d', { willReadFrequently: true });
  cc.fillStyle = '#7d7f82'; cc.fillRect(0, 0, AW, AH);
  oc.fillStyle = ormStr(0, 0.6, 0); oc.fillRect(0, 0, AW, AH);
  for (const k in ARTS) {
    const r = ARTS[k].r;
    for (const g of [cc, oc]) { g.save(); g.setTransform(1, 0, 0, 1, r.x, r.y); g.beginPath(); g.rect(0, 0, r.w, r.h); g.clip(); }
    ARTS[k].draw(cc, oc);
    cc.restore(); oc.restore();
  }
  const d = new Drawer(cc, oc);
  for (const k in PARTS) {
    const P = PARTS[k];
    for (const [R, flip] of [[P.rSide, false], [P.rSide2, true]]) { d.begin(R, P, flip); P.side(d, P); d.end(); }
    paintBand(P, cc, oc);
    if (P.draw) P.draw(new BandDrawer(P, cc, oc));
  }
  for (const k in SW) SW[k] = [(ARTS.pal.r.x + SW[k][0]) / AW, 1 - (ARTS.pal.r.y + SW[k][1]) / AH];
  // the ORM layer only needs half the resolution
  const half = document.createElement('canvas');
  half.width = AW / 2; half.height = AH / 2;
  const hg = half.getContext('2d');
  hg.imageSmoothingQuality = 'high';
  hg.drawImage(cvO, 0, 0, AW / 2, AH / 2);
  return { color: cvC, orm: half };
}

export function vehicleTextures(quality = {}) {
  if (READY) return READY;
  const { color, orm } = buildAtlas((quality.atlas || 256) >= 256 ? 512 : 384);
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const ormT = new THREE.CanvasTexture(orm);
  ormT.colorSpace = THREE.NoColorSpace;
  READY = { map, orm: ormT, canvas: color };
  return READY;
}
function ensure() { if (!READY) vehicleTextures(); }

// paints the colour tint (instance or vertex colour) only where the paint mask is set
export function vehicleMaterial(T) {
  const mat = new THREE.MeshStandardMaterial({
    map: T.map, roughnessMap: T.orm, metalnessMap: T.orm, roughness: 1, metalness: 1, vertexColors: true, envMapIntensity: 1.1,
  });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `
#ifdef USE_COLOR
  float paintMask = texture2D( roughnessMap, vRoughnessMapUv ).r;
  diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, paintMask );
#endif`);
  };
  mat.customProgramCacheKey = () => 'vehicle-paint';
  return mat;
}

// ---------------------------------------------------------------- geometry
function bandUV(P, s, z) { return [(P.rBand.x + s * PX) / AW, 1 - (P.rBand.y + (z + P.hw) * PX) / AH]; }
function sideUV(P, x, y, side) {
  const R = side > 0 ? P.rSide : P.rSide2;
  const u = side > 0 ? R.x + (x - P.x0) * PX : R.x + (P.x1 - x) * PX;
  return [u / AW, 1 - (R.y + (P.y1 - y) * PX) / AH];
}
function nrm(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

function quad(B, b, P4, N4, UV4, c, lit) {
  const base = b.vcount;
  for (let k = 0; k < 4; k++) B._v(b, P4[k][0], P4[k][1], P4[k][2], N4[k][0], N4[k][1], N4[k][2], UV4[k][0], UV4[k][1], c, lit);
  const p = P4;
  const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
  const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
  const gx = ay * bz - az * by, gy = az * bx - ax * bz, gz = ax * by - ay * bx;
  const nx = N4[0][0] + N4[2][0], ny = N4[0][1] + N4[2][1], nz = N4[0][2] + N4[2][2];
  if (gx * nx + gy * ny + gz * nz >= 0) b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else b.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

function extrude(B, bn, pc, P, x = 0) {
  if (x) B.push(x, 0);
  const b = B.B(bn);
  const { pts, n, sn, vn, smooth, q, S, hw, bev } = P;
  const zi = hw - bev;
  for (let i = 0; i < n; i++) {
    if (sn[i][1] < -0.5) continue; // faces pointing down are never seen
    const j = (i + 1) % n;
    const A = pts[i], Bp = pts[j];
    const nA = smooth[i] ? vn[i] : sn[i], nB = smooth[j] ? vn[j] : sn[i];
    const sA = S[i], sB = S[i + 1];
    const eA = [nrm(nA[0], nA[1], -0.5), nrm(nA[0], nA[1], 0.5)], eB = [nrm(nB[0], nB[1], -0.5), nrm(nB[0], nB[1], 0.5)];
    quad(B, b, [[A.x, A.y, -zi], [Bp.x, Bp.y, -zi], [Bp.x, Bp.y, zi], [A.x, A.y, zi]], [eA[0], eB[0], eB[1], eA[1]],
      [bandUV(P, sA, -zi), bandUV(P, sB, -zi), bandUV(P, sB, zi), bandUV(P, sA, zi)], pc, 0);
    for (const sd of [1, -1]) {
      const k = sd > 0 ? 1 : 0;
      const qA = q[i], qB = q[j];
      quad(B, b, [[A.x, A.y, sd * zi], [Bp.x, Bp.y, sd * zi], [qB[0], qB[1], sd * hw], [qA[0], qA[1], sd * hw]],
        [eA[k], eB[k], nrm(nB[0] * 0.5, nB[1] * 0.5, sd), nrm(nA[0] * 0.5, nA[1] * 0.5, sd)],
        [bandUV(P, sA, sd * zi), bandUV(P, sB, sd * zi), bandUV(P, sB, sd * hw), bandUV(P, sA, sd * hw)], pc, 0);
    }
  }
  // flat sides
  if (!P.tris) P.tris = THREE.ShapeUtils.triangulateShape(q.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const sd of [1, -1]) {
    const base = b.vcount;
    for (const p of q) { const uv = sideUV(P, p[0], p[1], sd); B._v(b, p[0], p[1], sd * hw, 0, 0, sd, uv[0], uv[1], pc, 0); }
    for (const [a0, a1, a2] of P.tris) {
      const ar = (q[a1][0] - q[a0][0]) * (q[a2][1] - q[a0][1]) - (q[a1][1] - q[a0][1]) * (q[a2][0] - q[a0][0]);
      if ((ar > 0) === (sd > 0)) b.i.push(base + a0, base + a1, base + a2); else b.i.push(base + a0, base + a2, base + a1);
    }
  }
  if (x) B.pop();
}

function swUV(name) { return SW[name] || SW.black; }
// box with a solid swatch colour from the atlas
function sbox(B, bn, pc, x0, y0, z0, x1, y1, z1, sw, opts) {
  const b = B.B(bn), start = b.uv.length;
  B.box(bn, x0, y0, z0, x1, y1, z1, pc, opts);
  const uv = swUV(sw);
  for (let i = start; i < b.uv.length; i += 2) { b.uv[i] = uv[0]; b.uv[i + 1] = uv[1]; }
}
function wheel(B, bn, pc, x, y, zc, r, w, side, rim, seg = 12) {
  const b = B.B(bn);
  const t = swUV('tire');
  const zo = zc + side * w / 2, zin = zc - side * w / 2;
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    if (s0 < -0.6 && s1 < -0.6) continue;
    quad(B, b, [[x + c0 * r, y + s0 * r, zin], [x + c1 * r, y + s1 * r, zin], [x + c1 * r, y + s1 * r, zo], [x + c0 * r, y + s0 * r, zo]],
      [[c0, s0, 0], [c1, s1, 0], [c1, s1, 0], [c0, s0, 0]], [t, t, t, t], pc, 0);
  }
  const R = ARTS[rim].r;
  const cu = (R.x + R.w / 2) / AW, cv = 1 - (R.y + R.h / 2) / AH, ru = (R.w / 2 - 0.5) / AW, rv = (R.h / 2 - 0.5) / AH;
  const base = b.vcount;
  B._v(b, x, y, zo, 0, 0, side, cu, cv, pc, 0);
  for (let k = 0; k <= seg; k++) {
    const a = k / seg * Math.PI * 2;
    B._v(b, x + Math.cos(a) * r, y + Math.sin(a) * r, zo, 0, 0, side, cu + Math.cos(a) * ru, cv + Math.sin(a) * rv, pc, 0);
  }
  for (let k = 0; k < seg; k++) {
    if (side > 0) b.i.push(base, base + k + 1, base + k + 2); else b.i.push(base, base + k + 2, base + k + 1);
  }
}
function wheels(B, bn, pc, xs, r, hw, w, rim) {
  for (const x of xs) for (const s of [1, -1]) wheel(B, bn, pc, x, r, s * (hw - 0.004 - w / 2), r, w, s, rim);
}
// lamps that glow at night (static vehicles never switch them on)
function lamp(B, P, y0, y1, zi, zo, front, col, lit, ox = 0) {
  const x = profX(P, (y0 + y1) / 2, front) + ox;
  if (!isFinite(x)) return;
  const xa = front ? x - 0.004 : x - 0.0008, xb = front ? x + 0.0008 : x + 0.004;
  for (const s of [1, -1]) B.box('glow', xa, y0, s > 0 ? zi : -zo, xb, y1, s > 0 ? zo : -zi, col, { lit });
}
function beacon(B, x0, y0, z0, x1, y1, z1, col) { B.box('beacon', x0, y0, z0, x1, y1, z1, col); }
function mirrors(B, bn, pc, x, y, zIn, zOut, sw = 'black') {
  for (const s of [1, -1]) sbox(B, bn, pc, x - 0.01, y, s > 0 ? zIn : -zOut, x + 0.002, y + 0.011, s > 0 ? zOut : -zIn, sw);
}

// tilted drum built from rings (concrete mixer)
function drum(B, bn, pc, a, e, prof, seg = 12) {
  const b = B.B(bn);
  const dx = e[0] - a[0], dy = e[1] - a[1];
  const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const pt = (t, r, f) => [a[0] + dx * t + px * Math.cos(f) * r, a[1] + dy * t + py * Math.cos(f) * r, Math.sin(f) * r];
  for (let i = 0; i < prof.length - 1; i++) {
    const [t0, r0] = prof[i], [t1, r1] = prof[i + 1];
    const uv = swUV(i % 2 ? 'drumo' : 'drumw');
    const sl = (r0 - r1) / (L * (t1 - t0));
    for (let k = 0; k < seg; k++) {
      const f0 = k / seg * Math.PI * 2, f1 = (k + 1) / seg * Math.PI * 2;
      const n0 = nrm(px * Math.cos(f0) + ux * sl, py * Math.cos(f0) + uy * sl, Math.sin(f0));
      const n1 = nrm(px * Math.cos(f1) + ux * sl, py * Math.cos(f1) + uy * sl, Math.sin(f1));
      quad(B, b, [pt(t0, r0, f0), pt(t0, r0, f1), pt(t1, r1, f1), pt(t1, r1, f0)], [n0, n1, n1, n0], [uv, uv, uv, uv], pc, 0);
    }
  }
}

// ------------------------------------------------------------ public API
// bn: bucket ('veh'); pc: paint colour (white for instanced, tinted per instance)
// opts.parked: lamps stay dark
function carBuilder(kind, extra) {
  const C = CARS[kind];
  return (B, bn = 'veh', pc = WH, opts = {}) => {
    ensure();
    const lit = opts.parked ? 9 : 0.02;
    const lo = PARTS[extra === 'police' ? 'sedan_lo_pol' : `${kind}_lo`];
    extrude(B, bn, pc, lo);
    extrude(B, bn, pc, PARTS[`${kind}_cab`]);
    wheels(B, bn, pc, [C.xf, C.xr], C.wr, C.hw, 0.032, 'rim_car');
    mirrors(B, bn, pc, C.mx, C.belt + 0.006, C.hwc - 0.004, C.hw + 0.006, 'body');
    lamp(B, lo, 0.066, 0.081, C.hw - 0.046, C.hw - 0.012, true, HEAD, lit);
    lamp(B, lo, 0.072, 0.087, C.hw - 0.043, C.hw - 0.01, false, TAIL, lit);
    const rx = C.roofX, ry = C.roofY;
    if (extra === 'police') {
      sbox(B, bn, pc, rx - 0.016, ry, -0.062, rx + 0.016, ry + 0.007, 0.062, 'black');
      beacon(B, rx - 0.013, ry + 0.007, -0.058, rx + 0.013, ry + 0.02, -0.012, BLUE);
      beacon(B, rx - 0.013, ry + 0.007, 0.012, rx + 0.013, ry + 0.02, 0.058, BLUE);
      sbox(B, bn, pc, rx - 0.011, ry + 0.007, -0.012, rx + 0.011, ry + 0.016, 0.012, 'white');
    }
    if (extra === 'taxi') taxiSign(B, bn, pc, rx, ry);
  };
}
function taxiSign(B, bn, pc, x, y) {
  const b = B.B(bn);
  sbox(B, bn, pc, x - 0.014, y, -0.04, x + 0.014, y + 0.022, 0.04, 'taxi');
  const R = ARTS.taxisign.r;
  const u0 = (R.x + 1) / AW, u1 = (R.x + R.w - 1) / AW, v0 = 1 - (R.y + R.h - 1) / AH, v1 = 1 - (R.y + 1) / AH;
  for (const s of [1, -1]) {
    const xf = x + s * 0.0145;
    const zl = s > 0 ? 0.04 : -0.04, zr = -zl;
    quad(B, b, [[xf, y + 0.001, zl], [xf, y + 0.001, zr], [xf, y + 0.021, zr], [xf, y + 0.021, zl]],
      [[s, 0, 0], [s, 0, 0], [s, 0, 0], [s, 0, 0]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], pc, 0);
  }
}

function vanBuilder(part) {
  return (B, bn = 'veh', pc = WH, opts = {}) => {
    ensure();
    const lit = opts.parked ? 9 : 0.02, P = PARTS[part];
    extrude(B, bn, pc, P);
    wheels(B, bn, pc, [VAN.xf, VAN.xr], VAN.wr, VAN.hw, 0.036, 'rim_car');
    mirrors(B, bn, pc, 0.17, 0.15, VAN.hw - 0.004, VAN.hw + 0.018);
    lamp(B, P, 0.084, 0.108, VAN.hw - 0.044, VAN.hw - 0.01, true, HEAD, lit);
    lamp(B, P, 0.1, 0.18, VAN.hw - 0.016, VAN.hw - 0.002, false, TAIL, lit);
  };
}
function boxBuilder(part, amb) {
  return (B, bn = 'veh', pc = WH, opts = {}) => {
    ensure();
    const lit = opts.parked ? 9 : 0.02, P = PARTS[part];
    extrude(B, bn, pc, P);
    wheels(B, bn, pc, [BOX.xf, BOX.xr], BOX.wr, BOX.hw, 0.038, 'rim_car');
    mirrors(B, bn, pc, 0.18, 0.15, BOX.hw - 0.004, BOX.hw + 0.018);
    lamp(B, P, 0.084, 0.108, BOX.hw - 0.044, BOX.hw - 0.01, true, HEAD, lit);
    lamp(B, P, 0.1, amb ? 0.24 : 0.15, BOX.hw - 0.017, BOX.hw - 0.002, false, TAIL, lit);
    if (amb) {
      for (const s of [1, -1]) {
        beacon(B, 0.032, 0.31, s > 0 ? 0.058 : -0.098, 0.062, 0.326, s > 0 ? 0.098 : -0.058, BLUE);
        beacon(B, -0.29, 0.31, s > 0 ? 0.07 : -0.098, -0.268, 0.324, s > 0 ? 0.098 : -0.07, BLUE);
      }
      sbox(B, bn, pc, -0.08, 0.31, -0.03, -0.03, 0.318, 0.03, 'alu');
      sbox(B, bn, pc, -0.22, 0.31, -0.03, -0.18, 0.318, 0.03, 'alu');
    }
  };
}
function busBuilder(B, bn = 'veh', pc = WH, opts = {}) {
  ensure();
  const lit = opts.parked ? 9 : 0.02, P = PARTS.bus;
  extrude(B, bn, pc, P);
  wheels(B, bn, pc, [BUS.xf, BUS.xr], BUS.wr, BUS.hw, 0.044, 'rim_truck');
  sbox(B, bn, pc, -0.1, 0.302, -0.075, 0.12, 0.33, 0.075, 'body', { s: 1 });
  sbox(B, bn, pc, -0.38, 0.3, -0.06, -0.24, 0.322, 0.06, 'body');
  for (const s of [1, -1]) {
    sbox(B, bn, pc, 0.5, 0.25, s > 0 ? BUS.hw - 0.01 : -BUS.hw - 0.022, 0.512, 0.258, s > 0 ? BUS.hw + 0.022 : -BUS.hw + 0.01, 'black');
    sbox(B, bn, pc, 0.53, 0.2, s > 0 ? BUS.hw + 0.014 : -BUS.hw - 0.024, 0.538, 0.255, s > 0 ? BUS.hw + 0.024 : -BUS.hw - 0.014, 'black');
  }
  lamp(B, P, 0.065, 0.083, BUS.hw - 0.048, BUS.hw - 0.012, true, HEAD, lit);
  lamp(B, P, 0.095, 0.16, BUS.hw - 0.024, BUS.hw - 0.004, false, TAIL, lit);
}

function truckBase(B, bn, pc, cabPart, lit, rear, rearX) {
  const cab = PARTS[cabPart];
  extrude(B, bn, pc, cab, CAB.off);
  B.push(CAB.off, 0);
  mirrors(B, bn, pc, 0.205, 0.2, CAB.hw - 0.004, CAB.hw + 0.026);
  lamp(B, cab, 0.064, 0.086, CAB.hw - 0.048, CAB.hw - 0.012, true, HEAD, lit);
  B.pop();
  sbox(B, bn, pc, rearX, 0.04, -0.075, CAB.off + 0.02, 0.078, 0.075, 'chassis');
  wheels(B, bn, pc, [CAB.off + 0.115], CAB.wr, CAB.hw, 0.04, 'rim_truck');
  wheels(B, bn, pc, rear, CAB.wr, CAB.hw - 0.002, 0.05, 'rim_truck');
}
function fireBuilder(B, bn = 'veh', pc = WH, opts = {}) {
  ensure();
  const lit = opts.parked ? 9 : 0.02;
  truckBase(B, bn, pc, 'cab_fire', lit, [-0.25], -0.46);
  extrude(B, bn, pc, PARTS.fire_body);
  lamp(B, PARTS.fire_body, 0.078, 0.098, FIREBODY.hw - 0.03, FIREBODY.hw - 0.004, false, TAIL, lit);
  // ladder
  sbox(B, bn, pc, -0.42, 0.31, -0.03, -0.36, 0.33, 0.03, 'steel');
  sbox(B, bn, pc, 0.14, 0.31, -0.02, 0.16, 0.325, 0.02, 'steel');
  for (const z of [-0.05, 0.042]) sbox(B, bn, pc, -0.44, 0.325, z, 0.43, 0.338, z + 0.008, 'ladder');
  for (let x = -0.43; x < 0.43; x += 0.036) sbox(B, bn, pc, x, 0.327, -0.042, x + 0.006, 0.333, 0.042, 'ladder');
  sbox(B, bn, pc, -0.2, 0.31, 0.07, 0.1, 0.322, 0.095, 'hose');
  // blue lights
  const cx = CAB.off;
  sbox(B, bn, pc, cx + 0.15, 0.302, -0.095, cx + 0.19, 0.31, 0.095, 'black');
  for (const s of [1, -1]) {
    beacon(B, cx + 0.155, 0.31, s > 0 ? 0.035 : -0.09, cx + 0.186, 0.326, s > 0 ? 0.09 : -0.035, BLUE);
    beacon(B, -0.46, 0.31, s > 0 ? 0.085 : -0.106, -0.438, 0.326, s > 0 ? 0.106 : -0.085, BLUE);
  }
}
function garbageBuilder(B, bn = 'veh', pc = WH, opts = {}) {
  ensure();
  const lit = opts.parked ? 9 : 0.02;
  truckBase(B, bn, pc, 'cab_garb', lit, [-0.16, -0.29], -0.46);
  extrude(B, bn, pc, PARTS.garb_body);
  extrude(B, bn, pc, PARTS.garb_tail);
  lamp(B, PARTS.garb_tail, 0.2, 0.24, GARBTAIL.hw - 0.022, GARBTAIL.hw - 0.006, false, TAIL, lit);
  sbox(B, bn, pc, -0.5, 0.07, -0.085, -0.478, 0.09, 0.085, 'steel');
  const cx = CAB.off;
  for (const s of [1, -1]) beacon(B, cx + 0.16, 0.302, s > 0 ? 0.06 : -0.095, cx + 0.19, 0.322, s > 0 ? 0.095 : -0.06, AMBER);
}
function truckBuilder(B, bn = 'veh', pc = WH, opts = {}) {
  ensure();
  const lit = opts.parked ? 9 : 0.02;
  truckBase(B, bn, pc, 'cab', lit, [-0.25, -0.36], -0.47);
  extrude(B, bn, pc, PARTS.truck_box);
  lamp(B, PARTS.truck_box, 0.104, 0.12, TRUCKBOX.hw - 0.03, TRUCKBOX.hw - 0.006, false, TAIL, lit);
  sbox(B, bn, pc, 0.2, 0.31, -0.09, 0.253, 0.34, 0.09, 'body');
}
function mixerBuilder(B, bn = 'veh', pc = WH, opts = {}) {
  ensure();
  const lit = opts.parked ? 9 : 0.02;
  truckBase(B, bn, pc, 'cab', lit, [-0.18, -0.3], -0.43);
  drum(B, bn, pc, [0.2, 0.2], [-0.4, 0.28], [[0, 0.035], [0.08, 0.075], [0.22, 0.1], [0.42, 0.108], [0.62, 0.1], [0.8, 0.075], [0.94, 0.05], [1, 0.042]]);
  sbox(B, bn, pc, 0.16, 0.075, -0.05, 0.2, 0.2, 0.05, 'steel');
  sbox(B, bn, pc, -0.36, 0.075, -0.06, -0.32, 0.25, 0.06, 'steel');
  sbox(B, bn, pc, -0.46, 0.2, -0.03, -0.4, 0.26, 0.03, 'grey');
  sbox(B, bn, pc, -0.43, 0.04, -0.09, -0.4, 0.09, 0.09, 'black');
  B.box('glow', -0.432, 0.06, 0.06, -0.428, 0.08, 0.09, TAIL, { lit });
  B.box('glow', -0.432, 0.06, -0.09, -0.428, 0.08, -0.06, TAIL, { lit });
}

export const VEH = {
  car: carBuilder('sedan'),
  hatch: carBuilder('hatch'),
  kombi: carBuilder('kombi'),
  police: carBuilder('sedan', 'police'),
  taxi: carBuilder('sedan', 'taxi'),
  van: vanBuilder('van'),
  post: vanBuilder('van_post'),
  ambulance: boxBuilder('amb', true),
  moving: boxBuilder('boxvan', false),
  bus: busBuilder,
  fire: fireBuilder,
  garbage: garbageBuilder,
  truck: truckBuilder,
  mixer: mixerBuilder,
};
// total lengths (for spacing in traffic)
export const VEH_LEN = { car: 0.47, hatch: 0.41, kombi: 0.475, police: 0.47, taxi: 0.47, van: 0.58, post: 0.58, ambulance: 0.6, moving: 0.6, bus: 1.04, fire: 0.94, garbage: 0.98, truck: 0.95, mixer: 0.9 };
