const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  testConnection: (ip, port) => ipcRenderer.invoke('test-connection', ip, port),
  saveConfig: (ip, port) => ipcRenderer.invoke('save-config', ip, port),
  getConfig: () => ipcRenderer.invoke('get-config'),
  resetConfig: () => ipcRenderer.invoke('reset-config'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  // Local proxy: execute HTTP requests directly from the desktop app
  localProxy: (request) => ipcRenderer.invoke('local-proxy-request', request),
});
