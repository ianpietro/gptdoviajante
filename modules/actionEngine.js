import { recalculateTripContext } from './stateManager.js';
import { applyTransportCommandToTrip } from './transportContextEngine.js';
import { normalizeAccommodationData, formatAccommodationDisplay } from './accommodationNormalizer.js';
import { enrichItineraryWithCalendar } from './calendarEngine.js';

export const VALID_ACTION_TYPES = [
  'itinerary', 'packing', 'expenses', 'flights', 'reservations', 'documents', 'accommodations', 'budget', 'preferences'
];

function destinationTripTitle(destination) {
  const clean = String(destination || '').trim().replace(/^viagem\s+(?:para|a|em)\s+/i, '');
  return clean ? `Viagem para ${clean}` : '';
}

function syncAccommodationLegacyFields(newTrip) {
  if (Array.isArray(newTrip.accommodations) && newTrip.accommodations.length > 0) {
    const primary = newTrip.accommodations[0];
    newTrip.infoHotel = formatAccommodationDisplay(primary);
    if (primary.bookingUrl) {
      newTrip.hotelLink = primary.bookingUrl;
    }
  }
}

function isAccommodationReservation(data) {
  return /\b(airbnb|hotel|pousada|hostel|apartamento|casa alugada|hospedagem)\b/i.test(
    `${data?.type || ''} ${data?.name || ''} ${data?.title || ''}`
  );
}

function syncAccommodationReservation(newTrip, data) {
  if (!isAccommodationReservation(data)) return;
  const rawLocation = typeof data.location === 'string' ? data.location : data.location?.address;
  const accommodation = normalizeAccommodationData({
    ...data,
    name: data.name || data.title || data.type || 'Hospedagem',
    address: data.address || rawLocation || '',
    bookingUrl: data.bookingUrl || data.url || '',
    checkIn: data.checkIn || data.start_datetime || '',
    checkOut: data.checkOut || data.end_datetime || '',
    source: data.source || 'ai_chat'
  });
  if (!accommodation) return;
  newTrip.accommodations = newTrip.accommodations || [];
  if (newTrip.accommodations.length) newTrip.accommodations[0] = { ...newTrip.accommodations[0], ...accommodation };
  else newTrip.accommodations.push(accommodation);
  syncAccommodationLegacyFields(newTrip);
}

function syncTravelersFromPreferences(newTrip, data = {}) {
  const rawCount = data.traveler_count ?? data.travelers_count ?? data.group_size ?? data.number_of_travelers;
  const count = Math.max(0, Math.min(30, Number(rawCount) || 0));
  if (Array.isArray(data.members) && data.members.length) {
    newTrip.members = data.members;
  } else if (count) {
    newTrip.members = count === 1
      ? ['Você']
      : ['Você', ...Array.from({ length: count - 1 }, (_, index) => count === 2 ? 'Acompanhante' : `Viajante ${index + 2}`)];
  }
}

function getTransportCommandFromReservation(reservation) {
  if (!reservation || (!reservation.transport_mode && !String(reservation.type || '').startsWith('Transporte — ') && reservation.type !== 'Passagem Aérea')) return null;
  const mode = reservation.transport_mode || (reservation.type === 'Passagem Aérea' ? 'flight' : 'other_transport');
  const label = reservation.label || String(reservation.type || 'Transporte').replace('Transporte — ', '').replace('Passagem Aérea', 'Avião');
  return {
    mode,
    label,
    title: reservation.title || reservation.name || label,
    type: reservation.type,
    scope: reservation.transport_scope || (mode === 'own_car' ? 'entire_trip' : ['rental_car', 'ride_hailing', 'public_transit'].includes(mode) ? 'local' : 'specific_leg'),
    provider: reservation.provider || '',
    origin: reservation.origin || '',
    destination: reservation.destination || '',
    source: reservation.source || 'ai_chat'
  };
}

function syncTransportContext(newTrip, reservation) {
  const command = getTransportCommandFromReservation(reservation);
  if (!command) return;
  const result = applyTransportCommandToTrip(newTrip, command);
  Object.keys(newTrip).forEach(key => delete newTrip[key]);
  Object.assign(newTrip, result.trip);
}

export function validateAction(action, trip) {
  if (!action || typeof action !== 'object') {
    throw new Error("Action must be an object.");
  }
  if (!VALID_ACTION_TYPES.includes(action.type)) {
    throw new Error(`Invalid action type: ${action.type}`);
  }
  if (action.data && (action.data.id !== undefined || action.data.ownership !== undefined || action.data.auth !== undefined)) {
    throw new Error("Action contains forbidden fields (id, ownership, auth).");
  }
  return true;
}

export function applyActions(actions, trip) {
  if (!Array.isArray(actions)) {
    throw new Error("actions must be an array");
  }

  // Deep copy for atomicity
  const newTrip = JSON.parse(JSON.stringify(trip));
  
  if (!newTrip.undoStack) {
    newTrip.undoStack = [];
  }
  
  // Save current state to undo stack, omitting the stack itself
  const stateSnapshot = { ...newTrip };
  delete stateSnapshot.undoStack;
  newTrip.undoStack.push(JSON.stringify(stateSnapshot));
  
  if (!newTrip.activity_log) {
    newTrip.activity_log = [];
  }

  for (const action of actions) {
    validateAction(action, newTrip);
    
    // Apply based on type
    const { type, operation, data, index } = action;
    
    switch (type) {
      case 'itinerary':
        if (operation === 'add') {
          newTrip.itinerary = newTrip.itinerary || [];
          newTrip.itinerary.push(data);
        } else if (operation === 'update') {
          if (index !== undefined && newTrip.itinerary && newTrip.itinerary[index]) {
            newTrip.itinerary[index] = { ...newTrip.itinerary[index], ...data };
          }
        } else if (operation === 'delete') {
          if (index !== undefined && newTrip.itinerary) {
            newTrip.itinerary.splice(index, 1);
          }
        } else if (operation === 'replace') {
          newTrip.itinerary = data;
        }
        break;

      case 'packing':
        if (operation === 'add') {
          newTrip.packing = newTrip.packing || [];
          newTrip.packing.push(data);
        } else if (operation === 'update') {
          if (index !== undefined && newTrip.packing && newTrip.packing[index]) {
            newTrip.packing[index] = { ...newTrip.packing[index], ...data };
          }
        } else if (operation === 'delete') {
          if (index !== undefined && newTrip.packing) {
            newTrip.packing.splice(index, 1);
          }
        } else if (operation === 'replace') {
          newTrip.packing = data;
        }
        break;

      case 'expenses':
        if (operation === 'add') {
          newTrip.expenses = newTrip.expenses || [];
          newTrip.expenses.push(data);
        } else if (operation === 'update') {
          newTrip.expenses = newTrip.expenses || [];
          const idx = (index !== undefined && index !== null) ? index : (data && data.id ? newTrip.expenses.findIndex(e => e.id === data.id) : 0);
          if (newTrip.expenses[idx]) {
            newTrip.expenses[idx] = { ...newTrip.expenses[idx], ...data };
          }
        } else if (operation === 'delete') {
          const idx = (index !== undefined && index !== null) ? index : (data && data.id ? newTrip.expenses.findIndex(e => e.id === data.id) : -1);
          if (idx >= 0 && newTrip.expenses) {
            newTrip.expenses.splice(idx, 1);
          }
        } else if (operation === 'replace') {
          newTrip.expenses = Array.isArray(data) ? data : [data];
        }
        break;

      case 'flights':
        if (operation === 'add') {
          newTrip.flights = newTrip.flights || [];
          newTrip.flights.push(data);
        } else if (operation === 'update') {
          newTrip.flights = newTrip.flights || [];
          const idx = (index !== undefined && index !== null) ? index : 0;
          if (newTrip.flights[idx]) {
            newTrip.flights[idx] = { ...newTrip.flights[idx], ...data };
          }
        } else if (operation === 'replace') {
          newTrip.flights = Array.isArray(data) ? data : [data];
        } else if (operation === 'delete') {
          const idx = (index !== undefined && index !== null) ? index : -1;
          if (idx >= 0 && newTrip.flights) {
            newTrip.flights.splice(idx, 1);
          }
        }
        break;

      case 'accommodations':
        const normalizedAccommodationData = Array.isArray(data)
          ? data.map(normalizeAccommodationData).filter(Boolean)
          : normalizeAccommodationData(data);
        if (operation === 'add') {
          newTrip.accommodations = newTrip.accommodations || [];
          if (normalizedAccommodationData) newTrip.accommodations.push(normalizedAccommodationData);
        } else if (operation === 'update') {
          newTrip.accommodations = newTrip.accommodations || [];
          const idx = (index !== undefined && index !== null) ? index : 0;
          if (newTrip.accommodations[idx]) {
            newTrip.accommodations[idx] = { ...newTrip.accommodations[idx], ...(normalizedAccommodationData || {}) };
          } else {
            if (normalizedAccommodationData) newTrip.accommodations.push(normalizedAccommodationData);
          }
        } else if (operation === 'replace') {
          newTrip.accommodations = Array.isArray(normalizedAccommodationData)
            ? normalizedAccommodationData
            : normalizedAccommodationData ? [normalizedAccommodationData] : [];
        } else if (operation === 'delete') {
          if (index !== undefined && newTrip.accommodations) {
            newTrip.accommodations.splice(index, 1);
          }
        }
        syncAccommodationLegacyFields(newTrip);
        break;
        
      case 'reservations':
        if (operation === 'add') {
          newTrip.reservations = newTrip.reservations || [];
          const transportCommand = getTransportCommandFromReservation(data);
          const duplicateIndex = transportCommand
            ? newTrip.reservations.findIndex(item => item.transport_mode === transportCommand.mode && item.transport_scope === transportCommand.scope)
            : -1;
          if (duplicateIndex >= 0) newTrip.reservations[duplicateIndex] = { ...newTrip.reservations[duplicateIndex], ...data };
          else newTrip.reservations.push(data);
          syncAccommodationReservation(newTrip, data);
          syncTransportContext(newTrip, data);
        } else if (operation === 'update') {
          newTrip.reservations = newTrip.reservations || [];
          const idx = (index !== undefined && index !== null) ? index : (data && data.id ? newTrip.reservations.findIndex(r => r.id === data.id) : 0);
          if (newTrip.reservations[idx]) {
            newTrip.reservations[idx] = { ...newTrip.reservations[idx], ...data };
            syncAccommodationReservation(newTrip, newTrip.reservations[idx]);
            syncTransportContext(newTrip, newTrip.reservations[idx]);
          }
        } else if (operation === 'replace') {
          newTrip.reservations = Array.isArray(data) ? data : [data];
          const primaryReservation = newTrip.reservations.find(item => (item.transport_scope === 'entire_trip'));
          if (primaryReservation) syncTransportContext(newTrip, primaryReservation);
        } else if (operation === 'delete') {
          const idx = (index !== undefined && index !== null) ? index : (data && data.id ? newTrip.reservations.findIndex(r => r.id === data.id) : -1);
          if (idx >= 0 && newTrip.reservations) {
            newTrip.reservations.splice(idx, 1);
          }
        }
        break;

      case 'documents':
        if (operation === 'add') {
          newTrip.documents = newTrip.documents || [];
          newTrip.documents.push(data);
        } else if (operation === 'update') {
          newTrip.documents = newTrip.documents || [];
          const idx = (index !== undefined && index !== null) ? index : (data && data.id ? newTrip.documents.findIndex(d => d.id === data.id) : 0);
          if (newTrip.documents[idx]) {
            newTrip.documents[idx] = { ...newTrip.documents[idx], ...data };
          }
        } else if (operation === 'replace') {
          newTrip.documents = Array.isArray(data) ? data : [data];
        } else if (operation === 'delete') {
          const idx = (index !== undefined && index !== null) ? index : (data && data.id ? newTrip.documents.findIndex(d => d.id === data.id) : -1);
          if (idx >= 0 && newTrip.documents) {
            newTrip.documents.splice(idx, 1);
          }
        }
        break;

      case 'budget':
        if (operation === 'update' || operation === 'replace') {
          newTrip.budget = { ...newTrip.budget, ...data };
        }
        break;
        
      case 'preferences':
        if (operation === 'update' || operation === 'replace') {
          newTrip.preferences = { ...newTrip.preferences, ...data };
          if (data.destination) {
            newTrip.destination = data.destination;
            newTrip.tripTitle = destinationTripTitle(data.destination);
            if (newTrip.preferences.creation_mode === 'chat_onboarding' && !newTrip.start_date) {
              newTrip.preferences.creation_stage = 'dates';
            }
          }
          if (data.start_date) newTrip.start_date = data.start_date;
          if (data.end_date) newTrip.end_date = data.end_date;
          if (data.targetDate) newTrip.targetDate = data.targetDate;
          if (data.tripTitle && !newTrip.destination) newTrip.tripTitle = data.tripTitle;
          if (newTrip.destination) newTrip.tripTitle = destinationTripTitle(newTrip.destination);
          syncTravelersFromPreferences(newTrip, data);
          if (newTrip.preferences.creation_mode === 'chat_onboarding' && newTrip.start_date && newTrip.end_date) {
            newTrip.preferences.creation_stage = 'profile';
          }
        }
        break;
    }
    
    // Log the action
    newTrip.activity_log.push({
      timestamp: new Date().toISOString(),
      action: action
    });
  }

  // If we reach here, all actions applied successfully
  const recalculated = recalculateTripContext(trip, newTrip);
  recalculated.itinerary = enrichItineraryWithCalendar(
    recalculated.itinerary,
    recalculated.start_date,
    recalculated.end_date
  );
  recalculated.tripCalendar = recalculated.itinerary.map(day => ({
    dayNum: day.dayNum,
    dateISO: day.dateISO,
    date: day.date,
    dateLabel: day.dateLabel,
    weekday: day.weekday
  }));
  return recalculated;
}

export function undoLastActions(trip) {
  if (!trip.undoStack || trip.undoStack.length === 0) {
    throw new Error("No states in undo stack.");
  }
  const lastStateStr = trip.undoStack.pop();
  const lastState = JSON.parse(lastStateStr);
  lastState.undoStack = trip.undoStack; // restore the modified stack
  return lastState;
}

export function buildTripContext(trip) {
  // Optimized token summary with operational intelligence risks
  const summary = {
    title: trip.tripTitle,
    destination: trip.destination,
    dates: trip.infoDates,
    budget: trip.budget,
    flightsCount: (trip.flights || []).length,
    accommodations: (trip.accommodations || []).map(a => ({
      name: a.name || a.title || '',
      address: a.address || '',
      bookingUrl: a.bookingUrl || a.file_reference || '',
      checkIn: a.checkIn || a.start_datetime || '',
      checkOut: a.checkOut || a.end_datetime || '',
      confirmationCode: a.confirmationCode || a.reference || ''
    })),
    documentsCount: (trip.documents || []).length,
    reservationsCount: (trip.reservations || []).length,
    expensesCount: (trip.expenses || []).length,
    infoHotel: trip.infoHotel,
    hotelLink: trip.hotelLink,
    itineraryDays: (trip.itinerary || []).length,
    packingItems: (trip.packing || []).length,
    detectedRisks: (trip.detected_risks || []).slice(0, 5).map(r => ({
      riskId: r.riskId,
      type: r.type,
      title: r.title,
      description: r.description,
      evidence: r.evidence
    })),
    proactiveAlerts: (trip.proactive_items || []).slice(0, 3).map(a => ({
      id: a.id,
      title: a.title,
      description: a.description
    }))
  };
  return JSON.stringify(summary);
}
