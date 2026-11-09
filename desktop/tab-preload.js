const { ipcRenderer, contextBridge } = require('electron');

// Expose native desktop app indicator
try {
  contextBridge.exposeInMainWorld('isFindraNativeApp', true);
} catch (e) {}

// Findra Shield: Cosmetic Ad-Element Hiding
// Collapses ad frames, banner placeholders, and sponsored widgets so pages render cleanly
const COSMETIC_AD_FILTER_CSS = `
  .adsbygoogle, [id^="google_ads_"], [id^="aswift_"], [id*="-ad-"],
  .ad-container, .ad-banner, .advertisement, .ad-wrapper, .ad_unit,
  .sponsored-post, [data-ad-unit], [data-ad-slot], [data-ad-client],
  div[class*="sponsored"], .outbrain_widget, .taboola-container,
  #ytd-player .ytp-ad-module, .video-ads, .ytp-ad-overlay-container,
  .ad-showing, .ad-interrupting {
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

