const assert = require('assert');

(async () => {
  const {
    buildSafeRouteGeocodeQuery,
    haversineDistanceKm,
    isPrivateRoutePlace,
    parseDestinationGeocodeResult,
    parseGeocodeResult,
    selectNearbyGeocodeResult
  } = await import('../modules/routeMapEngine.js');

  assert.strictEqual(buildSafeRouteGeocodeQuery({ title: 'MASP', location: { address: 'Avenida Paulista, São Paulo' } }, 'São Paulo'), 'MASP, Avenida Paulista, São Paulo');
  assert.strictEqual(buildSafeRouteGeocodeQuery({ title: 'Check-in no Airbnb', location: { address: 'Rua Tabatinguera, 462' } }, 'São Paulo'), '');
  assert.strictEqual(buildSafeRouteGeocodeQuery({ title: 'Deixar as malas na casa do Kadu' }, 'São Paulo'), '');
  assert.strictEqual(isPrivateRoutePlace({ title: 'Casa da família' }), true);
  assert.deepStrictEqual(parseGeocodeResult({ features: [{ geometry: { coordinates: [-46.6333, -23.5505] }, properties: { name: 'Centro', city: 'São Paulo' } }] }), {
    lat: -23.5505,
    lng: -46.6333,
    label: 'Centro, São Paulo'
  });
  assert.deepStrictEqual(parseDestinationGeocodeResult({ results: [{ latitude: -33.4489, longitude: -70.6693, name: 'Santiago', country: 'Chile' }] }), {
    lat: -33.4489,
    lng: -70.6693,
    label: 'Santiago, Chile'
  });
  assert.ok(haversineDistanceKm({ lat: -33.4489, lng: -70.6693 }, { lat: -33.4569, lng: -70.6483 }) < 5);

  const santiagoCenter = { lat: -33.4489, lng: -70.6693 };
  const mixedResults = {
    features: [
      { geometry: { coordinates: [-30.0, 10.0] }, properties: { name: 'Wonderland', country: 'Oceano Atlântico' } },
      { geometry: { coordinates: [-70.6483, -33.4569] }, properties: { name: 'Wonderland Café', city: 'Santiago', country: 'Chile' } }
    ]
  };
  assert.deepStrictEqual(selectNearbyGeocodeResult(mixedResults, santiagoCenter, 'Santiago, Chile'), {
    lat: -33.4569,
    lng: -70.6483,
    label: 'Wonderland Café, Santiago, Chile'
  });
  assert.strictEqual(selectNearbyGeocodeResult({ features: [mixedResults.features[0]] }, santiagoCenter, 'Santiago, Chile'), null);
  console.log('✓ Mapa restringe atrações à cidade do dia e rejeita coordenadas distantes');
})().catch(error => { console.error(error); process.exit(1); });
