import { enrichItineraryWithCalendar } from './calendarEngine.js';

export const CURRENT_STATE_VERSION = 3;

function toNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function formatDisplayDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value || '');
}

const TRANSPORT_RESERVATION_TYPES = new Set([
  'Passagem Aérea', 'flight',
  'Transporte — Ônibus', 'Transporte — Trem', 'Transporte — Carro próprio',
  'Transporte — Carro alugado', 'Transporte — Transfer / Táxi / App',
  'Transporte — Táxi / Aplicativo', 'Transporte — Transporte público', 'Transporte — Transfer',
  'Transporte — Barco / Navio', 'Transporte — Outro'
]);

export function isTransportReservation(reservation) {
  if (!reservation || typeof reservation !== 'object') return false;
  return Boolean(
    reservation.transport_mode ||
    TRANSPORT_RESERVATION_TYPES.has(reservation.type) ||
    String(reservation.type || '').startsWith('Transporte — ')
  );
}

function getPrimaryTransport(tripData) {
  if (tripData?.transportPlan?.local?.mode) return tripData.transportPlan.local;
  if (tripData?.transportPlan?.arrival?.mode) return tripData.transportPlan.arrival;
  if (tripData?.primaryTransport?.mode) return tripData.primaryTransport;
  const reservation = (tripData?.reservations || []).find(isTransportReservation);
  if (!reservation) return null;
  return {
    mode: reservation.transport_mode || (reservation.type === 'Passagem Aérea' ? 'flight' : 'transport'),
    label: String(reservation.type || 'Transporte').replace('Transporte — ', ''),
    title: reservation.title || reservation.name || 'Transporte confirmado',
    origin: reservation.origin || '',
    destination: reservation.destination || ''
  };
}

export function isAccommodationItem(item) {
  if (!item || typeof item !== 'object') return false;
  const t = String(item.type || '').toLowerCase();
  const c = String(item.category || '').toLowerCase();
  const title = String(item.title || item.name || '').toLowerCase();
  if (t === 'hospedagem' || c === 'hospedagem' || t === 'accommodation' || c === 'accommodation' || t === 'hotel' || c === 'hotel') return true;
  return /hospedagem|hotel|pousada|hostel|airbnb|flat|resort|acomodação|acomodacao/i.test(t) ||
         /hospedagem|hotel|pousada|hostel|airbnb|flat|resort|acomodação|acomodacao/i.test(c) ||
         /hospedagem|hotel|pousada|hostel|airbnb|flat|resort|acomodação|acomodacao/i.test(title);
}

export function getPrimaryAccommodation(tripData) {
  if (!tripData || typeof tripData !== 'object') return null;
  if (Array.isArray(tripData.accommodations) && tripData.accommodations.length > 0) return tripData.accommodations[0];
  if (tripData.infoHotel && tripData.infoHotel !== 'A definir' && tripData.infoHotel !== 'Não definido' && tripData.infoHotel.trim() !== '') {
    return { name: tripData.infoHotel, title: tripData.infoHotel };
  }
  const res = (tripData.reservations || []).find(isAccommodationItem);
  if (res) return res;
  const doc = (tripData.documents || []).find(isAccommodationItem);
  if (doc) return doc;
  return null;
}

export function normalizeTripState(trip) {
  if (!trip || typeof trip !== 'object') {
    trip = {};
  }
  
  // Clone to avoid side effects
  const normalized = { ...trip };
  
  // Default values mapping
  const defaults = {
    tripTitle: "Minha Próxima Viagem",
    tripSubtitle: "Planeje sua viagem conversando pelo chat!",
    infoDates: "A definir",
    infoWeather: "A definir",
    infoGroup: "A definir",
    infoHotel: "A definir",
    hotelLink: "",
    targetDate: null,
    budgetAnalysis: "",
    packing: [],
    itinerary: [],
    flights: [],
    members: ["Você"],
    expenses: [],
    documents: [],
    // New structures proposed
    destinations: [],
    travelers: [],
    accommodations: [],
    reservations: [],
    primaryTransport: null,
    transportPlan: { arrival: null, local: null, local_modes: [], departure: null, segments: [] },
    timezone: "America/Sao_Paulo",
    preferences: { pace: "moderate", interests: [], dietary_restrictions: [] },
    readiness: { packing_percentage: 0, checklist_todo_count: 0, has_missing_documents: false },
    partner_opportunities: [],
    ai_context: { notes_summary: "", custom_instructions: "" },
    activity_log: [],
    // Defaults seguros para compartilhamento
    sharing: {
      enabled: false,
      itinerary: true,
      reservations: true,
      flights: true,
      accommodations: true,
      budget: false,
      expenses: false,
      members: false,
      packing: false,
      documents: false
    },
    attribution: { is_cloned: false, source_itinerary_id: null, source_creator: null, cloned_at: null }
  };

  // Inject defaults if properties are missing or undefined
  Object.keys(defaults).forEach(key => {
    if (normalized[key] === undefined || normalized[key] === null) {
      normalized[key] = JSON.parse(JSON.stringify(defaults[key]));
    }
  });

  ['packing', 'itinerary', 'flights', 'members', 'expenses', 'documents', 'destinations', 'travelers', 'accommodations', 'reservations', 'partner_opportunities', 'activity_log'].forEach(key => {
    if (!Array.isArray(normalized[key])) normalized[key] = JSON.parse(JSON.stringify(defaults[key]));
  });

  // Ensure sharing object has all keys populated even if loaded from older trip data
  if (!normalized.sharing || typeof normalized.sharing !== 'object') {
    normalized.sharing = { ...defaults.sharing };
  } else {
    normalized.sharing = {
      enabled: normalized.sharing.enabled !== undefined ? normalized.sharing.enabled : false,
      itinerary: normalized.sharing.itinerary !== undefined ? normalized.sharing.itinerary : true,
      reservations: normalized.sharing.reservations !== undefined ? normalized.sharing.reservations : true,
      flights: normalized.sharing.flights !== undefined ? normalized.sharing.flights : true,
      accommodations: normalized.sharing.accommodations !== undefined ? normalized.sharing.accommodations : true,
      budget: !!normalized.sharing.budget,
      expenses: !!normalized.sharing.expenses,
      members: !!normalized.sharing.members,
      packing: !!normalized.sharing.packing,
      documents: false // Sempre false por privacidade
    };
  }

  // Ensure budget object is fully initialized
  if (!normalized.budget || typeof normalized.budget !== 'object') {
    normalized.budget = { hospedagem: 0, alimentacao: 0, passeios: 0, compras: 0 };
  } else {
    normalized.budget = {
      hospedagem: toNonNegativeNumber(normalized.budget.hospedagem),
      alimentacao: toNonNegativeNumber(normalized.budget.alimentacao),
      passeios: toNonNegativeNumber(normalized.budget.passeios),
      compras: toNonNegativeNumber(normalized.budget.compras)
    };
  }

  // Ensure budgetThresholds is fully initialized
  if (!normalized.budgetThresholds || typeof normalized.budgetThresholds !== 'object') {
    normalized.budgetThresholds = { economico: 150, intermediario: 450 };
  } else {
    normalized.budgetThresholds = {
      economico: toNonNegativeNumber(normalized.budgetThresholds.economico, 150) || 150,
      intermediario: toNonNegativeNumber(normalized.budgetThresholds.intermediario, 450) || 450
    };
  }

  // Normalize packing list to structured objects { name, checked }
  if (normalized.packing && Array.isArray(normalized.packing)) {
    normalized.packing = normalized.packing.map(cat => {
      if (cat && typeof cat === 'object') {
        const items = Array.isArray(cat.items) ? cat.items.map(item => {
          if (typeof item === 'string') {
            return { name: item, checked: false };
          } else if (item && typeof item === 'object') {
            return {
              name: item.name || item.text || '',
              checked: !!item.checked
            };
          }
          return { name: '', checked: false };
        }) : [];
        return { ...cat, category: toText(cat.category, 'Geral'), items };
      }
      return { category: 'Geral', items: [] };
    });
  }

  normalized.members = [...new Set(normalized.members
    .map(member => toText(member).trim())
    .filter(Boolean))];
  if (!normalized.members.includes('Você')) normalized.members.unshift('Você');

  normalized.expenses = normalized.expenses
    .filter(expense => expense && typeof expense === 'object')
    .map(expense => {
      const payer = toText(expense.payer, 'Você').trim() || 'Você';
      const participants = Array.isArray(expense.participants)
        ? [...new Set(expense.participants.map(person => toText(person).trim()).filter(Boolean))]
        : [];
      const safeParticipants = participants.length > 0 ? participants : [payer];
      const customShares = expense.customShares && typeof expense.customShares === 'object'
        ? Object.fromEntries(Object.entries(expense.customShares).map(([person, share]) => [toText(person), toNonNegativeNumber(share)]))
        : null;
      return {
        ...expense,
        desc: toText(expense.desc, 'Despesa sem descrição'),
        amount: toNonNegativeNumber(expense.amount),
        payer,
        participants: safeParticipants,
        date: toText(expense.date),
        customShares
      };
    });

  normalized.flights = normalized.flights.filter(item => item && typeof item === 'object');
  normalized.documents = normalized.documents.filter(item => item && typeof item === 'object');
  normalized.reservations = normalized.reservations.filter(item => item && typeof item === 'object');
  normalized.accommodations = normalized.accommodations.filter(item => item && typeof item === 'object');

  // Auto-sync accommodations from reservations or documents if accommodations array is empty
  if (normalized.accommodations.length === 0) {
    const accItem = (normalized.reservations || []).find(isAccommodationItem) || (normalized.documents || []).find(isAccommodationItem);
    if (accItem) {
      const accName = accItem.title || accItem.name || accItem.provider || 'Hospedagem confirmada';
      normalized.accommodations.push({
        id: accItem.id || `acc_${Date.now()}`,
        name: accName,
        address: accItem.address || accItem.location || '',
        checkIn: accItem.date || accItem.checkIn || accItem.start_datetime || normalized.start_date || '',
        checkOut: accItem.checkOut || accItem.end_datetime || normalized.end_date || '',
        source: 'carteira'
      });
      if (!normalized.infoHotel || normalized.infoHotel === 'A definir' || normalized.infoHotel === 'Não definido') {
        normalized.infoHotel = accName;
      }
    }
  }

  normalized.itinerary = normalized.itinerary
    .filter(day => day && typeof day === 'object')
    .map((day, dayIndex) => ({
      ...day,
      dayNum: Number(day.dayNum) || dayIndex + 1,
      dayTitle: toText(day.dayTitle),
      dayStory: toText(day.dayStory || day.day_story),
      highlight: toText(day.highlight),
      localSecret: toText(day.localSecret || day.local_secret),
      logistics: toText(day.logistics || day.logistica),
      climate_plan: toText(day.climate_plan || day.climatePlan),
      city: toText(day.city),
      activities: Array.isArray(day.activities)
        ? day.activities.filter(activity => activity && typeof activity === 'object').map(activity => ({
            ...activity,
            time: toText(activity.time, '--:--'),
            title: toText(activity.title),
            desc: toText(activity.desc)
          }))
        : []
    }));

  // Logical fallbacks
  if (!normalized.destination) {
    normalized.destination = normalized.tripTitle || "A definir";
  }
  const normalizedDestination = toText(normalized.destination).trim().replace(/^viagem\s+(?:para|a|em)\s+/i, '');
  const destinationLooksLikeActivity = /^(?:um|uma|algum|alguma)?\s*(?:show|concerto|festival|teatro|pe[cç]a|stand.?up|restaurante|bar|caf[eé]|museu|passeio|compras?|shopping|jogo|evento)\b/i.test(normalizedDestination);
  if (normalizedDestination && normalizedDestination !== 'A definir' && normalizedDestination !== 'Minha Próxima Viagem' && !destinationLooksLikeActivity) {
    normalized.tripTitle = `Viagem para ${normalizedDestination}`;
  }
  if (!normalized.start_date) {
    normalized.start_date = normalized.targetDate ? normalized.targetDate.split('T')[0] : null;
  }
  if (!normalized.end_date) {
    normalized.end_date = null;
  }
  if (normalized.start_date) {
    normalized.infoDates = `${formatDisplayDate(normalized.start_date)}${normalized.end_date ? ` a ${formatDisplayDate(normalized.end_date)}` : ''}`;
    normalized.itinerary = enrichItineraryWithCalendar(normalized.itinerary, normalized.start_date, normalized.end_date);
    normalized.tripCalendar = normalized.itinerary.map(day => ({
      dayNum: day.dayNum, dateISO: day.dateISO, date: day.date, dateLabel: day.dateLabel, weekday: day.weekday
    }));
  }
  if (!normalized.status) {
    normalized.status = "planning";
  }

  // Update schema version flag
  normalized.stateSchemaVersion = CURRENT_STATE_VERSION;

  return normalized;
}

export function getSuggestedTripStatus(startDateStr, endDateStr, currentStatus) {
  if (currentStatus === 'archived') {
    return 'archived';
  }
  
  if (!startDateStr) {
    return 'planning';
  }

  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dateStr);
  };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const start = parseLocalDate(startDateStr);
  if (!start || isNaN(start.getTime())) {
    return 'planning';
  }
  start.setHours(0, 0, 0, 0);
  
  if (today < start) {
    return 'upcoming';
  }
  
  if (!endDateStr) {
    const diffTime = Math.abs(today - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7 ? 'active' : 'completed';
  }
  
  const end = parseLocalDate(endDateStr);
  if (!end || isNaN(end.getTime())) {
    return today >= start ? 'active' : 'upcoming';
  }
  end.setHours(23, 59, 59, 999);
  
  if (today >= start && today <= end) {
    return 'active';
  }
  
  if (today > end) {
    return 'completed';
  }
  
  return 'planning';
}

export function recalculateTripContext(oldTrip, newTrip) {
  if (!newTrip) return newTrip;
  const oldState = oldTrip || {};
  const changedFields = [];

  if (oldState.destination !== newTrip.destination) changedFields.push('destino');
  if (oldState.start_date !== newTrip.start_date || oldState.end_date !== newTrip.end_date) changedFields.push('datas');
  if (oldState.infoHotel !== newTrip.infoHotel || JSON.stringify(oldState.accommodations) !== JSON.stringify(newTrip.accommodations)) changedFields.push('hospedagem');
  if (JSON.stringify(oldState.members) !== JSON.stringify(newTrip.members)) changedFields.push('viajantes');
  if (JSON.stringify(oldState.budget) !== JSON.stringify(newTrip.budget)) changedFields.push('orçamento');

  if (changedFields.length === 0) {
    newTrip.readiness = calculateReadinessScore(newTrip);
    return newTrip;
  }

  // 1. Clima
  if (changedFields.includes('destino') || changedFields.includes('datas')) {
    if (newTrip.destination && newTrip.destination !== 'A definir') {
      newTrip.infoWeather = `Clima previsto para ${newTrip.destination}`;
    }
  }

  // 2. Mala — Preservar itens manuais/marcados
  if (changedFields.includes('destino') || changedFields.includes('datas') || changedFields.includes('viajantes')) {
    const existingPacking = Array.isArray(oldState.packing) ? oldState.packing : [];
    const manualItems = [];
    existingPacking.forEach(cat => {
      if (cat && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          if (item && (item.checked || item.manual || item.isUserCreated)) {
            manualItems.push(item);
          }
        });
      }
    });

    if (manualItems.length > 0) {
      newTrip.packing = newTrip.packing || [];
      let manualCat = newTrip.packing.find(c => c.category === 'Meus Itens Manuais');
      if (!manualCat) {
        manualCat = { category: 'Meus Itens Manuais', items: [] };
        newTrip.packing.unshift(manualCat);
      }
      manualItems.forEach(mi => {
        if (!manualCat.items.some(i => i.name === mi.name)) {
          manualCat.items.push(mi);
        }
      });
    }
  }

  // 3. Logística & Status
  if (newTrip.start_date) {
    const startFmt = formatDisplayDate(newTrip.start_date);
    const endFmt = newTrip.end_date ? ` a ${formatDisplayDate(newTrip.end_date)}` : '';
    newTrip.infoDates = `${startFmt}${endFmt}`;
  }
  if (Array.isArray(newTrip.members) && newTrip.members.length > 0) {
    newTrip.infoGroup = newTrip.members.length === 1 ? '1 viajante' : `${newTrip.members.length} viajantes`;
  }
  newTrip.status = getSuggestedTripStatus(newTrip.start_date, newTrip.end_date, newTrip.status);

  // 4. Readiness Score
  newTrip.readiness = calculateReadinessScore(newTrip);

  // 5. Aviso contextual
  newTrip.recalculationNotice = {
    triggered: true,
    message: `Contexto recalculado para (${changedFields.join(', ')}). Clima, mala e modo Hoje atualizados. Itens manuais preservados.`,
    changedFields
  };

  return newTrip;
}

export function validateDiningOptions(diningInput) {
  const genericPatterns = [
    /restaurante\s+t[íi]pico/i,
    /caf[ée]\s+local/i,
    /restaurante\s+local/i,
    /comida\s+t[íi]pica\s+local/i,
    /restaurante\s+da\s+cidade/i,
    /caf[ée]\s+do\s+centro/i,
    /bar\s+gen[ée]rico/i
  ];

  let itemsToTest = [];

  if (typeof diningInput === 'string') {
    itemsToTest.push({ title: diningInput, desc: diningInput });
  } else if (Array.isArray(diningInput)) {
    diningInput.forEach(item => {
      if (typeof item === 'string') itemsToTest.push({ title: item, desc: item });
      else if (item && typeof item === 'object') itemsToTest.push(item);
    });
  } else if (diningInput && typeof diningInput === 'object') {
    itemsToTest.push(diningInput);
  }

  for (const item of itemsToTest) {
    const fullText = `${item.title || ''} ${item.desc || ''} ${item.name || ''} ${item.justificativa || ''}`;
    for (const pattern of genericPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        return {
          valid: false,
          reason: `Nome genérico de restaurante detectado: "${match[0]}"`,
          genericNameFound: match[0]
        };
      }
    }
  }

  // Check requirement for 2 options per meal when structured dining options are passed
  if (Array.isArray(diningInput) && diningInput.length > 0) {
    const isMealStructured = diningInput.every(d => d.name || d.title);
    if (isMealStructured && diningInput.length < 2) {
      return {
        valid: false,
        reason: "Sugestões de refeição devem conter pelo menos 2 opções reais por refeição."
      };
    }
  }

  return { valid: true };
}



export function checkDuplicateDocument(trip, doc, type = 'flight') {
  if (!trip) return false;
  
  if (type === 'flight' && trip.flights) {
    return trip.flights.some(f => {
      // Compare by flight number if exists
      if (f.flightNumber && doc.flightNumber && f.flightNumber === doc.flightNumber) {
        // Also check if dates match approximately
        if (f.departureDate && doc.departureDate && f.departureDate === doc.departureDate) {
          return true;
        }
      }
      
      // Compare by booking reference
      if (f.bookingRef && doc.bookingRef && f.bookingRef === doc.bookingRef) {
        return true;
      }
      
      // Compare hash/signature if available
      if (f.hash && doc.hash && f.hash === doc.hash) {
        return true;
      }
      
      return false;
    });
  }
  
  if (type === 'accommodation' && trip.accommodations) {
    return trip.accommodations.some(a => {
      if (a.bookingRef && doc.bookingRef && a.bookingRef === doc.bookingRef) return true;
      if (a.hotelName === doc.hotelName && a.checkIn === doc.checkIn) return true;
      return false;
    });
  }
  
  return false;
}

export function inferTripFromDocuments(parsedDataList) {
  let dest = null;
  let start = null;
  let end = null;
  const flights = [];
  const hotels = [];
  
  if (!parsedDataList || !Array.isArray(parsedDataList)) {
    return { dest, start, end, flights, hotels };
  }
  
  // Sort documents by date if available to find first date
  parsedDataList.forEach(doc => {
    if (doc.type === 'flight') {
      flights.push(doc);
      if (!start || (doc.departureDate && new Date(doc.departureDate) < new Date(start))) {
        start = doc.departureDate;
      }
      if (doc.destination && !dest) {
        dest = doc.destination;
      }
    } else if (doc.type === 'accommodation') {
      hotels.push(doc);
      if (!start || (doc.checkIn && new Date(doc.checkIn) < new Date(start))) {
        start = doc.checkIn;
      }
      if (!end || (doc.checkOut && new Date(doc.checkOut) > new Date(end))) {
        end = doc.checkOut;
      }
      if (doc.city && !dest) {
        dest = doc.city;
      }
    }
  });
  
  return { dest, start, end, flights, hotels };
}

export function calculateOperationalHealthScore(tripData) {
  if (!tripData) return { score: 0, total: 5, percentage: 0, items: [] };

  const primaryTransport = getPrimaryTransport(tripData);
  const hasTransport = Boolean((tripData.flights && tripData.flights.length > 0) || primaryTransport);

  const primaryAcc = getPrimaryAccommodation(tripData);
  const hasHotel = Boolean(primaryAcc);

  const hasItinerary = Boolean(tripData.itinerary && tripData.itinerary.length > 0);

  const totalBudget = (tripData.budget?.hospedagem || 0) + (tripData.budget?.alimentacao || 0) + (tripData.budget?.passeios || 0) + (tripData.budget?.compras || 0);
  const hasBudget = totalBudget > 0;

  let totalItems = 0;
  let packedItems = 0;
  if (Array.isArray(tripData.packing)) {
    tripData.packing.forEach(cat => {
      if (cat && Array.isArray(cat.items)) {
        cat.items.forEach(i => {
          totalItems++;
          if (i && (i.checked || typeof i === 'string')) packedItems++;
        });
      }
    });
  }
  const hasPacking = totalItems > 0;

  const items = [
    {
      id: 'transport',
      label: 'Transporte Principal',
      status: hasTransport ? 'OK' : 'Pendente',
      currentValue: hasTransport ? (primaryTransport?.title || tripData.flights?.[0]?.flightNumber || `${tripData.flights?.[0]?.from || 'Voo'} → ${tripData.flights?.[0]?.to || 'Confirmado'}`) : 'Nenhum transporte adicionado',
      actionLabel: hasTransport ? 'Ver na Carteira' : 'Adicionar Transporte',
      tab: 'logistica'
    },
    {
      id: 'hotel',
      label: 'Hospedagem Principal',
      status: hasHotel ? 'OK' : 'Pendente',
      currentValue: hasHotel ? (primaryAcc?.title || primaryAcc?.name || primaryAcc?.provider || tripData.infoHotel || 'Hospedagem salva') : 'Hospedagem a definir',
      actionLabel: hasHotel ? 'Ver na Carteira' : 'Adicionar Hotel',
      tab: 'logistica'
    },
    {
      id: 'itinerary',
      label: 'Roteiro Base',
      status: hasItinerary ? 'OK' : 'Pendente',
      currentValue: hasItinerary ? `${tripData.itinerary.length} dias programados` : 'Sem roteiro montado',
      actionLabel: hasItinerary ? 'Abrir Roteiro' : 'Gerar Roteiro',
      tab: 'roteiro'
    },
    {
      id: 'budget',
      label: 'Orçamento Definido',
      status: hasBudget ? 'OK' : 'Pendente',
      currentValue: hasBudget ? `R$ ${totalBudget.toLocaleString('pt-BR')}` : 'Orçamento a definir',
      actionLabel: hasBudget ? 'Ver Orçamento' : 'Definir Orçamento',
      tab: 'orcamento'
    },
    {
      id: 'packing',
      label: 'Mala / Preparação',
      status: hasPacking ? 'OK' : 'Pendente',
      currentValue: hasPacking ? `${packedItems} de ${totalItems} itens marcados` : 'Lista de mala pendente',
      actionLabel: hasPacking ? 'Ver Mala' : 'Revisar Mala',
      tab: 'mala'
    }
  ];

  const okCount = items.filter(i => i.status === 'OK').length;

  return {
    score: okCount,
    total: 5,
    percentage: Math.round((okCount / 5) * 100),
    items
  };
}

export function calculateReadinessScore(tripData) {
  let totalScore = 0;
  let maxScore = 5; // Base: Dates, Transport, Accommodation, Itinerary, Budget
  
  const hasDates = tripData.start_date ? 1 : 0;
  const hasTransport = ((tripData.flights && tripData.flights.length > 0) || getPrimaryTransport(tripData) || (tripData.documents && tripData.documents.some(isTransportReservation))) ? 1 : 0;
  const hasHotel = (getPrimaryAccommodation(tripData) || (tripData.accommodations && tripData.accommodations.length > 0) || (tripData.infoHotel && tripData.infoHotel !== 'A definir' && tripData.infoHotel !== 'Não definido')) ? 1 : 0;
  const hasItinerary = (tripData.itinerary && tripData.itinerary.length > 0) ? 1 : 0;
  const hasBudget = (tripData.budget && (tripData.budget.hospedagem > 0 || tripData.budget.alimentacao > 0)) ? 1 : 0;
  
  const readinessItems = [
    { id: 'dates', label: 'Datas da viagem', complete: Boolean(hasDates) },
    { id: 'transport', label: 'Transporte principal', complete: Boolean(hasTransport) },
    { id: 'hotel', label: 'Hospedagem', complete: Boolean(hasHotel) },
    { id: 'itinerary', label: 'Roteiro dia a dia', complete: Boolean(hasItinerary) },
    { id: 'budget', label: 'Orçamento', complete: Boolean(hasBudget) }
  ];

  let packedItems = 0;
  let totalItems = 0;
  if (tripData.packing && tripData.packing.length > 0) {
    maxScore += 1;
    tripData.packing.forEach(cat => {
      cat.items.forEach(item => {
        totalItems++;
        if (typeof item === 'object' && item.checked) packedItems++;
      });
    });
    const packingComplete = totalItems > 0 && (packedItems / totalItems) > 0.8;
    if (packingComplete) {
      totalScore += 1;
    }
    readinessItems.push({
      id: 'packing',
      label: 'Lista de mala',
      complete: packingComplete,
      detail: `${packedItems} de ${totalItems} itens marcados`
    });
  }
  
  const hasDocuments = (tripData.documents && tripData.documents.length > 0) || (tripData.reservations && tripData.reservations.length > 0);
  if (hasDocuments) {
    maxScore += 1;
    totalScore += 1;
    readinessItems.push({ id: 'documents', label: 'Documentos e reservas', complete: true });
  }
  
  totalScore += hasDates + hasTransport + hasHotel + hasItinerary + hasBudget;
  
  return {
    score: totalScore,
    max: maxScore,
    percentage: Math.round((totalScore / maxScore) * 100),
    hasDates,
    hasTransport,
    hasHotel,
    hasItinerary,
    hasBudget,
    totalItems,
    packedItems,
    readinessItems
  };
}

export function calculateCountdown(startDateStr, statusStr, nowMs = Date.now()) {
  if (!startDateStr) {
    return { value: "--", label: "Dias" };
  }
  
  const dateOnlyParts = typeof startDateStr === 'string' ? startDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const start = dateOnlyParts
    ? new Date(Number(dateOnlyParts[1]), Number(dateOnlyParts[2]) - 1, Number(dateOnlyParts[3]))
    : new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const now = new Date(nowMs);
  now.setHours(0, 0, 0, 0);
  const diffMs = start.getTime() - now.getTime();
  
  if (statusStr === 'active') {
    return { value: "ON", label: "Viagem" };
  } else if (statusStr === 'completed' || statusStr === 'archived') {
    return { value: "FIM", label: "Concluída" };
  } else {
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      return { value: diffDays.toString(), label: diffDays === 1 ? "Dia" : "Dias" };
    } else {
      return { value: "0", label: "Dias" };
    }
  }
}
