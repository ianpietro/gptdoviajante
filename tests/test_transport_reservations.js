const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const state = await import(path.join(root, 'modules/stateManager.js'));
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const aiRouter = fs.readFileSync(path.join(root, 'api/_aiRouter.js'), 'utf8');

  const carTrip = {
    start_date: '2026-09-15',
    reservations: [{
      type: 'Transporte — Carro próprio',
      title: 'Viagem de carro próprio',
      transport_mode: 'own_car',
      transport_scope: 'entire_trip'
    }],
    flights: [], accommodations: [], itinerary: [], packing: [], budget: {}
  };
  const busTrip = {
    ...carTrip,
    reservations: [{ type: 'Transporte — Ônibus', title: 'Ônibus para Campo Grande', transport_mode: 'bus' }]
  };

  if (!state.isTransportReservation(carTrip.reservations[0])) throw new Error('Carro próprio deve ser reconhecido como transporte.');
  if (!state.isTransportReservation(busTrip.reservations[0])) throw new Error('Ônibus deve ser reconhecido como transporte.');
  if (!state.calculateReadinessScore(carTrip).hasTransport) throw new Error('Carro próprio deve concluir o item de transporte.');
  if (!state.calculateOperationalHealthScore(busTrip).items.find(item => item.id === 'transport')?.currentValue.includes('Ônibus')) throw new Error('Saúde da viagem deve mostrar o ônibus salvo.');

  for (const expected of ['Carro próprio', 'Ônibus intermunicipal / interestadual', 'Trem entre cidades', 'Carro alugado', 'Uber, 99 ou táxi', 'Mobilidade no destino', 'resTransportScopeInput']) {
    if (!html.includes(expected)) throw new Error(`Opção/campo ausente: ${expected}`);
  }
  if (!app.includes('applyTransportCommandToTrip(tripData')) throw new Error('Plano de transporte não é salvo no contexto da viagem.');
  if (!app.includes('updateReservationFormForType')) throw new Error('Formulário não reage ao tipo escolhido.');
  if (!aiRouter.includes('primaryTransport: trip.primaryTransport')) throw new Error('IA não recebe o transporte principal.');
  if (!aiRouter.includes('transportPlan: trip.transportPlan')) throw new Error('IA não recebe chegada, mobilidade local e volta separadamente.');
  if (!aiRouter.includes('transportScope: r.transport_scope')) throw new Error('IA não recebe o uso do transporte.');

  console.log('✓ Reservas flexíveis e transporte principal validados');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
