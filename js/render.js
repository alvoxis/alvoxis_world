// Отрисовка: пиксельная карта (1 клетка = 1 пиксель, масштабируется без сглаживания),
// существа-спрайты, эффекты, ночь.
AW.Renderer = class {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = new AW.Effects();
    this.setSim(sim);
    this.showNight = true;
    this.frame = 0;
  }

  setSim(sim) {
    this.sim = sim;
    const w = sim.world;
    this.tc = document.createElement('canvas');
    this.tc.width = w.w; this.tc.height = w.h;
    this.tctx = this.tc.getContext('2d');
    this.img = this.tctx.createImageData(w.w, w.h);
    this.cam = this.cam || { x: 0, y: 0, zoom: 6 };
    this.fitCamera();
    this.fx.reset();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1, r = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  fitCamera() {
    this.resize();
    const w = this.sim.world, cw = this.canvas.width, ch = this.canvas.height;
    this.cam.zoom = Math.max(1, Math.min(cw / w.w, ch / w.h));
    this.cam.x = w.w / 2 - cw / this.cam.zoom / 2;
    this.cam.y = w.h / 2 - ch / this.cam.zoom / 2;
  }

  screenToWorld(sx, sy) {
    return { x: this.cam.x + sx * this.dpr / this.cam.zoom, y: this.cam.y + sy * this.dpr / this.cam.zoom };
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = AW.clamp(this.cam.zoom * factor, 1, 48);
    this.cam.x = before.x - sx * this.dpr / this.cam.zoom;
    this.cam.y = before.y - sy * this.dpr / this.cam.zoom;
  }

  pan(dxCss, dyCss) {
    this.cam.x -= dxCss * this.dpr / this.cam.zoom;
    this.cam.y -= dyCss * this.dpr / this.cam.zoom;
  }

  clampCamera() {
    const w = this.sim.world, vw = this.canvas.width / this.cam.zoom, vh = this.canvas.height / this.cam.zoom;
    this.cam.x = vw > w.w ? (w.w - vw) / 2 : AW.clamp(this.cam.x, -4, w.w - vw + 4);
    this.cam.y = vh > w.h ? (w.h - vh) / 2 : AW.clamp(this.cam.y, -4, w.h - vh + 4);
  }

  paintTerrain() {
    const w = this.sim.world, d = this.img.data, T = AW.T, TR = AW.TERRAIN, n = w.w * w.h, fl = this.frame;
    for (let i = 0; i < n; i++) {
      const t = w.t[i], base = TR[t].color, v = (w.vary[i] - 128) / 128;
      let r = base[0], g = base[1], b = base[2];
      if (t === T.GRASS || t === T.FOREST || t === T.DIRT || t === T.HILLS) {
        const f = Math.min(1, w.veg[i] / TR[t].cap);
        const dry = t === T.FOREST ? [96, 92, 52] : t === T.DIRT ? [120, 92, 60] : [158, 146, 82];
        r = dry[0] + (r - dry[0]) * f; g = dry[1] + (g - dry[1]) * f; b = dry[2] + (b - dry[2]) * f;
        if (t === T.FOREST && w.vary[i] > 170) { r *= 0.7; g *= 0.78; b *= 0.7; }
        if (w.tox[i] && w.veg[i] > 0.15) { r = r * 0.6 + 150 * 0.4; g = g * 0.6 + 70 * 0.4; b = b * 0.6 + 170 * 0.4; }
      }
      if (t === T.DEEP || t === T.WATER) {
        const s = 1 + v * 0.06 + Math.sin((i % w.w) * 0.3 + fl * 0.02 + ((i / w.w) | 0) * 0.2) * 0.04;
        r *= s; g *= s; b *= s;
      } else if (t === T.LAVA) {
        const s = 0.85 + Math.random() * 0.25;
        r *= s; g *= s * (0.8 + v * 0.3);
      } else {
        const s = 1 + v * 0.07 + (w.elev[i] - 0.55) * 0.35;
        r *= s; g *= s; b *= s;
      }
      const m = w.meat[i];
      if (m > 0.3) { const k = Math.min(0.7, m / 8); r = r * (1 - k) + 140 * k; g = g * (1 - k) + 24 * k; b = b * (1 - k) + 24 * k; }
      if (w.fire[i] > 0) { const q = Math.random(); r = 255; g = 120 + q * 120; b = 20 + q * 40; }
      const o = i * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    this.tctx.putImageData(this.img, 0, 0);
  }

  draw(selected, tool, mouse, brush) {
    const ctx = this.ctx, cam = this.cam, sim = this.sim, z = cam.zoom, W = this.canvas.width, H = this.canvas.height;
    this.frame++;
    if (this.frame % 4 === 0 || sim.world.dirty) { this.paintTerrain(); sim.world.dirty = false; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);
    let sx = 0, sy = 0;
    if (this.fx.shake > 0) { sx = (Math.random() - 0.5) * this.fx.shake; sy = (Math.random() - 0.5) * this.fx.shake; this.fx.shake *= 0.9; if (this.fx.shake < 0.5) this.fx.shake = 0; }
    ctx.imageSmoothingEnabled = false;
    const ox = -cam.x * z + sx, oy = -cam.y * z + sy;
    ctx.drawImage(this.tc, Math.round(ox), Math.round(oy), sim.world.w * z, sim.world.h * z);

    // существа
    const vx0 = cam.x - 2, vy0 = cam.y - 2, vx1 = cam.x + W / z + 2, vy1 = cam.y + H / z + 2;
    const tiny = z < 3.5;
    for (const c of sim.creatures) {
      if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
      const px = ox + c.x * z, py = oy + c.y * z;
      const hue = c.genome[AW.G.hue] | 0;
      if (tiny) {
        const s = Math.max(2, Math.round(z * 0.9));
        ctx.fillStyle = `hsl(${hue},75%,${c.disease ? 40 : 58}%)`;
        ctx.fillRect(Math.round(px - s / 2), Math.round(py - s / 2), s, s);
        continue;
      }
      const s = Math.max(3, Math.round(z * (0.45 + c.size * 0.3)));
      const x0 = Math.round(px - s / 2), y0 = Math.round(py - s / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x0 - 1, y0 - 1, s + 2, s + 2);
      ctx.fillStyle = c.disease ? `hsl(${hue},35%,38%)` : `hsl(${hue},70%,${52 + (c.energy / c.maxE) * 12}%)`;
      ctx.fillRect(x0, y0, s, s);
      // тень снизу для объёма
      const p = Math.max(1, Math.round(s / 4));
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x0, y0 + s - p, s, p);
      // глаз в сторону взгляда: белый — травоядный, красный — хищник
      const ex = Math.round(px + Math.cos(c.dir) * s * 0.3 - p / 2), ey = Math.round(py + Math.sin(c.dir) * s * 0.3 - p / 2);
      ctx.fillStyle = c.diet > 0.6 ? '#ff3030' : c.diet > 0.3 ? '#ffb030' : '#ffffff';
      ctx.fillRect(ex, ey, p, p);
      if (c.callAmp > 0 && z >= 6) {
        ctx.fillStyle = `rgba(255,255,255,${0.4 + c.callAmp * 0.6})`;
        ctx.fillRect(x0 + s + 1, y0 - p * 2, p, p * 2);
      }
      if (c.out[AW.OUT.Attack] > 0.3 && c.atkCd > 6 && z >= 6) {
        ctx.fillStyle = '#ffdd33';
        ctx.fillRect(x0 - p, y0 - p, p, p);
      }
    }

    // выбранное существо
    if (selected && selected.alive) {
      const px = ox + selected.x * z, py = oy + selected.y * z;
      const blink = (this.frame >> 3) & 1;
      ctx.strokeStyle = blink ? '#ffee00' : '#ff8800';
      ctx.lineWidth = Math.max(1, this.dpr);
      const s = Math.max(6, z * 1.6);
      ctx.strokeRect(px - s / 2, py - s / 2, s, s);
      ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
      ctx.strokeStyle = 'rgba(0,255,136,0.5)';
      ctx.beginPath(); ctx.arc(px, py, selected.sense * z, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const link = (o, col) => { if (o && o.alive) { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ox + o.x * z, oy + o.y * z); ctx.stroke(); } };
      link(selected.kin, 'rgba(100,200,255,0.7)');
      link(selected.oth, 'rgba(255,90,90,0.8)');
      // воспоминания: зелёные — хорошие места, красные — опасные
      const m = selected.mem;
      for (let k = 0; k < selected.M; k++) {
        const st = m[k * 4 + 3];
        if (st < 0.05) continue;
        const mx = ox + m[k * 4] * z, my = oy + m[k * 4 + 1] * z, val = m[k * 4 + 2];
        ctx.globalAlpha = Math.min(1, st);
        ctx.fillStyle = val > 0 ? '#3dff7a' : '#ff3d3d';
        const q = Math.max(3, z * 0.6);
        ctx.fillRect(mx - q / 2, my - q * 1.5, q, q * 3);
        ctx.fillRect(mx - q * 1.5, my - q / 2, q * 3, q);
        ctx.globalAlpha = 1;
      }
    }

    this.fx.draw(ctx, ox, oy, z, W, H);

    // ночь
    if (this.showNight) {
      const l = sim.light, dark = l < 0.2 ? Math.min(0.45, (0.2 - l) * 0.4) : 0;
      if (dark > 0) { ctx.fillStyle = `rgba(10,15,60,${dark})`; ctx.fillRect(0, 0, W, H); }
    }

    // кисть
    if (mouse && mouse.inside && tool && tool !== 'hand' && tool !== 'inspect') {
      const p = this.screenToWorld(mouse.x, mouse.y);
      const info = AW.TOOLS[tool];
      const r = info && info.once && tool !== 'p_meteor' && tool !== 'p_quake' && tool !== 'p_mutagen' && tool !== 'p_wisdom' ? 1 : tool.startsWith('spawn') ? 3 : brush;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1, this.dpr);
      ctx.beginPath(); ctx.arc(ox + p.x * z, oy + p.y * z, Math.max(2, r * z), 0, Math.PI * 2); ctx.stroke();
    }
  }
};

AW.Effects = class {
  constructor() { this.reset(); }
  reset() { this.parts = []; this.bolts = []; this.shake = 0; }
  explode(x, y, r, col) {
    for (let k = 0; k < 120; k++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * r * 0.08;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 40 + Math.random() * 40, col: Math.random() < 0.5 ? col : '#ffd23a', size: 1 });
    }
  }
  puff(x, y, r, col) {
    for (let k = 0; k < 30 + r * 6; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      this.parts.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: 0, vy: -0.03 - Math.random() * 0.03, life: 30 + Math.random() * 30, col, size: 0.5 });
    }
  }
  rain(x, y, r) {
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      this.parts.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 3, vx: -0.02, vy: 0.25, life: 12, col: '#9fd3ff', size: 0.35, streak: true });
    }
  }
  bolt(x, y) {
    const pts = [];
    let cx = x + (Math.random() - 0.5) * 6, cy = y - 30;
    for (let k = 0; k <= 10; k++) { pts.push([cx, cy]); cy += 3; cx += (Math.random() - 0.5) * 2.5 + (x - cx) * 0.25; }
    pts.push([x, y]);
    this.bolts.push({ pts, life: 14 });
    this.flash = 6;
  }
  draw(ctx, ox, oy, z, W, H) {
    const P = this.parts;
    let j = 0;
    for (let k = 0; k < P.length; k++) {
      const p = P[k];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life--;
      if (p.life <= 0) continue;
      P[j++] = p;
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.fillStyle = p.col;
      const s = Math.max(2, p.size * z);
      if (p.streak) ctx.fillRect(ox + p.x * z, oy + p.y * z, Math.max(1, s / 3), s * 3);
      else ctx.fillRect(Math.round(ox + p.x * z - s / 2), Math.round(oy + p.y * z - s / 2), s, s);
    }
    P.length = j;
    ctx.globalAlpha = 1;
    for (const b of this.bolts) {
      ctx.strokeStyle = b.life % 4 < 2 ? '#ffffff' : '#bfe4ff';
      ctx.lineWidth = Math.max(2, z * 0.4);
      ctx.beginPath();
      b.pts.forEach((p, i) => (i ? ctx.lineTo(ox + p[0] * z, oy + p[1] * z) : ctx.moveTo(ox + p[0] * z, oy + p[1] * z)));
      ctx.stroke();
      b.life--;
    }
    this.bolts = this.bolts.filter(b => b.life > 0);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash / 20})`; ctx.fillRect(0, 0, W, H); this.flash--; }
  }
};
