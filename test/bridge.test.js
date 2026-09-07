const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('bridge envía comandos y resuelve la respuesta correspondiente', async () => {
  let listener;
  const sent = [];
  const context = {
    window: {
      addEventListener(type, callback) { if (type === 'message') listener = callback; },
      postMessage(message) { sent.push(message); },
      setTimeout,
    },
    setTimeout,
    Promise,
    Map,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('bridge.js', 'utf8'), context);
  const bridge = new context.PokeClickerGameBridge();
  const response = bridge.attack();
  assert.equal(sent[0].type, 'attack');
  listener({ source: context.window, data: {
    source: 'pokeclicker-auto-clicker-main', id: sent[0].id, ok: true, before: 3, after: 4,
  } });
  assert.deepEqual(await response, {
    source: 'pokeclicker-auto-clicker-main', id: sent[0].id, ok: true, before: 3, after: 4,
  });
});

test('bridge mantiene vivo el diagnóstico durante los reintentos del runtime', () => {
  const source = fs.readFileSync('bridge.js', 'utf8');
  assert.match(source, /REQUEST_TIMEOUT_MS = 6000/);
});