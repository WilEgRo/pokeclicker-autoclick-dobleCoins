/**
 * PokéClicker Security Lab - Page Bridge (MAIN World)
 * 
 * Executes directly within the PokéClicker page JavaScript context.
 * Interfaces with game globals (App, Battle, etc.), provides reactive
 * Auto Click execution governed by BattleStateMachine, and captures
 * battle lifecycle diagnostics.
 */

(function () {
  'use strict';

  // Protect against multiple initializations
  if (window.__PSL_PAGE_BRIDGE_INITIALIZED__) {
    if (window.__PSL_PAGE_BRIDGE_INSTANCE__) {
      try {
        window.__PSL_PAGE_BRIDGE_INSTANCE__.discoveryController?.start();
        window.__PSL_PAGE_BRIDGE_INSTANCE__.bridge?.sendEvent('PAGE_BRIDGE_READY', {
          reconnected: true,
          bridge: 'CONNECTED'
        });
      } catch (_) {}
    }
    return;
  }
  window.__PSL_PAGE_BRIDGE_INITIALIZED__ = true;

  const bridge = window.MessageBridge ? window.MessageBridge.createPageBridge() : null;
  if (!bridge) {
    console.warn('[PSL] MessageBridge not available in page world.');
    return;
  }

  // Log forwarder to UI
  function logToUI(level, message, data = null) {
    bridge.sendEvent('LOG_ENTRY', {
      level,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  // Runtime Health States (FASE 3.1.1)
  const HEALTH_STATES = Object.freeze({
    NOT_INITIALIZED: 'NOT_INITIALIZED',
    DISCOVERING: 'DISCOVERING',
    PARTIAL: 'PARTIAL',
    READY: 'READY',
    DEGRADED: 'DEGRADED',
    OFFLINE: 'OFFLINE'
  });

  const REQUIRED_REWARD_HOOKS = [
    'App.game.wallet.gainMoney',
    'App.game.wallet.gainQuestPoints',
    'App.game.wallet.gainDungeonTokens',
    'App.game.wallet.gainDiamonds',
    'App.game.wallet.gainFarmPoints',
    'App.game.wallet.gainBattlePoints',
    'App.game.wallet.addAmount',
    'App.game.wallet.loseAmount',
    'App.game.quests.claimReward'
  ];

  const REQUIRED_MODIFIER_HOOKS = [
    'Battle.defeatPokemon',
    'App.game.wallet.addAmount'
  ];

  let recordingInterval = null;
  let lastSnapshot = null;

  // Singleton Context to preserve instances across page reload or re-injection
  // Singleton Context to preserve instances across page reload or re-injection
  const runtimeCtx = window.__PSL_RUNTIME_CONTEXT__ || {};
  window.__PSL_RUNTIME_CONTEXT__ = runtimeCtx;

  /**
   * Resiliently connects declarative-scoped globals (App, player, DungeonRunner, etc.)
   * and Knockout bound data (App.game) to the global window object.
   */
  function bridgeGameGlobals(root = window) {
    if (!root || (typeof root !== 'object' && typeof root !== 'function')) return;

    // 1. Bridge lexical App
    if (!root.App || !root.App.game) {
      try {
        if (typeof App !== 'undefined' && !root.App) {
          root.App = App;
        }
      } catch (_) {
        try {
          const evalApp = (0, eval)('typeof App !== "undefined" ? App : undefined');
          if (evalApp !== undefined && !root.App) root.App = evalApp;
        } catch (_) {}
      }

      // 2. Fallback to Knockout Root Binding (ko.applyBindings(App.game))
      if ((!root.App || !root.App.game) && (root.ko || (typeof window !== 'undefined' && window.ko))) {
        const koObj = root.ko || window.ko;
        const docObj = root.document || (typeof document !== 'undefined' ? document : null);
        if (koObj && docObj && typeof koObj.dataFor === 'function') {
          try {
            const candidates = [
              docObj.body,
              docObj.getElementById?.('game'),
              docObj.getElementById?.('battleContainer'),
              docObj.getElementById?.('routeBattleContainer'),
              docObj.getElementById?.('saveSelector'),
              docObj.querySelector?.('[data-bind]')
            ];
            for (const el of candidates) {
              if (el) {
                const boundData = koObj.dataFor(el);
                if (boundData && (boundData.wallet || boundData.statistics || boundData.party)) {
                  if (!root.App) root.App = {};
                  root.App.game = boundData;
                  break;
                }
              }
            }
          } catch (_) {}
        }
      }
    }

    // 3. Bridge other script-level classes/variables
    const otherGlobals = [
      'player',
      'DungeonRunner',
      'DungeonBattle',
      'GymRunner',
      'GymBattle',
      'TemporaryBattleRunner',
      'TemporaryBattleBattle',
      'BattleFrontierRunner',
      'BattleFrontierBattle',
      'TownList',
      'RouteHelper',
      'MapHelper',
      'PokemonFactory',
      'GameController',
      'Safari',
      'SafariBattle',
      'SafariPokemon'
    ];
    for (const name of otherGlobals) {
      try {
        if (typeof root[name] === 'undefined') {
          const val = (0, eval)(`typeof ${name} !== "undefined" ? ${name} : undefined`);
          if (val !== undefined) root[name] = val;
        }
      } catch (_) {}
    }
  }

  // Initial bridge pass
  bridgeGameGlobals(window);

  // Initialize Diagnostics and Battle State Machine
  const diagnostics = runtimeCtx.diagnostics || (window.BattleLifecycleDiagnostics
    ? window.BattleLifecycleDiagnostics.createDiagnostics({ maxEvents: 300 })
    : null);
  runtimeCtx.diagnostics = diagnostics;

  const stateMachine = runtimeCtx.stateMachine || (window.BattleStateMachine
    ? window.BattleStateMachine.createStateMachine({ diagnostics, transitionTimeoutMs: 3500 })
    : null);
  runtimeCtx.stateMachine = stateMachine;

  if (stateMachine && diagnostics) {
    stateMachine.setDiagnostics(diagnostics);
  }

  // Initialize Reward & Economy Lab (FASE 3)
  const rewardLab = runtimeCtx.rewardLab || (window.RewardEconomyLab
    ? window.RewardEconomyLab.createLab({
        windowRef: window,
        instrumentation: window.Instrumentation,
        diagnostics: diagnostics,
        correlationWindowMs: 2500
      })
    : null);
  runtimeCtx.rewardLab = rewardLab;

  // Initialize Controlled Battle Reward Modifier (FASE 3.1)
  const rewardModifier = runtimeCtx.rewardModifier || (window.BattleRewardModifier
    ? window.BattleRewardModifier.createModifier({
        windowRef: window,
        instrumentation: window.Instrumentation,
        rewardLab: rewardLab,
        diagnostics: diagnostics
      })
    : null);
  runtimeCtx.rewardModifier = rewardModifier;

  // Initialize Safari Lab & Catch Booster
  const safariLab = runtimeCtx.safariLab || (window.SafariLab
    ? new window.SafariLab({ windowRef: window })
    : null);
  runtimeCtx.safariLab = safariLab;

  // Connect diagnostics events with RewardLab once
  if (diagnostics && rewardLab && !diagnostics.__psl_reward_connected__) {
    diagnostics.__psl_reward_connected__ = true;
    const origLogEvent = diagnostics.logEvent.bind(diagnostics);
    diagnostics.logEvent = function (eventType, source, metadata) {
      const evt = origLogEvent(eventType, source, metadata);
      try {
        if (eventType === 'ENEMY_HP_REACHED_ZERO') {
          rewardLab.notifyBattleEvent('ENEMY_HP_REACHED_ZERO', metadata);
        } else if (eventType === 'ENEMY_CHANGED') {
          rewardLab.notifyBattleEvent('ENEMY_CHANGED', metadata);
        }
      } catch (_) {}
      return evt;
    };
  }

  /**
   * Safely resolves live game components dynamically.
   * NEVER stores stale references.
   */
  function resolveRuntime(root = window) {
    bridgeGameGlobals(root);
    if (root?.RuntimeDetector?.resolveRuntime) {
      return root.RuntimeDetector.resolveRuntime(root);
    }
    const app = ((typeof root?.App === 'object' || typeof root?.App === 'function') && root?.App !== null) ? root.App : null;
    const game = (app && (typeof app.game === 'object' || typeof app.game === 'function') && app.game !== null) ? app.game : null;
    const wallet = (game && (typeof game.wallet === 'object' || typeof game.wallet === 'function') && game.wallet !== null) ? game.wallet : null;
    const statistics = (game && (typeof game.statistics === 'object' || typeof game.statistics === 'function') && game.statistics !== null) ? game.statistics : null;
    const battle = (typeof root?.Battle === 'function' || (typeof root?.Battle === 'object' && root?.Battle !== null)) ? root.Battle : null;

    const isComplete = Boolean(
      app &&
      game &&
      wallet &&
      typeof wallet.addAmount === 'function' &&
      statistics &&
      battle &&
      typeof battle.defeatPokemon === 'function'
    );

    return {
      app,
      game,
      wallet,
      statistics,
      battle,
      isComplete
    };
  }

  /**
   * Idempotent installation of all required reward and modifier hooks.
   */
  function installAllHooks() {
    let rwdResult = { success: false, installed: [], failed: [] };
    let modResult = { success: false, installed: [], failed: [] };

    if (rewardLab && window.Instrumentation) {
      try {
        rwdResult = rewardLab.attachHooks(window.Instrumentation, window);
        if (rwdResult.installed && rwdResult.installed.length > 0) {
          for (const h of rwdResult.installed) {
            logToUI('INFO', `[INSTRUMENTATION] ${h} installed/verified`);
          }
        }
      } catch (e) {
        logToUI('WARN', `[INSTRUMENTATION] Failed attaching Reward Lab hooks: ${e.message}`);
      }
    }

    if (rewardModifier && window.Instrumentation) {
      try {
        modResult = rewardModifier.attachHooks(window.Instrumentation, window);
        if (modResult.installed && modResult.installed.length > 0) {
          for (const h of modResult.installed) {
            logToUI('INFO', `[INSTRUMENTATION] ${h} installed/verified (modifier)`);
          }
        }
      } catch (e) {
        logToUI('WARN', `[INSTRUMENTATION] Failed attaching Battle Reward Modifier hooks: ${e.message}`);
      }
    }

    if (safariLab) {
      try {
        safariLab.installHooks(window);
      } catch (e) {
        logToUI('WARN', `[SAFARI] Failed installing Safari Lab hooks: ${e.message}`);
      }
    }

    if (discoveryController) {
      discoveryController.lastHookTime = Date.now();
    }

    return {
      rwdResult,
      modResult,
      allReady: Boolean(rwdResult?.success && modResult?.success)
    };
  }

  /**
   * Evaluates the current state of PokéClicker components and hooks.
   * Section 9 criteria for READY: App, App.game, App.game.wallet, App.game.statistics, Battle.
   */
  function evaluateRuntimeHealth() {
    const rt = resolveRuntime(window);

    const isApp = Boolean(rt.app);
    const isGame = Boolean(rt.game);
    const isWallet = Boolean(rt.wallet && typeof rt.wallet.addAmount === 'function');
    const isStats = Boolean(rt.statistics);
    const isBattle = Boolean(rt.battle && typeof rt.battle.defeatPokemon === 'function');

    const coreComponentsAvailable = isApp && isGame && isWallet && isStats && isBattle;

    if (coreComponentsAvailable) {
      // Game runtime is complete! Ensure hooks are active on live target
      installAllHooks();

      const instHealth = window.Instrumentation?.getHealth
        ? window.Instrumentation.getHealth([...REQUIRED_REWARD_HOOKS, 'Battle.defeatPokemon'], window)
        : null;

      const allHooksInstalled = instHealth ? instHealth.allInstalled : true;

      if (allHooksInstalled) {
        return HEALTH_STATES.READY;
      } else {
        return HEALTH_STATES.DEGRADED;
      }
    }

    const hasAnyComponent = isApp || isBattle || Boolean(window.ko) || Boolean(window.GameConstants);
    if (hasAnyComponent) {
      return HEALTH_STATES.PARTIAL;
    }

    return HEALTH_STATES.DISCOVERING;
  }

  /**
   * Centralized Discovery Controller with Progressive Backoff & Resilient Heartbeat
   */
  class RuntimeDiscoveryController {
    constructor() {
      this.delays = [0, 250, 500, 1000, 2000, 4000, 8000, 12000];
      this.currentTimeout = null;
      this.heartbeatTimer = null;
      this.stepIndex = 0;
      this.healthState = HEALTH_STATES.NOT_INITIALIZED;
      this.isRunning = false;
      this.lastProbeTime = null;
      this.lastReadyTime = null;
      this.lastHookTime = null;
      this.probeCount = 0;
    }

    start() {
      this.cancel();
      this.stepIndex = 0;
      this.isRunning = true;
      this.healthState = HEALTH_STATES.DISCOVERING;
      logToUI('INFO', '[RUNTIME] Discovery started');
      this.scheduleNext();
    }

    cancel() {
      if (this.currentTimeout) {
        clearTimeout(this.currentTimeout);
        this.currentTimeout = null;
      }
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.isRunning = false;
    }

    ensureHeartbeat() {
      if (this.heartbeatTimer) return;
      this.heartbeatTimer = setInterval(() => {
        this.probe(true);
      }, 3000);
    }

    scheduleNext() {
      if (this.stepIndex >= this.delays.length) {
        // Do NOT abort or declare OFFLINE when game is loading! Shift to persistent heartbeat
        this.isRunning = true;
        this.ensureHeartbeat();
        return;
      }

      const delay = this.delays[this.stepIndex++];
      this.currentTimeout = setTimeout(() => {
        this.probe(false);
      }, delay);
    }

    probe(isHeartbeat = false) {
      this.lastProbeTime = Date.now();
      this.probeCount++;
      const prevState = this.healthState;
      const state = evaluateRuntimeHealth();
      this.healthState = state;

      if (state === HEALTH_STATES.PARTIAL && prevState !== HEALTH_STATES.PARTIAL) {
        logToUI('INFO', '[RUNTIME] Partial runtime detected (waiting for App.game/Wallet)...');
      }

      if (state === HEALTH_STATES.READY) {
        this.lastReadyTime = Date.now();
        if (prevState !== HEALTH_STATES.READY) {
          logToUI('INFO', '[RUNTIME] App.game detected');
          logToUI('INFO', '[RUNTIME] Wallet detected');
          logToUI('INFO', '[RUNTIME] Statistics detected');
          logToUI('INFO', '[RUNTIME] Battle detected');
          logToUI('INFO', '[RUNTIME] Runtime READY');
          this.broadcastHealth();
        }
        // Maintain a 5000ms periodic liveness heartbeat to catch runtime reload/resets
        if (!this.heartbeatTimer) {
          this.heartbeatTimer = setInterval(() => this.probe(true), 5000);
        }
        return;
      }

      if (state === HEALTH_STATES.DEGRADED) {
        if (prevState !== HEALTH_STATES.DEGRADED) {
          logToUI('WARN', '[RUNTIME] Runtime DEGRADED — attempting hook recovery');
          installAllHooks();
          this.broadcastHealth();
        }
        this.ensureHeartbeat();
        return;
      }

      // If state changed between DISCOVERING and PARTIAL, broadcast update
      if (prevState !== state) {
        this.broadcastHealth();
      }

      if (!isHeartbeat) {
        this.scheduleNext();
      }
    }

    broadcastHealth() {
      bridge.sendEvent('RUNTIME_HEALTH_CHANGED', this.getDiagnosticReport());
    }

    getDiagnosticReport() {
      const rt = resolveRuntime(window);
      const isApp = Boolean(rt.app);
      const isGame = Boolean(rt.game);
      const isWallet = Boolean(rt.wallet && typeof rt.wallet.addAmount === 'function');
      const isStats = Boolean(rt.statistics);
      const isBattle = Boolean(rt.battle && typeof rt.battle.defeatPokemon === 'function');
      const isEnemy = Boolean(rt.battle && rt.battle.enemyPokemon);

      const instHealth = window.Instrumentation?.getHealth
        ? window.Instrumentation.getHealth([...REQUIRED_REWARD_HOOKS, 'Battle.defeatPokemon'], window)
        : null;

      const installedHooks = instHealth?.installedHooks || [];
      const isRwdReady = REQUIRED_REWARD_HOOKS.every(p => installedHooks.includes(p));
      const isModReady = REQUIRED_MODIFIER_HOOKS.every(p => installedHooks.includes(p));

      return {
        state: this.healthState,
        healthState: this.healthState,
        components: {
          app: isApp,
          game: isGame,
          wallet: isWallet,
          statistics: isStats,
          battle: isBattle,
          enemyPokemon: isEnemy
        },
        installedRewardHooks: installedHooks.filter(h => REQUIRED_REWARD_HOOKS.includes(h)),
        battleRewardModifierReady: isModReady,
        rewardEconomyLabReady: isRwdReady,
        instrumentation: {
          installedHooks,
          failedHooks: instHealth?.failedHooks || [],
          allInstalled: instHealth?.allInstalled || false,
          totalRegistered: instHealth?.totalRegistered || 0
        },
        version: window.App?.game?.update?.version || window.App?.game?.version || window.GameConstants?.Version || 'unknown',
        timestamp: Date.now(),
        lastProbeTime: this.lastProbeTime,
        lastReadyTime: this.lastReadyTime,
        lastHookTime: this.lastHookTime,
        probeCount: this.probeCount
      };
    }
  }

  const discoveryController = new RuntimeDiscoveryController();
  runtimeCtx.discoveryController = discoveryController;
  discoveryController.start();

  // Auto Clicker State
  let autoClickEngine = null;
  let autoClickAttempts = 0;
  let autoClickSuccesses = 0;
  let autoClickTicker = null;

  /**
   * Safely unwraps observables or values.
   */
  function safeUnwrapVal(val) {
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

  /**
   * Identifies the current active battle system (Gym, Dungeon, Frontier, Wild).
   */
  function activeBattle() {
    if (stateMachine) {
      return stateMachine.resolveActiveBattle(window);
    }
    const currentGs = safeUnwrapVal(window.App?.game?.gameState);
    const GS = window.GameConstants?.GameState;
    if (currentGs !== undefined && GS) {
      if (currentGs === GS.dungeon) return window.DungeonBattle ? { battle: window.DungeonBattle, battleName: 'DungeonBattle', battleType: 'DUNGEON' } : null;
      if (currentGs === GS.gym) return window.GymBattle ? { battle: window.GymBattle, battleName: 'GymBattle', battleType: 'GYM' } : null;
      if (currentGs === GS.temporaryBattle) return window.TemporaryBattleBattle ? { battle: window.TemporaryBattleBattle, battleName: 'TemporaryBattleBattle', battleType: 'TEMPORARY' } : null;
      if (currentGs === GS.battleFrontier) return window.BattleFrontierBattle ? { battle: window.BattleFrontierBattle, battleName: 'BattleFrontierBattle', battleType: 'BATTLE_FRONTIER' } : null;
      if (currentGs === GS.fighting) return window.Battle ? { battle: window.Battle, battleName: 'Battle', battleType: 'WILD' } : null;
      return null;
    }
    if (window.DungeonRunner && (safeUnwrapVal(window.DungeonRunner.fighting?.()) || safeUnwrapVal(window.DungeonRunner.running?.()) || safeUnwrapVal(window.DungeonRunner.fighting) || safeUnwrapVal(window.DungeonRunner.running))) {
      return window.DungeonBattle ? { battle: window.DungeonBattle, battleName: 'DungeonBattle', battleType: 'DUNGEON' } : null;
    }
    if (window.GymRunner && (safeUnwrapVal(window.GymRunner.running?.()) || safeUnwrapVal(window.GymRunner.running))) {
      return window.GymBattle ? { battle: window.GymBattle, battleName: 'GymBattle', battleType: 'GYM' } : null;
    }
    if (window.TemporaryBattleRunner && (safeUnwrapVal(window.TemporaryBattleRunner.running?.()) || safeUnwrapVal(window.TemporaryBattleRunner.running))) {
      return window.TemporaryBattleBattle ? { battle: window.TemporaryBattleBattle, battleName: 'TemporaryBattleBattle', battleType: 'TEMPORARY' } : null;
    }
    if (window.BattleFrontierRunner && (safeUnwrapVal(window.BattleFrontierRunner.running?.()) || safeUnwrapVal(window.BattleFrontierRunner.running))) {
      return window.BattleFrontierBattle ? { battle: window.BattleFrontierBattle, battleName: 'BattleFrontierBattle', battleType: 'BATTLE_FRONTIER' } : null;
    }
    if (window.Battle && typeof window.Battle.clickAttack === 'function') {
      return { battle: window.Battle, battleName: 'Battle', battleType: 'WILD' };
    }
    return null;
  }

  /**
   * Executes a single click attack governed strictly by the BattleStateMachine.
   * NEVER attacks if the enemy is dead, null, or transitioning.
   */
  function executeClickAttack() {
    if (!stateMachine) {
      // Fallback if state machine is not loaded
      const active = activeBattle();
      if (!active) return { ok: false, error: 'No active battle' };
      try {
        active.battle.clickAttack();
        return { ok: true, battleName: active.battleName };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    const check = stateMachine.evaluateTick(window);
    if (!check.canAttack) {
      return { ok: false, reason: check.reason, state: check.state };
    }

    const active = check.activeBattle;
    let stateBefore = null;
    if (diagnostics) {
      stateBefore = diagnostics.captureBattleLifecycleState(window);
      diagnostics.recordBeforeClickAttack(stateBefore);
    }

    try {
      active.battle.clickAttack();

      if (diagnostics && stateBefore) {
        const stateAfter = diagnostics.captureBattleLifecycleState(window);
        diagnostics.recordAfterClickAttack(stateBefore, stateAfter);

        // Immediate transition check
        if (stateAfter.enemy.hp <= 0) {
          stateMachine.evaluateTick(window);
        }
      }

      return {
        ok: true,
        battleName: active.battleName,
        state: stateMachine.getState()
      };
    } catch (e) {
      if (diagnostics) {
        diagnostics.recordClickAttackError(e, stateBefore);
      }
      return { ok: false, error: e.message, state: 'ERROR' };
    }
  }

  /**
   * Reads current auto click telemetry, active battle, and state machine status.
   */
  function getAutoClickStatus() {
    const active = activeBattle();
    const stats = window.App?.game?.statistics;
    const clickAttacks = stats ? safeUnwrapVal(stats.clickAttacks) : null;
    
    const clickAttackDamage = (() => {
      try {
        const val = Number(window.App?.game?.party?.calculateClickAttack?.(true));
        return Number.isFinite(val) ? val : null;
      } catch (_) {
        return null;
      }
    })();

    let enemyInfo = { name: 'None', health: 0, maxHealth: 0 };
    if (active?.battle?.enemyPokemon) {
      const ep = safeUnwrapVal(active.battle.enemyPokemon);
      if (ep) {
        enemyInfo = {
          name: safeUnwrapVal(ep.name) || 'Unknown',
          health: safeUnwrapVal(ep.health) || 0,
          maxHealth: safeUnwrapVal(ep.maxHealth) || 0
        };
      }
    }

    const isRunning = autoClickEngine ? (autoClickEngine.timer !== null) : false;
    const cps = autoClickEngine ? autoClickEngine.getCPS() : 30;
    const machineState = stateMachine ? stateMachine.getState() : (isRunning ? 'ATTACKING' : 'IDLE');
    const metrics = diagnostics ? diagnostics.getMetrics() : null;

    return {
      running: isRunning,
      state: machineState,
      cps,
      attempts: autoClickAttempts,
      successes: autoClickSuccesses,
      battleType: active?.battleType || 'NONE',
      battleName: active?.battleName || 'None',
      clickAttacks,
      clickAttackDamage,
      enemy: enemyInfo,
      metrics
    };
  }

  function broadcastAutoClickStatus() {
    bridge.sendEvent('AUTOCLICK_STATUS', getAutoClickStatus());
  }

  // Register bridge action handlers
  bridge.registerHandler('RUN_DIAGNOSTICS', async () => {
    logToUI('INFO', 'Running comprehensive runtime diagnostics...');
    const result = window.RuntimeDiagnostics.runDiagnostics(window);
    
    if (result.gameDetected) {
      logToUI('DISCOVERY', `PokéClicker runtime detected (version: ${result.gameVersion})`);
      logToUI('DISCOVERY', `Discovered ${result.candidates.totalDiscovered} function candidate(s)`);
    } else {
      logToUI('WARNING', 'PokéClicker runtime not fully loaded or detected.');
    }
    
    return result;
  });

  bridge.registerHandler('GET_SNAPSHOT', async () => {
    const snapshot = window.RuntimeDetector.captureLiveSnapshot(window);
    logToUI('STATE', `State snapshot captured (${Object.keys(snapshot.wallet).length} wallet items, ${Object.keys(snapshot.statistics).length} stats)`);
    return snapshot;
  });

  bridge.registerHandler('INSPECT_PATH', async ({ path, options }) => {
    logToUI('INFO', `Inspecting path: ${path || 'window'}`);
    const inspection = window.ObjectInspector.inspectObject(window, path, options);
    return inspection;
  });

  bridge.registerHandler('START_RECORDING', async ({ intervalMs = 1000 }) => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
    }

    lastSnapshot = window.RuntimeDetector.captureLiveSnapshot(window);
    logToUI('INFO', `Started live change recorder (interval: ${intervalMs}ms)`);

    recordingInterval = setInterval(() => {
      try {
        const currentSnapshot = window.RuntimeDetector.captureLiveSnapshot(window);
        if (lastSnapshot && window.DiffEngine) {
          const diff = window.DiffEngine.compareSnapshots(lastSnapshot, currentSnapshot);
          if (diff.hasChanges) {
            logToUI('STATE', `Observed state changes: ${diff.summary}`);
            for (const ch of diff.changes.slice(0, 5)) {
              logToUI('STATE', `  ↳ ${ch.preview}`);
            }
            bridge.sendEvent('RECORDED_DIFF', diff);
          }
        }
        lastSnapshot = currentSnapshot;
      } catch (err) {
        logToUI('ERROR', `Error during change recording: ${err.message}`);
      }
    }, intervalMs);

    return { recording: true, intervalMs };
  });

  bridge.registerHandler('STOP_RECORDING', async () => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    logToUI('INFO', 'Stopped live change recorder');
    return { recording: false };
  });

  bridge.registerHandler('GET_MODULES', async () => {
    return window.ModuleRegistry.list();
  });

  // AUTO CLICKER HANDLERS
  bridge.registerHandler('START_AUTOCLICK', async ({ cps = 30 } = {}) => {
    if (stateMachine) {
      stateMachine.start();
    }

    if (!autoClickEngine) {
      if (window.PokeClickerAutoClicker && window.PokeClickerAutoClicker.AutoClickEngine) {
        autoClickEngine = new window.PokeClickerAutoClicker.AutoClickEngine(
          () => {
            const res = executeClickAttack();
            autoClickAttempts++;
            if (res.ok) autoClickSuccesses++;
            return res;
          },
          null
        );
      } else {
        // Fallback engine if engine.js not present
        let timer = null;
        let currentCps = cps;
        autoClickEngine = {
          timer: null,
          getCPS: () => currentCps,
          setCPS: (v) => { currentCps = Number(v); if (timer) { clearInterval(timer); timer = setInterval(() => { const r = executeClickAttack(); autoClickAttempts++; if (r.ok) autoClickSuccesses++; }, Math.max(1000 / currentCps, 34)); autoClickEngine.timer = timer; } },
          start: () => {
            if (timer) return false;
            timer = setInterval(() => { const r = executeClickAttack(); autoClickAttempts++; if (r.ok) autoClickSuccesses++; }, Math.max(1000 / currentCps, 34));
            autoClickEngine.timer = timer;
            return true;
          },
          stop: () => { if (!timer) return false; clearInterval(timer); timer = null; autoClickEngine.timer = null; return true; },
          resetStats: () => { autoClickAttempts = 0; autoClickSuccesses = 0; }
        };
      }
    }

    try {
      if (cps) autoClickEngine.setCPS(cps);
    } catch (_) {}

    autoClickEngine.start();
    logToUI('INFO', `Auto Clicker activated at ${autoClickEngine.getCPS()} CPS (Machine State: ${stateMachine?.getState() || 'READY'})`);

    if (!autoClickTicker) {
      autoClickTicker = setInterval(broadcastAutoClickStatus, 250);
    }

    const status = getAutoClickStatus();
    broadcastAutoClickStatus();
    return status;
  });

  bridge.registerHandler('STOP_AUTOCLICK', async () => {
    if (autoClickEngine) {
      autoClickEngine.stop();
    }
    if (stateMachine) {
      stateMachine.stop();
    }
    if (autoClickTicker) {
      clearInterval(autoClickTicker);
      autoClickTicker = null;
    }
    logToUI('INFO', 'Auto Clicker deactivated');
    const status = getAutoClickStatus();
    broadcastAutoClickStatus();
    return status;
  });

  bridge.registerHandler('TOGGLE_AUTOCLICK', async ({ cps } = {}) => {
    const isRunning = autoClickEngine ? (autoClickEngine.timer !== null) : false;
    if (isRunning) {
      return bridge.handlers.get('STOP_AUTOCLICK')();
    } else {
      return bridge.handlers.get('START_AUTOCLICK')({ cps });
    }
  });

  bridge.registerHandler('SET_AUTOCLICK_CPS', async ({ cps }) => {
    if (autoClickEngine) {
      autoClickEngine.setCPS(cps);
      logToUI('INFO', `Auto Clicker CPS set to ${cps}`);
    }
    return getAutoClickStatus();
  });

  bridge.registerHandler('RESET_AUTOCLICK_STATS', async () => {
    autoClickAttempts = 0;
    autoClickSuccesses = 0;
    if (autoClickEngine && typeof autoClickEngine.resetStats === 'function') {
      autoClickEngine.resetStats();
    }
    if (diagnostics) {
      diagnostics.clear();
    }
    logToUI('INFO', 'Auto Clicker session stats & battle trace reset.');
    return getAutoClickStatus();
  });

  bridge.registerHandler('GET_AUTOCLICK_STATUS', async () => {
    return getAutoClickStatus();
  });

  // BATTLE LIFECYCLE DIAGNOSTICS HANDLERS
  bridge.registerHandler('GET_BATTLE_LIFECYCLE_DIAGNOSTICS', async () => {
    if (!diagnostics) {
      return { events: [], metrics: {} };
    }
    return {
      events: diagnostics.getTimeline(),
      metrics: diagnostics.getMetrics(),
      state: stateMachine ? stateMachine.getState() : 'IDLE',
      config: diagnostics.config
    };
  });

  bridge.registerHandler('CLEAR_BATTLE_LIFECYCLE_TRACE', async () => {
    if (diagnostics) {
      diagnostics.clear();
    }
    logToUI('INFO', 'Battle lifecycle trace cleared.');
    return { cleared: true };
  });

  bridge.registerHandler('SET_BATTLE_DIAGNOSTIC_CONFIG', async (newConfig) => {
    if (diagnostics) {
      diagnostics.setConfig(newConfig);
    }
    if (stateMachine) {
      stateMachine.setConfig(newConfig);
    }
    logToUI('INFO', `Battle diagnostic config updated: ${JSON.stringify(newConfig)}`);
    return { config: diagnostics?.config };
  });

  // REWARD & ECONOMY LAB HANDLERS (FASE 3)
  bridge.registerHandler('GET_ECONOMY_STATE', async () => {
    if (!rewardLab) {
      return { timestamp: Date.now(), wallet: {} };
    }
    rewardLab.checkEconomyDrift();
    return rewardLab.captureEconomyState(window);
  });

  bridge.registerHandler('GET_REWARD_SESSION', async () => {
    if (!rewardLab) {
      return { session: null, currentEconomy: null };
    }
    rewardLab.checkEconomyDrift();
    return {
      session: rewardLab.getSessionSummary(),
      currentEconomy: rewardLab.captureEconomyState(window),
      lastReward: rewardLab.getCorrelatedRewards()[0] || null
    };
  });

  bridge.registerHandler('GET_REWARD_TRACE', async ({ filter = 'ALL' } = {}) => {
    if (!rewardLab) {
      return { trace: [] };
    }
    rewardLab.checkEconomyDrift();
    return {
      trace: rewardLab.getRewardTrace(filter),
      correlatedRewards: rewardLab.getCorrelatedRewards()
    };
  });

  bridge.registerHandler('CLEAR_REWARD_SESSION', async () => {
    if (rewardLab) {
      rewardLab.clearSession();
    }
    logToUI('INFO', 'Reward session cleared.');
    return { cleared: true };
  });

  bridge.registerHandler('CLEAR_REWARD_TRACE', async () => {
    if (rewardLab) {
      rewardLab.clearTrace();
    }
    logToUI('INFO', 'Reward trace cleared.');
    return { cleared: true };
  });

  bridge.registerHandler('SET_REWARD_LAB_OPTIONS', async (options) => {
    if (rewardLab) {
      rewardLab.setOptions(options);
    }
    logToUI('INFO', `Reward Lab options updated: ${JSON.stringify(options)}`);
    return { success: true };
  });

  bridge.registerHandler('EXPORT_REWARD_DATA', async () => {
    if (!rewardLab) {
      return { error: 'RewardLab not loaded' };
    }
    rewardLab.checkEconomyDrift();
    const labExport = rewardLab.exportJSON();
    if (rewardModifier) {
      labExport.battleRewardModifier = rewardModifier.exportData();
    }
    return labExport;
  });

  // CONTROLLED BATTLE REWARD MODIFIER HANDLERS (FASE 3.1)
  bridge.registerHandler('GET_BATTLE_REWARD_MODIFIER', async () => {
    if (!rewardModifier) {
      return {
        mode: 'OFF',
        multiplier: 1,
        context: 'WILD',
        stats: {},
        lastResult: { status: 'OFF' }
      };
    }
    return rewardModifier.getStatus();
  });

  bridge.registerHandler('SET_BATTLE_REWARD_MODIFIER', async ({ multiplier }) => {
    if (!rewardModifier) {
      return { error: 'BattleRewardModifier not loaded' };
    }
    try {
      rewardModifier.setMultiplier(Number(multiplier));
      logToUI('INFO', `Battle Reward Modifier multiplier set to ${rewardModifier.multiplier}x`);
      return rewardModifier.getStatus();
    } catch (err) {
      logToUI('WARN', `Failed to set multiplier: ${err.message}`);
      return { error: err.message, status: rewardModifier.getStatus() };
    }
  });

  bridge.registerHandler('SET_BATTLE_REWARD_MODE', async ({ mode }) => {
    if (!rewardModifier) {
      return { error: 'BattleRewardModifier not loaded' };
    }
    try {
      rewardModifier.setMode(mode);
      logToUI('INFO', `Battle Reward Modifier mode set to ${rewardModifier.mode}`);
      return rewardModifier.getStatus();
    } catch (err) {
      logToUI('WARN', `Failed to set mode: ${err.message}`);
      return { error: err.message, status: rewardModifier.getStatus() };
    }
  });

  bridge.registerHandler('SET_BATTLE_REWARD_CURRENCIES', async ({ currencies }) => {
    if (!rewardModifier) {
      return { error: 'BattleRewardModifier not loaded' };
    }
    try {
      rewardModifier.setCurrencies(currencies);
      logToUI('INFO', `Battle Reward Modifier currencies updated: ${JSON.stringify(rewardModifier.getCurrencies())}`);
      return rewardModifier.getStatus();
    } catch (err) {
      logToUI('WARN', `Failed to set currencies: ${err.message}`);
      return { error: err.message, status: rewardModifier.getStatus() };
    }
  });

  bridge.registerHandler('RESET_BATTLE_REWARD_MODIFIER', async () => {
    if (!rewardModifier) {
      return { mode: 'OFF', multiplier: 1 };
    }
    const res = rewardModifier.reset();
    logToUI('INFO', 'Battle Reward Modifier reset to OFF (1x)');
    return rewardModifier.getStatus();
  });

  bridge.registerHandler('GET_BATTLE_REWARD_TRACE', async ({ filter = 'ALL' } = {}) => {
    if (!rewardModifier) {
      return { trace: [] };
    }
    return {
      trace: rewardModifier.getTrace(filter),
      status: rewardModifier.getStatus()
    };
  });

  // SAFARI LAB HANDLERS
  bridge.registerHandler('GET_SAFARI_STATUS', async () => {
    if (!safariLab) {
      return {
        mode: 'OFF',
        multiplier: 1,
        guaranteedCatch: false,
        preventEscape: false,
        preventShinyEscape: true,
        infiniteBalls: true,
        inSafari: false,
        inBattle: false,
        currentBalls: 0,
        safariLevel: 1,
        currentEnemy: null,
        stats: { encounters: 0, catches: 0, ballsThrown: 0, fleesBlocked: 0 },
        lastEncounter: { name: '-', shiny: false, baseCatchFactor: 0, effectiveCatchFactor: 0, caught: null, timestamp: null }
      };
    }
    return safariLab.getStatus();
  });

  bridge.registerHandler('SET_SAFARI_MODE', async ({ mode }) => {
    if (!safariLab) return { error: 'SafariLab not loaded' };
    const res = safariLab.setMode(mode);
    logToUI('INFO', `Safari Lab mode set to ${mode}`);
    return res;
  });

  bridge.registerHandler('SET_SAFARI_MULTIPLIER', async ({ multiplier }) => {
    if (!safariLab) return { error: 'SafariLab not loaded' };
    const res = safariLab.setMultiplier(multiplier);
    logToUI('INFO', `Safari Lab multiplier set to ${safariLab.multiplier}x (Guaranteed: ${safariLab.multiplier >= 100})`);
    return res;
  });

  bridge.registerHandler('SET_SAFARI_OPTIONS', async (options) => {
    if (!safariLab) return { error: 'SafariLab not loaded' };
    const res = safariLab.setOptions(options);
    logToUI('INFO', `Safari Lab options updated: ${JSON.stringify(options)}`);
    return res;
  });

  bridge.registerHandler('RESET_SAFARI_STATS', async () => {
    if (!safariLab) return { error: 'SafariLab not loaded' };
    const res = safariLab.resetStats();
    logToUI('INFO', 'Safari Lab session stats reset.');
    return res;
  });

  bridge.registerHandler('RESET_SAFARI_SETTINGS', async () => {
    if (!safariLab) return { error: 'SafariLab not loaded' };
    const res = safariLab.reset();
    logToUI('INFO', 'Safari Lab settings reset to default.');
    return res;
  });

  // RUNTIME BRIDGE RECOVERY & HOOK HEALTH HANDLERS (FASE 3.1.1)
  bridge.registerHandler('RUNTIME_PING', async () => {
    logToUI('INFO', '[BRIDGE] PING');
    const report = discoveryController.getDiagnosticReport();
    logToUI('INFO', '[BRIDGE] PONG');
    return {
      pong: true,
      runtimeAvailable: report.healthState === HEALTH_STATES.READY || report.healthState === HEALTH_STATES.DEGRADED,
      appAvailable: report.components.app,
      gameAvailable: report.components.game,
      walletAvailable: report.components.wallet,
      statisticsAvailable: report.components.statistics,
      battleAvailable: report.components.battle,
      version: report.version,
      healthState: report.healthState,
      timestamp: Date.now()
    };
  });

  bridge.registerHandler('INSTRUMENTATION_HEALTH', async () => {
    const required = [...REQUIRED_REWARD_HOOKS, 'Battle.defeatPokemon'];
    const instHealth = window.Instrumentation?.getHealth
      ? window.Instrumentation.getHealth(required)
      : { installedHooks: [], failedHooks: required, duplicateHooks: [] };

    return {
      initialized: true,
      installedHooks: instHealth.installedHooks,
      failedHooks: instHealth.failedHooks,
      duplicateHooks: [],
      rewardEconomyReady: REQUIRED_REWARD_HOOKS.every(p => instHealth.installedHooks.includes(p)),
      battleRewardModifierReady: REQUIRED_MODIFIER_HOOKS.every(p => instHealth.installedHooks.includes(p)),
      healthState: discoveryController.healthState
    };
  });

  bridge.registerHandler('REFRESH_RUNTIME', async () => {
    logToUI('INFO', '[RUNTIME] Manual runtime refresh requested by user');
    discoveryController.start();
    discoveryController.probe();
    const report = discoveryController.getDiagnosticReport();

    // Also run standard diagnostic snapshot for panel
    const fullDiag = window.RuntimeDiagnostics ? window.RuntimeDiagnostics.runDiagnostics(window) : {};

    return {
      ...report,
      diagnostics: fullDiag
    };
  });

  // REAL RUNTIME HANDSHAKE & CONTEXT AUDIT (FASE 3.1.2)
  bridge.registerHandler('PAGE_BRIDGE_HELLO', async () => {
    logToUI('INFO', '[BRIDGE] PAGE_BRIDGE_HELLO received');
    return {
      bridge: 'CONNECTED',
      timestamp: Date.now()
    };
  });

  bridge.registerHandler('PAGE_BRIDGE_READY', async () => {
    const report = discoveryController.getDiagnosticReport();
    const rt = resolveRuntime(window);
    return {
      bridge: 'CONNECTED',
      runtime: report.healthState,
      gameDetected: report.healthState === HEALTH_STATES.READY,
      gameVersion: report.version,
      components: {
        App: Boolean(rt.app),
        AppGame: Boolean(rt.game),
        Wallet: Boolean(rt.wallet),
        Statistics: Boolean(rt.statistics),
        Battle: Boolean(rt.battle)
      }
    };
  });

  bridge.registerHandler('CONTEXT_AUDIT', async () => {
    logToUI('INFO', '[AUDIT] Context audit probe initiated');
    if (window.RuntimeDetector?.performContextAudit) {
      return window.RuntimeDetector.performContextAudit(window, 'MAIN_WORLD');
    }
    const typeApp = typeof window.App;
    const typeGame = (typeApp === 'object' && window.App !== null) ? typeof window.App.game : 'undefined';
    const typeWallet = (typeGame === 'object' && window.App.game !== null) ? typeof window.App.game.wallet : 'undefined';
    const typeStats = (typeGame === 'object' && window.App.game !== null) ? typeof window.App.game.statistics : 'undefined';
    const typeBattle = typeof window.Battle;
    const typeBattleClick = (typeBattle === 'function' || (typeBattle === 'object' && window.Battle !== null)) ? typeof window.Battle.clickAttack : 'undefined';
    const typePokemonFactory = typeof window.PokemonFactory;

    return {
      context: 'MAIN_WORLD',
      windowApp: typeApp !== 'undefined' && window.App !== null,
      game: typeGame !== 'undefined' && window.App?.game !== null,
      wallet: typeWallet !== 'undefined' && window.App?.game?.wallet !== null,
      statistics: typeStats !== 'undefined' && window.App?.game?.statistics !== null,
      battle: typeBattle !== 'undefined' && window.Battle !== null,
      pokemonFactory: typePokemonFactory !== 'undefined' && window.PokemonFactory !== null,
      timestamp: new Date().toISOString(),
      documentReadyState: document.readyState || 'complete',
      location: location.href || 'https://www.pokeclicker.com/'
    };
  });

  bridge.registerHandler('GET_SERVICE_WORKER_DIAGNOSTICS', async () => {
    return {
      backgroundWorkerState: 'DECOUPLED_INDEPENDENT',
      bridgeState: 'CONNECTED',
      runtimeState: discoveryController.healthState,
      lastRuntimeHeartbeat: discoveryController.lastProbeTime,
      lastSuccessfulDiscovery: discoveryController.lastReadyTime,
      lastHookInstallation: discoveryController.lastHookTime
    };
  });

  // Expose bridge instance globally in page world for soft-reload recovery
  window.__PSL_PAGE_BRIDGE_INSTANCE__ = {
    bridge,
    discoveryController,
    runtimeCtx,
    installAllHooks,
    resolveRuntime
  };

  logToUI('INFO', 'PokéClicker Security Lab Page Bridge initialized with BattleStateMachine, RewardEconomyLab, and BattleRewardModifier in MAIN world.');
  bridge.sendEvent('BRIDGE_READY', { initialized: true, bridge: 'CONNECTED' });
})();
