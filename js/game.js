import * as THREE from 'three';
import { World, buildingName } from './world.js';
import { ChunkManager } from './chunks.js';
import { Nature } from './nature.js';
import { Builder } from './geom.js';
import { genBuilding, localSize, setGenWorld } from './buildgen.js';
import { DIR_ANGLE, mulberry32 } from './util.js';
import { GROW, SERVICES } from './config.js';

// Owns the world and keeps the 3D representation in sync with it.
export class Game {
  constructor(scene, M) {
    this.scene = scene; this.M = M;
    this.world = new World(20261013);
    this.world.genTerrain();
    setGenWorld(this.world);
    this.chunks = new ChunkManager(scene, this.world, M);
    this.nature = new Nature(scene, this.world, M);
    this.treesDirty = true;
    this.countryDirty = true;
    this.listeners = {};
  }
  on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) f(...a); }

  makeBuilding(type, x, z, w, h, rot, extra = {}) {
    const kind = SERVICES[type] ? 'svc' : type.startsWith('res') ? 'res' : type.startsWith('com') ? 'com' : type.startsWith('ind') ? 'ind' : 'svc';
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
    b.rotors = meta.rotors ? meta.rotors.map((r) => ({ x: B.wx(r[0], r[1]), z: B.wz(r[0], r[1]), y: r[2], yaw: t.a + (r[3] || 0) })) : null;
    b.steam = meta.steam ? meta.steam.map((s) => { const p = W([s[0], s[2]]); return [p[0], s[1], p[1], s[3] || 0.3]; }) : null;
    b.anchor = meta.anchor ? (() => { const p = W([meta.anchor[0], meta.anchor[1]]); return [p[0], meta.anchor[2], p[1]]; })() : null;
    b.splash = meta.splash ? W(meta.splash) : null;
    b.fillLevel = meta.fillLevel;
    b.model = meta.model ? (() => { const p = W([meta.model.x, meta.model.z]); return { name: meta.model.name, x: p[0], z: p[1], y: meta.model.y || 0, a: t.a + (meta.model.yaw || 0), fit: meta.model.fit }; })() : null;
    // parking bays: world position and the direction the parked car points to
    b.bays = meta.bays ? meta.bays.map((q) => { const p = W([q[0], q[1]]); return [p[0], p[1], q[2] * B.cs + q[3] * B.sn, -q[2] * B.sn + q[3] * B.cs]; }) : null;
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
      if (b.kind === 'res') b.pop = b.popMax = L ? Math.round((L.pop[0] + L.pop[1]) / 2) : 0;
      if (b.kind === 'com' || b.kind === 'ind') b.jobs = b.jobsMax = L ? Math.round((L.jobs[0] + L.jobs[1]) / 2) : 0;
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
