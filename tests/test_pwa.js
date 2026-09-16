import assert from 'assert';
import { 
  isStandalone, 
  isEligibleForPwaPrompt, 
  isIosSafari, 
  dismissPwaPrompt, 
  markPwaInstalled 
} from '../modules/pwaInstaller.js';

// Simple Mock for localStorage & sessionStorage in Node test environment
class StorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new StorageMock();
global.sessionStorage = new StorageMock();

console.log("🧪 Running PWA Installation Flow Test Suite...");

// Test 1: Standalone Detection
{
  console.log("Test 1: Standalone mode blocks PWA install prompt");
  global.window = {
    matchMedia: (query) => ({ matches: query.includes('standalone') }),
    navigator: { standalone: true }
  };
  global.document = { referrer: '' };

  assert.strictEqual(isStandalone(), true, "Should detect standalone mode via navigator.standalone");
  assert.strictEqual(isEligibleForPwaPrompt(), false, "Standalone mode must block PWA prompt");
  console.log("  ✅ Standalone detection verified successfully.");
}

// Test 2: iOS Safari Detection
{
  console.log("Test 2: iOS Safari browser detection");
  global.window = {
    matchMedia: () => ({ matches: false }),
    navigator: { standalone: false }
  };

  // Mock iPhone Safari UserAgent
  Object.defineProperty(global, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      standalone: false
    },
    writable: true,
    configurable: true
  });
  assert.strictEqual(isIosSafari(), true, "Should identify iPhone Safari");

  // Mock Chrome on iOS UserAgent (CriOS)
  Object.defineProperty(global, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/117.0.5938.108 Mobile/15E148 Safari/604.1',
      standalone: false
    },
    writable: true,
    configurable: true
  });
  assert.strictEqual(isIosSafari(), false, "Chrome on iOS should not count as Safari");
  console.log("  ✅ iOS Safari detection verified successfully.");
}

// Test 3: Session Dismissal & 7-Day Cooldown Logic
{
  console.log("Test 3: Session dismissal and 7-day cooldown rules");
  global.localStorage.clear();
  global.sessionStorage.clear();
  global.window = {
    matchMedia: () => ({ matches: false }),
    navigator: { standalone: false }
  };
  Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'Android', standalone: false },
    writable: true,
    configurable: true
  });
  global.document = { referrer: '', getElementById: () => null };

  // Eligible initially
  assert.strictEqual(isEligibleForPwaPrompt(), true, "Should be eligible on clean slate");

  // User dismisses prompt
  dismissPwaPrompt();

  assert.strictEqual(sessionStorage.getItem('orbia_pwa_session_dismissed'), 'true', "Session dismissal recorded");
  assert.ok(localStorage.getItem('orbia_pwa_install_dismissed_at'), "Timestamp recorded in localStorage");
  assert.strictEqual(isEligibleForPwaPrompt(), false, "Must not be eligible in same session after dismissal");

  // Simulate new session after 1 day (less than 7 days)
  global.sessionStorage.clear();
  assert.strictEqual(isEligibleForPwaPrompt(), false, "Must not be eligible 1 day after dismissal");

  // Simulate new session after 8 days
  const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
  global.localStorage.setItem('orbia_pwa_install_dismissed_at', String(eightDaysAgo));
  assert.strictEqual(isEligibleForPwaPrompt(), true, "Must become eligible again after 7-day cooldown");
  console.log("  ✅ 7-Day Cooldown & Session dismissal verified successfully.");
}

// Test 4: appinstalled Event & Permanent Suppression
{
  console.log("Test 4: Installation suppresses future prompts permanently");
  global.localStorage.clear();
  global.sessionStorage.clear();

  markPwaInstalled();

  assert.strictEqual(localStorage.getItem('orbia_pwa_installed'), 'true', "Installation marked in localStorage");
  assert.strictEqual(isEligibleForPwaPrompt(), false, "Installed app must never prompt again");
  console.log("  ✅ Permanent suppression after install verified successfully.");
}

console.log("🎉 ALL PWA INSTALLATION TESTS PASSED 100% GREEN!");
