import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildItineraryGenerationPrompt,
  extractGeneratedItinerary,
  validateAndNormalizeItinerary
} from '../modules/itineraryGenerationEngine.js';

const prompt = buildItineraryGenerationPrompt({
  destination: 'Campo Grande',
  startDate: '2026-10-02',
  endDate: '2026-10-04',
  days: 3,
  climate: { climateLabel: 'Período chuvoso', itineraryGuidance: 'priorize alternativas cobertas' },
  pace: 'moderado',
  budgetStyle: 'conforto',
  interests: ['gastronomia', 'história e cultura']
});
assert.match(prompt, /EXATAMENTE 3 dias/);
assert.match(prompt, /experiência gastronômica específica/i);
assert.match(prompt, /alternativa indoor/i);
assert.match(prompt, /no mínimo três atividades específicas/i);
assert.match(prompt, /dayStory/);

const source = [1, 2, 3].map(day => ({
  dayNum: day,
  dayTitle: `Campo Grande essencial ${day}`,
  dayStory: 'Este dia conecta a história urbana à herança gastronômica de Campo Grande, começando por um marco cultural e avançando sem pressa até a mesa. A sequência foi escolhida para reduzir deslocamentos e dar contexto antes do sabor.',
  highlight: 'O momento mais marcante é perceber como a memória da cidade reaparece no prato, ligando patrimônio, imigração e hábitos cotidianos.',
  localSecret: 'Observe como os moradores combinam sobá e espetinho na Feira Central, um ritual cotidiano que explica melhor a cidade do que uma lista de pratos.',
  logistics: 'Comece pelo centro cultural e caminhe nas primeiras paradas; depois use carro ou aplicativo por cerca de quinze minutos até a Feira Central.',
  climate_plan: 'Visitar o Museu das Culturas Dom Bosco em caso de chuva.',
  activities: [
    { time: '09:00', title: `Atração principal ${day}`, desc: 'Comece por esta visita porque o contexto histórico prepara a leitura da cidade; reserve ao menos uma hora, confirme o horário e observe os detalhes da arquitetura local.', location: { address: `Museu principal ${day}, Campo Grande, MS` } },
    { time: '12:30', category: 'food', title: `Almoço com sobá no dia ${day}`, desc: 'Escolha a Feira Central porque o sobá conta a história da imigração okinawana; caminhe pelas barracas, observe o ritual local e confirme o horário antes de sair.', location: { address: 'Feira Central, Campo Grande, MS' }, restaurant_options: [
      { name: 'Barraca da Sandra', address: 'Feira Central, Box 12, Campo Grande, MS', dish: 'Sobá tradicional', price_level: '$', why: 'Opção tradicional dentro do principal cenário cultural do sobá.' },
      { name: 'Massa Sobaria', address: 'Rua Pernambuco, 1398, Campo Grande, MS', dish: 'Sobá e espetinho', price_level: '$', why: 'Alternativa especializada e reconhecida fora da Feira Central.' }
    ] },
    { time: '15:00', title: `Experiência cultural ${day}`, desc: 'Feche a tarde neste espaço porque ele conecta patrimônio e vida contemporânea; caminhe com calma, reserve cerca de noventa minutos e observe a programação cultural.', location: { address: `Centro cultural ${day}, Campo Grande, MS` } }
  ]
}));
const extracted = extractGeneratedItinerary({ actions: [{ type: 'itinerary', operation: 'replace', data: source }] });
assert.equal(extracted, source);
const normalized = validateAndNormalizeItinerary(extracted, { days: 3, startDate: '2026-10-02', climatePlan: 'Plano coberto.' });
assert.equal(normalized.length, 3);
assert.equal(normalized[0].date, '02-10-2026');
assert.equal(normalized[0].weekday, 'sexta-feira');
assert.equal(normalized[2].dateLabel, '04-10-2026 · domingo');
assert.equal(normalized[2].dayNum, 3);
assert.equal(normalized[0].activities[1].restaurant_options.length, 2);

assert.throws(() => validateAndNormalizeItinerary(source.slice(0, 2), { days: 3 }), /retornou 2 dias/);
assert.throws(() => validateAndNormalizeItinerary([{ dayTitle: 'Vazio', climate_plan: 'Museu Municipal como alternativa coberta.', activities: [{ title: 'Tempo livre' }, { title: 'Restaurante local' }, { title: 'Peixe regional' }] }], { days: 1 }), /genérica/);
assert.throws(() => validateAndNormalizeItinerary([{ dayTitle: 'Sem comida', climate_plan: 'Museu Municipal como alternativa coberta.', activities: [
  { title: 'Museu A', desc: 'Comece pelo museu porque sua história explica a origem da cidade; confirme o horário e reserve ao menos uma hora para observar a arquitetura local.', location: { address: 'Museu A, Cidade' } },
  { title: 'Praça B', desc: 'Siga até a praça porque ela conecta o patrimônio à vida cotidiana do bairro; caminhe por trinta minutos e observe a paisagem e os moradores.', location: { address: 'Praça B, Cidade' } },
  { title: 'Galeria C', desc: 'Feche na galeria porque a arte contemporânea contrasta com a manhã histórica; confirme a programação e reserve uma hora para a visita.', location: { address: 'Galeria C, Cidade' } }
] }], { days: 1 }), /gastronômica/);
assert.throws(() => validateAndNormalizeItinerary([{ dayTitle: 'Comida vaga', climate_plan: 'Museu Municipal como alternativa coberta.', activities: [
  { title: 'Museu A', desc: 'Comece pelo museu porque sua história explica a origem da cidade; confirme o horário e reserve ao menos uma hora para observar a arquitetura local.', location: { address: 'Museu A, Cidade' } },
  { title: 'Peixe regional', desc: 'Escolha na região central após conferir avaliações e funcionamento.', location: { address: 'Centro, Cidade' } },
  { title: 'Galeria C', desc: 'Feche na galeria porque a arte contemporânea contrasta com a manhã histórica; confirme a programação e reserve uma hora para a visita.', location: { address: 'Galeria C, Cidade' } }
] }], { days: 1 }), /genérica/);
assert.throws(() => validateAndNormalizeItinerary([{ dayTitle: 'Sem restaurantes', climate_plan: 'Museu Municipal como alternativa coberta.', activities: [
  { title: 'Museu A', desc: 'Comece pelo museu porque sua história explica a origem da cidade; confirme o horário e reserve ao menos uma hora para observar a arquitetura local.', location: { address: 'Museu A, Cidade' } },
  { title: 'Almoço típico', category: 'food', desc: 'Pare para o almoço porque o prato tradicional explica a cultura local; confirme o horário da casa e pergunte pela receita de origem da região.', location: { address: 'Centro, Cidade' } },
  { title: 'Galeria C', desc: 'Feche na galeria porque a arte contemporânea contrasta com a manhã histórica; confirme a programação e reserve uma hora para a visita.', location: { address: 'Galeria C, Cidade' } }
] }], { days: 1 }), /dois restaurantes concretos/);

const appHtml = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const appJs = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.match(appHtml, /id="itineraryGeneratorModal"/);
assert.match(appHtml, /onclick="openItineraryGeneratorModal\(\)"/);
assert.match(appJs, /Onde comer/);
assert.match(appJs, /O fio deste dia/);
assert.match(appJs, /Destaque de hoje/);
assert.match(appJs, /Segredo local/);
assert.match(appJs, /Logística do dia/);
assert.match(appJs, /needsFirstItinerary[\s\S]*openItineraryGeneratorModal/);
const guidedFlow = appJs.match(/async function generateItineraryFromForm[\s\S]*?function renderTripDateContext/)?.[0] || '';
assert.match(guidedFlow, /tripContext:/);
assert.doesNotMatch(guidedFlow, /reservations|flights|expenses|documents/);

console.log('Itinerary generation engine tests passed.');
