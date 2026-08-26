import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, BYPASS_LOGIN } from './config.js';

// Initialize Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Returns true if Supabase Auth is configured (URL + Anon Key present).
 * Alias: isFirebaseConfigured kept for backward compatibility during rename migration.
 */
export function isAuthConfigured() {
  return isConfigured;
}
/** @deprecated use isAuthConfigured() */
export const isFirebaseConfigured = isAuthConfigured;

/**
 * Monitor auth state changes
 * @param {Function} onUserActive Callback called when user is logged in
 * @param {Function} onUserInactive Callback called when user is logged out
 */
export function setupAuthStateListener(onUserActive, onUserInactive) {
  if (BYPASS_LOGIN || !isConfigured) {
    console.info("Bypassing login.");
    onUserActive({
      id: "dummy-user-id",
      email: "teste@viajante.com",
      user_metadata: {
        full_name: "Viajante Teste",
        avatar_url: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150"
      }
    }, "dummy-token-unconfigured");
    return;
  }

  // Check current session immediately
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      onUserActive(session.user, session.access_token);
    } else {
      onUserInactive();
    }
  });

  // Listen for changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      onUserActive(session.user, session.access_token);
    } else {
      onUserInactive();
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Login with Google OAuth (Redirect method is most reliable for mobile/in-app browsers)
 */
export async function loginWithGoogle() {
  if (!isConfigured) return;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href.split('?')[0].split('#')[0]
    }
  });
  if (error) {
    console.error("Google sign in error:", error);
    throw error;
  }
  return data;
}

/**
 * Login with email and password
 */
export async function loginWithEmail(email, password) {
  if (!isConfigured) return;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) {
    console.error("Email login error:", error);
    throw error;
  }
  return data.user;
}

/**
 * Register with email and password
 */
export async function registerWithEmail(email, password) {
  if (!isConfigured) return;
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });
  if (error) {
    console.error("Registration error:", error);
    throw error;
  }
  return data.user;
}

/**
 * Logout
 */
export async function logout() {
  if (!isConfigured) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Signout error:", error);
    throw error;
  }
}

/**
 * Check if there is an active session
 */
export function checkCurrentUser() {
  return new Promise((resolve) => {
    if (!isConfigured) {
      resolve(null);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      resolve(user);
    }).catch(() => {
      resolve(null);
    });
  });
}

/**
 * Get fresh JWT token
 */
export async function getFreshToken() {
  if (!isConfigured) return "dummy-token-unconfigured";
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session.access_token;
}
