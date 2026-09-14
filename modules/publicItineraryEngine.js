// modules/publicItineraryEngine.js — Public & Cloneable Itineraries Engine for CoPiloto de Viagem

export const PUBLIC_ENGINE_VERSION = 1;

/**
 * Sanitizes a private trip and returns a strictly scrubbed PublicItineraryModel.
 * GUARANTEE: Never exposes PII, documents, expenses, booking references, or emails.
 * 
 * @param {object} trip
 * @param {object} options - { title, description, publicAuthorName }
 * @returns {object} PublicItineraryModel
 */
export function generatePublicItineraryModel(trip, options = {}) {
  if (!trip || typeof trip !== 'object') {
    throw new Error('Trip data is required to generate public model.');
  }

  const publicId = `pub_${trip.id || Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const destination = trip.destination || trip.tripTitle || 'Destino de Viagem';
  const durationDays = Array.isArray(trip.itinerary) ? trip.itinerary.length : 1;

  // Sanitize itinerary: keep only titles, descriptions, times and public places
  const publicItinerary = (trip.itinerary || []).map((day, idx) => {
    const activities = (day.activities || []).map(act => {
      const title = typeof act === 'string' ? act : (act.title || act.name || 'Atividade');
      const time = typeof act === 'object' ? act.time : null;
      const locationName = typeof act === 'object' && act.location ? (typeof act.location === 'string' ? act.location : act.location.name) : null;
      return {
        title,
        time,
        locationName
      };
    });

    return {
      dayIndex: idx + 1,
      title: day.title || `Dia ${idx + 1}`,
      activities
    };
  });

  return {
    publicId,
    originalTripId: trip.id || 'local',
    title: options.title || `Roteiro em ${destination}`,
    destination,
    durationDays,
    authorName: options.publicAuthorName || 'Viajante CoPiloto',
    description: options.description || `Roteiro incrível de ${durationDays} dias em ${destination}.`,
    itinerary: publicItinerary,
    tips: Array.isArray(trip.tips) ? trip.tips : ['Reserve ingressos com antecedência.', 'Aproveite a gastronomia local.'],
    publishedAt: new Date().toISOString()
  };
}

/**
 * Clones a public itinerary into a brand new private trip state for a target user.
 * ZERO connection maintained between original and cloned trip state.
 * 
 * @param {object} publicItinerary
 * @param {object} targetUser - { id, email }
 * @param {object} customOptions - { start_date, title }
 * @returns {object} newTripState
 */
export function clonePublicItinerary(publicItinerary, targetUser = {}, customOptions = {}) {
  if (!publicItinerary || !Array.isArray(publicItinerary.itinerary)) {
    throw new Error('Valid public itinerary is required for cloning.');
  }

  const newTripId = `trip_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startDate = customOptions.start_date || new Date().toISOString().slice(0, 10);

  const itinerary = publicItinerary.itinerary.map((day, idx) => {
    // Calculate date for each day starting from startDate
    const dayDate = new Date(Date.parse(startDate) + idx * 86400000).toISOString().slice(0, 10);
    return {
      day: dayDate,
      date: dayDate,
      title: day.title,
      activities: (day.activities || []).map(act => ({
        title: act.title,
        time: act.time,
        location: act.locationName
      }))
    };
  });

  return {
    id: newTripId,
    tripTitle: customOptions.title || `Meu Roteiro em ${publicItinerary.destination}`,
    destination: publicItinerary.destination,
    status: 'planning',
    start_date: startDate,
    end_date: new Date(Date.parse(startDate) + (publicItinerary.durationDays - 1) * 86400000).toISOString().slice(0, 10),
    infoDates: `${publicItinerary.durationDays} dias`,
    hotel: '',
    budget: { hospedagem: 0, alimentacao: 0, passeios: 0, transporte: 0 },
    flights: [],
    accommodations: [],
    reservations: [],
    packing: [
      { category: 'Essenciais', items: [{ name: 'Documento de Identidade', checked: false }] }
    ],
    expenses: [],
    documents: [],
    itinerary,
    attribution: {
      is_cloned: true,
      source_itinerary_id: publicItinerary.publicId,
      source_creator: publicItinerary.authorName,
      cloned_at: new Date().toISOString()
    },
    created_at: new Date().toISOString()
  };
}

/**
 * Generates Schema.org JSON-LD structured data for SEO indexing
 * @param {object} publicItinerary
 * @returns {object} JSON-LD object
 */
export function generateItineraryJsonLd(publicItinerary) {
  if (!publicItinerary) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    'name': publicItinerary.title,
    'description': publicItinerary.description,
    'touristType': ['Leisure', 'Culture'],
    'itinerary': {
      '@type': 'ItemList',
      'numberOfItems': publicItinerary.durationDays,
      'itemListElement': publicItinerary.itinerary.map((day, idx) => ({
        '@type': 'ListItem',
        'position': idx + 1,
        'name': day.title,
        'description': (day.activities || []).map(a => a.title).join(', ')
      }))
    }
  };
}

export default {
  generatePublicItineraryModel,
  clonePublicItinerary,
  generateItineraryJsonLd,
  PUBLIC_ENGINE_VERSION
};
