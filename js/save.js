// Сохранение мира в IndexedDB браузера (typed arrays сохраняются как есть).
AW.Save = {
  open() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('alvoxis_world', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('saves');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  },

  serialize(sim) {
    const skip = new Set(['kin', 'oth', 'species', 'inp', 'hid', 'out']);
    const creatures = sim.creatures.filter(c => c.alive).map(c => {
      const o = {};
      for (const k in c) if (!skip.has(k)) o[k] = c[k];
      o.speciesId = c.species ? c.species.id : 0;
      return o;
    });
    const presets = {};
    for (const k in sim.presetSpecies) presets[k] = sim.presetSpecies[k].id;
    return {
      version: 1, savedAt: Date.now(),
      opts: sim.opts, seed: sim.seed, tick: sim.tick, nextId: sim.nextId, nextSpeciesId: sim.nextSpeciesId,
      stats: sim.stats, history: sim.history, events: sim.events, eventSeq: sim.eventSeq,
      world: Object.assign({}, sim.world),
      species: [...sim.species.values()].map(s => Object.assign({}, s)),
      creatures, presets,
    };
  },

  restore(data) {
    const sim = Object.create(AW.Sim.prototype);
    const sz = AW.WORLD_SIZES[data.opts.size] || AW.WORLD_SIZES.medium;
    Object.assign(sim, {
      opts: data.opts, seed: data.seed, tick: data.tick, nextId: data.nextId, nextSpeciesId: data.nextSpeciesId,
      stats: data.stats, history: data.history, events: data.events, eventSeq: data.eventSeq,
      born: [], presetSpecies: {}, cell: 8, cellItems: [], _rec: { here: 0, bf: 0, bs: 0, wf: 0, ws: 0 },
    });
    sim.rng = AW.makeRng((data.seed ^ data.tick) >>> 0);
    sim.world = Object.assign(Object.create(AW.World.prototype), data.world);
    sim.world.dirty = true;
    sim.gw = Math.ceil(sim.world.w / sim.cell); sim.gh = Math.ceil(sim.world.h / sim.cell);
    sim.cellStart = new Int32Array(sim.gw * sim.gh + 1);
    sim.species = new Map();
    for (const s of data.species) sim.species.set(s.id, Object.assign(Object.create(AW.Species.prototype), s));
    for (const k in data.presets) { const sp = sim.species.get(data.presets[k]); if (sp) sim.presetSpecies[k] = sp; }
    sim.creatures = data.creatures.map(o => {
      const c = Object.create(AW.Creature.prototype);
      Object.assign(c, o);
      c.inp = new Float32Array(AW.N_IN); c.hid = new Float32Array(AW.MAX_H); c.out = new Float32Array(AW.N_OUT);
      c.kin = null; c.oth = null;
      c.species = sim.species.get(o.speciesId) || null;
      delete c.speciesId;
      return c;
    });
    void sz;
    return sim;
  },

  async save(sim, slot) {
    const db = await this.open();
    const data = this.serialize(sim);
    await new Promise((res, rej) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(data, slot || 'main');
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },

  async load(slot) {
    const db = await this.open();
    const data = await new Promise((res, rej) => {
      const rq = db.transaction('saves').objectStore('saves').get(slot || 'main');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    return data ? this.restore(data) : null;
  },
};
