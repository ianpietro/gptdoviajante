const assert = require('assert');

(async () => {
  const maps = await import('../modules/mapContextEngine.js');
  const query = maps.buildContextualMapQuery(['Airbnb', 'Rua Tabatinguera'], 'Viagem para São Paulo');
  assert.strictEqual(query, 'Airbnb, Rua Tabatinguera, São Paulo');
  assert.ok(!query.includes('Rio de Janeiro'));

  const complete = maps.buildContextualMapQuery(['Hotel Exemplo', 'Rua Augusta, 1200, São Paulo'], 'São Paulo, SP');
  assert.strictEqual(complete, 'Hotel Exemplo, Rua Augusta, 1200, São Paulo');

  const url = maps.buildGoogleMapsSearchUrl(['Airbnb', 'Rua Tabatinguera'], 'São Paulo, SP');
  assert.ok(decodeURIComponent(url).endsWith('Airbnb, Rua Tabatinguera, São Paulo, SP'));
  console.log('✓ Links de mapa respeitam o destino ativo da viagem');
})().catch(error => { console.error(error); process.exit(1); });
