// tests/test_seo_programmatic.js — Test suite for Programmatic SEO Architecture
const assert = require('assert');

// Mock ES Module import for Node environment
import('../modules/seoProgrammaticEngine.js').then(async (seoModule) => {
  const { 
    slugify, 
    buildSeoRoutePath, 
    validateIndexationCriteria, 
    generateSeoStructuredData, 
    buildCloneCtaUrl 
  } = seoModule;

  const analyticsModule = await import('../modules/analytics.js');
  const { EVENTS } = analyticsModule;

  console.log('🧪 Running Programmatic SEO Architecture Test Suite...\n');

  // ── Test 1: Programmatic Route Path Construction ─────────────────────────────
  {
    console.log('Test 1: Programmatic Route Path Construction');

    assert.strictEqual(buildSeoRoutePath('Buenos Aires'), '/roteiros/buenos-aires');
    assert.strictEqual(buildSeoRoutePath('Roma', 5), '/roteiros/roma/5-dias');
    assert.strictEqual(buildSeoRoutePath('Nova York', 7, 'roma-5-dias-classico'), '/roteiro/roma-5-dias-classico');

    console.log('  ✅ Programmatic route patterns verified (/roteiros/[destino], /roteiros/[destino]/[dias], /roteiro/[slug]).');
  }

  // ── Test 2: Indexation Criteria & Thin Content Prevention ───────────────────
  {
    console.log('\nTest 2: Indexation Criteria & Thin Content Prevention');

    const thinRoute = {
      destination: 'Destino Raso',
      durationDays: 1,
      itinerary: [{ title: 'Dia 1', activities: [{ title: 'Atividade Única' }] }]
    };

    const thinResult = validateIndexationCriteria(thinRoute);
    assert.strictEqual(thinResult.shouldIndex, false, 'Thin content with < 3 activities must NOT be indexed');

    const richRoute = {
      destination: 'Roma',
      durationDays: 3,
      itinerary: [
        { title: 'Dia 1', activities: [{ title: 'Coliseu' }, { title: 'Fórum' }] },
        { title: 'Dia 2', activities: [{ title: 'Vaticano' }, { title: 'Panteão' }] }
      ]
    };

    const richResult = validateIndexationCriteria(richRoute);
    assert.strictEqual(richResult.shouldIndex, true, 'Rich content must be approved for indexation');

    console.log('  ✅ Thin content correctly blocked from indexation.');
  }

  // ── Test 3: Schema.org Structured Data Generation ───────────────────────────
  {
    console.log('\nTest 3: Official Schema.org Structured Data Generation');

    const routeData = {
      destination: 'Roma',
      durationDays: 5,
      title: 'Roteiro de 5 Dias em Roma',
      description: 'Guia completo de 5 dias em Roma.',
      itinerary: [
        { title: 'Dia 1', activities: [{ title: 'Coliseu' }] }
      ]
    };

    const schemas = generateSeoStructuredData(routeData);
    assert.strictEqual(schemas.length, 3, 'Must generate 3 schema objects (BreadcrumbList, TouristDestination, TouristTrip)');

    const breadcrumb = schemas.find(s => s['@type'] === 'BreadcrumbList');
    const dest = schemas.find(s => s['@type'] === 'TouristDestination');
    const trip = schemas.find(s => s['@type'] === 'TouristTrip');

    assert.ok(breadcrumb, 'BreadcrumbList schema must exist');
    assert.ok(dest, 'TouristDestination schema must exist');
    assert.ok(trip, 'TouristTrip schema must exist');

    console.log('  ✅ Validated Google-supported Schema.org structured data.');
  }

  // ── Test 4: Conversion CTA URL Construction ─────────────────────────────────
  {
    console.log('\nTest 4: Conversion CTA URL Construction ("Personalizar este Roteiro")');

    const routeData = { destination: 'Buenos Aires', durationDays: 3 };
    const ctaUrl = buildCloneCtaUrl(routeData);

    assert.ok(ctaUrl.includes('action=customize_seo'), 'CTA URL must trigger customize_seo action');
    assert.ok(ctaUrl.includes('destination=Buenos%20Aires'), 'CTA URL must encode destination');

    console.log('  ✅ CTA conversion URL verified.');
  }

  // ── Test 5: SEO Analytics Funnel Taxonomy ───────────────────────────────────
  {
    console.log('\nTest 5: SEO Analytics Funnel Taxonomy Verification');

    assert.strictEqual(EVENTS.SEO_LANDING_VIEW, 'seo_landing_view');
    assert.strictEqual(EVENTS.ITINERARY_CLONE_STARTED, 'itinerary_clone_started');
    assert.strictEqual(EVENTS.SIGNUP_FROM_ITINERARY, 'signup_from_itinerary');
    assert.strictEqual(EVENTS.TRIP_CREATED_FROM_ITINERARY, 'trip_created_from_itinerary');

    console.log('  ✅ Analytics funnel taxonomy verified.');
  }

  console.log('\n🎉 ALL PROGRAMMATIC SEO TESTS PASSED 100% GREEN!');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
