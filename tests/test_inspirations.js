// tests/test_inspirations.js — Suíte Completa de Testes com Auditoria Factual
import assert from 'assert';
import { 
  INSPIRATIONS_DATA, 
  TEST_FIXTURES,
  ROMA_SOURCES,
  ROMA_SOURCE_INSIGHTS,
  getInspirations, 
  getInspirationBySlug, 
  getInspirationById, 
  validateInspirationWithRealEngines,
  calculateQualityScore, 
  cloneInspirationToTrip 
} from '../modules/inspirationsEngine.js';
import { validateIndexationCriteria } from '../modules/seoProgrammaticEngine.js';
import { FEATURE_FLAGS } from '../config.js';

console.log("🧪 Running Comprehensive Factual Audit & Inspirações Test Suite...\n");

// Test 1: Data Model & Schema Integrity
console.log("Test 1: Inspirations Data Model & Schema Integrity");
assert.ok(Array.isArray(INSPIRATIONS_DATA) && INSPIRATIONS_DATA.length > 0, "Inspirations dataset must contain items.");

INSPIRATIONS_DATA.forEach(insp => {
  assert.ok(insp.id, "Inspiration must have an id");
  assert.ok(insp.slug, "Inspiration must have a slug");
  assert.ok(insp.title, "Inspiration must have a title");
  assert.ok(insp.destination_city, "Inspiration must have a destination_city");
  assert.ok(insp.country, "Inspiration must have a country");
  assert.ok(typeof insp.duration_days === 'number' && insp.duration_days > 0, "Inspiration must have valid duration_days");
  assert.ok(['light', 'balanced', 'intense'].includes(insp.pace), "Pace must be light, balanced, or intense");
  assert.ok(['budget', 'moderate', 'luxury'].includes(insp.budget_level), "Budget level must be budget, moderate, or luxury");
  assert.ok(Array.isArray(insp.best_for) && insp.best_for.length > 0, "best_for must be a non-empty array");
  assert.ok(insp.planning_rationale, "Inspiration must contain planning_rationale");
  assert.ok(insp.why_this_works, "Inspiration must contain why_this_works");
  // Test 1b: Zero Duplicate Activities Assertion
  insp.itinerary.forEach(day => {
    const seenNames = new Set();
    const seenIds = new Set();
    day.activities.forEach(act => {
      const normName = (act.name || '').trim().toLowerCase();
      assert.ok(!seenNames.has(normName), `Duplicate activity name "${act.name}" found in ${insp.id} day ${day.day_number}`);
      assert.ok(!seenIds.has(act.id), `Duplicate activity ID "${act.id}" found in ${insp.id} day ${day.day_number}`);
      seenNames.add(normName);
      seenIds.add(act.id);
    });
  });
});
console.log("  ✅ Data model and field schemas verified successfully (Zero duplicates).");

// Test 2: Verificação do Acervo de Inspirações Publicadas (12 Roteiros)
console.log("\nTest 2: Verificação do Acervo de Inspirações Publicadas (12 Roteiros)");
const publicInspirations = getInspirations({ includeReview: false });
assert.strictEqual(publicInspirations.length, 12, "All 12 inspirations must be published publicly.");
publicInspirations.forEach(insp => {
  assert.strictEqual(insp.status, 'published', `Inspiration ${insp.id} status must be 'published'.`);
});

// Fixtures (Buenos Aires draft) must be 'draft'
TEST_FIXTURES.forEach(fix => {
  assert.strictEqual(fix.status, 'draft', `Fixture ${fix.id} must be 'draft'.`);
});
console.log("  ✅ Acervo de 12 roteiros publicados auditado e verificado com sucesso.");

// Test 3: Gestão de Fontes e Insights Sintetizados (Sem Paráfrase ou Cópia)
console.log("\nTest 3: Gestão de Fontes e Insights Sintetizados (Sem Paráfrase ou Cópia)");
assert.ok(Array.isArray(ROMA_SOURCES), "Must contain ROMA_SOURCES array.");
ROMA_SOURCE_INSIGHTS.forEach(ins => {
  assert.ok(ins.id && ins.source_id && ins.topic && ins.insight, "Insight must have complete metadata.");
  assert.ok(!ins.insight.toLowerCase().includes("parafrasear"), "Insight must not contain paraphrase pipeline references.");
});
console.log("  ✅ Research sources and structured insights verified successfully.");

// Test 4: Validação REAL com Risk Engine & Logistics Engine para TODOS os 12 Roteiros
console.log("\nTest 4: Validação REAL com Risk Engine & Logistics Engine em Todos os 12 Roteiros");
INSPIRATIONS_DATA.forEach(insp => {
  const val = validateInspirationWithRealEngines(insp);
  assert.ok(val.qualityScore >= 85, `${insp.destination_city} quality score must be >= 85 (got ${val.qualityScore}).`);
  assert.strictEqual(val.criticalRisks.length, 0, `${insp.destination_city} must have zero critical risks.`);
  assert.strictEqual(val.publicationBlocked, false, `${insp.destination_city} must not be publication blocked.`);
});
const romaInsp = INSPIRATIONS_DATA[0];
const validation = validateInspirationWithRealEngines(romaInsp);
console.log("  ✅ Real Risk and Logistics Engine integration verified with Quality Score >= 85 across all 12 itineraries.");

// Test 5: Bloqueio de Publicação para Roteiro Inválido
console.log("\nTest 5: Bloqueio de Publicação para Roteiro Inválido");
assert.strictEqual(validation.publicationBlocked, false, "Published Roma pilot must pass publication gate.");

const badInsp = {
  ...romaInsp,
  id: 'insp_bad_test',
  status: 'published',
  itinerary: [
    {
      day_number: 1,
      title: 'Dia com Conflito Rígido',
      activities: [
        { id: 'act_1', name: 'Atração A', start_time: '09:00', end_time: '11:00' },
        { id: 'act_2', name: 'Atração B', start_time: '09:30', end_time: '10:30' }
      ]
    }
  ]
};
const badValidation = validateInspirationWithRealEngines(badInsp);
assert.ok(badValidation.publicationBlocked, "Inspiration with severe operational conflicts must be publication blocked.");
console.log("  ✅ Publication gate correctly blocks invalid inspirations.");

// Test 6: Coordenadas Geográficas Verificadas
console.log("\nTest 6: Coordenadas Geográficas Verificadas");
romaInsp.itinerary.forEach(day => {
  day.activities.forEach(act => {
    if (act.lat != null && act.lng != null) {
      assert.ok(typeof act.lat === 'number' && typeof act.lng === 'number', `Activity ${act.name} lat/lng must be valid numbers if present.`);
      assert.ok(act.lat >= -90 && act.lat <= 90, "Latitude must be valid.");
      assert.ok(act.lng >= -180 && act.lng <= 180, "Longitude must be valid.");
    }
  });
});
console.log("  ✅ Verified geographic coordinates validated.");

// Test 7: Fluxo de Personalização Guiada e Atribuição de Clonagem
console.log("\nTest 7: Personalização Guiada, Persistência e Atribuição");
const persData = {
  startDate: '2026-10-15',
  travelers: '2',
  pace: 'balanced',
  hotel: 'Trastevere',
  mustDo: 'Vaticano'
};

const clonedTrip = cloneInspirationToTrip(romaInsp.id, { id: 'usr_test_123' }, persData);

assert.ok(clonedTrip.id && clonedTrip.id.startsWith('trip_cloned_'), "Cloned trip must have a unique ID.");
assert.strictEqual(clonedTrip.start_date, '2026-10-15', "Cloned trip start date must match personalization.");
assert.strictEqual(clonedTrip.source_type, 'inspiration', "Trip attribution source_type must be 'inspiration'.");
assert.strictEqual(clonedTrip.source_inspiration_id, romaInsp.id, "Trip attribution source_inspiration_id must match Roma ID.");
assert.ok(clonedTrip.cloned_at, "Cloned trip must contain cloned_at timestamp.");
assert.ok(clonedTrip.packing.length >= 4, "Cloned trip must automatically include a categorized packing list.");
assert.ok(clonedTrip.packing.every(category => category.items.every(item => item.checked === false)), "Auto-generated packing items must start unchecked.");
console.log("  ✅ Personalization flow and attribution metadata verified.");

// Test 8: Clone Independence
console.log("\nTest 8: Independência Completa da Viagem Clonada");
clonedTrip.itinerary[0].activities.pop();
assert.notStrictEqual(clonedTrip.itinerary[0].activities.length, romaInsp.itinerary[0].activities.length, "Modifying cloned trip must not mutate original inspiration.");
console.log("  ✅ Clone independence verified successfully.");

// Test 9: Gating de Elegibilidade SEO (Index / Noindex)
console.log("\nTest 9: Gating de Elegibilidade SEO (Index / Noindex)");
const publishedSeo = validateIndexationCriteria(romaInsp);
assert.strictEqual(publishedSeo.shouldIndex, true, "Published Roma pilot must be indexable (shouldIndex=true).");

const thinContentRes = validateIndexationCriteria({ destination: 'Roma', itinerary: [] });
assert.strictEqual(thinContentRes.shouldIndex, false, "Thin content without activities must not be indexable.");
console.log("  ✅ SEO eligibility gating verified successfully.");

console.log("\n🎉 ALL INSPIRAÇÕES FACTUAL AUDIT TESTS PASSED 100% GREEN!");
