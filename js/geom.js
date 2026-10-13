import * as THREE from 'three';

// Geometry is accumulated into named buckets (one material each) and later
// packed into typed arrays so that chunks can concatenate them cheaply.
class Bucket {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.l = []; this.i = []; }
  get vcount() { return this.p.length / 3; }
}

const WHITE = [1, 1, 1];

export class Builder {
  constructor() {
    this.buckets = {};
    this.setXform(0, 0, 0, 0);
  }
  B(name) { return this.buckets[name] || (this.buckets[name] = new Bucket()); }
  // nested local frames
  push(lx, lz, a = 0, ly = 0) {
    (this._stack || (this._stack = [])).push([this.ox, this.oy, this.oz, this.ang]);
    const wx = this.wx(lx, lz), wz = this.wz(lx, lz);
    this.setXform(wx, this.oy + ly, wz, this.ang + a);
  }
  pop() { const s = this._stack.pop(); this.setXform(s[0], s[1], s[2], s[3]); }
  setXform(ox, oy, oz, ang) {
    this.ox = ox; this.oy = oy; this.oz = oz; this.ang = ang;
    this.cs = Math.cos(ang); this.sn = Math.sin(ang);
  }
  // local -> world helpers (rotation about y)
  wx(x, z) { return x * this.cs + z * this.sn + this.ox; }
  wz(x, z) { return -x * this.sn + z * this.cs + this.oz; }

  _v(b, x, y, z, nx, ny, nz, u, v, c, lit) {
    const cs = this.cs, sn = this.sn;
    b.p.push(x * cs + z * sn + this.ox, y + this.oy, -x * sn + z * cs + this.oz);
    b.n.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
    b.uv.push(u, v);
    b.c.push(c[0], c[1], c[2]);
    b.l.push(lit);
  }

  // p0..p3 counter-clockwise seen from the front side
  quad(bn, p0, p1, p2, p3, c = WHITE, uv = null, lit = 0) {
    const b = this.B(bn);
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    const base = b.vcount;
    const u = uv || [0, 0, 1, 0, 1, 1, 0, 1];
    this._v(b, p0[0], p0[1], p0[2], nx, ny, nz, u[0], u[1], c, lit);
    this._v(b, p1[0], p1[1], p1[2], nx, ny, nz, u[2], u[3], c, lit);
    this._v(b, p2[0], p2[1], p2[2], nx, ny, nz, u[4], u[5], c, lit);
    this._v(b, p3[0], p3[1], p3[2], nx, ny, nz, u[6], u[7], c, lit);
    b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(bn, p0, p1, p2, c = WHITE, uv = null, lit = 0) {
    const b = this.B(bn);
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    const base = b.vcount;
    const u = uv || [0, 0, 1, 0, 0.5, 1];
    this._v(b, p0[0], p0[1], p0[2], nx, ny, nz, u[0], u[1], c, lit);
    this._v(b, p1[0], p1[1], p1[2], nx, ny, nz, u[2], u[3], c, lit);
    this._v(b, p2[0], p2[1], p2[2], nx, ny, nz, u[4], u[5], c, lit);
    b.i.push(base, base + 1, base + 2);
  }

  // horizontal rectangle (top facing) with world-ish UV scale s
  rect(bn, x0, z0, x1, z1, y, c = WHITE, s = 1, lit = 0) {
    const uv = [x0 / s, -z1 / s, x1 / s, -z1 / s, x1 / s, -z0 / s, x0 / s, -z0 / s];
    this.quad(bn, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c, uv, lit);
  }

  // axis aligned box in local space. opts: {bottom, top, s (uv scale), faces:{n,e,s,w}}
  box(bn, x0, y0, z0, x1, y1, z1, c = WHITE, opts = {}) {
    const s = opts.s || 1;
    const lit = opts.lit || 0;
    const ct = opts.top || c;
    if (opts.noTop !== true) {
      this.quad(bn, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], ct,
        [x0 / s, -z1 / s, x1 / s, -z1 / s, x1 / s, -z0 / s, x0 / s, -z0 / s], lit);
    }
    const h0 = y0 / s, h1 = y1 / s;
    // front +z
    this.quad(bn, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c, [x0 / s, h0, x1 / s, h0, x1 / s, h1, x0 / s, h1], lit);
    // back -z
    this.quad(bn, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c, [-x1 / s, h0, -x0 / s, h0, -x0 / s, h1, -x1 / s, h1], lit);
    // right +x
    this.quad(bn, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], c, [-z1 / s, h0, -z0 / s, h0, -z0 / s, h1, -z1 / s, h1], lit);
    // left -x
    this.quad(bn, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], c, [z0 / s, h0, z1 / s, h0, z1 / s, h1, z0 / s, h1], lit);
    if (opts.bottom) this.quad(bn, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], c, null, lit);
  }

  // box rotated around its own vertical axis by angle a (radians), centered at cx,cz
  rbox(bn, cx, y0, cz, sx, y1, sz, a, c, opts = {}) {
    this.push(cx, cz, a);
    this.box(bn, -sx / 2, y0, -sz / 2, sx / 2, y1, sz / 2, c, opts);
    this.pop();
  }

  // cylinder / frustum along y
  cyl(bn, cx, y0, cz, r0, h, seg, c = WHITE, opts = {}) {
    const r1 = opts.r1 !== undefined ? opts.r1 : r0;
    const y1 = y0 + h;
    const ct = opts.top || c;
    const lit = opts.lit || 0;
    const b = this.B(bn);
    const slope = (r0 - r1) / h;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const base = b.vcount;
      const nl = Math.hypot(1, slope);
      // smooth normals
      this._v(b, cx + c0 * r0, y0, cz + s0 * r0, c0 / nl, slope / nl, s0 / nl, k / seg, 0, c, lit);
      this._v(b, cx + c1 * r0, y0, cz + s1 * r0, c1 / nl, slope / nl, s1 / nl, (k + 1) / seg, 0, c, lit);
      this._v(b, cx + c1 * r1, y1, cz + s1 * r1, c1 / nl, slope / nl, s1 / nl, (k + 1) / seg, 1, c, lit);
      this._v(b, cx + c0 * r1, y1, cz + s0 * r1, c0 / nl, slope / nl, s0 / nl, k / seg, 1, c, lit);
      b.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    if (opts.cap !== false && r1 > 0.0001) {
      const base = b.vcount;
      this._v(b, cx, y1, cz, 0, 1, 0, 0.5, 0.5, ct, lit);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        this._v(b, cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, ct, lit);
      }
      for (let k = 0; k < seg; k++) b.i.push(base, base + k + 2, base + k + 1);
    }
  }

  // low poly sphere / ellipsoid
  sphere(bn, cx, cy, cz, rx, ry, rz, c = WHITE, seg = 8, rings = 5, opts = {}) {
    const b = this.B(bn);
    const base = b.vcount;
    const lit = opts.lit || 0;
    const half = opts.half ? 1 : 0;
    const r0 = half ? Math.floor(rings / 2) : 0;
    for (let r = r0; r <= rings; r++) {
      const v = r / rings; const phi = v * Math.PI;
      const y = Math.cos(phi), rr = Math.sin(phi);
      for (let k = 0; k <= seg; k++) {
        const th = (k / seg) * Math.PI * 2;
        const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
        const shadeF = opts.grad ? (0.72 + 0.28 * (y * 0.5 + 0.5)) : 1;
        this._v(b, cx + x * rx, cy + y * ry, cz + z * rz, x, y, z, k / seg, v, [c[0] * shadeF, c[1] * shadeF, c[2] * shadeF], lit);
      }
    }
    const rowLen = seg + 1;
    for (let r = 0; r < rings - r0; r++) {
      for (let k = 0; k < seg; k++) {
        const a = base + r * rowLen + k, bb = a + rowLen;
        b.i.push(a, a + 1, bb, a + 1, bb + 1, bb);
      }
    }
  }

  // Pack buckets into typed arrays
  pack() {
    const out = {};
    for (const k in this.buckets) {
      const b = this.buckets[k];
      if (!b.p.length) continue;
      out[k] = {
        p: new Float32Array(b.p), n: new Float32Array(b.n), uv: new Float32Array(b.uv),
        c: new Float32Array(b.c), l: new Float32Array(b.l), i: new Uint32Array(b.i),
      };
    }
    return out;
  }
}

// concatenates several packed results into one packed result per bucket
export function concatPacked(list) {
  const sizes = {};
  for (const pk of list) {
    if (!pk) continue;
    for (const k in pk) {
      const s = sizes[k] || (sizes[k] = { v: 0, i: 0 });
      s.v += pk[k].p.length / 3; s.i += pk[k].i.length;
    }
  }
  const out = {};
  for (const k in sizes) {
    const s = sizes[k];
    const o = out[k] = {
      p: new Float32Array(s.v * 3), n: new Float32Array(s.v * 3), uv: new Float32Array(s.v * 2),
      c: new Float32Array(s.v * 3), l: new Float32Array(s.v), i: new Uint32Array(s.i),
    };
    let vo = 0, io = 0;
    for (const pk of list) {
      if (!pk || !pk[k]) continue;
      const g = pk[k];
      const vc = g.p.length / 3;
      o.p.set(g.p, vo * 3); o.n.set(g.n, vo * 3); o.uv.set(g.uv, vo * 2); o.c.set(g.c, vo * 3); o.l.set(g.l, vo);
      const gi = g.i;
      for (let j = 0; j < gi.length; j++) o.i[io + j] = gi[j] + vo;
      vo += vc; io += gi.length;
    }
  }
  return out;
}

export function packedToGeometry(g) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.p, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.n, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(g.c, 3));
  geo.setAttribute('aLit', new THREE.BufferAttribute(g.l, 1));
  geo.setIndex(new THREE.BufferAttribute(g.i, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// geometry for instanced meshes (built in local space with a builder)
export function builderToGeometry(builder, bucket = 'solid') {
  const pk = builder.pack();
  if (!pk[bucket]) return new THREE.BufferGeometry();
  return packedToGeometry(pk[bucket]);
}
