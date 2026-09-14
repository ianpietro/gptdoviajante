import assert from 'node:assert/strict';
import { calculateTripDays, generatePackingList, ensureAutoPackingList, getTravelScope } from '../modules/packingEngine.js';

console.log('Test: geração automática da lista de mala');

assert.equal(calculateTripDays('2026-09-02', '2026-09-07'), 6);

const packing = generatePackingList({
  destination: 'Roma',
  countryCode: 'IT',
  startDate: '2026-09-02',
  endDate: '2026-09-07'
});

assert.equal(packing.length, 4);
assert.ok(packing.some(category => category.items.some(entry => entry.name === 'Passaporte válido')));
assert.ok(packing.some(category => category.items.some(entry => entry.name === 'Adaptador universal de tomada')));
assert.ok(packing.some(category => category.items.some(entry => entry.name === 'Calçado confortável')));
assert.ok(packing.every(category => category.items.every(entry => entry.checked === false)));

assert.equal(getTravelScope('São Paulo, SP', ''), 'domestic');
assert.equal(getTravelScope('Campo Grande, MS', ''), 'domestic');
assert.equal(getTravelScope('Destino ainda indefinido', ''), 'unknown');
const saoPauloPacking = generatePackingList({ destination: 'São Paulo, SP', startDate: '2026-09-23', endDate: '2026-09-27' });
const saoPauloItems = saoPauloPacking.flatMap(category => category.items.map(entry => entry.name));
assert.ok(saoPauloItems.includes('Documento oficial com foto'));
assert.ok(!saoPauloItems.some(name => /passaporte/i.test(name)));
assert.ok(!saoPauloItems.some(name => /^seguro viagem/i.test(name)));

const existing = [{ category: 'Minha mala', items: [{ name: 'Item pessoal', checked: true }] }];
const preserved = ensureAutoPackingList({ destination: 'Roma', start_date: '2026-09-02', packing: existing });
assert.strictEqual(preserved.packing, existing);

const migrated = ensureAutoPackingList({ destination: 'Roma', country_code: 'IT', start_date: '2026-09-02', end_date: '2026-09-07', packing: [] });
assert.ok(migrated.packing.length > 0);
assert.equal(migrated.packing_generation_version, 3);

const outdatedDomestic = ensureAutoPackingList({
  destination: 'São Paulo, SP', start_date: '2026-09-23', end_date: '2026-09-27', packing_generation_version: 1,
  packing: [{ category: 'Documentos e dinheiro', items: [{ name: 'Passaporte válido', checked: false }, { name: 'Seguro viagem', checked: false }] }]
});
const migratedDomesticItems = outdatedDomestic.packing.flatMap(category => category.items.map(entry => entry.name));
assert.ok(migratedDomesticItems.includes('Documento oficial com foto'));
assert.ok(!migratedDomesticItems.some(name => /passaporte/i.test(name)));
assert.ok(!migratedDomesticItems.some(name => /^seguro viagem/i.test(name)));

console.log('  ✅ Lista criada por destino e datas, sem sobrescrever itens existentes.');
