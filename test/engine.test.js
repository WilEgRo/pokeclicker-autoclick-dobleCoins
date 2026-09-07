const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadEngine() {
  const context = { globalThis: {}, setInterval, clearInterval, Promise, Number, Math, RangeError };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('engine.js', 'utf8'), context);
  return context.PokeClickerAutoClicker.AutoClickEngine;
}

test('start, stop y toggle controlan un único timer', () => {
  const AutoClickEngine = loadEngine();
  let calls = 0;
  const engine = new AutoClickEngine(() => { calls += 1; }, null);
  assert.equal(engine.start(), true);
  assert.equal(engine.start(), false);
  assert.equal(engine.toggle(), false);
  assert.equal(engine.stop(), false);
  assert.equal(calls, 0);
});

test('setCPS acepta 1..30 y rechaza valores inválidos', () => {
  const AutoClickEngine = loadEngine();
  const engine = new AutoClickEngine(() => {}, null);
  engine.setCPS(10);
  assert.equal(engine.getCPS(), 10);
  assert.throws(() => engine.setCPS(0), RangeError);
  assert.throws(() => engine.setCPS(31), RangeError);
  assert.throws(() => engine.setCPS('nope'), RangeError);
});

test('cada intento incrementa el contador y reporta resultado', async () => {
  const AutoClickEngine = loadEngine();
  const results = [];
  const engine = new AutoClickEngine(() => ({ ok: true }), (result) => results.push(result));
  engine.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(engine.getAttemptCount(), 1);
  assert.deepEqual(results, [{ ok: true }]);
  engine.resetStats();
  assert.equal(engine.getAttemptCount(), 0);
});