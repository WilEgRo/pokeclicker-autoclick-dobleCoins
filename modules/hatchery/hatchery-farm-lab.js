/**
 * PokéClicker Security Lab - Hatchery & Farm Lab Module
 * 
 * Automates Hatchery egg hatching, egg placement (up to 12 slots/queue),
 * egg step acceleration, and automatic Berry harvesting/replanting.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HatcheryFarmLab = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function unwrap(val) {
    if (typeof val === 'function') {
      try {
        return typeof val.peek === 'function' ? val.peek() : val();
      } catch (_) {
        return null;
      }
    }
    return val;
  }

  function resolveBreeding(root) {
    if (root?.App?.game?.breeding) return root.App.game.breeding;
    try {
      const app = (0, eval)('typeof App !== "undefined" ? App : undefined');
      if (app?.game?.breeding) return app.game.breeding;
    } catch (_) {}
    return null;
  }

  function resolveFarming(root) {
    if (root?.App?.game?.farming) return root.App.game.farming;
    try {
      const app = (0, eval)('typeof App !== "undefined" ? App : undefined');
      if (app?.game?.farming) return app.game.farming;
    } catch (_) {}
    return null;
  }

  function resolveParty(root) {
    if (root?.App?.game?.party) return root.App.game.party;
    try {
      const app = (0, eval)('typeof App !== "undefined" ? App : undefined');
      if (app?.game?.party) return app.game.party;
    } catch (_) {}
    return null;
  }

  class HatcheryFarmLab {
    constructor(options = {}) {
      this.windowRef = options.windowRef || (typeof window !== 'undefined' ? window : globalThis);

      // Hatchery config
      this.autoHatch = options.autoHatch !== undefined ? Boolean(options.autoHatch) : true;
      this.autoBreed = options.autoBreed !== undefined ? Boolean(options.autoBreed) : true;
      this.stepMultiplier = options.stepMultiplier !== undefined ? Number(options.stepMultiplier) : 5; // 1x to 50x
      this.breedPriority = options.breedPriority || 'efficiency'; // 'efficiency' | 'attack' | 'shiny'

      // Farm config
      this.autoHarvest = options.autoHarvest !== undefined ? Boolean(options.autoHarvest) : true;
      this.autoReplant = options.autoReplant !== undefined ? Boolean(options.autoReplant) : true;

      // Internal loops and hooks
      this.hatcheryInterval = null;
      this.farmInterval = null;
      this.origProgressEggs = null;
      this.hooksInstalled = false;

      // Telemetry
      this.stats = {
        eggsHatched: 0,
        eggsPlaced: 0,
        berriesHarvested: 0,
        berriesReplanted: 0
      };

      this.loadSettings();
    }

    loadSettings() {
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('psl_hatchery_farm_settings');
          if (raw) {
            const s = JSON.parse(raw);
            if (s.autoHatch !== undefined) this.autoHatch = Boolean(s.autoHatch);
            if (s.autoBreed !== undefined) this.autoBreed = Boolean(s.autoBreed);
            if (s.stepMultiplier !== undefined) this.stepMultiplier = Number(s.stepMultiplier);
            if (s.breedPriority) this.breedPriority = s.breedPriority;
            if (s.autoHarvest !== undefined) this.autoHarvest = Boolean(s.autoHarvest);
            if (s.autoReplant !== undefined) this.autoReplant = Boolean(s.autoReplant);
          }
        }
      } catch (_) {}
    }

    saveSettings() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('psl_hatchery_farm_settings', JSON.stringify({
            autoHatch: this.autoHatch,
            autoBreed: this.autoBreed,
            stepMultiplier: this.stepMultiplier,
            breedPriority: this.breedPriority,
            autoHarvest: this.autoHarvest,
            autoReplant: this.autoReplant
          }));
        }
      } catch (_) {}
    }

    installHooks(root = this.windowRef) {
      if (!root) return { success: false, installed: [], failed: ['no_root'] };
      this.windowRef = root;
      const installed = [];
      const failed = [];
      const self = this;

      const breeding = resolveBreeding(root);
      if (breeding && typeof breeding.progressEggs === 'function') {
        if (!this.origProgressEggs) {
          this.origProgressEggs = breeding.progressEggs;
          breeding.progressEggs = function (amount) {
            let mult = self.stepMultiplier;
            if (isNaN(mult) || mult < 1) mult = 1;
            const effectiveAmount = amount * mult;
            return self.origProgressEggs.call(this, effectiveAmount);
          };
        }
        installed.push('App.game.breeding.progressEggs');
      } else {
        failed.push('App.game.breeding.progressEggs');
      }

      this.hooksInstalled = installed.length > 0;
      this.startAutomation();

      return {
        success: this.hooksInstalled,
        installed,
        failed
      };
    }

    startAutomation() {
      if (this.hatcheryInterval) clearInterval(this.hatcheryInterval);
      if (this.farmInterval) clearInterval(this.farmInterval);

      // Fast loop for hatching and filling eggs/queue
      this.hatcheryInterval = setInterval(() => {
        try {
          this.tickHatchery();
        } catch (_) {}
      }, 500);

      // Farming loop: checks plot maturities
      this.farmInterval = setInterval(() => {
        try {
          this.tickFarming();
        } catch (_) {}
      }, 1500);
    }

    stopAutomation() {
      if (this.hatcheryInterval) {
        clearInterval(this.hatcheryInterval);
        this.hatcheryInterval = null;
      }
      if (this.farmInterval) {
        clearInterval(this.farmInterval);
        this.farmInterval = null;
      }
    }

    tickHatchery() {
      const breeding = resolveBreeding(this.windowRef);
      if (!breeding) return;

      // 1. Auto-Hatch ready eggs
      if (this.autoHatch && Array.isArray(breeding.eggList)) {
        for (let i = 0; i < breeding.eggList.length; i++) {
          const egg = unwrap(breeding.eggList[i]);
          if (egg && typeof egg.canHatch === 'function' && egg.canHatch()) {
            try {
              breeding.hatchPokemonEgg(i, true);
              this.stats.eggsHatched++;
            } catch (_) {}
          }
        }
      }

      // 2. Auto-Breed / Fill Free Slots and Queue (up to available capacity)
      if (this.autoBreed) {
        const hasSlot = typeof breeding.hasFreeEggSlot === 'function' ? breeding.hasFreeEggSlot() : false;
        const hasQueue = typeof breeding.hasFreeQueueSlot === 'function' ? breeding.hasFreeQueueSlot() : false;

        if (hasSlot || hasQueue) {
          const candidate = this.getBestBreedCandidate();
          if (candidate) {
            try {
              const success = breeding.addPokemonToHatchery(candidate);
              if (success) {
                this.stats.eggsPlaced++;
              }
            } catch (_) {}
          }
        }
      }
    }

    getBestBreedCandidate() {
      const party = resolveParty(this.windowRef);
      if (!party || !Array.isArray(party.caughtPokemon)) return null;

      // Find level 100 Pokemon that are not currently breeding
      const candidates = party.caughtPokemon.filter(p => {
        const lvl = unwrap(p.level);
        const isBreeding = unwrap(p.breeding);
        return lvl >= 100 && !isBreeding;
      });

      if (candidates.length === 0) return null;

      // Sort by selected priority
      if (this.breedPriority === 'shiny') {
        // Prioritize non-shiny first, then by efficiency
        candidates.sort((a, b) => {
          const aShiny = Boolean(unwrap(a.shiny));
          const bShiny = Boolean(unwrap(b.shiny));
          if (!aShiny && bShiny) return -1;
          if (aShiny && !bShiny) return 1;
          const aEff = unwrap(a.breedingEfficiency) || 0;
          const bEff = unwrap(b.breedingEfficiency) || 0;
          return bEff - aEff;
        });
      } else if (this.breedPriority === 'attack') {
        // Highest base attack / attack bonus
        candidates.sort((a, b) => {
          const aAtk = unwrap(a.baseAttack) || unwrap(a.attack) || 0;
          const bAtk = unwrap(b.baseAttack) || unwrap(b.attack) || 0;
          return bAtk - aAtk;
        });
      } else {
        // Default: Breeding efficiency (Attack gained per step)
        candidates.sort((a, b) => {
          const aEff = unwrap(a.breedingEfficiency) || 0;
          const bEff = unwrap(b.breedingEfficiency) || 0;
          return bEff - aEff;
        });
      }

      return candidates[0];
    }

    tickFarming() {
      if (!this.autoHarvest) return;
      const farming = resolveFarming(this.windowRef);
      if (!farming || !Array.isArray(farming.plotList)) return;

      for (let i = 0; i < farming.plotList.length; i++) {
        const plot = farming.plotList[i];
        if (!plot || !plot.isUnlocked || plot.isSafeLocked) continue;

        const stage = unwrap(plot.stage);
        // PlotStage.Berry === 4
        if (stage === 4) {
          const lastBerry = plot.berry;
          try {
            farming.harvest(i);
            this.stats.berriesHarvested++;

            // Auto-replant same berry if enabled
            if (this.autoReplant && lastBerry !== undefined && lastBerry !== null && lastBerry !== 0) {
              const hasBerry = typeof farming.hasBerry === 'function' ? farming.hasBerry(lastBerry) : false;
              if (hasBerry) {
                farming.plant(i, lastBerry);
                this.stats.berriesReplanted++;
              }
            }
          } catch (_) {}
        }
      }
    }

    setOptions(opts = {}) {
      if (typeof opts.autoHatch === 'boolean') this.autoHatch = opts.autoHatch;
      if (typeof opts.autoBreed === 'boolean') this.autoBreed = opts.autoBreed;
      if (typeof opts.stepMultiplier === 'number') this.stepMultiplier = Math.min(50, Math.max(1, opts.stepMultiplier));
      if (typeof opts.breedPriority === 'string') this.breedPriority = opts.breedPriority;
      if (typeof opts.autoHarvest === 'boolean') this.autoHarvest = opts.autoHarvest;
      if (typeof opts.autoReplant === 'boolean') this.autoReplant = opts.autoReplant;
      this.saveSettings();
      return this.getStatus();
    }

    resetStats() {
      this.stats = {
        eggsHatched: 0,
        eggsPlaced: 0,
        berriesHarvested: 0,
        berriesReplanted: 0
      };
      return this.getStatus();
    }

    getStatus() {
      const breeding = resolveBreeding(this.windowRef);
      const farming = resolveFarming(this.windowRef);

      let eggSlots = 4;
      let queueSlots = 0;
      let eggsActive = 0;
      let queueActive = 0;

      if (breeding) {
        eggSlots = unwrap(breeding.eggSlots) || 4;
        queueSlots = unwrap(breeding.queueSlots) || 0;
        if (Array.isArray(breeding.eggList)) {
          eggsActive = breeding.eggList.filter(e => {
            const egg = unwrap(e);
            return egg && typeof egg.isNone === 'function' ? !egg.isNone() : Boolean(egg);
          }).length;
        }
        if (typeof breeding.queueList === 'function') {
          const q = breeding.queueList();
          queueActive = Array.isArray(q) ? q.length : 0;
        }
      }

      let unlockedPlots = 0;
      let readyPlots = 0;
      if (farming && Array.isArray(farming.plotList)) {
        unlockedPlots = farming.plotList.filter(p => p.isUnlocked).length;
        readyPlots = farming.plotList.filter(p => p.isUnlocked && unwrap(p.stage) === 4).length;
      }

      return {
        autoHatch: this.autoHatch,
        autoBreed: this.autoBreed,
        stepMultiplier: this.stepMultiplier,
        breedPriority: this.breedPriority,
        autoHarvest: this.autoHarvest,
        autoReplant: this.autoReplant,
        hooksInstalled: this.hooksInstalled,
        eggSlots,
        queueSlots,
        eggsActive,
        queueActive,
        totalCapacity: eggSlots + queueSlots,
        totalActive: eggsActive + queueActive,
        unlockedPlots,
        readyPlots,
        stats: { ...this.stats }
      };
    }
  }

  return HatcheryFarmLab;
});
