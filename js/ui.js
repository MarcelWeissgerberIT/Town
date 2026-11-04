import * as THREE from 'three';
import { SERVICES, STAGES, GROW, COSTS, ZONE_INFO, ZONE_KEYS, DIFFICULTY } from './config.js';
import { VIEWS } from './heatmap.js';
import { garbageDays } from './waste.js';
import { fmtNum, fmtMoney, clamp, DIRS } from './util.js';
import { siteStage, SITE_STAGES } from './construction.js';

const $ = (id) => document.getElementById(id);
const icon = (id, cls = 'ic') => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TOOLS = [
  { id: 'inspect', label: 'Ansehen', icon: 'i-cursor', key: '1', hint: 'Klicke auf Häuser, Menschen oder Fahrzeuge. <b>Ziehen</b> verschiebt die Karte.' },
  { id: 'road', label: 'Straße', icon: 'i-road', key: '2', hint: '<b>Ziehen</b>, um eine Straße zu bauen · 25 € pro Feld, Brücken 180 €. In den Straßen liegen auch Strom- und Wasserleitungen.' },
  { id: 'zone1', label: 'Wohnen', icon: 'i-home', key: '3', zone: 1, color: 'var(--res)', hint: '<b>Fläche aufziehen</b>. Häuser entstehen an Straßen mit Strom und Wasser, sobald Nachfrage besteht.' },
  { id: 'zone2', label: 'Gewerbe', icon: 'i-shop', key: '4', zone: 2, color: 'var(--com)', hint: '<b>Fläche aufziehen</b> für Läden, Cafés und später Kaufhäuser und Büros.' },
  { id: 'zone3', label: 'Industrie', icon: 'i-factory', key: '5', zone: 3, color: 'var(--ind)', hint: '<b>Fläche aufziehen</b> für Werkstätten und Fabriken. Macht Lärm und schlechte Luft.' },
  { sep: true },
  { id: 'power', label: 'Strom', icon: 'i-bolt', key: '6', view: 'power', menu: ['line', 'substation', 'wind', 'solar', 'battery', 'hydro', 'coal', 'gas'] },
  { id: 'water', label: 'Wasser', icon: 'i-drop', key: '7', view: 'water', menu: ['well', 'watertower', 'waterworks', 'sewage'] },
  { id: 'waste', label: 'Müll', icon: 'i-bin', key: '8', view: 'garbage', menu: ['landfill', 'recycling', 'incinerator'] },
  { id: 'care', label: 'Dienste', icon: 'i-cross', key: '9', view: 'health', menu: ['firestation', 'police', 'clinic', 'rescue', 'hospital'] },
  { id: 'culture', label: 'Kultur', icon: 'i-civic', key: '0', view: 'edu', menu: ['school', 'townhall', 'church', 'stadium', 'tvtower'] },
  { id: 'nature', label: 'Natur', icon: 'i-tree', key: 'n', view: 'air', menu: ['tree', 'park', 'playground', 'plaza'] },
  { id: 'traffic', label: 'Verkehr', icon: 'i-lights', key: 'b', view: 'traffic', menu: ['avenue', 'lights', 'roundabout', 'busstop', 'parking', 'garage', 'parkhaus'] },
  { sep: true },
  { id: 'bulldoze', label: 'Abriss', icon: 'i-bulldoze', key: 'x', color: 'var(--bad)', hint: '<b>Fläche aufziehen</b>, um Straßen, Leitungen, Gebäude, Zonen und Bäume zu entfernen.' },
];
const TRAFFIC_TOOLS = {
  avenue: { name: 'Hauptstraße', sub: `${COSTS.avenue} € pro Feld`, stat: '4 Spuren', hint: '<b>Ziehen</b>, um eine Hauptstraße mit vier Spuren zu bauen oder eine Straße auszubauen · 70 € pro Feld. Schneller und mehr Platz, aber lauter.' },
  lights: { name: 'Ampel', sub: `${COSTS.lights} € pro Kreuzung`, stat: 'regelt den Verkehr', hint: '<b>Auf eine Kreuzung klicken</b>, um eine Ampel zu bauen (nochmal klicken: entfernen) · 600 €. Ohne Ampel gilt rechts vor links, Hauptstraßen haben Vorfahrt.' },
  roundabout: { name: 'Kreisverkehr', sub: `${COSTS.roundabout} € pro Kreuzung`, stat: 'ohne Wartezeit', hint: '<b>Auf eine Kreuzung klicken</b>, um einen Kreisverkehr zu bauen (nochmal klicken: entfernen) · 900 €. Wer im Kreis fährt, hat Vorfahrt.' },
  busstop: { name: 'Bushaltestelle', sub: `${COSTS.busstop} €`, stat: 'ab zwei fährt ein Bus', hint: 'Auf ein <b>gerades Straßenstück</b> klicken · 250 €. Ab zwei Haltestellen fährt ein Bus.' },
};
const LINE_HINT = '<b>Ziehen</b>, um eine Hochspannungsleitung zu bauen · 30 € pro Feld. Verbinde Kraftwerke mit einem <b>Umspannwerk</b> an der Straße.';
const VIEW_NOTES = {
  power: 'Grüne Straßen haben noch Strom übrig, rote nicht. Großkraftwerke brauchen eine Leitung zu einem Umspannwerk.',
  water: 'Wasser fließt durch die Straßen. Braune Punkte: hier läuft ungeklärtes Abwasser in den Fluss.',
  garbage: 'Müllwagen fahren von Deponie, Wertstoffhof oder Müllverbrennung los.',
  air: 'Industrie, Kraftwerke und Verkehr verschmutzen die Luft. Bäume und Parks filtern sie.',
  ground: 'Industrie und Deponien vergiften den Boden – schlecht für Brunnen in der Nähe.',
  river: 'Ungeklärtes Abwasser und Fabriken am Ufer verschmutzen das Wasser flussabwärts.',
  noise: 'Laute Nachbarn machen unzufrieden: Straßen, Industrie, Windräder.',
  mood: 'Klicke auf ein Haus, um zu sehen, was die Leute stört.',
  health: 'Arztpraxis und Krankenhaus versorgen ihren Umkreis.',
  safety: 'Polizei und Feuerwehr schützen ihren Umkreis.',
  edu: 'Schulen machen Familien glücklich; spätere Industrie braucht Bildung.',
  lv: 'Hoher Bodenwert lässt größere Häuser entstehen.',
  traffic: 'Rot: Stau. Ampeln und Kreisverkehre lösen Kreuzungen, Hauptstraßen haben vier Spuren und Vorfahrt.',
};
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
    for (const [id, key] of [['info', 'infoHeld'], ['advice', 'adviceHeld']]) {
      $(id).addEventListener('pointerdown', () => { this[key] = true; });
      const off = () => { if (this[key]) { this[key] = false; if (key === 'infoHeld') setTimeout(() => this.sel && this.renderInfo(), 0); } };
      window.addEventListener('pointerup', off); window.addEventListener('pointercancel', off);
    }
    // panels on the right start below the top bar, whatever its height
    const hud = document.querySelector('.hud-top');
    const place = () => document.documentElement.style.setProperty('--hud-b', `${Math.round(hud.getBoundingClientRect().bottom)}px`);
    window.addEventListener('resize', place);
    if (window.ResizeObserver) new ResizeObserver(place).observe(hud);
    place();
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
      if (!d || e.pointerId !== d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 16) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      // the panel may have been redrawn under the finger: take the same button in its new form
      if (!d.b.isConnected) {
        const nb = hit?.closest?.('button, .toast');
        const same = (k) => d.b.dataset[k] !== undefined && nb?.dataset[k] === d.b.dataset[k];
        if (nb && (same('act') || same('adv') || same('tool') || (d.b.id && nb.id === d.b.id))) d.b = nb;
        else return;
      }
      if (!d.b.contains(hit)) return;
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
      const t = TOOLS.find((x) => x.id === b.dataset.tool);
      let on = t.id === this.tool;
      if (t.menu && ((this.tool === 'place' && t.menu.includes(this.placeType)) || (this.tool === 'line' && t.id === 'power') || (this.tool === 'tree' && t.id === 'nature') || (TRAFFIC_TOOLS[this.tool] && t.id === 'traffic'))) on = true;
      b.classList.toggle('on', on);
    }
  }
  pickTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (t && t.menu) {
      const fly = $('flyout');
      if (!fly.hidden && fly.dataset.menu === id) { fly.hidden = true; this.restoreView(); return; }
      this.openFlyout(t);
      if (t.view) this.showView(t.view, true);
      return;
    }
    $('flyout').hidden = true;
    this.tool = id;
    this.placeType = null;
    this.overlay.clear();
    this.refreshToolbar();
    this.setHint(t ? t.hint : '');
    if (id !== 'inspect') this.closeInfo();
    if (id === 'inspect') this.restoreView();
  }
  // short key facts of a facility for the build menu
  statLine(S) {
    if (S.power?.ptype === 'battery') return `${S.power.store} MWh Speicher`;
    if (S.power) return `${S.power.gen} MW${S.power.ptype === 'solar' ? ' mittags' : S.power.ptype === 'wind' ? ' bei Wind' : ''}`;
    if (S.sub) return `bis ${S.sub} MW`;
    if (S.water) return `${fmtNum(S.water.out)} m³/Tag`;
    if (S.tower) return `${S.tower} m³ Speicher`;
    if (S.treat) return `${fmtNum(S.treat)} m³/Tag`;
    if (S.waste) return `${S.waste.trucks} Müllwagen`;
    if (S.care?.beds) return `${S.care.beds} Betten`;
    if (S.care?.ambulances) return `${S.care.ambulances} Rettungswagen`;
    if (S.park) return `${S.park} Stellplätze`;
    if (S.radius) return `Umkreis ${S.radius}`;
    return '';
  }
  openFlyout(t) {
    const fly = $('flyout');
    fly.dataset.menu = t.id;
    fly.classList.remove('views');
    fly.innerHTML = '';
    const stage = this.sim.stage;
    for (const k of t.menu) {
      const b = document.createElement('button');
      b.className = 'fcard';
      if (k === 'tree') {
        b.innerHTML = `<b>Bäume pflanzen</b><span>${COSTS.tree} € pro Baum</span><span class="stat2">filtern die Luft</span>`;
        b.onclick = () => { fly.hidden = true; this.tool = 'tree'; this.placeType = 'tree'; this.refreshToolbar(); this.setHint('<b>Klicken oder ziehen</b>, um Bäume zu pflanzen · 15 € pro Baum'); };
      } else if (TRAFFIC_TOOLS[k]) {
        const T = TRAFFIC_TOOLS[k];
        b.innerHTML = `<b>${T.name}</b><span>${T.sub}</span><span class="stat2">${T.stat}</span>`;
        b.onclick = () => { fly.hidden = true; this.tool = k; this.placeType = null; this.refreshToolbar(); this.setHint(T.hint); this.showView('traffic', true); };
      } else if (k === 'line') {
        b.innerHTML = `<b>Stromleitung</b><span>${COSTS.line} € pro Feld</span><span class="stat2">Hochspannung</span>`;
        b.title = 'Verbindet Kraftwerke, Umspannwerke und das Umland.';
        b.onclick = () => { fly.hidden = true; this.tool = 'line'; this.placeType = null; this.refreshToolbar(); this.setHint(LINE_HINT); this.showView('power', true); };
      } else {
        const S = SERVICES[k];
        const locked = stage < S.stage;
        const exists = S.unique && [...this.game.world.buildings.values()].some((x) => x.type === k);
        if (locked || exists) b.classList.add('locked');
        b.innerHTML = `<b>${S.name}</b><span>${locked ? `ab ${STAGES[S.stage].name}` : exists ? 'schon gebaut' : `${fmtMoney(S.cost)} · ${S.w}×${S.h}`}</span><span class="stat2">${this.statLine(S)}</span>`;
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
  // ---- map views
  openViews() {
    const fly = $('flyout');
    if (!fly.hidden && fly.dataset.menu === 'views') { fly.hidden = true; return; }
    fly.dataset.menu = 'views';
    fly.classList.add('views');
    fly.innerHTML = '';
    const mk = (key, name, ic) => {
      const b = document.createElement('button');
      b.className = 'fcard' + (this.heatmap.mode === key ? ' on' : '');
      b.innerHTML = `<b>${icon(ic)} ${name}</b>`;
      b.onclick = () => { fly.hidden = true; this.userView = key; this.showView(key); };
      fly.appendChild(b);
    };
    mk(null, 'Normale Ansicht', 'i-eye');
    for (const k in VIEWS) mk(k, VIEWS[k].name, VIEWS[k].icon);
    fly.hidden = false;
  }
  showView(key, temporary = false) {
    if (!temporary) this.userView = key;
    this.heatmap.set(key);
    const lg = $('legend');
    if (!key) { lg.hidden = true; return; }
    const V = VIEWS[key];
    lg.innerHTML = `<h3>${icon(V.icon)}${V.name}<button data-act="x" title="Ansicht schließen">${icon('i-close')}</button></h3>${V.legend.map(([c, t]) => `<div class="row"><i class="sw" style="background:${c}"></i>${t}</div>`).join('')}<div class="note">${VIEW_NOTES[key] || ''}</div>`;
    lg.querySelector('[data-act=x]').onclick = () => { this.userView = null; this.showView(null); };
    lg.hidden = false;
  }
  restoreView() { this.showView(this.userView || null, true); }
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
  // ------------------------------------------------------------- map gestures
  // The map follows the fingers directly: the ground point that was touched stays under
  // the finger, a pinch zooms and turns around the point between the fingers, and a swipe
  // lets the map glide on. Lifting one finger of a pinch carries on as a one-finger drag.
  grab(px, py) { const g = this.cam.ground(px, py); return g ? { x: g.x, z: g.z } : null; }
  startPan(id, x, y, touch, moved = false) {
    const anchor = this.grab(x, y);
    this.drag = { mode: 'pan', id, anchor, x, y, touch, moved, trail: [] };
  }
  startGesture() {
    const [a, b] = [...this.pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    this.cam.stop();
    this.drag = {
      mode: 'gesture', anchor: this.grab(mx, my), d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)),
      a0: Math.atan2(b.y - a.y, b.x - a.x), view0: this.cam.view, az0: this.cam.az, turning: false, turn0: 0,
    };
  }
  track(d) {
    const t = performance.now(), tr = d.trail;
    tr.push([t, this.cam.target.x, this.cam.target.z]);
    while (tr.length > 2 && t - tr[0][0] > 120) tr.shift();
  }
  release(d) {
    const tr = d.trail;
    if (!tr || tr.length < 2) return;
    const now = performance.now(), last = tr[tr.length - 1], first = tr[0];
    // a finger that stopped before lifting leaves the map where it is
    if (now - last[0] > 70 || last[0] - first[0] < 12) return;
    const dt = (last[0] - first[0]) / 1000;
    const vx = (last[1] - first[1]) / dt, vz = (last[2] - first[2]) / dt;
    if (Math.hypot(vx, vz) > this.cam.view * 0.35) this.cam.fling(vx, vz);
  }
  down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    this.cam.stop();
    if (this.pointers.size === 2) {
      if (this.drag && this.drag.mode === 'tool') this.cancelTool();
      this.startGesture();
      return;
    }
    if (this.pointers.size > 2) return;
    if (this.cam.cinematic) this.setCinema(false);
    const touch = e.pointerType !== 'mouse';
    if (e.button === 2) this.drag = { mode: 'rotate', x: e.clientX };
    else if (e.button === 1) this.startPan(e.pointerId, e.clientX, e.clientY, false, true);
    else if (this.tool === 'inspect') { this.startPan(e.pointerId, e.clientX, e.clientY, touch); this.drag.tap = true; }
    else {
      const t = this.tileAt(e.clientX, e.clientY);
      this.drag = { mode: 'tool', start: t, cur: t, x: e.clientX, y: e.clientY, touch, planted: new Set() };
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
    if (d.mode === 'gesture') {
      if (this.pointers.size < 2 || !d.anchor) return;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      let da = ang - d.a0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      // turning starts only after a clear twist, so a plain pinch never tilts the map
      if (!d.turning && Math.abs(da) > 0.26) { d.turning = true; d.turn0 = da; }
      const az = d.turning ? d.az0 - (da - d.turn0) : undefined;
      this.cam.held = true;
      this.cam.pinTo(d.anchor, mx, my, d.view0 * d.d0 / dist, az);
      return;
    }
    if (d.mode === 'rotate') { this.cam.rotateBy(-(e.clientX - d.x) * 0.006); d.x = e.clientX; return; }
    if (d.mode === 'pan') {
      if (e.pointerId !== d.id) return;
      // a finger wobbles a little on a tap; only a real move drags the map
      if (!d.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < (d.touch ? 11 : 5)) return;
      if (!d.moved) { d.moved = true; d.anchor = this.grab(e.clientX, e.clientY) || d.anchor; }
      if (!d.anchor) return;
      this.cam.held = true;
      this.cam.pinTo(d.anchor, e.clientX, e.clientY);
      this.track(d);
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
    this.interactUntil = performance.now() + 400;
    const d = this.drag;
    if (!d) return;
    if (d.mode === 'gesture') {
      // one finger stays: keep dragging with it, no jump
      if (this.pointers.size === 1) {
        const [id, q] = [...this.pointers.entries()][0];
        this.startPan(id, q.x, q.y, true, true);
      } else if (this.pointers.size === 2) this.startGesture();
      else if (this.pointers.size === 0) { this.drag = null; this.cam.held = false; }
      return;
    }
    if (d.mode === 'pan' && e.pointerId !== d.id) return;
    this.drag = null;
    this.cam.held = false;
    if (cancel) { this.overlay.clear(); return; }
    if (d.mode === 'pan') {
      if (d.moved) this.release(d);
      else if (d.tap && p && performance.now() - p.t < 700) this.click(e.clientX, e.clientY);
    }
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
    else if (k === 'v') this.openViews();
    else if (k === 'h') this.openBudget();
    else if (k === 'm') this.region?.open();
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
    let chk = this.sim.canPlaceService(this.placeType, x, z, ww, hh, rot);
    if (!chk.ok) {
      for (let k = 1; k < 4; k++) {
        const r = (rot + k) % 4; const [x2, z2, w2, h2] = at(r);
        const c2 = this.sim.canPlaceService(this.placeType, x2, z2, w2, h2, r);
        if (c2.ok) { rot = r; [x, z, ww, hh] = [x2, z2, w2, h2]; chk = c2; break; }
      }
    }
    return { x, z, w: ww, h: hh, rot, ok: chk.ok, msg: chk.msg };
  }
  toolPreview() {
    const d = this.drag;
    const t = d ? d.cur : this.hoverTile;
    const w = this.game.world;
    const ov = this.overlay;
    if (!t) { ov.clear(); return; }
    if (this.tool === 'road' || this.tool === 'avenue') {
      const type = this.tool === 'avenue' ? 2 : 1;
      const path = d ? this.lpath(d.start, d.cur) : [t];
      ov.set(path.map(([x, z]) => {
        const blocked = !w.inb(x, z) || w.buildingAt(x, z);
        const c = blocked ? '#ef6a52' : w.roadType(x, z) >= type ? '#9aa4ad' : w.isWater(x, z) ? '#7fc4ff' : type === 2 ? '#ff9f43' : '#f2c230';
        return [x, z, 0.06, c];
      }));
      if (d) {
        const rc = this.sim.roadCost(path, type);
        this.setHint(`${type === 2 ? 'Hauptstraße' : 'Straße'}: <b>${rc.tiles.length}</b> Felder · <b>${fmtMoney(rc.cost)}</b>`);
      }
    } else if (this.tool === 'lights' || this.tool === 'roundabout') {
      ov.set([[t[0], t[1], 0.07, w.isJunction(t[0], t[1]) ? '#7bd389' : '#ef6a52']]);
    } else if (this.tool === 'line') {
      const path = d ? this.lpath(d.start, d.cur) : [t];
      ov.set(path.map(([x, z]) => {
        const k = w.inb(x, z) ? w.idx(x, z) : -1;
        const c = k < 0 || w.buildingAt(x, z) ? '#ef6a52' : w.pline[k] ? '#9aa4ad' : '#f2c230';
        return [x, z, 0.07, c];
      }));
      if (d) { const lc = this.sim.lineCost(path); this.setHint(`Stromleitung: <b>${lc.n}</b> Felder · <b>${fmtMoney(lc.cost)}</b>`); }
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
      if (!p.ok && p.msg && !this.drag?.touch) this.setHint(`<b>${SERVICES[this.placeType].name}</b> · ${esc(p.msg)}`);
    }
  }
  cancelTool() { this.overlay.clear(); this.drag = null; }
  toolApply(d) {
    const t = d.cur;
    const sim = this.sim;
    if (this.tool === 'road' || this.tool === 'avenue') {
      const r = sim.buildRoad(this.lpath(d.start, d.cur), this.tool === 'avenue' ? 2 : 1);
      if (!r.ok) this.toast(r.msg, 'i-road', 'var(--bad)');
      else this.audio?.play('build');
      this.setHint(this.tool === 'avenue' ? TRAFFIC_TOOLS.avenue.hint : TOOLS[1].hint);
    } else if ((this.tool === 'lights' || this.tool === 'roundabout') && t) {
      const kind = this.tool === 'lights' ? 1 : 2;
      const r = sim.setJunction(t[0], t[1], kind);
      if (!r.ok) this.toast(r.msg, 'i-lights', 'var(--bad)');
      else { this.audio?.play('build'); this.toast(r.removed ? `${kind === 1 ? 'Ampel' : 'Kreisverkehr'} entfernt – hier gilt wieder rechts vor links.` : kind === 1 ? 'Ampel gebaut.' : 'Kreisverkehr gebaut.', 'i-lights'); }
    } else if (this.tool === 'line') {
      const r = sim.buildLine(this.lpath(d.start, d.cur));
      if (!r.ok) this.toast(r.msg, 'i-pylon', 'var(--bad)');
      else this.audio?.play('build');
      this.setHint(LINE_HINT);
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
    document.body.classList.add('info-open');
    this.renderInfo(true);
    this.audio?.play('click');
  }
  closeInfo() { this.sel = null; $('info').hidden = true; document.body.classList.remove('info-open'); }

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
      html += this.buildingFacts(b, k, S);
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
      const ctl = w.control(x, z);
      const rname = w.road[k] === 2 ? 'Hauptstraße' : 'Straße';
      const what = w.terrain[k] && !w.road[k] ? 'Fluss' : w.road[k] ? (ctl === 1 ? `${rname}: Ampelkreuzung` : ctl === 2 ? 'Kreisverkehr' : ctl === 0 ? `${rname}: Kreuzung` : w.busstop[k] ? `${rname} mit Bushaltestelle` : w.terrain[k] ? `${rname} (Brücke)` : rname) : zn ? ZONE_INFO[zn].name : w.trees[k] ? 'Wald' : 'Wiese';
      html += `<h2>${what}</h2><div class="kind">Feld ${x} / ${z}</div><dl class="kv"><dt>Bodenwert</dt><dd>${Math.round(this.sim.lv[k])} / 100</dd>`;
      if (w.road[k]) {
        const f = this.traffic.flow[k];
        html += `<dt>Spuren</dt><dd>${w.road[k] === 2 ? 4 : 2}</dd><dt>Verkehr</dt><dd>${f < 5 ? 'wenig' : f < 15 ? 'mittel' : f < 30 ? 'viel' : 'sehr viel'}</dd>`;
        if (ctl === 0) html += `<dt>Vorfahrt</dt><dd>${w.road[k] === 2 ? 'Hauptstraße zuerst' : 'rechts vor links'}</dd>`;
        if (this.traffic.jam[k] > 1.5) html += `<dt>Stau</dt><dd style="color:var(--bad)">${Math.round(this.traffic.jam[k])} warten</dd>`;
      }
      if (zn && !w.road[k]) html += `<dt>Straße angrenzend</dt><dd>${w.facingFor(x, z, 1, 1) >= 0 ? 'ja' : 'nein – hier wird nicht gebaut'}</dd><dt>Nachfrage</dt><dd>${Math.round(this.sim.demand[ZONE_KEYS[zn]] * 100)} %</dd>`;
      html += '</dl><div class="chips">';
      for (const c in COVER_NAMES) html += `<span class="svc ${this.sim.cover[c][k] ? 'ok' : ''}">${COVER_NAMES[c]}</span>`;
      html += '</div>';
    }
    // the panel refreshes four times a second; rebuilding it under a finger would swallow the tap
    if (!force && (html === this.infoHtml || this.infoHeld)) return;
    this.infoHtml = html;
    el.innerHTML = html;
    el.onclick = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (!a) return;
      if (a === 'close') this.closeInfo();
      if (a === 'zoom' && s.type === 'building') { const b = s.ref; this.cam.lookAt(b.x + b.w / 2, b.z + b.h / 2, Math.max(1.6, b.w * 1.4 + (b.height || 0.5) * 0.6)); }
      if (a === 'demolish' && s.type === 'building') {
        if (!this.confirmDemolish) { this.confirmDemolish = true; this.renderInfo(true); return; }
        this.sim.demolish(s.ref); this.audio?.play('demolish'); this.closeInfo();
      }
      if (a === 'follow') this.follow(s);
    };
  }
  // facts, supplies and mood of a building for the info panel
  buildingFacts(b, k, S) {
    const sim = this.sim, done = b.state === 'done';
    const yes = (v, a = 'ja', n = 'nein') => (v ? `<span style="color:var(--good)">${a}</span>` : `<span style="color:var(--bad)">${n}</span>`);
    let h = '<dl class="kv">';
    if (b.variant) h += `<dt>Bauweise</dt><dd>${esc(b.variant)}</dd>`;
    if (b.kind === 'res') h += `<dt>Bewohner</dt><dd>${done ? fmtNum(b.pop) : '–'}${done && b.popMax && b.pop < b.popMax ? ` / ${fmtNum(b.popMax)}` : ''}</dd>`;
    else if (b.kind !== 'svc') h += `<dt>Arbeitsplätze</dt><dd>${done ? fmtNum(b.jobs) : '–'}</dd>`;
    if (b.abandoned) h += `<dt>Status</dt><dd style="color:var(--bad)">${b.kind === 'res' ? 'steht leer' : 'geschlossen'}</dd>`;
    if (b.fire) h += `<dt>Status</dt><dd style="color:var(--bad)">Brand!</dd>`;
    if (done && (b.pUse > 0 || (b.kind !== 'svc'))) h += `<dt>Strom</dt><dd>${yes(b.pw !== 0)}</dd>`;
    if (done && (b.wUse > 0 || (b.kind !== 'svc'))) h += `<dt>Wasser</dt><dd>${yes(b.wt !== 0)}</dd>`;
    if (done && b.kind !== 'svc') { const g = garbageDays(b); h += `<dt>Mülltonnen</dt><dd>${g < 1 ? 'leer' : g < 3 ? `${Math.round(g)} Tage voll` : `<span style="color:var(--bad)">${Math.round(g)} Tage – stinkt!</span>`}</dd>`; }
    if (b.kind === 'res' && b.sick) h += `<dt>Krank</dt><dd>${b.sick}</dd>`;
    if (done && b.kind !== 'svc' && b.park !== undefined && b.park < 1) h += `<dt>Parkplätze</dt><dd>${b.park > 0.9 ? 'genug' : `<span style="color:${b.park < 0.5 ? 'var(--bad)' : 'var(--accent)'}">${Math.round(b.park * 100)} % gedeckt</span>`}</dd>`;
    if (b.kind !== 'svc') h += `<dt>Bodenwert</dt><dd>${Math.round(sim.lv[k])} / 100</dd>`;
    // facility details
    if (S && done) {
      const P = S.power;
      if (P && P.ptype !== 'battery') h += `<dt>Leistung</dt><dd>${b.gridless ? '<span style="color:var(--bad)">nicht angeschlossen</span>' : `${(b.out || 0).toFixed(1).replace('.', ',')} MW`}</dd>`;
      if (P?.ptype === 'battery') h += `<dt>Ladung</dt><dd>${Math.round(b.stored || 0)} / ${P.store} MWh</dd>`;
      if (P?.ptype === 'wind') h += `<dt>Wind</dt><dd>${Math.round(sim.util.wind * 100)} %</dd>`;
      if (S.sub) h += `<dt>Hochspannung</dt><dd>${yes(b.hv >= 0, 'angeschlossen', 'keine Leitung')}</dd><dt>Kapazität</dt><dd>${S.sub} MW</dd>`;
      if (S.water) h += `<dt>Förderung</dt><dd>${fmtNum(b.wOut || 0)} m³/Tag</dd><dt>Wasserqualität</dt><dd>${Math.round((b.q ?? 1) * 100)} %</dd>`;
      if (S.tower) h += `<dt>Füllstand</dt><dd>${fmtNum(b.wStored || 0)} / ${fmtNum(S.tower)} m³</dd>`;
      if (S.treat) h += `<dt>Gereinigt</dt><dd>${fmtNum(b.treated || 0)} / ${fmtNum(S.treat)} m³/Tag</dd>`;
      if (S.waste) {
        const active = this.traffic.count((v) => v.type === 'garbage' && v.data.depot === b.id);
        h += `<dt>Müllwagen</dt><dd>${active} / ${S.waste.trucks} unterwegs</dd>`;
        if (b.type === 'landfill') h += `<dt>Füllstand</dt><dd>${fmtNum(b.fill || 0)} / ${fmtNum(S.waste.cap)} t</dd>`;
        if (S.waste.recycle) h += `<dt>Lager</dt><dd>${Math.round(b.store || 0)} / ${S.waste.cap} t</dd>`;
        if (S.waste.burn) h += `<dt>Bunker</dt><dd>${Math.round(b.bunker || 0)} / ${S.waste.cap} t</dd>`;
      }
      if (S.care?.ambulances) h += `<dt>Rettungswagen</dt><dd>${this.traffic.count((v) => v.type === 'ambulance' && v.data.station === b.id)} / ${S.care.ambulances} im Einsatz</dd>`;
      if (S.park) h += `<dt>Stellplätze</dt><dd>${S.park}</dd><dt>Belegt</dt><dd>${Math.round((b.occ || 0) * 100)} %</dd>`;
      if (S.care?.beds) h += `<dt>Betten belegt</dt><dd>${(b.patients || []).length} / ${S.care.beds}</dd>`;
      if (S.upkeep) h += `<dt>Unterhalt</dt><dd>${fmtMoney(S.upkeep * sim.diff.upkeep)}/Tag</dd>`;
      if (S.radius && S.cover) h += `<dt>Reichweite</dt><dd>${S.radius} Felder</dd>`;
    }
    if (b.born) h += `<dt>Fertig seit</dt><dd>Tag ${b.born}</dd>`;
    h += '</dl>';
    // what a facility needs to work
    if (S && done) {
      const tips = [];
      if (S.power?.hv && b.gridless) tips.push('Ziehe eine Stromleitung zu einem Umspannwerk an der Straße oder baue das Umspannwerk direkt daneben.');
      if (S.power && !S.power.hv && b.gridless) tips.push('Liegt an keiner Straße: mit einer Stromleitung zu einem Umspannwerk verbinden.');
      if (S.sub && b.hv < 0) tips.push('Ohne Hochspannungsleitung oder Kraftwerk daneben verteilt es keinen Strom.');
      if (b.pw === 0 && b.pUse > 0) tips.push('Ohne Strom läuft hier nichts.');
      if (S.waste && this.sim.waste.isFull(b)) tips.push('Voll! Es kann kein Müll mehr angenommen werden.');
      if (b.rc < 0 && !S.noRoad) tips.push('Keine Straße vor der Tür.');
      if (tips.length) h += `<p class="fine" style="color:var(--bad)">${tips.join(' ')}</p>`;
    }
    // mood with reasons
    if (done && b.kind !== 'svc' && b.moodParts) {
      const m = Math.round(b.mood ?? 60);
      const col = m >= 60 ? 'var(--good)' : m >= 35 ? 'var(--accent)' : 'var(--bad)';
      h += `<div class="mood"><div class="mrow"><span>Zufriedenheit</span><b style="color:${col}">${m} %</b></div><div class="meter"><i style="width:${m}%;background:${col}"></i></div>`;
      const neg = b.moodParts.filter((p) => p[1] < 0).slice(0, 4);
      const pos = b.moodParts.filter((p) => p[1] > 0).slice(-3).reverse();
      for (const [l, v] of [...neg, ...pos]) h += `<div class="mrow"><span>${esc(l)}</span><b class="${v > 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : '−'}${Math.abs(v)}</b></div>`;
      h += '</div>';
    }
    if (b.kind !== 'svc') {
      h += '<div class="chips">';
      for (const c in COVER_NAMES) h += `<span class="svc ${sim.cover[c][k] ? 'ok' : ''}">${COVER_NAMES[c]}</span>`;
      h += '</div>';
      const next = GROW[b.kind]?.[b.level + 1];
      if (next && done && !b.abandoned) {
        const miss = [];
        if (sim.stage < next.stage) miss.push(`Stadtstufe „${STAGES[next.stage].name}“`);
        if (sim.lv[k] < next.lv) miss.push(`Bodenwert ${next.lv}`);
        for (const n of next.need) if (!sim.cover[n][k]) miss.push(COVER_NAMES[n]);
        if ((b.mood ?? 60) < 55) miss.push('zufriedene Bewohner');
        if (next.parking && (b.park ?? 1) < 0.5) miss.push('Parkplätze in der Nähe');
        if (next.size === 2) miss.push('2×2 Fläche derselben Zone');
        h += `<p class="fine">Nächste Stufe: <b>${next.name}</b>${miss.length ? ` – braucht ${miss.join(', ')}` : ' – bereit, wenn Nachfrage, Strom und Wasser reichen'}.</p>`;
      }
    }
    return h;
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
    $('btnViews').onclick = () => this.openViews();
    $('btnBudget').onclick = () => this.openBudget();
    $('btnRegion').onclick = () => this.region?.open();
    for (const b of document.querySelectorAll('.sup')) b.onclick = () => { const v = b.dataset.view; this.showView(this.heatmap.mode === v ? null : v); };
    $('advice').onclick = (e) => { const a = e.target.closest('[data-adv]'); if (a) this.adviceAction(a.dataset.adv); };
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
    const txt = (id, t) => { const el = $(id); if (el.textContent !== t) el.textContent = t; return el; };
    const css = (el, k, v) => { if (el.style[k] !== v) el.style[k] = v; };
    txt('sPop', fmtNum(s.pop));
    txt('sJobs', fmtNum(s.jobsC + s.jobsI + s.jobsS));
    const m = txt('sMoney', fmtMoney(s.money)); m.classList.toggle('neg', s.money < 0);
    const rate = s.incomePerDay - s.upkeepPerDay;
    const r = txt('sRate', `${rate >= 0 ? '+' : '−'}${fmtNum(Math.abs(rate))} €/Tag`); r.classList.toggle('neg', rate < 0);
    txt('sHappy', `${Math.round(s.happiness)} %`);
    const h = Math.floor(s.hour), mi = Math.floor((s.hour - h) * 60);
    txt('sTime', `Tag ${s.day} · ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
    const st = STAGES[s.stage], nx = STAGES[s.stage + 1];
    txt('stageChip', st.name);
    if (nx) {
      css($('stageFill'), 'width', `${(clamp((s.pop - st.pop) / (nx.pop - st.pop), 0, 1) * 100).toFixed(1)}%`);
      txt('stageNext', `noch ${fmtNum(Math.max(0, nx.pop - s.pop))} Einwohner bis ${nx.name}`);
    } else { css($('stageFill'), 'width', '100%'); txt('stageNext', 'Höchste Stufe erreicht'); }
    const bar = (id, v) => {
      const el = $(id);
      v = Math.round(v * 100) / 100;
      if (v >= 0) { css(el, 'bottom', '50%'); css(el, 'height', `${v * 50}%`); }
      else { css(el, 'bottom', `${50 + v * 50}%`); css(el, 'height', `${-v * 50}%`); }
    };
    bar('dR', s.demand.res); bar('dC', s.demand.com); bar('dI', s.demand.ind);
    this.updateSupply();
    if (this.sel) this.renderInfo();
    if (this.cam.follow === null && !$('followPill').hidden) $('followPill').hidden = true;
  }

  updateSupply() {
    const s = this.sim, st = s.util.stats;
    if (!st) return;
    const set = (id, frac, text, cls) => {
      const wd = `${(clamp(frac, 0, 1) * 100).toFixed(1)}%`;
      if ($(id).style.width !== wd) $(id).style.width = wd;
      const te = $(`${id}t`); if (te.textContent !== text) te.textContent = text;
      const row = $(id).closest('.sup');
      row.classList.toggle('bad', cls === 'bad'); row.classList.toggle('warn', cls === 'warn');
    };
    const f1 = (v) => (v >= 10 ? Math.round(v) : v.toFixed(1)).toString().replace('.', ',');
    const P = st.power;
    set('supP', P.demand > 0 ? P.supplied / P.demand : 1, `${f1(P.supplied)} / ${f1(P.demand)} MW`, P.short > 0.005 ? 'bad' : P.imp > P.demand * 0.6 && P.demand > 0.5 ? 'warn' : '');
    const W = st.water, SW = st.sewage;
    set('supW', W.demand > 0 ? W.supplied / W.demand : 1, `${fmtNum(W.supplied)} / ${fmtNum(W.demand)} m³`, W.short > 0.5 ? 'bad' : SW.untreated > 2 ? 'warn' : '');
    const G = s.waste.stats;
    let homes = 0; for (const b of this.game.world.buildings.values()) if (b.state === 'done' && b.kind !== 'svc') homes++;
    const lf = G.landfillCap ? G.landfill / G.landfillCap : 0;
    set('supG', 1 - Math.min(1, G.overflow / Math.max(4, homes * 0.25)), G.overflow ? `${G.overflow} Häuser` : G.landfillCap ? `Deponie ${Math.round(lf * 100)} %` : `${f1(G.open)} t`, G.overflow > homes * 0.1 ? 'bad' : G.overflow || lf > 0.85 ? 'warn' : '');
    const H = s.safety.stats;
    let pop = 0, sick = 0; for (const b of this.game.world.buildings.values()) if (b.kind === 'res' && b.state === 'done') { pop += b.pop; sick += b.sick || 0; }
    set('supH', 1 - Math.min(1, sick / Math.max(1, pop * 0.05)), H.waiting ? `${H.waiting} Notruf${H.waiting > 1 ? 'e' : ''}` : `${sick} krank`, H.waiting ? 'bad' : sick > pop * 0.03 ? 'warn' : '');
    if (performance.now() - (this.lastAdvice || 0) > 2000) { this.lastAdvice = performance.now(); this.renderAdvice(); }
  }

  // what the town needs most right now
  issues() {
    const s = this.sim, st = s.util.stats, w = this.game.world, out = [];
    if (!st) return out;
    const now = s.day + s.hour / 24;
    const P = st.power, W = st.water;
    const facs = [...w.buildings.values()].filter((b) => b.state === 'done');
    if (P.unpowered > 0) out.push({ k: 'power', sev: 9, ic: 'i-bolt', t: `Stromausfall: ${P.unpowered} Gebäude ohne Strom. Baue Windräder oder ein Kraftwerk.` });
    else if (now - (s.blocked?.power || -9) < 0.6) out.push({ k: 'power', sev: 6, ic: 'i-bolt', t: 'Für neue Häuser fehlt Strom. Baue Windräder, Solarparks oder ein Kraftwerk.' });
    const loose = facs.filter((b) => b.gridless || (SERVICES[b.type]?.sub && b.hv < 0));
    if (loose.length) out.push({ k: 'loose', sev: 7, ic: 'i-pylon', t: `${SERVICES[loose[0].type].name} ist nicht angeschlossen: Stromleitung zu einem Umspannwerk an der Straße ziehen.`, b: loose[0] });
    if (W.dry > 0) out.push({ k: 'water', sev: 9, ic: 'i-drop', t: `Wassermangel: ${W.dry} Gebäude ohne Wasser. Baue Brunnen oder ein Wasserwerk.` });
    else if (now - (s.blocked?.water || -9) < 0.6) out.push({ k: 'water', sev: 6, ic: 'i-drop', t: 'Für neue Häuser fehlt Wasser. Baue einen Brunnen oder ein Wasserwerk am Fluss.' });
    if (st.sewage.untreated > 2) out.push({ k: 'sewage', sev: 5, ic: 'i-drop', t: 'Ungeklärtes Abwasser verschmutzt den Fluss. Baue eine Kläranlage am Ufer.' });
    if (W.quality < 0.8) out.push({ k: 'quality', sev: 6, ic: 'i-drop', t: 'Das Trinkwasser ist schlecht und macht krank. Hol Wasser flussaufwärts oder aus sauberem Boden.' });
    const G = s.waste.stats;
    const depots = facs.filter((b) => SERVICES[b.type]?.waste);
    if (G.overflow > 0) out.push({ k: 'garbage', sev: G.overflow > 10 ? 8 : 5, ic: 'i-bin', t: depots.length ? `Müll türmt sich an ${G.overflow} Häusern – mehr Müllwagen nötig.` : `Müll türmt sich an ${G.overflow} Häusern. Baue eine Mülldeponie.` });
    const full = depots.find((b) => s.waste.isFull(b) || (b.type === 'landfill' && (b.fill || 0) > SERVICES.landfill.waste.cap * 0.85));
    if (full) out.push({ k: 'full', sev: 7, ic: 'i-bin', t: `${SERVICES[full.type].name} ist ${s.waste.isFull(full) ? 'voll' : 'fast voll'}. Baue eine neue Deponie oder eine Müllverbrennung.`, b: full });
    if (s.safety.stats.waiting) out.push({ k: 'sos', sev: 8, ic: 'i-cross', t: `${s.safety.stats.waiting} Notruf(e) warten auf einen Rettungswagen. Baue eine Rettungswache.` });
    if (s.money < 0) out.push({ k: 'money', sev: 9, ic: 'i-coin', t: 'Die Stadtkasse ist leer! Steuern erhöhen, sparen oder einen Kredit aufnehmen.' });
    else if (s.incomePerDay < s.upkeepPerDay && s.money < 8000) out.push({ k: 'money', sev: 6, ic: 'i-coin', t: 'Die Stadt gibt mehr aus, als sie einnimmt.' });
    let noPark = 0;
    for (const b of facs) if (b.kind === 'com' && b.park !== undefined && b.park < 0.5 && b.level >= 2) noPark++;
    if (noPark > 2) out.push({ k: 'parking', sev: 4, ic: 'i-parking', t: `${noPark} Geschäfte haben zu wenig Kundenparkplätze. Baue Parkplätze, eine Tiefgarage oder ein Parkhaus.` });
    const tr = this.traffic;
    let jk = -1, jv = 0;
    for (let k = 0; k < tr.jam.length; k++) if (tr.jam[k] > jv) { jv = tr.jam[k]; jk = k; }
    if (jv > 3.5) {
      const N = w.N, jx = jk % N, jz = (jk / N) | 0, c = w.control(jx, jz);
      out.push({ k: 'jam', sev: 5, ic: 'i-lights', tile: [jx, jz], t: c === 1 ? 'Stau an einer Ampelkreuzung. Ein Kreisverkehr oder eine Hauptstraße hilft.' : c === 2 ? 'Stau am Kreisverkehr. Baue eine Hauptstraße oder eine Umgehung.' : 'Stau an einer Kreuzung ohne Ampel. Baue eine Ampel oder einen Kreisverkehr.' });
    }
    if (s.unemployment > 0.15 && s.pop > 150) out.push({ k: 'jobs', sev: 5, ic: 'i-work', t: `${Math.round(s.unemployment * 100)} % arbeitslos. Weise Gewerbe- und Industriegebiete aus.` });
    let badAir = 0; for (const b of facs) if (b.kind === 'res' && s.pollution.at(s.pollution.air, b) > 40) badAir++;
    if (badAir > 2) out.push({ k: 'air', sev: 5, ic: 'i-cloud', t: `Schlechte Luft in ${badAir} Wohnhäusern. Industrie und Kraftwerke weiter weg, Bäume pflanzen.` });
    const empty = facs.filter((b) => b.abandoned).length;
    if (empty) out.push({ k: 'empty', sev: 6, ic: 'i-home', t: `${empty} Gebäude stehen leer. Klicke darauf, um zu sehen, was fehlt.` });
    if (s.grace && s.day < s.grace.until) out.push({ k: 'grace', sev: 4, ic: 'i-star', t: `Übergang: Der Landkreis liefert noch ${Math.ceil(s.grace.until - s.day)} Tage extra Strom und Wasser. Baue eigene Werke!`, tip: true });
    return out.sort((a, b) => b.sev - a.sev);
  }
  renderAdvice() {
    const list = this.issues();
    this.issueList = list;
    // first time a serious problem shows up: a toast
    const seen = this.seenIssues || (this.seenIssues = new Set());
    for (const i of list) if (i.sev >= 7 && !seen.has(i.k)) { seen.add(i.k); this.toast(i.t, i.ic, 'var(--bad)', () => this.adviceAction(i.k)); }
    for (const k of [...seen]) if (!list.some((i) => i.k === k)) seen.delete(k);
    let html = list.slice(0, 2).map((i) => `<button class="adv ${i.tip ? 'tip' : ''}" data-adv="${i.k}">${icon(i.ic)}<span>${esc(i.t)}</span></button>`).join('');
    if (!list.length && this.sim.pop > 0) {
      const tips = ['Tipp: Ein Klick auf ein Haus zeigt, was die Leute glücklich oder unglücklich macht.', 'Tipp: Mit „Ansichten“ siehst du Strom, Wasser, Luft und Lärm als Karte.', 'Tipp: Industrie weit weg von Wohnhäusern – Lärm und Abgase stören.', 'Tipp: Gründe in der Region weitere Städte und handle Strom und Wasser.'];
      const t = tips[Math.floor(this.sim.day / 2) % tips.length];
      html = `<button class="adv tip" data-adv="tip">${icon('i-star')}<span>${t}</span></button>`;
    }
    if (html !== this.adviceHtml && !this.adviceHeld) { this.adviceHtml = html; $('advice').innerHTML = html; }
  }
  adviceAction(k) {
    const i = (this.issueList || []).find((x) => x.k === k);
    if (i?.b) { const b = i.b; this.cam.lookAt(b.x + b.w / 2, b.z + b.h / 2, 3); this.select({ type: 'building', ref: b }); }
    if (i?.tile) { this.cam.lookAt(i.tile[0] + 0.5, i.tile[1] + 0.5, 2.6); this.pickTool('traffic'); this.showView('traffic', true); return; }
    const menus = { parking: 'traffic', power: 'power', loose: 'power', water: 'water', sewage: 'water', quality: 'water', garbage: 'waste', full: 'waste', sos: 'care' };
    const views = { parking: 'traffic', power: 'power', loose: 'power', water: 'water', sewage: 'river', quality: 'river', garbage: 'garbage', full: 'garbage', sos: 'health', air: 'air', empty: 'mood', jobs: 'mood' };
    if (k === 'money') { this.openBudget(); return; }
    if (k === 'tip') { this.openViews(); return; }
    if (menus[k] && !i?.b) this.pickTool(menus[k]);
    if (views[k]) this.showView(views[k], !!menus[k]);
  }

  // ---- budget: taxes, income and spending, loans
  openBudget() {
    const s = this.sim;
    const L = { taxRes: 'Steuern Wohnen', taxCom: 'Steuern Gewerbe', taxInd: 'Steuern Industrie', powerSold: 'Stromverkauf ans Umland', services: 'Öffentliche Gebäude und Werke', admin: 'Verwaltung und Personal', roads: 'Straßen, Leitungen, Haltestellen', powerImp: 'Strom vom Landkreis', waterImp: 'Wasser vom Landkreis', sewageImp: 'Abwasser zum Landkreis', loans: 'Kreditraten', contracts: 'Verträge mit Nachbarstädten' };
    const O = { build: 'Bauen', garbageExt: 'Müllabfuhr des Landkreises', rescueExt: 'Rettungsdienst des Landkreises', fireExt: 'Feuerwehr des Landkreises', recycling: 'Verkauf von Wertstoffen', loan: 'Kredite' };
    const row = (l, v) => `<tr><td>${l}</td><td class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '−'}${fmtMoney(Math.abs(v))}</td></tr>`;
    const render = () => {
      s.recount();
      let h = '';
      for (const k in s.flows) if (Math.abs(s.flows[k]) >= 0.5) h += row(L[k] || k, s.flows[k]);
      h += `<tr class="sum"><td>Pro Tag</td><td class="${s.incomePerDay - s.upkeepPerDay >= 0 ? 'pos' : 'neg'}">${s.incomePerDay - s.upkeepPerDay >= 0 ? '+' : '−'}${fmtMoney(Math.abs(s.incomePerDay - s.upkeepPerDay))}</td></tr>`;
      let o = '';
      for (const k in s.ledger.yesterday) if (Math.abs(s.ledger.yesterday[k]) >= 1) o += row(O[k] || k, s.ledger.yesterday[k]);
      return { h, o };
    };
    const tax = (k, n) => `<label class="tax"><span>${n}</span><input type="range" min="0" max="20" step="1" value="${s.tax[k]}" data-tax="${k}"><b id="tx_${k}">${s.tax[k]} %</b></label>`;
    const loans = () => (s.loans.length ? s.loans.map((l, i) => `<div class="deal"><span>Kredit ${i + 1}: noch ${fmtMoney(l.left)}</span><b class="neg">−${fmtMoney(l.perDay)}/Tag</b></div>`).join('') : '<p class="fine">Keine Kredite.</p>');
    const r = render();
    this.openModal(`<div class="budget">
      <h1>Haushalt</h1>
      <p class="lead">Kasse: <b>${fmtMoney(s.money)}</b> · Schwierigkeit: ${esc(s.diff.name)}</p>
      <h2>Steuern</h2>
      ${tax('res', 'Wohnen')}${tax('com', 'Gewerbe')}${tax('ind', 'Industrie')}
      <p class="fine">Höhere Steuern bringen mehr Geld, machen die Leute aber unzufriedener und bremsen die Nachfrage.</p>
      <h2>Einnahmen und Ausgaben pro Tag</h2>
      <table class="btable" id="bFlows">${r.h}</table>
      ${r.o ? `<h2>Einmalig gestern</h2><table class="btable">${r.o}</table>` : ''}
      <h2>Kredite</h2>
      <div id="bLoans">${loans()}</div>
      <div class="actions"><button class="btn" id="bTake" ${s.loans.length >= s.loanInfo.max ? 'disabled' : ''}>${icon('i-coin')}Kredit aufnehmen (${fmtMoney(s.loanInfo.amount)})</button><button class="btn" id="bRepay" ${s.loans.length ? '' : 'disabled'}>Kredit ablösen</button></div>
      <p class="fine">Ein Kredit wird in ${s.loanInfo.days} Tagen mit ${Math.round((s.loanInfo.total - 1) * 100)} % Zinsen zurückgezahlt.</p>
      <div class="actions"><button class="btn primary" id="mClose">Schließen</button></div></div>`);
    for (const inp of document.querySelectorAll('[data-tax]')) inp.oninput = () => {
      s.tax[inp.dataset.tax] = Number(inp.value);
      $(`tx_${inp.dataset.tax}`).textContent = `${inp.value} %`;
      $('bFlows').innerHTML = render().h;
    };
    $('bTake').onclick = () => { if (s.takeLoan()) { this.toast(`Kredit über ${fmtMoney(s.loanInfo.amount)} aufgenommen.`, 'i-coin'); this.openBudget(); } };
    $('bRepay').onclick = () => { if (s.repayLoan()) { this.toast('Kredit abgelöst.', 'i-coin'); this.openBudget(); } else this.toast('Dafür reicht das Geld nicht.', 'i-coin', 'var(--bad)'); };
    $('mClose').onclick = () => this.closeModal();
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
    // the simulation holds back its bigger jobs while the map is being moved
    this.sim.interacting = this.game.interacting = this.pointers.size > 0 || now < (this.interactUntil || 0) || this.cam.vel.lengthSq() > 0;
    // safety net: the camera is only held while a drag or pinch is really running
    if (this.cam.held && (!this.drag || (this.drag.mode !== 'pan' && this.drag.mode !== 'gesture'))) this.cam.held = false;
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
      <p>Häuser brauchen <b>Strom</b> und <b>Wasser</b>, der Müll muss abgeholt werden, Kranke brauchen Ärzte und Rettungswagen. Anfangs hilft der Landkreis – teuer und nur ein bisschen. Plane Kraftwerke, Leitungen, Wasserwerke, Kläranlage und Deponie, halte Luft und Fluss sauber und die Leute zufrieden, sonst ziehen sie weg.</p>
      <p>Vom <b>Dorf</b> zur <b>Kleinstadt</b>, <b>Stadt</b>, <b>Großstadt</b> und <b>Metropole</b>. Über die <b>Region</b> gründest du weitere Städte.</p>
      <div class="actions"><button class="btn primary" id="mStart">Los geht's</button></div>`);
    $('mStart').onclick = () => { this.closeModal(); onStart?.(); };
  }
  // shown once when a town from before the update is loaded
  whatsNew() {
    this.openModal(`
      <h1>Neu in ${esc(this.sim.cityName)}</h1>
      <p class="lead">Aus der Stadt wird eine echte Simulation.</p>
      <div class="howto">
        <kbd>${icon('i-bolt')} Strom</kbd><span>Windräder, Solarparks, Kohle-, Gas- und Wasserkraft. Großkraftwerke brauchen Leitungen und ein Umspannwerk.</span>
        <kbd>${icon('i-drop')} Wasser</kbd><span>Brunnen, Wasserturm, Wasserwerk – und eine Kläranlage, sonst wird der Fluss braun.</span>
        <kbd>${icon('i-bin')} Müll</kbd><span>Müllwagen holen den Abfall zur Deponie, zum Wertstoffhof oder in die Verbrennung.</span>
        <kbd>${icon('i-cross')} Gesundheit</kbd><span>Arztpraxis, Rettungswache, Krankenhaus. Notrufe brauchen Rettungswagen.</span>
        <kbd>${icon('i-smile')} Zufriedenheit</kbd><span>Lärm, Abgase, Müll, Steuern: Unzufriedene ziehen weg, Häuser stehen leer.</span>
        <kbd>${icon('i-map')} Region</kbd><span>Gründe weitere Städte und handle Strom und Wasser mit den Nachbarn.</span>
      </div>
      <p>Damit nichts zusammenbricht, liefert der Landkreis noch <b>${Math.max(0, Math.ceil((this.sim.grace?.until || 0) - this.sim.day))} Tage</b> lang extra Strom und Wasser. Nutze die Zeit für eigene Kraft- und Wasserwerke!</p>
      <div class="actions"><button class="btn primary" id="mClose">Los geht's</button></div>`);
    $('mClose').onclick = () => this.closeModal();
  }
  openMenu() {
    const hasSave = this.save?.exists();
    this.openModal(`
      <h1>Menü</h1>
      <p class="lead">${esc(this.sim.cityName || 'Lindenau')} · Tag ${this.sim.day} · ${fmtNum(this.sim.pop)} Einwohner</p>
      <div class="menu-list">
        <button class="btn" id="mSave">${icon('i-star')}Spiel speichern</button>
        <button class="btn" id="mLoad" ${hasSave ? '' : 'disabled'}>${icon('i-clock')}Gespeichertes Spiel laden</button>
        <button class="btn" id="mRegion">${icon('i-map')}Region: weitere Städte</button>
        <button class="btn" id="mBudget">${icon('i-chart')}Haushalt und Steuern</button>
        <button class="btn" id="mFollow">${icon('i-eye')}Einer zufälligen Person folgen</button>
        <button class="btn" id="mShadows">${icon('i-sun')}Schatten: ${this.renderer.shadowMap.enabled ? 'an' : 'aus'}</button>
        <button class="btn" id="mHelp">${icon('i-cursor')}Bedienung</button>
        <button class="btn danger" id="mNew">${icon('i-bulldoze')}Neues Spiel beginnen</button>
      </div>
      <p class="fine">Das Spiel speichert automatisch jede Minute in diesem Browser – jede Stadt der Region für sich.</p>
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
    $('mRegion').onclick = () => this.region?.open();
    $('mBudget').onclick = () => this.openBudget();
    $('mHelp').onclick = () => this.welcome();
    let armed = false;
    $('mNew').onclick = (e) => {
      if (!armed) { armed = true; e.currentTarget.classList.add('confirm'); e.currentTarget.lastChild.textContent = 'Wirklich neu beginnen? Nochmal klicken'; return; }
      this.closeModal(); this.save?.reset();
    };
  }
}
