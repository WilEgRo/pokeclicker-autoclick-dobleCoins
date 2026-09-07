/**
 * PokéClicker Security Lab - Module Registry
 * 
 * Manages modular research and diagnostic capabilities.
 * Enforces phase locking for safety and modular expansion.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ModuleRegistry = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const modules = new Map();

  class Module {
    constructor({ id, name, description, phase = 1, locked = false, enabled = true, handler = null }) {
      this.id = id;
      this.name = name;
      this.description = description;
      this.phase = phase;
      this.locked = locked;
      this.enabled = locked ? false : enabled;
      this.handler = handler;
      this.registeredAt = new Date().toISOString();
    }

    getStatus() {
      if (this.locked) {
        return `LOCKED — Phase ${this.phase}`;
      }
      return this.enabled ? 'ACTIVE' : 'DISABLED';
    }

    enable() {
      if (this.locked) {
        throw new Error(`Cannot enable locked module '${this.id}' (Reserved for Phase ${this.phase})`);
      }
      this.enabled = true;
      return true;
    }

    disable() {
      if (this.locked) return false;
      this.enabled = false;
      return true;
    }

    toJSON() {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        phase: this.phase,
        locked: this.locked,
        enabled: this.enabled,
        status: this.getStatus()
      };
    }
  }

  function register(moduleDef) {
    if (!moduleDef || !moduleDef.id) {
      throw new Error('Module definition must contain a valid id');
    }
    const mod = new Module(moduleDef);
    modules.set(mod.id, mod);
    return mod;
  }

  function get(id) {
    return modules.get(id);
  }

  function list() {
    return Array.from(modules.values()).map(m => m.toJSON());
  }

  function initializeDefaultModules() {
    modules.clear();

    // Phase 1: Active Modules
    register({
      id: 'diagnostics',
      name: 'Runtime Diagnostics',
      description: 'Discovers runtime status, game structure, and exports local JSON diagnostics.',
      phase: 1,
      locked: false,
      enabled: true
    });

    register({
      id: 'runtime-inspector',
      name: 'Runtime Inspector',
      description: 'Safely inspects live paths, objects, observables, and function signatures.',
      phase: 1,
      locked: false,
      enabled: true
    });

    // Phase 2: Locked Modules
    register({
      id: 'economy-research',
      name: 'Economy Research Lab',
      description: 'Candidate analysis for currencies, shops, mining rewards, and farm points.',
      phase: 2,
      locked: true,
      enabled: false
    });

    register({
      id: 'shiny-research',
      name: 'Shiny Research Lab',
      description: 'Candidate analysis for encounter generation and shiny probability algorithms.',
      phase: 2,
      locked: true,
      enabled: false
    });

    register({
      id: 'quest-research',
      name: 'Quest Research Lab',
      description: 'Candidate analysis for quest tracking, quest line progression, and QP rewards.',
      phase: 2,
      locked: true,
      enabled: false
    });

    register({
      id: 'battle-research',
      name: 'Battle & Combat Research Lab',
      description: 'Candidate analysis for attack loop timing, gym battles, and click damages.',
      phase: 2,
      locked: true,
      enabled: false
    });
  }

  // Initialize defaults on load
  initializeDefaultModules();

  return {
    register,
    get,
    list,
    reset: initializeDefaultModules
  };
});
