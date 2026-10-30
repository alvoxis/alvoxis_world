// Эпизодическая память о местах: существо запоминает, ГДЕ с ним случилось что-то
// заметно хорошее (еда) или плохое (боль, атака). Воспоминания постепенно гаснут,
// а полезные — укрепляются. Мозг получает их как обычные входы и сам решает,
// что с ними делать. Ячейки памяти стоят энергии, поэтому их число — компромисс эволюции.
AW.MEM_THRESHOLD = 0.3;

AW.memEncode = function (c, valence) {
  const n = c.M;
  if (n <= 0) return;
  const m = c.mem;
  // если рядом уже есть воспоминание — обновляем его
  let weakest = 0, weakS = Infinity;
  for (let k = 0; k < n; k++) {
    const o = k * 4;
    if (m[o + 3] > 0.05) {
      const dx = m[o] - c.x, dy = m[o + 1] - c.y;
      if (dx * dx + dy * dy < 4) {
        m[o + 2] = m[o + 2] * 0.7 + valence * 0.3;
        m[o + 3] = Math.min(1.5, m[o + 3] + 0.3);
        return;
      }
    }
    if (m[o + 3] < weakS) { weakS = m[o + 3]; weakest = k; }
  }
  const o = weakest * 4;
  m[o] = c.x; m[o + 1] = c.y; m[o + 2] = valence; m[o + 3] = 1;
};

AW.memRecall = function (c, res) {
  res.here = 0; res.bf = 0; res.bs = 0; res.wf = 0; res.ws = 0;
  const n = c.M;
  if (n <= 0) return;
  const m = c.mem, cs = Math.cos(c.dir), sn = Math.sin(c.dir);
  let best = 0.05, worst = -0.05, bi = -1, wi = -1;
  for (let k = 0; k < n; k++) {
    const o = k * 4;
    m[o + 3] *= 0.9993;
    const st = m[o + 3];
    if (st < 0.05) continue;
    const dx = m[o] - c.x, dy = m[o + 1] - c.y, d2 = dx * dx + dy * dy;
    const v = m[o + 2] * st;
    res.here += v / (1 + d2 * 0.25);
    const score = v / (1 + d2 * 0.004);
    if (score > best) { best = score; bi = k; }
    if (score < worst) { worst = score; wi = k; }
  }
  if (bi >= 0) {
    const o = bi * 4, dx = m[o] - c.x, dy = m[o + 1] - c.y, d = Math.sqrt(dx * dx + dy * dy) + 0.5;
    res.bf = (dx * cs + dy * sn) / d; res.bs = (-dx * sn + dy * cs) / d;
  }
  if (wi >= 0) {
    const o = wi * 4, dx = m[o] - c.x, dy = m[o + 1] - c.y, d = Math.sqrt(dx * dx + dy * dy) + 0.5;
    const near = Math.min(1, 6 / d);
    res.wf = (dx * cs + dy * sn) / d * near; res.ws = (-dx * sn + dy * cs) / d * near;
  }
  res.here = AW.clamp(res.here, -1, 1);
};
