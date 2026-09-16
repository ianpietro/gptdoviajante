// ==========================================================================
// ORBIA PWA INSTALLER MODULE
// Manages PWA installation prompts, iOS Safari guidance, standalone detection,
// 7-day cooldown, session dismissal, and browser fallbacks.
// ==========================================================================

const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
let deferredPrompt = null;
let pwaPromptInitialized = false;

/**
 * Checks if the app is running in standalone mode (installed PWA context)
 */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Checks if the user is eligible to see the PWA install prompt
 */
export function isEligibleForPwaPrompt() {
  if (isStandalone()) return false;
  
  if (localStorage.getItem('orbia_pwa_installed') === 'true') return false;
  if (sessionStorage.getItem('orbia_pwa_session_dismissed') === 'true') return false;

  const dismissedAt = localStorage.getItem('orbia_pwa_install_dismissed_at');
  if (dismissedAt) {
    const elapsed = Date.now() - Number(dismissedAt);
    if (elapsed < DISMISS_COOLDOWN_MS) return false;
  }

  return true;
}

/**
 * Detects iOS Safari browser
 */
export function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isWebkit = /safari/i.test(ua);
  const isOtherBrowser = /crios|fxios|optios|edgios/i.test(ua);
  return isIos && isWebkit && !isOtherBrowser;
}

/**
 * Dismisses the PWA prompt for current session and sets 7-day cooldown
 */
export function dismissPwaPrompt() {
  localStorage.setItem('orbia_pwa_install_dismissed_at', String(Date.now()));
  sessionStorage.setItem('orbia_pwa_session_dismissed', 'true');
  hidePwaModal();
}

/**
 * Marks the PWA as installed
 */
export function markPwaInstalled() {
  localStorage.setItem('orbia_pwa_installed', 'true');
  hidePwaModal();
}

/**
 * Shows the PWA installation modal/banner
 */
export function showPwaModal() {
  if (!isEligibleForPwaPrompt()) return;

  const modal = document.getElementById('pwaInstallModal');
  if (!modal) return;

  const androidSection = document.getElementById('pwaAndroidSection');
  const iosSection = document.getElementById('pwaIosSection');
  const fallbackSection = document.getElementById('pwaFallbackSection');

  if (androidSection) androidSection.classList.add('hidden');
  if (iosSection) iosSection.classList.add('hidden');
  if (fallbackSection) fallbackSection.classList.add('hidden');

  if (deferredPrompt && androidSection) {
    androidSection.classList.remove('hidden');
  } else if (isIosSafari() && iosSection) {
    iosSection.classList.remove('hidden');
  } else if (fallbackSection) {
    fallbackSection.classList.remove('hidden');
  }

  modal.classList.remove('hidden');
}

/**
 * Hides the PWA installation modal/banner
 */
export function hidePwaModal() {
  const modal = document.getElementById('pwaInstallModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Triggers native Android/Chrome install prompt or handles fallback
 */
export async function triggerNativeInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        markPwaInstalled();
        window.showToast?.('🎉 Orbia instalado com sucesso!', 'success');
      } else {
        dismissPwaPrompt();
      }
    } catch (e) {
      console.warn('PWA install prompt error:', e);
    }
    deferredPrompt = null;
  } else {
    // Show fallback instructions if no native prompt
    const androidSection = document.getElementById('pwaAndroidSection');
    const fallbackSection = document.getElementById('pwaFallbackSection');
    if (androidSection) androidSection.classList.add('hidden');
    if (fallbackSection) fallbackSection.classList.remove('hidden');
  }
}

/**
 * Initializes PWA install listeners, events, and delay triggers
 */
export function initPwaInstaller() {
  if (pwaPromptInitialized || typeof window === 'undefined') return;
  pwaPromptInitialized = true;

  // 1. Listen for native beforeinstallprompt (Android / Chrome Desktop)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    schedulePwaPrompt();
  });

  // 2. Listen for appinstalled event
  window.addEventListener('appinstalled', () => {
    markPwaInstalled();
    deferredPrompt = null;
    window.showToast?.('🎉 Orbia adicionado à tela de início!', 'success');
  });

  // 3. Schedule prompt display after UX delay (5s or after first user interaction)
  schedulePwaPrompt();
}

function schedulePwaPrompt() {
  if (!isEligibleForPwaPrompt()) return;

  let timer = setTimeout(() => {
    cleanupListeners();
    showPwaModal();
  }, 5000);

  function userInteracted() {
    clearTimeout(timer);
    cleanupListeners();
    setTimeout(() => {
      showPwaModal();
    }, 1500);
  }

  function cleanupListeners() {
    window.removeEventListener('click', userInteracted);
    window.removeEventListener('touchstart', userInteracted);
  }

  window.addEventListener('click', userInteracted, { once: true });
  window.addEventListener('touchstart', userInteracted, { once: true });
}

// Make functions accessible globally for HTML onclick attributes
if (typeof window !== 'undefined') {
  window.initPwaInstaller = initPwaInstaller;
  window.showPwaModal = showPwaModal;
  window.hidePwaModal = hidePwaModal;
  window.dismissPwaPrompt = dismissPwaPrompt;
  window.triggerNativeInstall = triggerNativeInstall;
  window.isStandalonePwa = isStandalone;
}
