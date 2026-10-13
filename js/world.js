import { MAP_N, ZONE, GROW, SERVICES } from './config.js';
import { mulberry32, fbm, hash2, DIRS, personName, pick, LAST_NAMES } from './util.js';

export const MARGIN = 30; // decorative countryside around the playable map

export class World {
  constructor(seed = 1337) {
    this.N = MAP_N;
    this.seed = seed;
    const n = this.N * this.N;
    this.terrain = new Uint8Array(n);   // 0 land, 1 water
    this.road = new Uint8Array(n);
    this.zone = new Uint8Array(n);
    this.bld = new Int32Array(n).fill(-1);
    this.trees = new Uint8Array(n);     // wild trees on a tile (0..3)
    this.busstop = new Uint8Array(n);   // 0 none, 1..4 = side+1
    this.buildings = new Map();
    this.nextId = 1;
    this.version = 0;                   // bumps whenever roads change
    this.dirtyTiles = new Set();
  }

  idx(x, z) { return z * this.N + x; }
  inb(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N; }
  isWater(x, z) { return this.inb(x, z) ? this.terrain[this.idx(x, z)] === 1 : this.outerWater(x, z); }
  isRoad(x, z) { return this.inb(x, z) && this.road[this.idx(x, z)] === 1; }
  roadMask(x, z) {
    let m = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz;
      if (this.isRoad(nx, nz)) m |= DIRS[d].bit;
      // roads leaving the map connect to the outside world
      else if (!this.inb(nx, nz) && this.isRoad(x, z)) m |= DIRS[d].bit;
    }
    return m;
  }
  buildingAt(x, z) {
    if (!this.inb(x, z)) return null;
    const id = this.bld[this.idx(x, z)];
    return id >= 0 ? this.buildings.get(id) : null;
  }
  markDirty(x, z) { this.dirtyTiles.add(this.idx(x, z)); }

  // river centre line (also used outside the map)
  riverX(z) {
    const N = this.N;
    return N * 0.7 + Math.sin(z * 0.075 + 1.3) * 5.5 + Math.sin(z * 0.19) * 1.6;
  }
  riverW(z) { return 2.4 + Math.sin(z * 0.05 + 2) * 0.6; }
  outerWater(x, z) {
    const cx = this.riverX(z + 0.5), w = this.riverW(z);
    return Math.abs(x + 0.5 - cx) < w / 2;
  }

  genTerrain() {
    const N = this.N;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, z);
      if (this.outerWater(x, z)) { this.terrain[i] = 1; continue; }
      // a small pond
      const dx = x - N * 0.18, dz = z - N * 0.2;
      if (dx * dx / 9 + dz * dz / 5 < 1) { this.terrain[i] = 1; continue; }
      const f = fbm(x * 0.09, z * 0.09, this.seed);
      const cdx = x - N * 0.42, cdz = z - N * 0.5;
      const centre = Math.hypot(cdx, cdz);
      if (f > 0.58 && centre > 11) this.trees[i] = f > 0.66 ? 3 : f > 0.62 ? 2 : 1;
      else if (hash2(x, z, 77) < 0.025 && centre > 6) this.trees[i] = 1;
    }
  }

  setRoad(x, z, on) {
    const i = this.idx(x, z);
    this.road[i] = on ? 1 : 0;
    if (on) { this.zone[i] = 0; this.trees[i] = 0; }
    else this.busstop[i] = 0;
    this.version++;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (this.inb(x + dx, z + dz)) this.markDirty(x + dx, z + dz);
  }

  // road tile in front of a lot for direction d (0..3), if any
  frontRoad(x, z, w, h, d) {
    const out = [];
    if (d === 0) for (let i = 0; i < w; i++) out.push([x + i, z - 1]);
    if (d === 2) for (let i = 0; i < w; i++) out.push([x + i, z + h]);
    if (d === 1) for (let i = 0; i < h; i++) out.push([x + w, z + i]);
    if (d === 3) for (let i = 0; i < h; i++) out.push([x - 1, z + i]);
    return out.filter(([a, b]) => this.isRoad(a, b));
  }
  // pick the street side for a lot: returns direction or -1
  facingFor(x, z, w, h, prefer = -1) {
    let best = -1, bestN = 0;
    for (let d = 0; d < 4; d++) {
      const n = this.frontRoad(x, z, w, h, d).length;
      if (n > bestN || (n === bestN && n > 0 && d === prefer)) { best = d; bestN = n; }
    }
    return best;
  }

  canPlace(x, z, w, h, allowZoned = true) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const tx = x + i, tz = z + j;
      if (!this.inb(tx, tz)) return false;
      const k = this.idx(tx, tz);
      if (this.terrain[k] === 1 || this.road[k] || this.bld[k] >= 0) return false;
      if (!allowZoned && this.zone[k]) return false;
    }
    return true;
  }

  addBuilding(b) {
    b.id = this.nextId++;
    this.buildings.set(b.id, b);
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
      const k = this.idx(b.x + i, b.z + j);
      this.bld[k] = b.id; this.trees[k] = 0;
      this.markDirty(b.x + i, b.z + j);
    }
    return b;
  }
  removeBuilding(b) {
    this.buildings.delete(b.id);
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
      const k = this.idx(b.x + i, b.z + j);
      if (this.bld[k] === b.id) this.bld[k] = -1;
      this.markDirty(b.x + i, b.z + j);
    }
  }

  // ---- the starting village
  genVillage(makeBuilding) {
    const N = this.N;
    const cx = Math.round(N * 0.42), cz = Math.round(N * 0.5);
    this.centre = [cx, cz];
    const line = (x0, z0, x1, z1) => {
      const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
      let x = x0, z = z0;
      for (;;) {
        if (this.inb(x, z) && !this.isWater(x, z)) this.setRoad(x, z, true);
        if (x === x1 && z === z1) break;
        x += dx; z += dz;
      }
    };
    // main street from the western edge, cross street, a few lanes
    line(0, cz, cx + 8, cz);
    line(cx, cz - 9, cx, cz + 9);
    line(cx - 6, cz - 5, cx + 6, cz - 5);
    line(cx - 6, cz - 5, cx - 6, cz);
    line(cx + 6, cz - 5, cx + 6, cz + 5);
    line(cx - 5, cz + 5, cx + 6, cz + 5);
    line(cx - 5, cz, cx - 5, cz + 5);

    const place = (type, x, z, w, h, rot, extra = {}) => {
      if (!this.canPlace(x, z, w, h)) return null;
      const b = makeBuilding(type, x, z, w, h, rot, extra);
      b.state = 'done'; b.progress = 1;
      return this.addBuilding(b);
    };
    place('plaza', cx + 1, cz - 1, 1, 1, 2);
    place('playground', cx + 1, cz + 1, 1, 1, 0);
    place('church', cx + 3, cz - 4, 1, 2, 0);
    place('firestation', cx - 4, cz + 1, 2, 1, 0);
    place('park', cx - 1, cz + 4, 1, 1, 2);

    const rng = mulberry32(this.seed + 5);
    // houses and shops along the streets of the village
    for (let z = cz - 10; z <= cz + 10; z++) for (let x = cx - 9; x <= cx + 9; x++) {
      if (!this.canPlace(x, z, 1, 1)) continue;
      const d = this.facingFor(x, z, 1, 1);
      if (d < 0) continue;
      const dist = Math.hypot(x - cx, z - cz);
      if (dist > 6.6 || (dist > 3.5 && rng() < 0.16)) continue;
      const shop = dist < 3.2 && rng() < 0.7;
      const k = this.idx(x, z);
      this.zone[k] = shop ? ZONE.COM : ZONE.RES;
      place(shop ? 'com1' : 'res1', x, z, 1, 1, d);
    }
    // zoned lots ready for growth
    for (let z = cz - 12; z <= cz + 12; z++) for (let x = cx - 12; x <= cx + 10; x++) {
      if (!this.canPlace(x, z, 1, 1)) continue;
      if (this.facingFor(x, z, 1, 1) < 0) continue;
      this.zone[this.idx(x, z)] = ZONE.RES;
      this.trees[this.idx(x, z)] = 0;
    }
    // a little workshop area at the village entrance
    for (let x = 6; x <= 11; x++) for (const z of [cz - 1, cz + 1]) {
      if (this.canPlace(x, z, 1, 1)) { this.zone[this.idx(x, z)] = ZONE.IND; this.trees[this.idx(x, z)] = 0; }
    }
    place('ind1', 8, cz - 1, 1, 1, 2);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) this.markDirty(x, z);
  }
}

// --------------------------------------------------------------- buildings
let SHOPNAMES = null;
export function buildingName(b, rng) {
  if (b.kind === 'svc') return SERVICES[b.type]?.name || b.type;
  const lvl = GROW[b.kind]?.[b.level];
  if (b.kind === 'res') {
    if (b.level <= 2) return `${lvl.name} ${pick(rng, LAST_NAMES)}`;
    const streets = ['Lindenhof', 'Am Mühlbach', 'Sonnenhof', 'Parkblick', 'Kastanienhof', 'Uferpark', 'Rosengarten', 'Brunnenhof'];
    return `${lvl.name} „${pick(rng, streets)}“`;
  }
  if (b.kind === 'com' && b.shop) return `${b.shop.name} ${pick(rng, LAST_NAMES)}`;
  if (!SHOPNAMES) SHOPNAMES = { kaufhaus: 'Kaufhaus', bank: 'Stadtsparkasse', hotel: 'Hotel zur Post', buero: 'Büro-Center', supermarkt: 'Supermarkt', kino: 'Lichtspielhaus', post: 'Postamt', restaurant: 'Restaurant' };
  if (b.signKey) return SHOPNAMES[b.signKey] || lvl.name;
  if (b.kind === 'ind') return `${lvl.name} ${pick(rng, LAST_NAMES)} & Söhne`;
  return lvl ? lvl.name : b.type;
}
export { personName };
