import { GROW, SERVICES, STAGES, ZONE, ZONE_KEYS, COSTS, UPKEEP, DAY_SECONDS, NEEDS, TAX_DEFAULT, DIFFICULTY } from './config.js';
import { mulberry32, randInt, clamp, DIRS, pick, LAST_NAMES } from './util.js';
import { Utilities } from './utilities.js';
import { Pollution } from './pollution.js';
import { Waste, garbageDays } from './waste.js';
import { Safety } from './safety.js';

const LOAN = { amount: 25000, total: 1.12, days: 90, max: 3 };

// City simulation: supplies, environment, mood, demand, growth, money.
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
    this.unemployment = 0;
    this.tax = { res: TAX_DEFAULT, com: TAX_DEFAULT, ind: TAX_DEFAULT };
    this.loans = [];
    this.setDifficulty('normal');
    this.flows = {};
    this.ledger = { today: {}, yesterday: {} };
    this.incomePerDay = 0; this.upkeepPerDay = 0;
    this.lastDayIncome = 0; this.lastDayExpense = 0;
    const n = this.world.N * this.world.N;
    this.lv = new Float32Array(n);
    this.green = new Float32Array(n);
    this.cover = { fire: new Uint8Array(n), police: new Uint8Array(n), health: new Uint8Array(n), edu: new Uint8Array(n) };
    this.growTimer = 0; this.lvTimer = 0;
    this.acc = { util: 1, waste: 0, safety: 0, pol: 0, mood: 0 };
    this.rng = mulberry32(99);
    this.history = [];
    this.grace = null;
    this.util = new Utilities(this);
    this.pollution = new Pollution(this);
    this.waste = new Waste(this);
    this.safety = new Safety(this);
    this.recount();
    this.computeLandValue();
  }

  get stageInfo() { return STAGES[this.stage]; }

  // fresh simulation systems (new town or loading another one)
  resetSystems() {
    this.util = new Utilities(this);
    this.pollution = new Pollution(this);
    this.waste = new Waste(this);
    this.safety = new Safety(this);
    this.acc = { util: 1, waste: 0, safety: 0, pol: 0, mood: 0 };
    this.ledger = { today: {}, yesterday: {} };
    this.blocked = { power: 0, water: 0 };
  }
  // a town saved before power and water existed: the district keeps supplying it
  // for a few weeks, so the player has time to build plants
  migrate() {
    const st = this.util.stats;
    if (!st) return;
    const days = 24;
    this.grace = {
      until: this.day + days, days,
      power: Math.max(0, st.power.demand * 1.5 - 2),
      water: Math.max(0, st.water.demand * 1.4 - 180),
      sewage: Math.max(0, st.water.demand * 1.3 - 180),
    };
    this.util.solve(0.001);
  }
  setDifficulty(k) { this.diffKey = DIFFICULTY[k] ? k : 'normal'; this.diff = DIFFICULTY[this.diffKey]; }

  // one-off income (+) or cost (−), recorded per category for the budget
  book(key, amount) {
    this.money += amount;
    this.ledger.today[key] = (this.ledger.today[key] || 0) + amount;
  }

  // transition supply after an update, plus deals with neighbouring towns
  // 0..1: how much the district still helps a migrated town
  graceLeft() {
    const g = this.grace;
    if (!g || this.day >= g.until) return 0;
    return clamp((g.until - this.day - this.hour / 24) / (g.days / 2), 0, 1);
  }
  extraSupply() {
    const out = { power: 0, water: 0, sewage: 0, hv: 0 };
    const g = this.grace;
    if (g && this.day < g.until) {
      // full help for the first half, then it fades out
      const f = clamp((g.until - this.day - this.hour / 24) / (g.days / 2), 0, 1);
      out.power += g.power * f; out.water += g.water * f; out.sewage += g.sewage * f;
    }
    const c = this.contracts?.() || null;
    if (c) { out.hv += c.power || 0; out.waterContract = c.water || 0; }
    return out;
  }

  recount() {
    let pop = 0, jc = 0, ji = 0, js = 0, roads = 0, lines = 0, upkeep = 0;
    let taxRes = 0, taxCom = 0, taxInd = 0;
    const lv = this.lv, N = this.world.N, inc = this.diff.income;
    for (const b of this.world.buildings.values()) {
      if (b.state !== 'done') continue;
      if (b.kind === 'res') {
        pop += b.pop;
        taxRes += b.pop * 0.16 * this.tax.res * (0.75 + (lv[b.z * N + b.x] || 50) / 200);
      } else if (b.kind === 'com') { jc += b.jobs; taxCom += b.jobs * 0.22 * this.tax.com * (b.pw === 0 ? 0.3 : 1); }
      else if (b.kind === 'ind') { ji += b.jobs; taxInd += b.jobs * 0.19 * this.tax.ind * (b.pw === 0 ? 0.3 : 1); }
      else { js += b.jobs || 0; upkeep += SERVICES[b.type]?.upkeep || 0; }
    }
    const w = this.world;
    for (let i = 0; i < w.road.length; i++) { roads += w.road[i]; lines += w.pline[i]; }
    let stops = 0; for (let i = 0; i < w.busstop.length; i++) if (w.busstop[i]) stops++;
    this.pop = pop; this.jobsC = jc; this.jobsI = ji; this.jobsS = js;
    this.roads = roads; this.lines = lines; this.busStops = stops;
    const workers = pop * 0.52, jobs = jc + ji + js;
    this.unemployment = workers > 20 ? clamp((workers - jobs) / workers, 0, 1) : 0;
    const uc = this.util.stats?.costs || { power: 0, powerSold: 0, water: 0, sewage: 0 };
    const loanRate = this.loans.reduce((s, l) => s + l.perDay, 0);
    const up = this.diff.upkeep;
    this.flows = {
      taxRes: taxRes * inc, taxCom: taxCom * inc, taxInd: taxInd * inc, powerSold: uc.powerSold,
      services: -upkeep * up, admin: -Math.max(0, pop - 150) * 0.22 * up, roads: -(roads * UPKEEP.road + lines * UPKEEP.line + stops * UPKEEP.busstop) * up,
      powerImp: -uc.power, waterImp: -uc.water, sewageImp: -uc.sewage, loans: -loanRate,
      contracts: this.contractMoney?.() || 0,
    };
    let i = 0, e = 0;
    for (const k in this.flows) { const v = this.flows[k]; if (v >= 0) i += v; else e -= v; }
    this.incomePerDay = i; this.upkeepPerDay = e;
  }

  // service coverage, greenery + land value per tile
  computeLandValue() {
    const w = this.world, N = w.N;
    for (const k in this.cover) this.cover[k].fill(0);
    const lv = this.lv, green = this.green;
    lv.fill(22); green.fill(0);
    const bump = (b, r, val, coverKey, g) => {
      const cx = b.x + b.w / 2, cz = b.z + b.h / 2;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
      const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(N - 1, Math.ceil(cz + r));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > r) continue;
        const k = z * N + x;
        if (val) lv[k] += val * (1 - d / r * 0.6);
        if (coverKey) this.cover[coverKey][k] = 1;
        if (g) green[k] += g * (1 - d / (r + 1));
      }
    };
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      const S = SERVICES[b.type];
      if (S) {
        const working = b.pw !== 0 || !(S.use > 0);
        bump(b, S.radius || 4, S.lv || (S.cover ? 9 : 0), working ? S.cover : null, S.green);
      } else if (b.kind === 'com') bump(b, 3, 2 + b.level, null);
      else if (b.kind === 'ind') bump(b, 4, -9 - b.level * 3, null);
    }
    const pol = this.pollution;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const k = z * N + x;
      if (w.terrain[k] === 1) { for (const d of DIRS) { const nx = x + d.dx, nz = z + d.dz; if (w.inb(nx, nz)) lv[nz * N + nx] += 3; } }
      if (w.trees[k]) { lv[k] += 2; green[k] += w.trees[k] * 0.6; }
      if (w.pline[k]) lv[k] -= 6;
      lv[k] -= pol.air[k] / 5 + pol.noise[k] / 7 + pol.ground[k] / 5;
      // dirty water along the bank
      if (w.terrain[k] === 1 && pol.water[k] > 20) for (const d of DIRS) { const nx = x + d.dx, nz = z + d.dz; if (w.inb(nx, nz)) lv[nz * N + nx] -= pol.water[k] / 12; }
    }
    if (w.centre) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - w.centre[0], z - w.centre[1]);
      lv[z * N + x] += Math.max(0, 14 - d * 0.6) + Math.min(22, this.pop / 700);
    }
    for (let i = 0; i < lv.length; i++) lv[i] = clamp(lv[i], 0, 100);
  }

  // ------------------------------------------------------------ mood
  // how happy the people in (or the firm running) a building are, with reasons
  moodOf(b) {
    const N = this.world.N, k = b.z * N + b.x, pol = this.pollution;
    const parts = [];
    const add = (label, v) => { if (Math.abs(v) >= 0.5) parts.push([label, Math.round(v)]); };
    let m = 55;
    const t = this.tax[b.kind] ?? TAX_DEFAULT;
    if (b.kind === 'res') {
      add('Kein Strom', b.pw === 0 ? -30 : 0);
      add('Kein Wasser', b.wt === 0 ? -30 : 0);
      const q = b.rc >= 0 ? this.util.quality?.[b.rc] ?? 1 : 1;
      if (b.wt !== 0) add('Schlechtes Trinkwasser', q < 0.85 ? -(0.85 - q) * 45 : 0);
      const gd = garbageDays(b);
      add('Müll vor der Tür', gd > 2 ? -Math.min(20, (gd - 2) * 5) : 0);
      // the bigger the town and the house, the more people expect services nearby
      const ex = (this.stage >= 1 ? 0.5 : 0) + (this.stage >= 2 ? 0.25 : 0) + (b.level >= 2 ? 0.25 : 0);
      add('Feuerwehr in der Nähe', this.cover.fire[k] ? 4 : -4);
      add('Ärzte in der Nähe', this.cover.health[k] ? 5 : -6 * ex);
      add('Polizei in der Nähe', this.cover.police[k] ? 4 : -5 * ex);
      add('Schule in der Nähe', this.cover.edu[k] ? 5 : -6 * ex);
      add('Parks und Grün', Math.min(8, this.green[k] * 2));
      const air = pol.at(pol.air, b), noise = pol.at(pol.noise, b), ground = pol.at(pol.ground, b);
      add('Schlechte Luft', -clamp((air - 22) / 3, 0, 20));
      add('Lärm', -clamp((noise - 32) / 3, 0, 12));
      add('Verschmutzter Boden', -clamp((ground - 25) / 4, 0, 10));
      add('Einbruch in der Nachbarschaft', b.crimeDay && this.day + this.hour / 24 - b.crimeDay < 2 ? -8 : 0);
      add('Rettungswagen kam nicht', b.careFail && this.day - b.careFail < 3 ? -12 : 0);
      add('Kranke im Haus', b.sick && b.pop && b.sick / b.pop > 0.08 ? -5 : 0);
      add('Steuern', -(t - TAX_DEFAULT) * 2.5);
      add('Arbeitslosigkeit', -Math.min(15, this.unemployment * 45));
      add('Bodenwert', clamp((this.lv[k] - 40) / 10, -4, 4));
      let lm = 0;
      for (const o of this.world.buildings.values()) if ((o.type === 'stadium' || o.type === 'tvtower') && o.state === 'done') lm += o.type === 'stadium' ? 5 : 4;
      add('Stadion & Wahrzeichen', lm);
    } else {
      const ind = b.kind === 'ind';
      add('Kein Strom', b.pw === 0 ? (ind ? -45 : -40) : 0);
      add('Kein Wasser', b.wt === 0 ? (ind ? -25 : -20) : 0);
      const gd = garbageDays(b);
      add('Müll vor der Tür', gd > 2 ? -Math.min(16, (gd - 2) * 4) : 0);
      add('Einbrüche', b.crimeDay && this.day + this.hour / 24 - b.crimeDay < 2 ? -8 : 0);
      add('Steuern', -(t - TAX_DEFAULT) * 2.5);
      add('Kaum Arbeitskräfte', this.unemployment < 0.02 && this.pop > 200 ? -6 : 0);
      if (!ind) {
        add('Zu wenig Kundschaft', this.demand.com < -0.35 ? -10 : 0);
        add('Laufkundschaft', Math.min(6, this.lv[k] / 12));
      } else {
        add('Anschluss ans Umland', b.rc >= 0 && this.util.rcs[b.rc]?.edge ? 4 : -12);
        add('Gut ausgebildete Leute', this.stage >= 2 ? (this.cover.edu[k] ? 4 : -4) : 0);
      }
      add('Feuerwehr in der Nähe', this.cover.fire[k] ? 3 : -3);
    }
    add('Stadtkasse leer', this.money < 0 ? -5 : 0);
    for (const [, v] of parts) m += v;
    return { mood: clamp(m, 0, 100), parts: parts.sort((a, c) => a[1] - c[1]) };
  }

  // mood of every building; people move out of unhappy places and come back when it improves
  updateMood(dtH) {
    let wsum = 0, msum = 0;
    for (const b of this.world.buildings.values()) {
      if (b.state !== 'done' || b.kind === 'svc') continue;
      const L = GROW[b.kind]?.[b.level];
      const { mood, parts } = this.moodOf(b);
      b.mood = mood; b.moodParts = parts;
      const cap = b.kind === 'res' ? (b.popMax ??= b.pop) : (b.jobsMax ??= b.jobs);
      if (!L) continue;
      if (b.abandoned) {
        b.back = mood > 48 ? (b.back || 0) + dtH : 0;
        if (b.back > 24) this.setAbandoned(b, false);
        continue;
      }
      // shrink or grow towards the capacity of the building
      const key = b.kind === 'res' ? 'pop' : 'jobs';
      if (mood < 30 && this.rng() < 0.12 * dtH) b[key] = Math.max(1, b[key] - Math.max(1, Math.round(cap * 0.04)));
      else if (mood > 50 && b[key] < cap && this.rng() < 0.3 * dtH) b[key] = Math.min(cap, b[key] + Math.max(1, Math.round(cap * 0.05)));
      b.leave = mood < 22 ? (b.leave || 0) + dtH : Math.max(0, (b.leave || 0) - dtH * 0.5);
      if (b.leave > 72) this.setAbandoned(b, true);
      if (b.kind === 'res') { wsum += b.pop; msum += b.pop * mood; }
    }
    this.happiness = wsum > 0 ? msum / wsum : 60;
    this.recount();
  }
  setAbandoned(b, on) {
    if (!!b.abandoned === on) return;
    b.abandoned = on; b.leave = 0; b.back = 0;
    if (on) {
      if (b.kind === 'res') { b.pop = 0; this.game.emit('notice', { text: `Die Leute aus ${b.name} sind weggezogen. Das Haus steht leer.`, icon: 'i-home', color: 'var(--bad)', b }); }
      else { b.jobs = 0; this.game.emit('notice', { text: `${b.name} hat geschlossen.`, icon: b.kind === 'com' ? 'i-shop' : 'i-factory', color: 'var(--bad)', b }); }
    } else {
      const L = GROW[b.kind][b.level];
      if (b.kind === 'res') b.pop = Math.max(1, Math.round((b.popMax || L.pop[0]) * 0.5));
      else b.jobs = Math.max(1, Math.round((b.jobsMax || L.jobs[0]) * 0.5));
      this.game.emit('notice', { text: `${b.name} ist wieder bezogen.`, icon: 'i-home', color: 'var(--good)', b });
    }
    this.game.realize(b);
    this.recount();
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
    this.demand.res = clamp(res + h - (this.tax.res - TAX_DEFAULT) * 0.05, -1, 1);
    this.demand.com = clamp(com - (this.tax.com - TAX_DEFAULT) * 0.05, -1, 1);
    this.demand.ind = clamp(ind - (this.tax.ind - TAX_DEFAULT) * 0.05, -1, 1);
  }

  activeSites() {
    let n = 0;
    for (const b of this.world.buildings.values()) if (b.state === 'build') n++;
    return n;
  }

  maxSites() { return Math.min(26, 4 + Math.floor(this.pop / 160)); }

  // can the networks in front of a lot carry a building of this level?
  supplied(kind, L, x, z, w = 1, h = 1) {
    const world = this.world;
    let rc = -1;
    for (let d = 0; d < 4 && rc < 0; d++) { const t = world.frontRoad(x, z, w, h, d); if (t.length) rc = this.util.rcomp[world.idx(t[0][0], t[0][1])]; }
    const n = L.pop ? L.pop[1] : L.jobs[1];
    const need = NEEDS[kind];
    return this.util.canSupply(rc, n * need.power * 1.3, n * need.water * 1.3);
  }

  // try to grow or upgrade buildings on zoned land
  grow() {
    const w = this.world, N = w.N, rng = this.rng;
    if (this.activeSites() >= this.maxSites()) return;
    this.blocked = this.blocked || { power: 0, water: 0 };
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
        if (!this.supplied(kind, GROW[kind][1], x, z)) { this.noteBlocked(x, z); continue; }
        if (kind === 'res' && this.pollution.air[k] > 70) continue;
        // pick the highest level allowed right away on valuable land (keeps growth lively later on)
        let lvl = 1;
        for (let L = 2; L <= 3; L++) {
          const G = GROW[kind][L];
          if (G && G.size === 1 && this.stage >= G.stage && this.lv[k] >= G.lv + 8 && this.needsMet(G, k) && rng() < 0.45 && this.supplied(kind, G, x, z)) lvl = L;
        }
        this.startConstruction(kind + lvl, x, z, 1, 1, d);
        return;
      }
      if (b.state !== 'done' || b.kind !== kind || b.abandoned) continue;
      const next = GROW[kind][b.level + 1];
      if (!next || this.stage < next.stage || this.lv[k] < next.lv || !this.needsMet(next, k)) continue;
      if (dem < 0.15 || rng() > 0.35) continue;
      if ((b.mood ?? 60) < 55) continue;
      if (!this.supplied(kind, next, b.x, b.z, b.w, b.h)) { this.noteBlocked(x, z); continue; }
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
  // remember why lots stay empty (for the advisor)
  noteBlocked(x, z) {
    const w = this.world;
    let rc = -1;
    for (let d = 0; d < 4 && rc < 0; d++) { const t = w.frontRoad(x, z, 1, 1, d); if (t.length) rc = this.util.rcomp[w.idx(t[0][0], t[0][1])]; }
    if (rc < 0) return;
    if ((this.util.headP[rc] ?? 0) < 0.01) this.blocked.power = this.day + this.hour / 24;
    if ((this.util.headW[rc] ?? 0) < 1) this.blocked.water = this.day + this.hour / 24;
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
        if (w.zone[k] !== zn || w.road[k] || w.terrain[k] || w.pline[k]) { ok = false; break; }
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
    if (b.kind === 'res') b.pop = b.popMax = randInt(rng, L.pop[0], L.pop[1]);
    else if (L) b.jobs = b.jobsMax = randInt(rng, L.jobs[0], L.jobs[1]);
    else b.jobs = 8 + b.w * b.h * 6;
    b.born = this.day;
    b.pw = 1; b.wt = 1;
    this.game.realize(b);
    this.acc.util = 1;
    this.recount();
    this.game.emit('built', b);
  }

  demolish(b, silent = false) {
    this.world.removeBuilding(b);
    this.game.chunks.setBuildingGeo(b, null);
    this.game.treesDirty = true;
    this.game.emit('removed', b, silent);
    this.acc.util = 1;
    this.recount();
  }

  checkStage() {
    while (this.stage < STAGES.length - 1 && this.pop >= STAGES[this.stage + 1].pop) {
      this.stage++;
      this.game.emit('stage', this.stage);
    }
  }

  canAfford(c) { return this.money >= c; }
  spend(c, key = 'build') { this.book(key, -c); }

  takeLoan() {
    if (this.loans.length >= LOAN.max) return false;
    const total = LOAN.amount * LOAN.total;
    this.loans.push({ left: total, perDay: total / LOAN.days });
    this.book('loan', LOAN.amount);
    this.recount();
    return true;
  }
  repayLoan() {
    const l = this.loans[0];
    if (!l || this.money < l.left) return false;
    this.book('loan', -l.left);
    this.loans.shift();
    this.recount();
    return true;
  }
  get loanInfo() { return LOAN; }

  // advances simulation by real seconds dt (already multiplied by speed)
  tick(dt) {
    if (dt <= 0) return;
    const dayFrac = dt / DAY_SECONDS, dtH = dayFrac * 24;
    this.hour += dtH;
    if (this.hour >= 24) {
      this.hour -= 24; this.day++;
      this.newDay();
    }
    // taxes and upkeep flow continuously so the balance moves visibly
    this.money += (this.incomePerDay - this.upkeepPerDay) * dayFrac;
    for (const l of this.loans) l.left -= l.perDay * dayFrac;
    if (this.loans.some((l) => l.left <= 0)) { this.loans = this.loans.filter((l) => l.left > 0); this.recount(); }
    for (const b of this.world.buildings.values()) {
      if (b.state !== 'build') continue;
      const before = b.progress;
      b.progress = Math.min(1, b.progress + dt / b.buildTime);
      this.game.emit('progress', b, before);
      if (b.progress >= 1) this.finishConstruction(b);
    }
    // systems at their own pace (in-game hours)
    const a = this.acc;
    a.util += dtH; a.waste += dtH; a.safety += dtH; a.pol += dtH; a.mood += dtH;
    if (a.util >= 0.1 || this.util.key !== `${this.world.version}|${this.world.lineVersion}|${this.world.bver}`) {
      this.util.solve(Math.min(a.util, 1) / 24); a.util = 0;
      // lights go out where the power is gone
      for (const b of this.world.buildings.values()) {
        if (b.state !== 'done') continue;
        const key = (b.pw === 0 ? 1 : 0) + (b.abandoned ? 2 : 0);
        if ((b.shown ?? 0) !== key) this.game.chunks.buildingDirty(b);
      }
    }
    if (a.waste >= 0.25) { this.waste.hour(a.waste); a.waste = 0; }
    if (a.safety >= 0.5) { this.safety.hour(a.safety); a.safety = 0; }
    if (a.pol >= 1) { this.pollution.update(Math.min(a.pol, 6)); a.pol = 0; }
    if (a.mood >= 0.5) { this.updateMood(Math.min(a.mood, 6)); a.mood = 0; }
    this.waste.tick(dt);
    this.safety.tick(dt);
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

  newDay() {
    this.recount();
    const inc = this.incomePerDay, exp = this.upkeepPerDay;
    this.lastDayIncome = inc; this.lastDayExpense = exp;
    this.ledger.yesterday = this.ledger.today; this.ledger.today = {};
    this.safety.newDay();
    this.history.push({ day: this.day, pop: this.pop, money: this.money, happy: Math.round(this.happiness) });
    if (this.history.length > 120) this.history.shift();
    this.game.emit('day', this.day, inc, exp);
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
  // high-voltage line: over meadows, streets and water, not through buildings
  lineCost(path) {
    const w = this.world;
    let cost = 0, n = 0;
    for (const [x, z] of path) {
      if (!w.inb(x, z) || w.pline[w.idx(x, z)] || w.buildingAt(x, z)) continue;
      cost += COSTS.line; n++;
    }
    return { cost, n };
  }
  buildLine(path) {
    const w = this.world;
    const tiles = path.filter(([x, z]) => w.inb(x, z) && !w.pline[w.idx(x, z)] && !w.buildingAt(x, z));
    if (!tiles.length) return { ok: false, msg: 'Hier kann keine Leitung gebaut werden.' };
    if (path.some(([x, z]) => w.inb(x, z) && w.buildingAt(x, z))) return { ok: false, msg: 'Leitungen können nicht über Gebäude führen.' };
    const cost = tiles.length * COSTS.line;
    if (!this.canAfford(cost)) return { ok: false, msg: 'Nicht genug Geld.' };
    this.spend(cost);
    for (const [x, z] of tiles) w.setLine(x, z, true);
    this.recount();
    this.game.emit('lines');
    this.game.treesDirty = true;
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
      if (w.terrain[k] || w.road[k] || w.bld[k] >= 0 || w.pline[k]) continue;
      if (w.zone[k] === zn) continue;
      w.zone[k] = zn; w.trees[k] = 0; w.markDirty(x, z); n++;
    }
    if (n) this.game.treesDirty = true;
    return n;
  }
  bulldozeRect(x0, z0, x1, z1, linesOnly = false) {
    const w = this.world; let n = 0, cost = 0;
    const seen = new Set();
    let lines = false;
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (!w.inb(x, z)) continue;
      const k = w.idx(x, z);
      if (w.pline[k]) { w.setLine(x, z, false); n++; cost += COSTS.bulldoze; lines = true; }
      if (linesOnly) continue;
      const b = w.buildingAt(x, z);
      if (b && !seen.has(b.id)) { seen.add(b.id); this.demolish(b); n++; cost += COSTS.bulldoze * b.w * b.h; }
      if (w.road[k]) { w.setRoad(x, z, false); n++; cost += COSTS.bulldoze; this.edgeCheck([[x, z]]); }
      if (w.zone[k]) { w.zone[k] = 0; w.markDirty(x, z); n++; }
      if (w.trees[k]) { w.trees[k] = 0; this.game.treesDirty = true; n++; }
    }
    if (n) { this.spend(cost); this.recount(); this.game.emit('roads'); if (lines) this.game.emit('lines'); }
    return n;
  }
  // checks shared by the placement preview and the actual placement
  canPlaceService(type, x, z, ww, hh, rot) {
    const S = SERVICES[type];
    const w = this.world;
    if (this.stage < S.stage) return { ok: false, msg: `Freigeschaltet ab ${STAGES[S.stage].name}.` };
    if (S.unique) for (const b of w.buildings.values()) if (b.type === type) return { ok: false, msg: `${S.name} gibt es schon.` };
    if (!w.canPlace(x, z, ww, hh)) return { ok: false, msg: 'Der Platz ist belegt.' };
    if (!S.noRoad && w.frontRoad(x, z, ww, hh, rot).length === 0) return { ok: false, msg: 'Braucht eine Straße an der Vorderseite.' };
    if (S.place?.water) {
      let n = 0;
      for (let j = -1; j <= hh; j++) for (let i = -1; i <= ww; i++) {
        if ((j < 0 || j >= hh) === (i < 0 || i >= ww)) continue;
        if (w.isWater(x + i, z + j)) n++;
      }
      if (n < S.place.water) return { ok: false, msg: 'Muss direkt am Wasser stehen.' };
    }
    if (!this.canAfford(S.cost)) return { ok: false, msg: 'Nicht genug Geld.' };
    return { ok: true };
  }
  placeService(type, x, z, rot) {
    const S = SERVICES[type];
    const ww = (rot % 2) ? S.h : S.w, hh = (rot % 2) ? S.w : S.h;
    const chk = this.canPlaceService(type, x, z, ww, hh, rot);
    if (!chk.ok) return chk;
    this.spend(S.cost);
    const b = this.startConstruction(type, x, z, ww, hh, rot);
    return { ok: true, b };
  }
  plantTree(x, z) {
    const w = this.world;
    if (!w.inb(x, z)) return false;
    const k = w.idx(x, z);
    if (w.terrain[k] || w.road[k] || w.bld[k] >= 0 || w.trees[k] >= 3 || w.pline[k]) return false;
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
