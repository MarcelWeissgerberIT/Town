import { col, shade, pick, randRange } from './util.js';
import { fq, setTint, boxWalls, flatRoof, hipRoof, gableRoof, gableTri, aoDecal, sign, parkedCar, hedge } from './buildgen.js';
import { hasModel } from './models3d.js';
import { houseStyle, body, mainRoof, canopy, steps } from './houses.js';

// ---------------------------------------------------------------------------
// Supply facilities: power plants, wind and solar, substations, waterworks,
// water tower, sewage plant, landfill, recycling, incineration, doctor's
// practice and rescue station. Lots are centred, the street lies at local +z.
// meta.anchor: where high-voltage wires end; meta.rotors: wind turbine hubs;
// meta.steam: cooling tower plumes.
// ---------------------------------------------------------------------------

const C = col;
const STEEL = C('#8d949b'), DARKSTEEL = C('#4c5258'), CONC = C('#c9c5bd'), WHITEISH = C('#eef0f2');
let WORLD = null;
export function setGenWorld(w) { WORLD = w; }

// surface of revolution: profile [[r, y], ...] bottom to top
function lathe(B, cx, cz, prof, seg, c, cell, rng, bn = 'solid', inside = false) {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const P = (r, a, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      let p0 = P(r0, a1, y0), p1 = P(r0, a0, y0), p2 = P(r1, a0, y1), p3 = P(r1, a1, y1);
      if (inside) [p0, p1, p2, p3] = [p1, p0, p3, p2];
      if (cell) fq(B, cell, p0, p1, p2, p3, rng);
      else B.quad(bn, p0, p1, p2, p3, c);
    }
  }
}
function coneTop(B, cx, cz, y, r, h, seg, c, bn = 'roof') {
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const side = 2 * r * Math.sin(Math.PI / seg), sl = Math.hypot(r, h);
    B.tri(bn, [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [cx, y + h, cz], c, [0, 0, side / 0.36, 0, side / 0.72, sl / 0.36]);
  }
}
function disc(B, bn, cx, cz, y, r, seg, c) {
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    B.tri(bn, [cx, y, cz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], c,
      [cx * 2, -cz * 2, (cx + Math.cos(a1) * r) * 2, -(cz + Math.sin(a1) * r) * 2, (cx + Math.cos(a0) * r) * 2, -(cz + Math.sin(a0) * r) * 2]);
  }
}
function fence(B, x0, z0, x1, z1, gap = null, h = 0.07) {
  const pc = C('#9aa1a7');
  const side = (ax, az, bx, bz, g) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.12));
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      if (g !== null && Math.abs(x - g) < 0.09) continue;
      B.box('solid', x - 0.004, 0, z - 0.004, x + 0.004, h, z + 0.004, pc);
    }
    const lx = Math.min(ax, bx), hx = Math.max(ax, bx), lz = Math.min(az, bz), hz = Math.max(az, bz);
    if (g === null) { B.box('solid', lx - 0.002, h - 0.006, lz - 0.002, hx + 0.002, h, hz + 0.002, pc); B.box('solid', lx - 0.002, h * 0.45, lz - 0.002, hx + 0.002, h * 0.45 + 0.004, hz + 0.002, pc); }
    else for (const [a, b] of [[lx, g - 0.09], [g + 0.09, hx]]) if (b > a) { B.box('solid', a, h - 0.006, lz - 0.002, b, h, hz + 0.002, pc); B.box('solid', a, h * 0.45, lz - 0.002, b, h * 0.45 + 0.004, hz + 0.002, pc); }
  };
  side(x0, z1, x1, z1, gap); side(x0, z0, x1, z0, null); side(x0, z0, x0, z1, null); side(x1, z0, x1, z1, null);
}
// steel lattice post (a narrow frame tower)
function lattice(B, x, z, h, w = 0.05, c = STEEL) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box('solid', x + dx * w / 2 - 0.003, 0, z + dz * w / 2 - 0.003, x + dx * w / 2 + 0.003, h, z + dz * w / 2 + 0.003, c);
  for (let y = 0.08; y < h; y += 0.08) {
    B.box('solid', x - w / 2, y, z - w / 2 - 0.002, x + w / 2, y + 0.004, z - w / 2 + 0.002, c);
    B.box('solid', x - w / 2, y, z + w / 2 - 0.002, x + w / 2, y + 0.004, z + w / 2 + 0.002, c);
    B.box('solid', x - w / 2 - 0.002, y, z - w / 2, x - w / 2 + 0.002, y + 0.004, z + w / 2, c);
    B.box('solid', x + w / 2 - 0.002, y, z - w / 2, x + w / 2 + 0.002, y + 0.004, z + w / 2, c);
  }
}
function transformer(B, x, z, s = 1) {
  const body = C('#5d6a5f');
  B.box('solid', x - 0.07 * s, 0, z - 0.05 * s, x + 0.07 * s, 0.1 * s, z + 0.05 * s, body);
  for (let i = -3; i <= 3; i++) B.box('solid', x + i * 0.018 * s - 0.004, 0.012, z + 0.05 * s, x + i * 0.018 * s + 0.004, 0.085 * s, z + 0.075 * s, shade(body, 0.85));
  for (const dx of [-0.04, 0, 0.04]) {
    B.cyl('solid', x + dx * s, 0.1 * s, z, 0.008 * s, 0.05 * s, 6, C('#8a5a3c'));
    B.cyl('solid', x + dx * s, 0.15 * s, z, 0.011 * s, 0.006, 6, C('#d9d4ca'));
  }
  B.cyl('solid', x - 0.05 * s, 0.1 * s, z - 0.03 * s, 0.022 * s, 0.03 * s, 8, body);
}
function insulatorRow(B, x0, x1, z, y) { for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 2) { B.cyl('solid', x, y - 0.03, z, 0.006, 0.03, 6, C('#d9d4ca')); } }
function gantry(B, x0, x1, z, h) {
  lattice(B, x0, z, h, 0.035); lattice(B, x1, z, h, 0.035);
  B.box('solid', x0, h - 0.012, z - 0.012, x1, h, z + 0.012, STEEL);
  insulatorRow(B, x0 + 0.04, x1 - 0.04, z, h - 0.012);
}
function ground(B, LW, LD, bucket = 'asphalt', c = '#d4d4d2', s = 2) { B.rect(bucket, -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C(c), s); }
function lawn(B, LW, LD) { B.rect('grass', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.004, C('#eef2e0'), 3); }
function office(B, rng, x0, z0, x1, z1, floors, cellF = 'br_win_red', side = 'br_wall_red', fh = 0.25) {
  setTint(null);
  boxWalls(B, rng, x0, z0, x1, z1, 0, Array(floors).fill(fh), (s, f, k) => (s === 0 || k % 2 === 0 ? cellF : side), 0.2);
  flatRoof(B, x0, z0, x1, z1, floors * fh, { parapet: 0.02 });
  aoDecal(B, x0, z0, x1, z1, 0.05);
}

// ================================================================ power
function substation(B, rng, meta, LW, LD) {
  B.rect('flat', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#cfccc4'), 0.5);
  fence(B, -0.46, -0.46, 0.46, 0.46, 0.25);
  transformer(B, -0.2, -0.05, 1.2);
  transformer(B, 0.12, -0.05, 1.2);
  gantry(B, -0.36, 0.36, -0.3, 0.42);
  for (const x of [-0.2, 0.12]) { B.box('solid', x - 0.004, 0.15, -0.3, x + 0.004, 0.4, -0.29, C('#3a3d42')); }
  // control house
  office(B, rng, 0.18, 0.18, 0.42, 0.42, 1, 'br_win_red', 'br_wall_red', 0.2);
  sign(B, rng, 'stadtwerke', 0.3, 0.12, 0.42, 0.2);
  B.box('solid', -0.4, 0.06, 0.38, -0.12, 0.12, 0.39, C('#f2c230'));
  meta.anchor = [0, -0.3, 0.42];
  meta.height = 0.45;
}

function wind(B, rng, meta, LW, LD) {
  lawn(B, LW, LD);
  B.rect('flat', -0.22, -0.22, 0.22, 0.22, 0.006, C('#d0cdc4'), 0.5);
  B.rect('flat', -0.06, 0.22, 0.06, 0.5, 0.006, C('#d0cdc4'), 0.5);
  B.cyl('solid', 0, 0, 0, 0.12, 0.04, 14, CONC);
  B.cyl('solid', 0, 0.04, 0, 0.075, 2.18, 14, WHITEISH, { r1: 0.036 });
  B.box('solid', 0.11, 0, 0.1, 0.2, 0.09, 0.18, C('#dfe3e6'));
  // nacelle
  B.box('solid', -0.05, 2.17, -0.2, 0.05, 2.28, 0.1, WHITEISH);
  B.sphere('solid', 0, 2.225, 0.13, 0.05, 0.05, 0.06, WHITEISH, 10, 6);
  B.box('solid', -0.02, 2.28, -0.18, 0.02, 2.3, -0.14, C('#d33'));
  meta.rotors = [[0, 0.15, 2.225, 0]];
  meta.height = 2.3;
  meta.trees.push([-0.38, 0.36, 'bush', 0.8]);
}

function solar(B, rng, meta, LW, LD) {
  lawn(B, LW, LD);
  fence(B, -LW / 2 + 0.05, -LD / 2 + 0.05, LW / 2 - 0.05, LD / 2 - 0.05, 0.6);
  const rows = 5, x0 = -LW / 2 + 0.14, x1 = LW / 2 - 0.14;
  for (let i = 0; i < rows; i++) {
    const z = -LD / 2 + 0.2 + i * (LD - 0.42) / (rows - 1);
    const d = 0.2, h0 = 0.04, h1 = 0.13;
    const len = x1 - x0;
    B.quad('solar', [x0, h0, z + d / 2], [x1, h0, z + d / 2], [x1, h1, z - d / 2], [x0, h1, z - d / 2], C('#ffffff'), [0, 0, len / 0.3, 0, len / 0.3, d / 0.3, 0, d / 0.3]);
    B.quad('solid', [x1, h0 - 0.006, z + d / 2], [x0, h0 - 0.006, z + d / 2], [x0, h1 - 0.006, z - d / 2], [x1, h1 - 0.006, z - d / 2], C('#9aa1a7'));
    for (let x = x0 + 0.05; x < x1; x += 0.3) {
      B.box('solid', x - 0.004, 0, z + 0.05, x + 0.004, h0 + 0.02, z + 0.058, STEEL);
      B.box('solid', x - 0.004, 0, z - 0.06, x + 0.004, h1 - 0.02, z - 0.052, STEEL);
    }
  }
  // inverter station and a few sheep keeping the grass short
  B.box('solid', LW / 2 - 0.34, 0, LD / 2 - 0.2, LW / 2 - 0.16, 0.09, LD / 2 - 0.08, C('#e9ecef'));
  for (let i = 0; i < 5; i++) {
    const x = randRange(rng, -0.7, 0.6), z = -LD / 2 + 0.31 + Math.floor(rng() * 4) * (LD - 0.42) / 4;
    B.sphere('solid', x, 0.035, z, 0.035, 0.026, 0.022, C('#f4f1ea'), 7, 4);
    B.sphere('solid', x + 0.035, 0.045, z, 0.012, 0.012, 0.01, C('#2b2b2b'), 6, 3);
  }
  meta.anchor = [LW / 2 - 0.25, LD / 2 - 0.14, 0.12];
  meta.height = 0.2;
}

function battery(B, rng, meta, LW, LD) {
  B.rect('flat', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#d6d3cb'), 0.5);
  fence(B, -0.46, -0.46, 0.46, 0.46, 0.0);
  setTint(null);
  for (let i = 0; i < 3; i++) {
    const z = -0.34 + i * 0.22;
    boxWalls(B, rng, -0.38, z - 0.07, 0.24, z + 0.07, 0, [0.14], (s) => (s % 2 ? 'metal_white' : 'metal_white'), 0.16);
    flatRoof(B, -0.38, z - 0.07, 0.24, z + 0.07, 0.14, { parapet: 0, col: '#e4e6e8' });
    for (const x of [-0.26, -0.07, 0.12]) { B.cyl('solid', x, 0.14, z, 0.035, 0.012, 10, C('#5b6168')); B.cyl('solid', x, 0.152, z, 0.026, 0.002, 10, C('#2b2f33')); }
    B.box('solid', 0.24, 0.03, z - 0.02, 0.26, 0.1, z + 0.02, C('#2e7d4f'));
  }
  transformer(B, 0.36, -0.2);
  meta.anchor = [0.36, -0.2, 0.2];
  meta.height = 0.2;
}

function hydro(B, rng, meta, LW, LD, b) {
  lawn(B, LW, LD);
  // which local side faces the water?
  const sides = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  let wd = [0, -1];
  if (WORLD) {
    for (const [dx, dz] of sides) {
      const lx = dx * (LW / 2 + 0.5), lz = dz * (LD / 2 + 0.5);
      const wx = Math.floor(B.wx(lx, lz)), wz = Math.floor(B.wz(lx, lz));
      if (WORLD.isWater(wx, wz)) { wd = [dx, dz]; break; }
    }
  }
  // brick turbine house with a slate roof
  setTint(null);
  const hw = 0.62, hd = 0.3;
  boxWalls(B, rng, -hw, -hd, hw, hd, 0, [0.42], (s, f, k) => (s % 2 === 0 ? 'plant_hall' : 'br_wall_red'), 0.2);
  gableRoof(B, 2 * hw, 2 * hd, 0.42, 0.2, C('#8c95a2'), { bucket: 'slate' });
  gableTri(B, rng, hw, hd, hw, -hd, 0.42, 0.2, 'br_wall_red');
  gableTri(B, rng, -hw, -hd, -hw, hd, 0.42, 0.2, 'br_wall_red');
  sign(B, rng, 'kraftwerk', 0, 0.3, hd, 0.3);
  aoDecal(B, -hw, -hd, hw, hd);
  // weir with sluice gates reaching across the river
  let len = 0;
  if (WORLD) {
    for (let t = 1; t <= 4; t++) {
      const lx = wd[0] * (LW / 2 + t - 0.5), lz = wd[1] * (LD / 2 + t - 0.5);
      if (!WORLD.isWater(Math.floor(B.wx(lx, lz)), Math.floor(B.wz(lx, lz)))) break;
      len = t;
    }
  }
  len = Math.max(1, len);
  B.push(wd[0] * (LW / 2), wd[1] * (LD / 2), Math.atan2(wd[0], wd[1]));
  // local: +z points over the water
  B.box('solid', -0.32, 0.04, 0, 0.32, 0.1, len, CONC);
  for (let t = 0; t <= len; t += 0.33) {
    B.box('solid', -0.34, -0.4, t - 0.03, 0.34, 0.16, t + 0.03, shade(CONC, 0.92));
    B.box('solid', -0.3, 0.1, t + 0.04, 0.3, 0.2, t + 0.26, C('#3f4a52'));
  }
  B.rect('glass', -0.3, 0, 0.3, len, -0.09, C('#f2f6f8'), 1);
  for (const s of [-1, 1]) B.box('solid', s * 0.3 - 0.008, 0.1, 0, s * 0.3 + 0.008, 0.14, len, STEEL);
  B.pop();
  meta.anchor = [-hw + 0.1, 0, 0.62];
  meta.height = 0.65;
  meta.splash = [wd[0] * (LW / 2 + 0.8), wd[1] * (LD / 2 + 0.8)];
}

function coalPlant(B, rng, meta, LW, LD) {
  ground(B, LW, LD, 'asphalt', '#cfcfcd');
  setTint(null);
  // hyperbolic cooling tower
  const ct = [-0.72, -0.66];
  const prof = [[0.62, 0], [0.55, 0.3], [0.48, 0.65], [0.43, 1.0], [0.42, 1.2], [0.44, 1.45], [0.47, 1.68]];
  B.cyl('solid', ct[0], 0, ct[1], 0.64, 0.05, 24, C('#9a958c'));
  lathe(B, ct[0], ct[1], prof, 24, null, 'raw_conc', rng);
  lathe(B, ct[0], ct[1], [[0.44, 1.35], [0.46, 1.68]], 24, C('#6d6a64'), null, rng, 'solid', true);
  disc(B, 'solid', ct[0], ct[1], 1.36, 0.44, 24, C('#3d3b37'));
  B.cyl('solid', ct[0], 1.66, ct[1], 0.475, 0.03, 24, C('#b6b1a8'), { cap: false });
  meta.steam = [[ct[0], 1.75, ct[1], 0.42]];
  // boiler house and turbine hall
  boxWalls(B, rng, 0.1, -1.25, 0.82, -0.42, 0, [0.4, 0.4, 0.38], (s, f) => (f === 2 ? 'metal_grey' : 'plant_hall'), 0.18);
  flatRoof(B, 0.1, -1.25, 0.82, -0.42, 1.18, { parapet: 0.03, pcol: '#8d949b' });
  boxWalls(B, rng, -0.12, -0.4, 1.3, 0.3, 0, [0.56], (s) => (s % 2 === 0 ? 'plant_hall' : 'br_wall_red'), 0.2);
  B.push(0.59, -0.05);
  gableRoof(B, 1.42, 0.7, 0.56, 0.16, C('#8d6a5a'), { bucket: 'roof' });
  gableTri(B, rng, 0.71, 0.35, 0.71, -0.35, 0.56, 0.16, 'br_wall_red');
  gableTri(B, rng, -0.71, -0.35, -0.71, 0.35, 0.56, 0.16, 'br_wall_red');
  B.pop();
  aoDecal(B, -0.12, -1.25, 1.3, 0.3, 0.12);
  // chimney with red and white bands
  const ch = [1.12, -1.06];
  B.cyl('solid', ch[0], 0, ch[1], 0.1, 2.3, 14, C('#b9b3a8'), { r1: 0.07 });
  for (let i = 0; i < 3; i++) B.cyl('solid', ch[0], 2.3 + i * 0.1, ch[1], 0.072, 0.1, 14, C(i % 2 ? '#f4f4f2' : '#c0392b'), { r1: 0.07 });
  B.cyl('solid', ch[0], 2.6, ch[1], 0.075, 0.015, 14, C('#3a3a3a'));
  meta.smoke.push([ch[0], 2.62, ch[1]]);
  // coal yard with conveyor
  B.cyl('coal', -0.85, 0, 0.78, 0.42, 0.26, 16, C('#ffffff'), { r1: 0.08 });
  B.cyl('coal', -0.25, 0, 1.0, 0.3, 0.18, 14, C('#ffffff'), { r1: 0.05 });
  B.push(-0.35, 0.2, 0.55);
  B.box('solid', -0.03, 0, -0.02, 0.03, 0.03, 0.02, STEEL);
  B.box('solid', -0.035, 0.25, -0.62, 0.035, 0.29, 0.62, C('#5b6168'));
  for (let t = -0.55; t <= 0.55; t += 0.22) B.box('solid', -0.01, 0, t - 0.01, 0.01, 0.27 + t * 0.0, t + 0.01, STEEL);
  B.pop();
  // switchyard where the lines start
  gantry(B, 0.75, 1.35, 0.75, 0.48);
  transformer(B, 0.9, 1.05); transformer(B, 1.2, 1.05);
  fence(B, 0.62, 0.6, 1.45, 1.42, null, 0.06);
  office(B, rng, 0.0, 0.85, 0.5, 1.3, 2, 'br_win_red', 'br_wall_red', 0.22);
  sign(B, rng, 'kraftwerk', 0.25, 0.3, 1.3, 0.3);
  meta.anchor = [1.05, 0.75, 0.48];
  meta.height = 2.6;
  meta.lamps.push([-1.3, 1.4], [0.6, 1.4]);
}

function gasPlant(B, rng, meta, LW, LD) {
  ground(B, LW, LD, 'asphalt', '#d6d6d4');
  setTint(null);
  boxWalls(B, rng, -0.88, -0.65, 0.3, 0.25, 0, [0.5], (s, f, k) => (s === 0 && k % 2 ? 'office_band' : 'metal_white'), 0.2);
  flatRoof(B, -0.88, -0.65, 0.3, 0.25, 0.5, { parapet: 0.02, pcol: '#c9ced3' });
  B.box('shiny', -0.7, 0.5, -0.5, -0.1, 0.58, 0.1, C('#d9dde0'));
  boxWalls(B, rng, 0.36, -0.82, 0.86, -0.12, 0, [0.42, 0.42], () => 'metal_grey', 0.18);
  flatRoof(B, 0.36, -0.82, 0.86, -0.12, 0.84, { parapet: 0.02, pcol: '#8d949b' });
  for (const z of [-0.64, -0.3]) {
    B.cyl('shiny', 0.62, 0.84, z, 0.065, 0.78, 14, C('#c9ced3'));
    B.cyl('solid', 0.62, 1.6, z, 0.068, 0.02, 14, C('#4a4f55'));
    meta.smoke.push([0.62, 1.64, z]);
  }
  // yellow gas pipeline
  B.box('solid', -0.95, 0.04, 0.4, 0.3, 0.07, 0.43, C('#e6b422'));
  B.box('solid', 0.27, 0.04, 0.25, 0.3, 0.07, 0.43, C('#e6b422'));
  for (let x = -0.9; x < 0.3; x += 0.2) B.box('solid', x - 0.006, 0, 0.41, x + 0.006, 0.04, 0.42, STEEL);
  gantry(B, 0.45, 0.9, 0.45, 0.42);
  transformer(B, 0.6, 0.72);
  fence(B, 0.38, 0.3, 0.96, 0.96, null, 0.06);
  aoDecal(B, -0.88, -0.82, 0.86, 0.25, 0.1);
  sign(B, rng, 'kraftwerk', -0.3, 0.3, 0.25, 0.3);
  meta.anchor = [0.68, 0.45, 0.42];
  meta.height = 1.65;
}

// ================================================================ water
function well(B, rng, meta, LW, LD) {
  lawn(B, LW, LD);
  fence(B, -0.46, -0.46, 0.46, 0.46, 0.0, 0.06);
  setTint(null);
  boxWalls(B, rng, -0.18, -0.12, 0.18, 0.18, 0, [0.22], (s) => (s === 0 ? 'br_door_red' : 'br_win_red'), 0.18);
  hipRoof(B, 0.36, 0.3, 0.22, 0.12, C('#b6482f'), { over: 0.03 });
  aoDecal(B, -0.18, -0.12, 0.18, 0.18, 0.06);
  for (const x of [-0.3, 0.3]) {
    B.cyl('solid', x, 0, -0.3, 0.05, 0.04, 10, CONC);
    B.cyl('solid', x, 0.04, -0.3, 0.035, 0.006, 10, C('#3a4a5a'));
  }
  B.box('solid', -0.3, 0.02, -0.31, 0.3, 0.035, -0.29, C('#2f6db5'));
  meta.trees.push([0.33, -0.32, 'round', 0.8]);
  meta.door = [0, 0.3];
  meta.height = 0.34;
}

function watertower(B, rng, meta, LW, LD) {
  lawn(B, LW, LD);
  B.rect('cobble', -0.3, -0.3, 0.3, 0.5, 0.006, C('#e8e1d4'), 1.1);
  setTint(null);
  lathe(B, 0, 0, [[0.21, 0], [0.21, 0.08]], 8, C('#a39d92'));
  disc(B, 'solid', 0, 0, 0.08, 0.21, 8, C('#a39d92'));
  lathe(B, 0, 0, [[0.16, 0.08], [0.15, 0.55], [0.145, 0.98]], 12, null, 'br_wall_red', rng);
  fq(B, 'br_door_red', [-0.06, 0.08, 0.16], [0.06, 0.08, 0.16], [0.06, 0.24, 0.16], [-0.06, 0.24, 0.16], rng);
  // corbelled transition to the tank head
  lathe(B, 0, 0, [[0.145, 0.98], [0.3, 1.08]], 8, C('#9b4a35'));
  disc(B, 'solid', 0, 0, 0.98, 0.15, 8, C('#7a3a2a'));
  lathe(B, 0, 0, [[0.3, 1.08], [0.3, 1.42]], 8, null, 'wt_head', rng);
  lathe(B, 0, 0, [[0.32, 1.42], [0.32, 1.45]], 8, C('#efebe2'));
  disc(B, 'solid', 0, 0, 1.45, 0.32, 8, C('#efebe2'));
  coneTop(B, 0, 0, 1.45, 0.33, 0.24, 8, C('#8c95a2'), 'slate');
  lathe(B, 0, 0, [[0.06, 1.62], [0.06, 1.72]], 8, C('#efebe2'));
  coneTop(B, 0, 0, 1.72, 0.075, 0.12, 8, C('#7fb59d'), 'metal');
  B.cyl('solid', 0, 1.84, 0, 0.004, 0.1, 4, C('#3a3a3a'));
  meta.door = [0, 0.3];
  meta.height = 1.9;
  meta.trees.push([-0.36, -0.36, 'round', 0.9], [0.36, -0.36, 'tall', 0.85]);
}

function waterworks(B, rng, meta, LW, LD) {
  lawn(B, LW, LD);
  B.rect('flat', -0.95, -0.2, 0.2, 0.95, 0.006, C('#d6d3cb'), 0.5);
  setTint(null);
  boxWalls(B, rng, -0.88, -0.15, 0.12, 0.42, 0, [0.36], (s, f, k) => (s === 0 && k === 2 ? 'br_door_red' : 'plant_hall'), 0.2);
  hipRoof(B, 1.0, 0.57, 0.36, 0.2, C('#b6482f'), { over: 0.04 });
  aoDecal(B, -0.88, -0.15, 0.12, 0.42, 0.08);
  sign(B, rng, 'wasserwerk', -0.38, 0.24, 0.42, 0.34);
  for (const [x, z] of [[0.5, -0.5], [0.52, 0.32]]) {
    lathe(B, x, z, [[0.33, 0], [0.33, 0.07]], 20, CONC);
    lathe(B, x, z, [[0.31, 0.07], [0.31, 0.04]], 20, shade(CONC, 0.8), null, rng, 'solid', true);
    disc(B, 'glass', x, z, 0.05, 0.31, 20, C('#4f9fae'));
    B.box('solid', x - 0.31, 0.07, z - 0.01, x + 0.31, 0.08, z + 0.01, STEEL);
  }
  // covered clean-water reservoir under a grassy mound
  B.box('grass', -0.85, 0, -0.85, -0.2, 0.07, -0.35, C('#dfe8cf'), { s: 0.5 });
  for (const x of [-0.7, -0.35]) B.cyl('solid', x, 0.07, -0.6, 0.02, 0.06, 8, C('#d9d4ca'));
  B.box('solid', 0.1, 0.03, -0.15, 0.95, 0.06, -0.12, C('#2f6db5'));
  meta.door = [-0.18, 0.5];
  meta.height = 0.56;
  meta.anchor = null;
}

function sewagePlant(B, rng, meta, LW, LD) {
  lawn(B, LW, LD);
  B.rect('flat', -0.95, -0.95, 0.95, 0.95, 0.006, C('#d6d3cb'), 0.5);
  setTint(null);
  for (const x of [-0.5, 0.15]) {
    const z = -0.42;
    lathe(B, x, z, [[0.3, 0], [0.3, 0.08]], 22, CONC);
    disc(B, 'glass', x, z, 0.06, 0.29, 22, C('#6e7a52'));
    B.cyl('solid', x, 0.06, z, 0.03, 0.05, 10, C('#9aa1a7'));
    B.box('solid', x - 0.29, 0.09, z - 0.015, x, 0.11, z + 0.015, C('#7d868d'));
  }
  // aeration basin
  B.box('solid', -0.88, 0, 0.06, 0.42, 0.08, 0.5, CONC, { noTop: true });
  B.rect('basin', -0.86, 0.08, 0.4, 0.48, 0.06, C('#ffffff'), 0.5);
  for (const z of [0.2, 0.34]) B.box('solid', -0.86, 0.08, z - 0.01, 0.4, 0.09, z + 0.01, CONC);
  // egg-shaped digesters
  for (const z of [-0.55, 0.05]) {
    B.sphere('shiny', 0.72, 0.44, z, 0.15, 0.44, 0.15, C('#c9ced3'), 14, 10);
    B.cyl('solid', 0.72, 0.86, z, 0.03, 0.06, 8, C('#7d868d'));
  }
  lattice(B, 0.72, -0.25, 0.8, 0.06);
  B.box('solid', 0.72, 0.78, -0.48, 0.73, 0.8, 0.0, STEEL);
  office(B, rng, 0.45, 0.55, 0.92, 0.92, 1, 'br_win_red', 'br_wall_red', 0.24);
  sign(B, rng, 'klaer', 0.68, 0.14, 0.92, 0.3);
  meta.door = [0.68, 1.0];
  meta.height = 0.9;
}

// ================================================================ waste
function landfill(B, rng, meta, LW, LD, b) {
  B.rect('dirt', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#cdbfa8'), 1.5);
  const f = Math.min(1, (b?.fill || 0) / 4000);
  const lv = Math.min(10, Math.floor(f * 10 + 0.0001)) / 10;
  const h = 0.06 + lv * 0.62;
  const cx = -0.12, cz = -0.12, r0 = 1.15, r1 = Math.max(0.35, r0 - 0.15 - h * 0.9);
  // mound: earth-covered slopes, open working face on top
  const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < 4; i++) {
    const a = P[i], c = P[(i + 1) % 4];
    B.quad('dirt', [cx + a[0] * r0, 0.006, cz + a[1] * r0], [cx + c[0] * r0, 0.006, cz + c[1] * r0], [cx + c[0] * r1, h, cz + c[1] * r1], [cx + a[0] * r1, h, cz + a[1] * r1], C('#a99a7c'));
  }
  B.rect('trash', cx - r1, cz - r1, cx + r1, cz + r1, h, C('#ffffff'), 0.6);
  // green restored part on one side
  if (lv >= 0.4) B.quad('grass', [cx - r0, 0.008, cz + r0], [cx - r0, 0.008, cz - r0], [cx - r1, h, cz - r1], [cx - r1, h, cz + r1], C('#cfdcae'));
  // compactor working on top
  B.push(cx + r1 * 0.3, cz - r1 * 0.2, 0.6);
  B.box('solid', -0.07, h, -0.045, 0.07, h + 0.06, 0.045, C('#e6b422'));
  B.box('solid', -0.03, h + 0.06, -0.035, 0.04, h + 0.1, 0.035, C('#2f3236'));
  for (const s of [-1, 1]) for (const t of [-1, 1]) B.cyl('solid', s * 0.05, h, t * 0.05, 0.022, 0.02, 8, C('#3a3a3a'));
  B.pop();
  // gas flare and the gate with the weighbridge
  B.cyl('solid', 1.2, 0, -1.2, 0.012, 0.32, 6, STEEL);
  B.cyl('glow', 1.2, 0.32, -1.2, 0.02, 0.04, 6, C('#ffb347'), { lit: 0.02, r1: 0.008 });
  fence(B, -LW / 2 + 0.04, -LD / 2 + 0.04, LW / 2 - 0.04, LD / 2 - 0.04, 0.9);
  B.rect('asphalt', 0.75, 0.9, 1.05, 1.5, 0.007, C('#cfcfcd'), 2);
  B.box('solid', 0.78, 0, 1.05, 1.02, 0.02, 1.3, C('#8d949b'));
  office(B, rng, 1.1, 1.05, 1.42, 1.38, 1, 'br_win_red', 'br_wall_red', 0.2);
  meta.trees.push([-1.3, 1.3, 'tall', 0.9], [-0.9, 1.35, 'round', 0.9], [1.3, -0.4, 'tall', 0.9], [-1.35, -1.3, 'conifer', 0.9]);
  meta.door = [0.9, 1.55];
  meta.height = h + 0.15;
  meta.fillLevel = lv;
}

function recycling(B, rng, meta, LW, LD) {
  ground(B, LW, LD, 'asphalt', '#d6d6d4');
  fence(B, -LW / 2 + 0.03, -LD / 2 + 0.03, LW / 2 - 0.03, LD / 2 - 0.03, 0.0, 0.06);
  const cols = [['#2f6db5', '#e9e2d0'], ['#e6b422', '#f1c40f'], ['#2e7d4f', '#9fd0a8'], ['#7a5434', '#8a6a44'], ['#6b7075', '#9aa1a7'], ['#c0392b', '#d9d4ca']];
  for (let i = 0; i < 6; i++) {
    const x = -0.85 + i * 0.27;
    const [c, fill] = cols[i];
    B.box('solid', x, 0, -0.38, x + 0.22, 0.1, -0.08, C(c), { noTop: true });
    B.rect('solid', x + 0.01, -0.37, x + 0.21, -0.09, 0.085, C(fill), 1);
    for (let j = 0; j < 3; j++) B.box('solid', x + 0.03 + j * 0.06, 0.08, -0.3 + (j % 2) * 0.1, x + 0.07 + j * 0.06, 0.1, -0.26 + (j % 2) * 0.1, C(fill));
  }
  // ramp along the containers
  B.quad('solid', [-0.9, 0.0, 0.12], [0.75, 0.0, 0.12], [0.75, 0.1, -0.06], [-0.9, 0.1, -0.06], C('#bdb8ae'));
  for (let x = -0.9; x <= 0.75; x += 0.15) B.box('solid', x, 0.1, -0.075, x + 0.006, 0.17, -0.069, C('#e6b422'));
  setTint('#f4f2ec');
  boxWalls(B, rng, 0.62, 0.08, 0.95, 0.4, 0, [0.16], (s) => (s === 0 ? 'apt_win' : 'apt_wall'), 0.16);
  flatRoof(B, 0.62, 0.08, 0.95, 0.4, 0.16, { parapet: 0.01 });
  setTint(null);
  sign(B, rng, 'wertstoff', 0.0, 0.1, 0.4, 0.32);
  B.box('solid', -0.15, 0, 0.36, 0.15, 0.1, 0.38, C('#3a3d42'));
  meta.door = [0.78, 0.5];
  meta.height = 0.25;
}

function incinerator(B, rng, meta, LW, LD) {
  ground(B, LW, LD, 'asphalt', '#d6d6d4');
  setTint(null);
  boxWalls(B, rng, -0.82, -0.75, 0.38, 0.22, 0, [0.38, 0.38], () => 'mva_panel', 0.22);
  flatRoof(B, -0.82, -0.75, 0.38, 0.22, 0.76, { parapet: 0.02, pcol: '#3a3f46' });
  boxWalls(B, rng, -0.82, 0.22, 0.0, 0.62, 0, [0.42], (s, f, k) => (s === 0 ? 'metal_dock' : 'metal_grey'), 0.27);
  flatRoof(B, -0.82, 0.22, 0.0, 0.62, 0.42, { parapet: 0.02, pcol: '#8d949b' });
  boxWalls(B, rng, 0.44, -0.75, 0.86, -0.1, 0, [0.62], () => 'metal_white', 0.2);
  flatRoof(B, 0.44, -0.75, 0.86, -0.1, 0.62, { parapet: 0.02 });
  B.box('solid', 0.38, 0.5, -0.5, 0.44, 0.56, -0.4, C('#9aa1a7'));
  // chimney
  B.cyl('shiny', 0.65, 0, 0.22, 0.075, 1.9, 16, C('#c9ced3'), { r1: 0.06 });
  B.cyl('solid', 0.65, 1.78, 0.22, 0.063, 0.1, 16, C('#c0392b'));
  meta.smoke.push([0.65, 1.92, 0.22]);
  aoDecal(B, -0.82, -0.75, 0.86, 0.62, 0.1);
  sign(B, rng, 'mva', -0.22, 0.6, 0.22, 0.46);
  transformer(B, 0.7, 0.75);
  meta.anchor = [0.7, 0.75, 0.2];
  meta.door = [-0.4, 0.75];
  meta.height = 1.95;
}

// ================================================================ health
function clinic(B, rng, meta, LW, LD) {
  lawn(B, LW, LD);
  const S = houseStyle(rng, 'plaster', { win: 'win_p', fam: pick(rng, ['light', 'warm']) });
  const w = 0.58, d = 0.44, fz = 0.26;
  B.rect('cobble', -0.5, fz, 0.5, 0.5, 0.006, C('#e8e1d4'), 1.1);
  B.push(0, fz - d / 2);
  const { W, D, yw } = body(B, rng, S, w, d, 2, 0.25, { nbF: 3, doorK: 1 });
  mainRoof(B, rng, S, 'hip', 'x', W, D, yw, 0.72);
  sign(B, rng, 'praxis', 0, 0.21, d / 2, 0.24);
  canopy(B, S.roof, 0, d / 2, 0.2, 0.18);
  steps(B, 0, d / 2, 0.1);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  B.pop();
  setTint(null);
  B.box('solid', 0.32, 0, 0.3, 0.36, 0.16, 0.34, C('#2f3236'));
  B.box('solid', 0.28, 0.12, 0.33, 0.4, 0.2, 0.345, C('#ffffff'));
  fq(B, 'redcross', [0.31, 0.13, 0.346], [0.37, 0.13, 0.346], [0.37, 0.19, 0.346], [0.31, 0.19, 0.346], rng);
  meta.trees.push([-0.36, -0.36, 'round', 0.9]);
  meta.door = [0, fz + 0.04];
  meta.height = 0.75;
}

function rescue(B, rng, meta, LW, LD) {
  ground(B, LW, LD, 'asphalt', '#d6d6d4');
  setTint('#f4f2ec');
  const z0 = -0.38, z1 = 0.12;
  boxWalls(B, rng, -0.95, z0, 0.25, z1, 0, [0.32], (s, f, k) => (s === 0 ? 'rescue_gate' : 'apt_wall'), 0.4);
  flatRoof(B, -0.95, z0, 0.25, z1, 0.32, { parapet: 0.02 });
  boxWalls(B, rng, 0.25, z0, 0.95, z1, 0, [0.28, 0.25], (s, f, k) => (s === 0 && f === 0 && k === 0 ? 'apt_door' : 'apt_win'), 0.23);
  flatRoof(B, 0.25, z0, 0.95, z1, 0.53, { parapet: 0.02 });
  setTint(null);
  B.box('solid', -0.95, 0.3, z1, 0.25, 0.33, z1 + 0.012, C('#c4161c'));
  sign(B, rng, 'rettung', -0.35, 0.335, z1, 0.5);
  B.box('solid', 0.48, 0.31, z1, 0.72, 0.5, z1 + 0.012, C('#ffffff'));
  fq(B, 'redcross', [0.52, 0.32, z1 + 0.013], [0.68, 0.32, z1 + 0.013], [0.68, 0.48, z1 + 0.013], [0.52, 0.48, z1 + 0.013], rng);
  lattice(B, 0.8, -0.25, 0.95, 0.04);
  aoDecal(B, -0.95, z0, 0.95, z1, 0.08);
  parkedCar(B, -0.55, 0.3, 0, rng, 'ambulance');
  meta.door = [0.4, 0.3];
  meta.height = 1.0;
}

// ================================================================ parking
// surface car park: two rows of bays along an aisle, cars come and go (meta.bays)
function parkingLot(B, rng, meta) {
  B.rect('asphalt', -0.5, -0.5, 0.5, 0.5, 0.005, C('#d0d0ce'), 2);
  const line = C('#f4f2ec');
  const bays = [];
  const bw = 0.115, x0 = -0.46;
  for (const [z0, z1, face] of [[-0.46, -0.16, 0], [0.12, 0.42, Math.PI]]) {
    for (let i = 0; i <= 8; i++) {
      const x = x0 + i * bw;
      if (face && i >= 3 && i <= 5) continue; // entrance gap toward the street
      B.box('solid', x - 0.004, 0.005, z0, x + 0.004, 0.0075, z1, line);
    }
    for (let i = 0; i < 8; i++) {
      if (face && (i === 3 || i === 4)) continue;
      bays.push([x0 + (i + 0.5) * bw, (z0 + z1) / 2, 0, face ? 1 : -1]);
    }
  }
  // arrows on the aisle, ticket machine, P sign, hedges and lamps
  B.box('solid', 0.0, 0.0, -0.02, 0.012, 0.006, 0.08, line);
  B.box('solid', 0.38, 0, 0.44, 0.41, 0.07, 0.47, C('#3a3d42'));
  B.box('solid', 0.375, 0.04, 0.47, 0.415, 0.065, 0.472, C('#f2c230'));
  B.box('solid', -0.44, 0, 0.45, -0.43, 0.2, 0.46, C('#5b6168'));
  B.box('solid', -0.48, 0.15, 0.455, -0.39, 0.24, 0.462, C('#1f5fa8'));
  B.box('solid', -0.455, 0.17, 0.462, -0.448, 0.22, 0.464, C('#ffffff'));
  B.box('solid', -0.448, 0.205, 0.462, -0.425, 0.22, 0.464, C('#ffffff'));
  B.box('solid', -0.448, 0.188, 0.462, -0.43, 0.195, 0.464, C('#ffffff'));
  B.box('solid', -0.43, 0.195, 0.462, -0.425, 0.205, 0.464, C('#ffffff'));
  hedge(B, -0.49, -0.49, 0.49, -0.47, 0.05);
  meta.lamps.push([-0.47, 0.0], [0.47, 0.0]);
  meta.trees.push([-0.47, -0.3, 'round', 0.6], [0.47, -0.3, 'round', 0.6]);
  meta.bays = bays;
  meta.door = [0, 0.48];
  meta.height = 0.25;
}

// entrance of an underground car park: Meshy model, or a ramp with a glass pavilion
function garage(B, rng, meta) {
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C('#e8e1d4'), 1.1);
  if (hasModel('tiefgarage')) {
    meta.model = { name: 'tiefgarage', x: 0, z: 0, yaw: 0, fit: 0.98 };
  } else {
    B.box('solid', -0.2, 0, -0.3, -0.16, 0.06, 0.5, CONC);
    B.box('solid', 0.16, 0, -0.3, 0.2, 0.06, 0.5, CONC);
    B.quad('solid', [-0.16, 0.0, 0.5], [0.16, 0.0, 0.5], [0.16, -0.12, -0.3], [-0.16, -0.12, -0.3], C('#8d8d8b'));
    B.box('glass', -0.22, 0, -0.42, 0.22, 0.14, -0.3, C('#cfe6ea'));
    B.box('grass', -0.24, 0.14, -0.44, 0.24, 0.16, -0.18, C('#cfdcae'));
    hedge(B, -0.45, -0.45, -0.3, 0.45, 0.06); hedge(B, 0.3, -0.45, 0.45, 0.45, 0.06);
  }
  // the little square on top
  meta.trees.push([-0.38, -0.38, 'round', 0.8], [0.38, -0.38, 'round', 0.8]);
  meta.lamps.push([0.4, 0.4]);
  meta.door = [0, 0.48];
  meta.height = 0.3;
}

// multi-storey car park: Meshy model, or concrete decks with parked cars
function parkhaus(B, rng, meta, LW, LD) {
  B.rect('asphalt', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#d0d0ce'), 2);
  if (hasModel('parkhaus')) {
    meta.model = { name: 'parkhaus', x: 0, z: -0.04, yaw: 0, fit: 1.86 };
    meta.height = 1.2;
  } else {
    const w = 1.7, d = 1.6, lv = 4, fh = 0.22;
    for (let i = 0; i <= lv; i++) {
      const y = i * fh;
      B.box('solid', -w / 2, y, -d / 2, w / 2, y + 0.03, d / 2, CONC);
      if (i < lv) for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2]]) B.box('solid', x - 0.03, y, z - 0.03, x + 0.03, y + fh, z + 0.03, shade(CONC, 0.9));
      if (i > 0) B.box('solid', -w / 2, y + 0.03, d / 2 - 0.01, w / 2, y + 0.08, d / 2, C('#c9a26a'));
    }
    for (let i = 0; i <= lv; i++) for (let k = 0; k < 6; k++) if (rng() < 0.6) parkedCar(B, -0.6 + k * 0.24, -0.3 + (k % 2) * 0.55, Math.PI / 2, rng);
    meta.height = lv * fh + 0.05;
  }
  meta.door = [0, LD / 2 - 0.02];
  meta.lamps.push([-0.9, 0.95], [0.9, 0.95]);
}

export const GEN = {
  parking: parkingLot, garage, parkhaus,
  substation, wind, solar, battery, hydro, coal: coalPlant, gas: gasPlant,
  well, watertower, waterworks, sewage: sewagePlant,
  landfill, recycling, incinerator, clinic, rescue,
};
