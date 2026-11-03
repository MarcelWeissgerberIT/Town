import { fbm, hash2 } from './util.js';

// ---------------------------------------------------------------------------
// Landscape types of the region. water(x, z) also works outside the map so
// the countryside around a town continues its rivers, lakes and coast.
// flowOut: map edges where rivers leave (pollution drifts that way)
// entry:   edge where the starting village's main street enters
// ---------------------------------------------------------------------------

const ell = (x, z, cx, cz, rx, rz) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;

// a meandering river along z: centre line and width
const riverX = (N, z) => N * 0.7 + Math.sin(z * 0.075 + 1.3) * 5.5 + Math.sin(z * 0.19) * 1.6;
const riverW = (z) => 2.4 + Math.sin(z * 0.05 + 2) * 0.6;

export const TERRAINS = {
  river: {
    name: 'Flusstal', desc: 'Ein Fluss zieht durchs Tal, dazu ein Weiher.',
    flowOut: ['S'], entry: 'W', centre: [0.42, 0.5], forest: 0.58,
    water(x, z, N, inside) {
      if (Math.abs(x + 0.5 - riverX(N, z + 0.5)) < riverW(z) / 2) return true;
      return inside && ell(x, z, N * 0.18, N * 0.2, 3, Math.sqrt(5)) < 1;
    },
  },
  lakes: {
    name: 'Seenplatte', desc: 'Zwei Seen und ein Bach, der nach Osten abfließt.',
    flowOut: ['E'], entry: 'W', centre: [0.42, 0.54], forest: 0.6,
    water(x, z, N, inside, seed) {
      const n = (fbm(x * 0.15, z * 0.15, seed + 3) - 0.5) * 0.5;
      if (ell(x, z, N * 0.74, N * 0.26, 9.5, 7) < 1 + n) return true;
      if (ell(x, z, N * 0.2, N * 0.8, 6.5, 5) < 1 + n) return true;
      // creek from the upper lake to the eastern edge
      const cz = N * 0.26 + 5 + Math.sin(x * 0.2) * 2.2;
      return x > N * 0.8 && Math.abs(z + 0.5 - cz) < 0.85;
    },
  },
  forest: {
    name: 'Waldland', desc: 'Dichter Wald und ein schmaler Bach.',
    flowOut: ['S'], entry: 'E', centre: [0.6, 0.5], forest: 0.5,
    water(x, z, N) {
      const cx = N * 0.24 + Math.sin(z * 0.11 + 0.5) * 4 + Math.sin(z * 0.27) * 1.2;
      return Math.abs(x + 0.5 - cx) < 1.05;
    },
  },
  plain: {
    name: 'Ackerebene', desc: 'Weites Land, kaum Wasser – nur ein Teich. Grundwasser ist hier kostbar.',
    flowOut: [], entry: 'S', centre: [0.5, 0.5], forest: 0.7,
    water(x, z, N, inside, seed) {
      if (!inside) return false;
      const n = (fbm(x * 0.2, z * 0.2, seed + 5) - 0.5) * 0.6;
      return ell(x, z, N * 0.76, N * 0.24, 4.5, 3.5) < 1 + n;
    },
  },
  coast: {
    name: 'Küste', desc: 'Die Stadt liegt am Meer. Das Abwasser fließt in die Bucht.',
    flowOut: ['E'], entry: 'W', centre: [0.42, 0.5], forest: 0.62,
    water(x, z, N, inside, seed) {
      const shore = N * 0.8 + Math.sin(z * 0.09 + 1) * 3 + (fbm(z * 0.12, 3, seed + 7) - 0.5) * 6;
      return x + 0.5 > shore;
    },
  },
  delta: {
    name: 'Flussgabel', desc: 'Zwei Flüsse treffen sich – viel Ufer für Wasserwerke und Kraftwerke.',
    flowOut: ['S'], entry: 'N', centre: [0.34, 0.36], forest: 0.6,
    water(x, z, N) {
      const jx = N * 0.62, jz = N * 0.66;
      // river from the north down to the junction, then on to the south
      const ax = jx + Math.sin(z * 0.09 + 0.3) * 3.5 * Math.min(1, Math.abs(z - jz) / 12);
      if (Math.abs(x + 0.5 - ax) < (z > jz ? 1.6 : 1.15)) return true;
      // river from the west joining it
      if (x < jx + 1) {
        const bz = jz + Math.sin(x * 0.1 + 1.5) * 3 * Math.min(1, Math.abs(x - jx) / 12);
        if (Math.abs(z + 0.5 - bz) < 1.1) return true;
      }
      return false;
    },
  },
};

export function terrainOf(type) { return TERRAINS[type] || TERRAINS.river; }

// fill a world with a landscape type
export function genTerrain(world, type, seed) {
  const T = terrainOf(type);
  const N = world.N;
  world.ttype = TERRAINS[type] ? type : 'river';
  world.flowOut = T.flowOut;
  world.terrainVersion = (world.terrainVersion || 0) + 1;
  const [fx, fz] = T.centre;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = world.idx(x, z);
    world.terrain[i] = 0; world.trees[i] = 0;
    if (T.water(x, z, N, true, seed)) { world.terrain[i] = 1; continue; }
    const f = fbm(x * 0.09, z * 0.09, seed);
    const centre = Math.hypot(x - N * fx, z - N * fz);
    const th = T.forest;
    if (f > th && centre > 11) world.trees[i] = f > th + 0.08 ? 3 : f > th + 0.04 ? 2 : 1;
    else if (hash2(x, z, 77) < 0.025 && centre > 6) world.trees[i] = 1;
  }
}
