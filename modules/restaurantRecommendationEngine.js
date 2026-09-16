const WEEKDAY_INDEX = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6
};

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function weekdayKey(value = '') {
  return Object.keys(WEEKDAY_INDEX).find(key => normalize(value).startsWith(key)) || '';
}

export function sameRestaurant(left = '', right = '') {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  return a === b || (a.length >= 6 && b.includes(a)) || (b.length >= 6 && a.includes(b));
}

export function verificationContradictsDay(note = '', weekday = '') {
  const text = normalize(note);
  const current = weekdayKey(weekday);
  if (!text || !current) return false;

  if (new RegExp(`(?:nao|sem)\\s+(?:ha\\s+)?(?:abertura|funcionamento).*${current}|nao\\s+(?:abre|funciona).*${current}`).test(text)) {
    return true;
  }
  if (current === 'domingo' && /nao informa abertura dominical|fechad[oa] aos domingos/.test(text)) return true;

  const reservationDay = text.match(/reserva.{0,55}\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/)?.[1];
  if (reservationDay && reservationDay !== current) return true;

  const range = text.match(/(?:funcionamento|abre|aberto).{0,35}\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b\s+a\s+\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/);
  if (range) {
    const start = WEEKDAY_INDEX[range[1]];
    const end = WEEKDAY_INDEX[range[2]];
    const currentIndex = WEEKDAY_INDEX[current];
    const included = start <= end
      ? currentIndex >= start && currentIndex <= end
      : currentIndex >= start || currentIndex <= end;
    if (!included) return true;
  }
  return false;
}

export function filterRestaurantOptionsForDay(options = [], itinerary = [], dayIndex = 0) {
  const currentDay = itinerary[dayIndex] || {};
  const earlierDays = itinerary.slice(0, Math.max(0, dayIndex));
  const earlierPlaceNames = earlierDays.flatMap(day => (day.activities || []).flatMap(activity => [
    activity.title,
    activity.name,
    ...(activity.restaurant_options || []).map(option => option?.name)
  ])).filter(Boolean);

  const accepted = [];
  for (const option of Array.isArray(options) ? options : []) {
    if (!option?.name) continue;
    if (verificationContradictsDay(option.verification_note, currentDay.weekday || currentDay.dateLabel)) continue;
    if (earlierPlaceNames.some(name => sameRestaurant(option.name, name))) continue;
    if (accepted.some(existing => sameRestaurant(option.name, existing.name))) continue;
    accepted.push(option);
  }
  return accepted.slice(0, 2);
}
