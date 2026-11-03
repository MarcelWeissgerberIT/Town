import { col, shade, mix, fbm, hash2, DIRS } from './util.js';
import { ZONE_INFO } from './config.js';
import { MARGIN } from './world.js';

const C = col;
let SIDEWALK = C('#ddd6ca');
const CURB = C('#cfc9bf');
const ASPH = C('#ffffff');
const MARK = C('#f4f2ec');
let BANK = C('#9c968a');
let QUAY = C('#c9c1b2');
let G1 = C('#e4ecd2'), G2 = C('#c9d6ac'), G3 = C('#d8dfbe');
// the photographic textures already carry their colour, so tints stay close to white
export function setGroundPhoto(on) {
  if (!on) return;
  SIDEWALK = C('#f4f1ec'); BANK = C('#c9c4bb'); QUAY = C('#ebe6dd');
  G1 = C('#eef0e4'); G2 = C('#cfd8bd'); G3 = C('#e4e3cf');
}

function grassTint(x, z) {
  const n = fbm(x * 0.13, z * 0.13, 42, 3);
  const m = fbm(x * 0.6, z * 0.6, 7, 2);
  return mix(mix(G2, G1, n), G3, m * 0.35);
}

function popcount(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }

const W1 = 0.2, W2 = 0.08; // sidewalk width of a street / a main road
function popc(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }

// raised sidewalk cell with kerb faces toward asphalt (or toward the lot at the tile edge)
function sidewalkCell(B, x0, z0, x1, z1, sh, faces) {
  B.rect('cobble', x0, z0, x1, z1, sh, SIDEWALK, 1.1);
  const [n, s2, w, e] = faces;
  if (n) B.quad('solid', [x1, n < 0 ? -0.01 : 0, z0], [x0, n < 0 ? -0.01 : 0, z0], [x0, sh, z0], [x1, sh, z0], CURB);
  if (s2) B.quad('solid', [x0, s2 < 0 ? -0.01 : 0, z1], [x1, s2 < 0 ? -0.01 : 0, z1], [x1, sh, z1], [x0, sh, z1], CURB);
  if (w) B.quad('solid', [x0, w < 0 ? -0.01 : 0, z0], [x0, w < 0 ? -0.01 : 0, z1], [x0, sh, z1], [x0, sh, z0], CURB);
  if (e) B.quad('solid', [x1, e < 0 ? -0.01 : 0, z1], [x1, e < 0 ? -0.01 : 0, z0], [x1, sh, z0], [x1, sh, z1], CURB);
}

export function genRoad(B, world, x, z, onWater) {
  const m = world.roadMask(x, z);
  const t = world.roadType(x, z) || 1;
  const ctl = world.control(x, z);
  const sh = 0.026, ym = 0.0045;
  if (ctl === 2 && !onWater) { genRoundabout(B, world, x, z, m, t, sh); return; }
  // arm widths: a main road narrows where it meets a street
  const nbType = (d) => { const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz; return world.inb(nx, nz) ? world.roadType(nx, nz) || t : 1; };
  const lo = t === 2 ? W2 : W1;
  const arm = [0, 1, 2, 3].map((d) => (Math.min(t, nbType(d)) === 2 ? W2 : W1));
  const asph = (cx, cz) => {
    if (cx > lo && cx < 1 - lo && cz > lo && cz < 1 - lo) return true;
    if ((m & 1) && cz < 0.5 && cx > arm[0] && cx < 1 - arm[0]) return true;
    if ((m & 4) && cz > 0.5 && cx > arm[2] && cx < 1 - arm[2]) return true;
    if ((m & 8) && cx < 0.5 && cz > arm[3] && cz < 1 - arm[3]) return true;
    if ((m & 2) && cx > 0.5 && cz > arm[1] && cz < 1 - arm[1]) return true;
    return false;
  };
  const xs = [...new Set([0, lo, 1 - lo, ...arm.flatMap((a) => [a, 1 - a]), 1])].sort((a, b) => a - b);
  for (let j = 0; j < xs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], z0 = xs[j], z1 = xs[j + 1];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (asph(cx, cz)) { B.rect('asphalt', x + x0, z + z0, x + x1, z + z1, 0.002, ASPH, 2.2); continue; }
    // kerb faces: 1 toward asphalt in this tile, -1 at the tile edge toward a lot
    const L = xs.length - 2;
    const fn = j === 0 ? ((m & 1) ? 0 : -1) : (asph(cx, z0 - 0.001) ? 1 : 0);
    const fs = j === L ? ((m & 4) ? 0 : -1) : (asph(cx, z1 + 0.001) ? 1 : 0);
    const fw = i === 0 ? ((m & 8) ? 0 : -1) : (asph(x0 - 0.001, cz) ? 1 : 0);
    const fe = i === L ? ((m & 2) ? 0 : -1) : (asph(x1 + 0.001, cz) ? 1 : 0);
    sidewalkCell(B, x + x0, z + z0, x + x1, z + z1, sh, [fn, fs, fw, fe]);
  }
  const n = popc(m);
  const wideBoth = (a, b) => arm[a] === W2 && arm[b] === W2;
  // lane markings on straight pieces
  if (m === 5) {
    if (wideBoth(0, 2)) {
      B.rect('solid', x + 0.488, z, x + 0.496, z + 1, ym, MARK, 1); B.rect('solid', x + 0.504, z, x + 0.512, z + 1, ym, MARK, 1);
      for (const a of [0.08, 0.58]) for (const o of [0.285, 0.715]) B.rect('solid', x + o - 0.005, z + a, x + o + 0.005, z + a + 0.2, ym, MARK, 1);
    } else for (const a of [0.08, 0.58]) B.rect('solid', x + 0.494, z + a, x + 0.506, z + a + 0.22, ym, MARK, 1);
  } else if (m === 10) {
    if (wideBoth(1, 3)) {
      B.rect('solid', x, z + 0.488, x + 1, z + 0.496, ym, MARK, 1); B.rect('solid', x, z + 0.504, x + 1, z + 0.512, ym, MARK, 1);
      for (const a of [0.08, 0.58]) for (const o of [0.285, 0.715]) B.rect('solid', x + a, z + o - 0.005, x + a + 0.2, z + o + 0.005, ym, MARK, 1);
    } else for (const a of [0.08, 0.58]) B.rect('solid', x + a, z + 0.494, x + a + 0.22, z + 0.506, ym, MARK, 1);
  }
  // zebra crossings and stop or give-way lines next to junctions
  if (n === 2 && (m === 5 || m === 10)) {
    for (let d = 0; d < 4; d++) {
      if (!(m & DIRS[d].bit)) continue;
      const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz;
      if (!world.isJunction(nx, nz)) continue;
      const nc = world.control(nx, nz);
      const a0 = arm[d] + 0.04, a1 = 1 - arm[d] - 0.04;
      const k = Math.max(4, Math.round((a1 - a0) / 0.094));
      for (let i = 0; i < k; i++) {
        const a = a0 + (a1 - a0) * i / k, b = a + (a1 - a0) / k * 0.53;
        if (d === 0) B.rect('solid', x + a, z + 0.03, x + b, z + 0.17, ym, MARK, 1);
        if (d === 2) B.rect('solid', x + a, z + 0.83, x + b, z + 0.97, ym, MARK, 1);
        if (d === 3) B.rect('solid', x + 0.03, z + a, x + 0.17, z + b, ym, MARK, 1);
        if (d === 1) B.rect('solid', x + 0.83, z + a, x + 0.97, z + b, ym, MARK, 1);
      }
      // the incoming half of the road: solid stop line at lights, dashed give-way line otherwise
      const half = [[0.5, 1 - arm[d]], [0.5, 1 - arm[d]], [arm[d], 0.5], [arm[d], 0.5]][d];
      const seg = (u0, u1) => {
        if (d === 0) B.rect('solid', x + u0, z + 0.19, x + u1, z + 0.21, ym, MARK, 1);
        if (d === 2) B.rect('solid', x + 1 - u1, z + 0.79, x + 1 - u0, z + 0.81, ym, MARK, 1);
        if (d === 3) B.rect('solid', x + 0.19, z + 1 - u1, x + 0.21, z + 1 - u0, ym, MARK, 1);
        if (d === 1) B.rect('solid', x + 0.79, z + u0, x + 0.81, z + u1, ym, MARK, 1);
      };
      if (nc === 1) seg(half[0], half[1]);
      else for (let u = half[0]; u < half[1] - 0.01; u += 0.06) seg(u, Math.min(half[1], u + 0.035));
    }
  }
  if (onWater) {
    // bridge: deck edges and railings
    const dk = C('#bdb8ae');
    if (!(m & 1)) B.quad('solid', [x + 1, -0.14, z], [x, -0.14, z], [x, 0, z], [x + 1, 0, z], dk);
    if (!(m & 4)) B.quad('solid', [x, -0.14, z + 1], [x + 1, -0.14, z + 1], [x + 1, 0, z + 1], [x, 0, z + 1], dk);
    if (!(m & 8)) B.quad('solid', [x, -0.14, z], [x, -0.14, z + 1], [x, 0, z + 1], [x, 0, z], dk);
    if (!(m & 2)) B.quad('solid', [x + 1, -0.14, z + 1], [x + 1, -0.14, z], [x + 1, 0, z], [x + 1, 0, z + 1], dk);
    const rc = C('#6f767d');
    const rail = (x0, z0, x1, z1) => {
      B.box('solid', x0, sh, z0, x1, sh + 0.008, z1, rc);
      B.box('solid', Math.min(x0, x1), sh + 0.05, Math.min(z0, z1), Math.max(x0, x1), sh + 0.06, Math.max(z0, z1), rc);
    };
    if (m === 5) {
      rail(x + 0.01, z, x + 0.025, z + 1); rail(x + 0.975, z, x + 0.99, z + 1);
      for (let k = 0; k < 6; k++) { B.box('solid', x + 0.012, sh, z + k / 6, x + 0.024, sh + 0.06, z + k / 6 + 0.012, rc); B.box('solid', x + 0.976, sh, z + k / 6, x + 0.988, sh + 0.06, z + k / 6 + 0.012, rc); }
    } else if (m === 10) {
      rail(x, z + 0.01, x + 1, z + 0.025); rail(x, z + 0.975, x + 1, z + 0.99);
      for (let k = 0; k < 6; k++) { B.box('solid', x + k / 6, sh, z + 0.012, x + k / 6 + 0.012, sh + 0.06, z + 0.024, rc); B.box('solid', x + k / 6, sh, z + 0.976, x + k / 6 + 0.012, sh + 0.06, z + 0.988, rc); }
    }
    B.box('solid', x + 0.35, -0.5, z + 0.35, x + 0.65, -0.13, z + 0.65, dk);
  }
  // bus stop shelter
  const bs = world.inb(x, z) ? world.busstop[world.idx(x, z)] : 0;
  if (bs) {
    const side = bs - 1; // 0 N,1 E,2 S,3 W sidewalk
    B.push(x + 0.5, z + 0.5, [Math.PI, Math.PI / 2, 0, -Math.PI / 2][side]);
    // local: sidewalk at z in [0.3,0.5]; main roads leave less room, so the shelter moves out
    if ((world.roadType(x, z) || 1) === 2) B.push(0, 0.035);
    const gc = C('#9fc6d8'), fc = C('#3d4247');
    B.box('solid', -0.14, sh, 0.445, -0.13, sh + 0.13, 0.455, fc);
    B.box('solid', 0.13, sh, 0.445, 0.14, sh + 0.13, 0.455, fc);
    B.box('glass', -0.14, sh + 0.02, 0.452, 0.14, sh + 0.12, 0.458, gc);
    B.box('solid', -0.16, sh + 0.13, 0.4, 0.16, sh + 0.14, 0.47, fc);
    B.box('solid', -0.1, sh + 0.035, 0.425, 0.1, sh + 0.042, 0.445, C('#8a5a35'));
    B.cyl('solid', 0.2, sh, 0.35, 0.005, 0.16, 5, C('#888'));
    B.cyl('solid', 0.2, sh + 0.15, 0.35, 0.022, 0.006, 10, C('#f2c230'));
    B.box('solid', 0.192, sh + 0.14, 0.346, 0.208, sh + 0.165, 0.354, C('#2e7d4f'));
    B.rect('solid', -0.2, 0.25, 0.2, 0.29, 0.0046, C('#f2c230'), 1);
    if ((world.roadType(x, z) || 1) === 2) B.pop();
    B.pop();
  }
}

// a roundabout: ring road around a planted island (a 3D model may stand on it)
function genRoundabout(B, world, x, z, m, t, sh) {
  const c = 0.13; // corner sidewalks
  B.rect('asphalt', x, z, x + 1, z + 1, 0.002, ASPH, 2.2);
  const corners = [[0, 0], [1 - c, 0], [0, 1 - c], [1 - c, 1 - c]];
  for (const [ox, oz] of corners) {
    const n = oz === 0 ? -1 : 1, s2 = oz === 0 ? 1 : -1, w = ox === 0 ? -1 : 1, e = ox === 0 ? 1 : -1;
    sidewalkCell(B, x + ox, z + oz, x + ox + c, z + oz + c, sh, [n, s2, w, e]);
  }
  // a narrow sidewalk where no street joins
  if (!(m & 1)) sidewalkCell(B, x + c, z, x + 1 - c, z + 0.04, sh, [-1, 1, 0, 0]);
  if (!(m & 4)) sidewalkCell(B, x + c, z + 0.96, x + 1 - c, z + 1, sh, [1, -1, 0, 0]);
  if (!(m & 8)) sidewalkCell(B, x, z + c, x + 0.04, z + 1 - c, sh, [0, 0, -1, 1]);
  if (!(m & 2)) sidewalkCell(B, x + 0.96, z + c, x + 1, z + 1 - c, sh, [0, 0, 1, -1]);
  const cx = x + 0.5, cz = z + 0.5;
  // cobbled truck apron, kerb and lawn
  B.cyl('cobble', cx, 0, cz, 0.215, 0.012, 24, QUAY);
  B.cyl('solid', cx, 0, cz, 0.175, 0.03, 24, CURB, { top: C('#9aa080') });
  B.cyl('grass', cx, 0.03, cz, 0.165, 0.001, 24, C('#dfe8cf'));
  // give-way markings where the streets enter the ring
  for (let d = 0; d < 4; d++) {
    if (!(m & DIRS[d].bit)) continue;
    const dir = DIRS[d], r = [-dir.dz, dir.dx];
    for (let u = 0.03; u < 0.28; u += 0.06) {
      const px = cx + dir.dx * 0.43 - r[0] * (u + 0.02), pz = cz + dir.dz * 0.43 - r[1] * (u + 0.02);
      B.rect('solid', px - 0.012, pz - 0.012, px + 0.012, pz + 0.012, 0.0045, MARK, 1);
    }
  }
}

export function genTile(B, world, x, z) {
  const k = world.idx(x, z);
  const water = world.terrain[k] === 1;
  if (water) {
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz;
      if (world.isWater(nx, nz)) continue;
      if (d === 0) { B.quad('cobble', [x, -0.32, z], [x + 1, -0.32, z], [x + 1, 0, z], [x, 0, z], BANK, [0, 0, 1, 0, 1, 0.3, 0, 0.3]); B.rect('cobble', x, z - 0.06, x + 1, z, 0.012, QUAY, 1.1); }
      if (d === 2) { B.quad('cobble', [x + 1, -0.32, z + 1], [x, -0.32, z + 1], [x, 0, z + 1], [x + 1, 0, z + 1], BANK, [0, 0, 1, 0, 1, 0.3, 0, 0.3]); B.rect('cobble', x, z + 1, x + 1, z + 1.06, 0.012, QUAY, 1.1); }
      if (d === 3) { B.quad('cobble', [x, -0.32, z + 1], [x, -0.32, z], [x, 0, z], [x, 0, z + 1], BANK, [0, 0, 1, 0, 1, 0.3, 0, 0.3]); B.rect('cobble', x - 0.06, z, x, z + 1, 0.012, QUAY, 1.1); }
      if (d === 1) { B.quad('cobble', [x + 1, -0.32, z], [x + 1, -0.32, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], BANK, [0, 0, 1, 0, 1, 0.3, 0, 0.3]); B.rect('cobble', x + 1, z, x + 1.06, z + 1, 0.012, QUAY, 1.1); }
    }
    if (world.road[k]) genRoad(B, world, x, z, true);
    return;
  }
  if (world.road[k]) { genRoad(B, world, x, z, false); return; }
  // grass with smooth colour variation (per-vertex)
  const b = B.B('grass');
  const base = b.vcount;
  const corners = [[x, z + 1], [x + 1, z + 1], [x + 1, z], [x, z]];
  for (const [px, pz] of corners) {
    const c = grassTint(px, pz);
    b.p.push(px, 0, pz); b.n.push(0, 1, 0); b.uv.push(px / 3, -pz / 3); b.c.push(c[0], c[1], c[2]); b.l.push(0);
  }
  b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  const zn = world.zone[k];
  if (zn && world.bld[k] < 0) {
    const zc = C(ZONE_INFO[zn].color);
    const t = mix(grassTint(x + 0.5, z + 0.5), zc, 0.28);
    B.rect('grass', x + 0.04, z + 0.04, x + 0.96, z + 0.96, 0.002, t, 3);
    const e = 0.03, y = 0.0032;
    const same = (dx, dz) => world.inb(x + dx, z + dz) && world.zone[world.idx(x + dx, z + dz)] === zn && world.bld[world.idx(x + dx, z + dz)] < 0;
    const lc = shade(zc, 0.9);
    if (!same(0, -1)) B.rect('solid', x + 0.04, z + 0.04, x + 0.96, z + 0.04 + e, y, lc, 1);
    if (!same(0, 1)) B.rect('solid', x + 0.04, z + 0.96 - e, x + 0.96, z + 0.96, y, lc, 1);
    if (!same(-1, 0)) B.rect('solid', x + 0.04, z + 0.04, x + 0.04 + e, z + 0.96, y, lc, 1);
    if (!same(1, 0)) B.rect('solid', x + 0.96 - e, z + 0.04, x + 0.96, z + 0.96, y, lc, 1);
    // little "for sale" sign on lots that can be built on
    if (world.facingFor(x, z, 1, 1) >= 0 && hash2(x, z, 3) < 0.35) {
      const sx = x + 0.5 + (hash2(x, z, 4) - 0.5) * 0.4, sz = z + 0.5 + (hash2(x, z, 5) - 0.5) * 0.4;
      B.box('solid', sx - 0.005, 0, sz - 0.005, sx + 0.005, 0.1, sz + 0.005, C('#8a5a35'));
      B.box('solid', sx - 0.045, 0.06, sz - 0.004, sx + 0.045, 0.11, sz + 0.004, zc);
    }
  }
}

// --------------------------------------------------------- countryside
const FIELD_TYPES = [
  { b: 'grass', c: '#f4f8e4' },
  { b: 'field', c: '#e7c766' },
  { b: 'field', c: '#a9c968' },
  { b: 'field', c: '#b8885c' },
  { b: 'grass', c: '#e8f0d0', forest: true },
  { b: 'field', c: '#f1dc4a' },
  { b: 'grass', c: '#e8f0d0', forest: true },
];
export function fieldAt(world, x, z) {
  const fx = Math.floor((x + 1000) / 5), fz = Math.floor((z + 1000) / 4);
  const h = hash2(fx, fz, world.seed + 9);
  return FIELD_TYPES[Math.floor(h * FIELD_TYPES.length)];
}

export function genCountryside(B, world, outerTrees) {
  const N = world.N, M = MARGIN;
  // roads leaving the map continue straight to the horizon
  const outerRoads = new Set();
  for (let i = 0; i < N; i++) {
    if (world.isRoad(i, 0)) for (let z = -M; z < 0; z++) outerRoads.add(`${i},${z}`);
    if (world.isRoad(i, N - 1)) for (let z = N; z < N + M; z++) outerRoads.add(`${i},${z}`);
    if (world.isRoad(0, i)) for (let x = -M; x < 0; x++) outerRoads.add(`${x},${i}`);
    if (world.isRoad(N - 1, i)) for (let x = N; x < N + M; x++) outerRoads.add(`${x},${i}`);
  }
  for (let z = -M; z < N + M; z++) for (let x = -M; x < N + M; x++) {
    if (x >= 0 && z >= 0 && x < N && z < N) continue;
    if (world.outerWater(x, z)) {
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz;
        if (world.isWater(nx, nz)) continue;
        if (d === 0) B.quad('cobble', [x, -0.32, z], [x + 1, -0.32, z], [x + 1, 0, z], [x, 0, z], C('#7f8a6a'));
        if (d === 2) B.quad('cobble', [x + 1, -0.32, z + 1], [x, -0.32, z + 1], [x, 0, z + 1], [x + 1, 0, z + 1], C('#7f8a6a'));
        if (d === 3) B.quad('cobble', [x, -0.32, z + 1], [x, -0.32, z], [x, 0, z], [x, 0, z + 1], C('#7f8a6a'));
        if (d === 1) B.quad('cobble', [x + 1, -0.32, z], [x + 1, -0.32, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], C('#7f8a6a'));
      }
      if (outerRoads.has(`${x},${z}`)) {
        B.rect('asphalt', x, z, x + 1, z + 1, 0.002, ASPH, 2.2);
        B.box('solid', x + 0.35, -0.5, z + 0.35, x + 0.65, -0.13, z + 0.65, C('#bdb8ae'));
      }
      continue;
    }
    if (outerRoads.has(`${x},${z}`)) {
      const ns = x >= 0 && x < N;
      B.rect('asphalt', x + (ns ? 0.2 : 0), z + (ns ? 0 : 0.2), x + (ns ? 0.8 : 1), z + (ns ? 1 : 0.8), 0.002, ASPH, 2.2);
      B.rect('grass', x + (ns ? 0 : 0), z + (ns ? 0 : 0), x + (ns ? 0.2 : 1), z + (ns ? 1 : 0.2), 0.0, C('#e2e8c8'), 3);
      B.rect('grass', x + (ns ? 0.8 : 0), z + (ns ? 0 : 0.8), x + 1, z + 1, 0.0, C('#e2e8c8'), 3);
      if (ns) B.rect('solid', x + 0.494, z + 0.1, x + 0.506, z + 0.4, 0.0045, MARK, 1);
      else B.rect('solid', x + 0.1, z + 0.494, x + 0.4, z + 0.506, 0.0045, MARK, 1);
      continue;
    }
    const f = fieldAt(world, x, z);
    const fx = (x + 1000) % 5, fz = (z + 1000) % 4;
    const c = shade(C(f.c), 0.92 + hash2(Math.floor((x + 1000) / 5), Math.floor((z + 1000) / 4), 3) * 0.12);
    if (f.b === 'field') {
      // field rows with a grass margin
      B.rect('grass', x, z, x + 1, z + 1, 0, grassTint(x, z), 3);
      const x0 = x + (fx === 0 ? 0.08 : 0), x1 = x + 1 - (fx === 4 ? 0.08 : 0);
      const z0 = z + (fz === 0 ? 0.08 : 0), z1 = z + 1 - (fz === 3 ? 0.08 : 0);
      const b = B.B('field'); const base = b.vcount;
      const pts = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
      for (const [px, pz] of pts) { b.p.push(px, 0.004, pz); b.n.push(0, 1, 0); b.uv.push(px * 0.6, -pz * 0.6); b.c.push(c[0], c[1], c[2]); b.l.push(0); }
      b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      B.rect('grass', x, z, x + 1, z + 1, 0, f.forest ? shade(grassTint(x, z), 0.85) : grassTint(x, z), 3);
      if (f.forest && outerTrees) {
        const n = 1 + Math.floor(hash2(x, z, 8) * 2.2);
        for (let t = 0; t < n; t++) outerTrees.push([x + 0.15 + hash2(x, z, t * 3) * 0.7, z + 0.15 + hash2(x, z, t * 3 + 1) * 0.7, hash2(x, z, t) < 0.45 ? 'conifer' : 'forest', 0.85 + hash2(z, x, t) * 0.45]);
      } else if (outerTrees && hash2(x, z, 13) < 0.04) {
        outerTrees.push([x + 0.5, z + 0.5, 'forest', 1]);
      }
    }
  }
  return outerRoads;
}
