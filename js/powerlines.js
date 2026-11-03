import * as THREE from 'three';
import { Builder, packedToGeometry } from './geom.js';
import { col, DIRS } from './util.js';

// High-voltage lines: lattice pylons ("Donaumast") every few tiles and at
// corners, with sagging conductors between them. Lines leaving the map run
// on into the countryside.
const STEEL = col('#8a9097');
const ARMS = [[-0.17, 0.6], [0.17, 0.6], [-0.12, 0.78], [0.12, 0.78], [0, 0.95]];

function pylonGeometry() {
  const B = new Builder();
  const leg = (x0, z0, x1, z1, y0, y1) => {
    const t = 0.006;
    B.quad('solid', [x0 - t, y0, z0], [x0 + t, y0, z0], [x1 + t, y1, z1], [x1 - t, y1, z1], STEEL);
    B.quad('solid', [x0 + t, y0, z0], [x0 - t, y0, z0], [x1 - t, y1, z1], [x1 + t, y1, z1], STEEL);
    B.quad('solid', [x0, y0, z0 - t], [x0, y0, z0 + t], [x1, y1, z1 + t], [x1, y1, z1 - t], STEEL);
    B.quad('solid', [x0, y0, z0 + t], [x0, y0, z0 - t], [x1, y1, z1 - t], [x1, y1, z1 + t], STEEL);
  };
  const w0 = 0.075, w1 = 0.022, top = 0.95;
  const W = (y) => w0 + (w1 - w0) * (y / top);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) leg(sx * w0, sz * w0, sx * w1, sz * w1, 0, top);
  // cross bracing
  for (let y = 0.05; y < top - 0.05; y += 0.11) {
    const a = W(y), b = W(y + 0.11);
    leg(-a, a, b, b, y, y + 0.11); leg(a, -a, -b, -b, y, y + 0.11);
    leg(-a, -a, -b, b, y, y + 0.11); leg(a, a, b, -b, y, y + 0.11);
  }
  // cross arms (along x, wires run along z)
  for (const [y, half] of [[0.6, 0.19], [0.78, 0.14]]) {
    B.box('solid', -half, y - 0.012, -0.012, half, y, 0.012, STEEL);
    B.quad('solid', [-half, y - 0.012, 0], [0, y - 0.06, 0], [0, y - 0.05, 0], [-half, y - 0.004, 0], STEEL);
    B.quad('solid', [0, y - 0.06, 0], [half, y - 0.012, 0], [half, y - 0.004, 0], [0, y - 0.05, 0], STEEL);
    for (const s of [-1, 1]) B.cyl('solid', s * (half - 0.02), y - 0.05, 0, 0.006, 0.04, 5, col('#d9d4ca'));
  }
  B.cyl('solid', 0, top, 0, 0.006, 0.04, 4, STEEL);
  return packedToGeometry(B.pack().solid);
}

export class PowerLines {
  constructor(scene, game, M) {
    this.game = game; this.world = game.world;
    this.cap = 1500;
    this.pylons = new THREE.InstancedMesh(pylonGeometry(), M.solid, this.cap);
    this.pylons.count = 0; this.pylons.castShadow = true; this.pylons.receiveShadow = true;
    scene.add(this.pylons);
    this.wireMat = new THREE.LineBasicMaterial({ color: 0x2a2d31, transparent: true, opacity: 0.75 });
    this.wires = new THREE.LineSegments(new THREE.BufferGeometry(), this.wireMat);
    this.wires.frustumCulled = false;
    scene.add(this.wires);
    this.key = '';
  }

  update() {
    const w = this.world;
    const key = `${w.lineVersion}|${w.bver}|${w.version}`;
    if (key === this.key) return;
    this.key = key;
    this.rebuild();
  }

  rebuild() {
    const w = this.world, N = w.N;
    const L = (x, z) => w.inb(x, z) && w.pline[w.idx(x, z)] === 1;
    const mask = (x, z) => { let m = 0; for (let d = 0; d < 4; d++) if (L(x + DIRS[d].dx, z + DIRS[d].dz)) m |= DIRS[d].bit; return m; };
    const pyl = new Map(); // tile -> {x, z, a}
    const edgeOut = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!L(x, z)) continue;
      const k = w.idx(x, z);
      const m = mask(x, z);
      const onEdge = x === 0 || z === 0 || x === N - 1 || z === N - 1;
      if (onEdge) {
        for (let d = 0; d < 4; d++) { const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz; if (!w.inb(nx, nz) && !(m & DIRS[d].bit)) edgeOut.push([x, z, d]); }
      }
      if (w.road[k] || w.terrain[k]) continue;
      const straight = m === 5 || m === 10;
      const pos = m === 5 ? z : x;
      if (!straight || pos % 3 === 0 || onEdge) pyl.set(k, { x: x + 0.5, z: z + 0.5, a: m === 10 || m === 2 || m === 8 ? Math.PI / 2 : 0 });
    }
    // facilities the line ends at
    const anchors = new Map();
    for (const b of w.buildings.values()) {
      if (b.state !== 'done' || !b.anchor) continue;
      for (let j = -1; j <= b.h; j++) for (let i = -1; i <= b.w; i++) {
        if ((j < 0 || j >= b.h) === (i < 0 || i >= b.w)) continue;
        if (L(b.x + i, b.z + j)) anchors.set(w.idx(b.x + i, b.z + j), b);
      }
    }
    const segs = [];
    const linkPylons = (A, B2) => segs.push([A, B2]);
    // walk east and south from every pylon to the next pylon
    for (const [k, p] of pyl) {
      const x = k % N, z = (k / N) | 0;
      for (const d of [1, 2]) {
        let cx = x, cz = z, steps = 0;
        for (;;) {
          cx += DIRS[d].dx; cz += DIRS[d].dz; steps++;
          if (!L(cx, cz) || steps > 12) break;
          const q = pyl.get(w.idx(cx, cz));
          if (q) { linkPylons(p, q); break; }
          // a corner without a pylon (road or water): follow it
          const m = mask(cx, cz);
          if (m !== 5 && m !== 10) break;
        }
      }
    }
    // last pylon to the facility
    for (const [k, b] of anchors) {
      let best = pyl.get(k), bd = 0;
      if (!best) {
        // nearest pylon along the line
        const seen = new Set([k]); let front = [k];
        for (let s = 0; s < 8 && !best; s++) {
          const next = [];
          for (const t of front) { const tx = t % N, tz = (t / N) | 0; for (const d of DIRS) { const nk = (tz + d.dz) * N + tx + d.dx; if (seen.has(nk) || !L(tx + d.dx, tz + d.dz)) continue; seen.add(nk); if (pyl.has(nk)) { best = pyl.get(nk); bd = s; break; } next.push(nk); } if (best) break; }
          front = next;
        }
      }
      if (best) segs.push([best, { x: b.anchor[0], z: b.anchor[2], y: b.anchor[1], end: true }]);
      void bd;
    }
    // into the countryside
    const outside = [];
    for (const [x, z, d] of edgeOut) {
      const p = pyl.get(w.idx(x, z)) || { x: x + 0.5, z: z + 0.5, a: d % 2 ? Math.PI / 2 : 0 };
      let prev = p;
      for (let i = 1; i <= 4; i++) {
        const q = { x: x + 0.5 + DIRS[d].dx * i * 3.2, z: z + 0.5 + DIRS[d].dz * i * 3.2, a: d % 2 ? Math.PI / 2 : 0 };
        outside.push(q);
        segs.push([prev, q]);
        prev = q;
      }
    }
    // instances
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (const p of [...pyl.values(), ...outside]) {
      if (n >= this.cap) break;
      e.set(0, p.a, 0); q4.setFromEuler(e); v.set(p.x, 0, p.z);
      m4.compose(v, q4, s1);
      this.pylons.setMatrixAt(n++, m4);
    }
    this.pylons.count = n;
    this.pylons.instanceMatrix.needsUpdate = true;
    this.pylons.computeBoundingSphere();
    // conductors with sag
    const pts = [];
    const attach = (p, i, dirx, dirz) => {
      if (p.end) { const s = (i % 2 ? 1 : -1) * (i < 4 ? 0.05 : 0); return [p.x - dirz * s, p.y, p.z + dirx * s]; }
      const [off, y] = ARMS[i];
      // arms point across the pylon's own orientation
      const ax = Math.cos(p.a), az = -Math.sin(p.a);
      return [p.x + ax * off, y, p.z + az * off];
    };
    for (const [A, Bp] of segs) {
      const dx = Bp.x - A.x, dz = Bp.z - A.z, len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      const wiresN = Bp.end || A.end ? 4 : 5;
      for (let i = 0; i < wiresN; i++) {
        const a = attach(A, i, ux, uz), b = attach(Bp, i, ux, uz);
        const sag = Math.min(0.12, 0.022 * len);
        const S = 8;
        let px = a[0], py = a[1], pz = a[2];
        for (let t = 1; t <= S; t++) {
          const f = t / S;
          const x = a[0] + (b[0] - a[0]) * f, z = a[2] + (b[2] - a[2]) * f;
          const y = a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f);
          pts.push(px, py, pz, x, y, z);
          px = x; py = y; pz = z;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.wires.geometry.dispose();
    this.wires.geometry = g;
  }
}
