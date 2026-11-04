import { SERVICES } from './config.js';

// ---------------------------------------------------------------------------
// Parking: residents, staff and customers need parking spaces near the
// building. Streets offer a few spaces at the kerb (main roads none), car
// parks, underground garages and multi-storey car parks many more. Every
// building's demand is spread over the parking within walking distance; a
// car park that is too full serves everyone only partly.
// ---------------------------------------------------------------------------

const RES = [0, 0, 0.08, 0.15, 0.2];   // cars per resident by building level
const COM = [0, 0.15, 0.2, 0.22, 0.18]; // cars per job (staff and customers)
const SVC = { hospital: 40, stadium: 120, townhall: 15, school: 10, church: 8, clinic: 6, rescue: 0 };
const STREET = 3;                       // kerbside spaces per street tile

export function carsNeeded(b) {
  if (b.state !== 'done' || b.abandoned) return 0;
  if (b.kind === 'res') return b.pop * RES[b.level];
  if (b.kind === 'com') return b.jobs * COM[b.level];
  return SVC[b.type] || 0;
}

export class Parking {
  constructor(sim) {
    this.sim = sim;
    this.world = sim.world;
    this.stats = { demand: 0, supply: 0, served: 0, short: 0 };
  }

  update() {
    const w = this.world, N = w.N;
    // sources: kerbside spaces on ordinary streets and parking buildings
    const fac = [];
    for (const b of w.buildings.values()) {
      const S = SERVICES[b.type];
      if (S?.park && b.state === 'done') { fac.push({ b, cap: S.park, r: S.radius, x: b.x + b.w / 2, z: b.z + b.h / 2, D: 0 }); b.occ = 0; }
    }
    const street = new Map();
    const streetCap = (k) => {
      const x = k % N, z = (k / N) | 0;
      if (w.road[k] !== 1 || w.terrain[k] || w.busstop[k] || w.isJunction(x, z)) return 0;
      return STREET;
    };
    const users = [];
    let demand = 0;
    for (const b of w.buildings.values()) {
      const d = carsNeeded(b);
      if (d <= 0) { b.park = 1; continue; }
      demand += d;
      const cx = b.x + b.w / 2, cz = b.z + b.h / 2;
      const cand = [];
      let total = 0;
      for (const f of fac) {
        const ddx = f.x - cx, ddz = f.z - cz, dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist > f.r) continue;
        const wgt = f.cap / (1 + dist * 0.3);
        cand.push([f, wgt]); total += wgt;
      }
      for (let z = Math.floor(cz - 2); z <= Math.ceil(cz + 2); z++) for (let x = Math.floor(cx - 2); x <= Math.ceil(cx + 2); x++) {
        if (!w.inb(x, z) || (x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 > 4.84) continue;
        const k = z * N + x;
        const cap = streetCap(k);
        if (!cap) continue;
        let s = street.get(k);
        if (!s) { s = { cap, D: 0 }; street.set(k, s); }
        cand.push([s, cap]); total += cap;
      }
      if (!total) { b.park = 0; continue; }
      for (const c of cand) { c[1] /= total; c[0].D += d * c[1]; }
      users.push([b, cand, d]);
    }
    // each source serves its users in proportion to how full it is
    let served = 0;
    for (const [b, cand, d] of users) {
      let sat = 0;
      for (const [s, wgt] of cand) sat += wgt * Math.min(1, s.cap / Math.max(1e-6, s.D));
      b.park = sat;
      served += d * sat;
    }
    let supply = 0;
    for (const f of fac) { f.b.occ = Math.min(1, f.D / f.cap); f.b.parkDemand = f.D; supply += f.cap; }
    for (const s of street.values()) supply += s.cap;
    this.stats = { demand, supply, served, short: Math.max(0, demand - served) };
  }
}
