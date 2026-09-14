const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.v2.css'), 'utf8');

console.log('🧳 Teste: seletor global de viagem na aba Hoje');

assert.match(html, /id="homeSection"[\s\S]*id="planTripSelect"/, 'a aba Hoje deve exibir o seletor de viagens');
assert.match(html, /Escolha a viagem usada em todas as abas/, 'o seletor deve explicar seu efeito global');
assert.match(app, /async function switchPlanTrip\(id\)/, 'a troca de viagem deve possuir um fluxo dedicado');
assert.match(app, /setActiveTripId\(id\)/, 'a escolha deve atualizar a viagem ativa');
assert.match(app, /switchTab\('home'\)/, 'a troca deve permanecer na aba Hoje');
assert.match(app, /renderPlanTripSelector\(\)/, 'o seletor deve acompanhar as renderizações');
assert.match(css, /\.plan-trip-switcher\s*\{/, 'o seletor deve ter estilo próprio');

console.log('  ✅ A aba Hoje define a viagem que abastece todas as abas.');
