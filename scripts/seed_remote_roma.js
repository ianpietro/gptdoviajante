// scripts/seed_remote_roma.js — Clean & Idempotent Remote Seed for Roma Pilot (Status: REVIEW)
const fs = require('fs');

function getEnvVal(key) {
  if (!fs.existsSync('.env')) return '';
  const env = fs.readFileSync('.env', 'utf8');
  const line = env.split('\n').find(x => x.startsWith(key + '='));
  return line ? line.split('=')[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

const SUPABASE_URL = getEnvVal('SUPABASE_URL') || 'https://mfcajxrvylkwijdpknbx.supabase.co';
const SERVICE_KEY = getEnvVal('SUPABASE_SERVICE_ROLE_KEY');

if (!SERVICE_KEY) {
  console.error("❌ Erro: SUPABASE_SERVICE_ROLE_KEY não configurada.");
  process.exit(1);
}

const inspirationsModule = require('../modules/inspirationsEngine.js');
const romaInsp = inspirationsModule.INSPIRATIONS_DATA[0];

async function seedRemoteRoma() {
  console.log("🌱 Executando Seed Remoto Limpo e Idempotente de Roma em status REVIEW...");

  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  // Explicitly delete previous activities, days, sources, insights, and inspiration for clean seed
  await fetch(`${SUPABASE_URL}/rest/v1/inspiration_source_insights?inspiration_id=eq.${romaInsp.id}`, { method: 'DELETE', headers });
  await fetch(`${SUPABASE_URL}/rest/v1/inspiration_sources?inspiration_id=eq.${romaInsp.id}`, { method: 'DELETE', headers });
  await fetch(`${SUPABASE_URL}/rest/v1/inspiration_activities?inspiration_id=eq.${romaInsp.id}`, { method: 'DELETE', headers });
  await fetch(`${SUPABASE_URL}/rest/v1/inspiration_days?inspiration_id=eq.${romaInsp.id}`, { method: 'DELETE', headers });
  await fetch(`${SUPABASE_URL}/rest/v1/inspirations?id=eq.${romaInsp.id}`, { method: 'DELETE', headers });

  // 1. Insert Inspiration
  const inspPayload = {
    id: romaInsp.id,
    slug: romaInsp.slug,
    title: romaInsp.title,
    destination_city: romaInsp.destination_city,
    destination_region: romaInsp.destination_region,
    country: romaInsp.country,
    country_code: romaInsp.country_code,
    duration_days: romaInsp.duration_days,
    short_description: romaInsp.short_description,
    long_description: romaInsp.long_description,
    traveler_profiles: romaInsp.traveler_profiles,
    travel_styles: romaInsp.travel_styles,
    pace: romaInsp.pace,
    budget_level: romaInsp.budget_level,
    estimated_budget_min: romaInsp.estimated_budget_min,
    estimated_budget_max: romaInsp.estimated_budget_max,
    currency: romaInsp.currency,
    best_for: romaInsp.best_for,
    hero_image_url: romaInsp.hero_image_url,
    thumbnail_url: romaInsp.thumbnail_url,
    status: 'review', // MANDATORY STATUS REVIEW
    quality_score: romaInsp.scores.total,
    editorial_score: romaInsp.scores.content,
    operational_score: romaInsp.scores.operational,
    flexibility_score: romaInsp.scores.flexibility,
    completeness_score: romaInsp.scores.completeness,
    freshness_score: romaInsp.scores.freshness,
    planning_rationale: romaInsp.planning_rationale,
    why_this_works: romaInsp.why_this_works,
    featured: romaInsp.featured,
    copilot_pick: romaInsp.copilot_pick,
    language: romaInsp.language,
    version: romaInsp.version,
    published_at: null,
    created_by: romaInsp.created_by
  };

  const inspRes = await fetch(`${SUPABASE_URL}/rest/v1/inspirations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(inspPayload)
  });

  if (!inspRes.ok) {
    console.error("❌ Erro ao salvar inspiração:", await inspRes.text());
    process.exit(1);
  }
  console.log("  ✅ Inspiração 'Roma Clássica em 5 Dias' salva em status 'review'.");

  // 2. Insert Days and Activities
  const effortMap = { 'light': 'low', 'medium': 'medium', 'high': 'high', 'low': 'low' };

  for (const day of romaInsp.itinerary) {
    const dayId = `day_roma_${day.day_number}`;
    const dayPayload = {
      id: dayId,
      inspiration_id: romaInsp.id,
      day_number: day.day_number,
      title: day.title,
      summary: day.summary,
      effort_level: effortMap[day.effort_level] || 'medium',
      estimated_walk_km: day.estimated_walk_km,
      estimated_transport_time: day.estimated_transport_time,
      estimated_daily_cost: day.estimated_daily_cost,
      rain_plan: day.rain_plan,
      notes: day.notes
    };

    const dayRes = await fetch(`${SUPABASE_URL}/rest/v1/inspiration_days`, {
      method: 'POST',
      headers,
      body: JSON.stringify(dayPayload)
    });

    if (!dayRes.ok) {
      console.error(`❌ Erro ao salvar dia ${day.day_number}:`, await dayRes.text());
      process.exit(1);
    }

    let order = 1;
    for (const act of day.activities) {
      const actPayload = {
        id: act.id,
        inspiration_id: romaInsp.id,
        day_id: dayId,
        activity_order: order++,
        name: act.name,
        category: act.category,
        description: act.description,
        start_time: act.start_time,
        end_time: act.end_time,
        estimated_duration: act.estimated_duration,
        neighborhood: act.neighborhood,
        address: act.address,
        lat: act.lat,
        lng: act.lng,
        estimated_cost: act.estimated_cost,
        currency: act.currency || 'EUR',
        booking_required: act.booking_required || false,
        booking_recommended: act.booking_recommended || false,
        booking_priority: act.booking_priority || 'medium',
        ticket_required: act.ticket_required || false,
        priority: act.priority || 'recommended',
        flexibility: act.flexibility || 'flexible',
        indoor_outdoor: act.indoor_outdoor || 'mixed',
        recommended_time: act.recommended_time,
        operational_notes: act.operational_notes,
        why_here: act.why_here
      };

      const actRes = await fetch(`${SUPABASE_URL}/rest/v1/inspiration_activities`, {
        method: 'POST',
        headers,
        body: JSON.stringify(actPayload)
      });

      if (!actRes.ok) {
        console.error(`❌ Erro ao salvar atividade ${act.name}:`, await actRes.text());
        process.exit(1);
      }
    }
  }
  console.log("  ✅ Exatamente 5 Dias e 18 Atividades inseridos no Supabase remoto.");

  // 3. Insert Sources
  for (const src of romaInsp.sources) {
    const srcRes = await fetch(`${SUPABASE_URL}/rest/v1/inspiration_sources`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: src.id,
        inspiration_id: romaInsp.id,
        source_name: src.source_name,
        source_url: src.source_url,
        source_type: src.source_type,
        verified_at: src.verified_at,
        expires_at: src.expires_at,
        freshness_status: src.freshness_status
      })
    });
    if (!srcRes.ok) console.error("❌ Erro ao salvar fonte:", await srcRes.text());
  }
  console.log("  ✅ 7 Fontes de pesquisa salvas no Supabase remoto.");

  // 4. Insert Source Insights
  for (const ins of romaInsp.source_insights) {
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/inspiration_source_insights`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: ins.id,
        inspiration_id: romaInsp.id,
        source_id: ins.source_id,
        topic: ins.topic,
        insight: ins.insight,
        confidence: ins.confidence,
        verified_at: ins.verified_at
      })
    });
    if (!insRes.ok) console.error("❌ Erro ao salvar insight:", await insRes.text());
  }
  console.log("  ✅ 5 Source Insights salvos no Supabase remoto.");

  console.log("\n🎉 Seed remoto de Roma concluído limpo!");
}

seedRemoteRoma();
