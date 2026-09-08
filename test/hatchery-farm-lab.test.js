const { test, describe } = require('node:test');
const assert = require('node:assert');
const HatcheryFarmLab = require('../modules/hatchery/hatchery-farm-lab');

describe('HatcheryFarmLab Unit Tests', () => {
  function createMockGame() {
    let eggStepsProgressed = 0;
    const eggs = [
      { canHatch: () => true, isNone: () => false },
      { canHatch: () => false, isNone: () => false }
    ];
    const queue = [];

    const caughtPokemon = [
      { name: 'Charizard', level: () => 100, breeding: () => false, breedingEfficiency: 15, baseAttack: 84, shiny: () => false },
      { name: 'Gyarados', level: 100, breeding: false, breedingEfficiency: 25, baseAttack: 125, shiny: true },
      { name: 'Pikachu', level: 50, breeding: false, breedingEfficiency: 5, baseAttack: 55, shiny: false } // Not eligible (< 100)
    ];

    const breeding = {
      eggSlots: 4,
      queueSlots: 8, // Hoenn capacity = 12 total
      eggList: eggs,
      queueList: () => queue,
      hasFreeEggSlot: () => eggs.length < 4,
      hasFreeQueueSlot: () => queue.length < 8,
      addPokemonToHatchery: (pokemon) => {
        if (breeding.hasFreeEggSlot()) {
          eggs.push({ canHatch: () => false, isNone: () => false, pokemon });
          return true;
        } else if (breeding.hasFreeQueueSlot()) {
          queue.push(pokemon);
          return true;
        }
        return false;
      },
      hatchPokemonEgg: (index, auto) => {
        eggs.splice(index, 1);
        return true;
      },
      progressEggs: function (amount) {
        eggStepsProgressed += amount;
      }
    };

    const plots = [
      { isUnlocked: true, isSafeLocked: false, stage: () => 4, berry: 1 }, // Ripe berry #1
      { isUnlocked: true, isSafeLocked: false, stage: 2, berry: 2 },        // Growing
      { isUnlocked: true, isSafeLocked: true, stage: 4, berry: 3 },         // SafeLocked (should not harvest)
      { isUnlocked: false, isSafeLocked: false, stage: 4, berry: 4 }        // Locked plot
    ];

    let harvestedBerries = [];
    let plantedBerries = [];

    const farming = {
      plotList: plots,
      hasBerry: (b) => true,
      harvest: (idx) => {
        harvestedBerries.push(plots[idx].berry);
        plots[idx].stage = 0;
      },
      plant: (idx, b) => {
        plantedBerries.push({ idx, berry: b });
        plots[idx].stage = 1;
      }
    };

    const App = {
      game: {
        breeding,
        farming,
        party: { caughtPokemon }
      }
    };

    return {
      App,
      breeding,
      farming,
      plots,
      caughtPokemon,
      getStepsProgressed: () => eggStepsProgressed
    };
  }

  test('1. Initializes with default configuration and Hoenn capacity awareness', () => {
    const lab = new HatcheryFarmLab();
    const status = lab.getStatus();
    assert.strictEqual(status.autoHatch, true);
    assert.strictEqual(status.autoBreed, true);
    assert.strictEqual(status.stepMultiplier, 5);
    assert.strictEqual(status.breedPriority, 'efficiency');
    assert.strictEqual(status.autoHarvest, true);
    assert.strictEqual(status.autoReplant, true);
  });

  test('2. Installs progressEggs hook and accelerates steps with multiplier', () => {
    const mock = createMockGame();
    const lab = new HatcheryFarmLab({ windowRef: mock, stepMultiplier: 5 });
    const res = lab.installHooks(mock);

    assert.strictEqual(res.success, true);
    assert.ok(res.installed.includes('App.game.breeding.progressEggs'));

    // Call progressEggs with 10 steps -> should deliver 50 steps
    mock.breeding.progressEggs(10);
    assert.strictEqual(mock.getStepsProgressed(), 50);

    lab.stopAutomation();
  });

  test('3. Auto-hatch eclosiona huevos listos (canHatch = true)', () => {
    const mock = createMockGame();
    const lab = new HatcheryFarmLab({ windowRef: mock, autoHatch: true, autoBreed: false });
    assert.strictEqual(mock.breeding.eggList.length, 2);

    lab.tickHatchery();

    // 1 egg was hatched
    assert.strictEqual(lab.stats.eggsHatched, 1);
    assert.strictEqual(mock.breeding.eggList.length, 1);
    lab.stopAutomation();
  });

  test('4. Auto-breed llena ranuras y cola hasta capacidad de Hoenn (12 slots)', () => {
    const mock = createMockGame();
    const lab = new HatcheryFarmLab({ windowRef: mock, autoHatch: false, autoBreed: true, breedPriority: 'efficiency' });

    // Initial: 2 eggs in eggList, 0 in queue
    lab.tickHatchery();
    // Gyarados (eff 25) placed into egg slot 3
    assert.strictEqual(lab.stats.eggsPlaced, 1);

    lab.tickHatchery();
    // Charizard (eff 15) placed into egg slot 4
    assert.strictEqual(lab.stats.eggsPlaced, 2);

    // Status check
    const status = lab.getStatus();
    assert.strictEqual(status.eggSlots, 4);
    assert.strictEqual(status.queueSlots, 8);
    assert.strictEqual(status.totalCapacity, 12);
    lab.stopAutomation();
  });

  test('5. Breeding priority sorting works accurately (attack vs shiny vs efficiency)', () => {
    const mock = createMockGame();
    const lab = new HatcheryFarmLab({ windowRef: mock });

    // Efficiency priority
    lab.breedPriority = 'efficiency';
    let best = lab.getBestBreedCandidate();
    assert.strictEqual(best.name, 'Gyarados'); // eff 25 > 15

    // Attack priority
    lab.breedPriority = 'attack';
    best = lab.getBestBreedCandidate();
    assert.strictEqual(best.name, 'Gyarados'); // atk 125 > 84

    // Shiny priority (prioritize non-shiny first to complete shiny dex)
    lab.breedPriority = 'shiny';
    best = lab.getBestBreedCandidate();
    assert.strictEqual(best.name, 'Charizard'); // non-shiny first!
    lab.stopAutomation();
  });

  test('6. Auto-harvest recolecta bayas maduras y respeta SafeLock', () => {
    const mock = createMockGame();
    const lab = new HatcheryFarmLab({ windowRef: mock, autoHarvest: true, autoReplant: false });

    lab.tickFarming();

    // Only plot 0 should be harvested (plot 1 is stage 2, plot 2 is safeLocked, plot 3 is not unlocked)
    assert.strictEqual(lab.stats.berriesHarvested, 1);
    lab.stopAutomation();
  });

  test('7. Auto-replant replanta automáticamente la misma baya cosechada', () => {
    const mock = createMockGame();
    const lab = new HatcheryFarmLab({ windowRef: mock, autoHarvest: true, autoReplant: true });

    lab.tickFarming();

    assert.strictEqual(lab.stats.berriesHarvested, 1);
    assert.strictEqual(lab.stats.berriesReplanted, 1);
    lab.stopAutomation();
  });

  test('8. SetOptions y ResetStats funcionan de manera reactiva', () => {
    const mock = createMockGame();
    const lab = new HatcheryFarmLab({ windowRef: mock });

    lab.stats.eggsHatched = 42;
    lab.stats.berriesHarvested = 10;

    lab.setOptions({ stepMultiplier: 25, breedPriority: 'shiny' });
    const s = lab.getStatus();
    assert.strictEqual(s.stepMultiplier, 25);
    assert.strictEqual(s.breedPriority, 'shiny');

    lab.resetStats();
    assert.strictEqual(lab.stats.eggsHatched, 0);
    assert.strictEqual(lab.stats.berriesHarvested, 0);
    lab.stopAutomation();
  });
});
