export const CURRENT_STATE_VERSION = 2;

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
    }
  };

  // Inject defaults if properties are missing or undefined
  Object.keys(defaults).forEach(key => {
    if (normalized[key] === undefined) {
      normalized[key] = JSON.parse(JSON.stringify(defaults[key]));
    }
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
      hospedagem: normalized.budget.hospedagem || 0,
      alimentacao: normalized.budget.alimentacao || 0,
      passeios: normalized.budget.passeios || 0,
      compras: normalized.budget.compras || 0
    };
  }

  // Ensure budgetThresholds is fully initialized
  if (!normalized.budgetThresholds || typeof normalized.budgetThresholds !== 'object') {
    normalized.budgetThresholds = { economico: 150, intermediario: 450 };
  } else {
    normalized.budgetThresholds = {
      economico: normalized.budgetThresholds.economico || 150,
      intermediario: normalized.budgetThresholds.intermediario || 450
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
        return { ...cat, items };
      }
      return { category: 'Geral', items: [] };
    });
  }

  // Logical fallbacks
  if (!normalized.destination) {
    normalized.destination = normalized.tripTitle || "A definir";
  }
  if (!normalized.start_date) {
    normalized.start_date = normalized.targetDate ? normalized.targetDate.split('T')[0] : null;
  }
  if (!normalized.end_date) {
    normalized.end_date = null;
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

export function calculateReadinessScore(tripData) {
  let totalScore = 0;
  let maxScore = 5; // Base: Dates, Transport, Accommodation, Itinerary, Budget
  
  const hasDates = tripData.start_date ? 1 : 0;
  const hasTransport = ((tripData.flights && tripData.flights.length > 0) || (tripData.reservations && tripData.reservations.some(r => r.type === "Passagem Aérea" || r.type === "flight"))) ? 1 : 0;
  const hasHotel = (tripData.accommodations && tripData.accommodations.length > 0) || (tripData.infoHotel && tripData.infoHotel !== 'A definir' && tripData.infoHotel !== 'Não definido') ? 1 : 0;
  const hasItinerary = (tripData.itinerary && tripData.itinerary.length > 0) ? 1 : 0;
  const hasBudget = (tripData.budget && (tripData.budget.hospedagem > 0 || tripData.budget.alimentacao > 0)) ? 1 : 0;
  
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
    if (totalItems > 0 && (packedItems / totalItems) > 0.8) {
      totalScore += 1;
    }
  }
  
  if ((tripData.documents && tripData.documents.length > 0) || (tripData.reservations && tripData.reservations.length > 0)) {
    maxScore += 1;
    totalScore += 1;
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
    packedItems
  };
}

export function calculateCountdown(startDateStr, statusStr, nowMs = Date.now()) {
  if (!startDateStr) {
    return { value: "--", label: "Dias" };
  }
  
  const start = new Date(startDateStr);
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
