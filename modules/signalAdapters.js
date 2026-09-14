// modules/signalAdapters.js — Decoupled Signal Adapters for Live Travel Signals Engine

export const ADAPTERS_VERSION = 1;

// In-memory cache for live signals with TTL freshness
const signalCache = new Map();

/**
 * Returns cache key string
 */
function getCacheKey(provider, entityId) {
  return `${provider}:${entityId}`;
}

/**
 * Retrieves cached signal if fresh
 * @returns {object|null} { data, freshness, isCacheHit: true }
 */
export function getCachedSignal(provider, entityId, ttlMs = 3600000) {
  const key = getCacheKey(provider, entityId);
  const cached = signalCache.get(key);
  if (!cached) return null;

  const ageMs = Date.now() - cached.timestamp;
  if (ageMs > ttlMs) {
    signalCache.delete(key);
    return null;
  }

  const freshnessSec = Math.floor((ttlMs - ageMs) / 1000);
  return {
    data: cached.data,
    freshness: `${freshnessSec}s`,
    isCacheHit: true
  };
}

/**
 * Stores signal result in cache
 */
export function setCachedSignal(provider, entityId, data) {
  const key = getCacheKey(provider, entityId);
  signalCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Weather Provider Adapter
 * Decoupled interface for weather updates (e.g. Open-Meteo or WeatherAPI)
 */
export const weatherProvider = {
  name: 'weather_provider_v1',
  estimatedCostPerCall: 0.001, // USD

  async fetchWeatherSignal({ lat, lng, date, locationName }) {
    const cacheKey = `${lat || locationName}:${date}`;
    const cached = getCachedSignal('weather', cacheKey, 21600000); // 6h TTL
    if (cached) return cached;

    // Simulated provider payload for local engine
    const isRainy = typeof locationName === 'string' && /roma|chuvoso|rain/i.test(locationName);
    const data = {
      signalId: `sig_weather_${Date.now()}`,
      type: 'WEATHER',
      severity: isRainy ? 'attention' : 'info',
      condition: isRainy ? 'rain' : 'clear',
      description: isRainy ? `Previsão de chuva em ${locationName || 'destino'}` : `Tempo firme em ${locationName || 'destino'}`,
      temperatureC: 22,
      updatedAt: new Date().toISOString()
    };

    setCachedSignal('weather', cacheKey, data);
    return { data, freshness: 'fresh', isCacheHit: false };
  }
};

/**
 * Flight Provider Adapter
 * Decoupled interface for flight status (e.g. FlightAware or AeroData)
 */
export const flightProvider = {
  name: 'flight_provider_v1',
  estimatedCostPerCall: 0.005, // USD

  async fetchFlightSignal({ flightNumber, date }) {
    const cacheKey = `${flightNumber}:${date}`;
    const cached = getCachedSignal('flight', cacheKey, 900000); // 15m TTL
    if (cached) return cached;

    const isDelayed = typeof flightNumber === 'string' && /delay|atraso|ad4132/i.test(flightNumber);
    const delayMins = isDelayed ? 180 : 0;

    const data = {
      signalId: `sig_flight_${Date.now()}`,
      type: 'FLIGHT_STATUS',
      flightNumber,
      status: isDelayed ? 'delayed' : 'on_time',
      delayMinutes: delayMins,
      description: isDelayed ? `Voo ${flightNumber} com atraso estimado de ${delayMins} minutos.` : `Voo ${flightNumber} confirmado no horário.`,
      updatedAt: new Date().toISOString()
    };

    setCachedSignal('flight', cacheKey, data);
    return { data, freshness: 'fresh', isCacheHit: false };
  }
};

/**
 * Places Provider Adapter
 * Decoupled interface for attraction opening hours and closure alerts
 */
export const placesProvider = {
  name: 'places_provider_v1',
  estimatedCostPerCall: 0.002, // USD

  async fetchPlaceStatusSignal({ placeId, placeName }) {
    const cacheKey = `${placeId || placeName}`;
    const cached = getCachedSignal('places', cacheKey, 86400000); // 24h TTL
    if (cached) return cached;

    const isClosed = typeof placeName === 'string' && /fechado|reforma|closed/i.test(placeName);
    const data = {
      signalId: `sig_place_${Date.now()}`,
      type: 'OPENING_HOURS',
      placeName,
      status: isClosed ? 'closed' : 'open',
      description: isClosed ? `Atração "${placeName}" fechada para manutenção.` : `Atração "${placeName}" aberta normalmente.`,
      updatedAt: new Date().toISOString()
    };

    setCachedSignal('places', cacheKey, data);
    return { data, freshness: 'fresh', isCacheHit: false };
  }
};

export default {
  weatherProvider,
  flightProvider,
  placesProvider,
  getCachedSignal,
  setCachedSignal,
  ADAPTERS_VERSION
};
