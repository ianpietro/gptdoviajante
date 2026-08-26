const fetch = require('node-fetch-native' in global ? global.fetch : 'node-fetch');
const { invalidateEntitlementCache } = require('./_utils');

// Eventos canônicos normalizados por plataforma
const STATUS_TO_EVENT = {
  // Positivos (liberação)
  paid:       'purchase_confirmed',
  approved:   'purchase_confirmed',
  completed:  'purchase_confirmed',
  pago:       'purchase_confirmed',
  aprovado:   'purchase_confirmed',
  sucesso:    'purchase_confirmed',
  // Negativos (revogação)
  refunded:   'purchase_refunded',
  chargedback:'purchase_refunded',
  refund:     'purchase_refunded',
  chargeback: 'purchase_refunded',
  reembolsado:'purchase_refunded',
  cancelado:  'purchase_refunded',
  recusado:   'purchase_refunded'
};

module.exports = async function handler(req, res) {
  // Webhooks são chamados servidor-a-servidor — CORS aberto apenas para OPTIONS
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // ── 1. Verificação do Token Secreto ────────────────────────────────────────
  // Aceita tanto X-Webhook-Secret (header — mais seguro, não aparece em URL logs)
  // quanto ?secret= (query string — legado, mantido durante migração)
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret) {
    const headerSecret = req.headers['x-webhook-secret'];
    const querySecret  = req.query.secret;
    const received     = headerSecret || querySecret;
    if (received !== webhookSecret) {
      console.warn('[webhook] Tentativa não autorizada — segredo incorreto ou ausente.');
      return res.status(401).json({ error: 'Acesso não autorizado.' });
    }
  } else {
    console.warn('[webhook] WEBHOOK_SECRET não configurado — rodando em modo aberto.');
  }

  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'Payload vazio.' });
  }

  // ── 2. Detecção de plataforma e extração normalizada ───────────────────────
  let email  = null;
  let status = null;
  let eventId = null; // ID de idempotência quando disponível

  if (payload.order_status !== undefined && payload.Customer !== undefined) {
    // KIWIFY
    email   = payload.Customer?.email;
    status  = payload.order_status;
    eventId = payload.order_id || payload.id;
  } else if (payload.customer !== undefined && payload.status !== undefined) {
    // KIRVANO
    email   = payload.customer?.email;
    status  = payload.status;
    eventId = payload.id || payload.transaction_id;
  } else if (payload.client !== undefined && payload.status !== undefined) {
    // GREENN
    email   = payload.client?.email;
    status  = payload.status;
    eventId = payload.id;
  } else {
    // Genérico / Simulações
    email   = payload.email || payload.buyer_email;
    status  = payload.status || payload.order_status;
    eventId = payload.id;
  }

  if (!email) {
    console.warn('[webhook] E-mail não encontrado no payload.');
    return res.status(400).json({ error: 'E-mail do comprador não encontrado no payload.' });
  }

  const cleanEmail  = email.trim().toLowerCase();
  const cleanStatus = (status || '').trim().toLowerCase();
  const canonicalEvent = STATUS_TO_EVENT[cleanStatus] || null;

  console.info(`[webhook] evento=${canonicalEvent || 'ignorado'} email=${cleanEmail} status=${cleanStatus} eventId=${eventId || 'N/A'}`);

  // ── 3. Conexão Supabase ─────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[webhook] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.');
    return res.status(500).json({ error: 'Configuração do servidor ausente.' });
  }

  // ── 4. Registro de evento (idempotência) ────────────────────────────────────
  // Registra na tabela webhook_events se existir; se não existir, apenas loga e continua.
  if (eventId && canonicalEvent) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/webhook_events`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          // Ignora se já existir (idempotência)
          'Prefer': 'resolution=ignore-duplicates'
        },
        body: JSON.stringify({
          event_id:  String(eventId),
          event_type: canonicalEvent,
          email: cleanEmail,
          processed_at: new Date().toISOString()
        })
      });
    } catch (logErr) {
      // Não bloqueia processamento se log falhar
      console.warn('[webhook] Não foi possível registrar evento de idempotência:', logErr.message);
    }
  }

  // ── 5. Aplicação de entitlement ─────────────────────────────────────────────
  try {
    if (canonicalEvent === 'purchase_confirmed') {
      const response = await fetch(`${supabaseUrl}/rest/v1/authorized_emails`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ email: cleanEmail })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase insert failed: ${response.status} ${errText}`);
      }

      // Invalida cache para que próxima chamada reflita o novo status Premium
      invalidateEntitlementCache(cleanEmail);

      console.info(`[webhook] Premium ativado para ${cleanEmail}`);
      return res.status(200).json({ status: 'sucesso', event: 'purchase_confirmed' });

    } else if (canonicalEvent === 'purchase_refunded') {
      const response = await fetch(`${supabaseUrl}/rest/v1/authorized_emails?email=eq.${encodeURIComponent(cleanEmail)}`, {
        method: 'DELETE',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase delete failed: ${response.status} ${errText}`);
      }

      invalidateEntitlementCache(cleanEmail);

      console.info(`[webhook] Premium revogado para ${cleanEmail}`);
      return res.status(200).json({ status: 'sucesso', event: 'purchase_refunded' });

    } else {
      console.info(`[webhook] Status "${cleanStatus}" ignorado — nenhuma ação necessária.`);
      return res.status(200).json({ status: 'sucesso', event: 'ignored', status_received: cleanStatus });
    }

  } catch (error) {
    console.error('[webhook] Erro ao processar pagamento:', error.message);
    return res.status(500).json({ error: 'Erro interno no processamento do webhook.' });
  }
};
