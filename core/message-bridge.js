/**
 * PokéClicker Security Lab - Message Bridge
 * 
 * Provides secure, bidirectional communication between the page context (MAIN world)
 * and the extension content script / UI (ISOLATED world).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MessageBridge = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CHANNEL_PAGE_TO_CONTENT = 'PSL_PAGE_TO_CONTENT';
  const CHANNEL_CONTENT_TO_PAGE = 'PSL_CONTENT_TO_PAGE';

  class BridgeChannel {
    constructor(sourceRole = 'PAGE') {
      this.role = sourceRole; // 'PAGE' or 'CONTENT'
      this.sendChannel = sourceRole === 'PAGE' ? CHANNEL_PAGE_TO_CONTENT : CHANNEL_CONTENT_TO_PAGE;
      this.listenChannel = sourceRole === 'PAGE' ? CHANNEL_CONTENT_TO_PAGE : CHANNEL_PAGE_TO_CONTENT;
      this.handlers = new Map();
      this.pendingRequests = new Map();
      this.reqCounter = 0;
      this.listener = null;

      this.init();
    }

    init() {
      this.listener = (event) => {
        // Ensure message comes from same window
        if (event.source !== window || !event.data || event.data.channel !== this.listenChannel) {
          return;
        }

        const msg = event.data;

        // Handle Response to a previous request
        if (msg.isResponse && msg.requestId && this.pendingRequests.has(msg.requestId)) {
          const { resolve, reject, timeoutId } = this.pendingRequests.get(msg.requestId);
          clearTimeout(timeoutId);
          this.pendingRequests.delete(msg.requestId);

          if (msg.error) {
            reject(new Error(msg.error));
          } else {
            resolve(msg.payload);
          }
          return;
        }

        // Handle incoming Request / Command
        if (msg.action) {
          const handler = this.handlers.get(msg.action);
          if (handler) {
            Promise.resolve()
              .then(() => handler(msg.payload))
              .then((result) => {
                if (msg.requestId) {
                  this.sendResponse(msg.requestId, result, null);
                }
              })
              .catch((err) => {
                if (msg.requestId) {
                  this.sendResponse(msg.requestId, null, err.message || String(err));
                }
              });
          }
        }
      };

      window.addEventListener('message', this.listener);
    }

    registerHandler(action, handler) {
      this.handlers.set(action, handler);
    }

    sendEvent(action, payload) {
      window.postMessage({
        channel: this.sendChannel,
        action,
        payload,
        isResponse: false,
        timestamp: Date.now()
      }, '*');
    }

    sendResponse(requestId, payload, error) {
      window.postMessage({
        channel: this.sendChannel,
        requestId,
        payload,
        error,
        isResponse: true,
        timestamp: Date.now()
      }, '*');
    }

    request(action, payload = {}, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        const requestId = `${this.role}_${Date.now()}_${++this.reqCounter}`;

        const timeoutId = setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error(`Bridge request timed out for action '${action}' (${timeoutMs}ms)`));
          }
        }, timeoutMs);

        this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

        window.postMessage({
          channel: this.sendChannel,
          requestId,
          action,
          payload,
          isResponse: false,
          timestamp: Date.now()
        }, '*');
      });
    }

    destroy() {
      if (this.listener) {
        window.removeEventListener('message', this.listener);
        this.listener = null;
      }
      this.pendingRequests.clear();
      this.handlers.clear();
    }
  }

  return {
    BridgeChannel,
    createPageBridge: () => new BridgeChannel('PAGE'),
    createContentBridge: () => new BridgeChannel('CONTENT')
  };
});
