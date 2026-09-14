// modules/seoProgrammaticEngine.js — Programmatic SEO Engine for CoPiloto de Viagem

export const SEO_ENGINE_VERSION = 1;

/**
 * Normalizes text string to clean URL slug
 */
export function slugify(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Constructs programmatic SEO route paths
 * Supports:
 * - /roteiros/[destino]
 * - /roteiros/[destino]/[dias]
 * - /roteiro/[slug]
 */
export function buildSeoRoutePath(destination, durationDays = null, customSlug = null) {
  const destSlug = slugify(destination || 'destino');
  if (customSlug) {
    return `/roteiro/${slugify(customSlug)}`;
  }
  if (durationDays && Number(durationDays) > 0) {
    return `/roteiros/${destSlug}/${durationDays}-dias`;
  }
  return `/roteiros/${destSlug}`;
}

/**
 * Evaluates whether a route has sufficient quality content for search indexation.
 * Prevents thin/low-quality content from polluting indexation.
 */
export function validateIndexationCriteria(routeData) {
  if (!routeData || typeof routeData !== 'object') {
    return { shouldIndex: false, reason: 'Dados ausentes' };
  }

  const destName = routeData.destination || routeData.destination_city || '';
  const hasDestination = typeof destName === 'string' && destName.trim().length >= 3;
  const itinerary = Array.isArray(routeData.itinerary) ? routeData.itinerary : [];
  const totalActivities = itinerary.reduce((sum, day) => sum + (Array.isArray(day.activities) ? day.activities.length : 0), 0);

  if (!hasDestination) {
    return { shouldIndex: false, reason: 'Nome de destino inválido' };
  }

  if (itinerary.length === 0 || totalActivities < 3) {
    return { shouldIndex: false, reason: 'Thin content: Itinerário possui menos de 3 atividades detalhadas.' };
  }

  return { shouldIndex: true, reason: 'Conteúdo qualificado para indexação' };
}

/**
 * Generates official Google-supported Schema.org Structured Data
 * - BreadcrumbList
 * - TouristDestination
 * - TouristTrip / ItemList
 */
export function generateSeoStructuredData(routeData) {
  if (!routeData) return [];

  const canonicalUrl = `https://copilotodeviagem.com.br${buildSeoRoutePath(routeData.destination, routeData.durationDays, routeData.slug)}`;
  const destName = routeData.destination || 'Destino';
  const duration = routeData.durationDays ? `${routeData.durationDays} dias` : 'Dias';

  // 1. BreadcrumbList
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://copilotodeviagem.com.br/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Roteiros', 'item': 'https://copilotodeviagem.com.br/roteiros' },
      { '@type': 'ListItem', 'position': 3, 'name': destName, 'item': `https://copilotodeviagem.com.br/roteiros/${slugify(destName)}` }
    ]
  };

  if (routeData.durationDays) {
    breadcrumb.itemListElement.push({
      '@type': 'ListItem',
      'position': 4,
      'name': `${routeData.durationDays} Dias`,
      'item': canonicalUrl
    });
  }

  // 2. TouristDestination
  const destinationSchema = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    'name': destName,
    'description': routeData.description || `Guia completo de viagem para ${destName}.`,
    'touristType': ['Cultural', 'Leisure']
  };

  // 3. TouristTrip / ItemList
  const itinerary = Array.isArray(routeData.itinerary) ? routeData.itinerary : [];
  const tripSchema = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    'name': routeData.title || `Roteiro de ${duration} em ${destName}`,
    'description': routeData.description || `Roteiro detalhado para aproveitar ${destName}.`,
    'url': canonicalUrl,
    'itinerary': {
      '@type': 'ItemList',
      'numberOfItems': itinerary.length,
      'itemListElement': itinerary.map((day, idx) => ({
        '@type': 'ListItem',
        'position': idx + 1,
        'name': day.title || `Dia ${idx + 1}`,
        'description': (day.activities || []).map(a => typeof a === 'string' ? a : a.title).join(', ')
      }))
    }
  };

  return [breadcrumb, destinationSchema, tripSchema];
}

/**
 * Builds CTA redirection URL to launch app with pre-filled destination/clone payload
 */
export function buildCloneCtaUrl(routeData) {
  const dest = encodeURIComponent(routeData.destination || '');
  const days = routeData.durationDays || '';
  const slug = routeData.slug ? encodeURIComponent(routeData.slug) : '';
  return `/app.html?action=customize_seo&destination=${dest}&days=${days}&slug=${slug}`;
}

export default {
  slugify,
  buildSeoRoutePath,
  validateIndexationCriteria,
  generateSeoStructuredData,
  buildCloneCtaUrl,
  SEO_ENGINE_VERSION
};
