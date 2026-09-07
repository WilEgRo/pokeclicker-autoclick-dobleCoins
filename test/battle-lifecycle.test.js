const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createMockRuntime() {
  let clickAttacks = 100;
  let defeated = 50;

  const mockEnemyA = {
    id: 16,
    name: 'Pidgey',
    health: 120,
    maxHealth: 120,
    isAlive() { return this.health > 0; }
  };

  const mockEnemyB = {
    id: 19,
    name: 'Rattata',
    health: 100,
    maxHealth: 100,
    isAlive() { return this.health > 0; }
  };

  let currentEnemy = mockEnemyA;
  let isCatching = false;

  const Battle = {
    enemyPokemon() { return currentEnemy; },
    catching() { return isCatching; },
    clickAttack() {
      if (!currentEnemy || currentEnemy.health <= 0) return;
      clickAttacks += 1;
      currentEnemy.health = Math.max(0, currentEnemy.health - 60);
      if (currentEnemy.health === 0) {
        defeated += 1;
        isCatching = true;
      }
    }
  };

  let dungeonClickAttacks = 0;
  const DungeonBattle = {
    enemyPokemon() { return currentEnemy; },
    clickAttack() {
      if (!currentEnemy || currentEnemy.health <= 0) return;
      dungeonClickAttacks += 1;
      currentEnemy.health = Math.max(0, currentEnemy.health - 150);
      if (currentEnemy.health === 0) {
        defeated += 1;
      }
    }
  };

  const DungeonRunner = {
    running() { return false; },
    fighting() { return false; }
  };

  const GameConstants = {
    GameState: {
      paused: 0,
      fighting: 1,
      gym: 2,
      dungeon: 3,
      safari: 4,
      town: 5
    }
  };

  const App = {
    game: {
      update: { version: '0.10.14' },
      gameState: 1, // fighting (WILD)
      statistics: {
        clickAttacks: { peek() { return clickAttacks; } },
        totalPokemonDefeated: { peek() { return defeated; } }
      }
    }
  };

  return {
    Battle,
    DungeonBattle,
    DungeonRunner,
    GameConstants,
    App,
    getStats: () => ({ clickAttacks, dungeonClickAttacks, defeated }),
    setNextEnemy: (enemy) => {
      currentEnemy = enemy;
      isCatching = false;
    },
    mockEnemyA,
    mockEnemyB
  };
}

function loadBattleStateMachine(runtime) {
  const context = {
    window: runtime,
    Battle: runtime.Battle,
    DungeonBattle: runtime.DungeonBattle,
    DungeonRunner: runtime.DungeonRunner,
    GameConstants: runtime.GameConstants,
    App: runtime.App,
    Date,
    Math,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  context.module = { exports: {} };
  const code = fs.readFileSync('core/battle-state-machine.js', 'utf8');
  vm.runInNewContext(code, context);
  const TargetClass = context.BattleStateMachine?.BattleStateMachine || context.module.exports?.BattleStateMachine || context.BattleStateMachine;
  return new TargetClass({
    windowRef: context,
    transitionTimeoutMs: 1000
  });
}

function loadDiagnostics(runtime) {
  const context = {
    window: runtime,
    Battle: runtime.Battle,
    DungeonBattle: runtime.DungeonBattle,
    DungeonRunner: runtime.DungeonRunner,
    GameConstants: runtime.GameConstants,
    App: runtime.App,
    Date,
    Math,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  context.module = { exports: {} };
  const code = fs.readFileSync('modules/diagnostics/battle-lifecycle-diagnostics.js', 'utf8');
  vm.runInNewContext(code, context);
  const TargetClass = context.BattleLifecycleDiagnostics?.BattleLifecycleDiagnostics || context.module.exports?.BattleLifecycleDiagnostics || context.BattleLifecycleDiagnostics;
  return new TargetClass({
    windowRef: context
  });
}

test('Test 1: enemy HP > 0 → attack permitted & state is READY/ATTACKING', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  const evaluation = sm.evaluate();
  assert.equal(evaluation.canAttack, true);
  assert.equal(evaluation.state, 'READY');
  assert.equal(evaluation.enemy.name, 'Pidgey');
  assert.equal(evaluation.enemy.hp, 120);
});

test('Test 2: enemy HP = 0 → attack blocked & state WAITING_FOR_TRANSITION', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  // Bring enemy to 0 HP
  runtime.mockEnemyA.health = 0;

  const evaluation = sm.evaluate();
  assert.equal(evaluation.canAttack, false);
  assert.equal(evaluation.state, 'WAITING_FOR_TRANSITION');
  assert.equal(sm.getState(), 'WAITING_FOR_TRANSITION');
});

test('Test 3: new enemy arrives → state transitions back to READY', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  // Defeat enemy A
  runtime.mockEnemyA.health = 0;
  sm.evaluate();
  assert.equal(sm.getState(), 'WAITING_FOR_TRANSITION');

  // Next enemy arrives
  runtime.setNextEnemy(runtime.mockEnemyB);
  const evaluation = sm.evaluate();

  assert.equal(evaluation.canAttack, true);
  assert.equal(evaluation.state, 'READY');
  assert.equal(evaluation.enemy.name, 'Rattata');
  assert.equal(evaluation.enemy.hp, 100);
});

test('Test 4: transition timeout → BATTLE_TRANSITION_TIMEOUT event & TIMEOUT state', async () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  runtime.mockEnemyA.health = 0;
  sm.evaluate();
  assert.equal(sm.getState(), 'WAITING_FOR_TRANSITION');

  // Advance time past transition timeout (1000ms configured in test)
  await new Promise(r => setTimeout(r, 1100));

  const evaluation = sm.evaluate();
  assert.equal(evaluation.state, 'TIMEOUT');
  assert.equal(evaluation.canAttack, false);
});

test('Test 5: Auto Click does not mutate enemyPokemon or inject artificial objects', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  const originalEnemy = runtime.Battle.enemyPokemon();
  sm.evaluate();
  runtime.mockEnemyA.health = 0;
  sm.evaluate();

  // Ensure Battle.enemyPokemon is strictly what the runtime provides
  assert.strictEqual(runtime.Battle.enemyPokemon(), originalEnemy);
});

test('Test 6: Auto Click does not mutate statistics directly', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  const beforeStats = runtime.getStats();
  sm.evaluate();
  sm.evaluate();
  const afterStats = runtime.getStats();

  assert.equal(beforeStats.clickAttacks, afterStats.clickAttacks);
  assert.equal(beforeStats.defeated, afterStats.defeated);
});

test('Test 7: Dungeon battle continues without blocking', () => {
  const runtime = createMockRuntime();
  // Switch to dungeon
  runtime.DungeonRunner.running = () => true;
  runtime.DungeonRunner.fighting = () => true;

  const sm = loadBattleStateMachine(runtime);
  const evaluation = sm.evaluate();

  assert.equal(evaluation.battleType, 'DUNGEON');
  assert.equal(evaluation.canAttack, true);
});

test('Test 8: Wild battle transitions correctly through lifecycle events', () => {
  const runtime = createMockRuntime();
  const diag = loadDiagnostics(runtime);
  const sm = loadBattleStateMachine(runtime);
  sm.setDiagnostics(diag);

  // Initial state
  sm.evaluate();
  assert.equal(sm.getState(), 'READY');

  // Execute attack 1 (HP 120 -> 60)
  const stateBefore1 = diag.captureBattleLifecycleState(runtime);
  diag.recordBeforeClickAttack(stateBefore1);
  runtime.Battle.clickAttack();
  const stateAfter1 = diag.captureBattleLifecycleState(runtime);
  diag.recordAfterClickAttack(stateBefore1, stateAfter1);

  sm.evaluate();
  assert.equal(sm.getState(), 'READY');

  // Execute attack 2 (HP 60 -> 0 KO)
  const stateBefore2 = diag.captureBattleLifecycleState(runtime);
  diag.recordBeforeClickAttack(stateBefore2);
  runtime.Battle.clickAttack();
  const stateAfter2 = diag.captureBattleLifecycleState(runtime);
  diag.recordAfterClickAttack(stateBefore2, stateAfter2);

  const evalKo = sm.evaluate();
  assert.equal(evalKo.state, 'WAITING_FOR_TRANSITION');
  assert.equal(evalKo.canAttack, false);

  // Enemy B spawns
  runtime.setNextEnemy(runtime.mockEnemyB);
  const evalNext = sm.evaluate();
  assert.equal(evalNext.state, 'READY');
  assert.equal(evalNext.canAttack, true);
  assert.equal(evalNext.enemy.name, 'Rattata');

  const summary = diag.getMetrics();
  assert.equal(summary.enemyTransitions, 1);
  assert.equal(summary.koCount, 1);
});

test('Test 9: No duplicate scheduler / clean state checks', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  sm.evaluate();
  const st1 = sm.getState();
  sm.evaluate();
  const st2 = sm.getState();
  assert.equal(st1, st2);
});

test('Test 10: stop() clears transition waiting state', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  runtime.mockEnemyA.health = 0;
  sm.evaluate();
  assert.equal(sm.getState(), 'WAITING_FOR_TRANSITION');

  sm.stop();
  assert.equal(sm.getState(), 'STOPPED');
  assert.equal(sm.isTransitionWaiting(), false);
});

test('Test 11: restart() does not retain stale enemy reference', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  runtime.mockEnemyA.health = 0;
  sm.evaluate();
  assert.equal(sm.getState(), 'WAITING_FOR_TRANSITION');

  sm.stop();
  runtime.setNextEnemy(runtime.mockEnemyB);
  sm.reset();

  const evaluation = sm.evaluate();
  assert.equal(evaluation.state, 'READY');
  assert.equal(evaluation.enemy.name, 'Rattata');
});

test('Test 12: battle type changes safely from Wild to Dungeon to Wild', () => {
  const runtime = createMockRuntime();
  const sm = loadBattleStateMachine(runtime);

  // 1. Wild
  let ev = sm.evaluate();
  assert.equal(ev.battleType, 'WILD');

  // 2. Switch to Dungeon
  runtime.DungeonRunner.running = () => true;
  runtime.DungeonRunner.fighting = () => true;
  ev = sm.evaluate();
  assert.equal(ev.battleType, 'DUNGEON');

  // 3. Switch back to Wild
  runtime.DungeonRunner.running = () => false;
  runtime.DungeonRunner.fighting = () => false;
  ev = sm.evaluate();
  assert.equal(ev.battleType, 'WILD');
  assert.equal(sm.getState(), 'READY');
});

test('Test 13: App.game.gameState === dungeon accurately resolves to DungeonBattle and attacks DungeonBattle', () => {
  const runtime = createMockRuntime();
  runtime.App.game.gameState = runtime.GameConstants.GameState.dungeon;
  // In real PokéClicker, DungeonRunner.running does NOT exist:
  delete runtime.DungeonRunner.running;
  runtime.DungeonRunner.fighting = () => true;

  const sm = loadBattleStateMachine(runtime);
  const evaluation = sm.evaluate();
  assert.equal(evaluation.canAttack, true);
  assert.equal(evaluation.battleType, 'DUNGEON');
  assert.equal(evaluation.activeBattle.battleName, 'DungeonBattle');

  // Execute attack via activeBattle
  evaluation.activeBattle.battle.clickAttack();
  assert.equal(runtime.getStats().dungeonClickAttacks, 1);
  assert.equal(runtime.getStats().clickAttacks, 100, 'Wild Battle was NOT attacked');
});

test('Test 14: In dungeon with trainer, auto clicker targets DungeonBattle and does not throw wild catch pokeball', () => {
  const runtime = createMockRuntime();
  runtime.App.game.gameState = runtime.GameConstants.GameState.dungeon;
  delete runtime.DungeonRunner.running;
  runtime.DungeonRunner.fighting = () => true;

  let wildCatchPrepared = false;
  runtime.Battle.prepareCatch = () => { wildCatchPrepared = true; };

  const sm = loadBattleStateMachine(runtime);
  const ev = sm.evaluate();
  assert.equal(ev.battleType, 'DUNGEON');
  assert.equal(ev.activeBattle.battleName, 'DungeonBattle');

  // Click attack until defeated
  ev.activeBattle.battle.clickAttack();
  assert.equal(wildCatchPrepared, false, 'Wild prepareCatch was NEVER invoked for trainer in dungeon');
  assert.equal(runtime.getStats().clickAttacks, 100, 'Wild Battle clickAttacks remained 100');
});

test('Test 15: App.game.gameState === town returns null and does NOT attack Battle in background', () => {
  const runtime = createMockRuntime();
  runtime.App.game.gameState = runtime.GameConstants.GameState.town;

  const sm = loadBattleStateMachine(runtime);
  const ev = sm.evaluate();
  assert.equal(ev.canAttack, false);
  assert.equal(ev.activeBattle, null);
  assert.equal(sm.getState(), 'WAITING_FOR_TRANSITION');
  assert.equal(runtime.getStats().clickAttacks, 100, 'No wild click attacks occurred in town');
});

test('Test 16: DungeonRunner.fighting() alone without .running() resolves to DungeonBattle', () => {
  const runtime = createMockRuntime();
  delete runtime.App.game.gameState;
  delete runtime.DungeonRunner.running;
  runtime.DungeonRunner.fighting = () => true;

  const sm = loadBattleStateMachine(runtime);
  const ev = sm.evaluate();
  assert.equal(ev.battleType, 'DUNGEON');
  assert.equal(ev.activeBattle.battleName, 'DungeonBattle');
});
