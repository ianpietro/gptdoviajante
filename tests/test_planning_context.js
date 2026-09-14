const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const planning = await import(path.join(root, 'modules/planningContextEngine.js'));
  const actions = await import(path.join(root, 'modules/actionEngine.js'));
  const message = 'queremos ir a um show de jazz, um show de comédia e talvez um teatro, em dois dias distintos vamos ao Brás fazer compras, queremos almoçar na Liberdade e também cozinhar no Airbnb';
  const inferred = planning.inferPlanningPreferences(message);
  if (!inferred.events.includes('show de jazz') || !inferred.events.includes('show de comédia') || !inferred.events.includes('teatro')) throw new Error('Eventos não foram compreendidos.');
  if (inferred.shoppingDays !== 2) throw new Error('Dois dias de compras não foram compreendidos.');
  if (!inferred.shoppingLocations.includes('Brás')) throw new Error('Brás não foi salvo como local de compras.');
  if (!inferred.lunchAreas.includes('Liberdade')) throw new Error('Almoço na Liberdade não foi compreendido.');
  if (!inferred.cookAtAccommodation) throw new Error('Cozinhar no Airbnb não foi compreendido.');
  const applied = planning.applyPlanningPreferencesToTrip({ preferences: {} }, inferred);
  if (applied.trip.preferences.shopping_days !== 2) throw new Error('Preferências não foram salvas na viagem.');

  const history = [
    { role: 'user', content: 'Vamos em casal para São Paulo, do dia 23 ao 27 de setembro de 2026.' },
    { role: 'user', content: 'Vamos ficar em um Airbnb na Rua Augusta, 1200, São Paulo.' }
  ];
  const facts = planning.inferConversationTripFacts(history, {}, new Date('2026-09-13T12:00:00Z'));
  if (facts.start_date !== '2026-09-23' || facts.end_date !== '2026-09-27') throw new Error('Intervalo completo não foi compreendido.');
  if (facts.traveler_count !== 2) throw new Error('Casal não foi convertido em dois viajantes.');
  if (facts.accommodation.name !== 'Airbnb' || !facts.accommodation.address.includes('Rua Augusta')) throw new Error('Hospedagem não foi compreendida.');
  const destinationWithEvent = planning.inferConversationTripFacts([
    { role: 'user', content: 'Vamos em casal para São Paulo, do dia 23 ao 27 de setembro de 2026.' },
    { role: 'user', content: 'Queremos ir a um show de jazz, um show de comédia e talvez um teatro.' }
  ]);
  if (destinationWithEvent.destination !== 'São Paulo') throw new Error(`Uma atividade substituiu indevidamente o destino: ${destinationWithEvent.destination}`);
  const factsApplied = planning.applyConversationTripFacts({ members: ['Você'], accommodations: [], infoHotel: 'A definir' }, facts);
  if (factsApplied.trip.members.length !== 2 || factsApplied.trip.infoGroup !== '2 viajantes') throw new Error('Grupo não foi sincronizado.');
  if (factsApplied.trip.infoHotel === 'A definir') throw new Error('Hospedagem não foi sincronizada.');
  if (factsApplied.trip.infoDates !== '23-09-2026 a 27-09-2026') throw new Error('Data visível não segue dd-mm-aaaa.');
  if (factsApplied.trip.tripTitle !== 'Viagem para São Paulo') throw new Error('Título da viagem não permaneceu baseado no destino.');

  const noisyAccommodation = planning.inferConversationTripFacts([{ role: 'user', content: 'airbnb - rua tabatiguera, vamos chegar em dias alternados e oq importa é somente a viagem dos dias mencionados.' }]);
  if (noisyAccommodation.accommodation.name !== 'Airbnb') throw new Error('Tipo da hospedagem absorveu a frase do usuário.');
  if (noisyAccommodation.accommodation.address !== 'Rua Tabatiguera') throw new Error(`Endereço da hospedagem ficou contaminado: ${noisyAccommodation.accommodation.address}`);
  const cleanAccommodation = planning.applyConversationTripFacts({ accommodations: [], infoHotel: 'A definir' }, noisyAccommodation);
  if (cleanAccommodation.trip.infoHotel !== 'Airbnb · Rua Tabatiguera') throw new Error(`Cartão de hospedagem não ficou limpo: ${cleanAccommodation.trip.infoHotel}`);

  const sanitizedAIAction = actions.applyActions([{ type: 'accommodations', operation: 'add', data: {
    name: 'airbnb - rua tabatiguera, vamos chegar em dias alternados e oq importa é somente a viagem dos dias mencionados.'
  } }], { accommodations: [], infoHotel: 'A definir' });
  if (sanitizedAIAction.infoHotel !== 'Airbnb · Rua Tabatiguera') throw new Error('Motor de ações não conteve a resposta imprecisa da IA.');

  const repairedRange = planning.inferConversationTripFacts([
    { role: 'user', content: 'Eu falei do dia 23 ao 27.' }
  ], { start_date: '2026-09-23', end_date: '2026-09-23' });
  if (repairedRange.end_date !== '2026-09-27') throw new Error('Intervalo abreviado não corrigiu a data final.');

  const structured = planning.inferConversationTripFacts([{ role: 'assistant', content: `\`\`\`json\n${JSON.stringify({ actions: [
    { type: 'reservations', operation: 'add', data: { type: 'Airbnb', location: 'Rua Bela Cintra, 500, São Paulo' } }
  ] })}\n\`\`\`` }]);
  if (!structured.accommodation.address.includes('Rua Bela Cintra')) throw new Error('Reserva de Airbnb antiga não foi recuperada como hospedagem.');

  const actionSynced = actions.applyActions([
    { type: 'preferences', operation: 'update', data: { traveler_count: 2, start_date: '2026-09-23', end_date: '2026-09-27' } },
    { type: 'reservations', operation: 'add', data: { type: 'Airbnb', title: 'Airbnb na Paulista', location: 'Avenida Paulista, 900, São Paulo' } }
  ], { members: ['Você'], preferences: {}, accommodations: [], reservations: [] });
  if (actionSynced.members.length !== 2 || actionSynced.end_date !== '2026-09-27') throw new Error('Ações da IA não sincronizaram grupo e datas.');
  if (actionSynced.infoHotel !== 'Airbnb · Avenida Paulista, 900, São Paulo') throw new Error(`Reserva da IA não abasteceu hospedagem de forma limpa: ${actionSynced.infoHotel}`);
  console.log('✓ Preferências detalhadas são lembradas sem perguntas repetidas');
})().catch(error => { console.error(error); process.exit(1); });
