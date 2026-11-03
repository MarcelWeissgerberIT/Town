import * as THREE from 'three';
import { Builder, packedToGeometry } from './geom.js';
import { col } from './util.js';
import { garbageDays } from './waste.js';
import { SERVICES } from './config.js';

// Everything small that tells how the town is doing: turning wind turbines,
// garbage bags piling up at the kerb and floating problem icons above
// buildings (no power, no water, garbage, emergency, unhappy, empty).

const ICONS = ['power', 'water', 'garbage', 'sos', 'sad', 'empty', 'plug', 'full'];
function iconAtlas() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = S * ICONS.length; cv.height = S;
  const x = cv.getContext('2d');
  const bg = { power: '#f2b705', water: '#2f8fd8', garbage: '#8a5a35', sos: '#d8202a', sad: '#7b5ea7', empty: '#6b7075', plug: '#e8590c', full: '#5d4037' };
  ICONS.forEach((k, i) => {
    const cx = i * S + S / 2, cy = S / 2;
    x.save();
    x.beginPath(); x.arc(cx, cy, 28, 0, 7); x.fillStyle = '#ffffff'; x.fill();
    x.beginPath(); x.arc(cx, cy, 24, 0, 7); x.fillStyle = bg[k]; x.fill();
    x.fillStyle = '#ffffff'; x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round';
    x.translate(cx, cy);
    if (k === 'power') { x.beginPath(); x.moveTo(3, -16); x.lineTo(-9, 3); x.lineTo(0, 3); x.lineTo(-3, 16); x.lineTo(9, -3); x.lineTo(0, -3); x.closePath(); x.fill(); }
    if (k === 'water') { x.beginPath(); x.moveTo(0, -16); x.bezierCurveTo(10, -3, 12, 4, 0, 14); x.bezierCurveTo(-12, 4, -10, -3, 0, -16); x.fill(); }
    if (k === 'garbage') { x.fillRect(-10, -6, 20, 20); x.fillRect(-13, -11, 26, 4); x.fillRect(-4, -15, 8, 4); x.fillStyle = bg[k]; x.fillRect(-5, -2, 2, 12); x.fillRect(3, -2, 2, 12); }
    if (k === 'sos') { x.fillRect(-4, -14, 8, 28); x.fillRect(-14, -4, 28, 8); }
    if (k === 'sad') { x.beginPath(); x.arc(-7, -5, 3, 0, 7); x.arc(7, -5, 3, 0, 7); x.fill(); x.beginPath(); x.arc(0, 12, 9, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
    if (k === 'empty') { x.beginPath(); x.moveTo(-13, -1); x.lineTo(0, -13); x.lineTo(13, -1); x.lineTo(9, -1); x.lineTo(9, 13); x.lineTo(-9, 13); x.lineTo(-9, -1); x.closePath(); x.fill(); x.strokeStyle = bg[k]; x.beginPath(); x.moveTo(-5, 1); x.lineTo(5, 11); x.moveTo(5, 1); x.lineTo(-5, 11); x.stroke(); }
    if (k === 'plug') { x.fillRect(-9, -4, 18, 12); x.fillRect(-6, -14, 3, 10); x.fillRect(3, -14, 3, 10); x.fillRect(-2, 8, 4, 8); }
    if (k === 'full') { x.font = '700 30px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 0, 2); }
    x.restore();
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VS = `
attribute float icon; attribute float phase;
uniform float uTime; uniform float uSize;
varying float vIcon;
void main(){
  vIcon = icon;
  vec3 p = position; p.y += sin(uTime * 2.2 + phase) * 0.03;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize;
}`;
const FS = `
uniform sampler2D uMap; uniform float uN;
varying float vIcon;
void main(){
  vec2 uv = vec2((vIcon + gl_PointCoord.x) / uN, 1.0 - gl_PointCoord.y);
  vec4 c = texture2D(uMap, uv);
  if (c.a < 0.05) discard;
  gl_FragColor = c;
}`;

function rotorGeometry() {
  const B = new Builder();
  const c = col('#f2f4f6');
  B.sphere('solid', 0, 0, 0.02, 0.045, 0.045, 0.06, c, 8, 5);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    B.push(0, 0, 0);
    const ca = Math.cos(a), sa = Math.sin(a);
    // blade in the x/y plane, root wide, tip narrow
    const P = (r, w) => [[ca * r - sa * w, sa * r + ca * w], [ca * r + sa * w, sa * r - ca * w]];
    const [a0, a1] = P(0.05, 0.035), [b0, b1] = P(0.95, 0.012);
    B.quad('solid', [a1[0], a1[1], 0.035], [b1[0], b1[1], 0.035], [b0[0], b0[1], 0.035], [a0[0], a0[1], 0.035], c);
    B.quad('solid', [a0[0], a0[1], 0.031], [b0[0], b0[1], 0.031], [b1[0], b1[1], 0.031], [a1[0], a1[1], 0.031], c);
    const [t0, t1] = P(0.95, 0.012), [m0, m1] = P(0.85, 0.016);
    B.quad('solid', [m1[0], m1[1], 0.036], [t1[0], t1[1], 0.036], [t0[0], t0[1], 0.036], [m0[0], m0[1], 0.036], col('#d33a2c'));
    B.pop();
  }
  return packedToGeometry(B.pack().solid);
}

function bagGeometry() {
  const B = new Builder();
  B.sphere('solid', 0, 0.018, 0, 0.022, 0.02, 0.02, [1, 1, 1], 7, 4);
  B.box('solid', -0.004, 0.034, -0.004, 0.004, 0.044, 0.004, [1, 1, 1]);
  return packedToGeometry(B.pack().solid);
}

export class Markers {
  constructor(scene, game, sim, M) {
    this.game = game; this.world = game.world; this.sim = sim;
    // rotors
    this.rotCap = 200;
    this.rotors = new THREE.InstancedMesh(rotorGeometry(), M.solid, this.rotCap);
    this.rotors.count = 0; this.rotors.castShadow = true; this.rotors.frustumCulled = false;
    scene.add(this.rotors);
    this.angle = 0;
    // garbage bags
    this.bagCap = 3000;
    this.bags = new THREE.InstancedMesh(bagGeometry(), M.solid, this.bagCap);
    this.bags.count = 0; this.bags.castShadow = true; this.bags.frustumCulled = false;
    this.bags.setColorAt(0, new THREE.Color());
    scene.add(this.bags);
    // floating icons
    this.iconCap = 1500;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.iconCap * 3); this.icon = new Float32Array(this.iconCap); this.phase = new Float32Array(this.iconCap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('icon', new THREE.BufferAttribute(this.icon, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('phase', new THREE.BufferAttribute(this.phase, 1).setUsage(THREE.DynamicDrawUsage));
    this.uni = { uMap: { value: iconAtlas() }, uN: { value: ICONS.length }, uTime: { value: 0 }, uSize: { value: 26 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uni, transparent: true, depthWrite: false, depthTest: false }));
    this.points.frustumCulled = false; this.points.renderOrder = 9;
    this.geo = g;
    scene.add(this.points);
    this.timer = 0;
    this.show = true;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
  }

  // which problem to show above a building (most urgent first)
  problem(b, calls) {
    if (b.state !== 'done') return -1;
    const S = SERVICES[b.type];
    if (calls.has(b.id)) return 3;
    if (b.abandoned) return 5;
    if (S) {
      if (S.power && S.power.ptype !== 'battery' && b.gridless) return 6;
      if (S.sub && b.hv < 0) return 6;
      if (S.waste && this.sim.waste.isFull(b)) return 7;
      if (b.rc < 0 && !S.noRoad) return 6;
    }
    if (b.pw === 0) return 0;
    if (b.wt === 0) return 1;
    if (b.kind !== 'svc' && garbageDays(b) > 3) return 2;
    if (b.kind !== 'svc' && (b.mood ?? 60) < 28) return 4;
    return -1;
  }

  update(dt, view, pixelRatio) {
    const w = this.world;
    // ---- rotors turn with the wind
    const wind = this.sim.util.wind ?? 0.5;
    this.angle += dt * (0.4 + wind * 3.2) * (this.sim.speed ? 1 : 0.15);
    const { m, q, e, v, s } = this;
    let n = 0;
    for (const b of w.buildings.values()) {
      if (!b.rotors || b.state !== 'done') continue;
      for (const r of b.rotors) {
        if (n >= this.rotCap) break;
        e.set(0, r.yaw, this.angle + b.id, 'YXZ'); q.setFromEuler(e);
        v.set(r.x, r.y, r.z);
        m.compose(v, q, s);
        this.rotors.setMatrixAt(n++, m);
      }
    }
    this.rotors.count = n;
    this.rotors.instanceMatrix.needsUpdate = true;
    // ---- icons bob every frame, contents refresh twice a second
    this.uni.uTime.value += dt;
    this.uni.uSize.value = Math.round(clampN(view.ppu * 0.55, 18, 30) * pixelRatio);
    this.points.visible = this.show && view.ppu > 7;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const calls = new Set(this.sim.safety.calls.filter((c) => c.state !== 'done').map((c) => c.b));
    let k = 0;
    const c = new THREE.Color();
    let nb = 0;
    const bagCols = [col('#2b2b2b'), col('#3f444a'), col('#e6b422'), col('#5a6b3a'), col('#1f3d6b')];
    for (const b of w.buildings.values()) {
      if (b.state !== 'done') continue;
      const near = Math.abs(b.x - view.x) < view.r * 1.2 && Math.abs(b.z - view.z) < view.r * 1.2;
      if (!near) continue;
      const p = this.problem(b, calls);
      if (p >= 0 && k < this.iconCap) {
        this.pos[k * 3] = b.x + b.w / 2; this.pos[k * 3 + 1] = (b.height || 0.5) + 0.22; this.pos[k * 3 + 2] = b.z + b.h / 2;
        this.icon[k] = p; this.phase[k] = b.id * 1.7;
        k++;
      }
      // garbage bags at the kerb
      const gd = b.kind === 'svc' ? 0 : garbageDays(b);
      if (gd > 1.2 && b.door) {
        const cnt = Math.min(7, Math.floor(gd * (b.w * b.h > 1 ? 2 : 1)));
        const fx = b.x + b.w / 2 - b.door[0], fz = b.z + b.h / 2 - b.door[1];
        const l = Math.hypot(fx, fz) || 1;
        const tx = -fz / l, tz = fx / l;
        for (let i = 0; i < cnt && nb < this.bagCap; i++) {
          const o = 0.1 + (i % 4) * 0.045, row = Math.floor(i / 4);
          v.set(b.door[0] + tx * o - fx / l * (0.02 + row * 0.04), 0.01 + row * 0.02, b.door[1] + tz * o - fz / l * (0.02 + row * 0.04));
          e.set(0, b.id + i, 0); q.setFromEuler(e); s.set(1, 1, 1);
          m.compose(v, q, s);
          this.bags.setMatrixAt(nb, m);
          const bc = bagCols[(b.id + i) % bagCols.length];
          c.setRGB(bc[0], bc[1], bc[2]);
          this.bags.setColorAt(nb, c);
          nb++;
        }
      }
    }
    this.bags.count = nb;
    this.bags.instanceMatrix.needsUpdate = true;
    if (this.bags.instanceColor) this.bags.instanceColor.needsUpdate = true;
    this.geo.setDrawRange(0, k);
    for (const a of ['position', 'icon', 'phase']) this.geo.attributes[a].needsUpdate = true;
  }
}
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
