// Firebase SDK imports from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================================================
// CONFIGURAÇÃO DO FIREBASE
// ==========================================================================
// TODO: Substitua pelos dados do seu console do Firebase (Configurações do Projeto)
const firebaseConfig = {
  apiKey: "AIzaSyAGxNoGPslqs1XvRumJMz0k6IX6c5grLR4",
  authDomain: "gpt-viajante.firebaseapp.com",
  projectId: "gpt-viajante",
  storageBucket: "gpt-viajante.firebasestorage.app",
  messagingSenderId: "567296948923",
  appId: "1:567296948923:web:0b07a8119fd48202cc479e"
};

// Verificar se as credenciais ainda são placeholders
const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "SUA_API_KEY_AQUI";

let app;
let auth;
let googleProvider;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });
} else {
  console.warn("⚠️ Firebase Auth não está configurado. Insira suas credenciais em auth.js para ativar o login.");
}

/**
 * Retorna se o Firebase está configurado no cliente
 */
export function isFirebaseConfigured() {
  return isConfigured;
}

/**
 * Monitora o estado de autenticação do usuário
 * @param {Function} onUserActive Callback chamado quando o usuário está logado
 * @param {Function} onUserInactive Callback chamado quando o usuário não está logado
 */
export function setupAuthStateListener(onUserActive, onUserInactive) {
  if (!isConfigured) {
    // Se não estiver configurado, desativa login obrigatório temporariamente para testes locais
    console.info("Firebase não configurado. Ignorando tela de login.");
    onUserActive({
      displayName: "Viajante Teste",
      email: "teste@viajante.com",
      photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150"
    }, "dummy-token-unconfigured");
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const token = await user.getIdToken();
        onUserActive(user, token);
      } catch (error) {
        console.error("Erro ao obter ID Token do Firebase:", error);
        onUserInactive();
      }
    } else {
      onUserInactive();
    }
  });
}

/**
 * Efetua login com o Google (Popup)
 */
export async function loginWithGoogle() {
  if (!isConfigured) {
    alert("⚠️ Firebase não configurado em auth.js. Por favor, adicione as credenciais.");
    return;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Erro no login com Google:", error);
    throw error;
  }
}

/**
 * Efetua login com e-mail e senha
 */
export async function loginWithEmail(email, password) {
  if (!isConfigured) {
    alert("⚠️ Firebase não configurado em auth.js. Por favor, adicione as credenciais.");
    return;
  }
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Erro no login com Email/Senha:", error);
    throw error;
  }
}

/**
 * Cria uma nova conta com e-mail e senha
 */
export async function registerWithEmail(email, password) {
  if (!isConfigured) {
    alert("⚠️ Firebase não configurado em auth.js. Por favor, adicione as credenciais.");
    return;
  }
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Erro no cadastro com Email/Senha:", error);
    throw error;
  }
}

/**
 * Realiza o Logout do usuário
 */
export async function logout() {
  if (!isConfigured) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erro ao deslogar:", error);
    throw error;
  }
}

/**
 * Retorna o usuário atual de forma assíncrona, aguardando o Firebase inicializar.
 * Resolve com o objeto User se houver sessão ativa, ou null se não houver.
 * Use antes de decidir mostrar o modo de shared view.
 */
export function checkCurrentUser() {
  return new Promise((resolve) => {
    if (!isConfigured) {
      resolve(null);
      return;
    }
    // onAuthStateChanged dispara uma vez com o estado atual e depois de cada mudança.
    // Usamos unsubscribe() para transformar isso em uma Promise "one-shot".
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Retorna o ID Token atualizado do usuário ativo
 */
export async function getFreshToken() {
  if (!isConfigured) return "dummy-token-unconfigured";
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return await currentUser.getIdToken(true); // força a renovação
}
