/**
 * PokéClicker Security Lab - Safe Function Instrumentation Infrastructure
 * 
 * Provides an interception layer for inspecting function invocation arguments
 * and return values without altering original semantics.
 * 
 * IMPORTANT: In Phase 1, no game functions are automatically instrumented.
 * This module exists as safe infrastructure for developer telemetry and testing.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const objInspector = require('./object-inspector');
    module.exports = factory(objInspector);
  } else {
    root.Instrumentation = factory(root.ObjectInspector);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ObjectInspector) {
  'use strict';

  const registry = new Map(); // path -> { originalFn, wrapperFn, options, calls: [] }

  /**
   * Safely wraps a target function at a given path on a root object.
   * 
   * @param {*} root Target root object (e.g. window or App)
   * @param {string} path Dot-separated path to the function (e.g. 'App.game.wallet.gainMoney')
   * @param {Object} [options]
   * @param {Function} [options.onBefore] Callback before original execution: (path, args) => void
   * @param {Function} [options.onAfter] Callback after original execution: (path, args, result, error) => void
   * @param {number} [options.maxCallHistory=50] Maximum calls stored in memory
   * @returns {boolean} True if successfully instrumented
   */
  function instrument(root, path, options = {}) {
    if (typeof root === 'string') {
      if (typeof path === 'function') {
        const cb = path;
        options = (typeof options === 'object' && options !== null) ? { ...options } : {};
        if (!options.onBefore) options.onBefore = cb;
      } else if (typeof path === 'object' && path !== null) {
        options = path;
      }
      path = root;
      root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
    }

    const segments = path.split('.').map(s => s.trim()).filter(Boolean);
    if (segments.length === 0) return false;

    const fnName = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join('.');

    let parentObj = root;
    if (parentPath && ObjectInspector && typeof ObjectInspector.resolvePath === 'function') {
      const resolved = ObjectInspector.resolvePath(root, parentPath);
      if (!resolved.exists || !resolved.value) return false;
      parentObj = resolved.value;
    }

    if (registry.has(path)) {
      const existing = registry.get(path);

      // Check if target is already live and instrumented on the current parentObj
      const isAlreadyAttached = parentObj && parentObj[fnName] === existing.wrapperFn;

      if (isAlreadyAttached) {
        if (options.id && existing.handlers.some(h => h.id === options.id)) {
          return 'SKIP_ALREADY_INSTALLED';
        }
        existing.handlers.push(options);
        return true;
      }

      // Target reference has changed or was detached (e.g. App.game re-instantiated).
      // Safely re-bind to the new live object while preserving handlers.
      const newTargetFn = parentObj ? parentObj[fnName] : null;
      if (typeof newTargetFn === 'function') {
        const rawOriginal = newTargetFn.__psl_original__ || newTargetFn;
        existing.root = root;
        existing.parentObj = parentObj;
        existing.originalFn = rawOriginal;

        if (options.id && !existing.handlers.some(h => h.id === options.id)) {
          existing.handlers.push(options);
        }

        try {
          existing.wrapperFn.__psl_original__ = rawOriginal;
        } catch (_) {}

        parentObj[fnName] = existing.wrapperFn;
        return true;
      }

      return false;
    }

    const originalFn = parentObj[fnName];
    if (typeof originalFn !== 'function') {
      return false;
    }

    const callHistory = [];
    const maxHistory = options.maxCallHistory || 50;
    const handlers = [options];

    const entry = {
      root,
      parentObj,
      fnName,
      originalFn,
      wrapperFn: null,
      handlers,
      options,
      calls: callHistory
    };

    function wrapper(...args) {
      let effectiveArgs = args;

      for (const h of handlers) {
        if (typeof h.onBefore === 'function') {
          try {
            h.onBefore(path, effectiveArgs);
          } catch (_) {}
        }
      }

      for (const h of handlers) {
        if (typeof h.transformArgs === 'function') {
          try {
            const transformed = h.transformArgs(path, effectiveArgs);
            if (Array.isArray(transformed)) {
              effectiveArgs = transformed;
            }
          } catch (_) {}
        }
      }

      const callRecord = {
        timestamp: new Date().toISOString(),
        args: effectiveArgs.map(a => ObjectInspector ? ObjectInspector.getSafePreview(a) : String(a)),
        result: undefined,
        error: undefined
      };

      let result;
      let callError;

      try {
        const currentFn = entry.originalFn || originalFn;
        result = currentFn.apply(this, effectiveArgs);
        callRecord.result = ObjectInspector ? ObjectInspector.getSafePreview(result) : String(result);
      } catch (err) {
        callError = err;
        callRecord.error = err.message;
        throw err;
      } finally {
        callHistory.push(callRecord);
        if (callHistory.length > maxHistory) {
          callHistory.shift();
        }

        for (const h of handlers) {
          if (typeof h.onAfter === 'function') {
            try {
              h.onAfter(path, effectiveArgs, result, callError);
            } catch (_) {}
          }
        }
      }

      return result;
    }

    // Preserve original properties and function length/name
    try {
      Object.defineProperty(wrapper, 'name', { value: originalFn.name || fnName, configurable: true });
      Object.defineProperty(wrapper, 'length', { value: originalFn.length, configurable: true });
      wrapper.__psl_original__ = originalFn;
      wrapper.__psl_instrumented__ = true;
    } catch (_) {}

    entry.wrapperFn = wrapper;
    parentObj[fnName] = wrapper;
    registry.set(path, entry);

    return true;
  }

  /**
   * Restores the original uninstrumented function.
   * 
   * @param {*} root Target root object
   * @param {string} path Dot-separated path to the function
   * @returns {boolean} True if successfully restored
   */
  function restore(root, path) {
    const entry = registry.get(path);
    if (!entry) return false;

    try {
      entry.parentObj[entry.fnName] = entry.originalFn;
      registry.delete(path);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Restores all currently instrumented functions.
   */
  function restoreAll() {
    let count = 0;
    for (const path of Array.from(registry.keys())) {
      if (restore(null, path)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Checks if a function at a given path is currently instrumented.
   */
  function isInstrumented(path) {
    return registry.has(path);
  }

  /**
   * Retrieves invocation history for an instrumented function.
   */
  function getCallHistory(path) {
    const entry = registry.get(path);
    return entry ? [...entry.calls] : [];
  }

  /**
   * Retrieves all currently instrumented paths.
   */
  function getInstalledHooks() {
    return Array.from(registry.keys());
  }

  /**
   * Computes health status for a given set of required paths.
   */
  function getHealth(requiredPaths = [], root = null) {
    const installed = [];
    const failed = [];
    for (const p of requiredPaths) {
      if (registry.has(p)) {
        const entry = registry.get(p);
        if (root && ObjectInspector && typeof ObjectInspector.resolvePath === 'function') {
          const segments = p.split('.').map(s => s.trim()).filter(Boolean);
          const fnName = segments[segments.length - 1];
          const parentPath = segments.slice(0, -1).join('.');
          const resolved = ObjectInspector.resolvePath(root, parentPath);
          const liveParent = resolved.exists ? resolved.value : null;
          if (liveParent && liveParent[fnName] === entry.wrapperFn) {
            installed.push(p);
          } else {
            failed.push(p);
          }
        } else {
          installed.push(p);
        }
      } else {
        failed.push(p);
      }
    }
    return {
      allInstalled: failed.length === 0,
      installedHooks: installed,
      failedHooks: failed,
      duplicateHooks: [],
      totalRegistered: registry.size,
      registeredPaths: Array.from(registry.keys())
    };
  }

  return {
    instrument,
    restore,
    restoreAll,
    isInstrumented,
    getCallHistory,
    getInstalledHooks,
    getHealth
  };
});
