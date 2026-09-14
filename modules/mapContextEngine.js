function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function comparable(value = '') {
  return compact(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function cleanTripDestination(value = '') {
  return compact(value)
    .replace(/^viagem\s+(?:para|a)\s+/iu, '')
    .replace(/^(?:minha\s+pr[oó]xima|nova)\s+viagem$/iu, '')
    .trim();
}

export function buildContextualMapQuery(parts = [], destination = '') {
  const place = (Array.isArray(parts) ? parts : [parts]).map(compact).filter(Boolean).join(', ');
  const cleanDestination = cleanTripDestination(destination);
  if (!cleanDestination) return place;
  const city = cleanDestination.split(',')[0].trim();
  const normalizedPlace = comparable(place);
  const alreadyScoped = comparable(cleanDestination) && normalizedPlace.includes(comparable(cleanDestination));
  const alreadyHasCity = comparable(city) && normalizedPlace.includes(comparable(city));
  return [place, alreadyScoped || alreadyHasCity ? '' : cleanDestination].filter(Boolean).join(', ');
}

export function buildGoogleMapsSearchUrl(parts = [], destination = '') {
  const query = buildContextualMapQuery(parts, destination);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}
