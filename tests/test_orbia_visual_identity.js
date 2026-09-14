const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.v2.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const requiredTokens = {
  '--orbia-berilo': '#216F80',
  '--orbia-oceano': '#285668',
  '--orbia-profundo': '#263E49',
  '--orbia-ceu': '#DDF3F7',
  '--orbia-turquesa': '#70C4D0',
  '--orbia-areia': '#F4E3C8',
  '--orbia-terra': '#C89B6D',
  '--orbia-laranja': '#ED7542'
};

for (const [token, value] of Object.entries(requiredTokens)) {
  if (!css.includes(`${token}: ${value}`)) throw new Error(`Token ausente: ${token}`);
}

if (!html.includes('family=Nunito:wght@600;700;800;900')) throw new Error('Nunito não foi carregada.');
if (!css.includes("--font-brand: 'Nunito'")) throw new Error('Nunito não foi aplicada à marca.');
if (!html.includes('<body class="light-theme" data-active-tab="home">')) throw new Error('Identidade clara não está fixa no HTML.');
if (html.includes('id="toggleThemeBtn"')) throw new Error('Alternador de tema ainda está visível.');
if (html.includes('dark:bg-') || html.includes('dark:text-')) throw new Error('Classes de modo noturno ainda estão no HTML.');
if (app.includes('localStorage.setItem("gptViajante_theme"')) throw new Error('O modo noturno ainda pode ser salvo.');
if (!app.includes('localStorage.removeItem("gptViajante_theme")')) throw new Error('Preferência de tema antiga não é limpa.');
if (!css.includes('HORIZONTE ORBIA — SINGLE LIGHT IDENTITY')) throw new Error('Camada final Horizonte Orbia ausente.');
if (!config.includes("APP_VERSION = '3.0.0-rc.28'")) throw new Error('Versão do aplicativo incorreta.');
if (!sw.includes('v3.0.0-rc28-full-day')) throw new Error('Versão do cache incorreta.');
if (!css.includes('.timeline-card.expanded .timeline-expandable') || !css.includes('max-height: none !important')) {
  throw new Error('Dias longos do roteiro ainda podem ser cortados.');
}
if (html.includes('id="userAvatar"') || app.includes('userAvatarEl')) throw new Error('Foto fixa de perfil ainda está no cabeçalho.');
if (!html.includes('data-active-tab="home"')) throw new Error('A aba inicial não protege o hero contextual.');
if (!app.includes('document.body.dataset.activeTab = tab')) throw new Error('Navegação não registra a aba ativa.');
for (const id of ['homeSection', 'homeStatusBadge', 'homeTripTitle', 'homeDateRange', 'homeCountdownValue', 'homeCountdownLabel']) {
  const occurrences = (html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length;
  if (occurrences !== 1) throw new Error(`ID duplicado ou ausente: ${id} (${occurrences})`);
}

console.log('✓ Identidade Horizonte Orbia validada');
