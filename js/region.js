import { TERRAINS, terrainOf } from './terrain.js';
import { DIFFICULTY } from './config.js';
import { fbm } from './util.js';

// ---------------------------------------------------------------------------
// The region: six town sites side by side. Each founded town has its own
// save. Neighbours can sign supply deals (power over high-voltage lines to
// the shared map edge, water through a road to it). Only the open town is
// simulated; the others keep the numbers from when they were last played.
// ---------------------------------------------------------------------------

export const SITES = [
  { id: 'a', gx: 0, gy: 0, type: 'river', name: 'Lindenau' },
  { id: 'b', gx: 1, gy: 0, type: 'lakes', name: 'Seebach' },
  { id: 'c', gx: 2, gy: 0, type: 'forest', name: 'Tannrode' },
  { id: 'd', gx: 0, gy: 1, type: 'plain', name: 'Kornfeld' },
  { id: 'e', gx: 1, gy: 1, type: 'coast', name: 'Möwenstedt' },
  { id: 'f', gx: 2, gy: 1, type: 'delta', name: 'Zweiflüssen' },
];
const KEY = 'lindenau-region-v1';
const PRICE = { power: 60, water: 0.9 };
const UNIT = { power: 'MW', water: 'm³/Tag' };
const RES_NAME = { power: 'Strom', water: 'Wasser' };
const DIRN = { N: 'Nordrand', E: 'Ostrand', S: 'Südrand', W: 'Westrand' };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('de-DE');

export function seedOf(id) { return 20261013 + (id.charCodeAt(0) - 97) * 7919; }
const site = (id) => SITES.find((s) => s.id === id);

export class Region {
  constructor(app) {
    this.app = app;
    this.meta = this.load();
  }
  load() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { m = null; }
    return m && m.cities ? m : { current: 'a', cities: {}, deals: [] };
  }
  store() { try { localStorage.setItem(KEY, JSON.stringify(this.meta)); } catch (e) { /* storage unavailable */ } }
  get current() { return this.meta.current || 'a'; }

  // neighbouring site in a direction
  neighbour(id, dir) {
    const s = site(id);
    const d = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[dir];
    return SITES.find((o) => o.gx === s.gx + d[0] && o.gy === s.gy + d[1]) || null;
  }
  dirTo(a, b) {
    for (const d of ['N', 'E', 'S', 'W']) if (this.neighbour(a, d)?.id === b) return d;
    return null;
  }

  // ---- live data of the open town
  edges() {
    const w = this.app.game.world, N = w.N;
    const e = { road: { N: false, E: false, S: false, W: false }, line: { N: false, E: false, S: false, W: false } };
    for (let i = 0; i < N; i++) {
      const t = [['N', i, 0], ['S', i, N - 1], ['W', 0, i], ['E', N - 1, i]];
      for (const [d, x, z] of t) { const k = w.idx(x, z); if (w.road[k]) e.road[d] = true; if (w.pline[k]) e.line[d] = true; }
    }
    return e;
  }
  snapshot(withThumb = false) {
    const { sim, ui } = this.app;
    const id = this.current;
    const st = sim.util.stats;
    const c = this.meta.cities[id] || (this.meta.cities[id] = { founded: true });
    const P = st?.power, W = st?.water;
    const own = P ? P.gen.wind + P.gen.solar + P.gen.thermal + P.gen.hydro + P.gen.waste : 0;
    Object.assign(c, {
      name: sim.cityName, type: this.app.game.world.ttype, pop: sim.pop, stage: sim.stage, money: Math.round(sim.money), day: sim.day, diff: sim.diffKey,
      edges: this.edges(), founded: true,
      offer: { power: P ? Math.max(0, own - P.demand) : 0, water: W ? Math.max(0, W.produced - W.demand) : 0 },
      delivered: sim.util.delivered || { power: 1, water: 1 },
    });
    if (withThumb && ui) { try { ui.drawMinimap(); c.thumb = ui.miniBuf.toDataURL('image/png'); } catch (e) { /* no canvas */ } }
    this.store();
  }

  // ---- deals seen by the open town
  deals() { return (this.meta.deals || []).filter((d) => this.meta.cities[d.from]?.founded && this.meta.cities[d.to]?.founded); }
  imports() {
    const out = { power: 0, water: 0 };
    for (const d of this.deals()) if (d.to === this.current) out[d.res] += d.amount * (this.meta.cities[d.from]?.delivered?.[d.res] ?? 1);
    return out;
  }
  exports() {
    const out = { power: 0, water: 0 };
    for (const d of this.deals()) if (d.from === this.current) out[d.res] += d.amount;
    return out;
  }
  money() {
    let m = 0;
    for (const d of this.deals()) {
      if (d.from === this.current) m += d.amount * d.price * (this.app.sim.util.delivered?.[d.res] ?? 1);
      if (d.to === this.current) m -= d.amount * d.price;
    }
    return m;
  }
  connected(a, b, res) {
    const da = this.dirTo(a, b), db = OPP[da];
    const ea = a === this.current ? this.edges() : this.meta.cities[a]?.edges;
    const eb = b === this.current ? this.edges() : this.meta.cities[b]?.edges;
    const k = res === 'power' ? 'line' : 'road';
    return { ok: !!(ea?.[k]?.[da] && eb?.[k]?.[db]), a: !!ea?.[k]?.[da], b: !!eb?.[k]?.[db], da, db };
  }

  // ---- switching and founding
  switchTo(id, opts = {}) {
    const { save } = this.app;
    this.snapshot(true);
    save.store();
    this.meta.current = id;
    this.store();
    save.use(id);
    const st = save.read();
    const s = site(id);
    if (st) this.app.applyState(st, { id });
    else this.app.applyState(null, { id, type: s.type, seed: seedOf(id), name: opts.name || s.name, diff: opts.diff || 'normal' });
    this.snapshot(true);
    save.store();
  }

  // ---- the region window
  open() {
    const ui = this.app.ui;
    this.snapshot(true);
    const cur = this.current;
    const cities = this.meta.cities;
    const total = Object.values(cities).reduce((a, c) => a + (c.founded ? c.pop || 0 : 0), 0);
    let tiles = '';
    for (const s of SITES) {
      const c = cities[s.id];
      const T = TERRAINS[s.type];
      const lab = c?.founded
        ? `<b>${esc(c.name)}</b>${fmt(c.pop)} Einwohner · ${T.name}${s.id === cur ? ' · <i>hier bist du</i>' : ''}`
        : `<b>${esc(s.name)}</b>${T.name} · noch frei`;
      tiles += `<button class="site ${s.id === cur ? 'cur' : ''} ${c?.founded ? '' : 'free'}" data-site="${s.id}">${c?.thumb ? `<img alt="" src="${c.thumb}">` : `<canvas width="72" height="72" data-prev="${s.id}"></canvas>`}<span class="lab">${lab}</span></button>`;
    }
    ui.openModal(`
      <h1>Region Lindenauer Land</h1>
      <p class="lead">${Object.values(cities).filter((c) => c.founded).length} von ${SITES.length} Städten gegründet · ${fmt(total)} Einwohner insgesamt</p>
      <div class="region-map">${tiles}</div>
      <div id="rgPanel"></div>
      <div class="actions"><button class="btn primary" id="mClose">Schließen</button></div>`);
    for (const cv of document.querySelectorAll('[data-prev]')) this.preview(cv, site(cv.dataset.prev));
    for (const b of document.querySelectorAll('[data-site]')) b.onclick = () => this.panel(b.dataset.site);
    document.getElementById('mClose').onclick = () => ui.closeModal();
    this.panel(cur);
  }

  // landscape preview of a site nobody has founded yet
  preview(cv, s) {
    const x = cv.getContext('2d'), N = 72;
    const img = x.createImageData(N, N);
    const T = terrainOf(s.type), seed = seedOf(s.id);
    for (let z = 0; z < N; z++) for (let i = 0; i < N; i++) {
      let c = [111, 150, 74];
      if (T.water(i, z, N, true, seed)) c = [74, 144, 184];
      else if (fbm(i * 0.09, z * 0.09, seed) > T.forest) c = [62, 104, 52];
      const k = (z * N + i) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }

  panel(id) {
    const el = document.getElementById('rgPanel');
    const s = site(id), c = this.meta.cities[id], cur = this.current, T = TERRAINS[s.type];
    for (const b of document.querySelectorAll('[data-site]')) b.style.outline = b.dataset.site === id ? '2px solid rgba(255,255,255,0.5)' : '';
    if (!c?.founded) {
      el.innerHTML = `<h2>${esc(s.name)} gründen</h2><p class="fine">${T.name}: ${T.desc}</p>
        <div class="found"><input id="rgName" maxlength="24" value="${esc(s.name)}" aria-label="Name der neuen Stadt">
        <select id="rgDiff" aria-label="Schwierigkeit">${Object.entries(DIFFICULTY).map(([k, d]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${d.name} – ${d.desc}</option>`).join('')}</select>
        <button class="btn primary" id="rgFound">Stadt gründen</button></div>
        <p class="fine">Deine jetzige Stadt wird gespeichert und wartet auf dich.</p>`;
      document.getElementById('rgFound').onclick = () => {
        const name = document.getElementById('rgName').value.trim() || s.name;
        const diff = document.getElementById('rgDiff').value;
        this.app.ui.closeModal();
        this.switchTo(id, { name, diff });
        this.app.ui.toast(`${name} ist gegründet! Viel Erfolg.`, 'i-flag', 'var(--accent)');
      };
      return;
    }
    let h = `<h2>${esc(c.name)}</h2><p class="fine">${T.name} · Tag ${c.day || 1} · ${fmt(c.pop)} Einwohner · Kasse ${fmt(c.money)} €</p>`;
    if (id !== cur) h += `<div class="actions"><button class="btn primary" id="rgGo">Nach ${esc(c.name)} wechseln</button></div>`;
    // deals with neighbours
    const nbs = ['N', 'E', 'S', 'W'].map((d) => this.neighbour(id, d)).filter((n) => n && this.meta.cities[n.id]?.founded);
    const deals = this.deals().filter((d) => d.from === id || d.to === id);
    h += '<h2>Lieferverträge</h2>';
    if (!deals.length) h += '<p class="fine">Noch keine Verträge.</p>';
    for (const d of deals) {
      const other = this.meta.cities[d.from === id ? d.to : d.from];
      const sells = d.from === id;
      const conn = this.connected(d.from, d.to, d.res);
      h += `<div class="deal"><span>${sells ? 'Liefert' : 'Bekommt'} ${fmt(d.amount)} ${UNIT[d.res]} ${RES_NAME[d.res]} ${sells ? 'an' : 'von'} ${esc(other.name)} · ${d.price.toString().replace('.', ',')} € je ${UNIT[d.res].split('/')[0]} und Tag${conn.ok ? '' : ' · <b style="color:var(--bad)">nicht verbunden</b>'}</span><button class="btn" data-del="${d.id}">Kündigen</button></div>`;
    }
    if (id === cur && nbs.length) {
      h += `<div class="found" style="grid-template-columns:1fr 1fr">
        <select id="dlWho">${nbs.map((n) => `<option value="${n.id}">${esc(this.meta.cities[n.id].name)}</option>`).join('')}</select>
        <select id="dlRes"><option value="power">Strom</option><option value="water">Wasser</option></select>
        <select id="dlDir"><option value="buy">kaufen</option><option value="sell">verkaufen</option></select>
        <input id="dlAmt" type="number" min="1" step="1" value="5" aria-label="Menge">
        </div><p class="fine" id="dlInfo"></p><div class="actions"><button class="btn" id="dlMake">Vertrag schließen</button></div>`;
    } else if (id === cur) h += '<p class="fine">Gründe eine Nachbarstadt, um mit ihr Strom und Wasser zu handeln.</p>';
    el.innerHTML = h;
    document.getElementById('rgGo')?.addEventListener('click', () => { this.app.ui.closeModal(); this.switchTo(id); this.app.ui.toast(`Willkommen zurück in ${c.name}!`, 'i-flag'); });
    for (const b of el.querySelectorAll('[data-del]')) b.onclick = () => { this.meta.deals = this.meta.deals.filter((d) => String(d.id) !== b.dataset.del); this.store(); this.app.sim.recount(); this.panel(id); };
    const info = () => {
      const who = document.getElementById('dlWho')?.value; if (!who) return;
      const res = document.getElementById('dlRes').value, dir = document.getElementById('dlDir').value;
      const from = dir === 'sell' ? cur : who, to = dir === 'sell' ? who : cur;
      const conn = this.connected(from, to, res);
      const what = res === 'power' ? 'eine Stromleitung' : 'eine Straße';
      const amt = Number(document.getElementById('dlAmt').value) || 0;
      let t = `${fmt(amt)} ${UNIT[res]} für ${fmt(amt * PRICE[res])} € am Tag. `;
      if (!conn.a) t += `${esc(this.meta.cities[from].name)} braucht ${what} bis zum ${DIRN[conn.da]}. `;
      if (!conn.b) t += `${esc(this.meta.cities[to].name)} braucht ${what} bis zum ${DIRN[conn.db]}. `;
      const offer = from === cur ? null : this.meta.cities[from].offer?.[res];
      if (offer !== null && offer !== undefined) t += `${esc(this.meta.cities[from].name)} hat zuletzt ${fmt(offer)} ${UNIT[res]} übrig gehabt.`;
      document.getElementById('dlInfo').innerHTML = t;
      return { from, to, res, amt, conn };
    };
    for (const i of ['dlWho', 'dlRes', 'dlDir', 'dlAmt']) document.getElementById(i)?.addEventListener('input', info);
    info();
    document.getElementById('dlMake')?.addEventListener('click', () => {
      const d = info();
      if (!d || d.amt <= 0) return;
      if (!d.conn.ok) { this.app.ui.toast('Die Städte sind dafür noch nicht verbunden.', 'i-map', 'var(--bad)'); return; }
      this.meta.deals = this.meta.deals || [];
      this.meta.deals.push({ id: Date.now(), from: d.from, to: d.to, res: d.res, amount: d.amt, price: PRICE[d.res] });
      this.store();
      this.app.sim.recount();
      this.app.ui.toast('Vertrag geschlossen.', 'i-map', 'var(--good)');
      this.panel(id);
    });
  }
}
