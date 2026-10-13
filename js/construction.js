import * as THREE from 'three';
import { Builder, packedToGeometry } from './geom.js';
import { genBuilding, fq } from './buildgen.js';
import * as MD from './models.js';
import { col, mulberry32, clamp } from './util.js';

const C = col;
export const SITE_STAGES = ['Vermessung', 'Aushub', 'Fundament', 'Rohbau', 'Dach & Fassade', 'Innenausbau'];
export function siteStage(p) { return p < 0.08 ? 0 : p < 0.2 ? 1 : p < 0.3 ? 2 : p < 0.78 ? 3 : p < 0.9 ? 4 : 5; }

function meshesFrom(B, M, group) {
  const pk = B.pack();
  for (const k in pk) {
    if (!M[k]) continue;
    const m = new THREE.Mesh(packedToGeometry(pk[k]), M[k]);
    m.castShadow = k !== 'ao'; m.receiveShadow = k !== 'ao';
    if (k === 'ao') m.renderOrder = 1;
    group.add(m);
  }
}

function fence(B, x0, z0, x1, z1, gapX) {
  const pc = C('#b9c0c6'), fc = C('#7d868d'), foot = C('#d4d0c8');
  const side = (ax, az, bx, bz, gap) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.11));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const cx0 = ax + (bx - ax) * t0, cz0 = az + (bz - az) * t0, cx1 = ax + (bx - ax) * t1, cz1 = az + (bz - az) * t1;
      if (gap !== null && Math.abs((cx0 + cx1) / 2 - gap) < 0.1) continue;
      const lx = Math.min(cx0, cx1), hx = Math.max(cx0, cx1), lz = Math.min(cz0, cz1), hz = Math.max(cz0, cz1);
      B.box('solid', lx - 0.002, 0.012, lz - 0.002, hx + 0.002, 0.075, hz + 0.002, pc);
      B.box('solid', cx0 - 0.012, 0, cz0 - 0.008, cx0 + 0.012, 0.012, cz0 + 0.008, foot);
      B.box('solid', cx0 - 0.003, 0.01, cz0 - 0.003, cx0 + 0.003, 0.078, cz0 + 0.003, fc);
    }
  };
  side(x0, z1, x1, z1, gapX);
  side(x1, z0, x1, z1, null);
  side(x0, z0, x1, z0, null);
  side(x0, z0, x0, z1, null);
}

function scaffold(B, s, H) {
  const o = 0.045;
  const x0 = s.x0 - o, x1 = s.x1 + o, z0 = s.z0 - o, z1 = s.z1 + o;
  const pole = C('#c3c7cb'), plank = C('#c4955a'), net = C('#4f8f6a');
  const posts = [];
  const along = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.17));
    for (let i = 0; i <= n; i++) posts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]);
  };
  along(x0, z1, x1, z1); along(x1, z1, x1, z0); along(x1, z0, x0, z0); along(x0, z0, x0, z1);
  for (const [x, z] of posts) B.box('solid', x - 0.005, 0, z - 0.005, x + 0.005, H + 0.07, z + 0.005, pole);
  let y = 0;
  const levels = [];
  for (const fh of s.fhs) { y += fh; if (y <= H + 0.01) levels.push(y); }
  if (!levels.length) levels.push(Math.min(H, 0.25));
  for (const yy of levels) {
    const t = 0.006, w = 0.034;
    B.box('solid', x0 - 0.02, yy - t, z1 - 0.005, x1 + 0.02, yy, z1 + w - 0.005, plank);
    B.box('solid', x0 - 0.02, yy - t, z0 - w + 0.005, x1 + 0.02, yy, z0 + 0.005, plank);
    B.box('solid', x1 - 0.005, yy - t, z0, x1 + w - 0.005, yy, z1, plank);
    B.box('solid', x0 - w + 0.005, yy - t, z0, x0 + 0.005, yy, z1, plank);
    // guard rails
    B.box('solid', x0, yy + 0.05, z1 + w - 0.01, x1, yy + 0.055, z1 + w - 0.005, pole);
    B.box('solid', x0, yy + 0.05, z0 - w + 0.005, x1, yy + 0.055, z0 - w + 0.01, pole);
  }
  // safety net on one long side for the upper levels
  if (H > 0.6) B.quad('solid', [x1 + 0.03, H * 0.45, z1], [x1 + 0.03, H * 0.45, z0], [x1 + 0.03, H + 0.06, z0], [x1 + 0.03, H + 0.06, z1], net);
}

function rawShell(B, s, floors, rng) {
  const mat = s.mat === 'conc' ? 'conc' : 'brick';
  const winCell = mat === 'conc' ? 'raw_conc_win' : 'raw_brick_win';
  const wallCell = mat === 'conc' ? 'raw_conc' : 'raw_brick';
  let y = 0;
  const w = s.x1 - s.x0, d = s.z1 - s.z0;
  for (let f = 0; f < floors && f < s.fhs.length; f++) {
    const h = s.fhs[f];
    const nbx = Math.max(1, Math.round(w / 0.22)), nbz = Math.max(1, Math.round(d / 0.22));
    const wall = (ax, az, bx, bz, nb) => {
      for (let k = 0; k < nb; k++) {
        const t0 = k / nb, t1 = (k + 1) / nb;
        const cell = (k % 2 === 0 || nb < 3) ? winCell : wallCell;
        fq(B, cell, [ax + (bx - ax) * t0, y, az + (bz - az) * t0], [ax + (bx - ax) * t1, y, az + (bz - az) * t1], [ax + (bx - ax) * t1, y + h, az + (bz - az) * t1], [ax + (bx - ax) * t0, y + h, az + (bz - az) * t0], rng);
      }
    };
    wall(s.x0, s.z1, s.x1, s.z1, nbx); wall(s.x1, s.z1, s.x1, s.z0, nbz);
    wall(s.x1, s.z0, s.x0, s.z0, nbx); wall(s.x0, s.z0, s.x0, s.z1, nbz);
    y += h;
    B.box('solid', s.x0 - 0.008, y - 0.006, s.z0 - 0.008, s.x1 + 0.008, y + 0.01, s.z1 + 0.008, C('#b4b2ab'));
  }
  // rebar sticking out of the top slab
  for (let x = s.x0 + 0.04; x < s.x1; x += 0.12) {
    B.box('solid', x - 0.003, y, s.z0 + 0.01, x + 0.003, y + 0.05, s.z0 + 0.016, C('#7a4a2a'));
    B.box('solid', x - 0.003, y, s.z1 - 0.016, x + 0.003, y + 0.05, s.z1 - 0.01, C('#7a4a2a'));
  }
  return y;
}

// tower crane: returns { mast group, top group }
function makeCrane(M, height, jib) {
  const Y = C('#f2b51c');
  const B = new Builder();
  const a = 0.035;
  for (const [x, z] of [[-a, -a], [a, -a], [-a, a], [a, a]]) B.box('solid', x - 0.006, 0, z - 0.006, x + 0.006, height, z + 0.006, Y);
  for (let y = 0.06; y < height; y += 0.09) {
    B.box('solid', -a, y, -a - 0.004, a, y + 0.008, -a + 0.004, Y); B.box('solid', -a, y, a - 0.004, a, y + 0.008, a + 0.004, Y);
    B.box('solid', -a - 0.004, y, -a, -a + 0.004, y + 0.008, a, Y); B.box('solid', a - 0.004, y, -a, a + 0.004, y + 0.008, a, Y);
  }
  B.box('solid', -0.07, 0, -0.07, 0.07, 0.04, 0.07, C('#9a9a94'));
  const mast = new THREE.Group();
  meshesFrom(B, M, mast);
  const T = new Builder();
  T.box('solid', -0.05, 0, -0.05, 0.05, 0.06, 0.05, Y);
  T.box('glass', 0.03, 0.0, 0.035, 0.09, 0.06, 0.08, C('#2a3a48'));
  T.box('solid', -0.4, 0.06, -0.025, jib, 0.1, 0.025, Y);
  for (let x = -0.38; x < jib; x += 0.08) T.box('solid', x, 0.1, -0.003, x + 0.006, 0.12, 0.003, Y);
  T.box('solid', -0.4, 0.12, -0.012, jib, 0.126, 0.012, Y);
  T.box('solid', -0.01, 0.06, -0.012, 0.01, 0.22, 0.012, Y);
  T.box('solid', -0.38, 0.0, -0.045, -0.24, 0.06, 0.045, C('#a5a39c'));
  const top = new THREE.Group();
  meshesFrom(T, M, top);
  // trolley + hook (moves along jib)
  const H = new Builder();
  H.box('solid', -0.025, -0.012, -0.03, 0.025, 0, 0.03, C('#444'));
  const trolley = new THREE.Group(); meshesFrom(H, M, trolley);
  const L = new Builder();
  L.box('solid', -0.002, -1, -0.002, 0.002, 0, 0.002, C('#333'));
  const cable = new THREE.Group(); meshesFrom(L, M, cable);
  const P = new Builder();
  P.box('solid', -0.045, -0.035, -0.035, 0.045, -0.025, 0.035, C('#b08a5a'));
  P.box('solid', -0.04, -0.025, -0.03, 0.04, 0.01, 0.03, C('#c96a4a'));
  P.box('solid', -0.008, 0.01, -0.008, 0.008, 0.03, 0.008, C('#f2b51c'));
  const load = new THREE.Group(); meshesFrom(P, M, load);
  trolley.position.set(jib * 0.6, 0.06, 0);
  top.add(trolley); trolley.add(cable); trolley.add(load);
  return { mast, top, trolley, cable, load, jib };
}

function makeExcavator(M) {
  const g = new THREE.Group();
  const B = new Builder();
  MD.excavatorBase(B);
  meshesFrom(B, M, g);
  const boom = new THREE.Group();
  const Bb = new Builder();
  Bb.box('solid', 0, -0.018, -0.02, 0.28, 0.018, 0.02, C('#f2b51c'));
  Bb.box('solid', 0.24, -0.16, -0.016, 0.27, 0.0, 0.016, C('#e0a614'));
  Bb.box('solid', 0.22, -0.2, -0.03, 0.29, -0.15, 0.03, C('#4a4a4a'));
  meshesFrom(Bb, M, boom);
  boom.position.set(0.05, 0.15, 0.04);
  g.add(boom);
  g.userData.boom = boom;
  return g;
}

export class Sites {
  constructor(scene, game, M) {
    this.scene = scene; this.game = game; this.M = M;
    this.sites = new Map(); // building id -> site
    this.time = 0;
  }
  key(b) {
    const st = siteStage(b.progress);
    if (st !== 3) return `${st}`;
    const s = b.shell; if (!s) return '3';
    const n = Math.max(1, Math.ceil(s.fhs.length * clamp((b.progress - 0.3) / 0.46, 0, 1)));
    return `3-${n}`;
  }
  remove(id) {
    const s = this.sites.get(id);
    if (!s) return;
    this.scene.remove(s.group);
    s.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.sites.delete(id);
  }
  rebuild(b) {
    let s = this.sites.get(b.id);
    if (s) { this.scene.remove(s.group); s.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const group = new THREE.Group();
    s = { b, group, key: this.key(b), crane: null, exc: null };
    const t = this.game.lotXform(b);
    group.position.set(t.x, 0, t.z);
    group.rotation.y = t.a;
    const B = new Builder();
    const rng = mulberry32(b.seed + 77);
    const sh = b.shell || { x0: -0.3, z0: -0.25, x1: 0.3, z1: 0.25, fhs: [0.25, 0.25], roofH: 0.2, mat: 'brick' };
    const LW = (b.rot % 2) ? b.h : b.w, LD = (b.rot % 2) ? b.w : b.h;
    const st = siteStage(b.progress);
    const totalH = sh.fhs.reduce((a, c) => a + c, 0);
    if (st >= 4) {
      genBuilding(B, b);
      if (st === 4) scaffold(B, sh, totalH + (sh.roofH ? 0.05 : 0));
    } else {
      B.rect('dirt', -LW / 2 + 0.02, -LD / 2 + 0.02, LW / 2 - 0.02, LD / 2 - 0.02, 0.005, C('#efe6da'), 1.2);
      if (st === 0) {
        for (const [x, z] of [[sh.x0, sh.z0], [sh.x1, sh.z0], [sh.x0, sh.z1], [sh.x1, sh.z1]]) {
          B.box('solid', x - 0.006, 0, z - 0.006, x + 0.006, 0.06, z + 0.006, C('#d9452b'));
        }
        B.box('solid', sh.x0, 0.04, sh.z1 - 0.002, sh.x1, 0.043, sh.z1 + 0.002, C('#ffffff'));
        B.box('solid', sh.x0, 0.04, sh.z0 - 0.002, sh.x1, 0.043, sh.z0 + 0.002, C('#ffffff'));
        B.box('solid', sh.x0 - 0.002, 0.04, sh.z0, sh.x0 + 0.002, 0.043, sh.z1, C('#ffffff'));
        B.box('solid', sh.x1 - 0.002, 0.04, sh.z0, sh.x1 + 0.002, 0.043, sh.z1, C('#ffffff'));
      } else if (st === 1) {
        const p = clamp((b.progress - 0.08) / 0.12, 0, 1);
        B.rect('dirt', sh.x0, sh.z0, sh.x1, sh.z0 + (sh.z1 - sh.z0) * (0.3 + 0.7 * p), 0.0065, C('#8a6b4e'), 1.2);
        B.cyl('dirt', sh.x1 + 0.05, 0, sh.z0 - 0.02, 0.1 + p * 0.06, 0.06 + p * 0.05, 9, C('#a07c58'), { r1: 0.02 });
        s.exc = makeExcavator(this.M);
        s.exc.position.set((sh.x0 + sh.x1) / 2, 0, sh.z1 + 0.1);
        s.exc.rotation.y = Math.PI / 2;
        group.add(s.exc);
      } else if (st === 2) {
        B.box('solid', sh.x0, 0, sh.z0, sh.x1, 0.035, sh.z1, C('#b9b7b0'));
        for (let x = sh.x0 + 0.03; x < sh.x1; x += 0.06) B.box('solid', x, 0.035, sh.z0 + 0.02, x + 0.004, 0.04, sh.z1 - 0.02, C('#6d4a33'));
        B.box('solid', sh.x0 - 0.01, 0, sh.z0 - 0.01, sh.x1 + 0.01, 0.05, sh.z0, C('#a0784c'));
        B.box('solid', sh.x0 - 0.01, 0, sh.z1, sh.x1 + 0.01, 0.05, sh.z1 + 0.01, C('#a0784c'));
      } else {
        const n = Math.max(1, Math.ceil(sh.fhs.length * clamp((b.progress - 0.3) / 0.46, 0, 1)));
        const top = rawShell(B, sh, n, rng);
        scaffold(B, sh, top + 0.02);
      }
      // building materials
      const mx = LW / 2 - 0.12, mz = -LD / 2 + 0.1;
      B.box('solid', mx - 0.05, 0, mz - 0.035, mx + 0.05, 0.012, mz + 0.035, C('#b08a5a'));
      B.box('solid', mx - 0.045, 0.012, mz - 0.03, mx + 0.045, 0.05, mz + 0.03, C(st >= 3 && sh.mat === 'conc' ? '#a9a8a2' : '#c96a4a'));
      B.box('solid', -LW / 2 + 0.05, 0, -LD / 2 + 0.05, -LW / 2 + 0.09, 0.012, -LD / 2 + 0.2, C('#b08a5a'));
    }
    if (st < 5) {
      // site container, toilet and fence
      if (LW * LD > 1.5 || st < 3) {
        const cx = -LW / 2 + 0.13, cz = LD / 2 - 0.12;
        if (cx + 0.08 < sh.x0 || cz - 0.05 > sh.z1 || LW > 1.5) {
          B.box('solid', cx - 0.09, 0, cz - 0.045, cx + 0.09, 0.08, cz + 0.045, C('#e9eef2'));
          B.box('solid', cx - 0.09, 0.08, cz - 0.045, cx + 0.09, 0.087, cz + 0.045, C('#2f5f9e'));
          B.box('solid', cx + 0.1, 0, cz - 0.02, cx + 0.135, 0.075, cz + 0.02, C('#2f7bd5'));
        }
      }
      fence(B, -LW / 2 + 0.02, -LD / 2 + 0.02, LW / 2 - 0.02, LD / 2 - 0.02, 0);
      // site sign
      B.box('solid', LW / 2 - 0.2, 0, LD / 2 - 0.01, LW / 2 - 0.195, 0.12, LD / 2 - 0.005, C('#666'));
      B.box('solid', LW / 2 - 0.29, 0.08, LD / 2 - 0.01, LW / 2 - 0.11, 0.14, LD / 2 - 0.004, C('#f4f4f2'));
      B.box('solid', LW / 2 - 0.29, 0.125, LD / 2 - 0.0035, LW / 2 - 0.11, 0.14, LD / 2 - 0.002, C('#d9452b'));
    }
    meshesFrom(B, this.M, group);
    // tower crane for bigger buildings during shell/roof work
    if (st >= 2 && st <= 4 && (sh.fhs.length >= 3 || LW * LD >= 2)) {
      const H = totalH + 0.45;
      const jib = Math.min(1.6, Math.max(0.8, Math.hypot(LW, LD) * 0.75));
      const cr = makeCrane(this.M, H, jib);
      const cx = clamp(sh.x1 + 0.12, -LW / 2 + 0.08, LW / 2 - 0.08), cz = clamp(sh.z0 - 0.1, -LD / 2 + 0.08, LD / 2 - 0.08);
      cr.mast.position.set(cx, 0, cz);
      cr.top.position.set(cx, H, cz);
      group.add(cr.mast); group.add(cr.top);
      s.crane = cr; s.craneH = H;
    }
    this.scene.add(group);
    this.sites.set(b.id, s);
    return s;
  }
  // world position helpers for workers
  update(dt) {
    this.time += dt;
    const ids = new Set();
    for (const b of this.game.world.buildings.values()) {
      if (b.state !== 'build') continue;
      ids.add(b.id);
      const s = this.sites.get(b.id);
      if (!s || s.key !== this.key(b)) this.rebuild(b);
    }
    for (const id of [...this.sites.keys()]) if (!ids.has(id)) this.remove(id);
    for (const s of this.sites.values()) {
      const t = this.time + s.b.seed % 100;
      if (s.crane) {
        const c = s.crane;
        c.top.rotation.y = Math.sin(t * 0.18) * 1.6 + (s.b.seed % 7);
        const tr = 0.3 + (Math.sin(t * 0.27) * 0.5 + 0.5) * (c.jib - 0.35);
        c.trolley.position.x = tr;
        const drop = 0.25 + (Math.sin(t * 0.33 + 1) * 0.5 + 0.5) * (s.craneH - 0.35);
        c.cable.scale.y = drop;
        c.load.position.y = -drop;
      }
      if (s.exc) {
        s.exc.userData.boom.rotation.z = -0.35 + Math.sin(t * 1.3) * 0.35;
        s.exc.rotation.y = Math.PI / 2 + Math.sin(t * 0.4) * 0.5;
      }
    }
  }
  clear() { for (const id of [...this.sites.keys()]) this.remove(id); }
}
