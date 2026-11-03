import { SERVICES } from './config.js';
import { mulberry32, clamp } from './util.js';
import { garbageDays } from './waste.js';

// ---------------------------------------------------------------------------
// Health, emergencies, burglaries and fires.
// People fall ill more often in polluted, noisy or dirty neighbourhoods and
// without clean water. Some cases are emergencies: a rescue station or the
// hospital sends an ambulance, which brings the patient to a free hospital
// bed. Burglaries call the police, fires the fire brigade. Without own
// stations the district helps from outside the map – slowly and expensively.
// ---------------------------------------------------------------------------

const MISSION_COST = { ambulance: 250, fire: 600 };

export class Safety {
  constructor(sim) {
    this.sim = sim;
    this.world = sim.world;
    this.rng = mulberry32(777);
    this.calls = [];
    this.timer = 0;
    this.nextCall = 1;
    this.stats = { sick: 0, waiting: 0, ambulances: 0, beds: 0, bedsUsed: 0, failed: 0, crimes: 0, fires: 0, treated: 0 };
    this.day = { failed: 0, crimes: 0, caught: 0, fires: 0, rescued: 0 };
    this.amb = { arrive: (v, tr) => this.ambArrive(v, tr), gone: (v) => this.ambGone(v) };
    this.pol = { arrive: (v, tr) => this.polArrive(v, tr) };
    this.fir = { arrive: (v, tr) => this.fireArrive(v, tr) };
  }
  get traffic() { return this.sim.game.traffic; }
  get clock() { return this.sim.day * 24 + this.sim.hour; }
  notice(text, icon, color, b) { this.sim.game.emit('notice', { text, icon, color, b }); }

  stations(kind) {
    const out = [];
    for (const b of this.world.buildings.values()) {
      if (b.state !== 'done' || b.pw === 0 || b.rc < 0) continue;
      const S = SERVICES[b.type];
      if (kind === 'amb' && S?.care?.ambulances) out.push(b);
      if (kind === 'police' && b.type === 'police') out.push(b);
      if (kind === 'fire' && b.type === 'firestation') out.push(b);
    }
    return out;
  }
  nearest(list, b) {
    return list.slice().sort((a, c) => (Math.abs(a.x - b.x) + Math.abs(a.z - b.z)) - (Math.abs(c.x - b.x) + Math.abs(c.z - b.z)));
  }

  // ------------------------------------------------------------ hourly
  hour(dtH) {
    const sim = this.sim, w = this.world, rng = this.rng, N = w.N;
    const risk = sim.diff?.risk ?? 1;
    const pol = sim.pollution;
    const unemp = sim.unemployment || 0;
    let sick = 0, beds = 0, bedsUsed = 0;
    let fires = 0;
    for (const b of w.buildings.values()) if (b.fire) fires++;
    const now = this.clock;
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      const k = b.z * N + b.x;
      const S = SERVICES[b.type];
      // hospitals discharge their patients
      if (S?.care?.beds) {
        b.patients = (b.patients || []).filter((t) => t > now);
        beds += S.care.beds; bedsUsed += b.patients.length;
      }
      if (b.kind === 'res' && !b.abandoned && b.pop > 0) {
        const covered = sim.cover.health[k];
        let r = 1;
        if (pol) r += pol.at(pol.air, b) / 35 + pol.at(pol.ground, b) / 45 + pol.at(pol.noise, b) / 90;
        const q = b.rc >= 0 && sim.util?.quality ? sim.util.quality[b.rc] ?? 1 : 1;
        r += (1 - q) * 3 + (b.wt === 0 ? 1.2 : 0) + (garbageDays(b) > 4 ? 0.8 : 0);
        if (covered) r *= 0.75;
        b.risk = r;
        const exp = b.pop * 0.0021 / 24 * r * risk * dtH;
        let n = Math.floor(exp + rng());
        n = Math.min(n, b.pop - (b.sick || 0));
        if (n > 0) {
          b.sick = (b.sick || 0) + n;
          for (let i = 0; i < n; i++) if (rng() < (covered ? 0.1 : 0.14)) this.call(b);
        }
        if (b.sick) {
          const rate = covered ? 1 / 30 : 1 / 60;
          let rec = 0;
          for (let i = 0; i < b.sick; i++) if (rng() < rate * dtH) rec++;
          b.sick -= rec;
        }
        sick += b.sick || 0;
        // burglaries
        let cr = 0.00011 * (1 + unemp * 5 + ((b.mood ?? 60) < 35 ? 1.2 : 0)) * (sim.cover.police[k] ? 0.35 : 1.3);
        if (b.pw === 0 && (sim.hour > 20 || sim.hour < 6)) cr *= 1.6;
        if (rng() < cr * dtH * risk * Math.max(1, b.pop / 20)) this.crime(b);
      } else if (b.kind === 'com' && !b.abandoned) {
        const cr = 0.00009 * (1 + unemp * 3) * (sim.cover.police[k] ? 0.35 : 1.3);
        if (rng() < cr * dtH * risk * Math.max(1, b.jobs / 30)) this.crime(b);
      }
      // fires
      if (sim.pop > 90 && fires < 2 && !b.fire && !S?.green && b.type !== 'firestation') {
        let p = 0.000035 * (b.wt === 0 ? 2.5 : 1) * (sim.cover.fire[k] ? 0.6 : 1.4) * (b.kind === 'ind' ? 1.8 : 1) * (b.abandoned ? 2.5 : 1) * (b.pw === 0 ? 1.3 : 1) * (S ? 0.5 : 1);
        p *= Math.max(1, (b.w * b.h));
        if (rng() < p * dtH * risk) { this.fire(b); fires++; }
      }
    }
    Object.assign(this.stats, { sick, beds, bedsUsed, waiting: this.calls.filter((c) => c.state === 'wait').length, fires });
  }

  // ------------------------------------------------------------ dispatch
  tick(dt) {
    // burning buildings
    for (const b of this.world.buildings.values()) {
      if (!b.fire) continue;
      b.fire.t += dt;
      if (b.fire.t > (b.fire.truck ? 170 : 60)) {
        b.fire = null;
        this.day.fires++;
        this.notice(`${b.name} ist abgebrannt.`, 'i-fire', 'var(--bad)', null);
        this.sim.demolish(b);
      }
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const tr = this.traffic;
    if (!tr) return;
    const now = this.clock;
    const stations = this.stations('amb');
    let ext = tr.count((v) => v.type === 'ambulance' && v.data.station === 'edge');
    for (const c of this.calls) {
      if (c.state !== 'wait') continue;
      const b = this.world.buildings.get(c.b);
      if (!b) { c.state = 'done'; continue; }
      if (now - c.t > 4) {
        c.state = 'done';
        b.careFail = this.sim.day;
        this.day.failed++;
        this.notice(`Kein Rettungswagen kam rechtzeitig zu ${b.name}. Die Familie ist sehr enttäuscht.`, 'i-cross', 'var(--bad)', b);
        continue;
      }
      const goal = tr.nav.frontTiles(b);
      let v = null;
      for (const st of this.nearest(stations, b)) {
        const S = SERVICES[st.type];
        if (tr.count((x) => x.type === 'ambulance' && x.data.station === st.id) >= S.care.ambulances) continue;
        v = tr.drive('ambulance', tr.nav.frontTiles(st), goal, { role: 'ambulance', name: `Rettungswagen · ${st.name}`, data: { station: st.id, call: c.id, siren: true, stage: 'to' } });
        if (v) break;
      }
      if (!v && !stations.length && ext < 2 && now - c.t > 0.6) {
        const s = tr.edgeStart();
        if (s) v = tr.drive('ambulance', s.starts, goal, { role: 'ambulance', pre: s.pre, name: 'Rettungswagen des Landkreises', data: { station: 'edge', call: c.id, siren: true, stage: 'to' } });
        if (v) { ext++; this.sim.book('rescueExt', -MISSION_COST.ambulance); }
      }
      if (v) { v.ctl = this.amb; v.dwellAtEnd = 5; c.state = 'enroute'; c.veh = v.id; }
    }
    this.calls = this.calls.filter((c) => c.state !== 'done');
    this.stats.ambulances = tr.count((v) => v.type === 'ambulance');
    this.stats.waiting = this.calls.filter((c) => c.state === 'wait').length;
  }

  call(b) {
    if (this.calls.length > 40) return;
    this.calls.push({ id: this.nextCall++, b: b.id, t: this.clock, state: 'wait' });
    this.notice(`Notruf aus ${b.name}! Ein Rettungswagen wird gebraucht.`, 'i-cross', 'var(--bad)', b);
  }

  hospitalsFree() {
    const out = [];
    for (const b of this.world.buildings.values()) {
      const S = SERVICES[b.type];
      if (S?.care?.beds && b.state === 'done' && b.pw !== 0 && b.rc >= 0 && (b.patients || []).length < S.care.beds) out.push(b);
    }
    return out;
  }

  ambArrive(v, tr) {
    const d = v.data;
    if (d.stage === 'to') {
      const c = this.calls.find((x) => x.id === d.call);
      if (c) c.state = 'done';
      const b = this.world.buildings.get(c?.b);
      if (b && b.sick) b.sick--;
      this.day.rescued++;
      d.stage = 'hosp';
      for (const h of this.nearest(this.hospitalsFree(), b || { x: 0, z: 0 })) {
        if (tr.reroute(v, tr.nav.frontTiles(h), 3)) { d.hosp = h.id; return true; }
      }
      // no free bed in town: the patient goes to the district clinic
      if (tr.reroute(v, 'edge', 0)) { d.stage = 'away'; return true; }
      d.stage = 'home';
    }
    if (d.stage === 'hosp') {
      const h = this.world.buildings.get(d.hosp);
      if (h) (h.patients || (h.patients = [])).push(this.clock + 36 + this.rng() * 24);
      this.stats.treated++;
      d.stage = 'home';
    }
    if (d.stage === 'away') return false;
    d.siren = false;
    if (d.stage === 'home') {
      d.stage = 'back';
      if (d.station === 'edge') return tr.reroute(v, 'edge', 0);
      const st = this.world.buildings.get(d.station);
      if (st && tr.reroute(v, tr.nav.frontTiles(st), 0)) return true;
    }
    return false;
  }
  ambGone(v) {
    const c = this.calls.find((x) => x.id === v.data.call && x.state === 'enroute');
    if (c) c.state = 'wait';
  }

  // ------------------------------------------------------------ police
  crime(b) {
    this.day.crimes++;
    b.crimeDay = this.sim.day + this.sim.hour / 24;
    const tr = this.traffic;
    const stations = this.stations('police');
    if (!stations.length || !tr) {
      if (this.rng() < 0.4) this.notice(`Einbruch in ${b.name}. Es gibt keine Polizeiwache, die hilft.`, 'i-shield', 'var(--bad)', b);
      return;
    }
    for (const st of this.nearest(stations, b)) {
      if (tr.count((v) => v.type === 'police' && v.data.station === st.id && v.data.siren) >= 3) continue;
      const v = tr.drive('police', tr.nav.frontTiles(st), tr.nav.frontTiles(b), { role: 'police', name: `Streifenwagen · ${st.name}`, data: { station: st.id, crime: b.id, siren: true } });
      if (v) {
        v.ctl = this.pol; v.dwellAtEnd = 6;
        this.notice(`Einbruch in ${b.name}! Die Polizei ist unterwegs.`, 'i-shield', null, b);
        return;
      }
    }
  }
  polArrive(v, tr) {
    const d = v.data;
    if (d.siren) {
      d.siren = false;
      const b = this.world.buildings.get(d.crime);
      if (b && this.rng() < 0.65) { this.day.caught++; this.notice(`Die Polizei hat den Einbrecher bei ${b.name} gefasst.`, 'i-shield', 'var(--good)', b); }
      const st = this.world.buildings.get(d.station);
      if (st && tr.reroute(v, tr.nav.frontTiles(st), 0)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ fire
  fire(b) {
    b.fire = { t: 0, truck: null };
    const tr = this.traffic;
    this.notice(`Feuer in ${b.name}!`, 'i-fire', 'var(--bad)', b);
    if (!tr) return;
    const goal = tr.nav.frontTiles(b);
    for (const st of this.nearest(this.stations('fire'), b)) {
      if (tr.count((v) => v.type === 'fire' && v.data.station === st.id) >= 2) continue;
      const v = tr.drive('fire', tr.nav.frontTiles(st), goal, { role: 'emergency', name: `Löschzug · ${st.name}`, data: { station: st.id, fire: b.id, siren: true } });
      if (v) { v.ctl = this.fir; v.dwellAtEnd = b.wt === 0 ? 14 : 8; b.fire.truck = v.id; return; }
    }
    const s = tr.edgeStart();
    const v = s ? tr.drive('fire', s.starts, goal, { role: 'emergency', pre: s.pre, name: 'Feuerwehr des Landkreises', data: { station: 'edge', fire: b.id, siren: true } }) : null;
    if (v) { v.ctl = this.fir; v.dwellAtEnd = 10; b.fire.truck = v.id; b.fire.t = -30; this.sim.book('fireExt', -MISSION_COST.fire); }
    else this.notice('Keine Feuerwehr erreichbar – das Haus brennt nieder!', 'i-fire', 'var(--bad)', b);
  }
  fireArrive(v, tr) {
    const d = v.data;
    if (d.siren) {
      d.siren = false;
      const b = this.world.buildings.get(d.fire);
      if (b && b.fire) { b.fire = null; this.notice(`Brand in ${b.name} gelöscht. Danke, Feuerwehr!`, 'i-fire', 'var(--good)', b); }
      if (d.station === 'edge') return tr.reroute(v, 'edge', 0);
      const st = this.world.buildings.get(d.station);
      if (st && tr.reroute(v, tr.nav.frontTiles(st), 0)) return true;
    }
    return false;
  }

  newDay() {
    this.stats.failed = this.day.failed; this.stats.crimes = this.day.crimes; this.stats.fires = this.day.fires;
    this.yesterday = { ...this.day };
    this.day = { failed: 0, crimes: 0, caught: 0, fires: 0, rescued: 0 };
  }
}
