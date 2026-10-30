// Мир: сетка клеток с типом местности, растительностью, мясом (падаль), огнём и ядовитыми растениями.
AW.World = class {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.t = new Uint8Array(n);      // тип местности
    this.elev = new Float32Array(n); // высота (для тени)
    this.veg = new Float32Array(n);  // растительность
    this.meat = new Float32Array(n); // падаль
    this.tox = new Uint8Array(n);    // ядовитые растения (видимый оттенок)
    this.fire = new Uint8Array(n);   // таймер огня
    this.vary = new Uint8Array(n);   // вариация цвета
    this.fert = 1;                   // глобальное плодородие (дождь/засуха)
    this.fertTimer = 0;
    this.dirty = true;
  }

  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  at(x, y) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }

  generate(seed, shape) {
    const r = AW.makeRng(seed), elevN = AW.makeNoise(r), moistN = AW.makeNoise(r), toxN = AW.makeNoise(r), detN = AW.makeNoise(r);
    const w = this.w, h = this.h, T = AW.T;
    const sc = 3.2 / Math.max(w, h) * (shape === 'archipelago' ? 2.2 : 1);
    let sea = shape === 'archipelago' ? 0.45 : shape === 'island' ? 0.38 : shape === 'lakes' ? 0.28 : 0.4;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, nx = x / w - 0.5, ny = y / h - 0.5;
        let e = elevN(x * sc, y * sc, 6) * 0.85 + detN(x * sc * 4, y * sc * 4, 3) * 0.15;
        const d = Math.sqrt(nx * nx * 4 + ny * ny * 4);
        if (shape === 'island') e = e * 0.75 + 0.45 - d * 0.55;
        else if (shape === 'continent') e = e * 0.85 + 0.25 - Math.pow(d, 3) * 0.35;
        else if (shape === 'archipelago') e = e * 0.9 + 0.08 - Math.pow(d, 4) * 0.3;
        else if (shape === 'lakes') e = e * 0.8 + 0.2 - Math.pow(d, 6) * 0.4;
        e = AW.clamp(e, 0, 1);
        this.elev[i] = e;
        const m = moistN(x * sc * 1.3 + 50, y * sc * 1.3, 4);
        const lat = Math.abs(ny) * 2; // 0 — экватор, 1 — полюс
        let t;
        if (e < sea - 0.08) t = T.DEEP;
        else if (e < sea) t = T.WATER;
        else if (e < sea + 0.025) t = T.SAND;
        else {
          const hgt = (e - sea) / (1 - sea);
          if (hgt > 0.78 || (lat > 0.88 && hgt > 0.05) || (lat > 0.75 && hgt > 0.5)) t = T.SNOW;
          else if (hgt > 0.62) t = T.MOUNTAIN;
          else if (hgt > 0.48) t = T.HILLS;
          else if (m > 0.56) t = T.FOREST;
          else if (m < 0.36 && lat < 0.5) t = T.SAND;
          else if (m < 0.42) t = T.DIRT;
          else t = T.GRASS;
          if (t === T.MOUNTAIN && r() < 0.0015) this.volcano(x, y, r);
        }
        if (this.t[i] !== T.LAVA) this.t[i] = t;
        this.vary[i] = (r() * 255) | 0;
        if ((t === T.FOREST || t === T.GRASS) && toxN(x * sc * 3, y * sc * 3, 3) > 0.66) this.tox[i] = 1;
      }
    }
    for (let i = 0; i < w * h; i++) this.veg[i] = AW.TERRAIN[this.t[i]].cap * (0.5 + r() * 0.4);
    this.dirty = true;
  }

  volcano(cx, cy, r) {
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      if (x * x + y * y > 4 + r() * 2) continue;
      const i = this.at(cx + x, cy + y);
      if (i >= 0) this.t[i] = AW.T.LAVA;
    }
  }

  setTile(i, t) {
    this.t[i] = t;
    const cap = AW.TERRAIN[t].cap;
    if (this.veg[i] > cap) this.veg[i] = cap;
    if (t === AW.T.LAVA || t === AW.T.DEEP || t === AW.T.WATER) this.fire[i] = 0;
    this.dirty = true;
  }

  ignite(i) {
    const t = this.t[i];
    if ((t === AW.T.GRASS || t === AW.T.FOREST || t === AW.T.DIRT || t === AW.T.HILLS) && this.veg[i] > 0.1) this.fire[i] = 40 + ((Math.random() * 40) | 0);
  }

  // Обновление части мира (вызывается каждый тик, обрабатывает 1/4 клеток)
  update(tick, season) {
    const n = this.w * this.h, T = AW.T, TR = AW.TERRAIN, phase = tick & 3;
    const g = 2.6 * season * this.fert;
    for (let i = phase; i < n; i += 4) {
      const t = this.t[i], info = TR[t];
      // рост растений (логистический)
      const cap = info.cap, v = this.veg[i];
      if (v < cap) this.veg[i] = Math.min(cap, v + info.grow * g * (0.15 + v) * (1 - v / cap) * 3 + 0.00005 * g);
      else if (v > cap) this.veg[i] = cap;
      // падаль гниёт
      if (this.meat[i] > 0) { this.meat[i] *= 0.985; if (this.meat[i] < 0.01) this.meat[i] = 0; }
      // огонь
      if (this.fire[i] > 0) {
        this.fire[i] = Math.max(0, this.fire[i] - 4);
        this.veg[i] *= 0.8;
        if (Math.random() < 0.25) {
          const x = i % this.w, y = (i / this.w) | 0;
          const j = this.at(x + ((Math.random() * 3) | 0) - 1, y + ((Math.random() * 3) | 0) - 1);
          if (j >= 0 && this.fire[j] === 0 && Math.random() < 0.35 / this.fert) this.ignite(j);
        }
        if (this.fire[i] === 0) { this.t[i] = T.ASH; this.veg[i] = 0; this.dirty = true; }
      }
      // природная сукцессия
      if ((tick & 63) === phase) {
        const rr = Math.random();
        if (t === T.ASH && rr < 0.01) { this.t[i] = T.DIRT; this.dirty = true; }
        else if (t === T.DIRT && this.veg[i] > 0.4 && rr < 0.01) { this.t[i] = T.GRASS; this.dirty = true; }
        else if (t === T.GRASS && this.veg[i] > 0.95 && rr < 0.0015 && this.nearType(i, T.FOREST)) { this.t[i] = T.FOREST; this.dirty = true; }
        else if (t === T.LAVA && rr < 0.002) { this.t[i] = T.MOUNTAIN; this.dirty = true; }
        else if (t === T.LAVA && rr < 0.01) { const x = i % this.w, y = (i / this.w) | 0; const j = this.at(x + 1 - ((Math.random() * 3) | 0), y + 1 - ((Math.random() * 3) | 0)); if (j >= 0) this.ignite(j); }
        else if (t === T.GRASS && this.veg[i] < 0.03 && rr < 0.004) { this.t[i] = T.DIRT; this.dirty = true; }
      }
    }
    if (this.fertTimer > 0 && --this.fertTimer === 0) this.fert = 1;
  }

  nearType(i, type) {
    const w = this.w;
    return this.t[i - 1] === type || this.t[i + 1] === type || this.t[i - w] === type || this.t[i + w] === type;
  }

  sampleVeg(x, y) { const i = this.at(x, y); return i < 0 ? 0 : this.veg[i]; }
  sampleMeat(x, y) { const i = this.at(x, y); return i < 0 ? 0 : this.meat[i]; }
};
