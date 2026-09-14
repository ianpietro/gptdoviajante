const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

console.log('📅 Teste: datas adaptam o contexto completo da viagem');

assert.match(html, /id="tripDatesModal"/, 'deve existir um calendário próprio');
assert.match(html, /id="tripStartDateInput"[\s\S]*id="tripEndDateInput"/, 'calendário deve pedir ida e volta');
assert.match(app, /open:\s*\(\)\s*=>\s*openTripDatesModal\(\)/, 'o botão de datas deve abrir o calendário');
assert.match(app, /applyTripDateContext\(tripData\)/, 'salvar datas deve adaptar o contexto');

(async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'modules/tripContextEngine.js')).href;
  const { applyTripDateContext, buildTripDateContext } = await import(moduleUrl);

  const rome = {
    destination: 'Roma, Itália',
    start_date: '2026-07-02',
    end_date: '2026-07-06',
    budget: { hospedagem: 0, alimentacao: 0, passeios: 0, compras: 0 },
    packing: [],
    itinerary: [{ dayNum: 1, dayTitle: 'Roma Antiga', activities: [] }]
  };
  const romeContext = buildTripDateContext(rome);
  assert.equal(romeContext.days, 5);
  assert.equal(romeContext.climateKind, 'hot');
  applyTripDateContext(rome);
  assert.equal(rome.itinerary[0].date, '02/07/2026');
  assert.match(rome.itinerary[0].climate_plan, /calor/i);
  assert(rome.packing.some(category => category.generated_by === 'date_context'));
  assert(rome.budget_context.autoApplied);

  const campoGrande = buildTripDateContext({
    destination: 'Campo Grande, MS, Brasil',
    start_date: '2027-01-10',
    end_date: '2027-01-14'
  });
  assert.equal(campoGrande.climateKind, 'rainy');
  assert.match(campoGrande.itineraryGuidance, /cobertas/i);

  const bariloche = buildTripDateContext({
    destination: 'Bariloche, Argentina',
    start_date: '2027-07-10',
    end_date: '2027-07-15'
  });
  assert.equal(bariloche.climateKind, 'snow');

  const manual = {
    destination: 'Roma',
    start_date: '2026-11-02',
    end_date: '2026-11-04',
    budget: { hospedagem: 999, alimentacao: 888, passeios: 777, compras: 666 },
    budget_user_modified_at: '2026-09-11T00:00:00.000Z',
    packing: [{ category: 'Minha lista', items: [{ name: 'Meu casaco', checked: true }] }],
    itinerary: []
  };
  applyTripDateContext(manual);
  assert.equal(manual.budget.hospedagem, 999, 'orçamento manual deve ser preservado');
  assert(manual.packing.some(category => category.category === 'Minha lista'), 'lista manual deve ser preservada');
  assert(manual.packing.some(category => category.generated_by === 'date_context'), 'itens de clima devem ser acrescentados');

  console.log('  ✅ Calor, chuva, neve, mala, orçamento e preservação manual validados.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
