(function attachBridge(global) {
  const REQUEST_TIMEOUT_MS = 6000;

  class GameBridge {
    constructor() {
      this.nextId = 1;
      this.pending = new Map();
      window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.source !== 'pokeclicker-auto-clicker-main') {
          return;
        }
        const pending = this.pending.get(event.data.id);
        if (!pending) {
          return;
        }
        this.pending.delete(event.data.id);
        pending.resolve(event.data);
      });
    }

    request(type) {
      const id = this.nextId++;
      return new Promise((resolve) => {
        this.pending.set(id, { resolve });
        window.postMessage({ source: 'pokeclicker-auto-clicker-content', type, id }, '*');
        window.setTimeout(() => {
          if (this.pending.delete(id)) {
            resolve({ ok: false, id, error: 'Tiempo de espera agotado.' });
          }
        }, REQUEST_TIMEOUT_MS);
      });
    }

    diagnose() {
      return this.request('diagnose');
    }

    attack() {
      return this.request('attack');
    }
  }

  global.PokeClickerGameBridge = GameBridge;
})(globalThis);