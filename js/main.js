import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { makeMaterials, makeEnvironment, U } from './materials.js';
import { initBuildgen } from './buildgen.js';
import { Environment } from './env.js';
import { IsoCamera } from './camera.js';
import { Game } from './game.js';
import { Sim } from './sim.js';
import { Sites, siteStage } from './construction.js';
import { Traffic } from './traffic.js';
import { People } from './people.js';
import { FX } from './fx.js';
import { Furniture } from './furniture.js';
import { Overlay } from './overlay.js';
import { UI } from './ui.js';
import { SaveSystem, unb64 } from './save.js';
import { Soundscape } from './audio.js';
import { MAP_N, GROW, SERVICES, STAGES } from './config.js';
import { fmtNum, pick } from './util.js';

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 720;
const QUALITY = {
  high: { atlas: 256, ground: 512, shadowMap: 4096, pixelRatio: Math.min(devicePixelRatio, 2), shadows: true, people: 520, cars: 170 },
  mid: { atlas: 128, ground: 512, shadowMap: 2048, pixelRatio: Math.min(devicePixelRatio, 1.6), shadows: true, people: 260, cars: 100 },
  low: { atlas: 128, ground: 256, shadowMap: 1024, pixelRatio: 1, shadows: false, people: 120, cars: 50 },
};
const Q = QUALITY[params.get('q')] || (coarse ? QUALITY.mid : QUALITY.high);
const manual = params.has('manual');

function storage(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  return null;
}

async function boot(hotData) {
  try { await document.fonts?.load('600 40px Fredoka'); } catch (e) { /* fonts are optional */ }
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.pixelRatio);
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);
  const T = makeTextures(Q);
  initBuildgen(T.atlas);
  const M = makeMaterials(T);
  const env = new Environment(scene, renderer, Q);
  const cam = new IsoCamera(MAP_N);
  const game = new Game(scene, M);
  game.startNew();
  const sim = new Sim(game);
  sim.cityName = 'Lindenau';
  const sites = new Sites(scene, game, M);
  const traffic = new Traffic(scene, game, M, T, Q);
  const people = new People(scene, game, M, Q);
  const fx = new FX(scene, T);
  const furniture = new Furniture(scene, game, M, T);
  const overlay = new Overlay(scene);
  game.chunks.rebuildAll();

  const app = { game, sim, cam, traffic, people, sites, fx, overlay, renderer, canvas };
  const save = new SaveSystem(app);
  const sound = new Soundscape();
  const ui = new UI({ ...app, save, audio: sound });
  app.ui = ui;
  let buildVersion = 0;

  // ---- reset or restore the whole city in place
  app.applyState = (st) => {
    const w = game.world;
    for (const b of [...w.buildings.values()]) { w.removeBuilding(b); game.chunks.setBuildingGeo(b, null); }
    w.buildings.clear();
    w.bld.fill(-1);
    if (st) {
      w.terrain.set(unb64(st.world.terrain)); w.road.set(unb64(st.world.road)); w.zone.set(unb64(st.world.zone));
      w.trees.set(unb64(st.world.trees)); w.busstop.set(unb64(st.world.busstop));
      w.nextId = st.world.nextId; w.centre = st.world.centre;
      for (const o of st.buildings) {
        const b = { ...o };
        w.buildings.set(b.id, b);
        for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) w.bld[w.idx(b.x + i, b.z + j)] = b.id;
        game.realize(b);
      }
      Object.assign(sim, { money: st.sim.money, day: st.sim.day, hour: st.sim.hour, stage: st.sim.stage, cityName: st.sim.cityName || 'Lindenau', history: st.sim.history || [] });
    } else {
      w.terrain.fill(0); w.road.fill(0); w.zone.fill(0); w.trees.fill(0); w.busstop.fill(0); w.nextId = 1;
      w.genTerrain();
      game.startNew();
      Object.assign(sim, { money: 30000, day: 1, hour: 9, stage: 0, cityName: 'Lindenau', history: [] });
    }
    document.getElementById('cityName').value = sim.cityName;
    w.version++;
    for (let z = 0; z < w.N; z++) for (let x = 0; x < w.N; x++) w.markDirty(x, z);
    game.chunks.rebuildAll();
    game.countryDirty = true; game.treesDirty = true;
    sites.clear(); traffic.clear(); people.clear();
    sim.recount(); sim.computeLandValue(); sim.computeDemand();
    buildVersion++;
    cam.lookAt(w.centre[0] + 0.5, w.centre[1] + 0.5, 4.6); cam.snapPan();
    ui.closeInfo();
  };

  ui.toggleShadows = () => {
    renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
    env.sun.castShadow = renderer.shadowMap.enabled;
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  };

  // restore a previous session (live-reload snapshot first, then the browser save)
  const saved = hotData && hotData.v === 1 ? hotData : save.read();
  window.claude?.hot?.snapshot?.(() => save.serialize());
  if (saved && !params.has('fresh')) app.applyState(saved);
  else { cam.lookAt(game.world.centre[0] + 0.5, game.world.centre[1] + 0.5, 4.6); cam.snapPan(); cam.view = cam.goalView; }

  // ---- reactions to simulation events
  let lastBuiltToast = 0;
  const view = { x: 0, z: 0, r: 10, ppu: 50 };
  const near = (b, k = 1) => Math.abs(b.x + b.w / 2 - view.x) < view.r * k && Math.abs(b.z + b.h / 2 - view.z) < view.r * k;
  const jump = (b) => () => cam.lookAt(b.x + b.w / 2, b.z + b.h / 2, Math.max(cam.goalView < 4 ? cam.goalView : 3, 2));
  game.on('built', (b) => {
    buildVersion++;
    const now = performance.now();
    const lvl = GROW[b.kind]?.[b.level];
    let msg = null;
    if (b.kind === 'svc') msg = `${SERVICES[b.type].name} ist fertig.`;
    else if (b.level >= 3 || now - lastBuiltToast > 5000) {
      if (b.kind === 'res') msg = b.level === 1 ? `Familie ${b.name.split(' ').pop()} ist eingezogen.` : `${lvl.name} fertig: ${fmtNum(b.pop)} neue Einwohner.`;
      else if (b.kind === 'com') msg = `${b.name} hat eröffnet.`;
      else msg = `${b.name} nimmt die Arbeit auf.`;
    }
    if (msg) { lastBuiltToast = now; ui.toast(msg, b.kind === 'res' ? 'i-home' : b.kind === 'com' ? 'i-shop' : b.kind === 'ind' ? 'i-factory' : 'i-civic', null, jump(b)); }
    if (b.kind === 'res' && near(b, 1.4)) traffic.sendTo('moving', b, 'moving', 6, 'Umzugswagen');
  });
  game.on('removed', () => { buildVersion++; });
  game.on('construction', (b) => {
    if (b.level >= 3 || (b.kind === 'svc' && b.w * b.h > 1)) ui.toast(`Baubeginn: ${b.kind === 'svc' ? SERVICES[b.type].name : GROW[b.kind][b.level].name}`, 'i-crane', null, jump(b));
  });
  game.on('progress', (b, before) => {
    if (siteStage(before) < 2 && siteStage(b.progress) >= 2 && near(b, 1.5)) traffic.sendTo('mixer', b, 'site', 7, 'Betonmischer');
  });
  let fireworks = 0;
  game.on('stage', (st) => {
    const S = STAGES[st];
    ui.banner(S.name, S.text);
    ui.toast(`${sim.cityName} ist jetzt eine ${S.name}!`, 'i-star', 'var(--accent)');
    fireworks = 14;
    ui.audio?.play('fanfare');
  });
  game.on('emergencyArrived', (v) => {
    const b = game.world.buildings.get(v.data.fire);
    if (b && b.fire) { b.fire = null; ui.toast(`Brand in ${b.name} gelöscht. Danke, Feuerwehr!`, 'i-fire', 'var(--good)', jump(b)); }
  });

  // fires
  let fireTimer = 150;
  const burning = new Set();
  function updateFires(dt) {
    fireTimer -= dt;
    if (fireTimer <= 0 && sim.pop > 120) {
      fireTimer = 160 + Math.random() * 200;
      const all = [...game.world.buildings.values()].filter((b) => b.state === 'done' && b.kind !== 'svc' && !b.fire);
      const vis = all.filter((b) => near(b, 0.8));
      const b = vis.length && Math.random() < 0.7 ? pick(Math.random, vis) : pick(Math.random, all);
      if (b) {
        b.fire = { t: 0, truck: null };
        burning.add(b);
        ui.toast(`Feuer in ${b.name}! Die Feuerwehr rückt aus.`, 'i-fire', 'var(--bad)', jump(b));
        const stations = [...game.world.buildings.values()].filter((s) => s.type === 'firestation' && s.state === 'done');
        stations.sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
        for (const st of stations) { const v = traffic.dispatch('fire', st, b, { fire: b.id, dwell: 8 }); if (v) { b.fire.truck = v.id; break; } }
        if (!b.fire.truck) ui.toast('Keine Feuerwache erreichbar – das Haus brennt nieder!', 'i-fire', 'var(--bad)');
      }
    }
    for (const b of [...burning]) {
      if (!game.world.buildings.has(b.id) || !b.fire) { burning.delete(b); continue; }
      b.fire.t += dt;
      const truck = b.fire.truck && traffic.vehicles.find((v) => v.id === b.fire.truck);
      if (b.fire.t > (truck ? 160 : 55)) {
        burning.delete(b);
        ui.toast(`${b.name} ist abgebrannt.`, 'i-fire', 'var(--bad)');
        sim.demolish(b);
      }
    }
  }

  // emitters for smoke, fountains, dust and fire
  function updateEmitters(dt, t) {
    for (const b of game.world.buildings.values()) {
      if (!near(b, 1.1)) continue;
      if (b.state === 'done') {
        if (b.smoke) for (const s of b.smoke) { const n = fx.rate(`s${b.id}`, 2.2, dt); for (let i = 0; i < n; i++) fx.smoke(s[0], s[1], s[2]); }
        if (b.fountain && view.ppu > 18) { const n = fx.rate(`f${b.id}`, 30, dt); for (let i = 0; i < n; i++) fx.water(b.fountain[0], b.fountain[1], b.fountain[2]); }
        if (b.beacon) fx.beacon(b.beacon[0], b.beacon[1], b.beacon[2], t + b.id);
        if (b.fire) {
          const cx = b.x + b.w / 2, cz = b.z + b.h / 2, top = (b.height || 0.6) * 0.75;
          let n = fx.rate(`F${b.id}`, 28, dt); for (let i = 0; i < n; i++) fx.fire(cx, top * Math.random() + 0.1, cz, 0.35 * b.w);
          n = fx.rate(`S${b.id}`, 5, dt); for (let i = 0; i < n; i++) fx.smoke(cx, top + 0.1, cz, true);
        }
      } else if (b.state === 'build') {
        const st = siteStage(b.progress);
        if (st === 1 || st === 2) { const n = fx.rate(`d${b.id}`, 3, dt); for (let i = 0; i < n; i++) fx.dust(b.x + b.w / 2, b.z + b.h / 2, 0.5 * b.w); }
      }
    }
    for (const v of traffic.vehicles) {
      if (v.data.siren && Math.abs(v.pos[0] - view.x) < view.r && Math.abs(v.pos[1] - view.z) < view.r) fx.siren(v.pos[0], 0.3, v.pos[1], t + v.id);
      if (v.data.fire && v.dwell > 0 && !v.data.returning) { const n = fx.rate(`w${v.id}`, 40, dt); for (let i = 0; i < n; i++) fx.water(v.pos[0], 0.3, v.pos[1]); }
    }
    if (fireworks > 0) {
      fireworks -= dt;
      const c = game.world.centre;
      if (fx.rate('fw', 2.2, dt)) fx.firework(c[0] + (Math.random() - 0.5) * 8, c[1] + (Math.random() - 0.5) * 8);
    }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    cam.resize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now(), elapsed = 0, autosave = 0;
  function step(dt, now, render = true) {
    elapsed += dt;
    const simDt = dt * sim.speed;
    U.uTime.value = elapsed;
    // view region for spawning and culling
    const el = cam.elevation();
    view.x = cam.target.x; view.z = cam.target.z;
    view.ppu = cam.ppu();
    view.r = Math.max(cam.view * cam.aspect, cam.view / Math.sin(el)) + 1.5;
    sim.tick(simDt);
    updateFires(simDt);
    sites.update(simDt);
    traffic.update(simDt, sim, view);
    people.update(simDt, sim, view, sites);
    updateEmitters(simDt, elapsed);
    fx.update(simDt, view.ppu * renderer.getPixelRatio());
    furniture.update(buildVersion);
    game.update(dt);
    ui.update(dt, now);
    cam.update(dt);
    env.update(ui.displayHour(), cam.target, cam.view);
    game.nature.update(dt, elapsed);
    if (sound.on) {
      let cars = 0, sitesNear = 0, church = false;
      for (const v of traffic.vehicles) if (Math.abs(v.pos[0] - view.x) < view.r && Math.abs(v.pos[1] - view.z) < view.r) cars++;
      for (const s of sites.sites.values()) if (near(s.b, 0.7)) sitesNear++;
      for (const b of game.world.buildings.values()) if (b.type === 'church' && b.state === 'done') { church = true; break; }
      sound.update(dt, { hour: ui.displayHour(), ppu: view.ppu, cars, sites: sitesNear, church, trees: 0.5, paused: sim.speed === 0 });
    }
    if (render) renderer.render(scene, cam.cam);
    autosave += dt;
    if (autosave > 60) { autosave = 0; save.store(); }
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(dt, now);
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) save.store(); });
  window.addEventListener('pagehide', () => save.store());

  document.getElementById('loading').classList.add('done');
  setTimeout(() => document.getElementById('loading').remove(), 800);
  if (!storage('lindenau-welcomed') && !manual) {
    sim.speed = 0;
    ui.welcome(() => { storage('lindenau-welcomed', '1'); ui.setSpeed(1); });
  }
  if (!manual) requestAnimationFrame(frame);

  window.__city = {
    ...app, env, scene, T, M, ui, save,
    steps: (n = 1, dt = 0.05, render = true) => { const t0 = performance.now(); for (let i = 0; i < n; i++) step(dt, performance.now(), render && i === n - 1); return performance.now() - t0; },
  };
  window.__ready = true;
}

const start = (data) => boot(data).catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.querySelector('.load-sub').textContent = 'Die Stadt konnte nicht geladen werden. Dein Browser braucht WebGL.';
});
const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start); else start(hot?.data ?? null);
