const { ipcRenderer, contextBridge, webFrame } = require('electron');

// 1. Google / Chromium Browser Environment Emulation (Fixes "This browser or app may not be secure")
try {
  // Strip navigator.webdriver flag
  if (Object.prototype.hasOwnProperty.call(navigator, 'webdriver') || 'webdriver' in navigator) {
    try {
      delete Object.getPrototypeOf(navigator).webdriver;
    } catch (e) {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
    }
  }

  // Emulate authentic window.chrome for Google Identity Services
  if (!window.chrome) {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      id: undefined,
      connect: function() {},
      sendMessage: function() {},
    };
  }
  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = function() {
      const now = Date.now() / 1000;
      return {
        requestTime: now,
        startLoadTime: now,
        commitLoadTime: now,
        finishDocumentLoadTime: now,
        finishLoadTime: now,
        firstPaintTime: now,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false,
        npnNegotiatedProtocol: '',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'http/1.1'
      };
    };
  }
  if (!window.chrome.csi) {
    window.chrome.csi = function() {
      return { startE: Date.now(), onloadT: Date.now(), pageT: 80, tran: 15 };
    };
  }
} catch (e) {}

// Expose native desktop app indicator safely
try {
  const host = window.location.hostname || '';
  if (host.includes('localhost') || host.includes('render.com') || host.includes('findra')) {
    contextBridge.exposeInMainWorld('isFindraNativeApp', true);
  }
} catch (e) {}

// Safe main-world script evaluator
function injectMainWorldScript(scriptSource) {
  if (!scriptSource) return;
  try {
    if (webFrame && typeof webFrame.executeJavaScript === 'function') {
      webFrame.executeJavaScript(scriptSource);
    }
  } catch (e) {}

  function tryAppendScriptTag() {
    try {
      const parent = document.head || document.documentElement;
      if (parent) {
        const s = document.createElement('script');
        s.textContent = scriptSource;
        parent.appendChild(s);
        s.remove();
        return true;
      }
    } catch (e) {}
    return false;
  }

  if (!tryAppendScriptTag()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAppendScriptTag, { once: true });
    }
  }
}

// ---------------- SOLUTION 1: PRE-EMPTIVE YOUTUBE AD ELIMINATION ----------------
// Neutralizes player ad placements (adPlacements, adSlots, playerAds) at the JSON/config level
// BEFORE the HTML5 player queues an ad MediaSource stream.
// This boots the player directly to the main video at 0:00 without media pipeline resets,
// unbuffered seeks, or stream-switching buffering delays.
const YOUTUBE_PREEMPTIVE_SCRIPT = `
(function() {
  if (window.__findraYouTubePreEmptiveLoaded) return;
  window.__findraYouTubePreEmptiveLoaded = true;

  function pruneAdsFromObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      if ('adPlacements' in obj) delete obj.adPlacements;
      if ('adSlots' in obj) delete obj.adSlots;
      if ('playerAds' in obj) delete obj.playerAds;
      if ('adBreakHeartbeatParams' in obj) delete obj.adBreakHeartbeatParams;
      if ('adTag' in obj) delete obj.adTag;
      if ('adParams' in obj) delete obj.adParams;
      if (obj.playerResponse && typeof obj.playerResponse === 'object') {
        pruneAdsFromObject(obj.playerResponse);
      }
    } catch (e) {}
    return obj;
  }

  // 1. Hook window.ytInitialPlayerResponse
  let _ytInitialPlayerResponse = window.ytInitialPlayerResponse;
  if (_ytInitialPlayerResponse) {
    pruneAdsFromObject(_ytInitialPlayerResponse);
  }
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      enumerable: true,
      get() {
        return _ytInitialPlayerResponse;
      },
      set(val) {
        _ytInitialPlayerResponse = pruneAdsFromObject(val);
      }
    });
  } catch (e) {}

  // 2. Hook window.ytplayer & ytplayer.config.args.raw_player_response
  function sanitizeYtPlayerArgs(args) {
    if (!args || typeof args !== 'object') return;
    if (args.raw_player_response) {
      if (typeof args.raw_player_response === 'string') {
        try {
          const parsed = JSON.parse(args.raw_player_response);
          pruneAdsFromObject(parsed);
          args.raw_player_response = JSON.stringify(parsed);
        } catch (e) {}
      } else if (typeof args.raw_player_response === 'object') {
        pruneAdsFromObject(args.raw_player_response);
      }
    }
    delete args.ad_device;
    delete args.ad_flags;
    delete args.ad_logging_flag;
    delete args.ad_preroll;
    delete args.ad_tag;
    delete args.adsense_video_doc_id;
    delete args.afv;
    delete args.afv_ad_tag;
    delete args.allow_html5_ads;
  }

  function hookYtPlayer(ytp) {
    if (!ytp || typeof ytp !== 'object') return;
    if (ytp.config && ytp.config.args) {
      sanitizeYtPlayerArgs(ytp.config.args);
    }
    let _cfg = ytp.config;
    try {
      Object.defineProperty(ytp, 'config', {
        configurable: true,
        enumerable: true,
        get() { return _cfg; },
        set(val) {
          _cfg = val;
          if (_cfg && _cfg.args) sanitizeYtPlayerArgs(_cfg.args);
        }
      });
    } catch (e) {}
  }

  let _ytplayer = window.ytplayer;
  if (_ytplayer) {
    hookYtPlayer(_ytplayer);
  }
  try {
    Object.defineProperty(window, 'ytplayer', {
      configurable: true,
      enumerable: true,
      get() { return _ytplayer; },
      set(val) {
        _ytplayer = val;
        hookYtPlayer(_ytplayer);
      }
    });
  } catch (e) {}

  // 3. Hook JSON.parse to prune ad placements from player API responses
  const originalJsonParse = JSON.parse;
  JSON.parse = function(text, reviver) {
    const data = originalJsonParse.call(this, text, reviver);
    if (data && typeof data === 'object' && typeof text === 'string') {
      if (text.includes('adPlacements') || text.includes('adSlots') || text.includes('playerAds')) {
        pruneAdsFromObject(data);
      }
    }
    return data;
  };

  // 4. Hook Response.prototype.json for /youtubei/v1/player fetch responses
  if (typeof Response !== 'undefined' && Response.prototype && Response.prototype.json) {
    const originalResponseJson = Response.prototype.json;
    Response.prototype.json = async function() {
      const data = await originalResponseJson.call(this);
      if (data && typeof data === 'object') {
        if (data.adPlacements || data.adSlots || data.playerAds || data.playerResponse) {
          pruneAdsFromObject(data);
        }
      }
      return data;
    };
  }

  // 5. Neutralize ad-blocker enforcement timeout traps
  try {
    if (window.yt && window.yt.config_ && window.yt.config_.EXPERIMENT_FLAGS) {
      window.yt.config_.EXPERIMENT_FLAGS.html5_ad_timeout_ms = 0;
    }
  } catch (e) {}
})();
`;

function initYouTubeShield() {
  const host = window.location.hostname || '';
  if (host.includes('youtube.com')) {
    injectMainWorldScript(YOUTUBE_PREEMPTIVE_SCRIPT);
  }
}
initYouTubeShield();
window.addEventListener('yt-navigate-finish', initYouTubeShield);
window.addEventListener('popstate', initYouTubeShield);

// ---------------- SOLUTION 3: BRAVE SHIELDS RUST COSMETICS & SCRIPTLETS ----------------
// Integrates adblockEngine.urlCosmeticResources dynamically for any loaded webpage
async function applyNativeBraveCosmetics() {
  const host = window.location.hostname || '';
  const url = window.location.href || '';
  if (!url || url.startsWith('about:') || url.startsWith('chrome:') || url.startsWith('data:') || url.startsWith('file:')) return;
  if (host.includes('accounts.google.com') || host.includes('gstatic.com') || host.includes('recaptcha.net')) return;

  try {
    const res = await ipcRenderer.invoke('shield:getCosmeticResources', url);
    if (!res) return;

    // Apply native adblock-rust hide selectors
    if (res.hide_selectors && res.hide_selectors.length > 0) {
      const exceptions = new Set(res.exceptions || []);
      const validSelectors = res.hide_selectors.filter(s => s && !exceptions.has(s));

      if (validSelectors.length > 0) {
        const existing = document.getElementById('findra-shield-rust-cosmetics');
        if (existing) existing.remove();

        const style = document.createElement('style');
        style.id = 'findra-shield-rust-cosmetics';
        style.textContent = `
          ${validSelectors.join(',\n')} {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            pointer-events: none !important;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      }
    }

    // Execute any procedural scriptlet provided by adblock-rust
    if (res.injected_script && typeof res.injected_script === 'string' && res.injected_script.trim()) {
      injectMainWorldScript(res.injected_script);
    }
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyNativeBraveCosmetics, { once: true });
} else {
  applyNativeBraveCosmetics();
}

window.addEventListener('yt-navigate-finish', applyNativeBraveCosmetics);
window.addEventListener('popstate', applyNativeBraveCosmetics);

// Findra Shield: Cosmetic Ad-Element Hiding
// Collapses ad frames, banner placeholders, and sponsored widgets so pages render cleanly
const COSMETIC_AD_FILTER_CSS = `
  /* Generic web ad networks */
  .adsbygoogle, [id^="google_ads_"], [id^="aswift_"], [id*="-ad-"],
  .ad-container, .ad-banner, .advertisement, .ad-wrapper, .ad_unit,
  .sponsored-post, [data-ad-unit], [data-ad-slot], [data-ad-client],
  div[class*="sponsored"], .outbrain_widget, .taboola-container,

  /* YouTube Promoted & Sidebar / Feed Ads (never hide video player container!) */
  ytd-ad-slot-renderer,
  ytd-in-feed-ad-layout-renderer,
  ytd-promoted-sparkles-web-renderer,
  ytd-companion-slot-renderer,
  ytd-action-companion-ad-renderer,
  ytd-banner-promo-renderer,
  ytd-statement-banner-renderer,
  ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
  #masthead-ad,
  #panels:has(ytd-ads-engagement-panel-content-renderer),
  .ytd-merch-shelf-renderer,
  .ytp-ad-overlay-container,
  .ytp-ad-overlay-image,
  .ytp-ad-text-overlay,
  .ytp-ad-message-container,
  ytd-mealbar-promo-renderer,
  ytd-search-pyv-renderer,
  ytd-promoted-video-renderer,
  ytd-popup-container ytd-enforcement-message-view-model,
  tp-yt-paper-dialog:has(ytd-enforcement-message-view-model) {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
`;

function injectCosmeticShield() {
  // Never hide anything on Google login/auth domains
  const host = window.location.hostname || '';
  if (host.includes('accounts.google.com') || host.includes('gstatic.com') || host.includes('recaptcha.net')) {
    return;
  }
  if (document.getElementById('findra-shield-cosmetics')) return;
  const style = document.createElement('style');
  style.id = 'findra-shield-cosmetics';
  style.textContent = COSMETIC_AD_FILTER_CSS;
  (document.head || document.documentElement).appendChild(style);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectCosmeticShield);
} else {
  injectCosmeticShield();
}

// ---------------- YOUTUBE ACTIVE AD SKIPPER & AUTO-MUTER ----------------
// Silently fast-forwards and mutes in-stream ads without breaking the native player or video stream

let wasAdMutedByShield = false;
let userWasMutedBeforeAd = false;

function handleYouTubeVideoAdSkipper() {
  const host = window.location.hostname || '';
  if (!host.includes('youtube.com')) return;

  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  if (!player) return;

  const video = player.querySelector('video') || document.querySelector('video.html5-main-video') || document.querySelector('video');
  if (!video) return;

  // Strict check: YouTube ONLY marks in-stream ads with 'ad-showing' or 'ad-interrupting' on the player container
  // Never check static DOM containers like '.video-ads' which permanently exist on every video
  const isAdPlaying = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');

  if (isAdPlaying) {
    // 1. SILENCE AUDIO IMMEDIATELY & HIDE AD VISUALS (Neither video nor audio of the ad is present)
    if (!wasAdMutedByShield) {
      userWasMutedBeforeAd = Boolean(video.muted);
      video.muted = true;
      wasAdMutedByShield = true;
    } else if (!video.muted) {
      video.muted = true;
    }

    // Hide ad frames visually without unmounting the element or breaking the decoder
    video.style.opacity = '0';

    // 2. SPEED UP AD TO MAXIMUM 16X SPEED (Plays through a 5s countdown in 0.3s)
    try {
      video.playbackRate = 16.0;
    } catch (e) {}

    // 3. ATTEMPT NATIVE PLAYER SKIP IF EXPOSED
    if (typeof player.skipAd === 'function') {
      try {
        player.skipAd();
      } catch (e) {}
    }

    // 4. INSTANTLY AUTO-CLICK ANY SKIP BUTTON AS SOON AS AVAILABLE
    const skipSelectors = [
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button-slot button',
      'button.ytp-ad-skip-button-modern',
      '.ytp-ad-skip-button-container button',
      '.ytp-ad-overlay-close-button',
      'button[aria-label*="Skip"]',
      'button[aria-label*="skip"]',
      '[id^="skip-button"] button'
    ];
    for (const sel of skipSelectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        if (typeof btn.click === 'function') {
          btn.click();
        }
        try {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } catch (e) {}
        break;
      }
    }
  } else {
    // Normal video playback: restore user volume, opacity, and normal 1x playback speed
    if (video.style.opacity === '0') {
      video.style.opacity = '1';
    }

    if (wasAdMutedByShield) {
      if (!userWasMutedBeforeAd) {
        video.muted = false;
      }
      try {
        video.playbackRate = 1.0;
      } catch (e) {}

      // Resume main video ONLY ONCE upon transitioning from the ad
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }

      wasAdMutedByShield = false;
    }
  }

  // Dismiss Anti-Adblock modal if present
  const adBlockWarning = document.querySelector('ytd-enforcement-message-view-model');
  if (adBlockWarning) {
    const dialog = adBlockWarning.closest('tp-yt-paper-dialog') || adBlockWarning.parentElement;
    if (dialog) dialog.remove();
    else adBlockWarning.remove();
    const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');
    if (backdrop) backdrop.remove();
    if (video.paused) {
      video.play().catch(() => {});
    }
  }
}

// Continuous active monitoring loop for zero-delay ad neutralization
setInterval(handleYouTubeVideoAdSkipper, 100);
document.addEventListener('timeupdate', handleYouTubeVideoAdSkipper, true);
document.addEventListener('play', handleYouTubeVideoAdSkipper, true);

// Two-finger trackpad horizontal swipe detection for macOS / Windows
let accumulatedDeltaX = 0;
let gestureCooldown = false;
let resetTimer = null;

function canScrollLeft(target) {
  let el = target;
  while (el && el !== document.documentElement && el !== document.body) {
    if (el.scrollWidth > el.clientWidth && el.scrollLeft > 0) {
      try {
        const style = window.getComputedStyle(el);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
          return true;
        }
      } catch (e) {}
    }
    el = el.parentElement;
  }
  const pageX = window.scrollX || (document.documentElement ? document.documentElement.scrollLeft : 0) || (document.body ? document.body.scrollLeft : 0) || 0;
  return pageX > 1;
}

function canScrollRight(target) {
  let el = target;
  while (el && el !== document.documentElement && el !== document.body) {
    if (el.scrollWidth > el.clientWidth && el.scrollLeft < (el.scrollWidth - el.clientWidth - 2)) {
      try {
        const style = window.getComputedStyle(el);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
          return true;
        }
      } catch (e) {}
    }
    el = el.parentElement;
  }
  const doc = document.documentElement || document.body;
  if (!doc) return false;
  const pageX = window.scrollX || doc.scrollLeft || 0;
  const maxScroll = doc.scrollWidth - window.innerWidth;
  return pageX < (maxScroll - 2);
}

window.addEventListener('wheel', (e) => {
  if (gestureCooldown) return;

  const dx = e.deltaX;
  const dy = e.deltaY;

  // Trackpad horizontal swipe: deltaX significantly larger than deltaY
  if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) >= 6) {
    // Check if swipe right (negative deltaX on standard Mac trackpad)
    if (dx < 0 && !canScrollLeft(e.target)) {
      accumulatedDeltaX += dx;
    } else if (dx > 0 && !canScrollRight(e.target)) {
      accumulatedDeltaX += dx;
    }

    clearTimeout(resetTimer);

    // Threshold of ~60-80px of intentional horizontal swipe gesture
    if (accumulatedDeltaX < -65) {
      gestureCooldown = true;
      accumulatedDeltaX = 0;
      ipcRenderer.send('tab:gesture-back');
      setTimeout(() => { gestureCooldown = false; }, 600);
    } else if (accumulatedDeltaX > 65) {
      gestureCooldown = true;
      accumulatedDeltaX = 0;
      ipcRenderer.send('tab:gesture-forward');
      setTimeout(() => { gestureCooldown = false; }, 600);
    }

    resetTimer = setTimeout(() => {
      accumulatedDeltaX = 0;
    }, 200);
  }
}, { passive: true });

