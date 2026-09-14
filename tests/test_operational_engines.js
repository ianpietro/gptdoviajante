// tests/test_operational_engines.js — Test suite for Proactive, Risk, and Replanning Engines
const assert = require('assert');

// Mock ES Module imports for Node environment
import('../modules/riskEngine.js').then(async (riskEngineModule) => {
  const { detectTripRisks } = riskEngineModule;
  const proactiveEngineModule = await import('../modules/proactiveEngine.js');
  const { buildProactiveInsights, filterInactiveInsights } = proactiveEngineModule;
  const replanningEngineModule = await import('../modules/replanningEngine.js');
  const { generateReplanningProposal, applyReplanningProposal } = replanningEngineModule;
  const actionEngineModule = await import('../modules/actionEngine.js');
  const { applyActions, undoLastActions } = actionEngineModule;

  console.log('🧪 Running Operational Engines (Proactive, Risk & Replanning) Test Suite...\n');

  // ── Test 1: Clean Trip State (Zero False Positives) ──────────────────────────
  {
    console.log('Test 1: Clean Trip State (Zero False Positives)');
    const cleanTrip = {
      id: 'clean_trip_123',
      tripTitle: 'Viagem Perfeita em Roma',
      status: 'planning',
      start_date: '2026-10-10',
      end_date: '2026-10-17',
      hotel: 'Hotel Roma Centro',
      infoDates: '10 a 17 de Outubro',
      budget: { hospedagem: 2000, alimentacao: 1000 },
      flights: [
        { flightNumber: 'AZ100', scheduledDeparture: '08:00', scheduledArrival: '12:00', date: '2026-10-10', type: 'arrival' },
        { flightNumber: 'AZ200', scheduledDeparture: '18:00', scheduledArrival: '22:00', date: '2026-10-17', type: 'departure' }
      ],
      accommodations: [
        { hotelName: 'Hotel Roma Centro', checkInDate: '2026-10-10', checkOutDate: '2026-10-17' }
      ],
      itinerary: [
        {
          day: '2026-10-11',
          activities: [
            { time: '10:00', title: 'Coliseu', durationMins: 120 },
            { time: '14:00', title: 'Fórum Romano', durationMins: 120 }
          ]
        }
      ],
      packing: [
        { category: 'Roupas', items: [{ name: 'Camisa', checked: true }] }
      ],
      expenses: [{ amount: 100, desc: 'Almoço' }]
    };

    const risks = detectTripRisks(cleanTrip);
    assert.strictEqual(risks.length, 0, 'Clean trip should have zero detected risks (no false positives)');

    console.log('  ✅ Zero false positives confirmed for clean trip.');
  }

  // ── Test 2: Conflict & Risk Engine — Schedule Overlap & Insufficient Transfer
  {
    console.log('\nTest 2: Risk Engine — Schedule Overlap & Incompatible Travel');
    const conflictedTrip = {
      id: 'conflict_trip',
      status: 'planning',
      start_date: '2026-10-10',
      end_date: '2026-10-17',
      itinerary: [
        {
          day: '2026-10-12',
          activities: [
            { time: '10:00', title: 'Visita à Torre Eiffel em Paris', location: 'Paris', durationMins: 90, isFixed: true },
            { time: '10:30', title: 'Passeio no Palácio de Versailles', location: 'Versailles', durationMins: 120 }
          ]
        }
      ]
    };

    const risks = detectTripRisks(conflictedTrip);
    assert.ok(risks.length >= 1, 'Should detect at least 1 risk for schedule overlap');
    const overlapRisk = risks.find(r => r.type === 'SCHEDULE_CONFLICT');
    assert.ok(overlapRisk, 'Must find SCHEDULE_CONFLICT risk');
    assert.strictEqual(overlapRisk.severity, 'critical', 'Overlap involving fixed activity must be critical');
    assert.ok(overlapRisk.evidence.length >= 2, 'Evidence array must explain the overlapping times');

    console.log('  ✅ Schedule overlap and severity escalation verified.');
  }

  // ── Test 3: Risk Engine — Activity Before Flight Arrival ─────────────────────
  {
    console.log('\nTest 3: Risk Engine — Activity Before Flight Arrival');
    const flightConflictTrip = {
      id: 'flight_conflict',
      status: 'planning',
      start_date: '2026-10-10',
      end_date: '2026-10-15',
      flights: [
        { flightNumber: 'AF443', scheduledDeparture: '00:05', scheduledArrival: '14:00', date: '2026-10-10', type: 'arrival' }
      ],
      itinerary: [
        {
          day: '2026-10-10',
          activities: [
            { time: '11:00', title: 'Almoço de Boas Vindas no Centro' }
          ]
        }
      ]
    };

    const risks = detectTripRisks(flightConflictTrip);
    const flightRisk = risks.find(r => r.type === 'ACTIVITY_BEFORE_ARRIVAL');
    assert.ok(flightRisk, 'Must detect activity scheduled before flight landing');
    assert.strictEqual(flightRisk.severity, 'critical');

    console.log('  ✅ Activity before flight arrival risk detected successfully.');
  }

  // ── Test 4: Risk Engine — Hotel Gap & Early Checkout ────────────────────────
  {
    console.log('\nTest 4: Risk Engine — Hotel Ends Early');
    const hotelGapTrip = {
      id: 'hotel_gap_trip',
      status: 'planning',
      start_date: '2026-10-10',
      end_date: '2026-10-17',
      accommodations: [
        { hotelName: 'Hotel Paris', checkInDate: '2026-10-10', checkOutDate: '2026-10-14' }
      ]
    };

    const risks = detectTripRisks(hotelGapTrip);
    const hotelRisk = risks.find(r => r.type === 'HOTEL_ENDS_EARLY' || r.type === 'HOTEL_GAP');
    assert.ok(hotelRisk, 'Must detect hotel gap before trip end');
    assert.strictEqual(hotelRisk.severity, 'critical');

    console.log('  ✅ Hotel gap / early check-out risk verified.');
  }

  // ── Test 5: Replanning Engine — "Plan Before Apply" Proposal ─────────────────
  {
    console.log('\nTest 5: Replanning Engine — Proposal Generation (Plan Before Apply)');
    const tripToReplan = {
      id: 'replan_test',
      status: 'planning',
      start_date: '2026-10-10',
      end_date: '2026-10-15',
      flights: [
        { flightNumber: 'AD4132', date: '2026-10-10' }
      ],
      accommodations: [
        { hotelName: 'Hotel Lux', checkInDate: '2026-10-10', checkOutDate: '2026-10-15' }
      ],
      itinerary: [
        {
          day: '2026-10-11',
          activities: [
            { time: '10:00', title: 'Caminhada no Parque e Jardim', isOutdoor: true }
          ]
        },
        {
          day: '2026-10-12',
          activities: []
        }
      ]
    };

    const proposal = generateReplanningProposal(tripToReplan, 'weather_incompatible', {
      weatherInfo: 'Chuva para o dia 2026-10-11'
    });

    assert.ok(proposal.id.startsWith('prop_replan_'), 'Proposal must have unique ID');
    assert.strictEqual(proposal.trigger, 'weather_incompatible');
    assert.ok(proposal.kept.length >= 2, 'Fixed flight and hotel must be preserved in kept array');
    assert.ok(proposal.moved.length >= 1, 'Outdoor activity must be in moved array');
    assert.ok(proposal.newSuggestions.length >= 1, 'Indoor alternative must be suggested');
    assert.ok(Array.isArray(proposal.actions), 'Proposal must contain Action Engine actions array');

    console.log('  ✅ Replanning proposal generated with fixed items preserved.');
  }

  // ── Test 6: Replanning Engine Application & Undo Integrity ─────────────────
  {
    console.log('\nTest 6: Proposal Application via Action Engine & Exact Undo Restoration');
    const originalTrip = {
      id: 'undo_test_trip',
      status: 'planning',
      tripTitle: 'Viagem Original',
      itinerary: [
        { day: '2026-10-11', activities: [{ time: '10:00', title: 'Atividade Original A' }] }
      ],
      activity_log: [],
      undoStack: []
    };

    const proposal = generateReplanningProposal(originalTrip, 'user_request');
    
    // Save state before modification (mimicking saveState push to undoStack)
    const tripToModify = JSON.parse(JSON.stringify(originalTrip));
    tripToModify.undoStack.push(JSON.stringify(originalTrip));

    // Apply proposal
    const updatedTrip = applyReplanningProposal(tripToModify, proposal);
    assert.ok(updatedTrip.undoStack.length >= 1, 'Undo stack must retain prior state');

    // Undo action
    const restoredTrip = undoLastActions(updatedTrip);
    assert.strictEqual(restoredTrip.tripTitle, 'Viagem Original');
    assert.strictEqual(restoredTrip.itinerary[0].activities[0].title, 'Atividade Original A', 'Undo must restore exact previous activity title');

    console.log('  ✅ Proposal applied via Action Engine and restored via Undo successfully.');
  }

  console.log('\n🎉 ALL OPERATIONAL ENGINE TESTS PASSED 100% GREEN!');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
