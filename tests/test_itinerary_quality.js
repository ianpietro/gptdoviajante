const assert = require('assert');
const {
  buildDestinationResearchPrompt,
  parseDestinationResearchBrief,
  auditItineraryQuality,
  buildQualityRevisionPrompt,
  canonicalizeItineraryEnvelope,
  inferRequestedItineraryDays,
  isItineraryCompletionRequest,
  buildTripCalendar,
  extractCalendarCommitments
} = require('../api/_itineraryQuality');

console.log('🧠 Teste: régua universal de qualidade do roteiro');

assert.equal(inferRequestedItineraryDays('Eu falei do dia 23 ao 27'), 5);
assert.equal(inferRequestedItineraryDays('Faça exatamente 8 dias'), 8);
assert.equal(inferRequestedItineraryDays('Complete o roteiro', {
  start_date: '2026-10-23', end_date: '2026-10-27'
}), 5);
assert.equal(inferRequestedItineraryDays('Complete o roteiro', {
  dates: { start: '2026-10-23', end: '2026-10-27' }
}), 5);
assert.equal(isItineraryCompletionRequest('Cadê o resto do roteiro? Eu falei do dia 23 ao 27'), true);
assert.equal(isItineraryCompletionRequest('O roteiro ficou incompleto, continue'), true);
assert.equal(isItineraryCompletionRequest('Quero sugestões de restaurantes'), false);
assert.match(buildQualityRevisionPrompt({ requestedDays: 2 }), /"dayNum":1/);
assert.match(buildQualityRevisionPrompt({ requestedDays: 2 }), /Nunca use day, title, schedule/);
assert.match(buildQualityRevisionPrompt({ requestedDays: 2 }), /"dayStory"/);
assert.match(buildQualityRevisionPrompt({ requestedDays: 2 }), /Alma não significa empilhar adjetivos/);

const septemberCalendar = buildTripCalendar('2026-09-23', '2026-09-27');
assert.deepEqual(septemberCalendar.map(day => day.dateLabel), [
  '23-09-2026 · quarta-feira', '24-09-2026 · quinta-feira', '25-09-2026 · sexta-feira',
  '26-09-2026 · sábado', '27-09-2026 · domingo'
]);
assert.deepEqual(
  extractCalendarCommitments('inclua JazzB na quarta à noite e Bourbon Street Jazz sábado de tarde').map(item => [item.activity, item.weekday, item.period]),
  [['JazzB', 'quarta', 'noite'], ['Bourbon Street Jazz', 'sabado', 'tarde']]
);

const alternateEnvelope = `\`\`\`json\n${JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: [{
  day: 1, title: 'Centro histórico', climate_plan: 'Se chover, visite o museu coberto no centro histórico.',
  schedule: [{ period: 'tarde', activities: [{ time: '13:00', name: 'Almoço tradicional',
    description: 'Prove um prato típico em uma casa pesquisada e confirme o horário antes de sair.',
    address: 'Centro, Lisboa', restaurant_options: [{ name: 'Casa Teste', especialidade: 'Bacalhau',
      faixa_de_preco: '€20-30', endereco_ou_regiao: 'Centro, Lisboa', justificativa: 'Casa tradicional com cozinha ligada ao destino e localização conveniente.' }] }] }]
}] }] })}\n\`\`\``;
const canonicalEnvelope = canonicalizeItineraryEnvelope(alternateEnvelope, { signatureFoods: [
  { name: 'Bacalhau à Brás', priority: 'essential' }
], restaurants: [
  { name: 'Casa Teste', location: 'Centro, Lisboa', dish: 'Bacalhau', price_level: '$$', why: 'Casa tradicional com cozinha ligada ao destino e localização conveniente.' },
  { name: 'Casa Alternativa', location: 'Baixa, Lisboa', dish: 'Bacalhau à Brás', price_level: '$$', why: 'Alternativa verificada com especialidade portuguesa e acesso simples.' }
] });
const canonicalAction = JSON.parse(canonicalEnvelope.match(/```json\n([\s\S]*?)\n```/)[1]).actions[0];
assert.equal(canonicalAction.data[0].dayNum, 1);
assert.equal(canonicalAction.data[0].dayTitle, 'Centro histórico');
assert.equal(canonicalAction.data[0].activities[0].title, 'Almoço tradicional');
assert.equal(canonicalAction.data[0].activities[0].restaurant_options.length, 2);
assert.ok(canonicalAction.data[0].activities[0].restaurant_options.some(option => option.dish === 'Bacalhau à Brás'));

const researchPrompt = buildDestinationResearchPrompt({
  destination: 'Campo Grande, MS',
  days: 2,
  startDate: '2026-10-02',
  endDate: '2026-10-03',
  interests: ['cultura', 'gastronomia']
});
assert.match(researchPrompt, /ponto mais importante/i);
assert.match(researchPrompt, /sabor mais simbólico/i);
assert.match(researchPrompt, /Pesquisa Google/i);

const brief = parseDestinationResearchBrief(JSON.stringify({
  destination: 'Campo Grande, MS',
  researchedAt: '2026-09-13',
  mustSee: [
    { name: 'Bioparque Pantanal', priority: 'essential' },
    { name: 'Feira Central', priority: 'essential' },
    { name: 'Parque das Nações Indígenas', priority: 'important' }
  ],
  signatureFoods: [
    { name: 'sobá', priority: 'essential' },
    { name: 'chipa', priority: 'important' }
  ],
  restaurants: [
    { name: 'Barraca da Sandra' },
    { name: 'Massa Sobaria' },
    { name: 'Casa do Peixe' },
    { name: 'Pioneiros Restaurante & Choperia' }
  ],
  indoorAlternatives: [{ name: 'Museu das Culturas Dom Bosco' }]
}));
assert.ok(brief);

function foodActivity(day) {
  const options = day === 1
    ? [
      { name: 'Barraca da Sandra', address: 'Feira Central, Campo Grande, MS', dish: 'Sobá tradicional', price_level: '$', why: 'Mantém a tradição okinawana no cenário cultural original do prato.' },
      { name: 'Massa Sobaria', address: 'Rua Pernambuco, Campo Grande, MS', dish: 'Sobá com espetinho', price_level: '$$', why: 'É uma casa especializada no prato mais simbólico da cidade.' }
    ]
    : [
      { name: 'Casa do Peixe', address: 'Centro, Campo Grande, MS', dish: 'Costela de pacu', price_level: '$$', why: 'Apresenta um peixe pantaneiro em uma casa tradicional da cidade.' },
      { name: 'Pioneiros Restaurante & Choperia', address: 'Jardim dos Estados, Campo Grande, MS', dish: 'Pintado a urucum', price_level: '$$', why: 'Combina preparo regional específico com localização conveniente.' }
    ];
  return {
    time: '12:30', category: 'food', title: day === 1 ? 'Sobá na Feira Central' : 'Peixes pantaneiros',
    desc: 'Uma experiência gastronômica ligada à formação cultural da cidade, com prato definido e orientação para confirmar o horário.',
    location: { address: 'Campo Grande, MS' }, restaurant_options: options
  };
}

const itinerary = [
  {
    dayNum: 1,
    dayTitle: 'Pantanal e herança okinawana',
    dayStory: 'A manhã apresenta a escala natural do Pantanal antes de revelar como a imigração okinawana ganhou sabor no cotidiano campo-grandense. A ordem conecta paisagem, memória e mesa sem atravessar a cidade sem necessidade.',
    highlight: 'O encontro entre a biodiversidade do Bioparque e o sobá da Feira mostra duas histórias muito diferentes que hoje definem Campo Grande.',
    localSecret: 'Na Feira Central, observe como sobá e espetinho são pedidos juntos: esse costume conta uma história local que vai além do prato isolado.',
    logistics: 'Comece pelo Bioparque com horário agendado e siga de carro ou aplicativo até a Feira Central; concentre o restante a pé na região central.',
    climate_plan: 'Em caso de chuva, visite o Museu das Culturas Dom Bosco, atração coberta na mesma região.',
    activities: [
      { time: '09:00', title: 'Bioparque Pantanal', desc: 'Abra o dia pela biodiversidade de água doce porque ela situa Campo Grande como porta de entrada do Pantanal; reserve o horário com antecedência e observe os ambientes que reproduzem diferentes bacias.', location: { address: 'Bioparque Pantanal, Campo Grande, MS' } },
      foodActivity(1),
      { time: '16:00', title: 'Feira Central', desc: 'Feche o dia na Feira Central porque a história da imigração japonesa aparece ali na alimentação cotidiana; caminhe entre as barracas e reserve ao menos uma hora para perceber os rituais locais.', location: { address: 'Feira Central, Campo Grande, MS' } }
    ]
  },
  {
    dayNum: 2,
    dayTitle: 'Centro histórico e sabores pantaneiros',
    dayStory: 'O segundo dia troca a escala natural pela memória urbana, começando entre edifícios históricos e terminando em uma paisagem aberta. O peixe pantaneiro faz a ponte entre essas duas faces da cidade.',
    highlight: 'A mudança de ritmo entre a arquitetura da Morada dos Baís e o fim de tarde no parque revela como Campo Grande equilibra cidade e natureza.',
    localSecret: 'Repare nos detalhes restaurados da Morada dos Baís e procure a programação cultural, que ajuda a ler o prédio como memória viva, não só fachada.',
    logistics: 'Faça o trecho central a pé quando possível e use carro ou aplicativo depois do almoço para chegar ao Parque das Nações no horário menos quente.',
    climate_plan: 'Se o tempo fechar, troque a caminhada pela Morada dos Baís, espaço cultural coberto no Centro.',
    activities: [
      { time: '09:00', title: 'Morada dos Baís', desc: 'Comece pela Morada dos Baís porque sua arquitetura ajuda a ler o crescimento da cidade; confira antes a programação cultural e reserve cerca de uma hora para o edifício e as exposições.', location: { address: 'Morada dos Baís, Campo Grande, MS' } },
      foodActivity(2),
      { time: '16:00', title: 'Parque das Nações Indígenas', desc: 'Encerre no Parque das Nações porque a paisagem aberta contrasta com a manhã histórica; chegue após as 16h para caminhar com menos calor e reserve tempo para observar o pôr do sol.', location: { address: 'Parque das Nações Indígenas, Campo Grande, MS' } }
    ]
  }
];

itinerary.forEach(day => day.activities.forEach(activity => {
  activity.durationMinutes = activity.category === 'food' ? 75 : 90;
  activity.whyHere = 'Esta parada mantém o percurso coerente, dá sentido ao tema do dia e evita deslocamentos desnecessários.';
  activity.practicalNote = 'Confirme o horário antes de sair e reserve uma margem confortável para o deslocamento.';
}));

const goodReply = `Roteiro com Bioparque Pantanal, Feira Central e sobá.\n\n\`\`\`json\n${JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: itinerary }] })}\n\`\`\``;
const goodAudit = auditItineraryQuality(goodReply, { requestedDays: 2, researchBrief: brief });
assert.equal(goodAudit.passed, true, goodAudit.issues.join('; '));
assert.equal(goodAudit.metrics.namedRestaurants, 4);

const soulless = JSON.parse(JSON.stringify(itinerary));
delete soulless[0].dayStory;
delete soulless[0].highlight;
delete soulless[0].localSecret;
delete soulless[0].logistics;
const soullessAudit = auditItineraryQuality(`\`\`\`json\n${JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: soulless }] })}\n\`\`\``, { requestedDays: 2, researchBrief: brief });
assert.equal(soullessAudit.passed, false);
assert.ok(soullessAudit.issues.some(issue => /abertura narrativa/.test(issue)));

const generic = JSON.parse(JSON.stringify(itinerary));
generic[0].activities[1] = {
  time: '12:30', category: 'food', title: 'Peixe regional',
  desc: 'Escolha um restaurante bem avaliado na região e confira o funcionamento.',
  location: { address: 'Centro, Campo Grande, MS' }, restaurant_options: []
};
const genericReply = `\`\`\`json\n${JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: generic }] })}\n\`\`\``;
const genericAudit = auditItineraryQuality(genericReply, { requestedDays: 2, researchBrief: brief });
assert.equal(genericAudit.passed, false);
assert.ok(genericAudit.issues.some(issue => /vaga|duas opções/.test(issue)));
assert.ok(genericAudit.issues.some(issue => /sobá/.test(issue)));

const missingLandmark = JSON.parse(JSON.stringify(itinerary));
missingLandmark[0].activities[0].title = 'Museu Regional';
missingLandmark[0].activities[0].location.address = 'Museu Regional, Campo Grande, MS';
const landmarkReply = `\`\`\`json\n${JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: missingLandmark }] })}\n\`\`\``;
const landmarkAudit = auditItineraryQuality(landmarkReply, { requestedDays: 2, researchBrief: brief });
assert.equal(landmarkAudit.passed, false);
assert.ok(landmarkAudit.issues.some(issue => /Bioparque Pantanal/.test(issue)));

console.log('  ✅ Respostas vagas e omissões culturais são bloqueadas em qualquer destino.');
