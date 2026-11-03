import { SERVICES, NEEDS, EXTERNAL } from './config.js';
import { DIRS, clamp, hash2 } from './util.js';

// ---------------------------------------------------------------------------
// Power, water and sewage networks.
// The streets carry the local grid and the water mains: every building is
// connected to the network of the road in front of it. Large power plants
// feed the high-voltage grid (power lines); substations pass that power on
// to the streets. Roads and lines that leave the map connect to the district
// (Landkreis), which sells a little power and water at a high price.
// ---------------------------------------------------------------------------

const norm = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return a.map((v) => v / m); };
const P_RES = norm([0.6, 0.55, 0.55, 0.55, 0.6, 0.7, 0.95, 1.1, 1.0, 0.85, 0.8, 0.8, 0.85, 0.8, 0.8, 0.85, 0.95, 1.15, 1.35, 1.45, 1.4, 1.25, 1.0, 0.75]);
const P_COM = norm([0.35, 0.3, 0.3, 0.3, 0.3, 0.4, 0.6, 0.9, 1.2, 1.35, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.35, 1.3, 1.2, 1.0, 0.8, 0.6, 0.45, 0.4]);
const P_IND = norm([0.8, 0.8, 0.8, 0.8, 0.8, 0.85, 1.0, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.0, 0.95, 0.9, 0.9, 0.85, 0.85, 0.8]);
const W_RES = norm([0.35, 0.3, 0.3, 0.3, 0.4, 0.8, 1.6, 1.8, 1.4, 1.0, 0.9, 0.95, 1.1, 1.0, 0.9, 0.9, 1.0, 1.2, 1.5, 1.5, 1.3, 1.0, 0.7, 0.5]);
const W_WORK = norm([0.4, 0.35, 0.35, 0.35, 0.4, 0.6, 0.9, 1.2, 1.3, 1.3, 1.3, 1.3, 1.35, 1.3, 1.3, 1.25, 1.2, 1.1, 0.9, 0.7, 0.6, 0.5, 0.45, 0.4]);
const at = (arr, h) => { const i = Math.floor(h) % 24, f = h - Math.floor(h); return arr[i] * (1 - f) + arr[(i + 1) % 24] * f; };

export const isPowerFacility = (b) => !!(SERVICES[b.type]?.power || SERVICES[b.type]?.sub);

// building demand in MW and m³/day at a given hour
export function powerUse(b, h) {
  if (b.state !== 'done' || b.abandoned) return 0;
  if (b.kind === 'res') return b.pop * NEEDS.res.power * at(P_RES, h);
  if (b.kind === 'com') return b.jobs * NEEDS.com.power * at(P_COM, h);
  if (b.kind === 'ind') return b.jobs * NEEDS.ind.power * at(P_IND, h);
  return SERVICES[b.type]?.use || 0;
}
export function waterUse(b, h) {
  if (b.state !== 'done' || b.abandoned) return 0;
  if (b.kind === 'res') return b.pop * NEEDS.res.water * at(W_RES, h);
  if (b.kind === 'com') return b.jobs * NEEDS.com.water * at(W_WORK, h);
  if (b.kind === 'ind') return b.jobs * NEEDS.ind.water * at(W_WORK, h);
  return SERVICES[b.type]?.wuse || 0;
}

export class Utilities {
  constructor(sim) {
    this.sim = sim;
    this.world = sim.world;
    const n = this.world.N ** 2;
    this.rcomp = new Int32Array(n).fill(-1);  // road component per road tile
    this.hcomp = new Int32Array(n).fill(-1);  // high-voltage component per line tile
    this.rcs = []; this.hvs = [];
    this.key = '';
    this.wind = 0.6; this.sun = 0;
    this.stats = null;
    this.headP = []; this.headW = [];
    this.untreated = []; // per road component, m³/day of raw sewage reaching the river
  }

  // ----------------------------------------------------------- topology
  roadOf(b, any = false) {
    const w = this.world;
    let t = w.frontRoad(b.x, b.z, b.w, b.h, b.rot);
    if (!t.length && (any || SERVICES[b.type]?.noRoad || b.kind === 'svc')) for (let d = 0; d < 4 && !t.length; d++) t = w.frontRoad(b.x, b.z, b.w, b.h, d);
    return t.length ? this.rcomp[w.idx(t[0][0], t[0][1])] : -1;
  }

  topology() {
    const w = this.world, N = w.N;
    const key = `${w.version}|${w.lineVersion}|${w.bver}`;
    if (key === this.key) return false;
    this.key = key;
    // road components (water mains and local grid)
    const rc = this.rcomp; rc.fill(-1);
    this.rcs = [];
    const q = new Int32Array(N * N);
    for (let s = 0; s < N * N; s++) {
      if (!w.road[s] || rc[s] >= 0) continue;
      const id = this.rcs.length;
      const c = { id, tiles: 0, edge: false, sx: 0, sz: 0, outflow: -1, start: s };
      let qh = 0, qt = 0; q[qt++] = s; rc[s] = id;
      while (qh < qt) {
        const k = q[qh++]; const x = k % N, z = (k / N) | 0;
        c.tiles++; c.sx += x; c.sz += z;
        if (x === 0 || z === 0 || x === N - 1 || z === N - 1) c.edge = true;
        for (const d of DIRS) {
          const nx = x + d.dx, nz = z + d.dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const nk = nz * N + nx;
          if (w.road[nk] && rc[nk] < 0) { rc[nk] = id; q[qt++] = nk; }
        }
      }
      this.rcs.push(c);
    }
    // where raw sewage of each network reaches the river: nearest water tile to its centre
    const water = [];
    for (let k = 0; k < N * N; k++) if (w.terrain[k] === 1) water.push(k);
    for (const c of this.rcs) {
      const cx = c.sx / c.tiles, cz = c.sz / c.tiles;
      let best = -1, bd = 1e9;
      for (const k of water) { const d = (k % N - cx) ** 2 + (((k / N) | 0) - cz) ** 2; if (d < bd) { bd = d; best = k; } }
      c.outflow = best;
    }
    // high-voltage grid: union-find over line tiles and grid facilities
    const facs = [];
    for (const b of w.buildings.values()) {
      b.rc = b.state === 'done' || b.state === 'build' ? this.roadOf(b) : -1;
      const S = SERVICES[b.type];
      if (b.state !== 'done' || !S) continue;
      if (S.sub || S.power?.hv || (S.power && b.rc < 0)) facs.push(b);
    }
    const parent = new Int32Array(N * N + facs.length);
    for (let i = 0; i < parent.length; i++) parent[i] = i;
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    for (let k = 0; k < N * N; k++) {
      if (!w.pline[k]) continue;
      const x = k % N, z = (k / N) | 0;
      if (x + 1 < N && w.pline[k + 1]) union(k, k + 1);
      if (z + 1 < N && w.pline[k + N]) union(k, k + N);
    }
    const facAt = new Map();
    facs.forEach((b, i) => { for (let j = 0; j < b.h; j++) for (let ii = 0; ii < b.w; ii++) facAt.set(w.idx(b.x + ii, b.z + j), i); });
    facs.forEach((b, i) => {
      const node = N * N + i;
      for (let j = -1; j <= b.h; j++) for (let ii = -1; ii <= b.w; ii++) {
        const inside = j >= 0 && j < b.h && ii >= 0 && ii < b.w;
        const corner = (j < 0 || j >= b.h) && (ii < 0 || ii >= b.w);
        if (inside || corner) continue;
        const x = b.x + ii, z = b.z + j;
        if (!w.inb(x, z)) continue;
        const k = w.idx(x, z);
        if (w.pline[k]) union(node, k);
        const o = facAt.get(k);
        if (o !== undefined) union(node, N * N + o);
      }
    });
    const hmap = new Map();
    this.hvs = [];
    const hvOf = (root) => {
      let id = hmap.get(root);
      if (id === undefined) { id = this.hvs.length; hmap.set(root, id); this.hvs.push({ id, edge: false, tiles: 0 }); }
      return id;
    };
    this.hcomp.fill(-1);
    for (let k = 0; k < N * N; k++) {
      if (!w.pline[k]) continue;
      const h = hvOf(find(k));
      this.hcomp[k] = h;
      const hv = this.hvs[h]; hv.tiles++;
      const x = k % N, z = (k / N) | 0;
      if (x === 0 || z === 0 || x === N - 1 || z === N - 1) hv.edge = true;
    }
    for (const b of w.buildings.values()) b.hv = -1;
    facs.forEach((b, i) => { b.hv = hvOf(find(N * N + i)); });
    return true;
  }

  // ----------------------------------------------------------- weather
  weather(day, hour) {
    const t = day + hour / 24;
    this.wind = clamp(0.5 + 0.28 * Math.sin(t * 0.9 + 1) + 0.18 * Math.sin(t * 2.3 + 0.4) + 0.1 * Math.sin(t * 5.1 + 2), 0.04, 1);
    const clouds = 0.72 + 0.28 * Math.sin(t * 0.7 + 3);
    this.sun = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12)) * clouds;
  }
  output(b) {
    const P = SERVICES[b.type]?.power;
    if (!P || b.state !== 'done') return 0;
    if (P.ptype === 'wind') return P.gen * Math.pow(this.wind, 1.5);
    if (P.ptype === 'solar') return P.gen * this.sun;
    if (P.ptype === 'waste') return (b.bunker || 0) > 0.5 ? P.gen : 0;
    if (P.ptype === 'battery') return 0;
    return P.gen;
  }

  // ----------------------------------------------------------- flows
  // dt: elapsed time in days since the last solve
  solve(dt) {
    const sim = this.sim, w = this.world, hour = sim.hour;
    this.topology();
    this.weather(sim.day, hour);
    const R = this.rcs.length, H = this.hvs.length;
    const D = new Float64Array(R), G = new Float64Array(R);
    const cons = Array.from({ length: R }, () => []);
    const pools = new Float64Array(H);      // own generation available on each HV grid
    const genBy = { wind: 0, solar: 0, thermal: 0, hydro: 0, waste: 0, battery: 0 };
    const subs = [], batteries = [];
    let noRoad = 0;
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      const S = SERVICES[b.type];
      const use = powerUse(b, hour);
      b.pUse = use;
      if (use > 0) {
        if (b.rc >= 0) { D[b.rc] += use; cons[b.rc].push(b); } else { b.pw = 0; noRoad++; }
      } else b.pw = 1;
      if (!S) continue;
      if (S.sub && b.rc >= 0 && b.hv >= 0) subs.push({ b, r: b.rc, h: b.hv, cap: S.sub, flow: 0 });
      if (S.power) {
        if (S.power.ptype === 'battery') { batteries.push(b); b.stored = clamp(b.stored ?? 0, 0, S.power.store); continue; }
        const out = this.output(b);
        b.out = 0;
        if (!S.power.hv && b.rc >= 0) { G[b.rc] += out; b.out = out; }
        else if (b.hv >= 0) { pools[b.hv] += out; b.out = out; }
        b.gridless = b.out === 0 && out > 0;
        genBy[S.power.ptype] += b.out;
      }
    }
    // local generation first
    const def = new Float64Array(R), sur = new Float64Array(R);
    for (let r = 0; r < R; r++) { def[r] = Math.max(0, D[r] - G[r]); sur[r] = Math.max(0, G[r] - D[r]); }
    // surplus of the streets flows up through substations into the HV grid
    for (const s of subs) {
      const up = Math.min(s.cap, sur[s.r]);
      if (up > 0) { sur[s.r] -= up; pools[s.h] += up; s.flow -= up; }
    }
    // deliveries promised to neighbouring towns leave over HV lines at the map edge
    const exp = this.sim.contractExports?.() || { power: 0, water: 0 };
    let needP = exp.power || 0;
    for (let h = 0; h < H && needP > 0; h++) { if (!this.hvs[h].edge) continue; const t = Math.min(pools[h], needP); pools[h] -= t; needP -= t; }
    this.delivered = { power: exp.power ? 1 - needP / exp.power : 1, water: 1 };
    const ownPool = Float64Array.from(pools);
    // batteries next to a street serve that street, the others the HV grid
    const discharge = (b, need) => {
      const P = SERVICES[b.type].power;
      const e = Math.min(P.rate, need, b.stored / Math.max(dt, 1e-6));
      return Math.max(0, e);
    };
    for (const b of batteries) {
      b.out = 0;
      if (b.rc >= 0 && def[b.rc] > 0) { const e = discharge(b, def[b.rc]); def[b.rc] -= e; b.out = e; }
    }
    // own generation through substations
    const serve = (pool, priceTag) => {
      let used = 0;
      for (const s of subs) {
        const room = s.cap - Math.max(0, s.flow);
        const e = Math.min(room, def[s.r], pool[s.h]);
        if (e <= 0) continue;
        pool[s.h] -= e; def[s.r] -= e; s.flow += e; used += e;
      }
      return used;
    };
    serve(pools);
    // HV batteries cover what is still missing
    const hvNeed = new Float64Array(H);
    for (const s of subs) hvNeed[s.h] += Math.min(def[s.r], s.cap - Math.max(0, s.flow));
    for (const b of batteries) {
      if (b.rc >= 0 || b.hv < 0 || hvNeed[b.hv] <= 0) continue;
      const e = discharge(b, hvNeed[b.hv]);
      pools[b.hv] += e; hvNeed[b.hv] -= e; b.out = e;
    }
    serve(pools);
    for (const b of batteries) genBy.battery += b.out;
    // the district grid: HV lines at the map edge, then the streets leaving the map
    const ext = this.external();
    const hvImp = new Float64Array(H);
    let impHV = 0, impLocal = 0;
    for (let h = 0; h < H; h++) if (this.hvs[h].edge) hvImp[h] = ext.power.hvCap;
    impHV = serve(hvImp);
    const locImp = new Float64Array(R);
    for (let r = 0; r < R; r++) {
      if (!this.rcs[r].edge) continue;
      const e = Math.min(ext.power.cap, def[r]);
      def[r] -= e; locImp[r] = e; impLocal += e;
    }
    // charge batteries with what is left over
    for (const b of batteries) {
      const P = SERVICES[b.type].power;
      let avail = 0;
      if (b.rc >= 0) avail = sur[b.rc]; else if (b.hv >= 0) avail = pools[b.hv];
      const room = (P.store - b.stored) / Math.max(dt, 1e-6);
      const c = Math.max(0, Math.min(P.rate, avail, room));
      if (b.rc >= 0) sur[b.rc] -= c; else if (b.hv >= 0) pools[b.hv] -= c;
      b.stored = clamp(b.stored + (c - b.out) * dt, 0, P.store);
      b.charging = c;
    }
    // unused own HV generation is sold to the district grid
    let exported = 0;
    for (let h = 0; h < H; h++) if (this.hvs[h].edge) exported += Math.min(ext.power.hvCap, Math.max(0, Math.min(pools[h], ownPool[h])));
    // who gets power: critical services first, then a slowly rotating order (rolling blackouts)
    const epoch = Math.floor(sim.day * 4 + hour / 6);
    const prio = (b) => (SERVICES[b.type]?.crit ? -1 : hash2(b.id, epoch, 17));
    let unpowered = noRoad, short = 0;
    this.headP = new Array(R).fill(0);
    for (let r = 0; r < R; r++) {
      const supplied = D[r] - def[r];
      short += def[r];
      const list = cons[r];
      if (def[r] <= 1e-9) { for (const b of list) b.pw = 1; }
      else {
        list.sort((a, b) => prio(a) - prio(b));
        let left = supplied + 1e-9;
        for (const b of list) { if (b.pUse <= left) { b.pw = 1; left -= b.pUse; } else { b.pw = 0; unpowered++; } }
      }
      // headroom for new buildings
      let head = sur[r] + (this.rcs[r].edge ? ext.power.cap - locImp[r] : 0);
      for (const s of subs) if (s.r === r) head += Math.max(0, Math.min(s.cap - Math.max(0, s.flow), pools[s.h] + hvImp[s.h]));
      this.headP[r] = def[r] > 1e-6 ? -def[r] : head;
    }
    let storedE = 0, storeCap = 0;
    for (const b of batteries) { storedE += b.stored; storeCap += SERVICES[b.type].power.store; }
    let subCap = 0, subUse = 0;
    for (const s of subs) { subCap += s.cap; subUse += Math.max(0, s.flow); }
    const demand = D.reduce((a, v) => a + v, 0);
    const power = { demand, supplied: demand - short, short, unpowered, gen: genBy, imp: impHV + impLocal, impHV, impLocal, exp: exported, stored: storedE, storeCap, subCap, subUse, subs: subs.length, wind: this.wind, sun: this.sun };

    // ---------------- water: wells and waterworks need power
    const WD = new Float64Array(R), WS = new Float64Array(R), WQ = new Float64Array(R);
    const wcons = Array.from({ length: R }, () => []);
    const towers = [];
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      const use = waterUse(b, hour);
      b.wUse = use;
      if (use > 0) { if (b.rc >= 0) { WD[b.rc] += use; wcons[b.rc].push(b); } else b.wt = 0; } else b.wt = 1;
      const S = SERVICES[b.type];
      if (!S) continue;
      if (S.water) {
        b.q = this.sourceQuality(b, S.water.src);
        b.wOut = b.rc >= 0 && b.pw ? S.water.out : 0;
        if (b.wOut) { WS[b.rc] += b.wOut; WQ[b.rc] += b.wOut * b.q; }
      }
      if (S.tower) { towers.push(b); b.wStored = clamp(b.wStored ?? S.tower * 0.5, 0, S.tower); }
    }
    const wdef = new Float64Array(R), wsur = new Float64Array(R), wImp = new Float64Array(R);
    let wImport = 0, wShort = 0, dry = 0, produced = 0, wDemand = 0, wStored = 0, wStoreCap = 0;
    for (let r = 0; r < R; r++) {
      produced += WS[r]; wDemand += WD[r];
      wdef[r] = Math.max(0, WD[r] - WS[r]); wsur[r] = Math.max(0, WS[r] - WD[r]);
    }
    // water towers buffer the morning and evening peaks
    for (const b of towers) {
      const S = SERVICES[b.type];
      if (b.rc < 0) continue;
      const r = b.rc;
      if (wdef[r] > 0) { const e = Math.min(wdef[r], b.wStored / Math.max(dt, 1e-6)); wdef[r] -= e; b.wStored -= e * dt; }
      else if (wsur[r] > 0) { const room = (S.tower - b.wStored) / Math.max(dt, 1e-6); const c = Math.min(room, wsur[r]); wsur[r] -= c; b.wStored += c * dt; }
      wStored += b.wStored; wStoreCap += S.tower;
    }
    let needW = exp.water || 0;
    for (let r = 0; r < R && needW > 0; r++) { if (!this.rcs[r].edge) continue; const t = Math.min(wsur[r], needW); wsur[r] -= t; needW -= t; }
    this.delivered.water = exp.water ? 1 - needW / exp.water : 1;
    this.headW = new Array(R).fill(0);
    const qOf = new Float64Array(R);
    for (let r = 0; r < R; r++) {
      if (this.rcs[r].edge && wdef[r] > 0) { const e = Math.min(ext.water.cap, wdef[r]); wdef[r] -= e; wImp[r] = e; wImport += e; }
      wShort += wdef[r];
      const supplied = WD[r] - wdef[r];
      const list = wcons[r];
      if (wdef[r] <= 1e-9) for (const b of list) b.wt = 1;
      else {
        list.sort((a, b) => prio(a) - prio(b));
        let left = supplied + 1e-9;
        for (const b of list) { if (b.wUse <= left) { b.wt = 1; left -= b.wUse; } else { b.wt = 0; dry++; } }
      }
      const fromOwn = Math.min(WS[r], WD[r]);
      qOf[r] = (WS[r] > 0 ? (WQ[r] / WS[r]) * fromOwn : 0) + 0.95 * wImp[r];
      qOf[r] = (fromOwn + wImp[r]) > 0 ? qOf[r] / (fromOwn + wImp[r]) : 1;
      this.headW[r] = wdef[r] > 1e-6 ? -wdef[r] : wsur[r] + (this.rcs[r].edge ? ext.water.cap - wImp[r] : 0);
    }
    this.quality = qOf;
    let qSum = 0, qW = 0;
    for (let r = 0; r < R; r++) { const s = WD[r] - wdef[r]; qSum += qOf[r] * s; qW += s; }
    const water = { demand: wDemand, supplied: wDemand - wShort, short: wShort, dry, produced, imp: wImport, quality: qW > 0 ? qSum / qW : 1, stored: wStored, storeCap: wStoreCap };

    // ---------------- sewage: what the houses use goes back down the drain
    const SP = new Float64Array(R), ST = new Float64Array(R);
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      if (b.rc >= 0 && b.wt) SP[b.rc] += b.wUse * 0.9;
      const S = SERVICES[b.type];
      if (S?.treat) { b.treatCap = b.rc >= 0 && b.pw ? S.treat : 0; if (b.rc >= 0) ST[b.rc] += b.treatCap; b.treated = 0; }
    }
    this.untreated = new Array(R).fill(0);
    const TT = new Float64Array(R);
    let sProd = 0, sTreat = 0, sExp = 0, sRaw = 0;
    for (let r = 0; r < R; r++) {
      sProd += SP[r];
      let left = SP[r];
      const t = Math.min(left, ST[r]); left -= t; sTreat += t; TT[r] = t;
      if (left > 0 && this.rcs[r].edge) { const e = Math.min(ext.sewage.cap, left); left -= e; sExp += e; }
      this.untreated[r] = left; sRaw += left;
    }
    for (const b of w.buildings.values()) if (b.treatCap && ST[b.rc] > 0) b.treated = TT[b.rc] * b.treatCap / ST[b.rc];
    const sewage = { produced: sProd, treated: sTreat, exported: sExp, untreated: sRaw };

    // ---------------- money per day for district supplies
    const costs = {
      power: Math.max(0, impHV - ext.power.contract) * ext.power.hvPrice + impLocal * ext.power.price,
      powerSold: exported * ext.power.sell,
      water: Math.max(0, wImport - ext.water.contract) * ext.water.price,
      sewage: sExp * ext.sewage.price,
    };
    this.stats = { power, water, sewage, costs };
    return this.stats;
  }

  // district supply plus extras (transition period after an update, contracts with neighbours)
  external() {
    const x = this.sim.extraSupply?.() || {};
    return {
      power: { ...EXTERNAL.power, cap: EXTERNAL.power.cap + (x.power || 0), hvCap: EXTERNAL.power.hvCap + (x.hv || 0), contract: x.hv || 0 },
      water: { ...EXTERNAL.water, cap: EXTERNAL.water.cap + (x.water || 0) + (x.waterContract || 0), contract: x.waterContract || 0 },
      sewage: { ...EXTERNAL.sewage, cap: EXTERNAL.sewage.cap + (x.sewage || 0) },
    };
  }

  // 0..1: how clean the water from a source is (river or ground pollution at the intake)
  sourceQuality(b, src) {
    const pol = this.sim.pollution;
    if (!pol) return 1;
    const w = this.world;
    if (src === 'river') {
      let best = 0, n = 0;
      for (let j = -1; j <= b.h; j++) for (let i = -1; i <= b.w; i++) {
        const x = b.x + i, z = b.z + j;
        if (!w.inb(x, z) || !w.terrain[w.idx(x, z)]) continue;
        best += pol.water[w.idx(x, z)]; n++;
      }
      const p = n ? best / n : 0;
      return clamp(1 - p / 120, 0.2, 1); // the waterworks filter half of it away
    }
    let g = 0;
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) g += pol.ground[w.idx(b.x + i, b.z + j)];
    g /= b.w * b.h;
    return clamp(1 - g / 70, 0.1, 1);
  }

  // can a lot on road network r take another building of this demand?
  canSupply(r, pNeed, wNeed) {
    if (r < 0) return false;
    return (this.headP[r] ?? 0) >= pNeed && (this.headW[r] ?? 0) >= wNeed;
  }
}
