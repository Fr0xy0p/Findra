const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('findraBrowser', {
  platform: process.platform,

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
  duplicateTab: (id) => ipcRenderer.send('browser:duplicateTab', id),
  closeOtherTabs: (id) => ipcRenderer.send('browser:closeOtherTabs', id),
  showTabContextMenu: (tabId) => ipcRenderer.send('browser:showTabContextMenu', { tabId }),

  // Features
  toggleSidePanel: () => ipcRenderer.send('browser:toggleSidePanel'),
  fetchSuggestions: (query) => ipcRenderer.invoke('browser:fetchSuggestions', query),

  // Findra Shield (Ad & Tracker Blocker)
  getShieldStatus: () => ipcRenderer.invoke('shield:getStatus'),
  toggleShield: (enabled) => ipcRenderer.invoke('shield:toggle', enabled),
  onShieldStats: (callback) => {
    ipcRenderer.on('shield:stats', (_event, data) => callback(data));
  },

  // Cloud URL Configuration (No localhost required!)
  getCloudUrl: () => ipcRenderer.invoke('browser:getCloudUrl'),
  setCloudUrl: (url) => ipcRenderer.invoke('browser:setCloudUrl', url),
  onShowCloudConfig: (callback) => {
    ipcRenderer.on('show:cloudConfig', (_event, url) => callback(url));
  },

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

