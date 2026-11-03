const LEGACY_KEY = 'lindenau-save-v1';
const FIELDS = ['id', 'type', 'kind', 'level', 'x', 'z', 'w', 'h', 'rot', 'seed', 'state', 'progress', 'buildTime', 'pop', 'jobs', 'name', 'born',
  'popMax', 'jobsMax', 'abandoned', 'garb', 'sick', 'fill', 'store', 'bunker', 'stored', 'wStored', 'patients', 'mood', 'leave', 'back'];

function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str, Type = Uint8Array) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return Type === Uint8Array ? u8 : new Type(u8.buffer);
}
const store = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const load = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

// One save slot per town of the region (the first town keeps the old slot name).
export class SaveSystem {
  constructor(app) { this.app = app; this.key = LEGACY_KEY; }
  keyFor(id) { return !id || id === 'a' ? LEGACY_KEY : `lindenau-city-${id}`; }
  use(id) { this.key = this.keyFor(id); }
  serialize() {
    const { game, sim } = this.app;
    const w = game.world;
    const pol = sim.pollution.pack();
    return {
      v: 3,
      world: {
        terrain: b64(w.terrain), road: b64(w.road), zone: b64(w.zone), trees: b64(w.trees), busstop: b64(w.busstop), pline: b64(w.pline), junc: b64(w.junc),
        nextId: w.nextId, centre: w.centre, seed: w.seed, type: w.ttype || 'river', flowOut: w.flowOut,
      },
      pollution: { air: b64(pol.air), ground: b64(pol.ground), water: b64(pol.water) },
      buildings: [...w.buildings.values()].map((b) => { const o = {}; for (const f of FIELDS) if (b[f] !== undefined) o[f] = b[f]; return o; }),
      sim: {
        money: sim.money, day: sim.day, hour: sim.hour, stage: sim.stage, cityName: sim.cityName, history: sim.history,
        tax: sim.tax, loans: sim.loans, diff: sim.diffKey, grace: sim.grace, cityId: sim.cityId,
      },
    };
  }
  store(key = this.key) { try { return store(key, JSON.stringify(this.serialize())); } catch (e) { return false; } }
  exists(key = this.key) { return !!load(key); }
  read(key = this.key) { try { const s = load(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  remove(key = this.key) { store(key, null); }
  load() {
    const st = this.read();
    if (!st) return false;
    this.app.applyState(st);
    return true;
  }
  reset() {
    this.remove();
    this.app.applyState(null);
  }
}
export { unb64, b64 };
