const fetch = global.fetch || require('node-fetch');
const { FREE_AI_LIMIT, PREMIUM_AI_FAIR_USE_LIMIT } = require('./_aiConfig');

// Cache de acesso em memória para instâncias quentes (warm containers) do servidor
const cacheDeAcesso = new Map();
const TEMPO_CACHE_MS = 5 * 60 * 1000; // 5 minutos de cache

/**
 * Verifica o plano do usuário (free ou premium) com base na tabela authorized_emails.
 * - Qualquer usuário autenticado no Supabase → plan 'free' (allowed: true)
 * - Usuário em authorized_emails ou ALLOWED_EMAILS env → plan 'premium'
 * - Email ausente ou inválido → { allowed: false, plan: null }
 *
 * @param {string} email
 * @returns {Promise<{ allowed: boolean, plan: 'free'|'premium'|null, reason: string }>}
 */
async function checkUserEntitlement(email) {
  if (!email) return { allowed: false, plan: null, reason: 'no_email' };
  const cleanEmail = email.trim().toLowerCase();

  // 1. Admins via variável de ambiente → Premium imediato
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS;
  if (allowedEmailsEnv) {
    const allowedEmails = allowedEmailsEnv.split(',').map(e => e.trim().toLowerCase());
    if (allowedEmails.includes(cleanEmail)) {
      return { allowed: true, plan: 'premium', reason: 'env_whitelist' };
    }
  }

  // 2. Cache em memória para evitar chamadas repetidas ao Supabase
  const cacheItem = cacheDeAcesso.get(cleanEmail);
  if (cacheItem && (Date.now() - cacheItem.timestamp < TEMPO_CACHE_MS)) {
    return cacheItem.result;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';

  if (!supabaseUrl) {
    console.error('[entitlement] SUPABASE_URL não configurada.');
    if (isProduction) {
      return { allowed: false, plan: null, reason: 'config_missing_fail_closed' };
    }
    return { allowed: true, plan: 'free', reason: 'config_missing_fail_open' };
  }

  const keyToUse = serviceKey || anonKey;
  if (!keyToUse) {
    console.error('[entitlement] Chave Supabase ausente.');
    if (isProduction) {
      return { allowed: false, plan: null, reason: 'config_missing_fail_closed' };
    }
    return { allowed: true, plan: 'free', reason: 'config_missing_fail_open' };
  }

  try {
    // 3. Verifica se está em authorized_emails → Premium
    const fetchUrl = `${supabaseUrl}/rest/v1/authorized_emails?email=eq.${encodeURIComponent(cleanEmail)}&select=email`;
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'apikey': keyToUse,
        'Authorization': `Bearer ${keyToUse}`
      }
    });

    let isPremium = false;
    if (response.ok) {
      const data = await response.json();
      isPremium = Array.isArray(data) && data.length > 0;
    } else {
      const errText = await response.text();
      console.error(`[entitlement] PostgREST error ${response.status}:`, errText);
      if (isProduction) {
        return { allowed: false, plan: null, reason: 'database_query_failed_fail_closed' };
      }
    }

    const result = {
      allowed: true,
      plan: isPremium ? 'premium' : 'free',
      reason: isPremium ? 'authorized_emails' : 'authenticated_user'
    };

    // Salva no cache
    cacheDeAcesso.set(cleanEmail, { result, timestamp: Date.now() });
    return result;

  } catch (err) {
    console.error('[entitlement] Exceção ao verificar entitlement:', err.message);
    if (isProduction) {
      return { allowed: false, plan: null, reason: 'error_fail_closed' };
    }
    return { allowed: true, plan: 'free', reason: 'error_fail_open' };
  }
}

/**
 * Verifica o limite de cota de mensagens da IA do usuário para uma viagem específica no backend.
 * - Free: 40 mensagens
 * - Premium: 500 mensagens (Fair Use)
 *
 * @param {string} email
 * @param {string} userId
 * @param {string} tripId
 * @returns {Promise<{ allowed: boolean, plan: 'free'|'premium', messagesUsed: number, limit: number, reason: string }>}
 */
async function checkAIEntitlement(email, userId, tripId) {
  const entitlement = await checkUserEntitlement(email);
  if (!entitlement.allowed) {
    return { allowed: false, plan: null, messagesUsed: 0, limit: 0, reason: 'unauthorized_email' };
  }

  const isPremium = entitlement.plan === 'premium';
  const limit = isPremium ? PREMIUM_AI_FAIR_USE_LIMIT : FREE_AI_LIMIT;

  // Realiza a reserva atômica no banco de dados para evitar race condition
  const reservation = await reserveAIUsage(userId, tripId, limit);
  return {
    allowed: reservation.allowed,
    plan: entitlement.plan,
    messagesUsed: reservation.messagesUsed,
    limit: reservation.limit,
    reason: reservation.reason
  };
}

/**
 * Efetua a reserva atômica de 1 uso da IA via RPC com Row Lock (FOR UPDATE)
 */
async function reserveAIUsage(userId, tripId, limit) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';

  if (!supabaseUrl || !serviceKey) {
    console.warn('[ai_entitlement] Supabase config missing.');
    if (isProduction) {
      return { allowed: false, messagesUsed: 0, limit, reason: 'supabase_config_missing_fail_closed' };
    }
    return { allowed: true, messagesUsed: 0, limit, reason: 'supabase_config_missing_fail_open' };
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_ai_usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_trip_id: tripId,
        p_limit: limit
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          allowed: data[0].allowed,
          messagesUsed: data[0].messages_used,
          limit: data[0].max_limit,
          reason: data[0].allowed ? 'under_limit' : 'limit_exceeded'
        };
      }
    }

    const errText = await response.text();
    console.error('[reserveAIUsage] PostgREST RPC error:', response.status, errText);
    if (isProduction) {
      return { allowed: false, messagesUsed: 0, limit, reason: 'postgrest_error_fail_closed' };
    }
    return { allowed: true, messagesUsed: 0, limit, reason: 'postgrest_error_fail_open' };

  } catch (err) {
    console.error('[reserveAIUsage] Exception:', err.message);
    if (isProduction) {
      return { allowed: false, messagesUsed: 0, limit, reason: 'exception_fail_closed' };
    }
    return { allowed: true, messagesUsed: 0, limit, reason: 'exception_fail_open' };
  }
}

/**
 * Restaura/Estorna uma unidade de uso caso a chamada Gemini falhe (Operação segura e idempotente)
 */
async function refundAIUsage(userId, tripId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) return 0;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/refund_ai_usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_trip_id: tripId
      })
    });

    if (response.ok) {
      const data = await response.json();
      return typeof data === 'number' ? data : 0;
    }
    return 0;
  } catch (err) {
    console.error('[refundAIUsage] Exception:', err.message);
    return 0;
  }
}

/**
 * Verifica o rate limit distribuído no banco por IP
 * Retorna true se bloqueado (excedeu), false se permitido
 */
async function checkDatabaseRateLimit(ip) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';

  if (!supabaseUrl || !serviceKey) {
    return isProduction; // Fail closed em prod, fail open em dev
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        p_ip: ip,
        p_max_req: 15,
        p_window_seconds: 60
      })
    });

    if (response.ok) {
      const isLimitReached = await response.json();
      return !!isLimitReached;
    }
    return isProduction; // Fail closed em prod se der erro no PostgREST
  } catch (err) {
    console.error('[checkDatabaseRateLimit] Exception:', err.message);
    return isProduction;
  }
}

async function checkTripOwnership(userId, tripId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !userId || !tripId) return false;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/trips?id=eq.${encodeURIComponent(tripId)}&user_id=eq.${encodeURIComponent(userId)}&select=id`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' }
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Array.isArray(data) && data.length === 1;
  } catch (error) {
    console.error('[trip-access] Exception:', error.message);
    return false;
  }
}

async function getAIHistorySummary(userId, tripId, chatType) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  try {
    const url = `${supabaseUrl}/rest/v1/ai_chat_summaries?user_id=eq.${encodeURIComponent(userId)}&trip_id=eq.${encodeURIComponent(tripId)}&chat_type=eq.${encodeURIComponent(chatType)}&select=summary_text,summarized_message_count,source_prefix_hash,revision`;
    const response = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!response.ok) return null;
    const data = await response.json();
    const row = Array.isArray(data) ? data[0] : null;
    return row ? { summaryText: row.summary_text, summarizedMessageCount: row.summarized_message_count,
      sourcePrefixHash: row.source_prefix_hash, revision: row.revision } : null;
  } catch (error) {
    console.warn('[ai-history] Falha ao carregar resumo:', error.message);
    return null;
  }
}

async function saveAIHistorySummary(userId, tripId, chatType, state) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !state) return false;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/save_ai_chat_summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ p_user_id: userId, p_trip_id: tripId, p_chat_type: chatType,
        p_expected_revision: state.revision || 0, p_summary_text: state.summaryText || '',
        p_summarized_message_count: state.summarizedMessageCount || 0, p_source_prefix_hash: state.sourcePrefixHash || null })
    });
    return response.ok && Boolean(await response.json());
  } catch (error) {
    console.warn('[ai-history] Falha ao persistir resumo:', error.message);
    return false;
  }
}

/**
 * Gerencia a lógica estrita e segura de CORS por ambiente.
 */
function handleCors(req, res) {
  const rawOrigin = req.headers && req.headers.origin;
  const origin = rawOrigin ? rawOrigin.toLowerCase().trim() : null;
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host) || '').toLowerCase().trim();
  const isProd = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';

  // 1. Origens permitidas padrão (Domínio do app em produção + domínios padrão + localhost)
  const defaultAllowed = [
    'https://orbia-gilt-xi.vercel.app',
    'https://copilotodeviagem.com.br',
    'https://www.copilotodeviagem.com.br',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5500'
  ];

  // 2. Origens adicionais configuradas em variáveis de ambiente
  const envOrigins = [
    process.env.ALLOWED_ORIGINS,
    process.env.ALLOWED_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  ].filter(Boolean);

  const extraAllowed = [];
  for (const envVal of envOrigins) {
    for (const item of String(envVal).split(',')) {
      const trimmed = item.trim().toLowerCase();
      if (trimmed) {
        extraAllowed.push(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      }
    }
  }

  const allowedOrigins = Array.from(new Set([...defaultAllowed, ...extraAllowed]));

  // 3. Validação da origem da requisição
  let targetOrigin = null;

  if (origin) {
    let hostname = '';
    try {
      hostname = new URL(origin).hostname;
    } catch (_) {}

    if (allowedOrigins.includes(origin)) {
      targetOrigin = rawOrigin;
    } else if (hostname && (hostname.endsWith('.vercel.app') || hostname.endsWith('-ianpietros-projects.vercel.app'))) {
      targetOrigin = rawOrigin;
    } else if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
      targetOrigin = rawOrigin;
    } else if (!isProd) {
      targetOrigin = rawOrigin;
    }
  } else {
    // Requisição Same-Origin (sem header Origin explícito)
    targetOrigin = host ? `https://${host}` : 'https://orbia-gilt-xi.vercel.app';
  }

  // 4. Se não autorizada, bloqueia e registra aviso
  if (!targetOrigin) {
    console.warn(`[CORS] Acesso bloqueado. Origem não autorizada: ${origin || 'N/A'}`);
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret, X-Requested-With');
    return false;
  }

  // 5. Aplicar headers autorizados
  res.setHeader('Access-Control-Allow-Origin', targetOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  return true;
}

/**
 * @deprecated Use checkUserEntitlement(email) em vez disso.
 */
async function checkUserAccess(email) {
  const result = await checkUserEntitlement(email);
  return result.allowed;
}

/**
 * Invalida o cache de entitlement para um email específico.
 */
function invalidateEntitlementCache(email) {
  if (!email) return;
  cacheDeAcesso.delete(email.trim().toLowerCase());
}

module.exports = {
  checkUserEntitlement,
  checkAIEntitlement,
  reserveAIUsage,
  refundAIUsage,
  checkDatabaseRateLimit,
  checkTripOwnership,
  getAIHistorySummary,
  saveAIHistorySummary,
  handleCors,
  checkUserAccess,
  invalidateEntitlementCache
};
