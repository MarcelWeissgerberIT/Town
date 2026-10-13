import * as THREE from 'three';

// Translucent tile markers used while drawing roads, zones or placing buildings.
export class Overlay {
  constructor(scene) {
    const g = new THREE.PlaneGeometry(0.94, 0.94); g.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, depthTest: true });
    this.mesh = new THREE.InstancedMesh(g, this.mat, 4096);
    this.mesh.count = 0; this.mesh.renderOrder = 5; this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    const ag = new THREE.ConeGeometry(0.12, 0.3, 3); ag.rotateX(Math.PI / 2);
    this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
    this.arrow.visible = false; this.arrow.renderOrder = 6;
    scene.add(this.arrow);
    this.m = new THREE.Matrix4(); this.c = new THREE.Color();
  }
  set(tiles, color, y = 0.05) {
    let n = 0;
    for (const t of tiles) {
      if (n >= 4096) break;
      this.m.makeTranslation(t[0] + 0.5, t[2] !== undefined ? t[2] : y, t[1] + 0.5);
      this.mesh.setMatrixAt(n, this.m);
      this.c.set(t[3] || color);
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  showArrow(x, z, dir, color) {
    const a = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir];
    this.arrow.position.set(x, 0.12, z);
    this.arrow.rotation.set(0, a, 0);
    this.arrow.material.color.set(color);
    this.arrow.visible = true;
  }
  clear() { this.mesh.count = 0; this.arrow.visible = false; }
}
