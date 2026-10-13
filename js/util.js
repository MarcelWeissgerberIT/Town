import * as THREE from 'three';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const randRange = (rng, a, b) => a + (b - a) * rng();
export const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, s = 0, oct = 4) {
  let f = 0, amp = 0.5, fr = 1, norm = 0;
  for (let i = 0; i < oct; i++) { f += amp * vnoise(x * fr, y * fr, s + i * 17); norm += amp; amp *= 0.5; fr *= 2; }
  return f / norm;
}

// sRGB hex -> linear rgb triple, cached
const colCache = new Map();
const tmpColor = new THREE.Color();
export function col(hex) {
  let c = colCache.get(hex);
  if (!c) { tmpColor.set(hex); c = [tmpColor.r, tmpColor.g, tmpColor.b]; colCache.set(hex, c); }
  return c;
}
export function shade(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }
export function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

export const DIRS = [
  { dx: 0, dz: -1, bit: 1 }, // N
  { dx: 1, dz: 0, bit: 2 },  // E
  { dx: 0, dz: 1, bit: 4 },  // S
  { dx: -1, dz: 0, bit: 8 }, // W
];
// local +z (front) rotated to face direction d
export const DIR_ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

export const FIRST_NAMES = ['Anna', 'Lena', 'Marie', 'Sophie', 'Emma', 'Mia', 'Hannah', 'Lea', 'Clara', 'Greta', 'Ida', 'Frieda', 'Paula', 'Johanna', 'Luise', 'Maximilian', 'Paul', 'Felix', 'Leon', 'Jonas', 'Lukas', 'Ben', 'Elias', 'Noah', 'Karl', 'Emil', 'Anton', 'Theo', 'Jakob', 'Moritz', 'Ingrid', 'Helga', 'Ursula', 'Wolfgang', 'Klaus', 'Jürgen', 'Dieter', 'Sabine', 'Petra', 'Thomas', 'Stefan', 'Andrea', 'Fatma', 'Mehmet', 'Aylin', 'Luca', 'Mila', 'Ole', 'Finn', 'Nele'];
export const LAST_NAMES = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Lang', 'Scholz', 'Möller', 'Weiß', 'Jung', 'Hahn', 'Vogel', 'Friedrich', 'Keller', 'Günther', 'Berger', 'Winkler', 'Roth', 'Beck', 'Lorenz', 'Baumann', 'Franke', 'Albrecht', 'Yılmaz', 'Kaya', 'Nowak'];

export function personName(rng) {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

export function fmtNum(n) {
  return Math.round(n).toLocaleString('de-DE');
}
export function fmtMoney(n) {
  return `${Math.round(n).toLocaleString('de-DE')} €`;
}
