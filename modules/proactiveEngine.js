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

  // 1. TRIP_STARTING_SOON
  if (daysUntilStart >= 0 && daysUntilStart <= 2) {
    candidates.push(insight('trip_starting_soon', `${trip.start_date}|${daysUntilStart}`, {
      severity: 'urgent',
      priority: 105,
      title: daysUntilStart === 0 ? 'Sua viagem começa hoje!' : `Sua viagem começa em ${daysUntilStart} dia(s)!`,
      message: 'Abra o Modo Hoje para acompanhar o que fazer agora.',
      ctaLabel: 'Ver Modo Hoje',
      targetTab: 'home',
      icon: 'fa-plane-departure'
    }));
  }

  // 2. UPCOMING_FLIGHT, CHECK_IN_WINDOW & LEAVE_FOR_AIRPORT
  const flights = Array.isArray(trip.flights) ? trip.flights : [];
  flights.forEach(f => {
    const flightDateStr = parseDateOnly(f.date || f.departureDate);
    if (flightDateStr && today) {
      const daysToFlight = dayNumber(flightDateStr) - dayNumber(today);
      // Upcoming flight (< 3 days)
      if (daysToFlight >= 0 && daysToFlight <= 3) {
        candidates.push(insight('upcoming_flight', `${f.flightNumber || 'voo'}|${f.date}`, {
          severity: 'attention',
          priority: 95,
          title: `Voo ${f.flightNumber || ''} se aproximando`,
          message: `Voo agendado para ${f.date} às ${f.departureTime || f.scheduledDeparture || 'horário marcado'}.`,
          ctaLabel: 'Ver logística',
          targetTab: 'logistica',
          icon: 'fa-plane'
        }));
      }

      // CHECK_IN_WINDOW (prudent window notification)
      if (daysToFlight === 0 || daysToFlight === 1) {
        candidates.push(insight('check_in_window', `${f.flightNumber || 'voo'}|checkin`, {
          severity: 'urgent',
          priority: 100,
          title: `Check-in da sua viagem (${f.flightNumber || 'Voo'})`,
          message: `O check-in pode já estar disponível. Confira o horário exato com a sua companhia aérea.`,
          ctaLabel: 'Ver passagens',
          targetTab: 'logistica',
          icon: 'fa-id-card'
        }));
      }

      // LEAVE_FOR_AIRPORT (estimation from flight time, flight type and buffer)
      if (daysToFlight === 0) {
        const depTime = f.departureTime || f.scheduledDeparture || '12:00';
        const bufferHours = f.isInternational ? 3 : 2;
        candidates.push(insight('leave_for_airport', `${f.flightNumber || 'voo'}|leave`, {
          severity: 'urgent',
          priority: 110,
          title: `Hora de sair para o aeroporto`,
          message: `Estimativa: Saia ~${bufferHours}h a ${bufferHours + 1}h antes do voo das ${depTime} (recomendação estimada).`,
          ctaLabel: 'Ver logística',
          targetTab: 'logistica',
          icon: 'fa-taxi'
        }));
      }
    }
  });

  // 3. HOTEL_CHECKIN & HOTEL_CHECKOUT
  const accommodations = Array.isArray(trip.accommodations) ? trip.accommodations : [];
  accommodations.forEach(acc => {
    const checkInStr = parseDateOnly(acc.checkInDate || acc.checkin);
    const checkOutStr = parseDateOnly(acc.checkOutDate || acc.checkout);
    if (checkInStr && today && dayNumber(checkInStr) === dayNumber(today)) {
      candidates.push(insight('hotel_checkin', `${acc.hotelName || 'hotel'}|checkin`, {
        severity: 'attention',
        priority: 85,
        title: `Check-in na Hospedagem Hoje`,
        message: `Check-in previsto em ${acc.hotelName || 'seu hotel'}.`,
        ctaLabel: 'Ver voucher',
        targetTab: 'logistica',
        icon: 'fa-key'
      }));
    }
    if (checkOutStr && today && dayNumber(checkOutStr) === dayNumber(today)) {
      candidates.push(insight('hotel_checkout', `${acc.hotelName || 'hotel'}|checkout`, {
        severity: 'attention',
        priority: 85,
        title: `Check-out da Hospedagem Hoje`,
        message: `Não se esqueça do horário de check-out em ${acc.hotelName || 'seu hotel'}.`,
        ctaLabel: 'Ver detalhes',
        targetTab: 'logistica',
        icon: 'fa-door-open'
      }));
    }
  });

  // 4. MISSING_CRITICAL_DOCUMENT
  const docs = Array.isArray(trip.documents) ? trip.documents : [];
  if (daysUntilStart <= 7 && docs.length === 0) {
    candidates.push(insight('missing_critical_document', 'docs|missing', {
      severity: 'attention',
      priority: 75,
      title: 'Nenhum documento salvo',
      message: 'Guarde seus bilhetes e vouchers na Carteira para acesso offline fácil.',
      ctaLabel: 'Adicionar documentos',
      targetTab: 'logistica',
      icon: 'fa-folder-open'
    }));
  }

  // Live Travel Signals mapping
  const liveSignals = Array.isArray(options.signals) ? options.signals : (Array.isArray(trip.live_signals) ? trip.live_signals : []);
  liveSignals.forEach(sig => {
    if (sig.type === 'FLIGHT_STATUS' && sig.status === 'delayed') {
      candidates.push(insight('signal_flight_delay', `${sig.flightNumber}|${sig.delayMinutes}`, {
        severity: 'urgent',
        priority: 110,
        title: `Voo ${sig.flightNumber} Atrasado (${sig.delayMinutes} min)`,
        message: `Seu voo teve um atraso estimado em ${sig.delayMinutes} minutos. Deseja reorganizar a programação inicial?`,
        ctaLabel: 'Reorganizar Roteiro',
        targetTab: 'replan_proposal',
        trigger: 'flight_delay',
        delayHours: Math.ceil(sig.delayMinutes / 60),
        icon: 'fa-plane-circle-exclamation'
      }));
    } else if (sig.type === 'WEATHER' && sig.condition === 'rain') {
      candidates.push(insight('signal_weather_rain', `${sig.description}`, {
        severity: 'attention',
        priority: 75,
        title: 'Previsão de Chuva no Destino',
        message: sig.description || 'Previsão de clima chuvoso. Deseja ver alternativas cobertas?',
        ctaLabel: 'Revisar Passeios',
        targetTab: 'replan_proposal',
        trigger: 'weather_incompatible',
        icon: 'fa-cloud-showers-heavy'
      }));
    }
  });

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
