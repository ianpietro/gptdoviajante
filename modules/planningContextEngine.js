import { inferAccommodationFromText, normalizeAccommodationData, formatAccommodationDisplay } from './accommodationNormalizer.js';

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const NUMBER_WORDS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7 };
const MONTHS = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function extractNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  return NUMBER_WORDS[value] || null;
}

function isoDate(year, month, day) {
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (candidate.getUTCFullYear() !== Number(year) || candidate.getUTCMonth() !== Number(month) - 1 || candidate.getUTCDate() !== Number(day)) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function displayDateRange(startDate, endDate) {
  const format = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
  };
  return [format(startDate), format(endDate)].filter(Boolean).join(' a ');
}

function inferDateRange(message, currentTrip = {}, now = new Date()) {
  const text = normalize(message);
  let match = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b.{0,20}\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (match) return { start_date: isoDate(match[1], match[2], match[3]), end_date: isoDate(match[4], match[5], match[6]) };

  match = text.match(/\b(\d{1,2})[\/]([01]?\d)(?:[\/](\d{2,4}))?\s*(?:a|ao|ate|[-–—])\s*(\d{1,2})[\/]([01]?\d)(?:[\/](\d{2,4}))?/);
  if (match) {
    const normalizeYear = value => {
      const numeric = Number(value || now.getFullYear());
      return numeric < 100 ? 2000 + numeric : numeric;
    };
    const firstYear = normalizeYear(match[3] || match[6]);
    const secondYear = normalizeYear(match[6] || match[3]);
    return { start_date: isoDate(firstYear, match[2], match[1]), end_date: isoDate(secondYear, match[5], match[4]) };
  }

  match = text.match(/(?:\bdia\s*)?(\d{1,2})\s*(?:a|ao|ate|[-–—])\s*(?:\bdia\s*)?(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/);
  if (match) {
    const year = Number(match[4] || currentTrip.start_date?.slice(0, 4) || now.getFullYear());
    return { start_date: isoDate(year, MONTHS[match[3]], match[1]), end_date: isoDate(year, MONTHS[match[3]], match[2]) };
  }

  // “dia 23 ao 27” can safely complete a range using the month/year already
  // captured in the trip instead of collapsing both dates onto day 23.
  match = text.match(/(?:\bdia\s*)?(\d{1,2})\s*(?:a|ao|ate|[-–—])\s*(?:\bdia\s*)?(\d{1,2})/);
  if (match && currentTrip.start_date) {
    const [year, month] = currentTrip.start_date.split('-');
    return { start_date: isoDate(year, month, match[1]), end_date: isoDate(year, month, match[2]) };
  }
  return null;
}

function inferTravelerCount(message) {
  const text = normalize(message);
  if (/\b(?:casal|eu\s+e\s+(?:a\s+|o\s+)?(?:minha|meu)\s+(?:esposa|marido|namorada|namorado|companheira|companheiro)|(?:com|junto\s+com)\s+(?:a\s+|o\s+)?(?:minha|meu)\s+(?:esposa|marido|namorada|namorado|companheira|companheiro)|(?:minha|meu)\s+(?:esposa|marido|namorada|namorado|companheira|companheiro)\s+e\s+eu)\b/.test(text)) return 2;
  const match = text.match(/\b(?:somos|vamos em|viajaremos em|grupo de|para)\s+(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete)\s*(?:pessoas?|viajantes?)?\b/);
  return match ? Math.max(1, Math.min(30, extractNumber(match[1]) || 0)) : null;
}

function inferDestination(message, allowGeneric = true) {
  const source = String(message || '').replace(/\s+/g, ' ').trim();
  const destinationTail = "([\\p{L}][\\p{L} .'-]{1,55}?)(?=\\s*,|\\s+com\\s+(?:(?:a|o)\\s+)?(?:minha|meu|um|uma|\\d)|\\s+(?:do|de)\\s+dia\\b|\\s+entre\\s+os?\\b|\\s+em\\s+\\d|\\s+por\\s+\\d|\\s+(?:no|na)\\s+(?:feriado|fim\\s+de\\s+semana)\\b|$)";
  const explicitPrefix = "(?:\\b(?:mudar|mude|muda|trocar|troque|alterar|altere)\\s+(?:o\\s+)?destino\\s+(?:para|pra|pro|a)\\s+|\\b(?:o\\s+)?destino\\s+(?:da\\s+viagem\\s+)?(?:é|sera|será)\\s+|\\b(?:quero|queremos|vou|vamos|iremos|pretendo|pretendemos)\\s+viajar\\s+(?:para|pra|pro|ao|a)\\s+|\\b(?:a\\s+)?viagem\\s+(?:é|sera|será)?\\s*(?:para|pra|pro|ao|a)\\s+)";
  const explicitMatch = source.match(new RegExp(`${explicitPrefix}${destinationTail}`, 'iu'));
  const genericMatch = allowGeneric
    ? source.match(new RegExp(`\\b(?:quero|queremos|vamos|iremos|pretendo|pretendemos|viajarei|viajaremos).{0,28}\\b(?:para|pra|pro|ao|a)\\s+${destinationTail}`, 'iu'))
    : null;
  const match = explicitMatch || genericMatch;
  if (!match) return null;
  const destination = match[match.length - 1].trim().replace(/[.?!]+$/, '');
  const nonDestination = /^(?:um|uma|algum|alguma)?\s*(?:show|concerto|festival|teatro|pe[cç]a|stand.?up|restaurante|bar|caf[eé]|museu|passeio|compras?|shopping|jogo|evento)\b/i;
  const looksLikeVenueInNeighborhood = /\b(?:na|no)\s+(?:vila|bairro|rua|avenida|av\.?|centro|shopping)\b/i.test(destination);
  return /^(um|uma|casal|grupo|viagem)$/i.test(destination) || nonDestination.test(destination) || looksLikeVenueInNeighborhood ? null : destination;
}

function inferDestinationFromOperationalData(trip = {}) {
  const current = String(trip.destination || '').trim();
  const currentLooksContaminated = /\b(?:na|no)\s+(?:vila|bairro|rua|avenida|av\.?|centro|shopping)\b/i.test(current) ||
    /^(?:um|uma|algum|alguma)?\s*(?:show|concerto|festival|teatro|restaurante|bar|caf[eé]|museu|passeio|shopping|evento)\b/i.test(current);
  if (current && !currentLooksContaminated) return null;

  const addresses = [];
  for (const day of trip.itinerary || []) {
    if (day?.city) addresses.push(String(day.city));
    for (const activity of day?.activities || []) {
      const address = typeof activity?.location === 'string' ? activity.location : activity?.location?.address;
      if (address) addresses.push(String(address));
    }
  }
  for (const accommodation of trip.accommodations || []) {
    if (accommodation?.address) addresses.push(String(accommodation.address));
  }

  const candidates = addresses.map(address => {
    const parts = address.split(',').map(part => part.trim()).filter(Boolean);
    if (!parts.length) return null;
    let candidate = parts.at(-1).replace(/\b\d{5}-?\d{3}\b/g, '').trim();
    if (/^[A-Z]{2}$/i.test(candidate) && parts.length > 1) candidate = parts.at(-2);
    return candidate;
  }).filter(candidate =>
    candidate && /^[\p{L} .'-]{3,50}$/u.test(candidate) &&
    !/\b(rua|avenida|av\.?|rodovia|estrada|bairro|vila|centro|shopping)\b/i.test(candidate)
  );
  if (!candidates.length) return null;
  const counts = new Map();
  candidates.forEach(candidate => counts.set(candidate, (counts.get(candidate) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export { inferDestinationFromOperationalData };

function travelerMembers(count) {
  if (!count) return null;
  if (count === 1) return ['Você'];
  if (count === 2) return ['Você', 'Acompanhante'];
  return ['Você', ...Array.from({ length: count - 1 }, (_, index) => `Viajante ${index + 2}`)];
}

function accommodationFromData(data = {}) {
  return normalizeAccommodationData(data);
}

function inferAccommodation(message) {
  return inferAccommodationFromText(message);
}

function extractStructuredAccommodation(content) {
  const blocks = [...String(content || '').matchAll(/```\s*json\s*([\s\S]*?)```/gi)].map(match => match[1]);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      for (const action of parsed?.actions || []) {
        if (!['reservations', 'accommodations'].includes(action?.type)) continue;
        const accommodation = accommodationFromData(action.data);
        if (accommodation) return accommodation;
      }
    } catch (_) {}
  }
  return null;
}

export function inferConversationTripFacts(messages = [], trip = {}, now = new Date()) {
  const facts = {};
  const workingTrip = { ...trip };
  for (const message of messages) {
    const content = String(message?.content || '');
    if (message?.role === 'user') {
      // A primeira intenção de destino pode usar linguagem natural ("vamos para
      // São Paulo"). Depois disso, somente uma troca explicitamente declarada
      // pode substituir a cidade. Assim, "vamos para o Brás" continua sendo
      // uma parada interna do roteiro, não um novo destino da viagem.
      const destination = inferDestination(content, !facts.destination);
      if (destination) facts.destination = destination;
      const dates = inferDateRange(content, workingTrip, now);
      if (dates?.start_date && dates?.end_date) {
        Object.assign(facts, dates);
        Object.assign(workingTrip, dates);
      }
      const traveler_count = inferTravelerCount(content);
      if (traveler_count) facts.traveler_count = traveler_count;
      const accommodation = inferAccommodation(content);
      if (accommodation) facts.accommodation = { ...(facts.accommodation || {}), ...accommodation,
        address: accommodation.address || facts.accommodation?.address || '' };
    }
    const structuredAccommodation = extractStructuredAccommodation(content);
    if (structuredAccommodation) facts.accommodation = structuredAccommodation;
  }
  return Object.keys(facts).length ? facts : null;
}

export function applyConversationTripFacts(trip, facts) {
  if (!trip || !facts) return { trip, changed: false };
  const next = JSON.parse(JSON.stringify(trip));
  if (facts.start_date) next.start_date = facts.start_date;
  if (facts.end_date) next.end_date = facts.end_date;
  if (facts.start_date && facts.end_date) next.infoDates = displayDateRange(facts.start_date, facts.end_date);
  if (facts.destination) {
    next.destination = facts.destination;
    next.tripTitle = `Viagem para ${String(facts.destination).replace(/^viagem\s+(?:para|a|em)\s+/i, '').trim()}`;
  }
  if (facts.traveler_count) {
    next.members = travelerMembers(facts.traveler_count);
    next.infoGroup = facts.traveler_count === 1 ? '1 viajante' : `${facts.traveler_count} viajantes`;
    next.preferences = { ...(next.preferences || {}), traveler_count: facts.traveler_count };
  }
  if (facts.accommodation) {
    const accommodation = { ...(next.accommodations?.[0] || {}), ...facts.accommodation };
    next.accommodations = [accommodation, ...(next.accommodations || []).slice(1)];
    next.infoHotel = formatAccommodationDisplay(accommodation);
    if (accommodation.bookingUrl) next.hotelLink = accommodation.bookingUrl;
  }
  return { trip: next, changed: JSON.stringify(trip) !== JSON.stringify(next), facts };
}

export function inferPlanningPreferences(message) {
  const text = normalize(message);
  if (!text) return null;
  const interests = [];
  const events = [];
  if (/\bjazz\b/.test(text)) { interests.push('música ao vivo'); events.push('show de jazz'); }
  if (/\b(comedia|stand.?up)\b/.test(text)) { interests.push('comédia'); events.push('show de comédia'); }
  if (/\bteatro\b/.test(text)) { interests.push('teatro'); events.push('teatro'); }
  if (/\b(compras|shopping|comprar)\b/.test(text)) interests.push('compras');
  if (/\b(gastronomia|comida|almocar|jantar|restaurante)\b/.test(text)) interests.push('gastronomia');

  const shoppingLocations = [];
  if (/\bbras\b/.test(text)) shoppingLocations.push('Brás');
  if (/\b25 de marco\b/.test(text)) shoppingLocations.push('25 de Março');
  const shoppingDaysMatch = text.match(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete)\s+dias?\b.{0,55}\b(?:bras|compras|shopping|25 de marco)\b/);
  const shoppingDays = shoppingDaysMatch ? extractNumber(shoppingDaysMatch[1]) : null;

  const lunchAreas = [];
  if (/\balmoc(?:ar|o|amos)?\b.{0,35}\bliberdade\b/.test(text)) lunchAreas.push('Liberdade');
  const cookAtAccommodation = /\b(cozinhar|cozinharemos|fazer comida)\b.{0,45}\b(airbnb|apartamento|hospedagem|hotel)\b|\b(airbnb|apartamento|hospedagem|hotel)\b.{0,45}\b(cozinhar|cozinharemos|fazer comida)\b/.test(text);

  const answeredFacts = [
    events.length ? `Deseja: ${events.join(', ')}` : '',
    shoppingDays ? `${shoppingDays} dias de compras${shoppingLocations.length ? ` em ${shoppingLocations.join(', ')}` : ''}` : '',
    !shoppingDays && shoppingLocations.length ? `Compras em ${shoppingLocations.join(', ')}` : '',
    lunchAreas.length ? `Almoço em ${lunchAreas.join(', ')}` : '',
    cookAtAccommodation ? 'Pretende cozinhar na hospedagem' : ''
  ].filter(Boolean);

  if (!interests.length && !events.length && !shoppingLocations.length && !lunchAreas.length && !cookAtAccommodation) return null;
  return { interests, events, shoppingLocations, shoppingDays, lunchAreas, cookAtAccommodation, answeredFacts };
}

export function applyPlanningPreferencesToTrip(trip, inferred) {
  if (!trip || !inferred) return { trip, changed: false };
  const next = JSON.parse(JSON.stringify(trip));
  const previous = next.preferences || {};
  next.preferences = {
    ...previous,
    interests: unique([...(previous.interests || []), ...inferred.interests]),
    desired_events: unique([...(previous.desired_events || []), ...inferred.events]),
    shopping_locations: unique([...(previous.shopping_locations || []), ...inferred.shoppingLocations]),
    lunch_areas: unique([...(previous.lunch_areas || []), ...inferred.lunchAreas]),
    answered_facts: unique([...(previous.answered_facts || []), ...inferred.answeredFacts])
  };
  if (inferred.shoppingDays) next.preferences.shopping_days = inferred.shoppingDays;
  if (inferred.cookAtAccommodation) next.preferences.cook_at_accommodation = true;
  return { trip: next, changed: JSON.stringify(previous) !== JSON.stringify(next.preferences), inferred };
}
