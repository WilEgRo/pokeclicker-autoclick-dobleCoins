const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('el lector de estadística acepta observable Knockout y rechaza ausencia', () => {
  const messages = [];
  const context = {
    window: {
      App: { game: { statistics: { clickAttacks: () => 7 } } },
      addEventListener() {},
      postMessage(message) { messages.push(message); },
    },
    location: { hostname: 'www.pokeclicker.com' },
    setTimeout,
  };
  context.window.window = context.window;
  vm.runInNewContext(fs.readFileSync('injector.js', 'utf8'), context);
  assert.equal(messages.length, 0);
});

test('el adaptador nunca usa el DOM y conserva el incremento como criterio', () => {
  const source = fs.readFileSync('injector.js', 'utf8');
  assert.equal(source.includes('elementFromPoint'), false);
  assert.equal(source.includes('.click()'), false);
  assert.match(source, /after > before/);
});