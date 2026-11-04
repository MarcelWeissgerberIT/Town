import * as THREE from 'three';
import { loadTextures } from './textures.js';
import { setGroundPhoto } from './ground.js';
import { makeMaterials, makeEnvironment, U } from './materials.js';
import { initBuildgen, setPhotoMode } from './buildgen.js';
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
import { PowerLines } from './powerlines.js';
import { Markers } from './markers.js';
import { Heatmap } from './heatmap.js';
import { loadModels, ModelLayer } from './models3d.js';
import { U as UNI } from './materials.js';
import { UI } from './ui.js';
import { SaveSystem, unb64 } from './save.js';
import { Region } from './region.js';
import { Soundscape } from './audio.js';
import { MAP_N, GROW, SERVICES, STAGES } from './config.js';
import { terrainOf } from './terrain.js';
import { fmtNum, pick } from './util.js';

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 720;
const tablet = coarse && Math.min(screen.width, screen.height) >= 700;
const QUALITY = {
  tablet: { atlas: 256, ground: 512, shadowMap: 2048, pixelRatio: Math.min(devicePixelRatio, 1.5), shadows: true, people: 320, cars: 120 },
  high: { atlas: 256, ground: 512, shadowMap: 4096, pixelRatio: Math.min(devicePixelRatio, 2), shadows: true, people: 520, cars: 170 },
  mid: { atlas: 128, ground: 512, shadowMap: 2048, pixelRatio: Math.min(devicePixelRatio, 1.6), shadows: true, people: 260, cars: 100 },
  low: { atlas: 128, ground: 256, shadowMap: 1024, pixelRatio: 1, shadows: false, people: 120, cars: 50 },
};
const Q = QUALITY[params.get('q')] || (tablet ? QUALITY.tablet : coarse ? QUALITY.mid : QUALITY.high);
if (params.has('procedural')) Q.procedural = true;
const manual = params.has('manual');

function storage(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  return null;
}

// keep Safari from zooming the page with pinch or double tap; the map handles its own gestures
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

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
  // textures and the Meshy models load side by side; the game also runs without models
  const [T] = await Promise.all([loadTextures(Q), Q.procedural ? null : Promise.race([loadModels(), new Promise((r) => setTimeout(r, 12000))])]);
  initBuildgen(T.atlas);
  setPhotoMode(T.photo); setGroundPhoto(T.photo);
  const M = makeMaterials(T);
  const env = new Environment(scene, renderer, Q);
  const cam = new IsoCamera(MAP_N);
  const game = new Game(scene, M);
  game.startNew();
  const sim = new Sim(game);
  sim.cityName = 'Lindenau';
  const sites = new Sites(scene, game, M);
  const traffic = new Traffic(scene, game, M, T, Q);
  game.traffic = traffic;
  const people = new People(scene, game, M, Q);
  const fx = new FX(scene, T);
  const furniture = new Furniture(scene, game, M, T);
  const overlay = new Overlay(scene);
  const powerLines = new PowerLines(scene, game, M);
  const markers = new Markers(scene, game, sim, M);
  const heatmap = new Heatmap(scene, game.world);
  const models = new ModelLayer(scene, game);
  // river pollution as a texture for the water shader
  const polData = new Uint8Array(MAP_N * MAP_N * 4);
  const polTex = new THREE.DataTexture(polData, MAP_N, MAP_N, THREE.RGBAFormat);
  polTex.magFilter = THREE.LinearFilter; polTex.minFilter = THREE.LinearFilter; polTex.needsUpdate = true;
  UNI.uPolTex.value = polTex; UNI.uPolN.value = MAP_N;
  let polVersion = -1;
  const updatePolTex = () => {
    if (sim.pollution.version === polVersion) return;
    polVersion = sim.pollution.version;
    const wa = sim.pollution.water;
    for (let k = 0; k < wa.length; k++) polData[k * 4] = Math.min(255, wa[k] * 4.2);
    polTex.needsUpdate = true;
  };
  game.chunks.rebuildAll();

  const app = { game, sim, cam, traffic, people, sites, fx, overlay, renderer, canvas, heatmap, markers, powerLines };
  const save = new SaveSystem(app);
  const sound = new Soundscape();
  const ui = new UI({ ...app, save, audio: sound });
  app.ui = ui;
  app.save = save;
  const region = new Region(app);
  app.region = region; ui.region = region;
  save.use(region.current);
  sim.contracts = () => region.imports();
  sim.contractExports = () => region.exports();
  sim.contractMoney = () => region.money();
  let buildVersion = 0;

  // ---- reset or restore the whole city in place
  app.applyState = (st, opts = {}) => {
    const w = game.world;
    for (const b of [...w.buildings.values()]) { w.removeBuilding(b); game.chunks.setBuildingGeo(b, null); }
    w.buildings.clear();
    w.bld.fill(-1);
    sim.resetSystems();
    let migrated = false;
    if (st) {
      w.seed = st.world.seed ?? w.seed;
      w.ttype = st.world.type || 'river';
      w.flowOut = st.world.flowOut || terrainOf(w.ttype).flowOut;
      w.terrainVersion++;
      w.terrain.set(unb64(st.world.terrain)); w.road.set(unb64(st.world.road)); w.zone.set(unb64(st.world.zone));
      w.trees.set(unb64(st.world.trees)); w.busstop.set(unb64(st.world.busstop));
      if (st.world.pline) w.pline.set(unb64(st.world.pline)); else w.pline.fill(0);
      // towns from before junction control keep traffic lights at every junction
      if (st.world.junc) w.junc.set(unb64(st.world.junc));
      else { w.junc.fill(0); for (let z = 0; z < w.N; z++) for (let x = 0; x < w.N; x++) if (w.isJunction(x, z)) w.junc[w.idx(x, z)] = 1; }
      w.lineVersion++;
      w.nextId = st.world.nextId; w.centre = st.world.centre;
      for (const o of st.buildings) {
        const b = { ...o };
        if (b.state === 'done') { b.popMax ??= b.pop; b.jobsMax ??= b.jobs; }
        w.buildings.set(b.id, b);
        for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) w.bld[w.idx(b.x + i, b.z + j)] = b.id;
        game.realize(b);
      }
      w.bver++;
      const S = st.sim;
      Object.assign(sim, { money: S.money, day: S.day, hour: S.hour, stage: S.stage, cityName: S.cityName || 'Lindenau', history: S.history || [] });
      sim.tax = { res: 9, com: 9, ind: 9, ...(S.tax || {}) };
      sim.loans = S.loans || [];
      sim.setDifficulty(S.diff || 'normal');
      sim.grace = S.grace || null;
      if (st.pollution) sim.pollution.unpack({ air: unb64(st.pollution.air), ground: unb64(st.pollution.ground), water: unb64(st.pollution.water) });
      migrated = st.v === 1;
    } else {
      w.seed = opts.seed ?? 20261013;
      w.ttype = opts.type || 'river';
      w.flowOut = terrainOf(w.ttype).flowOut;
      w.terrain.fill(0); w.road.fill(0); w.zone.fill(0); w.trees.fill(0); w.busstop.fill(0); w.pline.fill(0); w.junc.fill(0); w.nextId = 1;
      w.lineVersion++;
      w.genTerrain();
      game.startNew();
      sim.setDifficulty(opts.diff || 'normal');
      Object.assign(sim, { money: sim.diff.money, day: 1, hour: 9, stage: 0, cityName: opts.name || 'Lindenau', history: [], tax: { res: 9, com: 9, ind: 9 }, loans: [], grace: null });
    }
    sim.cityId = opts.id || st?.sim?.cityId || 'a';
    document.getElementById('cityName').value = sim.cityName;
    w.version++;
    for (let z = 0; z < w.N; z++) for (let x = 0; x < w.N; x++) w.markDirty(x, z);
    game.chunks.rebuildAll();
    game.countryDirty = true; game.treesDirty = true;
    sites.clear(); traffic.clear(); people.clear();
    sim.recount(); sim.util.solve(0.001); sim.computeLandValue(); sim.computeDemand();
    if (migrated) sim.migrate();
    sim.updateMood(0);
    buildVersion++;
    cam.lookAt(w.centre[0] + 0.5, w.centre[1] + 0.5, 4.6); cam.snapPan();
    ui.closeInfo();
    game.emit('city', { migrated });
  };

  ui.toggleShadows = () => {
    renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
    env.sun.castShadow = renderer.shadowMap.enabled;
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  };

  // restore a previous session (live-reload snapshot first, then the browser save)
  const saved = hotData && hotData.v >= 1 ? hotData : save.read();
  window.claude?.hot?.snapshot?.(() => save.serialize());
  game.on('city', (e) => { if (e.migrated) setTimeout(() => ui.whatsNew(), 1200); });
  if (saved && !params.has('fresh')) app.applyState(saved, { id: region.current });
  else { sim.util.solve(0.001); sim.updateMood(0); cam.lookAt(game.world.centre[0] + 0.5, game.world.centre[1] + 0.5, 4.6); cam.snapPan(); cam.view = cam.goalView; }

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
  // the landfill mound grows with its contents
  game.on('landfill', (b) => {
    const lv = Math.min(10, Math.floor(Math.min(1, (b.fill || 0) / SERVICES.landfill.waste.cap) * 10 + 0.0001)) / 10;
    if (lv !== b.fillLevel && b.state === 'done') game.realize(b);
  });
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
  // messages from the simulation (emergencies, people moving out, ...): no flood of toasts
  const noticeAt = new Map();
  game.on('notice', (n) => {
    const key = n.text.replace(/[„“].*?[„“]|\S+ \S+$/g, '').slice(0, 18) + (n.color || '');
    const now = performance.now();
    const far = n.b && !near(n.b, 1.6);
    if (now - (noticeAt.get(key) || 0) < (far ? 25000 : 6000)) return;
    noticeAt.set(key, now);
    ui.toast(n.text, n.icon || 'i-star', n.color || null, n.b ? jump(n.b) : null);
  });

  // emitters for smoke, fountains, dust and fire
  function updateEmitters(dt, t) {
    for (const b of game.world.buildings.values()) {
      if (!near(b, 1.1)) continue;
      if (b.state === 'done') {
        if (b.smoke) for (const s of b.smoke) { const n = fx.rate(`s${b.id}`, 2.2, dt); for (let i = 0; i < n; i++) fx.smoke(s[0], s[1], s[2], b.type === 'coal'); }
        if (b.steam && (b.out || 0) > 0) for (const s of b.steam) { const n = fx.rate(`st${b.id}`, 3.2, dt); for (let i = 0; i < n; i++) fx.steam(s[0], s[1], s[2], s[3]); }
        if (b.splash && view.ppu > 14) { const n = fx.rate(`sp${b.id}`, 22, dt); for (let i = 0; i < n; i++) fx.water(b.splash[0] + (Math.random() - 0.5) * 0.5, -0.06, b.splash[1] + (Math.random() - 0.5) * 0.5); }
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

  let last = performance.now(), elapsed = 0, autosave = 0, thumbs = 0;
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
    sites.update(simDt);
    traffic.update(simDt, sim, view);
    people.update(simDt, sim, view, sites);
    updateEmitters(simDt, elapsed);
    fx.update(simDt, view.ppu * renderer.getPixelRatio());
    furniture.update(buildVersion);
    powerLines.update();
    models.update(view);
    markers.update(dt, view, renderer.getPixelRatio());
    heatmap.update(dt, sim);
    updatePolTex();
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
    if (autosave > 60) { autosave = 0; save.store(); region.snapshot(++thumbs % 5 === 0); }
  }
  // a device that cannot keep up gets a slightly lower resolution instead of a choppy picture
  let slow = 0, frameAvg = 1 / 60;
  function adapt(rawDt) {
    if (rawDt > 0.25) return; // tab was in the background
    frameAvg += (rawDt - frameAvg) * 0.05;
    slow = frameAvg > 1 / 36 ? slow + rawDt : 0;
    const pr = renderer.getPixelRatio();
    if (slow > 3 && pr > 1) {
      slow = 0; frameAvg = 1 / 60;
      renderer.setPixelRatio(Math.max(1, pr - 0.25));
      resize();
    }
  }
  function frame(now) {
    const raw = (now - last) / 1000;
    const dt = Math.min(0.1, raw);
    last = now;
    step(dt, now);
    adapt(raw);
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
