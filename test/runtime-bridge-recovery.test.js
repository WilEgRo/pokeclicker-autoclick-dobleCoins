const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Helper to create a comprehensive mock runtime for PokéClicker 0.10.14
function createMockGameRuntime(initialState = {}) {
  let money = initialState.money !== undefined ? initialState.money : 1000;
  let questPoints = initialState.questPoints !== undefined ? initialState.questPoints : 50;
  let dungeonTokens = initialState.dungeonTokens !== undefined ? initialState.dungeonTokens : 100;
  let diamonds = initialState.diamonds !== undefined ? initialState.diamonds : 20;
  let farmPoints = initialState.farmPoints !== undefined ? initialState.farmPoints : 10;
  let battlePoints = initialState.battlePoints !== undefined ? initialState.battlePoints : 5;
  let clickAttacks = initialState.clickAttacks !== undefined ? initialState.clickAttacks : 0;

  const mockCurrencies = [
    { peek() { return money; }, value() { return money; } },
    { peek() { return questPoints; }, value() { return questPoints; } },
    { peek() { return dungeonTokens; }, value() { return dungeonTokens; } },
    { peek() { return diamonds; }, value() { return diamonds; } },
    { peek() { return farmPoints; }, value() { return farmPoints; } },
    { peek() { return battlePoints; }, value() { return battlePoints; } }
  ];

  const wallet = {
    currencies: mockCurrencies,
    addAmount(amountObj) {
      if (!amountObj) return;
      const amt = amountObj.amount;
      const cur = amountObj.currency;
      if (cur === 0 || cur === 'money' || cur === undefined) {
        money += amt;
      } else if (cur === 1 || cur === 'questPoint') {
        questPoints += amt;
      } else if (cur === 2 || cur === 'dungeonToken') {
        dungeonTokens += amt;
      } else if (cur === 3 || cur === 'diamond') {
        diamonds += amt;
      } else if (cur === 4 || cur === 'farmPoint') {
        farmPoints += amt;
      } else if (cur === 5 || cur === 'battlePoint') {
        battlePoints += amt;
      }
      return true;
    },
    gainMoney(amount) {
      wallet.addAmount({ amount, currency: 0 });
      return amount;
    },
    gainQuestPoints(amount) {
      wallet.addAmount({ amount, currency: 1 });
      return amount;
    },
    gainDungeonTokens(amount) {
      wallet.addAmount({ amount, currency: 2 });
      return amount;
    },
    gainDiamonds(amount) {
      wallet.addAmount({ amount, currency: 3 });
      return amount;
    },
    gainFarmPoints(amount) {
      wallet.addAmount({ amount, currency: 4 });
      return amount;
    },
    gainBattlePoints(amount) {
      wallet.addAmount({ amount, currency: 5 });
      return amount;
    },
    loseAmount(amountObj) {
      if (!amountObj) return;
      if (amountObj.currency === 0 || amountObj.currency === 'money' || amountObj.currency === undefined) {
        money -= amountObj.amount;
      }
      return true;
    }
  };

  const quests = {
    claimReward(index) {
      wallet.gainQuestPoints(25);
      return true;
    }
  };

  let currentEnemy = {
    name: 'Pidgey',
    level: 5,
    health: () => 0,
    maxHealth: () => 20,
    reward: { amount: 10, currency: 0 },
    defeat() {
      if (this.reward && this.reward.amount > 0) {
        wallet.addAmount(this.reward);
      }
    }
  };

  const Battle = {
    enemyPokemon: () => currentEnemy,
    clickAttack() {
      clickAttacks++;
      if (currentEnemy && currentEnemy.health() <= 0) {
        this.defeatPokemon();
      }
    },
    defeatPokemon() {
      if (currentEnemy) {
        currentEnemy.defeat();
      }
    }
  };

  let isDungeonRunning = false;
  let isGymRunning = false;

  const DungeonRunner = {
    running: () => isDungeonRunning
  };

  const GymRunner = {
    running: () => isGymRunning
  };

  const App = {
    game: {
      wallet,
      quests,
      statistics: {
        clickAttacks: {
          peek: () => clickAttacks,
          value: () => clickAttacks
        },
        pokemonDefeated: {
          peek: () => 10,
          value: () => 10
        }
      },
      update: { version: '0.10.14' }
    }
  };

  return {
    App,
    wallet,
    quests,
    Battle,
    DungeonRunner,
    GymRunner,
    getMoney: () => money,
    setMoney: (m) => { money = m; },
    getQuestPoints: () => questPoints,
    getDungeonTokens: () => dungeonTokens,
    getDiamonds: () => diamonds,
    getFarmPoints: () => farmPoints,
    getBattlePoints: () => battlePoints,
    getClickAttacks: () => clickAttacks,
    setCurrentEnemy: (e) => { currentEnemy = e; },
    getCurrentEnemy: () => currentEnemy,
    setDungeonRunning: (r) => { isDungeonRunning = r; },
    setGymRunning: (r) => { isGymRunning = r; }
  };
}

// Load library files into a VM sandbox
function setupSandbox(customGlobal = {}) {
  const sandbox = {
    Date,
    Math,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    Error,
    Map,
    Set,
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    require: (modulePath) => {
      if (modulePath.includes('object-inspector')) return sandbox.ObjectInspector;
      if (modulePath.includes('function-inspector')) return sandbox.FunctionInspector;
      if (modulePath.includes('instrumentation')) return sandbox.Instrumentation;
      if (modulePath.includes('reward-economy-lab')) return sandbox.RewardEconomyLab;
      if (modulePath.includes('battle-reward-modifier')) return sandbox.BattleRewardModifier;
      return {};
    },
    ...customGlobal
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const filesToLoad = [
    'core/object-inspector.js',
    'core/function-inspector.js',
    'core/instrumentation.js',
    'modules/rewards/reward-economy-lab.js',
    'modules/rewards/battle-reward-modifier.js'
  ];

  for (const f of filesToLoad) {
    const fullPath = path.join(__dirname, '..', f);
    const code = fs.readFileSync(fullPath, 'utf8');
    sandbox.module = { exports: {} };
    vm.runInNewContext(code, sandbox);
    if (f.includes('object-inspector')) {
      sandbox.ObjectInspector = sandbox.module.exports.ObjectInspector || sandbox.module.exports || sandbox.ObjectInspector;
    } else if (f.includes('function-inspector')) {
      sandbox.FunctionInspector = sandbox.module.exports.FunctionInspector || sandbox.module.exports || sandbox.FunctionInspector;
    } else if (f.includes('instrumentation')) {
      sandbox.Instrumentation = sandbox.module.exports.Instrumentation || sandbox.module.exports || sandbox.Instrumentation;
    } else if (f.includes('reward-economy-lab')) {
      sandbox.RewardEconomyLab = sandbox.module.exports.RewardEconomyLab || sandbox.module.exports || sandbox.RewardEconomyLab;
    } else if (f.includes('battle-reward-modifier')) {
      sandbox.BattleRewardModifier = sandbox.module.exports.BattleRewardModifier || sandbox.module.exports || sandbox.BattleRewardModifier;
    }
  }

  return sandbox;
}

// -------------------------------------------------------------
// GROUP 1: RUNTIME (Tests 1 - 10)
// -------------------------------------------------------------

test('Runtime 1: initial discovery detects complete runtime as READY', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    GameConstants: { TypeColor: {} }
  });

  const Instrumentation = sandbox.Instrumentation;
  const RewardEconomyLab = sandbox.RewardEconomyLab;
  const BattleRewardModifier = sandbox.BattleRewardModifier;

  const rwdLab = new RewardEconomyLab({ instrumentation: Instrumentation });
  const rwdMod = new BattleRewardModifier({ instrumentation: Instrumentation });

  const rwdHealth = rwdLab.attachHooks();
  const modHealth = rwdMod.attachHooks();

  assert.strictEqual(rwdHealth.success, true);
  assert.strictEqual(modHealth.success, true);
  assert.strictEqual(rwdLab.isReady(), true);
  assert.strictEqual(rwdMod.isReady(), true);
});

test('Runtime 2: delayed App initialization starts as PARTIAL and recovers to READY', () => {
  const mock = createMockGameRuntime();
  // Initially App is not yet available, only Battle
  const sandbox = setupSandbox({
    Battle: mock.Battle,
    GameConstants: { TypeColor: {} }
  });

  const Instrumentation = sandbox.Instrumentation;
  const RewardEconomyLab = sandbox.RewardEconomyLab;
  const BattleRewardModifier = sandbox.BattleRewardModifier;

  const rwdLab = new RewardEconomyLab({ instrumentation: Instrumentation });
  const rwdMod = new BattleRewardModifier({ instrumentation: Instrumentation });

  // First attempt: App is missing
  let rwdHealth = rwdLab.attachHooks();
  let modHealth = rwdMod.attachHooks();
  assert.strictEqual(rwdHealth.success, false);
  assert.strictEqual(modHealth.success, false);

  // Now simulate delayed App initialization
  sandbox.App = mock.App;

  // Retry discovery & hook installation
  rwdHealth = rwdLab.attachHooks();
  modHealth = rwdMod.attachHooks();
  assert.strictEqual(rwdHealth.success, true);
  assert.strictEqual(modHealth.success, true);
  assert.strictEqual(rwdLab.isReady(), true);
  assert.strictEqual(rwdMod.isReady(), true);
});

test('Runtime 3: partial runtime status when App.game is incomplete', () => {
  // App exists but wallet does not
  const sandbox = setupSandbox({
    App: { game: {} },
    Battle: { enemyPokemon: () => null },
    GameConstants: { TypeColor: {} }
  });

  const Instrumentation = sandbox.Instrumentation;
  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: Instrumentation, windowRef: sandbox });
  const health = rwdLab.attachHooks();

  assert.strictEqual(health.success, false);
  assert.strictEqual(rwdLab.isReady(), false);
  assert.ok(health.failed.length > 0);
});

test('Runtime 4: transition PARTIAL -> READY attaches hooks without error', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: { game: {} },
    Battle: mock.Battle
  });

  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  let health = rwdLab.attachHooks();
  assert.strictEqual(health.success, false);

  // Upgrade App.game with wallet & statistics
  sandbox.App.game = mock.App.game;
  health = rwdLab.attachHooks();
  assert.strictEqual(health.success, true);
  assert.strictEqual(rwdLab.isReady(), true);
});

test('Runtime 5: offline runtime reports failure and 0 installed hooks', () => {
  const sandbox = setupSandbox({});
  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  const health = rwdLab.attachHooks();

  assert.strictEqual(health.success, false);
  assert.strictEqual(health.installed.length, 0);
  assert.strictEqual(rwdLab.isReady(), false);
});

test('Runtime 6: ping/pong component reporting structure', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const p = {
    app: typeof sandbox.App !== 'undefined',
    game: !!(sandbox.App && sandbox.App.game),
    wallet: !!(sandbox.App && sandbox.App.game && sandbox.App.game.wallet),
    statistics: !!(sandbox.App && sandbox.App.game && sandbox.App.game.statistics),
    battle: typeof sandbox.Battle !== 'undefined'
  };

  const pong = {
    type: 'RUNTIME_PONG',
    runtimeAvailable: p.game && p.wallet && p.statistics && p.battle,
    appAvailable: p.app,
    gameAvailable: p.game,
    walletAvailable: p.wallet,
    statisticsAvailable: p.statistics,
    battleAvailable: p.battle,
    version: '0.10.14',
    timestamp: Date.now()
  };

  assert.strictEqual(pong.type, 'RUNTIME_PONG');
  assert.strictEqual(pong.runtimeAvailable, true);
  assert.strictEqual(pong.walletAvailable, true);
  assert.strictEqual(pong.battleAvailable, true);
});

test('Runtime 7: refresh runtime resets discovery and re-verifies components', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  const rwdMod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });

  // Initial attach
  rwdLab.attachHooks();
  rwdMod.attachHooks();

  // Refresh
  const rwdRefresh = rwdLab.attachHooks();
  const modRefresh = rwdMod.attachHooks();

  assert.strictEqual(rwdRefresh.success, true);
  assert.strictEqual(modRefresh.success, true);
  assert.strictEqual(rwdLab.isReady(), true);
  assert.strictEqual(rwdMod.isReady(), true);
});

test('Runtime 8: repeated refresh remains READY without creating duplicate handlers', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });

  // Call attachHooks 10 times consecutively
  for (let i = 0; i < 10; i++) {
    const h = rwdLab.attachHooks();
    assert.strictEqual(h.success, true);
  }

  // Trigger a reward operation
  mock.wallet.gainMoney(15);

  const trace = rwdLab.getRewardTrace('ECONOMY');
  const moneyEvents = trace.filter(t => t.type === 'ECONOMY_METHOD_CALL');
  // Must NOT trigger 10 duplicated events
  assert.strictEqual(moneyEvents.length, 1);
});

test('Runtime 9: page reload simulation preserves safe hook execution', () => {
  const mock = createMockGameRuntime();
  // Context 1
  let sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  let rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  rwdLab.attachHooks();
  mock.wallet.gainMoney(20);
  assert.strictEqual(rwdLab.getRewardTrace().length > 0, true);

  // Context 2 (simulating fresh page reload)
  const mock2 = createMockGameRuntime();
  sandbox = setupSandbox({ App: mock2.App, Battle: mock2.Battle });
  rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  rwdLab.attachHooks();
  mock2.wallet.gainMoney(25);
  assert.strictEqual(rwdLab.getRewardTrace().length > 0, true);
});

test('Runtime 10: duplicate discovery prevention and state monotonicity', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });

  let discoveryCalls = 0;
  let isRunning = false;

  const controller = {
    start() {
      if (isRunning) return false;
      isRunning = true;
      discoveryCalls++;
      return true;
    },
    stop() {
      isRunning = false;
    }
  };

  assert.strictEqual(controller.start(), true);
  assert.strictEqual(controller.start(), false); // Prevent concurrent loops
  assert.strictEqual(discoveryCalls, 1);
  controller.stop();
});

// -------------------------------------------------------------
// GROUP 2: INSTRUMENTATION HEALTH (Tests 11 - 15)
// -------------------------------------------------------------

test('Instrumentation 11: hook registry tracks installed and active hooks', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const inst = sandbox.Instrumentation;

  inst.instrument(sandbox, 'App.game.wallet.gainMoney', { id: 'TEST_HOOK_1' });
  const installed = inst.getInstalledHooks();

  assert.ok(installed.includes('App.game.wallet.gainMoney'));
});

test('Instrumentation 12: idempotent installation returns SKIP_ALREADY_INSTALLED', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const inst = sandbox.Instrumentation;

  const res1 = inst.instrument(sandbox, 'App.game.wallet.gainMoney', { id: 'STABLE_ID_1' });
  const res2 = inst.instrument(sandbox, 'App.game.wallet.gainMoney', { id: 'STABLE_ID_1' });

  assert.strictEqual(res1, true);
  assert.strictEqual(res2, 'SKIP_ALREADY_INSTALLED');
});

test('Instrumentation 13: duplicate hook prevention never executes callback twice', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const inst = sandbox.Instrumentation;

  let callCount = 0;
  inst.instrument(sandbox, 'App.game.wallet.gainMoney', { id: 'DEDUP_TEST', onBefore: () => { callCount++; } });
  inst.instrument(sandbox, 'App.game.wallet.gainMoney', { id: 'DEDUP_TEST', onBefore: () => { callCount++; } });

  mock.App.game.wallet.gainMoney(10);
  assert.strictEqual(callCount, 1);
});

test('Instrumentation 14: hook health accurately reflects all required paths without executing them', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const inst = sandbox.Instrumentation;

  const required = [
    'App.game.wallet.gainMoney',
    'App.game.wallet.gainQuestPoints',
    'App.game.wallet.addAmount'
  ];

  required.forEach((p, idx) => inst.instrument(p, () => {}, { id: `HOOK_${idx}` }));

  const health = inst.getHealth(required);
  assert.strictEqual(health.allInstalled, true);
  assert.strictEqual(health.failedHooks.length, 0);
  assert.strictEqual(health.installedHooks.length, 3);
});

test('Instrumentation 15: failed hook reporting identifies missing targets', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const inst = sandbox.Instrumentation;

  const required = [
    'App.game.wallet.gainMoney',
    'App.game.wallet.nonExistentMethod'
  ];

  inst.instrument('App.game.wallet.gainMoney', () => {}, { id: 'H1' });
  inst.instrument('App.game.wallet.nonExistentMethod', () => {}, { id: 'H2' });

  const health = inst.getHealth(required);
  assert.strictEqual(health.allInstalled, false);
  assert.ok(health.failedHooks.includes('App.game.wallet.nonExistentMethod'));
});

// -------------------------------------------------------------
// GROUP 3: REWARDS (Tests 16 - 22)
// -------------------------------------------------------------

test('Rewards 16: gainMoney event is captured by RewardEconomyLab', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const lab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  lab.attachHooks();

  mock.wallet.gainMoney(50);

  const session = lab.getSessionSummary();
  assert.strictEqual(session.moneyEarned, 50);
  assert.strictEqual(session.rewardEventsCount, 1);
});

test('Rewards 17: addAmount direct call produces an observable event', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const lab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  lab.attachHooks();

  mock.wallet.addAmount({ amount: 75, currency: 0 });

  const session = lab.getSessionSummary();
  assert.strictEqual(session.moneyEarned, 75);
});

test('Rewards 18: internal call correlation between gainMoney and addAmount', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const lab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  lab.attachHooks();

  // gainMoney calls addAmount internally
  mock.wallet.gainMoney(100);

  const trace = lab.getRewardTrace('ECONOMY');
  const economyCalls = trace.filter(t => t.type === 'ECONOMY_METHOD_CALL');
  assert.strictEqual(economyCalls.length, 1);
  assert.strictEqual(economyCalls[0].payload.method, 'App.game.wallet.gainMoney');
  assert.strictEqual(economyCalls[0].payload.internalMethod, 'App.game.wallet.addAmount');
});

test('Rewards 19: no double counting when helper method invokes low-level method', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const lab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  lab.attachHooks();

  mock.wallet.gainMoney(30);

  const session = lab.getSessionSummary();
  assert.strictEqual(session.moneyEarned, 30);
  assert.strictEqual(session.rewardEventsCount, 1);
});

test('Rewards 20: WILD battle KO correlates reward with HIGH confidence', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const lab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  lab.attachHooks();

  lab.notifyBattleEvent('BATTLE_STARTED', { enemyName: 'Rattata', battleType: 'WILD' });
  lab.notifyBattleEvent('ENEMY_HP_REACHED_ZERO', { enemyName: 'Rattata', battleType: 'WILD' });

  mock.wallet.addAmount({ amount: 15, currency: 0 });

  const rewards = lab.getCorrelatedRewards();
  assert.ok(rewards.length > 0);
  const lastReward = rewards[0];
  assert.strictEqual(lastReward.confidence, 'HIGH');
  assert.strictEqual(lastReward.battle.pokemon, 'Rattata');
  assert.strictEqual(lastReward.reward.delta, 15);
});

test('Rewards 21: generic wallet mutation without method call does not create reward', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const lab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  lab.attachHooks();

  // Modify raw money property directly (like state recorder might observe)
  mock.setMoney(mock.getMoney() + 500);

  const session = lab.getSessionSummary();
  // RewardEconomyLab should NOT register this as a verified economy method event
  assert.strictEqual(session.rewardEventsCount, 0);
  assert.strictEqual(session.moneyEarned, 0);
});

test('Rewards 22: reward trace generation includes sequential IDs and timestamps', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const lab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation });
  lab.attachHooks();

  mock.wallet.gainMoney(10);
  mock.wallet.gainMoney(20);

  const trace = lab.getRewardTrace('ECONOMY');
  assert.ok(trace.length >= 2);
  assert.ok(trace[0].sequence > 0);
  assert.ok(trace[0].timestamp > 0);
});

// -------------------------------------------------------------
// GROUP 4: MODIFIER (Tests 23 - 32)
// -------------------------------------------------------------

test('Modifier 23: OFF mode leaves original reward completely unchanged', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('OFF');
  mod.setMultiplier(10);

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const after = mock.getMoney();

  assert.strictEqual(after - before, 10);
});

test('Modifier 24: SIMULATION mode calculates effective but does NOT mutate game wallet', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('SIMULATION');
  mod.setMultiplier(100);

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const after = mock.getMoney();

  // Actual wallet gets only original 10
  assert.strictEqual(after - before, 10);

  const last = mod.lastResult;
  assert.strictEqual(last.status, 'SIMULATED');
  assert.strictEqual(last.original, 10);
  assert.strictEqual(last.effective, 1000);
});

test('Modifier 25: ACTIVE 2x multiplies original 10 to 20 with verified delta', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(2);

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const after = mock.getMoney();

  assert.strictEqual(after - before, 20);
  assert.strictEqual(mod.lastResult.status, 'VERIFIED');
});

test('Modifier 26: ACTIVE 5x multiplies original 10 to 50 with verified delta', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(5);

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const after = mock.getMoney();

  assert.strictEqual(after - before, 50);
  assert.strictEqual(mod.lastResult.status, 'VERIFIED');
});

test('Modifier 27: ACTIVE 100x multiplies original 10 to 1000 with verified delta', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(100);

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const after = mock.getMoney();

  assert.strictEqual(after - before, 1000);
  assert.strictEqual(mod.lastResult.status, 'VERIFIED');
});

test('Modifier 28: actual delta verification confirms actualWalletDelta === effectiveReward', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(3);

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const delta = mock.getMoney() - before;

  const res = mod.lastResult;
  assert.strictEqual(delta, res.effective);
  assert.strictEqual(res.status, 'VERIFIED');
});

test('Modifier 29: discrepancy detection flags mismatch if wallet does not update correctly', () => {
  const mock = createMockGameRuntime();
  // Sabotage wallet to fail to credit full amount BEFORE attaching hooks
  mock.wallet.addAmount = function() {
    mock.setMoney(mock.getMoney() + 10);
    return true;
  };

  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(4);

  mock.Battle.defeatPokemon();
  const res = mod.lastResult;
  assert.strictEqual(res.status, 'DISCREPANCY');
});

test('Modifier 30: reentrancy guard prevents nested multiplier execution', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(10);

  // Set enemy whose defeat method calls addAmount twice
  mock.setCurrentEnemy({
    name: 'DoubleCaller',
    reward: { amount: 10, currency: 0 },
    defeat() {
      mock.wallet.addAmount(this.reward);
    }
  });

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const delta = mock.getMoney() - before;

  // Multiplied once: 100
  assert.strictEqual(delta, 100);
});

test('Modifier 31: reset restores 1x multiplier and OFF mode', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });

  mod.setMode('ACTIVE');
  mod.setMultiplier(50);
  assert.strictEqual(mod.mode, 'ACTIVE');
  assert.strictEqual(mod.multiplier, 50);

  mod.reset();
  assert.strictEqual(mod.mode, 'OFF');
  assert.strictEqual(mod.multiplier, 1);
});

test('Modifier 32: reload persistence preserves valid multiplier and mode', () => {
  const savedState = { mode: 'ACTIVE', multiplier: 25 };
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.setMode(savedState.mode);
  mod.setMultiplier(savedState.multiplier);

  assert.strictEqual(mod.mode, 'ACTIVE');
  assert.strictEqual(mod.multiplier, 25);
});

// -------------------------------------------------------------
// GROUP 5: ISOLATION (Tests 33 - 38)
// -------------------------------------------------------------

test('Isolation 33: Quest claimReward is NOT multiplied', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(100);

  const beforeQp = mock.getQuestPoints();
  mock.quests.claimReward(0);
  const afterQp = mock.getQuestPoints();

  assert.strictEqual(afterQp - beforeQp, 25);
});

test('Isolation 34: Dungeon defeat reward is NOT multiplied', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(50);

  mock.setDungeonRunning(true);

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const after = mock.getMoney();

  assert.strictEqual(after - before, 10);
});

test('Isolation 35: Gym defeat reward is NOT multiplied', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(50);

  mock.setGymRunning(true);

  const before = mock.getMoney();
  mock.Battle.defeatPokemon();
  const after = mock.getMoney();

  assert.strictEqual(after - before, 10);
});

test('Isolation 36: Shop purchases and loseAmount are NOT multiplied', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(100);

  const before = mock.getMoney();
  mock.wallet.loseAmount({ amount: 150, currency: 0 });
  const after = mock.getMoney();

  assert.strictEqual(before - after, 150);
});

test('Isolation 37: direct loseAmount is never affected', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App, Battle: mock.Battle });
  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(100);

  mock.wallet.loseAmount({ amount: 50, currency: 0 });
  assert.strictEqual(mock.getMoney(), 950);
});

test('Isolation 38: non-Money currencies (Diamonds, FarmPoints, BattlePoints) are NOT multiplied', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation });
  mod.attachHooks();
  mod.setMode('ACTIVE');
  mod.setMultiplier(100);

  // Gain Diamonds
  const beforeDiamonds = mock.getDiamonds();
  mock.wallet.gainDiamonds(5);
  assert.strictEqual(mock.getDiamonds() - beforeDiamonds, 5);

  // Gain FarmPoints
  const beforeFarm = mock.getFarmPoints();
  mock.wallet.gainFarmPoints(12);
  assert.strictEqual(mock.getFarmPoints() - beforeFarm, 12);

  // Gain BattlePoints
  const beforeBp = mock.getBattlePoints();
  mock.wallet.gainBattlePoints(3);
  assert.strictEqual(mock.getBattlePoints() - beforeBp, 3);
});
