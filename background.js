/**
 * PokéClicker Security Lab - Background Service Worker
 * 
 * Minimal lifecycle manager for Manifest V3.
 * No external telemetry, remote storage, or data exfiltration.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[PSL] PokéClicker Security Lab extension installed.');
});

// Ephemeral message handler for Service Worker wake-up and status verification
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'PING_WORKER') {
    sendResponse({
      status: 'ACTIVE',
      timestamp: Date.now()
    });
    return true;
  }
});