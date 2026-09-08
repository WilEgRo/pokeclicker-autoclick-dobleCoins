/**
 * PokéClicker Security Lab - Dungeon Lab Module
 * 
 * Automates dungeon exploration, tile pathfinding, chest opening,
 * boss engagement, and auto-restart / retry loops.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DungeonLab = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function unwrap(val) {
    if (typeof val === 'function') {
      try {
        return typeof val.peek === 'function' ? val.peek() : val();
      } catch (_) {
        return null;
      }
    }
    return val;
  }

  function resolveDungeonRunner(root) {
    if (root.DungeonRunner) return root.DungeonRunner;
    try {
      const dr = (0, eval)('typeof DungeonRunner !== "undefined" ? DungeonRunner : undefined');
      if (dr) return dr;
    } catch (_) {}
    return null;
  }

  function resolveDungeonBattle(root) {
    if (root.DungeonBattle) return root.DungeonBattle;
    try {
      const db = (0, eval)('typeof DungeonBattle !== "undefined" ? DungeonBattle : undefined');
      if (db) return db;
    } catch (_) {}
    return null;
  }

  class DungeonLab {
    constructor(options = {}) {
      this.windowRef = options.windowRef || (typeof window !== 'undefined' ? window : globalThis);

      // Options
      this.enabled = options.enabled !== undefined ? Boolean(options.enabled) : false;
      this.autoBoss = options.autoBoss !== undefined ? Boolean(options.autoBoss) : true;
      this.autoChests = options.autoChests !== undefined ? Boolean(options.autoChests) : true;
      this.autoRestart = options.autoRestart !== undefined ? Boolean(options.autoRestart) : true;
      this.minTokens = options.minTokens !== undefined ? Number(options.minTokens) : 1000;

      // Loop & State
      this.dungeonInterval = null;
      this.lastDungeonName = null;
      this.isRestarting = false;

      // Telemetry
      this.stats = {
        dungeonsCleared: 0,
        bossesDefeated: 0,
        chestsOpened: 0,
        tilesExplored: 0
      };

      this.loadSettings();
    }

    loadSettings() {
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('psl_dungeon_lab_settings');
          if (raw) {
            const s = JSON.parse(raw);
            if (s.enabled !== undefined) this.enabled = Boolean(s.enabled);
            if (s.autoBoss !== undefined) this.autoBoss = Boolean(s.autoBoss);
            if (s.autoChests !== undefined) this.autoChests = Boolean(s.autoChests);
            if (s.autoRestart !== undefined) this.autoRestart = Boolean(s.autoRestart);
            if (s.minTokens !== undefined) this.minTokens = Number(s.minTokens);
          }
        }
      } catch (_) {}
    }

    saveSettings() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('psl_dungeon_lab_settings', JSON.stringify({
            enabled: this.enabled,
            autoBoss: this.autoBoss,
            autoChests: this.autoChests,
            autoRestart: this.autoRestart,
            minTokens: this.minTokens
          }));
        }
      } catch (_) {}
    }

    installHooks(root = this.windowRef) {
      if (!root) return { success: false, installed: [], failed: ['no_root'] };
      this.windowRef = root;

      this.startAutomation();
      return {
        success: true,
        installed: ['DungeonRunner.automation'],
        failed: []
      };
    }

    startAutomation() {
      if (this.dungeonInterval) clearInterval(this.dungeonInterval);

      // Fast navigation tick
      this.dungeonInterval = setInterval(() => {
        try {
          this.tickDungeon();
        } catch (_) {}
      }, 150);
    }

    stopAutomation() {
      if (this.dungeonInterval) {
        clearInterval(this.dungeonInterval);
        this.dungeonInterval = null;
      }
    }

    tickDungeon() {
      if (!this.enabled) return;

      const dr = resolveDungeonRunner(this.windowRef);
      const db = resolveDungeonBattle(this.windowRef);
      if (!dr || !dr.dungeon) return;

      // Track current dungeon name for auto-restart
      if (dr.dungeon.name) {
        this.lastDungeonName = dr.dungeon.name;
      }

      // Check if dungeon has finished or won
      const hasWon = unwrap(dr.defeatedBoss) || unwrap(dr.dungeonFinished);
      if (hasWon) {
        if (this.autoRestart && !this.isRestarting) {
          this.handleAutoRestart(dr);
        }
        return;
      }

      // If currently fighting enemy or boss, attack
      if (unwrap(dr.fighting) || unwrap(dr.fightingBoss)) {
        if (db && typeof db.clickAttack === 'function') {
          db.clickAttack();
        }
        return;
      }

      const map = dr.map;
      if (!map || typeof map.currentTile !== 'function') return;

      const curTile = map.currentTile();
      if (!curTile) return;

      // Tile type enum: 0: empty, 1: entrance, 2: enemy, 3: chest, 4: boss, 5: ladder
      const tileType = unwrap(curTile.type);

      // 1. If standing on chest and autoChests enabled, open it
      if (tileType === 3 && this.autoChests) {
        dr.openChest();
        this.stats.chestsOpened++;
        return;
      }

      // 2. If standing on boss and autoBoss enabled, fight it
      if (tileType === 4 && this.autoBoss && !unwrap(dr.fightingBoss)) {
        dr.startBossFight();
        this.stats.bossesDefeated++;
        return;
      }

      // 3. If standing on ladder, go to next floor
      if (tileType === 5) {
        dr.nextFloor();
        return;
      }

      // 4. Autonomous Map Exploration: Find next accessible tile
      this.exploreNextTile(dr, map);
    }

    exploreNextTile(dr, map) {
      const board = unwrap(map.board);
      const playerPos = unwrap(map.playerPosition);
      if (!board || !playerPos) return;

      const floor = playerPos.floor !== undefined ? playerPos.floor : 0;
      const currentFloorTiles = board[floor];
      if (!currentFloorTiles || !Array.isArray(currentFloorTiles)) return;

      // Collect accessible unvisited or special tiles
      let bestMove = null;
      let bossMove = null;
      let chestMove = null;
      let unvisitedMove = null;

      for (let y = 0; y < currentFloorTiles.length; y++) {
        for (let x = 0; x < currentFloorTiles[y].length; x++) {
          const tile = currentFloorTiles[y][x];
          if (!tile) continue;

          const pt = { x, y, floor };
          const canAccess = map.hasAccessToTile(pt);
          if (!canAccess) continue;

          const tType = unwrap(tile.type);
          const isVisited = Boolean(tile.isVisited);

          // Priority 1: Boss tile (if visible/known)
          if (tType === 4 && this.autoBoss) {
            bossMove = pt;
            break;
          }

          // Priority 2: Chest tile
          if (tType === 3 && !isVisited && this.autoChests && !chestMove) {
            chestMove = pt;
          }

          // Priority 3: Unvisited tile
          if (!isVisited && !unvisitedMove) {
            unvisitedMove = pt;
          }
        }
        if (bossMove) break;
      }

      bestMove = bossMove || chestMove || unvisitedMove;

      if (bestMove) {
        map.moveToCoordinates(bestMove.x, bestMove.y, bestMove.floor);
        this.stats.tilesExplored++;
      } else {
        // Random accessible neighbor as fallback
        const neighbors = typeof map.nearbyTiles === 'function' ? map.nearbyTiles(playerPos) : [];
        const validNeighbor = neighbors.find(n => map.hasAccessToTile(n.position));
        if (validNeighbor) {
          map.moveToCoordinates(validNeighbor.position.x, validNeighbor.position.y, validNeighbor.position.floor);
        }
      }
    }

    handleAutoRestart(dr) {
      this.isRestarting = true;
      this.stats.dungeonsCleared++;

      setTimeout(() => {
        try {
          const wallet = this.windowRef?.App?.game?.wallet;
          const tokens = wallet ? unwrap(wallet.currencies[2]) || unwrap(wallet.currencies?.dungeonToken) || 0 : 0;

          if (tokens >= this.minTokens && dr.dungeon && dr.canStartDungeon(dr.dungeon)) {
            dr.initializeDungeon(dr.dungeon);
          }
        } catch (_) {}
        this.isRestarting = false;
      }, 800);
    }

    setOptions(opts = {}) {
      if (typeof opts.enabled === 'boolean') this.enabled = opts.enabled;
      if (typeof opts.autoBoss === 'boolean') this.autoBoss = opts.autoBoss;
      if (typeof opts.autoChests === 'boolean') this.autoChests = opts.autoChests;
      if (typeof opts.autoRestart === 'boolean') this.autoRestart = opts.autoRestart;
      if (typeof opts.minTokens === 'number') this.minTokens = Math.max(0, opts.minTokens);
      this.saveSettings();
      return this.getStatus();
    }

    resetStats() {
      this.stats = {
        dungeonsCleared: 0,
        bossesDefeated: 0,
        chestsOpened: 0,
        tilesExplored: 0
      };
      return this.getStatus();
    }

    getStatus() {
      const dr = resolveDungeonRunner(this.windowRef);
      const inDungeon = Boolean(dr && dr.dungeon && (unwrap(dr.timeLeft) > 0 || unwrap(dr.fighting)));
      const dungeonName = dr?.dungeon?.name || this.lastDungeonName || 'Ninguna';
      const timeLeft = dr ? Math.round(unwrap(dr.timeLeft) || 0) : 0;
      const fightingBoss = dr ? Boolean(unwrap(dr.fightingBoss)) : false;

      return {
        enabled: this.enabled,
        autoBoss: this.autoBoss,
        autoChests: this.autoChests,
        autoRestart: this.autoRestart,
        minTokens: this.minTokens,
        inDungeon,
        dungeonName,
        timeLeft,
        fightingBoss,
        stats: { ...this.stats }
      };
    }
  }

  return DungeonLab;
});
