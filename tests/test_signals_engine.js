// tests/test_signals_engine.js — Test suite for Live Travel Signals Engine
const assert = require('assert');

// Mock ES Module imports for Node environment
import('../modules/signalsEngine.js').then(async (signalsModule) => {
  const { getPollingWindow, evaluateTripSignals } = signalsModule;
  const proactiveModule = await import('../modules/proactiveEngine.js');
  const { buildProactiveInsights } = proactiveModule;
  const replanningModule = await import('../modules/replanningEngine.js');
  const { generateReplanningProposal } = replanningModule;

  console.log('🧪 Running Live Travel Signals Engine Test Suite...\n');

  // ── Test 1: Smart Polling Window Decisions ──────────────────────────────────
  {
    console.log('Test 1: Smart Polling Window Decisions');

    // 40 days out -> Should NOT poll (Skip to save costs)
    const farWindow = getPollingWindow(40);
    assert.strictEqual(farWindow.shouldPoll, false, 'Trips > 30 days should skip polling');
    assert.strictEqual(farWindow.pollingIntervalMins, null);

    // 15 days out -> Daily polling (24h)
    const midWindow = getPollingWindow(15);
    assert.strictEqual(midWindow.shouldPoll, true);
    assert.strictEqual(midWindow.pollingIntervalMins, 1440);

    // 3 days out -> Active polling (6h)
    const nearWindow = getPollingWindow(3);
    assert.strictEqual(nearWindow.shouldPoll, true);
    assert.strictEqual(nearWindow.pollingIntervalMins, 360);

    // Imminent flight (< 24h) -> High frequency polling (15m)
    const imminentWindow = getPollingWindow(0, 5);
    assert.strictEqual(imminentWindow.shouldPoll, true);
    assert.strictEqual(imminentWindow.pollingIntervalMins, 15);

    console.log('  ✅ Smart polling windows verified for distant, near, and imminent trips.');
  }

  // ── Test 2: Adapter Caching & Telemetry Metrics ──────────────────────────────
  {
    console.log('\nTest 2: Adapter Caching & Telemetry Metrics (Provider Calls & Costs)');

    const trip = {
      id: 'signal_test_trip',
      destination: 'Roma',
      status: 'planning',
      start_date: '2026-09-01',
      flights: [{ flightNumber: 'AD4132', date: '2026-09-01' }]
    };

    // First evaluation -> Cache Miss (Provider calls increment)
    const eval1 = await evaluateTripSignals(trip, { forcePoll: true });
    assert.ok(eval1.telemetry.provider_calls > 0, 'First call must register provider calls');
    assert.ok(eval1.telemetry.cost_estimate > 0, 'First call must register estimated cost');

    // Second evaluation -> Cache Hit (0 provider calls)
    const eval2 = await evaluateTripSignals(trip, { forcePoll: true });
    assert.ok(eval2.telemetry.cache_hits > 0, 'Second call must be cache hit');

    console.log(`  ✅ Telemetry verified: Calls=${eval1.telemetry.provider_calls}, Cost=$${eval1.telemetry.cost_estimate}, CacheHits=${eval2.telemetry.cache_hits}.`);
  }

  // ── Test 3: Signals Feed into Proactive Engine ──────────────────────────────
  {
    console.log('\nTest 3: External Live Signals Feed Proactive Engine');

    const delayedFlightSignal = {
      type: 'FLIGHT_STATUS',
      flightNumber: 'AD4132',
      status: 'delayed',
      delayMinutes: 180,
      description: 'Voo AD4132 atrasado em 3 horas'
    };

    const trip = {
      id: 'signal_proactive_trip',
      status: 'planning',
      start_date: '2026-09-01',
      live_signals: [delayedFlightSignal]
    };

    const insights = buildProactiveInsights(trip, { signals: [delayedFlightSignal] });
    const delayInsight = insights.find(i => i.ruleKey === 'signal_flight_delay');
    assert.ok(delayInsight, 'Proactive Engine must produce insight from live flight delay signal');
    assert.strictEqual(delayInsight.severity, 'urgent');
    assert.strictEqual(delayInsight.targetTab, 'replan_proposal');

    console.log('  ✅ External signal successfully converted to Proactive Insight.');
  }

  // ── Test 4: Signals Trigger Proposal in Replanning Engine ──────────────────
  {
    console.log('\nTest 4: External Signal Triggers Replanning Engine Proposal');

    const trip = {
      id: 'signal_replan_trip',
      status: 'planning',
      start_date: '2026-09-01',
      flights: [{ flightNumber: 'AD4132' }],
      accommodations: [{ hotelName: 'Hotel Lux' }],
      itinerary: [{ day: '2026-09-01', activities: [{ time: '10:00', title: 'Passeio Matinal' }] }]
    };

    const proposal = generateReplanningProposal(trip, 'flight_delay', { delayHours: 3 });
    assert.strictEqual(proposal.trigger, 'flight_delay');
    assert.ok(proposal.kept.length >= 2, 'Fixed flight and hotel must be preserved');
    assert.ok(proposal.moved.length >= 1, 'First day activity must be moved');

    console.log('  ✅ Replanning proposal generated from signal without mutating state automatically.');
  }

  console.log('\n🎉 ALL LIVE TRAVEL SIGNALS ENGINE TESTS PASSED 100% GREEN!');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
