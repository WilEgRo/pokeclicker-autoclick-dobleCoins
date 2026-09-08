/**
 * PokéClicker Security Lab - UI Controller
 * 
 * Drives the floating laboratory console, handling user events,
 * DOM updates, draggable behavior, auto-clicker integration,
 * and local diagnostic exports.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PanelController = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class PanelController {
    constructor(shadowRoot, bridge) {
      this.root = shadowRoot;
      this.bridge = bridge;
      this.lastDiagnostics = null;
      this.isRecording = false;
      this.isAutoClicking = false;
      this.currentCps = 30;
      this.logCount = 0;
      this.currentHealthState = 'NOT_INITIALIZED';

      this.initElements();
      this.bindEvents();
      this.initDraggable();
    }

    initElements() {
      const q = (sel) => this.root.querySelector(sel);
      const qa = (sel) => this.root.querySelectorAll(sel);

      this.el = {
        panel: q('#psl-panel'),
        header: q('#psl-header-drag'),
        body: q('#psl-body'),
        statusPill: q('#psl-status-pill'),
        btnMinimize: q('#psl-btn-minimize'),
        btnRefresh: q('#psl-btn-refresh'),
        btnRecord: q('#psl-btn-record'),
        btnExport: q('#psl-btn-export'),
        btnClearLog: q('#psl-btn-clear-log'),
        tabs: qa('.psl-tab'),
        tabPanes: qa('.psl-tab-pane'),
        subtabs: qa('.psl-subtab'),
        subtabPanes: qa('.psl-subtab-pane'),
        
        // Auto Clicker
        btnAutoclickQuick: q('#psl-btn-autoclick-quick'),
        btnAutoclickMain: q('#psl-btn-autoclick-main'),
        heroText: q('#psl-hero-text'),
        cpsRange: q('#psl-cps-range'),
        cpsInput: q('#psl-cps-input'),
        acStatusText: q('#ac-status-text'),
        acAttemptsCount: q('#ac-attempts-count'),
        acBattleMode: q('#ac-battle-mode'),
        acDamageVal: q('#ac-damage-val'),
        acGameClicks: q('#ac-game-clicks'),
        acTargetEnemy: q('#ac-target-enemy'),
        acTargetHp: q('#ac-target-hp'),
        btnResetAcStats: q('#psl-btn-reset-ac-stats'),
        acMachineState: q('#ac-machine-state'),
        acBattleType: q('#ac-battle-type'),
        acTransitionsCount: q('#ac-transitions-count'),
        acAvgLatency: q('#ac-avg-latency'),
        acMaxLatency: q('#ac-max-latency'),
        acChkPauseKo: q('#ac-chk-pause-ko'),
        acSelDelay: q('#ac-sel-delay'),
        traceTbody: q('#psl-trace-tbody'),
        btnClearTrace: q('#psl-btn-clear-trace'),
        btnExportTrace: q('#psl-btn-export-trace'),

        // Rewards Lab (FASE 3)
        rwdLabStatus: q('#rwd-lab-status'),
        rwdValMoney: q('#rwd-val-money'),
        rwdValQp: q('#rwd-val-qp'),
        rwdValDt: q('#rwd-val-dt'),
        rwdValDiamonds: q('#rwd-val-diamonds'),
        rwdValFarm: q('#rwd-val-farm'),
        rwdValBp: q('#rwd-val-bp'),
        rwdValCt: q('#rwd-val-ct'),
        rwdLastConfidence: q('#rwd-last-confidence'),
        rwdLastBattle: q('#rwd-last-battle'),
        rwdLastDelta: q('#rwd-last-delta'),
        rwdLastMethod: q('#rwd-last-method'),
        rwdLastInternal: q('#rwd-last-internal'),
        rwdLastArgs: q('#rwd-last-args'),
        rwdLastSource: q('#rwd-last-source'),
        rwdSessBattles: q('#rwd-sess-battles'),
        rwdSessKos: q('#rwd-sess-kos'),
        rwdSessEvents: q('#rwd-sess-events'),
        rwdSessMoney: q('#rwd-sess-money'),
        rwdSessQp: q('#rwd-sess-qp'),
        rwdSessDt: q('#rwd-sess-dt'),
        rwdSessUnknown: q('#rwd-sess-unknown'),
        btnResetRwdSession: q('#psl-btn-reset-rwd-session'),
        btnClearRwdTrace: q('#psl-btn-clear-rwd-trace'),
        btnExportRwdData: q('#psl-btn-export-rwd-data'),
        rwdTraceFilters: q('#rwd-trace-filters'),
        rwdChkCallstack: q('#rwd-chk-callstack'),
        rwdTraceTbody: q('#psl-rwd-trace-tbody'),

        // Battle Reward Modifier Elements (FASE 3.1)
        modCard: q('.psl-card-modifier'),
        modBannerStatus: q('#mod-banner-status'),
        modBtnOff: q('#mod-btn-off'),
        modBtnSim: q('#mod-btn-sim'),
        modBtnActive: q('#mod-btn-active'),
        modBtnReset: q('#mod-btn-reset'),
        modBtnDec: q('#mod-btn-dec'),
        modBtnInc: q('#mod-btn-inc'),
        modInputMult: q('#mod-input-mult'),
        modQuickChips: q('#mod-quick-chips'),
        modCurrMoney: q('#mod-curr-money'),
        modCurrDt: q('#mod-curr-dt'),
        modCurrQp: q('#mod-curr-qp'),
        modCurrCt: q('#mod-curr-ct'),
        modLastVerify: q('#mod-last-verify'),
        modReadoutOrig: q('#mod-readout-orig'),
        modReadoutEff: q('#mod-readout-eff'),
        modReadoutApplied: q('#mod-readout-applied'),
        modReadoutCounts: q('#mod-readout-counts'),

        // Runtime Health Elements (FASE 3.1.1)
        ovHealthState: q('#ov-health-state'),
        ovBridgeLink: q('#ov-bridge-link'),
        ovHooksCount: q('#ov-hooks-count'),
        ovModHook: q('#ov-mod-hook'),
        ovCompGame: q('#ov-comp-game'),
        ovCompWallet: q('#ov-comp-wallet'),
        ovCompStats: q('#ov-comp-stats'),
        ovCompBattle: q('#ov-comp-battle'),
        ovStatusRwdLab: q('#ov-status-rwdlab'),
        ovStatusModifier: q('#ov-status-modifier'),
        ovSwStatus: q('#ov-sw-status'),
        ovSwDetail: q('#ov-sw-detail'),
        btnAuditContext: q('#psl-btn-audit-context'),

        modHealthRuntime: q('#mod-health-runtime'),
        modHealthBridge: q('#mod-health-bridge'),
        modHealthHooks: q('#mod-health-hooks'),
        modHealthContext: q('#mod-health-context'),

        // Overview
        ovGameLoaded: q('#ov-game-loaded'),
        ovGameVersion: q('#ov-game-version'),
        ovFingerprint: q('#ov-fingerprint'),
        ovProbedCount: q('#ov-probed-count'),
        failsafeCard: q('#psl-failsafe-card'),
        failsafeMsg: q('#psl-failsafe-msg'),
        failsafeCauses: q('#psl-failsafe-causes'),
        pathsTbody: q('#psl-paths-tbody'),

        // Live State
        statMoney: q('#stat-wallet-money'),
        statQp: q('#stat-wallet-qp'),
        statDt: q('#stat-wallet-dt'),
        statDiamonds: q('#stat-wallet-diamonds'),
        statFarm: q('#stat-wallet-farm'),
        statBattle: q('#stat-wallet-battle'),
        statCt: q('#stat-wallet-ct'),
        statClickAttacks: q('#stat-click-attacks'),
        statCaptured: q('#stat-captured'),
        statShinyCaptured: q('#stat-shiny-captured'),
        statDefeated: q('#stat-defeated'),
        statBattleEnemy: q('#stat-battle-enemy'),
        statBattleHp: q('#stat-battle-hp'),

        // Candidates
        candEconomyList: q('#cand-economy-list'),
        candShinyList: q('#cand-shiny-list'),
        candQuestsList: q('#cand-quests-list'),
        candBattleList: q('#cand-battle-list'),

        // Inspector
        inspectInput: q('#psl-inspect-input'),
        btnDoInspect: q('#psl-btn-do-inspect'),
        inspectResults: q('#psl-inspect-results'),

        // Changes & Modules (deprecated/hidden)
        changesLog: q('#psl-changes-log'),
        modulesContainer: q('#psl-modules-container'),

        // Safari Lab
        safariStatusPill: q('#safari-status-pill'),
        safariBtnOff: q('#safari-btn-off'),
        safariBtnActive: q('#safari-btn-active'),
        safariBtnReset: q('#safari-btn-reset'),
        safariBtnDec: q('#safari-btn-dec'),
        safariBtnInc: q('#safari-btn-inc'),
        safariInputMult: q('#safari-input-mult'),
        safariQuickChips: q('#safari-quick-chips'),
        safariChkShinyEscape: q('#safari-chk-shiny-escape'),
        safariChkAllEscape: q('#safari-chk-all-escape'),
        safariChkInfiniteBalls: q('#safari-chk-infinite-balls'),
        safariChkDoubleTokens: q('#safari-chk-double-tokens'),
        safariBtnCtDec: q('#safari-btn-ct-dec'),
        safariBtnCtInc: q('#safari-btn-ct-inc'),
        safariInputCtMult: q('#safari-input-ct-mult'),
        safariCtQuickChips: q('#safari-ct-quick-chips'),
        safariLiveStatus: q('#safari-live-status'),
        safariBallsVal: q('#safari-balls-val'),
        safariLevelVal: q('#safari-level-val'),
        safariEnemyName: q('#safari-enemy-name'),
        safariEnemyShiny: q('#safari-enemy-shiny'),
        safariBaseRate: q('#safari-base-rate'),
        safariEffRate: q('#safari-eff-rate'),
        safariBtnResetStats: q('#safari-btn-reset-stats'),
        safariStatCatches: q('#safari-stat-catches'),
        safariStatBalls: q('#safari-stat-balls'),
        safariStatFlees: q('#safari-stat-flees'),
        safariStatTokens: q('#safari-stat-tokens'),

        // Terminal
        terminal: q('#psl-terminal'),
        logCountBadge: q('#psl-log-count')
      };
    }

    bindEvents() {
      // Minimize / Restore
      this.el.btnMinimize.addEventListener('click', () => {
        this.el.body.classList.toggle('minimized');
        this.el.btnMinimize.textContent = this.el.body.classList.contains('minimized') ? '+' : '−';
      });

      // Main Tabs
      this.el.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          this.el.tabs.forEach(t => t.classList.remove('active'));
          this.el.tabPanes.forEach(p => p.classList.remove('active'));

          tab.classList.add('active');
          const targetPane = this.root.querySelector(`#${tab.dataset.tab}`);
          if (targetPane) targetPane.classList.add('active');

          if (tab.dataset.tab === 'tab-rewards') {
            this.refreshRewardLab();
          }
          if (tab.dataset.tab === 'tab-safari') {
            this.refreshSafariLab();
          }
        });
      });

      // Candidate Subtabs
      this.el.subtabs.forEach(st => {
        st.addEventListener('click', () => {
          this.el.subtabs.forEach(s => s.classList.remove('active'));
          this.el.subtabPanes.forEach(p => p.classList.remove('active'));

          st.classList.add('active');
          const targetPane = this.root.querySelector(`#${st.dataset.subtab}`);
          if (targetPane) targetPane.classList.add('active');
        });
      });

      // Auto Clicker Controls
      this.el.btnAutoclickQuick.addEventListener('click', () => this.toggleAutoClick());
      this.el.btnAutoclickMain.addEventListener('click', () => this.toggleAutoClick());

      this.el.cpsRange.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.el.cpsInput.value = val;
        this.currentCps = val;
        this.bridge.request('SET_AUTOCLICK_CPS', { cps: val }).catch(() => {});
      });

      this.el.cpsInput.addEventListener('change', (e) => {
        let val = Number(e.target.value);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 30) val = 30;
        this.el.cpsInput.value = val;
        this.el.cpsRange.value = val;
        this.currentCps = val;
        this.bridge.request('SET_AUTOCLICK_CPS', { cps: val }).catch(() => {});
      });

      this.el.btnResetAcStats.addEventListener('click', async () => {
        try {
          const status = await this.bridge.request('RESET_AUTOCLICK_STATS');
          this.renderAutoClickStatus(status);
        } catch (err) {
          this.appendLog('ERROR', `Reset failed: ${err.message}`);
        }
      });

      // Pause post-KO and Delay diagnostic controls
      if (this.el.acChkPauseKo) {
        this.el.acChkPauseKo.addEventListener('change', (e) => {
          this.bridge.request('SET_DIAGNOSTIC_OPTIONS', { pauseAfterKo: e.target.checked }).catch(() => {});
        });
      }
      if (this.el.acSelDelay) {
        this.el.acSelDelay.addEventListener('change', (e) => {
          this.bridge.request('SET_DIAGNOSTIC_OPTIONS', { postKoDelayMs: Number(e.target.value) }).catch(() => {});
        });
      }

      // Trace actions
      if (this.el.btnClearTrace) {
        this.el.btnClearTrace.addEventListener('click', async () => {
          await this.bridge.request('CLEAR_BATTLE_TRACE').catch(() => {});
          if (this.el.traceTbody) {
            this.el.traceTbody.innerHTML = '<tr><td colspan="5" class="psl-text-center psl-text-muted">Trace limpiado</td></tr>';
          }
        });
      }
      if (this.el.btnExportTrace) {
        this.el.btnExportTrace.addEventListener('click', async () => {
          try {
            const data = await this.bridge.request('GET_BATTLE_DIAGNOSTICS');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `battle-trace-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            this.appendLog('ERROR', `Export trace failed: ${err.message}`);
          }
        });
      }

      // Rewards Lab Actions (FASE 3)
      if (this.el.btnResetRwdSession) {
        this.el.btnResetRwdSession.addEventListener('click', async () => {
          await this.bridge.request('CLEAR_REWARD_SESSION').catch(() => {});
          this.refreshRewardLab();
          this.appendLog('INFO', 'Sesión de recompensas reseteada.');
        });
      }

      if (this.el.btnClearRwdTrace) {
        this.el.btnClearRwdTrace.addEventListener('click', async () => {
          await this.bridge.request('CLEAR_REWARD_TRACE').catch(() => {});
          if (this.el.rwdTraceTbody) {
            this.el.rwdTraceTbody.innerHTML = '<tr><td colspan="5" class="psl-text-center psl-text-muted">Trace limpiado</td></tr>';
          }
        });
      }

      if (this.el.btnExportRwdData) {
        this.el.btnExportRwdData.addEventListener('click', async () => {
          try {
            const data = await this.bridge.request('EXPORT_REWARD_DATA');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reward-economy-lab-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            this.appendLog('ERROR', `Export reward data failed: ${err.message}`);
          }
        });
      }

      if (this.el.rwdTraceFilters) {
        this.el.rwdTraceFilters.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', () => {
            this.el.rwdTraceFilters.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.activeRwdFilter = btn.dataset.rwdFilter || 'ALL';
            this.refreshRewardTrace();
          });
        });
      }

      if (this.el.rwdChkCallstack) {
        this.el.rwdChkCallstack.addEventListener('change', (e) => {
          this.bridge.request('SET_REWARD_LAB_OPTIONS', { includeCallStacks: e.target.checked }).catch(() => {});
        });
      }

      // Battle Reward Modifier Controls (FASE 3.1)
      const setModifierMode = async (mode) => {
        try {
          await this.bridge.request('SET_BATTLE_REWARD_MODE', { mode });
          this.refreshRewardLab();
        } catch (err) {
          this.appendLog('ERROR', `Set mode failed: ${err.message}`);
        }
      };

      if (this.el.modBtnOff) this.el.modBtnOff.addEventListener('click', () => setModifierMode('OFF'));
      if (this.el.modBtnSim) this.el.modBtnSim.addEventListener('click', () => setModifierMode('SIMULATION'));
      if (this.el.modBtnActive) this.el.modBtnActive.addEventListener('click', () => setModifierMode('ACTIVE'));

      if (this.el.modBtnReset) {
        this.el.modBtnReset.addEventListener('click', async () => {
          await this.bridge.request('RESET_BATTLE_REWARD_MODIFIER').catch(() => {});
          this.refreshRewardLab();
          this.appendLog('INFO', 'Battle Reward Modifier restablecido a 1x y modo OFF.');
        });
      }

      const applyMultiplierChange = async (val) => {
        const num = Math.min(100, Math.max(1, Math.round(Number(val) || 1)));
        if (this.el.modInputMult) this.el.modInputMult.value = num;
        try {
          await this.bridge.request('SET_BATTLE_REWARD_MODIFIER', { multiplier: num });
          this.refreshRewardLab();
        } catch (err) {
          this.appendLog('ERROR', `Set multiplier failed: ${err.message}`);
        }
      };

      if (this.el.modBtnDec) {
        this.el.modBtnDec.addEventListener('click', () => {
          const cur = Number(this.el.modInputMult?.value || 1);
          applyMultiplierChange(cur - 1);
        });
      }

      if (this.el.modBtnInc) {
        this.el.modBtnInc.addEventListener('click', () => {
          const cur = Number(this.el.modInputMult?.value || 1);
          applyMultiplierChange(cur + 1);
        });
      }

      if (this.el.modInputMult) {
        this.el.modInputMult.addEventListener('change', (e) => {
          applyMultiplierChange(e.target.value);
        });
      }

      if (this.el.modQuickChips) {
        this.el.modQuickChips.querySelectorAll('button').forEach(chip => {
          chip.addEventListener('click', () => {
            const val = Number(chip.dataset.modVal || 1);
            applyMultiplierChange(val);
          });
        });
      }

      // Currency target toggle handler
      const toggleModifierCurrency = async (currencyKey, btn) => {
        try {
          const isCurrentlyActive = btn.classList.contains('active');
          const willBeActive = !isCurrentlyActive;
          btn.classList.toggle('active', willBeActive);
          await this.bridge.request('SET_BATTLE_REWARD_CURRENCIES', {
            currencies: { [currencyKey]: willBeActive }
          });
          this.refreshRewardLab();
        } catch (err) {
          this.appendLog('ERROR', `Failed to toggle currency: ${err.message}`);
        }
      };

      if (this.el.modCurrMoney) {
        this.el.modCurrMoney.addEventListener('click', () => toggleModifierCurrency('money', this.el.modCurrMoney));
      }
      if (this.el.modCurrDt) {
        this.el.modCurrDt.addEventListener('click', () => toggleModifierCurrency('dungeonToken', this.el.modCurrDt));
      }
      if (this.el.modCurrQp) {
        this.el.modCurrQp.addEventListener('click', () => toggleModifierCurrency('questPoint', this.el.modCurrQp));
      }
      if (this.el.modCurrCt) {
        this.el.modCurrCt.addEventListener('click', () => toggleModifierCurrency('contestToken', this.el.modCurrCt));
      }

      // Actions
      if (this.el.btnRefresh) this.el.btnRefresh.addEventListener('click', () => this.refreshRuntime());
      if (this.el.btnRecord) this.el.btnRecord.addEventListener('click', () => this.toggleRecording());
      if (this.el.btnExport) this.el.btnExport.addEventListener('click', () => this.exportDiagnosticsJSON());
      if (this.el.btnClearLog) this.el.btnClearLog.addEventListener('click', () => this.clearLog());
      
      if (this.el.btnDoInspect) {
        this.el.btnDoInspect.addEventListener('click', () => this.inspectCurrentPath());
      }
      if (this.el.inspectInput) {
        this.el.inspectInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.inspectCurrentPath();
        });
      }

      // Safari Lab Controls
      const setSafariMode = async (mode) => {
        try {
          const status = await this.bridge.request('SET_SAFARI_MODE', { mode });
          this.renderSafariStatus(status);
          this.appendLog('INFO', `Safari Lab modo: ${mode}`);
        } catch (err) {
          this.appendLog('ERROR', `Error al cambiar modo Safari: ${err.message}`);
        }
      };

      if (this.el.safariBtnOff) {
        this.el.safariBtnOff.addEventListener('click', () => setSafariMode('OFF'));
      }
      if (this.el.safariBtnActive) {
        this.el.safariBtnActive.addEventListener('click', () => setSafariMode('ACTIVE'));
      }

      const updateSafariMultiplier = async (val) => {
        let num = Number(val);
        if (isNaN(num) || num < 1) num = 1;
        if (num > 100) num = 100;
        try {
          const status = await this.bridge.request('SET_SAFARI_MULTIPLIER', { multiplier: num });
          this.renderSafariStatus(status);
        } catch (err) {
          this.appendLog('ERROR', `Error multiplicador Safari: ${err.message}`);
        }
      };

      if (this.el.safariInputMult) {
        this.el.safariInputMult.addEventListener('change', (e) => updateSafariMultiplier(e.target.value));
      }
      if (this.el.safariBtnDec) {
        this.el.safariBtnDec.addEventListener('click', () => {
          const cur = Number(this.el.safariInputMult?.value) || 1;
          updateSafariMultiplier(Math.max(1, cur - 1));
        });
      }
      if (this.el.safariBtnInc) {
        this.el.safariBtnInc.addEventListener('click', () => {
          const cur = Number(this.el.safariInputMult?.value) || 1;
          updateSafariMultiplier(Math.min(100, cur + 1));
        });
      }

      if (this.el.safariQuickChips) {
        this.el.safariQuickChips.querySelectorAll('.psl-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            const val = Number(chip.dataset.safariVal);
            if (!isNaN(val)) updateSafariMultiplier(val);
          });
        });
      }

      const updateSafariOptions = async () => {
        try {
          const options = {
            preventShinyEscape: this.el.safariChkShinyEscape ? this.el.safariChkShinyEscape.checked : true,
            preventEscape: this.el.safariChkAllEscape ? this.el.safariChkAllEscape.checked : false,
            infiniteBalls: this.el.safariChkInfiniteBalls ? this.el.safariChkInfiniteBalls.checked : true,
            doubleContestTokens: this.el.safariChkDoubleTokens ? this.el.safariChkDoubleTokens.checked : true
          };
          const status = await this.bridge.request('SET_SAFARI_OPTIONS', options);
          this.renderSafariStatus(status);
        } catch (err) {
          this.appendLog('ERROR', `Error opciones Safari: ${err.message}`);
        }
      };

      if (this.el.safariChkShinyEscape) {
        this.el.safariChkShinyEscape.addEventListener('change', updateSafariOptions);
      }
      if (this.el.safariChkAllEscape) {
        this.el.safariChkAllEscape.addEventListener('change', updateSafariOptions);
      }
      if (this.el.safariChkInfiniteBalls) {
        this.el.safariChkInfiniteBalls.addEventListener('change', updateSafariOptions);
      }
      if (this.el.safariChkDoubleTokens) {
        this.el.safariChkDoubleTokens.addEventListener('change', updateSafariOptions);
      }

      const updateSafariCtMultiplier = async (val) => {
        let num = Number(val);
        if (isNaN(num) || num < 1) num = 1;
        if (num > 100) num = 100;
        try {
          const status = await this.bridge.request('SET_SAFARI_OPTIONS', { contestTokenMultiplier: num });
          this.renderSafariStatus(status);
        } catch (err) {
          this.appendLog('ERROR', `Error multiplicador Contest Tokens: ${err.message}`);
        }
      };

      if (this.el.safariInputCtMult) {
        this.el.safariInputCtMult.addEventListener('change', (e) => updateSafariCtMultiplier(e.target.value));
      }
      if (this.el.safariBtnCtDec) {
        this.el.safariBtnCtDec.addEventListener('click', () => {
          const cur = Number(this.el.safariInputCtMult?.value) || 2;
          updateSafariCtMultiplier(Math.max(1, cur - 1));
        });
      }
      if (this.el.safariBtnCtInc) {
        this.el.safariBtnCtInc.addEventListener('click', () => {
          const cur = Number(this.el.safariInputCtMult?.value) || 2;
          updateSafariCtMultiplier(Math.min(100, cur + 1));
        });
      }
      if (this.el.safariCtQuickChips) {
        this.el.safariCtQuickChips.querySelectorAll('.psl-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            const val = Number(chip.dataset.safariCtVal);
            if (!isNaN(val)) updateSafariCtMultiplier(val);
          });
        });
      }

      if (this.el.safariBtnReset) {
        this.el.safariBtnReset.addEventListener('click', async () => {
          try {
            const status = await this.bridge.request('RESET_SAFARI_SETTINGS');
            this.renderSafariStatus(status);
            this.appendLog('INFO', 'Ajustes de Safari Lab restablecidos.');
          } catch (err) {
            this.appendLog('ERROR', `Error al resetear Safari: ${err.message}`);
          }
        });
      }

      if (this.el.safariBtnResetStats) {
        this.el.safariBtnResetStats.addEventListener('click', async () => {
          try {
            const status = await this.bridge.request('RESET_SAFARI_STATS');
            this.renderSafariStatus(status);
            this.appendLog('INFO', 'Estadísticas de Safari reseteadas.');
          } catch (err) {
            this.appendLog('ERROR', `Error al resetear estadísticas: ${err.message}`);
          }
        });
      }

      if (this.el.btnAuditContext) {
        this.el.btnAuditContext.addEventListener('click', async () => {
          try {
            const audit = await this.bridge.request('CONTEXT_AUDIT');
            this.appendLog('INFO', `[AUDIT] Context: ${audit.context} | App: ${audit.windowApp} | Game: ${audit.game} | Wallet: ${audit.wallet} | Stats: ${audit.statistics} | Battle: ${audit.battle}`);
            console.log('[PSL Context Audit]', audit);
          } catch (err) {
            this.appendLog('ERROR', `Context audit failed: ${err.message}`);
          }
          this.checkWorkerStatus();
        });
      }

      this.checkWorkerStatus();

      // Bridge incoming events
      this.bridge.registerHandler('LOG_ENTRY', (entry) => {
        this.appendLog(entry.level, entry.message);
      });

      this.bridge.registerHandler('RECORDED_DIFF', (diff) => {
        this.appendDiff(diff);
      });

      this.bridge.registerHandler('AUTOCLICK_STATUS', (status) => {
        this.renderAutoClickStatus(status);
      });

      this.bridge.registerHandler('BATTLE_EVENT', (event) => {
        this.appendTraceRow(event);
      });

      this.bridge.registerHandler('RUNTIME_HEALTH_CHANGED', (health) => {
        this.renderRuntimeHealth(health);
        if (this.currentHealthState === 'READY') {
          this.refreshRewardLab();
        }
      });

      this.bridge.registerHandler('BRIDGE_READY', async () => {
        if (this.el.ovBridgeLink) {
          this.el.ovBridgeLink.textContent = 'CONNECTED';
          this.el.ovBridgeLink.style.color = '#4ade80';
        }
        if (this.el.modHealthBridge) {
          this.el.modHealthBridge.textContent = 'CONNECTED';
          this.el.modHealthBridge.className = 'psl-pill psl-pill-success';
        }
        try {
          const pong = await this.bridge.request('RUNTIME_PING');
          if (pong) {
            this.handlePong(pong);
          }
        } catch (_) {}
        await this.refreshRuntime();
        this.syncAutoClickStatus();
        this.refreshRewardLab();
        this.refreshSafariLab();
      });

      // Periodic Safari status polling
      setInterval(() => {
        this.refreshSafariLab();
      }, 1500);
    }

    initDraggable() {
      let isDragging = false;
      let startX, startY, initialX, initialY;

      this.el.header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.closest('.psl-pill') || e.target.closest('input')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.el.panel.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        this.el.panel.style.left = `${initialX + dx}px`;
        this.el.panel.style.top = `${initialY + dy}px`;
        this.el.panel.style.right = 'auto';
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
      });
    }

    updateStatus(text, type = 'warning') {
      this.el.statusPill.textContent = text;
      this.el.statusPill.className = `psl-pill psl-pill-${type}`;
    }

    async checkWorkerStatus() {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage({ type: 'PING_WORKER' }, (response) => {
            const isAlive = Boolean(response && response.status === 'ACTIVE');
            if (this.el.ovSwStatus) {
              this.el.ovSwStatus.textContent = isAlive ? 'ACTIVE' : 'SUSPENDED';
              this.el.ovSwStatus.style.color = isAlive ? '#4ade80' : '#38bdf8';
            }
            if (this.el.ovSwDetail) {
              this.el.ovSwDetail.textContent = isAlive ? 'Active (MV3 Awake)' : 'Suspended / Idle (Normal MV3)';
            }
          });
        } catch (_) {
          if (this.el.ovSwStatus) {
            this.el.ovSwStatus.textContent = 'DECOUPLED';
            this.el.ovSwStatus.style.color = '#38bdf8';
          }
        }
      }
    }

    async toggleAutoClick() {
      try {
        const action = this.isAutoClicking ? 'STOP_AUTOCLICK' : 'START_AUTOCLICK';
        const status = await this.bridge.request(action, { cps: this.currentCps });
        this.renderAutoClickStatus(status);
      } catch (err) {
        this.appendLog('ERROR', `Auto clicker toggle failed: ${err.message}`);
      }
    }

    async syncAutoClickStatus() {
      try {
        const status = await this.bridge.request('GET_AUTOCLICK_STATUS');
        this.renderAutoClickStatus(status);
      } catch (_) {}
    }

    renderAutoClickStatus(status) {
      if (!status) return;

      this.isAutoClicking = Boolean(status.running);

      // Update Toolbar quick button
      if (this.isAutoClicking) {
        this.el.btnAutoclickQuick.classList.add('active');
        this.el.btnAutoclickQuick.innerHTML = '<span class="psl-autoclick-dot"></span> Auto Click [ON]';

        this.el.btnAutoclickMain.className = 'psl-btn-hero psl-btn-hero-on';
        this.el.heroText.textContent = 'DETENER AUTO CLICK';
        this.el.btnAutoclickMain.querySelector('.psl-hero-icon').textContent = '⏹';

        this.el.acStatusText.textContent = 'ACTIVO';
        this.el.acStatusText.style.color = '#4ade80';
      } else {
        this.el.btnAutoclickQuick.classList.remove('active');
        this.el.btnAutoclickQuick.innerHTML = '<span class="psl-autoclick-dot"></span> Auto Click [OFF]';

        this.el.btnAutoclickMain.className = 'psl-btn-hero psl-btn-hero-off';
        this.el.heroText.textContent = 'INICIAR AUTO CLICK';
        this.el.btnAutoclickMain.querySelector('.psl-hero-icon').textContent = '▶';

        this.el.acStatusText.textContent = 'INACTIVO';
        this.el.acStatusText.style.color = '#94a3b8';
      }

      // Telemetry
      if (status.attempts !== undefined) {
        this.el.acAttemptsCount.textContent = Number(status.attempts).toLocaleString();
      }
      if (status.battleName) {
        this.el.acBattleMode.textContent = status.battleName;
      }
      if (status.clickAttacks !== null && status.clickAttacks !== undefined) {
        this.el.acGameClicks.textContent = Number(status.clickAttacks).toLocaleString();
      }
      if (status.clickAttackDamage !== null && status.clickAttackDamage !== undefined) {
        this.el.acDamageVal.textContent = Number(status.clickAttackDamage).toLocaleString();
      }
      if (status.enemy) {
        this.el.acTargetEnemy.textContent = status.enemy.name || 'None';
        this.el.acTargetHp.textContent = (status.enemy.health !== undefined && status.enemy.maxHealth !== undefined)
          ? `${Number(status.enemy.health).toLocaleString()} / ${Number(status.enemy.maxHealth).toLocaleString()}`
          : '-';
      }

      // State Machine & Diagnostics Telemetry
      if (this.el.acMachineState && status.machineState) {
        this.el.acMachineState.textContent = status.machineState;
        this.el.acMachineState.className = `psl-stat-val psl-state-badge psl-badge-${status.machineState.toLowerCase()}`;
      }
      if (this.el.acBattleType && status.battleType) {
        this.el.acBattleType.textContent = status.battleType;
      }
      if (status.diagnosticsSummary) {
        const ds = status.diagnosticsSummary;
        if (this.el.acTransitionsCount) this.el.acTransitionsCount.textContent = ds.enemyTransitions || 0;
        if (this.el.acAvgLatency) this.el.acAvgLatency.textContent = `${ds.averageTransitionLatency || '-'} ms`;
        if (this.el.acMaxLatency) this.el.acMaxLatency.textContent = `${ds.maxTransitionLatency || '-'} ms`;
      }
    }

    appendTraceRow(event) {
      if (!this.el.traceTbody || !event) return;

      const firstRow = this.el.traceTbody.querySelector('tr td.psl-text-center');
      if (firstRow) {
        this.el.traceTbody.innerHTML = '';
      }

      const tr = document.createElement('tr');
      if (event.event === 'ENEMY_HP_REACHED_ZERO') tr.className = 'psl-trace-row-ko';
      else if (event.event === 'ENEMY_CHANGED') tr.className = 'psl-trace-row-change';
      else if (event.event === 'TRANSITION_STALLED') tr.className = 'psl-trace-row-timeout';

      const d = new Date(event.timestamp || Date.now());
      const timeStr = `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;

      const detail = event.enemyName 
        ? `${event.enemyName}${event.metadata?.transitionLatencyMs ? ` (${event.metadata.transitionLatencyMs}ms)` : ''}`
        : (event.metadata ? JSON.stringify(event.metadata) : '-');

      const hpStr = event.hp !== undefined ? `${event.hp}/${event.maxHp || '?'}` : '-';

      tr.innerHTML = `
        <td class="psl-mono" style="font-size: 8px;">#${event.sequence || '-'}</td>
        <td><strong>${event.event}</strong></td>
        <td>${detail}</td>
        <td class="psl-mono">${hpStr}</td>
        <td class="psl-mono">${timeStr}</td>
      `;

      this.el.traceTbody.prepend(tr);

      // Keep max 50 rows
      while (this.el.traceTbody.children.length > 50) {
        this.el.traceTbody.removeChild(this.el.traceTbody.lastChild);
      }
    }

    async refreshRewardLab() {
      try {
        const data = await this.bridge.request('GET_REWARD_SESSION');
        if (!data) return;

        // Render wallet live values
        if (data.currentEconomy?.wallet) {
          const w = data.currentEconomy.wallet;
          if (this.el.rwdValMoney) this.el.rwdValMoney.textContent = typeof w.Money === 'number' ? w.Money.toLocaleString() : '-';
          if (this.el.rwdValQp) this.el.rwdValQp.textContent = typeof w.QuestPoint === 'number' ? w.QuestPoint.toLocaleString() : '-';
          if (this.el.rwdValDt) this.el.rwdValDt.textContent = typeof w.DungeonToken === 'number' ? w.DungeonToken.toLocaleString() : '-';
          if (this.el.rwdValDiamonds) this.el.rwdValDiamonds.textContent = typeof w.Diamond === 'number' ? w.Diamond.toLocaleString() : '-';
          if (this.el.rwdValFarm) this.el.rwdValFarm.textContent = typeof w.FarmPoint === 'number' ? w.FarmPoint.toLocaleString() : '-';
          if (this.el.rwdValBp) this.el.rwdValBp.textContent = typeof w.BattlePoint === 'number' ? w.BattlePoint.toLocaleString() : '-';
          if (this.el.rwdValCt) this.el.rwdValCt.textContent = typeof w.ContestToken === 'number' ? w.ContestToken.toLocaleString() : '-';
        }

        // Render last reward
        if (data.lastReward) {
          const lr = data.lastReward;
          if (this.el.rwdLastConfidence) {
            this.el.rwdLastConfidence.textContent = `CONFIDENCE: ${lr.confidence}`;
            this.el.rwdLastConfidence.className = `psl-badge ${lr.confidence === 'HIGH' ? 'psl-pill-success' : (lr.confidence === 'MEDIUM' ? 'psl-pill-warning' : 'psl-pill-danger')}`;
          }
          if (this.el.rwdLastBattle) this.el.rwdLastBattle.textContent = lr.battle ? `${lr.battle.pokemon} [${lr.battle.context || 'WILD'}] (${lr.battleId || '-'})` : (lr.source === 'quest' ? 'Quest Reward' : 'Sin combate');
          if (this.el.rwdLastDelta) this.el.rwdLastDelta.textContent = `+${lr.reward?.delta || 0} ${lr.reward?.currency || ''}`;
          if (this.el.rwdLastMethod) this.el.rwdLastMethod.textContent = lr.method?.public || '-';
          if (this.el.rwdLastInternal) this.el.rwdLastInternal.textContent = lr.method?.internal || 'None (Direct)';
          if (this.el.rwdLastArgs) this.el.rwdLastArgs.textContent = lr.method?.args ? JSON.stringify(lr.method.args) : '[]';
          if (this.el.rwdLastSource) this.el.rwdLastSource.textContent = `${lr.source} (${lr.economy?.before ?? '-'} → ${lr.economy?.after ?? '-'})`;
        }

        // Render session stats
        if (data.session) {
          const s = data.session;
          if (this.el.rwdSessBattles) this.el.rwdSessBattles.textContent = s.battleCount || 0;
          if (this.el.rwdSessKos) this.el.rwdSessKos.textContent = s.defeatedCount || 0;
          if (this.el.rwdSessEvents) this.el.rwdSessEvents.textContent = s.rewardEventsCount || 0;
          if (this.el.rwdSessMoney) this.el.rwdSessMoney.textContent = `+${Number(s.moneyEarned || 0).toLocaleString()}`;
          if (this.el.rwdSessQp) this.el.rwdSessQp.textContent = `+${Number(s.questPointsEarned || 0).toLocaleString()}`;
          if (this.el.rwdSessDt) this.el.rwdSessDt.textContent = `+${Number(s.dungeonTokensEarned || 0).toLocaleString()}`;
          if (this.el.rwdSessUnknown) this.el.rwdSessUnknown.textContent = s.unknownRewardsCount || 0;
        }

        // Render Battle Reward Modifier (FASE 3.1)
        try {
          const mod = await this.bridge.request('GET_BATTLE_REWARD_MODIFIER');
          if (mod) {
            // Mode Banner
            if (this.el.modBannerStatus) {
              if (mod.mode === 'ACTIVE') {
                if (this.currentHealthState === 'READY') {
                  this.el.modBannerStatus.textContent = '⚡ BATTLE REWARD MODIFIER ACTIVE';
                  this.el.modBannerStatus.className = 'psl-pill psl-pill-amber';
                  if (this.el.modCard) this.el.modCard.classList.add('active-mode');
                } else {
                  this.el.modBannerStatus.textContent = `⚠️ ARMED BUT INACTIVE (${this.currentHealthState || 'OFFLINE'})`;
                  this.el.modBannerStatus.className = 'psl-pill psl-pill-warning';
                  if (this.el.modCard) this.el.modCard.classList.remove('active-mode');
                }
              } else if (mod.mode === 'SIMULATION') {
                this.el.modBannerStatus.textContent = '🧪 SIMULATION — NO GAME STATE MODIFIED';
                this.el.modBannerStatus.className = 'psl-pill psl-pill-cyan';
                if (this.el.modCard) this.el.modCard.classList.remove('active-mode');
              } else {
                this.el.modBannerStatus.textContent = '○ ORIGINAL GAME BEHAVIOR';
                this.el.modBannerStatus.className = 'psl-pill psl-pill-muted';
                if (this.el.modCard) this.el.modCard.classList.remove('active-mode');
              }
            }

            // Mode buttons
            if (this.el.modBtnOff) this.el.modBtnOff.className = `psl-btn psl-btn-ghost ${mod.mode === 'OFF' ? 'active' : ''}`;
            if (this.el.modBtnSim) this.el.modBtnSim.className = `psl-btn psl-btn-ghost ${mod.mode === 'SIMULATION' ? 'active' : ''}`;
            if (this.el.modBtnActive) this.el.modBtnActive.className = `psl-btn psl-btn-ghost ${mod.mode === 'ACTIVE' ? 'active' : ''}`;

            // Multiplier input & chips
            if (this.el.modInputMult && document.activeElement !== this.el.modInputMult) {
              this.el.modInputMult.value = mod.multiplier || 1;
            }
            if (this.el.modQuickChips) {
              this.el.modQuickChips.querySelectorAll('button').forEach(chip => {
                const val = Number(chip.dataset.modVal || 1);
                if (val === mod.multiplier) chip.classList.add('active');
                else chip.classList.remove('active');
              });
            }

            // Currency target chips
            if (mod.enabledCurrencies) {
              if (this.el.modCurrMoney) {
                if (mod.enabledCurrencies.money) this.el.modCurrMoney.classList.add('active');
                else this.el.modCurrMoney.classList.remove('active');
              }
              if (this.el.modCurrDt) {
                if (mod.enabledCurrencies.dungeonToken) this.el.modCurrDt.classList.add('active');
                else this.el.modCurrDt.classList.remove('active');
              }
              if (this.el.modCurrQp) {
                if (mod.enabledCurrencies.questPoint) this.el.modCurrQp.classList.add('active');
                else this.el.modCurrQp.classList.remove('active');
              }
              if (this.el.modCurrCt) {
                if (mod.enabledCurrencies.contestToken) this.el.modCurrCt.classList.add('active');
                else this.el.modCurrCt.classList.remove('active');
              }
            }

            // Readouts & Verification
            const last = mod.lastResult || {};
            if (this.el.modLastVerify) {
              if (last.status === 'VERIFIED') {
                this.el.modLastVerify.textContent = '✓ VERIFIED';
                this.el.modLastVerify.style.color = '#4ade80';
              } else if (last.status === 'DISCREPANCY') {
                this.el.modLastVerify.textContent = '⚠ DISCREPANCY';
                this.el.modLastVerify.style.color = '#f87171';
              } else if (last.status === 'SIMULATED') {
                this.el.modLastVerify.textContent = '🧪 SIMULATED';
                this.el.modLastVerify.style.color = '#22d3ee';
              } else {
                this.el.modLastVerify.textContent = '○ STANDBY';
                this.el.modLastVerify.style.color = '#94a3b8';
              }
            }

            if (this.el.modReadoutOrig) this.el.modReadoutOrig.textContent = last.original ? `+${last.original}` : '0';
            if (this.el.modReadoutEff) this.el.modReadoutEff.textContent = last.effective ? `+${last.effective}` : '0';
            if (this.el.modReadoutApplied) this.el.modReadoutApplied.textContent = last.applied ? `+${last.applied}` : '0';
            if (this.el.modReadoutCounts) {
              this.el.modReadoutCounts.textContent = `${mod.stats?.modifiedCount || 0} / ${mod.stats?.simulatedCount || 0}`;
            }
          }
        } catch (_) {}

        this.refreshRewardTrace();
      } catch (_) {}
    }

    async refreshRewardTrace() {
      if (!this.el.rwdTraceTbody) return;
      try {
        const data = await this.bridge.request('GET_REWARD_TRACE', { filter: this.activeRwdFilter || 'ALL' });
        if (!data?.trace || data.trace.length === 0) {
          this.el.rwdTraceTbody.innerHTML = '<tr><td colspan="5" class="psl-text-center psl-text-muted">Sin eventos registrados para este filtro</td></tr>';
          return;
        }

        this.el.rwdTraceTbody.innerHTML = '';
        for (const item of data.trace.slice(0, 40)) {
          const tr = document.createElement('tr');
          const d = new Date(item.timestamp || Date.now());
          const timeStr = `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;

          let detail = '-';
          let delta = '-';

          if (item.type === 'REWARD_CORRELATED') {
            const r = item.payload;
            detail = `${r.battle?.pokemon || 'Unknown'} → ${r.method?.public || r.method?.internal || 'method'} [${r.confidence}]`;
            delta = `+${r.reward?.delta || 0} ${r.reward?.currency || ''}`;
            tr.className = 'psl-trace-row-change';
          } else if (item.type === 'ECONOMY_METHOD_CALL') {
            const p = item.payload;
            detail = `${p.method}${p.internalMethod ? ` ➔ ${p.internalMethod}` : ''} (${JSON.stringify(p.args)})`;
            if (p.diff) {
              delta = Object.entries(p.diff).map(([k, v]) => `+${v.delta} ${k}`).join(', ');
            }
          } else if (item.type === 'BATTLE_KO_DETECTED') {
            detail = `KO en combate: ${item.payload.enemyName} (${item.payload.battleId})`;
            tr.className = 'psl-trace-row-ko';
          } else if (item.type === 'BATTLE_STARTED') {
            detail = `Nuevo combate: ${item.payload.enemy} (${item.payload.battleId})`;
          } else if (item.type === 'QUEST_CLAIM_AFTER') {
            detail = `Quest Claimed (args: ${JSON.stringify(item.payload.args)})`;
            if (item.payload.diff) {
              delta = Object.entries(item.payload.diff).map(([k, v]) => `+${v.delta} ${k}`).join(', ');
            }
          } else {
            detail = JSON.stringify(item.payload || {});
          }

          tr.innerHTML = `
            <td class="psl-mono" style="font-size: 8px;">#${item.sequence || '-'}</td>
            <td><strong>${item.type}</strong></td>
            <td>${detail}</td>
            <td class="psl-mono" style="color: #4ade80; font-weight: bold;">${delta}</td>
            <td class="psl-mono">${timeStr}</td>
          `;
          this.el.rwdTraceTbody.appendChild(tr);
        }
      } catch (_) {}
    }



    async refreshRuntime() {
      this.el.btnRefresh.disabled = true;
      this.updateStatus('Refreshing...', 'warning');

      try {
        // 1. Reset & run discovery on page bridge
        const health = await this.bridge.request('REFRESH_RUNTIME');
        if (health) {
          this.renderRuntimeHealth(health);
        }
        // 2. Real ping/pong verification
        const pong = await this.bridge.request('RUNTIME_PING');
        if (pong) {
          this.handlePong(pong);
        }
        // 3. Diagnostics probe
        const diagnostics = await this.bridge.request('RUN_DIAGNOSTICS');
        this.lastDiagnostics = diagnostics;
        this.renderDiagnostics(diagnostics);

        // 4. Rewards lab & modifier refresh
        await this.refreshRewardLab();

        this.appendLog('INFO', `[RUNTIME] Refresh complete: ${health?.state || health?.healthState || 'UNKNOWN'}`);
      } catch (err) {
        this.appendLog('ERROR', `Runtime refresh failed: ${err.message}`);
        this.updateStatus('OFFLINE', 'danger');
      } finally {
        this.el.btnRefresh.disabled = false;
      }
    }

    async refreshDiagnostics() {
      this.el.btnRefresh.disabled = true;
      this.updateStatus('Analyzing...', 'warning');

      try {
        const diagnostics = await this.bridge.request('RUN_DIAGNOSTICS');
        this.lastDiagnostics = diagnostics;
        this.renderDiagnostics(diagnostics);
        if (this.currentHealthState === 'NOT_INITIALIZED' || this.currentHealthState === 'OFFLINE') {
          this.updateStatus(diagnostics.gameDetected ? 'READY' : 'OFFLINE', diagnostics.gameDetected ? 'success' : 'danger');
        }
      } catch (err) {
        this.appendLog('ERROR', `Diagnostics request failed: ${err.message}`);
        this.updateStatus('Error', 'danger');
      } finally {
        this.el.btnRefresh.disabled = false;
      }
    }

    handlePong(pong) {
      if (!pong) return;
      if (this.el.ovBridgeLink) {
        this.el.ovBridgeLink.textContent = 'CONNECTED';
        this.el.ovBridgeLink.style.color = '#4ade80';
      }
      if (this.el.modHealthBridge) {
        this.el.modHealthBridge.textContent = 'CONNECTED';
        this.el.modHealthBridge.className = 'psl-pill psl-pill-success';
      }
    }

    renderRuntimeHealth(health) {
      if (!health) return;
      this.currentHealthState = health.state || health.healthState || 'NOT_INITIALIZED';

      const stateClassMap = {
        'READY': 'success',
        'PARTIAL': 'warning',
        'DEGRADED': 'warning',
        'DISCOVERING': 'cyan',
        'OFFLINE': 'danger',
        'NOT_INITIALIZED': 'muted'
      };

      const pillClass = stateClassMap[this.currentHealthState] || 'warning';
      this.updateStatus(this.currentHealthState, pillClass);

      if (this.el.ovHealthState) {
        this.el.ovHealthState.textContent = this.currentHealthState;
        this.el.ovHealthState.className = `psl-pill psl-pill-${pillClass}`;
      }

      if (this.el.ovBridgeLink) {
        this.el.ovBridgeLink.textContent = 'CONNECTED';
        this.el.ovBridgeLink.style.color = '#4ade80';
      }

      if (this.el.ovHooksCount) {
        const hooksList = health.installedRewardHooks || health.instrumentation?.installedHooks || [];
        const installed = Array.isArray(hooksList) ? hooksList.length : 0;
        this.el.ovHooksCount.textContent = `${installed}/9`;
        this.el.ovHooksCount.style.color = installed >= 9 ? '#4ade80' : '#facc15';
      }

      if (this.el.ovModHook) {
        const ready = health.battleRewardModifierReady !== undefined
          ? health.battleRewardModifierReady
          : Boolean(health.instrumentation?.allInstalled);
        this.el.ovModHook.textContent = ready ? '1/1' : '0/1';
        this.el.ovModHook.style.color = ready ? '#4ade80' : '#facc15';
      }

      const setCompStatus = (el, available) => {
        if (!el) return;
        el.textContent = available ? 'AVAILABLE' : 'NOT FOUND';
        el.style.color = available ? '#4ade80' : '#94a3b8';
      };

      if (health.components) {
        setCompStatus(this.el.ovCompGame, health.components.game);
        setCompStatus(this.el.ovCompWallet, health.components.wallet);
        setCompStatus(this.el.ovCompStats, health.components.statistics);
        setCompStatus(this.el.ovCompBattle, health.components.battle);
      }

      if (this.el.ovStatusRwdLab) {
        const rwdReady = health.rewardEconomyLabReady !== undefined
          ? health.rewardEconomyLabReady
          : (health.state === 'READY' || health.healthState === 'READY');
        this.el.ovStatusRwdLab.textContent = rwdReady ? 'READY' : 'DEGRADED';
        this.el.ovStatusRwdLab.style.color = rwdReady ? '#4ade80' : '#facc15';
      }

      if (this.el.ovStatusModifier) {
        this.el.ovStatusModifier.textContent = health.battleRewardModifierReady ? 'READY' : 'DEGRADED';
        this.el.ovStatusModifier.style.color = health.battleRewardModifierReady ? '#4ade80' : '#facc15';
      }

      // Modifier health line
      if (this.el.modHealthRuntime) {
        this.el.modHealthRuntime.textContent = this.currentHealthState;
        this.el.modHealthRuntime.className = `psl-pill psl-pill-${pillClass}`;
      }
      if (this.el.modHealthBridge) {
        this.el.modHealthBridge.textContent = 'CONNECTED';
        this.el.modHealthBridge.className = 'psl-pill psl-pill-success';
      }
      if (this.el.modHealthHooks) {
        const count = (health.installedRewardHooks || []).length;
        const allHooks = count >= 9 && health.battleRewardModifierReady;
        this.el.modHealthHooks.textContent = allHooks ? 'INSTALLED' : `${count}/9`;
        this.el.modHealthHooks.className = `psl-pill psl-pill-${allHooks ? 'success' : 'warning'}`;
      }
    }

    async toggleRecording() {
      if (!this.isRecording) {
        try {
          await this.bridge.request('START_RECORDING', { intervalMs: 1000 });
          this.isRecording = true;
          this.el.btnRecord.classList.add('active');
          this.el.btnRecord.innerHTML = '<span class="psl-record-indicator"></span> Recording...';
          this.appendLog('INFO', 'State change recording activated.');
        } catch (err) {
          this.appendLog('ERROR', `Failed to start recording: ${err.message}`);
        }
      } else {
        try {
          await this.bridge.request('STOP_RECORDING');
          this.isRecording = false;
          this.el.btnRecord.classList.remove('active');
          this.el.btnRecord.innerHTML = '<span class="psl-record-indicator"></span> Record Changes';
          this.appendLog('INFO', 'State change recording deactivated.');
        } catch (err) {
          this.appendLog('ERROR', `Failed to stop recording: ${err.message}`);
        }
      }
    }

    async inspectCurrentPath() {
      const path = this.el.inspectInput.value.trim();
      this.el.inspectResults.textContent = 'Inspecting...';

      try {
        const result = await this.bridge.request('INSPECT_PATH', { path, options: { maxDepth: 2 } });
        this.el.inspectResults.textContent = JSON.stringify(result, null, 2);
      } catch (err) {
        this.el.inspectResults.textContent = `Inspection error: ${err.message}`;
      }
    }

    renderDiagnostics(data) {
      // Overview
      this.el.ovGameLoaded.textContent = data.gameDetected ? '✓ Detected' : '✗ Not Found';
      this.el.ovGameLoaded.style.color = data.gameDetected ? '#4ade80' : '#f87171';
      this.el.ovGameVersion.textContent = data.gameVersion || 'unknown';
      this.el.ovFingerprint.textContent = data.fingerprint ? data.fingerprint.signatureHash : '-';
      
      const probed = data.probedPaths || {};
      const totalProbed = Object.keys(probed).length;
      const existCount = Object.values(probed).filter(p => p.exists).length;
      this.el.ovProbedCount.textContent = `${existCount} / ${totalProbed} exist`;

      // Fail-safe card
      if (!data.gameDetected && data.failSafe) {
        this.el.failsafeCard.style.display = 'block';
        this.el.failsafeMsg.textContent = data.failSafe.message;
        this.el.failsafeCauses.innerHTML = data.failSafe.possibleCauses.map(c => `<li>${c}</li>`).join('');
      } else {
        this.el.failsafeCard.style.display = 'none';
      }

      // Probed Paths Table
      this.el.pathsTbody.innerHTML = Object.values(probed).map(p => `
        <tr>
          <td class="psl-mono">${p.path}</td>
          <td><span class="psl-pill ${p.exists ? 'psl-pill-success' : 'psl-pill-danger'}">${p.exists ? 'YES' : 'NO'}</span></td>
          <td>${p.type || '-'}</td>
          <td class="psl-mono psl-text-sm">${p.preview || '-'}</td>
        </tr>
      `).join('');

      // Live State
      const wallet = data.snapshot ? data.snapshot.wallet : {};
      this.el.statMoney.textContent = typeof wallet.Money === 'number' ? wallet.Money.toLocaleString() : (wallet.Money || '-');
      this.el.statQp.textContent = typeof wallet.QuestPoint === 'number' ? wallet.QuestPoint.toLocaleString() : (wallet.QuestPoint || '-');
      this.el.statDt.textContent = typeof wallet.DungeonToken === 'number' ? wallet.DungeonToken.toLocaleString() : (wallet.DungeonToken || '-');
      this.el.statDiamonds.textContent = typeof wallet.Diamond === 'number' ? wallet.Diamond.toLocaleString() : (wallet.Diamond || '-');
      this.el.statFarm.textContent = typeof wallet.FarmPoint === 'number' ? wallet.FarmPoint.toLocaleString() : (wallet.FarmPoint || '-');
      this.el.statBattle.textContent = typeof wallet.BattlePoint === 'number' ? wallet.BattlePoint.toLocaleString() : (wallet.BattlePoint || '-');
      if (this.el.statCt) {
        this.el.statCt.textContent = typeof wallet.ContestToken === 'number' ? wallet.ContestToken.toLocaleString() : (wallet.ContestToken || '-');
      }

      const stats = data.snapshot ? data.snapshot.statistics : {};
      this.el.statClickAttacks.textContent = stats.clickAttacks !== undefined ? stats.clickAttacks.toLocaleString() : '-';
      this.el.statCaptured.textContent = (stats.totalPokemonCaptured || stats.pokemonCaptured) !== undefined ? (stats.totalPokemonCaptured || stats.pokemonCaptured).toLocaleString() : '-';
      this.el.statShinyCaptured.textContent = stats.totalShinyPokemonCaptured !== undefined ? stats.totalShinyPokemonCaptured.toLocaleString() : '-';
      this.el.statDefeated.textContent = (stats.totalPokemonDefeated || stats.pokemonDefeated) !== undefined ? (stats.totalPokemonDefeated || stats.pokemonDefeated).toLocaleString() : '-';

      const battle = data.snapshot ? data.snapshot.battle : {};
      this.el.statBattleEnemy.textContent = battle.name || 'None';
      this.el.statBattleHp.textContent = (battle.health !== undefined && battle.maxHealth !== undefined) ? `${battle.health} / ${battle.maxHealth}` : '-';

      // Candidates (if container exists)
      if (this.el.candEconomyList) this.renderCandidateList(this.el.candEconomyList, data.candidates?.economy);
      if (this.el.candShinyList) this.renderCandidateList(this.el.candShinyList, data.candidates?.shiny);
      if (this.el.candQuestsList) this.renderCandidateList(this.el.candQuestsList, data.candidates?.quests);
      if (this.el.candBattleList) this.renderCandidateList(this.el.candBattleList, data.candidates?.battle);

      // Modules (if container exists)
      if (this.el.modulesContainer) this.renderModules(data.modules || []);
    }

    renderCandidateList(container, candidates) {
      if (!candidates || candidates.length === 0) {
        container.innerHTML = '<div class="psl-text-muted psl-text-sm">No candidate functions matching keywords found.</div>';
        return;
      }

      container.innerHTML = candidates.map(c => `
        <div class="psl-cand-card">
          <div class="psl-cand-path">${c.candidate}</div>
          <div class="psl-cand-reason">${c.reason} &bull; <span class="psl-mono">(${c.length} args)</span></div>
        </div>
      `).join('');
    }

    renderModules(modules) {
      this.el.modulesContainer.innerHTML = modules.map(m => `
        <div class="psl-module-item">
          <div class="psl-mod-info">
            <span class="psl-mod-name">${m.name}</span>
            <span class="psl-mod-desc">${m.description}</span>
          </div>
          <span class="psl-pill ${m.locked ? 'psl-pill-warning' : 'psl-pill-success'}">${m.status}</span>
        </div>
      `).join('');
    }

    appendDiff(diff) {
      if (!this.el.changesLog) return;
      if (this.el.changesLog.querySelector('.psl-text-muted')) {
        this.el.changesLog.innerHTML = '';
      }

      const diffBlock = document.createElement('div');
      diffBlock.style.marginBottom = '6px';
      
      const timeSpan = document.createElement('div');
      timeSpan.style.color = '#94a3b8';
      timeSpan.style.fontSize = '9px';
      timeSpan.textContent = `[${new Date(diff.timestamp).toLocaleTimeString()}] ${diff.summary}`;
      diffBlock.appendChild(timeSpan);

      for (const ch of diff.changes) {
        const item = document.createElement('div');
        item.className = 'psl-diff-item';
        item.textContent = ch.preview;
        diffBlock.appendChild(item);
      }

      this.el.changesLog.prepend(diffBlock);
    }

    appendLog(level, message) {
      this.logCount++;
      this.el.logCountBadge.textContent = `${this.logCount} entries`;

      const line = document.createElement('div');
      line.className = `psl-log-line psl-log-${level.toLowerCase()}`;
      
      const time = new Date().toLocaleTimeString();
      line.textContent = `[${time}] [${level.toUpperCase()}] ${message}`;

      this.el.terminal.appendChild(line);
      this.el.terminal.scrollTop = this.el.terminal.scrollHeight;
    }

    clearLog() {
      this.el.terminal.innerHTML = '';
      this.logCount = 0;
      this.el.logCountBadge.textContent = '0 entries';
      this.appendLog('INFO', 'Log console cleared.');
    }

    exportDiagnosticsJSON() {
      if (!this.lastDiagnostics) {
        this.appendLog('WARNING', 'No diagnostic data available to export. Refresh runtime first.');
        return;
      }

      const jsonString = JSON.stringify(this.lastDiagnostics, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `pokeclicker-security-lab-diagnostics-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.appendLog('INFO', 'Exported diagnostics JSON locally.');
    }

    async refreshSafariLab() {
      try {
        const status = await this.bridge.request('GET_SAFARI_STATUS');
        if (status) this.renderSafariStatus(status);
      } catch (_) {}
    }

    renderSafariStatus(status) {
      if (!status) return;

      // Status pill & buttons
      const isOff = status.mode === 'OFF';
      const isGuaranteed = status.guaranteedCatch;

      if (this.el.safariStatusPill) {
        if (isOff) {
          this.el.safariStatusPill.textContent = 'INACTIVO (VANILLA)';
          this.el.safariStatusPill.className = 'psl-pill psl-pill-muted';
        } else if (isGuaranteed) {
          this.el.safariStatusPill.textContent = '100% CATCH ACTIVO';
          this.el.safariStatusPill.className = 'psl-pill psl-pill-success';
        } else {
          this.el.safariStatusPill.textContent = `${status.multiplier}x CATCH ACTIVO`;
          this.el.safariStatusPill.className = 'psl-pill psl-pill-info';
        }
      }

      if (this.el.safariBtnOff) {
        this.el.safariBtnOff.classList.toggle('active', isOff);
      }
      if (this.el.safariBtnActive) {
        this.el.safariBtnActive.classList.toggle('active', !isOff);
      }

      // Multiplier input & chips
      if (this.el.safariInputMult) {
        this.el.safariInputMult.value = status.multiplier;
      }
      if (this.el.safariQuickChips) {
        this.el.safariQuickChips.querySelectorAll('.psl-chip').forEach(chip => {
          const val = Number(chip.dataset.safariVal);
          chip.classList.toggle('active', val === status.multiplier);
        });
      }

      // Checkboxes
      if (this.el.safariChkShinyEscape) {
        this.el.safariChkShinyEscape.checked = Boolean(status.preventShinyEscape);
      }
      if (this.el.safariChkAllEscape) {
        this.el.safariChkAllEscape.checked = Boolean(status.preventEscape);
      }
      if (this.el.safariChkInfiniteBalls) {
        this.el.safariChkInfiniteBalls.checked = Boolean(status.infiniteBalls);
      }
      if (this.el.safariChkDoubleTokens) {
        this.el.safariChkDoubleTokens.checked = Boolean(status.doubleContestTokens);
      }

      // Contest Token multiplier input & chips
      if (this.el.safariInputCtMult) {
        this.el.safariInputCtMult.value = status.contestTokenMultiplier || 2;
      }
      if (this.el.safariCtQuickChips) {
        const ctMult = status.contestTokenMultiplier || 2;
        this.el.safariCtQuickChips.querySelectorAll('.psl-chip').forEach(chip => {
          const val = Number(chip.dataset.safariCtVal);
          chip.classList.toggle('active', val === ctMult);
        });
      }

      // Live state
      if (this.el.safariLiveStatus) {
        if (status.inBattle) {
          this.el.safariLiveStatus.textContent = 'En Batalla Safari';
          this.el.safariLiveStatus.style.color = '#38bdf8';
        } else if (status.inSafari) {
          this.el.safariLiveStatus.textContent = 'Explorando Safari';
          this.el.safariLiveStatus.style.color = '#4ade80';
        } else {
          this.el.safariLiveStatus.textContent = 'Fuera de Zona';
          this.el.safariLiveStatus.style.color = '#94a3b8';
        }
      }

      if (this.el.safariBallsVal) {
        this.el.safariBallsVal.textContent = status.currentBalls !== undefined ? status.currentBalls : '-';
      }
      if (this.el.safariLevelVal) {
        this.el.safariLevelVal.textContent = status.safariLevel !== undefined ? `Nivel ${status.safariLevel}` : '-';
      }

      // Enemy readouts
      const enemy = status.currentEnemy;
      if (enemy) {
        if (this.el.safariEnemyName) this.el.safariEnemyName.textContent = enemy.name;
        if (this.el.safariEnemyShiny) {
          this.el.safariEnemyShiny.textContent = enemy.shiny ? '✨ SÍ' : 'No';
          this.el.safariEnemyShiny.style.color = enemy.shiny ? '#facc15' : '#94a3b8';
        }
        if (this.el.safariBaseRate) this.el.safariBaseRate.textContent = `${enemy.baseCatchFactor}%`;
        if (this.el.safariEffRate) this.el.safariEffRate.textContent = `${enemy.effectiveCatchFactor}%`;
      } else if (status.lastEncounter && status.lastEncounter.name !== '-') {
        const last = status.lastEncounter;
        if (this.el.safariEnemyName) this.el.safariEnemyName.textContent = `${last.name} (Último)`;
        if (this.el.safariEnemyShiny) {
          this.el.safariEnemyShiny.textContent = last.shiny ? '✨ SÍ' : 'No';
          this.el.safariEnemyShiny.style.color = last.shiny ? '#facc15' : '#94a3b8';
        }
        if (this.el.safariBaseRate) this.el.safariBaseRate.textContent = `${last.baseCatchFactor}%`;
        if (this.el.safariEffRate) this.el.safariEffRate.textContent = `${last.effectiveCatchFactor}%`;
      } else {
        if (this.el.safariEnemyName) this.el.safariEnemyName.textContent = 'Sin encuentro activo';
        if (this.el.safariEnemyShiny) this.el.safariEnemyShiny.textContent = '-';
        if (this.el.safariBaseRate) this.el.safariBaseRate.textContent = '-';
        if (this.el.safariEffRate) this.el.safariEffRate.textContent = '-';
      }

      // Session stats
      if (status.stats) {
        if (this.el.safariStatCatches) this.el.safariStatCatches.textContent = status.stats.catches || 0;
        if (this.el.safariStatBalls) this.el.safariStatBalls.textContent = status.stats.ballsThrown || 0;
        if (this.el.safariStatFlees) this.el.safariStatFlees.textContent = status.stats.fleesBlocked || 0;
        if (this.el.safariStatTokens) this.el.safariStatTokens.textContent = `+${(status.stats.contestTokensEarned || 0).toLocaleString()}`;
      }
    }
  }

  return {
    PanelController
  };
});
