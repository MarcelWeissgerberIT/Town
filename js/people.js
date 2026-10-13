import * as THREE from 'three';
import { Builder, packedToGeometry } from './geom.js';
import * as MD from './models.js';
import { Nav } from './nav.js';
import { DIRS, mulberry32, pick, personName, clamp } from './util.js';

const SHIRTS = ['#c0392b', '#2f6fb0', '#27ae60', '#f1c40f', '#8e44ad', '#ecf0f1', '#2c3e50', '#e67e22', '#16a085', '#d35400', '#ff8fab', '#3b5b92', '#f4d35e', '#a33d5a', '#5aa9e6'];
const PANTS = ['#2c3e50', '#34495e', '#3b3b3b', '#5d4037', '#1f3a5f', '#7f8c8d', '#c2b280', '#4a4a6a'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#f5cfa0', '#eac086'];
const HAIR = ['#2c1b0e', '#5a3825', '#a0522d', '#d4a14a', '#1a1a1a', '#9a9a9a', '#e6cf9a', '#8a3324'];
const DOGS = ['#8a5a35', '#2b2b2b', '#e8dcc8', '#c9a26b', '#6b4a32'];

const R = (d) => [-d[1], d[0]];

function geo(fn) { const B = new Builder(); fn(B); return packedToGeometry(B.pack().paint); }

export class People {
  constructor(scene, game, M, quality) {
    this.scene = scene; this.game = game; this.world = game.world;
    this.nav = new Nav(this.world);
    this.max = quality.people;
    this.list = [];
    this.birds = [];
    this.rng = mulberry32(777);
    this.nextId = 1;
    this.spawnTimer = 0;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
    const cap = this.max + 120;
    const mk = (g, n = cap) => { const im = new THREE.InstancedMesh(g, this.mat, n); im.count = 0; im.castShadow = true; im.frustumCulled = false; im.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(im); return im; };
    this.parts = {
      torso: mk(geo(MD.personTorso)), head: mk(geo(MD.personHead)), hair: mk(geo(MD.personHair)),
      legL: mk(geo(MD.personLeg)), legR: mk(geo(MD.personLeg)), armL: mk(geo(MD.personArm)), armR: mk(geo(MD.personArm)),
    };
    this.dogMesh = mk(geo(MD.dog), 80);
    this.birdMesh = mk(geo(MD.pigeon), 400);
    this.cap = cap;
    this.t = { base: new THREE.Matrix4(), loc: new THREE.Matrix4(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), e: new THREE.Euler(), c: new THREE.Color() };
    this.colors = {};
    this.visible = true;
  }
  col(hex) { return this.colors[hex] || (this.colors[hex] = new THREE.Color(hex)); }

  newPerson(kind = 'adult') {
    const rng = this.rng;
    const p = {
      id: this.nextId++, kind, x: 0, z: 0, h: 0, wp: null, wi: 0, mode: 'walk', timer: 0, phase: rng() * 6.28,
      speed: kind === 'kid' ? 0.17 + rng() * 0.04 : 0.11 + rng() * 0.05,
      shirt: this.col(kind === 'worker' ? '#ff7a00' : pick(rng, SHIRTS)),
      pants: this.col(kind === 'worker' ? '#2f4f6f' : pick(rng, PANTS)),
      skin: this.col(pick(rng, SKIN)),
      hair: this.col(kind === 'worker' ? '#ffd400' : pick(rng, HAIR)),
      scale: kind === 'kid' ? 0.66 + rng() * 0.1 : 0.94 + rng() * 0.14,
      name: personName(rng), age: kind === 'kid' ? 5 + Math.floor(rng() * 8) : 18 + Math.floor(rng() * 64),
      dog: null, activity: '',
    };
    if (kind === 'adult' && rng() < 0.09) p.dog = { x: 0, z: 0, c: this.col(pick(rng, DOGS)), phase: 0 };
    if (kind === 'adult' && p.age > 70) p.speed *= 0.7;
    return p;
  }

  // ---- paths along the sidewalks
  sidewalkPath(fromB, toB) {
    const nav = this.nav, N = this.world.N;
    const r0 = nav.frontTiles(fromB), r1 = new Set(nav.frontTiles(toB));
    if (!r0.length || !r1.size) return null;
    const kp = nav.bfs(r0, (k) => r1.has(k), 45);
    if (!kp) return null;
    const T = kp.map((k) => [k % N + 0.5, ((k / N) | 0) + 0.5]);
    const D0 = fromB.door, D1 = toB.door;
    const pts = [[D0[0], D0[1]]];
    const n = T.length;
    const dirs = [];
    for (let i = 0; i < n - 1; i++) dirs.push([Math.sign(T[i + 1][0] - T[i][0]), Math.sign(T[i + 1][1] - T[i][1])]);
    let first = dirs[0];
    if (!first) { const fd = DIRS[fromB.rot]; first = [-fd.dz, fd.dx]; }
    const last = dirs[dirs.length - 1] || first;
    // which side of the street the start building is on
    const toB0 = [D0[0] - T[0][0], D0[1] - T[0][1]];
    const rf = R(first);
    const s = (rf[0] * toB0[0] + rf[1] * toB0[1]) >= 0 ? 1 : -1;
    const proj = (Tc, d, D, side) => {
      const r = R(d);
      const along = clamp((D[0] - Tc[0]) * d[0] + (D[1] - Tc[1]) * d[1], -0.42, 0.42);
      return [Tc[0] + side * 0.4 * r[0] + d[0] * along, Tc[1] + side * 0.4 * r[1] + d[1] * along];
    };
    pts.push(proj(T[0], first, D0, s));
    for (let i = 1; i < n - 1; i++) {
      const a = dirs[i - 1], b = dirs[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const ra = R(a), rb = R(b);
      pts.push([T[i][0] + s * 0.4 * (ra[0] + rb[0]), T[i][1] + s * 0.4 * (ra[1] + rb[1])]);
    }
    const end = proj(T[n - 1], last, D1, s);
    pts.push(end);
    const toB1 = [D1[0] - T[n - 1][0], D1[1] - T[n - 1][1]];
    const rl = R(last);
    if ((rl[0] * toB1[0] + rl[1] * toB1[1]) * s < 0) pts.push(proj(T[n - 1], last, D1, -s));
    pts.push([D1[0], D1[1]]);
    return pts;
  }

  buildings(filter) { const out = []; for (const b of this.world.buildings.values()) if (b.state === 'done' && b.door && filter(b)) out.push(b); return out; }
  inView(b, view) { return Math.abs(b.x + b.w / 2 - view.x) < view.r && Math.abs(b.z + b.h / 2 - view.z) < view.r; }

  startTrip(p, from, to) {
    const wp = this.sidewalkPath(from, to);
    if (!wp) return false;
    p.wp = wp; p.wi = 1; p.x = wp[0][0]; p.z = wp[0][1]; p.mode = 'walk'; p.dest = to; p.from = from;
    p.activity = to.flags?.wander ? `geht zum ${to.name}` : `unterwegs: ${to.name}`;
    if (to.type === 'park') p.activity = 'geht in den Park';
    if (to.type === 'playground') p.activity = 'geht zum Spielplatz';
    if (to.type === 'plaza') p.activity = 'geht zum Brunnenplatz';
    if (p.dog) { p.dog.x = p.x; p.dog.z = p.z; }
    return true;
  }

  spawn(view, sim) {
    const rng = this.rng;
    const homes = this.buildings((b) => b.kind === 'res');
    if (!homes.length) return;
    const near = homes.filter((b) => this.inView(b, view));
    const from = (near.length && rng() < 0.85) ? pick(rng, near) : pick(rng, homes);
    const r = rng();
    let pool;
    if (r < 0.38) pool = this.buildings((b) => b.kind === 'com');
    else if (r < 0.58) pool = this.buildings((b) => b.flags?.wander);
    else if (r < 0.72) pool = this.buildings((b) => b.kind === 'ind' || b.kind === 'svc');
    else pool = homes;
    pool = pool.filter((b) => b !== from && Math.abs(b.x - from.x) + Math.abs(b.z - from.z) < 26);
    if (!pool.length) return;
    const to = pick(rng, pool);
    const kid = (to.flags?.kids && rng() < 0.7) || rng() < 0.08;
    const p = this.newPerson(kid ? 'kid' : 'adult');
    if (this.startTrip(p, from, to)) { p.home = from; this.list.push(p); }
  }

  spawnWorkers(sites) {
    const want = new Map();
    for (const s of sites.values()) want.set(s.b.id, s.b);
    for (const p of this.list) if (p.kind === 'worker' && !want.has(p.site)) p.dead = true;
    const have = new Map();
    for (const p of this.list) if (p.kind === 'worker' && !p.dead) have.set(p.site, (have.get(p.site) || 0) + 1);
    for (const [id, b] of want) {
      const n = Math.min(5, 2 + b.w * b.h);
      for (let i = have.get(id) || 0; i < n; i++) {
        const p = this.newPerson('worker');
        p.site = id; p.mode = 'work';
        const c = this.game.lotXform(b);
        p.x = c.x + (this.rng() - 0.5) * b.w * 0.7; p.z = c.z + (this.rng() - 0.5) * b.h * 0.7;
        p.activity = 'arbeitet auf der Baustelle'; p.timer = this.rng() * 3;
        p.siteB = b;
        this.list.push(p);
      }
    }
  }

  arrive(p) {
    const rng = this.rng;
    const b = p.dest;
    if (b && b.flags?.wander && this.world.buildings.has(b.id)) {
      p.mode = 'wander'; p.timer = 12 + rng() * 25; p.wp = null;
      p.activity = b.type === 'playground' ? 'spielt auf dem Spielplatz' : b.type === 'plaza' ? 'sitzt am Brunnen' : 'spaziert im Park';
      return;
    }
    p.mode = 'inside'; p.timer = 5 + rng() * 20;
    if (rng() < 0.45) p.dead = true;
  }

  update(dt, sim, view, sites) {
    const rng = this.rng;
    const hour = sim.hour;
    const act = hour < 5 ? 0.12 : hour < 7 ? 0.4 : hour < 20 ? 1 : hour < 22.5 ? 0.55 : 0.22;
    const target = Math.min(this.max, Math.round((10 + sim.pop * 0.16) * act));
    this.spawnTimer -= dt;
    const civ = this.list.filter((p) => p.kind !== 'worker').length;
    if (this.spawnTimer <= 0 && civ < target) { this.spawnTimer = 0.08; for (let i = 0; i < 3; i++) this.spawn(view, sim); }
    this.workerTimer = (this.workerTimer || 0) - dt;
    if (this.workerTimer <= 0) { this.workerTimer = 1.5; this.spawnWorkers(sites.sites); }

    for (const p of this.list) {
      if (p.dead) continue;
      if (p.mode === 'walk') {
        const t = p.wp[p.wi];
        if (!t) { this.arrive(p); continue; }
        const dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz);
        const step = p.speed * dt;
        if (d <= step) { p.x = t[0]; p.z = t[1]; p.wi++; if (p.wi >= p.wp.length) this.arrive(p); }
        else { p.x += dx / d * step; p.z += dz / d * step; p.h = Math.atan2(-dz, dx); }
        p.phase += step * 70;
      } else if (p.mode === 'inside') {
        p.timer -= dt;
        if (p.timer <= 0) {
          // come out again and go somewhere else
          const from = p.dest;
          if (!from || !this.world.buildings.has(from.id)) { p.dead = true; continue; }
          const home = p.home && this.world.buildings.has(p.home.id) ? p.home : null;
          const pool = this.buildings((b) => (b.kind === 'com' || b.flags?.wander) && b !== from && Math.abs(b.x - from.x) + Math.abs(b.z - from.z) < 18);
          const to = (home && rng() < 0.5) || !pool.length ? home : pick(rng, pool);
          if (!to || !this.startTrip(p, from, to)) p.dead = true;
        }
      } else if (p.mode === 'wander') {
        p.timer -= dt;
        const b = p.dest;
        if (!b || !this.world.buildings.has(b.id)) { p.dead = true; continue; }
        if (!p.wp || p.wi >= p.wp.length) {
          if (p.timer <= 0) {
            const home = p.home && this.world.buildings.has(p.home.id) ? p.home : null;
            if (!home || !this.startTrip(p, b, home)) p.dead = true;
            continue;
          }
          if (p.pause > 0) { p.pause -= dt; continue; }
          const tx = b.x + 0.12 + rng() * (b.w - 0.24), tz = b.z + 0.12 + rng() * (b.h - 0.24);
          p.wp = [[tx, tz]]; p.wi = 0; p.pause = rng() < 0.5 ? 1 + rng() * 4 : 0;
        }
        const t = p.wp[p.wi];
        const dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz);
        const step = p.speed * (p.kind === 'kid' ? 1.1 : 0.7) * dt;
        if (d <= step) { p.wi++; }
        else { p.x += dx / d * step; p.z += dz / d * step; p.h = Math.atan2(-dz, dx); p.phase += step * 70; }
      } else if (p.mode === 'work') {
        const b = p.siteB;
        if (!b || b.state !== 'build') { p.dead = true; continue; }
        p.timer -= dt;
        if (!p.wp || p.wi >= p.wp.length) {
          if (p.timer > 0) { p.hammer = (p.hammer || 0) + dt * 9; continue; }
          const c = this.game.lotXform(b);
          p.wp = [[c.x + (rng() - 0.5) * b.w * 0.75, c.z + (rng() - 0.5) * b.h * 0.75]]; p.wi = 0; p.timer = 2 + rng() * 5;
        }
        const t = p.wp[p.wi];
        const dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz);
        const step = 0.1 * dt;
        if (d <= step) p.wi++;
        else { p.x += dx / d * step; p.z += dz / d * step; p.h = Math.atan2(-dz, dx); p.phase += step * 70; }
      }
      if (p.dog) {
        const fx = Math.cos(p.h), fz = -Math.sin(p.h);
        const tx = p.x - fx * 0.05 + fz * 0.07, tz = p.z - fz * 0.05 - fx * 0.07;
        p.dog.x += (tx - p.dog.x) * Math.min(1, dt * 5); p.dog.z += (tz - p.dog.z) * Math.min(1, dt * 5);
        p.dog.phase += dt * 14;
      }
    }
    this.list = this.list.filter((p) => !p.dead);
    this.updateBirds(dt, view);
    this.draw(view);
  }

  updateBirds(dt, view) {
    const rng = this.rng;
    const plazas = this.buildings((b) => b.flags?.pigeons && this.inView(b, view));
    const ids = new Set(plazas.map((b) => b.id));
    this.birds = this.birds.filter((bd) => ids.has(bd.home.id));
    for (const b of plazas) {
      if (this.birds.some((bd) => bd.home === b)) continue;
      const cx = b.x + 0.5, cz = b.z + 0.5;
      for (let i = 0; i < 9; i++) {
        const a = rng() * 6.28, r = 0.26 + rng() * 0.18;
        this.birds.push({ home: b, x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: 0, h: rng() * 6.28, st: 'peck', t: rng() * 3, fx: 0, fz: 0, sx: 0, sz: 0, c: this.col(pick(rng, ['#8e939a', '#6f747b', '#a3a7ad', '#5c6168', '#d9d9d9'])) });
      }
    }
    for (const bd of this.birds) {
      bd.t -= dt;
      if (bd.st === 'fly') {
        const k = clamp(1 - bd.t / 1.3, 0, 1);
        bd.x = bd.sx + (bd.fx - bd.sx) * k; bd.z = bd.sz + (bd.fz - bd.sz) * k;
        bd.y = Math.sin(k * Math.PI) * 0.28 + 0.03;
        if (bd.t <= 0) { bd.st = 'peck'; bd.y = 0; bd.t = 1 + rng() * 3; }
        continue;
      }
      // scared by passers-by
      let scared = false;
      for (const p of this.list) { if (Math.abs(p.x - bd.x) < 0.1 && Math.abs(p.z - bd.z) < 0.1) { scared = true; break; } }
      if (scared) {
        const cx = bd.home.x + 0.5, cz = bd.home.z + 0.5;
        const a = rng() * 6.28, r = 0.25 + rng() * 0.2;
        bd.st = 'fly'; bd.t = 1.3; bd.sx = bd.x; bd.sz = bd.z; bd.fx = cx + Math.cos(a) * r; bd.fz = cz + Math.sin(a) * r;
        bd.h = Math.atan2(-(bd.fz - bd.z), bd.fx - bd.x);
        continue;
      }
      if (bd.t <= 0) {
        bd.t = 0.6 + rng() * 2.5;
        if (rng() < 0.5) { bd.h += (rng() - 0.5) * 2; }
      }
      if (bd.t > 1.2 && bd.t < 1.5) { bd.x += Math.cos(bd.h) * 0.03 * dt; bd.z -= Math.sin(bd.h) * 0.03 * dt; }
    }
  }

  draw(view) {
    const P = this.parts, { base, loc, m, q, p, s, e } = this.t;
    let n = 0, nd = 0;
    const zoomed = view.ppu > 22;
    this.visible = view.ppu > 9;
    for (const pr of this.list) {
      if (!this.visible) break;
      if (pr.mode === 'inside' || pr.dead) continue;
      if (Math.abs(pr.x - view.x) > view.r * 1.2 || Math.abs(pr.z - view.z) > view.r * 1.2) continue;
      if (n >= this.cap) break;
      const moving = pr.mode === 'walk' || (pr.wp && pr.wi < pr.wp.length);
      const sw = moving ? Math.sin(pr.phase) * 0.55 : 0;
      const bob = moving ? Math.abs(Math.cos(pr.phase)) * 0.004 : 0;
      e.set(0, pr.h, 0); q.setFromEuler(e);
      p.set(pr.x, 0.026 * (pr.mode === 'walk' ? 1 : 0.15) + bob, pr.z); s.set(pr.scale, pr.scale, pr.scale);
      base.compose(p, q, s);
      P.torso.setMatrixAt(n, base); P.torso.setColorAt(n, pr.shirt);
      P.head.setMatrixAt(n, base); P.head.setColorAt(n, pr.skin);
      P.hair.setMatrixAt(n, base); P.hair.setColorAt(n, pr.hair);
      if (zoomed) {
        const legs = [[P.legL, -0.0095, sw], [P.legR, 0.0095, -sw]];
        for (const [im, z, a] of legs) {
          e.set(0, 0, a); q.setFromEuler(e); p.set(0, 0.074, z); s.set(1, 1, 1);
          loc.compose(p, q, s); m.multiplyMatrices(base, loc);
          im.setMatrixAt(n, m); im.setColorAt(n, pr.pants);
        }
        const hamm = pr.mode === 'work' && pr.timer > 0 && !(pr.wp && pr.wi < pr.wp.length);
        const arms = [[P.armL, -0.029, -sw * 0.8], [P.armR, 0.029, hamm ? -1.6 + Math.sin(pr.hammer || 0) * 0.6 : sw * 0.8]];
        for (const [im, z, a] of arms) {
          e.set(0, 0, a); q.setFromEuler(e); p.set(0, 0.13, z); s.set(1, 1, 1);
          loc.compose(p, q, s); m.multiplyMatrices(base, loc);
          im.setMatrixAt(n, m); im.setColorAt(n, pr.shirt);
        }
      }
      if (pr.dog && zoomed && nd < 80) {
        e.set(0, pr.h, 0); q.setFromEuler(e);
        p.set(pr.dog.x, 0.026 + Math.abs(Math.sin(pr.dog.phase)) * 0.006, pr.dog.z); s.set(1, 1, 1);
        m.compose(p, q, s);
        this.dogMesh.setMatrixAt(nd, m); this.dogMesh.setColorAt(nd, pr.dog.c); nd++;
      }
      n++;
    }
    for (const k in P) {
      P[k].count = (k.startsWith('leg') || k.startsWith('arm')) ? (zoomed ? n : 0) : n;
      P[k].instanceMatrix.needsUpdate = true;
      if (P[k].instanceColor) P[k].instanceColor.needsUpdate = true;
    }
    this.dogMesh.count = nd; this.dogMesh.instanceMatrix.needsUpdate = true; if (this.dogMesh.instanceColor) this.dogMesh.instanceColor.needsUpdate = true;
    let nb = 0;
    if (this.visible) for (const bd of this.birds) {
      if (nb >= 400) break;
      e.set(0, bd.h, 0); q.setFromEuler(e);
      const peck = bd.st === 'peck' && bd.t % 1 < 0.15 ? -0.004 : 0;
      p.set(bd.x, 0.006 + bd.y + peck, bd.z); s.set(1, 1, 1);
      m.compose(p, q, s);
      this.birdMesh.setMatrixAt(nb, m); this.birdMesh.setColorAt(nb, bd.c); nb++;
    }
    this.birdMesh.count = nb; this.birdMesh.instanceMatrix.needsUpdate = true; if (this.birdMesh.instanceColor) this.birdMesh.instanceColor.needsUpdate = true;
  }

  pick(ray) {
    let best = null, bd = 0.08;
    const o = ray.origin, d = ray.direction;
    for (const pr of this.list) {
      if (pr.mode === 'inside') continue;
      const px = pr.x - o.x, py = 0.1 - o.y, pz = pr.z - o.z;
      const t = px * d.x + py * d.y + pz * d.z;
      const dist = Math.hypot(px - d.x * t, py - d.y * t, pz - d.z * t);
      if (dist < bd) { bd = dist; best = pr; }
    }
    return best;
  }
  clear() { this.list = []; this.birds = []; }
}
