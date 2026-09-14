const assert = require('assert');
const { getDestinationKnowledge, auditDestinationCoverage, isItineraryCreationRequest,
  buildCuratedItineraryResponse } = require('../api/_destinationKnowledge');

console.log('🧭 Teste: curadoria obrigatória por destino');

const profile = getDestinationKnowledge({ destination: 'Campo Grande, MS' });
assert.ok(profile, 'Campo Grande deve possuir ficha de curadoria local.');
assert.ok(getDestinationKnowledge('Crie um roteiro de 5 dias em Campo Grande, MS'),
  'deve reconhecer Campo Grande diretamente no pedido antes da viagem ser salva.');
assert.equal(profile.name, 'Campo Grande, MS');
assert.equal(isItineraryCreationRequest('Crie um roteiro de 5 dias em Campo Grande'), true);
assert.equal(isItineraryCreationRequest('Qual é o telefone do hotel?'), false);

const bad = auditDestinationCoverage('Parques, shopping e churrascaria.', profile);
assert.equal(bad.passed, false);
assert.deepEqual(bad.missingCritical, ['Bioparque Pantanal', 'Feira Central', 'sobá']);

const polishedButFake = auditDestinationCoverage(
  'Bioparque Pantanal, Feira Central com sobá, tereré e chipa. Depois, jantar no Restaurante Inventado e tarde livre.',
  profile
);
assert.equal(polishedButFake.passed, false);
assert.ok(polishedButFake.qualityIssues.includes('estabelecimento possivelmente inventado'));
assert.ok(polishedButFake.qualityIssues.includes('atividade vaga usada como enchimento'));

const delegatedCuration = auditDestinationCoverage(
  'Bioparque Pantanal, Feira Central com sobá, tereré e chipa. Peixe regional: escolha, na região central e após conferir avaliações e funcionamento, um preparo de pintado ou pacu.',
  profile
);
assert.equal(delegatedCuration.passed, false);
assert.ok(delegatedCuration.qualityIssues.includes('curadoria transferida ao viajante'));

const good = auditDestinationCoverage(
  'Visite o Bioparque Pantanal e o Parque das Nações. À noite, Feira Central com sobá. Prove tereré e chipa.',
  profile
);
assert.equal(good.passed, true);
assert.equal(good.identityCount, 2);

const fallback = buildCuratedItineraryResponse(profile);
assert.equal(auditDestinationCoverage(fallback, profile).passed, true);
assert.ok(fallback.includes('"actions"'), 'a rota segura deve atualizar o roteiro na interface.');
assert.ok(!fallback.includes('Endereço ou região'), 'a rota segura não deve usar placeholders de localização.');
assert.ok(fallback.includes('Casa do Peixe') && fallback.includes('Rua Doutor João Rosa Pires, 1030'), 'o peixe regional deve apontar uma opção concreta e verificada.');
assert.ok(fallback.includes('Pioneiros Restaurante & Choperia') && fallback.includes('Rua Euclides da Cunha, 479'), 'a alternativa também deve trazer nome e endereço.');
assert.ok(!fallback.includes('após conferir avaliações'), 'a curadoria não pode ser transferida ao viajante.');
assert.ok(!fallback.includes('Margem de segurança para o retorno'), 'logística não pode ocupar o lugar de uma atração.');
const compactFallback = buildCuratedItineraryResponse(profile, 3);
const compactEnvelope = JSON.parse(compactFallback.match(/```json\n([\s\S]*?)\n```/)[1]);
assert.equal(compactEnvelope.actions[0].data.length, 3, 'o fallback deve respeitar a duração solicitada.');

console.log('  ✅ Roteiros genéricos são reprovados e a identidade local é exigida.');
