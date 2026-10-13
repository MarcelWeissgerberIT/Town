import * as THREE from 'three';
import { World, buildingName } from './world.js';
import { ChunkManager } from './chunks.js';
import { Nature } from './nature.js';
import { Builder } from './geom.js';
import { genBuilding, localSize } from './buildgen.js';
import { DIR_ANGLE, mulberry32 } from './util.js';
import { GROW, SERVICES } from './config.js';

// Owns the world and keeps the 3D representation in sync with it.
export class Game {
  constructor(scene, M) {
    this.scene = scene; this.M = M;
    this.world = new World(20261013);
    this.world.genTerrain();
    this.chunks = new ChunkManager(scene, this.world, M);
    this.nature = new Nature(scene, this.world, M);
    this.treesDirty = true;
    this.countryDirty = true;
    this.listeners = {};
  }
  on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) f(...a); }

  makeBuilding(type, x, z, w, h, rot, extra = {}) {
    const kind = type.startsWith('res') ? 'res' : type.startsWith('com') ? 'com' : type.startsWith('ind') ? 'ind' : 'svc';
    const level = kind === 'svc' ? 0 : Number(type.slice(3));
    const seed = Math.floor(Math.random() * 1e9);
    const b = { id: 0, type, kind, level, x, z, w, h, rot, seed, state: 'build', progress: 0, pop: 0, jobs: 0, name: '', ...extra };
    return b;
  }

  // world-space origin and angle for a building's lot
  lotXform(b) {
    return { x: b.x + b.w / 2, z: b.z + b.h / 2, a: DIR_ANGLE[b.rot] };
  }

  // generates geometry + metadata of a finished building
  realize(b) {
    const B = new Builder();
    const t = this.lotXform(b);
    B.setXform(t.x, 0, t.z, t.a);
    const meta = genBuilding(B, b);
    // convert local metadata to world positions
    const W = (p) => [B.wx(p[0], p[1]), B.wz(p[0], p[1])];
    b.door = W(meta.door);
    b.trees = meta.trees.map((tr) => [...W(tr), tr[2], tr[3]]);
    b.lamps = meta.lamps.map(W);
    b.smoke = meta.smoke.map((s) => { const p = W([s[0], s[2]]); return [p[0], s[1], p[1]]; });
    b.fountain = meta.fountain ? (() => { const p = W([meta.fountain[0], meta.fountain[2]]); return [p[0], meta.fountain[1], p[1]]; })() : null;
    b.beacon = meta.beacon ? (() => { const p = W([meta.beacon[0], meta.beacon[1]]); return [p[0], meta.beacon[2], p[1]]; })() : null;
    b.height = meta.height;
    b.shell = meta.shell;
    b.flags = { wander: !!meta.wander, kids: !!meta.kids, pigeons: !!meta.pigeons, station: meta.station || null };
    if (meta.shop) b.shop = meta.shop;
    if (meta.signKey) b.signKey = meta.signKey;
    b.variant = meta.variant || null;
    if (!b.name) b.name = buildingName(b, mulberry32(b.seed + 1));
    this.chunks.setBuildingGeo(b, b.state === 'done' ? B.pack() : null);
    this.treesDirty = true;
    return B;
  }

  allBuildingTrees() {
    const out = [];
    for (const b of this.world.buildings.values()) if (b.state === 'done' && b.trees) out.push(...b.trees);
    return out;
  }

  startNew() {
    this.world.genVillage((...a) => this.makeBuilding(...a));
    for (const b of this.world.buildings.values()) {
      const L = GROW[b.kind]?.[b.level];
      if (b.kind === 'res') b.pop = L ? Math.round((L.pop[0] + L.pop[1]) / 2) : 0;
      if (b.kind === 'com' || b.kind === 'ind') b.jobs = L ? Math.round((L.jobs[0] + L.jobs[1]) / 2) : 0;
      if (b.kind === 'svc') b.jobs = SERVICES[b.type] ? 6 : 0;
      this.realize(b);
    }
  }

  update(dt) {
    this.chunks.update(3);
    if (this.countryDirty) { this.nature.buildCountryside(); this.countryDirty = false; this.treesDirty = true; }
    if (this.treesDirty) { this.nature.rebuildTrees(this.allBuildingTrees()); this.treesDirty = false; }
  }
}
export { localSize, THREE };
