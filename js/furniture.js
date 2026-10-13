import * as THREE from 'three';
import { Builder, packedToGeometry } from './geom.js';
import { col } from './util.js';
import { U } from './materials.js';

// Street lamps (instanced) and the warm light pools they cast at night.
export class Furniture {
  constructor(scene, game, M, T) {
    this.scene = scene; this.game = game; this.world = game.world; this.M = M;
    const B = new Builder();
    const pc = col('#2b2f33');
    B.cyl('solid', 0, 0, 0, 0.008, 0.2, 6, pc);
    B.cyl('solid', 0, 0, 0, 0.014, 0.025, 6, pc);
    B.box('solid', -0.012, 0.2, -0.012, 0.012, 0.205, 0.012, pc);
    B.cyl('solid', 0, 0.255, 0, 0.022, 0.012, 6, pc, { r1: 0.004 });
    B.cyl('glow', 0, 0.205, 0, 0.012, 0.05, 6, col('#ffe0a0'), { r1: 0.02, lit: 0.02 });
    const pk = B.pack();
    this.cap = 3000;
    this.pole = new THREE.InstancedMesh(packedToGeometry(pk.solid), M.solid, this.cap);
    this.head = new THREE.InstancedMesh(packedToGeometry(pk.glow), M.glow, this.cap);
    this.pole.castShadow = true;
    for (const im of [this.pole, this.head]) { im.count = 0; scene.add(im); }
    const pg = new THREE.PlaneGeometry(0.8, 0.8); pg.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: T.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xffd9a0 });
    this.pools = new THREE.InstancedMesh(pg, this.poolMat, this.cap + 600);
    this.pools.count = 0; this.pools.renderOrder = 2;
    scene.add(this.pools);
    this.version = -1;
    this.bver = -1;
  }
  rebuild() {
    const w = this.world, N = w.N;
    const m = new THREE.Matrix4();
    let n = 0, np = 0;
    const lamps = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const k = z * N + x;
      if (!w.road[k] || w.busstop[k]) continue;
      const mask = w.roadMask(x, z);
      if (mask === 5) lamps.push(z % 2 ? [x + 0.1, z + 0.5] : [x + 0.9, z + 0.5]);
      else if (mask === 10) lamps.push(x % 2 ? [x + 0.5, z + 0.1] : [x + 0.5, z + 0.9]);
      else if (mask === 6 || mask === 3 || mask === 12 || mask === 9) lamps.push([x + (mask & 8 ? 0.9 : 0.1) * 1, z + (mask & 1 ? 0.9 : 0.1)]);
    }
    for (const [x, z] of lamps) {
      if (n >= this.cap) break;
      const y = 0.026;
      m.makeTranslation(x, y, z);
      this.pole.setMatrixAt(n, m); this.head.setMatrixAt(n, m);
      m.makeTranslation(x, 0.031, z);
      this.pools.setMatrixAt(np++, m);
      n++;
    }
    for (const b of w.buildings.values()) {
      if (b.state !== 'done' || !b.lamps) continue;
      for (const [x, z] of b.lamps) { if (np >= this.cap + 600) break; m.makeTranslation(x, 0.012, z); this.pools.setMatrixAt(np++, m); }
    }
    this.pole.count = n; this.head.count = n; this.pools.count = np;
    for (const im of [this.pole, this.head, this.pools]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
  update(buildVersion) {
    if (this.version !== this.world.version || this.bver !== buildVersion) {
      this.version = this.world.version; this.bver = buildVersion;
      this.rebuild();
    }
    this.poolMat.opacity = U.uGlow.value * 0.62;
    this.pools.visible = U.uGlow.value > 0.02;
  }
}
