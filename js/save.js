const KEY = 'lindenau-save-v1';
const FIELDS = ['id', 'type', 'kind', 'level', 'x', 'z', 'w', 'h', 'rot', 'seed', 'state', 'progress', 'buildTime', 'pop', 'jobs', 'name', 'born'];

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

export class SaveSystem {
  constructor(app) { this.app = app; }
  serialize() {
    const { game, sim } = this.app;
    const w = game.world;
    return {
      v: 1,
      world: { terrain: b64(w.terrain), road: b64(w.road), zone: b64(w.zone), trees: b64(w.trees), busstop: b64(w.busstop), nextId: w.nextId, centre: w.centre, seed: w.seed },
      buildings: [...w.buildings.values()].map((b) => { const o = {}; for (const f of FIELDS) o[f] = b[f]; return o; }),
      sim: { money: sim.money, day: sim.day, hour: sim.hour, stage: sim.stage, cityName: sim.cityName, history: sim.history },
    };
  }
  store() {
    try { localStorage.setItem(KEY, JSON.stringify(this.serialize())); return true; } catch (e) { return false; }
  }
  exists() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }
  read() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  load() {
    const st = this.read();
    if (!st) return false;
    this.app.applyState(st);
    return true;
  }
  reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
    this.app.applyState(null);
  }
}
export { unb64 };
