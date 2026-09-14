const GENERATION_VERSION = 3;

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateTripDays(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end < start) return 1;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function item(name) {
  return { name, checked: false };
}

function normalizeDestination(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const BRAZIL_DESTINATION_PATTERN = /\b(brasil|brazil|acre|alagoas|amapa|amazonas|bahia|ceara|espirito santo|goias|maranhao|mato grosso|mato grosso do sul|minas gerais|para|paraiba|parana|pernambuco|piaui|rio de janeiro|rio grande do norte|rio grande do sul|rondonia|roraima|santa catarina|sao paulo|sergipe|tocantins|distrito federal|brasilia|manaus|belem|macapa|boa vista|porto velho|rio branco|palmas|campo grande|cuiaba|goiania|salvador|fortaleza|recife|maceio|aracaju|natal|joao pessoa|teresina|sao luis|belo horizonte|vitoria|curitiba|florianopolis|porto alegre)\b/;

export function getTravelScope(destination, countryCode) {
  const normalizedCode = String(countryCode || '').trim().toUpperCase();
  if (normalizedCode === 'BR' || normalizedCode === 'BRA') return 'domestic';
  if (normalizedCode) return 'international';
  return BRAZIL_DESTINATION_PATTERN.test(normalizeDestination(destination)) ? 'domestic' : 'unknown';
}

function seasonalItems(destination, startDate) {
  const month = parseDateOnly(startDate)?.getUTCMonth() + 1;
  const normalized = String(destination || '').toLowerCase();
  const isRome = normalized.includes('roma') || normalized.includes('rome');

  if (isRome && month && month >= 6 && month <= 9) {
    return ['Casaco leve para o fim do dia', 'Protetor solar', 'Óculos de sol', 'Guarda-chuva compacto'];
  }
  if (month && (month <= 3 || month >= 11)) {
    return ['Casaco', 'Guarda-chuva compacto'];
  }
  return ['Casaco leve', 'Guarda-chuva compacto'];
}

export function generatePackingList({ destination = '', countryCode = '', startDate, endDate } = {}) {
  const days = Math.max(1, Math.min(calculateTripDays(startDate, endDate), 30));
  const tops = Math.min(days, 7);
  const bottoms = Math.max(1, Math.min(Math.ceil(days / 2), 4));
  const underwear = Math.min(days + 1, 10);
  const travelScope = getTravelScope(destination, countryCode);

  const documents = travelScope === 'international'
    ? ['Passaporte válido', 'Passagens e reservas', 'Seguro viagem (recomendado ou exigido pelo destino)', 'Cartões e dinheiro']
    : travelScope === 'domestic'
      ? ['Documento oficial com foto', 'Passagens e reservas', 'Cartão do SUS ou do plano de saúde (se tiver)', 'Cartões e dinheiro']
      : ['Documento oficial com foto', 'Passagens e reservas', 'Confirmar documentação exigida pelo destino', 'Cartões e dinheiro'];

  const clothing = [
    `${tops} camisetas ou blusas`,
    `${bottoms} partes de baixo`,
    `${underwear} peças íntimas`,
    `${underwear} pares de meias`,
    'Pijama',
    'Calçado confortável'
  ];

  const electronics = ['Celular', 'Carregador do celular', 'Bateria portátil'];
  if (travelScope === 'international') electronics.push('Adaptador universal de tomada');

  return [
    { category: 'Documentos e dinheiro', items: documents.map(item) },
    { category: `Roupas para ${days} ${days === 1 ? 'dia' : 'dias'}`, items: [...clothing, ...seasonalItems(destination, startDate)].map(item) },
    { category: 'Higiene e saúde', items: ['Escova e pasta de dentes', 'Desodorante', 'Itens de higiene pessoal', 'Medicamentos de uso pessoal', 'Kit básico de primeiros socorros'].map(item) },
    { category: 'Eletrônicos', items: electronics.map(item) }
  ];
}

export function ensureAutoPackingList(trip) {
  if (!trip || typeof trip !== 'object') return trip;
  const hasPacking = Array.isArray(trip.packing) && trip.packing.length > 0;
  const generatedVersion = Number(trip.packing_generation_version || 0);
  const shouldMigrateGeneratedPacking = hasPacking && generatedVersion > 0 && generatedVersion < GENERATION_VERSION;
  if (hasPacking && !shouldMigrateGeneratedPacking) return trip;

  const destination = trip.destination || trip.tripTitle || '';
  const startDate = trip.start_date || (trip.targetDate ? String(trip.targetDate).slice(0, 10) : '');
  const endDate = trip.end_date || startDate;
  if (!destination || !startDate) return trip;

  const checkedItems = new Set((trip.packing || []).flatMap(category => (category?.items || []))
    .filter(existing => typeof existing === 'object' && existing.checked)
    .map(existing => normalizeDestination(existing.name)));
  const personalItems = (trip.packing || []).flatMap(category => (category?.items || []))
    .filter(existing => typeof existing === 'object' && (existing.manual || existing.isUserCreated));

  trip.packing = generatePackingList({
    destination,
    countryCode: trip.country_code,
    startDate,
    endDate
  });
  trip.packing.forEach(category => category.items.forEach(generatedItem => {
    if (checkedItems.has(normalizeDestination(generatedItem.name))) generatedItem.checked = true;
  }));
  if (personalItems.length) trip.packing.unshift({ category: 'Meus itens', items: personalItems });
  trip.packing_generation_version = GENERATION_VERSION;
  trip.packing_generated_at = new Date().toISOString();
  return trip;
}

export { GENERATION_VERSION as PACKING_GENERATION_VERSION };
