/**
 * Preload script for the <webview> inside Electron shell.
 * Uses contextBridge to safely expose electronAPI.localProxy to the React app.
 * Communication: React → contextBridge → ipcRenderer.sendToHost → shell.js → main process
 */
const { contextBridge, ipcRenderer } = require('electron');

const pendingRequests = new Map();

// Receive responses from shell page
ipcRenderer.on('local-proxy-response', (_event, data) => {
  const pending = pendingRequests.get(data.requestId);
  if (!pending) return;
  pendingRequests.delete(data.requestId);

  if (data.error) {
    pending.reject(new Error(data.error));
  } else {
    pending.resolve(data.response);
  }
});

// Expose to the React app's window via contextBridge (bypasses contextIsolation)
contextBridge.exposeInMainWorld('electronAPI', {
  localProxy: (request) => {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      pendingRequests.set(requestId, { resolve, reject });

      ipcRenderer.sendToHost('local-proxy-request', { requestId, request });

      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('Local proxy request timed out (120s)'));
        }
      }, 120000);
    });
  },
});

// Notify React app that desktop local proxy is available
window.addEventListener('DOMContentLoaded', () => {
  window.dispatchEvent(new Event('openreq-desktop-ready'));
});
