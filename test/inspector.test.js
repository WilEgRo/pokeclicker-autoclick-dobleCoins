const { test, describe } = require('node:test');
const assert = require('node:assert');
const ObjectInspector = require('../core/object-inspector');
const FunctionInspector = require('../core/function-inspector');
const DiffEngine = require('../core/diff-engine');
const Instrumentation = require('../core/instrumentation');
const ModuleRegistry = require('../core/module-registry');
const RuntimeDetector = require('../core/runtime-detector');
const RuntimeDiagnostics = require('../modules/diagnostics/runtime-diagnostics');

describe('1. Path Resolver & Traversal', () => {
  const mockGlobal = {
    App: {
      game: {
        wallet: {
          currencies: [100, 200, 300]
        },
        version: '0.10.14'
      }
    }
  };

  test('resolves valid nested paths', () => {
    const res = ObjectInspector.resolvePath(mockGlobal, 'App.game.wallet');
    assert.strictEqual(res.exists, true);
    assert.deepStrictEqual(res.value, { currencies: [100, 200, 300] });
  });

  test('gracefully handles missing paths', () => {
    const res = ObjectInspector.resolvePath(mockGlobal, 'App.game.nonExistent.subProp');
    assert.strictEqual(res.exists, false);
    assert.strictEqual(res.segmentFailed, 'nonExistent');
  });

  test('resolves Knockout-like observables when encountering .peek()', () => {
    const mockObs = {
      player: {
        money: {
          peek: () => 50000
        }
      }
    };
    const res = ObjectInspector.resolvePath(mockObs, 'player.money');
    assert.strictEqual(res.exists, true);
  });
});

describe('2. Safe Object Inspection & Circular References', () => {
  test('handles circular references without infinite loops', () => {
    const circularObj = { name: 'RootNode' };
    circularObj.self = circularObj;

    const inspection = ObjectInspector.inspectObject(circularObj, 'circularObj', { maxDepth: 4 });
    assert.strictEqual(inspection.exists, true);
    assert.strictEqual(inspection.properties.name.value, 'RootNode');
    assert.strictEqual(inspection.properties.self.type, 'circular_reference');
  });

  test('respects maxDepth limits', () => {
    const deepObj = { l1: { l2: { l3: { l4: { l5: 'deep' } } } } };
    const inspection = ObjectInspector.inspectObject(deepObj, 'deepObj', { maxDepth: 2 });
    assert.strictEqual(inspection.exists, true);
    assert.strictEqual(inspection.properties.l1.properties.l2.depthLimited, true);
    assert.strictEqual(inspection.properties.l1.properties.l2.properties.l3, undefined);
  });

  test('safely handles getter exceptions without crashing', () => {
    const faultyObj = {};
    Object.defineProperty(faultyObj, 'dangerousGetter', {
      get: () => { throw new Error('Explosive Getter Access'); },
      enumerable: true
    });

    const inspection = ObjectInspector.inspectObject(faultyObj, 'faultyObj');
    assert.strictEqual(inspection.exists, true);
    assert.strictEqual(inspection.properties.dangerousGetter.type, 'getter');
  });
});

describe('3. Function Detection without Execution', () => {
  test('catalogs functions without calling them', () => {
    let wasExecuted = false;
    const mockApi = {
      wallet: {
        gainMoney: (amount) => {
          wasExecuted = true;
          return amount;
        },
        gainQuestPoints: function (qp) {
          wasExecuted = true;
          return qp;
        }
      },
      Battle: {
        clickAttack: () => {
          wasExecuted = true;
        }
      }
    };

    const functions = FunctionInspector.discoverFunctions(mockApi, '', { maxDepth: 3 });
    assert.strictEqual(wasExecuted, false, 'Functions must NEVER be executed during discovery');

    const fnPaths = functions.map(f => f.path);
    assert.ok(fnPaths.includes('wallet.gainMoney'));
    assert.ok(fnPaths.includes('wallet.gainQuestPoints'));
    assert.ok(fnPaths.includes('Battle.clickAttack'));
  });

  test('matches heuristic candidates by domain keywords', () => {
    const fnList = [
      { name: 'gainMoney', path: 'App.game.wallet.gainMoney', length: 1, type: 'function' },
      { name: 'generateShiny', path: 'PokemonFactory.generateShiny', length: 2, type: 'function' },
      { name: 'clickAttack', path: 'Battle.clickAttack', length: 0, type: 'function' },
      { name: 'claimReward', path: 'App.game.quests.claimReward', length: 1, type: 'function' }
    ];

    const economy = FunctionInspector.matchCandidates(fnList, ['money', 'gain'], 'Economy');
    const shiny = FunctionInspector.matchCandidates(fnList, ['shiny'], 'Shiny');
    const battle = FunctionInspector.matchCandidates(fnList, ['attack', 'battle'], 'Battle');
    const quests = FunctionInspector.matchCandidates(fnList, ['quest', 'reward'], 'Quests');

    assert.strictEqual(economy.length, 1);
    assert.strictEqual(economy[0].candidate, 'App.game.wallet.gainMoney');

    assert.strictEqual(shiny.length, 1);
    assert.strictEqual(shiny[0].candidate, 'PokemonFactory.generateShiny');

    assert.strictEqual(battle.length, 1);
    assert.strictEqual(battle[0].candidate, 'Battle.clickAttack');

    assert.strictEqual(quests.length, 1);
    assert.strictEqual(quests[0].candidate, 'App.game.quests.claimReward');
  });
});

describe('4. Diff Engine & State Change Monitoring', () => {
  test('detects modified, added, and removed snapshot keys', () => {
    const prev = {
      wallet: { Money: 1000, QuestPoint: 50 },
      statistics: { clickAttacks: 120 }
    };
    const next = {
      wallet: { Money: 1250, QuestPoint: 50, DungeonToken: 10 },
      statistics: { clickAttacks: 125 }
    };

    const diff = DiffEngine.compareSnapshots(prev, next);
    assert.strictEqual(diff.hasChanges, true);
    assert.strictEqual(diff.changes.length, 3);

    const moneyChange = diff.changes.find(c => c.path === 'wallet.Money');
    assert.strictEqual(moneyChange.type, 'MODIFIED');
    assert.strictEqual(moneyChange.oldValue, 1000);
    assert.strictEqual(moneyChange.newValue, 1250);

    const dtChange = diff.changes.find(c => c.path === 'wallet.DungeonToken');
    assert.strictEqual(dtChange.type, 'ADDED');

    const clicksChange = diff.changes.find(c => c.path === 'statistics.clickAttacks');
    assert.strictEqual(clicksChange.type, 'MODIFIED');
  });

  test('returns hasChanges: false when snapshots are identical', () => {
    const snap = { wallet: { Money: 500 } };
    const diff = DiffEngine.compareSnapshots(snap, snap);
    assert.strictEqual(diff.hasChanges, false);
    assert.strictEqual(diff.changes.length, 0);
  });
});

describe('5. Module Registry & Phase Locking', () => {
  test('manages module states and strictly forbids unlocking Phase 2 modules in Phase 1', () => {
    ModuleRegistry.reset();
    const modules = ModuleRegistry.list();

    const diagnosticsMod = modules.find(m => m.id === 'diagnostics');
    assert.strictEqual(diagnosticsMod.enabled, true);
    assert.strictEqual(diagnosticsMod.locked, false);

    const economyMod = ModuleRegistry.get('economy-research');
    assert.strictEqual(economyMod.locked, true);
    assert.strictEqual(economyMod.getStatus(), 'LOCKED — Phase 2');

    assert.throws(() => {
      economyMod.enable();
    }, /Cannot enable locked module/);
  });
});

describe('6. Compatibility & Version Detection', () => {
  test('extracts version when present without guessing', () => {
    const mockRuntime = {
      App: { game: { version: '0.10.14' } }
    };
    const ver = RuntimeDetector.detectVersion(mockRuntime);
    assert.strictEqual(ver.version, '0.10.14');
    assert.strictEqual(ver.detectedAt, 'App.game.version');
  });

  test('returns unknown when version property is missing', () => {
    const mockEmpty = {};
    const ver = RuntimeDetector.detectVersion(mockEmpty);
    assert.strictEqual(ver.version, 'unknown');
  });

  test('generates deterministic runtime fingerprint', () => {
    const mockRuntime = {
      App: { game: { wallet: {}, statistics: {} } },
      Battle: {}
    };
    const fp = RuntimeDetector.generateFingerprint(mockRuntime);
    assert.ok(fp.signatureHash.startsWith('SIG-'));
    assert.ok(fp.existingCount >= 3);
  });
});

describe('7. Safe Function Instrumentation Infrastructure', () => {
  test('intercepts function calls without altering return semantics', () => {
    const targetObj = {
      calcDamage: (base, mult) => base * mult
    };

    let beforeArgs = null;
    let afterResult = null;

    const success = Instrumentation.instrument(targetObj, 'calcDamage', {
      onBefore: (path, args) => { beforeArgs = args; },
      onAfter: (path, args, res) => { afterResult = res; }
    });

    assert.strictEqual(success, true);
    assert.strictEqual(Instrumentation.isInstrumented('calcDamage'), true);

    const output = targetObj.calcDamage(10, 5);
    assert.strictEqual(output, 50);
    assert.deepStrictEqual(beforeArgs, [10, 5]);
    assert.strictEqual(afterResult, 50);

    // Call history check
    const history = Instrumentation.getCallHistory('calcDamage');
    assert.strictEqual(history.length, 1);

    // Restore
    Instrumentation.restore(targetObj, 'calcDamage');
    assert.strictEqual(Instrumentation.isInstrumented('calcDamage'), false);
  });
});

describe('8. End-to-End Diagnostic Audit', () => {
  test('produces comprehensive diagnostic report for mock game runtime', () => {
    const mockGame = {
      App: {
        game: {
          version: '0.10.14',
          wallet: {
            currencies: [1000, 50, 200, 10, 5, 0]
          },
          statistics: {
            clickAttacks: 999,
            pokemonCaptured: 150,
            totalShinyPokemonCaptured: 2
          },
          quests: {
            claimReward: () => {}
          }
        }
      },
      Battle: {
        clickAttack: () => {},
        enemyPokemon: {
          name: 'Pikachu',
          health: 100,
          maxHealth: 100
        }
      }
    };

    const diag = RuntimeDiagnostics.runDiagnostics(mockGame);
    assert.strictEqual(diag.gameDetected, true);
    assert.strictEqual(diag.gameVersion, '0.10.14');
    assert.strictEqual(diag.snapshot.wallet.Money, 1000);
    assert.strictEqual(diag.snapshot.statistics.clickAttacks, 999);
    assert.strictEqual(diag.snapshot.battle.name, 'Pikachu');
    assert.ok(diag.candidates.economy.length >= 0);
    assert.ok(diag.candidates.battle.length >= 1);
  });

  test('handles missing runtime gracefully with fail-safe reasons', () => {
    const emptyWindow = {};
    const diag = RuntimeDiagnostics.runDiagnostics(emptyWindow);
    assert.strictEqual(diag.gameDetected, false);
    assert.ok(diag.failSafe);
    assert.strictEqual(diag.failSafe.detected, false);
    assert.ok(diag.failSafe.possibleCauses.length > 0);
  });
});
