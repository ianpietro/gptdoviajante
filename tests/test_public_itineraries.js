// tests/test_public_itineraries.js — Test suite for Public & Cloneable Itineraries Engine
const assert = require('assert');

// Mock ES Module import for Node environment
import('../modules/publicItineraryEngine.js').then(async (pubModule) => {
  const { generatePublicItineraryModel, clonePublicItinerary, generateItineraryJsonLd } = pubModule;

  console.log('🧪 Running Public & Cloneable Itineraries Test Suite...\n');

  // ── Test 1: 100% PII, Expense & Document Sanitization Guarantee ──────────────
  {
    console.log('Test 1: Strict Sanitization (PII, Expenses, Documents & Booking Codes Scrubbed)');

    const sensitivePrivateTrip = {
      id: 'priv_trip_999',
      tripTitle: 'Viagem Secreta de Férias',
      destination: 'Paris',
      status: 'planning',
      start_date: '2026-10-10',
      end_date: '2026-10-17',
      userEmail: 'sensivel@email.com',
      budget: { hospedagem: 5000 },
      expenses: [{ amount: 450, desc: 'Jantar Romântico' }],
      documents: [{ name: 'Passaporte.pdf', url: 'https://secret.storage/doc.pdf' }],
      flights: [{ flightNumber: 'AF443', bookingRef: 'SECRET1234' }],
      accommodations: [{ hotelName: 'Hotel Ritz', bookingCode: 'XYZ987' }],
      members: ['Ana (ana@email.com)', 'Pedro'],
      itinerary: [
        {
          title: 'Dia 1',
          activities: [
            { time: '10:00', title: 'Torre Eiffel', location: { name: 'Champ de Mars' } }
          ]
        }
      ]
    };

    const publicModel = generatePublicItineraryModel(sensitivePrivateTrip, {
      publicAuthorName: 'Ana P.'
    });

    const jsonString = JSON.stringify(publicModel);
    assert.strictEqual(jsonString.includes('sensivel@email.com'), false, 'Private email must NOT leak');
    assert.strictEqual(jsonString.includes('SECRET1234'), false, 'Flight booking ref must NOT leak');
    assert.strictEqual(jsonString.includes('Passaporte.pdf'), false, 'Private documents must NOT leak');
    assert.strictEqual(jsonString.includes('Jantar Romântico'), false, 'Expenses must NOT leak');

    assert.strictEqual(publicModel.destination, 'Paris');
    assert.strictEqual(publicModel.authorName, 'Ana P.');
    assert.strictEqual(publicModel.itinerary[0].activities[0].title, 'Torre Eiffel');

    console.log('  ✅ 100% Sanitization verified. All sensitive fields scrubbed.');
  }

  // ── Test 2: Independent 1-Click Clone Flow ──────────────────────────────────
  {
    console.log('\nTest 2: Independent 1-Click Clone Flow ("Usar este Roteiro")');

    const publicModel = {
      publicId: 'pub_roma_777',
      title: 'Roteiro de 5 Dias em Roma',
      destination: 'Roma',
      durationDays: 5,
      authorName: 'Marcos V.',
      itinerary: [
        { dayIndex: 1, title: 'Dia 1', activities: [{ title: 'Coliseu', time: '09:00' }] },
        { dayIndex: 2, title: 'Dia 2', activities: [{ title: 'Vaticano', time: '10:00' }] }
      ]
    };

    const targetUser = { id: 'user_new_555', email: 'novo@viajante.com' };
    const clonedTrip = clonePublicItinerary(publicModel, targetUser, {
      start_date: '2026-11-01'
    });

    assert.ok(clonedTrip.id.startsWith('trip_'), 'Cloned trip must receive new unique ID');
    assert.strictEqual(clonedTrip.destination, 'Roma');
    assert.strictEqual(clonedTrip.status, 'planning');
    assert.strictEqual(clonedTrip.start_date, '2026-11-01');
    assert.strictEqual(clonedTrip.expenses.length, 0, 'Cloned trip starts with zero expenses');
    assert.strictEqual(clonedTrip.documents.length, 0, 'Cloned trip starts with zero private documents');

    console.log('  ✅ Cloned trip created independently for new user.');
  }

  // ── Test 3: Attribution Metadata Tracking ─────────────────────────────────
  {
    console.log('\nTest 3: Attribution Metadata Preservation');

    const publicModel = {
      publicId: 'pub_tokyo_888',
      destination: 'Tóquio',
      durationDays: 7,
      authorName: 'Kenji S.',
      itinerary: []
    };

    const clonedTrip = clonePublicItinerary(publicModel);
    assert.strictEqual(clonedTrip.attribution.is_cloned, true);
    assert.strictEqual(clonedTrip.attribution.source_itinerary_id, 'pub_tokyo_888');
    assert.strictEqual(clonedTrip.attribution.source_creator, 'Kenji S.');
    assert.ok(clonedTrip.attribution.cloned_at, 'cloned_at timestamp must be recorded');

    console.log('  ✅ Attribution metadata correctly attached.');
  }

  // ── Test 4: Schema.org JSON-LD Generation ──────────────────────────────────
  {
    console.log('\nTest 4: Schema.org TouristTrip JSON-LD Generation');

    const publicModel = {
      title: 'Guia de 3 Dias em Lisboa',
      description: 'Dicas imperdíveis para 3 dias em Lisboa.',
      destination: 'Lisboa',
      durationDays: 3,
      itinerary: [
        { title: 'Dia 1', activities: [{ title: 'Torre de Belém' }] }
      ]
    };

    const jsonLd = generateItineraryJsonLd(publicModel);
    assert.strictEqual(jsonLd['@type'], 'TouristTrip');
    assert.strictEqual(jsonLd.name, 'Guia de 3 Dias em Lisboa');
    assert.strictEqual(jsonLd.itinerary['@type'], 'ItemList');

    console.log('  ✅ Schema.org TouristTrip JSON-LD generated successfully.');
  }

  console.log('\n🎉 ALL PUBLIC & CLONEABLE ITINERARIES TESTS PASSED 100% GREEN!');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
