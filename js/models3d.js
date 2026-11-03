import * as THREE from 'three';
import { hash2 } from './util.js';

// ---------------------------------------------------------------------------
// 3D models generated with Meshy (assets/models/*.glb). A tiny GLB reader is
// enough for them: one mesh with positions, normals, UVs, indices and one
// JPEG base colour texture. Every model is drawn instanced; buildings ask
// for a model through meta.model and fall back to procedural geometry when
// the file could not be loaded.
// ---------------------------------------------------------------------------

export const MODELS = {};
export const hasModel = (name) => !!MODELS[name];
export const ROUND_MODELS = ['kv_brunnen', 'kv_skulptur', 'kv_wagen'];

const COMP = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function parseGLB(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('kein GLB');
  const jl = dv.getUint32(12, true);
  const js = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binOff = 20 + jl + 8;
  const view = (i) => { const bv = js.bufferViews[i]; return { off: binOff + (bv.byteOffset || 0), len: bv.byteLength, stride: bv.byteStride || 0 }; };
  const accessor = (i) => {
    const a = js.accessors[i], v = view(a.bufferView), T = COMP[a.componentType], n = SIZE[a.type];
    const start = v.off + (a.byteOffset || 0);
    if (!v.stride || v.stride === n * T.BYTES_PER_ELEMENT) return new T(buf.slice(start, start + a.count * n * T.BYTES_PER_ELEMENT));
    const out = new T(a.count * n), src = new DataView(buf);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = T === Float32Array ? src.getFloat32(start + k * v.stride + c * 4, true) : src.getUint32(start + k * v.stride + c * 4, true);
    return out;
  };
  const prim = js.meshes[0].primitives[0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(accessor(prim.attributes.POSITION), 3));
  if (prim.attributes.NORMAL !== undefined) g.setAttribute('normal', new THREE.BufferAttribute(accessor(prim.attributes.NORMAL), 3));
  if (prim.attributes.TEXCOORD_0 !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(accessor(prim.attributes.TEXCOORD_0), 2));
  if (prim.indices !== undefined) g.setIndex(new THREE.BufferAttribute(accessor(prim.indices), 1));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.computeBoundingBox();
  let image = null;
  const mi = prim.material ?? 0;
  const tex = js.materials?.[mi]?.pbrMetallicRoughness?.baseColorTexture;
  if (tex !== undefined && js.textures) {
    const im = js.images[js.textures[tex.index].source], v = view(im.bufferView);
    image = new Blob([new Uint8Array(buf, v.off, v.len)], { type: im.mimeType || 'image/jpeg' });
  }
  return { g, image };
}

function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Textur fehlt')); };
    im.src = url;
  });
}

// loads all models listed in assets/models/models.json; missing ones are skipped
export async function loadModels(base = 'assets/') {
  let list;
  try { const r = await fetch(`${base}models/models.json`); if (!r.ok) return; list = await r.json(); } catch (e) { return; }
  await Promise.all(Object.keys(list).map(async (name) => {
    try {
      const r = await fetch(`${base}models/${list[name].file}`);
      if (!r.ok) return;
      const { g, image } = parseGLB(await r.arrayBuffer());
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02, color: 0xd6d6d6 });
      if (image) {
        const t = new THREE.Texture(await loadImage(image));
        t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
        mat.map = t;
      }
      MODELS[name] = { g, mat, box: g.boundingBox };
    } catch (e) { console.warn('Modell nicht geladen:', name, e); }
  }));
}

// instanced placement of all models (buildings with b.model and roundabout islands)
export class ModelLayer {
  constructor(scene, game) {
    this.scene = scene; this.game = game; this.world = game.world;
    this.meshes = {};
    this.key = '';
    for (const name in MODELS) {
      const M = MODELS[name];
      const im = new THREE.InstancedMesh(M.g, M.mat, name.startsWith('kv_') ? 400 : 200);
      im.count = 0; im.castShadow = true; im.receiveShadow = true;
      scene.add(im);
      this.meshes[name] = im;
    }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  // world transform: centre x/z, ground y, yaw, footprint fit (max width) in tiles
  place(name, x, y, z, yaw, fit, counts) {
    const im = this.meshes[name];
    if (!im || counts[name] >= im.instanceMatrix.count) return;
    const b = MODELS[name].box;
    const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    const k = fit / w;
    const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2;
    this.e.set(0, yaw, 0); this.q.setFromEuler(this.e);
    // centre the footprint, put the lowest point on the ground
    this.v.set(-cx * k, -b.min.y * k, -cz * k).applyQuaternion(this.q);
    this.v.x += x; this.v.y += y; this.v.z += z;
    this.s.set(k, k, k);
    this.m.compose(this.v, this.q, this.s);
    im.setMatrixAt(counts[name]++, this.m);
  }
  update(view) {
    // the small roundabout sculptures only show when zoomed in
    if (view) for (const n of ROUND_MODELS) if (this.meshes[n]) this.meshes[n].visible = view.ppu > 11;
    const w = this.world;
    const key = `${w.version}|${w.bver}|${this.game.modelVersion || 0}`;
    if (key === this.key) return;
    this.key = key;
    const counts = {};
    for (const n in this.meshes) counts[n] = 0;
    for (const b of w.buildings.values()) {
      if (b.state !== 'done' || !b.model) continue;
      const md = b.model;
      this.place(md.name, md.x, md.y || 0, md.z, md.a, md.fit, counts);
    }
    // roundabout islands
    const kinds = ROUND_MODELS.filter((n) => this.meshes[n]);
    if (kinds.length) {
      for (let z = 0; z < w.N; z++) for (let x = 0; x < w.N; x++) {
        if (w.control(x, z) !== 2) continue;
        const n = kinds[Math.floor(hash2(x, z, 31) * kinds.length)];
        this.place(n, x + 0.5, 0.03, z + 0.5, hash2(x, z, 32) * Math.PI * 2, 0.35, counts);
      }
    }
    for (const n in this.meshes) {
      const im = this.meshes[n];
      im.count = counts[n];
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
}
