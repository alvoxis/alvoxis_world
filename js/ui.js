// Интерфейс: вкладки, кнопки инструментов, инспектор существа, статистика, летопись.
AW.UI = class {
  constructor(game) {
    this.g = game;
    this.lastSeq = 0;
    this.customN = 0;
    this.$ = id => document.getElementById(id);
    this.buildTools();
    this.buildDesigner();
    this.bindTabs();
    this.bindLab();
  }

  // ---------- лаборатория ----------
  bindLab() {
    const sel = this.$('labPreset');
    for (const [k, p] of Object.entries(AW.PRESETS)) { const o = document.createElement('option'); o.value = k; o.textContent = `${p.icon} ${p.name}`; sel.appendChild(o); }
    sel.value = 'omni';
    this.$('labDemo').onclick = () => this.g.startDemo(sel.value);
    this.$('labBreed').onclick = () => this.breed();
    this.$('labRelease').onclick = () => this.releaseChild();
    this.$('labTest').onclick = () => {
      const box = this.$('testResults');
      box.textContent = 'Идёт проверка…';
      setTimeout(() => {
        const res = AW.Lab.runInheritanceTests(), ok = res.filter(t => t.ok).length;
        box.innerHTML = `<div class="${ok === res.length ? 'ok' : 'bad'}"><b>${ok}/${res.length} проверок пройдено</b></div>` +
          res.map(t => `<div class="${t.ok ? 'ok' : 'bad'}">${t.ok ? '✓' : '✗'} ${t.name} <small>(${t.detail})</small></div>`).join('');
      }, 30);
    };
  }

  breed() {
    const sim = this.g.sim;
    let a = this.g.selected && this.g.selected.alive ? this.g.selected : null;
    if (!a) {
      const big = [...sim.species.values()].filter(s => s.count > 1).sort((x, y) => y.count - x.count)[0];
      const pool = big ? sim.creatures.filter(c => c.species === big) : [];
      a = pool[(Math.random() * pool.length) | 0];
    }
    if (!a) { this.g.toast('В мире нет существ для скрещивания', 'extinct'); return; }
    let b = null, bd = Infinity;
    for (const c of sim.creatures) {
      if (c === a || c.species !== a.species || c.sex === a.sex) continue;
      const d = (c.x - a.x) ** 2 + (c.y - a.y) ** 2;
      if (d < bd) { bd = d; b = c; }
    }
    if (!b) { this.g.toast(`Для ${a.name} нет пары другого пола`, 'extinct'); return; }
    const res = AW.Lab.breedExplain(sim, a, b);
    this.breedRes = { a, b, ...res, look: AW.appearance(res.genome) };
    this.$('brAn').textContent = `${a.sex ? '♂' : '♀'} ${a.name}`;
    this.$('brBn').textContent = `${b.sex ? '♂' : '♀'} ${b.name}`;
    const row = l => {
      const i = AW.G[l.key], f = v => l.int ? Math.round(v) : l.key === 'diet' ? Math.round(v * 100) + '%' : v.toFixed(2);
      const o = res.origin[i];
      return `<tr><td>${l.name}</td><td>${f(a.genome[i])}</td><td>${f(b.genome[i])}</td><td class="${o.includes('мутация') ? 'mut' : ''}">${f(res.genome[i])}</td><td>${o}</td></tr>`;
    };
    this.$('breedTable').innerHTML = `<table><tr><th>Ген</th><th>A</th><th>B</th><th>Потомок</th><th>Откуда</th></tr>${AW.LOCI.filter(l => !l.wrap).map(row).join('')}</table>`;
  }

  releaseChild() {
    const br = this.breedRes, sim = this.g.sim;
    if (!br || !br.a.alive) { this.g.toast('Сначала скрести двух живых существ', 'extinct'); return; }
    const c = new AW.Creature(sim, Float32Array.from(br.genome), Float32Array.from(br.brain), br.a.x + 0.5, br.a.y + 0.5);
    c.gen = Math.max(br.a.gen, br.b.gen) + 1;
    c.parentIds = [br.a.id, br.b.id];
    c.energy = c.maxE * 0.7;
    c.species = AW.assignSpecies(sim, c, br.a.species);
    c.species.count++; c.species.total++;
    br.a.kids++; br.b.kids++;
    sim.born.push(c);
    this.g.select(c);
    this.g.toast(`🌱 ${c.name} выпущен в мир`, 'spawn');
  }

  drawLab() {
    if (this.activeTab !== 'lab' || !this.breedRes) return;
    const br = this.breedRes, f = (this.g.renderer.frame >> 3) % 4;
    const put = (id, look) => {
      const cv = this.$(id), ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(AW.Sprites.forLookCached(look, 1, f), 0, 0, 96, 72);
    };
    put('brA', br.a.look || AW.appearance(br.a.genome));
    put('brB', br.b.look || AW.appearance(br.b.genome));
    put('brC', br.look);
  }

  toolButton(id, icon, label, swatch) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.tool = id;
    b.title = label;
    b.innerHTML = swatch ? `<i class="swatch" style="background:${swatch}"></i><span>${label}</span>` : `<i>${icon}</i><span>${label}</span>`;
    return b;
  }

  buildTools() {
    const tg = this.$('terrainTools'), pg = this.$('powerTools'), lg = this.$('lifeTools');
    for (const [id, t] of Object.entries(AW.TOOLS)) {
      if (t.tab === 'terrain') {
        const col = t.terrain !== undefined ? `rgb(${AW.TERRAIN[t.terrain].color.join(',')})` : null;
        tg.appendChild(this.toolButton(id, t.icon, t.name, col));
      } else pg.appendChild(this.toolButton(id, t.icon, t.name));
    }
    for (const [key, p] of Object.entries(AW.PRESETS)) {
      const b = this.toolButton('spawn:' + key, p.icon, p.name);
      b.title = p.desc;
      lg.appendChild(b);
    }
    document.querySelectorAll('.tool-grid').forEach(grid => grid.addEventListener('click', e => {
      const b = e.target.closest('.tool');
      if (b) this.g.setTool(b.dataset.tool);
    }));
  }

  markTool(id) {
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('selected', b.dataset.tool === id));
  }

  buildDesigner() {
    const box = this.$('dSliders'), base = AW.PRESETS.grazer.g;
    this.dVals = Object.assign({}, base);
    for (const l of AW.LOCI) {
      const row = document.createElement('div');
      row.className = 'd-row';
      const step = l.int ? 1 : (l.max - l.min) / 100;
      row.innerHTML = `<label>${l.name}</label><input type="range" min="${l.min}" max="${l.max}" step="${step}" value="${base[l.key]}"><b></b>`;
      const inp = row.querySelector('input'), out = row.querySelector('b');
      const show = () => {
        const v = +inp.value;
        this.dVals[l.key] = v;
        if (l.key === 'hue') { out.textContent = ''; out.style.background = `hsl(${v},70%,58%)`; out.style.height = '14px'; }
        else if (l.key === 'diet') out.textContent = Math.round(v * 100) + '%';
        else out.textContent = l.int ? v : v.toFixed(2);
      };
      inp.addEventListener('input', show);
      show();
      box.appendChild(row);
    }
    this.$('dUse').addEventListener('click', () => {
      const key = 'custom' + (++this.customN);
      const name = (this.$('dName').value || '').trim() || AW.makeName(Math.random, true);
      AW.PRESETS[key] = { name, icon: '🧬', desc: 'Свой вид', g: Object.assign({}, this.dVals), custom: true };
      const b = this.toolButton('spawn:' + key, '🧬', name);
      this.$('lifeTools').appendChild(b);
      this.g.setTool('spawn:' + key);
      this.g.toast(`🧬 Вид «${name}» готов — нажми на карту, чтобы заселить`, 'spawn');
    });
  }

  bindTabs() {
    this.$('tabs').addEventListener('click', e => {
      const t = e.target.closest('.tab');
      if (!t) return;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + t.dataset.tab));
      this.activeTab = t.dataset.tab;
      if (this.activeTab === 'stats') this.updateStats(true);
    });
  }

  // ---------- верхняя панель ----------
  updateTop() {
    const sim = this.g.sim, day = Math.floor(sim.tick / AW.DAY_LEN) + 1, year = Math.floor(sim.tick / AW.YEAR_LEN) + 1;
    const night = sim.light < 0 ? ' 🌙' : ' ☀️';
    this.$('tbDate').textContent = `Год ${year}, день ${day}, ${sim.seasonName}${night}`;
    this.$('tbPop').textContent = `🐾 ${sim.creatures.length}`;
    let alive = 0;
    for (const s of sim.species.values()) if (s.count > 0) alive++;
    this.$('tbSpecies').textContent = `🧬 видов: ${alive}`;
    this.$('tbGen').textContent = `👪 поколение ${sim.stats.maxGen}`;
  }

  // ---------- всплывающие сообщения ----------
  pullEvents() {
    const sim = this.g.sim;
    for (const e of sim.events) {
      if (e.seq <= this.lastSeq) continue;
      this.lastSeq = e.seq;
      if (e.type !== 'death' || this.g.selected) this.g.toast(e.html, e.type);
    }
  }

  // ---------- инспектор ----------
  openInspector(c) {
    const box = this.$('inspector');
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="ins-head"><div class="ins-swatch" id="iSw"></div>
        <div><div class="ins-name" id="iName"></div><div class="ins-sub" id="iSub"></div></div>
        <button class="ins-close" id="iClose">✕</button></div>
      <div class="ins-portrait"><canvas id="iPortrait" width="96" height="72"></canvas><div class="kv" id="iBody"></div></div>
      <div class="ins-thought" id="iThought"></div>
      <div>Энергия</div><div class="bar"><div id="iE" style="background:#ffcc00"></div></div>
      <div>Здоровье</div><div class="bar"><div id="iH" style="background:#00ff88"></div></div>
      <div class="kv" id="iKv"></div>
      <div class="ins-sec">НЕЙРОСЕТЬ (живая)</div>
      <canvas id="brainCanvas"></canvas>
      <div class="ins-sub" id="iWhy"></div>
      <div class="ins-sec">ГЕНОМ</div>
      <div class="kv" id="iGenes"></div>
      <div class="ins-btns">
        <button class="action-btn" id="iFollow">🎥 Следить</button>
        <button class="action-btn" id="iBless">✨ Исцелить</button>
        <button class="action-btn" id="iClone">🧬 Клон</button>
        <button class="action-btn" id="iKill">💀 Убить</button>
      </div>`;
    this.$('iClose').onclick = () => this.g.select(null);
    this.$('iFollow').onclick = () => this.g.setFollow(!this.g.follow);
    this.$('iBless').onclick = () => { const s = this.g.selected; if (s && s.alive) { s.hp = 100; s.energy = s.maxE; s.disease = 0; s.toxin = 0; } };
    this.$('iKill').onclick = () => { const s = this.g.selected; if (s && s.alive) this.g.sim.kill(s, 'наказан богом'); };
    this.$('iClone').onclick = () => {
      const s = this.g.selected, sim = this.g.sim;
      if (!s || !s.alive || sim.creatures.length >= AW.MAX_POP) return;
      const c = new AW.Creature(sim, Float32Array.from(s.genome), Float32Array.from(s.brain), s.x + 0.5, s.y + 0.5);
      c.plastic.set(s.plastic); c.species = s.species; c.gen = s.gen; c.energy = c.maxE * 0.8;
      s.species.count++; s.species.total++;
      sim.born.push(c);
    };
    this.brainCanvas = this.$('brainCanvas');
    this.updateInspector();
  }

  closeInspector() { this.$('inspector').classList.add('hidden'); }

  thought(c) {
    if (!c.alive) return `Погиб: ${c.cause}`;
    const I = AW.IN, inp = c.inp, parts = [c.action];
    if (c.energy < c.maxE * 0.2) parts.push('очень голоден');
    if (c.painIn > 0.25) parts.push('больно!');
    if (c.oth && c.oth.diet > 0.6 && c.diet < 0.4 && inp[I.OthNear] > 0.4) parts.push('рядом хищник!');
    if (c.reward > 0.25) parts.push('вкусно');
    if (inp[I.MemHere] < -0.25) parts.push('помнит: здесь опасно');
    else if (inp[I.MemHere] > 0.25) parts.push('помнит: здесь было хорошо');
    if (inp[I.HearLoud] > 0.3) parts.push('слышит зов');
    if (c.disease) parts.push('болен');
    if (c.toxin > 0.3) parts.push('отравлен');
    return '💭 ' + parts.join(', ');
  }

  updateInspector() {
    const c = this.g.selected;
    if (!c) return;
    const sim = this.g.sim, sp = c.species, hue = c.genome[AW.G.hue] | 0;
    this.$('iSw').style.background = `hsl(${hue},70%,58%)`;
    this.$('iName').textContent = c.name;
    this.$('iSub').innerHTML = `${c.sex ? '♂ самец' : '♀ самка'} · ${sp ? sp.name : '?'} · ${AW.dietLabel(c.diet)} · поколение ${c.gen}`;
    const pc = this.$('iPortrait'), pctx = pc.getContext('2d'), pose = c.alive ? c.pose || 0 : AW.POSE.SLEEP;
    const nf = AW.POSE_FRAMES[pose], fr = nf > 1 ? (this.g.renderer.frame >> 3) % nf : 0;
    pctx.imageSmoothingEnabled = false;
    pctx.clearRect(0, 0, 96, 72);
    pctx.drawImage(AW.Sprites.get(c, pose, fr, false), 0, 0, 96, 72);
    const parents = (c.parentIds || []).map(id => { const p = sim.creatures.find(o => o.id === id); return p ? p.name : '†'; });
    this.$('iBody').innerHTML = [
      ['Поза', c.alive ? AW.POSE_NAMES[pose] : 'мёртв'], ['Ноги', c.legN], ['Рога', c.horns > 0.15 ? 'есть' : 'нет'],
      ['Панцирь', c.armor > 0.6 ? 'с шипами' : c.armor > 0.25 ? 'есть' : 'нет'],
      ['Родители', parents.length ? parents.join(' + ') : 'основатель'],
    ].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    this.$('iThought').textContent = this.thought(c);
    this.$('iE').style.width = (c.energy / c.maxE * 100).toFixed(0) + '%';
    this.$('iH').style.width = Math.max(0, c.hp).toFixed(0) + '%';
    const days = (c.age / AW.DAY_LEN).toFixed(1), maxd = (c.maxAge / AW.DAY_LEN).toFixed(0);
    let memN = 0;
    for (let k = 0; k < c.M; k++) if (c.mem[k * 4 + 3] > 0.05) memN++;
    this.$('iKv').innerHTML = [
      ['Возраст', `${days} из ${maxd} дн.`], ['Детей', c.kids], ['Убил', c.kills],
      ['Съедено', c.eaten.toFixed(0)], ['Выучено (сила)', c.learned.toFixed(1)],
      ['Воспоминаний', `${memN}/${c.M}`], ['Нейронов', `${c.H} (+${c.C} рекуррентн.)`],
      ['Яд / болезнь', `${c.toxin.toFixed(2)} / ${c.disease ? 'да' : 'нет'}`],
    ].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    this.$('iGenes').innerHTML = AW.LOCI.filter(l => l.key !== 'hue').map(l => {
      const v = AW.genomeGet(c.genome, l.key);
      return `<span>${l.name}</span><span>${l.int ? v : l.key === 'diet' ? Math.round(v * 100) + '%' : v.toFixed(2)}</span>`;
    }).join('');
    this.$('iFollow').textContent = this.g.follow ? '🎥 Не следить' : '🎥 Следить';
    this.drawBrain(c);
    void sim;
  }

  drawBrain(c) {
    const cv = this.brainCanvas;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth * dpr, H = cv.clientHeight * dpr;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d'), B = AW.BR, b = c.brain, p = c.plastic;
    ctx.clearRect(0, 0, W, H);
    const NI = AW.N_IN, NO = AW.N_OUT, Hn = c.H;
    const xi = W * 0.06, xh = W * 0.42, xo = W * 0.66;
    const yi = k => H * 0.03 + k * (H * 0.94) / (NI - 1);
    const yh = k => H * 0.5 + (k - (Hn - 1) / 2) * Math.min(H * 0.07, H * 0.9 / Math.max(1, Hn));
    const yo = k => H * 0.06 + k * (H * 0.88) / (NO - 1);
    const col = (v, a) => v > 0 ? `rgba(60,255,140,${a})` : `rgba(255,70,70,${a})`;
    ctx.lineWidth = 1 * dpr;
    // вход → скрытый
    for (let h = 0; h < Hn; h++) for (let i = 0; i < NI; i++) {
      const w = b[B.W1 + h * B.IW + i], s = w * c.inp[i];
      if (Math.abs(s) < 0.15) continue;
      ctx.strokeStyle = col(s, Math.min(0.8, Math.abs(s) * 0.6));
      ctx.beginPath(); ctx.moveTo(xi, yi(i)); ctx.lineTo(xh, yh(h)); ctx.stroke();
    }
    // скрытый → выход
    for (let o = 0; o < NO; o++) for (let h = 0; h < Hn; h++) {
      const w = b[B.W2 + o * AW.MAX_H + h] + p[B.P_W2 + o * AW.MAX_H + h], s = w * c.hid[h];
      if (Math.abs(s) < 0.1) continue;
      ctx.strokeStyle = col(s, Math.min(0.8, Math.abs(s) * 0.7));
      ctx.beginPath(); ctx.moveTo(xh, yh(h)); ctx.lineTo(xo, yo(o)); ctx.stroke();
    }
    // рефлексы (сильнейшие прямые связи) — пунктир
    ctx.setLineDash([2 * dpr, 3 * dpr]);
    for (let o = 0; o < NO; o++) for (let i = 1; i < NI; i++) {
      const w = b[B.WS + o * NI + i] + p[B.P_WS + o * NI + i], s = w * c.inp[i];
      if (Math.abs(s) < 0.5) continue;
      ctx.strokeStyle = col(s, Math.min(0.5, Math.abs(s) * 0.25));
      ctx.beginPath(); ctx.moveTo(xi, yi(i)); ctx.lineTo(xo, yo(o)); ctx.stroke();
    }
    ctx.setLineDash([]);
    const node = (x, y, v, r) => {
      ctx.fillStyle = v > 0 ? `rgb(${40 + v * 200 | 0},${120 + v * 135 | 0},${90})` : `rgb(${120 - v * 135 | 0},${40},${50})`;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (let i = 0; i < NI; i++) node(xi, yi(i), AW.clamp(c.inp[i], -1, 1), 2.2 * dpr);
    for (let h = 0; h < Hn; h++) node(xh, yh(h), c.hid[h], 4 * dpr);
    ctx.font = `${10 * dpr}px 'Pixelify Sans', monospace`;
    ctx.textBaseline = 'middle';
    for (let o = 0; o < NO; o++) {
      const v = c.out[o];
      node(xo, yo(o), v, 4 * dpr);
      ctx.fillStyle = v > 0.3 ? '#ffffff' : '#7777aa';
      ctx.fillText(`${AW.OUT_NAMES[o]} ${v > 0 ? '+' : ''}${v.toFixed(2)}`, xo + 8 * dpr, yo(o));
    }
    // почему: какие входы сильнее всего толкают главное действие
    let bo = 0;
    for (let o = 2; o < NO; o++) if (c.out[o] > c.out[bo] || bo < 2) bo = o;
    const contrib = [];
    for (let i = 1; i < NI; i++) {
      const w = b[B.WS + bo * NI + i] + p[B.P_WS + bo * NI + i];
      contrib.push([AW.IN_NAMES[i], w * c.inp[i]]);
    }
    contrib.sort((a, b2) => Math.abs(b2[1]) - Math.abs(a[1]));
    this.$('iWhy').innerHTML = `Желание «${AW.OUT_NAMES[bo]}» сильнее всего зависит от: ` +
      contrib.slice(0, 3).map(([n, v]) => `<b style="color:${v > 0 ? '#3dff8c' : '#ff5a5a'}">${n}</b>`).join(', ');
  }

  // ---------- статистика ----------
  updateStats(force) {
    if (this.activeTab !== 'stats' && !force) return;
    const sim = this.g.sim, st = sim.stats;
    const live = sim.creatures;
    let H = 0, L = 0, M = 0;
    for (const c of live) { H += c.H; L += c.lr; M += c.M; }
    const n = Math.max(1, live.length);
    const allSp = [...sim.species.values()];
    this.$('statCards').innerHTML = [
      ['Рождений', st.births], ['Смертей', st.deaths], ['Съедено хищниками', st.eaten],
      ['Умерли от голода', st.starved], ['От старости', st.old], ['Макс. поколение', st.maxGen],
      ['Видов за историю', sim.nextSpeciesId - 1], ['Ср. нейронов', (H / n).toFixed(1)],
      ['Ср. обучаемость', (L / n * 1000).toFixed(0)], ['Ср. память', (M / n).toFixed(1)],
    ].map(([k, v]) => `<div>${k}: <b>${v}</b></div>`).join('');

    allSp.sort((a, b) => (b.count > 0) - (a.count > 0) || b.count - a.count || b.extinct - a.extinct);
    this.$('speciesList').innerHTML = allSp.slice(0, 60).map(s =>
      `<div class="sp-row ${s.count > 0 ? '' : 'dead'}" data-id="${s.id}"><div class="sw" style="background:hsl(${s.hue | 0},70%,58%)"></div>` +
      `<div>${s.count > 0 ? '' : '☠ '}${s.name} <small>${AW.dietLabel(s.ref[AW.G.diet])}${s.parent ? ' ← ' + (sim.species.get(s.parent) || { name: '?' }).name : ''}</small></div>` +
      `<div>${s.count > 0 ? s.count : 'пик ' + s.peak}</div></div>`).join('');
    if (!this.spBound) {
      this.spBound = true;
      this.$('speciesList').addEventListener('click', e => {
        const row = e.target.closest('.sp-row');
        if (!row) return;
        const id = +row.dataset.id, members = this.g.sim.creatures.filter(c => c.species && c.species.id === id);
        if (members.length) { const c = members[(Math.random() * members.length) | 0]; this.g.select(c); this.g.centerOn(c); }
      });
    }
    this.$('eventList').innerHTML = sim.events.slice().reverse().slice(0, 60).map(e =>
      `<div class="ev"><i>д.${Math.floor(e.tick / AW.DAY_LEN) + 1}</i> ${e.html}</div>`).join('');
    this.drawChart();
  }

  drawChart() {
    const cv = this.$('chart'), sim = this.g.sim, dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth * dpr, H = cv.clientHeight * dpr;
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d'), hist = sim.history;
    ctx.clearRect(0, 0, W, H);
    if (hist.length < 2) { ctx.fillStyle = '#7777aa'; ctx.font = `${12 * dpr}px monospace`; ctx.fillText('Данные копятся…', 10, 20 * dpr); return; }
    let max = 1;
    for (const h of hist) max = Math.max(max, h.total);
    const top = [...sim.species.values()].filter(s => s.count > 0).sort((a, b) => b.count - a.count).slice(0, 7);
    const X = k => (k / (hist.length - 1)) * (W - 4) + 2, Y = v => H - 3 - (v / max) * (H - 8);
    const line = (get, color, w) => {
      ctx.strokeStyle = color; ctx.lineWidth = w * dpr; ctx.beginPath();
      hist.forEach((h, k) => { const v = get(h); k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)); });
      ctx.stroke();
    };
    line(h => h.total, 'rgba(255,255,255,0.8)', 2);
    for (const s of top) line(h => h.counts[s.id] || 0, `hsl(${s.hue | 0},75%,60%)`, 1.5);
    ctx.fillStyle = '#aaaacc'; ctx.font = `${10 * dpr}px monospace`;
    ctx.fillText(`макс ${max}`, 4, 11 * dpr);
  }
};
