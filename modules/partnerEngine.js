export const partnerConfig = {
    enabled: true,
    categories: ['hotel', 'insurance', 'esim', 'flight', 'car_rental'],
    priority: {
        'esim': 1,
        'insurance': 2,
        'hotel': 3,
        'flight': 4,
        'car_rental': 5
    },
    partners: {
        'booking': {
            id: 'booking',
            name: 'Booking.com',
            category: 'hotel',
            baseUrl: 'https://www.booking.com/',
            trackingParam: 'aid',
            trackingValue: '123456',
            commissionRule: '5% on stay'
        },
        'safetywing': {
            id: 'safetywing',
            name: 'SafetyWing',
            category: 'insurance',
            baseUrl: 'https://safetywing.com/',
            trackingParam: 'referenceID',
            trackingValue: 'myref',
            commissionRule: '10% on policy'
        },
        'airalo': {
            id: 'airalo',
            name: 'Airalo',
            category: 'esim',
            baseUrl: 'https://www.airalo.com/',
            trackingParam: 'ref',
            trackingValue: 'myref',
            commissionRule: '$3 per sale'
        }
    }
};

export function buildAffiliateLink(partnerId, trip, query = {}) {
    const partner = partnerConfig.partners[partnerId];
    if (!partner) return null;

    try {
        const url = new URL(partner.baseUrl);
        url.searchParams.set(partner.trackingParam, partner.trackingValue);

        // Append safe query params
        for (const key in query) {
            if (query.hasOwnProperty(key)) {
                // Strip scripts or malicious payloads
                let val = String(query[key]);
                val = val.replace(/<[^>]*>?/gm, ''); // simple html strip
                url.searchParams.set(key, val);
            }
        }
        
        // Prevent javascript: urls just in case someone injected it into baseUrl
        if (url.protocol === 'javascript:') {
            return null;
        }

        return url.toString();
    } catch (e) {
        console.error('Error building affiliate link:', e);
        return null;
    }
}

export function evaluateTripOpportunities(trip) {
    const opportunities = [];
    if (!trip || !trip.data) return opportunities;

    const hasHotel = trip.data.logistics?.some(l => l.type === 'accommodation');
    const hasInsurance = trip.data.logistics?.some(l => l.type === 'insurance');
    
    if (!hasHotel) {
        opportunities.push({ category: 'hotel', partnerId: 'booking', message: 'Need a hotel?' });
    }
    if (!hasInsurance) {
        opportunities.push({ category: 'insurance', partnerId: 'safetywing', message: 'Travel insurance recommended.' });
    }
    
    // Sort by priority
    opportunities.sort((a, b) => {
        return (partnerConfig.priority[a.category] || 99) - (partnerConfig.priority[b.category] || 99);
    });

    return opportunities;
}

export const analytics = {
    events: [],
    track(action, data) {
        const event = { action, data, timestamp: Date.now() };
        this.events.push(event);
        console.log(`[Analytics] ${action}`, data);
    }
};
