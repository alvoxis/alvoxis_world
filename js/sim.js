// Симуляция: существа, их органы чувств, действия, метаболизм, размножение и смерть.
AW.Creature = class {
  constructor(sim, genome, brain, x, y) {
    this.id = sim.nextId++;
    this.name = AW.makeName(sim.rng);
    this.genome = genome;
    this.brain = brain;
    this.plastic = new Float32Array(AW.BR.P_SIZE);
    this.inp = new Float32Array(AW.N_IN);
    this.ctx = new Float32Array(AW.MAX_C);
    this.hid = new Float32Array(AW.MAX_H);
    this.out = new Float32Array(AW.N_OUT);
    this.x = x; this.y = y;
    this.dir = sim.rng() * Math.PI * 2;
    this.express();
    this.mem = new Float32Array(Math.max(1, this.M) * 4);
    this.energy = this.maxE * 0.5;
    this.hp = 100;
    this.age = 0;
    this.gen = 0;
    this.kids = 0; this.kills = 0; this.eaten = 0; this.learned = 0;
    this.toxin = 0; this.disease = 0;
    this.pain = 0; this.painIn = 0; this.gain = 0; this.reward = 0;
    this.mateCd = 0; this.atkCd = 0;
    this.callAmp = 0; this.callPitch = 0;
    this.alive = true;
    this.sex = sim.rng() < 0.5 ? 0 : 1; // 0 — самка, 1 — самец (идея EcoSim)
    this.pose = 0;
    this.species = null;
    this.parentIds = null;
    this.kin = null; this.oth = null; this.kinD = 0; this.othD = 0;
    this.action = '';
    this.cause = '';
  }

  // генотип → фенотип
  express() {
    const g = this.genome, get = k => AW.genomeGet(g, k);
    this.size = get('size'); this.speed = get('speed'); this.sense = get('sense'); this.diet = get('diet');
    this.H = get('hidden'); this.C = get('context'); this.lr = get('learn'); this.M = get('memory');
    this.swim = get('swim'); this.cold = get('cold'); this.immunity = get('immunity');
    this.invest = get('invest');
    // органы тела
    this.legs = get('legs'); this.legN = [0, 2, 4, 6][this.legs];
    this.horns = get('horns'); this.armor = get('armor'); this.tail = get('tail'); this.ears = get('ears');
    this.coop = get('coop');
    this.landMul = [0.55, 0.9, 1, 1.08][this.legs] * (1 - this.armor * 0.3);
    this.turnMul = 0.8 + this.tail * 0.4;
    this.maxE = 100 * this.size;
    this.maxAge = Math.round(4200 * get('lifespan') * (0.75 + 0.25 * this.size));
    this.mature = this.maxAge * 0.12;
    this.upkeep = 0.028 * Math.pow(this.size, 0.75) + 0.0025 * this.H + 0.0015 * this.C + 0.004 * this.M +
      0.0012 * this.sense + 0.005 * this.cold + 0.004 * this.immunity + 0.02 * this.lr + 0.006 * this.speed +
      0.0015 * this.legN + 0.006 * this.horns + 0.008 * this.armor + 0.002 * this.tail + 0.003 * this.ears + 0.003 * this.coop;
  }
};

AW.Sim = class {
  constructor(opts) {
    this.opts = opts;
    const sz = AW.WORLD_SIZES[opts.size] || AW.WORLD_SIZES.medium;
    this.seed = opts.seed >>> 0;
    this.rng = AW.makeRng(this.seed ^ 0x9e3779b9);
    this.world = new AW.World(sz.w, sz.h);
    this.world.generate(this.seed, opts.shape || 'continent');
    this.creatures = [];
    this.born = [];
    this.species = new Map();
    this.tick = 0;
    this.nextId = 1;
    this.nextSpeciesId = 1;
    this.events = [];
    this.eventSeq = 0;
    this.history = [];
    this.stats = { births: 0, deaths: 0, kills: 0, maxGen: 0, starved: 0, eaten: 0, old: 0 };
    this.presetSpecies = {};
    this.cell = 8;
    this.gw = Math.ceil(sz.w / this.cell); this.gh = Math.ceil(sz.h / this.cell);
    this.cellStart = new Int32Array(this.gw * this.gh + 1);
    this.cellItems = [];
    this._rec = { here: 0, bf: 0, bs: 0, wf: 0, ws: 0 };
    if (opts.starters) {
      for (const [key, n] of Object.entries(opts.starters)) this.spawnPresetRandom(key, Math.round(n * sz.pop));
    }
  }

  log(html, type) {
    this.events.push({ seq: ++this.eventSeq, tick: this.tick, html, type: type || '' });
    if (this.events.length > 120) this.events.shift();
  }

  get light() { return Math.cos((this.tick % AW.DAY_LEN) / AW.DAY_LEN * Math.PI * 2); }
  get season() { return 0.8 + 0.35 * Math.sin(this.tick / AW.YEAR_LEN * Math.PI * 2); }
  get seasonName() {
    const p = ((this.tick / AW.YEAR_LEN) % 1 + 1) % 1;
    return ['Весна', 'Лето', 'Осень', 'Зима'][(p * 4) | 0];
  }

  // может ли существо стоять на клетке
  moveFactor(c, i) {
    if (i < 0) return 0;
    const t = this.world.t[i], T = AW.T;
    if (t === T.DEEP) return c.swim > 0.5 ? c.swim : 0;
    if (t === T.WATER) return 0.25 + c.swim * 0.9;
    const m = AW.TERRAIN[t].move * c.landMul;
    return c.swim > 0.6 ? m * (1.3 - c.swim * 0.7) : m;
  }

  okSpawnTile(c, x, y) {
    const i = this.world.at(x, y);
    if (i < 0) return false;
    const t = this.world.t[i];
    if (t === AW.T.LAVA) return false;
    if (c.swim > 0.6) return t === AW.T.WATER || t === AW.T.SAND || t === AW.T.DEEP;
    return this.moveFactor(c, i) > 0.3 && t !== AW.T.WATER;
  }

  ensureSpecies(key) {
    const sp = this.presetSpecies[key];
    if (sp && this.species.has(sp.id) && !sp.extinct) return sp;
    return null;
  }

  makeFounder(g, speciesObj, x, y) {
    const genome = AW.genomeFrom(g);
    AW.mutateGenome(genome, this.rng, 0.5);
    const brain = AW.newBrain(this.rng, genome[AW.G.diet]);
    const c = new AW.Creature(this, genome, brain, x, y);
    c.energy = c.maxE * 0.7;
    c.age = (this.rng() * c.maxAge * 0.3) | 0;
    return c;
  }

  // Заселить вид из пресета/конструктора. Возвращает число созданных существ.
  spawnGroup(key, g, name, cx, cy, n, radius) {
    let sp = key ? this.ensureSpecies(key) : null;
    let made = 0;
    for (let k = 0; k < n * 20 && made < n; k++) {
      if (this.creatures.length + this.born.length >= AW.MAX_POP) break;
      const x = cx + (this.rng() - 0.5) * 2 * radius, y = cy + (this.rng() - 0.5) * 2 * radius;
      const c = this.makeFounder(g, sp, x, y);
      if (!this.okSpawnTile(c, x, y)) continue;
      if (!sp) {
        sp = new AW.Species(this, c.genome, c.brain, name);
        sp.hue = g.hue;
        this.species.set(sp.id, sp);
        if (key) this.presetSpecies[key] = sp;
        this.log(`✨ Заселён вид <b style="color:hsl(${sp.hue | 0},70%,65%)">${sp.name}</b>`, 'spawn');
      }
      c.genome[AW.G.hue] = (sp.hue + (this.rng() - 0.5) * 8 + 360) % 360;
      c.species = sp;
      sp.count++; sp.total++;
      this.creatures.push(c);
      made++;
    }
    return made;
  }

  spawnPresetRandom(key, n) {
    const P = AW.PRESETS[key];
    const w = this.world;
    // ищем подходящие точки по всей карте, группами по 6
    let left = n, tries = 0;
    while (left > 0 && tries++ < 400) {
      const x = this.rng() * w.w, y = this.rng() * w.h;
      const probe = this.makeFounder(P.g, null, x, y);
      if (!this.okSpawnTile(probe, x, y)) continue;
      left -= this.spawnGroup(key, P.g, P.name, x, y, Math.min(6, left), 4);
    }
  }

  buildGrid() {
    const cs = this.cell, gw = this.gw, start = this.cellStart, list = this.creatures;
    start.fill(0);
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      const cx = AW.clamp((c.x / cs) | 0, 0, gw - 1), cy = AW.clamp((c.y / cs) | 0, 0, this.gh - 1);
      c.cell = cy * gw + cx;
      start[c.cell + 1]++;
    }
    for (let i = 1; i < start.length; i++) start[i] += start[i - 1];
    const fill = start.slice(), items = this.cellItems;
    items.length = list.length;
    for (let k = 0; k < list.length; k++) items[fill[list[k].cell]++] = list[k];
  }

  // Органы чувств: заполнить входы нейросети
  sense(c) {
    const w = this.world, inp = c.inp, I = AW.IN;
    const cs = Math.cos(c.dir), sn = Math.sin(c.dir);
    const i = w.at(c.x, c.y);
    c.tile = i;
    const vh = i >= 0 ? w.veg[i] : 0, mh = i >= 0 ? w.meat[i] : 0;
    inp[I.Bias] = 1;
    inp[I.Energy] = c.energy / c.maxE;
    inp[I.Health] = c.hp / 100;
    inp[I.Age] = c.age / c.maxAge;
    const ax = c.x + cs * 2, ay = c.y + sn * 2;
    const la = c.dir - 0.8, ra = c.dir + 0.8;
    const lx = c.x + Math.cos(la) * 2.5, ly = c.y + Math.sin(la) * 2.5, rx = c.x + Math.cos(ra) * 2.5, ry = c.y + Math.sin(ra) * 2.5;
    inp[I.FoodHere] = vh / 1.6;
    inp[I.FoodFwd] = AW.clamp((w.sampleVeg(ax, ay) - vh) * 2, -1, 1);
    inp[I.FoodSide] = AW.clamp((w.sampleVeg(rx, ry) - w.sampleVeg(lx, ly)) * 2, -1, 1);
    inp[I.MeatHere] = Math.min(1, mh / 3);
    inp[I.MeatFwd] = AW.clamp((w.sampleMeat(ax, ay) - mh) / 2, -1, 1);
    const ml = w.sampleMeat(lx, ly) + w.sampleMeat(c.x + Math.cos(la) * 5, c.y + Math.sin(la) * 5);
    const mr = w.sampleMeat(rx, ry) + w.sampleMeat(c.x + Math.cos(ra) * 5, c.y + Math.sin(ra) * 5);
    inp[I.MeatSide] = AW.clamp((mr - ml) / 2, -1, 1);
    const ai = w.at(c.x + cs * 1.5, c.y + sn * 1.5);
    let obst = this.moveFactor(c, ai) < 0.3 ? 1 : 0;
    if (ai >= 0 && (w.fire[ai] > 0 || w.t[ai] === AW.T.LAVA)) obst = 1;
    if (c.swim > 0.6 && ai >= 0 && !AW.TERRAIN[w.t[ai]].water && w.t[ai] !== AW.T.SAND) obst = 0.5;
    inp[I.Obstacle] = obst;
    inp[I.Water] = i >= 0 ? (AW.TERRAIN[w.t[i]].water || 0) / 2 : 0;

    // соседи и звуки
    const R = c.sense, R2 = R * R, HR = R * (0.8 + c.ears * 1.2), HR2 = HR * HR, csz = this.cell;
    const x0 = Math.max(0, ((c.x - HR) / csz) | 0), x1 = Math.min(this.gw - 1, ((c.x + HR) / csz) | 0);
    const y0 = Math.max(0, ((c.y - HR) / csz) | 0), y1 = Math.min(this.gh - 1, ((c.y + HR) / csz) | 0);
    let kin = null, kd = R2, oth = null, od = R2, crowd = 0, hear = null, hl = 0;
    const items = this.cellItems, start = this.cellStart, sp = c.species;
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const cell = gy * this.gw + gx;
      for (let k = start[cell], e = start[cell + 1]; k < e; k++) {
        const o = items[k];
        if (o === c || !o.alive) continue;
        const dx = o.x - c.x, dy = o.y - c.y, d2 = dx * dx + dy * dy;
        if (o.callAmp > 0 && d2 < HR2) {
          const l = o.callAmp * (1 - Math.sqrt(d2) / HR);
          if (l > hl) { hl = l; hear = o; }
        }
        if (d2 >= R2) continue;
        if (d2 < 9) {
          crowd++;
          if (o.disease > 0 && c.disease === 0 && d2 < 2.25 && this.rng() < 0.02 * (1 - c.immunity)) c.disease = 1;
        }
        if (o.species === sp) { if (d2 < kd) { kd = d2; kin = o; } }
        else if (d2 < od) { od = d2; oth = o; }
      }
    }
    c.kin = kin; c.oth = oth;
    if (kin) {
      const d = Math.sqrt(kd) + 0.001, dx = kin.x - c.x, dy = kin.y - c.y;
      c.kinD = d;
      inp[I.KinFwd] = (dx * cs + dy * sn) / d;
      inp[I.KinSide] = (-dx * sn + dy * cs) / d;
      inp[I.KinNear] = 1 - d / R;
      inp[I.KinMate] = kin.out[AW.OUT.Mate] > 0.3 ? 1 : 0;
    } else { c.kinD = 0; inp[I.KinFwd] = inp[I.KinSide] = inp[I.KinNear] = inp[I.KinMate] = 0; }
    if (oth) {
      const d = Math.sqrt(od) + 0.001, dx = oth.x - c.x, dy = oth.y - c.y;
      c.othD = d;
      inp[I.OthFwd] = (dx * cs + dy * sn) / d;
      inp[I.OthSide] = (-dx * sn + dy * cs) / d;
      inp[I.OthNear] = 1 - d / R;
      inp[I.OthSize] = AW.fastTanh(Math.log(oth.size / c.size) * 1.5);
      inp[I.OthDiet] = oth.diet;
      inp[I.OthAttack] = oth.out[AW.OUT.Attack] > 0.3 ? 1 : 0;
    } else {
      c.othD = 0;
      inp[I.OthFwd] = inp[I.OthSide] = inp[I.OthNear] = inp[I.OthSize] = inp[I.OthDiet] = inp[I.OthAttack] = 0;
    }
    inp[I.Crowd] = Math.min(1, crowd / 6);
    if (hear) {
      const dx = hear.x - c.x, dy = hear.y - c.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      inp[I.HearLoud] = hl; inp[I.HearPitch] = hear.callPitch; inp[I.HearSide] = (-dx * sn + dy * cs) / d;
    } else { inp[I.HearLoud] = inp[I.HearPitch] = inp[I.HearSide] = 0; }

    c.painIn = Math.max(c.pain, c.painIn * 0.9);
    inp[I.Pain] = Math.min(1, c.painIn);
    inp[I.Reward] = c.reward;
    const rec = this._rec;
    AW.memRecall(c, rec);
    inp[I.MemHere] = rec.here; inp[I.MemBestFwd] = rec.bf; inp[I.MemBestSide] = rec.bs;
    inp[I.MemWorstFwd] = rec.wf; inp[I.MemWorstSide] = rec.ws;
    inp[I.Flora] = i >= 0 && w.tox[i] && vh > 0.15 ? 1 : 0;
    inp[I.Toxin] = AW.fastTanh(c.toxin);
    inp[I.Light] = this.light;
    let clim = 0;
    if (i >= 0) {
      const t = w.t[i];
      if (t === AW.T.SNOW) clim = -(1 - c.cold);
      else if (t === AW.T.LAVA || w.fire[i] > 0) clim = 1;
    }
    inp[I.Climate] = clim;
    inp[I.Noise] = this.rng() * 2 - 1;
  }

  act(c) {
    const w = this.world, O = AW.OUT, out = c.out, i = c.tile;
    c.pain = 0; c.gain = 0;
    const resting = out[O.Rest] > 0.5;
    let cost = c.upkeep * (resting ? 0.6 : 1);
    let label = resting ? 'Отдыхает' : 'Бродит';

    // движение
    if (!resting) {
      c.dir += out[O.Turn] * 0.3 * c.turnMul;
      const sprint = out[O.Sprint] > 0.5;
      let th = out[O.Thrust];
      if (th < 0) th *= 0.3;
      const mf = this.moveFactor(c, i);
      const spd = 0.075 * c.speed * th * (mf > 0 ? mf : 0.3) * (sprint ? 1.8 : 1);
      if (spd !== 0) {
        const nx = c.x + Math.cos(c.dir) * spd, ny = c.y + Math.sin(c.dir) * spd;
        const ni = w.at(nx, ny);
        if (this.moveFactor(c, ni) > 0) { c.x = nx; c.y = ny; }
        else c.dir += (this.rng() - 0.5) * 0.6;
        cost += Math.abs(spd) * 0.25 * Math.pow(c.size, 0.8) * (sprint ? 1.8 : 1);
        if (sprint) label = 'Бежит';
      }
    }

    // еда
    if (out[O.Eat] > 0 && i >= 0) {
      const herb = Math.pow(1 - c.diet, 0.75), carn = Math.pow(c.diet, 0.75);
      const v = w.veg[i];
      if (v > 0.02 && herb > 0.2) {
        const bite = Math.min(v, 0.05 * c.size);
        w.veg[i] -= bite;
        c.gain += bite * 9 * herb;
        if (w.tox[i]) c.toxin += bite * 1.5;
        label = 'Ест растения';
      }
      const m = w.meat[i];
      if (m > 0.02 && carn > 0.2) {
        const bite = Math.min(m, 0.25 * c.size);
        w.meat[i] -= bite;
        c.gain += bite * 12 * carn;
        label = 'Ест мясо';
      }
    }

    const kin = c.kin, oth = c.oth;
    // атака (на чужаков)
    if (c.atkCd > 0) c.atkCd--;
    else if (out[O.Attack] > 0.3 && oth && oth.alive && c.othD < 0.8 + (c.size + oth.size) * 0.3) {
      const dmg = 15 * Math.pow(c.size, 0.9) * (0.3 + c.diet) * (1 + c.horns * 0.8) * (out[O.Sprint] > 0.5 ? 1.2 : 1);
      this.hurt(oth, dmg / Math.pow(oth.size, 0.8), 'убит', c);
      c.atkCd = 10;
      cost += 0.2 * c.size;
      label = 'Атакует';
    }

    // делиться едой с сородичами
    if (out[O.Share] > 0.5 && kin && kin.alive && c.kinD < 2 && c.energy > c.maxE * 0.5 && kin.energy < kin.maxE) {
      c.energy -= 2; kin.energy += 1.6; kin.gain += 1.6;
      label = 'Делится едой';
    }

    // подражание: перенять выученное у более сытого сородича
    if (out[O.Imitate] > 0.5 && kin && (this.tick + c.id) % 20 === 0 && kin.energy / kin.maxE > c.energy / c.maxE) {
      AW.imitate(c, kin, 0.08);
      label = 'Подражает';
    }

    // зов
    if (out[O.Call] > 0.3) { c.callAmp = out[O.Call]; c.callPitch = out[O.Pitch]; cost += 0.01; label = 'Зовёт'; }
    else c.callAmp = 0;

    // размножение
    if (c.mateCd > 0) c.mateCd--;
    else if (out[O.Mate] > 0.3 && c.age > c.mature && c.energy > c.maxE * 0.55) {
      if (kin && kin.alive && kin.sex !== c.sex && c.kinD < 2.5 && kin.mateCd === 0 && kin.age > kin.mature &&
          kin.out[O.Mate] > 0.3 && kin.energy > kin.maxE * 0.45) {
        this.reproduce(c, kin);
        label = 'Размножается';
      } else if (c.energy > c.maxE * 0.88 && (!kin || c.kinD > 2.5)) {
        this.reproduce(c, null);
        label = 'Почкуется';
      } else label = 'Ищет пару';
    }

    // окружающая среда
    if (i >= 0) {
      const t = w.t[i];
      if (t === AW.T.SNOW) this.hurt(c, 0.12 * (1 - c.cold), 'замёрз');
      else if (t === AW.T.LAVA) this.hurt(c, 3, 'сгорел в лаве');
      if (w.fire[i] > 0) this.hurt(c, 2, 'сгорел');
      if (t === AW.T.DEEP && c.swim < 0.5) this.hurt(c, 0.6, 'утонул');
      if (c.swim > 0.75 && !AW.TERRAIN[t].water && t !== AW.T.SAND) cost += 0.05 * c.swim;
    }
    if (c.toxin > 0.01) { this.hurt(c, c.toxin * 0.025, 'отравился', null, true); c.toxin *= 0.997; }
    if (c.disease > 0) {
      this.hurt(c, 0.07, 'умер от болезни', null, true);
      cost += 0.03;
      if (this.rng() < 0.0015 * (1 + c.immunity * 4)) c.disease = 0;
    }

    // энергия и здоровье
    c.energy += c.gain - cost;
    c.eaten += c.gain;
    if (c.energy > c.maxE) c.energy = c.maxE;
    if (c.energy <= 0) { c.energy = 0; this.hurt(c, 0.35, 'умер от голода', null, true); }
    else if (c.hp < 100 && c.energy > c.maxE * 0.4) { c.hp = Math.min(100, c.hp + 0.12); c.energy -= 0.04; }

    // обучение и память
    c.reward = AW.clamp(c.gain * 0.12 - c.pain * 0.5, -1, 1);
    AW.learn(c, c.reward);
    if (c.M > 0 && (c.reward > AW.MEM_THRESHOLD || c.reward < -AW.MEM_THRESHOLD)) AW.memEncode(c, c.reward);

    c.age++;
    if (c.age > c.maxAge) this.kill(c, 'умер от старости');
    c.action = label;
    // поза для анимации: 0 стоит, 1 идёт, 2 бежит, 3 ест, 4 спит, 5 атакует
    c.pose = resting ? 4 : label === 'Атакует' ? 5 : label.startsWith('Ест') ? 3 : label === 'Бежит' ? 2 : out[O.Thrust] > 0.1 ? 1 : 0;
    if (label === 'Атакует') c.attackT = 8; else if (c.attackT > 0) { c.attackT--; c.pose = 5; }
  }

  hurt(c, dmg, cause, by, silent) {
    if (!c.alive) return;
    if (by) {
      dmg *= 1 - c.armor * 0.5;                                        // панцирь
      if (c.kin && c.kin.alive && c.kinD < 2.5) dmg *= 1 - c.coop * 0.35; // сородичи рядом
      if (c.horns > 0.3) by.hp -= c.horns * 2;                         // рога ранят нападающего
    }
    c.hp -= dmg;
    if (!silent) c.pain += dmg / 20;
    if (c.hp <= 0) {
      if (by) { by.kills++; this.stats.kills++; }
      this.kill(c, cause + (by ? ` (${by.species ? by.species.name : '?'})` : ''));
    }
  }

  kill(c, cause) {
    if (!c.alive) return;
    c.alive = false;
    c.cause = cause || 'погиб';
    const i = this.world.at(c.x, c.y);
    if (i >= 0) this.world.meat[i] = Math.min(20, this.world.meat[i] + 5 * c.size + c.energy * 0.06);
    this.stats.deaths++;
    if (cause && cause.startsWith('умер от голода')) this.stats.starved++;
    else if (cause && cause.startsWith('убит')) this.stats.eaten++;
    else if (cause && cause.startsWith('умер от старости')) this.stats.old++;
    if (c === this.selected) this.log(`💀 ${c.name} (${c.species ? c.species.name : ''}) — ${c.cause}`, 'death');
  }

  reproduce(a, b) {
    if (this.creatures.length + this.born.length >= AW.MAX_POP) { a.mateCd = 60; return; }
    const r = this.rng;
    let genome, brain;
    if (b) {
      genome = AW.crossGenome(a.genome, b.genome, r);
      brain = AW.crossBrain(a.brain, b.brain, r);
    } else {
      genome = Float32Array.from(a.genome);
      brain = Float32Array.from(a.brain);
    }
    AW.mutateGenome(genome, r, b ? 1 : 1.5);
    AW.mutateBrain(brain, genome[AW.G.mutation], r);
    const ang = r() * Math.PI * 2;
    const child = new AW.Creature(this, genome, brain, a.x + Math.cos(ang) * 0.5, a.y + Math.sin(ang) * 0.5);
    if (this.moveFactor(child, this.world.at(child.x, child.y)) <= 0) { child.x = a.x; child.y = a.y; }
    const ea = a.energy * a.invest, eb = b ? b.energy * b.invest : 0;
    a.energy -= ea; if (b) b.energy -= eb;
    child.energy = Math.min(child.maxE, (ea + eb) * 0.85);
    child.gen = Math.max(a.gen, b ? b.gen : 0) + 1;
    child.parentIds = b ? [a.id, b.id] : [a.id];
    a.kids++; if (b) b.kids++;
    a.mateCd = 180; if (b) b.mateCd = 180;
    child.species = AW.assignSpecies(this, child, a.species);
    child.species.count++;
    child.species.total++;
    if (child.gen > child.species.maxGen) child.species.maxGen = child.gen;
    if (child.gen > this.stats.maxGen) this.stats.maxGen = child.gen;
    this.stats.births++;
    this.born.push(child);
  }

  step() {
    this.tick++;
    this.world.update(this.tick, this.season);
    this.buildGrid();
    const list = this.creatures;
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (!c.alive) continue;
      this.sense(c);
      AW.think(c);
      this.act(c);
    }
    // уборка мёртвых и добавление новорождённых
    let j = 0;
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (c.alive) list[j++] = c;
      else if (c.species) c.species.count--;
    }
    list.length = j;
    for (const c of this.born) list.push(c);
    this.born.length = 0;
    if (this.tick % 30 === 0) this.bookkeeping();
  }

  bookkeeping() {
    for (const sp of this.species.values()) {
      if (sp.count > sp.peak) sp.peak = sp.count;
      if (sp.count <= 0 && !sp.extinct) {
        sp.extinct = this.tick;
        sp.count = 0;
        if (sp.total > 3) this.log(`☠️ Вид <b style="color:hsl(${sp.hue | 0},70%,65%)">${sp.name}</b> вымер (жил ${Math.round((this.tick - sp.born) / AW.DAY_LEN)} дн., пик ${sp.peak})`, 'extinct');
      }
    }
    // забываем мелкие вымершие ветви
    if (this.species.size > 150) {
      for (const [id, sp] of this.species) if (sp.extinct && sp.peak < 6) this.species.delete(id);
    }
    if (this.tick % 120 === 0) {
      const counts = {};
      for (const sp of this.species.values()) if (sp.count > 0) counts[sp.id] = sp.count;
      this.history.push({ t: this.tick, total: this.creatures.length, counts });
      if (this.history.length > 400) this.history.splice(0, this.history.length - 400);
    }
  }
};
