/**
 * PokéClicker Security Lab - Content Script (ISOLATED World)
 * 
 * Injects page scripts into the MAIN world and mounts the isolated Shadow DOM UI.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (document.getElementById('psl-shadow-host')) {
    return;
  }

  /**
   * Injects a script file into the page's MAIN execution world.
   */
  function injectScript(filePath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(filePath);
      script.type = 'text/javascript';
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = (err) => {
        script.remove();
        reject(err);
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  /**
   * Sequentially injects core runtime scripts into the MAIN world.
   */
  async function injectPageWorldEngine() {
    const scripts = [
      'engine.js',
      'core/object-inspector.js',
      'core/function-inspector.js',
      'core/diff-engine.js',
      'core/instrumentation.js',
      'core/module-registry.js',
      'core/runtime-detector.js',
      'modules/diagnostics/runtime-diagnostics.js',
      'modules/diagnostics/battle-lifecycle-diagnostics.js',
      'modules/rewards/reward-economy-lab.js',
      'modules/rewards/battle-reward-modifier.js',
      'core/message-bridge.js',
      'core/battle-state-machine.js',
      'page-bridge.js'
    ];

    for (const src of scripts) {
      try {
        await injectScript(src);
      } catch (e) {
        console.error(`[PSL] Failed to inject ${src}:`, e);
      }
    }
  }

  /**
   * Fetches an extension asset as text.
   */
  async function fetchAsset(filePath) {
    const url = chrome.runtime.getURL(filePath);
    const response = await fetch(url);
    return response.text();
  }

  /**
   * Mounts the floating UI inside an isolated Shadow DOM container.
   */
  async function mountUI() {
    try {
      const [htmlContent, cssContent] = await Promise.all([
        fetchAsset('ui/panel.html'),
        fetchAsset('ui/panel.css')
      ]);

      const host = document.createElement('div');
      host.id = 'psl-shadow-host';
      document.documentElement.appendChild(host);

      const shadow = host.attachShadow({ mode: 'open' });

      // Add CSS
      const style = document.createElement('style');
      style.textContent = cssContent;
      shadow.appendChild(style);

      // Add HTML
      const template = document.createElement('div');
      template.innerHTML = htmlContent;
      shadow.appendChild(template.firstElementChild);

      // Create Content Bridge
      const bridge = window.MessageBridge ? window.MessageBridge.createContentBridge() : null;

      if (!bridge) {
        console.error('[PSL] MessageBridge not available in content script context.');
        return;
      }

      // Initialize UI Controller
      if (window.PanelController) {
        new window.PanelController.PanelController(shadow, bridge);
      } else {
        console.error('[PSL] PanelController not available.');
      }
    } catch (err) {
      console.error('[PSL] Error mounting UI:', err);
    }
  }

  // Initialize once DOM is ready
  async function bootstrap() {
    // Inject scripts into MAIN world first
    await injectPageWorldEngine();
    // Mount UI in content world
    await mountUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();