// Ядро: пространство имён, генератор случайных чисел, шум, константы мира.
var AW = (typeof window !== 'undefined' ? window : globalThis).AW || {};
(typeof window !== 'undefined' ? window : globalThis).AW = AW;

// mulberry32 — быстрый детерминированный ГСЧ
AW.makeRng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

AW.hashString = function (s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

AW.rand = Math.random;
AW.gauss = function (r) {
  r = r || AW.rand;
  let u = 0, v = 0;
  while (u === 0) u = r();
  v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
AW.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Value noise + fbm
AW.makeNoise = function (rng) {
  const N = 256, perm = new Uint8Array(512), val = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = rng(); }
  for (let i = N - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const lat = (x, y) => val[perm[(x & 255) + perm[y & 255]]];
  const sm = t => t * t * (3 - 2 * t);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = lat(xi, yi), b = lat(xi + 1, yi), c = lat(xi, yi + 1), d = lat(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  return function fbm(x, y, oct) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < (oct || 5); o++) { s += amp * noise(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  };
};

// ---- Типы местности ----
AW.T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, DIRT: 5, HILLS: 6, MOUNTAIN: 7, SNOW: 8, LAVA: 9, ASH: 10 };
// move: множитель скорости (0 — непроходимо по суше), cap: максимум растительности, grow: скорость роста
AW.TERRAIN = [
  { key: 'deep',     name: 'Глубина',  color: [22, 52, 120],  move: 0,    cap: 0.25, grow: 0.0015, water: 2 },
  { key: 'water',    name: 'Вода',     color: [44, 102, 178], move: 0.45, cap: 0.4,  grow: 0.002,  water: 1 },
  { key: 'sand',     name: 'Песок',    color: [222, 200, 128], move: 0.9, cap: 0.15, grow: 0.001 },
  { key: 'grass',    name: 'Трава',    color: [78, 160, 60],  move: 1,    cap: 1.0,  grow: 0.0035 },
  { key: 'forest',   name: 'Лес',      color: [34, 106, 44],  move: 0.75, cap: 1.6,  grow: 0.003 },
  { key: 'dirt',     name: 'Земля',    color: [132, 98, 62],  move: 1,    cap: 0.45, grow: 0.002 },
  { key: 'hills',    name: 'Холмы',    color: [118, 128, 70], move: 0.7,  cap: 0.5,  grow: 0.002 },
  { key: 'mountain', name: 'Горы',     color: [116, 110, 106], move: 0.35, cap: 0.08, grow: 0.0008 },
  { key: 'snow',     name: 'Снег',     color: [232, 238, 246], move: 0.6, cap: 0.05, grow: 0.0005, cold: 1 },
  { key: 'lava',     name: 'Лава',     color: [240, 82, 20],  move: 0.3,  cap: 0,    grow: 0,      hot: 1 },
  { key: 'ash',      name: 'Пепел',    color: [70, 66, 64],   move: 1,    cap: 0.05, grow: 0.0006 },
];

AW.WORLD_SIZES = {
  small:  { w: 128, h: 80,  pop: 0.6 },
  medium: { w: 192, h: 120, pop: 1 },
  large:  { w: 256, h: 160, pop: 1.5 },
  huge:   { w: 320, h: 200, pop: 2 },
};

AW.MAX_POP = 1500;
AW.DAY_LEN = 900;     // тиков в сутках
AW.YEAR_LEN = 7200;   // тиков в году (8 суток)

// ---- Генератор имён ----
AW.SYL = ['кра', 'мо', 'лин', 'зу', 'ба', 'ри', 'то', 'ве', 'ша', 'гло', 'пу', 'фи', 'дра', 'ну', 'ок', 'ар', 'ус', 'ти', 'ло', 'ми', 'гра', 'зе', 'бу', 'ка', 'ро', 'шу', 'вэ', 'ям', 'хо', 'лю'];
AW.ENDS = ['ны', 'ки', 'ры', 'цы', 'ты', 'ли', 'ки', 'ды'];
AW.makeName = function (r, species) {
  r = r || AW.rand;
  const n = species ? 2 : 2 + (r() < 0.4 ? 1 : 0);
  let s = '';
  for (let i = 0; i < n; i++) s += AW.SYL[(r() * AW.SYL.length) | 0];
  if (species) s += AW.ENDS[(r() * AW.ENDS.length) | 0];
  return s.charAt(0).toUpperCase() + s.slice(1);
};
