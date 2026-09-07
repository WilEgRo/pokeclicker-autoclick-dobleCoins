/**
 * PokéClicker Security Lab - Runtime Diagnostics Module
 * 
 * Aggregates runtime inspection data, state snapshots, heuristic discoveries,
 * and compatibility fingerprints into a comprehensive diagnostic report.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const objInspector = require('../../core/object-inspector');
    const fnInspector = require('../../core/function-inspector');
    const runtimeDetector = require('../../core/runtime-detector');
    const moduleRegistry = require('../../core/module-registry');
    module.exports = factory(objInspector, fnInspector, runtimeDetector, moduleRegistry);
  } else {
    root.RuntimeDiagnostics = factory(
      root.ObjectInspector,
      root.FunctionInspector,
      root.RuntimeDetector,
      root.ModuleRegistry
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ObjectInspector, FunctionInspector, RuntimeDetector, ModuleRegistry) {
  'use strict';

  /**
   * Performs an end-to-end safe diagnostic audit of the PokéClicker client runtime.
   * 
   * @param {*} root Global object (e.g. window)
   * @returns {Object} Complete diagnostic JSON data
   */
  function runDiagnostics(root) {
    const timestamp = new Date().toISOString();
    const versionInfo = RuntimeDetector.detectVersion(root);
    const fingerprint = RuntimeDetector.generateFingerprint(root);
    const probedPaths = RuntimeDetector.probeAllPaths(root);
    
    // Check key game indicators
    const appDetected = probedPaths['App'] && probedPaths['App'].exists;
    const gameDetected = probedPaths['App.game'] && probedPaths['App.game'].exists;
    const isGameLoaded = appDetected && gameDetected;

    let failSafeInfo = null;
    if (!isGameLoaded) {
      failSafeInfo = {
        detected: false,
        message: 'PokéClicker runtime not detected or partially initialized.',
        possibleCauses: [
          'The game page is still downloading assets or initializing knockout bindings.',
          'The extension executed before scripts loaded.',
          'The game architecture/namespace has changed significantly.',
          'Active tab is not an authentic PokéClicker instance.'
        ]
      };
    }

    // Capture state snapshot
    const liveSnapshot = RuntimeDetector.captureLiveSnapshot(root);

    // Heuristic discovery of candidate functions and systems
    const candidates = isGameLoaded ? RuntimeDetector.discoverAllCandidates(root) : {
      totalFunctionsDiscovered: 0,
      allFunctions: [],
      economy: [],
      shiny: [],
      quests: [],
      battle: []
    };

    // Modules status
    const modules = ModuleRegistry ? ModuleRegistry.list() : [];

    return {
      appName: 'PokéClicker Security Lab',
      phase: 1,
      timestamp,
      gameDetected: isGameLoaded,
      gameVersion: versionInfo.version,
      versionSource: versionInfo.detectedAt,
      failSafe: failSafeInfo,
      fingerprint,
      probedPaths,
      snapshot: liveSnapshot,
      candidates: {
        totalDiscovered: candidates.totalFunctionsDiscovered,
        economy: candidates.economy,
        shiny: candidates.shiny,
        quests: candidates.quests,
        battle: candidates.battle
      },
      modules,
      environment: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js/Test',
        location: typeof location !== 'undefined' ? location.href : 'Local'
      }
    };
  }

  return {
    runDiagnostics
  };
});
