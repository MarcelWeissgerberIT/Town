import * as THREE from 'three';
import { SERVICES } from './config.js';
import { garbageDays } from './waste.js';

// Data views: a coloured layer over the map (power, water, pollution, mood …)
// Every view returns per tile [r, g, b, a] in 0..1 and a legend.

const ramp = (stops, t) => {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, a] = stops[i - 1], [t1, b] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
};
const GOOD_BAD = [[0, [0.85, 0.2, 0.15]], [0.5, [0.98, 0.8, 0.2]], [1, [0.25, 0.75, 0.35]]];
const POLL = [[0, [0.3, 0.75, 0.4]], [0.25, [0.95, 0.85, 0.3]], [0.6, [0.9, 0.45, 0.15]], [1, [0.55, 0.1, 0.1]]];
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

export const VIEWS = {
  power: { name: 'Strom', icon: 'i-bolt', legend: [['#5be07a', 'versorgt'], ['#ff4a3a', 'ohne Strom'], ['#ffd23a', 'Kraftwerk, Leitung'], ['#b07cff', 'nicht angeschlossen']] },
  water: { name: 'Wasser', icon: 'i-drop', legend: [['#3b8fd9', 'versorgt'], ['#e03b2a', 'ohne Wasser'], ['#9a6b3a', 'Abwasser ungeklärt']] },
  garbage: { name: 'Müll', icon: 'i-bin', legend: [['#3fbf5f', 'sauber'], ['#f2c230', 'Tonnen voll'], ['#8a3a1a', 'Müll türmt sich']] },
  air: { name: 'Luft', icon: 'i-cloud', ramp: POLL, legend: [['#4dbf66', 'sauber'], ['#f2d94c', 'belastet'], ['#e67326', 'schlecht'], ['#8c1a1a', 'gefährlich']] },
  ground: { name: 'Boden', icon: 'i-leaf', ramp: POLL, legend: [['#4dbf66', 'sauber'], ['#e67326', 'belastet'], ['#8c1a1a', 'vergiftet']] },
  river: { name: 'Gewässer', icon: 'i-drop', legend: [['#3b8fd9', 'sauber'], ['#9a7a3a', 'verschmutzt'], ['#4a3a1a', 'stark verschmutzt']] },
  noise: { name: 'Lärm', icon: 'i-sound', ramp: POLL, legend: [['#4dbf66', 'ruhig'], ['#f2d94c', 'laut'], ['#8c1a1a', 'sehr laut']] },
  mood: { name: 'Zufriedenheit', icon: 'i-smile', legend: [['#3fbf5f', 'glücklich'], ['#f2c230', 'geht so'], ['#e03b2a', 'unzufrieden']] },
  health: { name: 'Gesundheit', icon: 'i-cross', legend: [['#3fbf5f', 'Ärzte erreichbar'], ['#e03b2a', 'keine Ärzte'], ['#b03ab0', 'viele Kranke']] },
  safety: { name: 'Sicherheit', icon: 'i-shield', legend: [['#3b8fd9', 'Polizei'], ['#e0602a', 'Feuerwehr'], ['#8a5cc2', 'beides'], ['#bbbbbb', 'nichts']] },
  edu: { name: 'Bildung', icon: 'i-book', legend: [['#3fbf5f', 'Schule erreichbar'], ['#e03b2a', 'keine Schule']] },
  traffic: { name: 'Verkehr', icon: 'i-lights', legend: [['#5be07a', 'frei'], ['#f2c230', 'viel Verkehr'], ['#ff4a3a', 'Stau'], ['#4ea7ec', 'Ampel'], ['#b07cff', 'Kreisverkehr'], ['#ffffff', 'Parken']] },
  lv: { name: 'Bodenwert', icon: 'i-coin', legend: [['#c9d1c4', 'niedrig'], ['#7bbf6a', 'mittel'], ['#1f7a3a', 'hoch']] },
};

export class Heatmap {
  constructor(scene, world) {
    this.world = world;
    const N = world.N;
    this.data = new Uint8Array(N * N * 4);
    this.tex = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter;
    this.tex.flipY = false;
    const g = new THREE.PlaneGeometry(N, N); g.rotateX(-Math.PI / 2);
    // plane uv: u = x / N, v = 1 - z / N -> sample rows top-down
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0.78 }));
    this.mesh.position.set(N / 2, 0.035, N / 2);
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.mode = null;
    this.timer = 0;
  }

  set(mode) { this.mode = mode; this.mesh.visible = !!mode; this.timer = 0; }

  update(dt, sim) {
    if (!this.mode) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.6;
    this.paint(sim);
  }

  paint(sim) {
    const w = this.world, N = w.N, d = this.data, mode = this.mode;
    const put = (k, c, a = 0.85) => { d[k * 4] = c[0] * 255; d[k * 4 + 1] = c[1] * 255; d[k * 4 + 2] = c[2] * 255; d[k * 4 + 3] = a * 255; };
    d.fill(0);
    const pol = sim.pollution, util = sim.util;
    // building views: dim the map so the coloured buildings stand out
    if (mode === 'power' || mode === 'water' || mode === 'garbage' || mode === 'mood' || mode === 'traffic') {
      const dim = hex('#18202a');
      for (let k = 0; k < N * N; k++) if (!w.terrain[k]) put(k, dim, 0.55);
    }
    const field = (f, max) => { for (let k = 0; k < N * N; k++) { const v = f[k] / max; if (v > 0.02 || mode !== 'river') put(k, ramp(VIEWS[mode].ramp || POLL, v), 0.25 + Math.min(0.55, v)); } };
    if (mode === 'air') field(pol.air, 70);
    else if (mode === 'ground') field(pol.ground, 70);
    else if (mode === 'noise') field(pol.noise, 80);
    else if (mode === 'river') {
      for (let k = 0; k < N * N; k++) if (w.terrain[k]) put(k, ramp([[0, hex('#3b8fd9')], [0.35, hex('#9a7a3a')], [1, hex('#4a3a1a')]], pol.water[k] / 60), 0.85);
    } else if (mode === 'lv') {
      for (let k = 0; k < N * N; k++) if (!w.terrain[k]) put(k, ramp([[0, hex('#c9d1c4')], [0.5, hex('#7bbf6a')], [1, hex('#1f7a3a')]], sim.lv[k] / 80), 0.6);
    } else if (mode === 'health' || mode === 'safety' || mode === 'edu') {
      for (let k = 0; k < N * N; k++) {
        if (w.terrain[k]) continue;
        if (mode === 'health') put(k, sim.cover.health[k] ? hex('#3fbf5f') : hex('#e03b2a'), 0.35);
        else if (mode === 'edu') put(k, sim.cover.edu[k] ? hex('#3fbf5f') : hex('#e03b2a'), 0.35);
        else {
          const p = sim.cover.police[k], f = sim.cover.fire[k];
          put(k, p && f ? hex('#8a5cc2') : p ? hex('#3b8fd9') : f ? hex('#e0602a') : hex('#bbbbbb'), p || f ? 0.4 : 0.3);
        }
      }
    }
    // per building views
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      let c = null, a = 0.9;
      const S = SERVICES[b.type];
      if (mode === 'power') {
        if (S?.power || S?.sub) c = b.gridless || (S.sub && b.hv < 0) ? hex('#b07cff') : hex('#ffd23a');
        else if (b.pUse > 0) c = b.pw ? hex('#5be07a') : hex('#ff4a3a');
      } else if (mode === 'water') {
        if (S?.water || S?.tower || S?.treat) c = hex('#1f5fa8');
        else if (b.wUse > 0) c = b.wt ? hex('#3b8fd9') : hex('#e03b2a');
      } else if (mode === 'garbage') {
        if (S?.waste) c = hex('#5d4037');
        else { const g = garbageDays(b); if (b.kind !== 'svc' || g > 0) c = ramp([[0, hex('#3fbf5f')], [0.35, hex('#f2c230')], [1, hex('#8a3a1a')]], g / 6); }
      } else if (mode === 'mood' && b.kind !== 'svc') {
        c = b.abandoned ? hex('#555555') : ramp(GOOD_BAD, ((b.mood ?? 60) - 20) / 60);
      } else if (mode === 'health' && b.kind === 'res' && b.pop) {
        if ((b.sick || 0) / b.pop > 0.06) c = hex('#b03ab0');
      }
      if (!c) continue;
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) put(w.idx(b.x + i, b.z + j), c, a);
    }
    if (mode === 'traffic') {
      const tr = sim.game.traffic;
      for (let k = 0; k < N * N; k++) {
        if (!w.road[k]) continue;
        const f = tr ? tr.flow[k] : 0, j = tr ? tr.jam[k] : 0;
        let c = ramp([[0, hex('#5be07a')], [0.5, hex('#f2c230')], [1, hex('#ff4a3a')]], Math.max(f / 30, j / 4));
        const x = k % N, z = (k / N) | 0;
        const ctl = w.control(x, z);
        if (ctl === 1 && j < 2) c = hex('#4ea7ec');
        if (ctl === 2 && j < 2) c = hex('#b07cff');
        put(k, c, 0.9);
      }
      for (const b of w.buildings.values()) if (SERVICES[b.type]?.park && b.state === 'done') for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) put(w.idx(b.x + i, b.z + j), hex('#ffffff'), 0.9);
    }
    if (mode === 'power') {
      for (let k = 0; k < N * N; k++) {
        if (w.pline[k]) put(k, hex('#ffd23a'), 0.9);
        else if (w.road[k] && util.rcomp[k] >= 0) { const h = util.headP[util.rcomp[k]] ?? 0; put(k, h >= 0 ? hex('#9fd8a8') : hex('#f0a090'), 0.7); }
      }
    } else if (mode === 'water') {
      for (let k = 0; k < N * N; k++) {
        if (w.road[k] && util.rcomp[k] >= 0) { const h = util.headW[util.rcomp[k]] ?? 0; put(k, h >= 0 ? hex('#9fc8ec') : hex('#f0a090'), 0.7); }
      }
      util.rcs.forEach((c, r) => { if ((util.untreated[r] || 0) > 1 && c.outflow >= 0) put(c.outflow, hex('#9a6b3a'), 1); });
    }
    this.tex.needsUpdate = true;
  }
}
