const ACCOMMODATION_TYPE_PATTERN = /\b(airbnb|hotel|pousada|hostel|apartamento|casa\s+alugada|hospedagem)\b/iu;
const ADDRESS_START_PATTERN = /\b(?:rua|r\.|avenida|av\.?|alameda|travessa|pra[cç]a|rodovia|estrada|largo|via|viale|corso|piazza|calle|carrer|boulevard|place|street|st\.?|road|rd\.?)\s+/iu;

const TYPE_LABELS = {
  airbnb: 'Airbnb',
  hotel: 'Hotel',
  pousada: 'Pousada',
  hostel: 'Hostel',
  apartamento: 'Apartamento',
  'casa alugada': 'Casa alugada',
  hospedagem: 'Hospedagem'
};

function compact(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizedKey(value = '') {
  return compact(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function sentenceFragment(value = '') {
  return compact(value)
    .split(/[,;]\s*(?=(?:vamos|vou|iremos|irei|chegaremos|chegarei|chegar|ficaremos|ficarei|mas|porque|pois|durante|sendo|e\s+(?:o\s+que|oq)\b)\b)/iu)[0]
    .split(/\s+(?=(?:vamos|vou|iremos|irei|chegaremos|chegarei|ficaremos|ficarei)\b)/iu)[0]
    .replace(/[.;!?]+$/, '')
    .trim();
}

function canonicalType(value = '') {
  const match = compact(value).match(ACCOMMODATION_TYPE_PATTERN);
  return match ? TYPE_LABELS[normalizedKey(match[1])] || compact(match[1]) : '';
}

function titleCaseAddress(value = '') {
  const minorWords = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'del', 'di', 'du', 'of']);
  return compact(value).split(' ').map((word, index) => {
    if (/^\d+[a-z]?$/i.test(word) || /^[A-Z]{2,4}$/.test(word)) return word;
    const punctuation = word.match(/^([^\p{L}0-9]*)(.*?)([^\p{L}0-9]*)$/u);
    const core = punctuation?.[2] || word;
    const lowered = core.toLocaleLowerCase('pt-BR');
    const cased = index > 0 && minorWords.has(lowered)
      ? lowered
      : lowered.charAt(0).toLocaleUpperCase('pt-BR') + lowered.slice(1);
    return `${punctuation?.[1] || ''}${cased}${punctuation?.[3] || ''}`;
  }).join(' ');
}

function cleanAddress(value = '') {
  const source = compact(value);
  const start = source.search(ADDRESS_START_PATTERN);
  if (start < 0) return '';
  return titleCaseAddress(sentenceFragment(source.slice(start))
    .replace(/^[-–—:\s]+/, '')
    .trim());
}

function cleanName(value = '', type = '') {
  let name = sentenceFragment(value);
  const addressStart = name.search(ADDRESS_START_PATTERN);
  if (addressStart >= 0) name = name.slice(0, addressStart);
  name = name.replace(/\s*(?:[-–—:·]|\b(?:na|no|em)\b)\s*$/iu, '').trim();
  if (!name || normalizedKey(name) === normalizedKey(type)) return type || 'Hospedagem';
  if (type === 'Airbnb' || type === 'Apartamento' || type === 'Casa alugada' || type === 'Hospedagem') return type;
  return name.length <= 70 ? name : type || 'Hospedagem';
}

export function formatAccommodationDisplay(accommodation = {}) {
  return [compact(accommodation.name), compact(accommodation.address)].filter(Boolean).join(' · ') || 'Hospedagem';
}

export function normalizeAccommodationData(data = {}) {
  if (!data || typeof data !== 'object') return null;
  const rawLocation = typeof data.location === 'string' ? data.location : data.location?.address;
  const rawName = compact(data.name || data.title || data.type || '');
  const combined = [rawName, data.address, rawLocation].filter(Boolean).join(' ');
  const type = canonicalType(combined);
  if (!type) return null;
  const address = cleanAddress(data.address || rawLocation || rawName || combined);
  const name = cleanName(rawName || type, type);
  return {
    ...data,
    name,
    address,
    bookingUrl: data.bookingUrl || data.url || '',
    source: data.source || 'chat'
  };
}

export function inferAccommodationFromText(message = '') {
  const source = compact(message);
  if (!ACCOMMODATION_TYPE_PATTERN.test(source)) return null;
  return normalizeAccommodationData({ name: source, source: 'chat' });
}
