/**
 * PokéClicker Security Lab - Object Inspector
 * 
 * Safely inspects JavaScript objects in the game runtime without triggering
 * unexpected side effects, invoking unverified getters, or executing functions.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ObjectInspector = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Safely resolves a dot/bracket notation path on a target object.
   * Example: resolvePath(window, 'App.game.wallet')
   */
  function resolvePath(target, pathStr) {
    if (!target || typeof target !== 'object' && typeof target !== 'function') {
      return { exists: false, value: undefined, error: 'Target is not an object' };
    }
    if (!pathStr || typeof pathStr !== 'string') {
      return { exists: true, value: target };
    }

    const segments = pathStr.split('.').map(s => s.trim()).filter(Boolean);
    let current = target;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (current === null || current === undefined) {
        return { exists: false, value: undefined, segmentFailed: seg, index: i };
      }

      try {
        if (typeof current !== 'object' && typeof current !== 'function') {
          return { exists: false, value: undefined, segmentFailed: seg, index: i };
        }
        
        // Handle Knockout observables if intermediate is an observable
        if (typeof current === 'function' && typeof current.peek === 'function') {
          current = current.peek();
        }

        if (current === null || current === undefined) {
          return { exists: false, value: undefined, segmentFailed: seg, index: i };
        }

        if (!(seg in current) && current[seg] === undefined) {
          // Attempt recovery for declarative-scoped globals (e.g. class App in script.min.js) or Knockout dataFor
          if (i === 0 && (current === target || (typeof window !== 'undefined' && current === window) || (typeof globalThis !== 'undefined' && current === globalThis))) {
            if (seg === 'App') {
              try {
                if (typeof App !== 'undefined') current.App = App;
              } catch (_) {
                try {
                  const evalApp = (0, eval)('typeof App !== "undefined" ? App : undefined');
                  if (evalApp !== undefined) current.App = evalApp;
                } catch (_) {}
              }

              if ((!current.App || !current.App.game) && (current.ko || (typeof window !== 'undefined' && window.ko))) {
                const koObj = current.ko || window.ko;
                const docObj = current.document || (typeof document !== 'undefined' ? document : null);
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
                          if (!current.App) current.App = {};
                          current.App.game = boundData;
                          break;
                        }
                      }
                    }
                  } catch (_) {}
                }
              }
            } else {
              try {
                const evalVal = (0, eval)(`typeof ${seg} !== "undefined" ? ${seg} : undefined`);
                if (evalVal !== undefined) current[seg] = evalVal;
              } catch (_) {}
            }
          }

          if (!(seg in current) && current[seg] === undefined) {
            return { exists: false, value: undefined, segmentFailed: seg, index: i };
          }
        }

        current = current[seg];
      } catch (err) {
        return { exists: false, value: undefined, error: err.message, segmentFailed: seg, index: i };
      }
    }

    return {
      exists: current !== undefined,
      value: current
    };
  }

  /**
   * Unwraps Knockout observables safely without mutating state.
   */
  function safeUnwrap(val) {
    if (val && typeof val === 'function' && typeof val.peek === 'function') {
      try {
        return val.peek();
      } catch (e) {
        return `[Observable Read Error: ${e.message}]`;
      }
    }
    return val;
  }

  /**
   * Generates a safe, non-evaluating preview string of any value.
   */
  function getSafePreview(val) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    
    const unwrapped = safeUnwrap(val);
    const t = typeof unwrapped;

    if (t === 'number' || t === 'boolean' || t === 'string' || t === 'bigint') {
      return String(unwrapped);
    }
    if (t === 'symbol') {
      return unwrapped.toString();
    }
    if (t === 'function') {
      const isObs = typeof val.peek === 'function';
      if (isObs) {
        return `[Observable: ${getSafePreview(unwrapped)}]`;
      }
      const fnName = val.name || 'anonymous';
      return `[Function: ${fnName} (${val.length} args)]`;
    }
    if (Array.isArray(unwrapped)) {
      return `Array(${unwrapped.length})`;
    }
    if (t === 'object') {
      const ctor = unwrapped.constructor ? unwrapped.constructor.name : 'Object';
      return `[${ctor}]`;
    }
    return String(unwrapped);
  }

  /**
   * Inspects an object safely up to maxDepth without running methods or dangerous getters.
   * 
   * @param {*} target The root object to inspect (e.g. window or resolved object)
   * @param {string} [path=''] Path label for reporting
   * @param {Object} [options] Inspection options
   * @param {number} [options.maxDepth=3] Max recursion depth
   * @param {number} [options.maxKeys=100] Max keys per object
   */
  function inspectObject(target, path = '', options = {}) {
    const maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : 3;
    const maxKeys = typeof options.maxKeys === 'number' ? options.maxKeys : 100;
    const visited = new WeakSet();

    function recurse(obj, currentPath, depth) {
      if (obj === null) {
        return { path: currentPath, exists: true, type: 'null', preview: 'null' };
      }
      if (obj === undefined) {
        return { path: currentPath, exists: false, type: 'undefined', preview: 'undefined' };
      }

      const unwrapped = safeUnwrap(obj);
      const valType = typeof unwrapped;

      // Primitive types
      if (valType !== 'object' && valType !== 'function') {
        return {
          path: currentPath,
          exists: true,
          type: valType,
          value: unwrapped,
          preview: String(unwrapped)
        };
      }

      // Function detection without execution
      if (valType === 'function') {
        const isObs = typeof obj.peek === 'function';
        if (!isObs) {
          return {
            path: currentPath,
            exists: true,
            type: 'function',
            name: obj.name || 'anonymous',
            length: obj.length,
            preview: `[Function: ${obj.name || 'anonymous'}]`
          };
        }
        // If it is Knockout observable, show both observable status and unwrapped value
        return {
          path: currentPath,
          exists: true,
          type: 'observable',
          name: obj.name || 'observable',
          unwrappedType: typeof unwrapped,
          value: (typeof unwrapped !== 'object' && typeof unwrapped !== 'function') ? unwrapped : undefined,
          preview: `[Observable: ${getSafePreview(unwrapped)}]`
        };
      }

      // Check circular references
      if (typeof unwrapped === 'object') {
        if (visited.has(unwrapped)) {
          return {
            path: currentPath,
            exists: true,
            type: 'circular_reference',
            preview: '[Circular Reference]'
          };
        }
        visited.add(unwrapped);
      }

      const isArr = Array.isArray(unwrapped);
      const ctorName = unwrapped.constructor ? unwrapped.constructor.name : 'Object';

      const result = {
        path: currentPath,
        exists: true,
        type: isArr ? 'array' : 'object',
        constructorName: ctorName,
        preview: isArr ? `Array(${unwrapped.length})` : `[${ctorName}]`,
        keys: [],
        methods: [],
        properties: {},
        keysTruncated: false
      };

      if (depth >= maxDepth) {
        result.depthLimited = true;
        return result;
      }

      // Collect keys safely using getOwnPropertyNames and prototype keys if relevant
      let keys = [];
      try {
        const ownKeys = Object.getOwnPropertyNames(unwrapped);
        keys = isArr ? ownKeys.filter(k => k !== 'length') : ownKeys;
        
        // Also check prototype methods if object is a custom class instance
        if (ctorName !== 'Object' && ctorName !== 'Array' && Object.getPrototypeOf(unwrapped)) {
          const protoKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(unwrapped));
          for (const pk of protoKeys) {
            if (pk !== 'constructor' && !keys.includes(pk)) {
              keys.push(pk);
            }
          }
        }
      } catch (e) {
        result.error = `Key enumeration failed: ${e.message}`;
        return result;
      }

      if (keys.length > maxKeys) {
        result.keysTruncated = true;
        result.totalKeys = keys.length;
        keys = keys.slice(0, maxKeys);
      }

      result.keys = keys;

      for (const key of keys) {
        const propPath = currentPath ? `${currentPath}.${key}` : key;
        try {
          // Check descriptor to avoid triggering hazardous custom getters
          let desc;
          let proto = unwrapped;
          while (proto && !desc) {
            desc = Object.getOwnPropertyDescriptor(proto, key);
            proto = Object.getPrototypeOf(proto);
          }

          if (desc && desc.get && !desc.value) {
            // Getter present: attempt safe inspection or mark as getter
            result.properties[key] = {
              path: propPath,
              type: 'getter',
              preview: '[Getter]'
            };
            continue;
          }

          const val = unwrapped[key];
          if (typeof val === 'function' && typeof val.peek !== 'function') {
            result.methods.push({
              name: key,
              path: propPath,
              length: val.length,
              preview: `[Function: ${key}]`
            });
          } else {
            result.properties[key] = recurse(val, propPath, depth + 1);
          }
        } catch (propErr) {
          result.properties[key] = {
            path: propPath,
            type: 'error',
            error: propErr.message,
            preview: `[Error: ${propErr.message}]`
          };
        }
      }

      return result;
    }

    // Resolve initial path if path is a subpath of target
    let rootValue = target;
    let rootPathLabel = path || 'root';

    if (path && typeof path === 'string' && target !== null && target !== undefined) {
      const resolved = resolvePath(target, path);
      if (resolved.exists) {
        rootValue = resolved.value;
        rootPathLabel = path;
      } else if (typeof target !== 'object' && typeof target !== 'function') {
        return {
          path,
          exists: false,
          type: 'undefined',
          preview: 'Path not found',
          error: resolved.error || `Segment '${resolved.segmentFailed}' not found`
        };
      }
    }

    return recurse(rootValue, rootPathLabel, 0);
  }

  return {
    resolvePath,
    safeUnwrap,
    getSafePreview,
    inspectObject
  };
});
