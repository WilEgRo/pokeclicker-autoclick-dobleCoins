/**
 * PokéClicker Security Lab - Battle Lifecycle Diagnostics Module
 * 
 * Non-invasive observation engine for tracking combat lifecycle transitions,
 * KO events, enemy swaps, and transition latencies in PokéClicker.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BattleLifecycleDiagnostics = factory();
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
    if (val && typeof val.value === 'function') {
      try {
        return val.value();
      } catch (_) {
        return null;
      }
    }
    return val;
  }

  class BattleLifecycleDiagnostics {
    constructor(options = {}) {
      this.maxEvents = options.maxEvents || 300;
      this.events = [];
      this.sequence = 0;
      this.lastKoTimestamp = null;
      this.lastEnemyId = null;
      this.lastEnemyName = null;
      this.lastBattleType = null;
      
      // Metrics
      this.metrics = {
        schedulerClicks: 0,
        acceptedGameClicks: 0,
        koCount: 0,
        enemyTransitions: 0,
        stalledTransitions: 0,
        totalTransitionLatencyMs: 0,
        averageTransitionLatencyMs: 0,
        maxTransitionLatencyMs: 0,
        errors: 0
      };

      // Diagnostic configuration
      this.config = {
        pauseAfterKo: false,
        postKoDelayMs: 0,
        transitionTimeoutMs: 3500
      };
    }

    setConfig(newConfig = {}) {
      this.config = { ...this.config, ...newConfig };
    }

    captureBattleLifecycleState(root = (typeof window !== 'undefined' ? window : globalThis)) {
      const app = root.App;
      const statistics = app?.game?.statistics;
      const clickAttacks = statistics ? safeUnwrap(statistics.clickAttacks) : null;
      const defeatedStats = statistics ? safeUnwrap(statistics.totalPokemonDefeated || statistics.pokemonDefeated) : null;
      const gameVersion = app?.game?.version ? safeUnwrap(app.game.version) : 'unknown';

      // Detect active battle
      let battleType = 'NONE';
      let battleClass = null;
      let activeBattleObj = null;

      if (root.GymRunner && safeUnwrap(root.GymRunner.running?.())) {
        battleType = 'GYM';
        battleClass = 'GymBattle';
        activeBattleObj = root.GymBattle;
      } else if (root.DungeonRunner && safeUnwrap(root.DungeonRunner.running?.())) {
        battleType = 'DUNGEON';
        battleClass = 'DungeonBattle';
        activeBattleObj = root.DungeonBattle;
      } else if (root.TemporaryBattleRunner && safeUnwrap(root.TemporaryBattleRunner.running?.())) {
        battleType = 'TEMPORARY';
        battleClass = 'TemporaryBattleBattle';
        activeBattleObj = root.TemporaryBattleBattle;
      } else if (root.BattleFrontierRunner && safeUnwrap(root.BattleFrontierRunner.running?.())) {
        battleType = 'BATTLE_FRONTIER';
        battleClass = 'BattleFrontierBattle';
        activeBattleObj = root.BattleFrontierBattle;
      } else if (root.Battle) {
        battleType = 'WILD';
        battleClass = 'Battle';
        activeBattleObj = root.Battle;
      }

      // Safe inspection of enemyPokemon
      let enemy = {
        exists: false,
        id: null,
        name: null,
        hp: 0,
        maxHp: 0,
        isAlive: false
      };

      if (activeBattleObj && activeBattleObj.enemyPokemon) {
        const ep = safeUnwrap(activeBattleObj.enemyPokemon);
        if (ep) {
          const hp = Number(safeUnwrap(ep.health)) || 0;
          const maxHp = Number(safeUnwrap(ep.maxHealth)) || 0;
          enemy = {
            exists: true,
            id: safeUnwrap(ep.id),
            name: safeUnwrap(ep.name) || 'Unknown',
            hp,
            maxHp,
            isAlive: typeof ep.isAlive === 'function' ? ep.isAlive() : hp > 0
          };
        }
      }

      const isCatching = activeBattleObj?.catching ? Boolean(safeUnwrap(activeBattleObj.catching)) : false;

      return {
        timestamp: new Date().toISOString(),
        gameVersion,
        battleType,
        battleClass,
        isCatching,
        enemy,
        statistics: {
          clickAttacks,
          totalPokemonDefeated: defeatedStats
        },
        runners: {
          gymRunning: Boolean(root.GymRunner && safeUnwrap(root.GymRunner.running?.())),
          dungeonRunning: Boolean(root.DungeonRunner && safeUnwrap(root.DungeonRunner.running?.()))
        }
      };
    }

    logEvent(eventType, source = 'SYSTEM', metadata = {}) {
      const now = new Date();
      this.sequence++;

      const eventRecord = {
        timestamp: now.toISOString(),
        sequence: this.sequence,
        event: eventType,
        source,
        battleType: metadata.battleType || this.lastBattleType || 'WILD',
        enemyId: metadata.enemyId !== undefined ? metadata.enemyId : this.lastEnemyId,
        enemyName: metadata.enemyName !== undefined ? metadata.enemyName : this.lastEnemyName,
        hp: metadata.hp !== undefined ? metadata.hp : null,
        maxHp: metadata.maxHp !== undefined ? metadata.maxHp : null,
        clickAttacks: metadata.clickAttacks !== undefined ? metadata.clickAttacks : null,
        metadata: { ...metadata }
      };

      this.events.push(eventRecord);
      if (this.events.length > this.maxEvents) {
        this.events.shift();
      }

      return eventRecord;
    }

    recordBeforeClickAttack(state) {
      this.metrics.schedulerClicks++;
      this.lastBattleType = state.battleType;
      this.lastEnemyId = state.enemy?.id;
      this.lastEnemyName = state.enemy?.name;

      return this.logEvent('BEFORE_CLICK_ATTACK', 'AUTO_CLICK', {
        battleType: state.battleType,
        enemyId: state.enemy?.id,
        enemyName: state.enemy?.name,
        hp: state.enemy?.hp,
        maxHp: state.enemy?.maxHp,
        clickAttacks: state.statistics?.clickAttacks
      });
    }

    recordAfterClickAttack(stateBefore, stateAfter) {
      const clicksDelta = (stateAfter.statistics?.clickAttacks || 0) - (stateBefore.statistics?.clickAttacks || 0);
      if (clicksDelta > 0) {
        this.metrics.acceptedGameClicks += clicksDelta;
      }

      const afterHp = stateAfter.enemy?.hp ?? 0;
      const beforeHp = stateBefore.enemy?.hp ?? 0;

      const evt = this.logEvent('AFTER_CLICK_ATTACK', 'AUTO_CLICK', {
        battleType: stateAfter.battleType,
        enemyId: stateAfter.enemy?.id,
        enemyName: stateAfter.enemy?.name,
        hp: afterHp,
        maxHp: stateAfter.enemy?.maxHp,
        hpDelta: beforeHp - afterHp,
        clickAttacks: stateAfter.statistics?.clickAttacks,
        gameClicksAccepted: clicksDelta > 0
      });

      // Detect KO transition moment
      if (beforeHp > 0 && afterHp <= 0) {
        this.recordKo(stateBefore, stateAfter);
      }

      return evt;
    }

    recordClickAttackError(error, state) {
      this.metrics.errors++;
      return this.logEvent('CLICK_ATTACK_ERROR', 'AUTO_CLICK', {
        battleType: state?.battleType || 'UNKNOWN',
        enemyId: state?.enemy?.id,
        enemyName: state?.enemy?.name,
        errorMessage: error.message || String(error),
        stack: error.stack
      });
    }

    recordKo(stateBefore, stateAfter) {
      this.metrics.koCount++;
      this.lastKoTimestamp = Date.now();

      return this.logEvent('ENEMY_HP_REACHED_ZERO', 'GAME_LIFECYCLE', {
        battleType: stateAfter.battleType,
        enemyBefore: stateBefore.enemy?.name,
        enemyAfter: stateAfter.enemy?.name,
        enemyId: stateAfter.enemy?.id,
        enemyName: stateAfter.enemy?.name,
        hpBefore: stateBefore.enemy?.hp,
        hpAfter: stateAfter.enemy?.hp,
        isCatching: stateAfter.isCatching,
        timestampMs: this.lastKoTimestamp
      });
    }

    recordWaitingForTransition(enemyName, enemyHp, battleType) {
      return this.logEvent('WAITING_FOR_TRANSITION', 'SCHEDULER', {
        battleType,
        enemyName,
        hp: enemyHp,
        reason: enemyHp <= 0 ? 'Enemy HP reached 0 (KO)' : 'Catching or transitioning'
      });
    }

    recordEnemyTransition(prevEnemyName, nextEnemy, battleType) {
      const now = Date.now();
      let latencyMs = null;

      if (this.lastKoTimestamp) {
        latencyMs = now - this.lastKoTimestamp;
        this.metrics.totalTransitionLatencyMs += latencyMs;
        this.metrics.enemyTransitions++;
        this.metrics.averageTransitionLatencyMs = Math.round(
          this.metrics.totalTransitionLatencyMs / this.metrics.enemyTransitions
        );
        if (latencyMs > this.metrics.maxTransitionLatencyMs) {
          this.metrics.maxTransitionLatencyMs = latencyMs;
        }
        this.lastKoTimestamp = null;
      }

      this.lastEnemyId = nextEnemy?.id;
      this.lastEnemyName = nextEnemy?.name;
      this.lastBattleType = battleType;

      return this.logEvent('ENEMY_CHANGED', 'GAME_LIFECYCLE', {
        battleType,
        previousEnemy: prevEnemyName,
        enemyId: nextEnemy?.id,
        enemyName: nextEnemy?.name,
        hp: nextEnemy?.hp,
        maxHp: nextEnemy?.maxHp,
        transitionLatencyMs: latencyMs
      });
    }

    recordEnemyCleared(prevEnemyName, battleType) {
      return this.logEvent('ENEMY_CLEARED', 'GAME_LIFECYCLE', {
        battleType,
        previousEnemy: prevEnemyName,
        enemyName: null,
        hp: 0
      });
    }

    recordTransitionStalled(enemyName, elapsedMs, battleType) {
      this.metrics.stalledTransitions++;
      return this.logEvent('TRANSITION_STALLED', 'DIAGNOSTICS', {
        battleType,
        enemyName,
        elapsedMs,
        timeoutThresholdMs: this.config.transitionTimeoutMs
      });
    }

    recordBattleTypeChange(oldType, newType) {
      this.lastBattleType = newType;
      return this.logEvent('BATTLE_TYPE_CHANGED', 'ROUTER', {
        previousBattleType: oldType,
        currentBattleType: newType
      });
    }

    getTimeline() {
      return [...this.events];
    }

    getMetrics() {
      return { ...this.metrics };
    }

    clear() {
      this.events = [];
      this.sequence = 0;
      this.lastKoTimestamp = null;
      this.metrics = {
        schedulerClicks: 0,
        acceptedGameClicks: 0,
        koCount: 0,
        enemyTransitions: 0,
        stalledTransitions: 0,
        totalTransitionLatencyMs: 0,
        averageTransitionLatencyMs: 0,
        maxTransitionLatencyMs: 0,
        errors: 0
      };
    }

    exportJSON() {
      return {
        timestamp: new Date().toISOString(),
        config: { ...this.config },
        metrics: this.getMetrics(),
        totalEvents: this.events.length,
        events: this.getTimeline()
      };
    }
  }

  return {
    BattleLifecycleDiagnostics,
    createDiagnostics: (opts) => new BattleLifecycleDiagnostics(opts)
  };
});
