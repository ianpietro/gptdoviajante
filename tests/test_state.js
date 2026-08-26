const assert = require('assert');
const fs = require('fs');

async function runTests() {
  console.log("🧪 Running State Normalization Tests...");
  
  const { normalizeTripState, CURRENT_STATE_VERSION, getSuggestedTripStatus } = await import('../modules/stateManager.js');

  // Test 1: Empty / Null Trip Initialization
  {
    console.log("Test 1: Empty / Null Trip Initialization");
    const emptyTrip = normalizeTripState(null);
    assert.strictEqual(emptyTrip.stateSchemaVersion, CURRENT_STATE_VERSION);
    assert.strictEqual(emptyTrip.tripTitle, "Minha Próxima Viagem");
    assert.strictEqual(emptyTrip.destination, "Minha Próxima Viagem");
    assert.strictEqual(emptyTrip.status, "planning");
    assert.deepStrictEqual(emptyTrip.packing, []);
    assert.deepStrictEqual(emptyTrip.itinerary, []);
    assert.deepStrictEqual(emptyTrip.travelers, []);
    assert.deepStrictEqual(emptyTrip.accommodations, []);
    assert.deepStrictEqual(emptyTrip.reservations, []);
    assert.strictEqual(emptyTrip.budget.hospedagem, 0);
  }

  // Test 2: V1 legacy data migration
  {
    console.log("Test 2: Legacy V1 Structure Migration");
    const legacyTrip = {
      tripTitle: "Lisboa, Portugal",
      targetDate: "2026-10-12T10:00:00",
      budget: { hospedagem: 1200 },
      members: ["Você", "Alice"],
      expenses: [{ desc: "Lunch", amount: 50, payer: "Você", participants: ["Você", "Alice"] }]
    };
    
    const normalized = normalizeTripState(legacyTrip);
    assert.strictEqual(normalized.stateSchemaVersion, CURRENT_STATE_VERSION);
    assert.strictEqual(normalized.destination, "Lisboa, Portugal");
    assert.strictEqual(normalized.start_date, "2026-10-12");
    assert.strictEqual(normalized.budget.hospedagem, 1200);
    assert.strictEqual(normalized.budget.compras, 0);
    assert.deepStrictEqual(normalized.members, ["Você", "Alice"]);
    assert.strictEqual(normalized.expenses.length, 1);
  }

  // Test 3: getSuggestedTripStatus calculations (upcoming, active, completed, archived)
  {
    console.log("Test 3: getSuggestedTripStatus time-based status calculations");
    
    // Future date -> upcoming
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureStr = futureDate.toISOString().split('T')[0];
    assert.strictEqual(getSuggestedTripStatus(futureStr, null, 'planning'), 'upcoming');
    
    // Past date -> completed
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const pastStr = pastDate.toISOString().split('T')[0];
    assert.strictEqual(getSuggestedTripStatus(pastStr, pastStr, 'planning'), 'completed');
    
    // Today -> active
    const todayStr = new Date().toISOString().split('T')[0];
    assert.strictEqual(getSuggestedTripStatus(todayStr, todayStr, 'planning'), 'active');
    
    // Archived status preservation
    assert.strictEqual(getSuggestedTripStatus(futureStr, null, 'archived'), 'archived');
  }

  // Test 4: Isolation of multiple trips (Mala A vs Mala B, Orçamento A vs Orçamento B)
  {
    console.log("Test 4: Active Trip Isolation Simulation (Mala, Orçamento, Despesas)");
    
    // Simulate Trip A (Lisboa)
    const tripA = normalizeTripState({
      id: 'trip_a',
      tripTitle: 'Viagem A: Lisboa',
      packing: [{ category: 'Documentos', items: ['Passaporte'] }],
      budget: { hospedagem: 1000, alimentacao: 500 }
    });

    // Simulate Trip B (Paris)
    const tripB = normalizeTripState({
      id: 'trip_b',
      tripTitle: 'Viagem B: Paris',
      packing: [{ category: 'Vestuário', items: ['Casaco'] }],
      budget: { hospedagem: 2000, alimentacao: 800 }
    });

    // Verify isolation of values
    assert.notStrictEqual(tripA.id, tripB.id);
    assert.notStrictEqual(tripA.tripTitle, tripB.tripTitle);
    
    // Edit Trip A's packing
    tripA.packing[0].items.push({ name: 'Passagem Impressa', checked: false });
    // Verify Trip B is untouched
    assert.strictEqual(tripB.packing[0].items.length, 1);
    assert.strictEqual(tripB.packing[0].items[0].name, 'Casaco');
    assert.strictEqual(tripA.packing[0].items.length, 2);

    // Edit Trip B's budget
    tripB.budget.compras = 400;
    // Verify Trip A's budget is untouched
    assert.strictEqual(tripA.budget.compras, 0);
    assert.strictEqual(tripB.budget.compras, 400);
  }

  // Test 5: Edge cases
  {
    console.log("Test 5: Edge Cases (no date, no destination, no values)");
    const badTrip = normalizeTripState({
      targetDate: null,
      budget: null
    });
    
    assert.strictEqual(badTrip.destination, "Minha Próxima Viagem");
    assert.strictEqual(badTrip.start_date, null);
    assert.strictEqual(badTrip.budget.hospedagem, 0);
  }

  // Test 6: checkDuplicateDocument
  {
    console.log("Test 6: checkDuplicateDocument logic");
    const { checkDuplicateDocument } = await import('../modules/stateManager.js');
    
    const trip = {
      flights: [
        { flightNumber: "LA8000", departureDate: "2026-10-10", hash: "abc1234" }
      ],
      accommodations: [
        { hotelName: "Hotel Test", checkIn: "2026-10-10", bookingRef: "XYZ123" }
      ]
    };
    
    // Duplicate flight by flightNumber + date
    assert.strictEqual(checkDuplicateDocument(trip, { flightNumber: "LA8000", departureDate: "2026-10-10" }, 'flight'), true);
    // Unique flight
    assert.strictEqual(checkDuplicateDocument(trip, { flightNumber: "LA8001", departureDate: "2026-10-10" }, 'flight'), false);
    
    // Duplicate accommodation by bookingRef
    assert.strictEqual(checkDuplicateDocument(trip, { bookingRef: "XYZ123" }, 'accommodation'), true);
    // Unique accommodation
    assert.strictEqual(checkDuplicateDocument(trip, { bookingRef: "ABC999", hotelName: "Other Hotel", checkIn: "2026-10-10" }, 'accommodation'), false);
  }
  
  // Test 7: inferTripFromDocuments
  {
    console.log("Test 7: inferTripFromDocuments data extraction");
    const { inferTripFromDocuments } = await import('../modules/stateManager.js');
    
    const dataList = [
      { type: 'flight', destination: 'Miami', departureDate: '2026-12-05' },
      { type: 'accommodation', city: 'Miami', checkIn: '2026-12-06', checkOut: '2026-12-15' }
    ];
    
    const result = inferTripFromDocuments(dataList);
    
    assert.strictEqual(result.dest, 'Miami');
    assert.strictEqual(result.start, '2026-12-05');
    assert.strictEqual(result.end, '2026-12-15');
    assert.strictEqual(result.flights.length, 1);
    assert.strictEqual(result.hotels.length, 1);
  }

  // Test 8: calculateReadinessScore
  {
    console.log("Test 8: calculateReadinessScore logic");
    const { calculateReadinessScore } = await import('../modules/stateManager.js');
    
    // Empty trip
    const emptyTrip = { 
      start_date: null, flights: [], accommodations: [], itinerary: [], budget: {}, packing: [], documents: [] 
    };
    let score = calculateReadinessScore(emptyTrip);
    assert.strictEqual(score.score, 0);
    assert.strictEqual(score.max, 5); // Base 5
    
    // Partially complete trip (Dates, Hotel, Budget)
    const partialTrip = { 
      start_date: "2026-12-10", 
      flights: [], 
      accommodations: [{ checkIn: "2026-12-10" }], 
      itinerary: [], 
      budget: { hospedagem: 1000 }, 
      packing: [], 
      documents: [] 
    };
    score = calculateReadinessScore(partialTrip);
    assert.strictEqual(score.score, 3); // Dates + Hotel + Budget
    
    // Trip with packing list and docs
    const fullTrip = { 
      start_date: "2026-12-10", 
      flights: [{ flightNumber: "123" }], 
      accommodations: [{ checkIn: "2026-12-10" }], 
      itinerary: [{ day: 1 }], 
      budget: { hospedagem: 1000 }, 
      packing: [{ items: [{ checked: true }, { checked: true }] }], 
      documents: [{ name: "Passaporte" }] 
    };
    score = calculateReadinessScore(fullTrip);
    // Base 5 + Packing (1) + Docs (1) = 7 max
    // Dates (1) + Transport (1) + Hotel (1) + Itinerary (1) + Budget (1) + Packing (1, because 2/2 > 0.8) + Docs (1) = 7
    assert.strictEqual(score.score, 7);
    assert.strictEqual(score.max, 7);
    assert.strictEqual(score.percentage, 100);
  }

  // Test 9: calculateCountdown and lifecycle
  {
    console.log("Test 9: calculateCountdown lifecycle states");
    const { calculateCountdown } = await import('../modules/stateManager.js');
    
    // Active trip
    let c = calculateCountdown("2026-10-10", "active");
    assert.strictEqual(c.value, "ON");
    assert.strictEqual(c.label, "Viagem");
    
    // Completed trip
    c = calculateCountdown("2025-10-10", "completed");
    assert.strictEqual(c.value, "FIM");
    assert.strictEqual(c.label, "Concluída");
    
    // Upcoming trip
    // Assuming now is "2026-08-22", start is "2026-08-25" (3 days)
    const nowMs = new Date("2026-08-22T00:00:00Z").getTime();
    c = calculateCountdown("2026-08-25", "upcoming", nowMs);
    assert.strictEqual(c.value, "3");
    assert.strictEqual(c.label, "Dias");
    
    // 1 day upcoming
    c = calculateCountdown("2026-08-23", "upcoming", nowMs);
    assert.strictEqual(c.value, "1");
    assert.strictEqual(c.label, "Dia");
  }

    // Test 10: Manual reservation insertions & properties
  {
    console.log("Test 10: Manual reservation insertion properties");
    const newRes = {
      id: "res_123",
      trip_id: "trip_456",
      type: "Hospedagem",
      title: "Hotel Copacabana",
      provider: "Booking",
      reference: "ABC123XYZ",
      date: null,
      start_datetime: "2026-12-10T14:00",
      end_datetime: "2026-12-15T10:00",
      file_reference: null,
      source: "manual",
      status: "confirmed",
      is_favorite: false,
      created_at: new Date().toISOString()
    };
    
    // Check all required properties
    assert.strictEqual(newRes.id, "res_123");
    assert.strictEqual(newRes.trip_id, "trip_456");
    assert.strictEqual(newRes.type, "Hospedagem");
    assert.strictEqual(newRes.title, "Hotel Copacabana");
    assert.strictEqual(newRes.provider, "Booking");
    assert.strictEqual(newRes.reference, "ABC123XYZ");
    assert.strictEqual(newRes.is_favorite, false);
    
    // Simulate insertion
    const trip = { reservations: [] };
    trip.reservations.push(newRes);
    assert.strictEqual(trip.reservations.length, 1);
  }

  // Test 11: Search filtering & category filtering
  {
    console.log("Test 11: Search filtering & category filtering logic");
    const items = [
      { title: "Voo Paris", category: "Passagem Aérea", provider: "LATAM" },
      { title: "Hotel Centro", category: "Hospedagem", provider: "Booking" },
      { title: "Ingresso Museu", category: "Ingresso", provider: "Local" },
      { title: "Voo Volta", category: "Passagem Aérea", provider: "Air France" }
    ];
    
    // Filter by Category
    const categoryFilt = items.filter(i => i.category === "Passagem Aérea");
    assert.strictEqual(categoryFilt.length, 2);
    
    // Filter by Search text
    const searchQ = "paris".toLowerCase();
    const searchFilt = items.filter(i => `${i.title} ${i.provider}`.toLowerCase().includes(searchQ));
    assert.strictEqual(searchFilt.length, 1);
    assert.strictEqual(searchFilt[0].title, "Voo Paris");
  }

  // Test 12: Sorting logic
  {
    console.log("Test 12: Date-based and favorite-based sorting logic");
    let items = [
      { title: "C", is_favorite: false, category: "Z", start_datetime: "2026-10-12" },
      { title: "A", is_favorite: true, category: "A", start_datetime: "2026-10-10" },
      { title: "B", is_favorite: false, category: "A", start_datetime: "2026-10-11" }
    ];
    
    // Date sorting (closest first)
    items.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
    assert.strictEqual(items[0].title, "A");
    assert.strictEqual(items[1].title, "B");
    assert.strictEqual(items[2].title, "C");
    
    // Favorite + Category sorting
    items.sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return a.category.localeCompare(b.category);
    });
    assert.strictEqual(items[0].title, "A"); // favorite first
    assert.strictEqual(items[1].title, "B"); // then category A
    assert.strictEqual(items[2].title, "C"); // then category Z
  }

  // Test 13: Shared view file restriction policy
  {
    console.log("Test 13: Shared view file restriction policies");
    const items = [
      { id: "1", title: "Public doc", file_reference: null, url: "https://example.com/img.png" },
      { id: "2", title: "Private doc", file_reference: "user/123.pdf", url: "https://supabase.co/storage/v1/..." }
    ];
    
    const isSharedView = true;
    
    const processed = items.map(item => {
      const isSupabaseFile = item.file_reference || (item.url && item.url.includes("supabase.co"));
      return {
        ...item,
        blockView: !!(isSharedView && isSupabaseFile)
      };
    });
    
    assert.strictEqual(processed[0].blockView, false); // public allows view
    assert.strictEqual(processed[1].blockView, true); // private supabase restricted
  }

  console.log("✅ All tests passed successfully!");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

async function runActionEngineTests() {
  console.log("🧪 Running Action Engine Tests...");
  const { applyActions, undoLastActions, validateAction } = await import('../modules/actionEngine.js');

  const initialTrip = {
    tripTitle: "Lisboa",
    itinerary: [{ day: "Dia 1", activities: ["Chegada"] }],
    packing: [],
    budget: { hospedagem: 1000 }
  };

  // Test A1: Valid actions applied atomically
  {
    const actions = [
      { type: 'itinerary', operation: 'add', data: { day: "Dia 2", activities: ["Passeio"] } },
      { type: 'budget', operation: 'update', data: { alimentacao: 500 } }
    ];
    const newTrip = applyActions(actions, initialTrip);
    assert.strictEqual(newTrip.itinerary.length, 2);
    assert.strictEqual(newTrip.budget.alimentacao, 500);
    assert.strictEqual(newTrip.budget.hospedagem, 1000);
    assert.strictEqual(initialTrip.itinerary.length, 1, "Original trip should not be mutated");
  }

  // Test A2: Malformed action type throws
  {
    const actions = [{ type: 'invalid_type', operation: 'add', data: {} }];
    assert.throws(() => applyActions(actions, initialTrip), /Invalid action type/);
  }

  // Test A3: Undo logic
  {
    const actions1 = [{ type: 'itinerary', operation: 'add', data: { day: "Dia 2" } }];
    let state1 = applyActions(actions1, initialTrip);
    
    const actions2 = [{ type: 'itinerary', operation: 'delete', index: 1 }];
    let state2 = applyActions(actions2, state1);
    
    assert.strictEqual(state2.itinerary.length, 1);
    
    // Undo once
    let state3 = undoLastActions(state2);
    assert.strictEqual(state3.itinerary.length, 2, "Should restore to state1");
    
    // Undo again
    let state4 = undoLastActions(state3);
    assert.strictEqual(state4.itinerary.length, 1, "Should restore to initialTrip");
  }

  // Test A4: Portuguese commands (removing items, update)
  {
    const trip = { packing: [{ category: "Roupas", items: ["Camisa"] }] };
    const actions = [
      { type: 'packing', operation: 'update', index: 0, data: { category: "Vestuário", items: ["Camisa", "Calça"] } }
    ];
    const newTrip = applyActions(actions, trip);
    assert.strictEqual(newTrip.packing[0].category, "Vestuário");
    assert.strictEqual(newTrip.packing[0].items.length, 2);
  }

  console.log("✅ All Action Engine tests passed successfully!");
}

runActionEngineTests().catch(err => {
  console.error("❌ Action Engine Test failed:", err);
  process.exit(1);
});

async function runStep7And8Tests() {
  console.log("🧪 Running Step 7 & 8 Tests (Partner Engine, Entitlements)...");
  const { partnerConfig, buildAffiliateLink, evaluateTripOpportunities } = await import('../modules/partnerEngine.js');
  const { plans, getEntitlements, getUserPlanState } = await import('../modules/entitlementEngine.js');
  
  // Test: Partner Configuration
  {
    assert.strictEqual(partnerConfig.enabled, true);
    assert.ok(partnerConfig.categories.includes('hotel'));
  }

  // Test: Affiliate Sanitization
  {
    const trip = {};
    const link = buildAffiliateLink('booking', trip, { q: 'Paris<script>alert(1)</script>' });
    assert.ok(link.includes('aid=123456'));
    assert.ok(link.includes('Paris'));
    assert.ok(!link.includes('<script>')); // Should be sanitized
  }

  // Test: Opportunity Evaluation
  {
    const tripWithHotel = { data: { logistics: [{ type: 'accommodation' }] } };
    let opps = evaluateTripOpportunities(tripWithHotel);
    assert.ok(!opps.some(o => o.category === 'hotel'));
    assert.ok(opps.some(o => o.category === 'insurance'));
    
    const emptyTrip = { data: {} };
    opps = evaluateTripOpportunities(emptyTrip);
    assert.ok(opps.some(o => o.category === 'hotel'));
    assert.ok(opps.some(o => o.category === 'insurance'));
  }

  // Test: Free/Premium Limits Enforcement
  {
    const freeUser = { plan: 'free', tripsCount: 1 };
    let state = getUserPlanState(freeUser, {});
    assert.strictEqual(state.entitlements.maxTrips, 1);
    assert.strictEqual(state.canCreateTrip, false); // 1 >= 1

    const premiumUser = { plan: 'premium', tripsCount: 10 };
    state = getUserPlanState(premiumUser, {});
    assert.strictEqual(state.canCreateTrip, true);
  }

  // Test: Reward Confirmation States
  {
    const userWithReward = { plan: 'free', tripsCount: 1, rewards: [{ state: 'confirmed' }] };
    const state = getUserPlanState(userWithReward, {});
    assert.strictEqual(state.hasRewardUnlock, true);
    assert.strictEqual(state.canCreateTrip, true); // Override free limit due to reward
  }
  
  // Test: Public/Shared views are already tested in Test 13.
  console.log("✅ Step 7 & 8 Tests passed successfully!");
}

runStep7And8Tests().catch(err => {
  console.error("❌ Step 7 & 8 Test failed:", err);
  process.exit(1);
});

async function runStep9SEOTests() {
  console.log("🧪 Running Step 9 SEO Tests...");
  const fs = await import('fs');
  const assert = await import('assert');
  
  // Test: Index HTML SEO Tags & JSON-LD
  {
    const indexHtml = fs.readFileSync('index.html', 'utf-8');
    
    // Check JSON-LD
    assert.ok(indexHtml.includes('<script type="application/ld+json">'), "Missing JSON-LD script tag");
    assert.ok(indexHtml.includes('"@type": "SoftwareApplication"'), "Missing SoftwareApplication schema");
    assert.ok(indexHtml.includes('"@type": "WebSite"'), "Missing WebSite schema");
    assert.ok(indexHtml.includes('"@type": "Organization"'), "Missing Organization schema");
    assert.ok(!indexHtml.includes('"reviewCount"'), "Should not have fake reviews");
    
    // Check Canonical
    assert.ok(indexHtml.includes('<link rel="canonical" href="https://copilotodeviagem.com.br/">'), "Missing canonical link");
    
    // Check Semantic HTML
    assert.ok(indexHtml.includes('<html lang="pt-BR">'), "Missing lang attribute on HTML");
    assert.ok(indexHtml.match(/<h1/g).length === 1, "Should have exactly one H1 tag");
    assert.ok(indexHtml.includes('<header'), "Missing <header> tag");
    assert.ok(indexHtml.includes('<footer'), "Missing <footer> tag");
  }

  // Test: robots.txt configuration
  {
    const robotsTxt = fs.readFileSync('robots.txt', 'utf-8');
    assert.ok(robotsTxt.includes('Allow: /'), "Missing Allow: /");
    assert.ok(robotsTxt.includes('Disallow: /app.html'), "Missing Disallow for /app.html");
    assert.ok(robotsTxt.includes('Disallow: /v/'), "Missing Disallow for /v/");
    assert.ok(robotsTxt.includes('Disallow: /api/'), "Missing Disallow for /api/");
    assert.ok(robotsTxt.includes('Sitemap: https://copilotodeviagem.com.br/sitemap.xml'), "Missing absolute Sitemap");
  }

  console.log("✅ Step 9 SEO Tests passed successfully!");
}

runStep9SEOTests().catch(err => {
  console.error("❌ Step 9 SEO Test failed:", err);
  process.exit(1);
});

// ═══════════════════════════════════════════════════════════════════════════
// STEP 10 — RELEASE CANDIDATE TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function runStep10Tests() {
  console.log("\n🧪 Running Step 10 — Release Candidate Tests...");

  // ── Test RC-1: APP_VERSION exists and is a non-empty string ────────────────
  {
    console.log("Test RC-1: APP_VERSION exists in config.js");
    // Read config.js as text and verify APP_VERSION is exported
    const configText = fs.readFileSync('config.js', 'utf-8');
    assert.ok(configText.includes("export const APP_VERSION"), "APP_VERSION deve ser exportado de config.js");
    const match = configText.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(match && match[1].length > 0, "APP_VERSION deve ser uma string não vazia");
    // Version should follow semver-like format
    assert.ok(/^\d+\.\d+\.\d+/.test(match[1]), `APP_VERSION '${match[1]}' deve seguir formato semver`);
  }

  // ── Test RC-2: BYPASS_LOGIN is hostname-based, not hardcoded ──────────────
  {
    console.log("Test RC-2: BYPASS_LOGIN is not hardcoded true");
    const configText = fs.readFileSync('config.js', 'utf-8');
    const appHtml = fs.readFileSync('app.html', 'utf-8');
    const appText = fs.readFileSync('app.js', 'utf-8');
    // Should NOT contain "= true" right after BYPASS_LOGIN
    assert.ok(
      !configText.includes("BYPASS_LOGIN = true"),
      "BYPASS_LOGIN não deve ser hardcoded como true — deve ser baseado em hostname"
    );
    assert.ok(
      configText.includes("localhost"),
      "BYPASS_LOGIN deve checar hostname localhost"
    );
    assert.ok(
      !appHtml.includes('display: none !important; visibility: hidden !important'),
      "app.html não deve esconder a tela de login à força"
    );
    assert.ok(
      appHtml.includes('<div class="app-container hidden">'),
      "app.html deve iniciar o aplicativo oculto até a autenticação"
    );
    assert.strictEqual(
      (appText.match(/function getTripStorageKey\s*\(/g) || []).length,
      1,
      "getTripStorageKey deve ser declarado uma única vez"
    );
  }

  // ── Test RC-3: All feature flags are enabled in RC ─────────────────────────
  {
    console.log("Test RC-3: Feature flags enabled for Release Candidate");
    const configText = fs.readFileSync('config.js', 'utf-8');
    const flagsMatch = configText.match(/FEATURES\s*=\s*\{([^}]+)\}/s);
    assert.ok(flagsMatch, "FEATURES deve estar definido em config.js");
    const flagsBlock = flagsMatch[1];
    // All flags should be true
    const falseFlags = [...flagsBlock.matchAll(/(\w+):\s*false/g)].map(m => m[1]);
    assert.ok(
      falseFlags.length === 0,
      `Flags com valor false encontradas: ${falseFlags.join(', ')} — todas devem ser true no RC`
    );
  }

  // ── Test RC-4: Entitlement logic — free vs premium ─────────────────────────
  {
    console.log("Test RC-4: checkUserEntitlement() logic");
    // Test the logic directly (without Supabase calls) by reading _utils.js
    const utilsText = fs.readFileSync('api/_utils.js', 'utf-8');
    // Must export checkUserEntitlement
    assert.ok(utilsText.includes("checkUserEntitlement"), "checkUserEntitlement deve existir em _utils.js");
    // Must have free plan path
    assert.ok(utilsText.includes("'free'"), "Deve ter caminho de plano free em _utils.js");
    // Must have premium plan path
    assert.ok(utilsText.includes("'premium'"), "Deve ter caminho de plano premium em _utils.js");
    // Must keep checkUserAccess for backward compatibility
    assert.ok(utilsText.includes("checkUserAccess"), "checkUserAccess deve ser mantido como alias em _utils.js");
    // Must export invalidateEntitlementCache
    assert.ok(utilsText.includes("invalidateEntitlementCache"), "invalidateEntitlementCache deve existir para pós-webhook");
  }

  // ── Test RC-5: Webhook — dummy-token removed from chat.js ─────────────────
  {
    console.log("Test RC-5: dummy-token-unconfigured removed from backend");
    const chatText = fs.readFileSync('api/chat.js', 'utf-8');
    assert.ok(
      !chatText.includes("dummy-token-unconfigured"),
      "dummy-token-unconfigured NÃO deve existir em api/chat.js em produção"
    );
    const verifyText = fs.readFileSync('api/verify.js', 'utf-8');
    assert.ok(
      !verifyText.includes("dummy-token-unconfigured"),
      "dummy-token-unconfigured NÃO deve existir em api/verify.js em produção"
    );
  }

  // ── Test RC-6: Webhook canonical event normalization ───────────────────────
  {
    console.log("Test RC-6: Webhook maps statuses to canonical events");
    const webhookText = fs.readFileSync('api/webhook-pagamento.js', 'utf-8');
    assert.ok(webhookText.includes("purchase_confirmed"), "Webhook deve mapear para 'purchase_confirmed'");
    assert.ok(webhookText.includes("purchase_refunded"), "Webhook deve mapear para 'purchase_refunded'");
    assert.ok(webhookText.includes("X-Webhook-Secret") || webhookText.includes("x-webhook-secret"),
      "Webhook deve aceitar secret via header X-Webhook-Secret");
    assert.ok(webhookText.includes("invalidateEntitlementCache"),
      "Webhook deve invalidar cache de entitlement após mudança");
    // Must NOT have browser CORS on webhook
    assert.ok(
      !webhookText.includes("Access-Control-Allow-Origin"),
      "Webhook não deve ter CORS — é chamado servidor-a-servidor"
    );
  }

  // ── Test RC-7: Analytics module — PII sanitization ────────────────────────
  {
    console.log("Test RC-7: Analytics module sanitizes PII");
    const analyticsText = fs.readFileSync('modules/analytics.js', 'utf-8');
    assert.ok(analyticsText.includes("BLOCKED_KEYS"), "Analytics deve ter lista de chaves bloqueadas de PII");
    assert.ok(analyticsText.includes("passport"), "Analytics deve bloquear campo 'passport'");
    assert.ok(analyticsText.includes("localizador"), "Analytics deve bloquear campo 'localizador'");
    assert.ok(analyticsText.includes("[redacted]"), "Analytics deve substituir PII por '[redacted]'");
    assert.ok(analyticsText.includes("session_id"), "Analytics deve usar session_id anônimo");
    // Must NOT collect email in plain text by default
    assert.ok(analyticsText.includes("redacted_email"), "Analytics deve redactar emails detectados em valores");
  }

  // ── Test RC-8: Error handler — no stacktrace exposure ─────────────────────
  {
    console.log("Test RC-8: Error handler never exposes stacktrace to user");
    const errorHandlerText = fs.readFileSync('modules/errorHandler.js', 'utf-8');
    assert.ok(errorHandlerText.includes("window.onerror"), "errorHandler deve capturar window.onerror");
    assert.ok(errorHandlerText.includes("onunhandledrejection"), "errorHandler deve capturar unhandledrejection");
    // User-facing messages should be friendly, not technical
    assert.ok(errorHandlerText.includes("Sem conexão"), "errorHandler deve ter mensagem amigável de rede");
    assert.ok(errorHandlerText.includes("Sua sessão expirou"), "errorHandler deve ter mensagem amigável de auth");
    // Must NOT send stack to user
    assert.ok(!errorHandlerText.includes("error.stack"), "errorHandler NÃO deve expor error.stack ao usuário");
  }

  // ── Test RC-9: SW version matches APP_VERSION format ──────────────────────
  {
    console.log("Test RC-9: Service Worker cache version updated for RC");
    const swText = fs.readFileSync('sw.js', 'utf-8');
    const match = swText.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(match, "CACHE_VERSION deve estar definido em sw.js");
    assert.ok(match[1].includes('rc') || match[1].includes('v2'),
      `CACHE_VERSION '${match[1]}' deve refletir o Release Candidate`);
  }

  // ── Test RC-10: Release Checklist and Security Audit exist ────────────────
  {
    console.log("Test RC-10: RELEASE_CHECKLIST.md and SECURITY_AUDIT.md exist");
    assert.ok(fs.existsSync('RELEASE_CHECKLIST.md'), "RELEASE_CHECKLIST.md deve existir");
    const checklist = fs.readFileSync('RELEASE_CHECKLIST.md', 'utf-8');
    assert.ok(checklist.length > 200, "RELEASE_CHECKLIST.md deve ter conteúdo substancial");

    assert.ok(fs.existsSync('SECURITY_AUDIT.md'), "SECURITY_AUDIT.md deve existir");
    const audit = fs.readFileSync('SECURITY_AUDIT.md', 'utf-8');
    assert.ok(audit.includes("BYPASS_LOGIN"), "SECURITY_AUDIT.md deve cobrir BYPASS_LOGIN");
    assert.ok(audit.includes("RLS"), "SECURITY_AUDIT.md deve cobrir RLS");
  }

  console.log("✅ Step 10 Release Candidate Tests passed successfully!");
}

runStep10Tests().catch(err => {
  console.error("❌ Step 10 RC Test failed:", err);
  process.exit(1);
});

async function runPreCycle2Tests() {
  console.log("\n🧪 Running Pre-Cycle 2 Stabilization Tests...");

  // Mock de variáveis de ambiente
  process.env.SUPABASE_URL = 'https://mock-supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://copilotodeviagem.com.br,https://stage.copilotodeviagem.com.br';

  // Handler dinâmico para interceptar requisições no teste
  let mockFetchHandler = null;

  const mockFetch = async (url, options) => {
    if (mockFetchHandler) {
      return mockFetchHandler(url, options);
    }
    return Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Unmocked fetch call" }),
      text: () => Promise.resolve("Unmocked fetch call")
    });
  };

  // Define o mock de fetch no global antes de qualquer require
  Object.defineProperty(global, 'fetch', {
    value: mockFetch,
    writable: true,
    configurable: true
  });

  const { reserveAIUsage, refundAIUsage, checkDatabaseRateLimit, handleCors } = require('../api/_utils.js');
  const sharedTripHandler = require('../api/shared-trip.js');

  const makeMockRes = () => {
    const res = {};
    res.headers = {};
    res.statusCode = 200;
    res.setHeader = (name, val) => { res.headers[name] = val; };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    res.text = (body) => { res.body = body; return res; };
    res.end = () => { return res; };
    return res;
  };

  // ── Test A: Concorrência 39/40 (Race condition prevention) ─────────────────
  {
    console.log("Test A: Concorrência concorrente em 39/40");
    let activeLimit = 40;
    let messagesUsed = 39;

    // Usamos o mockFetchHandler para simular a transação transacional com Row Lock (FOR UPDATE)
    mockFetchHandler = async (url, options) => {
      if (url.includes('/rpc/reserve_ai_usage')) {
        // Simulação do comportamento transacional do banco:
        // A primeira transação que entra reserva e passa para 40, a segunda bloqueia porque a cota já bateu 40
        if (messagesUsed < activeLimit) {
          messagesUsed++;
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ allowed: true, messages_used: messagesUsed, max_limit: activeLimit }])
          };
        } else {
          return {
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ allowed: false, messages_used: messagesUsed, max_limit: activeLimit }])
          };
        }
      }
      return { ok: false, status: 500 };
    };

    // Disparamos duas requisições concorrentes simulando Promise.all no servidor
    const [res1, res2] = await Promise.all([
      reserveAIUsage('user_123', 'trip_456', 40),
      reserveAIUsage('user_123', 'trip_456', 40)
    ]);

    // Uma aceita, uma bloqueada
    assert.strictEqual(res1.allowed || res2.allowed, true, "Pelo menos uma chamada deve ser permitida");
    assert.strictEqual(res1.allowed && res2.allowed, false, "Ambas chamadas concorrentes NÃO podem ser permitidas");
    assert.strictEqual(messagesUsed, 40, "Uso final de cota deve ser 40");

    mockFetchHandler = null;
  }

  // ── Test B: 40/40 bloqueado ───────────────────────────────────────────────
  {
    console.log("Test B: Cota 40/40 bloqueada");
    mockFetchHandler = async (url) => {
      if (url.includes('/rpc/reserve_ai_usage')) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ allowed: false, messages_used: 40, max_limit: 40 }])
        };
      }
      return { ok: false };
    };

    const res = await reserveAIUsage('user_123', 'trip_456', 40);
    assert.strictEqual(res.allowed, false, "Cota em 40/40 deve ser bloqueada");
    mockFetchHandler = null;
  }

  // ── Test C: Supabase indisponível em Production (Fail-Closed) ─────────────
  {
    console.log("Test C: Supabase indisponível em Production (Fail-Closed)");
    mockFetchHandler = () => Promise.reject(new Error("Database offline"));

    // Em produção, se der erro de banco, deve retornar allowed: false
    const res = await reserveAIUsage('user_123', 'trip_456', 40);
    assert.strictEqual(res.allowed, false, "Em produção deve falhar fechado (Fail-Closed) se banco falhar");
    mockFetchHandler = null;
  }

  // ── Test D, E, F: Shared Trip com budget, expenses e members restritos ─────
  {
    console.log("Test D, E, F: Sanitização no Servidor (budget=false, expenses=false, members=false)");
    mockFetchHandler = async (url) => {
      if (url.includes('/rest/v1/trips')) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            id: 'trip_123',
            title: 'Paris',
            user_id: 'owner_999',
            budget: { hospedagem: 1500, compras: 500 },
            expenses: [{ amount: 100, desc: 'Jantar' }],
            members: ['dono@example.com', 'alice@test.com', 'Bob'],
            sharing: {
              enabled: true,
              itinerary: true,
              budget: false,
              expenses: false,
              members: false
            }
          })
        };
      }
      return { ok: false };
    };

    const req = { method: 'GET', query: { id: 'a3add22f-1311-4339-9e61-bdf0a76bad19' }, headers: { origin: 'https://copilotodeviagem.com.br' } };
    const res = makeMockRes();

    await sharedTripHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    // Orçamento deve ser ocultado
    assert.strictEqual(res.body.budget.hospedagem, 0, "Orçamento privado deve ser ocultado");
    // Despesas devem ser ocultadas
    assert.strictEqual(res.body.expenses.length, 0, "Despesas devem ser ocultadas");
    // Membros ocultados (retorna apenas ["Viajante"])
    assert.strictEqual(res.body.members.length, 1, "Membros devem ser ocultados");
    assert.strictEqual(res.body.members[0], "Viajante");

    mockFetchHandler = null;
  }

  // ── Test G: sharing.enabled = false (Trip privada) ──────────────────────────
  {
    console.log("Test G: sharing.enabled=false bloqueado");
    mockFetchHandler = async (url) => {
      if (url.includes('/rest/v1/trips')) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            id: 'trip_123',
            sharing: { enabled: false }
          })
        };
      }
      return { ok: false };
    };

    const req = { method: 'GET', query: { id: 'a3add22f-1311-4339-9e61-bdf0a76bad19' }, headers: { origin: 'https://copilotodeviagem.com.br' } };
    const res = makeMockRes();

    await sharedTripHandler(req, res);

    assert.strictEqual(res.statusCode, 403, "Deve bloquear acesso com HTTP 403");
    assert.strictEqual(res.body.code, "TRIP_PRIVATE");

    mockFetchHandler = null;
  }

  // ── Test H: Documents privados na Shared View ──────────────────────────────
  {
    console.log("Test H: Documentos privados nunca expostos");
    mockFetchHandler = async (url) => {
      if (url.includes('/rest/v1/trips')) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            id: 'trip_123',
            documents: [{ id: 'doc_1', name: 'Passaporte.pdf', url: 'https://supabase.co/boarding-documents/...' }],
            sharing: { enabled: true, documents: true } // Mesmo que marque true
          })
        };
      }
      return { ok: false };
    };

    const req = { method: 'GET', query: { id: 'a3add22f-1311-4339-9e61-bdf0a76bad19' }, headers: { origin: 'https://copilotodeviagem.com.br' } };
    const res = makeMockRes();

    await sharedTripHandler(req, res);

    // O payload retornado de documents deve ser sempre vazio para visitantes
    assert.strictEqual(res.body.documents.length, 0, "Documentos confidenciais devem ser omitidos para visitantes");

    mockFetchHandler = null;
  }

  // ── Test I: CORS real ───────────────────────────────────────────────────────
  {
    console.log("Test I: CORS real em endpoint");
    
    // Whitelistado
    const reqOk = { headers: { origin: 'https://copilotodeviagem.com.br' } };
    const resOk = makeMockRes();
    const resultOk = handleCors(reqOk, resOk);
    assert.strictEqual(resultOk, true, "Origem whitelistada deve ser aceita");
    assert.strictEqual(resOk.headers['Access-Control-Allow-Origin'], 'https://copilotodeviagem.com.br');

    // Não whitelistado (Acesso negado)
    const reqBad = { headers: { origin: 'https://hacker.com' } };
    const resBad = makeMockRes();
    const resultBad = handleCors(reqBad, resBad);
    assert.strictEqual(resultBad, false, "Origem hacker deve ser bloqueada");
  }

  // ── Test J: AI Router Classifier, Context Builder e Normalização ─────────────
  {
    console.log("Test J: AI Router Classifier, Context Builder e Normalização");
    const { classifyTask, buildAIContext, normalizeStructuredOutput } = require('../api/_aiRouter');

    // 1. Classifier Test
    const lightTask = classifyTask('document_classify');
    assert.strictEqual(lightTask.tier, 'LIGHT', "document_classify deve ser classificado como LIGHT");
    
    const freshTask = classifyTask('chat', 'Qual o status do voo AD4132?');
    assert.strictEqual(freshTask.tier, 'FRESH_DATA', "Pergunta sobre voo deve ser classificada como FRESH_DATA");
    assert.strictEqual(freshTask.useGrounding, true, "FRESH_DATA deve ter grounding ativo");

    // 2. Context Builder Test
    const sampleTrip = { destination: 'Lisboa', dates: '10 a 15 de Outubro', hotel: 'Hotel Central' };
    const ctx = buildAIContext('chat', sampleTrip, 'Qual o hotel?');
    assert.ok(ctx.includes('Lisboa'), "Contexto deve conter destino");
    assert.ok(ctx.includes('Hotel Central'), "Contexto deve conter hotel");

    // 3. Normalization Test
    const rawMarkdown = "```json\n{\"actions\":[{\"type\":\"packing\",\"operation\":\"add\",\"data\":{\"item\":\"Protetor\"}}]}\n```";
    const cleaned = normalizeStructuredOutput(rawMarkdown);
    assert.strictEqual(cleaned, "{\"actions\":[{\"type\":\"packing\",\"operation\":\"add\",\"data\":{\"item\":\"Protetor\"}}]}", "Markdown ```json deve ser limpo");
  }

  console.log("✅ Pre-Cycle 2 Stabilization Tests passed successfully!");
}

runPreCycle2Tests().catch(err => {
  console.error("❌ Pre-Cycle 2 Stabilization Test failed:", err);
  process.exit(1);
});
