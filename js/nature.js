import * as THREE from 'three';
import { Builder, packedToGeometry } from './geom.js';
import * as MD from './models.js';
import { hash2 } from './util.js';
import { genCountryside } from './ground.js';
import { MARGIN } from './world.js';

function geoOf(fn) {
  const B = new Builder();
  fn(B);
  return packedToGeometry(B.pack().solid);
}

const REGION = 12;

// Trees are instanced per type and per map region so that the renderer can
// skip regions outside the camera (and shadow) frustum.
export class Nature {
  constructor(scene, world, M) {
    this.scene = scene; this.world = world; this.M = M;
    // with photographic foliage the leaf texture brings the colour, the vertex colours only shade
    const ph = this.photo = !!M.foliage;
    const k = (proc, photo) => (ph ? photo : proc);
    const F = (v) => (ph ? [0.78 + v, 0.84 + v, 0.74 + v] : null);
    this.geos = {
      round: geoOf((B) => MD.treeRound(B, k('#5f9a3c', '#dfe8d4'), 1)),
      round2: geoOf((B) => MD.treeRound(B, k('#6fa843', '#eef4dc'), 7)),
      tall: geoOf((B) => MD.treeTall(B, k('#4f8a34', '#cfdcc2'), 2)),
      conifer: geoOf((B) => MD.treeConifer(B, k('#2f5e3a', '#e2ebe2'))),
      bush: geoOf((B) => MD.bush(B, k('#5a8f3a', '#d6e2c8'), 4)),
      fruit: geoOf((B) => { MD.treeRound(B, k('#6aa24a', '#e6eed8'), 9); for (let i = 0; i < 9; i++) B.sphere('solid', Math.cos(i * 2.4) * 0.1, 0.18 + (i % 3) * 0.06, Math.sin(i * 2.4) * 0.1, 0.014, 0.014, 0.014, ph ? [1.6, 0.25, 0.15] : [0.75, 0.05, 0.03], 4, 3); }),
      forest: geoOf((B) => {
        B.cyl('solid', 0, 0, 0, 0.022, 0.14, 5, [0.25, 0.15, 0.08], { cap: false });
        B.sphere('solid', 0, 0.24, 0, 0.14, 0.13, 0.14, F(0) || [0.2, 0.38, 0.11], 7, 4, { grad: true });
      }),
      pine: geoOf((B) => {
        B.cyl('solid', 0, 0, 0, 0.018, 0.08, 4, [0.25, 0.15, 0.08], { cap: false });
        B.cyl('solid', 0, 0.06, 0, 0.12, 0.2, 7, F(-0.06) || [0.13, 0.28, 0.15], { r1: 0.03, cap: false });
        B.cyl('solid', 0, 0.2, 0, 0.085, 0.2, 7, F(0.04) || [0.16, 0.33, 0.18], { r1: 0.0, cap: false });
      }),
    };
    this.inner = new Map();  // key -> InstancedMesh (map trees, rebuilt on change)
    this.outer = [];         // static countryside forests
    this.group = new THREE.Group();
    scene.add(this.group);
    this.outerTrees = [];
    this.countryside = [];
    const N = world.N;
    const size = N + MARGIN * 2 + 40;
    const wg = new THREE.PlaneGeometry(size, size, 1, 1);
    wg.rotateX(-Math.PI / 2);
    const uv = wg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 4, uv.getY(i) * size / 4);
    this.water = new THREE.Mesh(wg, M.water);
    this.water.position.set(N / 2, -0.11, N / 2);
    this.water.receiveShadow = true;
    scene.add(this.water);
    const fg = new THREE.PlaneGeometry(3000, 3000);
    fg.rotateX(-Math.PI / 2);
    this.far = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0x7f9c58, roughness: 1 }));
    this.far.position.set(N / 2, -0.6, N / 2);
    this.far.receiveShadow = true;
    scene.add(this.far);
  }

  buildCountryside() {
    for (const m of this.countryside) { this.scene.remove(m); m.geometry.dispose(); }
    this.countryside = [];
    const B = new Builder();
    this.outerTrees = [];
    genCountryside(B, this.world, this.outerTrees);
    const pk = B.pack();
    for (const k in pk) {
      const mesh = new THREE.Mesh(packedToGeometry(pk[k]), this.M[k]);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.countryside.push(mesh);
    }
    for (const m of this.outer) { this.group.remove(m); m.dispose(); }
    this.outer = [];
    const lists = this.bucket(this.outerTrees.map((t) => [t[0], t[1], t[2] === 'conifer' ? 'pine' : t[2], t[3]]));
    for (const [key, L] of lists) this.outer.push(this.fill(null, key, L, true));
  }

  bucket(trees) {
    const lists = new Map();
    for (const [x, z, type0, s] of trees) {
      let type = type0;
      const h = hash2(Math.floor(x * 37), Math.floor(z * 37), 5);
      if (type === 'round' && h < 0.4) type = 'round2';
      if (!this.geos[type]) type = 'round';
      const key = `${type}|${Math.floor(x / REGION)}|${Math.floor(z / REGION)}`;
      (lists.get(key) || lists.set(key, []).get(key)).push([x, z, s, h]);
    }
    return lists;
  }

  fill(mesh, key, L, outer = false) {
    const type = key.split('|')[0];
    if (!mesh || mesh.instanceMatrix.count < L.length) {
      if (mesh) { this.group.remove(mesh); mesh.dispose(); }
      const mat = !this.photo ? this.M.solid : (type === 'conifer' || type === 'pine') ? this.M.needles : this.M.foliage;
      mesh = new THREE.InstancedMesh(this.geos[type], mat, Math.max(8, Math.ceil(L.length * (outer ? 1 : 1.4))));
      mesh.castShadow = true; mesh.receiveShadow = !outer;
      this.group.add(mesh);
    }
    const m4 = this.m4 || (this.m4 = new THREE.Matrix4());
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    for (let i = 0; i < L.length; i++) {
      const [x, z, sc, h] = L[i];
      e.set(0, h * 6.28, 0); q.setFromEuler(e);
      p.set(x, 0, z); s.set(sc, sc * (0.9 + h * 0.25), sc);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      const v = 0.86 + h * 0.26;
      c.setRGB(v * (0.94 + h * 0.1), v, v * (0.9 + (1 - h) * 0.15));
      mesh.setColorAt(i, c);
    }
    mesh.count = L.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  // collects trees on the map: wild ones on tiles plus those on building lots
  rebuildTrees(buildingTrees) {
    const w = this.world, N = w.N;
    const trees = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const n = w.trees[w.idx(x, z)];
      for (let i = 0; i < n; i++) {
        const h = hash2(x, z, i * 7 + 1);
        const type = i > 0 ? (h < 0.35 ? 'pine' : 'forest') : h < 0.2 ? 'conifer' : h < 0.75 ? 'round' : h < 0.88 ? 'tall' : 'forest';
        trees.push([x + 0.2 + hash2(x, z, i * 7 + 2) * 0.6, z + 0.2 + hash2(x, z, i * 7 + 3) * 0.6, type, 0.85 + hash2(x, z, i * 7 + 4) * 0.5]);
      }
    }
    for (const t of buildingTrees) trees.push(t);
    const lists = this.bucket(trees);
    for (const [key, mesh] of this.inner) if (!lists.has(key)) { this.group.remove(mesh); mesh.dispose(); this.inner.delete(key); }
    for (const [key, L] of lists) this.inner.set(key, this.fill(this.inner.get(key), key, L));
  }

  update(dt, t) {
    this.M.water.normalMap.offset.set(t * 0.012, t * 0.007);
  }
}
