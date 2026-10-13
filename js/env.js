import * as THREE from 'three';
import { U } from './materials.js';
import { clamp, smooth, lerp } from './util.js';

// key frames over the day: [hour, sunColor, sunIntensity, skyColor, groundColor, hemiIntensity, background, exposure]
const KEYS = [
  [0, '#7f95d6', 0.28, '#24335c', '#141820', 0.42, '#141c30', 1.15],
  [4.5, '#7f95d6', 0.25, '#2b3a63', '#161a22', 0.42, '#1b2440', 1.15],
  [6.0, '#ff9d5c', 1.2, '#8fa7cf', '#5a4a3a', 0.75, '#e7a47c', 1.0],
  [7.5, '#ffd9a8', 3.0, '#c4dcf5', '#86785c', 0.8, '#cfe0ee', 1.0],
  [12, '#fff2df', 3.9, '#cfe2f8', '#8f8466', 0.85, '#d8e7f3', 1.0],
  [17, '#ffe2bb', 3.6, '#cbdff5', '#8a7c5e', 0.8, '#d6e2ee', 1.0],
  [19.2, '#ff9a55', 1.7, '#a7a6c8', '#6a5040', 0.8, '#e8a07a', 1.0],
  [20.6, '#c66a6a', 0.55, '#4b4e80', '#2a2430', 0.55, '#3a3558', 1.1],
  [22, '#7f95d6', 0.3, '#28365e', '#141820', 0.42, '#161e34', 1.15],
  [24, '#7f95d6', 0.28, '#24335c', '#141820', 0.42, '#141c30', 1.15],
];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpCol(a, b, t, out) { tmpA.set(a); tmpB.set(b); out.copy(tmpA).lerp(tmpB, t); return out; }

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality.shadows;
    const ms = quality.shadowMap || 2048;
    this.sun.shadow.mapSize.set(ms, ms);
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.012;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 260;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x8a7a5a, 1.1);
    scene.add(this.hemi);
    this.bg = new THREE.Color();
    scene.background = this.bg;
    this.hour = 10;
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
    this.extent = 20;
  }

  lightAmount(h) {
    // threshold for lit windows: 0 at day, high in the evening, fewer late at night
    if (h >= 7 && h < 17.5) return 0;
    if (h >= 17.5 && h < 20.5) return smooth(17.5, 20.5, h) * 0.9;
    if (h >= 20.5 && h < 23) return 0.9;
    if (h >= 23) return lerp(0.9, 0.55, (h - 23));
    if (h < 3) return lerp(0.55, 0.25, h / 3);
    if (h < 5.5) return lerp(0.25, 0.55, (h - 3) / 2.5);
    return lerp(0.55, 0, (h - 5.5) / 1.5);
  }

  update(hour, focus, viewSize) {
    this.hour = hour;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = clamp((hour - a[0]) / (b[0] - a[0]), 0, 1);
    lerpCol(a[1], b[1], t, this.sun.color);
    this.sun.intensity = lerp(a[2], b[2], t);
    lerpCol(a[3], b[3], t, this.hemi.color);
    lerpCol(a[4], b[4], t, this.hemi.groundColor);
    this.hemi.intensity = lerp(a[5], b[5], t);
    lerpCol(a[6], b[6], t, this.bg);
    this.renderer.toneMappingExposure = lerp(a[7], b[7], t);

    // sun path chosen so that shadows fall toward the default camera (like a
    // classic isometric illustration): from the north in the morning, the
    // west-north-west at noon and the south-west in the evening
    const day = (hour - 6) / 14;
    let dir;
    if (day > -0.02 && day < 1.02) {
      const th = 3.44 + 1.2 - 2.4 * clamp(day, 0, 1);
      const el = Math.max(0.1, Math.sin(Math.PI * clamp(day, 0, 1)) * 0.86);
      dir = new THREE.Vector3(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el));
    } else {
      // moonlight from a fixed high angle
      dir = new THREE.Vector3(-0.35, 0.85, 0.45);
    }
    dir.normalize();
    this.sunDir.copy(dir);

    const night = 1 - smooth(5.5, 7.5, hour) + smooth(18.5, 21, hour);
    U.uGlow.value = clamp(night, 0, 1);
    U.uLight.value = this.lightAmount(hour);
    this.scene.environmentIntensity = lerp(1.0, 0.18, clamp(night, 0, 1));

    // shadow frustum follows the focus point, snapped to texels to avoid shimmer
    const ext = clamp(viewSize * 1.9, 6, 42);
    this.extent = ext;
    const cam = this.sun.shadow.camera;
    if (cam.right !== ext) {
      cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.updateProjectionMatrix();
    }
    const texel = (2 * ext) / this.sun.shadow.mapSize.x;
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const up2 = new THREE.Vector3().crossVectors(dir, right).normalize();
    const fx = focus.dot(right), fy = focus.dot(up2), fz = focus.dot(dir);
    const sx = Math.round(fx / texel) * texel, sy = Math.round(fy / texel) * texel;
    const tgt = right.multiplyScalar(sx).add(up2.multiplyScalar(sy)).add(dir.clone().multiplyScalar(fz));
    this.sun.target.position.copy(tgt);
    this.sun.position.copy(tgt).addScaledVector(dir, 120);
    this.sun.target.updateMatrixWorld();
  }
}
