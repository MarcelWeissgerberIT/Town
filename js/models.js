import { col, shade, hash2 } from './util.js';

// Small reusable models (props, trees, people parts) drawn into a Builder in
// local coordinates. Vehicles live in vehicles.js.

const C = col;
const DARK = C('#1d1f22');
const TIRE = C('#222428');
const GLASSC = C('#26323d');
const CHROME = C('#c9ccd0');

export function excavatorBase(B) {
  const Y = C('#f2b51c');
  B.box('solid', -0.15, 0, -0.12, 0.15, 0.05, -0.06, DARK);
  B.box('solid', -0.15, 0, 0.06, 0.15, 0.05, 0.12, DARK);
  B.box('solid', -0.11, 0.05, -0.1, 0.11, 0.13, 0.1, Y);
  B.box('glass', 0.0, 0.13, 0.0, 0.08, 0.21, 0.09, GLASSC);
  B.box('solid', 0.0, 0.21, 0.0, 0.08, 0.22, 0.09, Y);
  B.box('solid', -0.12, 0.13, -0.09, -0.04, 0.17, 0.09, C('#3a3a3a'));
}
// ---- props
export function bench(B, x, z, a, wood = C('#8a5a35')) {
  B.push(x, z, a);
  B.box('solid', -0.05, 0.022, -0.012, 0.05, 0.028, 0.012, wood);
  B.box('solid', -0.05, 0.028, -0.014, 0.05, 0.05, -0.009, wood);
  B.box('solid', -0.045, 0, -0.01, -0.04, 0.022, 0.01, DARK);
  B.box('solid', 0.04, 0, -0.01, 0.045, 0.022, 0.01, DARK);
  B.pop();
}

export function lampPost(B, x, z, h = 0.22) {
  B.cyl('solid', x, 0, z, 0.006, h, 6, C('#2b2f33'));
  B.box('solid', x - 0.016, h, z - 0.016, x + 0.016, h + 0.008, z + 0.016, C('#2b2f33'));
  B.box('glow', x - 0.012, h - 0.03, z - 0.012, x + 0.012, h, z + 0.012, C('#ffe2a6'), { lit: 0.02 });
}

export function bin(B, x, z, c) {
  B.box('solid', x - 0.018, 0, z - 0.02, x + 0.018, 0.045, z + 0.02, c);
  B.box('solid', x - 0.02, 0.045, z - 0.022, x + 0.02, 0.05, z + 0.022, shade(c, 0.75));
}

export function umbrellaTable(B, x, z, c) {
  B.cyl('solid', x, 0, z, 0.024, 0.04, 8, C('#f4f1ea'), { r1: 0.024 });
  B.cyl('solid', x, 0.04, z, 0.003, 0.08, 4, C('#cfcfcf'));
  B.cyl('solid', x, 0.105, z, 0.075, 0.03, 8, c, { r1: 0.004 });
  for (const [dx, dz] of [[0.035, 0], [-0.035, 0], [0, 0.035]]) B.box('solid', x + dx - 0.008, 0, z + dz - 0.008, x + dx + 0.008, 0.026, z + dz + 0.008, C('#3b3b3b'));
}

export function crate(B, x, z, fruit) {
  B.box('solid', x - 0.03, 0.02, z - 0.02, x + 0.03, 0.045, z + 0.02, C('#a07444'));
  B.box('solid', x - 0.027, 0.045, z - 0.017, x + 0.027, 0.05, z + 0.017, fruit);
}

export function flowerBed(B, x, z, r, seed) {
  B.cyl('solid', x, 0, z, r, 0.025, 10, C('#8a8478'), { top: C('#6b4a32') });
  const cols = ['#e23b4b', '#ff6f91', '#ffffff', '#ffcf3f', '#b54ad8', '#ff8a3d'];
  for (let i = 0; i < 9; i++) {
    const a = hash2(i, seed) * 6.28, rr = hash2(seed, i) * r * 0.8;
    B.sphere('solid', x + Math.cos(a) * rr, 0.035, z + Math.sin(a) * rr, 0.018, 0.014, 0.018, C(i % 3 === 0 ? '#4f8f3a' : cols[(i + seed) % cols.length]), 5, 3);
  }
}

// ---- trees (for instancing)
function blob(B, x, y, z, r, c, seed) {
  // jittered sphere for an organic crown
  const b = B.B('solid');
  const start = b.p.length;
  B.sphere('solid', x, y, z, r, r * 0.9, r, c, 8, 5, { grad: true });
  for (let i = start; i < b.p.length; i += 3) {
    const px = b.p[i], py = b.p[i + 1], pz = b.p[i + 2];
    const j = (hash2(Math.round(px * 1000), Math.round(pz * 1000), Math.round(py * 1000) + seed) - 0.5) * r * 0.35;
    const dx = px - x, dy = py - y, dz = pz - z, l = Math.hypot(dx, dy, dz) || 1;
    b.p[i] += dx / l * j; b.p[i + 1] += dy / l * j; b.p[i + 2] += dz / l * j;
  }
}

export function treeRound(B, crown = '#5f9a3c', seed = 1) {
  const c = C(crown);
  B.cyl('solid', 0, 0, 0, 0.022, 0.16, 6, C('#6b4a32'), { r1: 0.016 });
  blob(B, 0, 0.25, 0, 0.12, c, seed);
  blob(B, 0.07, 0.2, 0.03, 0.085, shade(c, 0.95), seed + 1);
  blob(B, -0.06, 0.21, -0.04, 0.09, shade(c, 1.05), seed + 2);
  blob(B, 0.0, 0.33, 0.02, 0.075, shade(c, 1.12), seed + 3);
}
export function treeTall(B, crown = '#4f8a34') {
  const c = C(crown);
  B.cyl('solid', 0, 0, 0, 0.018, 0.12, 6, C('#5d4030'), { r1: 0.014, cap: false });
  B.sphere('solid', 0, 0.3, 0, 0.085, 0.24, 0.085, c, 8, 6, { grad: true });
}
export function treeConifer(B, crown = '#2f5e3a') {
  const c = C(crown);
  B.cyl('solid', 0, 0, 0, 0.018, 0.08, 6, C('#5d4030'));
  B.cyl('solid', 0, 0.06, 0, 0.12, 0.16, 9, shade(c, 0.85), { r1: 0.02 });
  B.cyl('solid', 0, 0.16, 0, 0.095, 0.15, 9, c, { r1: 0.015 });
  B.cyl('solid', 0, 0.26, 0, 0.07, 0.14, 9, shade(c, 1.12), { r1: 0.0 });
}
export function bush(B, crown = '#5a8f3a', seed = 4) {
  const c = C(crown);
  blob(B, 0, 0.04, 0, 0.06, c, seed);
  blob(B, 0.04, 0.035, 0.02, 0.045, shade(c, 1.08), seed + 5);
}

// ---- people parts (pivots at origin)
export function personTorso(B) {
  B.cyl('paint', 0, 0.072, 0, 0.021, 0.062, 7, [1, 1, 1], { r1: 0.025 });
}
export function personHead(B) { B.sphere('paint', 0, 0.152, 0, 0.0165, 0.018, 0.0165, [1, 1, 1], 7, 5); }
export function personHair(B) { B.sphere('paint', 0, 0.156, -0.002, 0.018, 0.017, 0.018, [1, 1, 1], 7, 4, { half: true }); }
export function personLeg(B) { B.box('paint', -0.007, -0.074, -0.008, 0.007, 0, 0.008, [1, 1, 1], { bottom: true }); }
export function personArm(B) { B.box('paint', -0.005, -0.056, -0.005, 0.005, 0, 0.005, [1, 1, 1], { bottom: true }); }
export function pigeon(B) {
  B.sphere('paint', 0, 0.018, 0, 0.018, 0.012, 0.011, [1, 1, 1], 6, 4);
  B.sphere('paint', 0.016, 0.03, 0, 0.008, 0.008, 0.008, [1, 1, 1], 5, 3);
}
export function dog(B) {
  B.box('paint', -0.03, 0.03, -0.012, 0.03, 0.055, 0.012, [1, 1, 1]);
  B.box('paint', 0.025, 0.045, -0.01, 0.05, 0.07, 0.01, [1, 1, 1]);
  for (const x of [-0.024, 0.022]) for (const z of [-0.008, 0.008]) B.box('paint', x - 0.004, 0, z - 0.004, x + 0.004, 0.03, z + 0.004, [1, 1, 1]);
  B.box('paint', -0.045, 0.05, -0.003, -0.03, 0.056, 0.003, [1, 1, 1]);
}

// ---- small helpers for non axis aligned parts (bikes, tractors)
// quad whose winding is fixed so that it faces n
function qn(B, bn, p0, p1, p2, p3, c, n) {
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
  const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
  const d = (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2];
  if (d >= 0) B.quad(bn, p0, p1, p2, p3, c); else B.quad(bn, p0, p3, p2, p1, c);
}
// square tube between two points in the local x/y plane
function bar(B, bn, x0, y0, x1, y1, t, c, z = 0) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l * t / 2, ny = dx / l * t / 2, h = t / 2;
  const a = [x0 + nx, y0 + ny], b = [x1 + nx, y1 + ny], cc = [x1 - nx, y1 - ny], d = [x0 - nx, y0 - ny];
  qn(B, bn, [a[0], a[1], z + h], [b[0], b[1], z + h], [cc[0], cc[1], z + h], [d[0], d[1], z + h], c, [0, 0, 1]);
  qn(B, bn, [a[0], a[1], z - h], [b[0], b[1], z - h], [cc[0], cc[1], z - h], [d[0], d[1], z - h], c, [0, 0, -1]);
  qn(B, bn, [a[0], a[1], z - h], [b[0], b[1], z - h], [b[0], b[1], z + h], [a[0], a[1], z + h], c, [nx, ny, 0]);
  if (ny < 0 || Math.abs(nx) > Math.abs(ny)) qn(B, bn, [d[0], d[1], z - h], [cc[0], cc[1], z - h], [cc[0], cc[1], z + h], [d[0], d[1], z + h], c, [-nx, -ny, 0]);
}
// thin wheel ring in the local x/y plane (flat, seen from both sides)
function ring(B, bn, cx, cy, r, t, c, z = 0, seg = 9) {
  const ri = r - t;
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    const o0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], o1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    const i0 = [cx + Math.cos(a0) * ri, cy + Math.sin(a0) * ri], i1 = [cx + Math.cos(a1) * ri, cy + Math.sin(a1) * ri];
    for (const s of [1, -1]) qn(B, bn, [i0[0], i0[1], z + s * 0.003], [o0[0], o0[1], z + s * 0.003], [o1[0], o1[1], z + s * 0.003], [i1[0], i1[1], z + s * 0.003], c, [0, 0, s]);
  }
}
// horizontal cylinder along z
export function cylZ(B, bn, cx, cy, z0, z1, r, seg, c, cap = c) {
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
    const p = (a, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
    const am = (a0 + a1) / 2;
    qn(B, bn, p(a0, z0), p(a1, z0), p(a1, z1), p(a0, z1), c, [Math.cos(am), Math.sin(am), 0]);
    B.tri(bn, [cx, cy, z1], p(a0, z1), p(a1, z1), cap);
    B.tri(bn, [cx, cy, z0], p(a1, z0), p(a0, z0), cap);
  }
}

export function bicycle(B, x, z, a, c) {
  B.push(x, z, a);
  const r = 0.031, wb = 0.108, T = C('#1f2023');
  ring(B, 'solid', -wb / 2, r, r, 0.007, T);
  ring(B, 'solid', wb / 2, r, r, 0.007, T);
  const RH = [-wb / 2, r], FH = [wb / 2, r], BBk = [-0.004, 0.028], ST = [-0.02, 0.074], HT = [0.036, 0.076], HB = [0.04, 0.06];
  for (const [p, q] of [[RH, BBk], [RH, ST], [BBk, ST], [ST, HT], [BBk, HB], [HB, FH], [HT, HB]]) bar(B, 'solid', p[0], p[1], q[0], q[1], 0.0055, c);
  bar(B, 'solid', HT[0], HT[1], HT[0] - 0.004, HT[1] + 0.012, 0.005, T);
  B.box('solid', HT[0] - 0.008, HT[1] + 0.01, -0.022, HT[0] - 0.001, HT[1] + 0.016, 0.022, T);
  B.box('solid', ST[0] - 0.014, ST[1], -0.007, ST[0] + 0.008, ST[1] + 0.007, 0.007, T);
  B.pop();
}

export function tractor(B, x, z, a, body = C('#c8231b')) {
  B.push(x, z, a);
  const T = C('#1d1d20'), Y = C('#e8b21e');
  B.box('shiny', -0.03, 0.045, -0.035, 0.12, 0.1, 0.035, body);
  B.box('solid', 0.115, 0.05, -0.03, 0.126, 0.092, 0.03, C('#2b2d31'));
  B.box('shiny', -0.1, 0.045, -0.055, -0.02, 0.1, 0.055, body);
  B.box('glass', -0.095, 0.1, -0.048, -0.025, 0.178, 0.048, C('#2f4252'));
  B.box('shiny', -0.102, 0.178, -0.058, -0.018, 0.19, 0.058, body);
  B.cyl('solid', 0.07, 0.1, 0.0, 0.005, 0.06, 6, C('#3a3a3a'));
  for (const s of [1, -1]) {
    cylZ(B, 'solid', -0.06, 0.056, s * 0.058, s * 0.092, 0.056, 12, T, Y);
    cylZ(B, 'solid', 0.085, 0.033, s * 0.044, s * 0.066, 0.033, 10, T, Y);
  }
  B.pop();
}
