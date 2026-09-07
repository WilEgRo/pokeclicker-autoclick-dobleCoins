/**
 * PokéClicker Security Lab - Function Inspector
 * 
 * Safely catalogs functions and methods across the game runtime without executing them.
 * Provides heuristic candidate discovery for game systems (economy, combat, shiny, quests).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const objInspector = require('./object-inspector');
    module.exports = factory(objInspector);
  } else {
    root.FunctionInspector = factory(root.ObjectInspector);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ObjectInspector) {
  'use strict';

  /**
   * Discovers all functions reachable from a root object up to a maximum depth.
   * Never invokes any function.
   * 
   * @param {*} root Target object to explore (e.g. window or App)
   * @param {string} [basePath=''] Base path identifier
   * @param {Object} [options]
   * @param {number} [options.maxDepth=3]
   * @param {number} [options.maxFunctions=500]
   * @returns {Array<Object>} List of discovered function signatures
   */
  function discoverFunctions(root, basePath = '', options = {}) {
    const maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : 3;
    const maxFunctions = typeof options.maxFunctions === 'number' ? options.maxFunctions : 500;
    const visited = new WeakSet();
    const discovered = [];

    function traverse(current, path, depth) {
      if (discovered.length >= maxFunctions || depth > maxDepth) return;
      if (!current || typeof current !== 'object' && typeof current !== 'function') return;

      // Handle Knockout observables: unwrap peek if observable object
      let target = current;
      if (typeof current === 'function' && typeof current.peek === 'function') {
        try {
          target = current.peek();
        } catch (_) {
          return;
        }
      }

      if (!target || typeof target !== 'object' && typeof target !== 'function') return;

      if (typeof target === 'object') {
        if (visited.has(target)) return;
        visited.add(target);
      }

      // If this target itself is a standard function, record it
      if (typeof target === 'function' && typeof target.peek !== 'function') {
        discovered.push({
          name: target.name || path.split('.').pop() || 'anonymous',
          path,
          type: 'function',
          length: target.length,
          isAsync: target.constructor && target.constructor.name === 'AsyncFunction',
          preview: `[Function: ${target.name || 'anonymous'} (${target.length} params)]`
        });
      }

      // Enumerate properties and prototype methods
      let keys = [];
      try {
        keys = Object.getOwnPropertyNames(target);
        const proto = Object.getPrototypeOf(target);
        if (proto && proto !== Object.prototype && proto !== Function.prototype && proto !== Array.prototype) {
          const protoKeys = Object.getOwnPropertyNames(proto);
          for (const pk of protoKeys) {
            if (pk !== 'constructor' && !keys.includes(pk)) {
              keys.push(pk);
            }
          }
        }
      } catch (_) {
        return;
      }

      for (const key of keys) {
        if (discovered.length >= maxFunctions) break;
        // Avoid traversing DOM / window noise if starting from window
        if (depth === 0 && isGlobalNoise(key)) continue;

        const propPath = path ? `${path}.${key}` : key;
        try {
          // Check descriptor to prevent getter execution
          let desc;
          let p = target;
          while (p && !desc) {
            desc = Object.getOwnPropertyDescriptor(p, key);
            p = Object.getPrototypeOf(p);
          }

          if (desc && desc.get && !desc.value) {
            continue; // Skip dangerous getters
          }

          const val = target[key];
          if (typeof val === 'function' && typeof val.peek !== 'function') {
            discovered.push({
              name: key,
              path: propPath,
              type: 'function',
              length: val.length,
              isAsync: val.constructor && val.constructor.name === 'AsyncFunction',
              preview: `[Function: ${key} (${val.length} params)]`
            });
            // Functions might have static properties/methods (e.g. Battle.clickAttack)
            traverse(val, propPath, depth + 1);
          } else if (typeof val === 'object' && val !== null) {
            traverse(val, propPath, depth + 1);
          }
        } catch (_) {
          // Ignore property access exceptions safely
        }
      }
    }

    let startObj = root;
    if (basePath && ObjectInspector && typeof ObjectInspector.resolvePath === 'function') {
      const resolved = ObjectInspector.resolvePath(root, basePath);
      if (resolved.exists) {
        startObj = resolved.value;
      } else {
        return [];
      }
    }

    traverse(startObj, basePath, 0);
    return discovered;
  }

  /**
   * Filters common browser / DOM properties when traversing window.
   */
  function isGlobalNoise(key) {
    const noise = new Set([
      'window', 'document', 'location', 'navigator', 'screen', 'history',
      'localStorage', 'sessionStorage', 'indexedDB', 'webkitStorageInfo',
      'crypto', 'performance', 'speechSynthesis', 'customElements',
      'caches', 'cookieStore', 'trustedTypes', 'chrome', 'styleMedia',
      'parent', 'top', 'frames', 'self', 'opener'
    ]);
    return noise.has(key) || key.startsWith('on') || key.startsWith('webkit');
  }

  /**
   * Heuristically searches functions matching specific domain keywords.
   * 
   * @param {Array<Object>} functionList Discovered function signatures
   * @param {Array<string>} keywords Keywords to test against function path/name
   * @param {string} domain Domain name for tagging
   * @returns {Array<Object>} List of candidate functions with explanation
   */
  function matchCandidates(functionList, keywords, domain) {
    const results = [];
    const lowerKeywords = keywords.map(k => k.toLowerCase());

    for (const fn of functionList) {
      const fullPathLower = fn.path.toLowerCase();
      const nameLower = fn.name.toLowerCase();
      
      const matched = lowerKeywords.filter(k => 
        fullPathLower.includes(k) || nameLower.includes(k)
      );

      if (matched.length > 0) {
        results.push({
          candidate: fn.path,
          name: fn.name,
          type: fn.type,
          length: fn.length,
          domain,
          reason: `Matches keyword(s): [${matched.join(', ')}]`,
          matchedKeywords: matched
        });
      }
    }

    return results;
  }

  return {
    discoverFunctions,
    matchCandidates
  };
});
