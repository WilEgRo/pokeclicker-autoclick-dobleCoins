/**
 * PokéClicker Security Lab - Controlled Battle Reward Modifier (FASE 3.1)
 * 
 * Safely modifies economic rewards gained EXCLUSIVELY from defeating wild Pokémon in combat.
 * Maintains strict isolation: quests, dungeons, gyms, shops, items, and other currencies
 * remain 100% untouched.
 * 
 * PHILOSOPHY:
 * 1. Never globally multiply App.game.wallet.addAmount.
 * 2. Strict Battle Reward Context: Combat active, WILD context, valid enemy, Money currency, defeat event.
 * 3. Never mutate the original BattlePokemon.reward object.
 * 4. Zero double reward: Exactly one transaction with the effective value is performed.
 * 5. Verify actual wallet delta: actualDelta === expectedDelta.
 * 6. Fail-safe: Any anomaly leaves original game behavior untouched.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BattleRewardModifier = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODES = Object.freeze({
    OFF: 'OFF',
    SIMULATION: 'SIMULATION',
    ACTIVE: 'ACTIVE'
  });

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

  const ALLOWED_CONTEXTS = Object.freeze(['WILD']);

  class BattleRewardModifier {
    constructor(options = {}) {
      this.windowRef = options.windowRef || (typeof window !== 'undefined' ? window : globalThis);
      this.instrumentation = options.instrumentation || null;
      this.rewardLab = options.rewardLab || null;
      this.diagnostics = options.diagnostics || null;

      // Configuration
      this.mode = MODES.OFF;
      this.multiplier = 1;

      // Runtime context & state
      this.activeContext = null;
      this.isModifying = false;
      this.sequence = 0;
      this.battleSequence = 0;

      // Telemetry & Verification
      this.maxEvents = options.maxEvents || 100;
      this.trace = [];
      this.stats = {
        detectedCount: 0,
        modifiedCount: 0,
        simulatedCount: 0,
        skippedCount: 0,
        verifiedCount: 0,
        discrepancyCount: 0,
        errorCount: 0
      };
      this.lastResult = {
        status: 'OFF',
        original: 0,
        effective: 0,
        applied: 0,
        timestamp: null
      };

      // Currency Selection (Money, Dungeon Tokens, Quest Points, Contest Tokens)
      this.enabledCurrencies = {
        money: true,
        dungeonToken: false,
        questPoint: false,
        contestToken: false
      };

      if (options.enabledCurrencies) {
        this.setCurrencies(options.enabledCurrencies);
      }

      if (options.multiplier !== undefined) {
        this.setMultiplier(options.multiplier);
      }
      if (options.mode !== undefined) {
        this.setMode(options.mode);
      }
    }

    /**
     * Identifies currency type by number or string identifier.
     */
    resolveCurrencyType(currencyVal) {
      if (currencyVal === 0 || currencyVal === 'money' || currencyVal === undefined) return 'money';
      if (currencyVal === 1 || currencyVal === 'questPoint') return 'questPoint';
      if (currencyVal === 2 || currencyVal === 'dungeonToken') return 'dungeonToken';
      if (currencyVal === 3 || currencyVal === 'diamond') return 'diamond';
      if (currencyVal === 4 || currencyVal === 'farmPoint') return 'farmPoint';
      if (currencyVal === 5 || currencyVal === 'battlePoint') return 'battlePoint';
      if (currencyVal === 6 || currencyVal === 'contestToken') return 'contestToken';
      return 'unknown';
    }

    /**
     * Updates which currencies are subject to multiplication.
     */
    setCurrencies(currencies = {}) {
      if (typeof currencies === 'object' && currencies !== null) {
        if (typeof currencies.money === 'boolean') this.enabledCurrencies.money = currencies.money;
        if (typeof currencies.dungeonToken === 'boolean') this.enabledCurrencies.dungeonToken = currencies.dungeonToken;
        if (typeof currencies.questPoint === 'boolean') this.enabledCurrencies.questPoint = currencies.questPoint;
        if (typeof currencies.contestToken === 'boolean') this.enabledCurrencies.contestToken = currencies.contestToken;
      }
      this.logTrace('MODIFIER_CURRENCIES_CHANGED', { enabledCurrencies: { ...this.enabledCurrencies } });
      return { ...this.enabledCurrencies };
    }

    /**
     * Returns a copy of enabled currencies.
     */
    getCurrencies() {
      return { ...this.enabledCurrencies };
    }

    /**
     * Validates and sets operation mode: OFF, SIMULATION, or ACTIVE.
     */
    setMode(mode) {
      const upper = String(mode).toUpperCase().trim();
      if (!MODES[upper]) {
        throw new Error(`Invalid mode: "${mode}". Allowed modes: ${Object.keys(MODES).join(', ')}`);
      }
      this.mode = MODES[upper];
      this.logTrace('MODIFIER_MODE_CHANGED', { mode: this.mode });
      return this.mode;
    }

    /**
     * Validates and sets multiplier (finite positive number between 1 and 100).
     */
    setMultiplier(multiplier) {
      if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0 || isNaN(multiplier)) {
        throw new Error(`Invalid multiplier: "${multiplier}". Must be a finite positive number between 1 and 100.`);
      }
      if (multiplier > 100) {
        throw new Error(`Multiplier ${multiplier} exceeds maximum allowed limit of 100.`);
      }
      this.multiplier = multiplier;
      this.logTrace('MODIFIER_MULTIPLIER_CHANGED', { multiplier: this.multiplier });
      return this.multiplier;
    }

    isReady() {
      return !!this.hooksInstalled;
    }

    /**
     * Safety reset: returns multiplier to 1x and mode to OFF.
     * Does not invoke any game methods.
     */
    reset() {
      this.mode = MODES.OFF;
      this.multiplier = 1;
      this.activeContext = null;
      this.isModifying = false;
      this.lastResult = {
        status: 'OFF',
        original: 0,
        effective: 0,
        applied: 0,
        timestamp: Date.now()
      };
      this.logTrace('MODIFIER_RESET', { mode: this.mode, multiplier: this.multiplier });
      return { mode: this.mode, multiplier: this.multiplier };
    }

    /**
     * Attaches hooks to Battle.defeatPokemon and App.game.wallet.addAmount via Instrumentation.
     */
    attachHooks(instrumentation = this.instrumentation, root = this.windowRef) {
      if (!instrumentation || typeof instrumentation.instrument !== 'function') {
        return { success: false, installed: [], failed: ['instrumentation_unavailable'] };
      }
      this.instrumentation = instrumentation;
      this.windowRef = root;

      const installed = [];
      const failed = [];

      // 1. Establish BattleRewardContext on wild Pokémon defeat
      const defeatOk = instrumentation.instrument(root, 'Battle.defeatPokemon', {
        id: 'BATTLE_REWARD_MODIFIER',
        onBefore: (path, args) => this.handleDefeatBefore(root),
        onAfter: (path, args, result, error) => this.handleDefeatAfter()
      });
      if (defeatOk) installed.push('Battle.defeatPokemon');
      else failed.push('Battle.defeatPokemon');

      // 2. Intercept wallet addAmount during defeat execution
      const addAmountOk = instrumentation.instrument(root, 'App.game.wallet.addAmount', {
        id: 'BATTLE_REWARD_MODIFIER',
        transformArgs: (path, args) => this.handleWalletAddAmountTransform(root, args),
        onAfter: (path, args, result, error) => this.handleWalletAddAmountAfter(root, args, result, error)
      });
      if (addAmountOk) installed.push('App.game.wallet.addAmount');
      else failed.push('App.game.wallet.addAmount');

      this.hooksInstalled = (failed.length === 0 && installed.length > 0);
      return {
        success: this.hooksInstalled,
        installed,
        failed
      };
    }

    /**
     * Identifies active battle context type (WILD, DUNGEON, GYM, etc.).
     */
    resolveActiveBattleType(root = this.windowRef) {
      if (!root) return 'UNKNOWN';

      if (root.DungeonRunner && ((typeof root.DungeonRunner.fighting === 'function' && root.DungeonRunner.fighting()) || (typeof root.DungeonRunner.running === 'function' && root.DungeonRunner.running()))) {
        return 'DUNGEON';
      }
      if (root.GymRunner && typeof root.GymRunner.running === 'function' && root.GymRunner.running()) {
        return 'GYM';
      }
      if (root.TemporaryBattleRunner && typeof root.TemporaryBattleRunner.running === 'function' && root.TemporaryBattleRunner.running()) {
        return 'TEMPORARY';
      }
      if (root.BattleFrontierRunner && typeof root.BattleFrontierRunner.running === 'function' && root.BattleFrontierRunner.running()) {
        return 'BATTLE_FRONTIER';
      }

      const currentGs = unwrap(root.App?.game?.gameState);
      const GS = root.GameConstants?.GameState;
      if (currentGs !== undefined && GS) {
        if (currentGs === GS.dungeon) return 'DUNGEON';
        if (currentGs === GS.gym) return 'GYM';
        if (currentGs === GS.temporaryBattle) return 'TEMPORARY';
        if (currentGs === GS.battleFrontier) return 'BATTLE_FRONTIER';
        if (currentGs === GS.fighting) return 'WILD';
        return 'UNKNOWN';
      }

      if (root.Battle && typeof root.Battle.clickAttack === 'function') {
        return 'WILD';
      }

      return 'UNKNOWN';
    }

    /**
     * Extracts current Money balance from wallet safely.
     */
    getWalletMoneyBalance(root = this.windowRef) {
      try {
        const wallet = root?.App?.game?.wallet;
        if (!wallet) return null;

        const currencies = wallet.currencies;
        if (Array.isArray(currencies) && currencies[0]) {
          const c0 = currencies[0];
          const val = typeof c0 === 'function' ? c0() : (typeof c0?.peek === 'function' ? c0.peek() : c0);
          if (typeof val === 'number') return val;
        }

        if (typeof wallet.money === 'number') return wallet.money;
        if (typeof wallet.Money === 'number') return wallet.Money;
        if (typeof wallet.currencies?.money === 'number') return wallet.currencies.money;
      } catch (_) {}
      return null;
    }

    /**
     * Called before Battle.defeatPokemon() begins.
     * Evaluates context eligibility and establishes active BattleRewardContext.
     */
    handleDefeatBefore(root = this.windowRef) {
      if (this.isModifying) return;

      try {
        const battleType = this.resolveActiveBattleType(root);

        // Filter by Context: Only WILD is currently eligible
        if (!ALLOWED_CONTEXTS.includes(battleType)) {
          this.logTrace('BATTLE_REWARD_MODIFIER_SKIPPED', {
            reason: 'NON_WILD_CONTEXT',
            context: battleType,
            timestamp: Date.now()
          });
          this.stats.skippedCount++;
          return;
        }

        const battle = root.Battle;
        if (!battle) return;

        const enemy = typeof battle.enemyPokemon === 'function' ? battle.enemyPokemon() : battle.enemyPokemon;
        if (!enemy || !enemy.reward) return;

        const originalAmount = typeof enemy.reward.amount === 'number' ? enemy.reward.amount : 0;
        const currency = enemy.reward.currency;

        // Filter: Must award positive Money
        const isMoney = currency === 0 || currency === 'money' || currency === undefined;
        if (originalAmount <= 0 || !isMoney) {
          return;
        }

        // Retrieve or generate battleId
        let battleId = null;
        if (this.rewardLab && this.rewardLab.currentBattleId) {
          battleId = this.rewardLab.currentBattleId;
        } else if (this.diagnostics && typeof this.diagnostics.getLastEvent === 'function') {
          const lastEvt = this.diagnostics.getLastEvent();
          battleId = lastEvt?.battleId || `BTL-${++this.battleSequence}`;
        } else {
          battleId = `BTL-${++this.battleSequence}`;
        }

        const pokemonName = enemy.name || (typeof enemy.displayName === 'string' ? enemy.displayName : 'Unknown');
        const pokemonLevel = typeof enemy.level === 'number' ? enemy.level : 1;

        // Calculate effective reward without modifying enemy.reward
        const effectiveAmount = this.mode === MODES.OFF || this.multiplier === 1
          ? originalAmount
          : Math.floor(originalAmount * this.multiplier);

        this.activeContext = {
          id: `CTX-${++this.sequence}`,
          battleId,
          context: 'WILD',
          pokemon: { name: pokemonName, level: pokemonLevel },
          currency: 'Money',
          originalAmount,
          effectiveAmount,
          multiplier: this.multiplier,
          mode: this.mode,
          timestamp: Date.now(),
          applied: false,
          beforeBalance: this.getWalletMoneyBalance(root)
        };

        this.stats.detectedCount++;

        this.logTrace('BATTLE_REWARD_DETECTED', {
          battleId,
          pokemon: this.activeContext.pokemon,
          context: 'WILD',
          currency: 'Money',
          originalAmount,
          multiplier: this.multiplier,
          effectiveAmount,
          mode: this.mode,
          timestamp: this.activeContext.timestamp
        });
      } catch (err) {
        this.activeContext = null;
        this.stats.errorCount++;
        this.logTrace('MODIFIER_ERROR', { step: 'defeatBefore', error: err.message });
      }
    }

    /**
     * Called after Battle.defeatPokemon() completes.
     * Ensures any lingering active context is cleaned up safely.
     */
    handleDefeatAfter() {
      // If activeContext was not consumed by addAmount, clear it safely
      if (this.activeContext && !this.activeContext.applied) {
        if (this.mode === MODES.SIMULATION) {
          this.stats.simulatedCount++;
          this.lastResult = {
            status: 'SIMULATED',
            original: this.activeContext.originalAmount,
            effective: this.activeContext.effectiveAmount,
            applied: this.activeContext.originalAmount,
            timestamp: Date.now()
          };
        }
        this.activeContext = null;
      }
    }

    /**
     * Called by Instrumentation on App.game.wallet.addAmount to inspect and optionally transform args.
     */
    handleWalletAddAmountTransform(root, args) {
      const amountObj = args[0];
      if (!amountObj || typeof amountObj.amount !== 'number' || amountObj.amount <= 0) {
        return args;
      }

      // Reentrancy guard
      if (this.isModifying) {
        return args;
      }

      // OFF MODE or 1x: Pass original argument untouched
      if (this.mode === MODES.OFF || this.multiplier === 1) {
        return args;
      }

      try {
        const incAmount = amountObj.amount;
        const incCurrency = amountObj.currency;
        const currType = this.resolveCurrencyType(incCurrency);

        // Case 1: MONEY (Wild Battle Defeat context)
        if (currType === 'money') {
          if (!this.activeContext || !this.enabledCurrencies.money) {
            return args;
          }

          const ctx = this.activeContext;
          if (incAmount !== ctx.originalAmount) {
            // Argument does not match expected defeat reward
            this.logTrace('BATTLE_REWARD_MODIFIER_SKIPPED', {
              reason: 'ARGUMENT_MISMATCH',
              expectedAmount: ctx.originalAmount,
              receivedAmount: incAmount,
              receivedCurrency: incCurrency,
              timestamp: Date.now()
            });
            this.stats.skippedCount++;
            return args;
          }

          // SIMULATION MODE
          if (this.mode === MODES.SIMULATION) {
            this.logTrace('BATTLE_REWARD_SIMULATED', {
              battleId: ctx.battleId,
              context: 'WILD',
              pokemon: ctx.pokemon,
              currency: 'Money',
              originalAmount: ctx.originalAmount,
              multiplier: ctx.multiplier,
              effectiveAmount: ctx.effectiveAmount,
              appliedAmount: ctx.originalAmount,
              mode: 'SIMULATION',
              timestamp: Date.now()
            });
            return args;
          }

          // ACTIVE MODE: Supply modified Amount object WITHOUT mutating original object
          this.isModifying = true;
          ctx.applied = true;
          ctx.beforeBalance = this.getWalletMoneyBalance(root);

          const modifiedAmountObj = Object.assign({}, amountObj, {
            amount: ctx.effectiveAmount
          });

          if (typeof amountObj.constructor === 'function' && amountObj.constructor.name === 'Amount') {
            try {
              const copy = new amountObj.constructor(ctx.effectiveAmount, amountObj.currency);
              return [copy];
            } catch (_) {}
          }

          return [modifiedAmountObj];
        }

        // Case 2: DUNGEON TOKENS (Catching Pokémon / Dungeon Completions)
        if (currType === 'dungeonToken' && this.enabledCurrencies.dungeonToken) {
          const effectiveAmount = Math.floor(incAmount * this.multiplier);

          if (this.mode === MODES.SIMULATION) {
            this.stats.simulatedCount++;
            this.lastResult = {
              status: 'SIMULATED',
              currency: 'DungeonToken',
              original: incAmount,
              effective: effectiveAmount,
              applied: incAmount,
              timestamp: Date.now()
            };
            this.logTrace('DUNGEON_TOKEN_REWARD_SIMULATED', {
              currency: 'DungeonToken',
              originalAmount: incAmount,
              multiplier: this.multiplier,
              effectiveAmount,
              timestamp: Date.now()
            });
            return args;
          }

          // ACTIVE MODE
          this.stats.modifiedCount++;
          this.lastResult = {
            status: 'VERIFIED',
            currency: 'DungeonToken',
            original: incAmount,
            effective: effectiveAmount,
            applied: effectiveAmount,
            timestamp: Date.now()
          };
          this.logTrace('DUNGEON_TOKEN_REWARD_MODIFIED', {
            currency: 'DungeonToken',
            originalAmount: incAmount,
            multiplier: this.multiplier,
            effectiveAmount,
            timestamp: Date.now()
          });

          const modifiedAmountObj = Object.assign({}, amountObj, {
            amount: effectiveAmount
          });

          if (typeof amountObj.constructor === 'function' && amountObj.constructor.name === 'Amount') {
            try {
              const copy = new amountObj.constructor(effectiveAmount, amountObj.currency);
              return [copy];
            } catch (_) {}
          }

          return [modifiedAmountObj];
        }

        // Case 3: QUEST POINTS (Quests & Questlines)
        if (currType === 'questPoint' && this.enabledCurrencies.questPoint) {
          const effectiveAmount = Math.floor(incAmount * this.multiplier);

          if (this.mode === MODES.SIMULATION) {
            this.stats.simulatedCount++;
            this.lastResult = {
              status: 'SIMULATED',
              currency: 'QuestPoint',
              original: incAmount,
              effective: effectiveAmount,
              applied: incAmount,
              timestamp: Date.now()
            };
            this.logTrace('QUEST_POINT_REWARD_SIMULATED', {
              currency: 'QuestPoint',
              originalAmount: incAmount,
              multiplier: this.multiplier,
              effectiveAmount,
              timestamp: Date.now()
            });
            return args;
          }

          // ACTIVE MODE
          this.stats.modifiedCount++;
          this.lastResult = {
            status: 'VERIFIED',
            currency: 'QuestPoint',
            original: incAmount,
            effective: effectiveAmount,
            applied: effectiveAmount,
            timestamp: Date.now()
          };
          this.logTrace('QUEST_POINT_REWARD_MODIFIED', {
            currency: 'QuestPoint',
            originalAmount: incAmount,
            multiplier: this.multiplier,
            effectiveAmount,
            timestamp: Date.now()
          });

          const modifiedAmountObj = Object.assign({}, amountObj, {
            amount: effectiveAmount
          });

          if (typeof amountObj.constructor === 'function' && amountObj.constructor.name === 'Amount') {
            try {
              const copy = new amountObj.constructor(effectiveAmount, amountObj.currency);
              return [copy];
            } catch (_) {}
          }

          return [modifiedAmountObj];
        }

        // Case 4: CONTEST TOKENS (Johto Safari / Bug Catching Contest / Contests)
        if (currType === 'contestToken' && this.enabledCurrencies.contestToken) {
          const effectiveAmount = Math.floor(incAmount * this.multiplier);

          if (this.mode === MODES.SIMULATION) {
            this.stats.simulatedCount++;
            this.lastResult = {
              status: 'SIMULATED',
              currency: 'ContestToken',
              original: incAmount,
              effective: effectiveAmount,
              applied: incAmount,
              timestamp: Date.now()
            };
            this.logTrace('CONTEST_TOKEN_REWARD_SIMULATED', {
              currency: 'ContestToken',
              originalAmount: incAmount,
              multiplier: this.multiplier,
              effectiveAmount,
              timestamp: Date.now()
            });
            return args;
          }

          // ACTIVE MODE
          this.stats.modifiedCount++;
          this.lastResult = {
            status: 'VERIFIED',
            currency: 'ContestToken',
            original: incAmount,
            effective: effectiveAmount,
            applied: effectiveAmount,
            timestamp: Date.now()
          };
          this.logTrace('CONTEST_TOKEN_REWARD_MODIFIED', {
            currency: 'ContestToken',
            originalAmount: incAmount,
            multiplier: this.multiplier,
            effectiveAmount,
            timestamp: Date.now()
          });

          const modifiedAmountObj = Object.assign({}, amountObj, {
            amount: effectiveAmount
          });

          if (typeof amountObj.constructor === 'function' && amountObj.constructor.name === 'Amount') {
            try {
              const copy = new amountObj.constructor(effectiveAmount, amountObj.currency);
              return [copy];
            } catch (_) {}
          }

          return [modifiedAmountObj];
        }

        // All other currencies or non-enabled currencies pass untouched
        return args;
      } catch (err) {
        this.isModifying = false;
        this.stats.errorCount++;
        this.logTrace('MODIFIER_ERROR', { step: 'transformArgs', error: err.message });
        return args;
      }
    }

    /**
     * Called after App.game.wallet.addAmount finishes execution.
     * Verifies actual delta against expected delta and logs confirmation or discrepancy.
     */
    handleWalletAddAmountAfter(root, args, result, error) {
      if (!this.activeContext || !this.activeContext.applied) {
        return;
      }

      const ctx = this.activeContext;
      this.isModifying = false;
      this.activeContext = null;

      try {
        const afterBalance = this.getWalletMoneyBalance(root);
        let actualDelta = null;

        if (typeof ctx.beforeBalance === 'number' && typeof afterBalance === 'number') {
          actualDelta = afterBalance - ctx.beforeBalance;
        } else {
          actualDelta = ctx.effectiveAmount; // Fallback if wallet balances unreadable
        }

        const isVerified = actualDelta === ctx.effectiveAmount;

        if (isVerified) {
          this.stats.verifiedCount++;
          this.stats.modifiedCount++;

          this.lastResult = {
            status: 'VERIFIED',
            original: ctx.originalAmount,
            effective: ctx.effectiveAmount,
            applied: actualDelta,
            timestamp: Date.now()
          };

          this.logTrace('MODIFIER_APPLICATION_VERIFIED', {
            battleId: ctx.battleId,
            pokemon: ctx.pokemon,
            context: 'WILD',
            currency: 'Money',
            originalAmount: ctx.originalAmount,
            multiplier: ctx.multiplier,
            effectiveAmount: ctx.effectiveAmount,
            appliedAmount: actualDelta,
            actualDelta,
            expectedDelta: ctx.effectiveAmount,
            mode: 'ACTIVE',
            timestamp: Date.now(),
            confidence: 'HIGH'
          });

          this.logTrace('BATTLE_REWARD_MODIFIED', {
            battleId: ctx.battleId,
            pokemon: ctx.pokemon,
            context: 'WILD',
            currency: 'Money',
            originalAmount: ctx.originalAmount,
            multiplier: ctx.multiplier,
            effectiveAmount: ctx.effectiveAmount,
            appliedAmount: actualDelta,
            mode: 'ACTIVE',
            timestamp: Date.now(),
            confidence: 'HIGH'
          });
        } else {
          this.stats.discrepancyCount++;
          this.stats.modifiedCount++;

          this.lastResult = {
            status: 'DISCREPANCY',
            original: ctx.originalAmount,
            effective: ctx.effectiveAmount,
            applied: actualDelta,
            timestamp: Date.now()
          };

          this.logTrace('MODIFIER_APPLICATION_DISCREPANCY', {
            battleId: ctx.battleId,
            pokemon: ctx.pokemon,
            expectedDelta: ctx.effectiveAmount,
            actualDelta,
            originalAmount: ctx.originalAmount,
            effectiveAmount: ctx.effectiveAmount,
            mode: 'ACTIVE',
            timestamp: Date.now()
          });
        }
      } catch (err) {
        this.stats.errorCount++;
        this.logTrace('MODIFIER_ERROR', { step: 'walletAddAmountAfter', error: err.message });
      }
    }

    /**
     * Internal FIFO trace logger.
     */
    logTrace(type, payload = {}) {
      const evt = {
        id: `MOD-${++this.sequence}`,
        timestamp: Date.now(),
        type,
        payload
      };
      this.trace.unshift(evt);
      if (this.trace.length > this.maxEvents) {
        this.trace.pop();
      }
      return evt;
    }

    /**
     * Retrieves status summary for UI & bridge.
     */
    getStatus() {
      return {
        mode: this.mode,
        multiplier: this.multiplier,
        context: 'WILD',
        enabledCurrencies: { ...this.enabledCurrencies },
        stats: { ...this.stats },
        lastResult: { ...this.lastResult }
      };
    }

    /**
     * Retrieves filtered modifier trace.
     */
    getTrace(filter = 'ALL') {
      if (filter === 'ALL') {
        return [...this.trace];
      }
      return this.trace.filter(e => e.type.includes(filter));
    }

    /**
     * Clears modifier trace events.
     */
    clearTrace() {
      this.trace = [];
      return true;
    }

    /**
     * Returns exportable telemetry object for EXPORT_REWARD_DATA integration.
     */
    exportData() {
      return {
        config: {
          mode: this.mode,
          multiplier: this.multiplier,
          context: 'WILD'
        },
        stats: { ...this.stats },
        lastResult: { ...this.lastResult },
        trace: [...this.trace]
      };
    }

    static createModifier(options) {
      return new BattleRewardModifier(options);
    }
  }

  return {
    BattleRewardModifier,
    MODES,
    createModifier: (opts) => new BattleRewardModifier(opts)
  };
});
