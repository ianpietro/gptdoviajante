// scripts/publish_roma.js — Official Remote & Local Publication of Roma Pilot
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
  console.error("❌ Erro: SUPABASE_SERVICE_ROLE_KEY não configurada em .env");
  process.exit(1);
}

async function publishRomaPilot() {
  console.log("🚀 Publicando Oficialmente o Piloto Roma no Supabase Remoto em:", SUPABASE_URL);

  const publishedAt = new Date().toISOString();

  // 1. Update Status to 'published' in remote Supabase inspirations table
  const res = await fetch(`${SUPABASE_URL}/rest/v1/inspirations?id=eq.insp_roma_5d_classico`, {
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      status: 'published',
      published_at: publishedAt,
      updated_at: publishedAt
    })
  });

  if (!res.ok) {
    console.error("❌ Erro ao publicar Roma no Supabase:", await res.text());
    process.exit(1);
  }

  const updatedData = await res.json();
  console.log("  ✅ Roma publicado com sucesso no Supabase Remoto!");
  console.log("  📌 Dados Atualizados:", updatedData[0]);

  return updatedData[0];
}

publishRomaPilot();
