// modules/signalsEngine.js — Live Travel Signals Engine & Smart Polling Window Manager
import { weatherProvider, flightProvider, placesProvider } from './signalAdapters.js';

export const SIGNALS_ENGINE_VERSION = 1;

/**
 * Calculates smart polling window interval based on days until trip and hours until flight.
 * Prevents unnecessary API calls for distant trips.
 * 
 * @param {number} daysUntilTrip
 * @param {number|null} hoursUntilFlight
 * @returns {object} { shouldPoll: boolean, pollingIntervalMins: number|null, reason: string }
 */
export function getPollingWindow(daysUntilTrip, hoursUntilFlight = null) {
  if (typeof daysUntilTrip !== 'number' || daysUntilTrip > 30) {
    return {
      shouldPoll: false,
      pollingIntervalMins: null,
      reason: 'Viagem distante (> 30 dias). Polling suspenso para economia de custos.'
    };
  }

  if (hoursUntilFlight !== null && hoursUntilFlight <= 24) {
    return {
      shouldPoll: true,
      pollingIntervalMins: 15,
      reason: 'Voo iminente (< 24h). Janela de alta frequência ativa (15 min).'
    };
  }

  if (daysUntilTrip <= 7) {
    return {
      shouldPoll: true,
      pollingIntervalMins: 360, // 6h
      reason: 'Semana da viagem. Janela de frequência média ativa (6 horas).'
    };
  }

  return {
    shouldPoll: true,
    pollingIntervalMins: 1440, // 24h
    reason: 'Viagem próxima (7 a 30 dias). Janela de checagem diária ativa (24 horas).'
  };
}

/**
 * Evaluates live signals for a trip state using smart polling windows and adapter caching.
 * Records telemetry metrics: provider_calls, cost_estimate, cache_hits.
 * 
 * @param {object} trip
 * @param {object} options - { now, forcePoll }
 * @returns {object} SignalsEvaluationResult
 */
export async function evaluateTripSignals(trip, options = {}) {
  const result = {
    signals: [],
    telemetry: {
      provider_calls: 0,
      cost_estimate: 0,
      cache_hits: 0,
      evaluated_at: new Date().toISOString()
    },
    pollingWindow: null
  };

  if (!trip || typeof trip !== 'object' || trip.status === 'completed' || trip.status === 'archived') {
    return result;
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const startDateStr = trip.start_date || (typeof trip.targetDate === 'string' ? trip.targetDate.slice(0, 10) : null);
  
  let daysUntilTrip = 999;
  if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
    const startMs = Date.parse(startDateStr);
    const todayMs = Date.parse(now.toISOString().slice(0, 10));
    daysUntilTrip = Math.round((startMs - todayMs) / 86400000);
  }

  const pollingWindow = getPollingWindow(daysUntilTrip);
  result.pollingWindow = pollingWindow;

  if (!pollingWindow.shouldPoll && !options.forcePoll) {
    return result;
  }

  // 1. Evaluate Flights Signals
  const flights = Array.isArray(trip.flights) ? trip.flights : [];
  for (const f of flights) {
    if (f.flightNumber) {
      const res = await flightProvider.fetchFlightSignal({
        flightNumber: f.flightNumber,
        date: f.date || startDateStr
      });

      if (res.isCacheHit) {
        result.telemetry.cache_hits += 1;
      } else {
        result.telemetry.provider_calls += 1;
        result.telemetry.cost_estimate += flightProvider.estimatedCostPerCall;
      }

      if (res.data) {
        result.signals.push({
          ...res.data,
          sourceProvider: flightProvider.name,
          freshness: res.freshness
        });
      }
    }
  }

  // 2. Evaluate Weather Signals
  if (trip.destination || trip.tripTitle) {
    const res = await weatherProvider.fetchWeatherSignal({
      lat: trip.lat,
      lng: trip.lng,
      date: startDateStr,
      locationName: trip.destination || trip.tripTitle
    });

    if (res.isCacheHit) {
      result.telemetry.cache_hits += 1;
    } else {
      result.telemetry.provider_calls += 1;
      result.telemetry.cost_estimate += weatherProvider.estimatedCostPerCall;
    }

    if (res.data) {
      result.signals.push({
        ...res.data,
        sourceProvider: weatherProvider.name,
        freshness: res.freshness
      });
    }
  }

  result.telemetry.cost_estimate = Math.round(result.telemetry.cost_estimate * 10000) / 10000;
  return result;
}

export default {
  getPollingWindow,
  evaluateTripSignals,
  SIGNALS_ENGINE_VERSION
};
