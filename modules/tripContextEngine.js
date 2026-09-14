import { calculateTripDays, generatePackingList } from './packingEngine.js';

export const TRIP_CONTEXT_VERSION = 1;

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function destinationText(trip) {
  return String(trip?.destination || trip?.tripTitle || '')
    .replace(/^viagem\s+(?:para|a)\s+/i, '')
    .trim();
}

function inferHemisphere(destination, latitude) {
  if (Number.isFinite(Number(latitude))) return Number(latitude) < 0 ? 'south' : 'north';
  const value = normalize(destination);
  const southernHints = [
    'brasil', 'brazil', 'argentina', 'chile', 'uruguai', 'uruguay', 'paraguai', 'paraguay',
    'bolivia', 'peru', 'australia', 'nova zelandia', 'new zealand', 'africa do sul', 'south africa',
    'rio de janeiro', 'sao paulo', 'campo grande', 'florianopolis', 'curitiba', 'porto alegre',
    'buenos aires', 'santiago', 'bariloche', 'ushuaia', 'cidade do cabo', 'cape town', 'sydney', 'melbourne'
  ];
  return southernHints.some(hint => value.includes(hint)) ? 'south' : 'north';
}

function seasonForMonth(month, hemisphere) {
  const north = month === 12 || month <= 2 ? 'winter'
    : month <= 5 ? 'spring'
      : month <= 8 ? 'summer'
        : 'autumn';
  if (hemisphere === 'north') return north;
  return { winter: 'summer', spring: 'autumn', summer: 'winter', autumn: 'spring' }[north];
}

function inferClimateKind(destination, month, season) {
  const value = normalize(destination);
  const tropicalRain = [
    /campo grande|pantanal|rio de janeiro|salvador|recife|fortaleza/.test(value) && (month >= 11 || month <= 3),
    /amazonia|amazonas|manaus|belem|costa rica|bali|tailandia|thailand/.test(value) && (month <= 5 || month >= 10),
    /caribe|caribbean|cancun|miami/.test(value) && month >= 6 && month <= 10,
    /lisboa|porto|londres|london|dublin|amsterdam|roma|rome/.test(value) && (month >= 10 || month <= 3)
  ].some(Boolean);
  const snowDestination = /bariloche|ushuaia|patagonia|alpes|alps|chamonix|zermatt|aspen|whistler|reykjavik|islandia|iceland|laplandia|lapland/.test(value);

  if (snowDestination && season === 'winter') return 'snow';
  if (tropicalRain) return 'rainy';
  if (season === 'summer') return 'hot';
  if (season === 'winter') return 'cold';
  return 'variable';
}

const CLIMATE_COPY = {
  rainy: {
    label: 'Período com maior chance de chuva',
    icon: '🌧️',
    itineraryGuidance: 'Intercale passeios externos com atrações cobertas e mantenha um Plano B indoor em cada dia.',
    dayPlan: 'Se chover, preserve reservas fixas e troque primeiro os passeios externos por uma alternativa coberta próxima.',
    packing: ['Guarda-chuva compacto', 'Capa de chuva leve', 'Calçado que seque rápido', 'Proteção impermeável para documentos'],
    budgetFactor: 1.03
  },
  snow: {
    label: 'Inverno com possibilidade de neve',
    icon: '❄️',
    itineraryGuidance: 'Inclua margens maiores de deslocamento, confirme acessos e combine experiências na neve com atrações internas.',
    dayPlan: 'Se houver neve forte ou acesso limitado, preserve reservas fixas e priorize uma atividade interna próxima.',
    packing: ['Casaco impermeável e térmico', 'Segunda pele', 'Luvas e gorro', 'Calçado impermeável com boa aderência'],
    budgetFactor: 1.12
  },
  hot: {
    label: 'Período geralmente quente e ensolarado',
    icon: '☀️',
    itineraryGuidance: 'Priorize passeios externos cedo ou no fim da tarde e use o meio do dia para atrações internas ou pausas.',
    dayPlan: 'Se o calor estiver acima do normal, antecipe passeios externos e reserve o meio do dia para locais cobertos.',
    packing: ['Protetor solar', 'Óculos de sol', 'Chapéu ou boné', 'Garrafa reutilizável'],
    budgetFactor: 1.08
  },
  cold: {
    label: 'Período geralmente frio',
    icon: '🧥',
    itineraryGuidance: 'Alterne caminhadas curtas com atrações internas e evite longos períodos externos no começo e fim do dia.',
    dayPlan: 'Se o frio ou o vento estiverem intensos, reduza o tempo ao ar livre e priorize atrações internas próximas.',
    packing: ['Casaco quente', 'Blusa térmica', 'Cachecol', 'Protetor labial'],
    budgetFactor: 1.04
  },
  variable: {
    label: 'Meia-estação com clima variável',
    icon: '⛅',
    itineraryGuidance: 'Monte dias flexíveis, com ao menos uma alternativa coberta caso o clima saia do padrão.',
    dayPlan: 'Se o clima mudar, preserve reservas fixas e substitua o passeio externo por uma opção coberta próxima.',
    packing: ['Casaco leve em camadas', 'Guarda-chuva compacto', 'Calçado confortável fechado'],
    budgetFactor: 1
  }
};

function formatDatePt(value) {
  const date = parseDateOnly(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date) : '';
}

function addDays(value, offset) {
  const date = parseDateOnly(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function preserveCheckedItems(packing = []) {
  const checked = new Set();
  packing.forEach(category => (category?.items || []).forEach(item => {
    const name = typeof item === 'string' ? item : item?.name;
    if (name && typeof item === 'object' && item.checked) checked.add(normalize(name));
  }));
  return checked;
}

function applyPackingContext(trip, context) {
  const checkedItems = preserveCheckedItems(trip.packing);
  const canRegenerate = !Array.isArray(trip.packing) || trip.packing.length === 0 || Boolean(trip.packing_generation_version);
  let packing = canRegenerate
    ? generatePackingList({
        destination: context.destination,
        countryCode: trip.country_code,
        startDate: trip.start_date,
        endDate: trip.end_date
      })
    : trip.packing.filter(category => category?.generated_by !== 'date_context');

  packing = packing.map(category => ({
    ...category,
    items: (category.items || []).map(item => {
      const normalizedItem = typeof item === 'string' ? { name: item, checked: false } : { ...item };
      if (checkedItems.has(normalize(normalizedItem.name))) normalizedItem.checked = true;
      return normalizedItem;
    })
  }));

  packing = packing.filter(category => category?.generated_by !== 'date_context');
  const existingNames = new Set(packing.flatMap(category => (category.items || []).map(existing => normalize(existing?.name || existing))));
  const contextualItems = context.packingSuggestions
    .filter(name => !existingNames.has(normalize(name)))
    .map(name => ({ name, checked: checkedItems.has(normalize(name)) }));
  if (contextualItems.length > 0) {
    packing.push({
      category: `Clima: ${context.climateLabel}`,
      generated_by: 'date_context',
      items: contextualItems
    });
  }
  trip.packing = packing;
  trip.packing_generation_version = 2;
  trip.packing_generated_at = new Date().toISOString();
}

function applyBudgetContext(trip, context) {
  const thresholds = trip.budgetThresholds || { economico: 150, intermediario: 450 };
  const dailyEstimate = Math.max(200, Number(thresholds.economico || 150) * 2);
  const recommendedTotal = Math.round((dailyEstimate * context.days * context.budgetFactor) / 10) * 10;
  const shouldAutoUpdate = !trip.budget_user_modified_at;
  trip.budget_context = {
    days: context.days,
    dailyEstimate,
    seasonFactor: context.budgetFactor,
    recommendedTotal,
    autoApplied: shouldAutoUpdate,
    updatedAt: new Date().toISOString()
  };
  if (shouldAutoUpdate) {
    trip.budget = {
      hospedagem: Math.round(recommendedTotal * 0.4),
      alimentacao: Math.round(recommendedTotal * 0.3),
      passeios: Math.round(recommendedTotal * 0.2),
      compras: Math.round(recommendedTotal * 0.1)
    };
    trip.budget_generation_source = 'date_context';
  }
}

function applyItineraryContext(trip, context) {
  const itinerary = Array.isArray(trip.itinerary) ? trip.itinerary : [];
  itinerary.forEach((day, index) => {
    const isoDate = index < context.days ? addDays(trip.start_date, index) : '';
    if (isoDate) day.date = formatDatePt(isoDate);
    day.climate_plan = context.dayPlan;
    day.climate_kind = context.climateKind;
  });
  trip.itinerary = itinerary;
  trip.itinerary_context = {
    expectedDays: context.days,
    currentDays: itinerary.length,
    needsRegeneration: itinerary.length > 0 && itinerary.length !== context.days,
    climateGuidance: context.itineraryGuidance,
    updatedAt: new Date().toISOString()
  };
}

export function buildTripDateContext(trip = {}) {
  const start = parseDateOnly(trip.start_date);
  const end = parseDateOnly(trip.end_date || trip.start_date);
  if (!start || !end || end < start) return null;
  const destination = destinationText(trip);
  const hemisphere = inferHemisphere(destination, trip.latitude);
  const month = start.getUTCMonth() + 1;
  const season = seasonForMonth(month, hemisphere);
  const climateKind = inferClimateKind(destination, month, season);
  const climate = CLIMATE_COPY[climateKind];
  return {
    version: TRIP_CONTEXT_VERSION,
    destination,
    days: calculateTripDays(trip.start_date, trip.end_date || trip.start_date),
    hemisphere,
    season,
    climateKind,
    climateLabel: climate.label,
    climateIcon: climate.icon,
    climateSource: 'seasonal',
    itineraryGuidance: climate.itineraryGuidance,
    dayPlan: climate.dayPlan,
    packingSuggestions: climate.packing,
    budgetFactor: climate.budgetFactor,
    generatedAt: new Date().toISOString()
  };
}

export function applyTripDateContext(trip = {}) {
  const context = buildTripDateContext(trip);
  if (!context) return { trip, context: null };
  trip.date_context = context;
  trip.infoWeather = `${context.climateIcon} ${context.climateLabel} (tendência sazonal)`;
  trip.ai_context = {
    ...(trip.ai_context || {}),
    date_context: `${context.days} dias em ${context.destination}; ${context.climateLabel}. ${context.itineraryGuidance}`
  };
  applyPackingContext(trip, context);
  applyBudgetContext(trip, context);
  applyItineraryContext(trip, context);
  return { trip, context };
}

export function applyForecastContext(trip = {}, forecast = {}) {
  if (!trip.date_context) return trip;
  const codes = Array.isArray(forecast.codes) ? forecast.codes.map(Number) : [];
  const hasSnow = codes.some(code => code >= 71 && code <= 86);
  const hasRain = codes.some(code => (code >= 51 && code <= 67) || (code >= 80 && code <= 99));
  const kind = hasSnow ? 'snow' : hasRain ? 'rainy' : trip.date_context.climateKind;
  const climate = CLIMATE_COPY[kind] || CLIMATE_COPY.variable;
  trip.date_context = {
    ...trip.date_context,
    climateKind: kind,
    climateLabel: climate.label,
    climateIcon: climate.icon,
    climateSource: 'forecast',
    itineraryGuidance: climate.itineraryGuidance,
    dayPlan: climate.dayPlan,
    forecast
  };
  trip.infoWeather = forecast.summary || `${climate.icon} ${climate.label}`;
  (trip.itinerary || []).forEach(day => {
    day.climate_plan = climate.dayPlan;
    day.climate_kind = kind;
  });
  return trip;
}
