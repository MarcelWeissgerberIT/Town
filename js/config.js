export const MAP_N = 72;
export const CHUNK = 12;

export const ZONE = { NONE: 0, RES: 1, COM: 2, IND: 3 };
export const ZONE_KEYS = [null, 'res', 'com', 'ind'];
export const ZONE_INFO = {
  1: { key: 'res', name: 'Wohngebiet', short: 'Wohnen', color: '#68c46f' },
  2: { key: 'com', name: 'Gewerbegebiet', short: 'Gewerbe', color: '#4ea7ec' },
  3: { key: 'ind', name: 'Industriegebiet', short: 'Industrie', color: '#f2a640' },
};

export const STAGES = [
  { name: 'Dorf', pop: 0, text: 'Ein kleines Dorf am Fluss.' },
  { name: 'Kleinstadt', pop: 350, text: 'Stadthäuser, Feuerwache, Polizei, Schule und Rathaus sind freigeschaltet.' },
  { name: 'Stadt', pop: 1800, text: 'Mehrfamilienhäuser, Kaufhäuser, Krankenhaus und Logistikzentren sind freigeschaltet.' },
  { name: 'Großstadt', pop: 7000, text: 'Wohntürme, Bürohochhäuser und das Stadion sind freigeschaltet.' },
  { name: 'Metropole', pop: 22000, text: 'Der Fernsehturm ist freigeschaltet. Deine Stadt ist eine Metropole!' },
];

// growable buildings per zone and density level
export const GROW = {
  res: [null,
    { name: 'Einfamilienhaus', time: 24, pop: [3, 6], size: 1, stage: 0, lv: 0, need: [] },
    { name: 'Stadthaus', time: 34, pop: [14, 22], size: 1, stage: 1, lv: 28, need: [] },
    { name: 'Mehrfamilienhaus', time: 52, pop: [44, 70], size: 1, stage: 2, lv: 45, need: ['fire', 'police'] },
    { name: 'Wohnturm', time: 100, pop: [380, 620], size: 2, stage: 3, lv: 56, need: ['fire', 'police', 'health', 'edu'] },
  ],
  com: [null,
    { name: 'Laden', time: 24, jobs: [4, 8], size: 1, stage: 0, lv: 0, need: [] },
    { name: 'Geschäftshaus', time: 34, jobs: [18, 30], size: 1, stage: 1, lv: 30, need: [] },
    { name: 'Kaufhaus', time: 56, jobs: [70, 110], size: 1, stage: 2, lv: 46, need: ['fire', 'police'] },
    { name: 'Bürohochhaus', time: 115, jobs: [700, 1100], size: 2, stage: 3, lv: 60, need: ['fire', 'police', 'health'] },
  ],
  ind: [null,
    { name: 'Werkstatt', time: 24, jobs: [8, 14], size: 1, stage: 0, lv: 0, need: [] },
    { name: 'Fabrik', time: 36, jobs: [30, 48], size: 1, stage: 1, lv: 0, need: ['fire'] },
    { name: 'Logistikzentrum', time: 64, jobs: [130, 200], size: 2, stage: 2, lv: 0, need: ['fire'] },
  ],
};

// placeable buildings
export const SERVICES = {
  park: { name: 'Park', w: 1, h: 1, cost: 300, upkeep: 4, radius: 4, lv: 12, happy: 2, stage: 0, cat: 'nature', desc: 'Bäume, Bänke und Blumenbeete. Erhöht den Bodenwert.' },
  playground: { name: 'Spielplatz', w: 1, h: 1, cost: 450, upkeep: 6, radius: 4, lv: 10, happy: 3, stage: 0, cat: 'nature', desc: 'Schaukeln, Rutsche und Sandkasten für die Kinder.' },
  plaza: { name: 'Brunnenplatz', w: 1, h: 1, cost: 600, upkeep: 6, radius: 5, lv: 14, happy: 2, stage: 0, cat: 'nature', desc: 'Ein gepflasterter Platz mit Brunnen und Tauben.' },
  church: { name: 'Kirche', w: 1, h: 2, cost: 5000, upkeep: 30, radius: 8, lv: 10, happy: 3, stage: 0, cat: 'service', unique: true, desc: 'Ein Wahrzeichen mit Glockenturm.' },
  firestation: { name: 'Feuerwache', w: 2, h: 1, cost: 4000, upkeep: 110, radius: 14, cover: 'fire', stage: 1, cat: 'service', desc: 'Schützt Gebäude im Umkreis vor Bränden.' },
  police: { name: 'Polizeiwache', w: 1, h: 1, cost: 3500, upkeep: 90, radius: 13, cover: 'police', stage: 1, cat: 'service', desc: 'Sorgt für Sicherheit im Umkreis.' },
  school: { name: 'Schule', w: 2, h: 2, cost: 6000, upkeep: 140, radius: 18, cover: 'edu', happy: 3, stage: 1, cat: 'service', desc: 'Bildung für die Kinder der Stadt.' },
  townhall: { name: 'Rathaus', w: 2, h: 1, cost: 8000, upkeep: 60, radius: 10, lv: 14, happy: 4, stage: 1, cat: 'service', unique: true, desc: 'Sitz der Stadtverwaltung mit Uhrturm.' },
  hospital: { name: 'Krankenhaus', w: 2, h: 2, cost: 12000, upkeep: 280, radius: 26, cover: 'health', happy: 4, stage: 2, cat: 'service', desc: 'Medizinische Versorgung mit Hubschrauberlandeplatz.' },
  stadium: { name: 'Stadion', w: 3, h: 3, cost: 40000, upkeep: 450, radius: 0, lv: 0, happy: 10, stage: 3, cat: 'landmark', unique: true, desc: 'Fußball am Wochenende. Macht die ganze Stadt glücklicher.' },
  tvtower: { name: 'Fernsehturm', w: 2, h: 2, cost: 80000, upkeep: 300, radius: 30, lv: 18, happy: 8, stage: 4, cat: 'landmark', unique: true, desc: 'Das Wahrzeichen der Metropole.' },
};

export const COSTS = { road: 25, bridge: 180, tree: 15, bulldoze: 5, busstop: 250, zone: 0 };
export const UPKEEP = { road: 0.6, busstop: 15 };

export const DAY_SECONDS = 150; // real seconds per in-game day at 1x speed

export const ROOF_COLS = ['#c55a33', '#b6482f', '#d06c3c', '#a8412c', '#8d4b33', '#5c6067', '#484c53'];
export const AWNING_COLS = [['#c0392b', '#f4efe6'], ['#2e7d4f', '#f4efe6'], ['#2f5f9e', '#f4efe6'], ['#e2a72e', '#f4efe6'], ['#7a2b45', '#f6e7ec']];
export const CAR_COLS = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#16a085', '#f1c40f', '#8e44ad', '#d35400', '#1b1b1b', '#bdc3c7', '#5d4037', '#3d6b4f', '#9c2a2a'];

// shops for small commercial buildings: [shop cell, sign, outdoor props]
export const SHOP_TYPES = [
  { k: 'bakery', sign: 'baeckerei', name: 'Bäckerei', out: 'bakery' },
  { k: 'cafe', sign: 'cafe', name: 'Café', out: 'cafe' },
  { k: 'grocer', sign: 'markt', name: 'Obst & Gemüse', out: 'grocer' },
  { k: 'flowers', sign: 'blumen', name: 'Blumenladen', out: 'flowers' },
  { k: 'butcher', sign: 'metzgerei', name: 'Metzgerei', out: null },
  { k: 'pharmacy', sign: 'apotheke', name: 'Apotheke', out: null },
  { k: 'books', sign: 'buecher', name: 'Buchhandlung', out: null },
  { k: 'fashion', sign: 'mode', name: 'Modegeschäft', out: null },
  { k: 'icecream', sign: 'eis', name: 'Eiscafé', out: 'cafe' },
  { k: 'general', sign: 'kiosk', name: 'Kiosk', out: null },
  { k: 'general', sign: 'friseur', name: 'Friseur', out: null },
  { k: 'cafe', sign: 'gasthaus', name: 'Gasthaus', out: 'cafe' },
];
