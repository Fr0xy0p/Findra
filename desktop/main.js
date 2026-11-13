const { app, BrowserWindow, WebContentsView, Menu, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const { FilterSet, Engine } = require('adblock-rs');

// ---------------- GLOBAL ERROR SHIELD ----------------
// Prevent uncaught exceptions (such as "Object has been destroyed" during window/tab close or async teardown)
// from ever popping fatal native error dialogs in Findra
process.on('uncaughtException', (err) => {
  const msg = err && err.message ? err.message : String(err);
  if (msg.includes('Object has been destroyed') || msg.includes('destroyed') || msg.includes('WebContents')) {
    // Teardown race condition safely swallowed
    return;
  }
  console.warn('[Findra Main Process] Safely handled uncaught exception:', msg);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[Findra Main Process] Safely handled unhandled rejection:', reason);
});

// Enable native trackpad swipe history navigation gestures (macOS two-finger swipe)
app.commandLine.appendSwitch('enable-features', 'TouchpadOverscrollHistoryNavigation');
app.commandLine.appendSwitch('overscroll-history-navigation', '1');

// Enable modern web authentication, credentials and cross-site cookie persistence (for Google Sign-In)
app.commandLine.appendSwitch('disable-features', 'SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure');

// Findra Shield Native Brave adblock-rust Engine State
let adblockEngine = null;
let isShieldEnabled = true;
let totalBlockedAds = 0;

// Standard Chrome User Agent Generation (Matches Chrome/Brave exactly to prevent Google blocking sign-in)
const CHROME_VERSION = '133.0.0.0';

function getCleanChromeUA() {
  if (process.platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
  } else if (process.platform === 'win32') {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
  }
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
}

function getMainSession() {
  return session.fromPartition('persist:findra-main');
}

let cookieFlushDebounce = null;

function setupSessionPersistenceAndAuth() {
  const mainSes = getMainSession();
  const cleanUA = getCleanChromeUA();

  // Set the standard Chrome User Agent globally on the session
  mainSes.setUserAgent(cleanUA);

  // Set pristine Chrome Client Hints and Headers for Google Accounts
  mainSes.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url || '';
    const headers = { ...details.requestHeaders };

    // Standard Chrome UA
    headers['User-Agent'] = cleanUA;

    // For Google authentication and OAuth domains
    if (url.includes('google.com') || url.includes('googleapis.com') || url.includes('gstatic.com') || url.includes('youtube.com')) {
      headers['Sec-CH-UA'] = '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"';
      headers['Sec-CH-UA-Mobile'] = '?0';
      headers['Sec-CH-UA-Platform'] = process.platform === 'darwin' ? '"macOS"' : (process.platform === 'win32' ? '"Windows"' : '"Linux"');
    }

    callback({ requestHeaders: headers });
  });

  // Automatically flush cookies to SQLite disk storage when changed so logins are permanently remembered
  mainSes.cookies.on('changed', () => {
    clearTimeout(cookieFlushDebounce);
    cookieFlushDebounce = setTimeout(() => {
      mainSes.cookies.flushStore().catch(() => {});
    }, 1000);
  });
}

let mainWindow = null;
let sidePanelView = null;
let isSidePanelOpen = false;

let tabs = new Map();
let activeTabId = null;
let nextTabId = 1;

const TOOLBAR_HEIGHT = 86;
const SIDE_PANEL_WIDTH = 440;

const DEFAULT_CLOUD_URL = 'https://findra-q4pt.onrender.com';
let configPath = '';

// Safe liveness check helpers
function isWindowAlive(win) {
  try {
    return Boolean(win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed());
  } catch (e) {
    return false;
  }
}

function isTabAlive(tab) {
  try {
    return Boolean(
      tab &&
      tab.view &&
      (typeof tab.view.isDestroyed === 'function' ? !tab.view.isDestroyed() : true) &&
      tab.view.webContents &&
      !tab.view.webContents.isDestroyed()
    );
  } catch (e) {
    return false;
  }
}

function getConfigPath() {
  if (!configPath) {
    try {
      configPath = path.join(app.getPath('userData'), 'findra-config.json');
    } catch (e) {
      configPath = path.join(__dirname, 'findra-config.json');
    }
  }
  return configPath;
}

function loadConfig() {
  try {
    const cp = getConfigPath();
    if (fs.existsSync(cp)) {
      return JSON.parse(fs.readFileSync(cp, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveConfig(cfg) {
  try {
    const cp = getConfigPath();
    fs.writeFileSync(cp, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {}
}

let userConfig = {};
let findraBaseUrl = DEFAULT_CLOUD_URL;

// Initialize Findra endpoint directly from Cloud URL (no localhost required!)
function initFindraEndpoint() {
  userConfig = loadConfig();
  if (userConfig.cloudUrl && typeof userConfig.cloudUrl === 'string' && userConfig.cloudUrl.trim()) {
    findraBaseUrl = userConfig.cloudUrl.trim();
  } else {
    findraBaseUrl = DEFAULT_CLOUD_URL;
  }
}

function getBoundsForView(isSidePanel = false) {
  if (!isWindowAlive(mainWindow)) return { x: 0, y: 0, width: 0, height: 0 };
  let bounds;
  try {
    bounds = mainWindow.getContentBounds();
  } catch (e) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
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
  if (!isWindowAlive(mainWindow)) return;

  // Resize side panel if open
  if (sidePanelView && !sidePanelView.isDestroyed?.() && sidePanelView.webContents && !sidePanelView.webContents.isDestroyed()) {
    try {
      if (isSidePanelOpen) {
        sidePanelView.setBounds(getBoundsForView(true));
        sidePanelView.setVisible(true);
      } else {
        sidePanelView.setVisible(false);
        sidePanelView.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });
      }
    } catch (e) {}
  }

  // Resize all tabs
  const mainBounds = getBoundsForView(false);
  for (const [id, tab] of tabs.entries()) {
    if (!isTabAlive(tab)) continue;
    try {
      if (id === activeTabId) {
        tab.view.setBounds(mainBounds);
        tab.view.setVisible(true);
      } else {
        tab.view.setVisible(false);
        tab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });
      }
    } catch (e) {}
  }
}

function broadcastTabState() {
  if (!isWindowAlive(mainWindow)) return;

  const tabList = [];
  for (const [id, tab] of tabs.entries()) {
    if (!isTabAlive(tab)) continue;
    tabList.push({
      id,
      title: tab.title || 'Untitled',
      url: tab.url || '',
      favicon: tab.favicon,
      isLoading: Boolean(tab.isLoading),
      isAudioPlaying: Boolean(tab.isAudioPlaying),
      isActive: id === activeTabId
    });
  }

  try {
    if (isWindowAlive(mainWindow)) {
      mainWindow.webContents.send('tabs:updated', {
        tabs: tabList,
        activeTabId,
        isSidePanelOpen
      });
    }
  } catch (e) {
    return;
  }

  const activeTab = tabs.get(activeTabId);
  if (isTabAlive(activeTab)) {
    const wc = activeTab.view.webContents;
    let canBack = false;
    let canFwd = false;
    try {
      canBack = wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack();
      canFwd = wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward();
    } catch (e) {}

    try {
      if (isWindowAlive(mainWindow)) {
        mainWindow.webContents.send('navigation:state', {
          url: activeTab.url || '',
          title: activeTab.title || 'Untitled',
          canGoBack: canBack,
          canGoForward: canFwd,
          isLoading: Boolean(activeTab.isLoading)
        });
      }
    } catch (e) {}
  }
}

function createTab(initialUrl = findraBaseUrl) {
  if (!isWindowAlive(mainWindow)) return null;

  const id = `tab-${nextTabId++}`;

  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:findra-main',
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true,
      webSecurity: true,
      scrollBounce: true,
      preload: path.join(__dirname, 'tab-preload.js')
    }
  });

  // Use clean standard Google Chrome User-Agent to ensure seamless Google Account login
  view.webContents.setUserAgent(getCleanChromeUA());

  try {
    mainWindow.contentView.addChildView(view);
  } catch (e) {}

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

  const wc = view.webContents;

  // Hook tab webContents events safely
  wc.on('did-start-loading', () => {
    if (!isTabAlive(tab) || !isWindowAlive(mainWindow)) return;
    tab.isLoading = true;
    broadcastTabState();
  });

  wc.on('did-stop-loading', () => {
    if (!isTabAlive(tab) || !isWindowAlive(mainWindow)) return;
    tab.isLoading = false;
    try {
      tab.url = wc.getURL();
      tab.title = wc.getTitle() || 'Untitled';
    } catch (e) {}
    broadcastTabState();
  });

  wc.on('did-navigate', (_e, navUrl) => {
    if (!isTabAlive(tab) || !isWindowAlive(mainWindow)) return;
    tab.url = navUrl;
    broadcastTabState();
  });

  wc.on('did-navigate-in-page', (_e, navUrl) => {
    if (!isTabAlive(tab) || !isWindowAlive(mainWindow)) return;
    tab.url = navUrl;
    broadcastTabState();
  });

  wc.on('page-title-updated', (_e, title) => {
    if (!isTabAlive(tab) || !isWindowAlive(mainWindow)) return;
    tab.title = title || 'Untitled';
    broadcastTabState();
  });

  wc.on('page-favicon-updated', (_e, favicons) => {
    if (!isTabAlive(tab) || !isWindowAlive(mainWindow)) return;
    if (favicons && favicons.length > 0) {
      tab.favicon = favicons[0];
      broadcastTabState();
    }
  });

  wc.on('media-started-playing', () => {
    if (!isTabAlive(tab) || !isWindowAlive(mainWindow)) return;
    tab.isAudioPlaying = true;
    broadcastTabState();
  });

  wc.on('media-paused', () => {
    if (!isTabAlive(tab) || !isWindowAlive(mainWindow)) return;
    tab.isAudioPlaying = false;
    broadcastTabState();
  });

  // Handle popup windows and OAuth sign-in flows (Google, Apple, Microsoft, GitHub, etc.)
  wc.setWindowOpenHandler(({ url, disposition, features }) => {
    const isAuth = url.includes('accounts.google.com') ||
                   url.includes('/oauth') ||
                   url.includes('/auth') ||
                   url.includes('login.live.com') ||
                   url.includes('appleid.apple.com') ||
                   url.includes('github.com/login') ||
                   url.includes('facebook.com/v') ||
                   url.includes('signin') ||
                   (features && (features.includes('width=') || features.includes('height=')));

    // Allow dedicated popup window for OAuth authentication so window.opener and tokens work!
    if (isAuth || disposition === 'new-window') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          center: true,
          title: 'Sign In',
          autoHideMenuBar: true,
          webPreferences: {
            partition: 'persist:findra-main',
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            preload: path.join(__dirname, 'tab-preload.js'),
            userAgent: getCleanChromeUA()
          }
        }
      };
    }

    // Normal link target="_blank" navigates in the current tab
    try {
      if (!wc.isDestroyed()) {
        wc.loadURL(url);
      }
    } catch (e) {}
    return { action: 'deny' };
  });

  // Load URL
  try {
    wc.loadURL(initialUrl);
  } catch (e) {}

  // Switch to this new tab
  switchTab(id);
  return id;
}

function switchTab(id) {
  if (!tabs.has(id)) return;
  if (!isWindowAlive(mainWindow)) return;
  activeTabId = id;
  const activeTab = tabs.get(id);
  if (!isTabAlive(activeTab)) return;

  try {
    mainWindow.contentView.addChildView(activeTab.view);
  } catch (e) {}

  // Bring side panel to front if open
  if (isSidePanelOpen && sidePanelView && !sidePanelView.isDestroyed?.()) {
    try {
      mainWindow.contentView.addChildView(sidePanelView);
    } catch (e) {}
  }

  updateLayout();
  broadcastTabState();
}

function closeTab(id) {
  if (!tabs.has(id)) return;
  const tab = tabs.get(id);
  tabs.delete(id);

  if (tab && tab.view) {
    try {
      if (isWindowAlive(mainWindow) && mainWindow.contentView) {
        mainWindow.contentView.removeChildView(tab.view);
      }
    } catch (e) {}

    try {
      if (tab.view.webContents && !tab.view.webContents.isDestroyed()) {
        tab.view.webContents.removeAllListeners();
        tab.view.webContents.close();
      }
    } catch (e) {}
  }

  if (activeTabId === id) {
    const remainingIds = Array.from(tabs.keys());
    if (remainingIds.length > 0) {
      switchTab(remainingIds[remainingIds.length - 1]);
    } else {
      if (isWindowAlive(mainWindow)) {
        createTab(findraBaseUrl);
      }
    }
  } else {
    broadcastTabState();
  }
}

function navigateActiveTab(input) {
  const activeTab = tabs.get(activeTabId);
  if (!isTabAlive(activeTab)) return;

  let target = (input || '').trim();
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
  try {
    activeTab.view.webContents.loadURL(target);
  } catch (e) {}
}

function toggleSidePanel() {
  if (!isWindowAlive(mainWindow)) return;
  isSidePanelOpen = !isSidePanelOpen;

  try {
    if (isSidePanelOpen) {
      if (!sidePanelView || sidePanelView.isDestroyed?.() || !sidePanelView.webContents || sidePanelView.webContents.isDestroyed()) {
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
  } catch (e) {}

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
        {
          label: 'Findra Cloud Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (isWindowAlive(mainWindow)) {
              mainWindow.webContents.send('show:cloudConfig', findraBaseUrl);
            }
          }
        },
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
            if (isWindowAlive(mainWindow)) {
              mainWindow.webContents.send('shortcut:focusOmnibox');
            }
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
            if (isTabAlive(tab)) {
              try { tab.view.webContents.reload(); } catch (e) {}
            }
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
            if (!isTabAlive(tab)) return;
            const wc = tab.view.webContents;
            try {
              if (wc.navigationHistory && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
              else if (wc.canGoBack()) wc.goBack();
            } catch (e) {}
          }
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => {
            const tab = tabs.get(activeTabId);
            if (!isTabAlive(tab)) return;
            const wc = tab.view.webContents;
            try {
              if (wc.navigationHistory && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
              else if (wc.canGoForward()) wc.goForward();
            } catch (e) {}
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

let ipcHandlersInitialized = false;

function setupIpcHandlers() {
  if (ipcHandlersInitialized) return;
  ipcHandlersInitialized = true;

  // Trackpad two-finger horizontal swipe from tab content
  ipcMain.on('tab:gesture-back', (event) => {
    for (const [, tab] of tabs.entries()) {
      if (isTabAlive(tab) && tab.view.webContents === event.sender) {
        try {
          const history = tab.view.webContents.navigationHistory;
          if (history && history.canGoBack()) history.goBack();
          else if (tab.view.webContents.canGoBack()) tab.view.webContents.goBack();
        } catch (e) {}
        return;
      }
    }
  });

  ipcMain.on('tab:gesture-forward', (event) => {
    for (const [, tab] of tabs.entries()) {
      if (isTabAlive(tab) && tab.view.webContents === event.sender) {
        try {
          const history = tab.view.webContents.navigationHistory;
          if (history && history.canGoForward()) history.goForward();
          else if (tab.view.webContents.canGoForward()) tab.view.webContents.goForward();
        } catch (e) {}
        return;
      }
    }
  });

  // Setup IPC Handlers
  ipcMain.on('browser:newTab', (_e, url) => createTab(url || findraBaseUrl));
  ipcMain.on('browser:switchTab', (_e, id) => switchTab(id));
  ipcMain.on('browser:closeTab', (_e, id) => closeTab(id));
  ipcMain.on('browser:duplicateTab', (_e, id) => {
    const tab = tabs.get(id);
    if (tab) createTab(tab.url);
  });
  ipcMain.on('browser:closeOtherTabs', (_e, id) => {
    for (const [tabId] of tabs.entries()) {
      if (tabId !== id) closeTab(tabId);
    }
  });
  ipcMain.on('browser:showTabContextMenu', (_e, { tabId }) => {
    if (!isWindowAlive(mainWindow)) return;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'New Tab',
        accelerator: 'CmdOrCtrl+T',
        click: () => createTab(findraBaseUrl)
      },
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => {
          const tab = tabs.get(tabId);
          if (isTabAlive(tab)) {
            try { tab.view.webContents.reload(); } catch (e) {}
          }
        }
      },
      {
        label: 'Duplicate Tab',
        click: () => {
          const tab = tabs.get(tabId);
          if (tab) createTab(tab.url);
        }
      },
      { type: 'separator' },
      {
        label: 'Close Tab',
        accelerator: 'CmdOrCtrl+W',
        click: () => closeTab(tabId)
      },
      {
        label: 'Close Other Tabs',
        click: () => {
          for (const [id] of tabs.entries()) {
            if (id !== tabId) closeTab(id);
          }
        }
      }
    ]);
    try {
      contextMenu.popup({ window: mainWindow });
    } catch (e) {}
  });
  ipcMain.on('browser:navigate', (_e, url) => navigateActiveTab(url));
  ipcMain.on('browser:goBack', () => {
    const tab = tabs.get(activeTabId);
    if (!isTabAlive(tab)) return;
    const wc = tab.view.webContents;
    try {
      if (wc.navigationHistory && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
      else if (wc.canGoBack()) wc.goBack();
    } catch (e) {}
  });
  ipcMain.on('browser:goForward', () => {
    const tab = tabs.get(activeTabId);
    if (!isTabAlive(tab)) return;
    const wc = tab.view.webContents;
    try {
      if (wc.navigationHistory && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
      else if (wc.canGoForward()) wc.goForward();
    } catch (e) {}
  });
  ipcMain.on('browser:reload', () => {
    const tab = tabs.get(activeTabId);
    if (isTabAlive(tab)) {
      try { tab.view.webContents.reload(); } catch (e) {}
    }
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
    } catch (e) {}
    return [];
  });

  // Cloud URL configuration
  ipcMain.handle('browser:getCloudUrl', () => {
    return findraBaseUrl;
  });

  ipcMain.handle('browser:setCloudUrl', (_e, newUrl) => {
    let clean = (newUrl || '').trim();
    if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    if (!clean) clean = DEFAULT_CLOUD_URL;
    findraBaseUrl = clean;
    userConfig.cloudUrl = clean;
    saveConfig(userConfig);

    // Update active tab or navigate home
    const activeTab = tabs.get(activeTabId);
    if (activeTab) {
      navigateActiveTab(findraBaseUrl);
    }
    return findraBaseUrl;
  });

  // Shield (AdBlock) IPC handlers
  ipcMain.handle('shield:getStatus', () => {
    return {
      enabled: isShieldEnabled,
      blockedCount: totalBlockedAds,
    };
  });

  // Native Brave adblock-rust cosmetic filter retrieval (Solution 3)
  ipcMain.handle('shield:getCosmeticResources', (_e, url) => {
    if (!isShieldEnabled || !adblockEngine || !url) return null;
    try {
      return adblockEngine.urlCosmeticResources(url);
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('shield:toggle', (_e, enabled) => {
    isShieldEnabled = !!enabled;
    userConfig.shieldEnabled = isShieldEnabled;
    saveConfig(userConfig);

    console.log(`🛡️ [Findra Shield] Native adblock-rust filtering: ${isShieldEnabled ? 'ON' : 'OFF'}`);

    if (isWindowAlive(mainWindow)) {
      try {
        mainWindow.webContents.send('shield:stats', {
          totalBlocked: totalBlockedAds,
          enabled: isShieldEnabled,
        });
      } catch (e) {}
    }

    return {
      enabled: isShieldEnabled,
      blockedCount: totalBlockedAds,
    };
  });
}

function createWindow() {
  initFindraEndpoint();

  const isMac = process.platform === 'darwin';

  const windowOptions = {
    width: 1360,
    height: 880,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#121216',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 14, y: 14 };
  } else {
    // Windows & Linux: native titleBarOverlay with dark controls matching tab row
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#111116',
      symbolColor: '#cbd5e1',
      height: 42
    };
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('resize', updateLayout);

  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const [, tab] of tabs.entries()) {
      try {
        if (tab && tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
          tab.view.webContents.removeAllListeners();
          tab.view.webContents.close();
        }
      } catch (e) {}
    }
    tabs.clear();
    activeTabId = null;
    sidePanelView = null;
  });

  // Handle macOS native 3-finger swipe gesture
  mainWindow.on('swipe', (_event, direction) => {
    const tab = tabs.get(activeTabId);
    if (!isTabAlive(tab)) return;
    const wc = tab.view.webContents;
    try {
      const history = wc.navigationHistory;
      if (direction === 'right') { // Swipe right -> Back
        if (history && history.canGoBack()) history.goBack();
        else if (wc.canGoBack()) wc.goBack();
      } else if (direction === 'left') { // Swipe left -> Forward
        if (history && history.canGoForward()) history.goForward();
        else if (wc.canGoForward()) wc.goForward();
      }
    } catch (e) {}
  });

  // Handle hardware mouse/trackpad back & forward commands
  mainWindow.on('app-command', (_event, cmd) => {
    const tab = tabs.get(activeTabId);
    if (!isTabAlive(tab)) return;
    const wc = tab.view.webContents;
    try {
      const history = wc.navigationHistory;
      if (cmd === 'browser-backward') {
        if (history && history.canGoBack()) history.goBack();
        else if (wc.canGoBack()) wc.goBack();
      } else if (cmd === 'browser-forward') {
        if (history && history.canGoForward()) history.goForward();
        else if (wc.canGoForward()) wc.goForward();
      }
    } catch (e) {}
  });

  // Create initial tab once UI finishes loading
  mainWindow.webContents.once('did-finish-load', () => {
    createTab(findraBaseUrl);
  });

  setupApplicationMenu();
}

function setupAdblockInSession(ses) {
  if (!ses || !ses.webRequest) return;

  const filter = { urls: ['*://*/*'] };

  ses.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (!isShieldEnabled || !adblockEngine) {
      return callback({});
    }

    const url = details.url || '';

    // Never block internal app, file, devtools or blob schemes
    if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('devtools:') || url.startsWith('chrome-extension:') || url.startsWith('blob:')) {
      return callback({});
    }

    // Never block Google / YouTube account login or authentication endpoints
    if (url.includes('accounts.google.com') || url.includes('accounts.youtube.com') || url.includes('gstatic.com/recaptcha')) {
      return callback({});
    }

    // Map resource type to adblock-rs format
    let resType = 'other';
    switch (details.resourceType) {
      case 'mainFrame': resType = 'main_frame'; break;
      case 'subFrame': resType = 'sub_frame'; break;
      case 'stylesheet': resType = 'stylesheet'; break;
      case 'script': resType = 'script'; break;
      case 'image': resType = 'image'; break;
      case 'font': resType = 'font'; break;
      case 'object': resType = 'object'; break;
      case 'xmlhttprequest': resType = 'xmlhttprequest'; break;
      case 'ping': resType = 'ping'; break;
      case 'cspReport': resType = 'csp_report'; break;
      case 'media': resType = 'media'; break;
      case 'websocket': resType = 'websocket'; break;
      default: resType = 'other'; break;
    }

    const sourceUrl = details.referrer || url;
    const method = details.method ? details.method.toLowerCase() : 'get';

    try {
      const match = adblockEngine.check(url, sourceUrl, resType, method, true);
      if (match && match.should_block) {
        totalBlockedAds++;
        if (isWindowAlive(mainWindow)) {
          try {
            mainWindow.webContents.send('shield:stats', {
              totalBlocked: totalBlockedAds,
              enabled: isShieldEnabled,
              url: url,
            });
          } catch (e) {}
        }

        if (match.redirect) {
          return callback({ redirectURL: match.redirect });
        }
        return callback({ cancel: true });
      }
    } catch (e) {}

    return callback({});
  });
}

async function setupAdBlocker() {
  try {
    userConfig = loadConfig();
    if (typeof userConfig.shieldEnabled === 'boolean') {
      isShieldEnabled = userConfig.shieldEnabled;
    }

    console.log('🛡️ [Findra Shield] Initializing native Brave adblock-rust engine...');

    let cachePath = path.join(__dirname, 'findra-adblock-rust-cache.bin');
    if (!fs.existsSync(cachePath)) {
      try {
        const userCache = path.join(app.getPath('userData'), 'findra-adblock-rust-cache.bin');
        if (fs.existsSync(userCache)) cachePath = userCache;
      } catch (e) {}
    }

    if (fs.existsSync(cachePath)) {
      const t0 = Date.now();
      const buf = fs.readFileSync(cachePath);
      const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      adblockEngine = new Engine(new FilterSet());
      adblockEngine.deserialize(arrayBuf);
      console.log(`🛡️ [Findra Shield] Native adblock-rust engine loaded in ${Date.now() - t0}ms!`);
    } else {
      console.log('🛡️ [Findra Shield] Compiling native adblock-rust filter set...');
      const filterSet = new FilterSet(true);
      filterSet.addFilters([
        '||doubleclick.net^',
        '||googleads.g.doubleclick.net^',
        '||adservice.google.com^',
        '||pagead2.googlesyndication.com^',
        '||static.doubleclick.net^',
        '||taboola.com^',
        '||outbrain.com^',
        '||criteo.com^',
        '||adnxs.com^',
        '@@||youtube.com/api/stats/',
        '@@||youtube.com/pagead/',
        '@@||youtube.com/ptracking',
        '@@||youtube.com/youtubei/v1/player/ad_break',
        '@@||googlevideo.com/videoplayback'
      ].join('\n'));
      adblockEngine = new Engine(filterSet);
    }

    setupAdblockInSession(getMainSession());
    setupAdblockInSession(session.defaultSession);
    console.log('🛡️ [Findra Shield] Native adblock-rust filtering active on all browser sessions!');
  } catch (err) {
    console.error('[-] Error setting up Findra Shield (adblock-rust):', err);
  }
}

app.whenReady().then(() => {
  setupSessionPersistenceAndAuth();
  setupAdBlocker();
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async () => {
  try {
    await getMainSession().cookies.flushStore();
    console.log('🔒 [Findra Session] Cookies successfully flushed to disk.');
  } catch (e) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
