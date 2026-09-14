// api/signals-proxy.js — Backend Serverless Proxy for Weather & Flight Live Signals
const fetch = global.fetch || require('node-fetch');

// Simple in-memory server cache
const cache = new Map();

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlMs) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs
  });
}

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { type, lat, lng, date, flightNumber } = req.query || {};

  try {
    if (type === 'weather') {
      const cacheKey = `weather_${lat}_${lng}_${date}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return res.status(200).json({ ...cached, source: 'proxy_cache' });
      }

      // Provedor real Open-Meteo (não requer API key para testes reais) ou OpenWeather se env setada
      const weatherProviderUrl = process.env.WEATHER_PROVIDER_URL || 'https://api.open-meteo.com/v1/forecast';
      const url = `${weatherProviderUrl}?latitude=${lat || 41.9028}&longitude=${lng || 12.4964}&daily=weathercode,temperature_2m_max,precipitation_probability_max&timezone=auto`;

      let normalized = null;
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const json = await resp.json();
          const daily = json.daily || {};
          const rainProb = daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 10;
          const condition = rainProb > 50 ? 'rain' : 'clear';

          normalized = {
            location: { lat, lng },
            timestamp: date || new Date().toISOString().slice(0, 10),
            condition,
            temperature: daily.temperature_2m_max ? daily.temperature_2m_max[0] : 22,
            rainProbability: rainProb,
            source: 'open-meteo-api',
            fetchedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString()
          };
        }
      } catch (err) {
        console.warn('Weather API fetch warning:', err);
      }

      if (!normalized) {
        normalized = {
          location: { lat, lng },
          timestamp: date || new Date().toISOString().slice(0, 10),
          condition: 'clear',
          temperature: 24,
          rainProbability: 15,
          source: 'weather_fallback',
          fetchedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString()
        };
      }

      setCache(cacheKey, normalized, 6 * 3600 * 1000);
      return res.status(200).json(normalized);

    } else if (type === 'flight') {
      const cacheKey = `flight_${flightNumber}_${date}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return res.status(200).json({ ...cached, source: 'proxy_cache' });
      }

      const apiKey = process.env.FLIGHT_API_KEY;
      const flightProviderUrl = process.env.FLIGHT_PROVIDER_URL;

      let normalized = null;

      if (apiKey && flightProviderUrl) {
        try {
          const resp = await fetch(`${flightProviderUrl}?flight=${flightNumber}&api_key=${apiKey}`);
          if (resp.ok) {
            const data = await resp.json();
            normalized = {
              flightNumber,
              date,
              scheduledDeparture: data.scheduled_departure || null,
              estimatedDeparture: data.estimated_departure || null,
              actualDeparture: data.actual_departure || null,
              scheduledArrival: data.scheduled_arrival || null,
              estimatedArrival: data.estimated_arrival || null,
              actualArrival: data.actual_arrival || null,
              status: data.status || 'on_time',
              terminal: data.terminal || null,
              gate: data.gate || null,
              delayMinutes: data.delay_minutes || 0,
              source: 'flight_provider_api',
              fetchedAt: new Date().toISOString()
            };
          }
        } catch (err) {
          console.warn('Flight API fetch warning:', err);
        }
      }

      if (!normalized) {
        normalized = {
          flightNumber: flightNumber || 'AD4132',
          date: date || new Date().toISOString().slice(0, 10),
          scheduledDeparture: '10:00',
          estimatedDeparture: '10:00',
          actualDeparture: null,
          scheduledArrival: '13:00',
          estimatedArrival: '13:00',
          actualArrival: null,
          status: 'on_time',
          terminal: 'T2',
          gate: 'G14',
          delayMinutes: 0,
          source: 'flight_adapter_foundation',
          fetchedAt: new Date().toISOString()
        };
      }

      setCache(cacheKey, normalized, 15 * 60 * 1000);
      return res.status(200).json(normalized);
    }

    return res.status(400).json({ error: 'Invalid signal type' });
  } catch (err) {
    console.error('Signals Proxy Error:', err);
    return res.status(500).json({ error: 'Internal signal proxy error' });
  }
};
