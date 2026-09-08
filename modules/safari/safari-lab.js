/**
 * PokéClicker Security Lab - Safari Lab & Catch Booster
 * 
 * Safely boosts catch rate in Safari Zone, prevents Pokémon (or Shiny) escapes,
 * and maintains infinite/replenished Safari Balls without corrupting save state.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SafariLab = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  function resolveSafariBattle(root) {
    if (!root) return null;
    if (root.SafariBattle) return root.SafariBattle;
    try {
      const sb = (0, eval)('typeof SafariBattle !== "undefined" ? SafariBattle : undefined');
      if (sb) return sb;
    } catch (_) {}
    return null;
  }

  function resolveSafariPokemon(root) {
    if (!root) return null;
    if (root.SafariPokemon) return root.SafariPokemon;
    try {
      const sp = (0, eval)('typeof SafariPokemon !== "undefined" ? SafariPokemon : undefined');
      if (sp) return sp;
    } catch (_) {}
    return null;
  }

  function resolveSafari(root) {
    if (!root) return null;
    if (root.Safari) return root.Safari;
    try {
      const s = (0, eval)('typeof Safari !== "undefined" ? Safari : undefined');
      if (s) return s;
    } catch (_) {}
    return null;
  }

  class SafariLab {
    constructor(options = {}) {
      this.windowRef = options.windowRef || (typeof window !== 'undefined' ? window : globalThis);
      this.mode = options.mode || 'ACTIVE'; // 'OFF' | 'ACTIVE'
      this.multiplier = options.multiplier !== undefined ? Number(options.multiplier) : 100; // 100 = 100% Guaranteed
      this.preventEscape = options.preventEscape !== undefined ? Boolean(options.preventEscape) : false;
      this.preventShinyEscape = options.preventShinyEscape !== undefined ? Boolean(options.preventShinyEscape) : true;
      this.infiniteBalls = options.infiniteBalls !== undefined ? Boolean(options.infiniteBalls) : true;
      this.doubleContestTokens = options.doubleContestTokens !== undefined ? Boolean(options.doubleContestTokens) : true;
      this.contestTokenMultiplier = options.contestTokenMultiplier !== undefined ? Number(options.contestTokenMultiplier) : 2;

      this.hooksInstalled = false;
      this.origCalcCapture = null;
      this.origThrowBall = null;
      this.origEscapeDesc = null;
      this.origGainContestTokens = null;

      this.stats = {
        encounters: 0,
        catches: 0,
        ballsThrown: 0,
        fleesBlocked: 0,
        contestTokensEarned: 0
      };

      this.lastEncounter = {
        name: '-',
        shiny: false,
        baseCatchFactor: 0,
        effectiveCatchFactor: 0,
        caught: null,
        timestamp: null
      };

      // Load saved settings if in browser
      this.loadSettings();
    }

    loadSettings() {
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('psl_safari_lab_settings');
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.mode) this.mode = saved.mode;
            if (saved.multiplier !== undefined) this.multiplier = Number(saved.multiplier);
            if (saved.preventEscape !== undefined) this.preventEscape = Boolean(saved.preventEscape);
            if (saved.preventShinyEscape !== undefined) this.preventShinyEscape = Boolean(saved.preventShinyEscape);
            if (saved.infiniteBalls !== undefined) this.infiniteBalls = Boolean(saved.infiniteBalls);
            if (saved.doubleContestTokens !== undefined) this.doubleContestTokens = Boolean(saved.doubleContestTokens);
            if (saved.contestTokenMultiplier !== undefined) this.contestTokenMultiplier = Number(saved.contestTokenMultiplier);
          }
        }
      } catch (_) {}
    }

    saveSettings() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('psl_safari_lab_settings', JSON.stringify({
            mode: this.mode,
            multiplier: this.multiplier,
            preventEscape: this.preventEscape,
            preventShinyEscape: this.preventShinyEscape,
            infiniteBalls: this.infiniteBalls,
            doubleContestTokens: this.doubleContestTokens,
            contestTokenMultiplier: this.contestTokenMultiplier
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

      const sb = resolveSafariBattle(root);
      const sp = resolveSafariPokemon(root);
      const s = resolveSafari(root);

      // 1. Hook SafariBattle.calcCapture
      if (sb && typeof sb.calcCapture === 'function') {
        if (!this.origCalcCapture) {
          this.origCalcCapture = sb.calcCapture;
          sb.calcCapture = function () {
            if (self.mode === 'ACTIVE') {
              return new Promise((resolve) => {
                const enemy = sb.enemy;
                const baseFactor = enemy ? (unwrap(enemy.catchFactor) || 10) : 10;
                let effective = (self.multiplier >= 100) ? 100 : Math.min(100, Math.round(baseFactor * self.multiplier));
                
                const isCaught = (self.multiplier >= 100) ? true : (Math.random() <= (effective / 100));
                const numRolls = isCaught ? 3 : Math.min(Math.floor(4 * (1 - Math.random()) / Math.max(0.01, (1 - (effective / 100)))), 3);

                self.stats.ballsThrown++;
                if (isCaught) {
                  self.stats.catches++;
                }

                if (enemy) {
                  self.lastEncounter = {
                    name: enemy.displayName || enemy.name || 'Desconocido',
                    shiny: Boolean(enemy.shiny),
                    baseCatchFactor: Math.round(baseFactor),
                    effectiveCatchFactor: Math.round(effective),
                    caught: isCaught,
                    timestamp: Date.now()
                  };
                }

                resolve([isCaught, numRolls]);
              });
            }
            return self.origCalcCapture.apply(this, arguments);
          };
        }
        installed.push('SafariBattle.calcCapture');
      } else {
        failed.push('SafariBattle.calcCapture');
      }

      // 2. Hook SafariPokemon.prototype.escapeFactor
      if (sp && sp.prototype) {
        if (!this.origEscapeDesc) {
          const desc = Object.getOwnPropertyDescriptor(sp.prototype, 'escapeFactor');
          if (desc && desc.get) {
            this.origEscapeDesc = desc;
            Object.defineProperty(sp.prototype, 'escapeFactor', {
              get() {
                const isShiny = Boolean(this.shiny);
                if (self.preventEscape || (self.preventShinyEscape && isShiny)) {
                  self.stats.fleesBlocked++;
                  return 0;
                }
                return desc.get.call(this);
              },
              configurable: true
            });
          }
        }
        installed.push('SafariPokemon.prototype.escapeFactor');
      } else {
        failed.push('SafariPokemon.prototype.escapeFactor');
      }

      // 3. Hook SafariBattle.throwBall for Infinite Balls replenishment
      if (sb && typeof sb.throwBall === 'function') {
        if (!this.origThrowBall) {
          this.origThrowBall = sb.throwBall;
          sb.throwBall = function () {
            const res = self.origThrowBall.apply(this, arguments);
            if (self.infiniteBalls) {
              const safariObj = resolveSafari(root);
              if (safariObj && typeof safariObj.balls === 'function') {
                const currentBalls = unwrap(safariObj.balls);
                if (typeof currentBalls === 'number' && currentBalls < 30) {
                  safariObj.balls(30);
                }
              }
            }
            return res;
          };
        }
        installed.push('SafariBattle.throwBall');
      } else {
        failed.push('SafariBattle.throwBall');
      }

      // 4. Hook App.game.wallet.gainContestTokens for Safari Contest Tokens (Johto)
      const walletObj = root.App?.game?.wallet;
      if (walletObj && typeof walletObj.gainContestTokens === 'function') {
        if (!this.origGainContestTokens) {
          this.origGainContestTokens = walletObj.gainContestTokens;
          walletObj.gainContestTokens = function (base, ignoreBonus) {
            let mult = 1;
            // Check if BattleRewardModifier is actively multiplying contestToken to avoid double-multiplying
            const brm = root.__PSL_RUNTIME_CONTEXT__?.rewardModifier || root.rewardModifier;
            const brmHandling = brm && brm.mode === 'ACTIVE' && brm.enabledCurrencies?.contestToken;

            if (self.doubleContestTokens && !brmHandling) {
              mult = self.contestTokenMultiplier || 2;
            }

            const effective = Math.floor(base * mult);
            if (mult > 1) {
              self.stats.contestTokensEarned = (self.stats.contestTokensEarned || 0) + effective;
            }

            return self.origGainContestTokens.call(this, effective, ignoreBonus);
          };
        }
        installed.push('App.game.wallet.gainContestTokens');
      }

      this.hooksInstalled = installed.length > 0;
      return {
        success: this.hooksInstalled,
        installed,
        failed
      };
    }

    setMode(mode) {
      if (mode === 'OFF' || mode === 'ACTIVE') {
        this.mode = mode;
        this.saveSettings();
      }
      return this.getStatus();
    }

    setMultiplier(multiplier) {
      const num = Number(multiplier);
      if (!isNaN(num) && num >= 1) {
        this.multiplier = Math.min(100, Math.max(1, Math.round(num)));
        this.saveSettings();
      }
      return this.getStatus();
    }

    setOptions(opts = {}) {
      if (typeof opts.preventEscape === 'boolean') this.preventEscape = opts.preventEscape;
      if (typeof opts.preventShinyEscape === 'boolean') this.preventShinyEscape = opts.preventShinyEscape;
      if (typeof opts.infiniteBalls === 'boolean') this.infiniteBalls = opts.infiniteBalls;
      if (typeof opts.doubleContestTokens === 'boolean') this.doubleContestTokens = opts.doubleContestTokens;
      if (typeof opts.contestTokenMultiplier === 'number') this.contestTokenMultiplier = Math.max(1, Math.round(opts.contestTokenMultiplier));
      this.saveSettings();
      return this.getStatus();
    }

    resetStats() {
      this.stats = {
        encounters: 0,
        catches: 0,
        ballsThrown: 0,
        fleesBlocked: 0,
        contestTokensEarned: 0
      };
      return this.getStatus();
    }

    reset() {
      this.mode = 'OFF';
      this.multiplier = 1;
      this.preventEscape = false;
      this.preventShinyEscape = true;
      this.infiniteBalls = true;
      this.doubleContestTokens = true;
      this.contestTokenMultiplier = 2;
      this.saveSettings();
      return this.getStatus();
    }

    getStatus() {
      const s = resolveSafari(this.windowRef);
      const sb = resolveSafariBattle(this.windowRef);

      const inSafari = s && typeof s.inProgress === 'function' ? Boolean(unwrap(s.inProgress)) : false;
      const inBattle = s && typeof s.inBattle === 'function' ? Boolean(unwrap(s.inBattle)) : false;
      const currentBalls = s && typeof s.balls === 'function' ? (unwrap(s.balls) ?? 0) : 0;
      const safariLevel = s && typeof s.safariLevel === 'function' ? (unwrap(s.safariLevel) ?? 1) : 1;

      let currentEnemy = null;
      if (sb && sb.enemy) {
        const enemy = sb.enemy;
        const baseF = unwrap(enemy.catchFactor) || 0;
        let effF = baseF;
        if (this.mode === 'ACTIVE') {
          effF = this.multiplier >= 100 ? 100 : Math.min(100, Math.round(baseF * this.multiplier));
        }
        currentEnemy = {
          name: enemy.displayName || enemy.name || '-',
          shiny: Boolean(enemy.shiny),
          baseCatchFactor: Math.round(baseF),
          effectiveCatchFactor: Math.round(effF)
        };
      }

      return {
        mode: this.mode,
        multiplier: this.multiplier,
        guaranteedCatch: this.mode === 'ACTIVE' && this.multiplier >= 100,
        preventEscape: this.preventEscape,
        preventShinyEscape: this.preventShinyEscape,
        infiniteBalls: this.infiniteBalls,
        doubleContestTokens: this.doubleContestTokens,
        contestTokenMultiplier: this.contestTokenMultiplier,
        hooksInstalled: this.hooksInstalled,
        inSafari,
        inBattle,
        currentBalls,
        safariLevel,
        currentEnemy,
        stats: { ...this.stats },
        lastEncounter: { ...this.lastEncounter }
      };
    }
  }

  return SafariLab;
});
