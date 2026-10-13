import { col, shade, mix, fbm, hash2, DIRS } from './util.js';
import { ZONE_INFO } from './config.js';
import { MARGIN } from './world.js';

const C = col;
const SIDEWALK = C('#ddd6ca');
const CURB = C('#cfc9bf');
const ASPH = C('#ffffff');
const MARK = C('#f4f2ec');
const BANK = C('#9c968a');
const QUAY = C('#c9c1b2');
const G1 = C('#e4ecd2'), G2 = C('#c9d6ac'), G3 = C('#d8dfbe');

function grassTint(x, z) {
  const n = fbm(x * 0.13, z * 0.13, 42, 3);
  const m = fbm(x * 0.6, z * 0.6, 7, 2);
  return mix(mix(G2, G1, n), G3, m * 0.35);
}

function popcount(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }

const S = [0, 0.2, 0.8, 1];
export function genRoad(B, world, x, z, onWater) {
  const m = world.roadMask(x, z);
  const asph = (i, j) => (i === 1 && j === 1) || (i === 1 && j === 0 && (m & 1)) || (i === 2 && j === 1 && (m & 2)) || (i === 1 && j === 2 && (m & 4)) || (i === 0 && j === 1 && (m & 8));
  const sh = 0.026;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const x0 = x + S[i], x1 = x + S[i + 1], z0 = z + S[j], z1 = z + S[j + 1];
    if (asph(i, j)) {
      B.rect('asphalt', x0, z0, x1, z1, 0.002, ASPH, 2.2);
    } else {
      B.rect('cobble', x0, z0, x1, z1, sh, SIDEWALK, 1.1);
      // curb faces toward asphalt or open ground
      if (j > 0 && asph(i, j - 1)) B.quad('solid', [x1, 0, z0], [x0, 0, z0], [x0, sh, z0], [x1, sh, z0], CURB);
      if (j < 2 && asph(i, j + 1)) B.quad('solid', [x0, 0, z1], [x1, 0, z1], [x1, sh, z1], [x0, sh, z1], CURB);
      if (i > 0 && asph(i - 1, j)) B.quad('solid', [x0, 0, z0], [x0, 0, z1], [x0, sh, z1], [x0, sh, z0], CURB);
      if (i < 2 && asph(i + 1, j)) B.quad('solid', [x1, 0, z1], [x1, 0, z0], [x1, sh, z0], [x1, sh, z1], CURB);
      // outer edges of the tile (toward lots)
      if (j === 0 && !(m & 1)) B.quad('solid', [x1, -0.01, z0], [x0, -0.01, z0], [x0, sh, z0], [x1, sh, z0], CURB);
      if (j === 2 && !(m & 4)) B.quad('solid', [x0, -0.01, z1], [x1, -0.01, z1], [x1, sh, z1], [x0, sh, z1], CURB);
      if (i === 0 && !(m & 8)) B.quad('solid', [x0, -0.01, z0], [x0, -0.01, z1], [x0, sh, z1], [x0, sh, z0], CURB);
      if (i === 2 && !(m & 2)) B.quad('solid', [x1, -0.01, z1], [x1, -0.01, z0], [x1, sh, z0], [x1, sh, z1], CURB);
    }
  }
  const ym = 0.0045;
  const n = popcount(m);
  // centre dashes on straight pieces
  if (m === 5) {
    for (const a of [0.08, 0.58]) B.rect('solid', x + 0.494, z + a, x + 0.506, z + a + 0.22, ym, MARK, 1);
  } else if (m === 10) {
    for (const a of [0.08, 0.58]) B.rect('solid', x + a, z + 0.494, x + a + 0.22, z + 0.506, ym, MARK, 1);
  }
  // zebra crossings next to junctions
  if (n === 2 && (m === 5 || m === 10)) {
    for (let d = 0; d < 4; d++) {
      if (!(m & DIRS[d].bit)) continue;
      const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz;
      if (!world.isRoad(nx, nz) || popcount(world.roadMask(nx, nz)) < 3) continue;
      for (let k = 0; k < 6; k++) {
        const a = 0.24 + k * 0.094;
        if (d === 0) B.rect('solid', x + a, z + 0.03, x + a + 0.05, z + 0.17, ym, MARK, 1);
        if (d === 2) B.rect('solid', x + a, z + 0.83, x + a + 0.05, z + 0.97, ym, MARK, 1);
        if (d === 3) B.rect('solid', x + 0.03, z + a, x + 0.17, z + a + 0.05, ym, MARK, 1);
        if (d === 1) B.rect('solid', x + 0.83, z + a, x + 0.97, z + a + 0.05, ym, MARK, 1);
      }
      // stop line
      if (d === 0) B.rect('solid', x + 0.5, z + 0.19, x + 0.8, z + 0.21, ym, MARK, 1);
      if (d === 2) B.rect('solid', x + 0.2, z + 0.79, x + 0.5, z + 0.81, ym, MARK, 1);
      if (d === 3) B.rect('solid', x + 0.19, z + 0.2, x + 0.21, z + 0.5, ym, MARK, 1);
      if (d === 1) B.rect('solid', x + 0.79, z + 0.5, x + 0.81, z + 0.8, ym, MARK, 1);
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
    // local: sidewalk at z in [0.3,0.5]
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
    B.pop();
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
