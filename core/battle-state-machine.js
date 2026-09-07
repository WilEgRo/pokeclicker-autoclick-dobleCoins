/**
 * PokéClicker Security Lab - Battle State Machine
 * 
 * Manages the reactive execution cycle of Auto Click:
 * Ensures clicks are ONLY dispatched when an active enemy is alive,
 * and enters WAITING_FOR_TRANSITION while the native game engine
 * resolves defeat, catching, and enemy generation.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BattleStateMachine = factory();
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

  const BattleState = {
    IDLE: 'IDLE',
    READY: 'READY',
    ATTACKING: 'ATTACKING',
    WAITING_FOR_TRANSITION: 'WAITING_FOR_TRANSITION',
    PAUSED: 'PAUSED',
    STOPPED: 'STOPPED',
    TIMEOUT: 'TIMEOUT',
    ERROR: 'ERROR'
  };

  class BattleStateMachine {
    constructor(options = {}) {
      this.state = BattleState.IDLE;
      this.diagnostics = options.diagnostics || null;
      this.transitionTimeoutMs = options.transitionTimeoutMs || 3500;
      this.pauseAfterKo = options.pauseAfterKo || false;
      this.postKoDelayMs = options.postKoDelayMs || 0;

      this.windowRef = options.windowRef || null;
      this.currentEnemyId = null;
      this.currentEnemyName = null;
      this.currentBattleType = 'NONE';
      this.waitingStartedAt = null;
      this.resumeScheduledAt = null;
      this.isPausedForDelay = false;
    }

    setDiagnostics(diag) {
      this.diagnostics = diag;
    }

    setConfig({ transitionTimeoutMs, pauseAfterKo, postKoDelayMs } = {}) {
      if (typeof transitionTimeoutMs === 'number') this.transitionTimeoutMs = transitionTimeoutMs;
      if (typeof pauseAfterKo === 'boolean') this.pauseAfterKo = pauseAfterKo;
      if (typeof postKoDelayMs === 'number') this.postKoDelayMs = postKoDelayMs;
    }

    getState() {
      return this.state;
    }

    /**
     * Resolves the active combat container and type in PokéClicker.
     */
    resolveActiveBattle(root = (typeof window !== 'undefined' ? window : globalThis)) {
      if (root.DungeonRunner && (safeUnwrap(root.DungeonRunner.fighting?.()) || safeUnwrap(root.DungeonRunner.running?.()) || safeUnwrap(root.DungeonRunner.fighting) || safeUnwrap(root.DungeonRunner.running))) {
        return root.DungeonBattle ? { battle: root.DungeonBattle, battleName: 'DungeonBattle', battleType: 'DUNGEON' } : null;
      }
      if (root.GymRunner && (safeUnwrap(root.GymRunner.running?.()) || safeUnwrap(root.GymRunner.running))) {
        return root.GymBattle ? { battle: root.GymBattle, battleName: 'GymBattle', battleType: 'GYM' } : null;
      }
      if (root.TemporaryBattleRunner && (safeUnwrap(root.TemporaryBattleRunner.running?.()) || safeUnwrap(root.TemporaryBattleRunner.running))) {
        return root.TemporaryBattleBattle ? { battle: root.TemporaryBattleBattle, battleName: 'TemporaryBattleBattle', battleType: 'TEMPORARY' } : null;
      }
      if (root.BattleFrontierRunner && (safeUnwrap(root.BattleFrontierRunner.running?.()) || safeUnwrap(root.BattleFrontierRunner.running))) {
        return root.BattleFrontierBattle ? { battle: root.BattleFrontierBattle, battleName: 'BattleFrontierBattle', battleType: 'BATTLE_FRONTIER' } : null;
      }

      const currentGs = safeUnwrap(root.App?.game?.gameState);
      const GS = root.GameConstants?.GameState;
      if (currentGs !== undefined && GS) {
        if (currentGs === GS.dungeon) {
          return root.DungeonBattle ? { battle: root.DungeonBattle, battleName: 'DungeonBattle', battleType: 'DUNGEON' } : null;
        }
        if (currentGs === GS.gym) {
          return root.GymBattle ? { battle: root.GymBattle, battleName: 'GymBattle', battleType: 'GYM' } : null;
        }
        if (currentGs === GS.temporaryBattle) {
          return root.TemporaryBattleBattle ? { battle: root.TemporaryBattleBattle, battleName: 'TemporaryBattleBattle', battleType: 'TEMPORARY' } : null;
        }
        if (currentGs === GS.battleFrontier) {
          return root.BattleFrontierBattle ? { battle: root.BattleFrontierBattle, battleName: 'BattleFrontierBattle', battleType: 'BATTLE_FRONTIER' } : null;
        }
        if (currentGs === GS.fighting) {
          return root.Battle ? { battle: root.Battle, battleName: 'Battle', battleType: 'WILD' } : null;
        }
        // In other game states (town, paused, safari, shop, loading), no combat container is active
        return null;
      }

      if (root.Battle) {
        return { battle: root.Battle, battleName: 'Battle', battleType: 'WILD' };
      }
      return null;
    }

    /**
     * Reads current enemy status from the active battle container.
     */
    readEnemyStatus(activeBattle) {
      if (!activeBattle?.battle?.enemyPokemon) {
        return { exists: false, id: null, name: null, hp: 0, maxHp: 0, isAlive: false, isCatching: false };
      }

      const ep = safeUnwrap(activeBattle.battle.enemyPokemon);
      if (!ep) {
        return { exists: false, id: null, name: null, hp: 0, maxHp: 0, isAlive: false, isCatching: false };
      }

      const hp = Number(safeUnwrap(ep.health)) || 0;
      const maxHp = Number(safeUnwrap(ep.maxHealth)) || 0;
      const isAlive = typeof ep.isAlive === 'function' ? ep.isAlive() : hp > 0;
      const isCatching = activeBattle.battle.catching ? Boolean(safeUnwrap(activeBattle.battle.catching)) : false;

      return {
        exists: true,
        id: safeUnwrap(ep.id),
        name: safeUnwrap(ep.name) || 'Unknown',
        hp,
        maxHp,
        isAlive,
        isCatching
      };
    }

    /**
     * Evaluates whether an attack is permitted on the current tick.
     * Updates internal states deterministically.
     * 
     * @returns {Object} { canAttack: boolean, reason: string, state: string }
     */
    evaluateTick(root = (typeof window !== 'undefined' ? window : globalThis)) {
      if (this.state === BattleState.STOPPED || this.state === BattleState.IDLE) {
        return { canAttack: false, reason: 'Auto-clicker is not active', state: this.state, activeBattle: null };
      }

      const activeBattle = this.resolveActiveBattle(root);
      if (!activeBattle) {
        this.state = BattleState.WAITING_FOR_TRANSITION;
        return { canAttack: false, reason: 'No active combat encounter', state: this.state, activeBattle: null };
      }

      // Check context / battle type switch
      if (this.currentBattleType !== 'NONE' && this.currentBattleType !== activeBattle.battleType) {
        if (this.diagnostics) {
          this.diagnostics.recordBattleTypeChange(this.currentBattleType, activeBattle.battleType);
        }
        // Battle type changed: clear waiting transition state
        this.waitingStartedAt = null;
        this.isPausedForDelay = false;
        this.currentBattleType = activeBattle.battleType;
      } else {
        this.currentBattleType = activeBattle.battleType;
      }

      const enemy = this.readEnemyStatus(activeBattle);

      // Handle pauseAfterKo diagnostic experiment
      if (this.isPausedForDelay) {
        if (Date.now() < this.resumeScheduledAt) {
          return { canAttack: false, reason: 'Paused for post-KO delay experiment', state: BattleState.PAUSED };
        }
        this.isPausedForDelay = false;
      }

      // Case 1: Enemy does not exist, or enemy is dead, or game is catching pokeball
      if (!enemy.exists || !enemy.isAlive || enemy.hp <= 0 || enemy.isCatching) {
        if (this.state !== BattleState.WAITING_FOR_TRANSITION) {
          this.state = BattleState.WAITING_FOR_TRANSITION;
          this.waitingStartedAt = Date.now();
          if (this.diagnostics) {
            this.diagnostics.recordWaitingForTransition(enemy.name || this.currentEnemyName, enemy.hp, activeBattle.battleType);
          }

          // Trigger diagnostic pause if enabled
          if (this.pauseAfterKo) {
            this.state = BattleState.PAUSED;
            return { canAttack: false, reason: 'Diagnostic pause after KO', state: this.state };
          }
          if (this.postKoDelayMs > 0) {
            this.isPausedForDelay = true;
            this.resumeScheduledAt = Date.now() + this.postKoDelayMs;
            return { canAttack: false, reason: `Post-KO delay of ${this.postKoDelayMs}ms active`, state: BattleState.PAUSED };
          }
        }

        // Check for transition timeout
        if (this.waitingStartedAt && (Date.now() - this.waitingStartedAt > this.transitionTimeoutMs)) {
          this.state = BattleState.TIMEOUT;
          const elapsed = Date.now() - this.waitingStartedAt;
          if (this.diagnostics) {
            this.diagnostics.recordTransitionStalled(enemy.name || this.currentEnemyName, elapsed, activeBattle.battleType);
          }
          // Safe recovery: reset waiting timestamp so we re-evaluate on next tick without inventing Pokémon
          this.waitingStartedAt = Date.now();
          return { canAttack: false, reason: `Transition stalled (${elapsed}ms)`, state: BattleState.TIMEOUT };
        }

        return { canAttack: false, reason: 'Waiting for native enemy transition', state: BattleState.WAITING_FOR_TRANSITION };
      }

      // Case 2: A valid living enemy is present
      // Check if enemy changed (new enemy arrived)
      if (this.state === BattleState.WAITING_FOR_TRANSITION || this.state === BattleState.TIMEOUT || this.state === BattleState.PAUSED) {
        const prevName = this.currentEnemyName;
        this.currentEnemyId = enemy.id;
        this.currentEnemyName = enemy.name;
        this.waitingStartedAt = null;

        if (this.diagnostics) {
          this.diagnostics.recordEnemyTransition(prevName, enemy, activeBattle.battleType);
        }
        this.state = BattleState.READY;
      } else {
        this.currentEnemyId = enemy.id;
        this.currentEnemyName = enemy.name;
        this.state = BattleState.READY;
      }

      return {
        canAttack: true,
        reason: 'Living enemy present',
        state: BattleState.READY,
        activeBattle,
        enemy
      };
    }

    /**
     * Alias for evaluateTick for convenient testing and external callers.
     */
    evaluate(root) {
      if (this.state === BattleState.IDLE) {
        this.state = BattleState.READY;
      }
      const tickResult = this.evaluateTick(root || this.windowRef);
      return {
        ...tickResult,
        battleType: this.currentBattleType
      };
    }

    isTransitionWaiting() {
      return this.state === BattleState.WAITING_FOR_TRANSITION;
    }

    start() {
      this.state = BattleState.READY;
      this.waitingStartedAt = null;
      this.isPausedForDelay = false;
    }

    stop() {
      this.state = BattleState.STOPPED;
      this.waitingStartedAt = null;
      this.isPausedForDelay = false;
      this.currentEnemyId = null;
      this.currentEnemyName = null;
    }

    reset() {
      this.state = BattleState.IDLE;
      this.waitingStartedAt = null;
      this.isPausedForDelay = false;
      this.currentEnemyId = null;
      this.currentEnemyName = null;
      this.currentBattleType = 'NONE';
    }
  }

  return {
    BattleState,
    BattleStateMachine,
    createStateMachine: (opts) => new BattleStateMachine(opts)
  };
});
