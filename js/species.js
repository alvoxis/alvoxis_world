// Виды: каждый вид хранит «эталонный» геном, который медленно дрейфует вслед за
// рождающимися особями. Если потомок слишком отличается от эталона своего вида —
// рождается новый вид.
AW.SPECIATION_DIST = 0.1;

AW.Species = class {
  constructor(sim, genome, brain, name, parentId) {
    this.id = sim.nextSpeciesId++;
    this.name = name || AW.makeName(sim.rng, true);
    this.ref = Float32Array.from(genome);
    this.refBrain = Float32Array.from(brain);
    this.hue = genome[AW.G.hue];
    this.parent = parentId || 0;
    this.born = sim.tick;
    this.extinct = 0;
    this.count = 0;
    this.total = 0;
    this.maxGen = 0;
    this.peak = 0;
    this.diet = genome[AW.G.diet];
  }
};

AW.assignSpecies = function (sim, child, parentSp) {
  const sp = parentSp;
  const d = AW.genomeDistance(child.genome, sp.ref) + AW.brainDistance(child.brain, sp.refBrain) * 0.08;
  if (d > AW.SPECIATION_DIST && sim.species.size < 400) {
    // новый вид: заметно другой окрас
    child.genome[AW.G.hue] = (sp.hue + 35 + sim.rng() * 70) % 360;
    const ns = new AW.Species(sim, child.genome, child.brain, null, sp.id);
    sim.species.set(ns.id, ns);
    sim.log(`🧬 Новый вид <b style="color:hsl(${ns.hue|0},70%,65%)">${ns.name}</b> произошёл от вида ${sp.name}`, 'species');
    return ns;
  }
  // эталон медленно дрейфует
  const k = 0.01, ref = sp.ref, g = child.genome;
  for (let i = 0; i < AW.NL; i++) if (!AW.LOCI[i].wrap) ref[i] += (g[i] - ref[i]) * k;
  const rb = sp.refBrain, b = child.brain;
  for (let i = AW.BR.WS; i < rb.length; i++) rb[i] += (b[i] - rb[i]) * k;
  // особи вида сохраняют окрас вида с небольшим разбросом
  child.genome[AW.G.hue] = (sp.hue + (sim.rng() - 0.5) * 8 + 360) % 360;
  return sp;
};

// Готовые виды для заселения
AW.PRESETS = {
  grazer:  { name: 'Пушистики', icon: '🐑', desc: 'Травоядные, живут стадами', g: { size: 1, speed: 1, sense: 6, diet: 0.05, hidden: 5, context: 2, learn: 0.03, memory: 3, mutation: 0.06, swim: 0.1, cold: 0.3, immunity: 0.3, lifespan: 1, invest: 0.3, hue: 205 } },
  hunter:  { name: 'Клыканы',   icon: '🐺', desc: 'Хищники-охотники', g: { size: 1.4, speed: 1.35, sense: 9, diet: 0.92, hidden: 6, context: 2, learn: 0.03, memory: 3, mutation: 0.06, swim: 0.1, cold: 0.4, immunity: 0.4, lifespan: 1.1, invest: 0.4, hue: 0 } },
  omni:    { name: 'Бродяги',   icon: '🦝', desc: 'Всеядные, хорошо учатся', g: { size: 1.1, speed: 1.05, sense: 7, diet: 0.45, hidden: 8, context: 3, learn: 0.05, memory: 5, mutation: 0.06, swim: 0.2, cold: 0.3, immunity: 0.4, lifespan: 1.1, invest: 0.35, hue: 285 } },
  swimmer: { name: 'Плавуны',   icon: '🐟', desc: 'Живут в воде и на берегу', g: { size: 0.8, speed: 1.1, sense: 6, diet: 0.15, hidden: 4, context: 1, learn: 0.02, memory: 2, mutation: 0.07, swim: 0.95, cold: 0.3, immunity: 0.3, lifespan: 0.9, invest: 0.25, hue: 175 } },
  scav:    { name: 'Падальщики', icon: '🦅', desc: 'Едят падаль, быстрые', g: { size: 0.8, speed: 1.6, sense: 11, diet: 0.75, hidden: 4, context: 1, learn: 0.02, memory: 4, mutation: 0.06, swim: 0.1, cold: 0.5, immunity: 0.7, lifespan: 1, invest: 0.25, hue: 35 } },
  yeti:    { name: 'Снежуны',   icon: '❄️', desc: 'Большие, живут в холоде', g: { size: 2.2, speed: 0.7, sense: 6, diet: 0.3, hidden: 5, context: 2, learn: 0.02, memory: 3, mutation: 0.05, swim: 0.05, cold: 1, immunity: 0.5, lifespan: 1.6, invest: 0.5, hue: 55 } },
};
