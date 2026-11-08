const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('findraBrowser', {
  // Navigation actions
  navigate: (url) => ipcRenderer.send('browser:navigate', url),
  goBack: () => ipcRenderer.send('browser:goBack'),
  goForward: () => ipcRenderer.send('browser:goForward'),
  reload: () => ipcRenderer.send('browser:reload'),
  goHome: () => ipcRenderer.send('browser:goHome'),

  // Tab management
  newTab: (url) => ipcRenderer.send('browser:newTab', url),
  switchTab: (id) => ipcRenderer.send('browser:switchTab', id),
  closeTab: (id) => ipcRenderer.send('browser:closeTab', id),

  // Features
  toggleSidePanel: () => ipcRenderer.send('browser:toggleSidePanel'),
  fetchSuggestions: (query) => ipcRenderer.invoke('browser:fetchSuggestions', query),

  // Event listeners from Main process
  onTabsUpdated: (callback) => {
    ipcRenderer.on('tabs:updated', (_event, data) => callback(data));
  },
  onNavigationState: (callback) => {
    ipcRenderer.on('navigation:state', (_event, data) => callback(data));
  },
  onFocusOmnibox: (callback) => {
    ipcRenderer.on('shortcut:focusOmnibox', () => callback());
  }
});
