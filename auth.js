import { SUPABASE_URL, SUPABASE_ANON_KEY, BYPASS_LOGIN } from './config.js';

let createClientFunc = () => ({
  from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  }
});

if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
  createClientFunc = window.supabase.createClient;
}

// Initialize Supabase client safely
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY && typeof createClientFunc === 'function')
  ? createClientFunc(SUPABASE_URL, SUPABASE_ANON_KEY)
  : createClientFunc('https://dummy.supabase.co', 'dummy-key');

const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export function isAuthConfigured() {
  return isConfigured;
}
export const isFirebaseConfigured = isAuthConfigured;

export function setupAuthStateListener(onUserActive, onUserInactive) {
  if (BYPASS_LOGIN || !isConfigured) {
    console.info("Bypassing login.");
    queueMicrotask(() => onUserActive({
      id: "dummy-user-id",
      email: "teste@viajante.com",
      plan: "premium",
      user_metadata: {
        full_name: "Viajante Teste",
        avatar_url: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150"
      }
    }, "dummy-token-unconfigured"));
    return;
  }

  try {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        onUserActive(session.user, session.access_token);
      } else {
        onUserInactive();
      }
    }).catch(() => onUserInactive());

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        onUserActive(session.user, session.access_token);
      } else {
        onUserInactive();
      }
    });

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  } catch (e) {
    console.warn("Auth listener fallback:", e);
    onUserInactive();
  }
}

export async function checkCurrentUser() {
  if (BYPASS_LOGIN || !isConfigured) {
    return {
      user: {
        id: "dummy-user-id",
        email: "teste@viajante.com",
        plan: "premium",
        user_metadata: { full_name: "Viajante Teste" }
      },
      token: "dummy-token"
    };
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { user: null, token: null };
    return { user: session.user, token: session.access_token };
  } catch (e) {
    return { user: null, token: null };
  }
}

export async function loginWithGoogle() {
  if (!isConfigured) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: new URL('/app', window.location.origin).toString() }
  });
  if (error) throw error;
  return data;
}

export async function loginWithEmail(email, password) {
  if (!isConfigured) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function registerWithEmail(email, password, fullName = '') {
  if (!isConfigured) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data.user;
}

export async function logout() {
  if (BYPASS_LOGIN || !isConfigured) {
    window.location.reload();
    return;
  }
  await supabase.auth.signOut();
  window.location.reload();
}

export async function getFreshToken() {
  if (BYPASS_LOGIN || !isConfigured) return "dummy-token";
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? session.access_token : null;
  } catch (e) {
    return null;
  }
}
