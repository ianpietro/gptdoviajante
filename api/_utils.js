const fetch = require('node-fetch-native' in global ? global.fetch : 'node-fetch');

// Cache de acesso em memória para instâncias quentes (warm containers) do servidor
const cacheDeAcesso = new Map();
const TEMPO_CACHE_MS = 5 * 60 * 1000; // 5 minutos de cache

/**
 * Verifica se o e-mail do usuário está autorizado via variável de ambiente (whitelist) ou na tabela authorized_emails do Supabase.
 * @param {string} email 
 * @returns {Promise<boolean>}
 */
async function checkUserAccess(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();

  // 1. Whitelist em variável de ambiente (bypass de administrador)
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS;
  if (allowedEmailsEnv) {
    const allowedEmails = allowedEmailsEnv.split(",").map(e => e.trim().toLowerCase());
    if (allowedEmails.includes(cleanEmail)) {
      return true;
    }
  }

  // 2. Consulta o cache em memória para evitar conexões repetidas ao Supabase
  const cacheItem = cacheDeAcesso.get(cleanEmail);
  if (cacheItem && (Date.now() - cacheItem.timestamp < TEMPO_CACHE_MS)) {
    return cacheItem.authorized;
  }

  // 3. Consulta a tabela public.authorized_emails no Supabase via PostgREST
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error("Erro: SUPABASE_URL não está configurada.");
    return false;
  }

  const keyToUse = serviceKey || anonKey;
  if (!keyToUse) {
    console.error("Erro: Chaves de API do Supabase não estão configuradas.");
    return false;
  }

  try {
    const fetchUrl = `${supabaseUrl}/rest/v1/authorized_emails?email=eq.${encodeURIComponent(cleanEmail)}&select=email`;
    const response = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        "apikey": keyToUse,
        "Authorization": `Bearer ${keyToUse}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Erro no PostgREST ao verificar e-mail: ${response.status}`, errText);
      return false;
    }

    const data = await response.json();
    const authorized = Array.isArray(data) && data.length > 0;

    // Salva o resultado no cache temporário
    cacheDeAcesso.set(cleanEmail, {
      authorized,
      timestamp: Date.now()
    });

    return authorized;
  } catch (err) {
    console.error("Exceção ao verificar acesso do usuário:", err);
    return false;
  }
}

module.exports = {
  checkUserAccess
};
