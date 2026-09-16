const PRIVATE_PLACE_PATTERN = /\b(airbnb|hospedagem|hotel|hostel|pousada|apartamento|casa\s+(?:do|da|de)|minha casa|casa da fam[ií]lia|check[ -]?in|check[ -]?out|deixar (?:as )?malas?|buscar (?:minha|meu|sua|seu)\b)\b/i;
const GENERIC_TITLE_PATTERN = /\b(descanso|tempo livre|tarde flex[ií]vel|noite livre|organiza[cç][aã]o|prepara[cç][aã]o para a volta)\b/i;

function clean(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalize(value = '') {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function isPrivateRoutePlace(activity = {}) {
  const address = typeof activity.location === 'object'
    ? activity.location?.address
    : (typeof activity.location === 'string' ? activity.location : activity.address);
  return PRIVATE_PLACE_PATTERN.test(`${activity.title || activity.name || ''} ${address || ''}`);
}

export function buildSafeRouteGeocodeQuery(activity = {}, destination = '') {
  if (!activity || isPrivateRoutePlace(activity)) return '';
  const title = clean(activity.title || activity.name);
  const address = clean(typeof activity.location === 'object'
    ? activity.location?.address
    : (typeof activity.location === 'string' ? activity.location : activity.address));
  const safeAddress = address && !PRIVATE_PLACE_PATTERN.test(address) ? address : '';
  if ((!title || GENERIC_TITLE_PATTERN.test(title)) && !safeAddress) return '';
  const destinationText = clean(destination);
  const parts = [title && !GENERIC_TITLE_PATTERN.test(title) ? title : '', safeAddress, destinationText]
    .filter(Boolean)
    .filter((part, index, values) => !values.slice(0, index).some(previous => previous.toLowerCase().includes(part.toLowerCase()) || part.toLowerCase().includes(previous.toLowerCase())));
  return parts.join(', ');
}

export function parseGeocodeResult(payload = {}) {
  const feature = Array.isArray(payload?.features) ? payload.features.find(item => {
    const coordinates = item?.geometry?.coordinates;
    return Array.isArray(coordinates) && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]));
  }) : null;
  if (!feature) return null;
  const [lng, lat] = feature.geometry.coordinates;
  const properties = feature.properties || {};
  return {
    lat: Number(lat),
    lng: Number(lng),
    label: clean([properties.name, properties.district, properties.city, properties.state].filter(Boolean).join(', '))
  };
}

export function haversineDistanceKm(first, second) {
  if (!first || !second) return Infinity;
  const lat1 = Number(first.lat);
  const lng1 = Number(first.lng);
  const lat2 = Number(second.lat);
  const lng2 = Number(second.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const toRadians = value => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseDestinationGeocodeResult(payload = {}) {
  const result = Array.isArray(payload?.results) ? payload.results.find(item => (
    Number.isFinite(Number(item?.latitude)) && Number.isFinite(Number(item?.longitude))
  )) : null;
  if (!result) return null;
  return {
    lat: Number(result.latitude),
    lng: Number(result.longitude),
    label: clean([result.name, result.admin1, result.country].filter(Boolean).join(', '))
  };
}

export function selectNearbyGeocodeResult(payload = {}, destinationCenter = null, destination = '', maxDistanceKm = 120) {
  const destinationWords = normalize(destination).split(/[^a-z0-9]+/)
    .filter(word => word.length >= 4 && !['viagem', 'para', 'pela', 'pelo'].includes(word));
  const candidates = Array.isArray(payload?.features) ? payload.features.map(feature => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || !Number.isFinite(Number(coordinates[0])) || !Number.isFinite(Number(coordinates[1]))) return null;
    const properties = feature.properties || {};
    const location = {
      lat: Number(coordinates[1]),
      lng: Number(coordinates[0]),
      label: clean([properties.name, properties.district, properties.city, properties.state, properties.country].filter(Boolean).join(', '))
    };
    const distanceKm = destinationCenter ? haversineDistanceKm(destinationCenter, location) : Infinity;
    const normalizedLabel = normalize(location.label);
    const textMatches = destinationWords.filter(word => normalizedLabel.includes(word)).length;
    return { location, distanceKm, textMatches };
  }).filter(Boolean) : [];

  if (destinationCenter) {
    const nearby = candidates.filter(candidate => candidate.distanceKm <= maxDistanceKm);
    nearby.sort((a, b) => b.textMatches - a.textMatches || a.distanceKm - b.distanceKm);
    return nearby[0]?.location || null;
  }

  const matching = candidates.filter(candidate => candidate.textMatches > 0);
  matching.sort((a, b) => b.textMatches - a.textMatches);
  return matching[0]?.location || null;
}
