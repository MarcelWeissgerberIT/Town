import * as THREE from 'three';
import { vehicleMaterial } from './vehicles.js';

// shared uniforms driven by the day/night cycle
export const U = {
  uLight: { value: 0 },   // 0 = day; windows with aLit <= uLight are lit
  uGlow: { value: 0 },    // overall intensity of artificial light
  uTime: { value: 0 },
};

function litInject(mat, mode) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLight = U.uLight;
    sh.uniforms.uGlow = U.uGlow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit;\nvarying float vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
    let inj;
    if (mode === 'atlas') {
      inj = '#include <emissivemap_fragment>\n totalEmissiveRadiance *= uGlow * step(vLit, uLight) * step(0.0001, vLit);';
    } else {
      inj = '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 2.2 * uGlow * step(vLit, uLight);';
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLight;\nuniform float uGlow;\nvarying float vLit;')
      .replace('#include <emissivemap_fragment>', inj);
  };
  mat.customProgramCacheKey = () => 'lit-' + mode;
}

// dissolve via a per-instance aFade attribute (0 visible .. 1 gone); meshes
// without the attribute read 0 and stay fully visible
export function withFade(mat, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('void main() {', 'void main() {\n  if (vFade > 0.0 && vFade >= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;');
  };
  const k = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => `${k}-fade-${key}`;
  return mat;
}
// tints the plaster where the ORM red channel holds the plaster mask (vertex colour = tint)
function withTint(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `
#ifdef USE_COLOR
  float tintMask = texture2D( roughnessMap, vRoughnessMapUv ).r;
  diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, tintMask );
#endif`);
  };
  const k = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => `${k}-tint`;
  return mat;
}
export function fadeDepthMaterial() {
  return withFade(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'depth');
}
export function glowMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffffff });
  litInject(m, 'glow');
  return m;
}

export function makeMaterials(T) {
  const A = T.atlas;
  const M = {};
  M.facade = new THREE.MeshStandardMaterial({
    map: A.map, emissiveMap: A.emissive, emissive: 0xffffff, emissiveIntensity: 1.0,
    roughnessMap: A.orm, metalnessMap: A.orm, roughness: 1, metalness: 1, vertexColors: true,
  });
  litInject(M.facade, 'atlas');
  withTint(M.facade);
  M.roof = new THREE.MeshStandardMaterial({ map: T.roofTile, vertexColors: true, roughness: 0.82 });
  M.slate = new THREE.MeshStandardMaterial({ map: T.roofSlate || T.roofTile, vertexColors: true, roughness: 0.6, metalness: 0.05 });
  M.pantile = new THREE.MeshStandardMaterial({ map: T.roofPantile || T.roofTile, vertexColors: true, roughness: 0.8 });
  M.thatch = new THREE.MeshStandardMaterial({ map: T.roofThatch || T.roofTile, vertexColors: true, roughness: 0.95, color: T.roofThatch ? 0xffffff : 0xb39a6a });
  M.shingle = new THREE.MeshStandardMaterial({ map: T.roofShingle || T.roofTile, vertexColors: true, roughness: 0.85, color: T.roofShingle ? 0xffffff : 0x8f877c });
  M.greenroof = new THREE.MeshStandardMaterial({ map: T.roofGreen || T.grass, vertexColors: true, roughness: 0.95 });
  M.metal = new THREE.MeshStandardMaterial({ map: T.roofMetal, vertexColors: true, roughness: 0.42, metalness: 0.55 });
  M.flat = new THREE.MeshStandardMaterial({ map: T.gravel, vertexColors: true, roughness: 0.95 });
  M.solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  M.shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.45 });
  M.glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.7 });
  M.glow = glowMaterial();
  M.grass = new THREE.MeshStandardMaterial({ map: T.grass, vertexColors: true, roughness: 0.96 });
  M.cobble = new THREE.MeshStandardMaterial({ map: T.cobble, vertexColors: true, roughness: 0.9 });
  M.asphalt = new THREE.MeshStandardMaterial({ map: T.asphalt, vertexColors: true, roughness: 0.88 });
  M.dirt = new THREE.MeshStandardMaterial({ map: T.dirt, vertexColors: true, roughness: 0.97 });
  M.sand = new THREE.MeshStandardMaterial({ map: T.sand, vertexColors: true, roughness: 0.97 });
  M.field = new THREE.MeshStandardMaterial({ map: T.field, vertexColors: true, roughness: 0.97 });
  if (T.leaves) {
    T.leaves.repeat.set(3, 2); T.needles.repeat.set(3, 2);
    // photographic ground: finer repeats so grass blades and stones keep a believable size
    T.grass.repeat.set(2.6, 2.6); T.cobble.repeat.set(1.8, 1.8); T.dirt.repeat.set(1.6, 1.6); T.asphalt.repeat.set(1.4, 1.4); T.gravel.repeat.set(2, 2);
    M.foliage = new THREE.MeshStandardMaterial({ map: T.leaves, vertexColors: true, roughness: 0.85 });
    M.needles = new THREE.MeshStandardMaterial({ map: T.needles, vertexColors: true, roughness: 0.9 });
    const hedgeTex = T.leaves.clone(); hedgeTex.repeat.set(1, 1); hedgeTex.needsUpdate = true;
    M.hedge = new THREE.MeshStandardMaterial({ map: hedgeTex, vertexColors: true, roughness: 0.9 });
  } else {
    M.hedge = M.grass;
  }
  M.veh = vehicleMaterial({ map: T.veh, orm: T.vehOrm });
  M.beacon = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1 });
  M.ao = new THREE.MeshBasicMaterial({ map: T.ao, transparent: true, depthWrite: false, opacity: 0.55, color: 0x000000 });
  M.ao.color.set(0x1a1410);
  M.water = new THREE.MeshStandardMaterial({
    color: 0x2f7f9c, roughness: 0.3, metalness: 0.05, normalMap: T.waterNormal,
    normalScale: new THREE.Vector2(0.28, 0.28), envMapIntensity: 0.6,
  });
  M.water.normalMap.repeat.set(0.25, 0.25);
  return M;
}

// a soft sky environment for reflections (glass towers, cars, water)
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      float h = normalize(vP).y;
      vec3 sky = mix(vec3(0.95,0.86,0.72), vec3(0.42,0.62,0.86), smoothstep(0.0, 0.6, h));
      vec3 ground = mix(vec3(0.55,0.6,0.42), vec3(0.32,0.36,0.26), smoothstep(0.0,-0.5,h));
      vec3 c = h > 0.0 ? sky : ground;
      float sun = pow(max(dot(normalize(vP), normalize(vec3(-0.5,0.6,-0.4))),0.0), 64.0);
      gl_FragColor = vec4(c + vec3(1.0,0.9,0.7)*sun*3.0, 1.0);
    }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  return rt.texture;
}
