import { FREE_AI_LIMIT } from '../config.js';

export const plans = {
    free: {
        maxTrips: 1,
        aiMessages: FREE_AI_LIMIT,
        offlineDocuments: false
    },
    premium: {
        maxTrips: Infinity,
        aiMessages: Infinity,
        offlineDocuments: true
    }
};

export function getEntitlements(user) {
    if (!user) return plans.free;
    const planId = user.plan || 'free';
    return plans[planId] || plans.free;
}

export function getUserPlanState(user, trip) {
    const entitlements = getEntitlements(user);
    const tripsCount = user?.tripsCount || 0;
    
    // Evaluate rewards based on affiliate confirmation states
    const confirmedRewards = (user?.rewards || []).filter(r => r.state === 'confirmed');
    const hasRewardUnlock = confirmedRewards.length > 0;

    const canCreateTrip = entitlements.maxTrips > tripsCount || hasRewardUnlock;
    
    return {
        plan: user?.plan || 'free',
        canCreateTrip,
        entitlements,
        hasRewardUnlock
    };
}
