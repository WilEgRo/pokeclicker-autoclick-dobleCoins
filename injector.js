(function installMainWorldBridge() {
  const SOURCE = 'pokeclicker-auto-clicker-main';
  const REQUEST_SOURCE = 'pokeclicker-auto-clicker-content';
  const retryDelays = [100, 250, 500, 1000, 2000];

  function pageGlobal(name) {
    switch (name) {
      case 'App': return typeof App !== 'undefined' ? App : window.App;
      case 'Battle': return typeof Battle !== 'undefined' ? Battle : window.Battle;
      case 'GymBattle': return typeof GymBattle !== 'undefined' ? GymBattle : window.GymBattle;
      case 'TemporaryBattleBattle': return typeof TemporaryBattleBattle !== 'undefined' ? TemporaryBattleBattle : window.TemporaryBattleBattle;
      case 'DungeonBattle': return typeof DungeonBattle !== 'undefined' ? DungeonBattle : window.DungeonBattle;
      case 'BattleFrontierBattle': return typeof BattleFrontierBattle !== 'undefined' ? BattleFrontierBattle : window.BattleFrontierBattle;
      case 'GymRunner': return typeof GymRunner !== 'undefined' ? GymRunner : window.GymRunner;
      case 'TemporaryBattleRunner': return typeof TemporaryBattleRunner !== 'undefined' ? TemporaryBattleRunner : window.TemporaryBattleRunner;
      case 'DungeonRunner': return typeof DungeonRunner !== 'undefined' ? DungeonRunner : window.DungeonRunner;
      case 'BattleFrontierRunner': return typeof BattleFrontierRunner !== 'undefined' ? BattleFrontierRunner : window.BattleFrontierRunner;
      default: return window[name];
    }
  }

  function unwrap(value) {
    if (typeof value === 'function') {
      try { return value(); } catch (_) { return null; }
    }
    if (value && typeof value.value === 'function') {
      try { return value.value(); } catch (_) { return null; }
    }
    return value;
  }

  function readClickAttackCount() {
    const statistics = pageGlobal('App')?.game?.statistics;
    if (!statistics || !Object.prototype.hasOwnProperty.call(statistics, 'clickAttacks')) {
      return null;
    }
    const value = Number(unwrap(statistics.clickAttacks));
    return Number.isFinite(value) ? value : null;
  }

  function activeBattle() {
    const candidates = [
      ['GymBattle', 'GymRunner'],
      ['TemporaryBattleBattle', 'TemporaryBattleRunner'],
      ['DungeonBattle', 'DungeonRunner'],
      ['BattleFrontierBattle', 'BattleFrontierRunner'],
      ['Battle', null],
    ];
    for (const [battleName, runnerName] of candidates) {
      const battle = pageGlobal(battleName);
      if (typeof battle?.clickAttack !== 'function') {
        continue;
      }
      const runner = runnerName ? pageGlobal(runnerName) : null;
      if (!runnerName || typeof runner?.running !== 'function' || runner.running()) {
        return { battle, battleName };
      }
    }
    return null;
  }

  function runtimeStatus() {
    const battle = activeBattle();
    const app = pageGlobal('App');
    const statistics = app?.game?.statistics;
    const clickAttackDamage = (() => {
      try {
        const value = Number(pageGlobal('App')?.game?.party?.calculateClickAttack?.(true));
        return Number.isFinite(value) ? value : null;
      } catch (_) {
        return null;
      }
    })();
    return {
      gameDetected: location.hostname === 'www.pokeclicker.com',
      appAvailable: Boolean(app?.game),
      battleAvailable: Boolean(battle),
      battleName: battle?.battleName || null,
      clickAttackAvailable: Boolean(battle),
      statisticsAvailable: Boolean(statistics),
      clickAttacksAvailable: readClickAttackCount() !== null,
      clickAttacks: readClickAttackCount(),
      clickAttackDamage,
    };
  }

  function send(id, payload) {
    window.postMessage({ source: SOURCE, id, ...payload }, '*');
  }

  function answerDiagnosis(id, attempt = 0) {
    const status = runtimeStatus();
    if (status.appAvailable && status.clickAttackAvailable && status.clickAttacksAvailable) {
      send(id, { ok: true, type: 'diagnosis', status });
      return;
    }
    if (attempt < retryDelays.length) {
      window.setTimeout(() => answerDiagnosis(id, attempt + 1), retryDelays[attempt]);
      return;
    }
    send(id, { ok: false, type: 'diagnosis', status, error: 'Runtime no encontrado.' });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== REQUEST_SOURCE) {
      return;
    }
    const { id, type } = event.data;
    if (type === 'diagnose') {
      answerDiagnosis(id);
      return;
    }
    if (type !== 'attack') {
      return;
    }
    const before = readClickAttackCount();
    const battle = activeBattle();
    if (!battle || before === null) {
      send(id, { ok: false, type: 'attack-result', before, after: before, battleName: battle?.battleName || null, error: 'Click Attack interno no disponible.', status: runtimeStatus() });
      return;
    }
    try {
      battle.battle.clickAttack();
      window.setTimeout(() => {
        const after = readClickAttackCount();
        send(id, { ok: after !== null && after > before, type: 'attack-result', before, after, battleName: battle.battleName, status: runtimeStatus() });
      }, 20);
    } catch (error) {
      send(id, { ok: false, type: 'attack-result', before, after: readClickAttackCount(), battleName: battle.battleName, error: error.message, status: runtimeStatus() });
    }
  });
})();