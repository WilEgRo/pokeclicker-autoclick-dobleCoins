const { test, describe } = require('node:test');
const assert = require('node:assert');
const DungeonLab = require('../modules/dungeon/dungeon-lab');

describe('DungeonLab Unit Tests', () => {
  function createMockGame() {
    let openedChests = 0;
    let startedBoss = 0;
    let clickAttacks = 0;
    let initializedCount = 0;
    let movedTo = [];

    const dungeon = {
      name: 'Petalburg Woods',
      tokenCost: 150
    };

    let playerPos = { x: 0, y: 0, floor: 0 };
    let curTile = { type: () => 1, isVisited: true }; // Start on entrance

    // 2x2 board:
    // (0,0): entrance, (1,0): chest
    // (0,1): empty,    (1,1): boss
    const board = [
      [
        [{ type: () => 1, isVisited: true }, { type: () => 3, isVisited: false }],
        [{ type: () => 0, isVisited: false }, { type: () => 4, isVisited: false }]
      ]
    ];

    const map = {
      board: () => board,
      playerPosition: () => playerPos,
      currentTile: () => curTile,
      hasAccessToTile: (pt) => true,
      moveToCoordinates: (x, y, floor) => {
        movedTo.push({ x, y, floor });
        playerPos = { x, y, floor };
        curTile = board[floor][y][x];
      }
    };

    let defeatedBossState = false;
    let isFighting = false;
    let isFightingBoss = false;

    const DungeonRunner = {
      dungeon,
      map,
      defeatedBoss: () => defeatedBossState,
      dungeonFinished: () => false,
      fighting: () => isFighting,
      fightingBoss: () => isFightingBoss,
      timeLeft: () => 60,
      openChest: () => {
        openedChests++;
        curTile.isVisited = true;
      },
      startBossFight: () => {
        startedBoss++;
        isFightingBoss = true;
      },
      nextFloor: () => {},
      canStartDungeon: (d) => true,
      initializeDungeon: (d) => {
        initializedCount++;
        defeatedBossState = false;
      }
    };

    const DungeonBattle = {
      clickAttack: () => {
        clickAttacks++;
      }
    };

    let dungeonTokens = 5000;
    const wallet = {
      currencies: [0, 0, dungeonTokens] // index 2 = dungeonToken
    };

    const App = {
      game: {
        wallet
      }
    };

    return {
      App,
      DungeonRunner,
      DungeonBattle,
      map,
      setFighting: (v) => { isFighting = v; },
      setDefeatedBoss: (v) => { defeatedBossState = v; },
      setTokens: (v) => { wallet.currencies[2] = v; },
      getOpenedChests: () => openedChests,
      getStartedBoss: () => startedBoss,
      getClickAttacks: () => clickAttacks,
      getInitializedCount: () => initializedCount,
      getMovedTo: () => movedTo
    };
  }

  test('1. Initializes with default configuration', () => {
    const lab = new DungeonLab();
    const status = lab.getStatus();
    assert.strictEqual(status.enabled, false);
    assert.strictEqual(status.autoBoss, true);
    assert.strictEqual(status.autoChests, true);
    assert.strictEqual(status.autoRestart, true);
    assert.strictEqual(status.minTokens, 1000);
  });

  test('2. Explores tiles and prioritizes Boss / Chests / Unvisited', () => {
    const mock = createMockGame();
    const lab = new DungeonLab({ windowRef: mock, enabled: true });

    lab.tickDungeon();

    // From (0,0), tile (1,1) is boss (type 4), so bossMove should be chosen first!
    const moved = mock.getMovedTo();
    assert.strictEqual(moved.length, 1);
    assert.strictEqual(moved[0].x, 1);
    assert.strictEqual(moved[0].y, 1);
    assert.strictEqual(lab.stats.tilesExplored, 1);
    lab.stopAutomation();
  });

  test('3. Auto-boss triggers startBossFight on boss tile', () => {
    const mock = createMockGame();
    const lab = new DungeonLab({ windowRef: mock, enabled: true });

    // Move to boss tile
    mock.map.moveToCoordinates(1, 1, 0);
    lab.tickDungeon();

    assert.strictEqual(mock.getStartedBoss(), 1);
    assert.strictEqual(lab.stats.bossesDefeated, 1);
    lab.stopAutomation();
  });

  test('4. Auto-attack clicks attacks during battle', () => {
    const mock = createMockGame();
    const lab = new DungeonLab({ windowRef: mock, enabled: true });

    mock.setFighting(true);
    lab.tickDungeon();
    assert.strictEqual(mock.getClickAttacks(), 1);
    lab.stopAutomation();
  });

  test('5. Auto-chests opens chests when on chest tile', () => {
    const mock = createMockGame();
    const lab = new DungeonLab({ windowRef: mock, enabled: true, autoChests: true });

    // Move to chest tile (1, 0)
    mock.map.moveToCoordinates(1, 0, 0);
    lab.tickDungeon();

    assert.strictEqual(mock.getOpenedChests(), 1);
    assert.strictEqual(lab.stats.chestsOpened, 1);
    lab.stopAutomation();
  });

  test('6. Auto-restart handles continuous dungeon loop when tokens >= minTokens', async () => {
    const mock = createMockGame();
    const lab = new DungeonLab({ windowRef: mock, enabled: true, autoRestart: true, minTokens: 1000 });

    mock.setDefeatedBoss(true);
    mock.setTokens(5000);

    lab.tickDungeon();
    assert.strictEqual(lab.stats.dungeonsCleared, 1);
    assert.strictEqual(lab.isRestarting, true);

    // Wait for timeout
    await new Promise(r => setTimeout(r, 900));
    assert.strictEqual(mock.getInitializedCount(), 1);
    assert.strictEqual(lab.isRestarting, false);
    lab.stopAutomation();
  });

  test('7. Auto-restart does NOT restart if tokens fall below minTokens safety guard', async () => {
    const mock = createMockGame();
    const lab = new DungeonLab({ windowRef: mock, enabled: true, autoRestart: true, minTokens: 1000 });

    mock.setDefeatedBoss(true);
    mock.setTokens(500); // Below 1000!

    lab.tickDungeon();
    assert.strictEqual(lab.stats.dungeonsCleared, 1);

    await new Promise(r => setTimeout(r, 900));
    assert.strictEqual(mock.getInitializedCount(), 0); // Guard prevented restart!
    lab.stopAutomation();
  });

  test('8. SetOptions and ResetStats update status cleanly', () => {
    const mock = createMockGame();
    const lab = new DungeonLab({ windowRef: mock });

    lab.stats.chestsOpened = 15;
    lab.setOptions({ enabled: true, minTokens: 2500 });
    const s = lab.getStatus();

    assert.strictEqual(s.enabled, true);
    assert.strictEqual(s.minTokens, 2500);

    lab.resetStats();
    assert.strictEqual(lab.stats.chestsOpened, 0);
    lab.stopAutomation();
  });
});
