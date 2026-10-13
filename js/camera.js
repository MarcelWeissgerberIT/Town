import * as THREE from 'three';
import { clamp, lerp, smooth } from './util.js';

export class IsoCamera {
  constructor(N) {
    this.N = N;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
    this.target = new THREE.Vector3(N / 2, 0, N / 2);
    this.goalTarget = this.target.clone();
    this.view = 9; this.goalView = 9;          // half of the visible height in world units
    this.az = Math.PI / 4; this.goalAz = this.az;
    this.minView = 1.1; this.maxView = 42;
    this.aspect = 1;
    this.ray = new THREE.Raycaster();
    this.follow = null; // function returning a Vector3 to follow
    this.cinematic = false;
  }
  resize(w, h) { this.aspect = w / h; this.w = w; this.h = h; }
  elevation(view = this.view) { return lerp(0.52, 0.78, smooth(2, 30, view)); }

  update(dt) {
    if (this.follow) {
      const p = this.follow();
      if (p) this.goalTarget.set(p.x, 0, p.z); else this.follow = null;
    }
    if (this.cinematic) { this.goalAz += dt * 0.06; }
    const k = 1 - Math.exp(-dt * 9);
    this.view = lerp(this.view, this.goalView, k);
    this.az = lerp(this.az, this.goalAz, 1 - Math.exp(-dt * 7));
    this.target.lerp(this.goalTarget, this.follow ? 1 - Math.exp(-dt * 4) : k);
    this.place();
  }
  place() {
    const el = this.elevation();
    const d = 200;
    const c = this.cam;
    c.position.set(
      this.target.x + Math.sin(this.az) * Math.cos(el) * d,
      this.target.y + Math.sin(el) * d,
      this.target.z + Math.cos(this.az) * Math.cos(el) * d);
    c.up.set(0, 1, 0);
    c.lookAt(this.target);
    const v = this.view;
    c.left = -v * this.aspect; c.right = v * this.aspect; c.top = v; c.bottom = -v;
    c.near = 1; c.far = 600;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }
  // pixels per world unit
  ppu() { return this.h / (2 * this.view); }

  ground(px, py, y = 0) {
    const ndc = new THREE.Vector2((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    const r = this.ray.ray;
    if (Math.abs(r.direction.y) < 1e-6) return null;
    const t = (y - r.origin.y) / r.direction.y;
    return r.origin.clone().addScaledVector(r.direction, t);
  }
  rayAt(px, py) {
    const ndc = new THREE.Vector2((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    return this.ray.ray;
  }
  clampTarget(t) {
    const m = 6;
    t.x = clamp(t.x, -m, this.N + m); t.z = clamp(t.z, -m, this.N + m);
  }
  // keep the ground point under the cursor fixed while zooming
  zoomAt(factor, px, py) {
    const before = this.ground(px, py);
    this.goalView = clamp(this.goalView * factor, this.minView, this.maxView);
    if (!before || this.follow) return;
    // estimate after-zoom position using the goal state
    const saveV = this.view, saveT = this.target.clone();
    this.view = this.goalView; this.target.copy(this.goalTarget); this.place();
    const after = this.ground(px, py);
    this.view = saveV; this.target.copy(saveT); this.place();
    if (after) { this.goalTarget.add(before.sub(after)); this.clampTarget(this.goalTarget); }
  }
  panPixels(dx, dy) {
    this.follow = null;
    const s = (2 * this.view) / this.h;
    const el = this.elevation();
    const right = new THREE.Vector3(Math.cos(this.az), 0, -Math.sin(this.az));
    const fwd = new THREE.Vector3(-Math.sin(this.az), 0, -Math.cos(this.az));
    this.goalTarget.addScaledVector(right, -dx * s);
    this.goalTarget.addScaledVector(fwd, dy * s / Math.sin(el));
    this.clampTarget(this.goalTarget);
  }
  snapPan() { this.target.copy(this.goalTarget); }
  rotate(steps) { this.goalAz += steps * Math.PI / 2; }
  rotateBy(rad) { this.goalAz += rad; this.az += rad; }
  lookAt(x, z, view) {
    this.follow = null;
    this.goalTarget.set(x, 0, z);
    if (view) this.goalView = clamp(view, this.minView, this.maxView);
  }
}
