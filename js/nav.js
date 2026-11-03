import { DIRS } from './util.js';

// Breadth-first search over road tiles. Tiles are addressed by index z*N+x.
export class Nav {
  constructor(world) {
    this.w = world;
    const n = world.N * world.N;
    this.mark = new Int32Array(n);
    this.parent = new Int32Array(n);
    this.queue = new Int32Array(n);
    this.stamp = 1;
  }
  // road tiles touching a building's street side (falls back to any side)
  frontTiles(b) {
    const w = this.w;
    let t = w.frontRoad(b.x, b.z, b.w, b.h, b.rot);
    if (!t.length) for (let d = 0; d < 4 && !t.length; d++) t = w.frontRoad(b.x, b.z, b.w, b.h, d);
    return t.map(([x, z]) => z * w.N + x);
  }
  edgeTiles() {
    const w = this.w, N = w.N, out = [];
    for (let i = 0; i < N; i++) {
      if (w.isRoad(i, 0)) out.push({ k: i, d: 0 });
      if (w.isRoad(i, N - 1)) out.push({ k: (N - 1) * N + i, d: 2 });
      if (w.isRoad(0, i)) out.push({ k: i * N, d: 3 });
      if (w.isRoad(N - 1, i)) out.push({ k: i * N + N - 1, d: 1 });
    }
    return out;
  }
  // cheapest route (array of tile indices) from one of starts to a tile satisfying goal.
  // Main roads cost 2 per tile, streets 3, so traffic prefers main roads.
  // maxDepth is given in tiles of street.
  bfs(starts, goal, maxDepth = 1e9) {
    const w = this.w, N = w.N;
    const st = ++this.stamp;
    const maxCost = Math.min(1e9, maxDepth * 3);
    if (!this.cost || this.cost.length !== N * N) this.cost = new Int32Array(N * N);
    const cost = this.cost, buckets = [];
    for (const s of starts) { this.mark[s] = st; this.parent[s] = -1; cost[s] = 0; (buckets[0] || (buckets[0] = [])).push(s); }
    for (let c = 0; c < buckets.length; c++) {
      const b = buckets[c];
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const k = b[i];
        if (cost[k] !== c) continue;
        if (goal(k)) {
          const path = [];
          for (let p = k; p !== -1; p = this.parent[p]) path.push(p);
          return path.reverse();
        }
        if (c >= maxCost) continue;
        const x = k % N, z = (k / N) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const nk = nz * N + nx;
          const r = w.road[nk];
          if (!r) continue;
          const nc = c + (r === 2 ? 2 : 3);
          if (this.mark[nk] === st && cost[nk] <= nc) continue;
          this.mark[nk] = st; this.parent[nk] = k; cost[nk] = nc;
          (buckets[nc] || (buckets[nc] = [])).push(nk);
        }
      }
    }
    return null;
  }
  // all road tiles reachable from start within a depth (for random destinations)
  reachable(start, maxDepth) {
    const w = this.w, N = w.N;
    const st = ++this.stamp;
    let qh = 0, qt = 0;
    const out = [];
    const depth = new Map([[start, 0]]);
    this.mark[start] = st; this.queue[qt++] = start;
    while (qh < qt) {
      const k = this.queue[qh++];
      out.push(k);
      const dd = depth.get(k);
      if (dd >= maxDepth) continue;
      const x = k % N, z = (k / N) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].dx, nz = z + DIRS[d].dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const nk = nz * N + nx;
        if (this.mark[nk] === st || !w.road[nk]) continue;
        this.mark[nk] = st; this.queue[qt++] = nk; depth.set(nk, dd + 1);
      }
    }
    return out;
  }
}

export function dirBetween(N, a, b) {
  const ax = a % N, az = (a / N) | 0, bx = b % N, bz = (b / N) | 0;
  const dx = bx - ax, dz = bz - az;
  if (dx === 0 && dz === -1) return 0;
  if (dx === 1 && dz === 0) return 1;
  if (dx === 0 && dz === 1) return 2;
  if (dx === -1 && dz === 0) return 3;
  return -1;
}
