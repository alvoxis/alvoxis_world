// Процедурные пиксельные спрайты. Внешность существа целиком строится из его генов:
// размер, число ног, рога, панцирь, хвост, уши, плавники, узор, окрас, глаза (зрение),
// пасть (хищность). Мутации генов меняют внешность, поэтому новые виды выглядят иначе.
// Анимации: стоит, идёт, бежит, ест, спит, атакует.
AW.hsl = function (h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  const f = n => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
};

AW.POSE = { IDLE: 0, WALK: 1, RUN: 2, EAT: 3, SLEEP: 4, ATTACK: 5 };
AW.POSE_FRAMES = [1, 4, 4, 2, 1, 2];
AW.POSE_NAMES = ['Стоит', 'Идёт', 'Бежит', 'Ест', 'Спит', 'Атакует'];

// Пиксельный буфер с автоматической тёмной обводкой
AW.PixBuf = class {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = 255;
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(x, y);
    }
    for (let k = 0; k < add.length; k += 2) this.set(add[k], add[k + 1], c);
  }
  canvas(flip) {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(this.w, this.h);
    if (!flip) img.data.set(this.d);
    else for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const s = (y * this.w + x) * 4, t = (y * this.w + (this.w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) img.data[t + k] = this.d[s + k];
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
};

// Внешность из генома (то, что видно глазами)
AW.appearance = function (g) {
  const get = k => AW.genomeGet(g, k);
  return {
    size: get('size'), legs: get('legs'), horns: get('horns'), armor: get('armor'), tail: get('tail'),
    ears: get('ears'), pattern: get('pattern'), hue: g[AW.G.hue], hue2: get('hue2'), swim: get('swim'),
    diet: get('diet'), sense: get('sense'),
  };
};

AW.appearanceKey = function (a) {
  const q = (v, n) => Math.round(v * n);
  return [q(a.size, 4), a.legs, q(a.horns, 4), q(a.armor, 3), q(a.tail, 4), q(a.ears, 3), q(a.pattern, 3),
    Math.round(a.hue / 8), Math.round(a.hue2 / 15), a.swim > 0.55 ? 1 : 0, a.diet > 0.6 ? 2 : a.diet > 0.3 ? 1 : 0, a.sense > 9 ? 1 : 0].join(',');
};

AW.SPR_W = 32;
AW.SPR_H = 24;

AW.drawCreatureSprite = function (a, pose, frame) {
  const W = AW.SPR_W, H = AW.SPR_H, B = new AW.PixBuf(W, H), P = AW.POSE;
  const ground = H - 2;
  const sleep = pose === P.SLEEP, eat = pose === P.EAT, atk = pose === P.ATTACK;
  const moving = pose === P.WALK || pose === P.RUN;
  const biped = a.legs === 1, legN = [0, 2, 4, 6][a.legs];
  let L = Math.round(7 + a.size * 3.5), BH = Math.round(3 + a.size * 1.4 + a.armor * 1.5);
  if (biped) { L = Math.round(L * 0.75); BH = Math.round(BH * 1.25); }
  const legH = legN && !sleep ? Math.max(2, Math.round(1.5 + a.size * (biped ? 1.3 : 1))) : 0;
  const bob = moving && frame % 2 ? -1 : 0;
  const lunge = atk && frame === 1 ? 2 : 0;
  const bottom = ground - legH + bob, top = bottom - BH + 1;
  const bx0 = Math.round((W - L) / 2) - 2 + lunge, bx1 = bx0 + L - 1;

  const body = AW.hsl(a.hue, 55, 50), light = AW.hsl(a.hue, 55, 63), dark = AW.hsl(a.hue, 55, 34);
  const belly = AW.hsl(a.hue, 30, 70), pat = AW.hsl(a.hue2, 60, 32), horn = [236, 226, 196];
  const shell = AW.hsl(a.hue, 25, 38), shellD = AW.hsl(a.hue, 25, 26);
  const out = AW.hsl(a.hue, 45, 11);

  // хвост (рисуем первым, тело перекроет основание)
  if (a.tail > 0.1) {
    const n = Math.round(a.tail * 6) + 1, sway = moving ? (frame % 2 ? 1 : -1) : 0;
    let tx = bx0, ty = top + 1;
    for (let i = 0; i < n; i++) {
      tx = bx0 - 1 - i;
      ty = top + 1 - Math.round(i * (a.swim > 0.55 ? 0 : 0.55)) + (i > n / 2 ? sway : 0);
      B.set(tx, ty, i === n - 1 ? dark : body);
      if (a.size > 1.6) B.set(tx, ty + 1, dark);
    }
    if (a.swim > 0.55) for (let k = -2; k <= 2; k++) B.set(tx - 1, ty + k, light);
  }

  // ноги
  if (legH > 0) {
    const xs = [];
    if (legN === 2) xs.push(bx0 + Math.floor(L / 2) - 1, bx0 + Math.floor(L / 2) + 1);
    else for (let k = 0; k < legN; k++) xs.push(Math.round(bx0 + 1 + k * (L - 3) / (legN - 1)));
    const lw = a.size > 1.7 ? 2 : 1, amp = pose === P.RUN ? 2 : 1;
    xs.forEach((x, k) => {
      const phase = (k + (k >= legN / 2 ? 1 : 0)) % 2;
      const off = moving ? ((frame + phase * 2) % 4 < 2 ? amp : -amp) * (legN === 6 ? 0.5 : 1) : 0;
      const lift = moving && (frame + phase) % 2 ? 1 : 0;
      for (let j = 0; j < legH - lift; j++) for (let w = 0; w < lw; w++) {
        const lx = Math.round(x + w + off * (j / legH));
        B.set(lx, bottom + 1 + j, j === legH - lift - 1 ? out : (phase ? dark : body));
      }
    });
  }

  // тело
  for (let y = top; y <= bottom; y++) for (let x = bx0; x <= bx1; x++) {
    if ((x === bx0 || x === bx1) && (y === top || y === bottom)) continue;
    let c = y === top ? light : y === bottom ? belly : body;
    if (y > top && y < bottom) {
      if (a.pattern > 0.66) { const h = Math.sin(x * 12.99 + y * 78.23) * 43758.5; if (h - Math.floor(h) < 0.2) c = pat; }
      else if (a.pattern > 0.33 && (x - bx0) % 3 === 1) c = pat;
    }
    B.set(x, y, c);
  }
  // панцирь и шипы
  if (a.armor > 0.25) {
    const rows = a.armor > 0.6 ? 2 : 1;
    for (let x = bx0 + 1; x < bx1; x++) for (let r = 0; r < rows; r++) B.set(x, top + r, (x - bx0) % 3 === 0 ? shellD : shell);
    if (a.armor > 0.6) for (let x = bx0 + 2; x < bx1 - 1; x += 3) { B.set(x, top - 1, horn); if (a.size > 1.5) B.set(x, top - 2, horn); }
  }
  // спинной плавник
  if (a.swim > 0.55) {
    const cx = bx0 + Math.floor(L / 2);
    for (let r = 1; r <= 3; r++) for (let x = cx - 3 + r; x <= cx + 1; x++) B.set(x, top - r, light);
  }

  // голова
  const HS = Math.max(3, Math.round(BH * 0.75 + 1)), HW = HS + 1;
  let hx0 = bx1 - 1, hTop = top - Math.round(HS * 0.4);
  if (eat) hTop = ground - HS + (frame ? 0 : -1);
  if (sleep) hTop = ground - HS + 1;
  if (biped) hTop -= 1;
  const hBot = hTop + HS - 1, hx1 = hx0 + HW - 1;
  for (let y = hTop; y <= hBot; y++) for (let x = hx0; x <= hx1; x++) {
    if ((x === hx1) && (y === hTop || y === hBot)) continue;
    B.set(x, y, y === hTop ? light : body);
  }
  // морда: у хищников длинная, у травоядных короткая
  const snout = a.diet > 0.6 ? 3 : a.diet > 0.3 ? 2 : 1;
  for (let i = 1; i <= snout; i++) {
    B.set(hx1 + i, hBot - 1, i === snout ? dark : body);
    if (i < snout || snout === 1) B.set(hx1 + i, hBot, body);
  }
  if (atk) {
    B.set(hx1 + 1, hBot, [150, 20, 30]); B.set(hx1 + 2, hBot, [150, 20, 30]);
    if (a.diet > 0.3) { B.set(hx1 + 1, hBot - 1, [255, 255, 255]); B.set(hx1 + 2, hBot + 1, [255, 255, 255]); }
  }
  // уши
  if (a.ears > 0.2) {
    const eh = Math.max(1, Math.round(a.ears * 3)), ex = hx0 + 1;
    for (let j = 1; j <= eh; j++) { B.set(ex, hTop - j, body); if (a.size > 1.4) B.set(ex + 1, hTop - j, j === 1 ? [230, 150, 160] : body); }
  }
  // рога
  if (a.horns > 0.15) {
    const n = Math.round(a.horns * 5) + 1;
    let x = hx0 + Math.max(2, Math.floor(HW / 2)), y = hTop - 1;
    for (let i = 0; i < n; i++) { B.set(x, y, horn); if (i % 2) x++; else y--; }
  }
  // глаз (крупнее у зорких)
  const ex = hx1 - 1, ey = hTop + 1;
  if (sleep) { B.set(ex, ey + 1, out); B.set(ex - 1, ey + 1, out); }
  else if (a.sense > 9) { B.set(ex - 1, ey, [255, 255, 255]); B.set(ex, ey, [255, 255, 255]); B.set(ex, ey + 1, [10, 10, 20]); B.set(ex - 1, ey + 1, [255, 255, 255]); }
  else { B.set(ex, ey, a.diet > 0.6 ? [255, 210, 40] : [255, 255, 255]); B.set(ex, ey + 1, [10, 10, 20]); }

  B.outline(out);
  return B;
};

AW.Sprites = {
  cache: new Map(),
  get(c, pose, frame, flip) {
    const a = c.look || (c.look = AW.appearance(c.genome));
    const key = (c.lookKey || (c.lookKey = AW.appearanceKey(a))) + '|' + pose + '|' + frame + (flip ? 'L' : 'R');
    let cv = this.cache.get(key);
    if (!cv) {
      if (this.cache.size > 6000) this.cache.clear();
      cv = AW.drawCreatureSprite(a, pose, frame).canvas(flip);
      this.cache.set(key, cv);
    }
    return cv;
  },
  forLook(a, pose, frame, flip) {
    return AW.drawCreatureSprite(a, pose, frame).canvas(flip);
  },
  forLookCached(a, pose, frame) {
    const key = AW.appearanceKey(a) + '|' + pose + '|' + frame + 'R';
    let cv = this.cache.get(key);
    if (!cv) { cv = this.forLook(a, pose, frame, false); this.cache.set(key, cv); }
    return cv;
  },
};

// ---- Декор: деревья, кусты, камни, кости ----
AW.Decor = {
  cache: new Map(),
  get(kind, v) {
    const key = kind + v;
    let cv = this.cache.get(key);
    if (cv) return cv;
    const B = new AW.PixBuf(16, 20);
    const lush = [AW.hsl(115, 50, 34), AW.hsl(105, 45, 42), AW.hsl(95, 40, 30)];
    const dry = [AW.hsl(60, 35, 38), AW.hsl(55, 35, 46), AW.hsl(50, 30, 32)];
    const pal = v.startsWith('d') ? dry : lush;
    const trunk = [96, 64, 40];
    if (kind === 'tree') {
      B.rect(7, 13, 2, 6, trunk);
      const r = v.endsWith('2') ? 6 : 5;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y * 1.2 > r * r) continue;
        B.set(8 + x, 8 + y, y < -r / 3 && x < 1 ? pal[1] : y > r / 3 ? pal[2] : pal[0]);
      }
      if (v.includes('t')) { B.set(5, 7, [170, 70, 200]); B.set(10, 9, [170, 70, 200]); B.set(7, 11, [170, 70, 200]); }
      else if (v.endsWith('1')) { B.set(5, 7, [230, 60, 50]); B.set(10, 10, [230, 60, 50]); }
    } else if (kind === 'pine') {
      B.rect(7, 15, 2, 4, trunk);
      const snow = v.includes('s');
      for (let k = 0; k < 3; k++) {
        const w = 2 + k * 2, y0 = 3 + k * 4;
        for (let y = 0; y < 5; y++) for (let x = -Math.min(w, y + 1); x <= Math.min(w, y + 1); x++)
          B.set(8 + x, y0 + y, snow && y <= 1 && x <= 0 ? [240, 245, 250] : x < 0 ? pal[1] : pal[2]);
      }
    } else if (kind === 'bush') {
      for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) if (x * x / 16 + y * y / 9 <= 1) B.set(8 + x, 15 + y, y < 0 ? pal[1] : pal[0]);
      if (v.includes('t')) B.set(7, 14, [170, 70, 200]);
    } else if (kind === 'rock') {
      const g1 = [130, 126, 122], g2 = [160, 156, 150], g3 = [96, 92, 90];
      for (let y = -3; y <= 2; y++) for (let x = -4; x <= 4; x++) if (x * x / 16 + y * y / 9 <= 1) B.set(8 + x, 16 + y, y < -1 ? g2 : x > 1 ? g3 : g1);
    } else if (kind === 'cactus') {
      const g = [70, 140, 70], gd = [50, 105, 55];
      B.rect(7, 8, 2, 11, g); B.rect(4, 11, 1, 4, gd); B.rect(5, 14, 2, 1, gd); B.rect(11, 10, 1, 4, gd); B.rect(9, 13, 2, 1, gd);
    } else if (kind === 'bones') {
      const w = [235, 228, 210];
      B.rect(4, 16, 8, 1, w); B.set(3, 15, w); B.set(3, 17, w); B.set(12, 15, w); B.set(12, 17, w);
      B.rect(7, 14, 1, 2, w); B.set(10, 14, w);
    }
    B.outline(kind === 'bones' ? [60, 40, 40] : [20, 26, 18]);
    cv = B.canvas(false);
    this.cache.set(key, cv);
    return cv;
  },
};
