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
  { name: 'Kleinstadt', pop: 350, text: 'Stadthäuser, Polizei, Schule, Rettungswache, Kohle- und Wasserkraft, Wasserwerk und Kläranlage sind freigeschaltet.' },
  { name: 'Stadt', pop: 1800, text: 'Mehrfamilienhäuser, Kaufhäuser, Krankenhaus, Gaskraftwerk und Müllverbrennung sind freigeschaltet.' },
  { name: 'Großstadt', pop: 7000, text: 'Wohntürme, Bürohochhäuser und das Stadion sind freigeschaltet.' },
  { name: 'Metropole', pop: 22000, text: 'Der Fernsehturm ist freigeschaltet. Deine Stadt ist eine Metropole!' },
];

// growable buildings per zone and density level
export const GROW = {
  res: [null,
    { name: 'Einfamilienhaus', time: 24, pop: [3, 6], size: 1, stage: 0, lv: 0, need: [] },
    { name: 'Stadthaus', time: 34, pop: [14, 22], size: 1, stage: 1, lv: 28, need: [] },
    { name: 'Mehrfamilienhaus', time: 52, pop: [44, 70], size: 1, stage: 2, lv: 45, need: ['fire', 'police'] },
    { name: 'Wohnturm', time: 100, pop: [380, 620], size: 2, stage: 3, lv: 56, need: ['fire', 'police', 'health', 'edu'], parking: true },
  ],
  com: [null,
    { name: 'Laden', time: 24, jobs: [4, 8], size: 1, stage: 0, lv: 0, need: [] },
    { name: 'Geschäftshaus', time: 34, jobs: [18, 30], size: 1, stage: 1, lv: 30, need: [] },
    { name: 'Kaufhaus', time: 56, jobs: [70, 110], size: 1, stage: 2, lv: 46, need: ['fire', 'police'], parking: true },
    { name: 'Bürohochhaus', time: 115, jobs: [700, 1100], size: 2, stage: 3, lv: 60, need: ['fire', 'police', 'health'], parking: true },
  ],
  ind: [null,
    { name: 'Werkstatt', time: 24, jobs: [8, 14], size: 1, stage: 0, lv: 0, need: [] },
    { name: 'Fabrik', time: 36, jobs: [30, 48], size: 1, stage: 1, lv: 0, need: ['fire'] },
    { name: 'Logistikzentrum', time: 64, jobs: [130, 200], size: 2, stage: 2, lv: 0, need: ['fire'] },
  ],
};

// placeable buildings
// cat: toolbar menu · use: power draw in MW · wuse: water in m³/day
// power: gen MW (rated), ptype wind|solar|thermal|hydro|battery|waste, hv: feeds the high-voltage grid only
// water: out m³/day, src ground|river · treat: sewage m³/day · tower: storage m³
// waste: trucks, cap (landfill t), burn / recycle (t/day) · care: ambulances, beds
// emit: pollution at the site {air, ground, noise, r} · place: {water: adjacent water tiles needed}
export const SERVICES = {
  park: { name: 'Park', w: 1, h: 1, cost: 300, upkeep: 4, radius: 4, lv: 12, happy: 2, stage: 0, cat: 'nature', green: 3, desc: 'Bäume, Bänke und Blumenbeete. Filtert die Luft und macht die Nachbarn froh.' },
  playground: { name: 'Spielplatz', w: 1, h: 1, cost: 450, upkeep: 6, radius: 4, lv: 10, happy: 3, stage: 0, cat: 'nature', green: 2, desc: 'Schaukeln, Rutsche und Sandkasten für die Kinder.' },
  plaza: { name: 'Brunnenplatz', w: 1, h: 1, cost: 600, upkeep: 6, radius: 5, lv: 14, happy: 2, stage: 0, cat: 'nature', green: 1, wuse: 8, desc: 'Ein gepflasterter Platz mit Brunnen und Tauben.' },
  church: { name: 'Kirche', w: 1, h: 2, cost: 5000, upkeep: 30, radius: 8, lv: 10, happy: 3, stage: 0, cat: 'culture', unique: true, use: 0.03, desc: 'Ein Wahrzeichen mit Glockenturm.' },
  townhall: { name: 'Rathaus', w: 2, h: 1, cost: 8000, upkeep: 60, radius: 10, lv: 14, happy: 4, stage: 1, cat: 'culture', unique: true, use: 0.1, wuse: 10, desc: 'Sitz der Stadtverwaltung mit Uhrturm.' },
  school: { name: 'Schule', w: 2, h: 2, cost: 6000, upkeep: 140, radius: 18, cover: 'edu', happy: 3, stage: 1, cat: 'culture', use: 0.25, wuse: 40, desc: 'Bildung für die Kinder der Stadt. Firmen brauchen gut ausgebildete Leute.' },
  stadium: { name: 'Stadion', w: 3, h: 3, cost: 40000, upkeep: 450, radius: 0, lv: 0, happy: 10, stage: 3, cat: 'culture', unique: true, use: 1.5, wuse: 120, emit: { noise: 45, r: 4 }, desc: 'Fußball am Wochenende. Macht die ganze Stadt glücklicher.' },
  tvtower: { name: 'Fernsehturm', w: 2, h: 2, cost: 80000, upkeep: 300, radius: 30, lv: 18, happy: 8, stage: 4, cat: 'culture', unique: true, use: 0.6, desc: 'Das Wahrzeichen der Metropole.' },

  firestation: { name: 'Feuerwache', w: 2, h: 1, cost: 4000, upkeep: 110, radius: 14, cover: 'fire', stage: 0, cat: 'care', use: 0.08, wuse: 30, crit: true, desc: 'Löscht Brände im Umkreis. Ohne Wasser in den Leitungen brennt es öfter.' },
  police: { name: 'Polizeiwache', w: 1, h: 1, cost: 3500, upkeep: 90, radius: 13, cover: 'police', stage: 1, cat: 'care', use: 0.06, wuse: 6, crit: true, desc: 'Streifen und Einsätze gegen Einbrüche im Umkreis.' },
  clinic: { name: 'Arztpraxis', w: 1, h: 1, cost: 2500, upkeep: 45, radius: 8, cover: 'health', stage: 0, cat: 'care', use: 0.04, wuse: 6, crit: true, care: { treat: 1 }, desc: 'Hausärztin für die Nachbarschaft. Kranke werden schneller gesund.' },
  rescue: { name: 'Rettungswache', w: 2, h: 1, cost: 5500, upkeep: 120, radius: 18, stage: 1, cat: 'care', use: 0.06, wuse: 6, crit: true, care: { ambulances: 2 }, desc: 'Zwei Rettungswagen für Notfälle. Patienten kommen ins Krankenhaus.' },
  hospital: { name: 'Krankenhaus', w: 2, h: 2, cost: 12000, upkeep: 280, radius: 26, cover: 'health', happy: 4, stage: 2, cat: 'care', use: 1.0, wuse: 140, crit: true, care: { ambulances: 3, beds: 60, treat: 2 }, desc: '60 Betten, drei Rettungswagen und ein Hubschrauberlandeplatz.' },

  parking: { name: 'Parkplatz', w: 1, h: 1, cost: 900, upkeep: 6, stage: 0, cat: 'traffic', park: 16, radius: 5, desc: '16 Stellplätze für Kundschaft und Anwohner im Umkreis.' },
  garage: { name: 'Tiefgarage', w: 1, h: 1, cost: 7000, upkeep: 28, stage: 1, cat: 'traffic', park: 90, radius: 6, green: 1, use: 0.03, desc: '90 Stellplätze unter der Erde. Oben bleibt ein grüner Platz.' },
  parkhaus: { name: 'Parkhaus', w: 2, h: 2, cost: 15000, upkeep: 60, stage: 2, cat: 'traffic', park: 280, radius: 7, use: 0.06, desc: '280 Stellplätze auf vier Ebenen – für Innenstadt und Bürotürme.' },

  substation: { name: 'Umspannwerk', w: 1, h: 1, cost: 1800, upkeep: 18, stage: 0, cat: 'power', sub: 30, desc: 'Verbindet Hochspannungsleitungen und Großkraftwerke mit dem Stromnetz in den Straßen. Bis 30 MW.' },
  wind: { name: 'Windrad', w: 1, h: 1, cost: 3800, upkeep: 22, stage: 0, cat: 'power', power: { gen: 3, ptype: 'wind' }, noRoad: true, emit: { noise: 32, r: 2 }, desc: '3 MW bei kräftigem Wind, bei Flaute fast nichts. Laut für direkte Nachbarn.' },
  solar: { name: 'Solarpark', w: 2, h: 2, cost: 6500, upkeep: 16, stage: 0, cat: 'power', power: { gen: 6, ptype: 'solar' }, noRoad: true, desc: 'Bis 6 MW mittags, nachts nichts. Ganz ohne Abgase.' },
  battery: { name: 'Stromspeicher', w: 1, h: 1, cost: 7000, upkeep: 35, stage: 1, cat: 'power', power: { ptype: 'battery', store: 40, rate: 10 }, noRoad: true, desc: 'Speichert 40 MWh Überschuss, z. B. Solarstrom für die Nacht. Gibt bis 10 MW ab.' },
  hydro: { name: 'Wasserkraftwerk', w: 2, h: 1, cost: 18000, upkeep: 140, stage: 1, cat: 'power', power: { gen: 10, ptype: 'hydro', hv: true }, place: { water: 2 }, noRoad: true, desc: '10 MW rund um die Uhr aus dem Fluss. Muss am Ufer stehen.' },
  coal: { name: 'Kohlekraftwerk', w: 3, h: 3, cost: 26000, upkeep: 380, stage: 1, cat: 'power', power: { gen: 60, ptype: 'thermal', hv: true }, emit: { air: 70, ground: 1.2, noise: 35, r: 3 }, use: 0, wuse: 300, desc: '60 MW, billig im Betrieb – aber Ruß und Abgase machen die Nachbarn krank.' },
  gas: { name: 'Gaskraftwerk', w: 2, h: 2, cost: 34000, upkeep: 520, stage: 2, cat: 'power', power: { gen: 40, ptype: 'thermal', hv: true }, emit: { air: 20, noise: 28, r: 2 }, wuse: 120, desc: '40 MW, sauberer als Kohle, aber teures Gas.' },

  well: { name: 'Brunnen', w: 1, h: 1, cost: 1600, upkeep: 18, stage: 0, cat: 'water', water: { out: 160, src: 'ground' }, use: 0.12, crit: true, desc: 'Pumpt 160 m³ Grundwasser am Tag. Verschmutzter Boden macht das Wasser schlecht.' },
  watertower: { name: 'Wasserturm', w: 1, h: 1, cost: 4500, upkeep: 25, stage: 0, cat: 'water', tower: 600, crit: true, desc: 'Speichert 600 m³ für die Spitzenzeiten morgens und abends.' },
  waterworks: { name: 'Wasserwerk', w: 2, h: 2, cost: 14000, upkeep: 160, stage: 1, cat: 'water', water: { out: 2400, src: 'river' }, place: { water: 1 }, use: 1.2, crit: true, desc: 'Bereitet 2.400 m³ Flusswasser am Tag auf. Verschmutzter Fluss = schlechteres Wasser.' },
  sewage: { name: 'Kläranlage', w: 2, h: 2, cost: 16000, upkeep: 170, stage: 1, cat: 'water', treat: 2400, place: { water: 1 }, use: 1.0, crit: true, emit: { air: 6, r: 2 }, desc: 'Reinigt 2.400 m³ Abwasser am Tag. Ungeklärtes Abwasser verschmutzt den Fluss.' },

  landfill: { name: 'Mülldeponie', w: 3, h: 3, cost: 7500, upkeep: 70, stage: 0, cat: 'waste', waste: { trucks: 4, cap: 4000 }, emit: { ground: 6, air: 8, r: 3 }, use: 0.05, desc: 'Vier Müllwagen, Platz für 4.000 t. Stinkt und verschmutzt den Boden.' },
  recycling: { name: 'Wertstoffhof', w: 2, h: 1, cost: 9000, upkeep: 80, stage: 1, cat: 'waste', waste: { trucks: 3, recycle: 30, cap: 120 }, use: 0.15, desc: 'Drei Müllwagen. Verwertet 30 t am Tag und verkauft die Rohstoffe.' },
  incinerator: { name: 'Müllverbrennung', w: 2, h: 2, cost: 38000, upkeep: 420, stage: 2, cat: 'waste', waste: { trucks: 5, burn: 70, cap: 500 }, power: { gen: 8, ptype: 'waste', hv: true }, emit: { air: 16, noise: 15, r: 2 }, desc: 'Fünf Müllwagen. Verbrennt 70 t am Tag und erzeugt dabei 8 MW Strom.' },
};

export const CATS = {
  traffic: { name: 'Verkehr', icon: 'i-lights' },
  power: { name: 'Strom', icon: 'i-bolt' },
  water: { name: 'Wasser', icon: 'i-drop' },
  waste: { name: 'Müll', icon: 'i-bin' },
  care: { name: 'Dienste', icon: 'i-cross' },
  culture: { name: 'Kultur', icon: 'i-civic' },
  nature: { name: 'Natur', icon: 'i-tree' },
};

// consumption per resident (res) or job (com, ind): power MW, water m³/day, garbage t/day
export const NEEDS = {
  res: { power: 0.001, water: 0.15, garbage: 0.002 },
  com: { power: 0.002, water: 0.05, garbage: 0.0015 },
  ind: { power: 0.005, water: 0.2, garbage: 0.004 },
};
// the district (Landkreis) supplies a small village through the roads leaving the map
export const EXTERNAL = {
  power: { cap: 2, price: 95, hvCap: 40, hvPrice: 70, sell: 25 },
  water: { cap: 180, price: 1.2 },
  sewage: { cap: 180, price: 0.9 },
  garbage: { trucks: 2, price: 80 },
};
export const TRUCK_LOAD = 4;
export const TAX_DEFAULT = 9;
export const DIFFICULTY = {
  easy: { name: 'Entspannt', money: 60000, income: 1.2, upkeep: 0.8, risk: 0.6, desc: 'Mehr Startgeld, geringere Kosten, seltener Brände und Krankheiten.' },
  normal: { name: 'Normal', money: 30000, income: 1, upkeep: 1, risk: 1, desc: 'Die Stadt will gut geplant sein.' },
  hard: { name: 'Anspruchsvoll', money: 18000, income: 0.88, upkeep: 1.2, risk: 1.35, desc: 'Knappe Kasse, höhere Kosten, mehr Notfälle.' },
};

export const COSTS = { road: 25, avenue: 70, bridge: 180, bridge2: 320, tree: 15, bulldoze: 5, busstop: 250, zone: 0, line: 30, lights: 600, roundabout: 900 };
export const UPKEEP = { road: 0.6, avenue: 1.4, busstop: 15, line: 0.3, lights: 4, roundabout: 2 };

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
  { k: 'toys', sign: 'spielwaren', name: 'Spielwaren', out: null },
  { k: 'shoes', sign: 'schuhe', name: 'Schuhhaus', out: null },
  { k: 'optic', sign: 'optiker', name: 'Optiker', out: null },
  { k: 'electro', sign: 'elektro', name: 'Elektrofachmarkt', out: null },
  { k: 'drug', sign: 'drogerie', name: 'Drogerie', out: null },
];
