/**
 * PokéClicker Security Lab - Reward & Economy Lab
 * 
 * Non-invasive read-only observation, correlation, and analysis engine
 * for game rewards, wallet mutations, and economic progression.
 * 
 * Strictly READ-ONLY: Never alters arguments, return values, wallet properties,
 * RNG, shiny odds, or quest rewards.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RewardEconomyLab = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function safeUnwrap(val) {
    if (typeof val === 'function') {
      try {
        return typeof val.peek === 'function' ? val.peek() : val();
      } catch (_) {
        return null;
      }
    }
    if (val && typeof val.peek === 'function') {
      try {
        return val.peek();
      } catch (_) {
        return null;
      }
    }
    if (val && typeof val.value === 'function') {
      try {
        return val.value();
      } catch (_) {
        return null;
      }
    }
    return val;
  }

  const KNOWN_CURRENCIES = [
    'Money',
    'QuestPoint',
    'DungeonToken',
    'Diamond',
    'FarmPoint',
    'BattlePoint',
    'ContestToken'
  ];

  class RewardEconomyLab {
    constructor(options = {}) {
      this.windowRef = options.windowRef || (typeof window !== 'undefined' ? window : globalThis);
      this.instrumentation = options.instrumentation || null;
      this.diagnostics = options.diagnostics || null;
      
      this.correlationWindowMs = options.correlationWindowMs || 2500;
      this.maxEvents = options.maxEvents || 300;
      this.includeCallStacks = options.includeCallStacks || false;
      this.isActive = true;

      // Reentrancy guard
      this.isObserving = false;

      // Hierarchy tracking to prevent double counting:
      // When a high-level method (e.g. gainMoney) is executing,
      // any nested low-level calls (e.g. addAmount) are registered
      // under it as internalMethod, not as duplicate rewards.
      this.activeHighLevelCall = null;

      // Pending high-level/low-level economy method calls
      // Structure: { id, timestamp, method, args, isHighLevel, internalMethod, stack }
      this.recentMethodCalls = [];

      // Pending battle events (KO / defeat) waiting for correlation
      // Structure: { battleId, enemyName, enemyId, battleType, timestamp }
      this.pendingBattleKOs = [];

      // Active battle ID counter
      this.battleCounter = 0;
      this.currentBattleId = 'B-000';

      // Correlated reward records
      this.correlatedRewards = [];

      // Unified Reward & Economy Trace (FIFO)
      this.traceEvents = [];
      this.sequence = 0;

      // Session Metrics
      this.session = {
        startedAt: new Date().toISOString(),
        battleCount: 0,
        defeatedCount: 0,
        rewardEventsCount: 0,
        moneyEarned: 0,
        questPointsEarned: 0,
        dungeonTokensEarned: 0,
        diamondsEarned: 0,
        farmPointsEarned: 0,
        battlePointsEarned: 0,
        contestTokensEarned: 0,
        unknownRewardsCount: 0,
        questRewardsCount: 0,
        dungeonRewardsCount: 0
      };

      // Last known economy state
      this.lastEconomyState = this.captureEconomyState(this.windowRef);
    }

    setOptions(opts = {}) {
      if (typeof opts.correlationWindowMs === 'number') {
        // Enforce safe bounds: 500ms to 10000ms
        this.correlationWindowMs = Math.max(500, Math.min(10000, opts.correlationWindowMs));
      }
      if (typeof opts.includeCallStacks === 'boolean') {
        this.includeCallStacks = opts.includeCallStacks;
      }
      if (typeof opts.isActive === 'boolean') {
        this.isActive = opts.isActive;
      }
    }

    isReady() {
      return !!this.hooksInstalled;
    }

    /**
     * Safely reads the player's wallet currencies without calling mutators or throwing.
     */
    captureEconomyState(root = this.windowRef) {
      const result = {
        timestamp: Date.now(),
        wallet: {
          Money: null,
          QuestPoint: null,
          DungeonToken: null,
          Diamond: null,
          FarmPoint: null,
          BattlePoint: null,
          ContestToken: null
        }
      };

      try {
        const walletObj = root?.App?.game?.wallet;
        if (!walletObj) return result;

        const rawCurrencies = safeUnwrap(walletObj.currencies);
        if (Array.isArray(rawCurrencies)) {
          for (let i = 0; i < rawCurrencies.length; i++) {
            const name = KNOWN_CURRENCIES[i] || `Currency_${i}`;
            const val = safeUnwrap(rawCurrencies[i]);
            result.wallet[name] = typeof val === 'number' ? val : 0;
          }
        } else if (rawCurrencies && typeof rawCurrencies === 'object') {
          for (const key of KNOWN_CURRENCIES) {
            if (key in rawCurrencies) {
              const val = safeUnwrap(rawCurrencies[key]);
              result.wallet[key] = typeof val === 'number' ? val : 0;
            }
          }
        }

        // Direct property check fallback (e.g. wallet.money)
        for (const key of KNOWN_CURRENCIES) {
          if (result.wallet[key] === null) {
            const lowerKey = key.toLowerCase();
            if (walletObj[key] !== undefined) {
              const val = safeUnwrap(walletObj[key]);
              if (typeof val === 'number') result.wallet[key] = val;
            } else if (walletObj[lowerKey] !== undefined) {
              const val = safeUnwrap(walletObj[lowerKey]);
              if (typeof val === 'number') result.wallet[key] = val;
            }
          }
        }
      } catch (_) {}

      return result;
    }

    /**
     * Calculates structured deltas between two economy snapshots.
     */
    diffEconomy(before, after) {
      const diff = {};
      let hasChanges = false;

      if (!before?.wallet || !after?.wallet) {
        return { hasChanges: false, diff };
      }

      for (const curr of KNOWN_CURRENCIES) {
        const bVal = before.wallet[curr];
        const aVal = after.wallet[curr];

        if (typeof bVal === 'number' && typeof aVal === 'number') {
          const delta = aVal - bVal;
          if (delta !== 0) {
            diff[curr] = {
              before: bVal,
              after: aVal,
              delta
            };
            hasChanges = true;
          }
        }
      }

      return { hasChanges, diff };
    }

    /**
     * Attaches non-invasive observational hooks to wallet and quest methods.
     */
    attachHooks(instrumentation = this.instrumentation, root = this.windowRef) {
      if (!instrumentation || typeof instrumentation.instrument !== 'function') {
        return { success: false, installed: [], failed: ['instrumentation_unavailable'] };
      }

      this.instrumentation = instrumentation;
      this.windowRef = root;

      const installed = [];
      const failed = [];

      // High-level wallet methods
      const highLevelWalletFns = [
        'App.game.wallet.gainMoney',
        'App.game.wallet.gainQuestPoints',
        'App.game.wallet.gainDungeonTokens',
        'App.game.wallet.gainDiamonds',
        'App.game.wallet.gainFarmPoints',
        'App.game.wallet.gainBattlePoints'
      ];

      for (const path of highLevelWalletFns) {
        const ok = instrumentation.instrument(root, path, {
          id: 'REWARD_LAB',
          onBefore: (fnPath, args) => this.handleEconomyMethodBefore(fnPath, args, true),
          onAfter: (fnPath, args, result, error) => this.handleEconomyMethodAfter(fnPath, args, result, error, true)
        });
        if (ok) installed.push(path);
        else failed.push(path);
      }

      // Low-level generic wallet methods (addAmount, loseAmount)
      const lowLevelWalletFns = [
        'App.game.wallet.addAmount',
        'App.game.wallet.loseAmount'
      ];

      for (const path of lowLevelWalletFns) {
        const ok = instrumentation.instrument(root, path, {
          id: 'REWARD_LAB',
          onBefore: (fnPath, args) => this.handleEconomyMethodBefore(fnPath, args, false),
          onAfter: (fnPath, args, result, error) => this.handleEconomyMethodAfter(fnPath, args, result, error, false)
        });
        if (ok) installed.push(path);
        else failed.push(path);
      }

      // Quest reward claiming
      const questOk = instrumentation.instrument(root, 'App.game.quests.claimReward', {
        id: 'REWARD_LAB',
        onBefore: (fnPath, args) => this.handleQuestClaimBefore(fnPath, args),
        onAfter: (fnPath, args, result, error) => this.handleQuestClaimAfter(fnPath, args, result, error)
      });
      if (questOk) installed.push('App.game.quests.claimReward');
      else failed.push('App.game.quests.claimReward');

      // Optional: Contest tokens method (Johto / Contests)
      if (root.App?.game?.wallet && typeof root.App.game.wallet.gainContestTokens === 'function') {
        const ctOk = instrumentation.instrument(root, 'App.game.wallet.gainContestTokens', {
          id: 'REWARD_LAB',
          onBefore: (fnPath, args) => this.handleEconomyMethodBefore(fnPath, args, true),
          onAfter: (fnPath, args, result, error) => this.handleEconomyMethodAfter(fnPath, args, result, error, true)
        });
        if (ctOk) installed.push('App.game.wallet.gainContestTokens');
      }

      this.hooksInstalled = (failed.length === 0 && installed.length > 0);
      return {
        success: this.hooksInstalled,
        installed,
        failed
      };
    }

    /**
     * Handlers for Economy Method Invocations (Hierarchy-Aware)
     */
    handleEconomyMethodBefore(path, args, isHighLevel) {
      if (!this.isActive || this.isObserving) return;

      const now = Date.now();
      let stack = null;
      if (this.includeCallStacks) {
        try {
          stack = new Error().stack.split('\n').slice(2, 6).join('\n');
        } catch (_) {}
      }

      if (isHighLevel) {
        this.activeHighLevelCall = {
          id: `MTH-${++this.sequence}`,
          timestamp: now,
          publicMethod: path,
          internalMethod: null,
          args: Array.from(args).map(a => (typeof a === 'object' && a !== null ? { ...a } : a)),
          stack,
          snapshotBefore: this.captureEconomyState(this.windowRef)
        };
      } else {
        // Low-level call (e.g. addAmount)
        if (this.activeHighLevelCall) {
          // It's a child of a high-level call! Associate it instead of duplicating.
          this.activeHighLevelCall.internalMethod = path;
          this.activeHighLevelCall.internalArgs = Array.from(args).map(a => (typeof a === 'object' && a !== null ? { ...a } : a));
        } else {
          // Standalone low-level call
          this.activeHighLevelCall = {
            id: `MTH-${++this.sequence}`,
            timestamp: now,
            publicMethod: path,
            internalMethod: null,
            args: Array.from(args).map(a => (typeof a === 'object' && a !== null ? { ...a } : a)),
            stack,
            snapshotBefore: this.captureEconomyState(this.windowRef)
          };
        }
      }
    }

    handleEconomyMethodAfter(path, args, result, error, isHighLevel) {
      if (!this.isActive || this.isObserving) return;

      // Only finalize when the enclosing high-level call (or standalone low-level call) completes
      if (isHighLevel || (!isHighLevel && !this.activeHighLevelCall?.publicMethod?.includes('gain'))) {
        const callData = this.activeHighLevelCall;
        this.activeHighLevelCall = null;

        if (callData) {
          this.isObserving = true;
          try {
            const snapshotAfter = this.captureEconomyState(this.windowRef);
            const { hasChanges, diff } = this.diffEconomy(callData.snapshotBefore, snapshotAfter);

            callData.snapshotAfter = snapshotAfter;
            callData.diff = diff;
            callData.hasDelta = hasChanges;

            this.logTraceEvent('ECONOMY_METHOD_CALL', {
              method: callData.publicMethod,
              internalMethod: callData.internalMethod,
              args: callData.args,
              diff: hasChanges ? diff : null,
              hasDelta: hasChanges
            });

            if (this.activeQuestClaim) {
              callData.isQuestClaim = true;
            }

            // Store in recent method calls for correlator
            this.recentMethodCalls.push(callData);
            if (this.recentMethodCalls.length > 50) this.recentMethodCalls.shift();

            // Run correlation check immediately
            this.correlatePendingTransactions(callData);

            // Update last known state
            this.lastEconomyState = snapshotAfter;
          } finally {
            this.isObserving = false;
          }
        }
      }
    }

    /**
     * Handlers for Quest Claiming
     */
    handleQuestClaimBefore(path, args) {
      if (!this.isActive || this.isObserving) return;
      this.activeQuestClaim = {
        id: `QST-${++this.sequence}`,
        timestamp: Date.now(),
        args: Array.from(args),
        snapshotBefore: this.captureEconomyState(this.windowRef)
      };
      this.logTraceEvent('QUEST_CLAIM_BEFORE', { path, args });
    }

    handleQuestClaimAfter(path, args, result, error) {
      if (!this.isActive || !this.activeQuestClaim || this.isObserving) return;

      const claimData = this.activeQuestClaim;
      this.activeQuestClaim = null;

      this.isObserving = true;
      try {
        const snapshotAfter = this.captureEconomyState(this.windowRef);
        const { hasChanges, diff } = this.diffEconomy(claimData.snapshotBefore, snapshotAfter);

        this.logTraceEvent('QUEST_CLAIM_AFTER', {
          args,
          error: error ? error.message : null,
          diff: hasChanges ? diff : null
        });

        this.lastEconomyState = snapshotAfter;
      } finally {
        this.isObserving = false;
      }
    }

    /**
     * Receives notified Battle KO / Defeat events from BattleLifecycleDiagnostics or BattleStateMachine.
     */
    notifyBattleEvent(eventType, battleData = {}) {
      if (!this.isActive) return;

      if (eventType === 'BATTLE_STARTED' || eventType === 'ENEMY_CHANGED') {
        this.battleCounter++;
        this.currentBattleId = `B-${String(this.battleCounter).padStart(3, '0')}`;
        this.session.battleCount++;
        this.logTraceEvent('BATTLE_STARTED', {
          battleId: this.currentBattleId,
          enemy: battleData.name || battleData.enemyName,
          battleType: battleData.battleType || 'WILD'
        });
      }

      if (eventType === 'ENEMY_HP_REACHED_ZERO' || eventType === 'DEFEAT_POKEMON') {
        this.session.defeatedCount++;
        const koRecord = {
          battleId: this.currentBattleId,
          enemyName: battleData.enemyName || battleData.name || 'Unknown',
          enemyId: battleData.enemyId || battleData.id,
          battleType: battleData.battleType || 'WILD',
          timestamp: Date.now()
        };

        this.pendingBattleKOs.push(koRecord);
        if (this.pendingBattleKOs.length > 30) this.pendingBattleKOs.shift();

        this.logTraceEvent('BATTLE_KO_DETECTED', koRecord);

        // Check if there is an economy method call that just occurred or occurs right now
        this.correlatePendingTransactions(null, koRecord);
      }
    }

    /**
     * Core Correlation Engine:
     * Correlates Battle KO ↔ Economy Method Call ↔ Wallet Delta
     */
    correlatePendingTransactions(triggeredMethodCall = null, triggeredKo = null) {
      const now = Date.now();

      // Clean up stale battle KOs older than correlationWindowMs
      this.pendingBattleKOs = this.pendingBattleKOs.filter(
        ko => (now - ko.timestamp) <= this.correlationWindowMs
      );

      // Clean up stale method calls older than correlationWindowMs
      this.recentMethodCalls = this.recentMethodCalls.filter(
        m => (now - m.timestamp) <= this.correlationWindowMs
      );

      // Attempt matching each pending KO with recent method calls
      for (const ko of [...this.pendingBattleKOs]) {
        // Find method calls within [ko.timestamp - 100ms, ko.timestamp + correlationWindowMs]
        const matchingCalls = this.recentMethodCalls.filter(m => {
          const diff = m.timestamp - ko.timestamp;
          return diff >= -150 && diff <= this.correlationWindowMs;
        });

        if (matchingCalls.length > 0) {
          for (const call of matchingCalls) {
            if (call.hasDelta && call.diff) {
              for (const [currency, d] of Object.entries(call.diff)) {
                this.recordCorrelatedReward({
                  battleId: ko.battleId,
                  battle: {
                    pokemon: ko.enemyName,
                    id: ko.enemyId,
                    context: ko.battleType
                  },
                  reward: {
                    currency,
                    delta: d.delta
                  },
                  method: {
                    public: call.publicMethod,
                    internal: call.internalMethod,
                    args: call.args
                  },
                  economy: {
                    before: d.before,
                    after: d.after
                  },
                  source: (this.windowRef?.pslAutoClicker?.isRunning?.() || (typeof isAutoClickActive === 'function' && isAutoClickActive())) ? 'auto-click' : 'manual',
                  confidence: 'HIGH'
                });
              }
            } else {
              // Method was called, but no economy delta was observed!
              this.logTraceEvent('REWARD_METHOD_CALLED_WITHOUT_DELTA', {
                battleId: ko.battleId,
                method: call.publicMethod,
                args: call.args
              });
            }

            // Remove processed call
            const idx = this.recentMethodCalls.indexOf(call);
            if (idx !== -1) this.recentMethodCalls.splice(idx, 1);
          }
        }
      }

      // Check for uncorrelated economy method calls with deltas (e.g. money gained without any battle KO)
      for (const call of [...this.recentMethodCalls]) {
        // Uncorrelated if no pending KO matches
        const hasMatchingKo = this.pendingBattleKOs.some(ko => {
          const diff = call.timestamp - ko.timestamp;
          return diff >= -150 && diff <= this.correlationWindowMs;
        });

        if (!hasMatchingKo && call.hasDelta) {
          if (call.isQuestClaim) {
            for (const [currency, d] of Object.entries(call.diff)) {
              this.recordCorrelatedReward({
                battleId: null,
                battle: null,
                reward: {
                  currency,
                  delta: d.delta
                },
                method: {
                  public: 'App.game.quests.claimReward',
                  internal: call.publicMethod,
                  args: call.args
                },
                economy: {
                  before: d.before,
                  after: d.after
                },
                source: 'quest',
                confidence: 'HIGH'
              });
              this.session.questRewardsCount++;
            }
          } else {
            for (const [currency, d] of Object.entries(call.diff)) {
              this.recordCorrelatedReward({
                battleId: null,
                battle: null,
                reward: {
                  currency,
                  delta: d.delta
                },
                method: {
                  public: call.publicMethod,
                  internal: call.internalMethod,
                  args: call.args
                },
                economy: {
                  before: d.before,
                  after: d.after
                },
                source: 'unknown',
                confidence: 'LOW'
              });
            }
          }
          const idx = this.recentMethodCalls.indexOf(call);
          if (idx !== -1) this.recentMethodCalls.splice(idx, 1);
        }
      }
    }

    /**
     * Checks for background wallet shifts directly (e.g. passive income, unhooked rewards).
     */
    checkEconomyDrift() {
      if (!this.isActive || this.isObserving) return;
      this.isObserving = true;
      try {
        const current = this.captureEconomyState(this.windowRef);
        const { hasChanges, diff } = this.diffEconomy(this.lastEconomyState, current);

        if (hasChanges) {
          for (const [currency, d] of Object.entries(diff)) {
            // Check if this matches a recent KO within time window without an identified method
            const recentKo = this.pendingBattleKOs[0] || null;
            if (recentKo && (Date.now() - recentKo.timestamp <= this.correlationWindowMs)) {
              this.recordCorrelatedReward({
                battleId: recentKo.battleId,
                battle: {
                  pokemon: recentKo.enemyName,
                  id: recentKo.enemyId,
                  context: recentKo.battleType
                },
                reward: { currency, delta: d.delta },
                method: { public: 'unidentified (economy-delta)', internal: null, args: [] },
                economy: { before: d.before, after: d.after },
                source: 'economy-delta',
                confidence: 'MEDIUM'
              });
              this.pendingBattleKOs.shift();
            } else {
              // Completely uncorrelated shift
              this.recordCorrelatedReward({
                battleId: null,
                battle: null,
                reward: { currency, delta: d.delta },
                method: { public: 'unknown', internal: null, args: [] },
                economy: { before: d.before, after: d.after },
                source: 'unknown',
                confidence: 'LOW'
              });
              this.session.unknownRewardsCount++;
            }
          }
          this.lastEconomyState = current;
        }
      } finally {
        this.isObserving = false;
      }
    }

    recordCorrelatedReward(record) {
      const entry = {
        id: `RWD-${String(++this.sequence).padStart(3, '0')}`,
        timestamp: Date.now(),
        ...record
      };

      this.correlatedRewards.unshift(entry);
      if (this.correlatedRewards.length > this.maxEvents) {
        this.correlatedRewards.pop();
      }

      // Update session totals safely
      this.session.rewardEventsCount++;
      const curr = record.reward?.currency;
      const delta = record.reward?.delta || 0;
      if (curr === 'Money') this.session.moneyEarned += delta;
      else if (curr === 'QuestPoint') this.session.questPointsEarned += delta;
      else if (curr === 'DungeonToken') this.session.dungeonTokensEarned += delta;
      else if (curr === 'Diamond') this.session.diamondsEarned += delta;
      else if (curr === 'FarmPoint') this.session.farmPointsEarned += delta;
      else if (curr === 'BattlePoint') this.session.battlePointsEarned += delta;

      if (record.battle?.context === 'DUNGEON') {
        this.session.dungeonRewardsCount++;
      }

      this.logTraceEvent('REWARD_CORRELATED', entry);
      return entry;
    }

    logTraceEvent(type, payload = {}) {
      const event = {
        sequence: ++this.sequence,
        timestamp: Date.now(),
        type,
        payload: { ...payload }
      };

      this.traceEvents.unshift(event);
      if (this.traceEvents.length > this.maxEvents) {
        this.traceEvents.pop();
      }

      return event;
    }

    getSessionSummary() {
      return {
        ...this.session,
        currentBattleId: this.currentBattleId,
        correlationWindowMs: this.correlationWindowMs,
        lastReward: this.correlatedRewards[0] || null
      };
    }

    getRewardTrace(filter = 'ALL') {
      if (filter === 'ALL') return [...this.traceEvents];
      return this.traceEvents.filter(e => {
        if (filter === 'BATTLE') return e.type.includes('BATTLE');
        if (filter === 'ECONOMY') return e.type.includes('ECONOMY') || e.type.includes('REWARD');
        if (filter === 'QUEST') return e.type.includes('QUEST');
        if (filter === 'UNKNOWN') return e.payload?.confidence === 'LOW' || e.payload?.source === 'unknown';
        return true;
      });
    }

    getCorrelatedRewards() {
      return [...this.correlatedRewards];
    }

    clearSession() {
      this.session = {
        startedAt: new Date().toISOString(),
        battleCount: 0,
        defeatedCount: 0,
        rewardEventsCount: 0,
        moneyEarned: 0,
        questPointsEarned: 0,
        dungeonTokensEarned: 0,
        diamondsEarned: 0,
        farmPointsEarned: 0,
        battlePointsEarned: 0,
        unknownRewardsCount: 0,
        questRewardsCount: 0,
        dungeonRewardsCount: 0
      };
      this.correlatedRewards = [];
    }

    clearTrace() {
      this.traceEvents = [];
    }

    exportJSON() {
      return {
        phase: 3,
        module: 'RewardEconomyLab',
        exportedAt: new Date().toISOString(),
        session: this.getSessionSummary(),
        currentEconomy: this.captureEconomyState(this.windowRef),
        correlatedRewards: this.correlatedRewards,
        traceEvents: this.traceEvents
      };
    }
  }

  return {
    RewardEconomyLab,
    createLab: (opts) => new RewardEconomyLab(opts)
  };
});
