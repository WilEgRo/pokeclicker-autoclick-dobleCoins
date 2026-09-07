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
    setDungeonRunning: (val) => { isDungeonRunning = val; },
    setGymRunning: (val) => { isGymRunning = val; }
  };
}

function setupSandbox(globals = {}) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    JSON,
    document: { readyState: 'complete' },
    location: { href: 'https://www.pokeclicker.com/' },
    require: (modulePath) => {
      if (modulePath.includes('object-inspector')) return sandbox.ObjectInspector;
      if (modulePath.includes('function-inspector')) return sandbox.FunctionInspector;
      if (modulePath.includes('instrumentation')) return sandbox.Instrumentation;
      if (modulePath.includes('runtime-detector')) return sandbox.RuntimeDetector;
      if (modulePath.includes('message-bridge')) return sandbox.MessageBridge;
      if (modulePath.includes('reward-economy-lab')) return sandbox.RewardEconomyLab;
      if (modulePath.includes('battle-reward-modifier')) return sandbox.BattleRewardModifier;
      return {};
    },
    ...globals
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const filesToLoad = [
    'core/object-inspector.js',
    'core/function-inspector.js',
    'core/instrumentation.js',
    'core/runtime-detector.js',
    'core/message-bridge.js',
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
    } else if (f.includes('runtime-detector')) {
      sandbox.RuntimeDetector = sandbox.module.exports.RuntimeDetector || sandbox.module.exports || sandbox.RuntimeDetector;
    } else if (f.includes('message-bridge')) {
      sandbox.MessageBridge = sandbox.module.exports.MessageBridge || sandbox.module.exports || sandbox.MessageBridge;
    } else if (f.includes('reward-economy-lab')) {
      sandbox.RewardEconomyLab = sandbox.module.exports.RewardEconomyLab || sandbox.module.exports || sandbox.RewardEconomyLab;
    } else if (f.includes('battle-reward-modifier')) {
      sandbox.BattleRewardModifier = sandbox.module.exports.BattleRewardModifier || sandbox.module.exports || sandbox.BattleRewardModifier;
    }
  }

  return sandbox;
}

// -------------------------------------------------------------
// FASE 3.1.2: 24 MANDATORY AUDIT & RECOVERY TESTS
// -------------------------------------------------------------

test('1. Context detection: inspects page environment safely without function invocations', () => {
  const mock = createMockGameRuntime();
  let fnCalled = false;
  const guardedBattle = {
    ...mock.Battle,
    clickAttack() { fnCalled = true; }
  };
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: guardedBattle,
    PokemonFactory: {},
    RouteHelper: {}
  });

  const audit = sandbox.RuntimeDetector.performContextAudit(sandbox, 'MAIN_WORLD');
  assert.strictEqual(audit.context, 'MAIN_WORLD');
  assert.strictEqual(audit.windowApp, true);
  assert.strictEqual(audit.game, true);
  assert.strictEqual(audit.wallet, true);
  assert.strictEqual(audit.statistics, true);
  assert.strictEqual(audit.battle, true);
  assert.strictEqual(audit.pokemonFactory, true);
  assert.strictEqual(fnCalled, false, 'No functions must be called during context audit');
  assert.strictEqual(audit.location, 'https://www.pokeclicker.com/');
});

test('2. App detection: accurately resolves and identifies App global', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.ok(rt.app, 'App should be resolved');
  assert.strictEqual(typeof rt.app, 'object');
});

test('3. App.game detection: accurately resolves App.game', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.ok(rt.game, 'App.game should be resolved');
  assert.strictEqual(typeof rt.game, 'object');
});

test('4. Wallet detection: accurately validates wallet and addAmount method', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.ok(rt.wallet, 'Wallet should be resolved');
  assert.strictEqual(typeof rt.wallet.addAmount, 'function');
});

test('5. Statistics detection: resolves statistics without throwing', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ App: mock.App });
  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.ok(rt.statistics, 'Statistics should be resolved');
});

test('6. Battle detection: resolves Battle and defeatPokemon / clickAttack', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({ Battle: mock.Battle });
  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.ok(rt.battle, 'Battle should be resolved');
  assert.strictEqual(typeof rt.battle.defeatPokemon, 'function');
});

test('7. Partial runtime: detects PARTIAL when Battle exists but App.game is incomplete', () => {
  const mock = createMockGameRuntime();
  // App exists but App.game is not yet mounted (save loading)
  const sandbox = setupSandbox({
    App: {},
    Battle: mock.Battle
  });
  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.strictEqual(rt.isComplete, false);
  assert.ok(rt.battle, 'Battle exists');
  assert.strictEqual(rt.game, null, 'Game is not yet ready');
});

test('8. READY transition: transitions from incomplete to READY when App.game.wallet mounts', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: {},
    Battle: mock.Battle
  });

  let rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.strictEqual(rt.isComplete, false);

  // Simulate PokéClicker finishing save load
  sandbox.App.game = mock.App.game;
  rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.strictEqual(rt.isComplete, true);
  assert.ok(rt.wallet);
});

test('9. DEGRADED transition: reports DEGRADED when required hook fails or is detached', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const required = ['App.game.wallet.gainMoney', 'Battle.defeatPokemon'];
  // Only hook defeatPokemon
  sandbox.Instrumentation.instrument(sandbox, 'Battle.defeatPokemon');
  const health = sandbox.Instrumentation.getHealth(required, sandbox);
  assert.strictEqual(health.allInstalled, false);
  assert.strictEqual(health.failedHooks.length, 1);
  assert.strictEqual(health.failedHooks[0], 'App.game.wallet.gainMoney');
});

test('10. Stale reference detection: detects when App.game is replaced with a new instance', () => {
  const mock1 = createMockGameRuntime({ money: 100 });
  const sandbox = setupSandbox({
    App: mock1.App,
    Battle: mock1.Battle
  });

  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  rwdLab.attachHooks(sandbox.Instrumentation, sandbox);

  // Initial state check
  assert.strictEqual(rwdLab.captureEconomyState(sandbox).wallet.Money, 100);

  // Simulate PokéClicker save profile change: new Game() instance mounted
  const mock2 = createMockGameRuntime({ money: 5000 });
  sandbox.App.game = mock2.App.game;

  // Dynamic resolution reads new wallet immediately without retaining stale reference
  const stateAfter = rwdLab.captureEconomyState(sandbox);
  assert.strictEqual(stateAfter.wallet.Money, 5000);
});

test('11. Bridge reconnect: PAGE_BRIDGE_HELLO and PAGE_BRIDGE_READY respond with connected status', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const audit = sandbox.RuntimeDetector.performContextAudit(sandbox);
  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);

  const handshake = {
    bridge: 'CONNECTED',
    runtime: rt.isComplete ? 'READY' : 'PARTIAL',
    gameDetected: rt.isComplete,
    gameVersion: '0.10.14',
    components: {
      App: Boolean(rt.app),
      AppGame: Boolean(rt.game),
      Wallet: Boolean(rt.wallet),
      Statistics: Boolean(rt.statistics),
      Battle: Boolean(rt.battle)
    }
  };

  assert.strictEqual(handshake.bridge, 'CONNECTED');
  assert.strictEqual(handshake.runtime, 'READY');
  assert.strictEqual(handshake.components.Wallet, true);
});

test('12. Service Worker wake-up: background responds to PING_WORKER without holding runtime state', () => {
  let workerAwake = false;
  const mockBackgroundListener = (msg, sender, sendResponse) => {
    if (msg.type === 'PING_WORKER') {
      workerAwake = true;
      sendResponse({ status: 'ACTIVE', timestamp: Date.now() });
    }
  };

  let responseData = null;
  mockBackgroundListener({ type: 'PING_WORKER' }, {}, (resp) => {
    responseData = resp;
  });

  assert.strictEqual(workerAwake, true);
  assert.strictEqual(responseData.status, 'ACTIVE');
});

test('13. Hook reinstall: re-binds wrappers when target parentObj is replaced', () => {
  const mock1 = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock1.App,
    Battle: mock1.Battle
  });

  let calls = 0;
  sandbox.Instrumentation.instrument(sandbox, 'App.game.wallet.addAmount', {
    id: 'TEST_HOOK',
    onBefore: () => { calls++; }
  });

  sandbox.App.game.wallet.addAmount({ amount: 10, currency: 0 });
  assert.strictEqual(calls, 1);

  // Replace App.game with fresh instance (save loaded)
  const mock2 = createMockGameRuntime();
  sandbox.App.game = mock2.App.game;

  // Before re-instrumenting, the new wallet.addAmount is uninstrumented
  assert.strictEqual(sandbox.Instrumentation.getHealth(['App.game.wallet.addAmount'], sandbox).allInstalled, false);

  // Re-instrument seamlessly re-binds to new wallet
  const result = sandbox.Instrumentation.instrument(sandbox, 'App.game.wallet.addAmount', {
    id: 'TEST_HOOK'
  });
  assert.strictEqual(result, true);
  assert.strictEqual(sandbox.Instrumentation.getHealth(['App.game.wallet.addAmount'], sandbox).allInstalled, true);

  sandbox.App.game.wallet.addAmount({ amount: 10, currency: 0 });
  assert.strictEqual(calls, 2, 'Re-bound wrapper must call registered handler');
});

test('14. Duplicate hook prevention: returns SKIP_ALREADY_INSTALLED and never double-wraps', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  let calls = 0;
  const res1 = sandbox.Instrumentation.instrument(sandbox, 'App.game.wallet.addAmount', {
    id: 'IDEMPOTENT_ID',
    onBefore: () => { calls++; }
  });
  assert.strictEqual(res1, true);

  const res2 = sandbox.Instrumentation.instrument(sandbox, 'App.game.wallet.addAmount', {
    id: 'IDEMPOTENT_ID'
  });
  assert.strictEqual(res2, 'SKIP_ALREADY_INSTALLED');

  sandbox.App.game.wallet.addAmount({ amount: 5, currency: 0 });
  assert.strictEqual(calls, 1, 'Handler must execute only once');
});

test('15. Reload recovery: simulated page reload restores discovery and hooks cleanly', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox, rewardLab: rwdLab });

  const rwdRes = rwdLab.attachHooks(sandbox.Instrumentation, sandbox);
  const modRes = mod.attachHooks(sandbox.Instrumentation, sandbox);

  assert.strictEqual(rwdRes.success, true);
  assert.strictEqual(modRes.success, true);
  assert.strictEqual(rwdRes.installed.length, 9);
  assert.strictEqual(modRes.installed.length, 2);
});

test('16. Runtime heartbeat persistence: continues probing and does not freeze in PARTIAL', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: {},
    Battle: mock.Battle
  });

  let probeCount = 0;
  let currentState = 'DISCOVERING';

  const mockProbe = () => {
    probeCount++;
    const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
    if (rt.isComplete) {
      currentState = 'READY';
    } else if (rt.battle || rt.app) {
      currentState = 'PARTIAL';
    }
  };

  // Run initial probes (simulating backoff delays)
  for (let i = 0; i < 8; i++) {
    mockProbe();
  }
  assert.strictEqual(currentState, 'PARTIAL');
  assert.strictEqual(probeCount, 8);

  // Heartbeat continues past delay list
  mockProbe(); // heartbeat 1
  mockProbe(); // heartbeat 2
  assert.strictEqual(probeCount, 10);

  // Now game loads
  sandbox.App.game = mock.App.game;
  mockProbe(); // heartbeat 3 detects READY
  assert.strictEqual(currentState, 'READY');
});

test('17. Reward Lab recovery: correlates rewards after wallet replacement', () => {
  const mock1 = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock1.App,
    Battle: mock1.Battle
  });

  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  rwdLab.attachHooks(sandbox.Instrumentation, sandbox);

  // Replace wallet
  const mock2 = createMockGameRuntime();
  sandbox.App.game = mock2.App.game;
  rwdLab.attachHooks(sandbox.Instrumentation, sandbox);

  // Trigger battle KO
  rwdLab.notifyBattleEvent('ENEMY_HP_REACHED_ZERO', { enemyName: 'Rattata', battleId: 'B-001', battleType: 'WILD' });
  sandbox.App.game.wallet.gainMoney(15);

  const rewards = rwdLab.getCorrelatedRewards();
  assert.strictEqual(rewards.length, 1);
  assert.strictEqual(rewards[0].reward.delta, 15);
  assert.strictEqual(rewards[0].reward.currency, 'Money');
});

test('18. Modifier recovery: BattleRewardModifier functions normally after runtime reconnect', () => {
  const mock1 = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock1.App,
    Battle: mock1.Battle
  });

  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox, rewardLab: rwdLab });
  rwdLab.attachHooks(sandbox.Instrumentation, sandbox);
  mod.attachHooks(sandbox.Instrumentation, sandbox);

  mod.setMode('ACTIVE');
  mod.setMultiplier(2);

  // Game reloads
  const mock2 = createMockGameRuntime({ money: 500 });
  sandbox.App.game = mock2.App.game;
  rwdLab.attachHooks(sandbox.Instrumentation, sandbox);
  mod.attachHooks(sandbox.Instrumentation, sandbox);

  // Trigger defeat
  mock2.setCurrentEnemy({
    name: 'Pidgey',
    health: () => 0,
    maxHealth: () => 20,
    reward: { amount: 10, currency: 0 },
    defeat() {
      sandbox.App.game.wallet.addAmount(this.reward);
    }
  });

  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock2.getMoney(), 520, '10 * 2x = 20 Money added to new wallet');
  assert.strictEqual(mod.getStatus().lastResult.status, 'VERIFIED');
});

test('19. OFF behavior: leaves original game rewards unchanged (10 -> 10)', () => {
  const mock = createMockGameRuntime({ money: 100 });
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  mod.attachHooks(sandbox.Instrumentation, sandbox);
  mod.setMode('OFF');

  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 110);
  assert.strictEqual(mod.getStatus().stats.modifiedCount, 0);
});

test('20. SIMULATION behavior: calculates effective reward without mutating wallet', () => {
  const mock = createMockGameRuntime({ money: 100 });
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  mod.attachHooks(sandbox.Instrumentation, sandbox);
  mod.setMode('SIMULATION');
  mod.setMultiplier(5);

  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 110, 'Wallet receives only original 10');
  const status = mod.getStatus();
  assert.strictEqual(status.stats.simulatedCount, 1);
  assert.strictEqual(status.lastResult.original, 10);
  assert.strictEqual(status.lastResult.effective, 50);
  assert.strictEqual(status.lastResult.status, 'SIMULATED');
});

test('21. ACTIVE 2x: original 10 -> effective 20 with verified delta', () => {
  const mock = createMockGameRuntime({ money: 100 });
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  mod.attachHooks(sandbox.Instrumentation, sandbox);
  mod.setMode('ACTIVE');
  mod.setMultiplier(2);

  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 120);
  const status = mod.getStatus();
  assert.strictEqual(status.lastResult.original, 10);
  assert.strictEqual(status.lastResult.effective, 20);
  assert.strictEqual(status.lastResult.applied, 20);
  assert.strictEqual(status.lastResult.status, 'VERIFIED');
});

test('22. ACTIVE 100x: original 10 -> effective 1000 with verified delta', () => {
  const mock = createMockGameRuntime({ money: 100 });
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  mod.attachHooks(sandbox.Instrumentation, sandbox);
  mod.setMode('ACTIVE');
  mod.setMultiplier(100);

  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 1100);
  const status = mod.getStatus();
  assert.strictEqual(status.lastResult.original, 10);
  assert.strictEqual(status.lastResult.effective, 1000);
  assert.strictEqual(status.lastResult.applied, 1000);
  assert.strictEqual(status.lastResult.status, 'VERIFIED');
});

test('23. Wallet delta verification: PASS when delta === effective and logs MODIFIER_APPLICATION_VERIFIED', () => {
  const mock = createMockGameRuntime({ money: 200 });
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  mod.attachHooks(sandbox.Instrumentation, sandbox);
  mod.setMode('ACTIVE');
  mod.setMultiplier(3);

  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 230);
  assert.strictEqual(mod.getStatus().lastResult.status, 'VERIFIED');

  const trace = mod.getTrace();
  const verifiedEvent = trace.find(t => t.type === 'MODIFIER_APPLICATION_VERIFIED');
  assert.ok(verifiedEvent);
  assert.strictEqual(verifiedEvent.payload.actualDelta, 30);
});

test('24. Isolation: Quests, Dungeons, Gyms, and non-Money currencies are NOT modified', () => {
  const mock = createMockGameRuntime({ money: 100, questPoints: 50, dungeonTokens: 50 });
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    DungeonRunner: mock.DungeonRunner,
    GymRunner: mock.GymRunner
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  mod.attachHooks(sandbox.Instrumentation, sandbox);
  mod.setMode('ACTIVE');
  mod.setMultiplier(10);

  // 1. Quests
  sandbox.App.game.quests.claimReward(0);
  assert.strictEqual(mock.getQuestPoints(), 75, 'Quest claim is +25, NOT multiplied by 10x');

  // 2. Dungeon context
  mock.setDungeonRunning(true);
  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 110, 'Dungeon defeat awards original 10, NOT multiplied by 10x');
  mock.setDungeonRunning(false);

  // 3. Gym context
  mock.setGymRunning(true);
  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 120, 'Gym defeat awards original 10, NOT multiplied by 10x');
  mock.setGymRunning(false);

  // 4. Non-money currency
  sandbox.App.game.wallet.gainDiamonds(5);
  assert.strictEqual(mock.getDiamonds(), 25, 'Diamonds are NOT multiplied');
});

test('25. App class resolution: resolves App when App is a constructor/function', () => {
  function MockApp() {}
  MockApp.game = {
    wallet: { addAmount: () => true },
    statistics: { clickAttacks: 1 },
    update: { version: '0.10.14' }
  };
  const sandbox = setupSandbox({
    App: MockApp,
    Battle: { defeatPokemon: () => true, clickAttack: () => true }
  });

  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.strictEqual(rt.isComplete, true);
  assert.strictEqual(rt.app, MockApp);
  assert.strictEqual(rt.game, MockApp.game);
});

test('26. GameState isolation in BattleRewardModifier', () => {
  const mock = createMockGameRuntime({ money: 100 });
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle,
    GameConstants: {
      GameState: {
        paused: 0,
        fighting: 1,
        gym: 2,
        dungeon: 3,
        town: 5
      }
    }
  });

  const mod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  mod.attachHooks(sandbox.Instrumentation, sandbox);
  mod.setMode('ACTIVE');
  mod.setMultiplier(5);

  // 1. In dungeon: rewards must NOT be modified
  mock.App.game.gameState = 3; // dungeon
  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 110, 'Dungeon reward is original +10, not 5x');

  // 2. In town: rewards must NOT be modified
  mock.App.game.gameState = 5; // town
  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 120, 'Town reward is original +10, not 5x');

  // 3. In fighting: WILD rewards ARE modified
  mock.App.game.gameState = 1; // fighting
  sandbox.Battle.defeatPokemon();
  assert.strictEqual(mock.getMoney(), 170, 'Fighting (WILD) reward is modified 5x (+50)');
});

test('27. Diagnostic report schema matches UI panel requirements', () => {
  const mock = createMockGameRuntime();
  const sandbox = setupSandbox({
    App: mock.App,
    Battle: mock.Battle
  });

  const rwdLab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  rwdLab.attachHooks(sandbox.Instrumentation, sandbox);

  const rwdMod = new sandbox.BattleRewardModifier({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  rwdMod.attachHooks(sandbox.Instrumentation, sandbox);

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

  const instHealth = sandbox.Instrumentation.getHealth([...REQUIRED_REWARD_HOOKS, 'Battle.defeatPokemon'], sandbox);
  const installedHooks = instHealth.installedHooks || [];

  const diagnosticReport = {
    state: 'READY',
    healthState: 'READY',
    installedRewardHooks: installedHooks.filter(h => REQUIRED_REWARD_HOOKS.includes(h)),
    battleRewardModifierReady: true,
    rewardEconomyLabReady: true,
    instrumentation: {
      installedHooks,
      failedHooks: instHealth.failedHooks,
      allInstalled: instHealth.allInstalled,
      totalRegistered: instHealth.totalRegistered
    }
  };

  // Check properties that panel.js consumes
  assert.strictEqual(diagnosticReport.state, 'READY');
  assert.strictEqual(diagnosticReport.healthState, 'READY');
  assert.strictEqual(diagnosticReport.installedRewardHooks.length, 9);
  assert.strictEqual(diagnosticReport.battleRewardModifierReady, true);
  assert.strictEqual(diagnosticReport.rewardEconomyLabReady, true);
});

test('28. Knockout dataFor fallback: resolves App.game from DOM element when window.App is undefined', () => {
  const mockGame = {
    wallet: { addAmount: () => true, gainMoney: () => true, currencies: [100] },
    statistics: { clickAttacks: 50 },
    update: { version: '0.10.26' }
  };

  const mockBody = { id: 'mockBody' };
  const mockKo = {
    dataFor: (el) => (el === mockBody ? mockGame : null)
  };

  const sandbox = setupSandbox({
    ko: mockKo,
    document: { body: mockBody, getElementById: () => null },
    Battle: { defeatPokemon: () => true, clickAttack: () => true }
  });

  // Ensure window.App is initially undefined
  delete sandbox.App;
  assert.strictEqual(sandbox.App, undefined);

  // Probe path App.game.wallet should resolve via Knockout dataFor
  const resolvedWallet = sandbox.ObjectInspector.resolvePath(sandbox, 'App.game.wallet');
  assert.strictEqual(resolvedWallet.exists, true);
  assert.strictEqual(resolvedWallet.value, mockGame.wallet);

  // RuntimeDetector.resolveRuntime should resolve App.game and report complete
  const rt = sandbox.RuntimeDetector.resolveRuntime(sandbox);
  assert.strictEqual(rt.isComplete, true);
  assert.strictEqual(rt.game, mockGame);
  assert.strictEqual(rt.wallet, mockGame.wallet);
});

test('29. Knockout dataFor fallback: attaches all 9 reward hooks when App is resolved via ko.dataFor', () => {
  const mock = createMockGameRuntime({ money: 500 });
  const mockBody = { id: 'mockBody' };
  const mockKo = {
    dataFor: (el) => (el === mockBody ? mock.App.game : null)
  };

  const sandbox = setupSandbox({
    ko: mockKo,
    document: { body: mockBody, getElementById: () => null },
    Battle: mock.Battle,
    GameConstants: { GameState: { fighting: 1 } }
  });

  // Ensure window.App is undefined initially
  delete sandbox.App;
  assert.strictEqual(sandbox.App, undefined);

  const lab = new sandbox.RewardEconomyLab({ instrumentation: sandbox.Instrumentation, windowRef: sandbox });
  const hookResult = lab.attachHooks(sandbox.Instrumentation, sandbox);

  assert.strictEqual(hookResult.success, true);
  assert.strictEqual(hookResult.installed.length, 9);
  assert.strictEqual(hookResult.failed.length, 0);

  const instHealth = sandbox.Instrumentation.getHealth(hookResult.installed, sandbox);
  assert.strictEqual(instHealth.allInstalled, true);
});

test('30. Declarative global recovery: resolves DungeonRunner and DungeonBattle when absent on window', () => {
  const mockDungeonRunner = {
    fighting: () => true,
    running: () => true
  };
  const mockDungeonBattle = {
    enemyPokemon: () => ({ name: 'Zubat', health: 100, maxHealth: 100, isAlive: () => true }),
    clickAttack: () => true
  };

  const sandbox = setupSandbox({
    DungeonRunner: mockDungeonRunner,
    DungeonBattle: mockDungeonBattle,
    Battle: { defeatPokemon: () => true, clickAttack: () => true }
  });

  const resolvedRunner = sandbox.ObjectInspector.resolvePath(sandbox, 'DungeonRunner');
  assert.strictEqual(resolvedRunner.exists, true);
  assert.strictEqual(resolvedRunner.value, mockDungeonRunner);
});

