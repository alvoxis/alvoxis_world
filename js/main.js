// Игра: экран запуска, игровой цикл, управление мышью/пальцами/клавиатурой.
AW.Game = class {
  constructor() {
    this.$ = id => document.getElementById(id);
    this.speed = 1;
    this.tool = 'hand';
    this.brush = 3;
    this.spawnCount = 5;
    this.selected = null;
    this.follow = false;
    this.mouse = { x: 0, y: 0, inside: false };
    this.pointers = new Map();
    this.painting = false;
    this.acc = 0;
    this.tpsCount = 0; this.tps = 0; this.fpsCount = 0; this.fps = 0; this.lastSec = performance.now();
    this.setupLauncher();
  }

  // ---------- экран запуска ----------
  setupLauncher() {
    const row = this.$('starterRow');
    const def = { grazer: 120, hunter: 16, omni: 40, swimmer: 30, scav: 12, yeti: 0 };
    this.starters = {};
    for (const [key, p] of Object.entries(AW.PRESETS)) {
      const b = document.createElement('button');
      b.className = 'pick' + (def[key] ? ' selected' : '');
      b.innerHTML = `${p.icon} ${p.name}<small>${p.desc}</small>`;
      b.onclick = () => b.classList.toggle('selected');
      b.dataset.key = key;
      row.appendChild(b);
    }
    this.defaultCounts = Object.assign({}, def, { yeti: 14 });
    document.querySelectorAll('.btn-row[data-group]').forEach(r => r.addEventListener('click', e => {
      const b = e.target.closest('.pick');
      if (!b) return;
      r.querySelectorAll('.pick').forEach(x => x.classList.toggle('selected', x === b));
    }));
    this.$('startBtn').onclick = () => this.startNew();
    this.$('loadBtnL').onclick = () => this.load();
  }

  startNew() {
    const pick = g => document.querySelector(`.btn-row[data-group="${g}"] .pick.selected`).dataset.v;
    const seedText = this.$('seedInput').value.trim();
    const seed = seedText ? AW.hashString(seedText) : (Math.random() * 4294967295) >>> 0;
    const starters = {};
    this.$('starterRow').querySelectorAll('.pick.selected').forEach(b => { starters[b.dataset.key] = this.defaultCounts[b.dataset.key]; });
    const sim = new AW.Sim({ size: pick('size'), shape: pick('shape'), seed, starters });
    this.begin(sim);
    this.toast(`🌍 Мир создан. Зерно: ${seedText || seed}`, 'spawn');
  }

  begin(sim) {
    this.sim = sim;
    this.$('launcher').classList.add('hidden');
    this.$('game').classList.remove('hidden');
    this.selected = null;
    if (!this.renderer) {
      this.renderer = new AW.Renderer(this.$('view'), sim);
      this.ui = new AW.UI(this);
      this.bindInput();
      this.bindControls();
      requestAnimationFrame(t => this.loop(t));
    } else {
      this.renderer.setSim(sim);
      this.ui.closeInspector();
    }
    this.ui.lastSeq = sim.eventSeq;
    this.ui.updateTop();
    this.$('worldInfo').textContent = `Мир ${sim.world.w}×${sim.world.h}, зерно ${sim.seed}. Лимит существ: ${AW.MAX_POP}.`;
  }

  // Демо: маленький мир с одним существом и его парой
  startDemo(key) {
    const P = AW.PRESETS[key];
    const sim = new AW.Sim({ size: 'small', shape: 'island', seed: 777, starters: {} });
    const probe = sim.makeFounder(P.g, null, 0, 0);
    const spot = AW.Lab.landSpot(sim, probe);
    sim.spawnGroup(key, P.g, P.name, spot.x, spot.y, 1, 0.5);
    sim.spawnGroup(key, P.g, P.name, spot.x, spot.y, 1, 1.5);
    const [a, b] = sim.creatures;
    if (a) { a.sex = 0; a.age = Math.round(a.mature * 1.5); a.energy = a.maxE * 0.9; }
    if (b) { b.sex = 1; b.age = Math.round(b.mature * 1.5); b.energy = b.maxE * 0.9; }
    this.begin(sim);
    if (a) { this.select(a); this.centerOn(a); this.renderer.cam.zoom = 16; this.centerOn(a); this.setFollow(true); }
    this.toast(`🧪 Демо: ${a ? a.name : ''} и ${b ? b.name : ''} (${P.name}). Смотри мозг и гены в инспекторе справа.`, 'spawn');
  }

  async save() {
    try { await AW.Save.save(this.sim); this.toast('💾 Мир сохранён', 'spawn'); }
    catch (e) { this.toast('Не удалось сохранить: ' + e.message, 'extinct'); }
  }

  async load() {
    try {
      const sim = await AW.Save.load();
      if (!sim) { this.notice('Сохранений пока нет'); return; }
      this.begin(sim);
      this.toast('📂 Мир загружен', 'spawn');
    } catch (e) { this.notice('Не удалось загрузить: ' + e.message); }
  }

  notice(text) {
    if (this.sim && !this.$('game').classList.contains('hidden')) this.toast(text, 'extinct');
    else { const b = this.$('loadBtnL'); b.textContent = text; setTimeout(() => { b.textContent = 'Загрузить сохранение'; }, 3000); }
  }

  // ---------- кнопки ----------
  bindControls() {
    this.$('speedRow').addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.setSpeed(+b.dataset.speed); });
    const bs = this.$('brushSize'), bs2 = this.$('brushSize2');
    const setBrush = v => { this.brush = +v; bs.value = bs2.value = v; this.$('brushVal').textContent = this.$('brushVal2').textContent = v; };
    bs.oninput = () => setBrush(bs.value);
    bs2.oninput = () => setBrush(bs2.value);
    this.$('spawnCount').oninput = e => { this.spawnCount = +e.target.value; this.$('spawnVal').textContent = e.target.value; };
    this.$('saveBtn').onclick = () => this.save();
    this.$('loadBtn').onclick = () => this.load();
    // подтверждение прямо на кнопке (диалоги confirm() работают не везде)
    this.$('newBtn').onclick = () => {
      const b = this.$('newBtn');
      if (!b.dataset.armed) {
        b.dataset.armed = '1'; b.textContent = '⚠️ Точно? Ещё раз';
        setTimeout(() => { delete b.dataset.armed; b.textContent = '🌍 Новый мир'; }, 3000);
        return;
      }
      delete b.dataset.armed; b.textContent = '🌍 Новый мир';
      this.$('game').classList.add('hidden'); this.$('launcher').classList.remove('hidden');
    };
    this.$('nightBtn').onclick = () => { this.renderer.showNight = !this.renderer.showNight; this.$('nightBtn').textContent = '🌙 Ночь: ' + (this.renderer.showNight ? 'вкл' : 'выкл'); };
    this.$('followBtn').onclick = () => this.setFollow(!this.follow);
    this.$('fitBtn').onclick = () => this.renderer.fitCamera();
  }

  setSpeed(s) {
    this.speed = s;
    document.querySelectorAll('#speedRow button').forEach(b => b.classList.toggle('selected', +b.dataset.speed === s));
  }

  setTool(id) { this.tool = id; this.ui.markTool(id); }

  setFollow(v) {
    this.follow = v;
    this.$('followBtn').textContent = '🎥 Следить: ' + (v ? 'вкл' : 'выкл');
    if (this.selected) this.ui.updateInspector();
  }

  select(c) {
    this.selected = c;
    this.sim.selected = c;
    if (c) this.ui.openInspector(c); else { this.ui.closeInspector(); this.setFollow(false); }
  }

  centerOn(c) {
    const r = this.renderer, cam = r.cam;
    if (cam.zoom < 8) cam.zoom = 8;
    cam.x = c.x - r.canvas.width / cam.zoom / 2;
    cam.y = c.y - r.canvas.height / cam.zoom / 2;
  }

  toast(html, type) {
    const box = this.$('toasts');
    const d = document.createElement('div');
    d.className = 'toast ' + (type || '');
    d.innerHTML = html;
    box.appendChild(d);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 700); }, 5000);
  }

  // ---------- ввод ----------
  pickCreature(x, y) {
    let best = null, bd = Math.max(1.5, 10 / this.renderer.cam.zoom) ** 2;
    for (const c of this.sim.creatures) {
      const dx = c.x - x, dy = c.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  applyAt(sx, sy, first) {
    const p = this.renderer.screenToWorld(sx, sy), sim = this.sim, t = this.tool;
    if (t.startsWith('spawn:')) {
      if (!first) return;
      const key = t.slice(6), P = AW.PRESETS[key];
      const n = sim.spawnGroup(key, P.g, P.name, p.x, p.y, this.spawnCount, 3);
      if (!n) this.toast(sim.creatures.length >= AW.MAX_POP ? 'Мир переполнен' : `${P.name} не могут жить здесь`, 'extinct');
      return;
    }
    const info = AW.TOOLS[t];
    if (!info) return;
    if (info.once && !first) return;
    AW.applyTool(sim, t, p.x, p.y, this.brush, this.renderer.fx);
  }

  bindInput() {
    const cv = this.$('view');
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, button: e.button, moved: false });
      if (this.pointers.size === 2) { this.painting = false; this.pinch = this.pinchState(); return; }
      const panMode = e.button === 1 || e.button === 2 || this.tool === 'hand' || this.tool === 'inspect';
      if (!panMode) { this.painting = true; this.paintPos = { x, y }; this.applyAt(x, y, true); }
    });
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      this.mouse = { x, y, inside: true };
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 2) {
        p.x = x; p.y = y;
        const now = this.pinchState(), was = this.pinch;
        if (was && now.d > 0 && was.d > 0) {
          this.renderer.zoomAt(now.cx, now.cy, now.d / was.d);
          this.renderer.pan(now.cx - was.cx, now.cy - was.cy);
        }
        this.pinch = now;
        return;
      }
      const dx = x - p.x, dy = y - p.y;
      if (Math.abs(x - p.sx) + Math.abs(y - p.sy) > 6) p.moved = true;
      p.x = x; p.y = y;
      if (this.painting) this.paintPos = { x, y };
      else if (p.moved) { this.renderer.pan(dx, dy); if (this.follow) this.setFollow(false); }
    });
    const up = e => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!p) return;
      if (this.painting) { this.painting = false; return; }
      if (!p.moved && (p.button === 0) && this.pointers.size === 0) {
        const w = this.renderer.screenToWorld(p.x, p.y), c = this.pickCreature(w.x, w.y);
        if (c) this.select(c);
        else if (this.tool === 'inspect') this.select(null);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { this.mouse.inside = false; });

    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || !this.sim) return;
      const k = e.key.toLowerCase(), r = this.renderer, step = 40;
      if (k === ' ') { e.preventDefault(); if (this.speed) { this.prevSpeed = this.speed; this.setSpeed(0); } else this.setSpeed(this.prevSpeed || 1); }
      else if ('12345'.includes(k) && k.length === 1) this.setSpeed([0, 1, 2, 5, 20][+k - 1]);
      else if (k === 'escape') this.select(null);
      else if (k === 'a' || k === 'arrowleft' || k === 'ф') r.pan(step, 0);
      else if (k === 'd' || k === 'arrowright' || k === 'в') r.pan(-step, 0);
      else if (k === 'w' || k === 'arrowup' || k === 'ц') r.pan(0, step);
      else if (k === 's' || k === 'arrowdown' || k === 'ы') r.pan(0, -step);
      else if (k === '+' || k === '=') r.zoomAt(r.canvas.clientWidth / 2, r.canvas.clientHeight / 2, 1.2);
      else if (k === '-') r.zoomAt(r.canvas.clientWidth / 2, r.canvas.clientHeight / 2, 1 / 1.2);
    });
    window.addEventListener('resize', () => this.renderer.resize());
  }

  pinchState() {
    const ps = [...this.pointers.values()];
    if (ps.length < 2) return null;
    const [a, b] = ps;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  // ---------- игровой цикл ----------
  loop(now) {
    const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000);
    this.lastT = now;
    const sim = this.sim;
    // скорость x1 = 30 тиков в секунду; максимум ограничен бюджетом кадра
    if (this.speed > 0) {
      this.acc += this.speed * 30 * dt;
      const t0 = performance.now();
      while (this.acc >= 1) {
        sim.step();
        this.acc--;
        this.tpsCount++;
        if (performance.now() - t0 > 14) { this.acc = Math.min(this.acc, 2); break; }
      }
    }
    if (this.painting && this.paintPos) this.applyAt(this.paintPos.x, this.paintPos.y, false);
    if (this.follow && this.selected && this.selected.alive) this.centerOn(this.selected);
    this.renderer.clampCamera();
    this.renderer.draw(this.selected, this.tool, this.mouse, this.brush);
    this.fpsCount++;
    if (now - this.lastSec > 1000) {
      this.fps = this.fpsCount; this.tps = this.tpsCount; this.fpsCount = this.tpsCount = 0; this.lastSec = now;
      this.$('perfInfo').textContent = `FPS ${this.fps} · тиков/с ${this.tps}`;
    }
    if (!this.uiTimer || now - this.uiTimer > 250) {
      this.uiTimer = now;
      this.ui.updateTop();
      this.ui.pullEvents();
      if (this.selected) this.ui.updateInspector();
      this.ui.updateStats();
      this.ui.drawLab();
      this.updateTileInfo();
    }
    requestAnimationFrame(t => this.loop(t));
  }

  updateTileInfo() {
    if (!this.mouse.inside) return;
    const p = this.renderer.screenToWorld(this.mouse.x, this.mouse.y), w = this.sim.world, i = w.at(p.x, p.y);
    if (i < 0) { this.$('tileInfo').textContent = '—'; return; }
    const t = AW.TERRAIN[w.t[i]];
    let s = `${t.name} (${p.x | 0}, ${p.y | 0}) · растения ${Math.round(w.veg[i] * 100)}%`;
    if (w.tox[i]) s += ' · ядовитые';
    if (w.meat[i] > 0.1) s += ` · мясо ${w.meat[i].toFixed(1)}`;
    if (w.fire[i]) s += ' · 🔥';
    this.$('tileInfo').textContent = s;
  }
};

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => { AW.game = new AW.Game(); });
else AW.game = new AW.Game();
