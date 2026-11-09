const { app, BrowserWindow, WebContentsView, Menu, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const { ElectronBlocker, fullLists } = require('@ghostery/adblocker-electron');

// Enable native trackpad swipe history navigation gestures (macOS two-finger swipe)
app.commandLine.appendSwitch('enable-features', 'TouchpadOverscrollHistoryNavigation');
app.commandLine.appendSwitch('overscroll-history-navigation', '1');

// Enable modern web authentication, credentials and cross-site cookie persistence (for Google Sign-In)
app.commandLine.appendSwitch('disable-features', 'SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure');

// Findra Shield Ad & Tracker Blocker Engine State
let adBlocker = null;
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
      scrollBounce: true,
      preload: path.join(__dirname, 'tab-preload.js')
    }
  });

  // Use clean standard Google Chrome User-Agent to ensure seamless Google Account login
  view.webContents.setUserAgent(getCleanChromeUA());

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

  // Handle popup windows and OAuth sign-in flows (Google, Apple, Microsoft, GitHub, etc.)
  view.webContents.setWindowOpenHandler(({ url, disposition, features }) => {
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
    view.webContents.loadURL(url);
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
        {
          label: 'Findra Cloud Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
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

  // Handle macOS native 3-finger swipe gesture
  mainWindow.on('swipe', (_event, direction) => {
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const wc = tab.view.webContents;
    const history = wc.navigationHistory;
    if (direction === 'right') { // Swipe right -> Back
      if (history && history.canGoBack()) history.goBack();
      else if (wc.canGoBack()) wc.goBack();
    } else if (direction === 'left') { // Swipe left -> Forward
      if (history && history.canGoForward()) history.goForward();
      else if (wc.canGoForward()) wc.goForward();
    }
  });

  // Handle hardware mouse/trackpad back & forward commands
  mainWindow.on('app-command', (_event, cmd) => {
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const wc = tab.view.webContents;
    const history = wc.navigationHistory;
    if (cmd === 'browser-backward') {
      if (history && history.canGoBack()) history.goBack();
      else if (wc.canGoBack()) wc.goBack();
    } else if (cmd === 'browser-forward') {
      if (history && history.canGoForward()) history.goForward();
      else if (wc.canGoForward()) wc.goForward();
    }
  });

  // Handle trackpad two-finger horizontal swipe from tab content
  ipcMain.on('tab:gesture-back', (event) => {
    for (const [, tab] of tabs.entries()) {
      if (tab.view.webContents === event.sender) {
        const history = tab.view.webContents.navigationHistory;
        if (history && history.canGoBack()) history.goBack();
        else if (tab.view.webContents.canGoBack()) tab.view.webContents.goBack();
        return;
      }
    }
  });

  ipcMain.on('tab:gesture-forward', (event) => {
    for (const [, tab] of tabs.entries()) {
      if (tab.view.webContents === event.sender) {
        const history = tab.view.webContents.navigationHistory;
        if (history && history.canGoForward()) history.goForward();
        else if (tab.view.webContents.canGoForward()) tab.view.webContents.goForward();
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
          if (tab) tab.view.webContents.reload();
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
    contextMenu.popup({ window: mainWindow });
  });
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

  ipcMain.handle('shield:toggle', (_e, enabled) => {
    isShieldEnabled = !!enabled;
    userConfig.shieldEnabled = isShieldEnabled;
    saveConfig(userConfig);

    if (adBlocker) {
      try {
        const mainSes = getMainSession();
        if (isShieldEnabled) {
          if (!adBlocker.isBlockingEnabled(session.defaultSession)) {
            adBlocker.enableBlockingInSession(session.defaultSession);
          }
          if (!adBlocker.isBlockingEnabled(mainSes)) {
            adBlocker.enableBlockingInSession(mainSes);
          }
          console.log('🛡️ [Findra Shield] AdBlock turned ON');
        } else {
          if (adBlocker.isBlockingEnabled(session.defaultSession)) {
            adBlocker.disableBlockingInSession(session.defaultSession);
          }
          if (adBlocker.isBlockingEnabled(mainSes)) {
            adBlocker.disableBlockingInSession(mainSes);
          }
          console.log('🛡️ [Findra Shield] AdBlock turned OFF');
        }
      } catch (e) {
        console.error('[-] Error toggling shield:', e);
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shield:stats', {
        totalBlocked: totalBlockedAds,
        enabled: isShieldEnabled,
      });
    }

    return {
      enabled: isShieldEnabled,
      blockedCount: totalBlockedAds,
    };
  });

  // Create initial tab once UI finishes loading
  mainWindow.webContents.once('did-finish-load', () => {
    createTab(findraBaseUrl);
  });

  setupApplicationMenu();
}

async function setupAdBlocker() {
  try {
    userConfig = loadConfig();
    if (typeof userConfig.shieldEnabled === 'boolean') {
      isShieldEnabled = userConfig.shieldEnabled;
    }

    let cachePath = '';
    try {
      cachePath = path.join(app.getPath('userData'), 'findra-adblocker-cache.bin');
    } catch (e) {
      cachePath = path.join(__dirname, 'findra-adblocker-cache.bin');
    }

    const caching = {
      path: cachePath,
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    };

    console.log('🛡️ [Findra Shield] Initializing Ghostery & EasyList adblock engine...');
    adBlocker = await ElectronBlocker.fromLists(fetch, fullLists, {
      loadNetworkFilters: true,
      loadCosmeticFilters: false,
    }, caching);

    if (isShieldEnabled) {
      adBlocker.enableBlockingInSession(session.defaultSession);
      const mainSes = getMainSession();
      if (!adBlocker.isBlockingEnabled(mainSes)) {
        adBlocker.enableBlockingInSession(mainSes);
      }
      console.log('🛡️ [Findra Shield] AdBlock successfully active on main persistent session!');
    }

    adBlocker.on('request-blocked', (request) => {
      totalBlockedAds++;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shield:stats', {
          totalBlocked: totalBlockedAds,
          enabled: isShieldEnabled,
          url: request.url,
        });
      }
    });
  } catch (err) {
    console.error('[-] Error setting up Findra Shield:', err);
  }
}

app.whenReady().then(() => {
  setupSessionPersistenceAndAuth();
  setupAdBlocker();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async () => {
  try {
    await getMainSession().cookies.flushStore();
    console.log('🔒 [Findra Session] Cookies successfully flushed to disk.');
  } catch (e) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
