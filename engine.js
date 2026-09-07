(function attachEngine(global) {
  const MIN_CPS = 1;
  const MAX_CPS = 30;

  class AutoClickEngine {
    constructor(sendAttack, onResult) {
      this.sendAttack = sendAttack;
      this.onResult = onResult;
      this.cps = 30;
      this.timer = null;
      this.attemptCount = 0;
    }

    start() {
      if (this.timer !== null) {
        return false;
      }
      this.timer = setInterval(() => this.click(), this.interval());
      return true;
    }

    stop() {
      if (this.timer === null) {
        return false;
      }
      clearInterval(this.timer);
      this.timer = null;
      return true;
    }

    toggle() {
      return this.timer === null ? this.start() : (this.stop(), false);
    }

    setCPS(cps) {
      const value = Number(cps);
      if (!Number.isFinite(value) || value < MIN_CPS || value > MAX_CPS) {
        throw new RangeError(`CPS must be between ${MIN_CPS} and ${MAX_CPS}`);
      }
      this.cps = value;
      if (this.timer !== null) {
        this.stop();
        this.start();
      }
    }

    getCPS() {
      return this.cps;
    }

    getAttemptCount() {
      return this.attemptCount;
    }

    resetStats() {
      this.attemptCount = 0;
    }

    interval() {
      return Math.max(1000 / this.cps, 34);
    }

    click() {
      this.attemptCount += 1;
      Promise.resolve(this.sendAttack()).then((result) => {
        if (this.onResult) {
          this.onResult(result);
        }
      }).catch((error) => {
        if (this.onResult) {
          this.onResult({ ok: false, error: error.message });
        }
      });
    }
  }

  global.PokeClickerAutoClicker = { AutoClickEngine, MIN_CPS, MAX_CPS };
})(globalThis);