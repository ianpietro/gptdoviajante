/**
 * analytics.js — Taxonomia central de eventos do CoPiloto de Viagem
 *
 * Princípios:
 * - Nunca logar: PDF, passaporte, localizador de reserva, conteúdo de chat,
 *   email em texto puro quando desnecessário, tokens JWT, senhas.
 * - Usar session_id anônimo (UUID local sem PII).
 * - Em desenvolvimento: console.log apenas.
 * - Em produção: pronto para enviar a um endpoint /api/analytics (opcional).
 */

// ── Eventos válidos (taxonomia única) ────────────────────────────────────────
export const EVENTS = {
  // Aquisição
  LANDING_VIEW:           'landing_view',
  CTA_START_TRIP:         'cta_start_trip',
  // Viagem
  TRIP_CREATED:           'trip_created',
  TRIP_ARCHIVED:          'trip_archived',
  TRIP_STARTED:           'trip_started',
  TRIP_COMPLETED:         'trip_completed',
  // Importação
  DOCUMENT_IMPORTED:      'document_imported',
  DOCUMENT_IMPORT_FAILED: 'document_import_failed',
  // IA
  TRIP_PLAN_GENERATED:    'trip_plan_generated',
  TRIP_BRAIN_ACTION:      'trip_brain_action',
  AI_MESSAGE_SENT:        'ai_message_sent',
  // Progresso
  READINESS_PROGRESS:     'readiness_progress',
  // Parceiros
  PARTNER_IMPRESSION:     'partner_impression',
  PARTNER_CLICK:          'partner_click',
  // Monetização
  PAYWALL_VIEW:           'paywall_view',
  CHECKOUT_STARTED:       'checkout_started',
  PURCHASE_CONFIRMED:     'purchase_confirmed',
  // Offline
  OFFLINE_DOCUMENT_CACHED: 'offline_document_cached',
  OFFLINE_DOCUMENT_OPENED: 'offline_document_opened',
  OFFLINE_DOCUMENT_UNAVAILABLE: 'offline_document_unavailable',
  // IA Server-side Limits
  AI_LIMIT_REACHED:       'ai_limit_reached',
  AI_RATE_LIMITED:        'ai_rate_limited',
  // Compartilhamento
  SHARE_CREATED:          'share_created',
  SHARE_SETTINGS_UPDATED: 'share_settings_updated',
  SHARED_TRIP_VIEWED:     'shared_trip_viewed',
  // Funil
  FIRST_VALUE:            'first_value', // roteiro criado, documento importado, viagem estruturada
  RETURN_VISIT:           'return_visit',
  FREE_TO_PREMIUM:        'free_to_premium',
};

// ── Campos bloqueados de PII ──────────────────────────────────────────────────
const BLOCKED_KEYS = ['passport', 'passaporte', 'localizador', 'email', 'password', 'token', 'chat_content', 'pdf'];

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    if (BLOCKED_KEYS.some(blocked => lowerKey.includes(blocked))) {
      sanitized[key] = '[redacted]';
    } else if (typeof value === 'string' && value.includes('@')) {
      // Redacta emails inline em valores string
      sanitized[key] = '[redacted_email]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ── Session ID anônimo ────────────────────────────────────────────────────────
function getOrCreateSessionId() {
  const key = '_agy_sid';
  let sid = sessionStorage.getItem(key);
  if (!sid) {
    sid = 'sid_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(key, sid);
  }
  return sid;
}

// ── Detector de ambiente ──────────────────────────────────────────────────────
const IS_DEV = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// ── Função principal de rastreamento ─────────────────────────────────────────
/**
 * Rastreia um evento de analytics.
 * @param {string} eventName - Um dos valores de EVENTS
 * @param {Object} [payload] - Dados adicionais (sem PII)
 */
export function track(eventName, payload = {}) {
  if (typeof window === 'undefined') return; // Guard SSR/Node

  const sanitized = sanitizePayload(payload);

  const event = {
    event:      eventName,
    session_id: getOrCreateSessionId(),
    timestamp:  new Date().toISOString(),
    app_version: (typeof window !== 'undefined' && window.APP_VERSION) || 'unknown',
    env:        IS_DEV ? 'development' : 'production',
    ...sanitized
  };

  if (IS_DEV) {
    console.log('[analytics]', eventName, event);
    return;
  }

  // Em produção: enviar para endpoint (fire-and-forget, sem bloquear UI)
  // Descomentar quando /api/analytics estiver implementado:
  // fetch('/api/analytics', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(event),
  //   keepalive: true
  // }).catch(() => {}); // Silencia erros — analytics nunca deve quebrar o app
}

// ── Funil Helper ─────────────────────────────────────────────────────────────
/**
 * Registra um evento de "Primeiro Valor" — momento em que o produto
 * entrega valor real e mensurável ao usuário.
 * @param {'itinerary_created'|'document_imported'|'trip_structured'} trigger
 */
export function trackFirstValue(trigger) {
  track(EVENTS.FIRST_VALUE, { trigger });
}

export default { track, trackFirstValue, EVENTS };
