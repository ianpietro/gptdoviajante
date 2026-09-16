const assert = require('assert');
const {
  isItineraryMutationRequest,
  buildConstraintExtractionPrompt,
  parsePlanningBrief,
  mergeDeterministicCommitments,
  sanitizePlanningBriefAgainstSources,
  buildEditorialPlanningPrompt,
  auditConstraintCoverage,
  auditFactualGrounding,
  auditItineraryPreservation,
  buildGroundedItineraryFallback
} = require('../api/_tripPlanningIntelligence');
const { buildTripCalendar, auditItineraryQuality } = require('../api/_itineraryQuality');

console.log('🧭 Teste: inteligência editorial e memória de compromissos');

const calendar = buildTripCalendar('2026-09-23', '2026-09-27');
const tripContext = { destination: 'São Paulo, SP', itinerary: [{ dayNum: 1 }] };
assert.equal(isItineraryMutationRequest('inclua JazzB na quarta à noite', tripContext), true);
assert.equal(isItineraryMutationRequest('inclua o check-in às 15h e descanso antes do jazz', tripContext), true);
assert.equal(isItineraryMutationRequest('gosto de jazz', tripContext), false);

const extractionPrompt = buildConstraintExtractionPrompt({
  messages: [{ role: 'user', content: 'Chego em Guarulhos às 8h. JazzB quarta à noite e Bourbon Street sábado à tarde.' }],
  tripContext,
  tripCalendar: calendar
});
assert.match(extractionPrompt, /sugestão anterior do assistente/i);
assert.match(extractionPrompt, /2026-09-23 = 23-09-2026 · quarta-feira/);

const brief = parsePlanningBrief(JSON.stringify({
  tripPurpose: 'viagem de casal',
  travelerProfile: { count: 2, composition: 'casal' },
  hardConstraints: [
    { label: 'JazzB', type: 'event', dateISO: '2026-09-23', weekday: 'quarta-feira', startTime: '21:00', source: 'user', mustPreserve: true },
    { label: 'Bourbon Street Jazz', type: 'event', dateISO: '2026-09-26', weekday: 'sábado', period: 'tarde', source: 'user', mustPreserve: true },
    { label: 'check-in no Airbnb', type: 'checkin', dateISO: '2026-09-23', startTime: '15:00', source: 'user', mustPreserve: true },
    { label: 'leve descanso antes do jazz', type: 'rest', dateISO: '2026-09-23', period: 'tarde', source: 'user', mustPreserve: true }
  ]
}), calendar);
assert.equal(brief.hardConstraints.length, 4);

const incompleteExtraction = parsePlanningBrief(JSON.stringify({ hardConstraints: [] }), calendar);
const deterministicallyMerged = mergeDeterministicCommitments(incompleteExtraction, [{
  role: 'user', content: 'inclua JazzB na quarta à noite e Bourbon Street Jazz sábado de tarde'
}], calendar);
assert.ok(deterministicallyMerged.hardConstraints.some(item => item.label === 'JazzB' && item.dateISO === '2026-09-23'));
assert.ok(deterministicallyMerged.hardConstraints.some(item => /Bourbon Street Jazz/.test(item.label) && item.dateISO === '2026-09-26'));

const onboardingBrief = parsePlanningBrief(JSON.stringify({
  destination: 'São Paulo, SP',
  dates: { start: '2026-09-23', end: '2026-09-27' },
  hardConstraints: []
}));
assert.equal(onboardingBrief.destination, 'São Paulo, SP');
assert.deepEqual(onboardingBrief.dates, { start: '2026-09-23', end: '2026-09-27' });

const contaminated = sanitizePlanningBriefAgainstSources({ hardConstraints: [
  { label: 'Buscar malas na casa do Kadu', type: 'luggage', mustPreserve: true },
  { label: 'Almoço com minha avó', type: 'meal', dateISO: '2026-09-27', mustPreserve: true },
  { label: 'Usar metrô e Uber', type: 'transport', mustPreserve: true },
  { label: 'Algum show de jazz', type: 'event', mustPreserve: true }
], softPreferences: [] }, [{ role: 'user', content: 'Vamos usar metrô e Uber. Domingo vamos almoçar na minha avó.' }], {});
assert.equal(contaminated.hardConstraints.some(item => /Kadu/.test(item.label)), false, 'unsupported facts must be removed');
assert.equal(contaminated.hardConstraints.some(item => /avó/.test(item.label)), true);
assert.equal(contaminated.hardConstraints.some(item => /metrô/.test(item.label)), false, 'untimed transport is a preference, not a dated commitment');
assert.ok(contaminated.softPreferences.some(item => /metrô/.test(item)));

const inventedSchedule = sanitizePlanningBriefAgainstSources({
  destination: 'Curitiba',
  dates: { start: '2026-09-23', end: '2026-09-23' },
  hardConstraints: [
    { label: 'Almoço no Mercado Municipal de Curitiba', type: 'meal', startTime: '12:00', mustPreserve: true },
    { label: 'Jantar reservado no Batel', type: 'meal', startTime: '19:00', mustPreserve: true }
  ],
  softPreferences: ['Pausa programada no Largo da Ordem'],
  logistics: { accommodation: 'Hotel inventado no Batel', localTransport: ['Táxi para todos os trechos'] },
  pacing: { restWindows: ['10:00 no Largo da Ordem', '16:00 no Pátio Batel'] },
  mealsWithPeople: ['Jantar com grupo no Batel']
}, [{ role: 'user', content: 'Crie um roteiro em Curitiba com almoço de culinária paranaense.' }], {
  destination: 'Curitiba', dates: { start: '2026-09-23', end: '2026-09-23' }
});
assert.equal(inventedSchedule.hardConstraints.length, 0, 'generic word overlap must not create fixed commitments');
assert.deepEqual(inventedSchedule.softPreferences, [], 'invented preferences must be removed');
assert.deepEqual(inventedSchedule.logistics, {}, 'invented logistics must be removed');
assert.deepEqual(inventedSchedule.pacing, {}, 'invented rest windows must be removed');
assert.deepEqual(inventedSchedule.mealsWithPeople, [], 'invented social meals must be removed');

const openPreference = sanitizePlanningBriefAgainstSources({ hardConstraints: [
  { label: 'Algum show de jazz', type: 'event', mustPreserve: true }
], softPreferences: [] }, [{ role: 'user', content: 'Queremos ir a algum show de jazz.' }], {});
assert.equal(openPreference.hardConstraints.length, 0);
assert.ok(openPreference.softPreferences.some(item => /jazz/.test(item)));

const editorialPrompt = buildEditorialPlanningPrompt({ planningBrief: brief, tripCalendar: calendar, currentItinerary: [], isMutation: true, requestedDays: 5 });
assert.match(editorialPrompt, /preserve integralmente os dias/i);
assert.match(editorialPrompt, /não invente endereço/i);
assert.match(editorialPrompt, /seis camadas/i);
assert.match(editorialPrompt, /fechamento concreto depois das 18h/i);
assert.match(editorialPrompt, /origem → destino/i);

function day(index, activities) {
  return { ...calendar[index], dayTitle: `Dia autoral ${index + 1}`, activities };
}
const itinerary = [
  day(0, [
    { time: '15:00', title: 'Check-in no Airbnb', desc: 'Chegada à hospedagem confirmada pelo viajante.', location: { address: 'perto da Liberdade' }, verificationStatus: 'user_provided' },
    { time: '17:00', title: 'Leve descanso antes do jazz', desc: 'Pausa protegida depois do check-in.', location: { address: 'Airbnb' }, verificationStatus: 'user_provided' },
    { time: '21:00', title: 'JazzB', desc: 'Show solicitado pelo viajante.', location: { address: 'JazzB, São Paulo' }, verificationStatus: 'verified', sourceUrl: 'https://example.test/jazzb' }
  ]),
  day(1, []), day(2, []),
  day(3, [{ time: '15:00', title: 'Bourbon Street Jazz', desc: 'Parada pedida para sábado à tarde.', location: { address: 'Bourbon Street Music Club, São Paulo' }, verificationStatus: 'verified', sourceUrl: 'https://example.test/bourbon' }]),
  day(4, [])
];
const reply = JSON.stringify({ message: 'Tudo preservado.', actions: [{ type: 'itinerary', operation: 'replace', data: itinerary }] });
const coverage = auditConstraintCoverage(reply, brief, calendar);
assert.equal(coverage.passed, true, coverage.issues.join('; '));

const wrongDay = JSON.parse(JSON.stringify(itinerary));
wrongDay[3].activities = [];
wrongDay[2].activities.push(itinerary[3].activities[0]);
const wrongCoverage = auditConstraintCoverage(JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: wrongDay }] }), brief, calendar);
assert.equal(wrongCoverage.passed, false);
assert.ok(wrongCoverage.issues.some(issue => /data errada/.test(issue)));

const missing = JSON.parse(JSON.stringify(itinerary));
missing[3].activities = [];
const missingCoverage = auditConstraintCoverage(JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: missing }] }), brief, calendar);
assert.ok(missingCoverage.issues.some(issue => /Bourbon Street Jazz/.test(issue)));

const preservation = auditItineraryPreservation(
  JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: missing }] }),
  itinerary,
  'inclua o check-in às 15h'
);
assert.equal(preservation.passed, false);
assert.ok(preservation.issues.some(issue => /Bourbon Street Jazz/.test(issue)));

const invented = JSON.parse(JSON.stringify(itinerary));
invented[0].activities[2].location.address = 'Rua dos Jazz, 123, São Paulo';
delete invented[0].activities[2].sourceUrl;
const grounding = auditFactualGrounding(JSON.stringify({ actions: [{ type: 'itinerary', operation: 'replace', data: invented }] }), {
  destination: 'São Paulo, SP', mustSee: [], signatureFoods: [], restaurants: [], events: []
}, brief);
assert.equal(grounding.passed, false);
assert.ok(grounding.issues.some(issue => /inventado|fonte verificável|não consta/.test(issue)));

const fallbackResearch = {
  destination: 'São Paulo, SP',
  mustSee: Array.from({ length: 5 }, (_, index) => ({ name: `Atração verificada ${index + 1}`, reason: 'Uma leitura concreta da história, arquitetura e cultura paulistana.', location: `Bairro ${index + 1}, São Paulo`, priority: index < 2 ? 'essential' : 'important', verification_note: 'Confirme o horário oficial antes da visita.', sourceUrl: `https://example.test/atracao-${index + 1}` })),
  signatureFoods: [{ name: 'virado à paulista', priority: 'essential' }],
  restaurants: Array.from({ length: 10 }, (_, index) => ({ name: `Restaurante verificado ${index + 1}`, location: `Rua Confirmada ${index + 1}, São Paulo`, dish: index === 0 ? 'virado à paulista' : `Prato paulistano ${index + 1}`, price_level: '$$', why: 'Casa pesquisada por sua cozinha ligada à cidade e posição conveniente no percurso.', verification_note: 'Confirme horário e reserva.', sourceUrl: `https://example.test/restaurante-${index + 1}` })),
  events: [],
  indoorAlternatives: [{ name: 'Centro cultural verificado', location: 'Centro, São Paulo', why: 'Alternativa coberta ligada à história da cidade.', sourceUrl: 'https://example.test/indoor' }],
  localWarnings: ['Use os horários de menor movimento e confirme o funcionamento diretamente nos canais oficiais antes de sair.']
};
const groundedFallback = buildGroundedItineraryFallback({ planningBrief: contaminated, researchBrief: fallbackResearch, tripCalendar: calendar });
assert.ok(groundedFallback);
const fallbackEnvelope = JSON.parse(groundedFallback);
assert.equal(fallbackEnvelope.actions[0].data.length, 5);
assert.ok(fallbackEnvelope.actions[0].data.every(day => day.activities.length >= 4));
const fallbackAudit = auditItineraryQuality(groundedFallback, {
  requestedDays: 5, researchBrief: fallbackResearch, tripCalendar: calendar,
  planningBrief: contaminated, userMessage: 'domingo vamos almoçar na minha avó'
});
assert.equal(fallbackAudit.passed, true, fallbackAudit.issues.join('; '));

console.log('  ✅ Ajustes passam pela mesma pesquisa, calendário e régua do roteiro completo.');
