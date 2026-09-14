// modules/logisticsEngine.js — Smart Map & Logistics Engine for CoPiloto de Viagem

export const LOGISTICS_ENGINE_VERSION = 1;

/**
 * Calculates the Haversine distance between two geographical points in kilometers.
 * @param {object} pointA - { lat, lng }
 * @param {object} pointB - { lat, lng }
 * @returns {number} distance in kilometers
 */
export function calculateDistance(pointA, pointB) {
  if (!pointA || !pointB || typeof pointA.lat !== 'number' || typeof pointA.lng !== 'number' ||
      typeof pointB.lat !== 'number' || typeof pointB.lng !== 'number') {
    return 0;
  }

  const R = 6371; // Earth radius in km
  const dLat = (pointB.lat - pointA.lat) * (Math.PI / 180);
  const dLng = (pointB.lng - pointA.lng) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(pointA.lat * (Math.PI / 180)) * Math.cos(pointB.lat * (Math.PI / 180)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Estimates travel time in minutes based on distance and mode of transport
 * @param {number} distanceKm
 * @param {string} mode - 'walking' | 'transit' | 'driving'
 * @returns {number} estimated minutes
 */
export function estimateTravelTime(distanceKm, mode = 'walking') {
  if (distanceKm <= 0) return 0;
  const speeds = {
    walking: 4.5, // km/h
    transit: 20.0, // km/h (includes wait times)
    driving: 30.0  // km/h (city traffic)
  };
  const speed = speeds[mode] || speeds.walking;
  return Math.ceil((distanceKm / speed) * 60);
}

/**
 * Identifies geometric backtracking (zigzagging across the same geographic coordinates).
 * @param {Array<object>} points - Array of { lat, lng }
 * @returns {object} { hasBacktracking: boolean, count: number }
 */
export function detectBacktracking(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return { hasBacktracking: false, count: 0 };
  }

  let count = 0;
  for (let i = 0; i < points.length - 2; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2];

    const d12 = calculateDistance(p1, p2);
    const d23 = calculateDistance(p2, p3);
    const d13 = calculateDistance(p1, p3);

    // If p1 to p3 is much shorter than going p1->p2->p3, it indicates a zigzag back towards p1 area
    if (d12 > 1.0 && d23 > 1.0 && d13 < (d12 + d23) * 0.4) {
      count += 1;
    }
  }

  return {
    hasBacktracking: count > 0,
    count
  };
}

/**
 * Evaluates the route quality of a day's itinerary.
 * Returns a score from 0 to 100 and recommendations.
 * 
 * @param {Array<object|string>} activities
 * @param {object} options
 * @returns {object} RouteQualityResult
 */
export function evaluateDayRouteQuality(activities, options = {}) {
  if (!Array.isArray(activities) || activities.length <= 1) {
    return {
      score: 100,
      totalDistanceKm: 0,
      estimatedTravelTimeMins: 0,
      backtrackingDetected: false,
      backtrackingCount: 0,
      recommendations: [],
      canOptimize: false
    };
  }

  // Extract points with valid lat/lng
  const validPoints = [];
  activities.forEach(act => {
    if (typeof act === 'object' && act !== null) {
      const loc = act.location && typeof act.location === 'object' ? act.location : act;
      if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        validPoints.push({ lat: loc.lat, lng: loc.lng, title: act.title || act.name || 'Atividade' });
      }
    }
  });

  if (validPoints.length < 2) {
    return {
      score: 100,
      totalDistanceKm: 0,
      estimatedTravelTimeMins: 0,
      backtrackingDetected: false,
      backtrackingCount: 0,
      recommendations: ['Adicione localizações/coordenadas para ver a avaliação de rota no mapa.'],
      canOptimize: false
    };
  }

  let totalDistanceKm = 0;
  for (let i = 0; i < validPoints.length - 1; i += 1) {
    totalDistanceKm += calculateDistance(validPoints[i], validPoints[i + 1]);
  }

  const travelTimeMins = estimateTravelTime(totalDistanceKm, options.mode || 'walking');
  const backtracking = detectBacktracking(validPoints);

  let score = 100;
  const recommendations = [];

  if (totalDistanceKm > 20) {
    score -= 20;
    recommendations.push(`Deslocamento total elevado (${totalDistanceKm.toFixed(1)} km). Considere reagrupar atrações.`);
  }

  if (backtracking.hasBacktracking) {
    score -= Math.min(30, backtracking.count * 15);
    recommendations.push(`Você está cruzando a mesma região ${backtracking.count + 1} vezes nesse dia.`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    estimatedTravelTimeMins: travelTimeMins,
    backtrackingDetected: backtracking.hasBacktracking,
    backtrackingCount: backtracking.count,
    recommendations,
    canOptimize: backtracking.hasBacktracking || totalDistanceKm > 15
  };
}

/**
 * Groups nearby activities by geographic proximity.
 * @param {Array<object>} activities
 * @param {number} maxDistanceKm
 * @returns {Array<Array<object>>} Clusters
 */
export function clusterNearbyActivities(activities, maxDistanceKm = 2.0) {
  if (!Array.isArray(activities)) return [];

  const clusters = [];
  const visited = new Set();

  activities.forEach((act, idx) => {
    if (visited.has(idx)) return;

    const cluster = [act];
    visited.add(idx);

    const locA = typeof act === 'object' && act?.location ? act.location : act;

    activities.forEach((other, oIdx) => {
      if (visited.has(oIdx)) return;
      const locB = typeof other === 'object' && other?.location ? other.location : other;

      if (locA && locB && typeof locA.lat === 'number' && typeof locA.lng === 'number' &&
          typeof locB.lat === 'number' && typeof locB.lng === 'number') {
        const dist = calculateDistance(locA, locB);
        if (dist <= maxDistanceKm) {
          cluster.push(other);
          visited.add(oIdx);
        }
      }
    });

    clusters.push(cluster);
  });

  return clusters;
}

export default {
  calculateDistance,
  estimateTravelTime,
  detectBacktracking,
  evaluateDayRouteQuality,
  clusterNearbyActivities,
  LOGISTICS_ENGINE_VERSION
};
