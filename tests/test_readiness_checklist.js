const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.v2.css'), 'utf8');

console.log('❤️ Teste: checklist visível da Saúde da Viagem');

assert.match(html, /id="readinessChecklist"/, 'a Saúde da Viagem deve ter uma lista visível');
assert.match(app, /function renderReadinessChecklist\(readinessData\)/, 'o painel deve renderizar os itens reais');
assert.match(app, /dates:\s*\{/, 'deve haver ação para datas');
assert.match(app, /transport:\s*\{/, 'deve haver ação para transporte');
assert.match(app, /hotel:\s*\{/, 'deve haver ação para hospedagem');
assert.match(app, /itinerary:\s*\{/, 'deve haver ação para roteiro');
assert.match(app, /budget:\s*\{/, 'deve haver ação para orçamento');
assert.match(css, /\.readiness-checklist\s*\{/, 'o checklist deve ter estilo próprio');

console.log('  ✅ Cada item mostra estado e uma ação direta.');

(async () => {
  const stateModuleUrl = pathToFileURL(path.join(root, 'modules/stateManager.js')).href;
  const { calculateReadinessScore } = await import(stateModuleUrl);
  const result = calculateReadinessScore({
    start_date: '2026-09-20',
    flights: [],
    accommodations: [],
    reservations: [],
    documents: [],
    itinerary: [{ day: 1 }],
    budget: { alimentacao: 500 },
    packing: []
  });

  assert.equal(result.max, result.readinessItems.length, 'contador e lista devem ter o mesmo total');
  assert.equal(result.score, result.readinessItems.filter(item => item.complete).length, 'contador e lista devem ter o mesmo número concluído');
  assert.deepEqual(
    result.readinessItems.map(item => item.label),
    ['Datas da viagem', 'Transporte principal', 'Hospedagem', 'Roteiro dia a dia', 'Orçamento']
  );
  console.log('  ✅ O contador corresponde exatamente aos itens exibidos.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
