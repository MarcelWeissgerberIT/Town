// ---------------------------------------------------------------------------
// Undo for build actions. Before an action the touched tiles (plus a one-tile
// border, where junctions and kerbs change) are copied; taking the action back
// restores them, removes buildings that appeared there since and refunds the
// money. Demolished buildings cannot come back – the bulldozer asks first.
// ---------------------------------------------------------------------------
const LAYERS = ['road', 'zone', 'trees', 'junc', 'busstop', 'pline'];
const KEEP_MS = 90000; // older actions can no longer be taken back
const MAX = 10;

export class UndoStack {
  constructor(sim) {
    this.sim = sim;
    this.list = [];
  }
  clear() { this.list = []; }

  begin(label) {
    const s = this.sim;
    return { label, prev: new Map(), ids: new Map(s.world.buildings), money: s.money, t: performance.now() };
  }
  // remember a rectangle of tiles (with a one-tile border) before it changes
  save(e, x0, z0, x1, z1) {
    const w = this.sim.world, N = w.N;
    const ax = Math.max(0, Math.min(x0, x1) - 1), bx = Math.min(N - 1, Math.max(x0, x1) + 1);
    const az = Math.max(0, Math.min(z0, z1) - 1), bz = Math.min(N - 1, Math.max(z0, z1) + 1);
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      const k = z * N + x;
      if (!e.prev.has(k)) e.prev.set(k, LAYERS.map((l) => w[l][k]));
    }
  }
  // the action is done: keep it if it changed something and can be taken back
  end(e) {
    const s = this.sim, w = s.world;
    e.spent = e.money - s.money;
    // a building here was torn down: that cannot come back, and older copies no longer fit
    for (const [id, b] of e.ids) if (!w.buildings.has(id) && this.covers(e, b)) { this.list = []; return null; }
    let changed = e.spent !== 0;
    if (!changed) for (const b of w.buildings.values()) if (!e.ids.has(b.id)) { changed = true; break; }
    if (!changed) for (const [k, v] of e.prev) if (LAYERS.some((l, i) => w[l][k] !== v[i])) { changed = true; break; }
    if (!changed) return null;
    this.list.push(e);
    if (this.list.length > MAX) this.list.shift();
    return e;
  }
  covers(e, b) {
    const N = this.sim.world.N;
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (e.prev.has((b.z + j) * N + b.x + i)) return true;
    return false;
  }
  last() {
    const now = performance.now();
    this.list = this.list.filter((e) => now - e.t < KEEP_MS);
    return this.list[this.list.length - 1] || null;
  }

  undo() {
    const e = this.last();
    if (!e) return null;
    this.list.pop();
    const s = this.sim, w = s.world, N = w.N;
    // buildings that came with the action or grew on its tiles since
    const gone = new Set();
    for (const b of [...w.buildings.values()]) {
      if (e.ids.has(b.id) || !this.covers(e, b)) continue;
      gone.add(b.id); s.demolish(b, true);
    }
    let roads = false, lines = false, trees = false;
    const edge = [];
    for (const [k, v] of e.prev) {
      const x = k % N, z = (k / N) | 0;
      let diff = false;
      LAYERS.forEach((l, i) => {
        if (w[l][k] === v[i]) return;
        diff = true;
        if (l === 'pline') lines = true;
        else if (l === 'trees') trees = true;
        else if (l !== 'zone') roads = true;
        w[l][k] = v[i];
      });
      if (!diff) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.inb(x + dx, z + dz)) w.markDirty(x + dx, z + dz);
      if (x === 0 || z === 0 || x === N - 1 || z === N - 1) edge.push([x, z]);
    }
    if (roads) w.version++;
    if (lines) w.lineVersion++;
    if (trees || lines || gone.size) s.game.treesDirty = true;
    if (edge.length) s.edgeCheck(edge);
    if (e.spent > 0) s.book('build', e.spent);
    s.acc.util = 1;
    s.recount();
    s.game.emit('roads');
    if (lines) s.game.emit('lines');
    return e;
  }
}
