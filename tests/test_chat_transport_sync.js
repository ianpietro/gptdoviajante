const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

(async () => {
  const root = path.resolve(__dirname, '..');
  const transport = await import(path.join(root, 'modules/transportContextEngine.js'));
  const actions = await import(path.join(root, 'modules/actionEngine.js'));
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const prompt = fs.readFileSync(path.join(root, 'api/prompt_master.txt'), 'utf8');
  const chatApi = require(path.join(root, 'api/chat.js'));

  const command = transport.inferTransportCommand('Vou fazer tudo de carro nessa viagem');
  if (command?.mode !== 'own_car' || command?.scope !== 'entire_trip') throw new Error('Comando de carro não foi compreendido.');
  if (transport.inferTransportCommand('É melhor carro ou ônibus?')) throw new Error('Pergunta comparativa não pode alterar a viagem.');

  const flightAndRental = transport.inferTransportCommands('Vou chegar de avião e alugar um carro');
  if (flightAndRental.length !== 2) throw new Error('Avião + carro alugado precisam ser duas escolhas independentes.');
  if (flightAndRental[0]?.mode !== 'flight' || flightAndRental[0]?.scope !== 'arrival') throw new Error('Avião não foi classificado como chegada.');
  if (flightAndRental[1]?.mode !== 'rental_car' || flightAndRental[1]?.scope !== 'local') throw new Error('Carro alugado não foi classificado como mobilidade local.');

  const flightAndUber = transport.inferTransportCommands('Chego de avião e vou usar Uber na cidade');
  if (flightAndUber[0]?.mode !== 'flight' || flightAndUber[1]?.mode !== 'ride_hailing') throw new Error('Avião + Uber não foram compreendidos.');

  const mixedLocal = transport.inferTransportCommands('Vamos andar de metrô e Uber');
  const mixedApplied = transport.applyTransportCommandsToTrip({ reservations: [], preferences: {}, itinerary: [{ dayNum: 1, activities: [{}] }] }, mixedLocal);
  if (mixedApplied.trip.transportPlan?.local?.mode !== 'mixed') throw new Error('Metrô + Uber devem coexistir como mobilidade mista.');
  if (mixedApplied.trip.transportPlan?.local_modes?.length !== 2) throw new Error('Um transporte local sobrescreveu o outro.');
  if (mixedApplied.trip.itinerary?.[0]?.transport_modes?.length !== 2) throw new Error('Roteiro não recebeu os dois modos locais.');

  const original = {
    reservations: [], preferences: {}, flights: [], accommodations: [], packing: [], expenses: [], budget: {},
    itinerary: [{ dayNum: 1, activities: [{ title: 'Parque' }] }, { dayNum: 2, activities: [{ title: 'Museu' }] }]
  };
  const applied = transport.applyTransportCommandToTrip(original, command);
  if (applied.trip.primaryTransport?.mode !== 'own_car') throw new Error('Carro não virou transporte principal.');
  if (!applied.trip.itinerary.every(day => day.transport === 'Carro próprio')) throw new Error('Roteiro não foi adaptado ao carro.');
  if (original.reservations.length !== 0) throw new Error('Motor alterou o estado original.');

  const combined = transport.applyTransportCommandsToTrip(original, flightAndRental);
  if (combined.trip.transportPlan?.arrival?.mode !== 'flight') throw new Error('Chegada de avião não foi salva no plano.');
  if (combined.trip.transportPlan?.local?.mode !== 'rental_car') throw new Error('Carro alugado não foi salvo como mobilidade local.');
  if (!combined.trip.itinerary.every(day => day.transport_mode === 'rental_car')) throw new Error('Roteiro deve usar a mobilidade local, não o voo de chegada.');

  const action = { type: 'reservations', operation: 'add', data: { type: 'Transporte — Ônibus', title: 'Ônibus para o destino', transport_mode: 'bus', transport_scope: 'entire_trip' } };
  let viaAI = actions.applyActions([action], original);
  viaAI = actions.applyActions([action], viaAI);
  if (viaAI.primaryTransport?.mode !== 'bus') throw new Error('Ação da IA não atualizou o transporte principal.');
  if (viaAI.reservations.filter(item => item.transport_mode === 'bus').length !== 1) throw new Error('Ação repetida duplicou o transporte.');
  if (!viaAI.itinerary.every(day => day.transport === 'Ônibus')) throw new Error('Ação da IA não atualizou o roteiro.');

  const onboarding = actions.applyActions([{ type: 'preferences', operation: 'update', data: { destination: 'Roma, Itália' } }], {
    ...original,
    tripTitle: 'Nova viagem',
    preferences: { creation_mode: 'chat_onboarding', creation_stage: 'destination' }
  });
  if (onboarding.tripTitle !== 'Viagem para Roma, Itália') throw new Error('Destino informado no chat não atualizou o título da viagem.');
  if (onboarding.preferences.creation_stage !== 'dates') throw new Error('Onboarding não avançou para a etapa de datas.');
  const titleProtected = actions.applyActions([{ type: 'preferences', operation: 'update', data: {
    destination: 'São Paulo', tripTitle: 'Viagem para um show de jazz', events: ['show de jazz']
  } }], { ...original, tripTitle: 'Nova viagem', preferences: {} });
  if (titleProtected.tripTitle !== 'Viagem para São Paulo') throw new Error('Uma atividade substituiu o destino no título da viagem.');

  const fiveDayTrip = {
    ...original,
    start_date: '2026-09-23',
    end_date: '2026-09-27',
    itinerary: Array.from({ length: 5 }, (_, index) => ({
      dayNum: index + 1,
      dateISO: `2026-09-${String(23 + index).padStart(2, '0')}`,
      dayTitle: `Dia preservado ${index + 1}`,
      activities: []
    }))
  };
  const targetedDayUpdate = actions.applyActions([{
    type: 'itinerary', operation: 'update', index: 0,
    data: { dayNum: 5, dateISO: '2026-09-27', dayTitle: 'Domingo atualizado' }
  }], fiveDayTrip);
  if (targetedDayUpdate.itinerary.length !== 5) throw new Error('Atualização de um dia alterou a quantidade total do roteiro.');
  if (targetedDayUpdate.itinerary[0].dayTitle !== 'Dia preservado 1') throw new Error('Dia 5 sobrescreveu indevidamente o Dia 1 pelo índice.');
  if (targetedDayUpdate.itinerary[4].dayTitle !== 'Domingo atualizado') throw new Error('Atualização não encontrou o dia correto pela data.');

  assert.throws(() => actions.applyActions([{
    type: 'itinerary', operation: 'update', index: 0,
    data: { dayNum: 6, dateISO: '2026-09-28', dayTitle: 'Dia inexistente' }
  }], fiveDayTrip), /target does not exist/, 'Dia inexistente não pode corromper o primeiro dia.');

  if (!app.includes('applyNaturalLanguageTransportUpdate(text)')) throw new Error('Chat não aplica o comando em linguagem natural.');
  if (!app.includes('isCreateTripIntent(text)')) throw new Error('Pedido de nova viagem ainda depende da IA remota.');
  if (!app.includes('startTripViaChat')) throw new Error('Fluxo de criação conversacional não foi conectado.');
  if (!app.includes("if (tab === 'chat')") || !app.includes("bottomNav.style.setProperty('display', 'flex', 'important')")) throw new Error('Navegação inferior não permanece disponível sem viagem ativa.');
  if (!app.includes('findEmbeddedActionJson')) throw new Error('Chat não remove JSON de ações anexado à resposta.');
  if (!app.includes('findLikelyActionPayloadStart')) throw new Error('Chat não possui defesa para JSON de ações truncado.');

  const malformedReply = 'Tudo certo, atualizei o seu roteiro.\n\n{"actions":[{"type":"itinerary","operation":"update","index":0,"data":{"dayNum":6';
  const serverVisible = chatApi.sanitizeActionArtifacts(malformedReply);
  if (serverVisible !== 'Tudo certo, atualizei o seu roteiro.') throw new Error('API ainda expõe JSON de ações truncado.');

  const parserStart = app.indexOf('function stripJsonCodeBlock');
  const parserEnd = app.indexOf('\nfunction applyNaturalLanguageTransportUpdate', parserStart);
  const parserSandbox = {};
  vm.runInNewContext(`${app.slice(parserStart, parserEnd)}\nthis.stripJsonCodeBlock = stripJsonCodeBlock;`, parserSandbox);
  const clientVisible = parserSandbox.stripJsonCodeBlock(malformedReply);
  if (clientVisible !== 'Tudo certo, atualizei o seu roteiro.') throw new Error('Interface ainda expõe JSON de ações truncado.');
  if (app.includes('Não consegui concluir sua solicitação: ${error.message')) throw new Error('Chat ainda expõe o erro técnico bruto ao usuário.');
  if (!prompt.includes('Comando de transporte atualiza o produto')) throw new Error('Prompt da IA não exige sincronização de transporte.');
  console.log('✓ Chat sincroniza transporte com Carteira, Saúde da Viagem e Roteiro');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
