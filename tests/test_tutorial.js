import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../style.v2.css', import.meta.url), 'utf8');

console.log('Test: tutorial guiado do VEROA');

assert.match(html, /<span>Tutorial<\/span>/, 'O acesso principal deve se chamar Tutorial.');
assert.match(html, /data-tab="home"[\s\S]*?<span>Hoje<\/span>/);
assert.match(html, /data-tab="roteiro"[\s\S]*?<span>Roteiro<\/span>/);
assert.match(html, /data-tab="logistica"[\s\S]*?<span>Carteira<\/span>/);
assert.doesNotMatch(html, /<span>(Now|Plan|Wallet)<\/span>/, 'A navegação em português não deve misturar nomes em inglês.');
assert.match(html, /Sua viagem inteira,[\s\S]*conectada/, 'O tutorial deve explicar o contexto conectado.');
assert.match(html, /viagem ativa/i);
assert.match(html, /Duas sugestões reais de restaurante/);
assert.match(html, /data-tutorial-tab="home"/);
assert.match(html, /data-tutorial-tab="inspiracoes"/);
assert.match(html, /data-tutorial-tab="roteiro"/);
assert.match(html, /data-tutorial-tab="orcamento"/);
assert.match(html, /data-tutorial-tab="mala"/);
assert.match(html, /data-tutorial-tab="logistica"/);
assert.match(html, /data-tutorial-tab="chat"/);
assert.equal((html.match(/class="tutorial-slide(?: active)?"/g) || []).length, 8, 'O tutorial deve ter 8 etapas.');

assert.match(app, /TUTORIAL_TOTAL_SLIDES = 8/);
assert.match(app, /tutorialProgressBar/);
assert.match(app, /data-tutorial-tab/);
assert.match(app, /switchTab\(targetTab\)/);
assert.match(app, /NAVIGATION_LABELS/);
assert.match(app, /applyNavigationLocale\(\)/);
assert.match(styles, /\.tutorial-progress-track/);
assert.match(styles, /@media \(max-width: 720px\)/);

console.log('  ✅ Tutorial atual, navegável e responsivo encontrado.');
