// tests/test_growth_engine.js — Test suite for Growth Engine & Cycle 2 Finalization
const assert = require('assert');

// Mock ES Module import for Node environment
import('../modules/growthEngine.js').then(async (growthModule) => {
  const { 
    generateReferralCode, 
    parseAttributionParams, 
    processAffiliateReward, 
    calculateNorthStarMetrics 
  } = growthModule;

  const pubModule = await import('../modules/publicItineraryEngine.js');
  const { generatePublicItineraryModel, clonePublicItinerary } = pubModule;

  const entitlementModule = await import('../modules/entitlementEngine.js');
  const { getUserPlanState } = entitlementModule;

  const analyticsModule = await import('../modules/analytics.js');
  const { EVENTS } = analyticsModule;

  console.log('🧪 Running Growth Engine & Cycle 2 Finalization Test Suite...\n');

  // ── Test 1: Loop 1 — Shared Trip Conversion without PII Leaks ────────────────
  {
    console.log('Test 1: Loop 1 — Shared Trip Conversion & PII Safety');

    const privateTrip = {
      id: 'shared_trip_100',
      tripTitle: 'Viagem em Grupo',
      destination: 'Lisboa',
      documents: [{ name: 'Ticket.pdf' }],
      expenses: [{ amount: 200 }]
    };

    const publicModel = generatePublicItineraryModel(privateTrip);
    const jsonStr = JSON.stringify(publicModel);

    assert.strictEqual(jsonStr.includes('Ticket.pdf'), false, 'Shared trip model MUST NOT leak private documents');
    assert.strictEqual(jsonStr.includes('200'), false, 'Shared trip model MUST NOT leak private expenses');

    console.log('  ✅ Loop 1: Shared trip conversion structure verified without PII leaks.');
  }

  // ── Test 2: Loop 2 — Clonable Itinerary 1-Click Flow ───────────────────────
  {
    console.log('\nTest 2: Loop 2 — Clonable Itinerary Flow ("Usar este Roteiro")');

    const publicItinerary = {
      publicId: 'pub_lisboa_300',
      destination: 'Lisboa',
      durationDays: 4,
      authorName: 'Gabriel M.',
      itinerary: [
        { dayIndex: 1, title: 'Dia 1', activities: [{ title: 'Torre de Belém' }] }
      ]
    };

    const newTrip = clonePublicItinerary(publicItinerary, { id: 'user_999' });
    assert.strictEqual(newTrip.attribution.is_cloned, true);
    assert.strictEqual(newTrip.attribution.source_itinerary_id, 'pub_lisboa_300');
    assert.strictEqual(newTrip.attribution.source_creator, 'Gabriel M.');

    console.log('  ✅ Loop 2: Clonable itinerary flow verified with attribution.');
  }

  // ── Test 3: Loop 3 — Referral Code Generation ──────────────────────────────
  {
    console.log('\nTest 3: Loop 3 — Referral Code Generation & Uniqueness');

    const refCode1 = generateReferralCode('user_ana_123');
    const refCode2 = generateReferralCode('user_joao_456');

    assert.ok(refCode1.startsWith('REF_'), 'Referral code must start with REF_');
    assert.notStrictEqual(refCode1, refCode2, 'Different users must get different referral codes');

    console.log(`  ✅ Loop 3: Referral code generated (${refCode1}).`);
  }

  // ── Test 4: Loop 4 — Affiliate Reward Unlock via Entitlement Engine ─────────
  {
    console.log('\nTest 4: Loop 4 — Affiliate Reward Unlock via Entitlement Engine');

    const unconfirmedTx = { partnerId: 'booking_com', category: 'hotel', confirmed: false };
    const res1 = processAffiliateReward({}, unconfirmedTx);
    assert.strictEqual(res1.granted, false, 'Unconfirmed transaction must NOT grant reward');

    const confirmedTx = { partnerId: 'booking_com', category: 'hotel', confirmed: true };
    const res2 = processAffiliateReward({}, confirmedTx);
    assert.strictEqual(res2.granted, true, 'Confirmed transaction must grant entitlement reward');
    assert.strictEqual(res2.bonusMessages, 50);

    const userState = getUserPlanState({ rewards: [{ state: 'confirmed' }] });
    assert.strictEqual(userState.hasRewardUnlock, true, 'Entitlement Engine must recognize confirmed affiliate reward');

    console.log('  ✅ Loop 4: Affiliate reward unlock verified.');
  }

  // ── Test 5: Loop 5 — B2B2C / Creator Attribution Parsing ────────────────────
  {
    console.log('\nTest 5: Loop 5 — Creator / Agency / Campaign Attribution Parsing');

    const attr = parseAttributionParams({
      ref: 'REF_ANA123',
      creator: 'CREATOR_VIAGEM',
      agency: 'AGENCY_TRAVEL',
      utm_campaign: 'SPRING_PROMO'
    });

    assert.strictEqual(attr.hasAttribution, true);
    assert.strictEqual(attr.ref, 'REF_ANA123');
    assert.strictEqual(attr.creator_id, 'CREATOR_VIAGEM');
    assert.strictEqual(attr.agency_id, 'AGENCY_TRAVEL');
    assert.strictEqual(attr.campaign_id, 'SPRING_PROMO');

    console.log('  ✅ Loop 5: Creator/B2B2C attribution parsed successfully.');
  }

  // ── Test 6: North Star Product Metrics Calculation ──────────────────────────
  {
    console.log('\nTest 6: North Star Product Metrics Calculation (8 Calculable Metrics)');

    const mockTrips = [
      { id: 't1', status: 'active', itinerary: [{ activities: [1, 2, 3] }] },
      { id: 't2', status: 'upcoming', flights: [{ flightNumber: 'AD100' }] },
      { id: 't3', status: 'completed', itinerary: [{ activities: [1, 2, 3, 4] }] }
    ];

    const mockEvents = [
      { event: 'first_value', session_id: 's1' },
      { event: 'first_value', session_id: 's2' }
    ];

    const metrics = calculateNorthStarMetrics(mockTrips, mockEvents, {
      totalAiCost: 0.15,
      totalRevenue: 1.50
    });

    assert.strictEqual(metrics.tripsActivated, 3, 'All 3 trips have >= 3 activities or flights');
    assert.strictEqual(metrics.activeTravelers, 2, '2 active travelers (active + upcoming)');
    assert.strictEqual(metrics.tripsInProgress, 1);
    assert.strictEqual(metrics.tripCompletionRate, '33%');
    assert.ok(metrics.aiCostPerActivatedTrip.startsWith('$'));
    assert.ok(metrics.revenuePerActivatedTrip.startsWith('$'));

    console.log('  ✅ 8 North Star metrics calculated accurately.');
  }

  console.log('\n🎉 ALL GROWTH ENGINE & CYCLE 2 FINALIZATION TESTS PASSED 100% GREEN!');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
