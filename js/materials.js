import * as THREE from 'three';

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

export function makeMaterials(T) {
  const A = T.atlas;
  const M = {};
  M.facade = new THREE.MeshStandardMaterial({
    map: A.map, emissiveMap: A.emissive, emissive: 0xffffff, emissiveIntensity: 1.0,
    roughnessMap: A.orm, metalnessMap: A.orm, roughness: 1, metalness: 1,
  });
  litInject(M.facade, 'atlas');
  M.roof = new THREE.MeshStandardMaterial({ map: T.roofTile, vertexColors: true, roughness: 0.82 });
  M.metal = new THREE.MeshStandardMaterial({ map: T.roofMetal, vertexColors: true, roughness: 0.42, metalness: 0.55 });
  M.flat = new THREE.MeshStandardMaterial({ map: T.gravel, vertexColors: true, roughness: 0.95 });
  M.solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  M.shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.45 });
  M.glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.7 });
  M.glow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffffff });
  litInject(M.glow, 'glow');
  M.grass = new THREE.MeshStandardMaterial({ map: T.grass, vertexColors: true, roughness: 0.96 });
  M.cobble = new THREE.MeshStandardMaterial({ map: T.cobble, vertexColors: true, roughness: 0.9 });
  M.asphalt = new THREE.MeshStandardMaterial({ map: T.asphalt, vertexColors: true, roughness: 0.88 });
  M.dirt = new THREE.MeshStandardMaterial({ map: T.dirt, vertexColors: true, roughness: 0.97 });
  M.sand = new THREE.MeshStandardMaterial({ map: T.sand, vertexColors: true, roughness: 0.97 });
  M.field = new THREE.MeshStandardMaterial({ map: T.field, vertexColors: true, roughness: 0.97 });
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
