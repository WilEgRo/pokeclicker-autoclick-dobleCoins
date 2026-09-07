/**
 * PokéClicker Security Lab - Runtime Detector & Fingerprinter
 * 
 * Safely determines the live structure of PokéClicker at runtime without
 * assuming outdated APIs or breaking when paths change.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const objInspector = require('./object-inspector');
    const fnInspector = require('./function-inspector');
    module.exports = factory(objInspector, fnInspector);
  } else {
    root.RuntimeDetector = factory(root.ObjectInspector, root.FunctionInspector);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ObjectInspector, FunctionInspector) {
  'use strict';

  // Standard candidate paths to inspect safely in PokéClicker
  const KNOWN_CANDIDATE_PATHS = [
    'App',
    'App.game',
    'App.game.wallet',
    'App.game.statistics',
    'App.game.quests',
    'App.game.player',
    'App.game.party',
    'App.game.breeding',
    'App.game.underground',
    'App.game.farming',
    'App.game.oakItems',
    'App.game.badgeCase',
    'App.game.shards',
    'App.game.challenges',
    'Battle',
    'Battle.enemyPokemon',
    'player',
    'ko',
    'GameConstants',
    'PokemonFactory',
    'RouteHelper',
    'MapHelper',
    'Notifier',
    'KeyItemController'
  ];

  /**
   * Evaluates an individual path on the target root (e.g. window).
   */
  function probePath(root, pathStr) {
    const res = ObjectInspector.resolvePath(root, pathStr);
    if (!res.exists || res.value === undefined) {
      return {
        path: pathStr,
        exists: false,
        type: 'undefined',
        constructor: null,
        preview: 'Path not found'
      };
    }

    const val = res.value;
    const unwrapped = ObjectInspector.safeUnwrap(val);
    const valType = typeof unwrapped;
    const ctor = (unwrapped && unwrapped.constructor) ? unwrapped.constructor.name : null;

    return {
      path: pathStr,
      exists: true,
      type: valType,
      isObservable: typeof val === 'function' && typeof val.peek === 'function',
      constructor: ctor,
      preview: ObjectInspector.getSafePreview(val)
    };
  }

  /**
   * Probes all known candidate paths.
   */
  function probeAllPaths(root, paths = KNOWN_CANDIDATE_PATHS) {
    const results = {};
    for (const p of paths) {
      results[p] = probePath(root, p);
    }
    return results;
  }

  /**
   * Detects game version or returns 'unknown'. Never invents version.
   */
  function detectVersion(root) {
    const versionPaths = [
      'App.game.version',
      'App.version',
      'GameConstants.Version',
      'GameConstants.VERSION',
      'version'
    ];

    for (const vp of versionPaths) {
      const res = ObjectInspector.resolvePath(root, vp);
      if (res.exists && res.value !== undefined) {
        const unwrapped = ObjectInspector.safeUnwrap(res.value);
        if (typeof unwrapped === 'string' || typeof unwrapped === 'number') {
          return {
            version: String(unwrapped),
            detectedAt: vp
          };
        }
      }
    }

    return {
      version: 'unknown',
      detectedAt: null
    };
  }

  /**
   * Generates a structural runtime fingerprint based on available objects and methods.
   */
  function generateFingerprint(root) {
    const paths = probeAllPaths(root);
    const existingPaths = Object.keys(paths).filter(k => paths[k].exists);

    // Simple deterministic hash
    let hash = 0;
    const sigString = existingPaths.sort().join('|');
    for (let i = 0; i < sigString.length; i++) {
      const char = sigString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }

    return {
      totalProbed: Object.keys(paths).length,
      existingCount: existingPaths.length,
      existingPaths,
      signatureHash: `SIG-${Math.abs(hash).toString(16).toUpperCase()}`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Safely captures current live wallet state.
   */
  function captureWalletState(root) {
    const walletRes = ObjectInspector.resolvePath(root, 'App.game.wallet');
    if (!walletRes.exists || !walletRes.value) {
      return { exists: false };
    }

    const wallet = walletRes.value;
    const currencies = {};

    // In PokéClicker: wallet.currencies is an observable array of observables or standard array
    const rawCurrencies = ObjectInspector.safeUnwrap(wallet.currencies);
    if (Array.isArray(rawCurrencies)) {
      const currencyNames = ['Money', 'QuestPoint', 'DungeonToken', 'Diamond', 'FarmPoint', 'BattlePoint'];
      for (let i = 0; i < rawCurrencies.length; i++) {
        const val = ObjectInspector.safeUnwrap(rawCurrencies[i]);
        const name = currencyNames[i] || `Currency_${i}`;
        currencies[name] = typeof val === 'number' ? val : ObjectInspector.getSafePreview(val);
      }
    } else if (typeof rawCurrencies === 'object' && rawCurrencies !== null) {
      for (const [k, v] of Object.entries(rawCurrencies)) {
        currencies[k] = ObjectInspector.safeUnwrap(v);
      }
    }

    return {
      exists: true,
      currencies
    };
  }

  /**
   * Safely captures observable game statistics.
   */
  function captureStatisticsState(root) {
    const statsRes = ObjectInspector.resolvePath(root, 'App.game.statistics');
    if (!statsRes.exists || !statsRes.value) {
      return { exists: false };
    }

    const statsObj = statsRes.value;
    const interestingKeys = [
      'clickAttacks',
      'totalPokemonCaptured',
      'pokemonCaptured',
      'totalPokemonDefeated',
      'pokemonDefeated',
      'totalShinyPokemonCaptured',
      'totalShinyPokemonDefeated',
      'totalPokemonHatched',
      'totalPokemonEncountered',
      'dungeonsCleared',
      'gymsDefeated',
      'questsCompleted',
      'routeKills'
    ];

    const statistics = {};
    for (const key of interestingKeys) {
      if (key in statsObj) {
        const val = statsObj[key];
        const unwrapped = ObjectInspector.safeUnwrap(val);
        if (typeof unwrapped === 'number' || typeof unwrapped === 'string') {
          statistics[key] = unwrapped;
        } else if (Array.isArray(unwrapped)) {
          statistics[key] = `Array(${unwrapped.length})`;
        } else if (typeof unwrapped === 'object' && unwrapped !== null) {
          statistics[key] = `[${Object.keys(unwrapped).length} entries]`;
        }
      }
    }

    return {
      exists: true,
      statistics
    };
  }

  /**
   * Safely captures battle state preview.
   */
  function captureBattleState(root) {
    const battleRes = ObjectInspector.resolvePath(root, 'Battle');
    if (!battleRes.exists || !battleRes.value) {
      return { exists: false };
    }

    const battle = battleRes.value;
    const enemyRes = ObjectInspector.resolvePath(battle, 'enemyPokemon');
    let enemyName = 'None';
    let enemyHp = 0;
    let enemyMaxHp = 0;

    if (enemyRes.exists && enemyRes.value) {
      const enemy = ObjectInspector.safeUnwrap(enemyRes.value);
      if (enemy) {
        enemyName = ObjectInspector.safeUnwrap(enemy.name) || 'Unknown';
        enemyHp = ObjectInspector.safeUnwrap(enemy.health) || 0;
        enemyMaxHp = ObjectInspector.safeUnwrap(enemy.maxHealth) || 0;
      }
    }

    return {
      exists: true,
      enemy: {
        name: enemyName,
        health: enemyHp,
        maxHealth: enemyMaxHp
      }
    };
  }

  /**
   * Captures full observable state snapshot for diff monitoring.
   */
  function captureLiveSnapshot(root) {
    const version = detectVersion(root);
    const wallet = captureWalletState(root);
    const statistics = captureStatisticsState(root);
    const battle = captureBattleState(root);

    return {
      timestamp: new Date().toISOString(),
      version: version.version,
      wallet: wallet.exists ? wallet.currencies : {},
      statistics: statistics.exists ? statistics.statistics : {},
      battle: battle.exists ? battle.enemy : {}
    };
  }

  /**
   * Runs heuristic candidate discoveries across all domains.
   */
  function discoverAllCandidates(root) {
    // Gather all functions from App, Battle, and top-level helpers
    const fnsApp = FunctionInspector ? FunctionInspector.discoverFunctions(root, 'App', { maxDepth: 4 }) : [];
    const fnsBattle = FunctionInspector ? FunctionInspector.discoverFunctions(root, 'Battle', { maxDepth: 3 }) : [];
    const fnsGlobal = FunctionInspector ? FunctionInspector.discoverFunctions(root, '', { maxDepth: 1 }) : [];
    
    const allFns = [...fnsApp, ...fnsBattle, ...fnsGlobal];
    // Remove duplicates by path
    const uniqueMap = new Map();
    for (const f of allFns) {
      if (!uniqueMap.has(f.path)) {
        uniqueMap.set(f.path, f);
      }
    }
    const functionList = Array.from(uniqueMap.values());

    const economyKeywords = ['money', 'quest', 'questpoints', 'tokens', 'points', 'currency', 'wallet', 'gain', 'add', 'reward'];
    const shinyKeywords = ['shiny', 'encounter', 'pokemon', 'catch', 'chance', 'random', 'rng'];
    const questKeywords = ['quest', 'quests', 'questpoints', 'questxp', 'reward', 'claim', 'complete'];
    const battleKeywords = ['battle', 'clickattack', 'attack', 'damage', 'enemy', 'pokemonattack'];

    return {
      totalFunctionsDiscovered: functionList.length,
      allFunctions: functionList,
      economy: FunctionInspector ? FunctionInspector.matchCandidates(functionList, economyKeywords, 'Economy') : [],
      shiny: FunctionInspector ? FunctionInspector.matchCandidates(functionList, shinyKeywords, 'Shiny') : [],
      quests: FunctionInspector ? FunctionInspector.matchCandidates(functionList, questKeywords, 'Quests') : [],
      battle: FunctionInspector ? FunctionInspector.matchCandidates(functionList, battleKeywords, 'Battle') : []
    };
  }

  /**
   * Resiliently ensures declarative-scoped globals and Knockout App.game
   * are bridged to the target root object if present in the page runtime.
   */
  function ensureGlobalsBridged(r) {
    if (!r || (typeof r !== 'object' && typeof r !== 'function')) return;

    if (!r.App || !r.App.game) {
      try {
        if (typeof App !== 'undefined' && !r.App) {
          r.App = App;
        }
      } catch (_) {
        try {
          const evalApp = (0, eval)('typeof App !== "undefined" ? App : undefined');
          if (evalApp !== undefined && !r.App) r.App = evalApp;
        } catch (_) {}
      }

      if ((!r.App || !r.App.game) && (r.ko || (typeof window !== 'undefined' && window.ko))) {
        const koObj = r.ko || window.ko;
        const docObj = r.document || (typeof document !== 'undefined' ? document : null);
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
                  if (!r.App) r.App = {};
                  r.App.game = boundData;
                  break;
                }
              }
            }
          } catch (_) {}
        }
      }
    }

    const helpers = ['player', 'DungeonRunner', 'DungeonBattle', 'GymRunner', 'GymBattle', 'PokemonFactory', 'RouteHelper', 'MapHelper', 'TemporaryBattleRunner', 'BattleFrontierRunner'];
    for (const h of helpers) {
      try {
        if (typeof r[h] === 'undefined') {
          const evalVal = (0, eval)(`typeof ${h} !== "undefined" ? ${h} : undefined`);
          if (evalVal !== undefined) r[h] = evalVal;
        }
      } catch (_) {}
    }
  }

  /**
   * Safe, non-invasive context audit strictly checking existence and typeof.
   * NEVER invokes functions or accesses properties beyond typeof checks.
   */
  function performContextAudit(root, contextName = 'MAIN_WORLD') {
    const r = root || (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
    ensureGlobalsBridged(r);

    const typeApp = typeof r.App;
    const isApp = (typeApp === 'object' || typeApp === 'function') && r.App !== null;
    const typeGame = isApp ? typeof r.App.game : 'undefined';
    const isGame = (typeGame === 'object' || typeGame === 'function') && r.App.game !== null;
    const typeWallet = isGame ? typeof r.App.game.wallet : 'undefined';
    const typeStats = isGame ? typeof r.App.game.statistics : 'undefined';
    const typeBattle = typeof r.Battle;
    const typeBattleClick = (typeBattle === 'function' || (typeBattle === 'object' && r.Battle !== null)) ? typeof r.Battle.clickAttack : 'undefined';
    const typePokemonFactory = typeof r.PokemonFactory;
    const typeRouteHelper = typeof r.RouteHelper;

    const readyState = (typeof document !== 'undefined' && document?.readyState) ? document.readyState : 'complete';
    const loc = (typeof location !== 'undefined' && location?.href) ? location.href : 'https://www.pokeclicker.com/';

    return {
      context: contextName,
      windowApp: isApp,
      game: isGame,
      wallet: (typeWallet === 'object' || typeWallet === 'function') && r.App?.game?.wallet !== null,
      statistics: (typeStats === 'object' || typeStats === 'function') && r.App?.game?.statistics !== null,
      battle: typeBattle !== 'undefined' && r.Battle !== null,
      pokemonFactory: typePokemonFactory !== 'undefined' && r.PokemonFactory !== null,
      types: {
        app: typeApp,
        game: typeGame,
        wallet: typeWallet,
        statistics: typeStats,
        battle: typeBattle,
        battleClickAttack: typeBattleClick,
        pokemonFactory: typePokemonFactory,
        routeHelper: typeRouteHelper
      },
      timestamp: new Date().toISOString(),
      documentReadyState: readyState,
      location: loc
    };
  }

  /**
   * Dynamic runtime resolver. Never caches references permanently.
   */
  function resolveRuntime(root) {
    const r = root || (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
    ensureGlobalsBridged(r);

    const app = ((typeof r.App === 'object' || typeof r.App === 'function') && r.App !== null) ? r.App : null;
    const game = (app && (typeof app.game === 'object' || typeof app.game === 'function') && app.game !== null) ? app.game : null;
    const wallet = (game && (typeof game.wallet === 'object' || typeof game.wallet === 'function') && game.wallet !== null) ? game.wallet : null;
    const statistics = (game && (typeof game.statistics === 'object' || typeof game.statistics === 'function') && game.statistics !== null) ? game.statistics : null;
    const battle = (typeof r.Battle === 'function' || (typeof r.Battle === 'object' && r.Battle !== null)) ? r.Battle : null;

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

  return {
    KNOWN_CANDIDATE_PATHS,
    probePath,
    probeAllPaths,
    detectVersion,
    generateFingerprint,
    captureWalletState,
    captureStatisticsState,
    captureBattleState,
    captureLiveSnapshot,
    discoverAllCandidates,
    performContextAudit,
    resolveRuntime
  };
});
