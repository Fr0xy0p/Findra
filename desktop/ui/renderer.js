// DOM Elements
const tabStrip = document.getElementById('tab-strip');
const btnNewTab = document.getElementById('btn-new-tab');
const btnToolbarNewTab = document.getElementById('btn-toolbar-new-tab');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnHome = document.getElementById('btn-home');
const omniboxInput = document.getElementById('omnibox-input');
const suggestionsMenu = document.getElementById('suggestions-menu');
const btnQuickYt = document.getElementById('btn-quick-yt');
const btnSidepanel = document.getElementById('btn-sidepanel');

let currentSuggestions = [];
let selectedSuggestionIndex = -1;

// Platform-specific styling adjustments (Windows vs macOS)
if (window.findraBrowser && window.findraBrowser.platform !== 'darwin') {
  const spacer = document.getElementById('traffic-light-spacer');
  if (spacer) spacer.style.display = 'none';
  const tabContainer = document.getElementById('tab-bar-container');
  if (tabContainer) {
    tabContainer.style.paddingLeft = '12px';
    tabContainer.style.paddingRight = '140px'; // Space for Windows window control buttons
  }
}

// ---------------- TAB MANAGEMENT ----------------
function renderTabs(tabList, activeId) {
  tabStrip.innerHTML = '';

  tabList.forEach((tab) => {
    const tabEl = document.createElement('div');
    tabEl.className = `browser-tab ${tab.id === activeId ? 'active' : ''}`;
    tabEl.title = tab.title || tab.url;

    // Favicon or letter badge
    if (tab.favicon) {
      const img = document.createElement('img');
      img.className = 'tab-favicon';
      img.src = tab.favicon;
      img.onerror = () => {
        img.replaceWith(createFallbackFavicon(tab.title));
      };
      tabEl.appendChild(img);
    } else {
      tabEl.appendChild(createFallbackFavicon(tab.title));
    }

    // Title
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.isLoading ? 'Loading...' : (tab.title || 'New Tab');
    tabEl.appendChild(titleSpan);

    // Audio icon if playing sound
    if (tab.isAudioPlaying) {
      const audioIcon = document.createElement('span');
      audioIcon.className = 'tab-audio-icon';
      audioIcon.textContent = '🔊';
      tabEl.appendChild(audioIcon);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Close Tab (Cmd+W)';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      window.findraBrowser.closeTab(tab.id);
    };
    tabEl.appendChild(closeBtn);

    // Switch tab on click
    tabEl.onclick = () => {
      window.findraBrowser.switchTab(tab.id);
    };

    // Right-click context menu (New Tab, Reload, Duplicate, Close)
    tabEl.oncontextmenu = (e) => {
      e.preventDefault();
      window.findraBrowser.showTabContextMenu(tab.id);
    };

    tabStrip.appendChild(tabEl);
  });
}

function createFallbackFavicon(title) {
  const fallback = document.createElement('div');
  fallback.className = 'tab-favicon-fallback';
  fallback.textContent = (title || 'F').charAt(0).toUpperCase();
  return fallback;
}

// ---------------- NAVIGATION & CONTROLS ----------------
btnNewTab.onclick = () => window.findraBrowser.newTab();
if (btnToolbarNewTab) {
  btnToolbarNewTab.onclick = () => window.findraBrowser.newTab();
}
btnBack.onclick = () => window.findraBrowser.goBack();
btnForward.onclick = () => window.findraBrowser.goForward();
btnReload.onclick = () => window.findraBrowser.reload();
btnHome.onclick = () => window.findraBrowser.goHome();

// Navigate in the SAME tab!
btnQuickYt.onclick = () => window.findraBrowser.navigate('https://www.youtube.com');
btnSidepanel.onclick = () => window.findraBrowser.toggleSidePanel();

// Cloud Settings Modal
const btnCloudConfig = document.getElementById('btn-cloud-config');
const cloudModal = document.getElementById('cloud-modal');
const btnCloseCloudModal = document.getElementById('btn-close-cloud-modal');
const cloudUrlInput = document.getElementById('cloud-url-input');
const btnSaveCloudUrl = document.getElementById('btn-save-cloud-url');
const btnResetCloudUrl = document.getElementById('btn-reset-cloud-url');

async function openCloudModal(url) {
  if (cloudModal && cloudUrlInput) {
    const current = url || await window.findraBrowser.getCloudUrl();
    cloudUrlInput.value = current || '';
    cloudModal.classList.remove('hidden');
    cloudUrlInput.focus();
  }
}

function closeCloudModal() {
  if (cloudModal) cloudModal.classList.add('hidden');
}

if (btnCloudConfig) {
  btnCloudConfig.onclick = () => openCloudModal();
}
if (btnCloseCloudModal) {
  btnCloseCloudModal.onclick = closeCloudModal;
}
if (cloudModal) {
  cloudModal.onclick = (e) => {
    if (e.target === cloudModal) closeCloudModal();
  };
}
if (btnResetCloudUrl) {
  btnResetCloudUrl.onclick = async () => {
    const def = 'https://findra-q4pt.onrender.com';
    cloudUrlInput.value = def;
    await window.findraBrowser.setCloudUrl(def);
    closeCloudModal();
  };
}
if (btnSaveCloudUrl) {
  btnSaveCloudUrl.onclick = async () => {
    const val = (cloudUrlInput.value || '').trim();
    if (val) {
      await window.findraBrowser.setCloudUrl(val);
      closeCloudModal();
    }
  };
}

if (window.findraBrowser.onShowCloudConfig) {
  window.findraBrowser.onShowCloudConfig((url) => {
    openCloudModal(url);
  });
}

// Global Shortcuts: Cmd+T (New tab), Cmd+, (Cloud settings)
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    window.findraBrowser.newTab();
  } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault();
    openCloudModal();
  }
});

// ---------------- OMNIBOX & SUGGESTIONS ----------------
omniboxInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedSuggestionIndex >= 0 && currentSuggestions[selectedSuggestionIndex]) {
      submitNavigation(currentSuggestions[selectedSuggestionIndex]);
    } else {
      submitNavigation(omniboxInput.value);
    }
    hideSuggestions();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveSuggestionHighlight(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveSuggestionHighlight(-1);
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

let suggestDebounce = null;
omniboxInput.addEventListener('input', () => {
  clearTimeout(suggestDebounce);
  const q = omniboxInput.value.trim();
  if (!q || q.length < 2 || q.startsWith('http://') || q.startsWith('https://')) {
    hideSuggestions();
    return;
  }

  suggestDebounce = setTimeout(async () => {
    try {
      const suggestions = await window.findraBrowser.fetchSuggestions(q);
      showSuggestions(suggestions);
    } catch (err) {
      hideSuggestions();
    }
  }, 120);
});

function submitNavigation(val) {
  const target = val.trim();
  if (!target) return;
  window.findraBrowser.navigate(target);
}

function showSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    hideSuggestions();
    return;
  }

  currentSuggestions = suggestions;
  selectedSuggestionIndex = -1;
  suggestionsMenu.innerHTML = '';

  suggestions.slice(0, 6).forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <span>${escapeHtml(s)}</span>
    `;
    item.onclick = () => {
      omniboxInput.value = s;
      submitNavigation(s);
      hideSuggestions();
    };
    suggestionsMenu.appendChild(item);
  });

  suggestionsMenu.classList.remove('hidden');
}

function hideSuggestions() {
  suggestionsMenu.classList.add('hidden');
  currentSuggestions = [];
  selectedSuggestionIndex = -1;
}

function moveSuggestionHighlight(step) {
  if (currentSuggestions.length === 0) return;
  selectedSuggestionIndex = (selectedSuggestionIndex + step + currentSuggestions.length) % currentSuggestions.length;

  const items = suggestionsMenu.querySelectorAll('.suggestion-item');
  items.forEach((item, idx) => {
    if (idx === selectedSuggestionIndex) {
      item.classList.add('active');
      omniboxInput.value = currentSuggestions[idx];
    } else {
      item.classList.remove('active');
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Close suggestions on outside click
document.addEventListener('click', (e) => {
  if (!document.getElementById('omnibox-wrapper').contains(e.target)) {
    hideSuggestions();
  }
});

// ---------------- IPC LISTENERS FROM MAIN PROCESS ----------------
window.findraBrowser.onTabsUpdated(({ tabs, activeTabId, isSidePanelOpen }) => {
  renderTabs(tabs, activeTabId);
  btnSidepanel.classList.toggle('active', isSidePanelOpen);
});

window.findraBrowser.onNavigationState(({ url, canGoBack, canGoForward, isLoading }) => {
  // Only update omnibox if user is not actively typing in it
  if (document.activeElement !== omniboxInput) {
    omniboxInput.value = url;
  }

  btnBack.disabled = !canGoBack;
  btnForward.disabled = !canGoForward;

  btnReload.innerHTML = isLoading
    ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#3b82f6" stroke-width="2" fill="none" style="animation: spin 0.8s linear infinite;"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
});

window.findraBrowser.onFocusOmnibox(() => {
  omniboxInput.focus();
  omniboxInput.select();
});

// ---------------- FINDRA SHIELD (ADBLOCK) CONTROLS ----------------
const btnShield = document.getElementById('btn-shield');
const shieldPopover = document.getElementById('shield-popover');
const shieldBadge = document.getElementById('shield-badge');
const shieldToggleInput = document.getElementById('shield-toggle-input');
const shieldStatusText = document.getElementById('shield-status-text');
const shieldIconBadge = document.getElementById('shield-icon-badge');
const shieldStatBlocked = document.getElementById('shield-stat-blocked');

let shieldBlockedCount = 0;
let isShieldActive = true;

// Initialize Shield Status from main process
if (window.findraBrowser && window.findraBrowser.getShieldStatus) {
  window.findraBrowser.getShieldStatus().then((status) => {
    if (status) {
      updateShieldUI(status.enabled, status.blockedCount);
    }
  });

  window.findraBrowser.onShieldStats((stats) => {
    if (stats) {
      updateShieldUI(stats.enabled, stats.totalBlocked);
    }
  });
}

function updateShieldUI(enabled, count) {
  isShieldActive = !!enabled;
  shieldBlockedCount = count || 0;

  if (shieldBadge) shieldBadge.textContent = shieldBlockedCount;
  if (shieldStatBlocked) shieldStatBlocked.textContent = shieldBlockedCount;
  if (shieldToggleInput) shieldToggleInput.checked = isShieldActive;

  if (btnShield) {
    btnShield.classList.toggle('shield-disabled', !isShieldActive);
  }
  if (shieldIconBadge) {
    shieldIconBadge.classList.toggle('disabled', !isShieldActive);
  }
  if (shieldStatusText) {
    shieldStatusText.textContent = isShieldActive
      ? 'Ad & Tracker Blocking Active'
      : 'Findra Shield is Paused';
    shieldStatusText.classList.toggle('disabled', !isShieldActive);
  }
}

if (btnShield && shieldPopover) {
  btnShield.addEventListener('click', (e) => {
    e.stopPropagation();
    shieldPopover.classList.toggle('hidden');
  });

  shieldToggleInput.addEventListener('change', async (e) => {
    const newState = e.target.checked;
    if (window.findraBrowser && window.findraBrowser.toggleShield) {
      const updated = await window.findraBrowser.toggleShield(newState);
      updateShieldUI(updated.enabled, updated.blockedCount);
    }
  });

  // Close popover on outside click
  document.addEventListener('click', (e) => {
    if (!shieldPopover.contains(e.target) && !btnShield.contains(e.target)) {
      shieldPopover.classList.add('hidden');
    }
  });
}


