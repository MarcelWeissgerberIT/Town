import { GROW, SERVICES, STAGES, ZONE, ZONE_KEYS, COSTS, UPKEEP, DAY_SECONDS } from './config.js';
import { mulberry32, randInt, clamp, DIRS, pick, LAST_NAMES } from './util.js';

// City simulation: demand, growth, construction progress, services, money.
export class Sim {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.money = 30000;
    this.day = 1;
    this.hour = 9.0;
    this.speed = 1;
    this.stage = 0;
    this.pop = 0; this.jobsC = 0; this.jobsI = 0; this.jobsS = 0;
    this.demand = { res: 0.6, com: 0.4, ind: 0.3 };
    this.happiness = 60;
    this.income = 0; this.expense = 0;
    this.lastDayIncome = 0; this.lastDayExpense = 0;
    this.lv = new Float32Array(this.world.N * this.world.N);
    this.cover = { fire: new Uint8Array(this.world.N ** 2), police: new Uint8Array(this.world.N ** 2), health: new Uint8Array(this.world.N ** 2), edu: new Uint8Array(this.world.N ** 2) };
    this.growTimer = 0; this.lvTimer = 0;
    this.rng = mulberry32(99);
    this.history = [];
    this.recount();
    this.computeLandValue();
  }

  get stageInfo() { return STAGES[this.stage]; }

  recount() {
    let pop = 0, jc = 0, ji = 0, js = 0, roads = 0, upkeep = 0;
    for (const b of this.world.buildings.values()) {
      if (b.state !== 'done') continue;
      if (b.kind === 'res') pop += b.pop;
      else if (b.kind === 'com') jc += b.jobs;
      else if (b.kind === 'ind') ji += b.jobs;
      else { js += b.jobs || 0; upkeep += SERVICES[b.type]?.upkeep || 0; }
    }
    for (let i = 0; i < this.world.road.length; i++) roads += this.world.road[i];
    let stops = 0; for (let i = 0; i < this.world.busstop.length; i++) if (this.world.busstop[i]) stops++;
    this.pop = pop; this.jobsC = jc; this.jobsI = ji; this.jobsS = js;
    this.roads = roads; this.busStops = stops;
    this.upkeepPerDay = upkeep + roads * UPKEEP.road + stops * UPKEEP.busstop;
    this.incomePerDay = pop * 1.6 + jc * 2.2 + ji * 1.9;
  }

  // service coverage + land value per tile
  computeLandValue() {
    const w = this.world, N = w.N;
    for (const k in this.cover) this.cover[k].fill(0);
    const lv = this.lv;
    lv.fill(22);
    const bump = (b, r, val, coverKey) => {
      const cx = b.x + b.w / 2, cz = b.z + b.h / 2;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
      const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(N - 1, Math.ceil(cz + r));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > r) continue;
        const k = z * N + x;
        if (val) lv[k] += val * (1 - d / r * 0.6);
        if (coverKey) this.cover[coverKey][k] = 1;
      }
    };
    let happy = 55;
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      const S = SERVICES[b.type];
      if (S) {
        bump(b, S.radius || 4, S.lv || (S.cover ? 9 : 0), S.cover);
        if (b.type === 'stadium' || b.type === 'tvtower') happy += S.happy;
      } else if (b.kind === 'com') bump(b, 3, 2 + b.level, null);
      else if (b.kind === 'ind') bump(b, 4, -9 - b.level * 3, null);
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const k = z * N + x;
      if (w.terrain[k] === 1) { for (const d of DIRS) { const nx = x + d.dx, nz = z + d.dz; if (w.inb(nx, nz)) lv[nz * N + nx] += 3; } }
      if (w.trees[k]) lv[k] += 2;
    }
    // centre of town is valuable
    if (w.centre) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - w.centre[0], z - w.centre[1]);
      lv[z * N + x] += Math.max(0, 14 - d * 0.6) + Math.min(22, this.pop / 700);
    }
    for (let i = 0; i < lv.length; i++) lv[i] = clamp(lv[i], 0, 100);
    // happiness from coverage of homes
    let homes = 0, covered = 0;
    for (const b of w.buildings.values()) {
      if (b.kind !== 'res' || b.state !== 'done') continue;
      const k = b.z * N + b.x;
      homes += b.pop;
      covered += b.pop * ((this.cover.fire[k] + this.cover.police[k] + this.cover.health[k] + this.cover.edu[k]) / 4);
    }
    if (homes > 0) happy += (covered / homes) * 25 - (this.stage >= 1 ? 10 : 0);
    this.happiness = clamp(happy, 10, 100);
  }

  needsMet(L, k) {
    for (const n of L.need) if (!this.cover[n][k]) return false;
    return true;
  }

  computeDemand() {
    const pop = this.pop, jobs = this.jobsC + this.jobsI + this.jobsS;
    const workers = pop * 0.52;
    const res = (jobs * 1.15 + 60 - workers) / Math.max(60, workers * 0.35);
    const com = (pop * 0.2 + 12 - this.jobsC) / Math.max(18, pop * 0.08);
    const ind = (pop * 0.26 + 14 - this.jobsI) / Math.max(18, pop * 0.1);
    const h = (this.happiness - 50) / 100;
    this.demand.res = clamp(res + h, -1, 1);
    this.demand.com = clamp(com, -1, 1);
    this.demand.ind = clamp(ind, -1, 1);
  }

  activeSites() {
    let n = 0;
    for (const b of this.world.buildings.values()) if (b.state === 'build') n++;
    return n;
  }

  maxSites() { return Math.min(26, 4 + Math.floor(this.pop / 160)); }

  // try to grow or upgrade buildings on zoned land
  grow() {
    const w = this.world, N = w.N, rng = this.rng;
    if (this.activeSites() >= this.maxSites()) return;
    for (let tries = 0; tries < 40; tries++) {
      const x = Math.floor(rng() * N), z = Math.floor(rng() * N);
      const k = z * N + x;
      const zn = w.zone[k];
      if (!zn) continue;
      const kind = ZONE_KEYS[zn];
      const dem = this.demand[kind];
      if (dem <= 0.02 || rng() > dem + 0.15) continue;
      const b = w.buildingAt(x, z);
      if (!b) {
        const d = w.facingFor(x, z, 1, 1, Math.floor(rng() * 4));
        if (d < 0) continue;
        // pick the highest level allowed right away on valuable land (keeps growth lively later on)
        let lvl = 1;
        for (let L = 2; L <= 3; L++) {
          const G = GROW[kind][L];
          if (G && G.size === 1 && this.stage >= G.stage && this.lv[k] >= G.lv + 8 && this.needsMet(G, k) && rng() < 0.45) lvl = L;
        }
        this.startConstruction(kind + lvl, x, z, 1, 1, d);
        return;
      }
      if (b.state !== 'done' || b.kind !== kind) continue;
      const next = GROW[kind][b.level + 1];
      if (!next || this.stage < next.stage || this.lv[k] < next.lv || !this.needsMet(next, k)) continue;
      if (dem < 0.15 || rng() > 0.35) continue;
      if (next.size === 2) {
        const spot = this.find2x2(b, kind);
        if (!spot) continue;
        for (const ob of spot.olds) this.demolish(ob, true);
        this.startConstruction(kind + (b.level + 1), spot.x, spot.z, 2, 2, spot.d);
      } else {
        this.demolish(b, true);
        this.startConstruction(kind + (b.level + 1), b.x, b.z, 1, 1, b.rot);
      }
      return;
    }
  }

  find2x2(b, kind) {
    const w = this.world;
    const zn = ZONE[kind.toUpperCase()];
    for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const x = b.x + ox, z = b.z + oz;
      let ok = true; const olds = new Set();
      for (let j = 0; j < 2 && ok; j++) for (let i = 0; i < 2 && ok; i++) {
        const tx = x + i, tz = z + j;
        if (!w.inb(tx, tz)) { ok = false; break; }
        const k = w.idx(tx, tz);
        if (w.zone[k] !== zn || w.road[k] || w.terrain[k]) { ok = false; break; }
        const ob = w.buildingAt(tx, tz);
        if (ob) {
          if (ob.state !== 'done' || ob.kind !== kind || ob.level < GROW[kind].length - 2 || ob.w > 1) ok = false;
          else olds.add(ob);
        }
      }
      if (!ok) continue;
      const d = w.facingFor(x, z, 2, 2);
      if (d < 0) continue;
      return { x, z, d, olds: [...olds] };
    }
    return null;
  }

  startConstruction(type, x, z, w, h, rot) {
    const b = this.game.makeBuilding(type, x, z, w, h, rot);
    const L = GROW[b.kind]?.[b.level];
    b.state = 'build'; b.progress = 0;
    b.buildTime = L ? L.time : (SERVICES[type] ? 40 + (w * h) * 12 : 40);
    this.world.addBuilding(b);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = this.world.idx(x + i, z + j);
      if (b.kind !== 'svc') this.world.zone[k] = ZONE[b.kind.toUpperCase()];
      else this.world.zone[k] = 0;
    }
    this.game.realize(b);
    this.game.emit('construction', b);
    return b;
  }

  finishConstruction(b) {
    b.state = 'done'; b.progress = 1;
    const L = GROW[b.kind]?.[b.level];
    const rng = mulberry32(b.seed + 3);
    if (b.kind === 'res') b.pop = randInt(rng, L.pop[0], L.pop[1]);
    else if (L) b.jobs = randInt(rng, L.jobs[0], L.jobs[1]);
    else b.jobs = 8 + b.w * b.h * 6;
    b.born = this.day;
    this.game.realize(b);
    this.recount();
    this.game.emit('built', b);
  }

  demolish(b, silent = false) {
    this.world.removeBuilding(b);
    this.game.chunks.setBuildingGeo(b, null);
    this.game.treesDirty = true;
    this.game.emit('removed', b, silent);
    this.recount();
  }

  checkStage() {
    while (this.stage < STAGES.length - 1 && this.pop >= STAGES[this.stage + 1].pop) {
      this.stage++;
      this.game.emit('stage', this.stage);
    }
  }

  canAfford(c) { return this.money >= c; }
  spend(c) { this.money -= c; this.expense += c; }

  // advances simulation by real seconds dt (already multiplied by speed)
  tick(dt) {
    if (dt <= 0) return;
    const dayFrac = dt / DAY_SECONDS;
    this.hour += dayFrac * 24;
    if (this.hour >= 24) {
      this.hour -= 24; this.day++;
      const inc = this.incomePerDay, exp = this.upkeepPerDay;
      this.lastDayIncome = inc; this.lastDayExpense = exp;
      this.history.push({ day: this.day, pop: this.pop, money: this.money });
      if (this.history.length > 120) this.history.shift();
      this.game.emit('day', this.day, inc, exp);
    }
    // taxes and upkeep flow continuously so the balance moves visibly
    this.money += (this.incomePerDay - this.upkeepPerDay) * dayFrac;
    for (const b of this.world.buildings.values()) {
      if (b.state !== 'build') continue;
      const before = b.progress;
      b.progress = Math.min(1, b.progress + dt / b.buildTime);
      this.game.emit('progress', b, before);
      if (b.progress >= 1) this.finishConstruction(b);
    }
    this.growTimer -= dt;
    if (this.growTimer <= 0) {
      this.growTimer = 0.55;
      this.computeDemand();
      this.grow();
      this.checkStage();
    }
    this.lvTimer -= dt;
    if (this.lvTimer <= 0) { this.lvTimer = 6; this.computeLandValue(); }
  }

  // ---- player actions ----------------------------------------------------
  buildRoad(path) {
    const w = this.world;
    let cost = 0; const tiles = [];
    for (const [x, z] of path) {
      if (!w.inb(x, z) || w.isRoad(x, z) || w.buildingAt(x, z)) continue;
      cost += w.isWater(x, z) ? COSTS.bridge : COSTS.road;
      tiles.push([x, z]);
    }
    if (!tiles.length) return { ok: false, msg: 'Hier kann keine Straße gebaut werden.' };
    if (!this.canAfford(cost)) return { ok: false, msg: 'Nicht genug Geld.' };
    this.spend(cost);
    for (const [x, z] of tiles) w.setRoad(x, z, true);
    this.edgeCheck(tiles);
    this.recount();
    this.game.emit('roads');
    return { ok: true, cost, n: tiles.length };
  }
  edgeCheck(tiles) {
    const N = this.world.N;
    if (tiles.some(([x, z]) => x === 0 || z === 0 || x === N - 1 || z === N - 1)) this.game.countryDirty = true;
  }
  zoneRect(x0, z0, x1, z1, zn) {
    const w = this.world; let n = 0;
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (!w.inb(x, z)) continue;
      const k = w.idx(x, z);
      if (w.terrain[k] || w.road[k] || w.bld[k] >= 0) continue;
      if (w.zone[k] === zn) continue;
      w.zone[k] = zn; w.trees[k] = 0; w.markDirty(x, z); n++;
    }
    if (n) this.game.treesDirty = true;
    return n;
  }
  bulldozeRect(x0, z0, x1, z1) {
    const w = this.world; let n = 0, cost = 0;
    const seen = new Set();
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (!w.inb(x, z)) continue;
      const k = w.idx(x, z);
      const b = w.buildingAt(x, z);
      if (b && !seen.has(b.id)) { seen.add(b.id); this.demolish(b); n++; cost += COSTS.bulldoze * b.w * b.h; }
      if (w.road[k]) { w.setRoad(x, z, false); n++; cost += COSTS.bulldoze; this.edgeCheck([[x, z]]); }
      if (w.zone[k]) { w.zone[k] = 0; w.markDirty(x, z); n++; }
      if (w.trees[k]) { w.trees[k] = 0; this.game.treesDirty = true; n++; }
    }
    if (n) { this.spend(cost); this.recount(); this.game.emit('roads'); }
    return n;
  }
  placeService(type, x, z, rot) {
    const S = SERVICES[type];
    const w = this.world;
    if (this.stage < S.stage) return { ok: false, msg: `Freigeschaltet ab ${STAGES[S.stage].name}.` };
    if (S.unique) for (const b of w.buildings.values()) if (b.type === type) return { ok: false, msg: `${S.name} gibt es schon.` };
    const ww = (rot % 2) ? S.h : S.w, hh = (rot % 2) ? S.w : S.h;
    if (!w.canPlace(x, z, ww, hh)) return { ok: false, msg: 'Der Platz ist belegt.' };
    if (w.frontRoad(x, z, ww, hh, rot).length === 0) return { ok: false, msg: 'Braucht eine Straße an der Vorderseite.' };
    if (!this.canAfford(S.cost)) return { ok: false, msg: 'Nicht genug Geld.' };
    this.spend(S.cost);
    const b = this.startConstruction(type, x, z, ww, hh, rot);
    return { ok: true, b };
  }
  plantTree(x, z) {
    const w = this.world;
    if (!w.inb(x, z)) return false;
    const k = w.idx(x, z);
    if (w.terrain[k] || w.road[k] || w.bld[k] >= 0 || w.trees[k] >= 3) return false;
    if (!this.canAfford(COSTS.tree)) return false;
    this.spend(COSTS.tree);
    w.trees[k]++;
    this.game.treesDirty = true;
    return true;
  }
  toggleBusStop(x, z) {
    const w = this.world;
    if (!w.isRoad(x, z) || w.isWater(x, z)) return { ok: false, msg: 'Haltestellen gehören an eine Straße.' };
    const k = w.idx(x, z);
    if (w.busstop[k]) { w.busstop[k] = 0; w.markDirty(x, z); this.recount(); this.game.emit('roads'); return { ok: true, removed: true }; }
    const m = w.roadMask(x, z);
    if (m !== 5 && m !== 10) return { ok: false, msg: 'Nur an geraden Straßenstücken.' };
    if (!this.canAfford(COSTS.busstop)) return { ok: false, msg: 'Nicht genug Geld.' };
    this.spend(COSTS.busstop);
    // put the shelter on the side with more buildings
    const sides = m === 5 ? [1, 3] : [0, 2];
    let side = sides[0];
    const d1 = DIRS[sides[1]];
    if (w.buildingAt(x + d1.dx, z + d1.dz)) side = sides[1];
    w.busstop[k] = side + 1;
    w.markDirty(x, z);
    this.recount();
    this.game.emit('roads');
    return { ok: true };
  }
  randomCitizenName() { return `${pick(this.rng, LAST_NAMES)}`; }
}
