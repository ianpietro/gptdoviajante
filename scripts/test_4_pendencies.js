// scripts/test_4_pendencies.js — Empirical Verification for the 4 Pending Checks
const fs = require('fs');

function getEnvVal(key) {
  if (!fs.existsSync('.env')) return '';
  const env = fs.readFileSync('.env', 'utf8');
  const line = env.split('\n').find(x => x.startsWith(key + '='));
  return line ? line.split('=')[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

const SUPABASE_URL = getEnvVal('SUPABASE_URL') || 'https://mfcajxrvylkwijdpknbx.supabase.co';
const ANON_KEY = getEnvVal('SUPABASE_ANON_KEY');
const SERVICE_KEY = getEnvVal('SUPABASE_SERVICE_ROLE_KEY');

const inspirationsEngine = require('../modules/inspirationsEngine.js');

async function runPendingChecks() {
  console.log("🔍 Executando Verificação das 4 Pendências Finais...\n");

  // -------------------------------------------------------------------------
  // PENDÊNCIA 1: TESTE REAL DE PUBLIC READ (ANON KEY)
  // -------------------------------------------------------------------------
  console.log("--- PENDÊNCIA 1: TESTE REAL DE PUBLIC READ (ANON KEY) ---");
  const tempTestId = 'insp_test_temp_published_' + Date.now();

  // Insert disposable published test row using SERVICE_KEY
  await fetch(`${SUPABASE_URL}/rest/v1/inspirations`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: tempTestId,
      slug: 'test-temp-published-' + Date.now(),
      title: 'Teste Temporario Published',
      destination_city: 'TesteCity',
      country: 'TesteCountry',
      country_code: 'TC',
      duration_days: 1,
      short_description: 'Desc',
      long_description: 'Long desc',
      pace: 'light',
      budget_level: 'budget',
      status: 'published' // PUBLISHED STATUS FOR TEST
    })
  });

  // Query ONLY with ANON_KEY
  const anonReadRes = await fetch(`${SUPABASE_URL}/rest/v1/inspirations?id=eq.${tempTestId}&select=id,title,status`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });

  const anonReadData = await anonReadRes.json();
  const anonPublishedReadReal = (Array.isArray(anonReadData) && anonReadData.length === 1 && anonReadData[0].id === tempTestId)
    ? 'ALLOWED_SUCCESS' 
    : 'FAILED';

  // Query Roma (review status) ONLY with ANON_KEY
  const anonReviewRes = await fetch(`${SUPABASE_URL}/rest/v1/inspirations?id=eq.insp_roma_5d_classico&select=id,status`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });

  const anonReviewData = await anonReviewRes.json();
  const anonReviewBlockReal = (Array.isArray(anonReviewData) && anonReviewData.length === 0)
    ? 'BLOCKED_ZERO_ROWS'
    : 'FAILED';

  // Cleanup temporary test row
  await fetch(`${SUPABASE_URL}/rest/v1/inspirations?id=eq.${tempTestId}`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });

  console.log(`  ANON_PUBLISHED_READ_REAL = ${anonPublishedReadReal}`);
  console.log(`  ANON_REVIEW_BLOCK_REAL = ${anonReviewBlockReal}`);

  // -------------------------------------------------------------------------
  // PENDÊNCIA 2: TRIP RLS COM ANON KEY
  // -------------------------------------------------------------------------
  console.log("\n--- PENDÊNCIA 2: TRIP RLS COM ANON KEY ---");
  const tripAnonRes = await fetch(`${SUPABASE_URL}/rest/v1/trips?select=id,title,user_id&limit=5`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });

  const tripAnonApiReached = tripAnonRes.ok ? 'YES' : 'NO';
  const tripAnonData = await tripAnonRes.json();
  const tripAnonRowsReturned = Array.isArray(tripAnonData) ? tripAnonData.length : -1;
  const tripAnonRlsVerified = (tripAnonApiReached === 'YES' && tripAnonRowsReturned === 0) ? 'YES' : 'NO';

  console.log(`  TRIP_ANON_API_REACHED = ${tripAnonApiReached} (HTTP Status ${tripAnonRes.status})`);
  console.log(`  TRIP_ANON_ROWS_RETURNED = ${tripAnonRowsReturned}`);
  console.log(`  TRIP_ANON_RLS_VERIFIED = ${tripAnonRlsVerified}`);

  // -------------------------------------------------------------------------
  // PENDÊNCIA 3: WARNINGS & SCORE REVIEW
  // -------------------------------------------------------------------------
  console.log("\n--- PENDÊNCIA 3: ANÁLISE DE WARNINGS DO LOGISTICS/RISK ENGINE ---");
  const serviceHeaders = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` };
  
  const romaRes = await fetch(`${SUPABASE_URL}/rest/v1/inspirations?id=eq.insp_roma_5d_classico&select=*`, { headers: serviceHeaders });
  const romaData = await romaRes.json();
  const roma = romaData[0];

  const daysRes = await fetch(`${SUPABASE_URL}/rest/v1/inspiration_days?inspiration_id=eq.insp_roma_5d_classico&select=*&order=day_number.asc`, { headers: serviceHeaders });
  const daysData = await daysRes.json();

  const actsRes = await fetch(`${SUPABASE_URL}/rest/v1/inspiration_activities?inspiration_id=eq.insp_roma_5d_classico&select=*&order=activity_order.asc`, { headers: serviceHeaders });
  const actsData = await actsRes.json();

  const reconstructedItinerary = daysData.map(d => ({
    day_number: d.day_number,
    title: d.title,
    summary: d.summary,
    effort_level: d.effort_level,
    estimated_walk_km: Number(d.estimated_walk_km),
    estimated_transport_time: d.estimated_transport_time,
    estimated_daily_cost: d.estimated_daily_cost,
    rain_plan: d.rain_plan,
    notes: d.notes,
    activities: actsData.filter(a => a.day_id === d.id).map(a => ({
      id: a.id,
      name: a.name,
      category: a.category,
      description: a.description,
      start_time: a.start_time,
      end_time: a.end_time,
      estimated_duration: a.estimated_duration,
      neighborhood: a.neighborhood,
      address: a.address,
      lat: a.lat !== null ? Number(a.lat) : null,
      lng: a.lng !== null ? Number(a.lng) : null,
      estimated_cost: a.estimated_cost,
      booking_required: a.booking_required,
      booking_priority: a.booking_priority,
      priority: a.priority,
      flexibility: a.flexibility,
      indoor_outdoor: a.indoor_outdoor,
      operational_notes: a.operational_notes,
      why_here: a.why_here
    }))
  }));

  const validation = inspirationsEngine.validateInspirationWithRealEngines({
    ...roma,
    itinerary: reconstructedItinerary,
    sources: [],
    source_insights: []
  });

  console.log(`  Warnings encontrados (${validation.warnings.length}):`);
  validation.warnings.forEach((w, idx) => {
    console.log(`    Warning ${idx + 1}: ${w.title || w.type} | Severidade: ${w.severity || 'low'} | Detalhes: ${w.description || w.message || JSON.stringify(w)}`);
  });

  console.log(`  Breakdown do Score:`, validation.breakdown);
  console.log(`  Score Final Calculado: ${validation.qualityScore}/100`);

  // -------------------------------------------------------------------------
  // PENDÊNCIA 4: NAVEGADOR E2E STATUS
  // -------------------------------------------------------------------------
  console.log("\n--- PENDÊNCIA 4: TESTE E2E VISUAL NO NAVEGADOR ---");
  let hasPuppeteer = false;
  try {
    require('puppeteer');
    hasPuppeteer = true;
  } catch (e) {
    hasPuppeteer = false;
  }

  console.log(`  Automação Headless Browser (Puppeteer/Playwright): ${hasPuppeteer ? 'DISPONÍVEL' : 'NÃO INSTALADA'}`);

  return {
    anonPublishedReadReal,
    anonReviewBlockReal,
    tripAnonApiReached,
    tripAnonRowsReturned,
    tripAnonRlsVerified,
    warnings: validation.warnings,
    qualityScore: validation.qualityScore,
    breakdown: validation.breakdown,
    hasPuppeteer
  };
}

runPendingChecks();
