import * as THREE from 'three';
import { Builder, packedToGeometry } from './geom.js';
import { VEH, VEH_LEN } from './vehicles.js';
import { Nav } from './nav.js';
import { DIRS, hash2, mulberry32, pick, clamp, col } from './util.js';
import { CAR_COLS } from './config.js';
import { U } from './materials.js';

const W1 = [1, 1, 1];
const vt = (name, kind, speed, cap, color) => ({ name, build: (B) => VEH[kind](B, 'veh', W1), speed, len: VEH_LEN[kind], cap, color });
const TYPES = {
  car: vt('Auto', 'car', 0.85, 90),
  hatch: vt('Kleinwagen', 'hatch', 0.82, 80),
  kombi: vt('Kombi', 'kombi', 0.85, 70),
  taxi: vt('Taxi', 'taxi', 0.85, 20, '#efe6c8'),
  police: vt('Polizeistreife', 'police', 0.9, 20, '#f4f5f4'),
  bus: vt('Linienbus', 'bus', 0.62, 12, '#f2c230'),
  garbage: vt('Müllabfuhr', 'garbage', 0.55, 10, '#f07b1d'),
  fire: vt('Feuerwehr', 'fire', 1.0, 8, '#d42a1f'),
  ambulance: vt('Rettungswagen', 'ambulance', 1.0, 8, '#f6f6f2'),
  van: vt('Lieferwagen', 'van', 0.75, 40),
  post: vt('Postauto', 'post', 0.75, 6, '#ffcc00'),
  truck: vt('Lastwagen', 'truck', 0.6, 30),
  mixer: vt('Betonmischer', 'mixer', 0.55, 16, '#e6a52a'),
  moving: vt('Umzugswagen', 'moving', 0.7, 12, '#2f6db5'),
};
const CAR_KINDS = ['car', 'car', 'hatch', 'hatch', 'kombi'];

const LANE = 0.15;
const R = (d) => [-d[1], d[0]];

function bez(s, t, out) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  out[0] = a * s.p0[0] + b * s.p1[0] + c * s.p2[0] + d * s.p3[0];
  out[1] = a * s.p0[1] + b * s.p1[1] + c * s.p2[1] + d * s.p3[1];
  const da = -3 * u * u, db = 3 * u * u - 6 * u * t, dc = 6 * u * t - 3 * t * t, dd = 3 * t * t;
  out[2] = da * s.p0[0] + db * s.p1[0] + dc * s.p2[0] + dd * s.p3[0];
  out[3] = da * s.p0[1] + db * s.p1[1] + dc * s.p2[1] + dd * s.p3[1];
  return out;
}

function makeSeg(path, i, endOffset = 0) {
  const [x, z] = path[i];
  const c = [x + 0.5, z + 0.5];
  const prev = path[i - 1], next = path[i + 1];
  const dIn = prev ? [x - prev[0], z - prev[1]] : null;
  const dOut = next ? [next[0] - x, next[1] - z] : null;
  let p0, p3, t0, t3;
  if (dIn) { const r = R(dIn); p0 = [c[0] - 0.5 * dIn[0] + LANE * r[0], c[1] - 0.5 * dIn[1] + LANE * r[1]]; t0 = dIn; }
  else { const r = R(dOut); p0 = [c[0] - 0.1 * dOut[0] + LANE * r[0], c[1] - 0.1 * dOut[1] + LANE * r[1]]; t0 = dOut; }
  if (dOut) { const r = R(dOut); p3 = [c[0] + 0.5 * dOut[0] + LANE * r[0], c[1] + 0.5 * dOut[1] + LANE * r[1]]; t3 = dOut; }
  else { const r = R(dIn); p3 = [c[0] + endOffset * dIn[0] + LANE * r[0], c[1] + endOffset * dIn[1] + LANE * r[1]]; t3 = dIn; }
  const chord = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  let k, turn = 'S';
  if (!dIn || !dOut) k = chord * 0.35;
  else if (dIn[0] === dOut[0] && dIn[1] === dOut[1]) k = chord / 3;
  else if (dIn[0] === -dOut[0] && dIn[1] === -dOut[1]) { k = 0.5; turn = 'U'; }
  else { k = chord * 0.39; turn = (dIn[0] * dOut[1] - dIn[1] * dOut[0]) > 0 ? 'R' : 'L'; }
  const seg = { p0, p1: [p0[0] + t0[0] * k, p0[1] + t0[1] * k], p2: [p3[0] - t3[0] * k, p3[1] - t3[1] * k], p3, turn, len: 0, dOut };
  let L = 0; const a = [0, 0, 0, 0]; let px = p0[0], pz = p0[1];
  for (let j = 1; j <= 8; j++) { bez(seg, j / 8, a); L += Math.hypot(a[0] - px, a[1] - pz); px = a[0]; pz = a[1]; }
  seg.len = Math.max(0.05, L);
  return seg;
}

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
    this.matBeacon = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.meshes = {};
    const m4 = new THREE.Matrix4();
    for (const t in TYPES) {
      const B = new Builder();
      TYPES[t].build(B);
      const pk = B.pack();
      const parts = [];
      for (const k in pk) {
        const mat = k === 'beacon' ? this.matBeacon : M[k];
        if (!mat) continue;
        const im = new THREE.InstancedMesh(packedToGeometry(pk[k]), mat, TYPES[t].cap);
        im.count = 0; im.castShadow = true; im.receiveShadow = true;
        im.frustumCulled = false;
        if (k === 'veh' || k === 'beacon') im.setColorAt(0, new THREE.Color(1, 1, 1));
        for (let i = 0; i < TYPES[t].cap; i++) im.setMatrixAt(i, m4);
        scene.add(im);
        parts.push({ k, im });
      }
      this.meshes[t] = parts;
    }
    // headlight pools at night
    const pg = new THREE.PlaneGeometry(0.34, 0.5); pg.rotateX(-Math.PI / 2); pg.translate(0, 0.006, 0);
    this.poolMat = new THREE.MeshBasicMaterial({ map: T.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0d0, opacity: 0 });
    this.pools = new THREE.InstancedMesh(pg, this.poolMat, 400);
    this.pools.count = 0; this.pools.frustumCulled = false; this.pools.renderOrder = 2;
    scene.add(this.pools);
    // traffic signals
    const poleB = new Builder();
    poleB.cyl('solid', 0, 0, 0, 0.007, 0.2, 6, col('#2f3337'));
    poleB.box('solid', -0.014, 0.17, -0.014, 0.014, 0.235, 0.014, col('#24272a'));
    this.poleMesh = new THREE.InstancedMesh(packedToGeometry(poleB.pack().solid), M.solid, 1200);
    this.poleMesh.count = 0; this.poleMesh.castShadow = true;
    scene.add(this.poleMesh);
    this.lightMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1200);
    this.lightMesh.count = 0;
    this.lightMesh.setColorAt(0, new THREE.Color(1, 0, 0));
    scene.add(this.lightMesh);
    this.signalHeads = [];
    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), e: new THREE.Euler(), c: new THREE.Color() };
    this.busRoute = [];
  }

  // ---- signals
  rebuildSignals() {
    const w = this.world, N = w.N;
    this.signals.clear();
    this.signalHeads = [];
    const { m, q, p, s, e } = this.tmp;
    let n = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!w.isRoad(x, z) || w.isWater(x, z)) continue;
      const mask = w.roadMask(x, z);
      if (popcount(mask) < 3) continue;
      const k = z * N + x;
      this.signals.set(k, { off: hash2(x, z, 9) * 16 });
      for (let d = 0; d < 4; d++) {
        if (!(mask & DIRS[d].bit)) continue;
        // traffic arriving from neighbour d travels in direction (d+2)%4
        const t = DIRS[(d + 2) % 4];
        const tv = [t.dx, t.dz], r = R(tv);
        const px = x + 0.5 - 0.4 * tv[0] + 0.4 * r[0], pz = z + 0.5 - 0.4 * tv[1] + 0.4 * r[1];
        if (n >= 1200) break;
        p.set(px, 0.026, pz); e.set(0, 0, 0); q.setFromEuler(e); m.compose(p, q, s);
        this.poleMesh.setMatrixAt(n, m);
        p.set(px - tv[0] * 0.016, 0.026 + 0.205, pz - tv[1] * 0.016); m.compose(p, q, s);
        this.lightMesh.setMatrixAt(n, m);
        this.signalHeads.push({ k, axis: (d % 2 === 0) ? 0 : 1 });
        n++;
      }
    }
    this.poleMesh.count = n; this.lightMesh.count = n;
    this.poleMesh.instanceMatrix.needsUpdate = true; this.lightMesh.instanceMatrix.needsUpdate = true;
    this.poleMesh.computeBoundingSphere(); this.lightMesh.computeBoundingSphere();
  }
  // 0 green, 1 yellow, 2 red for an axis (0 = north/south traffic, 1 = east/west)
  signal(k, axis) {
    const sg = this.signals.get(k);
    if (!sg) return 0;
    const t = (this.time + sg.off) % 16;
    const ph = axis === 0 ? t : (t + 8) % 16;
    if (ph < 6.2) return 0;
    if (ph < 7.4) return 1;
    return 2;
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
  addVehicle(type, path, opts = {}) {
    if (path.length < 2) return null;
    const T = TYPES[type];
    if (this.vehicles.filter((v) => v.type === type).length >= T.cap) return null;
    const v = {
      id: this.nextId++, type, path, i: 0, s: 0, seg: makeSeg(path, 0, opts.endOffset || 0), speed: 0.2,
      max: T.speed * (0.9 + this.rng() * 0.2), pos: [0, 0, 1, 0], color: opts.color || T.color || pick(this.rng, CAR_COLS),
      role: opts.role || 'trip', data: opts.data || {}, wait: 0, ghost: 0, dwell: 0, name: opts.name || T.name, dest: opts.dest || null,
    };
    v.c = new THREE.Color(v.color);
    bez(v.seg, 0, v.pos);
    this.vehicles.push(v);
    return v;
  }
  // trip between two buildings (or outside when a or b is null)
  trip(type, a, b, opts = {}) {
    const nav = this.nav;
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
    return this.addVehicle(type, path, { ...opts, endOffset: opts.endOffset ?? 0, dest: b });
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
    // garbage truck rounds
    if (sim.pop > 80 && this.vehicles.filter((v) => v.type === 'garbage').length < Math.min(4, 1 + sim.pop / 2500) && homes.length && hour > 6 && hour < 18) {
      const v = this.trip('garbage', null, pick(rng, this.nearView(homes, view)), { role: 'rounds', data: { legs: 5 } });
      if (v) v.dwellAtEnd = 3;
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
    // ambulances
    for (const h of this.buildingsBy((b) => b.type === 'hospital')) {
      if (this.vehicles.filter((v) => v.type === 'ambulance' && v.data.home === h.id).length < 1 && rng() < 0.03 && homes.length) {
        this.trip('ambulance', h, pick(rng, homes), { role: 'patrol', data: { home: h.id, legs: 1, siren: true } });
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
    const v = this.addVehicle('bus', this.pathTiles(kp), { role: 'bus', data: { order, at: nextIdx, line: 1 + buses.length }, name: `Linienbus ${1 + buses.length}` });
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
    if (v.role === 'bus') {
      const d = v.data; const from = d.order[d.at]; d.at = (d.at + 1) % d.order.length;
      const kp = this.nav.bfs([from], (k) => k === d.order[d.at], 200);
      if (!kp || kp.length < 2) return false;
      this.game.emit('busStop', v, from);
      v.path = this.pathTiles(kp); v.i = 0; v.s = 0; v.seg = makeSeg(v.path, 0); v.dwellAtEnd = 3.5;
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
      v.path = this.pathTiles(kp); v.i = 0; v.s = 0; v.seg = makeSeg(v.path, 0);
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
      v.path = this.pathTiles(kp); v.i = 0; v.s = 0; v.seg = makeSeg(v.path, 0); v.dwellAtEnd = 0;
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
      v.path = [...this.pathTiles(kp), ...this.outerTiles(e, 14, false)]; v.i = 0; v.s = 0; v.seg = makeSeg(v.path, 0);
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
      this.vehicles = this.vehicles.filter((v) => v.path.every(([x, z]) => !w.inb(x, z) || w.road[z * N + x]));
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 0.35; this.spawnTraffic(view, sim); }

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
      if (v.dwell > 0) { v.dwell -= dt; v.speed = 0; if (v.dwell <= 0 && !this.arrive(v)) v.done = true; continue; }
      let target = v.max * (v.seg.turn === 'S' ? 1 : v.seg.turn === 'U' ? 0.35 : 0.55);
      // traffic light ahead
      const nxt = v.path[v.i + 1];
      if (nxt && this.world.inb(nxt[0], nxt[1]) && v.seg.dOut) {
        const k = nxt[1] * N + nxt[0];
        if (this.signals.has(k) && v.data.siren !== true) {
          const axis = v.seg.dOut[1] !== 0 ? 0 : 1;
          const st = this.signal(k, axis);
          const stopAt = v.seg.len - 0.21;
          const dist = stopAt - v.s;
          if (st !== 0 && dist > -0.02 && !(st === 1 && dist < 0.12)) {
            target = Math.min(target, Math.max(0, dist) * 3.2);
          }
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
      if (v.speed < 0.02 && target < 0.02) { v.wait += dt; if (v.wait > 6) { v.ghost = 1.6; v.wait = 0; } } else v.wait = 0;
      v.speed += (target - v.speed) * Math.min(1, dt * (target < v.speed ? 6 : 2.2));
      v.s += v.speed * dt;
      while (v.s >= v.seg.len) {
        v.s -= v.seg.len;
        v.i++;
        if (v.i >= v.path.length) {
          v.i = v.path.length - 1; v.s = v.seg.len;
          if (v.dwellAtEnd) { v.dwell = v.dwellAtEnd; v.dwellAtEnd = 0; }
          else if (!this.arrive(v)) v.done = true;
          break;
        }
        v.seg = makeSeg(v.path, v.i, v.i === v.path.length - 1 ? 0 : 0);
      }
      if (!v.done) bez(v.seg, clamp(v.s / v.seg.len, 0, 1), out);
      v.pos[0] = out[0]; v.pos[1] = out[1];
      if (Math.hypot(out[2], out[3]) > 1e-4) { v.pos[2] = out[2]; v.pos[3] = out[3]; }
    }
    this.vehicles = this.vehicles.filter((v) => !v.done);
    this.draw();
  }

  draw() {
    const { m, q, p, s, e, c } = this.tmp;
    const counts = {};
    for (const t in TYPES) counts[t] = 0;
    let pools = 0;
    const night = U.uGlow.value;
    for (const v of this.vehicles) {
      const n = counts[v.type]++;
      const parts = this.meshes[v.type];
      const ang = Math.atan2(-v.pos[3], v.pos[2]);
      e.set(0, ang, 0); q.setFromEuler(e);
      p.set(v.pos[0], 0.003, v.pos[1]); s.set(1, 1, 1);
      m.compose(p, q, s);
      const bi = this.beaconLevel(v);
      for (const part of parts) {
        part.im.setMatrixAt(n, m);
        if (part.k === 'veh') part.im.setColorAt(n, v.c);
        else if (part.k === 'beacon') { c.setScalar(bi); part.im.setColorAt(n, c); }
      }
      if (night > 0.05 && pools < 400) {
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
      if (part.im.instanceColor) part.im.instanceColor.needsUpdate = true;
    }
    this.pools.count = pools;
    this.pools.instanceMatrix.needsUpdate = true;
    this.poolMat.opacity = night * 0.55;
    // signal colours
    const cols = [new THREE.Color(0.2, 1.4, 0.4), new THREE.Color(1.6, 1.1, 0.1), new THREE.Color(1.6, 0.12, 0.08)];
    for (let i = 0; i < this.signalHeads.length; i++) {
      const h = this.signalHeads[i];
      this.lightMesh.setColorAt(i, cols[this.signal(h.k, h.axis)]);
    }
    if (this.lightMesh.instanceColor) this.lightMesh.instanceColor.needsUpdate = true;
  }

  // blue lights flash on emergency runs, amber lights turn while collecting
  beaconLevel(v) {
    const t = this.time * 7 + v.id * 1.7;
    if (v.data.siren) return (t % 2) < 1 ? 1.5 : 0.18;
    if (v.type === 'garbage' && v.role === 'rounds') return 0.7 + 0.9 * Math.max(0, Math.sin(t * 0.9));
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
  clear() { this.vehicles = []; this.draw(); }
}
export { TYPES as VEHICLE_TYPES };
