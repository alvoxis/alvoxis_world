// Геном: набор числовых локусов. Всё, что отличает одно существо от другого
// (тело, органы чувств, размер мозга, способность учиться и даже частота мутаций),
// записано здесь и наследуется с мутациями.
AW.LOCI = [
  { key: 'size',     name: 'Размер',          min: 0.5,  max: 3 },
  { key: 'speed',    name: 'Скорость',        min: 0.3,  max: 2.2 },
  { key: 'sense',    name: 'Дальность зрения', min: 2,   max: 14 },
  { key: 'diet',     name: 'Хищность',        min: 0,    max: 1 },
  { key: 'hidden',   name: 'Нейронов',        min: 2,    max: 12, int: true },
  { key: 'context',  name: 'Рекуррентность',  min: 0,    max: 4, int: true },
  { key: 'learn',    name: 'Обучаемость',     min: 0,    max: 0.08 },
  { key: 'memory',   name: 'Ячейки памяти',   min: 0,    max: 8, int: true },
  { key: 'mutation', name: 'Мутабельность',   min: 0.01, max: 0.25 },
  { key: 'swim',     name: 'Плавание',        min: 0,    max: 1 },
  { key: 'cold',     name: 'Морозостойкость', min: 0,    max: 1 },
  { key: 'immunity', name: 'Иммунитет',       min: 0,    max: 1 },
  { key: 'lifespan', name: 'Долголетие',      min: 0.5,  max: 2 },
  { key: 'invest',   name: 'Забота о потомстве', min: 0.15, max: 0.6 },
  { key: 'hue',      name: 'Окрас',           min: 0,    max: 360, wrap: true },
  // Строение тела (идея ALIEN: тело собрано из органов, у каждого своя функция и цена)
  { key: 'legs',     name: 'Ноги (0/2/4/6)',  min: 0,    max: 3, int: true, body: true },
  { key: 'horns',    name: 'Рога',            min: 0,    max: 1, body: true },
  { key: 'armor',    name: 'Панцирь',         min: 0,    max: 1, body: true },
  { key: 'tail',     name: 'Хвост',           min: 0,    max: 1, body: true },
  { key: 'ears',     name: 'Уши',             min: 0,    max: 1, body: true },
  { key: 'pattern',  name: 'Узор',            min: 0,    max: 1, body: true },
  { key: 'hue2',     name: 'Цвет узора',      min: 0,    max: 360, wrap: true, body: true },
  // Групповая защита (идея EcoSim: cooperative defence)
  { key: 'coop',     name: 'Групповая защита', min: 0,   max: 1 },
];
AW.NL = AW.LOCI.length;
AW.G = {};
AW.LOCI.forEach((l, i) => { AW.G[l.key] = i; });

AW.genomeFrom = function (obj) {
  const g = new Float32Array(AW.NL);
  AW.LOCI.forEach((l, i) => {
    const v = obj[l.key] !== undefined ? obj[l.key] : (l.min + l.max) / 2;
    g[i] = AW.clamp(v, l.min, l.max);
  });
  return g;
};

// старые сохранения: дополнить геном недостающими генами
AW.upgradeGenome = function (g) {
  if (g.length >= AW.NL) return g;
  const n = new Float32Array(AW.NL);
  n.set(g);
  for (let i = g.length; i < AW.NL; i++) { const l = AW.LOCI[i]; n[i] = l.int ? Math.round((l.min + l.max) / 2) : (l.min + l.max) / 2; }
  return n;
};

AW.genomeGet = function (g, key) {
  const l = AW.LOCI[AW.G[key]], v = g[AW.G[key]];
  return l.int ? Math.round(v) : v;
};

AW.crossGenome = function (a, b, r) {
  const g = new Float32Array(AW.NL);
  for (let i = 0; i < AW.NL; i++) {
    const t = r();
    g[i] = t < 0.4 ? a[i] : t < 0.8 ? b[i] : (a[i] + b[i]) / 2;
  }
  return g;
};

AW.mutateGenome = function (g, r, boost) {
  const rate = g[AW.G.mutation] * (boost || 1);
  for (let i = 0; i < AW.NL; i++) {
    if (r() < rate) {
      const l = AW.LOCI[i];
      let v = g[i] + AW.gauss(r) * (l.max - l.min) * (l.wrap ? 0.03 : 0.07);
      if (l.wrap) v = ((v % 360) + 360) % 360; else v = AW.clamp(v, l.min, l.max);
      g[i] = v;
    }
  }
};

// Нормализованная генетическая дистанция (окрас не учитывается)
AW.genomeDistance = function (a, b) {
  let s = 0, n = 0;
  for (let i = 0; i < AW.NL; i++) {
    const l = AW.LOCI[i];
    if (l.wrap) continue;
    const d = (a[i] - b[i]) / (l.max - l.min);
    s += d * d; n++;
  }
  return Math.sqrt(s / n);
};

AW.dietLabel = function (d) {
  return d < 0.3 ? 'Травоядный' : d < 0.65 ? 'Всеядный' : 'Хищник';
};
