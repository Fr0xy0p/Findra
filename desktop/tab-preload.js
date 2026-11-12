const { ipcRenderer, contextBridge } = require('electron');

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

// ---------------- YOUTUBE COMPLETE AD BLOCK & ELIMINATION ENGINE ----------------
// Intercepts YouTube's internal player APIs and fast-forwards/mutes any in-stream video ads

const YOUTUBE_MAIN_WORLD_SHIELD = `
(function() {
  if (window.__findra_yt_shield_active) return;
  window.__findra_yt_shield_active = true;

  function stripAdsFromPlayerObj(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      if (obj.adPlacements) delete obj.adPlacements;
      if (obj.adSlots) delete obj.adSlots;
      if (obj.playerAds) delete obj.playerAds;
      if (obj.adBreakHeartbeatParams) delete obj.adBreakHeartbeatParams;
      if (obj.adTimeoutParams) delete obj.adTimeoutParams;
    } catch(e) {}
    return obj;
  }

  // 1. Intercept window.ytInitialPlayerResponse
  let _initialResp = window.ytInitialPlayerResponse;
  if (_initialResp) {
    stripAdsFromPlayerObj(_initialResp);
  }
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get: () => _initialResp,
      set: (val) => {
        _initialResp = stripAdsFromPlayerObj(val);
      },
      configurable: true,
      enumerable: true
    });
  } catch(e) {}

  // 2. Intercept window.fetch for /youtubei/v1/player
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const res = await origFetch.apply(this, args);
    if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
      try {
        const clone = res.clone();
        const json = await clone.json();
        const sanitized = stripAdsFromPlayerObj(json);
        return new Response(JSON.stringify(sanitized), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers
        });
      } catch(e) {
        return res;
      }
    }
    return res;
  };

  // 3. Intercept XMLHttpRequest for /youtubei/v1/player
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._findraUrl = url;
    return origOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    if (this._findraUrl && typeof this._findraUrl === 'string' && this._findraUrl.includes('/youtubei/v1/player')) {
      this.addEventListener('readystatechange', function() {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const data = JSON.parse(this.responseText);
            const sanitized = stripAdsFromPlayerObj(data);
            Object.defineProperty(this, 'responseText', { value: JSON.stringify(sanitized), configurable: true });
            Object.defineProperty(this, 'response', { value: JSON.stringify(sanitized), configurable: true });
          } catch(e) {}
        }
      });
    }
    return origSend.apply(this, args);
  };
})();
`;

function injectMainWorldShield() {
  const host = window.location.hostname || '';
  if (!host.includes('youtube.com')) return;

  try {
    const script = document.createElement('script');
    script.id = 'findra-yt-player-shield';
    script.textContent = YOUTUBE_MAIN_WORLD_SHIELD;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(script);
      script.remove();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      }, { once: true });
    }
  } catch (e) {}
}

injectMainWorldShield();

// Active Real-Time Video Ad Skipper & Auto-Muter
let wasAdMutedByShield = false;
let userWasMutedBeforeAd = false;

function handleYouTubeVideoAdSkipper() {
  const host = window.location.hostname || '';
  if (!host.includes('youtube.com')) return;

  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const video = player ? player.querySelector('video') : document.querySelector('video.html5-main-video') || document.querySelector('video');

  const isAdPlaying = Boolean(
    player?.classList.contains('ad-showing') ||
    player?.classList.contains('ad-interrupting') ||
    document.querySelector('.ytp-ad-player-overlay, .ytp-ad-text, .ytp-ad-preview-text, .ytp-ad-skip-button, .video-ads')
  );

  if (isAdPlaying && video) {
    // 1. SILENCE AUDIO IMMEDIATELY (Guarantees no ad audio is audible)
    if (!wasAdMutedByShield) {
      userWasMutedBeforeAd = Boolean(video.muted);
      video.muted = true;
      wasAdMutedByShield = true;
    } else if (!video.muted) {
      video.muted = true;
    }

    // 2. SPEED UP AD TO 16X MAXIMUM SPEED
    try {
      video.playbackRate = 16.0;
    } catch (e) {}

    // 3. JUMP IMMEDIATELY TO END OF AD DURATION
    try {
      if (isFinite(video.duration) && video.duration > 0 && !isNaN(video.currentTime)) {
        video.currentTime = video.duration + 1;
      }
    } catch (e) {}

    // 4. INSTANTLY CLICK ANY SKIP BUTTON
    const skipSelectors = [
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button-slot button',
      'button.ytp-ad-skip-button-modern',
      '.ytp-ad-overlay-close-button',
      '[id^="skip-button"] button'
    ];
    for (const sel of skipSelectors) {
      const btn = document.querySelector(sel);
      if (btn && typeof btn.click === 'function') {
        btn.click();
        break;
      }
    }
  } else if (!isAdPlaying && video) {
    // Ad finished: restore volume and playback speed
    if (wasAdMutedByShield) {
      if (!userWasMutedBeforeAd) {
        video.muted = false;
      }
      try {
        video.playbackRate = 1.0;
      } catch (e) {}
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
    if (video && video.paused) {
      video.play().catch(() => {});
    }
  }
}

// Continuous active monitoring loop for zero-delay ad neutralization
setInterval(handleYouTubeVideoAdSkipper, 50);
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

