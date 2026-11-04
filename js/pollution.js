import { SERVICES } from './config.js';
import { DIRS, clamp } from './util.js';

// ---------------------------------------------------------------------------
// Pollution fields on the tile grid (0..100):
//   air    – chimneys, traffic and industry; drifts with the wind, trees filter it
//   ground – industry, landfills and coal; builds up slowly, fades very slowly
//   water  – raw sewage and factories on the bank; flows downstream with the river
//   noise  – streets, industry, wind turbines, stadium (recomputed, not stored)
// ---------------------------------------------------------------------------
export class Pollution {
  constructor(sim) {
    this.sim = sim;
    this.world = sim.world;
    const n = this.world.N ** 2;
    this.air = new Float32Array(n);
    this.ground = new Float32Array(n);
    this.water = new Float32Array(n);
    this.noise = new Float32Array(n);
    this.tmp = new Float32Array(n);
    this.down = new Int32Array(n).fill(-1);
    this.flowKey = '';
    this.windAngle = 0.6;
    this.version = 0; // bumps on every update (textures, overlays)
  }

  // downstream neighbour of every water tile: towards the edges where the water leaves the map
  flowField() {
    const w = this.world, N = w.N;
    const key = String(w.terrainVersion || 0);
    if (key === this.flowKey) return;
    this.flowKey = key;
    const dist = new Int32Array(N * N).fill(-1);
    const q = [];
    const outs = w.flowOut || ['S'];
    for (let i = 0; i < N; i++) {
      const cand = [];
      if (outs.includes('S')) cand.push((N - 1) * N + i);
      if (outs.includes('N')) cand.push(i);
      if (outs.includes('E')) cand.push(i * N + N - 1);
      if (outs.includes('W')) cand.push(i * N);
      for (const k of cand) if (w.terrain[k] === 1 && dist[k] < 0) { dist[k] = 0; q.push(k); }
    }
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = k % N, z = (k / N) | 0;
      for (const d of DIRS) {
        const nx = x + d.dx, nz = z + d.dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const nk = nz * N + nx;
        if (w.terrain[nk] !== 1 || dist[nk] >= 0) continue;
        dist[nk] = dist[k] + 1; q.push(nk);
      }
    }
    this.down.fill(-1);
    this.dist = dist;
    for (let k = 0; k < N * N; k++) {
      if (dist[k] <= 0) continue;
      const x = k % N, z = (k / N) | 0;
      for (const d of DIRS) {
        const nx = x + d.dx, nz = z + d.dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const nk = nz * N + nx;
        if (dist[nk] === dist[k] - 1) { this.down[k] = nk; break; }
      }
    }
  }

  // advance by dt in-game hours
  update(dtH) {
    if (dtH <= 0) return;
    const w = this.world, N = w.N, sim = this.sim;
    this.flowField();
    const air = this.air, gr = this.ground, wa = this.water, tmp = this.tmp;
    const traffic = clamp(0.4 + sim.pop / 9000, 0.4, 1.6);
    // ---- emissions
    const eAir = new Float32Array(N * N), eGr = new Float32Array(N * N), eWa = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      if (w.road[k] && !w.terrain[k]) {
        const x = k % N, z = (k / N) | 0;
        let n = 0; for (const d of DIRS) if (w.isRoad(x + d.dx, z + d.dz)) n++;
        eAir[k] += (n >= 3 ? 0.9 : 0.45) * traffic * (w.road[k] === 2 ? 1.6 : 1);
      }
    }
    for (const b of w.buildings.values()) {
      if (b.state !== 'done' || b.abandoned) continue;
      const S = SERVICES[b.type];
      let a = 0, g = 0, r = 0;
      if (b.kind === 'ind') { a = 2.2 + b.level * 1.6; g = 0.02 + b.level * 0.02; }
      else if (b.kind === 'com') a = 0.15 * b.level;
      else if (b.kind === 'res') a = b.level >= 3 ? 0.25 : 0.08; // heating
      if (S?.emit) {
        const on = !(S.power) || (b.out || 0) > 0 || S.power.ptype === 'waste' || S.power.ptype === 'thermal';
        if (on) { a += (S.emit.air || 0) / 12; g += (S.emit.ground || 0) / 40; }
        r = S.emit.r || 0;
      }
      if (!a && !g) continue;
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
        const k = w.idx(b.x + i, b.z + j);
        eAir[k] += a; eGr[k] += g;
      }
      // landfills and plants also soil their surroundings
      if (g && r) for (let j = -r; j < b.h + r; j++) for (let i = -r; i < b.w + r; i++) {
        const x = b.x + i, z = b.z + j;
        if (!w.inb(x, z)) continue;
        eGr[w.idx(x, z)] += g * 0.15;
      }
      // factories and landfills on the bank drain into the river
      if (b.kind === 'ind' || b.type === 'landfill' || b.type === 'coal') {
        for (let j = -1; j <= b.h; j++) for (let i = -1; i <= b.w; i++) {
          const x = b.x + i, z = b.z + j;
          if (w.inb(x, z) && w.terrain[w.idx(x, z)] === 1) eWa[w.idx(x, z)] += b.kind === 'ind' ? 0.5 + b.level * 0.3 : 1.2;
        }
      }
    }
    // raw sewage of each street network reaches the river at its outflow
    const util = sim.util;
    if (util?.rcs) util.rcs.forEach((c, r) => { const u = util.untreated[r] || 0; if (u > 0 && c.outflow >= 0) eWa[c.outflow] += u / 90; });

    // ---- air: emit, drift with the wind, spread, fade; trees and parks filter
    const steps = Math.max(1, Math.min(6, Math.round(dtH)));
    const h = dtH / steps;
    this.windAngle += (Math.sin(sim.day * 0.37) * 0.15) * dtH * 0.1;
    const ws = (util?.wind ?? 0.5) * 0.45;
    const wx = Math.cos(this.windAngle) * ws, wz = Math.sin(this.windAngle) * ws;
    for (let s = 0; s < steps; s++) {
      for (let k = 0; k < N * N; k++) air[k] += eAir[k] * h * 1.6;
      // advect (back-trace) + diffuse
      // the wind shift is the same for every cell: one offset and one set of weights
      const ox = -wx * h, oz = -wz * h;
      const dx0 = Math.floor(ox), dz0 = Math.floor(oz), fx = ox - dx0, fz = oz - dz0;
      const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
      for (let z = 0; z < N; z++) {
        const z0 = z + dz0, z1 = z0 + 1;
        const r0 = z0 >= 0 && z0 < N ? z0 * N : -1, r1 = z1 >= 0 && z1 < N ? z1 * N : -1;
        for (let x = 0; x < N; x++) {
          const x0 = x + dx0, x1 = x0 + 1;
          const in0 = x0 >= 0 && x0 < N, in1 = x1 >= 0 && x1 < N;
          let v = 0;
          if (r0 >= 0) { if (in0) v += air[r0 + x0] * w00; if (in1) v += air[r0 + x1] * w10; }
          if (r1 >= 0) { if (in0) v += air[r1 + x0] * w01; if (in1) v += air[r1 + x1] * w11; }
          tmp[z * N + x] = v;
        }
      }
      const dk = 0.12 * h;
      const fade = Math.pow(0.86, h);
      const treeF = [1, Math.pow(0.95, h), Math.pow(0.9, h), Math.pow(0.85, h), Math.pow(0.8, h)];
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const k = z * N + x, c = tmp[k];
        const n = (x > 0 ? tmp[k - 1] : 0) + (x < N - 1 ? tmp[k + 1] : 0) + (z > 0 ? tmp[k - N] : 0) + (z < N - 1 ? tmp[k + N] : 0);
        let v = c + dk * (n - 4 * c);
        const t = w.trees[k];
        if (t) v *= treeF[t] ?? Math.pow(1 - 0.05 * t, h);
        v *= fade;
        air[k] = v < 0 ? 0 : v > 100 ? 100 : v;
      }
    }
    // parks act as green lungs
    for (const b of w.buildings.values()) {
      const gS = SERVICES[b.type]?.green;
      if (!gS || b.state !== 'done') continue;
      for (let j = -2; j < b.h + 2; j++) for (let i = -2; i < b.w + 2; i++) {
        const x = b.x + i, z = b.z + j;
        if (w.inb(x, z)) air[w.idx(x, z)] *= Math.pow(1 - 0.03 * gS, dtH);
      }
    }
    // ---- ground: accumulates slowly
    const gf = Math.pow(0.9993, dtH);
    for (let k = 0; k < N * N; k++) gr[k] = clamp(gr[k] * gf + eGr[k] * dtH, 0, 100);
    // ---- water: flows downstream, lakes mix slowly
    for (let s = 0; s < steps; s++) {
      tmp.fill(0);
      for (let k = 0; k < N * N; k++) {
        if (w.terrain[k] !== 1) continue;
        const v = wa[k] + eWa[k] * h;
        const dn = this.down[k];
        if (this.dist && this.dist[k] === 0) { tmp[k] += v * 0.5; continue; }  // leaves the map
        if (dn >= 0) { tmp[k] += v * (1 - 0.45 * h); tmp[dn] += v * 0.42 * h; }
        else tmp[k] += v * Math.pow(0.985, h);
      }
      for (let k = 0; k < N * N; k++) wa[k] = clamp(tmp[k], 0, 100);
    }
    // ---- noise (no memory)
    this.computeNoise(traffic);
    this.version++;
  }

  computeNoise(traffic) {
    const w = this.world, N = w.N, no = this.noise;
    no.fill(0);
    const add = (cx, cz, v, r) => {
      for (let z = Math.max(0, Math.floor(cz - r)); z <= Math.min(N - 1, Math.ceil(cz + r)); z++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(N - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > r + 0.5) continue;
        no[z * N + x] += v / (1 + d * 1.2);
      }
    };
    for (let k = 0; k < N * N; k++) {
      if (!w.road[k] || w.terrain[k]) continue;
      const x = k % N, z = (k / N) | 0;
      let n = 0; for (const d of DIRS) if (w.isRoad(x + d.dx, z + d.dz)) n++;
      add(x + 0.5, z + 0.5, (n >= 3 ? 16 : 10) * traffic * (w.road[k] === 2 ? 1.5 : 1), w.road[k] === 2 ? 1.6 : 1);
    }
    for (const b of w.buildings.values()) {
      if (b.state !== 'done' || b.abandoned) continue;
      const S = SERVICES[b.type];
      const cx = b.x + b.w / 2, cz = b.z + b.h / 2;
      if (b.kind === 'ind') add(cx, cz, 18 + 6 * b.level, 2);
      else if (b.kind === 'com' && b.level >= 2) add(cx, cz, 6, 1);
      if (S?.emit?.noise) add(cx, cz, S.emit.noise, S.emit.r || 2);
    }
    for (let k = 0; k < N * N; k++) no[k] = Math.min(100, no[k]);
  }

  // mean value of a field over a building footprint
  at(field, b) {
    const w = this.world;
    let s = 0;
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) s += field[w.idx(b.x + i, b.z + j)];
    return s / (b.w * b.h);
  }

  // serialisation: quantised to bytes
  pack() {
    const q = (f) => { const u = new Uint8Array(f.length); for (let i = 0; i < f.length; i++) u[i] = Math.round(clamp(f[i], 0, 100) * 2.55); return u; };
    return { air: q(this.air), ground: q(this.ground), water: q(this.water) };
  }
  unpack(o) {
    const d = (u, f) => { if (!u || u.length !== f.length) return; for (let i = 0; i < f.length; i++) f[i] = u[i] / 2.55; };
    this.air.fill(0); this.ground.fill(0); this.water.fill(0);
    if (!o) return;
    d(o.air, this.air); d(o.ground, this.ground); d(o.water, this.water);
    this.version++;
  }
}
