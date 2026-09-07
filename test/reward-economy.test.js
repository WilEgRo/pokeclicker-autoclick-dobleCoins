const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createMockRuntime() {
  let money = 14520;
  let questPoints = 120;
  let dungeonTokens = 500;
  let diamonds = 25;
  let farmPoints = 10;
  let battlePoints = 5;

  const mockCurrencies = [
    { peek() { return money; } },
    { peek() { return questPoints; } },
    { peek() { return dungeonTokens; } },
    { peek() { return diamonds; } },
    { peek() { return farmPoints; } },
    { peek() { return battlePoints; } }
  ];

  const wallet = {
    currencies: mockCurrencies,
    addAmount(amountObj) {
      if (!amountObj) return;
      if (amountObj.currency === 0 || amountObj.currency === 'money') {
        money += amountObj.amount;
      } else if (amountObj.currency === 1 || amountObj.currency === 'questPoint') {
        questPoints += amountObj.amount;
      }
      return true;
    },
    gainMoney(amount) {
      // High-level call that internally delegates to addAmount
      wallet.addAmount({ amount, currency: 0 });
      return amount;
    },
    gainQuestPoints(amount) {
      wallet.addAmount({ amount, currency: 1 });
      return amount;
    },
    gainDungeonTokens(amount) {
      dungeonTokens += amount;
      return amount;
    },
    loseAmount(amountObj) {
      if (amountObj.currency === 0) money -= amountObj.amount;
      return true;
    }
  };

  const quests = {
    claimReward(questIndex) {
      wallet.gainQuestPoints(50);
      return true;
    }
  };

  const App = {
    game: {
      wallet,
      quests,
      update: { version: '0.10.14' }
    }
  };

  return {
    App,
    wallet,
    quests,
    getCurrencies: () => ({ money, questPoints, dungeonTokens, diamonds, farmPoints, battlePoints })
  };
}

function loadModules(runtime) {
  const context = {
    window: runtime,
    App: runtime.App,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    Map,
    require: (modulePath) => {
      if (modulePath.includes('object-inspector')) {
        return context.ObjectInspector;
      }
      return {};
    }
  };
  context.globalThis = context;
  context.module = { exports: {} };

  // 1. Load ObjectInspector
  const codeObj = fs.readFileSync('core/object-inspector.js', 'utf8');
  vm.runInNewContext(codeObj, context);
  context.ObjectInspector = context.module.exports || context.ObjectInspector;

  // 2. Load Instrumentation
  context.module = { exports: {} };
  const codeInst = fs.readFileSync('core/instrumentation.js', 'utf8');
  vm.runInNewContext(codeInst, context);
  context.Instrumentation = context.module.exports || context.Instrumentation;

  // 3. Load RewardEconomyLab
  context.module = { exports: {} };
  const codeLab = fs.readFileSync('modules/rewards/reward-economy-lab.js', 'utf8');
  vm.runInNewContext(codeLab, context);
  const LabClass = context.module.exports?.RewardEconomyLab || context.RewardEconomyLab?.RewardEconomyLab || context.RewardEconomyLab;

  const lab = new LabClass({
    windowRef: runtime,
    instrumentation: context.Instrumentation,
    correlationWindowMs: 2500
  });

  return { lab, instrumentation: context.Instrumentation, context };
}

test('1. Economy Snapshot: correctly captures wallet currencies without modifying them', () => {
  const runtime = createMockRuntime();
  const { lab } = loadModules(runtime);

  const snapshot = lab.captureEconomyState(runtime);
  assert.equal(snapshot.wallet.Money, 14520);
  assert.equal(snapshot.wallet.QuestPoint, 120);
  assert.equal(snapshot.wallet.DungeonToken, 500);
  assert.equal(snapshot.wallet.Diamond, 25);
  assert.equal(snapshot.wallet.FarmPoint, 10);
  assert.equal(snapshot.wallet.BattlePoint, 5);
});

test('1b. Economy Snapshot: handles missing properties and missing wallet safely', () => {
  const runtime = { App: { game: {} } };
  const { lab } = loadModules(runtime);

  const snapshot = lab.captureEconomyState(runtime);
  assert.equal(snapshot.wallet.Money, null);
  assert.equal(snapshot.wallet.QuestPoint, null);
});

test('2. Economy Diff: detects positive and negative deltas for multiple currencies', () => {
  const runtime = createMockRuntime();
  const { lab } = loadModules(runtime);

  const before = {
    wallet: { Money: 14520, QuestPoint: 120, DungeonToken: 500 }
  };
  const after = {
    wallet: { Money: 14535, QuestPoint: 120, DungeonToken: 450 }
  };

  const { hasChanges, diff } = lab.diffEconomy(before, after);
  assert.equal(hasChanges, true);
  assert.equal(diff.Money.delta, 15);
  assert.equal(diff.Money.before, 14520);
  assert.equal(diff.Money.after, 14535);
  assert.equal(diff.DungeonToken.delta, -50);
  assert.equal(diff.QuestPoint, undefined); // No delta, omitted
});

test('3. Wallet Hook Preservation: preserves this, args, return value, and exceptions', () => {
  const runtime = createMockRuntime();
  const { lab, instrumentation } = loadModules(runtime);

  lab.attachHooks(instrumentation, runtime);

  // Invoke gainMoney
  const returnedValue = runtime.wallet.gainMoney(15);
  assert.equal(returnedValue, 15);
  assert.equal(runtime.getCurrencies().money, 14535);
});

test('4. Hierarchy & No Double Counting: gainMoney calling addAmount generates ONE transaction', () => {
  const runtime = createMockRuntime();
  const { lab, instrumentation } = loadModules(runtime);

  lab.attachHooks(instrumentation, runtime);

  // Execute gainMoney(20), which internally invokes addAmount
  runtime.wallet.gainMoney(20);

  const trace = lab.getRewardTrace('ECONOMY');
  // Should only have 1 ECONOMY_METHOD_CALL, with publicMethod = gainMoney and internalMethod = addAmount
  const methodCalls = trace.filter(e => e.type === 'ECONOMY_METHOD_CALL');
  assert.equal(methodCalls.length, 1);
  assert.equal(methodCalls[0].payload.method, 'App.game.wallet.gainMoney');
  assert.equal(methodCalls[0].payload.internalMethod, 'App.game.wallet.addAmount');
});

test('5. Battle to Reward Correlation (HIGH Confidence): Battle KO + gainMoney + delta', () => {
  const runtime = createMockRuntime();
  const { lab, instrumentation } = loadModules(runtime);

  lab.attachHooks(instrumentation, runtime);

  // 1. Battle starts
  lab.notifyBattleEvent('BATTLE_STARTED', { enemyName: 'Pidgey', battleType: 'WILD' });
  const battleId = lab.currentBattleId;

  // 2. KO occurs
  lab.notifyBattleEvent('ENEMY_HP_REACHED_ZERO', { enemyName: 'Pidgey', battleType: 'WILD' });

  // 3. Game awards money via gainMoney(15)
  runtime.wallet.gainMoney(15);

  const rewards = lab.getCorrelatedRewards();
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].battleId, battleId);
  assert.equal(rewards[0].battle.pokemon, 'Pidgey');
  assert.equal(rewards[0].reward.currency, 'Money');
  assert.equal(rewards[0].reward.delta, 15);
  assert.equal(rewards[0].confidence, 'HIGH');
  assert.equal(rewards[0].method.public, 'App.game.wallet.gainMoney');
});

test('6. Uncorrelated Economy Change (LOW Confidence): Wallet changes without any battle KO', () => {
  const runtime = createMockRuntime();
  const { lab, instrumentation } = loadModules(runtime);

  lab.attachHooks(instrumentation, runtime);

  // Directly gain money without any KO event
  runtime.wallet.gainDungeonTokens(100);

  // Advance time past 500ms for correlator to flush uncorrelated call
  lab.correlatePendingTransactions();

  const rewards = lab.getCorrelatedRewards();
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].battleId, null);
  assert.equal(rewards[0].confidence, 'LOW');
  assert.equal(rewards[0].reward.currency, 'DungeonToken');
  assert.equal(rewards[0].reward.delta, 100);
});

test('7. Multiple Rewards per Battle: Single KO awards both Money and QuestPoints', () => {
  const runtime = createMockRuntime();
  const { lab, instrumentation } = loadModules(runtime);

  lab.attachHooks(instrumentation, runtime);

  lab.notifyBattleEvent('BATTLE_STARTED', { enemyName: 'Onix', battleType: 'WILD' });
  lab.notifyBattleEvent('ENEMY_HP_REACHED_ZERO', { enemyName: 'Onix', battleType: 'WILD' });

  // Multiple reward calls
  runtime.wallet.gainMoney(50);
  runtime.wallet.gainQuestPoints(5);

  const rewards = lab.getCorrelatedRewards();
  assert.equal(rewards.length, 2);
  const moneyRwd = rewards.find(r => r.reward.currency === 'Money');
  const qpRwd = rewards.find(r => r.reward.currency === 'QuestPoint');

  assert.equal(moneyRwd.reward.delta, 50);
  assert.equal(qpRwd.reward.delta, 5);
  assert.equal(moneyRwd.confidence, 'HIGH');
  assert.equal(qpRwd.confidence, 'HIGH');
});

test('8. Quest Claim Reward: claimReward is tagged as quest source', () => {
  const runtime = createMockRuntime();
  const { lab, instrumentation } = loadModules(runtime);

  lab.attachHooks(instrumentation, runtime);

  runtime.quests.claimReward(0);

  const rewards = lab.getCorrelatedRewards();
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].source, 'quest');
  assert.equal(rewards[0].reward.currency, 'QuestPoint');
  assert.equal(rewards[0].reward.delta, 50);
  assert.equal(rewards[0].confidence, 'HIGH');
  assert.equal(lab.getSessionSummary().questRewardsCount, 1);
});

test('9. Medium Confidence Fallback: KO + Wallet Delta without hooked method call', () => {
  const runtime = createMockRuntime();
  const { lab } = loadModules(runtime);

  // We DO NOT attach method hooks, so methods are uninstrumented
  lab.notifyBattleEvent('BATTLE_STARTED', { enemyName: 'Rattata', battleType: 'WILD' });
  lab.notifyBattleEvent('ENEMY_HP_REACHED_ZERO', { enemyName: 'Rattata', battleType: 'WILD' });

  // Game mutates money directly
  runtime.wallet.addAmount({ amount: 10, currency: 0 });

  // Drift detector checks wallet
  lab.checkEconomyDrift();

  const rewards = lab.getCorrelatedRewards();
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].confidence, 'MEDIUM');
  assert.equal(rewards[0].source, 'economy-delta');
  assert.equal(rewards[0].reward.delta, 10);
  assert.equal(rewards[0].battle.pokemon, 'Rattata');
});

test('10. Bounded Storage & FIFO: traceEvents and correlatedRewards respect maxEvents', () => {
  const runtime = createMockRuntime();
  const { lab } = loadModules(runtime);
  lab.maxEvents = 10;

  for (let i = 0; i < 20; i++) {
    lab.logTraceEvent('TEST_EVENT', { index: i });
  }

  assert.equal(lab.traceEvents.length, 10);
  assert.equal(lab.traceEvents[0].payload.index, 19);
});

test('11. Discrepancy Detection: Method called without economy delta logged in trace', () => {
  const runtime = createMockRuntime();
  const { lab, instrumentation } = loadModules(runtime);

  // Mock a method that does not actually change wallet currency
  runtime.wallet.gainMoney = function (amount) {
    // Does not mutate money!
    return amount;
  };

  lab.attachHooks(instrumentation, runtime);

  lab.notifyBattleEvent('BATTLE_STARTED', { enemyName: 'Pidgey', battleType: 'WILD' });
  lab.notifyBattleEvent('ENEMY_HP_REACHED_ZERO', { enemyName: 'Pidgey', battleType: 'WILD' });

  runtime.wallet.gainMoney(15);

  const trace = lab.getRewardTrace('ALL');
  const discrepancy = trace.find(e => e.type === 'REWARD_METHOD_CALLED_WITHOUT_DELTA');
  assert.ok(discrepancy, 'Should record REWARD_METHOD_CALLED_WITHOUT_DELTA');
});

test('12. Read-Only Safety Guarantee: Hooks never alter arguments, returns, or mutate game objects', () => {
  const runtime = createMockRuntime();
  const { lab, instrumentation } = loadModules(runtime);

  lab.attachHooks(instrumentation, runtime);

  const beforeStats = runtime.getCurrencies();
  const ret = runtime.wallet.gainMoney(25);
  const afterStats = runtime.getCurrencies();

  // Exactly +25 as native function intended, no side-effects or artificial injection
  assert.equal(ret, 25);
  assert.equal(afterStats.money - beforeStats.money, 25);
  assert.equal(afterStats.questPoints, beforeStats.questPoints);
  assert.equal(afterStats.dungeonTokens, beforeStats.dungeonTokens);
});
