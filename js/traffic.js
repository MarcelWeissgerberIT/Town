import * as THREE from 'three';
import { Builder, packedToGeometry } from './geom.js';
import { VEH, VEH_LEN } from './vehicles.js';
import { Nav } from './nav.js';
import { DIRS, hash2, mulberry32, pick, clamp, col } from './util.js';
import { CAR_COLS, SERVICES } from './config.js';
import { U, withFade, fadeDepthMaterial, glowMaterial } from './materials.js';
import { vehicleMaterial } from './vehicles.js';

const W1 = [1, 1, 1];
const vt = (name, kind, speed, cap, color) => ({ name, build: (B) => VEH[kind](B, 'veh', W1), speed, len: VEH_LEN[kind], cap, color });
const TYPES = {
  car: vt('Auto', 'car', 0.85, 160),
  hatch: vt('Kleinwagen', 'hatch', 0.82, 140),
  kombi: vt('Kombi', 'kombi', 0.85, 120),
  taxi: vt('Taxi', 'taxi', 0.85, 20, '#efe6c8'),
  police: vt('Polizeistreife', 'police', 0.9, 24, '#f4f5f4'),
  bus: vt('Linienbus', 'bus', 0.62, 12, '#f2c230'),
  garbage: vt('Müllwagen', 'garbage', 0.75, 40, '#f07b1d'),
  fire: vt('Feuerwehr', 'fire', 1.0, 10, '#d42a1f'),
  ambulance: vt('Rettungswagen', 'ambulance', 1.0, 20, '#f6f6f2'),
  van: vt('Lieferwagen', 'van', 0.75, 40),
  post: vt('Postauto', 'post', 0.75, 6, '#ffcc00'),
  truck: vt('Lastwagen', 'truck', 0.6, 30),
  mixer: vt('Betonmischer', 'mixer', 0.55, 16, '#e6a52a'),
  moving: vt('Umzugswagen', 'moving', 0.7, 12, '#2f6db5'),
};
const CAR_KINDS = ['car', 'car', 'hatch', 'hatch', 'kombi'];

const LANE = 0.15;            // lane offset on a street
const LANE2 = [0.11, 0.31];  // inner and outer lane of a main road
const RING = 0.3;            // radius of the lane around a roundabout island
const RING_IN = 0.42;        // entry and exit points lie this far around from the arm
const R = (d) => [-d[1], d[0]];

function bezPt(p0, p1, p2, p3, t, out, o = 0) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  out[o] = a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0];
  out[o + 1] = a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1];
}
// a segment is a polyline with cumulative lengths; vehicles move along it by distance
function polySeg(pts, turn, dIn, dOut) {
  const n = pts.length / 2 - 1;
  const cum = new Float32Array(n + 1);
  for (let j = 1; j <= n; j++) cum[j] = cum[j - 1] + Math.hypot(pts[j * 2] - pts[j * 2 - 2], pts[j * 2 + 1] - pts[j * 2 - 1]);
  return { pts, cum, len: Math.max(0.05, cum[n]), turn, dIn, dOut };
}
function bezSeg(p0, p1, p2, p3, turn, dIn, dOut, n = 10) {
  const pts = new Float32Array((n + 1) * 2);
  for (let j = 0; j <= n; j++) bezPt(p0, p1, p2, p3, j / n, pts, j * 2);
  return polySeg(pts, turn, dIn, dOut);
}
// position and direction at distance s along a segment
function segAt(seg, s, out) {
  const { pts, cum } = seg, n = cum.length - 1;
  if (s <= 0) s = 0;
  let j = 1;
  while (j < n && cum[j] < s) j++;
  const l = cum[j] - cum[j - 1] || 1e-6, f = Math.min(1, Math.max(0, (s - cum[j - 1]) / l));
  const ax = pts[j * 2 - 2], az = pts[j * 2 - 1], bx = pts[j * 2], bz = pts[j * 2 + 1];
  out[0] = ax + (bx - ax) * f; out[1] = az + (bz - az) * f;
  out[2] = bx - ax; out[3] = bz - az;
  return out;
}
const wrap = (a) => { a %= Math.PI * 2; return a < 0 ? a + Math.PI * 2 : a; };

function popcount(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }

export class Traffic {
  constructor(scene, game, M, T, quality) {
    this.scene = scene; this.game = game; this.world = game.world; this.M = M;
    this.nav = new Nav(this.world);
    this.vehicles = [];
    this.nextId = 1;
    this.time = 0;
    this.maxCars = quality.cars;
    this.rng = mulberry32(4242);
    this.spawnTimer = 0;
    this.version = -1;
    this.signals = new Map();
    // own materials for moving vehicles: they dissolve when they appear or leave
    this.matBeacon = withFade(new THREE.MeshBasicMaterial({ vertexColors: true }), 'beacon');
    const vmat = { veh: withFade(vehicleMaterial({ map: T.veh, orm: T.vehOrm }), 'veh'), glow: withFade(glowMaterial(), 'glow'), beacon: this.matBeacon };
    const depth = fadeDepthMaterial();
    this.meshes = {};
    const m4 = new THREE.Matrix4();
    for (const t in TYPES) {
      const B = new Builder();
      TYPES[t].build(B);
      const pk = B.pack();
      const parts = [];
      for (const k in pk) {
        const mat = vmat[k] || M[k];
        if (!mat) continue;
        const geo = packedToGeometry(pk[k]);
        const fade = new THREE.InstancedBufferAttribute(new Float32Array(TYPES[t].cap), 1);
        fade.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aFade', fade);
        const im = new THREE.InstancedMesh(geo, mat, TYPES[t].cap);
        im.customDepthMaterial = depth;
        im.count = 0; im.castShadow = true; im.receiveShadow = true;
        im.frustumCulled = false;
        if (k === 'veh' || k === 'beacon') im.setColorAt(0, new THREE.Color(1, 1, 1));
        for (let i = 0; i < TYPES[t].cap; i++) im.setMatrixAt(i, m4);
        scene.add(im);
        parts.push({ k, im, fade });
      }
      this.meshes[t] = parts;
    }
    // headlight pools at night
    const pg = new THREE.PlaneGeometry(0.34, 0.5); pg.rotateX(-Math.PI / 2); pg.translate(0, 0.006, 0);
    this.poolMat = new THREE.MeshBasicMaterial({ map: T.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0d0, opacity: 0 });
    this.pools = new THREE.InstancedMesh(pg, this.poolMat, 400);
    this.pools.count = 0; this.pools.frustumCulled = false; this.pools.renderOrder = 2;
    scene.add(this.pools);
    // traffic lights: pole, housing and three lamps (instanced, lamps coloured per state)
    const poleB = new Builder();
    poleB.cyl('solid', 0, 0, 0, 0.0065, 0.24, 6, col('#3a3f44'));
    poleB.cyl('solid', 0, 0, 0, 0.011, 0.012, 6, col('#3a3f44'));
    poleB.box('solid', -0.012, 0.165, -0.008, 0.012, 0.245, 0.006, col('#1e2124'));
    poleB.box('solid', -0.016, 0.163, -0.009, 0.016, 0.247, -0.007, col('#e8e8e4'));
    this.cap = 1600;
    this.poleMesh = new THREE.InstancedMesh(packedToGeometry(poleB.pack().solid), M.solid, this.cap);
    this.poleMesh.count = 0; this.poleMesh.castShadow = true;
    scene.add(this.poleMesh);
    const lg = new THREE.CircleGeometry(0.0085, 10);
    lg.translate(0, 0, 0.0065);
    this.lamps = [0, 1, 2].map(() => {
      const im = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.cap);
      im.count = 0; im.setColorAt(0, new THREE.Color(0, 0, 0));
      scene.add(im);
      return im;
    });
    this.lightMesh = this.lamps[0];
    this.signalHeads = [];
    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), e: new THREE.Euler(), c: new THREE.Color() };
    this.busRoute = [];
    const NN = this.world.N * this.world.N;
    this.flow = new Float32Array(NN);
    this.jam = new Float32Array(NN);
    this.statT = 0;
    this.ctl = new Uint8Array(NN);
  }

  // ---- signals
  // control of every junction tile (1 lights, 2 roundabout, 3 give way) and the light poles
  rebuildSignals() {
    const w = this.world, N = w.N;
    this.signals.clear();
    this.signalHeads = [];
    if (!this.ctl || this.ctl.length !== N * N) this.ctl = new Uint8Array(N * N);
    this.ctl.fill(0);
    const { m, q, p, s, e } = this.tmp;
    let n = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const c = w.control(x, z);
      if (c < 0) continue;
      const k = z * N + x;
      this.ctl[k] = c === 0 ? 3 : c;
      if (c !== 1) continue;
      const mask = w.roadMask(x, z);
      // the busier road (main road) gets the longer green phase
      const tNS = Math.max(w.roadType(x, z - 1), w.roadType(x, z + 1)), tEW = Math.max(w.roadType(x - 1, z), w.roadType(x + 1, z));
      this.signals.set(k, { off: hash2(x, z, 9) * 16, split: tNS > tEW ? 9.5 : tNS < tEW ? 6.5 : 8 });
      for (let d = 0; d < 4; d++) {
        if (!(mask & DIRS[d].bit)) continue;
        // traffic arriving from neighbour d travels in direction (d+2)%4
        const t = DIRS[(d + 2) % 4];
        const tv = [t.dx, t.dz], r = R(tv);
        const side = (w.roadType(x + DIRS[d].dx, z + DIRS[d].dz) || 1) === 2 ? 0.465 : 0.41;
        const px = x + 0.5 - 0.41 * tv[0] + side * r[0], pz = z + 0.5 - 0.41 * tv[1] + side * r[1];
        if (n >= this.cap) break;
        // housing faces the arriving traffic (local +z toward -tv)
        e.set(0, Math.atan2(-tv[0], -tv[1]), 0); q.setFromEuler(e);
        p.set(px, 0.026, pz); m.compose(p, q, s);
        this.poleMesh.setMatrixAt(n, m);
        for (let l = 0; l < 3; l++) {
          p.set(px, 0.026 + 0.231 - l * 0.026, pz); m.compose(p, q, s);
          this.lamps[l].setMatrixAt(n, m);
        }
        this.signalHeads.push({ k, axis: (d % 2 === 0) ? 0 : 1 });
        n++;
      }
    }
    this.poleMesh.count = n;
    this.poleMesh.instanceMatrix.needsUpdate = true; this.poleMesh.computeBoundingSphere();
    for (const im of this.lamps) { im.count = n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
  // 0 green, 1 yellow, 2 red for an axis (0 = north/south traffic, 1 = east/west)
  signal(k, axis) {
    const sg = this.signals.get(k);
    if (!sg) return 0;
    const t = (this.time + sg.off) % 16;
    if (axis === 0) return t < sg.split - 1.3 ? 0 : t < sg.split ? 1 : 2;
    return t >= sg.split && t < 14.7 ? 0 : t >= 14.7 ? 1 : 2;
  }
  // give way at a junction without lights: right before left, main roads first
  yieldCross(v, tile, grid) {
    const vd = v.seg.dOut, vt = this.turnAt(v.path, v.i + 1), my = this.rtype(v.path[v.i]);
    const rr = R(vd);
    const key = (t) => (t[1] + 100) * 1000 + (t[0] + 100);
    const crossing = (ud, ut) => !(ud[0] === vd[0] && ud[1] === vd[1]) && !(ud[0] === -vd[0] && ud[1] === -vd[1] && ut !== 'L' && vt !== 'L');
    for (const u of grid.get(key(tile)) || []) {
      if (u === v || u.leaving || !u.seg.dIn) continue;
      if (crossing(u.seg.dIn, u.seg.turn)) return true;
    }
    for (const d of DIRS) {
      for (const u of grid.get(key([tile[0] + d.dx, tile[1] + d.dz])) || []) {
        if (u === v || u.leaving) continue;
        const un = u.path[u.i + 1];
        if (!un || un[0] !== tile[0] || un[1] !== tile[1] || u.seg.len - u.s > 0.45) continue;
        const ud = u.seg.dOut;
        if (!crossing(ud, this.turnAt(u.path, u.i + 1))) continue;
        const ut = this.rtype(u.path[u.i]);
        if (ut > my) return true;
        // right before left – unless we have already waited much longer (drivers wave each other through)
        if (ut === my && ud[0] === -rr[0] && ud[1] === -rr[1] && !(v.wait > (u.wait || 0) + 1.5)) return true;
      }
    }
    return false;
  }
  // entering a roundabout: give way to traffic already on the ring
  yieldRound(v, tile, grid) {
    const vd = v.seg.dOut, cx = tile[0] + 0.5, cz = tile[1] + 0.5;
    const aIn = Math.atan2(-vd[1], -vd[0]) - RING_IN;
    for (const u of grid.get((tile[1] + 100) * 1000 + (tile[0] + 100)) || []) {
      if (u === v || u.leaving) continue;
      const ax = u.pos[0] - cx, az = u.pos[1] - cz;
      if (Math.hypot(ax, az) > 0.4) continue;
      const dl = wrap(Math.atan2(az, ax) - aIn);
      if (dl < 1.9 || dl > Math.PI * 2 - 0.4) return true;
    }
    return false;
  }

  // ---- spawning helpers
  pathTiles(kpath) { const N = this.world.N; return kpath.map((k) => [k % N, (k / N) | 0]); }
  outerTiles(edge, count, inbound) {
    const N = this.world.N; const x = edge.k % N, z = (edge.k / N) | 0;
    const d = DIRS[edge.d];
    const tiles = [];
    for (let j = count; j >= 1; j--) tiles.push([x + d.dx * j, z + d.dz * j]);
    return inbound ? tiles : tiles.reverse();
  }
  // ---- lanes and segments
  rtype(t) { const w = this.world; return w.inb(t[0], t[1]) ? w.road[w.idx(t[0], t[1])] || 1 : 1; }
  isRound(t) { const w = this.world; return w.inb(t[0], t[1]) && this.ctl && this.ctl[w.idx(t[0], t[1])] === 2; }
  // turn made on tile j of a path: 'L', 'R', 'S', 'U' or null at the ends
  turnAt(path, j) {
    const a = path[j - 1], b = path[j], c = path[j + 1];
    if (!a || !c) return null;
    const di = [b[0] - a[0], b[1] - a[1]], dO = [c[0] - b[0], c[1] - b[1]];
    if (di[0] === dO[0] && di[1] === dO[1]) return 'S';
    if (di[0] === -dO[0] && di[1] === -dO[1]) return 'U';
    return (di[0] * dO[1] - di[1] * dO[0]) > 0 ? 'R' : 'L';
  }
  // on main roads: outer lane before a right turn, inner lane before a left turn
  assignLanes(v, from = 0) {
    const p = v.path, n = p.length;
    if (!v.lanes || v.lanes.length !== n) v.lanes = new Uint8Array(n);
    for (let i = from; i < n; i++) {
      let lane = v.pref;
      for (let j = i + 1; j <= Math.min(n - 2, i + 2); j++) {
        const t = this.turnAt(p, j);
        if (t === 'R') { lane = 1; break; }
        if (t === 'L' || t === 'U') { lane = 0; break; }
      }
      v.lanes[i] = lane;
    }
  }
  laneOff(v, i) {
    const t = v.path[i];
    if (!t) return LANE;
    return this.rtype(t) === 2 ? LANE2[v.lanes[i]] : LANE;
  }
  setPath(v, path) {
    v.path = path; v.i = 0; v.s = 0;
    v.lanes = null;
    this.assignLanes(v);
    v.seg = this.makeSeg(v, 0);
    this.enterTile(v);
  }
  enterTile(v) {
    const t = v.path[v.i], w = this.world;
    if (t && w.inb(t[0], t[1])) this.flow[w.idx(t[0], t[1])] += 1;
  }
  makeSeg(v, i) {
    const path = v.path;
    const [x, z] = path[i];
    const c = [x + 0.5, z + 0.5];
    const prev = path[i - 1], next = path[i + 1];
    const dIn = prev ? [x - prev[0], z - prev[1]] : null;
    const dOut = next ? [next[0] - x, next[1] - z] : null;
    const o0 = this.laneOff(v, i), o1 = next ? this.laneOff(v, i + 1) : o0;
    let p0, p3, t0, t3;
    if (dIn) { const r = R(dIn); p0 = [c[0] - 0.5 * dIn[0] + o0 * r[0], c[1] - 0.5 * dIn[1] + o0 * r[1]]; t0 = dIn; }
    else { const r = R(dOut); p0 = [c[0] - 0.1 * dOut[0] + o0 * r[0], c[1] - 0.1 * dOut[1] + o0 * r[1]]; t0 = dOut; }
    if (dOut) { const r = R(dOut); p3 = [c[0] + 0.5 * dOut[0] + o1 * r[0], c[1] + 0.5 * dOut[1] + o1 * r[1]]; t3 = dOut; }
    else { const r = R(dIn); p3 = [c[0] + o0 * r[0], c[1] + o0 * r[1]]; t3 = dIn; }
    const turn = dIn && dOut ? this.turnAt(path, i) : 'S';
    // around the island of a roundabout (counter-clockwise, island on the left)
    if (dIn && dOut && this.isRound(path[i])) {
      const aIn = Math.atan2(-dIn[1], -dIn[0]) - RING_IN;
      let aOut = Math.atan2(dOut[1], dOut[0]) + RING_IN;
      while (aOut > aIn - 0.35) aOut -= Math.PI * 2;
      const pts = [];
      const ring = (a) => [c[0] + Math.cos(a) * RING, c[1] + Math.sin(a) * RING];
      const tan = (a) => [Math.sin(a), -Math.cos(a)];
      const E = ring(aIn), X = ring(aOut), te = tan(aIn), tx = tan(aOut);
      const tmp = [0, 0];
      for (let j = 0; j < 4; j++) { bezPt(p0, [p0[0] + t0[0] * 0.07, p0[1] + t0[1] * 0.07], [E[0] - te[0] * 0.07, E[1] - te[1] * 0.07], E, j / 4, tmp); pts.push(tmp[0], tmp[1]); }
      const steps = Math.max(2, Math.ceil((aIn - aOut) / 0.3));
      for (let j = 0; j < steps; j++) { const p = ring(aIn + (aOut - aIn) * j / steps); pts.push(p[0], p[1]); }
      for (let j = 0; j <= 4; j++) { bezPt(X, [X[0] + tx[0] * 0.07, X[1] + tx[1] * 0.07], [p3[0] - t3[0] * 0.07, p3[1] - t3[1] * 0.07], p3, j / 4, tmp); pts.push(tmp[0], tmp[1]); }
      const seg = polySeg(new Float32Array(pts), turn, dIn, dOut);
      seg.round = { cx: c[0], cz: c[1], aIn };
      return seg;
    }
    const chord = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
    let k = chord / 3;
    if (!dIn || !dOut) k = chord * 0.35;
    else if (turn === 'U') k = 0.5;
    else if (turn !== 'S') k = chord * 0.39;
    return bezSeg(p0, [p0[0] + t0[0] * k, p0[1] + t0[1] * k], [p3[0] - t3[0] * k, p3[1] - t3[1] * k], p3, turn, dIn, dOut);
  }

  addVehicle(type, path, opts = {}) {
    if (path.length < 2) return null;
    const T = TYPES[type];
    if (this.vehicles.filter((v) => v.type === type).length >= T.cap) return null;
    const v = {
      id: this.nextId++, type, path, i: 0, s: 0, seg: null, speed: 0.2,
      max: T.speed * (0.9 + this.rng() * 0.2), pos: [0, 0, 1, 0], color: opts.color || T.color || pick(this.rng, CAR_COLS),
      role: opts.role || 'trip', data: opts.data || {}, wait: 0, ghost: 0, dwell: 0, name: opts.name || T.name, dest: opts.dest || null,
      fade: opts.offmap ? 0 : 1, fadeDir: opts.offmap ? 0 : -1, leaving: false,
    };
    v.c = new THREE.Color(v.color);
    v.pref = T.speed < 0.7 || type === 'bus' ? 1 : this.rng() < 0.5 ? 1 : 0;
    this.setPath(v, path);
    segAt(v.seg, 0, v.pos);
    this.vehicles.push(v);
    return v;
  }
  // trip between two buildings (or outside when a or b is null)
  trip(type, a, b, opts = {}) {
    const nav = this.nav;
    // shoppers and visitors often drive straight into a car park nearby
    if (b && (b.kind === 'com' || b.kind === 'svc') && (type === 'car' || type === 'hatch' || type === 'kombi') && this.rng() < 0.7) {
      const pk = this.parkNear(b);
      if (pk) { opts = { ...opts, parkAt: pk.id }; b = pk; }
    }
    let starts, goal, pre = [], post = [];
    const edges = (!a || !b) ? nav.edgeTiles() : null;
    if (a) starts = nav.frontTiles(a);
    else { if (!edges.length) return null; const e = pick(this.rng, edges); starts = [e.k]; pre = this.outerTiles(e, 14, true); }
    if (!starts.length) return null;
    let endEdge = null;
    if (b) { const g = new Set(nav.frontTiles(b)); if (!g.size) return null; goal = (k) => g.has(k); }
    else { if (!edges.length) return null; endEdge = pick(this.rng, edges); goal = (k) => k === endEdge.k; }
    const kp = nav.bfs(starts, goal, 90);
    if (!kp) return null;
    if (endEdge) post = this.outerTiles(endEdge, 14, false);
    const path = [...pre, ...this.pathTiles(kp), ...post];
    if (path.length < 2) return null;
    return this.addVehicle(type, path, { ...opts, endOffset: opts.endOffset ?? 0, dest: b, offmap: !a });
  }

  // drive from road tiles to the nearest of a set of goal tiles
  drive(type, starts, goals, opts = {}) {
    const g = goals instanceof Set ? goals : new Set(goals);
    if (!starts.length || !g.size) return null;
    const kp = this.nav.bfs(starts, (k) => g.has(k), opts.depth || 160);
    if (!kp) return null;
    const path = [...(opts.pre || []), ...this.pathTiles(kp), ...(opts.post || [])];
    if (path.length < 2) return null;
    return this.addVehicle(type, path, { ...opts, offmap: !!opts.pre });
  }
  // a start just outside the map on a road leaving it
  edgeStart() {
    const edges = this.nav.edgeTiles();
    if (!edges.length) return null;
    const e = pick(this.rng, edges);
    return { starts: [e.k], pre: this.outerTiles(e, 14, true) };
  }
  // the road tile a vehicle currently stands on (end of its path)
  tileOf(v) {
    const last = v.path[v.path.length - 1];
    const N = this.world.N;
    if (!this.world.inb(last[0], last[1])) return -1;
    return last[1] * N + last[0];
  }
  // send a vehicle on from where it stands; goals: tile set, or 'edge' to leave the map
  reroute(v, goals, dwell = 0) {
    const k = this.tileOf(v);
    if (k < 0 || !this.world.road[k]) return false;
    let kp, post = [];
    if (goals === 'edge') {
      const edges = this.nav.edgeTiles();
      if (!edges.length) return false;
      const set = new Map(edges.map((e) => [e.k, e]));
      kp = this.nav.bfs([k], (x) => set.has(x), 200);
      if (!kp) return false;
      post = this.outerTiles(set.get(kp[kp.length - 1]), 14, false);
    } else {
      const g = goals instanceof Set ? goals : new Set(goals);
      if (g.has(k)) kp = [k, k];
      else kp = this.nav.bfs([k], (x) => g.has(x), 200);
      if (!kp) return false;
    }
    const path = [...this.pathTiles(kp), ...post];
    if (path.length < 2) return false;
    this.setPath(v, path); v.dwellAtEnd = dwell;
    return true;
  }

  // a car park with free spaces within walking distance of a building
  parkNear(b) {
    let best = null, bs = 0;
    for (const f of this.world.buildings.values()) {
      const S = SERVICES[f.type];
      if (!S?.park || f.state !== 'done' || (f.occ ?? 0) > 0.97) continue;
      const d = Math.hypot(f.x + f.w / 2 - b.x - b.w / 2, f.z + f.h / 2 - b.z - b.h / 2);
      if (d > S.radius) continue;
      const sc = S.park * (1.05 - (f.occ ?? 0)) / (1 + d);
      if (sc > bs) { bs = sc; best = f; }
    }
    return best;
  }

  buildingsBy(filter) { const out = []; for (const b of this.world.buildings.values()) if (b.state === 'done' && filter(b)) out.push(b); return out; }
  nearView(list, view) {
    if (!view || !list.length) return list;
    const near = list.filter((b) => Math.abs(b.x - view.x) < view.r && Math.abs(b.z - view.z) < view.r);
    return near.length && this.rng() < 0.8 ? near : list;
  }

  spawnTraffic(view, sim) {
    const rng = this.rng;
    const hour = sim.hour;
    const activity = hour < 5 ? 0.18 : hour < 6.5 ? 0.45 : hour < 9 ? 1.15 : hour < 16 ? 0.85 : hour < 19 ? 1.1 : hour < 22 ? 0.6 : 0.3;
    const target = Math.min(this.maxCars, Math.round((6 + sim.pop * 0.03) * activity));
    const homes = this.buildingsBy((b) => b.kind === 'res');
    const work = this.buildingsBy((b) => b.kind === 'com' || b.kind === 'ind' || b.kind === 'svc');
    const cars = this.vehicles.filter((v) => v.role === 'trip').length;
    if (cars < target && homes.length) {
      const r = rng();
      const type = r < 0.06 ? 'taxi' : r < 0.18 ? 'van' : pick(rng, CAR_KINDS);
      const a = pick(rng, this.nearView(homes, view));
      if (rng() < 0.18) this.trip(type, rng() < 0.5 ? a : null, rng() < 0.5 ? null : a);
      else this.trip(type, a, pick(rng, this.nearView(work.length ? work : homes, view)));
    }
    // trucks between industry and the outside world
    const ind = this.buildingsBy((b) => b.kind === 'ind');
    const trucks = this.vehicles.filter((v) => v.type === 'truck').length;
    if (ind.length && trucks < Math.min(12, 1 + sim.jobsI / 60) && rng() < 0.3) {
      const b = pick(rng, ind);
      if (rng() < 0.5) this.trip('truck', b, null); else this.trip('truck', null, b);
    }
    // deliveries from industry to shops
    const shops = this.buildingsBy((b) => b.kind === 'com');
    if (ind.length && shops.length && this.vehicles.filter((v) => v.type === 'van' && v.role === 'delivery').length < 1 + shops.length / 12 && rng() < 0.25) {
      this.trip('van', pick(rng, ind), pick(rng, this.nearView(shops, view)), { role: 'delivery', color: '#e9e9e6', name: 'Lieferwagen' });
    }
    // post van
    if (sim.pop > 300 && this.vehicles.filter((v) => v.type === 'post').length < 2 && hour > 8 && hour < 17 && rng() < 0.05) {
      const v = this.trip('post', null, pick(rng, this.nearView(homes, view)), { role: 'rounds', data: { legs: 4 } });
      if (v) v.dwellAtEnd = 2;
    }
    // police patrols from stations
    for (const st of this.buildingsBy((b) => b.type === 'police')) {
      if (this.vehicles.filter((v) => v.type === 'police' && v.data.home === st.id).length < 2 && rng() < 0.08) {
        const to = pick(rng, this.nearView(homes.length ? homes : work, view));
        this.trip('police', st, to, { role: 'patrol', data: { home: st.id, legs: 3 } });
      }
    }
    this.spawnBuses(sim);
  }

  spawnBuses(sim) {
    const w = this.world, N = w.N;
    const stops = [];
    for (let k = 0; k < w.busstop.length; k++) if (w.busstop[k] && w.road[k]) stops.push(k);
    const want = stops.length >= 2 ? Math.min(6, Math.ceil(stops.length / 3)) : 0;
    const buses = this.vehicles.filter((v) => v.type === 'bus');
    if (buses.length >= want) return;
    // nearest-neighbour loop through all stops
    const order = [stops[0]]; const left = new Set(stops.slice(1));
    while (left.size) {
      const last = order[order.length - 1];
      let best = null, bd = 1e9;
      for (const s of left) { const d = Math.abs(s % N - last % N) + Math.abs(((s / N) | 0) - ((last / N) | 0)); if (d < bd) { bd = d; best = s; } }
      order.push(best); left.delete(best);
    }
    const start = order[(buses.length * 2) % order.length];
    const nextIdx = (order.indexOf(start) + 1) % order.length;
    const kp = this.nav.bfs([start], (k) => k === order[nextIdx], 200);
    if (!kp) return;
    const v = this.addVehicle('bus', this.pathTiles(kp), { offmap: false, role: 'bus', data: { order, at: nextIdx, line: 1 + buses.length }, name: `Linienbus ${1 + buses.length}` });
    if (v) v.dwellAtEnd = 3.5;
  }

  // dispatch a vehicle from a station building to a target building (fire, ambulance)
  dispatch(type, station, target, data = {}) {
    const v = this.trip(type, station, target, { role: 'emergency', data: { ...data, home: station.id, siren: true } });
    if (v) v.dwellAtEnd = data.dwell || 8;
    return v;
  }
  sendTo(type, target, role, dwell = 6, name) {
    const v = this.trip(type, null, target, { role, name });
    if (v) v.dwellAtEnd = dwell;
    return v;
  }

  // next leg when a vehicle reaches the end of its path
  arrive(v) {
    const rng = this.rng;
    if (v.ctl) return v.ctl.arrive(v, this);
    // no space near a shop: a round of searching for a parking space
    if (v.role === 'trip' && v.dest && v.dest.kind === 'com' && (v.dest.park ?? 1) < 0.6 && !v.data.searched && rng() < 0.8) {
      v.data.searched = true;
      const k = this.tileOf(v);
      if (k >= 0) {
        const cand = this.nav.reachable(k, 5);
        if (cand.length > 3 && this.reroute(v, [pick(rng, cand)], 0)) { v.name = `${TYPES[v.type].name} · sucht einen Parkplatz`; return true; }
      }
    }
    if (v.role === 'bus') {
      const d = v.data; const from = d.order[d.at]; d.at = (d.at + 1) % d.order.length;
      const kp = this.nav.bfs([from], (k) => k === d.order[d.at], 200);
      if (!kp || kp.length < 2) return false;
      this.game.emit('busStop', v, from);
      this.setPath(v, this.pathTiles(kp)); v.dwellAtEnd = 3.5;
      return true;
    }
    if ((v.role === 'rounds' || v.role === 'patrol') && v.data.legs > 0) {
      v.data.legs--;
      const last = v.path[v.path.length - 1];
      const N = this.world.N;
      const k = last[1] * N + last[0];
      if (!this.world.road[k]) return false;
      let kp;
      if (v.data.legs === 0 && v.data.home) {
        const hb = this.world.buildings.get(v.data.home);
        if (hb) { const g = new Set(this.nav.frontTiles(hb)); kp = this.nav.bfs([k], (x) => g.has(x), 120); }
      } else {
        const cand = this.nav.reachable(k, 14);
        const goal = pick(rng, cand);
        kp = this.nav.bfs([k], (x) => x === goal, 40);
      }
      if (!kp || kp.length < 2) return false;
      this.setPath(v, this.pathTiles(kp));
      return true;
    }
    if (v.role === 'emergency' && !v.data.returning) {
      this.game.emit('emergencyArrived', v);
      const hb = this.world.buildings.get(v.data.home);
      if (!hb) return false;
      const last = v.path[v.path.length - 1];
      const N = this.world.N; const k = last[1] * N + last[0];
      const g = new Set(this.nav.frontTiles(hb));
      const kp = this.nav.bfs([k], (x) => g.has(x), 150);
      if (!kp || kp.length < 2) return false;
      v.data.returning = true; v.data.siren = false;
      this.setPath(v, this.pathTiles(kp)); v.dwellAtEnd = 0;
      return true;
    }
    if ((v.role === 'site' || v.role === 'moving') && !v.data.leaving) {
      v.data.leaving = true;
      const last = v.path[v.path.length - 1];
      const N = this.world.N; const k = last[1] * N + last[0];
      const edges = this.nav.edgeTiles();
      if (!edges.length) return false;
      const e = pick(rng, edges);
      const kp = this.nav.bfs([k], (x) => x === e.k, 150);
      if (!kp || kp.length < 2) return false;
      this.setPath(v, [...this.pathTiles(kp), ...this.outerTiles(e, 14, false)]);
      return true;
    }
    return false;
  }

  update(dt, sim, view) {
    this.time += dt;
    if (this.version !== this.world.version) {
      this.version = this.world.version;
      this.rebuildSignals();
      // drop vehicles whose path crosses removed roads
      const w = this.world, N = w.N;
      for (const v of this.vehicles) if (!v.leaving && !v.path.every(([x, z]) => !w.inb(x, z) || w.road[z * N + x])) this.leave(v);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 0.35; this.spawnTraffic(view, sim); }
    this.parkT = (this.parkT || 0) - dt;
    if (this.parkT <= 0) { this.parkT = 3; this.updateParked(sim.hour); }
    // traffic volume per tile and queues at junctions (smoothed)
    this.statT += dt;
    if (this.statT > 1) {
      const f = Math.pow(0.985, this.statT);
      for (let k = 0; k < this.flow.length; k++) { this.flow[k] *= f; this.jam[k] *= 0.9; }
      for (const v of this.vehicles) if (v.held >= 0 && v.speed < 0.05) this.jam[v.held] += 0.1;
      this.statT = 0;
    }

    // spatial hash
    const grid = new Map();
    const N = this.world.N;
    for (const v of this.vehicles) {
      const [x, z] = v.path[v.i];
      const k = (z + 100) * 1000 + (x + 100);
      (grid.get(k) || grid.set(k, []).get(k)).push(v);
    }
    const out = [0, 0, 0, 0];
    for (const v of this.vehicles) {
      if (v.fadeDir) {
        v.fade = clamp(v.fade + v.fadeDir * dt / 0.9, 0, 1);
        if (v.fadeDir < 0 && v.fade <= 0) v.fadeDir = 0;
        else if (v.fadeDir > 0 && v.fade >= 1) { v.done = true; continue; }
      }
      if (v.leaving) { v.speed = 0; continue; }
      if (v.dwell > 0) { v.dwell -= dt; v.speed = 0; if (v.dwell <= 0 && !this.arrive(v)) this.leave(v); continue; }
      let target = v.max * (v.seg.turn === 'S' ? 1 : v.seg.turn === 'U' ? 0.35 : 0.55);
      // brake towards the end of the route instead of stopping dead
      if (v.i === v.path.length - 1) target = Math.min(target, Math.max(0, v.seg.len - v.s) * 2.4 + 0.03);
      // pulling away from a building: start gently while appearing
      if (v.fade > 0) target = Math.min(target, 0.15 + (1 - v.fade) * v.max);
      // junction ahead: lights, roundabout or give way
      const nxt = v.path[v.i + 1];
      v.held = -1;
      if (nxt && this.world.inb(nxt[0], nxt[1]) && v.seg.dOut && v.data.siren !== true) {
        const k = nxt[1] * N + nxt[0];
        const c = this.ctl[k];
        if (c) {
          const dist = v.seg.len - 0.21 - v.s;
          let hold = false;
          if (c === 1) {
            const st = this.signal(k, v.seg.dOut[1] !== 0 ? 0 : 1);
            hold = st !== 0 && !(st === 1 && dist < 0.12);
          } else if (dist < 0.7 && dist > -0.02 && !(v.ghost > 0)) hold = c === 2 ? this.yieldRound(v, nxt, grid) : this.yieldCross(v, nxt, grid);
          if (hold && dist > -0.02) { target = Math.min(target, Math.max(0, dist) * 3.2); v.held = k; }
        }
      }
      // keep distance to vehicles ahead
      const vx = v.pos[2], vz = v.pos[3]; const vl = Math.hypot(vx, vz) || 1;
      const fx = vx / vl, fz = vz / vl;
      let gap = 9;
      if (v.ghost > 0) v.ghost -= dt;
      else {
        const tiles = [v.path[v.i], v.path[v.i + 1], v.path[v.i + 2]];
        for (const t of tiles) {
          if (!t) continue;
          const list = grid.get((t[1] + 100) * 1000 + (t[0] + 100));
          if (!list) continue;
          for (const u of list) {
            if (u === v) continue;
            const rx = u.pos[0] - v.pos[0], rz = u.pos[1] - v.pos[1];
            const ahead = rx * fx + rz * fz;
            if (ahead <= 0 || ahead > 0.75) continue;
            const lat = Math.abs(rx * fz - rz * fx);
            if (lat > 0.11) continue;
            const ul = Math.hypot(u.pos[2], u.pos[3]) || 1;
            if ((u.pos[2] * fx + u.pos[3] * fz) / ul < -0.3) continue;
            const need = (TYPES[v.type].len + TYPES[u.type].len) / 2 + 0.06;
            gap = Math.min(gap, ahead - need);
          }
        }
      }
      if (gap < 9) target = Math.min(target, Math.max(0, gap) * 3);
      // waiting at a red light is normal; only real deadlocks let a vehicle squeeze through
      if (v.held >= 0 && this.ctl[v.held] === 1) v.wait = 0;
      else if (v.speed < 0.02 && target < 0.02) { v.wait += dt; if (v.wait > 6 + (v.id % 4) * 0.7) { v.ghost = 1.6; v.wait = 0; } } else v.wait = 0;
      // overtake on main roads: change lane on the next tile
      if (v.lc > 0) v.lc -= dt;
      else if (gap < 0.4 && v.held < 0 && v.i + 3 < v.path.length && this.rtype(v.path[v.i]) === 2 && this.rtype(v.path[v.i + 1]) === 2 && this.rtype(v.path[v.i + 2]) === 2
        && this.turnAt(v.path, v.i + 1) === 'S' && this.turnAt(v.path, v.i + 2) === 'S' && !this.isRound(v.path[v.i + 2])) {
        const nl = v.lanes[v.i + 1] ? 0 : 1;
        for (let j = v.i + 2; j < v.path.length; j++) {
          const t1 = this.turnAt(v.path, j + 1), t2 = this.turnAt(v.path, j + 2);
          if ((t1 && t1 !== 'S') || (t2 && t2 !== 'S')) break;
          v.lanes[j] = nl;
        }
        v.lc = 3;
      }
      v.speed += (target - v.speed) * Math.min(1, dt * (target < v.speed ? 6 : 2.2));
      v.s += v.speed * dt;
      while (v.s >= v.seg.len) {
        v.s -= v.seg.len;
        v.i++;
        if (v.i >= v.path.length) {
          v.i = v.path.length - 1; v.s = v.seg.len;
          if (v.dwellAtEnd) { v.dwell = v.dwellAtEnd; v.dwellAtEnd = 0; }
          else if (!this.arrive(v)) this.leave(v);
          break;
        }
        v.seg = this.makeSeg(v, v.i);
        this.enterTile(v);
      }
      if (v.leaving) continue;
      segAt(v.seg, v.s, out);
      v.pos[0] = out[0]; v.pos[1] = out[1];
      if (Math.hypot(out[2], out[3]) > 1e-4) { v.pos[2] = out[2]; v.pos[3] = out[3]; }
    }
    for (const v of this.vehicles) if (v.done && v.ctl?.gone) v.ctl.gone(v);
    this.vehicles = this.vehicles.filter((v) => !v.done);
    this.draw();
  }

  // cars standing on car parks: more by day, fewer at night
  updateParked(hour) {
    const out = [];
    const act = hour < 6 ? 0.3 : hour < 8 ? 0.6 : hour < 19 ? 1 : hour < 22 ? 0.7 : 0.4;
    for (const b of this.world.buildings.values()) {
      if (!b.bays || b.state !== 'done') continue;
      const n = Math.round(b.bays.length * Math.min(1, (b.occ ?? 0) * 1.1 + 0.08) * act);
      const order = b.bays.map((q, i) => [hash2(b.id, i, 5), q]).sort((a, c) => a[0] - c[0]);
      for (let i = 0; i < n; i++) {
        const q = order[i][1], hsh = hash2(b.id, i, 6);
        const type = CAR_KINDS[Math.floor(hsh * CAR_KINDS.length)];
        out.push({ id: -1 - i, type, parked: true, pos: [q[0], q[1], q[2], q[3]], c: new THREE.Color(CAR_COLS[Math.floor(hash2(b.id, i, 7) * CAR_COLS.length)]), fade: 0, data: {}, role: 'parked' });
      }
    }
    this.parked = out;
  }

  draw() {
    const { m, q, p, s, e, c } = this.tmp;
    const counts = {};
    for (const t in TYPES) counts[t] = 0;
    let pools = 0;
    const night = U.uGlow.value;
    for (const v of this.parked && this.parked.length ? [...this.vehicles, ...this.parked] : this.vehicles) {
      if (counts[v.type] >= TYPES[v.type].cap) continue;
      const n = counts[v.type]++;
      const parts = this.meshes[v.type];
      const ang = Math.atan2(-v.pos[3], v.pos[2]);
      e.set(0, ang, 0); q.setFromEuler(e);
      p.set(v.pos[0], 0.003, v.pos[1]); s.set(1, 1, 1);
      m.compose(p, q, s);
      const bi = this.beaconLevel(v);
      const fd = v.fade * v.fade * (3 - 2 * v.fade);
      for (const part of parts) {
        part.im.setMatrixAt(n, m);
        part.fade.array[n] = fd;
        if (part.k === 'veh') part.im.setColorAt(n, v.c);
        else if (part.k === 'beacon') { c.setScalar(bi); part.im.setColorAt(n, c); }
      }
      if (night > 0.05 && pools < 400 && !v.parked) {
        const l = Math.hypot(v.pos[2], v.pos[3]) || 1;
        const off = TYPES[v.type].len / 2 + 0.22;
        p.set(v.pos[0] + v.pos[2] / l * off, 0, v.pos[1] + v.pos[3] / l * off);
        e.set(0, ang + Math.PI / 2, 0); q.setFromEuler(e);
        m.compose(p, q, s);
        this.pools.setMatrixAt(pools++, m);
      }
    }
    for (const t in TYPES) for (const part of this.meshes[t]) {
      part.im.count = counts[t];
      part.im.instanceMatrix.needsUpdate = true;
      part.fade.needsUpdate = true;
      if (part.im.instanceColor) part.im.instanceColor.needsUpdate = true;
    }
    this.pools.count = pools;
    this.pools.instanceMatrix.needsUpdate = true;
    this.poolMat.opacity = night * 0.55;
    // signal lamps: the active one glows, the others stay dark
    const on = [new THREE.Color(1.8, 0.15, 0.1), new THREE.Color(1.8, 1.1, 0.1), new THREE.Color(0.2, 1.6, 0.45)];
    const off = new THREE.Color(0.07, 0.07, 0.07);
    for (let i = 0; i < this.signalHeads.length; i++) {
      const h = this.signalHeads[i];
      const st = this.signal(h.k, h.axis);
      this.lamps[0].setColorAt(i, st === 2 ? on[0] : off);
      this.lamps[1].setColorAt(i, st === 1 ? on[1] : off);
      this.lamps[2].setColorAt(i, st === 0 ? on[2] : off);
    }
    for (const im of this.lamps) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  // parks where it is and dissolves (never pops away)
  leave(v) {
    if (v.leaving) return;
    v.leaving = true; v.speed = 0; v.fadeDir = 1;
    if (v.data) v.data.siren = false;
  }

  // blue lights flash on emergency runs, amber lights turn while collecting
  beaconLevel(v) {
    const t = this.time * 7 + v.id * 1.7;
    if (v.data.siren) return (t % 2) < 1 ? 1.5 : 0.18;
    if (v.type === 'garbage' && v.data.collecting) return 0.7 + 0.9 * Math.max(0, Math.sin(t * 0.9));
    return 0.45;
  }

  pick(ray) {
    let best = null, bd = 0.25;
    const o = ray.origin, d = ray.direction;
    for (const v of this.vehicles) {
      const px = v.pos[0] - o.x, py = 0.08 - o.y, pz = v.pos[1] - o.z;
      const t = px * d.x + py * d.y + pz * d.z;
      const cx = px - d.x * t, cy = py - d.y * t, cz = pz - d.z * t;
      const dist = Math.hypot(cx, cy, cz);
      if (dist < bd) { bd = dist; best = v; }
    }
    return best;
  }
  clear() { for (const v of this.vehicles) v.ctl?.gone?.(v); this.vehicles = []; this.parked = []; this.parkT = 0; this.draw(); }
  count(fn) { let n = 0; for (const v of this.vehicles) if (!v.leaving && fn(v)) n++; return n; }
}
export { TYPES as VEHICLE_TYPES };
