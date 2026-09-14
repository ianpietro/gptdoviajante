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
  classifyRecommendationIntent,
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

function openAiGroundedSuccess(text = 'resposta pesquisada') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      output: [
        { type: 'web_search_call', status: 'completed' },
        { type: 'message', status: 'completed', content: [{ type: 'output_text', text }] }
      ],
      usage: { input_tokens: 40, output_tokens: 10, total_tokens: 50,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }
    })
  };
}

async function run() {
  console.log('🧪 Running AI Router integration tests...');

  const localPhrases = ['Qual é meu voo?', 'Que hotel eu reservei?', 'Quanto já gastei?', 'Qual é meu roteiro amanhã?'];
  localPhrases.forEach(phrase => assert.strictEqual(classifyTask('chat', phrase).useGrounding, false, phrase));
  const realtimePhrases = ['Meu voo atrasou?', 'Vai chover amanhã em Roma?', 'O Louvre abre amanhã?', 'Esse restaurante está aberto agora?'];
  realtimePhrases.forEach(phrase => assert.strictEqual(classifyTask('chat', phrase).useGrounding, true, phrase));
  const operationalPhrases = ['Qual linha de metrô eu pego?', 'Como chegar do hotel ao aeroporto?', 'Precisa de visto para entrar?', 'O que faço agora por perto?', 'Qual o melhor deslocamento do centro ao aeroporto?'];
  operationalPhrases.forEach(phrase => assert.strictEqual(classifyTask('travel_mode', phrase).useGrounding, true, phrase));
  const recommendationPhrases = ['Onde comer em Roma?', 'Qual é o prato típico de Campo Grande?', 'O que visitar em Lisboa?', 'Recomende um hotel em Paris', 'Sugira um bate-volta de Lisboa', 'Compare os bairros Alfama e Baixa', 'Como é o clima em Roma em maio?'];
  recommendationPhrases.forEach(phrase => assert.strictEqual(classifyTask('chat', phrase).useGrounding, true, phrase));
  assert.equal(classifyRecommendationIntent('Quanto já gastei?').required, false);
  assert.equal(classifyTask('itinerary', 'Crie um roteiro de 5 dias').thinkingBudget, 2048);
  assert.equal(classifyTask('itinerary', 'Crie um roteiro de 5 dias').useGrounding, false,
    'a composição final usa o dossiê pesquisado em vez de realizar uma busca solta');
  assert.equal(classifyTask('itinerary_research', 'Campo Grande').useGrounding, true);
  assert.equal(classifyTask('itinerary_research', 'Campo Grande').groundingReason, 'destination_research');

  const trip = {
    destination: 'Roma', dates: '10 a 17/09', hotel: 'Centro',
    flights: [{ number: 'AZ123' }], budget: { spent: 300 }, expenses: [{ description: 'Museu', amount: 50 }],
    packing: [{ category: 'Roupas', items: [{ name: 'Casaco', checked: false }] }],
    itinerary: [{ day: 'terça', activities: [{ title: 'Museu' }] }], reservations: [{ title: 'Museu', date: 'terça' }],
    documents: [{ file_url: 'secret' }],
    weather: 'chuva leve', timezone: 'Europe/Rome',
    runtimeContext: { clientTimestamp: '2026-09-14T18:30:00.000Z', knownLocation: 'Piazza Navona' }
  };
  const spend = buildAIContext('chat', trip, 'Quanto já gastei?');
  assert.match(spend, /recentExpenses/); assert.doesNotMatch(spend, /packingRemaining|documents|secret/);
  const packing = buildAIContext('chat', trip, 'Que roupa ainda falta?');
  assert.match(packing, /Casaco/); assert.doesNotMatch(packing, /recentExpenses|secret/);
  const flight = buildAIContext('chat', trip, 'Meu voo é amanhã?');
  assert.match(flight, /AZ123/); assert.doesNotMatch(flight, /recentExpenses|itinerary|secret/);
  const itinerary = buildAIContext('chat', trip, 'Troque o museu para terça');
  assert.match(itinerary, /itinerary/); assert.match(itinerary, /reservations/); assert.doesNotMatch(itinerary, /secret/);
  const inTrip = buildAIContext('travel_mode', trip, 'O que faço agora por perto?');
  assert.match(inTrip, /Piazza Navona/); assert.match(inTrip, /chuva leve/); assert.match(inTrip, /Europe\/Rome/);
  assert.match(inTrip, /itinerary/); assert.match(inTrip, /reservations/);

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

  fetchHandler = async url => String(url).includes('generativelanguage')
    ? geminiSuccess('recomendação sem pesquisa', false)
    : providerFailure(422, 'pesquisa alternativa indisponível');
  await assert.rejects(() => routeAIRequest({ messages: [{ role: 'user', content: 'Onde comer em Roma?' }],
    userMessage: 'Onde comer em Roma?' }), /pesquisa alternativa indisponível/,
  'recomendações factuais sem grounding devem ser bloqueadas');

  fetchHandler = async () => geminiSuccess('recomendação pesquisada', true);
  const groundedRecommendation = await routeAIRequest({ messages: [{ role: 'user', content: 'Onde comer em Roma?' }],
    userMessage: 'Onde comer em Roma?' });
  assert.equal(groundedRecommendation.groundingUsed, true);
  assert.equal(groundedRecommendation.groundingReason, 'food_recommendation');

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
  process.env.AI_PRIMARY_PROVIDER = 'openai';
  fetchHandler = async url => {
    if (String(url).includes('generativelanguage')) { counts.gemini += 1; return geminiSuccess('gemini'); }
    counts.openai += 1;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'openai-primary' } }],
      usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } }) };
  };
  const preferredOpenAi = await routeAIRequest({ messages: [{ role: 'user', content: 'oi' }], userMessage: 'oi' });
  assert.strictEqual(preferredOpenAi.provider, 'openai'); assert.strictEqual(preferredOpenAi.usedFallback, false);
  assert.deepStrictEqual(counts, { gemini: 0, openai: 1 }, 'configured OpenAI primary must skip Gemini');

  let selectedCompositionModel = null;
  let selectedCompositionBody = null;
  fetchHandler = async (url, options) => {
    selectedCompositionBody = JSON.parse(options.body);
    selectedCompositionModel = selectedCompositionBody.model;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'roteiro estruturado' } }],
      usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } }) };
  };
  const composedItinerary = await routeAIRequest({ task: 'itinerary', messages: [{ role: 'user', content: 'Monte o roteiro' }],
    userMessage: 'Monte o roteiro' });
  assert.equal(composedItinerary.provider, 'openai');
  assert.equal(selectedCompositionModel, 'gpt-5.6-terra', 'itinerary composition must use the dedicated planning model');
  assert.equal(selectedCompositionBody.reasoning_effort, 'high', 'planner must use high reasoning effort');
  assert.equal(selectedCompositionBody.temperature, undefined, 'reasoning planner must not receive unsupported temperature');

  selectedCompositionModel = null;
  await routeAIRequest({ task: 'quick_extraction', messages: [{ role: 'user', content: 'Converta para ações' }],
    userMessage: 'Converta para ações', responseMimeType: 'application/json' });
  assert.equal(selectedCompositionModel, 'gpt-4.1-mini', 'state-action repair must use the stronger structured-output model');
  delete process.env.AI_PRIMARY_PROVIDER;

  counts = { gemini: 0, openai: 0 };
  let researchBody = null;
  fetchHandler = async (url, options) => {
    if (String(url).includes('generativelanguage')) { counts.gemini += 1; return geminiSuccess('gemini'); }
    counts.openai += 1;
    researchBody = JSON.parse(options.body);
    return openAiGroundedSuccess('dossiê pesquisado');
  };
  const researchedItinerary = await routeAIRequest({ task: 'itinerary_research', needsFreshData: true,
    messages: [{ role: 'user', content: 'Pesquise São Paulo' }], userMessage: 'Pesquise São Paulo' });
  assert.equal(researchedItinerary.provider, 'openai');
  assert.equal(researchedItinerary.modelUsed, 'gpt-5.6-terra');
  assert.equal(researchBody.tools?.[0]?.type, 'web_search');
  assert.deepStrictEqual(counts, { gemini: 0, openai: 1 }, 'planner research must use OpenAI web search directly');

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
    counts.openai += 1; return openAiGroundedSuccess('status pesquisado pelo fallback');
  };
  const groundedFallback = await routeAIRequest({ task: 'flight_status', needsFreshData: true,
    messages: [{ role: 'user', content: 'Meu voo atrasou?' }], userMessage: 'Meu voo atrasou?' });
  assert.equal(groundedFallback.provider, 'openai');
  assert.equal(groundedFallback.groundingUsed, true);
  assert.equal(groundedFallback.usedFallback, true);
  assert.deepStrictEqual(counts, { gemini: 2, openai: 1 }, 'grounded requests must use a grounded fallback');

  counts = { gemini: 0, openai: 0 };
  fetchHandler = async url => {
    if (String(url).includes('generativelanguage')) { counts.gemini += 1; return providerFailure(503); }
    counts.openai += 1; return providerFailure(503);
  };
  await assert.rejects(() => routeAIRequest({ task: 'itinerary_research', needsFreshData: true,
    messages: [{ role: 'user', content: 'Destino fictício' }], userMessage: 'Destino fictício' }), /Dados em tempo real indisponíveis/);
  assert.deepStrictEqual(counts, { gemini: 2, openai: 4 }, 'planner research must fail closed only after both grounded providers fail');

  assert.strictEqual(calculateRequestCost('gemini-2.5-flash', {
    inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000
  }, false), 2.8);

  const apiDir = path.join(__dirname, '..', 'api');
  const directPattern = /generativelanguage\.googleapis\.com|api\.openai\.com|:generateContent|\/chat\/completions/;
  const directFiles = fs.readdirSync(apiDir).filter(name => name.endsWith('.js') && name !== '_aiRouter.js')
    .filter(name => directPattern.test(fs.readFileSync(path.join(apiDir, name), 'utf8')));
  assert.deepStrictEqual(directFiles, [], `direct provider calls outside Router: ${directFiles.join(', ')}`);

  const appHtml = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  assert.match(appHtml, /src="\/app\.js(?:\?[^\"]*)?"/, 'published HTML must load the current frontend controller');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok((appJs.match(/tripId: tripData\.id/g) || []).length >= 3, 'all chat calls must send tripId');
  assert.ok((appJs.match(/dates: \{ start: tripData\.start_date, end: tripData\.end_date/g) || []).length >= 3,
    'chat calls must send structured trip dates');
  assert.match(appJs, /chatHistory\.at\(-1\).*chatHistory\.pop\(\)/,
    'a failed request must not remain duplicated in the AI history');
  assert.match(appJs, /if \(!input\.value\) input\.value = text/,
    'a failed request must be restored to the input');
  const localServerText = fs.readFileSync(path.join(__dirname, '..', 'dev-server.js'), 'utf8');
  const chatHandlerText = fs.readFileSync(path.join(apiDir, 'chat.js'), 'utf8');
  assert.match(localServerText, /req\.localDev\s*=\s*true/, 'local server must mark trusted preview requests internally');
  assert.match(localServerText, /loadLocalEnvironment\(\)/, 'local server must load server-only AI configuration');
  assert.match(chatHandlerText, /isTrustedLocalPreview/, 'chat must support the isolated local preview identity');
  assert.match(chatHandlerText, /responseShouldUpdateState/, 'operational AI replies must be checked for interface actions');
  assert.match(chatHandlerText, /repairActionEnvelope/, 'missing structured actions must be repaired server-side');
  assert.match(chatHandlerText, /actionEnvelopeNeedsRepair/, 'non-canonical itinerary actions must be repaired server-side');
  assert.match(chatHandlerText, /visibleReply/, 'a repaired envelope must replace the incompatible block');
  assert.match(chatHandlerText, /responseMimeType: itineraryPlanningRequest \? 'application\/json'/,
    'itinerary creation and follow-up edits must require a structured JSON response');
  assert.match(chatHandlerText, /isItineraryMutationRequest/,
    'itinerary follow-up edits must pass through the full planning pipeline');
  assert.match(chatHandlerText, /auditConstraintCoverage/,
    'hard user commitments must be audited before returning an itinerary');
  assert.match(chatHandlerText, /auditFactualGrounding/,
    'current facts and addresses must be audited before returning an itinerary');
  assert.match(chatHandlerText, /parsedWhole\.message/, 'structured itinerary messages must remain friendly in the chat');
  assert.match(chatHandlerText, /ITINERARY_RESEARCH_UNAVAILABLE/,
    'itinerary research failures must return an actionable safe error');

  console.log('✅ AI Router integration tests passed.');
}

run().catch(error => { console.error(error); process.exit(1); });
