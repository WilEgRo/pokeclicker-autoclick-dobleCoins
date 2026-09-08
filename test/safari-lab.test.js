const { test, describe } = require('node:test');
const assert = require('node:assert');
const SafariLab = require('../modules/safari/safari-lab');

describe('SafariLab Unit Tests', () => {
  function createMockGame() {
    const enemyPokemon = {
      name: 'Chansey',
      displayName: 'Chansey',
      shiny: false,
      catchFactor: 5,
      escapeFactor: 30
    };

    const SafariPokemon = function (data) {
      Object.assign(this, data);
    };
    SafariPokemon.prototype = {
      get catchFactor() {
        return this._catchFactor || 5;
      },
      get escapeFactor() {
        return this._escapeFactor || 30;
      }
    };

    let ballsVal = 30;
    const Safari = {
      balls: (val) => {
        if (val !== undefined) ballsVal = val;
        return ballsVal;
      },
      inProgress: () => true,
      inBattle: () => true,
      safariLevel: () => 10
    };

    const SafariBattle = {
      enemy: enemyPokemon,
      calcCapture: async function () {
        return [false, 1]; // Vanilla fails by default
      },
      throwBall: function () {
        Safari.balls(Safari.balls() - 1);
        return true;
      }
    };

    return {
      Safari,
      SafariBattle,
      SafariPokemon,
      enemyPokemon
    };
  }

  test('1. Initializes with default configuration', () => {
    const lab = new SafariLab();
    const status = lab.getStatus();
    assert.strictEqual(status.mode, 'ACTIVE');
    assert.strictEqual(status.multiplier, 100);
    assert.strictEqual(status.guaranteedCatch, true);
    assert.strictEqual(status.preventShinyEscape, true);
    assert.strictEqual(status.infiniteBalls, true);
  });

  test('2. Installs hooks on mock game environment', () => {
    const mock = createMockGame();
    const lab = new SafariLab({ windowRef: mock });
    const res = lab.installHooks(mock);

    assert.strictEqual(res.success, true);
    assert.ok(res.installed.includes('SafariBattle.calcCapture'));
    assert.ok(res.installed.includes('SafariPokemon.prototype.escapeFactor'));
    assert.ok(res.installed.includes('SafariBattle.throwBall'));
  });

  test('3. ACTIVE guaranteed catch (100%) resolves isCaught = true, rolls = 3', async () => {
    const mock = createMockGame();
    const lab = new SafariLab({ windowRef: mock, mode: 'ACTIVE', multiplier: 100 });
    lab.installHooks(mock);

    const [isCaught, numRolls] = await mock.SafariBattle.calcCapture();
    assert.strictEqual(isCaught, true);
    assert.strictEqual(numRolls, 3);
    assert.strictEqual(lab.stats.catches, 1);
    assert.strictEqual(lab.stats.ballsThrown, 1);
    assert.strictEqual(lab.lastEncounter.name, 'Chansey');
  });

  test('4. OFF mode leaves original game capture logic untouched', async () => {
    const mock = createMockGame();
    const lab = new SafariLab({ windowRef: mock, mode: 'OFF' });
    lab.installHooks(mock);

    const [isCaught, numRolls] = await mock.SafariBattle.calcCapture();
    assert.strictEqual(isCaught, false);
    assert.strictEqual(numRolls, 1);
  });

  test('5. Prevent escape zeroes escapeFactor', () => {
    const mock = createMockGame();
    const lab = new SafariLab({ windowRef: mock, preventEscape: true });
    lab.installHooks(mock);

    const p = new mock.SafariPokemon({ name: 'Tauros', shiny: false });
    assert.strictEqual(p.escapeFactor, 0);
  });

  test('6. Prevent shiny escape only zeroes escapeFactor for shinies', () => {
    const mock = createMockGame();
    const lab = new SafariLab({ windowRef: mock, preventEscape: false, preventShinyEscape: true });
    lab.installHooks(mock);

    const normal = new mock.SafariPokemon({ name: 'Scyther', shiny: false });
    const shiny = new mock.SafariPokemon({ name: 'Scyther', shiny: true });

    assert.strictEqual(normal.escapeFactor, 30);
    assert.strictEqual(shiny.escapeFactor, 0);
  });

  test('7. Infinite balls maintains Safari.balls at 30', () => {
    const mock = createMockGame();
    const lab = new SafariLab({ windowRef: mock, infiniteBalls: true });
    lab.installHooks(mock);

    mock.Safari.balls(20);
    mock.SafariBattle.throwBall();
    assert.strictEqual(mock.Safari.balls(), 30);
  });

  test('8. Setters update mode, multiplier, and options cleanly', () => {
    const lab = new SafariLab({ mode: 'OFF', multiplier: 1 });
    lab.setMode('ACTIVE');
    lab.setMultiplier(5);
    lab.setOptions({ preventEscape: true, infiniteBalls: false, doubleContestTokens: true, contestTokenMultiplier: 3 });

    const status = lab.getStatus();
    assert.strictEqual(status.mode, 'ACTIVE');
    assert.strictEqual(status.multiplier, 5);
    assert.strictEqual(status.guaranteedCatch, false);
    assert.strictEqual(status.preventEscape, true);
    assert.strictEqual(status.infiniteBalls, false);
    assert.strictEqual(status.doubleContestTokens, true);
    assert.strictEqual(status.contestTokenMultiplier, 3);
  });

  test('9. gainContestTokens multiplies tokens in Johto Safari', () => {
    const mock = createMockGame();
    let tokensAwarded = 0;
    mock.App = {
      game: {
        wallet: {
          gainContestTokens: (amount) => {
            tokensAwarded += amount;
          }
        }
      }
    };

    const lab = new SafariLab({
      windowRef: mock,
      mode: 'ACTIVE',
      doubleContestTokens: true,
      contestTokenMultiplier: 2
    });
    lab.installHooks(mock);

    // Call gainContestTokens as Johto Safari does upon catch
    mock.App.game.wallet.gainContestTokens(25);

    // Should be multiplied by 2 => 50
    assert.strictEqual(tokensAwarded, 50);
    assert.strictEqual(lab.getStatus().stats.contestTokensEarned, 50);

    // Test with multiplier 5
    lab.setOptions({ contestTokenMultiplier: 5 });
    mock.App.game.wallet.gainContestTokens(10);
    assert.strictEqual(tokensAwarded, 50 + 50); // + 50
    assert.strictEqual(lab.getStatus().stats.contestTokensEarned, 100);

    // Test disabled toggle
    lab.setOptions({ doubleContestTokens: false });
    mock.App.game.wallet.gainContestTokens(20);
    assert.strictEqual(tokensAwarded, 100 + 20); // + 20 unmodified
  });
});
