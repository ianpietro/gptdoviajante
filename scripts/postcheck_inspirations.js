// scripts/postcheck_inspirations.js — Post-check de Validação Remota do Supabase
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

async function runPostCheck() {
  console.log("🔍 Executando Post-Check no Banco Remoto Supabase:", SUPABASE_URL);
  
  if (!SERVICE_KEY) {
    console.error("❌ Erro: SUPABASE_SERVICE_ROLE_KEY não configurada em .env");
    process.exit(1);
  }

  const tables = [
    { name: 'inspirations', select: 'id' },
    { name: 'inspiration_days', select: 'id' },
    { name: 'inspiration_activities', select: 'id' },
    { name: 'inspiration_sources', select: 'id' },
    { name: 'inspiration_source_insights', select: 'id' },
    { name: 'inspiration_collections', select: 'id' },
    { name: 'inspiration_collection_items', select: 'collection_id,inspiration_id' }
  ];

  console.log("\n1. Verificando Tabelas no Schema 'public':");
  for (const tbl of tables) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${tbl.name}?select=${tbl.select}&limit=1`, {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`  ✅ public.${tbl.name}: EXISTE E COMPATÍVEL (Status HTTP ${res.status})`);
      } else {
        console.log(`  ❌ public.${tbl.name}: FALHA (${data.message || JSON.stringify(data)})`);
      }
    } catch (err) {
      console.log(`  ❌ public.${tbl.name}: Erro de rede (${err.message})`);
    }
  }

  console.log("\n2. Verificando RLS com Chave Anônima (Draft / Review Filter):");
  try {
    const resAnon = await fetch(`${SUPABASE_URL}/rest/v1/inspirations?select=id,status`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });
    const anonData = await resAnon.json();
    console.log(`  ℹ️ Leitura Anônima retornou ${Array.isArray(anonData) ? anonData.length : 0} registros publicados.`);
  } catch (err) {
    console.log(`  ❌ Erro ao checar RLS anônimo: ${err.message}`);
  }

  console.log("\nPost-Check finalizado.");
}

runPostCheck();
