// Мозг существа — маленькая рекуррентная нейросеть (идея взята из LIFE,
// dominikvytisk/life-simulation, реализация своя).
//
//   входы + контекст ─► скрытый слой (tanh) ─► действия + новый контекст
//   входы ───────────── рефлексы (прямые связи) ─────────► действия
//
// Веса делятся на две части:
//   brain   — врождённые (гены), мутируют при рождении и никогда не меняются при жизни
//   plastic — выученные за жизнь (Хеббовское обучение с подкреплением), НЕ наследуются
// Итоговый вес = ген + выученная добавка. Никакого «если хищник — беги» в коде нет:
// поведение получается из весов, отбора и обучения.

AW.IN = {
  Bias: 0, Energy: 1, Health: 2, Age: 3,
  FoodHere: 4, FoodFwd: 5, FoodSide: 6,
  MeatHere: 7, MeatFwd: 8, MeatSide: 9,
  Obstacle: 10, Water: 11,
  KinFwd: 12, KinSide: 13, KinNear: 14, KinMate: 15,
  OthFwd: 16, OthSide: 17, OthNear: 18, OthSize: 19, OthDiet: 20, OthAttack: 21,
  Crowd: 22, Pain: 23, Reward: 24,
  MemHere: 25, MemBestFwd: 26, MemBestSide: 27, MemWorstFwd: 28, MemWorstSide: 29,
  Flora: 30, Toxin: 31, Light: 32, Climate: 33, Noise: 34,
  HearLoud: 35, HearPitch: 36, HearSide: 37,
};
AW.N_IN = 38;
AW.IN_NAMES = ['Смещение', 'Энергия', 'Здоровье', 'Возраст', 'Еда тут', 'Еда впереди', 'Еда сбоку',
  'Мясо тут', 'Мясо впереди', 'Мясо сбоку', 'Преграда', 'Вода',
  'Сородич впереди', 'Сородич сбоку', 'Сородич близко', 'Сородич хочет пару',
  'Чужак впереди', 'Чужак сбоку', 'Чужак близко', 'Размер чужака', 'Хищность чужака', 'Чужак атакует', 'Толпа', 'Боль', 'Награда',
  'Память тут', 'Лучшее место ↑', 'Лучшее место ↔', 'Худшее место ↑', 'Худшее место ↔',
  'Цвет растений', 'Яд в теле', 'Свет', 'Холод/жар', 'Шум', 'Громкость звука', 'Высота звука', 'Звук сбоку'];

AW.OUT = { Thrust: 0, Turn: 1, Eat: 2, Attack: 3, Mate: 4, Rest: 5, Sprint: 6, Share: 7, Imitate: 8, Call: 9, Pitch: 10 };
AW.N_OUT = 11;
AW.OUT_NAMES = ['Вперёд', 'Поворот', 'Есть', 'Атака', 'Пара', 'Отдых', 'Рывок', 'Делиться', 'Подражать', 'Зов', 'Тон зова'];

AW.MAX_H = 12;
AW.MAX_C = 4;
(function () {
  const IW = AW.N_IN + AW.MAX_C, OH = AW.N_OUT + AW.MAX_C;
  AW.BR = {
    IW, OH,
    W1: 0, B1: IW * AW.MAX_H,
    W2: IW * AW.MAX_H + AW.MAX_H,
  };
  AW.BR.B2 = AW.BR.W2 + OH * AW.MAX_H;
  AW.BR.WS = AW.BR.B2 + OH;
  AW.BR.SIZE = AW.BR.WS + AW.N_OUT * AW.N_IN;
  // пластичная часть: выходные веса скрытого слоя + рефлексы
  AW.BR.P_W2 = 0;
  AW.BR.P_WS = AW.N_OUT * AW.MAX_H;
  AW.BR.P_SIZE = AW.BR.P_WS + AW.N_OUT * AW.N_IN;
})();

AW.fastTanh = function (x) {
  if (x < -3) return -1;
  if (x > 3) return 1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
};

// Случайный мозг + врождённые «инстинкты» (стартовая точка для эволюции).
AW.newBrain = function (r, diet, instinct) {
  const B = AW.BR, b = new Float32Array(B.SIZE);
  const s1 = 1.2 / Math.sqrt(B.IW);
  for (let i = 0; i < B.IW * AW.MAX_H; i++) b[B.W1 + i] = (r() * 2 - 1) * s1;
  for (let i = 0; i < AW.MAX_H; i++) b[B.B1 + i] = (r() * 2 - 1) * 0.3;
  for (let i = 0; i < B.OH * AW.MAX_H; i++) b[B.W2 + i] = (r() * 2 - 1) * 0.35;
  for (let i = 0; i < B.OH; i++) b[B.B2 + i] = (r() * 2 - 1) * 0.15;
  for (let i = 0; i < AW.N_OUT * AW.N_IN; i++) b[B.WS + i] = (r() * 2 - 1) * 0.25;
  if (instinct !== false) AW.addInstincts(b, diet, r);
  return b;
};

AW.addInstincts = function (b, diet, r) {
  const B = AW.BR, I = AW.IN, O = AW.OUT, h = 1 - diet;
  const ws = (o, i, v) => { b[B.WS + o * AW.N_IN + i] += v * (0.7 + r() * 0.6); };
  const bias = (o, v) => { b[B.B2 + o] += v; };
  bias(O.Thrust, 0.6);
  ws(O.Turn, I.FoodSide, 2.5 * h);
  ws(O.Thrust, I.FoodFwd, 0.8 * h);
  ws(O.Eat, I.FoodHere, 3.5 * h);
  ws(O.Turn, I.MeatSide, 2.5 * diet);
  ws(O.Eat, I.MeatHere, 4 * diet);
  ws(O.Thrust, I.Obstacle, -1.6);
  ws(O.Turn, I.Obstacle, 1.6);
  ws(O.Mate, I.Energy, 2.4);
  bias(O.Mate, -1.3);
  ws(O.Mate, I.KinMate, 0.8);
  ws(O.Turn, I.MemBestSide, 0.8);
  ws(O.Turn, I.MemWorstSide, -0.8);
  ws(O.Rest, I.Light, -0.9);
  bias(O.Rest, -0.7);
  bias(O.Attack, -1.2);
  bias(O.Share, -1);
  bias(O.Imitate, -0.6);
  bias(O.Call, -0.8);
  // травоядные пугаются хищных соседей, хищники идут к добыче
  ws(O.Sprint, I.OthDiet, 1.8 * h);
  ws(O.Turn, I.OthSide, 2.6 * diet - 1.4 * h);
  ws(O.Thrust, I.OthNear, 0.8 * diet);
  ws(O.Attack, I.OthNear, 3.5 * diet);
  ws(O.Attack, I.Energy, -1.0 * diet);
  ws(O.Sprint, I.OthNear, 1.2 * diet);
  ws(O.Turn, I.KinSide, 0.35);
  bias(O.Sprint, -0.8);
};

// Прямой проход. c — существо (in, ctx, hid, out, brain, plastic, H, C)
AW.think = function (c) {
  const B = AW.BR, b = c.brain, p = c.plastic, inp = c.inp, ctx = c.ctx, hid = c.hid, out = c.out;
  const H = c.H, C = c.C, NI = AW.N_IN, IW = B.IW;
  for (let h = 0; h < H; h++) {
    const row = B.W1 + h * IW;
    let s = b[B.B1 + h];
    for (let i = 0; i < NI; i++) s += b[row + i] * inp[i];
    for (let k = 0; k < C; k++) s += b[row + NI + k] * ctx[k];
    hid[h] = AW.fastTanh(s);
  }
  for (let h = H; h < AW.MAX_H; h++) hid[h] = 0;
  for (let o = 0; o < AW.N_OUT; o++) {
    const row = B.W2 + o * AW.MAX_H, prow = B.P_W2 + o * AW.MAX_H;
    const srow = B.WS + o * NI, psrow = B.P_WS + o * NI;
    let s = b[B.B2 + o];
    for (let h = 0; h < H; h++) s += (b[row + h] + p[prow + h]) * hid[h];
    for (let i = 0; i < NI; i++) s += (b[srow + i] + p[psrow + i]) * inp[i];
    out[o] = AW.fastTanh(s + (Math.random() - 0.5) * 0.12);
  }
  for (let k = 0; k < C; k++) {
    const o = AW.N_OUT + k, row = B.W2 + o * AW.MAX_H;
    let s = b[B.B2 + o];
    for (let h = 0; h < H; h++) s += b[row + h] * hid[h];
    ctx[k] = AW.fastTanh(s);
  }
};

// Хеббовское обучение, модулированное наградой: что совпало с хорошим — усиливается,
// с плохим — ослабляется. Существу не говорят, какое действие было правильным.
AW.learn = function (c, reward) {
  const lr = c.lr;
  if (lr <= 0 || (reward < 0.02 && reward > -0.02)) return;
  const B = AW.BR, p = c.plastic, hid = c.hid, out = c.out, inp = c.inp, H = c.H, NI = AW.N_IN;
  const k = lr * reward, decay = 1 - lr * 0.05;
  for (let o = 0; o < AW.N_OUT; o++) {
    const a = out[o] * k, prow = B.P_W2 + o * AW.MAX_H, srow = B.P_WS + o * NI;
    for (let h = 0; h < H; h++) {
      let v = p[prow + h] * decay + a * hid[h];
      p[prow + h] = v > 1.5 ? 1.5 : v < -1.5 ? -1.5 : v;
    }
    for (let i = 1; i < NI; i++) {
      let v = p[srow + i] * decay + a * inp[i];
      p[srow + i] = v > 1.5 ? 1.5 : v < -1.5 ? -1.5 : v;
    }
  }
  c.learned += Math.abs(k);
};

// Подражание: ученик сдвигает свои выученные веса к весам образца. Гены не трогаются.
AW.imitate = function (learner, model, rate) {
  const a = learner.plastic, b = model.plastic;
  for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * rate;
};

AW.crossBrain = function (a, b, r) {
  const B = AW.BR, c = new Float32Array(B.SIZE);
  // наследуются целые нейроны (строки), чтобы не ломать сложившиеся связи
  for (let h = 0; h < AW.MAX_H; h++) {
    const src = r() < 0.5 ? a : b, row = B.W1 + h * B.IW;
    for (let i = 0; i < B.IW; i++) c[row + i] = src[row + i];
    c[B.B1 + h] = src[B.B1 + h];
  }
  for (let o = 0; o < B.OH; o++) {
    const src = r() < 0.5 ? a : b, row = B.W2 + o * AW.MAX_H;
    for (let h = 0; h < AW.MAX_H; h++) c[row + h] = src[row + h];
    c[B.B2 + o] = src[B.B2 + o];
  }
  for (let o = 0; o < AW.N_OUT; o++) {
    const src = r() < 0.5 ? a : b, row = B.WS + o * AW.N_IN;
    for (let i = 0; i < AW.N_IN; i++) c[row + i] = src[row + i];
  }
  return c;
};

AW.mutateBrain = function (b, rate, r) {
  const n = b.length, count = Math.max(1, Math.round(n * rate * 0.15));
  for (let k = 0; k < count; k++) {
    const i = (r() * n) | 0;
    if (r() < 0.05) b[i] = (r() * 2 - 1) * 1.5;
    else b[i] += AW.gauss(r) * 0.35;
  }
};

AW.brainDistance = function (a, b) {
  const B = AW.BR;
  let s = 0;
  for (let i = B.WS; i < B.SIZE; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s / (B.SIZE - B.WS));
};
