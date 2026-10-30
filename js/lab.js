// Лаборатория: проверка наследования (используется и в игре, и в node-тестах) и демо одного существа.
AW.Lab = {
  // Скрещивание с подробностями: откуда взят каждый ген потомка
  breedExplain(sim, a, b) {
    const r = sim.rng;
    const crossed = AW.crossGenome(a.genome, b.genome, r);
    const genome = Float32Array.from(crossed);
    AW.mutateGenome(genome, r, 1);
    const origin = [];
    for (let i = 0; i < AW.NL; i++) {
      const eq = (x, y) => Math.abs(x - y) < 1e-4;
      let o = eq(crossed[i], a.genome[i]) ? 'A' : eq(crossed[i], b.genome[i]) ? 'B' : 'среднее';
      if (eq(a.genome[i], b.genome[i]) && o !== 'среднее') o = 'A=B';
      if (!eq(genome[i], crossed[i])) o += ' + мутация';
      origin.push(o);
    }
    const brain = AW.crossBrain(a.brain, b.brain, r);
    AW.mutateBrain(brain, genome[AW.G.mutation], r);
    return { genome, brain, origin };
  },

  randomGenome(r) {
    const g = new Float32Array(AW.NL);
    for (let i = 0; i < AW.NL; i++) { const l = AW.LOCI[i]; g[i] = l.min + r() * (l.max - l.min); if (l.int) g[i] = Math.round(g[i]); }
    g[AW.G.mutation] = 0.06;
    return g;
  },

  makeLabSim() {
    return new AW.Sim({ size: 'small', shape: 'continent', seed: 4242, starters: {} });
  },

  // Найти точку суши для существа
  landSpot(sim, c) {
    for (let k = 0; k < 5000; k++) {
      const x = sim.rng() * sim.world.w, y = sim.rng() * sim.world.h;
      if (sim.okSpawnTile(c, x, y)) return { x, y };
    }
    return { x: sim.world.w / 2, y: sim.world.h / 2 };
  },

  // Набор тестов наследования. Возвращает [{name, ok, detail}]
  runInheritanceTests() {
    const res = [], add = (name, ok, detail) => res.push({ name, ok: !!ok, detail });
    const sim = this.makeLabSim(), r = sim.rng;
    const sp = new AW.Species(sim, this.randomGenome(r), AW.newBrain(r, 0.5), 'Тестовые');
    sim.species.set(sp.id, sp);
    const mk = g => {
      const c = new AW.Creature(sim, g, AW.newBrain(r, g[AW.G.diet]), 0, 0);
      const p = this.landSpot(sim, c); c.x = p.x; c.y = p.y; c.species = sp;
      return c;
    };

    // 1. Без мутаций каждый ген потомка берётся от одного из родителей (или их среднее)
    let bad = 0, total = 0;
    for (let n = 0; n < 1000; n++) {
      const a = this.randomGenome(r), b = this.randomGenome(r), ch = AW.crossGenome(a, b, r);
      for (let i = 0; i < AW.NL; i++) {
        total++;
        const m = Math.fround((a[i] + b[i]) / 2), eps = 1e-6 * Math.max(1, Math.abs(m));
        if (Math.abs(ch[i] - a[i]) > eps && Math.abs(ch[i] - b[i]) > eps && Math.abs(ch[i] - m) > eps) bad++;
      }
    }
    add('Каждый ген потомка — от отца, от матери или их среднее', bad === 0, `${total - bad}/${total} генов`);

    // 2. Мутации не выводят гены за пределы
    let out = 0;
    for (let n = 0; n < 3000; n++) {
      const g = this.randomGenome(r); g[AW.G.mutation] = 0.25;
      AW.mutateGenome(g, r, 6);
      for (let i = 0; i < AW.NL; i++) { const l = AW.LOCI[i]; if (g[i] < l.min - 1e-4 || g[i] > l.max + 1e-4) out++; }
    }
    add('Мутации держат гены в допустимых границах', out === 0, `выходов за границы: ${out}`);

    // 3. Настоящее размножение в игре (sim.reproduce): потомок похож на родителей
    const keys = ['size', 'speed', 'diet', 'sense', 'legs', 'horns', 'armor', 'tail', 'ears', 'swim'];
    const xs = {}, ys = {};
    keys.forEach(k => { xs[k] = []; ys[k] = []; });
    let plasticLeak = 0, kids = 0, brainRowsOk = 0, brainRows = 0;
    for (let n = 0; n < 400; n++) {
      const a = mk(this.randomGenome(r)), b = mk(this.randomGenome(r));
      a.sex = 0; b.sex = 1;
      a.energy = a.maxE; b.energy = b.maxE;
      a.plastic.fill(0.7); // «выучил» что-то за жизнь
      sim.born.length = 0;
      sim.reproduce(a, b);
      const ch = sim.born[0];
      if (!ch) continue;
      kids++;
      for (const k of keys) {
        const i = AW.G[k];
        xs[k].push((a.genome[i] + b.genome[i]) / 2);
        ys[k].push(ch.genome[i]);
      }
      for (let i = 0; i < ch.plastic.length; i++) if (ch.plastic[i] !== 0) { plasticLeak++; break; }
      // строки нейронов скрытого слоя
      const B = AW.BR;
      for (let h = 0; h < AW.MAX_H; h++) {
        brainRows++;
        let fromA = 0, fromB = 0;
        for (let i = 0; i < B.IW; i++) {
          const v = ch.brain[B.W1 + h * B.IW + i];
          if (v === a.brain[B.W1 + h * B.IW + i]) fromA++;
          if (v === b.brain[B.W1 + h * B.IW + i]) fromB++;
        }
        if (Math.max(fromA, fromB) >= B.IW - 3) brainRowsOk++;
      }
    }
    sim.born.length = 0;
    const slope = (x, y) => {
      const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
      return { b: sxy / sxx, r: sxy / Math.sqrt(sxx * syy) };
    };
    for (const k of keys) {
      const s = slope(xs[k], ys[k]), l = AW.LOCI[AW.G[k]];
      add(`Наследуется «${l.name}» (регрессия потомок ← родители)`, s.b > 0.6 && s.r > 0.5, `наклон ${s.b.toFixed(2)}, корреляция ${s.r.toFixed(2)}`);
    }
    add('Нейроны мозга потомка взяты целиком от одного из родителей', brainRowsOk / brainRows > 0.9, `${brainRowsOk}/${brainRows} нейронов`);
    add('Выученное за жизнь НЕ наследуется (только гены)', plasticLeak === 0 && kids > 0, `потомков с чужим опытом: ${plasticLeak} из ${kids}`);

    // 4. Внешность наследуется: без мутаций число ног потомка равно числу ног одного из родителей
    let legOk = 0;
    for (let n = 0; n < 500; n++) {
      const a = this.randomGenome(r), b = this.randomGenome(r), ch = AW.crossGenome(a, b, r);
      const L = g => AW.genomeGet(g, 'legs');
      if (L(ch) === L(a) || L(ch) === L(b) || L(ch) === Math.round((L(a) + L(b)) / 2) || Math.abs(L(ch) - (L(a) + L(b)) / 2) <= 0.5) legOk++;
    }
    add('Строение тела (ноги) передаётся потомкам', legOk === 500, `${legOk}/500`);

    // 5. Родство: близкий потомок остаётся в виде родителей
    const a = mk(Float32Array.from(sp.ref)), b = mk(Float32Array.from(sp.ref));
    a.sex = 0; b.sex = 1; a.energy = a.maxE; b.energy = b.maxE; a.brain = Float32Array.from(sp.refBrain); b.brain = Float32Array.from(sp.refBrain);
    let same = 0;
    for (let n = 0; n < 100; n++) { a.energy = a.maxE; b.energy = b.maxE; a.mateCd = b.mateCd = 0; sim.born.length = 0; sim.reproduce(a, b); if (sim.born[0] && sim.born[0].species === sp) same++; }
    add('Потомки похожих родителей остаются их видом', same >= 95, `${same}/100`);

    // 6. Пол: потомки обоих полов примерно поровну
    let males = 0;
    for (let n = 0; n < 2000; n++) males += new AW.Creature(sim, this.randomGenome(r), AW.newBrain(r, 0.5), 0, 0).sex;
    add('Потомки рождаются обоих полов (≈50/50)', males > 850 && males < 1150, `самцов ${males} из 2000`);
    return res;
  },
};
