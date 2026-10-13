import { col, shade, hash2 } from './util.js';

// Small reusable models (vehicles, props, trees, people parts) drawn into a Builder
// in local coordinates. Vehicles face +x and sit on y = 0.

const C = col;
const DARK = C('#1d1f22');
const TIRE = C('#222428');
const GLASSC = C('#26323d');
const CHROME = C('#c9ccd0');

function wheels(B, x0, x1, hw, r = 0.032, w = 0.028) {
  for (const x of [x0, x1]) for (const z of [-hw, hw]) {
    B.box('solid', x - r, 0, z - w / 2, x + r, r * 2, z + w / 2, TIRE);
    B.box('solid', x - r * 0.45, r * 0.55, z - w / 2 - 0.002, x + r * 0.45, r * 1.45, z + w / 2 + 0.002, CHROME);
  }
}
function lights(B, xf, xb, y0, y1, hw, lw = 0.035) {
  B.box('glow', xf - 0.006, y0, -hw, xf + 0.002, y1, -hw + lw, C('#fff3d1'), { lit: 0.02 });
  B.box('glow', xf - 0.006, y0, hw - lw, xf + 0.002, y1, hw, C('#fff3d1'), { lit: 0.02 });
  B.box('glow', xb - 0.002, y0, -hw, xb + 0.006, y1, -hw + lw, C('#d8261c'), { lit: 0.02 });
  B.box('glow', xb - 0.002, y0, hw - lw, xb + 0.006, y1, hw, C('#d8261c'), { lit: 0.02 });
}

// paint bucket name pb: 'paint' for instanced (white, tinted per instance) or 'shiny'
export function car(B, pb = 'paint', pc = [1, 1, 1], opts = {}) {
  const L = 0.19, hw = 0.082;
  B.box(pb, -L, 0.03, -hw, L, 0.085, hw, pc);
  // bonnet slope + cabin
  B.box('glass', -0.1, 0.085, -hw + 0.008, 0.075, 0.138, hw - 0.008, GLASSC);
  B.box(pb, -0.095, 0.138, -hw + 0.01, 0.065, 0.152, hw - 0.01, pc);
  B.box('solid', L - 0.012, 0.035, -hw + 0.01, L + 0.004, 0.05, hw - 0.01, DARK);
  B.box('solid', -L - 0.004, 0.035, -hw + 0.01, -L + 0.012, 0.05, hw - 0.01, DARK);
  wheels(B, -0.115, 0.115, hw - 0.012);
  lights(B, L, -L, 0.06, 0.077, hw - 0.005);
  if (opts.taxi) B.box('glow', -0.02, 0.152, -0.03, 0.02, 0.172, 0.03, C('#f7e3a1'), { lit: 0.01 });
  if (opts.police) {
    B.box('solid', -L + 0.002, 0.055, -hw - 0.002, L - 0.002, 0.07, hw + 0.002, C('#1f5fae'));
    B.box('glow', -0.03, 0.152, -0.05, 0.03, 0.17, 0, C('#2f7bff'), { lit: 0.01 });
    B.box('glow', -0.03, 0.152, 0, 0.03, 0.17, 0.05, C('#2f7bff'), { lit: 0.01 });
  }
}

export function van(B, pb = 'paint', pc = [1, 1, 1], opts = {}) {
  const L = 0.24, hw = 0.09;
  B.box(pb, -L, 0.03, -hw, L - 0.05, 0.2, hw, pc);
  B.box(pb, L - 0.05, 0.03, -hw, L, 0.11, hw, pc);
  B.box('glass', L - 0.09, 0.11, -hw + 0.005, L - 0.03, 0.18, hw - 0.005, GLASSC);
  wheels(B, -0.15, 0.16, hw - 0.012);
  lights(B, L, -L, 0.06, 0.08, hw - 0.005);
  if (opts.ambulance) {
    B.box('solid', -L - 0.002, 0.1, -hw - 0.002, L - 0.048, 0.125, hw + 0.002, C('#e8471f'));
    B.box('glow', -0.04, 0.2, -0.06, 0.04, 0.22, 0.06, C('#2f7bff'), { lit: 0.01 });
    B.box('solid', -0.02, 0.135, hw + 0.001, 0.02, 0.18, hw + 0.004, C('#d8161c'));
    B.box('solid', -0.045, 0.15, hw + 0.001, 0.045, 0.165, hw + 0.004, C('#d8161c'));
  }
  if (opts.post) B.box('solid', -L - 0.002, 0.04, -hw - 0.002, L - 0.048, 0.06, hw + 0.002, C('#1d1d1d'));
}

export function bus(B, pb = 'paint', pc = C('#f2c230')) {
  const L = 0.44, hw = 0.1;
  B.box(pb, -L, 0.035, -hw, L, 0.27, hw, pc);
  B.box('glass', -L + 0.04, 0.13, -hw - 0.002, L - 0.02, 0.24, hw + 0.002, GLASSC);
  B.box('glass', L - 0.01, 0.09, -hw + 0.01, L + 0.003, 0.25, hw - 0.01, GLASSC);
  B.box('solid', -L + 0.05, 0.27, -hw + 0.02, -L + 0.25, 0.3, hw - 0.02, C('#d9d9d9'));
  B.box('glow', L - 0.005, 0.245, -0.06, L + 0.004, 0.265, 0.06, C('#ffb347'), { lit: 0.01 });
  wheels(B, -0.3, 0.3, hw - 0.012, 0.036);
  lights(B, L, -L, 0.06, 0.085, hw - 0.005);
}

export function truck(B, pb = 'paint', pc = C('#e9e9e6'), opts = {}) {
  const hw = 0.1;
  // cab
  B.box(pb, 0.26, 0.04, -hw, 0.4, 0.24, hw, opts.cab || C('#2b5d9b'));
  B.box('glass', 0.395, 0.14, -hw + 0.01, 0.402, 0.22, hw - 0.01, GLASSC);
  // trailer
  B.box(pb, -0.42, 0.06, -hw, 0.24, 0.3, hw, pc);
  B.box('solid', -0.42, 0.035, -hw + 0.01, 0.4, 0.06, hw - 0.01, DARK);
  wheels(B, -0.34, 0.32, hw - 0.012, 0.035);
  wheels(B, -0.26, 0.32, hw - 0.012, 0.035);
  lights(B, 0.4, -0.42, 0.06, 0.08, hw - 0.005);
}

export function garbageTruck(B, pb = 'paint', pc = C('#f07b1d')) {
  const hw = 0.1;
  B.box(pb, 0.2, 0.04, -hw, 0.34, 0.23, hw, pc);
  B.box('glass', 0.335, 0.14, -hw + 0.01, 0.343, 0.21, hw - 0.01, GLASSC);
  B.box(pb, -0.3, 0.06, -hw, 0.19, 0.27, hw, pc);
  B.box('solid', -0.34, 0.06, -hw + 0.01, -0.3, 0.25, hw - 0.01, C('#5d5f62'));
  B.box('solid', -0.3, 0.12, -hw - 0.003, 0.19, 0.14, hw + 0.003, C('#f4f4f4'));
  B.box('glow', 0.24, 0.23, -0.03, 0.28, 0.25, 0.03, C('#ffb000'), { lit: 0.01 });
  wheels(B, -0.2, 0.26, hw - 0.012, 0.035);
  lights(B, 0.34, -0.34, 0.06, 0.08, hw - 0.005);
}

export function fireTruck(B, pb = 'paint', pc = C('#d42a1f')) {
  const hw = 0.1;
  B.box(pb, 0.2, 0.04, -hw, 0.38, 0.25, hw, pc);
  B.box('glass', 0.375, 0.15, -hw + 0.01, 0.383, 0.23, hw - 0.01, GLASSC);
  B.box(pb, -0.4, 0.05, -hw, 0.2, 0.24, hw, pc);
  B.box('solid', -0.4, 0.13, -hw - 0.003, 0.38, 0.15, hw + 0.003, C('#f4f4f4'));
  B.box('solid', -0.4, 0.24, -0.06, 0.25, 0.25, 0.06, C('#bfc3c7'));
  for (let x = -0.38; x < 0.24; x += 0.04) B.box('solid', x, 0.25, -0.05, x + 0.01, 0.27, 0.05, C('#d9dcdf'));
  B.box('solid', -0.4, 0.27, -0.05, 0.25, 0.28, -0.04, C('#d9dcdf'));
  B.box('solid', -0.4, 0.27, 0.04, 0.25, 0.28, 0.05, C('#d9dcdf'));
  B.box('glow', 0.26, 0.25, -0.07, 0.32, 0.27, 0.07, C('#2f7bff'), { lit: 0.01 });
  wheels(B, -0.28, 0.27, hw - 0.012, 0.035);
  lights(B, 0.38, -0.4, 0.06, 0.08, hw - 0.005);
}

export function mixer(B, pb = 'paint', pc = C('#f2f2f0')) {
  const hw = 0.1;
  B.box(pb, 0.22, 0.04, -hw, 0.36, 0.22, hw, C('#e2a72e'));
  B.box('glass', 0.355, 0.13, -hw + 0.01, 0.363, 0.2, hw - 0.01, GLASSC);
  B.box('solid', -0.32, 0.04, -hw + 0.01, 0.22, 0.08, hw - 0.01, DARK);
  B.push(-0.06, 0, 0, 0.17);
  for (let i = 0; i < 6; i++) {
    const x0 = -0.24 + i * 0.075, r = 0.06 + Math.sin((i / 5) * Math.PI) * 0.04;
    B.box(pb, x0, -r, -r, x0 + 0.075, r, r, i % 2 ? pc : C('#e05a2a'));
  }
  B.pop();
  wheels(B, -0.22, 0.28, hw - 0.012, 0.035);
}

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
