const assert = require('assert');

(async () => {
  const { filterRestaurantOptionsForDay, verificationContradictsDay } = await import('../modules/restaurantRecommendationEngine.js');
  const itinerary = [
    {
      weekday: 'sábado',
      activities: [{
        title: 'Jantar no Azucar Just Dance',
        restaurant_options: [{ name: 'Azucar Just Dance' }]
      }]
    },
    {
      weekday: 'domingo',
      activities: []
    }
  ];
  const filtered = filterRestaurantOptionsForDay([
    { name: 'Azucar Just Dance', verification_note: 'É a reserva fixa de sábado.' },
    { name: 'Ponto Chic', verification_note: 'Não informa abertura dominical.' },
    { name: 'Casa próxima', verification_note: 'Aberto aos domingos.' }
  ], itinerary, 1);

  assert.deepStrictEqual(filtered.map(option => option.name), ['Casa próxima']);
  assert.strictEqual(verificationContradictsDay('Funcionamento de quinta a sábado.', 'domingo'), true);
  assert.strictEqual(verificationContradictsDay('Funcionamento de terça a domingo.', 'quarta-feira'), false);
  console.log('✓ Recomendações repetidas ou incompatíveis com o dia são removidas');
})().catch(error => { console.error(error); process.exit(1); });
