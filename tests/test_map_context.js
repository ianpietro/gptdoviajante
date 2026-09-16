const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  const maps = await import('../modules/mapContextEngine.js');
  const query = maps.buildContextualMapQuery(['Airbnb', 'Rua Tabatinguera'], 'Viagem para São Paulo');
  assert.strictEqual(query, 'Airbnb, Rua Tabatinguera, São Paulo');
  assert.ok(!query.includes('Rio de Janeiro'));

  const complete = maps.buildContextualMapQuery(['Hotel Exemplo', 'Rua Augusta, 1200, São Paulo'], 'São Paulo, SP');
  assert.strictEqual(complete, 'Hotel Exemplo, Rua Augusta, 1200, São Paulo');

  const url = maps.buildGoogleMapsSearchUrl(['Airbnb', 'Rua Tabatinguera'], 'São Paulo, SP');
  assert.ok(decodeURIComponent(url).endsWith('Airbnb, Rua Tabatinguera, São Paulo, SP'));

  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(!appSource.includes('Adicione localizações às atividades para calcular distância e tempo.'));
  assert.ok(!appSource.includes('class="route-sequence"'));
  assert.ok(appSource.includes('km entre as paradas'));
  console.log('✓ Links de mapa respeitam o destino ativo da viagem');
})().catch(error => { console.error(error); process.exit(1); });
