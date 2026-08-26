const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.GEMINI_API_KEY = 'gemini-test';
process.env.OPENAI_API_KEY = 'openai-test';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

let fetchHandler;
global.fetch = (...args) => fetchHandler(...args);

const {
  routeAIRequest,
  classifyTask,
  buildAIContext,
  processChatHistoryWindow,
  calculateRequestCost
} = require('../api/_aiRouter');

function geminiSuccess(text = 'ok', grounded = false) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] }, ...(grounded ? { groundingMetadata: { searchEntryPoint: {} } } : {}) }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, cachedContentTokenCount: 10, totalTokenCount: 120 }
    })
  };
}

function providerFailure(status, message = 'provider error') {
  return { ok: false, status, json: async () => ({ error: { message } }) };
}

async function run() {
  console.log('🧪 Running AI Router integration tests...');

  const localPhrases = ['Qual é meu voo?', 'Que hotel eu reservei?', 'Quanto já gastei?', 'Qual é meu roteiro amanhã?'];
  localPhrases.forEach(phrase => assert.strictEqual(classifyTask('chat', phrase).useGrounding, false, phrase));
  const realtimePhrases = ['Meu voo atrasou?', 'Vai chover amanhã em Roma?', 'O Louvre abre amanhã?', 'Esse restaurante está aberto agora?'];
  realtimePhrases.forEach(phrase => assert.strictEqual(classifyTask('chat', phrase).useGrounding, true, phrase));

  const trip = {
    destination: 'Roma', dates: '10 a 17/09', hotel: 'Centro',
    flights: [{ number: 'AZ123' }], budget: { spent: 300 }, expenses: [{ description: 'Museu', amount: 50 }],
    packing: [{ category: 'Roupas', items: [{ name: 'Casaco', checked: false }] }],
    itinerary: [{ day: 'terça', activities: [{ title: 'Museu' }] }], reservations: [{ title: 'Museu', date: 'terça' }],
    documents: [{ file_url: 'secret' }]
  };
  const spend = buildAIContext('chat', trip, 'Quanto já gastei?');
  assert.match(spend, /recentExpenses/); assert.doesNotMatch(spend, /packingRemaining|documents|secret/);
  const packing = buildAIContext('chat', trip, 'Que roupa ainda falta?');
  assert.match(packing, /Casaco/); assert.doesNotMatch(packing, /recentExpenses|secret/);
  const flight = buildAIContext('chat', trip, 'Meu voo é amanhã?');
  assert.match(flight, /AZ123/); assert.doesNotMatch(flight, /recentExpenses|itinerary|secret/);
  const itinerary = buildAIContext('chat', trip, 'Troque o museu para terça');
  assert.match(itinerary, /itinerary/); assert.match(itinerary, /reservations/); assert.doesNotMatch(itinerary, /secret/);

  let calls = 0;
  fetchHandler = async () => { calls += 1; return geminiSuccess('resumo'); };
  const messages = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
  const first = await processChatHistoryWindow({ messages, geminiKey: 'x', maxMessages: 8 });
  assert.strictEqual(calls, 1); assert.strictEqual(first.summaryState.summarizedMessageCount, 4);
  const second = await processChatHistoryWindow({ messages, geminiKey: 'x', maxMessages: 8, historyState: first.summaryState });
  assert.strictEqual(calls, 1, 'same prefix must not be summarized twice');
  const third = await processChatHistoryWindow({ messages: [...messages, { role: 'user', content: 'new1' }, { role: 'assistant', content: 'new2' }],
    geminiKey: 'x', maxMessages: 8, historyState: second.summaryState });
  assert.strictEqual(calls, 2); assert.strictEqual(third.summaryState.summarizedMessageCount, 6);

  let counts = { gemini: 0, openai: 0 };
  fetchHandler = async url => {
    if (String(url).includes('generativelanguage')) { counts.gemini += 1; return geminiSuccess('gemini'); }
    counts.openai += 1; return providerFailure(500);
  };
  const primary = await routeAIRequest({ messages: [{ role: 'user', content: 'oi' }], userMessage: 'oi' });
  assert.strictEqual(primary.provider, 'gemini'); assert.deepStrictEqual(counts, { gemini: 1, openai: 0 });
  assert.strictEqual(primary.usage.source, 'provider'); assert.ok(primary.estimatedCostUsd > 0);

  counts = { gemini: 0, openai: 0 };
  fetchHandler = async url => {
    if (String(url).includes('generativelanguage')) { counts.gemini += 1; return providerFailure(503); }
    counts.openai += 1;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'fallback' } }],
      usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 } }) };
  };
  const fallback = await routeAIRequest({ messages: [{ role: 'user', content: 'oi' }], userMessage: 'oi' });
  assert.strictEqual(fallback.provider, 'openai'); assert.strictEqual(fallback.usedFallback, true);
  assert.deepStrictEqual(counts, { gemini: 2, openai: 1 });

  counts = { gemini: 0, openai: 0 };
  fetchHandler = async url => {
    if (String(url).includes('generativelanguage')) { counts.gemini += 1; return providerFailure(400); }
    counts.openai += 1; return providerFailure(500);
  };
  await assert.rejects(() => routeAIRequest({ messages: [{ role: 'user', content: 'oi' }], userMessage: 'oi' }), /provider error/);
  assert.deepStrictEqual(counts, { gemini: 1, openai: 0 }, 'permanent errors must not retry or fallback');

  counts = { gemini: 0, openai: 0 };
  fetchHandler = async url => {
    if (String(url).includes('generativelanguage')) { counts.gemini += 1; return providerFailure(503); }
    counts.openai += 1; return providerFailure(500);
  };
  await assert.rejects(() => routeAIRequest({ task: 'flight_status', needsFreshData: true,
    messages: [{ role: 'user', content: 'Meu voo atrasou?' }], userMessage: 'Meu voo atrasou?' }), /Dados em tempo real indisponíveis/);
  assert.deepStrictEqual(counts, { gemini: 2, openai: 0 }, 'grounded requests must fail closed');

  assert.strictEqual(calculateRequestCost('gemini-2.5-flash', {
    inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000
  }, false), 2.8);

  const apiDir = path.join(__dirname, '..', 'api');
  const directPattern = /generativelanguage\.googleapis\.com|api\.openai\.com|:generateContent|\/chat\/completions/;
  const directFiles = fs.readdirSync(apiDir).filter(name => name.endsWith('.js') && name !== '_aiRouter.js')
    .filter(name => directPattern.test(fs.readFileSync(path.join(apiDir, name), 'utf8')));
  assert.deepStrictEqual(directFiles, [], `direct provider calls outside Router: ${directFiles.join(', ')}`);

  const appHtml = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  assert.match(appHtml, /src="\/app\.js"/, 'published HTML must load the current frontend controller');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok((appJs.match(/tripId: tripData\.id/g) || []).length >= 3, 'all chat calls must send tripId');

  console.log('✅ AI Router integration tests passed.');
}

run().catch(error => { console.error(error); process.exit(1); });
