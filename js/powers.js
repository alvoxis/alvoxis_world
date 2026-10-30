// Инструменты бога: кисти ландшафта, заселение, силы.
AW.TOOLS = {
  // ландшафт
  t_deep:     { tab: 'terrain', icon: '🌊', name: 'Глубина', terrain: AW.T.DEEP },
  t_water:    { tab: 'terrain', icon: '💧', name: 'Вода', terrain: AW.T.WATER },
  t_sand:     { tab: 'terrain', icon: '🏖️', name: 'Песок', terrain: AW.T.SAND },
  t_grass:    { tab: 'terrain', icon: '🌱', name: 'Трава', terrain: AW.T.GRASS },
  t_forest:   { tab: 'terrain', icon: '🌲', name: 'Лес', terrain: AW.T.FOREST },
  t_dirt:     { tab: 'terrain', icon: '🟫', name: 'Земля', terrain: AW.T.DIRT },
  t_hills:    { tab: 'terrain', icon: '⛰️', name: 'Холмы', terrain: AW.T.HILLS },
  t_mountain: { tab: 'terrain', icon: '🗻', name: 'Горы', terrain: AW.T.MOUNTAIN },
  t_snow:     { tab: 'terrain', icon: '❄️', name: 'Снег', terrain: AW.T.SNOW },
  t_lava:     { tab: 'terrain', icon: '🌋', name: 'Лава', terrain: AW.T.LAVA },
  t_poison:   { tab: 'terrain', icon: '🍄', name: 'Ядовитые растения', brush: 'poison' },
  t_cure:     { tab: 'terrain', icon: '🌿', name: 'Убрать яд', brush: 'cure' },
  // силы
  p_meteor:   { tab: 'powers', icon: '☄️', name: 'Метеорит', once: true },
  p_lightning:{ tab: 'powers', icon: '⚡', name: 'Молния', once: true },
  p_fire:     { tab: 'powers', icon: '🔥', name: 'Пожар' },
  p_rain:     { tab: 'powers', icon: '🌧️', name: 'Дождь (рост растений)' },
  p_drought:  { tab: 'powers', icon: '☀️', name: 'Засуха' },
  p_plague:   { tab: 'powers', icon: '🦠', name: 'Чума' },
  p_bless:    { tab: 'powers', icon: '✨', name: 'Благословение (лечит и кормит)' },
  p_mutagen:  { tab: 'powers', icon: '🧪', name: 'Мутаген (сильные мутации)', once: true },
  p_wisdom:   { tab: 'powers', icon: '🧠', name: 'Мудрость (больше нейронов)', once: true },
  p_meat:     { tab: 'powers', icon: '🍖', name: 'Подбросить мяса' },
  p_quake:    { tab: 'powers', icon: '💥', name: 'Землетрясение', once: true },
  p_erase:    { tab: 'powers', icon: '🧹', name: 'Убрать существ' },
};

AW.creaturesIn = function (sim, x, y, r) {
  const res = [], r2 = r * r;
  for (const c of sim.creatures) {
    if (!c.alive) continue;
    const dx = c.x - x, dy = c.y - y;
    if (dx * dx + dy * dy <= r2) res.push(c);
  }
  return res;
};

AW.forTiles = function (w, x, y, r, fn) {
  const r2 = r * r;
  for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++)
    for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
      const dx = xx + 0.5 - x, dy = yy + 0.5 - y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const i = w.at(xx, yy);
      if (i >= 0) fn(i, Math.sqrt(d2) / Math.max(r, 0.5), xx, yy);
    }
};

// Применить инструмент. fx — эффекты для отрисовки (частицы, вспышки)
AW.applyTool = function (sim, toolId, x, y, brush, fx) {
  const tool = AW.TOOLS[toolId], w = sim.world, r = brush;
  if (!tool) return;
  if (tool.terrain !== undefined) {
    AW.forTiles(w, x, y, r, i => w.setTile(i, tool.terrain));
    return;
  }
  switch (toolId) {
    case 't_poison': AW.forTiles(w, x, y, r, i => { w.tox[i] = 1; }); w.dirty = true; break;
    case 't_cure': AW.forTiles(w, x, y, r, i => { w.tox[i] = 0; }); w.dirty = true; break;
    case 'p_meteor': {
      const R = Math.max(3, r * 1.4);
      AW.forTiles(w, x, y, R, (i, d) => {
        if (d < 0.35) w.setTile(i, AW.T.LAVA);
        else if (d < 0.75) { w.setTile(i, Math.random() < 0.5 ? AW.T.MOUNTAIN : AW.T.ASH); w.veg[i] = 0; }
        else w.ignite(i);
      });
      for (const c of AW.creaturesIn(sim, x, y, R * 1.1)) sim.kill(c, 'погиб от метеорита');
      fx.explode(x, y, R, '#ff8a2a');
      fx.shake = 12;
      sim.log('☄️ Упал метеорит!', 'power');
      break;
    }
    case 'p_lightning': {
      AW.forTiles(w, x, y, 1.5, i => w.ignite(i));
      for (const c of AW.creaturesIn(sim, x, y, 2)) sim.kill(c, 'погиб от молнии');
      fx.bolt(x, y);
      break;
    }
    case 'p_fire': AW.forTiles(w, x, y, r, i => { if (Math.random() < 0.3) w.ignite(i); }); break;
    case 'p_rain':
      AW.forTiles(w, x, y, r, i => {
        const cap = AW.TERRAIN[w.t[i]].cap;
        w.veg[i] = Math.min(cap, w.veg[i] + cap * 0.08);
        w.fire[i] = 0;
        if (w.t[i] === AW.T.ASH || (w.t[i] === AW.T.DIRT && Math.random() < 0.02)) w.t[i] = w.t[i] === AW.T.ASH ? AW.T.DIRT : AW.T.GRASS;
        if (w.t[i] === AW.T.LAVA && Math.random() < 0.05) w.t[i] = AW.T.MOUNTAIN;
      });
      w.dirty = true;
      fx.rain(x, y, r);
      break;
    case 'p_drought':
      AW.forTiles(w, x, y, r, i => { w.veg[i] *= 0.9; if (w.t[i] === AW.T.WATER && Math.random() < 0.01) w.t[i] = AW.T.SAND; });
      w.dirty = true;
      break;
    case 'p_plague':
      for (const c of AW.creaturesIn(sim, x, y, r)) if (Math.random() < 0.3) c.disease = 1;
      fx.puff(x, y, r, '#8bd450');
      break;
    case 'p_bless':
      for (const c of AW.creaturesIn(sim, x, y, r)) { c.hp = 100; c.energy = c.maxE; c.disease = 0; c.toxin = 0; }
      fx.puff(x, y, r, '#ffe680');
      break;
    case 'p_mutagen': {
      let n = 0;
      for (const c of AW.creaturesIn(sim, x, y, Math.max(2, r))) {
        AW.mutateGenome(c.genome, sim.rng, 6);
        AW.mutateBrain(c.brain, 0.5, sim.rng);
        const oldM = c.M;
        c.express();
        if (c.M !== oldM) { const m = new Float32Array(Math.max(1, c.M) * 4); m.set(c.mem.subarray(0, Math.min(c.mem.length, m.length))); c.mem = m; }
        n++;
      }
      fx.puff(x, y, Math.max(2, r), '#d070ff');
      if (n) sim.log(`🧪 Мутаген изменил ${n} существ`, 'power');
      break;
    }
    case 'p_wisdom': {
      let n = 0;
      for (const c of AW.creaturesIn(sim, x, y, Math.max(2, r))) {
        const g = c.genome;
        g[AW.G.hidden] = Math.min(12, g[AW.G.hidden] + 2);
        g[AW.G.context] = Math.min(4, g[AW.G.context] + 1);
        g[AW.G.learn] = Math.min(0.08, g[AW.G.learn] + 0.015);
        g[AW.G.memory] = Math.min(8, g[AW.G.memory] + 2);
        c.express();
        const m = new Float32Array(Math.max(1, c.M) * 4); m.set(c.mem.subarray(0, Math.min(c.mem.length, m.length))); c.mem = m;
        n++;
      }
      fx.puff(x, y, Math.max(2, r), '#7fd8ff');
      if (n) sim.log(`🧠 ${n} существ стали умнее`, 'power');
      break;
    }
    case 'p_meat': AW.forTiles(w, x, y, r, i => { w.meat[i] = Math.min(20, w.meat[i] + 0.5); }); break;
    case 'p_quake': {
      const R = Math.max(4, r * 2);
      const order = [AW.T.DEEP, AW.T.WATER, AW.T.SAND, AW.T.GRASS, AW.T.HILLS, AW.T.MOUNTAIN];
      AW.forTiles(w, x, y, R, i => {
        if (Math.random() < 0.35) {
          const k = order.indexOf(w.t[i]);
          if (k >= 0) w.setTile(i, order[AW.clamp(k + (Math.random() < 0.5 ? -1 : 1), 0, order.length - 1)]);
        }
      });
      for (const c of AW.creaturesIn(sim, x, y, R)) sim.hurt(c, 25 * Math.random(), 'погиб при землетрясении');
      fx.shake = 20;
      sim.log('💥 Землетрясение!', 'power');
      break;
    }
    case 'p_erase': for (const c of AW.creaturesIn(sim, x, y, r)) sim.kill(c, 'стёрт богом'); break;
  }
};
