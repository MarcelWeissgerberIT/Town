import * as THREE from 'three';
import { SERVICES, STAGES, GROW, COSTS, ZONE_INFO, ZONE_KEYS } from './config.js';
import { fmtNum, fmtMoney, clamp, DIRS } from './util.js';
import { siteStage, SITE_STAGES } from './construction.js';

const $ = (id) => document.getElementById(id);
const icon = (id, cls = 'ic') => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TOOLS = [
  { id: 'inspect', label: 'Ansehen', icon: 'i-cursor', key: '1', hint: 'Klicke auf Häuser, Menschen oder Fahrzeuge. <b>Ziehen</b> verschiebt die Karte.' },
  { id: 'road', label: 'Straße', icon: 'i-road', key: '2', hint: '<b>Ziehen</b>, um eine Straße zu bauen · 25 € pro Feld, Brücken 180 €' },
  { id: 'zone1', label: 'Wohnen', icon: 'i-home', key: '3', zone: 1, color: 'var(--res)', hint: '<b>Fläche aufziehen</b>. An Straßen entstehen Häuser, sobald Nachfrage besteht.' },
  { id: 'zone2', label: 'Gewerbe', icon: 'i-shop', key: '4', zone: 2, color: 'var(--com)', hint: '<b>Fläche aufziehen</b> für Läden, Cafés und später Kaufhäuser und Büros.' },
  { id: 'zone3', label: 'Industrie', icon: 'i-factory', key: '5', zone: 3, color: 'var(--ind)', hint: '<b>Fläche aufziehen</b> für Werkstätten und Fabriken. Senkt den Bodenwert in der Nähe.' },
  { sep: true },
  { id: 'nature', label: 'Natur', icon: 'i-tree', key: '6', menu: ['tree', 'park', 'playground', 'plaza'] },
  { id: 'public', label: 'Gebäude', icon: 'i-civic', key: '7', menu: ['firestation', 'police', 'school', 'townhall', 'church', 'hospital', 'stadium', 'tvtower'] },
  { id: 'busstop', label: 'Bus', icon: 'i-bus', key: '8', hint: 'Auf ein <b>gerades Straßenstück</b> klicken · 250 €. Ab zwei Haltestellen fährt ein Bus.' },
  { sep: true },
  { id: 'bulldoze', label: 'Abriss', icon: 'i-bulldoze', key: '9', color: 'var(--bad)', hint: '<b>Fläche aufziehen</b>, um Straßen, Gebäude, Zonen und Bäume zu entfernen.' },
];

const KIND_NAME = { res: 'Wohnen', com: 'Gewerbe', ind: 'Industrie', svc: 'Öffentlich' };
const COVER_NAMES = { fire: 'Feuerwehr', police: 'Polizei', health: 'Gesundheit', edu: 'Bildung' };

export class UI {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.tool = 'inspect';
    this.placeType = null; this.placeRot = 2;
    this.sel = null;
    this.pointers = new Map();
    this.drag = null;
    this.hoverTile = null;
    this.keys = new Set();
    this.dayMode = 0; // 0 auto, 1 day, 2 evening, 3 night
    this.lastHud = 0;
    this.lastMini = 0;
    this.buildToolbar();
    this.bindInput();
    this.bindHud();
    this.miniCtx = $('minimap').getContext('2d');
    this.miniImg = this.miniCtx.createImageData(this.game.world.N, this.game.world.N);
    this.miniBuf = document.createElement('canvas');
    this.miniBuf.width = this.miniBuf.height = this.game.world.N;
    this.raycaster = new THREE.Raycaster();
    const ex = document.createElement('button');
    ex.className = 'btn cinema-exit'; ex.innerHTML = `${icon('i-close')}Kinomodus beenden`;
    ex.onclick = () => this.setCinema(false);
    $('app').appendChild(ex);
    this.bindTouchTaps();
  }

  // On touch screens a button fires as soon as the finger lifts. Browsers sometimes
  // swallow the click that follows a map gesture; this keeps every tap reliable.
  bindTouchTaps() {
    let down = null, synthEl = null, synthAt = 0;
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { down = null; return; }
      const b = e.target.closest?.('button, .toast');
      down = b ? { b, x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    }, true);
    document.addEventListener('pointerup', (e) => {
      const d = down; down = null;
      if (!d || e.pointerId !== d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return;
      if (!d.b.contains(document.elementFromPoint(e.clientX, e.clientY))) return;
      synthEl = d.b; synthAt = performance.now();
      d.b.click();
    }, true);
    document.addEventListener('click', (e) => {
      if (e.isTrusted && synthEl && performance.now() - synthAt < 700 && synthEl.contains(e.target)) {
        e.stopPropagation(); e.preventDefault(); synthEl = null;
      }
    }, true);
  }

  // ------------------------------------------------------------- toolbar
  buildToolbar() {
    const tb = $('toolbar');
    tb.innerHTML = '';
    for (const t of TOOLS) {
      if (t.sep) { const s = document.createElement('div'); s.className = 'sep'; tb.appendChild(s); continue; }
      const b = document.createElement('button');
      b.className = 'tool'; b.dataset.tool = t.id;
      b.title = `${t.label} (${t.key})`;
      if (t.color) b.style.setProperty('--tc', t.color);
      b.innerHTML = `${icon(t.icon)}<span>${t.label}</span>${t.zone ? '<i class="dot"></i>' : ''}`;
      b.onclick = () => this.pickTool(t.id);
      tb.appendChild(b);
    }
    this.refreshToolbar();
    const fade = () => tb.classList.toggle('more', tb.scrollWidth - tb.clientWidth - tb.scrollLeft > 8);
    tb.addEventListener('scroll', fade, { passive: true });
    window.addEventListener('resize', fade);
    setTimeout(fade, 100);
  }
  refreshToolbar() {
    for (const b of document.querySelectorAll('.tool')) {
      const t = b.dataset.tool;
      const on = t === this.tool || (t === 'nature' && ['tree', 'park', 'playground', 'plaza'].includes(this.placeType) && this.tool === 'place') ||
        (t === 'public' && this.tool === 'place' && !['tree', 'park', 'playground', 'plaza'].includes(this.placeType)) || (t === 'nature' && this.tool === 'tree');
      b.classList.toggle('on', on);
    }
  }
  pickTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (t && t.menu) {
      const fly = $('flyout');
      if (!fly.hidden && fly.dataset.menu === id) { fly.hidden = true; return; }
      this.openFlyout(t);
      return;
    }
    $('flyout').hidden = true;
    this.tool = id;
    this.placeType = null;
    this.overlay.clear();
    this.refreshToolbar();
    this.setHint(t ? t.hint : '');
    if (id !== 'inspect') this.closeInfo();
  }
  openFlyout(t) {
    const fly = $('flyout');
    fly.dataset.menu = t.id;
    fly.innerHTML = '';
    const stage = this.sim.stage;
    for (const k of t.menu) {
      const b = document.createElement('button');
      b.className = 'fcard';
      if (k === 'tree') {
        b.innerHTML = `<b>Bäume pflanzen</b><span>${COSTS.tree} € pro Baum</span>`;
        b.onclick = () => { fly.hidden = true; this.tool = 'tree'; this.placeType = 'tree'; this.refreshToolbar(); this.setHint('<b>Klicken oder ziehen</b>, um Bäume zu pflanzen · 15 € pro Baum'); };
      } else {
        const S = SERVICES[k];
        const locked = stage < S.stage;
        const exists = S.unique && [...this.game.world.buildings.values()].some((x) => x.type === k);
        if (locked || exists) b.classList.add('locked');
        b.innerHTML = `<b>${S.name}</b><span>${locked ? `ab ${STAGES[S.stage].name}` : exists ? 'schon gebaut' : `${fmtMoney(S.cost)} · ${S.w}×${S.h}`}</span>`;
        b.title = S.desc;
        b.onclick = () => {
          if (locked) { this.toast(`${S.name} wird ab „${STAGES[S.stage].name}“ freigeschaltet.`, 'i-star'); return; }
          if (exists) { this.toast(`${S.name} gibt es nur einmal.`, 'i-star'); return; }
          fly.hidden = true;
          this.tool = 'place'; this.placeType = k; this.refreshToolbar();
          this.setHint(`<b>${S.name}</b> · ${fmtMoney(S.cost)} · ${esc(S.desc)} <b>R</b> dreht.`);
        };
      }
      fly.appendChild(b);
    }
    fly.hidden = false;
  }
  setHint(html) { const h = $('hint'); h.innerHTML = html || ''; h.hidden = !html || this.tool === 'inspect'; }

  // ------------------------------------------------------------- input
  tileAt(px, py) {
    const g = this.cam.ground(px, py);
    if (!g) return null;
    return [Math.floor(g.x), Math.floor(g.z)];
  }
  bindInput() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(clamp(e.deltaY, -120, 120) * 0.0016);
      this.cam.zoomAt(f, e.clientX, e.clientY);
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('pointercancel', (e) => this.up(e, true));
    cv.addEventListener('pointerleave', () => { if (!this.pointers.size && this.tool !== 'inspect') { this.overlay.clear(); } });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    $('minimap').addEventListener('pointerdown', (e) => {
      const r = e.target.getBoundingClientRect();
      const N = this.game.world.N;
      this.cam.lookAt((e.clientX - r.left) / r.width * N, (e.clientY - r.top) / r.height * N);
    });
  }
  down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 2) {
      if (this.drag && this.drag.mode === 'tool') this.cancelTool();
      const [a, b] = [...this.pointers.values()];
      this.drag = { mode: 'gesture', d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (this.pointers.size > 2) return;
    if (this.cam.cinematic) this.setCinema(false);
    if (e.button === 2) this.drag = { mode: 'rotate', x: e.clientX };
    else if (e.button === 1) this.drag = { mode: 'pan', x: e.clientX, y: e.clientY };
    else if (this.tool === 'inspect') this.drag = { mode: 'click-or-pan', x: e.clientX, y: e.clientY, moved: false };
    else {
      const t = this.tileAt(e.clientX, e.clientY);
      this.drag = { mode: 'tool', start: t, cur: t, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', planted: new Set() };
      this.toolPreview();
    }
  }
  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    const d = this.drag;
    if (!d) {
      if (e.pointerType === 'mouse' && this.tool !== 'inspect') { this.hoverTile = this.tileAt(e.clientX, e.clientY); this.toolPreview(); }
      return;
    }
    if (d.mode === 'gesture' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (dist > 10 && d.d > 10) this.cam.zoomAt(d.d / dist, mx, my);
      this.cam.panPixels(mx - d.mx, my - d.my); this.cam.snapPan();
      let da = ang - d.a; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 0.5) this.cam.rotateBy(-da);
      d.d = dist; d.a = ang; d.mx = mx; d.my = my;
      return;
    }
    if (d.mode === 'rotate') { this.cam.rotateBy(-(e.clientX - d.x) * 0.006); d.x = e.clientX; return; }
    if (d.mode === 'pan' || d.mode === 'click-or-pan') {
      if (d.mode === 'click-or-pan' && !d.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 6) return;
      d.moved = true;
      this.cam.panPixels(e.clientX - d.x, e.clientY - d.y); this.cam.snapPan();
      d.x = e.clientX; d.y = e.clientY;
      return;
    }
    if (d.mode === 'tool') {
      const t = this.tileAt(e.clientX, e.clientY);
      if (t && (!d.cur || t[0] !== d.cur[0] || t[1] !== d.cur[1])) { d.cur = t; this.toolPreview(); }
      if (this.tool === 'tree' && t) this.plant(t);
    }
  }
  up(e, cancel = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (!d) return;
    if (d.mode === 'gesture') { if (this.pointers.size === 0) this.drag = null; return; }
    this.drag = null;
    if (cancel) { this.overlay.clear(); return; }
    if (d.mode === 'click-or-pan' && !d.moved && p && performance.now() - p.t < 600) this.click(e.clientX, e.clientY);
    if (d.mode === 'tool') this.toolApply(d);
  }
  key(e, down) {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k); else { this.keys.delete(k); return; }
    if (!$('modal').hidden) { if (k === 'escape') this.closeModal(); return; }
    if (k === 'escape') { this.pickTool('inspect'); this.closeInfo(); $('flyout').hidden = true; this.setCinema(false); }
    else if (k === ' ') { e.preventDefault(); this.setSpeed(this.sim.speed === 0 ? (this.prevSpeed || 1) : 0); }
    else if (k === 'q') this.cam.rotate(-1);
    else if (k === 'e') this.cam.rotate(1);
    else if (k === '+' || k === '=') this.cam.zoomAt(0.75, innerWidth / 2, innerHeight / 2);
    else if (k === '-') this.cam.zoomAt(1.33, innerWidth / 2, innerHeight / 2);
    else if (k === 'r') { this.placeRot = (this.placeRot + 1) % 4; this.toolPreview(); }
    else if (k === 'k') this.setCinema(!this.cam.cinematic);
    else { const t = TOOLS.find((x) => x.key === k); if (t) this.pickTool(t.id); }
  }
  keyPan(dt) {
    let dx = 0, dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx += 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx -= 1;
    if (dx || dy) this.cam.panPixels(dx * dt * 700, dy * dt * 700);
  }

  // ------------------------------------------------------------- tools
  lpath(a, b) {
    const out = [];
    if (!a || !b) return out;
    const horizFirst = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
    let [x, z] = a;
    out.push([x, z]);
    const stepX = () => { while (x !== b[0]) { x += Math.sign(b[0] - x); out.push([x, z]); } };
    const stepZ = () => { while (z !== b[1]) { z += Math.sign(b[1] - z); out.push([x, z]); } };
    if (horizFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
    return out;
  }
  rect(a, b) {
    const out = [];
    if (!a || !b) return out;
    for (let z = Math.min(a[1], b[1]); z <= Math.max(a[1], b[1]); z++) for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) out.push([x, z]);
    return out;
  }
  placement(t) {
    const S = SERVICES[this.placeType];
    if (!S || !t) return null;
    const w = this.game.world;
    let rot = this.placeRot;
    const dims = (r) => [(r % 2) ? S.h : S.w, (r % 2) ? S.w : S.h];
    const at = (r) => { const [ww, hh] = dims(r); return [t[0] - Math.floor((ww - 1) / 2), t[1] - Math.floor((hh - 1) / 2), ww, hh]; };
    let [x, z, ww, hh] = at(rot);
    if (!w.frontRoad(x, z, ww, hh, rot).length) {
      for (let k = 1; k < 4; k++) {
        const r = (rot + k) % 4; const [x2, z2, w2, h2] = at(r);
        if (w.frontRoad(x2, z2, w2, h2, r).length && w.canPlace(x2, z2, w2, h2)) { rot = r; [x, z, ww, hh] = [x2, z2, w2, h2]; break; }
      }
    }
    const ok = w.canPlace(x, z, ww, hh) && w.frontRoad(x, z, ww, hh, rot).length > 0 && this.sim.money >= S.cost;
    return { x, z, w: ww, h: hh, rot, ok };
  }
  toolPreview() {
    const d = this.drag;
    const t = d ? d.cur : this.hoverTile;
    const w = this.game.world;
    const ov = this.overlay;
    if (!t) { ov.clear(); return; }
    if (this.tool === 'road') {
      const path = d ? this.lpath(d.start, d.cur) : [t];
      ov.set(path.map(([x, z]) => {
        const blocked = !w.inb(x, z) || w.buildingAt(x, z);
        const c = blocked ? '#ef6a52' : w.isRoad(x, z) ? '#9aa4ad' : w.isWater(x, z) ? '#7fc4ff' : '#f2c230';
        return [x, z, 0.06, c];
      }));
      if (d) {
        let cost = 0; for (const [x, z] of path) if (w.inb(x, z) && !w.isRoad(x, z) && !w.buildingAt(x, z)) cost += w.isWater(x, z) ? COSTS.bridge : COSTS.road;
        this.setHint(`Straße: <b>${path.length}</b> Felder · <b>${fmtMoney(cost)}</b>`);
      }
    } else if (this.tool.startsWith('zone')) {
      const zn = Number(this.tool.slice(4));
      const tiles = d ? this.rect(d.start, d.cur) : [t];
      ov.set(tiles.filter(([x, z]) => w.inb(x, z) && !w.isRoad(x, z) && !w.isWater(x, z) && !w.buildingAt(x, z)).map(([x, z]) => [x, z, 0.04, ZONE_INFO[zn].color]));
    } else if (this.tool === 'bulldoze') {
      const tiles = d ? this.rect(d.start, d.cur) : [t];
      ov.set(tiles.map(([x, z]) => [x, z, 0.07, '#ef6a52']));
    } else if (this.tool === 'busstop') {
      const ok = w.isRoad(t[0], t[1]) && [5, 10].includes(w.roadMask(t[0], t[1]));
      ov.set([[t[0], t[1], 0.06, ok ? '#f2c230' : '#ef6a52']]);
    } else if (this.tool === 'tree') {
      ov.set([[t[0], t[1], 0.04, '#7bd389']]);
    } else if (this.tool === 'place') {
      const p = this.placement(t);
      if (!p) { ov.clear(); return; }
      const tiles = [];
      for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) tiles.push([p.x + i, p.z + j, 0.08, p.ok ? '#7bd389' : '#ef6a52']);
      ov.set(tiles);
      const fx = p.x + p.w / 2 + DIRS[p.rot].dx * (p.rot % 2 ? p.w / 2 : p.h / 2) * 0.6;
      const fz = p.z + p.h / 2 + DIRS[p.rot].dz * (p.rot % 2 ? p.w / 2 : p.h / 2) * 0.6;
      ov.showArrow(fx, fz, p.rot, '#ffffff');
    }
  }
  cancelTool() { this.overlay.clear(); this.drag = null; }
  toolApply(d) {
    const t = d.cur;
    const sim = this.sim;
    if (this.tool === 'road') {
      const r = sim.buildRoad(this.lpath(d.start, d.cur));
      if (!r.ok) this.toast(r.msg, 'i-road', 'var(--bad)');
      else this.audio?.play('build');
      this.setHint(TOOLS[1].hint);
    } else if (this.tool.startsWith('zone')) {
      const zn = Number(this.tool.slice(4));
      const n = sim.zoneRect(d.start[0], d.start[1], d.cur[0], d.cur[1], zn);
      if (n) this.audio?.play('zone');
    } else if (this.tool === 'bulldoze') {
      const n = sim.bulldozeRect(d.start[0], d.start[1], d.cur[0], d.cur[1]);
      if (n) this.audio?.play('demolish');
      if (this.sel?.type === 'building' && !this.game.world.buildings.has(this.sel.ref.id)) this.closeInfo();
    } else if (this.tool === 'busstop' && t) {
      const r = sim.toggleBusStop(t[0], t[1]);
      if (!r.ok) this.toast(r.msg, 'i-bus', 'var(--bad)');
      else this.toast(r.removed ? 'Haltestelle entfernt.' : (sim.busStops >= 2 ? 'Haltestelle gebaut. Der Bus fährt los!' : 'Haltestelle gebaut. Baue eine zweite, damit ein Bus fährt.'), 'i-bus');
    } else if (this.tool === 'tree' && t) {
      this.plant(t);
    } else if (this.tool === 'place' && t) {
      const p = this.placement(t);
      if (p) {
        const r = sim.placeService(this.placeType, p.x, p.z, p.rot);
        if (!r.ok) this.toast(r.msg, 'i-civic', 'var(--bad)');
        else {
          this.toast(`Baubeginn: ${SERVICES[this.placeType].name}`, 'i-crane');
          this.audio?.play('build');
          if (SERVICES[this.placeType].unique) this.pickTool('inspect');
        }
      }
    }
    this.overlay.clear();
    if (d.touch) this.hoverTile = null;
  }
  plant(t) {
    const d = this.drag;
    const key = `${t[0]},${t[1]}`;
    if (d && d.planted.has(key)) return;
    if (d) d.planted.add(key);
    if (this.sim.plantTree(t[0], t[1])) this.audio?.play('tree');
  }

  // ------------------------------------------------------------- picking
  click(px, py) {
    const ray = this.cam.rayAt(px, py);
    const zoomed = this.cam.ppu() > 14;
    if (zoomed) {
      const p = this.people.pick(ray);
      if (p) { this.select({ type: 'person', ref: p }); return; }
    }
    const v = this.traffic.pick(ray);
    if (v) { this.select({ type: 'vehicle', ref: v }); return; }
    let best = null, bt = 1e9;
    const box = new THREE.Box3(), hit = new THREE.Vector3();
    for (const b of this.game.world.buildings.values()) {
      const h = b.state === 'build' ? Math.max(0.15, (b.height || 0.5) * Math.min(1, b.progress * 1.2)) : (b.height || 0.5);
      box.min.set(b.x + 0.04, 0, b.z + 0.04); box.max.set(b.x + b.w - 0.04, h, b.z + b.h - 0.04);
      if (ray.intersectBox(box, hit)) { const t = hit.distanceTo(ray.origin); if (t < bt) { bt = t; best = b; } }
    }
    if (best) { this.select({ type: 'building', ref: best }); return; }
    const t = this.tileAt(px, py);
    if (t && this.game.world.inb(t[0], t[1])) this.select({ type: 'tile', ref: t });
    else this.closeInfo();
  }
  select(sel) {
    this.sel = sel;
    this.confirmDemolish = false;
    $('info').hidden = false;
    this.renderInfo(true);
    this.audio?.play('click');
  }
  closeInfo() { this.sel = null; $('info').hidden = true; }

  renderInfo(force = false) {
    const s = this.sel;
    const el = $('info');
    if (!s) return;
    const w = this.game.world;
    let html = `<button class="close" data-act="close" title="Schließen">${icon('i-close')}</button>`;
    if (s.type === 'building') {
      const b = s.ref;
      if (!w.buildings.has(b.id)) { this.closeInfo(); return; }
      const lvl = GROW[b.kind]?.[b.level];
      const S = SERVICES[b.type];
      const kindLine = b.kind === 'svc' ? `Öffentlich · ${S?.name || ''}` : `${KIND_NAME[b.kind]} · ${lvl?.name || ''} (Stufe ${b.level})`;
      html += `<h2>${esc(b.name || lvl?.name || S?.name || 'Gebäude')}</h2><div class="kind">${kindLine}</div>`;
      if (b.state === 'build') {
        const st = siteStage(b.progress);
        let phase = SITE_STAGES[st];
        if (st === 3 && b.shell) { const n = Math.max(1, Math.ceil(b.shell.fhs.length * clamp((b.progress - 0.3) / 0.46, 0, 1))); phase += n > 1 ? ` · ${n - 1}. OG` : ' · EG'; }
        html += `<div class="phase"><span>Baustelle</span><b>${phase}</b></div><div class="bar"><i style="width:${Math.round(b.progress * 100)}%"></i></div><div class="phase"><span>Fortschritt</span><span>${Math.round(b.progress * 100)} %</span></div>`;
      }
      const k = w.idx(b.x, b.z);
      html += '<dl class="kv">';
      if (b.variant) html += `<dt>Bauweise</dt><dd>${esc(b.variant)}</dd>`;
      if (b.kind === 'res') html += `<dt>Bewohner</dt><dd>${b.state === 'done' ? fmtNum(b.pop) : '–'}</dd>`;
      else html += `<dt>Arbeitsplätze</dt><dd>${b.state === 'done' ? fmtNum(b.jobs) : '–'}</dd>`;
      if (b.kind !== 'svc') html += `<dt>Bodenwert</dt><dd>${Math.round(this.sim.lv[k])} / 100</dd>`;
      if (S?.upkeep) html += `<dt>Unterhalt</dt><dd>${fmtMoney(S.upkeep)}/Tag</dd>`;
      if (S?.radius) html += `<dt>Reichweite</dt><dd>${S.radius} Felder</dd>`;
      if (b.born) html += `<dt>Fertig seit</dt><dd>Tag ${b.born}</dd>`;
      if (b.fire) html += `<dt>Status</dt><dd style="color:var(--bad)">Brand!</dd>`;
      html += '</dl>';
      if (b.kind !== 'svc') {
        html += '<div class="chips">';
        for (const c in COVER_NAMES) html += `<span class="svc ${this.sim.cover[c][k] ? 'ok' : ''}">${COVER_NAMES[c]}</span>`;
        html += '</div>';
        const next = GROW[b.kind]?.[b.level + 1];
        if (next && b.state === 'done') {
          const miss = [];
          if (this.sim.stage < next.stage) miss.push(`Stadtstufe „${STAGES[next.stage].name}“`);
          if (this.sim.lv[k] < next.lv) miss.push(`Bodenwert ${next.lv}`);
          for (const n of next.need) if (!this.sim.cover[n][k]) miss.push(COVER_NAMES[n]);
          if (next.size === 2) miss.push('2×2 Fläche derselben Zone');
          html += `<p class="fine">Nächste Stufe: <b>${next.name}</b>${miss.length ? ` – braucht ${miss.join(', ')}` : ' – bereit, wenn Nachfrage besteht'}.</p>`;
        }
      }
      html += `<div class="actions"><button class="btn" data-act="zoom">${icon('i-target')}Ansehen</button><button class="btn danger ${this.confirmDemolish ? 'confirm' : ''}" data-act="demolish">${icon('i-bulldoze')}${this.confirmDemolish ? 'Wirklich?' : 'Abreißen'}</button></div>`;
    } else if (s.type === 'person') {
      const p = s.ref;
      if (p.dead) { this.closeInfo(); return; }
      const role = p.kind === 'worker' ? 'Bauarbeiter' : p.kind === 'kid' ? 'Kind' : 'Einwohner';
      html += `<h2>${esc(p.name)}</h2><div class="kind">${role} · ${p.age} Jahre${p.dog ? ' · mit Hund' : ''}</div>`;
      html += `<dl class="kv"><dt>Gerade</dt><dd>${esc(p.mode === 'inside' ? `ist in: ${p.dest?.name || 'einem Gebäude'}` : p.activity || 'spaziert')}</dd>${p.home ? `<dt>Wohnt in</dt><dd>${esc(p.home.name)}</dd>` : ''}</dl>`;
      html += `<div class="actions"><button class="btn primary" data-act="follow">${icon('i-eye')}Folgen</button></div>`;
    } else if (s.type === 'vehicle') {
      const v = s.ref;
      if (v.done) { this.closeInfo(); return; }
      html += `<h2>${esc(v.name)}</h2><div class="kind">Fahrzeug · ${Math.round(v.speed * 60)} km/h</div>`;
      let goal = v.dest ? v.dest.name : 'Ausfahrt aus der Stadt';
      if (v.role === 'bus') goal = 'nächste Haltestelle';
      if (v.role === 'emergency') goal = v.data.returning ? 'zurück zur Wache' : `Einsatz: ${v.dest?.name || ''}`;
      if (v.role === 'site') goal = `Baustelle: ${v.dest?.name || ''}`;
      if (v.role === 'moving') goal = `Umzug: ${v.dest?.name || ''}`;
      html += `<dl class="kv"><dt>Ziel</dt><dd>${esc(goal)}</dd></dl>`;
      html += `<div class="actions"><button class="btn primary" data-act="follow">${icon('i-eye')}Folgen</button></div>`;
    } else if (s.type === 'tile') {
      const [x, z] = s.ref; const k = w.idx(x, z);
      const zn = w.zone[k];
      const what = w.terrain[k] ? 'Fluss' : w.road[k] ? (w.busstop[k] ? 'Straße mit Bushaltestelle' : 'Straße') : zn ? ZONE_INFO[zn].name : w.trees[k] ? 'Wald' : 'Wiese';
      html += `<h2>${what}</h2><div class="kind">Feld ${x} / ${z}</div><dl class="kv"><dt>Bodenwert</dt><dd>${Math.round(this.sim.lv[k])} / 100</dd>`;
      if (zn && !w.road[k]) html += `<dt>Straße angrenzend</dt><dd>${w.facingFor(x, z, 1, 1) >= 0 ? 'ja' : 'nein – hier wird nicht gebaut'}</dd><dt>Nachfrage</dt><dd>${Math.round(this.sim.demand[ZONE_KEYS[zn]] * 100)} %</dd>`;
      html += '</dl><div class="chips">';
      for (const c in COVER_NAMES) html += `<span class="svc ${this.sim.cover[c][k] ? 'ok' : ''}">${COVER_NAMES[c]}</span>`;
      html += '</div>';
    }
    el.innerHTML = html;
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (!a) return;
      if (a === 'close') this.closeInfo();
      if (a === 'zoom' && s.type === 'building') { const b = s.ref; this.cam.lookAt(b.x + b.w / 2, b.z + b.h / 2, Math.max(1.6, b.w * 1.4 + (b.height || 0.5) * 0.6)); }
      if (a === 'demolish' && s.type === 'building') {
        if (!this.confirmDemolish) { this.confirmDemolish = true; this.renderInfo(); return; }
        this.sim.demolish(s.ref); this.audio?.play('demolish'); this.closeInfo();
      }
      if (a === 'follow') this.follow(s);
    };
  }
  follow(s) {
    const ref = s.ref;
    if (s.type === 'person') this.cam.follow = () => (ref.dead ? null : ref.mode === 'inside' ? (ref.dest ? { x: ref.dest.door[0], z: ref.dest.door[1] } : null) : { x: ref.x, z: ref.z });
    else this.cam.follow = () => (ref.done ? null : { x: ref.pos[0], z: ref.pos[1] });
    if (this.cam.goalView > 3) this.cam.goalView = 2.2;
    $('followPill').hidden = false;
    $('followText').textContent = `Du folgst ${s.type === 'person' ? ref.name : ref.name}`;
    this.closeInfo();
  }

  // ------------------------------------------------------------- HUD
  bindHud() {
    for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => this.setSpeed(Number(b.dataset.speed));
    $('zIn').onclick = () => this.cam.zoomAt(0.7, innerWidth / 2, innerHeight / 2);
    $('zOut').onclick = () => this.cam.zoomAt(1.4, innerWidth / 2, innerHeight / 2);
    $('rotL').onclick = () => this.cam.rotate(-1);
    $('rotR').onclick = () => this.cam.rotate(1);
    $('btnCinema').onclick = () => this.setCinema(!this.cam.cinematic);
    $('btnDay').onclick = () => this.cycleDay();
    $('btnMenu').onclick = () => this.openMenu();
    $('btnSound').onclick = () => {
      const on = this.audio?.toggle();
      $('btnSound').innerHTML = icon(on ? 'i-sound' : 'i-mute');
      $('btnSound').title = on ? 'Geräusche ausschalten' : 'Geräusche einschalten';
      $('btnSound').classList.toggle('on', !!on);
      if (on) this.audio.play('click');
    };
    $('followStop').onclick = () => { this.cam.follow = null; $('followPill').hidden = true; };
    $('cityName').addEventListener('change', (e) => { this.sim.cityName = e.target.value.trim() || 'Lindenau'; e.target.value = this.sim.cityName; });
    $('cityName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  }
  setSpeed(s) {
    if (this.sim.speed) this.prevSpeed = this.sim.speed;
    this.sim.speed = s;
    for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === s);
  }
  cycleDay() {
    this.dayMode = (this.dayMode + 1) % 4;
    const names = ['Automatisch', 'Immer Tag', 'Abendstimmung', 'Nacht'];
    const icons = ['i-auto', 'i-sun', 'i-dusk', 'i-moon'];
    $('btnDay').innerHTML = icon(icons[this.dayMode]);
    $('btnDay').title = `Tageszeit: ${names[this.dayMode]}`;
    $('btnDay').classList.toggle('on', this.dayMode !== 0);
    this.toast(`Tageszeit: ${names[this.dayMode]}`, icons[this.dayMode]);
  }
  displayHour() { return [this.sim.hour, 11, 19.6, 23][this.dayMode]; }
  setCinema(on) {
    this.cam.cinematic = on;
    document.body.classList.toggle('cinema', on);
    $('btnCinema').classList.toggle('on', on);
    if (on) { this.closeInfo(); $('flyout').hidden = true; if (this.cam.goalView > 6) this.cam.goalView = 4.5; }
  }

  updateHud() {
    const s = this.sim;
    $('sPop').textContent = fmtNum(s.pop);
    $('sJobs').textContent = fmtNum(s.jobsC + s.jobsI + s.jobsS);
    const m = $('sMoney'); m.textContent = fmtMoney(s.money); m.classList.toggle('neg', s.money < 0);
    const rate = s.incomePerDay - s.upkeepPerDay;
    const r = $('sRate'); r.textContent = `${rate >= 0 ? '+' : '−'}${fmtNum(Math.abs(rate))} €/Tag`; r.classList.toggle('neg', rate < 0);
    $('sHappy').textContent = `${Math.round(s.happiness)} %`;
    const h = Math.floor(s.hour), mi = Math.floor((s.hour - h) * 60);
    $('sTime').textContent = `Tag ${s.day} · ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    const st = STAGES[s.stage], nx = STAGES[s.stage + 1];
    $('stageChip').textContent = st.name;
    if (nx) {
      $('stageFill').style.width = `${clamp((s.pop - st.pop) / (nx.pop - st.pop), 0, 1) * 100}%`;
      $('stageNext').textContent = `noch ${fmtNum(Math.max(0, nx.pop - s.pop))} Einwohner bis ${nx.name}`;
    } else { $('stageFill').style.width = '100%'; $('stageNext').textContent = 'Höchste Stufe erreicht'; }
    const bar = (id, v) => {
      const el = $(id);
      if (v >= 0) { el.style.bottom = '50%'; el.style.height = `${v * 50}%`; }
      else { el.style.bottom = `${50 + v * 50}%`; el.style.height = `${-v * 50}%`; }
    };
    bar('dR', s.demand.res); bar('dC', s.demand.com); bar('dI', s.demand.ind);
    if (this.sel) this.renderInfo();
    if (this.cam.follow === null && !$('followPill').hidden) $('followPill').hidden = true;
  }

  drawMinimap() {
    const w = this.game.world, N = w.N, d = this.miniImg.data;
    const put = (i, c) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; };
    const COL = { grass: [111, 150, 74], forest: [62, 104, 52], water: [74, 144, 184], road: [214, 208, 196], res: [127, 207, 133], com: [106, 183, 240], ind: [242, 178, 90], svc: [236, 226, 206], zr: [96, 140, 80], zc: [92, 130, 140], zi: [140, 130, 80], build: [200, 170, 120] };
    for (let i = 0; i < N * N; i++) {
      let c = COL.grass;
      if (w.terrain[i]) c = COL.water;
      if (w.trees[i]) c = COL.forest;
      if (w.zone[i] === 1) c = COL.zr; else if (w.zone[i] === 2) c = COL.zc; else if (w.zone[i] === 3) c = COL.zi;
      if (w.road[i]) c = COL.road;
      const id = w.bld[i];
      if (id >= 0) { const b = w.buildings.get(id); if (b) c = b.state === 'build' ? COL.build : COL[b.kind] || COL.svc; }
      put(i, c);
    }
    const bctx = this.miniBuf.getContext('2d');
    bctx.putImageData(this.miniImg, 0, 0);
    const ctx = this.miniCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 168, 168);
    ctx.drawImage(this.miniBuf, 0, 0, 168, 168);
    // visible area
    const s = 168 / N;
    const pts = [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]].map(([x, y]) => this.cam.ground(x, y)).filter(Boolean);
    if (pts.length === 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.z * s) : ctx.moveTo(p.x * s, p.z * s))); ctx.closePath(); ctx.stroke();
    }
  }

  update(dt, now) {
    this.keyPan(dt);
    if (now - this.lastHud > 250) { this.lastHud = now; this.updateHud(); }
    if (now - this.lastMini > 1500 && $('minimap').offsetParent !== null) { this.lastMini = now; this.drawMinimap(); }
  }

  // ------------------------------------------------------------- messages
  toast(text, ic = 'i-star', color = null, onClick = null) {
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    if (color) t.style.setProperty('--tc', color);
    t.innerHTML = `${icon(ic)}<div>${text}</div>`;
    if (onClick) t.onclick = onClick;
    box.prepend(t);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 6500);
  }
  banner(title, text) {
    const b = $('banner');
    $('bannerTitle').textContent = title; $('bannerText').textContent = text;
    b.hidden = false; b.classList.remove('out');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.classList.add('out'); setTimeout(() => { b.hidden = true; }, 800); }, 5200);
  }
  openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
  closeModal() { $('modal').hidden = true; }
  welcome(onStart) {
    this.openModal(`
      <div class="modal-hero" role="img" aria-label="Luftbild einer Kleinstadt am Fluss"></div>
      <h1>Willkommen in ${esc(this.sim.cityName || 'Lindenau')}</h1>
      <p class="lead">Ein kleines Dorf am Fluss. Baue Straßen, weise Wohn-, Gewerbe- und Industriegebiete aus und sieh zu, wie Baustellen entstehen, Kräne sich drehen und die Leute einziehen.</p>
      <div class="howto">
        <kbd>Ziehen</kbd><span>Karte verschieben (1 Finger)</span>
        <kbd>Mausrad</kbd><span>Zoomen – ganz nah ran an die Menschen (2 Finger)</span>
        <kbd>Rechte Maus · Q / E</kbd><span>Kamera drehen (2 Finger drehen)</span>
        <kbd>Klick</kbd><span>Haus, Person oder Auto ansehen – und ihnen folgen</span>
        <kbd>K</kbd><span>Kinomodus: zurücklehnen und zuschauen</span>
      </div>
      <p>Vom <b>Dorf</b> zur <b>Kleinstadt</b>, <b>Stadt</b>, <b>Großstadt</b> und <b>Metropole</b>: Jede Stufe schaltet neue Gebäude frei.</p>
      <div class="actions"><button class="btn primary" id="mStart">Los geht's</button></div>`);
    $('mStart').onclick = () => { this.closeModal(); onStart?.(); };
  }
  openMenu() {
    const hasSave = this.save?.exists();
    this.openModal(`
      <h1>Menü</h1>
      <p class="lead">${esc(this.sim.cityName || 'Lindenau')} · Tag ${this.sim.day} · ${fmtNum(this.sim.pop)} Einwohner</p>
      <div class="menu-list">
        <button class="btn" id="mSave">${icon('i-star')}Spiel speichern</button>
        <button class="btn" id="mLoad" ${hasSave ? '' : 'disabled'}>${icon('i-clock')}Gespeichertes Spiel laden</button>
        <button class="btn" id="mFollow">${icon('i-eye')}Einer zufälligen Person folgen</button>
        <button class="btn" id="mShadows">${icon('i-sun')}Schatten: ${this.renderer.shadowMap.enabled ? 'an' : 'aus'}</button>
        <button class="btn" id="mHelp">${icon('i-cursor')}Bedienung</button>
        <button class="btn danger" id="mNew">${icon('i-bulldoze')}Neues Spiel beginnen</button>
      </div>
      <p class="fine">Das Spiel speichert automatisch jede Minute in diesem Browser.</p>
      <div class="actions"><button class="btn primary" id="mClose">Weiterspielen</button></div>`);
    $('mClose').onclick = () => this.closeModal();
    $('mSave').onclick = () => { const ok = this.save?.store(); this.toast(ok ? 'Spiel gespeichert.' : 'Speichern ist in diesem Browser nicht möglich.', 'i-star'); this.closeModal(); };
    $('mLoad').onclick = () => { this.closeModal(); this.save?.load(); };
    $('mFollow').onclick = () => {
      this.closeModal();
      const list = this.people.list.filter((p) => p.mode === 'walk');
      if (list.length) this.follow({ type: 'person', ref: list[Math.floor(Math.random() * list.length)] });
      else this.toast('Gerade ist niemand unterwegs.', 'i-people');
    };
    $('mShadows').onclick = () => { this.toggleShadows?.(); this.openMenu(); };
    $('mHelp').onclick = () => this.welcome();
    let armed = false;
    $('mNew').onclick = (e) => {
      if (!armed) { armed = true; e.currentTarget.classList.add('confirm'); e.currentTarget.lastChild.textContent = 'Wirklich neu beginnen? Nochmal klicken'; return; }
      this.closeModal(); this.save?.reset();
    };
  }
}
