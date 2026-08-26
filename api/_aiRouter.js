// Central AI routing, context selection, resilience, usage and cost accounting.
const crypto = require('crypto');
const fetch = global.fetch || require('node-fetch');
const { AI_MODELS, AI_PRICING, AI_PRICING_VERSION } = require('./_aiConfig');

const TRANSIENT_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MAX_CONTEXT_ITEMS = 10;

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyFreshDataIntent(message = '', explicit = false) {
  if (explicit) return { required: true, reason: 'explicit' };
  const text = normalizeText(message);
  const hasFlight = /\b(voo|flight|[a-z]{2}\s?\d{2,4})\b/.test(text);
  if (hasFlight && /(atras|cancel|status|portao|terminal|esteira|decol|pous|horario (atualizado|real|estimado))/.test(text)) {
    return { required: true, reason: 'flight_status' };
  }
  if (/(chover|chuva|previsao do tempo|temperatura|clima)/.test(text) && /(agora|hoje|amanha|esta semana|proxim[oa]s? dias?)/.test(text)) {
    return { required: true, reason: 'weather_forecast' };
  }
  if (/(abre|fecha|abert[oa]|fechad[oa]|funciona|horario)/.test(text) && /(agora|hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|que horas)/.test(text)) {
    return { required: true, reason: 'venue_hours' };
  }
  if (/(preco|tarifa|cotacao|disponibilidade)/.test(text) && /(atual|agora|hoje|neste momento)/.test(text)) {
    return { required: true, reason: 'live_price' };
  }
  return { required: false, reason: 'none' };
}

function selectContextSections(task, userMessage = '') {
  const text = normalizeText(userMessage);
  const sections = new Set(['core']);
  if (task === 'trip_brain') {
    ['budget', 'expenses', 'packing', 'flights', 'itinerary', 'reservations', 'preferences'].forEach(s => sections.add(s));
    return sections;
  }
  if (task === 'budget_analysis') ['budget', 'expenses'].forEach(s => sections.add(s));
  if (task === 'itinerary') ['itinerary', 'reservations', 'preferences'].forEach(s => sections.add(s));
  if (/gast|despesa|custo|orcament|paguei|quanto.*(gaste|cust)/.test(text)) { sections.add('budget'); sections.add('expenses'); }
  if (/\bmala\b|packing|roupa|vestir|levar|ainda falta/.test(text)) sections.add('packing');
  if (/\bvoo|passagem|aeroporto|embarque|decol|pous/.test(text)) sections.add('flights');
  if (/hotel|hosped|acomod/.test(text)) sections.add('accommodations');
  if (/reserva|ingresso|booking/.test(text)) sections.add('reservations');
  if (/roteiro|itiner|passeio|atividade|museu|troque|mova|altere|reorgan|segunda|terca|quarta|quinta|sexta|sabado|domingo/.test(text)) {
    sections.add('itinerary'); sections.add('reservations'); sections.add('preferences');
  }
  if (/viajante|grupo|preferencia|restricao/.test(text)) sections.add('preferences');
  return sections;
}

function compactPacking(packing) {
  return (Array.isArray(packing) ? packing : []).slice(0, 8).map(group => ({
    category: group.category || group.name || 'Itens',
    remaining: (Array.isArray(group.items) ? group.items : []).filter(item => typeof item === 'string' || !item.checked)
      .slice(0, 15).map(item => typeof item === 'string' ? item : (item.name || item.item || item.title)).filter(Boolean)
  }));
}

function compactItinerary(itinerary, userMessage) {
  const list = Array.isArray(itinerary) ? itinerary : [];
  const words = normalizeText(userMessage).split(/\W+/).filter(word => word.length >= 5);
  const relevant = list.filter(day => words.some(word => normalizeText(JSON.stringify(day)).includes(word)));
  return (relevant.length ? relevant : list).slice(0, 7).map(day => ({
    day: day.day || day.date || day.title,
    activities: (day.activities || []).slice(0, MAX_CONTEXT_ITEMS).map(activity => typeof activity === 'string' ? activity : ({
      time: activity.time, title: activity.title || activity.name, reservationId: activity.reservationId
    }))
  }));
}

function buildAIContext(task, trip, userMessage = '') {
  if (!trip) return '';
  const sections = selectContextSections(task, userMessage);
  const context = {
    destination: trip.destination || trip.tripTitle || trip.title || null,
    dates: trip.dates || trip.infoDates || { start: trip.start_date, end: trip.end_date },
    hotel: trip.hotel || trip.infoHotel || null
  };
  if (sections.has('budget')) context.budget = trip.budget || {};
  if (sections.has('expenses')) context.recentExpenses = (trip.expenses || []).slice(-MAX_CONTEXT_ITEMS);
  if (sections.has('packing')) context.packingRemaining = compactPacking(trip.packing);
  if (sections.has('flights')) context.flights = (trip.flights || []).slice(0, 6);
  if (sections.has('accommodations')) context.accommodations = (trip.accommodations || []).slice(0, 6);
  if (sections.has('itinerary')) context.itinerary = compactItinerary(trip.itinerary, userMessage);
  if (sections.has('reservations')) context.reservations = (trip.reservations || []).slice(0, 10).map(r => ({
    id: r.id, title: r.title || r.name, date: r.date || r.start_datetime, status: r.status, category: r.category
  }));
  if (sections.has('preferences')) {
    context.preferences = trip.preferences || trip.ai_context?.custom_instructions || null;
    context.constraints = trip.constraints || trip.ai_context?.notes_summary || null;
  }
  return `\nDADOS RELEVANTES DA VIAGEM (fonte local):\n${JSON.stringify(context)}\n`;
}

function classifyTask(task, userMessage = '', needsFreshData = false) {
  const forcedFreshTasks = new Set(['flight_status', 'flight_search', 'realtime_lookup']);
  const fresh = classifyFreshDataIntent(userMessage, needsFreshData || forcedFreshTasks.has(task));
  if (fresh.required) return { tier: 'FRESH_DATA', model: AI_MODELS.primary, useGrounding: true, groundingReason: fresh.reason };
  if (['document_classify', 'summarize', 'quick_extraction'].includes(task)) {
    return { tier: 'LIGHT', model: AI_MODELS.light, useGrounding: false, groundingReason: 'none' };
  }
  return { tier: 'PRIMARY', model: AI_MODELS.primary, useGrounding: false, groundingReason: 'none' };
}

function providerError(provider, status, message, code) {
  const error = new Error(message);
  error.provider = provider; error.status = status || null; error.code = code || null;
  error.retryable = !status || TRANSIENT_STATUSES.has(status); error.fallbackEligible = error.retryable;
  return error;
}

function normalizeGeminiUsage(raw = {}) {
  const usage = raw.usageMetadata || {};
  if (!Object.keys(usage).length) return null;
  return { inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0,
    cachedInputTokens: usage.cachedContentTokenCount || 0, reasoningTokens: usage.thoughtsTokenCount || 0,
    totalTokens: usage.totalTokenCount || 0, source: 'provider' };
}

function normalizeOpenAIUsage(raw = {}) {
  const usage = raw.usage;
  if (!usage) return null;
  return { inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens || 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
    totalTokens: usage.total_tokens || 0, source: 'provider' };
}

function estimateUsage(systemPrompt, messages, reply) {
  const inputTokens = Math.ceil((String(systemPrompt || '').length + JSON.stringify(messages || []).length) / 4);
  const outputTokens = Math.ceil(String(reply || '').length / 4);
  return { inputTokens, outputTokens, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: inputTokens + outputTokens, source: 'estimated' };
}

function mergeUsage(...items) {
  const valid = items.filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce((total, usage) => ({ inputTokens: total.inputTokens + (usage.inputTokens || 0),
    outputTokens: total.outputTokens + (usage.outputTokens || 0), cachedInputTokens: total.cachedInputTokens + (usage.cachedInputTokens || 0),
    reasoningTokens: total.reasoningTokens + (usage.reasoningTokens || 0), totalTokens: total.totalTokens + (usage.totalTokens || 0),
    source: total.source === 'provider' && usage.source === 'provider' ? 'provider' : 'estimated'
  }), { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0, source: 'provider' });
}

function calculateRequestCost(model, usage, groundingUsed = false) {
  const price = AI_PRICING[model];
  if (!price || !usage) return null;
  const cached = Math.min(usage.cachedInputTokens || 0, usage.inputTokens || 0);
  const uncached = Math.max(0, (usage.inputTokens || 0) - cached);
  return Number((uncached * price.inputPerMillion / 1_000_000 + cached * price.cachedInputPerMillion / 1_000_000 +
    (usage.outputTokens || 0) * price.outputPerMillion / 1_000_000 + (groundingUsed ? price.groundingPerRequest : 0)).toFixed(10));
}

function actualGroundingUsed(rawResponse, requested) {
  if (!requested) return false;
  return Boolean(rawResponse?.candidates?.some(candidate => candidate.groundingMetadata || candidate.groundingAttributions));
}

async function callGeminiProvider({ apiKey, model, systemPrompt, messages, useGrounding, temperature = 0.7, responseMimeType }) {
  const contents = messages.map(message => {
    const parts = [];
    if (message.attachment?.mimeType && message.attachment?.base64) parts.push({ inlineData: { mimeType: message.attachment.mimeType, data: message.attachment.base64 } });
    parts.push({ text: message.content || '' });
    return { role: message.role === 'assistant' ? 'model' : message.role, parts };
  });
  const generationConfig = { temperature };
  if (responseMimeType) generationConfig.responseMimeType = responseMimeType;
  if (model.includes('2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const body = { systemInstruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig };
  if (useGrounding) body.tools = [{ googleSearch: {} }];
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  } catch (error) { throw providerError('gemini', null, error.message || 'Gemini network error', error.code || 'NETWORK_ERROR'); }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw providerError('gemini', response.status, errorBody.error?.message || `Gemini API HTTP ${response.status}`, errorBody.error?.status);
  }
  const rawResponse = await response.json();
  const reply = rawResponse.candidates?.[0]?.content?.parts?.find(part => !part.thought)?.text;
  if (!reply) { const error = providerError('gemini', 422, 'Resposta vazia da API do Gemini.', 'EMPTY_RESPONSE'); error.retryable = false; error.fallbackEligible = false; throw error; }
  return { reply, rawResponse, usage: normalizeGeminiUsage(rawResponse), groundingUsed: actualGroundingUsed(rawResponse, useGrounding) };
}

async function callOpenAIProvider({ apiKey, model, systemPrompt, messages, temperature = 0.7, responseMimeType }) {
  const openAiMessages = [{ role: 'system', content: systemPrompt }, ...messages.map(message => {
    let content = message.content || '';
    if (message.attachment?.mimeType?.startsWith('image/') && message.attachment?.base64) content = [
      { type: 'text', text: content }, { type: 'image_url', image_url: { url: `data:${message.attachment.mimeType};base64,${message.attachment.base64}` } }
    ];
    return { role: message.role === 'model' ? 'assistant' : message.role, content };
  })];
  const body = { model, messages: openAiMessages, temperature };
  if (responseMimeType === 'application/json') body.response_format = { type: 'json_object' };
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  } catch (error) { throw providerError('openai', null, error.message || 'OpenAI network error', error.code || 'NETWORK_ERROR'); }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw providerError('openai', response.status, errorBody.error?.message || `OpenAI API HTTP ${response.status}`, errorBody.error?.code);
  }
  const rawResponse = await response.json();
  const reply = rawResponse.choices?.[0]?.message?.content;
  if (!reply) { const error = providerError('openai', 422, 'Resposta vazia da API da OpenAI.', 'EMPTY_RESPONSE'); error.retryable = false; error.fallbackEligible = false; throw error; }
  return { reply, rawResponse, usage: normalizeOpenAIUsage(rawResponse), groundingUsed: false };
}

async function retryWithBackoff(fn, retries = 1, delayMs = 200) {
  let attempts = 0;
  while (true) {
    attempts += 1;
    try { return { result: await fn(), attempts }; }
    catch (error) {
      if (!error.retryable || attempts > retries) { error.attempts = attempts; throw error; }
      await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempts - 1)));
    }
  }
}

function normalizeStructuredOutput(replyText) {
  if (!replyText) return replyText;
  let cleaned = replyText.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  return cleaned;
}

function prefixHash(messages, count) {
  return crypto.createHash('sha256').update(JSON.stringify((messages || []).slice(0, count))).digest('hex');
}

async function processChatHistoryWindow({ messages = [], geminiKey, maxMessages = 8, historyState = null }) {
  const cutoff = Math.max(0, messages.length - maxMessages);
  let previousCutoff = Math.max(0, Number(historyState?.summarizedMessageCount || 0));
  let previousSummary = historyState?.summaryText || '';
  if (previousCutoff > cutoff || (previousCutoff > 0 && historyState?.sourcePrefixHash !== prefixHash(messages, previousCutoff))) {
    previousCutoff = 0; previousSummary = '';
  }
  const delta = messages.slice(previousCutoff, cutoff);
  let summaryText = previousSummary; let summaryUsage = null; let summaryUpdated = false;
  if (delta.length && geminiKey) {
    const prompt = previousSummary ? `Atualize o resumo acumulado usando apenas as novas mensagens. Resumo atual:\n${previousSummary}` :
      'Resuma decisões, restrições e preferências relevantes da conversa.';
    const formatted = delta.map(message => `${message.role}: ${message.content || ''}`).join('\n');
    try {
      const result = await callGeminiProvider({ apiKey: geminiKey, model: AI_MODELS.light, systemPrompt: prompt,
        messages: [{ role: 'user', content: formatted }], useGrounding: false, temperature: 0.2 });
      summaryText = result.reply.trim(); summaryUsage = result.usage || estimateUsage(prompt, [{ role: 'user', content: formatted }], result.reply); summaryUpdated = true;
    } catch (error) { console.warn('[ai-history] Falha ao atualizar resumo:', error.message); }
  }
  return { messages: messages.slice(cutoff), historySummary: summaryText || null, summaryUsage, summaryUpdated,
    summaryState: { summaryText: summaryText || '', summarizedMessageCount: summaryUpdated ? cutoff : previousCutoff,
      sourcePrefixHash: summaryUpdated ? prefixHash(messages, cutoff) : (historyState?.sourcePrefixHash || null), revision: Number(historyState?.revision || 0) } };
}

function errorCategory(error) {
  if (error?.status === 429) return 'rate_limit';
  if (error?.status === 401 || error?.status === 403) return 'auth';
  if (error?.status >= 500) return 'provider_5xx';
  if (error?.status >= 400) return 'invalid_request';
  if (error?.code === 'EMPTY_RESPONSE') return 'empty_response';
  return 'network';
}

async function persistTelemetry(event) {
  const supabaseUrl = process.env.SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/ai_request_logs`, { method: 'POST', headers: {
      'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'return=minimal'
    }, body: JSON.stringify(event) });
    if (!response.ok) console.warn(`[ai-telemetry] HTTP ${response.status}`);
    return response.ok;
  } catch (error) { console.warn('[ai-telemetry] Falha ao persistir:', error.message); return false; }
}

async function routeAIRequest({ task = 'chat', messages = [], tripContext = null, systemPrompt = '', needsFreshData = false,
  isSystemTask = false, apiKey = null, userMessage = '', userId = null, tripId = null, historyState = null,
  temperature = 0.7, responseMimeType = null }) {
  const startedAt = Date.now(); const requestId = crypto.randomUUID();
  const geminiKey = apiKey || process.env.GEMINI_API_KEY; const openaiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openaiKey) throw new Error('Nenhuma chave de API configurada no servidor.');
  const history = await processChatHistoryWindow({ messages, geminiKey, maxMessages: 8, historyState });
  const context = buildAIContext(task, tripContext, userMessage);
  const summaryContext = history.historySummary ? `\nRESUMO PERSISTIDO DA CONVERSA:\n${history.historySummary}\n` : '';
  const fullSystemPrompt = `${systemPrompt || ''}${summaryContext}${context}`;
  const classification = classifyTask(task, userMessage, needsFreshData);
  let result; let provider; let modelUsed; let usedFallback = false; let attempts = 0; let terminalError = null;
  try {
    if (geminiKey) {
      try {
        const call = await retryWithBackoff(() => callGeminiProvider({ apiKey: geminiKey, model: classification.model,
          systemPrompt: fullSystemPrompt, messages: history.messages, useGrounding: classification.useGrounding, temperature, responseMimeType }), 1, 200);
        result = call.result; attempts += call.attempts; provider = 'gemini'; modelUsed = classification.model;
      } catch (error) { attempts += error.attempts || 1; terminalError = error; }
    }
    if (!result && openaiKey && !classification.useGrounding && (!terminalError || terminalError.fallbackEligible)) {
      provider = 'openai'; modelUsed = AI_MODELS.fallback; usedFallback = true;
      try {
        const call = await retryWithBackoff(() => callOpenAIProvider({ apiKey: openaiKey, model: AI_MODELS.fallback,
          systemPrompt: fullSystemPrompt, messages: history.messages, temperature, responseMimeType }), 1, 300);
        result = call.result; attempts += call.attempts;
      } catch (error) { attempts += error.attempts || 1; terminalError = error; }
    }
    if (!result) {
      if (classification.useGrounding && terminalError) { const error = new Error(`Dados em tempo real indisponíveis: ${terminalError.message}`); error.code = 'FRESH_DATA_PROVIDER_UNAVAILABLE'; throw error; }
      throw terminalError || new Error('Não foi possível obter resposta de nenhum provedor de IA.');
    }
    const reply = normalizeStructuredOutput(result.reply);
    const mainUsage = result.usage || estimateUsage(fullSystemPrompt, history.messages, reply);
    const usage = mergeUsage(history.summaryUsage, mainUsage);
    const mainCost = calculateRequestCost(modelUsed, mainUsage, result.groundingUsed);
    const summaryCost = calculateRequestCost(AI_MODELS.light, history.summaryUsage, false) || 0;
    const estimatedCostUsd = mainCost === null ? null : Number((mainCost + summaryCost).toFixed(10));
    const latencyMs = Date.now() - startedAt;
    await persistTelemetry({ request_id: requestId, user_id: userId, trip_id: tripId, task, provider, model: modelUsed,
      input_tokens: usage?.inputTokens || null, output_tokens: usage?.outputTokens || null, cached_tokens: usage?.cachedInputTokens || 0,
      reasoning_tokens: usage?.reasoningTokens || 0, total_tokens: usage?.totalTokens || null, token_source: usage?.source || 'unavailable',
      latency_ms: latencyMs, fallback_used: usedFallback, grounding_used: result.groundingUsed, success: true, error_category: null,
      estimated_cost_usd: estimatedCostUsd, pricing_version: AI_PRICING_VERSION, attempt_count: attempts, is_system_task: isSystemTask });
    return { reply, provider, modelUsed, usage, tokensUsed: usage?.totalTokens || null, latencyMs, usedFallback,
      groundingUsed: result.groundingUsed, groundingRequested: classification.useGrounding, groundingReason: classification.groundingReason,
      isSystemTask, estimatedCostUsd, pricingVersion: AI_PRICING_VERSION,
      historySummary: history.summaryState, summaryUpdated: history.summaryUpdated, requestId };
  } catch (error) {
    await persistTelemetry({ request_id: requestId, user_id: userId, trip_id: tripId, task,
      provider: terminalError?.provider || error.provider || provider || 'router', model: modelUsed || classification.model, latency_ms: Date.now() - startedAt,
      fallback_used: usedFallback, grounding_used: false, success: false, error_category: errorCategory(terminalError || error),
      error_code: error.code || terminalError?.code || null, estimated_cost_usd: 0, pricing_version: AI_PRICING_VERSION,
      attempt_count: attempts, is_system_task: isSystemTask });
    throw error;
  }
}

module.exports = { routeAIRequest, buildAIContext, selectContextSections, classifyTask, classifyFreshDataIntent,
  normalizeStructuredOutput, processChatHistoryWindow, retryWithBackoff, calculateRequestCost, normalizeGeminiUsage, normalizeOpenAIUsage };
