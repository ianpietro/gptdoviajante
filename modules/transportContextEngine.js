const MODE_DEFINITIONS = {
  rental_car: { type: 'Transporte — Carro alugado', label: 'Carro alugado', title: 'Carro alugado no destino' },
  own_car: { type: 'Transporte — Carro próprio', label: 'Carro próprio', title: 'Viagem de carro próprio' },
  bus: { type: 'Transporte — Ônibus', label: 'Ônibus', title: 'Ônibus para o destino' },
  train: { type: 'Transporte — Trem', label: 'Trem', title: 'Trem para o destino' },
  flight: { type: 'Passagem Aérea', label: 'Avião', title: 'Voo para o destino' },
  boat: { type: 'Transporte — Barco / Navio', label: 'Barco / Navio', title: 'Travessia de barco' },
  ride_hailing: { type: 'Transporte — Táxi / Aplicativo', label: 'Táxi / aplicativo', title: 'Mobilidade por Uber, 99 ou táxi' },
  public_transit: { type: 'Transporte — Transporte público', label: 'Transporte público', title: 'Mobilidade por transporte público' },
  transfer: { type: 'Transporte — Transfer', label: 'Transfer', title: 'Transfer reservado' }
};

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function detectMode(text) {
  if (/\b(alugar|alugado|alugada|locadora|locacao)\b.*\bcarro\b|\bcarro\b.*\b(alugar|alugado|alugada|locadora|locacao)\b/.test(text)) return 'rental_car';
  if (/\b(uber|99|cabify|taxi|carro por aplicativo|aplicativo de transporte)\b/.test(text)) return 'ride_hailing';
  if (/\b(metro|transporte publico|onibus local|bondinho)\b/.test(text)) return 'public_transit';
  if (/\b(meu carro|carro proprio|de carro|com o carro|com carro)\b/.test(text)) return 'own_car';
  if (/\b(onibus|rodoviari[ao])\b/.test(text)) return 'bus';
  if (/\b(trem|ferroviari[ao])\b/.test(text)) return 'train';
  if (/\b(aviao|voo|aereo|aerea)\b/.test(text)) return 'flight';
  if (/\b(barco|navio|balsa|ferry)\b/.test(text)) return 'boat';
  if (/\btransfer\b/.test(text)) return 'transfer';
  return null;
}

function inferScope(text, mode) {
  if (/\b(volta|voltar|retorno|retornar|regresso)\b/.test(text)) return 'departure';
  if (/\b(chego|chegar|chegarei|chegada|ida|vou para|viajo para)\b/.test(text)) return 'arrival';
  if (/\b(tudo|toda a viagem|durante toda|todos os dias|do inicio ao fim)\b/.test(text)) return 'entire_trip';
  if (['rental_car', 'ride_hailing', 'public_transit'].includes(mode)) return 'local';
  if (mode === 'own_car') return 'entire_trip';
  if (['flight', 'bus', 'train', 'boat'].includes(mode)) return 'arrival';
  return 'specific_leg';
}

function commandFromClause(clause, fullText) {
  const mode = detectMode(clause);
  if (!mode) return null;
  const scope = inferScope(clause, mode);
  return { mode, scope, ...MODE_DEFINITIONS[mode], source_text: fullText };
}

export function inferTransportCommands(message) {
  const text = normalizeText(message);
  if (!text || /\b(qual|melhor|prefere|recomenda|vale a pena)\b.*\b(carro|onibus|trem|aviao|voo|barco|transfer|taxi|uber|metro)\b/.test(text)) return [];
  const assertsChoice = /\b(vou|vamos|iremos|viajo|viajarei|chego|chegarei|irei|usarei|usar|usamos|alugar|alugaremos|faremos|farei|sera)\b/.test(text) || /\b(tudo|toda a viagem)\b/.test(text);
  if (!assertsChoice) return [];
  const clauses = text.split(/\s+(?:e|depois|entao|mas)\s+/).filter(Boolean);
  const commands = clauses.map(clause => commandFromClause(clause, text)).filter(Boolean);
  if (commands.length === 0) {
    const single = commandFromClause(text, text);
    if (single) commands.push(single);
  }
  return commands.filter((command, index, list) => list.findIndex(item => item.mode === command.mode && item.scope === command.scope) === index);
}

export function inferTransportCommand(message) {
  return inferTransportCommands(message)[0] || null;
}

export function adaptItineraryToTransport(itinerary, transport) {
  if (!Array.isArray(itinerary) || !['local', 'entire_trip'].includes(transport?.scope)) return itinerary || [];
  return itinerary.map(day => ({
    ...day,
    transport: transport.label,
    transport_mode: transport.mode,
    transport_modes: transport.modes || [transport.mode],
    transport_note: `Deslocamentos locais planejados considerando ${transport.label.toLowerCase()}.`,
    activities: Array.isArray(day.activities) ? day.activities.map(activity => ({ ...activity, transport_mode: transport.mode, transport_modes: transport.modes || [transport.mode] })) : day.activities
  }));
}

function assignTransportPlan(next, command, reservation) {
  next.transportPlan = { ...(next.transportPlan || {}) };
  const summary = {
    reservation_id: reservation.id || null,
    mode: command.mode, label: command.label, title: command.title,
    provider: command.provider || '', origin: command.origin || '', destination: command.destination || '',
    scope: command.scope, source: command.source || 'ai_chat'
  };
  if (command.scope === 'arrival') next.transportPlan.arrival = summary;
  else if (command.scope === 'departure') next.transportPlan.departure = summary;
  else if (command.scope === 'local') {
    next.transportPlan.local_modes = Array.isArray(next.transportPlan.local_modes) ? next.transportPlan.local_modes : [];
    const localIndex = next.transportPlan.local_modes.findIndex(item => item.mode === summary.mode);
    if (localIndex >= 0) next.transportPlan.local_modes[localIndex] = summary;
    else next.transportPlan.local_modes.push(summary);
    next.transportPlan.local = next.transportPlan.local_modes.length === 1
      ? summary
      : {
          mode: 'mixed',
          label: next.transportPlan.local_modes.map(item => item.label).join(' + '),
          title: 'Mobilidade mista no destino',
          scope: 'local',
          modes: next.transportPlan.local_modes.map(item => item.mode),
          source: command.source || 'ai_chat'
        };
  }
  else if (command.scope === 'entire_trip') {
    next.transportPlan.arrival = summary;
    next.transportPlan.local = summary;
    next.transportPlan.local_modes = [summary];
  } else {
    next.transportPlan.segments = Array.isArray(next.transportPlan.segments) ? next.transportPlan.segments : [];
    const segmentIndex = next.transportPlan.segments.findIndex(item => item.mode === summary.mode && item.title === summary.title);
    if (segmentIndex >= 0) next.transportPlan.segments[segmentIndex] = summary;
    else next.transportPlan.segments.push(summary);
  }
  next.primaryTransport = next.transportPlan.local || next.transportPlan.arrival || summary;
  next.preferences = {
    ...(next.preferences || {}),
    arrival_transport_mode: next.transportPlan.arrival?.mode || null,
    local_transport_mode: next.transportPlan.local?.mode || null,
    local_transport_modes: (next.transportPlan.local_modes || []).map(item => item.mode),
    departure_transport_mode: next.transportPlan.departure?.mode || null
  };
}

export function applyTransportCommandToTrip(trip, command) {
  if (!trip || !command?.mode) return { trip, changed: false, itineraryChanged: false };
  const next = JSON.parse(JSON.stringify(trip));
  next.reservations = Array.isArray(next.reservations) ? next.reservations : [];
  const existingIndex = next.reservations.findIndex(item => item.transport_mode === command.mode && item.transport_scope === command.scope);
  const reservation = {
    ...(existingIndex >= 0 ? next.reservations[existingIndex] : {}),
    type: command.type, title: command.title, transport_mode: command.mode, transport_scope: command.scope,
    provider: command.provider || '', reference: command.reference || '', origin: command.origin || '', destination: command.destination || '',
    notes: command.notes || '', source: command.source || 'ai_chat',
    created_at: existingIndex >= 0 ? next.reservations[existingIndex].created_at : new Date().toISOString()
  };
  if (existingIndex >= 0) next.reservations[existingIndex] = reservation;
  else next.reservations.push(reservation);
  assignTransportPlan(next, command, reservation);
  const itineraryChanged = ['local', 'entire_trip'].includes(command.scope) && Array.isArray(next.itinerary) && next.itinerary.length > 0;
  if (itineraryChanged) next.itinerary = adaptItineraryToTransport(next.itinerary, next.transportPlan.local || command);
  return { trip: next, changed: true, itineraryChanged, command };
}

export function applyTransportCommandsToTrip(trip, commands) {
  let next = trip;
  const results = [];
  for (const command of commands || []) {
    const result = applyTransportCommandToTrip(next, command);
    if (result.changed) { next = result.trip; results.push(result); }
  }
  return {
    trip: next, changed: results.length > 0,
    itineraryChanged: results.some(result => result.itineraryChanged),
    commands: results.map(result => result.command), results
  };
}
