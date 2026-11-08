const { ipcRenderer, contextBridge } = require('electron');

// Expose native desktop app indicator
try {
  contextBridge.exposeInMainWorld('isFindraNativeApp', true);
} catch (e) {}

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
