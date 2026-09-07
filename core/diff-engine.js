/**
 * PokéClicker Security Lab - Diff Engine
 * 
 * Computes deterministic diffs between runtime snapshots to observe
 * live state evolution without modifying game state.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DiffEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Flattens a nested object into a single-level dot-notated dictionary.
   */
  function flattenObject(obj, prefix = '', maxDepth = 5) {
    const result = {};

    function recurse(current, currentPrefix, depth) {
      if (depth > maxDepth || current === null || current === undefined) {
        result[currentPrefix] = current;
        return;
      }

      const t = typeof current;
      if (t !== 'object') {
        result[currentPrefix] = current;
        return;
      }

      if (Array.isArray(current)) {
        if (current.length === 0) {
          result[currentPrefix] = [];
          return;
        }
        for (let i = 0; i < current.length; i++) {
          const itemPath = currentPrefix ? `${currentPrefix}[${i}]` : `[${i}]`;
          recurse(current[i], itemPath, depth + 1);
        }
        return;
      }

      const keys = Object.keys(current);
      if (keys.length === 0 && currentPrefix) {
        result[currentPrefix] = {};
        return;
      }

      for (const key of keys) {
        const nextPath = currentPrefix ? `${currentPrefix}.${key}` : key;
        recurse(current[key], nextPath, depth + 1);
      }
    }

    recurse(obj, prefix, 0);
    return result;
  }

  /**
   * Compares two snapshots and returns structured changes.
   * 
   * @param {Object} prevSnapshot Earlier state snapshot
   * @param {Object} nextSnapshot Later state snapshot
   * @returns {Object} { timestamp: string, hasChanges: boolean, changes: Array<Object>, summary: string }
   */
  function compareSnapshots(prevSnapshot, nextSnapshot) {
    if (!prevSnapshot || !nextSnapshot) {
      return {
        timestamp: new Date().toISOString(),
        hasChanges: false,
        changes: [],
        summary: 'Incomplete snapshots provided'
      };
    }

    const flatPrev = flattenObject(prevSnapshot);
    const flatNext = flattenObject(nextSnapshot);

    const allKeys = new Set([...Object.keys(flatPrev), ...Object.keys(flatNext)]);
    const changes = [];

    for (const key of allKeys) {
      const prevVal = flatPrev[key];
      const nextVal = flatNext[key];

      if (!(key in flatPrev)) {
        changes.push({
          type: 'ADDED',
          path: key,
          oldValue: undefined,
          newValue: nextVal,
          preview: `+ ${key} = ${formatValue(nextVal)}`
        });
      } else if (!(key in flatNext)) {
        changes.push({
          type: 'REMOVED',
          path: key,
          oldValue: prevVal,
          newValue: undefined,
          preview: `- ${key} (was ${formatValue(prevVal)})`
        });
      } else if (!isEqual(prevVal, nextVal)) {
        changes.push({
          type: 'MODIFIED',
          path: key,
          oldValue: prevVal,
          newValue: nextVal,
          preview: `${key}: ${formatValue(prevVal)} → ${formatValue(nextVal)}`
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      hasChanges: changes.length > 0,
      totalChanges: changes.length,
      changes,
      summary: changes.length === 0 ? 'No state changes detected.' : `${changes.length} property change(s) detected.`
    };
  }

  function isEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;
    return false;
  }

  function formatValue(val) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'number') {
      return val.toLocaleString();
    }
    if (typeof val === 'string') {
      return `"${val}"`;
    }
    return String(val);
  }

  return {
    flattenObject,
    compareSnapshots,
    formatValue
  };
});
