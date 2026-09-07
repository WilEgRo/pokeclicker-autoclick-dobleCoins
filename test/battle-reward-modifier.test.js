const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createMockRuntime() {
  let money = 1000;
  let questPoints = 50;
  let dungeonTokens = 100;
  let clickAttacks = 0;

  const mockCurrencies = [
    { peek() { return money; }, value() { return money; } },
    { peek() { return questPoints; }, value() { return questPoints; } },
    { peek() { return dungeonTokens; }, value() { return dungeonTokens; } }
  ];

  const wallet = {
    currencies: mockCurrencies,
    addAmount(amountObj) {
      if (!amountObj) return;
      if (amountObj.currency === 0 || amountObj.currency === 'money' || amountObj.currency === undefined) {
        money += amountObj.amount;
      } else if (amountObj.currency === 1 || amountObj.currency === 'questPoint') {
        questPoints += amountObj.amount;
      } else if (amountObj.currency === 2 || amountObj.currency === 'dungeonToken') {
        dungeonTokens += amountObj.amount;
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
    loseAmount(amountObj) {
      if (!amountObj) return true;
      if (amountObj.currency === 0 || amountObj.currency === 'money' || amountObj.currency === undefined) money -= amountObj.amount;
      if (amountObj.currency === 1 || amountObj.currency === 'questPoint') questPoints -= amountObj.amount;
      if (amountObj.currency === 2 || amountObj.currency === 'dungeonToken') dungeonTokens -= amountObj.amount;
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
      if (this.reward.amount > 0) {
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

  const DungeonRunner = {
    running: () => false
  };

  const GymRunner = {
    running: () => false
  };

  const App = {
    game: {
      wallet,
      quests,
      statistics: {
        clickAttacks: {
          peek: () => clickAttacks,
          value: () => clickAttacks
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
    getQuestPoints: () => questPoints,
    getDungeonTokens: () => dungeonTokens,
    getClickAttacks: () => clickAttacks,
    setCurrentEnemy: (e) => { currentEnemy = e; },
    getCurrentEnemy: () => currentEnemy
  };
}

function loadModules(runtime) {
  const context = {
    window: runtime,
    App: runtime.App,
    Battle: runtime.Battle,
    DungeonRunner: runtime.DungeonRunner,
    GymRunner: runtime.GymRunner,
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
    Error,
    Map,
    require: (modulePath) => {
      if (modulePath.includes('object-inspector')) return context.ObjectInspector;
      return {};
    }
  };
  context.globalThis = context;
  context.module = { exports: {} };

  // 1. ObjectInspector
  const codeObj = fs.readFileSync('core/object-inspector.js', 'utf8');
  vm.runInNewContext(codeObj, context);
  context.ObjectInspector = context.module.exports || context.ObjectInspector;

  // 2. Instrumentation
  context.module = { exports: {} };
  const codeInst = fs.readFileSync('core/instrumentation.js', 'utf8');
  vm.runInNewContext(codeInst, context);
  context.Instrumentation = context.module.exports || context.Instrumentation;

  // 3. RewardEconomyLab
  context.module = { exports: {} };
  const codeLab = fs.readFileSync('modules/rewards/reward-economy-lab.js', 'utf8');
  vm.runInNewContext(codeLab, context);
  const LabClass = context.module.exports?.RewardEconomyLab || context.RewardEconomyLab?.RewardEconomyLab || context.RewardEconomyLab;

  // 4. BattleRewardModifier
  context.module = { exports: {} };
  const codeMod = fs.readFileSync('modules/rewards/battle-reward-modifier.js', 'utf8');
  vm.runInNewContext(codeMod, context);
  const ModClass = context.module.exports?.BattleRewardModifier || context.BattleRewardModifier?.BattleRewardModifier || context.BattleRewardModifier;

  const lab = new LabClass({
    windowRef: runtime,
    instrumentation: context.Instrumentation
  });

  const modifier = new ModClass({
    windowRef: runtime,
    instrumentation: context.Instrumentation,
    rewardLab: lab
  });

  return { lab, modifier, instrumentation: context.Instrumentation, context };
}

// --------------------------------------------------------------------------
// TEST SUITE: 24 SCENARIOS FOR FASE 3.1
// --------------------------------------------------------------------------

test('1. OFF mode does not modify reward', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('OFF');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 10, 'Reward should be original amount (10)');
});

test('2. SIMULATION mode calculates correctly without modifying game state', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('SIMULATION');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 10, 'Wallet must receive only original amount (10)');
  const trace = modifier.getTrace();
  const simEvt = trace.find(e => e.type === 'BATTLE_REWARD_SIMULATED');
  assert.ok(simEvt, 'Must record BATTLE_REWARD_SIMULATED');
  assert.equal(simEvt.payload.originalAmount, 10);
  assert.equal(simEvt.payload.effectiveAmount, 50);
  assert.equal(simEvt.payload.appliedAmount, 10);
});

test('3. ACTIVE 2x transforms 10 -> 20', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(2);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 20, 'Wallet delta must be 20 for 2x multiplier');
  assert.equal(modifier.lastResult.status, 'VERIFIED');
});

test('4. ACTIVE 5x transforms 10 -> 50', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 50, 'Wallet delta must be 50 for 5x multiplier');
  assert.equal(modifier.lastResult.status, 'VERIFIED');
});

test('5. ACTIVE 100x transforms 10 -> 1000', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(100);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 1000, 'Wallet delta must be 1000 for 100x multiplier');
});

test('6. Invalid multipliers are rejected', () => {
  const runtime = createMockRuntime();
  const { modifier } = loadModules(runtime);

  assert.throws(() => modifier.setMultiplier(0), /Invalid multiplier/);
  assert.throws(() => modifier.setMultiplier(-5), /Invalid multiplier/);
  assert.throws(() => modifier.setMultiplier(NaN), /Invalid multiplier/);
  assert.throws(() => modifier.setMultiplier(Infinity), /Invalid multiplier/);
  assert.throws(() => modifier.setMultiplier(-Infinity), /Invalid multiplier/);
  assert.throws(() => modifier.setMultiplier('5'), /Invalid multiplier/);
  assert.throws(() => modifier.setMultiplier({}), /Invalid multiplier/);
  assert.throws(() => modifier.setMultiplier(101), /exceeds maximum allowed limit/);
});

test('7. 1x multiplier is identical to original game behavior', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(1);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 10, '1x multiplier in ACTIVE mode must equal original reward');
});

test('8. Wild reward is correctly modified when in ACTIVE mode', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(3);
  modifier.attachHooks(instrumentation, runtime);

  assert.equal(modifier.resolveActiveBattleType(runtime), 'WILD');

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 30);
});

test('9. Operation without battle context is NOT modified', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  // Directly call wallet.addAmount without Battle.defeatPokemon
  const before = runtime.getMoney();
  runtime.wallet.addAmount({ amount: 10, currency: 0 });
  const after = runtime.getMoney();

  assert.equal(after - before, 10, 'Non-battle addAmount must NOT be multiplied');
});

test('10. Quest rewards are NOT modified', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(10);
  modifier.attachHooks(instrumentation, runtime);

  const beforeQP = runtime.getQuestPoints();
  runtime.quests.claimReward(0);
  const afterQP = runtime.getQuestPoints();

  assert.equal(afterQP - beforeQP, 25, 'Quest reward must NOT be multiplied');
});

test('11. Dungeon rewards are NOT modified', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  // Simulate dungeon running
  runtime.DungeonRunner.running = () => true;

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 10, 'Dungeon battle defeat must NOT be multiplied');
  const skipped = modifier.getTrace().find(e => e.type === 'BATTLE_REWARD_MODIFIER_SKIPPED');
  assert.ok(skipped, 'Must log BATTLE_REWARD_MODIFIER_SKIPPED for non-wild');
});

test('12. Gym rewards are NOT modified', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  // Simulate gym running
  runtime.GymRunner.running = () => true;

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(after - before, 10, 'Gym battle defeat must NOT be multiplied');
});

test('13. Unknown context is NOT modified', () => {
  const runtime = createMockRuntime();
  delete runtime.Battle; // No recognized battle
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);

  assert.equal(modifier.resolveActiveBattleType(runtime), 'UNKNOWN');
});

test('14. No double accreditation: only modified amount is added once', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  let callCount = 0;
  const origAddAmount = runtime.wallet.addAmount;
  runtime.wallet.addAmount = function (arg) {
    callCount++;
    return origAddAmount.call(this, arg);
  };

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  assert.equal(callCount, 1, 'addAmount must be called exactly ONCE');
  assert.equal(after - before, 50, 'Total delta must be 50, not 10 + 50');
});

test('15. BattlePokemon.reward object is NOT permanently mutated', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(10);
  modifier.attachHooks(instrumentation, runtime);

  const enemy = runtime.getCurrentEnemy();
  assert.equal(enemy.reward.amount, 10);

  runtime.Battle.defeatPokemon();

  assert.equal(enemy.reward.amount, 10, 'enemy.reward.amount must remain untouched (10)');
});

test('16. Does not modify enemy HP or maxHealth', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  const enemy = runtime.getCurrentEnemy();
  const initialMaxHp = enemy.maxHealth();

  runtime.Battle.defeatPokemon();

  assert.equal(enemy.maxHealth(), initialMaxHp, 'maxHealth must remain unchanged');
});

test('17. Does not modify statistics.clickAttacks directly', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getClickAttacks();
  runtime.Battle.clickAttack();
  const after = runtime.getClickAttacks();

  // clickAttack increments by 1 via Battle.clickAttack
  assert.equal(after - before, 1);
});

test('18. Does not modify Math.random or RNG', () => {
  const origRandom = Math.random;
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  runtime.Battle.defeatPokemon();

  assert.equal(Math.random, origRandom, 'Math.random must remain identical');
});

test('19. Reentrancy does not produce duplicate multiplication', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  // Nest a call to addAmount inside wallet addAmount
  const origAdd = runtime.wallet.addAmount;
  let nestedRun = false;
  runtime.wallet.addAmount = function (amountObj) {
    if (!nestedRun) {
      nestedRun = true;
      runtime.wallet.addAmount({ amount: 5, currency: 0 }); // Nested call
    }
    return origAdd.call(this, amountObj);
  };

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(2);
  modifier.attachHooks(instrumentation, runtime);

  const before = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const after = runtime.getMoney();

  // Primary: 10 * 2 = 20. Nested: 5 (NOT multiplied by 2 due to reentrancy/context guard).
  // Total: 25.
  assert.equal(after - before, 25);
});

test('20. Wallet delta matches effective reward and logs MODIFIER_APPLICATION_VERIFIED', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(4);
  modifier.attachHooks(instrumentation, runtime);

  runtime.Battle.defeatPokemon();

  assert.equal(modifier.lastResult.status, 'VERIFIED');
  assert.equal(modifier.lastResult.effective, 40);
  assert.equal(modifier.lastResult.applied, 40);

  const trace = modifier.getTrace();
  const verifiedEvt = trace.find(e => e.type === 'MODIFIER_APPLICATION_VERIFIED');
  assert.ok(verifiedEvt, 'Must record MODIFIER_APPLICATION_VERIFIED');
  assert.equal(verifiedEvt.payload.actualDelta, 40);
});

test('21. Delta discrepancy generates diagnostic error event', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  // Mock wallet to swallow the addition (failure to credit)
  runtime.wallet.addAmount = function () {
    return true; // Does not mutate money!
  };

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  runtime.Battle.defeatPokemon();

  assert.equal(modifier.lastResult.status, 'DISCREPANCY');
  const trace = modifier.getTrace();
  const discEvt = trace.find(e => e.type === 'MODIFIER_APPLICATION_DISCREPANCY');
  assert.ok(discEvt, 'Must record MODIFIER_APPLICATION_DISCREPANCY');
  assert.equal(discEvt.payload.expectedDelta, 50);
  assert.equal(discEvt.payload.actualDelta, 0);
});

test('22. RESET button returns to OFF and 1x', () => {
  const runtime = createMockRuntime();
  const { modifier } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(25);

  assert.equal(modifier.mode, 'ACTIVE');
  assert.equal(modifier.multiplier, 25);

  modifier.reset();

  assert.equal(modifier.mode, 'OFF');
  assert.equal(modifier.multiplier, 1);
  assert.equal(modifier.lastResult.status, 'OFF');
});

test('23. Auto Click continues functioning normally during reward modification', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.attachHooks(instrumentation, runtime);

  const beforeClicks = runtime.getClickAttacks();
  const beforeMoney = runtime.getMoney();

  runtime.Battle.clickAttack();

  const afterClicks = runtime.getClickAttacks();
  const afterMoney = runtime.getMoney();

  assert.equal(afterClicks - beforeClicks, 1, 'Click attack executed');
  assert.equal(afterMoney - beforeMoney, 50, 'Reward multiplied 5x');
});

test('24. BattleStateMachine remains intact with BattleRewardModifier', () => {
  const runtime = createMockRuntime();
  const context = {
    window: runtime,
    App: runtime.App,
    Battle: runtime.Battle,
    Date,
    Math
  };
  const smCode = fs.readFileSync('core/battle-state-machine.js', 'utf8');
  vm.runInNewContext(smCode, context);
  const BSM = context.BattleStateMachine?.BattleStateMachine || context.BattleStateMachine;
  const sm = new BSM();

  assert.equal(sm.getState(), 'IDLE');

  // Activate state machine
  sm.state = 'READY';

  // 1. Current enemy is alive -> can attack
  runtime.setCurrentEnemy({
    name: 'Pidgey',
    health: () => 20,
    maxHealth: () => 20,
    isAlive: () => true
  });

  const tick1 = sm.evaluateTick(runtime);
  assert.equal(tick1.canAttack, true);
  assert.equal(sm.getState(), 'READY');

  // 2. Enemy HP <= 0 -> cannot attack, transitions to WAITING_FOR_TRANSITION
  runtime.setCurrentEnemy({
    name: 'Pidgey',
    health: () => 0,
    maxHealth: () => 20,
    isAlive: () => false
  });

  const tick2 = sm.evaluateTick(runtime);
  assert.equal(tick2.canAttack, false);
  assert.equal(sm.getState(), 'WAITING_FOR_TRANSITION');
});

test('25. Dungeon Tokens multiplication: when enabled, gains are multiplied by multiplier in ACTIVE mode', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(10);
  modifier.setCurrencies({ dungeonToken: true });
  modifier.attachHooks(instrumentation, runtime);

  const beforeDT = runtime.getDungeonTokens();
  runtime.wallet.gainDungeonTokens(5);
  const afterDT = runtime.getDungeonTokens();

  assert.equal(afterDT - beforeDT, 50, '5 Dungeon Tokens multiplied 10x -> 50');
  assert.equal(modifier.stats.modifiedCount, 1);
  assert.equal(modifier.lastResult.status, 'VERIFIED');
  assert.equal(modifier.lastResult.applied, 50);
});

test('26. Dungeon Tokens isolation: when dungeonToken currency is disabled, gains are NOT multiplied', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(10);
  modifier.setCurrencies({ dungeonToken: false });
  modifier.attachHooks(instrumentation, runtime);

  const beforeDT = runtime.getDungeonTokens();
  runtime.wallet.gainDungeonTokens(5);
  const afterDT = runtime.getDungeonTokens();

  assert.equal(afterDT - beforeDT, 5, '5 Dungeon Tokens remain exactly 5 when disabled');
  assert.equal(modifier.stats.modifiedCount, 0);
});

test('27. Quest Points multiplication: when enabled, quest rewards are multiplied by multiplier in ACTIVE mode', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(5);
  modifier.setCurrencies({ questPoint: true });
  modifier.attachHooks(instrumentation, runtime);

  const beforeQP = runtime.getQuestPoints();
  runtime.quests.claimReward(0); // claims 25 QP
  const afterQP = runtime.getQuestPoints();

  assert.equal(afterQP - beforeQP, 125, '25 Quest Points multiplied 5x -> 125');
  assert.equal(modifier.stats.modifiedCount, 1);
  assert.equal(modifier.lastResult.status, 'VERIFIED');
  assert.equal(modifier.lastResult.applied, 125);
});

test('28. Quest Points isolation: when questPoint currency is disabled, quest rewards are NOT multiplied', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(10);
  modifier.setCurrencies({ questPoint: false });
  modifier.attachHooks(instrumentation, runtime);

  const beforeQP = runtime.getQuestPoints();
  runtime.quests.claimReward(0);
  const afterQP = runtime.getQuestPoints();

  assert.equal(afterQP - beforeQP, 25, '25 Quest Points remain exactly 25 when disabled');
  assert.equal(modifier.stats.modifiedCount, 0);
});

test('29. Simulation mode works cleanly for Dungeon Tokens and Quest Points without modifying wallet', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('SIMULATION');
  modifier.setMultiplier(10);
  modifier.setCurrencies({ dungeonToken: true, questPoint: true });
  modifier.attachHooks(instrumentation, runtime);

  const beforeDT = runtime.getDungeonTokens();
  runtime.wallet.gainDungeonTokens(5);
  const afterDT = runtime.getDungeonTokens();

  assert.equal(afterDT - beforeDT, 5, 'Wallet receives only original 5 Dungeon Tokens in SIMULATION');
  assert.equal(modifier.stats.simulatedCount, 1);
  assert.equal(modifier.lastResult.status, 'SIMULATED');
  assert.equal(modifier.lastResult.original, 5);
  assert.equal(modifier.lastResult.effective, 50);

  const beforeQP = runtime.getQuestPoints();
  runtime.quests.claimReward(0);
  const afterQP = runtime.getQuestPoints();

  assert.equal(afterQP - beforeQP, 25, 'Wallet receives only original 25 Quest Points in SIMULATION');
  assert.equal(modifier.stats.simulatedCount, 2);
  assert.equal(modifier.lastResult.status, 'SIMULATED');
  assert.equal(modifier.lastResult.original, 25);
  assert.equal(modifier.lastResult.effective, 250);
});

test('30. Independent currency toggling: Money multiplied while DT/QP untouched', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(10);
  modifier.setCurrencies({ money: true, dungeonToken: false, questPoint: false });
  modifier.attachHooks(instrumentation, runtime);

  // Wild defeat should be multiplied
  const beforeMoney = runtime.getMoney();
  runtime.Battle.defeatPokemon();
  const afterMoney = runtime.getMoney();
  assert.equal(afterMoney - beforeMoney, 100, 'Money is multiplied 10x');

  // DT and QP should NOT be multiplied
  const beforeDT = runtime.getDungeonTokens();
  runtime.wallet.gainDungeonTokens(7);
  assert.equal(runtime.getDungeonTokens() - beforeDT, 7, 'DT untouched');

  const beforeQP = runtime.getQuestPoints();
  runtime.quests.claimReward(0);
  assert.equal(runtime.getQuestPoints() - beforeQP, 25, 'QP untouched');
});

test('31. Spending/deductions (loseAmount) are NEVER modified even when currencies are enabled', () => {
  const runtime = createMockRuntime();
  const { modifier, instrumentation } = loadModules(runtime);

  modifier.setMode('ACTIVE');
  modifier.setMultiplier(100);
  modifier.setCurrencies({ money: true, dungeonToken: true, questPoint: true });
  modifier.attachHooks(instrumentation, runtime);

  runtime.wallet.gainMoney(1000);
  runtime.wallet.gainDungeonTokens(1000);
  runtime.wallet.gainQuestPoints(1000);

  const beforeMoney = runtime.getMoney();
  const beforeDT = runtime.getDungeonTokens();
  const beforeQP = runtime.getQuestPoints();

  // Spend in shops/dungeon entries
  runtime.wallet.loseAmount({ amount: 150, currency: 0 });
  runtime.wallet.loseAmount({ amount: 50, currency: 2 });
  runtime.wallet.loseAmount({ amount: 20, currency: 1 });

  assert.equal(beforeMoney - runtime.getMoney(), 150, 'Deduction of money is exactly 150, NOT 15000');
  assert.equal(beforeDT - runtime.getDungeonTokens(), 50, 'Deduction of DT is exactly 50, NOT 5000');
  assert.equal(beforeQP - runtime.getQuestPoints(), 20, 'Deduction of QP is exactly 20, NOT 2000');
});
