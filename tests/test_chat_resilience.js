const assert = require('assert');
const fs = require('fs');

console.log('💬 Teste: resiliência visual e funcional do chat');
const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('style.v2.css', 'utf8');
const chatHandler = fs.readFileSync('api/chat.js', 'utf8');

assert.ok(app.includes("const chatRequestInFlight = { plan: false, travel: false }"));
assert.ok(app.includes('if (chatRequestInFlight.plan) return;'));
assert.ok(app.includes('if (chatRequestInFlight.travel) return;'));
assert.ok(app.includes("if (!chatInput.value) chatInput.value = text;"));
assert.ok(app.includes("window.showToast = function(message, type = 'info')"));
assert.ok(css.includes('.orbia-toast-error'));
assert.ok(css.includes('background: rgba(255, 255, 255, 0.97)'));
assert.doesNotMatch(chatHandler, /buildGroundedItineraryFallback\(\{/,
  'editorial quality checks must not replace the planner response with mechanical fallback copy');

console.log('  ✅ Envio duplicado bloqueado, pedido recuperável e alertas no padrão Orbia.');
