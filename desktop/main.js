const { app, BrowserWindow, WebContentsView, Menu, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let sidePanelView = null;
let isSidePanelOpen = false;

let tabs = new Map();
let activeTabId = null;
let nextTabId = 1;

const TOOLBAR_HEIGHT = 86;
const SIDE_PANEL_WIDTH = 440;

const LOCAL_FINDRA_URL = 'http://localhost:8080';
const LIVE_FINDRA_URL = 'https://stock-jewish-paying-drives.trycloudflare.com';
let findraBaseUrl = LOCAL_FINDRA_URL;

// Test whether local Findra server on port 8080 is reachable, else fallback to live URL
function checkFindraEndpoint() {
  const req = http.get(`${LOCAL_FINDRA_URL}/api/stats`, (res) => {
    if (res.statusCode === 200) {
      findraBaseUrl = LOCAL_FINDRA_URL;
    } else {
      findraBaseUrl = LIVE_FINDRA_URL;
    }
  });
  req.on('error', () => {
    findraBaseUrl = LIVE_FINDRA_URL;
    const startScript = '/Users/yuraj/Search-engine/start.sh';
    if (fs.existsSync(startScript)) {
      try {
        const p = spawn('/bin/bash', [startScript], {
          detached: true,
          stdio: 'ignore',
          cwd: '/Users/yuraj/Search-engine'
        });
        p.unref();
      } catch (err) {}
    }
  });
  req.setTimeout(800, () => {
    req.destroy();
    findraBaseUrl = LIVE_FINDRA_URL;
  });
}

function getBoundsForView(isSidePanel = false) {
  if (!mainWindow) return { x: 0, y: 0, width: 0, height: 0 };
  const bounds = mainWindow.getContentBounds();
  const contentHeight = Math.max(bounds.height - TOOLBAR_HEIGHT, 100);

  if (isSidePanel) {
    return {
      x: Math.max(bounds.width - SIDE_PANEL_WIDTH, 0),
      y: TOOLBAR_HEIGHT,
      width: SIDE_PANEL_WIDTH,
      height: contentHeight
    };
  }

  const mainWidth = isSidePanelOpen ? Math.max(bounds.width - SIDE_PANEL_WIDTH, 200) : bounds.width;
  return {
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: mainWidth,
    height: contentHeight
  };
}

function updateLayout() {
  if (!mainWindow) return;

  // Resize side panel if open
  if (sidePanelView) {
    if (isSidePanelOpen) {
      sidePanelView.setBounds(getBoundsForView(true));
      sidePanelView.setVisible(true);
    } else {
      sidePanelView.setVisible(false);
      sidePanelView.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });
    }
  }

  // Resize all tabs
  const mainBounds = getBoundsForView(false);
  for (const [id, tab] of tabs.entries()) {
    if (id === activeTabId) {
      tab.view.setBounds(mainBounds);
      tab.view.setVisible(true);
    } else {
      tab.view.setVisible(false);
      tab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });
    }
  }
}

function broadcastTabState() {
  if (!mainWindow) return;
  const tabList = [];
  for (const [id, tab] of tabs.entries()) {
    tabList.push({
      id,
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon,
      isLoading: tab.isLoading,
      isAudioPlaying: tab.isAudioPlaying,
      isActive: id === activeTabId
    });
  }

  mainWindow.webContents.send('tabs:updated', {
    tabs: tabList,
    activeTabId,
    isSidePanelOpen
  });

  const activeTab = tabs.get(activeTabId);
  if (activeTab) {
    const wc = activeTab.view.webContents;
    const canBack = wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack();
    const canFwd = wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward();
    mainWindow.webContents.send('navigation:state', {
      url: activeTab.url,
      title: activeTab.title,
      canGoBack: canBack,
      canGoForward: canFwd,
      isLoading: activeTab.isLoading
    });
  }
}

function createTab(initialUrl = findraBaseUrl) {
  const id = `tab-${nextTabId++}`;

  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:findra-main',
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true,
      webSecurity: true,
      scrollBounce: true
    }
  });

  mainWindow.contentView.addChildView(view);

  const tab = {
    id,
    view,
    title: 'Findra Search',
    url: initialUrl,
    favicon: null,
    isLoading: true,
    isAudioPlaying: false
  };

  tabs.set(id, tab);

  // Hook tab webContents events
  view.webContents.on('did-start-loading', () => {
    tab.isLoading = true;
    broadcastTabState();
  });

  view.webContents.on('did-stop-loading', () => {
    tab.isLoading = false;
    tab.url = view.webContents.getURL();
    tab.title = view.webContents.getTitle() || 'Untitled';
    broadcastTabState();
  });

  view.webContents.on('page-title-updated', (_e, title) => {
    tab.title = title || 'Untitled';
    broadcastTabState();
  });

  view.webContents.on('page-favicon-updated', (_e, favicons) => {
    if (favicons && favicons.length > 0) {
      tab.favicon = favicons[0];
      broadcastTabState();
    }
  });

  view.webContents.on('media-started-playing', () => {
    tab.isAudioPlaying = true;
    broadcastTabState();
  });

  view.webContents.on('media-paused', () => {
    tab.isAudioPlaying = false;
    broadcastTabState();
  });

  // Handle window.open (target="_blank") by creating a new in-app tab!
  view.webContents.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: 'deny' };
  });

  // Load URL
  view.webContents.loadURL(initialUrl);

  // Switch to this new tab
  switchTab(id);
  return id;
}

function switchTab(id) {
  if (!tabs.has(id)) return;
  activeTabId = id;
  const activeTab = tabs.get(id);

  // Ensure active tab view is on top
  mainWindow.contentView.addChildView(activeTab.view);

  // Bring side panel to front if open
  if (isSidePanelOpen && sidePanelView) {
    mainWindow.contentView.addChildView(sidePanelView);
  }

  updateLayout();
  broadcastTabState();
}

function closeTab(id) {
  if (!tabs.has(id)) return;
  const tab = tabs.get(id);

  mainWindow.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  tabs.delete(id);

  if (activeTabId === id) {
    const remainingIds = Array.from(tabs.keys());
    if (remainingIds.length > 0) {
      switchTab(remainingIds[remainingIds.length - 1]);
    } else {
      createTab(findraBaseUrl);
    }
  } else {
    broadcastTabState();
  }
}

function navigateActiveTab(input) {
  const activeTab = tabs.get(activeTabId);
  if (!activeTab) return;

  let target = input.trim();
  if (!target) return;

  if (target.startsWith('http://') || target.startsWith('https://')) {
    // Valid absolute URL
  } else if (target.includes('.') && !target.includes(' ')) {
    target = 'https://' + target;
  } else {
    // Execute query in Findra
    target = `${findraBaseUrl}/search?q=${encodeURIComponent(target)}`;
  }

  activeTab.url = target;
  activeTab.view.webContents.loadURL(target);
}

function toggleSidePanel() {
  isSidePanelOpen = !isSidePanelOpen;

  if (isSidePanelOpen) {
    if (!sidePanelView) {
      sidePanelView = new WebContentsView({
        webPreferences: {
          partition: 'persist:findra-sidepanel',
          contextIsolation: true
        }
      });
      mainWindow.contentView.addChildView(sidePanelView);
      sidePanelView.webContents.loadURL(findraBaseUrl);
    } else {
      mainWindow.contentView.addChildView(sidePanelView);
    }
  }

  updateLayout();
  broadcastTabState();
}

function setupApplicationMenu() {
  const template = [
    {
      label: 'Findra Browser',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => createTab(findraBaseUrl)
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (activeTabId) closeTab(activeTabId);
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Focus Address Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('shortcut:focusOmnibox');
          }
        },
        {
          label: 'Toggle Findra AI Panel',
          accelerator: 'CmdOrCtrl+B',
          click: toggleSidePanel
        },
        {
          label: 'Reload Page',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const tab = tabs.get(activeTabId);
            if (tab) tab.view.webContents.reload();
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: () => {
            const tab = tabs.get(activeTabId);
            if (!tab) return;
            const wc = tab.view.webContents;
            if (wc.navigationHistory && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
            else if (wc.canGoBack()) wc.goBack();
          }
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => {
            const tab = tabs.get(activeTabId);
            if (!tab) return;
            const wc = tab.view.webContents;
            if (wc.navigationHistory && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
            else if (wc.canGoForward()) wc.goForward();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  checkFindraEndpoint();

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#121216',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('resize', updateLayout);

  // Setup IPC Handlers
  ipcMain.on('browser:newTab', (_e, url) => createTab(url || findraBaseUrl));
  ipcMain.on('browser:switchTab', (_e, id) => switchTab(id));
  ipcMain.on('browser:closeTab', (_e, id) => closeTab(id));
  ipcMain.on('browser:navigate', (_e, url) => navigateActiveTab(url));
  ipcMain.on('browser:goBack', () => {
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const wc = tab.view.webContents;
    if (wc.navigationHistory && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (wc.canGoBack()) wc.goBack();
  });
  ipcMain.on('browser:goForward', () => {
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const wc = tab.view.webContents;
    if (wc.navigationHistory && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (wc.canGoForward()) wc.goForward();
  });
  ipcMain.on('browser:reload', () => {
    const tab = tabs.get(activeTabId);
    if (tab) tab.view.webContents.reload();
  });
  ipcMain.on('browser:goHome', () => navigateActiveTab(findraBaseUrl));
  ipcMain.on('browser:toggleSidePanel', toggleSidePanel);

  // Real-time suggestions from Findra API
  ipcMain.handle('browser:fetchSuggestions', async (_e, query) => {
    if (!query || query.length < 2) return [];
    try {
      const res = await fetch(`${findraBaseUrl}/api/suggest?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        return data.suggestions || [];
      }
    } catch (e) {
      // fallback
    }
    return [];
  });

  // Create initial tab once UI finishes loading
  mainWindow.webContents.once('did-finish-load', () => {
    createTab(findraBaseUrl);
  });

  setupApplicationMenu();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
