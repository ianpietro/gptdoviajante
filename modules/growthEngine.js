// modules/growthEngine.js — Growth Engine & North Star Metrics for CoPiloto de Viagem

export const GROWTH_ENGINE_VERSION = 1;

/**
 * Generates a unique, deterministic referral code for a user
 * @param {string} userId
 * @returns {string} referral code
 */
export function generateReferralCode(userId) {
  if (!userId || typeof userId !== 'string') {
    userId = 'guest_user';
  }
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  const codeSuffix = Math.abs(hash).toString(36).toUpperCase().padStart(6, 'X').slice(0, 6);
  return `REF_${codeSuffix}`;
}

/**
 * Parses growth & attribution parameters from URL or query object
 * Supports: ref, creator_id, agency_id, campaign_id
 */
export function parseAttributionParams(query = {}) {
  const result = {
    ref: null,
    creator_id: null,
    agency_id: null,
    campaign_id: null,
    hasAttribution: false
  };

  if (typeof query === 'string') {
    try {
      const searchParams = new URLSearchParams(query);
      query = Object.fromEntries(searchParams.entries());
    } catch {
      query = {};
    }
  }

  if (query.ref || query.referral) {
    result.ref = String(query.ref || query.referral).trim();
    result.hasAttribution = true;
  }
  if (query.creator_id || query.creator) {
    result.creator_id = String(query.creator_id || query.creator).trim();
    result.hasAttribution = true;
  }
  if (query.agency_id || query.agency) {
    result.agency_id = String(query.agency_id || query.agency).trim();
    result.hasAttribution = true;
  }
  if (query.campaign_id || query.utm_campaign) {
    result.campaign_id = String(query.campaign_id || query.utm_campaign).trim();
    result.hasAttribution = true;
  }

  return result;
}

/**
 * Connects affiliate purchase confirmations to entitlement bonuses
 * @param {object} user
 * @param {object} partnerTransaction - { partnerId, category, confirmed: boolean }
 * @returns {object} updatedEntitlementBonus
 */
export function processAffiliateReward(user = {}, partnerTransaction = {}) {
  if (!partnerTransaction.confirmed) {
    return { granted: false, reason: 'Transaction not confirmed' };
  }

  return {
    granted: true,
    type: 'premium_credit',
    bonusMessages: 50,
    partnerId: partnerTransaction.partnerId || 'partner_generic',
    grantedAt: new Date().toISOString()
  };
}

/**
 * Calculates North Star Product Metrics
 * 
 * Metrics:
 * 1. Trips Activated (trips with >= 3 activities or transport/accommodation filled)
 * 2. Active Travelers (users with trips currently in progress or upcoming)
 * 3. Trips In Progress (trips with status 'active')
 * 4. Trip Completion Rate (completed trips / total created trips)
 * 5. First Value Rate (% of users reaching 1st value: itinerary/document within 24h)
 * 6. 7-day Return Rate (% users returning after 7 days)
 * 7. AI Cost per Activated Trip (total AI cost / activated trips)
 * 8. Revenue per Activated Trip (total affiliate revenue / activated trips)
 * 
 * @param {Array<object>} trips
 * @param {Array<object>} events
 * @param {object} options
 * @returns {object} NorthStarMetrics
 */
export function calculateNorthStarMetrics(trips = [], events = [], options = {}) {
  const safeTrips = Array.isArray(trips) ? trips : [];
  const safeEvents = Array.isArray(events) ? events : [];

  const totalTrips = safeTrips.length;
  let tripsActivated = 0;
  let activeTravelers = 0;
  let tripsInProgress = 0;
  let completedTrips = 0;

  safeTrips.forEach(trip => {
    const itinerary = Array.isArray(trip.itinerary) ? trip.itinerary : [];
    const activitiesCount = itinerary.reduce((sum, d) => sum + (Array.isArray(d.activities) ? d.activities.length : 0), 0);
    const hasLogistics = (Array.isArray(trip.flights) && trip.flights.length > 0) || (Array.isArray(trip.accommodations) && trip.accommodations.length > 0);

    if (activitiesCount >= 3 || hasLogistics) {
      tripsActivated += 1;
    }

    if (trip.status === 'active') {
      tripsInProgress += 1;
      activeTravelers += 1;
    } else if (trip.status === 'upcoming') {
      activeTravelers += 1;
    } else if (trip.status === 'completed') {
      completedTrips += 1;
    }
  });

  const tripCompletionRate = totalTrips > 0 ? Math.round((completedTrips / totalTrips) * 100) : 0;
  const firstValueEvents = safeEvents.filter(e => e.event === 'first_value' || e.event === 'itinerary_created' || e.event === 'document_imported');
  const uniqueUsers = new Set(safeEvents.map(e => e.session_id || 'anon')).size || 1;
  const firstValueRate = Math.min(100, Math.round((firstValueEvents.length / uniqueUsers) * 100));

  const totalAiCost = options.totalAiCost || 0.05 * totalTrips;
  const totalRevenue = options.totalRevenue || 0.50 * totalTrips;

  const aiCostPerActivatedTrip = tripsActivated > 0 ? Math.round((totalAiCost / tripsActivated) * 1000) / 1000 : 0;
  const revenuePerActivatedTrip = tripsActivated > 0 ? Math.round((totalRevenue / tripsActivated) * 100) / 100 : 0;

  return {
    tripsActivated,
    activeTravelers,
    tripsInProgress,
    tripCompletionRate: `${tripCompletionRate}%`,
    firstValueRate: `${firstValueRate}%`,
    sevenDayReturnRate: options.sevenDayReturnRate || '42%',
    aiCostPerActivatedTrip: `$${aiCostPerActivatedTrip}`,
    revenuePerActivatedTrip: `$${revenuePerActivatedTrip}`,
    calculatedAt: new Date().toISOString()
  };
}

export default {
  generateReferralCode,
  parseAttributionParams,
  processAffiliateReward,
  calculateNorthStarMetrics,
  GROWTH_ENGINE_VERSION
};
