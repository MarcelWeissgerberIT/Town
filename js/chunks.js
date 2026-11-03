import * as THREE from 'three';
import { Builder, concatPacked, packedToGeometry } from './geom.js';
import { CHUNK } from './config.js';
import { genTile } from './ground.js';

const SHADOW_CAST = new Set(['facade', 'roof', 'slate', 'pantile', 'thatch', 'shingle', 'greenroof', 'metal', 'flat', 'solid', 'shiny', 'glass', 'glow', 'grass', 'hedge', 'veh', 'beacon', 'solar', 'coal', 'trash']);

export class ChunkManager {
  constructor(scene, world, M) {
    this.scene = scene; this.world = world; this.M = M;
    this.n = Math.ceil(world.N / CHUNK);
    this.chunks = [];
    for (let cz = 0; cz < this.n; cz++) for (let cx = 0; cx < this.n; cx++) {
      this.chunks.push({ cx, cz, ground: [], bld: [], gDirty: true, bDirty: true });
    }
    this.bgeo = new Map(); // building id -> packed geometry (world space)
    this.dark = new Map(); // building id -> darkened copy
    this.group = new THREE.Group();
    scene.add(this.group);
  }
  chunkOf(x, z) { return this.chunks[Math.floor(z / CHUNK) * this.n + Math.floor(x / CHUNK)]; }
  tileDirty(x, z) { const c = this.chunkOf(x, z); if (c) c.gDirty = true; }
  buildingDirty(b) { const c = this.chunkOf(b.x, b.z); if (c) c.bDirty = true; }
  setBuildingGeo(b, packed) {
    if (packed) this.bgeo.set(b.id, packed); else this.bgeo.delete(b.id);
    this.dark.delete(b.id);
    this.buildingDirty(b);
  }
  // buildings without power stay dark at night; empty ones also look shabby
  look(b, g) {
    const key = (b.pw === 0 ? 1 : 0) + (b.abandoned ? 2 : 0);
    b.shown = key;
    if (!key) return g;
    const c = this.dark.get(b.id);
    if (c && c.key === key) return c.g;
    const out = {};
    for (const k in g) {
      const s = g[k];
      let col = s.c;
      if (key & 2) {
        col = new Float32Array(s.c.length);
        for (let i = 0; i < col.length; i += 3) {
          const l = (s.c[i] + s.c[i + 1] + s.c[i + 2]) / 3;
          col[i] = (s.c[i] * 0.4 + l * 0.6) * 0.62; col[i + 1] = (s.c[i + 1] * 0.4 + l * 0.6) * 0.6; col[i + 2] = (s.c[i + 2] * 0.4 + l * 0.6) * 0.56;
        }
      }
      out[k] = { ...s, c: col, l: new Float32Array(s.l.length) };
    }
    this.dark.set(b.id, { key, g: out });
    return out;
  }

  _replace(list, packed, groundLayer) {
    for (const m of list) { this.group.remove(m); m.geometry.dispose(); }
    list.length = 0;
    for (const k in packed) {
      const mat = this.M[k];
      if (!mat) continue;
      const mesh = new THREE.Mesh(packedToGeometry(packed[k]), mat);
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = k !== 'ao';
      mesh.castShadow = !groundLayer && SHADOW_CAST.has(k);
      if (groundLayer && (k === 'solid' || k === 'glass')) mesh.castShadow = true;
      if (k === 'ao') mesh.renderOrder = 1;
      this.group.add(mesh);
      list.push(mesh);
    }
  }

  rebuildGround(c) {
    const B = new Builder();
    const w = this.world;
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    for (let z = z0; z < Math.min(w.N, z0 + CHUNK); z++) for (let x = x0; x < Math.min(w.N, x0 + CHUNK); x++) genTile(B, w, x, z);
    this._replace(c.ground, B.pack(), true);
    c.gDirty = false;
  }
  rebuildBuildings(c) {
    const list = [];
    for (const b of this.world.buildings.values()) {
      if (b.state !== 'done') continue;
      if (Math.floor(b.x / CHUNK) !== c.cx || Math.floor(b.z / CHUNK) !== c.cz) continue;
      const g = this.bgeo.get(b.id);
      if (g) list.push(this.look(b, g));
    }
    this._replace(c.bld, concatPacked(list), false);
    c.bDirty = false;
  }
  // rebuild dirty chunks; returns number rebuilt
  update(maxPerFrame = 2) {
    let n = 0;
    for (const t of this.world.dirtyTiles) {
      const x = t % this.world.N, z = Math.floor(t / this.world.N);
      this.tileDirty(x, z);
    }
    this.world.dirtyTiles.clear();
    for (const c of this.chunks) {
      if (n >= maxPerFrame) break;
      if (c.gDirty) { this.rebuildGround(c); n++; }
      if (c.bDirty) { this.rebuildBuildings(c); n++; }
    }
    return n;
  }
  rebuildAll() {
    this.update(0);
    for (const c of this.chunks) { this.rebuildGround(c); this.rebuildBuildings(c); }
  }
}
