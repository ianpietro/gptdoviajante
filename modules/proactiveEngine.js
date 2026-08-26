export const PROACTIVE_RULES_VERSION = 1;

const SEVERITY_WEIGHT = { urgent: 3, attention: 2, info: 1 };
const CLOSED_STATUSES = new Set(['completed', 'archived']);

function isMeaningful(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== 'a definir' && normalized !== 'n/a';
}

function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function localToday(now, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
  } catch {
    return null;
  }
}

function dayNumber(parts) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
}

function countPacking(trip) {
  const items = Array.isArray(trip?.packing)
    ? trip.packing.flatMap(category => Array.isArray(category?.items) ? category.items : [])
    : [];
  return {
    total: items.length,
    checked: items.filter(item => typeof item === 'object' && item?.checked).length
  };
}

function hasAccommodation(trip) {
  return (Array.isArray(trip?.accommodations) && trip.accommodations.length > 0) || isMeaningful(trip?.infoHotel);
}

function hasBudget(trip) {
  if (!trip?.budget || typeof trip.budget !== 'object') return false;
  return Object.values(trip.budget).some(value => Number(value) > 0);
}

function fingerprint(ruleKey, source) {
  const raw = `${PROACTIVE_RULES_VERSION}|${ruleKey}|${source}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${ruleKey}:v${PROACTIVE_RULES_VERSION}:${(hash >>> 0).toString(36)}`;
}

function insight(ruleKey, source, details) {
  return {
    id: fingerprint(ruleKey, source),
    ruleKey,
    rulesVersion: PROACTIVE_RULES_VERSION,
    ...details
  };
}

/**
 * Detecta pendências usando apenas dados já salvos. Não consulta IA, clima,
 * status de voos ou qualquer outra fonte em tempo real.
 */
export function buildProactiveInsights(trip, options = {}) {
  if (!trip || typeof trip !== 'object' || CLOSED_STATUSES.has(trip.status)) return [];

  const now = options.now instanceof Date ? options.now : new Date();
  const timeZone = options.timeZone || trip.timezone || 'America/Sao_Paulo';
  const startDate = parseDateOnly(trip.start_date || (typeof trip.targetDate === 'string' ? trip.targetDate.slice(0, 10) : ''));
  const today = localToday(now, timeZone);
  const candidates = [];

  if (!startDate) {
    candidates.push(insight('missing_dates', 'missing', {
      severity: 'attention',
      priority: 100,
      title: 'Datas ainda não definidas',
      message: 'Defina quando a viagem começa para o CoPiloto acompanhar os próximos passos.',
      ctaLabel: 'Definir datas',
      targetTab: 'chat',
      icon: 'fa-calendar-plus'
    }));
  }

  if (!startDate || !today) return candidates;

  const daysUntilStart = dayNumber(startDate) - dayNumber(today);
  if (daysUntilStart < 0) return candidates;

  const itineraryCount = Array.isArray(trip.itinerary) ? trip.itinerary.length : 0;
  if (daysUntilStart <= 30 && itineraryCount === 0) {
    candidates.push(insight('missing_itinerary', `${trip.start_date}|0`, {
      severity: daysUntilStart <= 7 ? 'urgent' : 'attention',
      priority: 90,
      title: 'Seu roteiro ainda está vazio',
      message: daysUntilStart === 0
        ? 'A viagem começa hoje e ainda não há atividades organizadas.'
        : `Falta${daysUntilStart === 1 ? '' : 'm'} ${daysUntilStart} dia${daysUntilStart === 1 ? '' : 's'} e ainda não há atividades organizadas.`,
      ctaLabel: 'Montar roteiro',
      targetTab: 'chat',
      icon: 'fa-route'
    }));
  }

  if (daysUntilStart <= 14 && !hasAccommodation(trip)) {
    candidates.push(insight('missing_accommodation', `${trip.start_date}|missing`, {
      severity: daysUntilStart <= 3 ? 'urgent' : 'attention',
      priority: 80,
      title: 'Hospedagem não confirmada',
      message: 'Não encontrei hospedagem cadastrada. Confirme onde você vai ficar.',
      ctaLabel: 'Revisar logística',
      targetTab: 'logistica',
      icon: 'fa-hotel'
    }));
  }

  if (daysUntilStart <= 21 && !hasBudget(trip)) {
    candidates.push(insight('missing_budget', `${trip.start_date}|missing`, {
      severity: 'info',
      priority: 60,
      title: 'Orçamento ainda em branco',
      message: 'Uma estimativa simples agora ajuda a evitar surpresas durante a viagem.',
      ctaLabel: 'Planejar orçamento',
      targetTab: 'orcamento',
      icon: 'fa-wallet'
    }));
  }

  const packing = countPacking(trip);
  if (daysUntilStart <= 7 && (packing.total === 0 || packing.checked < packing.total)) {
    const source = `${trip.start_date}|${packing.checked}/${packing.total}`;
    candidates.push(insight('packing_incomplete', source, {
      severity: daysUntilStart <= 1 ? 'urgent' : 'attention',
      priority: 70,
      title: packing.total === 0 ? 'Hora de preparar a mala' : 'Sua mala ainda está incompleta',
      message: packing.total === 0
        ? 'Crie uma lista para não esquecer itens importantes.'
        : `${packing.checked} de ${packing.total} itens já estão marcados.`,
      ctaLabel: packing.total === 0 ? 'Criar checklist' : 'Continuar checklist',
      targetTab: 'mala',
      icon: 'fa-suitcase-rolling'
    }));
  }

  return candidates
    .sort((a, b) => (SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]) || (b.priority - a.priority))
    .slice(0, options.limit || 3);
}

export function filterDismissedInsights(insights, dismissedIds = []) {
  const dismissed = new Set(Array.isArray(dismissedIds) ? dismissedIds : []);
  return (Array.isArray(insights) ? insights : []).filter(item => !dismissed.has(item.id));
}

export function filterInactiveInsights(insights, state = {}, now = new Date()) {
  const dismissed = new Set(Array.isArray(state.dismissed) ? state.dismissed : []);
  const snoozed = state.snoozed && typeof state.snoozed === 'object' ? state.snoozed : {};
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  return (Array.isArray(insights) ? insights : []).filter(item => {
    if (dismissed.has(item.id)) return false;
    const snoozedUntil = Date.parse(snoozed[item.id]);
    return !Number.isFinite(snoozedUntil) || snoozedUntil <= nowMs;
  });
}

export default { buildProactiveInsights, filterDismissedInsights, filterInactiveInsights, PROACTIVE_RULES_VERSION };
