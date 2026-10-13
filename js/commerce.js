import { col, pick, randRange, randInt } from './util.js';
import { SHOP_TYPES, AWNING_COLS } from './config.js';
import * as MD from './models.js';
import {
  fq, setTint, facade, boxWalls, flatRoof, hipRoof, aoDecal, plinth, cornice, sign, awning, rooftopStuff, hedge, parking,
  shopProps, plazaGround, balconyRow, parkedCar, chimney, BIN_COLS, WHITE, comL1 as ladenhaus, comL2 as geschaeftshaus, comL3 as bueroGeschaeft, comL4 as stufenturm,
} from './buildgen.js';
import { wpick, forcedVariant, houseStyle, facadeColor, body, mainRoof, mansardDormerAt, townYard, buerger, railing, bikes } from './houses.js';

// ---------------------------------------------------------------------------
// Commercial catalogue: from the kiosk to the skyscraper. Lots are 1x1 up to
// level 3 and 2x2 for level 4; the street is at local +z.
// ---------------------------------------------------------------------------

const C = col;
const shopOf = (sg) => SHOP_TYPES.find((s) => s.sign === sg);
const STONE_C = '#d9cdb5';

// facades along a convex polygon (points by increasing angle, seen from above)
function prism(B, rng, pts, y0, fhs, cellFn, bay = 0.22) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + 1) % n], b = pts[i];
    facade(B, rng, a[0], a[1], b[0], b[1], y0, fhs, (f, k, nb) => cellFn(i, f, k, nb), bay);
  }
}
function polyCap(B, bn, pts, y, c) {
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cz += p[1]; }
  cx /= pts.length; cz /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    B.tri(bn, [cx, y, cz], [b[0], y, b[1]], [a[0], y, a[1]], c, [cx, -cz, b[0], -b[1], a[0], -a[1]]);
  }
}
// chamfered square, half size r, corner cut c
function octPts(r, c) {
  return [[r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c], [-r + c, -r], [r - c, -r]];
}
function polyParapet(B, pts, y, h, c) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i + 1) % pts.length], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    B.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(-dz, dx));
    B.box('solid', -L / 2 - 0.006, y, -0.022, L / 2 + 0.006, y + h, 0.004, c);
    B.pop();
  }
}
// spire with an aircraft warning light; zo: offset of the current frame in the lot
function spire(B, meta, x, z, y, h, r = 0.03, cc = '#cfd3d6', zo = 0) {
  B.cyl('shiny', x, y, z, r, h, 8, C(cc), { r1: 0.003 });
  B.box('glow', x - 0.012, y + h - 0.01, z - 0.012, x + 0.012, y + h + 0.014, z + 0.012, C('#ff3020'), { lit: 0.01 });
  meta.beacon = [x, z + zo, y + h];
}
function helipad(B, y) {
  B.cyl('solid', 0, y, 0, 0.22, 0.03, 16, C('#3f4650'));
  B.cyl('solid', 0, y + 0.03, 0, 0.17, 0.004, 16, C('#f2c230'));
  B.cyl('solid', 0, y + 0.031, 0, 0.15, 0.004, 16, C('#3f4650'));
  B.box('solid', -0.06, y + 0.034, -0.008 - 0.04, -0.045, y + 0.038, 0.09 - 0.04, WHITE);
  B.box('solid', 0.045, y + 0.034, -0.008 - 0.04, 0.06, y + 0.038, 0.09 - 0.04, WHITE);
  B.box('solid', -0.05, y + 0.034, -0.005, 0.05, y + 0.038, 0.007, WHITE);
}
function lamps(B, meta, pts) { for (const [x, z] of pts) { MD.lampPost(B, x, z); meta.lamps.push([x, z]); } }
const sum = (a) => a.reduce((s, v) => s + v, 0);

// ================================================================ level 1
// small kiosk pavilion with a big flat roof, newspapers and a bench
function kiosk(B, rng, meta) {
  const shop = shopOf(pick(rng, ['kiosk', 'kiosk', 'eis']));
  meta.shop = shop;
  B.rect('grass', -0.5, -0.5, 0.5, 0.5, 0.004, C('#eef2e0'), 3);
  B.rect('cobble', -0.5, -0.12, 0.5, 0.5, 0.006, C('#ece4d6'), 1.1);
  hedge(B, -0.48, -0.48, 0.48, -0.44);
  const cx = randRange(rng, -0.12, 0.08), cz = 0.12, w = 0.4, d = 0.26, h = 0.21;
  setTint(facadeColor(rng, pick(rng, ['warm', 'cool', 'light'])));
  B.push(cx, cz);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2, 0.06);
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, [h], (s, f, k) => (s === 0 ? (k === 0 ? 'shopdoor' : `shop_${shop.k === 'icecream' ? 'icecream' : 'general'}`) : s === 2 ? 'wall' : 'win_p'), 0.2);
  const rc = C(pick(rng, ['#2f6db5', '#c0392b', '#2e7d4f', '#3a3d42']));
  B.box('solid', -w / 2 - 0.06, h, -d / 2 - 0.04, w / 2 + 0.06, h + 0.022, d / 2 + 0.09, rc);
  B.rect('flat', -w / 2 - 0.05, -d / 2 - 0.03, w / 2 + 0.05, d / 2 + 0.08, h + 0.0225, C('#c9c6be'), 0.5);
  sign(B, rng, shop.sign, 0.04, h + 0.022, d / 2 + 0.09, 0.26);
  for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) B.box('solid', x - 0.006, 0, d / 2 + 0.07, x + 0.006, h, d / 2 + 0.082, C('#3a3d42'));
  // newspaper rack and freezer
  B.box('solid', -w / 2 + 0.02, 0, d / 2 + 0.02, -w / 2 + 0.1, 0.07, d / 2 + 0.05, C('#5a5f66'));
  for (let i = 0; i < 4; i++) B.quad('solid', [-w / 2 + 0.024 + i * 0.019, 0.03, d / 2 + 0.051], [-w / 2 + 0.04 + i * 0.019, 0.03, d / 2 + 0.051], [-w / 2 + 0.04 + i * 0.019, 0.066, d / 2 + 0.051], [-w / 2 + 0.024 + i * 0.019, 0.066, d / 2 + 0.051], C(pick(rng, ['#f2f2ee', '#e74c3c', '#f1c40f', '#3498db'])));
  B.box('solid', w / 2 - 0.12, 0, d / 2 + 0.02, w / 2 - 0.02, 0.05, d / 2 + 0.07, C('#f4f4f2'), { top: C('#8fc6e8') });
  B.pop();
  MD.bench(B, cx + 0.05, 0.36, 0);
  MD.bin(B, cx + 0.2, 0.38, C(BIN_COLS[1]));
  // advertising column (Litfaßsäule)
  const lx = cx > 0 ? -0.34 : 0.34;
  B.cyl('solid', lx, 0, 0.3, 0.045, 0.16, 12, C(pick(rng, ['#e8d9b0', '#f2e6c9'])));
  for (let i = 0; i < 3; i++) B.cyl('solid', lx, 0.03 + i * 0.04, 0.3, 0.0465, 0.03, 12, C(pick(rng, ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#ffffff', '#8e44ad'])), { cap: false });
  B.cyl('solid', lx, 0.16, 0.3, 0.052, 0.015, 12, C('#2f5f3a'), { r1: 0.03 });
  bikes(B, rng, cx - 0.2, -0.02, 2);
  meta.trees.push([pick(rng, [-0.32, 0.32]), -0.33, pick(rng, ['round', 'tall']), randRange(rng, 0.85, 1.05)]);
  meta.door = [cx - w / 2 + 0.1, cz + d / 2 + 0.03];
  meta.height = h + 0.05;
  meta.shell = { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, fhs: [h], roofH: 0, mat: 'conc' };
}

// half-timbered house with a shop on the ground floor
function fachLaden(B, rng, meta) {
  const S = houseStyle(rng, pick(rng, ['fach', 'fach', 'fwfr', 'fwsw']));
  const shop = pick(rng, SHOP_TYPES);
  meta.shop = shop;
  const w = randRange(rng, 0.6, 0.7), d = randRange(rng, 0.46, 0.52), fz = shop.out ? 0.3 : 0.38;
  const floors = rng() < 0.6 ? 2 : 3, fhs = [0.29, ...Array(floors - 1).fill(0.25)];
  townYard(B, rng, meta, fz, d);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.03);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nbF = 3, doorK = rng() < 0.5 ? 0 : 2;
  const { W, D, yw } = body(B, rng, S, w, d, floors, fhs, { nbF, doorK, shop });
  const gableFront = rng() < 0.55;
  const r = mainRoof(B, rng, S, gableFront ? 'gable' : rng() < 0.6 ? 'gable' : 'halfhip', gableFront ? 'z' : 'x', W, D, yw, randRange(rng, 0.9, 1.05));
  const sx = doorK === 0 ? w / 6 : -w / 6;
  sign(B, rng, shop.sign, sx, fhs[0] - 0.062, d / 2, 0.26);
  awning(B, sx - w / 3 + 0.01, sx + w / 3 - 0.01, fhs[0] - 0.068, d / 2, 0.12, 0.05, pick(rng, AWNING_COLS));
  if (rng() < 0.6) {
    // hanging bracket sign (Nasenschild)
    const bx = doorK === 0 ? -w / 2 + 0.04 : w / 2 - 0.04;
    B.box('solid', bx - 0.003, fhs[0] + 0.1, d / 2, bx + 0.003, fhs[0] + 0.106, d / 2 + 0.09, C('#2b2b2b'));
    B.push(bx, d / 2 + 0.06, Math.PI / 2);
    MD.cylZ(B, 'solid', 0, fhs[0] + 0.05, -0.004, 0.004, 0.036, 12, C('#c9a24a'));
    B.pop();
  }
  B.pop();
  shopProps(B, rng, shop.out, fz, w);
  meta.door = [-w / 2 + (doorK + 0.5) * w / nbF, fz + 0.03];
  meta.height = yw + r.h;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: r.h, mat: 'brick' };
}

// small filling station with a canopy and a shop
function tankstelle(B, rng, meta) {
  meta.signKey = 'tanke';
  B.rect('asphalt', -0.5, -0.5, 0.5, 0.5, 0.005, C('#d6d6d4'), 2);
  B.rect('grass', -0.5, -0.5, 0.5, -0.38, 0.0055, C('#e6eed6'), 3);
  hedge(B, -0.48, -0.48, 0.48, -0.43);
  // shop at the back
  const w = 0.5, d = 0.22, h = 0.22, sx = 0.18;
  setTint('#f4f2ec');
  B.push(sx, -0.24);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2, 0.05);
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, [h], (s, f, k) => (s === 0 ? (k === 1 ? 'shopdoor' : 'shop_general') : 'metal_white'), 0.17);
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, h, { parapet: 0.04, pcol: '#0d5c3a' });
  B.pop();
  // canopy over two pumps
  const cy = 0.27, cz = 0.12, cw = 0.5, cd = 0.3, cx = -0.12;
  for (const x of [cx - cw / 2 + 0.06, cx + cw / 2 - 0.06]) B.box('solid', x - 0.012, 0, cz - 0.012, x + 0.012, cy, cz + 0.012, C('#e8e8e6'));
  B.box('solid', cx - cw / 2, cy, cz - cd / 2, cx + cw / 2, cy + 0.045, cz + cd / 2, C('#f4f4f2'), { top: C('#c9c6be') });
  B.box('solid', cx - cw / 2 - 0.002, cy + 0.006, cz + cd / 2, cx + cw / 2 + 0.002, cy + 0.03, cz + cd / 2 + 0.002, C('#0d5c3a'));
  B.box('glow', cx - cw / 2 + 0.03, cy - 0.004, cz - cd / 2 + 0.03, cx + cw / 2 - 0.03, cy, cz + cd / 2 - 0.03, C('#fff6e0'), { lit: 0.5 });
  for (const x of [cx - cw / 2 + 0.06, cx + cw / 2 - 0.06]) {
    B.box('solid', x - 0.03, 0, cz - 0.05, x + 0.03, 0.025, cz + 0.05, C('#c9c6be'));
    B.box('solid', x - 0.018, 0.025, cz - 0.03, x + 0.018, 0.11, cz + 0.03, C('#f4f4f2'));
    B.box('solid', x - 0.019, 0.08, cz - 0.031, x + 0.019, 0.1, cz + 0.031, C('#0d5c3a'));
  }
  if (rng() < 0.8) MD.bicycle(B, sx - 0.18, -0.08, 0, C('#c0392b'));
  if (rng() < 0.85) parkedCar(B, cx - 0.04, cz, Math.PI / 2, rng);
  // price pylon at the street
  B.box('solid', 0.39, 0, 0.4, 0.41, 0.22, 0.42, C('#3a3d42'));
  B.box('solid', 0.33, 0.22, 0.4, 0.47, 0.4, 0.425, C('#0d5c3a'));
  sign(B, rng, 'tanke', 0.4, 0.34, 0.425, 0.12);
  for (let i = 0; i < 3; i++) B.box('glow', 0.345, 0.24 + i * 0.03, 0.426, 0.455, 0.262 + i * 0.03, 0.428, C('#ffe9a8'), { lit: 0.7 });
  meta.trees.push([-0.38, -0.36, 'round', 0.8]);
  meta.door = [sx - w / 2 + 1.5 * w / 3, -0.24 + d / 2 + 0.03];
  meta.height = cy + 0.05;
  meta.shell = { x0: sx - w / 2, z0: -0.24 - d / 2, x1: sx + w / 2, z1: -0.24 + d / 2, fhs: [h], roofH: 0, mat: 'conc' };
}

// ================================================================ level 2
// supermarket or specialist store: low hall at the back, car park at the front
function markt(B, rng, meta, kind) {
  const w = 0.92, d = 0.44, h = 0.3, z0 = -0.47, z1 = z0 + d;
  const sg = kind === 'super' ? 'supermarkt' : kind;
  if (kind === 'super') meta.signKey = 'supermarkt';
  else meta.shop = shopOf(sg);
  const front = kind === 'super' ? 'super_front' : kind === 'drogerie' ? 'shop_drug' : 'shop_electro';
  const clad = kind === 'super' ? pick(rng, ['metal_grey', 'metal_white']) : kind === 'drogerie' ? 'metal_white' : 'metal_blue';
  setTint(null);
  B.push(0, (z0 + z1) / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2, 0.06);
  const nb = 4, doorK = rng() < 0.5 ? 0 : 3;
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, [h], (s, f, k) => {
    if (s === 0) return k === doorK ? 'glass_door' : front;
    if (s === 2) return k === 1 ? 'metal_dock' : clad;
    return clad;
  }, w / nb);
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, h, { parapet: 0.05, pcol: kind === 'super' ? '#c8c8c4' : kind === 'drogerie' ? '#2a6db0' : '#1b2a3a' });
  rooftopStuff(B, rng, -w / 2, -d / 2, w / 2, d / 2, h, 3);
  const dx = -w / 2 + (doorK + 0.5) * w / nb;
  B.box('solid', dx - 0.13, h * 0.78, d / 2, dx + 0.13, h * 0.78 + 0.016, d / 2 + 0.1, C('#3a3d42'));
  sign(B, rng, sg, -dx * 0.6, h - 0.07, d / 2, 0.3);
  B.pop();
  parking(B, rng, -0.46, 0.0, 0.46, 0.42, 'x', 0.75);
  // trolley shelter
  const tx = doorK === 0 ? 0.36 : -0.36;
  B.box('solid', tx - 0.07, 0, z1 + 0.02, tx + 0.07, 0.012, z1 + 0.08, C('#9aa0a6'));
  B.box('glass', tx - 0.075, 0.08, z1 + 0.015, tx + 0.075, 0.088, z1 + 0.085, C('#cfe6ea'));
  for (const x of [tx - 0.07, tx + 0.07]) B.box('solid', x - 0.004, 0, z1 + 0.075, x + 0.004, 0.08, z1 + 0.083, C('#5f646b'));
  // pylon sign at the street corner
  const px = doorK === 0 ? -0.44 : 0.44;
  B.box('solid', px - 0.01, 0, 0.44, px + 0.01, 0.3, 0.46, C('#3a3d42'));
  B.box('solid', px - 0.085, 0.3, 0.44, px + 0.085, 0.36, 0.46, C('#2b2b2b'));
  sign(B, rng, sg, px, 0.31, 0.46, 0.16);
  lamps(B, meta, [[0.0, 0.46]]);
  meta.trees.push([-0.44, -0.02, 'tall', 0.8], [0.44, -0.02, 'tall', 0.8]);
  meta.door = [dx, z1 + 0.03];
  meta.height = h + 0.08;
  meta.shell = { x0: -w / 2, z0, x1: w / 2, z1, fhs: [h], roofH: 0, mat: 'conc' };
}

// 1950s commercial building: shop band, canopy, pastel plaster, thin overhanging roof
function geschaeft50(B, rng, meta) {
  const S = houseStyle(rng, 'f50');
  const shop = pick(rng, SHOP_TYPES);
  meta.shop = shop;
  const w = 0.9, d = randRange(rng, 0.56, 0.62), fz = 0.42, floors = randInt(rng, 3, 4);
  const fhs = [0.3, ...Array(floors - 1).fill(0.25)];
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C('#e8e1d4'), 1.1);
  B.push(0, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nbF = 4, doorK = rng() < 0.5 ? 0 : 3;
  const { yw } = body(B, rng, S, w, d, floors, fhs, { nbF, doorK, shop, cell: (s, f, k) => (f > 0 && s === 0 && k === (doorK === 0 ? 3 : 0) ? 'wall' : null) });
  // long thin canopy over the shops
  B.box('solid', -w / 2 - 0.01, fhs[0] - 0.02, d / 2, w / 2 + 0.01, fhs[0] - 0.004, d / 2 + 0.11, C('#e9e6df'));
  B.box('solid', -w / 2 - 0.01, fhs[0] - 0.05, d / 2 + 0.104, w / 2 + 0.01, fhs[0] - 0.004, d / 2 + 0.112, C(pick(rng, ['#2f5f9e', '#c0392b', '#2e7d4f', '#e2a72e'])));
  sign(B, rng, shop.sign, 0, fhs[0], d / 2 + 0.06, 0.32);
  // staircase window strip
  const sx = -w / 2 + ((doorK === 0 ? 3 : 0) + 0.5) * w / nbF;
  for (let f = 1; f < floors; f++) fq(B, 'f50_win', [sx - 0.03, fhs[0] + (f - 1) * 0.25 + 0.04, d / 2 + 0.002], [sx + 0.03, fhs[0] + (f - 1) * 0.25 + 0.04, d / 2 + 0.002], [sx + 0.03, fhs[0] + f * 0.25 - 0.02, d / 2 + 0.002], [sx - 0.03, fhs[0] + f * 0.25 - 0.02, d / 2 + 0.002], rng);
  if (rng() < 0.6) for (let f = 1; f < floors; f++) balconyRow(B, -w / 2 + w / nbF * 1 + 0.02, -w / 2 + w / nbF * 3 - 0.02, d / 2, fhs[0] + (f - 1) * 0.25 + 0.006, 0.05, 'iron');
  // thin flying roof
  B.box('solid', -w / 2 - 0.05, yw, -d / 2 - 0.05, w / 2 + 0.05, yw + 0.018, d / 2 + 0.05, C('#ece9e2'), { top: C('#9c9a93') });
  rooftopStuff(B, rng, -w / 2, -d / 2, w / 2, d / 2, yw + 0.018, 1);
  B.pop();
  shopProps(B, rng, shop.out === 'cafe' ? null : shop.out, fz, w);
  meta.door = [-w / 2 + (doorK + 0.5) * w / nbF, fz + 0.03];
  meta.height = yw + 0.04;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: 0, mat: 'conc' };
}

// ================================================================ level 3
// department store of the 1920s: stone, tall window bays, copper roof, clock
function kaufhaus20(B, rng, meta) {
  meta.signKey = 'kaufhaus';
  const w = 0.94, d = 0.86, fz = 0.46, floors = 5;
  const fhs = [0.36, ...Array(floors - 1).fill(0.29)];
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C('#e5e0d6'), 1.1);
  setTint(null);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.04, C('#b5aa98'));
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nb = 4;
  const shops = ['shop_fashion', 'shop_shoes', 'shop_toys', 'shop_books', 'shop_optic'];
  const sh = [pick(rng, shops), pick(rng, shops)];
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, fhs, (s, f, k) => {
    if (f === 0) {
      if (s === 0) return k === 1 || k === 2 ? 'stone_door' : sh[k > 1 ? 1 : 0];
      if (s === 2) return 'stone_wall_beige';
      return (k === 0 && s === 3) || (k === nb - 1 && s === 1) ? sh[0] : 'stone_wall_beige';
    }
    return s === 2 ? 'stone_win_beige' : 'kauf_win';
  }, w / nb);
  const yw = sum(fhs);
  cornice(B, -w / 2, -d / 2, w / 2, d / 2, fhs[0] - 0.012, 0.02, 0.016, C('#e9e5dc'));
  cornice(B, -w / 2, -d / 2, w / 2, d / 2, yw - 0.03, 0.036, 0.026, C('#efebe2'));
  // set-back attic storey and copper roof
  const ins = 0.07, aw = w - 2 * ins, ad = d - 2 * ins, ah = 0.26;
  boxWalls(B, rng, -aw / 2, -ad / 2, aw / 2, ad / 2, yw, [ah], () => 'stone_win_beige', aw / 4);
  B.rect('flat', -w / 2, -d / 2, w / 2, d / 2, yw + 0.002, C('#c9c6be'), 0.5);
  railing(B, -w / 2 + 0.01, -d / 2 + 0.01, w / 2 - 0.01, d / 2 - 0.01, yw);
  hipRoof(B, aw, ad, yw + ah, 0.2, C('#7fb59d'), { bucket: 'metal', over: 0.03 });
  // clock and flags
  fq(B, 'clock', [-0.07, yw + 0.06, ad / 2 + 0.004], [0.07, yw + 0.06, ad / 2 + 0.004], [0.07, yw + 0.2, ad / 2 + 0.004], [-0.07, yw + 0.2, ad / 2 + 0.004], rng);
  for (const x of [-aw / 3, aw / 3]) {
    B.cyl('solid', x, yw + ah + 0.1, 0, 0.004, 0.2, 4, C('#d0d0d0'));
    B.box('solid', x + 0.004, yw + ah + 0.24, -0.002, x + 0.09, yw + ah + 0.29, 0.002, C(pick(rng, ['#c0392b', '#2f5f9e', '#f1c40f'])));
  }
  sign(B, rng, 'kaufhaus', 0, fhs[0] + 0.01, d / 2, 0.46);
  awning(B, -w / 2 + 0.02, -w / 4 - 0.01, fhs[0] - 0.05, d / 2, 0.1, 0.04, pick(rng, AWNING_COLS));
  awning(B, w / 4 + 0.01, w / 2 - 0.02, fhs[0] - 0.05, d / 2, 0.1, 0.04, pick(rng, AWNING_COLS));
  B.pop();
  lamps(B, meta, [[-0.42, 0.48], [0.42, 0.48]]);
  meta.door = [0, fz + 0.03];
  meta.height = yw + ah + 0.25;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: ah + 0.2, mat: 'brick' };
}

// office blocks: ribbon windows over a recessed glass ground floor, or punched stone
function buero(B, rng, meta, kind) {
  meta.signKey = kind === 'punch' && rng() < 0.5 ? 'bank' : 'buero';
  const w = 0.94, d = 0.82, fz = 0.45, floors = randInt(rng, 6, 9);
  const fh0 = 0.34, fh = 0.28;
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C(kind === 'band' ? '#e1e1dd' : '#e5e0d6'), 1.1);
  setTint(null);
  B.push(0, fz - d / 2);
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const nb = 4;
  if (kind === 'band') {
    const ins = 0.05;
    boxWalls(B, rng, -w / 2 + ins, -d / 2 + ins, w / 2 - ins, d / 2 - ins, 0, [fh0], (s, f, k, n) => (s === 0 && (k === Math.floor(n / 2) || k === Math.floor(n / 2) - 1) ? 'glass_door' : 'glass_dark'), (w - 2 * ins) / nb);
    B.box('solid', -w / 2, fh0 - 0.014, -d / 2, w / 2, fh0, d / 2, C('#d9dbdc'), { bottom: true, noTop: true });
    for (let i = 0; i <= nb; i++) for (const z of [d / 2 - 0.025, -d / 2 + 0.025]) {
      const x = -w / 2 + 0.025 + i * (w - 0.05) / nb;
      B.box('solid', x - 0.013, 0, z - 0.013, x + 0.013, fh0, z + 0.013, C('#d9dbdc'));
    }
  } else {
    boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, 0, [fh0], (s, f, k) => (s === 0 && (k === 1 || k === 2) ? 'glass_door' : s === 0 ? 'stone_win_grey' : 'stone_wall_grey'), w / nb);
  }
  const ups = Array(floors - 1).fill(fh);
  const cell = kind === 'band' ? 'office_band' : 'office_punch';
  boxWalls(B, rng, -w / 2, -d / 2, w / 2, d / 2, fh0, ups, () => cell, kind === 'band' ? w / 3 : w / 5);
  const yw = fh0 + sum(ups);
  if (kind === 'punch') cornice(B, -w / 2, -d / 2, w / 2, d / 2, yw - 0.02, 0.03, 0.02, C('#e9e5dc'));
  flatRoof(B, -w / 2, -d / 2, w / 2, d / 2, yw, { parapet: 0.035, pcol: kind === 'band' ? '#b9bec2' : '#e2dccd' });
  // roof storey
  const pw = w * 0.5, pd = d * 0.45;
  boxWalls(B, rng, -pw / 2, -pd / 2 - 0.1, pw / 2, pd / 2 - 0.1, yw, [0.22], () => 'glass_silver', pw / 2);
  flatRoof(B, -pw / 2, -pd / 2 - 0.1, pw / 2, pd / 2 - 0.1, yw + 0.22, { parapet: 0.02, pcol: '#9aa0a6' });
  rooftopStuff(B, rng, -w / 2, -d / 2, w / 2, d / 2 - 0.3, yw, 2);
  sign(B, rng, meta.signKey, 0, yw - 0.12, d / 2 + 0.002, 0.42);
  B.pop();
  for (const x of [-0.3, 0.3]) MD.bench(B, x, 0.47, 0);
  meta.trees.push([-0.42, 0.42, 'tall', 0.75], [0.42, 0.42, 'tall', 0.75]);
  meta.door = [0, fz + 0.03];
  meta.height = yw + 0.24;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs: [fh0, ...ups], roofH: 0, mat: 'conc' };
}

// grand hotel: tinted plaster, balconies, entrance canopy, mansard roof
function hotel(B, rng, meta) {
  meta.signKey = 'hotel';
  const S = houseStyle(rng, 'plaster', { win: pick(rng, ['win_b', 'win_o', 'win_a']), fam: pick(rng, ['light', 'warm']) });
  S.roof = { bk: 'slate', rc: C('#8c95a2') };
  const w = 0.92, d = 0.72, fz = 0.45, floors = randInt(rng, 5, 6), fh = 0.27;
  const fhs = [0.32, ...Array(floors - 1).fill(fh)];
  B.rect('cobble', -0.5, -0.5, 0.5, 0.5, 0.005, C('#e8e1d4'), 1.1);
  B.push(0, fz - d / 2);
  plinth(B, -w / 2, -d / 2, w / 2, d / 2, 0.05, C('#b5aa98'));
  aoDecal(B, -w / 2, -d / 2, w / 2, d / 2);
  const ground = { win: 'stone_win_beige', side: 'stone_win_beige', wall: 'stone_wall_beige', door: 'glass_door' };
  const { W, D, yw } = body(B, rng, { ...S, g: ground }, w, d, floors, fhs, { nbF: 4, doorK: 1, bands: true, cell: (s, f, k) => (f === 0 && s === 0 && k === 2 ? 'glass_door' : null) });
  cornice(B, -W / 2, -D / 2, W / 2, D / 2, yw - 0.026, 0.032, 0.024, S.trim);
  const r = mainRoof(B, rng, S, 'mansard', 'x', W, D, yw, 0.7);
  for (let i = 0; i < 4; i++) mansardDormerAt(B, rng, S, -W * 3 / 8 + i * W / 4, r.m, 0.1);
  for (let f = 1; f < floors; f++) balconyRow(B, -0.12, 0.12, d / 2, fhs[0] + (f - 1) * fh + 0.01, 0.055, 'iron');
  // entrance canopy with gold edge and flags
  B.box('solid', -0.16, fhs[0] - 0.04, d / 2, 0.16, fhs[0] - 0.02, d / 2 + 0.16, C('#2b2b2b'));
  B.box('solid', -0.162, fhs[0] - 0.044, d / 2 + 0.155, 0.162, fhs[0] - 0.036, d / 2 + 0.165, C('#c9a24a'));
  for (const x of [-0.15, 0.15]) B.box('solid', x - 0.005, 0, d / 2 + 0.15, x + 0.005, fhs[0] - 0.04, d / 2 + 0.16, C('#c9a24a'));
  B.rect('solid', -0.14, d / 2, 0.14, d / 2 + 0.15, 0.007, C('#8e2a2a'));
  const fc = ['#c0392b', '#2f5f9e', '#f1c40f', '#ffffff', '#2e7d4f'];
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + 0.08 + i * 0.07;
    B.box('solid', x - 0.003, fhs[0] + 0.02, d / 2, x + 0.003, fhs[0] + 0.026, d / 2 + 0.14, C('#d0d0d0'));
    B.box('solid', x - 0.002, fhs[0] - 0.06, d / 2 + 0.1, x + 0.002, fhs[0] + 0.02, d / 2 + 0.14, C(pick(rng, fc)));
  }
  sign(B, rng, 'hotel', 0, yw - 0.13, d / 2 + 0.002, 0.34);
  chimney(B, -W * 0.3, -0.05, yw + r.h * 0.5, yw + r.h + 0.05);
  B.pop();
  lamps(B, meta, [[-0.42, 0.48], [0.42, 0.48]]);
  meta.door = [0, fz + 0.03];
  meta.height = yw + r.h;
  meta.shell = { x0: -w / 2, z0: fz - d, x1: w / 2, z1: fz, fhs, roofH: r.h, mat: 'brick' };
}

// ================================================================ level 4 (2x2)
function towerGround(B, rng, meta, LW, LD) {
  plazaGround(B, rng, LW, LD, meta);
  lamps(B, meta, [[-0.85, 0.88], [0.85, 0.88]]);
  MD.bench(B, -0.45, 0.8, 0); MD.bench(B, 0.45, 0.8, 0);
}
function lobby(B, rng, s, zc, fh0) {
  boxWalls(B, rng, -s / 2, zc - s / 2, s / 2, zc + s / 2, 0, [fh0], (side, f, k, nb) => (side === 0 && (k === Math.floor(nb / 2) || k === Math.floor(nb / 2) - 1) ? 'glass_door' : 'glass_dark'), 0.25);
}

// Art-déco skyscraper: stone tiers, vertical piers, stepped crown and spire
function artDeco(B, rng, meta, LW, LD) {
  towerGround(B, rng, meta, LW, LD);
  meta.signKey = 'konzern';
  setTint(null);
  const zc = -0.12, fh = 0.29, total = randInt(rng, 30, 40);
  const tiers = [[1.2, Math.round(total * 0.42)], [0.98, Math.round(total * 0.3)], [0.74, Math.round(total * 0.16)]];
  tiers.push([0.52, total - tiers[0][1] - tiers[1][1] - tiers[2][1]]);
  B.push(0, zc);
  aoDecal(B, -0.6, -0.6, 0.6, 0.6, 0.14);
  let y = 0;
  tiers.forEach(([s, n], ti) => {
    const fhs = Array(n).fill(fh);
    if (ti === 0) {
      fhs[0] = 0.38;
      boxWalls(B, rng, -s / 2, -s / 2, s / 2, s / 2, 0, [0.38], (side, f, k, nb) => (side === 0 && (k === Math.floor(nb / 2) || k === Math.floor(nb / 2) - 1) ? 'stone_door' : 'stone_win_beige'), 0.24);
      boxWalls(B, rng, -s / 2, -s / 2, s / 2, s / 2, 0.38, fhs.slice(1), () => 'sky_deco', 0.24);
    } else boxWalls(B, rng, -s / 2, -s / 2, s / 2, s / 2, y, fhs, () => 'sky_deco', 0.24);
    y += sum(fhs);
    B.box('solid', -s / 2 - 0.012, y - 0.03, -s / 2 - 0.012, s / 2 + 0.012, y, s / 2 + 0.012, C(STONE_C), { noTop: true });
    flatRoof(B, -s / 2, -s / 2, s / 2, s / 2, y, { parapet: 0.03, pcol: STONE_C, col: '#bdb7aa' });
  });
  // stepped metal crown and spire
  let cs = 0.4;
  for (let i = 0; i < 3; i++) {
    B.box('shiny', -cs / 2, y, -cs / 2, cs / 2, y + 0.14, cs / 2, C('#cfd3d6'));
    y += 0.14; cs -= 0.11;
  }
  spire(B, meta, 0, 0, y, 0.9, 0.035, undefined, zc);
  B.box('solid', -0.3, 0.4, 0.6, 0.3, 0.42, 0.66, C('#2c3540'));
  sign(B, rng, 'konzern', 0, 0.43, 0.6, 0.48);
  B.pop();
  meta.door = [0, zc + 0.64];
  meta.height = y + 0.9;
  meta.shell = { x0: -0.6, z0: zc - 0.6, x1: 0.6, z1: zc + 0.6, fhs: Array(total).fill(fh), roofH: 0, mat: 'conc' };
}

// chamfered tower with vertical fins and a helipad
function lamellen(B, rng, meta, LW, LD) {
  towerGround(B, rng, meta, LW, LD);
  meta.signKey = 'tower';
  setTint(null);
  const zc = -0.1, fh = 0.29, floors = randInt(rng, 32, 44), r = 0.6, ch = 0.16;
  B.push(0, zc);
  aoDecal(B, -r, -r, r, r, 0.14);
  const pts = octPts(r, ch);
  const fhs = Array(floors).fill(fh); fhs[0] = 0.38;
  prism(B, rng, pts, 0, fhs, (i, f, k, nb) => (f === 0 ? (i === 2 && (k === 1 || k === 2) ? 'glass_door' : 'glass_dark') : i % 2 === 1 ? 'glass_dark' : 'sky_fin'), 0.22);
  let y = sum(fhs);
  polyCap(B, 'flat', pts, y + 0.001, C('#b9b7b0'));
  polyParapet(B, pts, y, 0.05, C('#aeb6bd'));
  // open crown frame
  const cr = r - 0.06, top = y + 0.36;
  for (const [x, z] of octPts(cr, ch - 0.04)) B.box('solid', x - 0.012, y, z - 0.012, x + 0.012, top, z + 0.012, C('#aeb6bd'));
  const ring = octPts(cr, ch - 0.04);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    B.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
    B.box('solid', -L / 2, top - 0.03, -0.012, L / 2, top, 0.012, C('#aeb6bd'));
    B.pop();
  }
  helipad(B, y + 0.002);
  B.box('solid', -0.32, 0.38, r, 0.32, 0.4, r + 0.08, C('#2c3540'));
  sign(B, rng, 'tower', 0, 0.41, r, 0.48);
  B.pop();
  meta.door = [0, zc + r + 0.04];
  meta.height = top;
  meta.shell = { x0: -r, z0: zc - r, x1: r, z1: zc + r, fhs, roofH: 0, mat: 'conc' };
}

// round diagrid tower: bulging profile, glass dome
function diagrid(B, rng, meta, LW, LD) {
  towerGround(B, rng, meta, LW, LD);
  meta.signKey = 'tower';
  setTint(null);
  const zc = -0.1, fh = 0.3, floors = randInt(rng, 30, 40), n = 14;
  const R0 = 0.5, Rmax = 0.64, Rtop = 0.24;
  const rad = (t) => (t < 0.4 ? R0 + (Rmax - R0) * Math.sin(t / 0.4 * Math.PI / 2) : Rtop + (Rmax - Rtop) * Math.cos((t - 0.4) / 0.6 * Math.PI / 2) ** 0.8);
  B.push(0, zc);
  aoDecal(B, -0.6, -0.6, 0.6, 0.6, 0.14);
  const P = (i, r) => { const a = i / n * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; };
  for (let f = 0; f < floors; f++) {
    const y0 = f * fh, y1 = y0 + fh, r0 = rad(f / floors), r1 = rad((f + 1) / floors);
    for (let i = 0; i < n; i++) {
      const a0 = P(i + 1, r0), b0 = P(i, r0), a1 = P(i + 1, r1), b1 = P(i, r1);
      const cell = f === 0 ? (i === Math.round(n / 4 - 0.5) ? 'glass_door' : 'glass_dark') : 'sky_diag';
      fq(B, cell, [a0[0], y0, a0[1]], [b0[0], y0, b0[1]], [b1[0], y1, b1[1]], [a1[0], y1, a1[1]], rng);
    }
  }
  const y = floors * fh, rt = rad(1);
  const ring = []; for (let i = 0; i < n; i++) ring.push(P(i, rt));
  // dome
  for (let i = 0; i < n; i++) {
    const a = P(i + 1, rt), b = P(i, rt);
    B.tri('glass', [a[0], y, a[1]], [b[0], y, b[1]], [0, y + 0.22, 0], C('#3a4a5e'));
  }
  spire(B, meta, 0, 0, y + 0.2, 0.35, 0.012, undefined, zc);
  B.box('solid', -0.3, 0.3, R0 - 0.02, 0.3, 0.32, R0 + 0.07, C('#2c3540'));
  sign(B, rng, 'tower', 0, 0.33, R0 + 0.07, 0.44);
  B.pop();
  meta.door = [0, zc + R0 + 0.06];
  meta.height = y + 0.55;
  meta.shell = { x0: -0.6, z0: zc - 0.6, x1: 0.6, z1: zc + 0.6, fhs: Array(floors).fill(fh), roofH: 0, mat: 'conc' };
}

// twisted glass tower: each storey turned a little further
function twisted(B, rng, meta, LW, LD) {
  towerGround(B, rng, meta, LW, LD);
  meta.signKey = 'tower';
  setTint(null);
  const zc = -0.1, fh = 0.29, floors = randInt(rng, 30, 40), s = 0.92;
  const tw = (pick(rng, [-1, 1]) * Math.PI / 2) / floors * randRange(rng, 0.7, 1);
  const gk = pick(rng, ['glass_silver', 'glass_blue', 'glass_teal']);
  B.push(0, zc);
  aoDecal(B, -0.6, -0.6, 0.6, 0.6, 0.14);
  lobby(B, rng, s, 0, 0.38);
  for (let f = 1; f < floors; f++) {
    const y0 = 0.38 + (f - 1) * fh;
    B.push(0, 0, tw * f);
    B.box('solid', -s / 2 - 0.018, y0 - 0.012, -s / 2 - 0.018, s / 2 + 0.018, y0 + 0.004, s / 2 + 0.018, C('#e6e8ea'));
    boxWalls(B, rng, -s / 2, -s / 2, s / 2, s / 2, y0, [fh], () => gk, 0.23);
    B.pop();
  }
  const y = 0.38 + (floors - 1) * fh;
  B.push(0, 0, tw * (floors - 1));
  flatRoof(B, -s / 2, -s / 2, s / 2, s / 2, y, { parapet: 0.06, pcol: '#cfd3d6' });
  rooftopStuff(B, rng, -s / 2, -s / 2, s / 2, s / 2, y, 2);
  B.pop();
  B.box('solid', -0.3, 0.38, s / 2, 0.3, 0.4, s / 2 + 0.08, C('#2c3540'));
  sign(B, rng, 'tower', 0, 0.41, s / 2 + 0.04, 0.46);
  B.pop();
  meta.door = [0, zc + s / 2 + 0.04];
  meta.height = y + 0.1;
  meta.shell = { x0: -s / 2, z0: zc - s / 2, x1: s / 2, z1: zc + s / 2, fhs: [0.38, ...Array(floors - 1).fill(fh)], roofH: 0, mat: 'conc' };
}

// golden octagonal tower with a setback and a spire
function goldTower(B, rng, meta, LW, LD) {
  towerGround(B, rng, meta, LW, LD);
  meta.signKey = 'bank';
  setTint(null);
  const zc = -0.1, fh = 0.29, floors = randInt(rng, 34, 44), gk = pick(rng, ['glass_gold', 'glass_gold', 'glass_bronze']);
  const n1 = Math.round(floors * 0.72), n2 = floors - n1;
  B.push(0, zc);
  aoDecal(B, -0.62, -0.62, 0.62, 0.62, 0.14);
  const p1 = octPts(0.6, 0.2), p2 = octPts(0.44, 0.15);
  const f1 = Array(n1).fill(fh); f1[0] = 0.38;
  prism(B, rng, p1, 0, f1, (i, f, k) => (f === 0 ? (i === 2 && (k === 1 || k === 2) ? 'glass_door' : 'glass_dark') : gk), 0.22);
  let y = sum(f1);
  polyCap(B, 'flat', p1, y + 0.001, C('#b9b7b0'));
  polyParapet(B, p1, y, 0.04, C('#9c8452'));
  prism(B, rng, p2, y, Array(n2).fill(fh), () => gk, 0.22);
  y += n2 * fh;
  polyParapet(B, p2, y, 0.05, C('#9c8452'));
  // pyramid crown
  const crown = octPts(0.44, 0.15);
  for (let i = 0; i < crown.length; i++) {
    const a = crown[(i + 1) % crown.length], b = crown[i];
    B.tri('shiny', [a[0], y, a[1]], [b[0], y, b[1]], [0, y + 0.5, 0], C('#c9a24a'));
  }
  spire(B, meta, 0, 0, y + 0.45, 0.7, 0.02, '#e2c46a', zc);
  B.box('solid', -0.3, 0.38, 0.6, 0.3, 0.4, 0.68, C('#2c3540'));
  sign(B, rng, 'bank', 0, 0.41, 0.6, 0.42);
  B.pop();
  meta.door = [0, zc + 0.64];
  meta.height = y + 1.15;
  meta.shell = { x0: -0.6, z0: zc - 0.6, x1: 0.6, z1: zc + 0.6, fhs: Array(floors).fill(fh), roofH: 0, mat: 'conc' };
}

// twin towers on a podium, joined by a sky bridge
function twins(B, rng, meta, LW, LD) {
  towerGround(B, rng, meta, LW, LD);
  meta.signKey = 'konzern';
  setTint(null);
  const zc = -0.12, fh = 0.29, floors = randInt(rng, 28, 36), s = 0.6, xo = 0.46;
  const cell = pick(rng, ['office_band', 'glass_teal', 'glass_green', 'glass_blue']);
  B.push(0, zc);
  aoDecal(B, -0.85, -0.5, 0.85, 0.5, 0.12);
  // podium
  const pw = 1.7, pd = 0.9, ph = [0.38, 0.3];
  boxWalls(B, rng, -pw / 2, -pd / 2, pw / 2, pd / 2, 0, ph, (side, f, k, nb) => (f === 0 && side === 0 && (k === Math.floor(nb / 2) || k === Math.floor(nb / 2) - 1) ? 'glass_door' : f === 0 ? 'glass_dark' : 'glass_silver'), 0.24);
  flatRoof(B, -pw / 2, -pd / 2, pw / 2, pd / 2, sum(ph), { parapet: 0.03, pcol: '#aeb6bd' });
  const fhs = Array(floors).fill(fh);
  let top = 0;
  for (const sx of [-xo, xo]) {
    B.push(sx, 0);
    boxWalls(B, rng, -s / 2, -s / 2, s / 2, s / 2, sum(ph), fhs, () => cell, 0.2);
    const y = sum(ph) + floors * fh;
    flatRoof(B, -s / 2, -s / 2, s / 2, s / 2, y, { parapet: 0.04, pcol: '#aeb6bd' });
    hipRoof(B, s * 0.7, s * 0.7, y + 0.03, 0.28, C('#8b939b'), { bucket: 'metal', over: 0.0 });
    B.box('solid', -s * 0.35, y, -s * 0.35, s * 0.35, y + 0.03, s * 0.35, C('#aeb6bd'));
    top = y + 0.31;
    B.pop();
  }
  spire(B, meta, -xo, 0, top - 0.02, 0.5, 0.012, undefined, zc);
  B.cyl('shiny', xo, top - 0.02, 0, 0.012, 0.5, 6, C('#cfd3d6'), { r1: 0.002 });
  // sky bridge
  const yb = sum(ph) + Math.round(floors * 0.55) * fh, bw = 2 * xo - s;
  boxWalls(B, rng, -bw / 2, -0.12, bw / 2, 0.12, yb, [fh, fh], (side) => (side === 0 || side === 2 ? 'glass_dark' : null), bw / 2);
  B.box('solid', -bw / 2, yb - 0.03, -0.13, bw / 2, yb, 0.13, C('#aeb6bd'), { bottom: true });
  B.box('solid', -bw / 2, yb + 2 * fh, -0.13, bw / 2, yb + 2 * fh + 0.03, 0.13, C('#aeb6bd'));
  B.box('solid', -0.3, 0.38, pd / 2, 0.3, 0.4, pd / 2 + 0.08, C('#2c3540'));
  sign(B, rng, 'konzern', 0, 0.41, pd / 2 + 0.02, 0.46);
  B.pop();
  meta.door = [0, zc + pd / 2 + 0.04];
  meta.height = top + 0.5;
  meta.shell = { x0: -pw / 2, z0: zc - pd / 2, x1: pw / 2, z1: zc + pd / 2, fhs: [...ph, ...fhs], roofH: 0, mat: 'conc' };
}

// shopping centre on the street with an office tower behind it
function arkaden(B, rng, meta, LW, LD) {
  meta.signKey = 'arkaden';
  setTint(null);
  B.rect('cobble', -LW / 2, -LD / 2, LW / 2, LD / 2, 0.005, C('#ebe4d8'), 1.1);
  // podium mall along the street
  const px0 = -0.92, px1 = 0.92, pz0 = -0.32, pz1 = 0.8, ph = [0.36, 0.3];
  aoDecal(B, px0, pz0, px1, pz1, 0.1);
  const shops = ['shop_fashion', 'shop_shoes', 'shop_toys', 'shop_drug', 'shop_electro', 'shop_optic', 'shop_books', 'shop_cafe', 'shop_icecream', 'shop_bakery', 'shop_flowers'];
  const nbFront = Math.round((px1 - px0) / 0.23);
  const mid = Math.floor(nbFront / 2);
  const row = []; for (let k = 0; k < nbFront; k++) row.push(pick(rng, shops));
  boxWalls(B, rng, px0, pz0, px1, pz1, 0, ph, (side, f, k) => {
    if (f === 0 && side === 0) return k === mid || k === mid - 1 ? 'glass_door' : row[k];
    if (f === 0 && (side === 1 || side === 3)) return k % 3 === 0 ? 'glass_door' : 'metal_white';
    if (f === 1 && side === 0) return 'glass_silver';
    return 'metal_white';
  }, 0.23);
  const py = sum(ph);
  flatRoof(B, px0, pz0, px1, pz1, py, { parapet: 0.04, pcol: '#d9dbdc' });
  // skylight
  B.box('glass', -0.5, py, 0.3, 0.5, py + 0.05, 0.5, C('#9cc3e2'));
  B.quad('glass', [-0.5, py + 0.05, 0.5], [0.5, py + 0.05, 0.5], [0.5, py + 0.12, 0.4], [-0.5, py + 0.12, 0.4], C('#9cc3e2'));
  B.quad('glass', [0.5, py + 0.05, 0.3], [-0.5, py + 0.05, 0.3], [-0.5, py + 0.12, 0.4], [0.5, py + 0.12, 0.4], C('#9cc3e2'));
  rooftopStuff(B, rng, px0, pz0, px1, 0.2, py, 3);
  // glass entrance canopy and the big sign
  const ex = px0 + (mid) * (px1 - px0) / nbFront;
  B.box('glass', ex - 0.26, ph[0] - 0.03, pz1, ex + 0.26, ph[0] - 0.015, pz1 + 0.16, C('#cfe6ea'));
  for (const x of [ex - 0.24, ex + 0.24]) B.box('solid', x - 0.006, 0, pz1 + 0.15, x + 0.006, ph[0] - 0.03, pz1 + 0.162, C('#9aa0a6'));
  sign(B, rng, 'arkaden', ex, ph[0] + 0.04, pz1 + 0.002, 0.7);
  // office tower behind
  const tx0 = -0.42, tx1 = 0.42, tz0 = -0.92, tz1 = -0.1, floors = randInt(rng, 20, 28), fh = 0.29;
  const cell = pick(rng, ['office_band', 'glass_blue', 'glass_teal']);
  const fhs = Array(floors).fill(fh);
  boxWalls(B, rng, tx0, tz0, tx1, tz1, 0, fhs, () => cell, 0.21);
  const ty = floors * fh;
  flatRoof(B, tx0, tz0, tx1, tz1, ty, { parapet: 0.05, pcol: '#aeb6bd' });
  rooftopStuff(B, rng, tx0, tz0, tx1, tz1, ty, 2);
  sign(B, rng, 'konzern', 0, ty - 0.16, tz1 + 0.002, 0.5);
  // car park at the back
  parking(B, rng, 0.5, -0.98, 0.98, -0.38, 'z', 0.7);
  parking(B, rng, -0.98, -0.98, -0.5, -0.38, 'z', 0.7);
  lamps(B, meta, [[-0.9, 0.92], [0.9, 0.92], [0.74, -0.4], [-0.74, -0.4]]);
  for (const x of [-0.7, 0.7]) { B.cyl('solid', x, 0, 0.9, 0.08, 0.03, 10, C('#bdb6aa'), { top: C('#5f8f3a') }); meta.trees.push([x, 0.9, 'round', 0.85]); }
  for (let i = 0; i < 3; i++) MD.bench(B, -0.3 + i * 0.3, 0.94, 0);
  meta.door = [ex, pz1 + 0.04];
  meta.height = ty + 0.1;
  meta.shell = { x0: px0, z0: pz0, x1: px1, z1: pz1, fhs: ph, roofH: 0, mat: 'conc' };
}

// ================================================================ catalogue
const V = (name, lvl, w, fn) => ({ name, lvl, w, fn });
export const COM_VARIANTS = [
  V('Ladenhaus', 1, 4, ladenhaus),
  V('Fachwerk-Ladenhaus', 1, 3, fachLaden),
  V('Kiosk-Pavillon', 1, 1.5, kiosk),
  V('Tankstelle', 1, 1, tankstelle),
  V('Geschäftshaus', 2, 3, geschaeftshaus),
  V('Bürgerhaus mit Läden', 2, 2.5, (B, r, m) => buerger(B, r, m, { shops: true })),
  V('Geschäftshaus der 50er', 2, 2, geschaeft50),
  V('Supermarkt mit Parkplatz', 2, 1.5, (B, r, m) => markt(B, r, m, 'super')),
  V('Fachmarkt', 2, 1.2, (B, r, m) => markt(B, r, m, pick(r, ['drogerie', 'elektro']))),
  V('Büro- und Geschäftshaus', 3, 3, bueroGeschaeft),
  V('Kaufhaus der 20er', 3, 2, kaufhaus20),
  V('Bürohaus mit Fensterbändern', 3, 2, (B, r, m) => buero(B, r, m, 'band')),
  V('Bürohaus mit Lochfassade', 3, 2, (B, r, m) => buero(B, r, m, 'punch')),
  V('Grandhotel', 3, 1.5, hotel),
  V('Gläserner Stufenturm', 4, 2, stufenturm),
  V('Art-déco-Wolkenkratzer', 4, 1.5, artDeco),
  V('Lamellenturm', 4, 1.5, lamellen),
  V('Diagrid-Rundturm', 4, 1.2, diagrid),
  V('Gedrehter Glasturm', 4, 1.2, twisted),
  V('Goldener Achteckturm', 4, 1, goldTower),
  V('Zwillingstürme mit Himmelsbrücke', 4, 1, twins),
  V('Einkaufszentrum mit Büroturm', 4, 1.5, arkaden),
];

function run(lvl) {
  const list = COM_VARIANTS.filter((v) => v.lvl === lvl).map((v) => [v, v.w]);
  return (B, rng, meta, LW, LD, b) => {
    const v = forcedVariant(COM_VARIANTS, b) || wpick(rng, list);
    meta.variant = v.name;
    v.fn(B, rng, meta, LW, LD);
    setTint(null);
  };
}
export const comL1 = run(1);
export const comL2 = run(2);
export const comL3 = run(3);
export const comL4 = run(4);
