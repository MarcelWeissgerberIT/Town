import * as THREE from 'three';
import { U } from './materials.js';

const VS = `
attribute float size; attribute float alpha; attribute vec3 pcol;
uniform float uPPU;
varying float vA; varying vec3 vC;
void main(){
  vA = alpha; vC = pcol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, size * uPPU);
}`;
const FS = `
uniform sampler2D uMap; varying float vA; varying vec3 vC;
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vC, t.a * vA);
  if (gl_FragColor.a < 0.01) discard;
}`;

class System {
  constructor(scene, map, cap, additive) {
    this.cap = cap; this.n = 0;
    this.p = []; // particle objects
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uni = { uPPU: { value: 50 }, uMap: { value: map } };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, uniforms: this.uni, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.geo = g;
    scene.add(this.points);
  }
  add(o) { if (this.p.length < this.cap) this.p.push(o); }
  update(dt, ppu) {
    this.uni.uPPU.value = ppu;
    const alive = [];
    for (const o of this.p) {
      o.age += dt;
      if (o.age >= o.life) continue;
      o.vy += (o.g || 0) * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.drag) { o.vx *= 1 - o.drag * dt; o.vz *= 1 - o.drag * dt; }
      alive.push(o);
    }
    this.p = alive;
    const n = Math.min(alive.length, this.cap);
    for (let i = 0; i < n; i++) {
      const o = alive[i], k = o.age / o.life;
      this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
      const c = o.c, c2 = o.c2 || o.c;
      this.col[i * 3] = c[0] + (c2[0] - c[0]) * k; this.col[i * 3 + 1] = c[1] + (c2[1] - c[1]) * k; this.col[i * 3 + 2] = c[2] + (c2[2] - c[2]) * k;
      this.size[i] = o.s0 + (o.s1 - o.s0) * k;
      const fadeIn = Math.min(1, o.age / (o.fadeIn || 0.0001));
      this.alpha[i] = o.a * fadeIn * (1 - k) * (o.flick ? 0.7 + Math.random() * 0.3 : 1);
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'pcol', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class FX {
  constructor(scene, T) {
    this.soft = new System(scene, T.soft, 2500, false);
    this.glow = new System(scene, T.glow, 1500, true);
    this.acc = new Map();
    this.wind = [0.05, 0.02];
  }
  rate(key, perSec, dt) {
    const a = (this.acc.get(key) || 0) + perSec * dt;
    const n = Math.floor(a);
    this.acc.set(key, a - n);
    return n;
  }
  smoke(x, y, z, dark = false) {
    const g = dark ? 0.25 : 0.82 + Math.random() * 0.1;
    this.soft.add({ x: x + (Math.random() - 0.5) * 0.03, y, z: z + (Math.random() - 0.5) * 0.03, vx: this.wind[0] + (Math.random() - 0.5) * 0.02, vy: 0.11 + Math.random() * 0.05, vz: this.wind[1], age: 0, life: 5 + Math.random() * 2, s0: 0.07, s1: 0.42, a: dark ? 0.6 : 0.42, c: [g, g, g * 1.02], c2: [g * 0.9, g * 0.9, g * 0.95], fadeIn: 0.4 });
  }
  dust(x, z, r = 0.3) {
    this.soft.add({ x: x + (Math.random() - 0.5) * r, y: 0.03, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 0.05, vy: 0.03 + Math.random() * 0.03, vz: (Math.random() - 0.5) * 0.05, age: 0, life: 2 + Math.random(), s0: 0.04, s1: 0.18, a: 0.32, c: [0.8, 0.7, 0.58], fadeIn: 0.3 });
  }
  water(x, y, z) {
    const a = Math.random() * 6.28, sp = 0.06 + Math.random() * 0.05;
    this.soft.add({ x, y, z, vx: Math.cos(a) * sp, vy: 0.22 + Math.random() * 0.08, vz: Math.sin(a) * sp, g: -0.9, age: 0, life: 0.5 + Math.random() * 0.2, s0: 0.018, s1: 0.012, a: 0.85, c: [0.85, 0.94, 1.0] });
  }
  fire(x, y, z, r = 0.2) {
    this.glow.add({ x: x + (Math.random() - 0.5) * r, y: y + Math.random() * 0.05, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 0.04, vy: 0.18 + Math.random() * 0.12, vz: (Math.random() - 0.5) * 0.04, age: 0, life: 0.6 + Math.random() * 0.4, s0: 0.12, s1: 0.03, a: 0.9, c: [1.0, 0.75, 0.25], c2: [1.0, 0.25, 0.05], flick: true });
  }
  sparkle(x, y, z, c) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 6.28, b = Math.random() * 3.14, sp = 0.6 + Math.random() * 0.4;
      this.glow.add({ x, y, z, vx: Math.cos(a) * Math.sin(b) * sp, vy: Math.cos(b) * sp, vz: Math.sin(a) * Math.sin(b) * sp, g: -0.35, drag: 0.8, age: 0, life: 1.2 + Math.random() * 0.6, s0: 0.07, s1: 0.02, a: 1, c, flick: true });
    }
  }
  firework(x, z) {
    const cols = [[1, 0.3, 0.3], [0.3, 0.8, 1], [1, 0.85, 0.3], [0.6, 1, 0.4], [1, 0.4, 0.9]];
    const c = cols[Math.floor(Math.random() * cols.length)];
    const h = 2.2 + Math.random() * 1.5;
    this.glow.add({ x, y: 0.1, z, vx: 0, vy: h / 0.9, vz: 0, g: 0, age: 0, life: 0.9, s0: 0.05, s1: 0.05, a: 1, c: [1, 0.9, 0.7], onEnd: [x, h, z, c] });
  }
  beacon(x, y, z, t) {
    if (Math.sin(t * 3) > 0.6) this.glow.add({ x, y, z, vx: 0, vy: 0, vz: 0, age: 0, life: 0.06, s0: 0.25, s1: 0.25, a: U.uGlow.value * 0.9 + 0.1, c: [1, 0.15, 0.1] });
  }
  siren(x, y, z, t) {
    const on = Math.sin(t * 18) > 0;
    this.glow.add({ x, y, z, vx: 0, vy: 0, vz: 0, age: 0, life: 0.05, s0: 0.2, s1: 0.2, a: 0.9, c: on ? [0.2, 0.45, 1] : [0.05, 0.1, 0.4] });
  }
  update(dt, ppu) {
    // rockets that finished explode
    for (const o of this.glow.p) if (o.onEnd && o.age + dt >= o.life) { const [x, y, z, c] = o.onEnd; o.onEnd = null; this.sparkle(x, y, z, c); }
    this.soft.update(dt, ppu);
    this.glow.update(dt, ppu);
  }
}
