import { SERVICES, NEEDS, EXTERNAL, TRUCK_LOAD } from './config.js';

// ---------------------------------------------------------------------------
// Garbage: every building fills its bins day by day. Garbage trucks start at
// a landfill, recycling centre or incinerator, drive to the street whose bins
// are waiting longest, then go from stop to stop nearby (a round of up to
// STOPS stops) and bring the load home. Without a depot the district sends
// (expensive) trucks from outside the map.
// ---------------------------------------------------------------------------
const STOPS = 16;

export function garbageRate(b) {
  if (b.state !== 'done' || b.abandoned) return 0;
  if (b.kind === 'res') return b.pop * NEEDS.res.garbage;
  if (b.kind === 'com') return b.jobs * NEEDS.com.garbage;
  if (b.kind === 'ind') return b.jobs * NEEDS.ind.garbage;
  const S = SERVICES[b.type];
  if (!S || S.waste || S.power || S.sub) return 0;
  return 0.01 + (S.use || 0) * 0.04;
}

export function garbageDays(b) {
  const r = garbageRate(b);
  return r > 0 ? (b.garb || 0) / r : 0;
}

export class Waste {
  constructor(sim) {
    this.sim = sim;
    this.world = sim.world;
    this.reserved = new Set();
    this.timer = 0;
    this.byTile = new Map();
    this.tileGarb = new Map();
    this.stats = { open: 0, overflow: 0, landfill: 0, landfillCap: 0, trucks: 0, external: 0, rate: 0, capacity: 0 };
    this.ctl = { arrive: (v, tr) => this.arrive(v, tr), gone: (v) => this.release(v) };
  }
  get traffic() { return this.sim.game.traffic; }

  // in-game hours passed: bins fill up, depots process their stock
  hour(dtH) {
    const w = this.world;
    let open = 0, overflow = 0, rate = 0, fill = 0, cap = 0, capacity = 0;
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      const r = garbageRate(b);
      if (r > 0) {
        b.garb = Math.min((b.garb || 0) + r * dtH / 24, r * 12);
        rate += r; open += b.garb;
        if (b.garb / r > 3) overflow++;
      }
      const S = SERVICES[b.type]?.waste;
      if (!S) continue;
      const on = b.pw !== 0;
      if (S.recycle) {
        const p = on ? Math.min(b.store || 0, S.recycle * dtH / 24) : 0;
        b.store = (b.store || 0) - p;
        if (p > 0) this.sim.book('recycling', p * 22);
        capacity += S.recycle;
      }
      if (S.burn) {
        const p = on ? Math.min(b.bunker || 0, S.burn * dtH / 24) : 0;
        b.bunker = (b.bunker || 0) - p;
        capacity += S.burn;
      }
      if (b.type === 'landfill') { fill += b.fill || 0; cap += S.cap; }
    }
    Object.assign(this.stats, { open, overflow, rate, landfill: fill, landfillCap: cap, capacity });
  }

  depots() {
    const out = [];
    for (const b of this.world.buildings.values()) {
      const S = SERVICES[b.type]?.waste;
      if (!S || b.state !== 'done' || b.rc < 0) continue;
      out.push(b);
    }
    return out;
  }
  isFull(b) {
    const S = SERVICES[b.type].waste;
    if (b.type === 'landfill') return (b.fill || 0) >= S.cap;
    if (S.recycle) return (b.store || 0) >= S.cap;
    if (S.burn) return (b.bunker || 0) >= S.cap;
    return false;
  }

  // real seconds: send out trucks
  tick(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.6;
    const tr = this.traffic;
    if (!tr) return;
    const w = this.world, nav = tr.nav;
    // garbage waiting in front of each road tile
    this.byTile.clear(); this.tileGarb.clear();
    for (const b of w.buildings.values()) {
      if (!b.garb || b.garb < 0.002 || b.state !== 'done') continue;
      if (b.ftVer !== w.version) { b.ft = nav.frontTiles(b)[0] ?? -1; b.ftVer = w.version; }
      if (b.ft < 0) continue;
      (this.byTile.get(b.ft) || this.byTile.set(b.ft, []).get(b.ft)).push(b);
      this.tileGarb.set(b.ft, Math.max(this.tileGarb.get(b.ft) || 0, garbageDays(b)));
    }
    let trucks = 0;
    const depots = this.depots();
    let usable = 0;
    for (const d of depots) {
      const S = SERVICES[d.type].waste;
      const active = tr.count((v) => v.type === 'garbage' && v.data.depot === d.id);
      trucks += active;
      if (d.pw === 0 || this.isFull(d)) continue;
      usable++;
      if (active >= S.trucks) continue;
      const from = nav.frontTiles(d);
      const k = this.pickTarget(from[0], 0.7);
      if (k < 0) continue;
      const v = tr.drive('garbage', from, [k], { role: 'collect', name: `Müllwagen · ${SERVICES[d.type].name}`, data: { depot: d.id, load: 0, target: k, stops: 0 } });
      if (v) { v.ctl = this.ctl; v.dwellAtEnd = 0.8; this.reserved.add(k); trucks++; }
    }
    // the district helps out when the town has no working depot
    const ext = tr.count((v) => v.type === 'garbage' && v.data.depot === 'edge');
    this.stats.external = ext;
    // after an update the district sends as many trucks as a town of this size needs
    let extCap = EXTERNAL.garbage.trucks;
    const gl = this.sim.graceLeft?.() || 0;
    if (gl > 0) extCap += Math.ceil(this.byTile.size / 30 * gl);
    if (!usable && ext < extCap && (gl > 0 || (this.sim.hour > 5 && this.sim.hour < 20))) {
      const k = this.pickTarget(-1, gl > 0 ? 0.8 : 1.6);
      const st = k >= 0 ? tr.edgeStart() : null;
      if (st) {
        const v = tr.drive('garbage', st.starts, [k], { role: 'collect', pre: st.pre, name: 'Müllabfuhr des Landkreises', data: { depot: 'edge', load: 0, target: k, stops: 0 } });
        if (v) { v.ctl = this.ctl; v.dwellAtEnd = 0.8; this.reserved.add(k); }
      }
    }
    this.stats.trucks = trucks + ext;
  }

  // the road tile whose bins wait longest, preferring tiles near the depot
  pickTarget(fromK, min) {
    const N = this.world.N;
    const fx = fromK >= 0 ? fromK % N : -1, fz = fromK >= 0 ? (fromK / N) | 0 : -1;
    let best = -1, bs = 0;
    for (const [k, g] of this.tileGarb) {
      if (g < min || this.reserved.has(k)) continue;
      const d = fromK >= 0 ? Math.abs(k % N - fx) + Math.abs(((k / N) | 0) - fz) : 0;
      const s = g / (1 + d / 16);
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  }

  arrive(v, tr) {
    const d = v.data;
    if (d.home) { this.unload(v); return false; }
    this.release(v);
    // empty the bins along the street driven since the last stop
    const k = tr.tileOf(v);
    const N = this.world.N;
    if (k >= 0) {
      const tiles = new Set([k, k - 1, k + 1, k - N, k + N]);
      for (const [x, z] of v.path) if (this.world.inb(x, z)) tiles.add(z * N + x);
      for (const t of tiles) {
        const list = this.byTile.get(t);
        if (!list) continue;
        for (const b of list) {
          const take = Math.min(b.garb || 0, TRUCK_LOAD - d.load);
          if (take <= 0) continue;
          b.garb -= take; d.load += take;
        }
        this.tileGarb.delete(t);
      }
    }
    d.collecting = true;
    d.stops = (d.stops || 0) + 1;
    if (d.load < TRUCK_LOAD * 0.9 && d.stops < STOPS && k >= 0) {
      let best = -1, bg = 0.35;
      const near = tr.nav.reachable(k, 8), N2 = this.world.N;
      for (const c of near) {
        const g = this.tileGarb.get(c) || 0;
        if (g <= 0 || this.reserved.has(c) || c === k) continue;
        const dist = Math.abs(c % N2 - k % N2) + Math.abs(((c / N2) | 0) - ((k / N2) | 0));
        const sc = g / (1 + dist * 0.15);
        if (sc > bg) { bg = sc; best = c; }
      }
      if (best >= 0 && tr.reroute(v, [best], 0.8)) { d.target = best; this.reserved.add(best); return true; }
    }
    // full or nothing left nearby: back to the depot
    d.home = true; d.collecting = false;
    if (d.depot === 'edge') return tr.reroute(v, 'edge', 0);
    const depot = this.world.buildings.get(d.depot);
    if (!depot) return false;
    return tr.reroute(v, tr.nav.frontTiles(depot), 2.5);
  }

  unload(v) {
    const d = v.data, load = d.load;
    d.load = 0;
    if (load <= 0) return;
    if (d.depot === 'edge') { this.sim.book('garbageExt', -load * EXTERNAL.garbage.price); return; }
    const b = this.world.buildings.get(d.depot);
    if (!b) return;
    const S = SERVICES[b.type].waste;
    if (b.type === 'landfill') b.fill = (b.fill || 0) + load;
    else if (S.recycle) b.store = (b.store || 0) + load;
    else if (S.burn) b.bunker = (b.bunker || 0) + load;
    if (b.type === 'landfill') this.sim.game.emit('landfill', b);
  }

  release(v) {
    if (v.data?.target !== undefined) { this.reserved.delete(v.data.target); v.data.target = undefined; }
  }
}
