const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
}

export function buildTripCalendar(startDate, endDate = '', requestedDays = 0) {
  const start = parseDateOnly(startDate);
  if (!start) return [];
  const end = parseDateOnly(endDate);
  const inclusiveDays = end && end >= start ? Math.floor((end - start) / 86400000) + 1 : Number(requestedDays) || 1;
  return Array.from({ length: Math.max(1, Math.min(31, inclusiveDays)) }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateISO = date.toISOString().slice(0, 10);
    const weekday = WEEKDAYS[date.getUTCDay()];
    return { dayNum: index + 1, dateISO, date: formatDate(date), dateLabel: `${formatDate(date)} · ${weekday}`, weekday, weekdayKey: WEEKDAY_KEYS[date.getUTCDay()] };
  });
}

export function enrichItineraryWithCalendar(itinerary = [], startDate = '', endDate = '') {
  const calendar = buildTripCalendar(startDate, endDate, itinerary.length);
  return (Array.isArray(itinerary) ? itinerary : []).map((day, index) => ({
    ...day,
    ...(calendar[index] || {}),
    dayNum: index + 1
  }));
}

export function extractCalendarCommitments(message = '') {
  const source = String(message || '');
  const pattern = /((?:inclua|incluir|adicione|adicionar|coloque|colocar|quero|queremos)?[^,;]{1,90}?)\s+(?:na|no|à|a)?\s*(domingo|segunda(?:-feira)?|terça(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|sabado)(?:\s+(?:à|a|de|pela|no)\s*(manhã|manha|tarde|noite))?/giu;
  const commitments = [];
  for (const match of source.matchAll(pattern)) {
    const activity = match[1]
      .replace(/^(?:\s*e\s+)?(?:inclua|incluir|adicione|adicionar|coloque|colocar|quero|queremos)\s+/i, '')
      .replace(/^\s*e\s+/i, '').trim();
    const weekdayKey = normalize(match[2]).replace(' feira', '');
    const period = normalize(match[3] || '');
    if (activity.length >= 2 && WEEKDAY_KEYS.includes(weekdayKey)) commitments.push({ activity, weekdayKey, period });
  }
  return commitments;
}

function activityMatches(activity, query) {
  const title = normalize(`${activity?.title || ''} ${activity?.name || ''}`);
  const tokens = normalize(query).split(' ').filter(token => token.length > 2 && !['para', 'uma', 'com'].includes(token));
  return tokens.length > 0 && tokens.every(token => title.includes(token));
}

function timeForPeriod(period, currentTime = '') {
  const hour = Number(String(currentTime).match(/^(\d{1,2})/)?.[1]);
  if (period === 'manha' && !(hour >= 5 && hour < 12)) return '09:30';
  if (period === 'tarde' && !(hour >= 12 && hour < 18)) return '15:00';
  if (period === 'noite' && !(hour >= 18 || hour < 5)) return '20:30';
  return currentTime || '--:--';
}

export function alignTripToCalendarCommitments(trip, message = '') {
  if (!trip || !Array.isArray(trip.itinerary)) return trip;
  const calendar = buildTripCalendar(trip.start_date, trip.end_date, trip.itinerary.length);
  const commitments = extractCalendarCommitments(message);
  const next = { ...trip, itinerary: enrichItineraryWithCalendar(trip.itinerary, trip.start_date, trip.end_date).map(day => ({ ...day, activities: [...(day.activities || [])] })) };
  for (const commitment of commitments) {
    const targetIndex = calendar.findIndex(day => day.weekdayKey === commitment.weekdayKey);
    if (targetIndex < 0) continue;
    let found = null;
    for (let dayIndex = 0; dayIndex < next.itinerary.length && !found; dayIndex += 1) {
      const activityIndex = next.itinerary[dayIndex].activities.findIndex(activity => activityMatches(activity, commitment.activity));
      if (activityIndex >= 0) found = { dayIndex, activity: next.itinerary[dayIndex].activities.splice(activityIndex, 1)[0] };
    }
    if (!found) continue;
    found.activity.time = timeForPeriod(commitment.period, found.activity.time);
    found.activity.calendarCommitment = { weekday: calendar[targetIndex].weekday, dateISO: calendar[targetIndex].dateISO, period: commitment.period };
    next.itinerary[targetIndex].activities.push(found.activity);
    next.itinerary[targetIndex].activities.sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
  }
  return next;
}

export { WEEKDAYS, WEEKDAY_KEYS };
