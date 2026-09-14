// Destination research and quality gate for AI-generated itineraries.
// The goal is to fail closed: a vague or culturally empty itinerary must
// never be returned merely because the model produced fluent prose.

const VAGUE_PATTERNS = /\b(tarde livre|manh[aã] livre|noite livre|tempo livre|restaurante local|comida local|culin[aá]ria local|peixe regional|prato regional|passeio pela cidade|explore a regi[aã]o|compras de [uú]ltima hora|op[cç][aã]o coberta pr[oó]xima|algum museu|um museu|uma feira|um restaurante|lugar bem avaliado|margem de seguran[cç]a)\b|(?:escolha|procure|pesquise|confira).{0,100}(?:avalia[cç][oõ]es|bem avaliad|onde comer|um restaurante|funcionamento)/i;

const FOOD_PATTERN = /almo[cç]o|jantar|caf[eé] da manh[aã]|gastron|culin[aá]ria|comida|prato|restaurante|sobaria|cantina|bistr[oô]/i;
const HOLLOW_PROSE_PATTERNS = /\b(cidade vibrante|experi[eê]ncia inesquec[ií]vel|destino encantador|mergulhe na cultura|encante-se|atra[cç][aã]o imperd[ií]vel|algo para todos|explore o melhor|momento m[aá]gico|lugar [uú]nico e especial)\b/i;
const PRACTICAL_DETAIL_PATTERN = /\b(minut|hor[aá]rio|reserva|ingresso|fila|chegue|saia|abre|fecha|funcionamento|confirm|metr[oô]|[ôo]nibus|uber|t[aá]xi|a p[eé]|caminh|estacion|desloc|trajeto|evite|anteced[eê]ncia)/i;
const LOCAL_CONTEXT_PATTERN = /\b(hist[oó]ria|tradi[cç][aã]o|arquitetura|cultura|bairro|vista|luz|aroma|cheiro|som|atmosfera|ritual|morador|s[ií]mbolo|mem[oó]ria|imigra[cç][aã]o|origem|patrim[oô]nio|paisagem)/i;
const RATIONALE_PATTERN = /\b(porque|por isso|vale|escolh|entra no roteiro|faz sentido|permite|melhor hor[aá]rio|conecta|prepara|contrasta|fecha o dia|abre o dia)\b/i;
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function clampItineraryDays(value) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? Math.max(1, Math.min(30, Math.round(days))) : 0;
}

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildTripCalendar(startDate = '', endDate = '', requestedDays = 0) {
  const start = parseDateOnly(startDate);
  if (!start) return [];
  const end = parseDateOnly(endDate);
  const inclusiveDays = end && end >= start ? Math.floor((end - start) / 86400000) + 1 : Number(requestedDays) || 1;
  return Array.from({ length: Math.max(1, Math.min(31, inclusiveDays)) }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateISO = date.toISOString().slice(0, 10);
    const visible = `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
    const weekday = WEEKDAYS[date.getUTCDay()];
    return { dayNum: index + 1, dateISO, date: visible, dateLabel: `${visible} · ${weekday}`, weekday };
  });
}

function extractCalendarCommitments(message = '') {
  const pattern = /((?:inclua|incluir|adicione|adicionar|coloque|colocar|quero|queremos)?[^,;.!?\n]{1,90}?)\s+(?:na|no|à|a)?\s*(domingo|segunda(?:-feira)?|terça(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|sabado)(?:\s+(?:à|a|de|pela|no)\s*(manhã|manha|tarde|noite))?/giu;
  return [...String(message || '').matchAll(pattern)].map(match => ({
    activity: match[1].replace(/^(?:\s*e\s+)?(?:inclua|incluir|adicione|adicionar|coloque|colocar|quero|queremos)\s+/i, '').replace(/^\s*e\s+/i, '').trim(),
    weekday: normalize(match[2]).replace(' feira', ''),
    period: normalize(match[3] || '')
  })).filter(item => item.activity.length >= 2);
}

function inferRequestedItineraryDays(message = '', tripContext = {}) {
  const source = String(message || '');
  const explicitDuration = source.match(/(?:exatamente\s+)?(\d{1,2})\s+dias?/i);
  if (explicitDuration) return clampItineraryDays(explicitDuration[1]);

  // Follow-ups such as “eu falei do dia 23 ao 27” must retain the inclusive
  // duration even when the frontend has not persisted ISO dates yet.
  const dayRange = source.match(/(?:\bdia\s*)?(\d{1,2})\s*(?:a|ao|at[eé]|[-–—])\s*(?:\bdia\s*)?(\d{1,2})(?!\s*\/)/i);
  if (dayRange) {
    const firstDay = Number(dayRange[1]);
    const lastDay = Number(dayRange[2]);
    if (firstDay >= 1 && firstDay <= 31 && lastDay >= firstDay && lastDay <= 31) {
      return clampItineraryDays(lastDay - firstDay + 1);
    }
  }

  const start = tripContext?.dates?.start || tripContext?.start_date;
  const end = tripContext?.dates?.end || tripContext?.end_date;
  if (start && end) {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    const difference = Math.floor((endDate - startDate) / 86400000) + 1;
    if (Number.isFinite(difference) && difference > 0) return clampItineraryDays(difference);
  }
  return 5;
}

function isItineraryCompletionRequest(message = '') {
  const text = normalize(message);
  const mentionsItinerary = /\b(roteiro|itinerario|programacao|cronograma)\b/.test(text);
  const asksForMissingContent = /\b(cade|resto|faltando|faltam|faltou|incompleto|complete|completar|continue|continuar|todos os dias|ate o dia)\b/.test(text);
  const repeatsDateRange = /(?:\bdia\s*)?\d{1,2}\s*(?:a|ao|ate|[-–—])\s*(?:\bdia\s*)?\d{1,2}/.test(text);
  return (mentionsItinerary && asksForMissingContent) || (mentionsItinerary && repeatsDateRange);
}

function extractJsonCandidates(text = '') {
  const source = String(text || '').trim();
  const fenced = [...source.matchAll(/```\s*json\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
  const embeddedObject = source.match(/\{[\s\S]*\}/)?.[0];
  return [...fenced, embeddedObject, source].filter(Boolean);
}

function parseDestinationResearchBrief(text = '') {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object') continue;
      const mustSee = Array.isArray(parsed.mustSee) ? parsed.mustSee : [];
      const signatureFoods = Array.isArray(parsed.signatureFoods) ? parsed.signatureFoods : [];
      const restaurants = Array.isArray(parsed.restaurants) ? parsed.restaurants : [];
      if (!String(parsed.destination || '').trim() || !mustSee.length || !signatureFoods.length || restaurants.length < 2) continue;
      return {
        destination: String(parsed.destination).trim(),
        researchedAt: String(parsed.researchedAt || '').trim(),
        mustSee,
        signatureFoods,
        restaurants,
        events: Array.isArray(parsed.events) ? parsed.events : [],
        mobility: Array.isArray(parsed.mobility) ? parsed.mobility : [],
        neighborhoodClusters: Array.isArray(parsed.neighborhoodClusters) ? parsed.neighborhoodClusters : [],
        indoorAlternatives: Array.isArray(parsed.indoorAlternatives) ? parsed.indoorAlternatives : [],
        localWarnings: Array.isArray(parsed.localWarnings) ? parsed.localWarnings : []
      };
    } catch (_) {}
  }
  return null;
}

function buildDestinationResearchPrompt({ destination, days = 5, startDate = '', endDate = '', interests = [], planningBrief = null, currentItinerary = [] } = {}) {
  const restaurantTarget = Math.max(4, Math.min(16, Number(days || 5) * 2));
  return `Pesquise o destino como um editor local rigoroso antes da criação do roteiro.

DESTINO: ${destination || 'identifique pelo contexto da viagem'}
PERÍODO: ${startDate || 'não informado'} a ${endDate || 'não informado'}
DURAÇÃO: ${days} dia(s)
INTERESSES: ${Array.isArray(interests) && interests.length ? interests.join(', ') : 'cultura, atrações essenciais e gastronomia'}
CONTRATO DO VIAJANTE: ${JSON.stringify(planningBrief || {})}
ROTEIRO ATUAL A SER CONFERIDO: ${JSON.stringify(currentItinerary || [])}

Use a pesquisa na web para confirmar fatos atuais e registre apenas fontes que realmente aparecerem na pesquisa. Siga esta hierarquia:
1. Sites oficiais da atração, instituição, governo e operador para horários, preços, regras, reservas, acessibilidade, fechamentos e transporte.
2. Google Maps ou equivalente confiável para localização, distância, lógica geográfica, tempo indicativo de deslocamento, existência do estabelecimento e avaliações recentes. Nunca decida apenas pela nota média.
3. Booking ou outra plataforma consolidada para localização, estrutura, adequação ao perfil e avaliações recentes de hospedagem. Disponibilidade, regra e preço final precisam do canal de reserva.
4. Guias editoriais reconhecidos e imprensa local apenas como apoio para relevância cultural, gastronomia, bairros e duração típica de visita.

Quando houver conflito, a fonte oficial atual prevalece. Para um fato operacional importante, cruze duas fontes de naturezas diferentes quando possível. Não afirme ter consultado Google Maps, Booking ou outra fonte nominal se ela não apareceu nos resultados acessíveis.

Sua missão é descobrir o que uma resposta genérica normalmente omite:
1. Os pontos turísticos incontornáveis, inclusive o principal símbolo do destino.
2. O prato, bebida ou tradição gastronômica que funciona como símbolo cultural local.
3. Outros sabores identitários que só fazem sentido naquele lugar ou região.
4. Restaurantes reais e atuais onde esses pratos podem ser pedidos pelo nome.
5. Alternativas cobertas reais para clima desfavorável.
6. Restrições práticas, acessibilidade, necessidade de reserva, horários e possíveis fechamentos sazonais.
7. Cada evento, casa de show ou programação nominal pedida pelo viajante, cruzando a data real com o dia da semana.
8. Tempos e meios de deslocamento entre os compromissos fixos, aeroporto, bagagem e hospedagem, distinguindo estimativa de mapa de horário oficial do operador.
9. Agrupamentos por bairro que evitem zigue-zague e protejam pausas, check-in e encontros pessoais.

Não invente endereços, restaurantes, hotéis, pratos, horários, preços, avaliações, linhas de transporte, tempos de trajeto, regras ou títulos. Se um dado não puder ser confirmado, não o inclua. Diferencie claramente fato confirmado de estimativa. Não use listas genéricas copiáveis para qualquer cidade.

Retorne SOMENTE JSON válido, sem markdown, com este formato:
{
  "destination":"Cidade, região/país",
  "researchedAt":"AAAA-MM-DD",
  "mustSee":[
    {"name":"Nome oficial","reason":"Por que é indispensável e o que observar","location":"Bairro ou endereço pesquisável","priority":"essential|important","verification_note":"Reserva, horário ou cuidado atual","sourceType":"official|map|editorial","sourceUrl":"https://fonte-principal","secondarySourceUrl":"https://segunda-fonte-ou-vazio"}
  ],
  "signatureFoods":[
    {"name":"Nome do prato ou bebida","why_symbolic":"Vínculo cultural concreto com o destino","where_to_try":"Mercado, bairro ou tradição associada","priority":"essential|important"}
  ],
  "restaurants":[
    {"name":"Nome real","location":"Endereço ou bairro pesquisável","dish":"Prato específico","price_level":"$|$$|$$$ ou vazio se não confirmado","why":"Motivo concreto e relação com o destino","verification_note":"O que confirmar antes de ir","sourceType":"official|map|editorial","sourceUrl":"https://fonte-principal","secondarySourceUrl":"https://segunda-fonte-ou-vazio"}
  ],
  "events":[
    {"name":"Evento ou programação nominal","venue":"Local real","dateISO":"AAAA-MM-DD","startTime":"HH:MM ou null","location":"Endereço confirmado","verification_note":"O que foi confirmado e o que ainda exige reconfirmação","sourceType":"official","sourceUrl":"https://fonte-oficial","secondarySourceUrl":"https://segunda-fonte-ou-vazio"}
  ],
  "mobility":[
    {"from":"Origem","to":"Destino","mode":"Modal","duration":"Tempo estimado ou vazio","practical_note":"Bilhete, baldeação, trânsito ou acessibilidade","sourceType":"official|map","sourceUrl":"https://fonte-principal","secondarySourceUrl":"https://segunda-fonte-ou-vazio"}
  ],
  "neighborhoodClusters":[
    {"name":"Eixo geográfico","places":["Locais próximos"],"why":"Por que funciona no mesmo bloco"}
  ],
  "indoorAlternatives":[
    {"name":"Local coberto real","location":"Endereço ou bairro","why":"Quando e por que funciona como plano B"}
  ],
  "localWarnings":["Cuidados práticos e verificáveis"]
}

Inclua de 3 a 6 atrações em mustSee, marque as realmente incontornáveis como essential, inclua de 2 a 5 itens gastronômicos e até ${restaurantTarget} restaurantes confirmados, sem completar a quantidade com nomes fracos ou incertos. O primeiro item de mustSee deve ser o ponto mais importante; o primeiro signatureFoods deve ser o sabor mais simbólico. Todo fato atual ou endereço exato precisa de sourceUrl; fatos operacionais importantes devem trazer secondarySourceUrl quando houver uma segunda fonte acessível. Omita o que não puder ser confirmado.`;
}

function readActionEnvelope(text = '') {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.actions)) return parsed;
    } catch (_) {}
  }
  return null;
}

function extractItinerary(text = '') {
  const envelope = readActionEnvelope(text);
  const action = envelope?.actions?.find(item => item?.type === 'itinerary' && item?.operation === 'replace' && Array.isArray(item.data));
  return action?.data || null;
}

function normalizePriceLevel(value = '') {
  const source = String(value || '').trim();
  if (/^\${1,3}$/.test(source)) return source;
  const firstNumber = Number(source.match(/\d+/)?.[0]);
  if (Number.isFinite(firstNumber)) return firstNumber <= 12 ? '$' : (firstNumber <= 35 ? '$$' : '$$$');
  if (/econ[oô]mic|barat|baixo/i.test(source)) return '$';
  if (/alto|sofistic|premium|caro/i.test(source)) return '$$$';
  return '$$';
}

function canonicalRestaurantOption(option = {}, researchBrief = {}) {
  const name = String(option.name || option.nome || '').trim();
  const verified = (researchBrief.restaurants || []).find(item => normalize(item?.name) === normalize(name)) || {};
  const suppliedAddress = String(option.address || option.endereco_ou_regiao || option.location || '').trim();
  return {
    name: name || verified.name || '',
    address: suppliedAddress.length >= 6 ? suppliedAddress : (verified.location || suppliedAddress),
    dish: option.dish || option.especialidade || option.prato || verified.dish || '',
    price_level: normalizePriceLevel(option.price_level || option.priceLevel || option.faixa_de_preco || verified.price_level),
    why: option.why || option.justificativa || option.motivo || verified.why || '',
    verification_note: option.verification_note || option.nota_de_verificacao || verified.verification_note || 'Confirme horário e necessidade de reserva.'
  };
}

function canonicalizeItineraryData(data, researchBrief = {}, tripCalendar = []) {
  if (!Array.isArray(data)) return data;
  const verifiedRestaurants = Array.isArray(researchBrief.restaurants) ? researchBrief.restaurants : [];
  const canonicalDays = data.map((day, dayIndex) => {
    const rawActivities = Array.isArray(day?.activities)
      ? day.activities
      : (Array.isArray(day?.schedule) ? day.schedule.flatMap(period => period?.activities || []) : []);
    const activities = rawActivities.map((activity, activityIndex) => {
      const title = activity?.title || activity?.name || '';
      const desc = activity?.desc || activity?.description || '';
      const category = activity?.category || (FOOD_PATTERN.test(`${title} ${desc}`) ? 'food' : 'attraction');
      const locationValue = activity?.location?.address || activity?.address || activity?.endereco_ou_regiao || '';
      const canonical = {
        ...activity,
        time: activity?.time || '',
        category,
        title,
        desc,
        location: { ...(typeof activity?.location === 'object' ? activity.location : {}), address: locationValue }
      };
      delete canonical.name;
      delete canonical.description;

      if (category === 'food' || FOOD_PATTERN.test(`${title} ${desc}`)) {
        const rawOptions = Array.isArray(activity?.restaurant_options)
          ? activity.restaurant_options
          : (Array.isArray(activity?.restaurantOptions) ? activity.restaurantOptions : []);
        const options = rawOptions.map(option => canonicalRestaurantOption(option, researchBrief));
        const used = new Set(options.map(option => normalize(option.name)).filter(Boolean));
        const offset = (dayIndex * 2 + activityIndex) % Math.max(1, verifiedRestaurants.length);
        for (let step = 0; options.length < 2 && step < verifiedRestaurants.length; step += 1) {
          const candidate = verifiedRestaurants[(offset + step) % verifiedRestaurants.length];
          if (!candidate?.name || used.has(normalize(candidate.name))) continue;
          options.push(canonicalRestaurantOption(candidate, researchBrief));
          used.add(normalize(candidate.name));
        }
        canonical.restaurant_options = options.slice(0, 2);
        delete canonical.restaurantOptions;
      }
      return canonical;
    });
    return {
      dayNum: Number(day?.dayNum || day?.day || dayIndex + 1),
      ...(tripCalendar[dayIndex] || {}),
      dayTitle: day?.dayTitle || day?.title || `Dia ${dayIndex + 1}`,
      dayStory: day?.dayStory || day?.day_story || day?.narrative || '',
      highlight: day?.highlight || day?.destaque || '',
      localSecret: day?.localSecret || day?.local_secret || day?.segredo_local || '',
      logistics: day?.logistics || day?.logistica || day?.logistics_plan || '',
      climate_plan: day?.climate_plan || day?.climatePlan || '',
      activities
    };
  });

  // Reserve uma opção real para cada símbolo gastronômico obrigatório quando
  // a pesquisa já confirmou uma casa que serve o prato. Isso evita que uma
  // boa composição simplesmente omita a identidade culinária do destino.
  const requiredFoodCount = Math.min(researchBrief.signatureFoods?.length || 0, canonicalDays.length >= 4 ? 2 : 1);
  const foodActivities = canonicalDays.flatMap(day => day.activities.filter(activity => activity.category === 'food'));
  (researchBrief.signatureFoods || []).slice(0, requiredFoodCount).forEach((signature, signatureIndex) => {
    const signatureName = normalize(signature?.name);
    if (!signatureName || normalize(JSON.stringify(canonicalDays)).includes(signatureName)) return;
    const verifiedRestaurant = verifiedRestaurants.find(restaurant => {
      const dish = normalize(restaurant?.dish);
      return dish.includes(signatureName);
    });
    const target = foodActivities[signatureIndex % Math.max(1, foodActivities.length)];
    if (!verifiedRestaurant || !target) return;
    const signatureOption = canonicalRestaurantOption(verifiedRestaurant, researchBrief);
    const options = Array.isArray(target.restaurant_options) ? target.restaurant_options : [];
    const withoutDuplicate = options.filter(option => normalize(option.name) !== normalize(signatureOption.name));
    target.restaurant_options = [signatureOption, ...withoutDuplicate].slice(0, 2);
    target.desc = `${target.desc} Inclua ${signature.name}, símbolo gastronômico local, na opção ${signatureOption.name}.`.trim();
  });

  return canonicalDays;
}

function canonicalizeItineraryEnvelope(text = '', researchBrief = {}, tripCalendar = []) {
  const source = String(text || '');
  const envelope = readActionEnvelope(source);
  if (!envelope) return source;
  let changed = false;
  envelope.actions = envelope.actions.map(action => {
    if (action?.type !== 'itinerary' || !Array.isArray(action.data)) return action;
    changed = true;
    return { ...action, data: canonicalizeItineraryData(action.data, researchBrief, tripCalendar) };
  });
  if (!changed) return source;
  let visible = source.replace(/```\s*json\s*[\s\S]*?```/gi, '').trim();
  try {
    if (JSON.parse(source.trim())?.actions) visible = String(envelope.message || '').trim();
  } catch (_) {}
  return `${visible}${visible ? '\n\n' : ''}\`\`\`json\n${JSON.stringify(envelope)}\n\`\`\``;
}

function meaningful(value, minimum = 1) {
  return String(value || '').trim().length >= minimum;
}

function matchesNamedItem(haystack, item) {
  const text = normalize(haystack);
  const names = [item?.name, ...(Array.isArray(item?.aliases) ? item.aliases : [])].map(normalize).filter(Boolean);
  return names.some(name => text.includes(name));
}

function auditItineraryQuality(text, { requestedDays, researchBrief, tripCalendar = [], userMessage = '', planningBrief = null } = {}) {
  const issues = [];
  const itinerary = extractItinerary(text);
  const days = Number(requestedDays) || 0;
  if (!itinerary) {
    return { passed: false, issues: ['roteiro sem atualização estruturada para o painel'], itinerary: null, metrics: {} };
  }
  if (days && itinerary.length !== days) issues.push(`quantidade incorreta de dias: esperado ${days}, recebido ${itinerary.length}`);

  let totalActivities = 0;
  let foodDays = 0;
  let namedRestaurants = 0;
  const restaurantNames = [];
  let expectedMinimumActivities = 0;

  itinerary.forEach((day, dayIndex) => {
    const activities = Array.isArray(day?.activities) ? day.activities : [];
    totalActivities += activities.length;
    const dayDate = day?.dateISO || tripCalendar[dayIndex]?.dateISO;
    const protectedSlowDay = (planningBrief?.hardConstraints || []).some(item =>
      (!item?.dateISO || item.dateISO === dayDate) && /arrival|departure|luggage|checkin|checkout|rest|meal/i.test(String(item?.type || ''))
    ) || /(chegada|despedida|fam[ií]lia|descanso|check.?in|check.?out)/i.test(`${day?.dayTitle || ''} ${day?.dayStory || ''}`);
    const minimumActivities = protectedSlowDay ? 2 : 3;
    expectedMinimumActivities += minimumActivities;
    if (activities.length < minimumActivities) issues.push(`dia ${dayIndex + 1} tem menos de ${minimumActivities} experiências concretas para o ritmo planejado`);
    if (!meaningful(day?.dayTitle, 8)) issues.push(`dia ${dayIndex + 1} não possui tema específico`);
    const expectedCalendarDay = tripCalendar[dayIndex];
    if (expectedCalendarDay && (day?.dateISO !== expectedCalendarDay.dateISO || normalize(day?.weekday) !== normalize(expectedCalendarDay.weekday))) {
      issues.push(`dia ${dayIndex + 1} não corresponde a ${expectedCalendarDay.dateLabel}`);
    }
    if (/^(dia\s*\d+|explora[cç][oõ]es|passeios|dia livre|conhecendo a cidade)$/i.test(String(day?.dayTitle || '').trim())) {
      issues.push(`dia ${dayIndex + 1} possui título genérico e sem identidade`);
    }
    if (!meaningful(day?.dayStory, 120) || HOLLOW_PROSE_PATTERNS.test(String(day?.dayStory || ''))) {
      issues.push(`dia ${dayIndex + 1} não possui uma abertura narrativa específica que explique o sentido do dia`);
    }
    if (!meaningful(day?.highlight, 70)) issues.push(`dia ${dayIndex + 1} não explica qual é o momento mais marcante`);
    if (!meaningful(day?.localSecret, 65)) issues.push(`dia ${dayIndex + 1} não traz um segredo local concreto`);
    if (!meaningful(day?.logistics, 70) || !PRACTICAL_DETAIL_PATTERN.test(String(day?.logistics || ''))) {
      issues.push(`dia ${dayIndex + 1} não explica a lógica de deslocamento entre as paradas`);
    }
    if (!meaningful(day?.climate_plan, 35) || VAGUE_PATTERNS.test(String(day?.climate_plan || ''))) {
      issues.push(`dia ${dayIndex + 1} não possui plano climático específico e nomeado`);
    }

    let hasFood = false;
    activities.forEach((activity, activityIndex) => {
      const title = String(activity?.title || '').trim();
      const desc = String(activity?.desc || '').trim();
      if (!meaningful(title, 4)) issues.push(`atividade ${activityIndex + 1} do dia ${dayIndex + 1} sem nome específico`);
      if (!meaningful(desc, 110)) issues.push(`atividade “${title || activityIndex + 1}” do dia ${dayIndex + 1} sem detalhamento suficiente`);
      if (VAGUE_PATTERNS.test(`${title} ${desc}`)) issues.push(`atividade vaga no dia ${dayIndex + 1}: ${title || 'sem título'}`);
      if (HOLLOW_PROSE_PATTERNS.test(desc)) issues.push(`atividade “${title || activityIndex + 1}” usa linguagem bonita, mas vazia`);
      const detailDimensions = [PRACTICAL_DETAIL_PATTERN, LOCAL_CONTEXT_PATTERN, RATIONALE_PATTERN]
        .filter(pattern => pattern.test(desc)).length;
      if (detailDimensions < 2) issues.push(`atividade “${title || activityIndex + 1}” não explica contexto, motivo e orientação prática suficientes`);
      if (!meaningful(activity?.location?.address, 6)) issues.push(`atividade “${title || activityIndex + 1}” sem localização pesquisável`);
      const duration = Number(activity?.durationMinutes);
      if (!Number.isFinite(duration) || duration < 10 || duration > 720) {
        issues.push(`atividade “${title || activityIndex + 1}” sem duração realista`);
      }
      if (!meaningful(activity?.whyHere, 25) && !RATIONALE_PATTERN.test(desc)) {
        issues.push(`atividade “${title || activityIndex + 1}” não explica por que está nesta sequência`);
      }
      if (!meaningful(activity?.practicalNote, 20) && !PRACTICAL_DETAIL_PATTERN.test(desc)) {
        issues.push(`atividade “${title || activityIndex + 1}” não traz orientação prática`);
      }

      const isPersonalMeal = activity?.verificationStatus === 'user_provided' &&
        /(avo|familia|amig|casa)/.test(normalize(`${title} ${desc}`));
      const isFood = activity?.category === 'food' || (!isPersonalMeal && FOOD_PATTERN.test(`${title} ${desc}`));
      if (!isFood) return;
      hasFood = true;
      const options = Array.isArray(activity.restaurant_options)
        ? activity.restaurant_options
        : (Array.isArray(activity.restaurantOptions) ? activity.restaurantOptions : []);
      if (options.length < 2) issues.push(`refeição “${title}” do dia ${dayIndex + 1} não possui duas opções reais`);
      options.slice(0, 2).forEach((option, optionIndex) => {
        const name = String(option?.name || '').trim();
        if (!meaningful(name, 3) || /^(restaurante|op[cç][aã]o|lugar|casa local|restaurante local)$/i.test(name)) {
          issues.push(`opção ${optionIndex + 1} da refeição “${title}” sem restaurante nomeado`);
        } else {
          namedRestaurants += 1;
          restaurantNames.push(name);
        }
        if (!meaningful(option?.address, 6)) issues.push(`restaurante “${name || 'sem nome'}” sem endereço ou bairro`);
        if (!meaningful(option?.dish, 4)) issues.push(`restaurante “${name || 'sem nome'}” sem prato específico`);
        if (!/^\${1,3}(?:\s|$)/.test(String(option?.price_level || option?.priceLevel || '').trim())) {
          issues.push(`restaurante “${name || 'sem nome'}” sem faixa de preço`);
        }
        if (!meaningful(option?.why, 25)) issues.push(`restaurante “${name || 'sem nome'}” sem justificativa concreta`);
      });
    });
    if (hasFood) foodDays += 1;
    else issues.push(`dia ${dayIndex + 1} não possui experiência gastronômica concreta`);
  });

  if (days && totalActivities < expectedMinimumActivities) issues.push('roteiro curto demais para o ritmo e a duração');

  extractCalendarCommitments(userMessage).forEach(commitment => {
    const targetDay = tripCalendar.find(day => normalize(day.weekday).startsWith(commitment.weekday));
    if (!targetDay) return;
    let scheduledActivity = null;
    const scheduledDay = itinerary.find(day => (day.activities || []).some(activity => {
      const title = normalize(activity?.title || '');
      const tokens = normalize(commitment.activity).split(' ').filter(token => token.length > 2 && !['para', 'uma', 'com'].includes(token));
      const matches = tokens.length && tokens.every(token => title.includes(token));
      if (matches) scheduledActivity = activity;
      return matches;
    }));
    if (!scheduledDay || scheduledDay.dateISO !== targetDay.dateISO) issues.push(`compromisso “${commitment.activity}” não foi colocado em ${targetDay.dateLabel}`);
    if (scheduledActivity && commitment.period) {
      const hour = Number(String(scheduledActivity.time || '').match(/^(\d{1,2})/)?.[1]);
      const inPeriod = commitment.period === 'manha' ? hour >= 5 && hour < 12
        : commitment.period === 'tarde' ? hour >= 12 && hour < 18
          : commitment.period === 'noite' ? hour >= 18 || hour < 5 : true;
      if (!inPeriod) issues.push(`compromisso “${commitment.activity}” não respeita o período ${commitment.period}`);
    }
  });

  const fullText = String(text || '');
  const essential = (researchBrief?.mustSee || []).filter(item => item?.priority === 'essential');
  const mustSeePool = essential.length ? essential : (researchBrief?.mustSee || []);
  const requiredMustSee = mustSeePool.slice(0, Math.min(mustSeePool.length, Math.max(1, Math.min(days || itinerary.length, 3))));
  const missingMustSee = requiredMustSee.filter(item => !matchesNamedItem(fullText, item)).map(item => item.name);
  if (missingMustSee.length) issues.push(`pontos essenciais ausentes: ${missingMustSee.join(', ')}`);

  const signaturePool = researchBrief?.signatureFoods || [];
  const requiredFoodCount = Math.min(signaturePool.length, (days || itinerary.length) >= 4 ? 2 : 1);
  const foodEvidence = JSON.stringify(itinerary.flatMap(day => (day?.activities || []).filter(activity =>
    activity?.category === 'food' || FOOD_PATTERN.test(`${activity?.title || ''} ${activity?.desc || ''}`)
  )));
  const missingSignatureFoods = signaturePool.slice(0, requiredFoodCount)
    .filter(item => !matchesNamedItem(foodEvidence, item)).map(item => item.name);
  if (missingSignatureFoods.length) issues.push(`símbolos gastronômicos ausentes: ${missingSignatureFoods.join(', ')}`);

  const verifiedRestaurants = researchBrief?.restaurants || [];
  if (verifiedRestaurants.length && restaurantNames.length) {
    const verifiedMatches = new Set(restaurantNames.filter(name => verifiedRestaurants.some(item => normalize(item.name) === normalize(name))));
    const requiredVerified = Math.min(verifiedRestaurants.length, Math.max(1, Math.min(days || itinerary.length, 3)));
    if (verifiedMatches.size < requiredVerified) {
      issues.push(`poucas recomendações conferidas na pesquisa: ${verifiedMatches.size}/${requiredVerified}`);
    }
  }

  return {
    passed: issues.length === 0,
    issues: [...new Set(issues)],
    itinerary,
    metrics: { days: itinerary.length, totalActivities, foodDays, namedRestaurants, expectedMinimumActivities }
  };
}

function buildQualityRevisionPrompt({ issues = [], researchBrief, requestedDays = 5, tripCalendar = [], userMessage = '' } = {}) {
  return `Você é o editor-chefe de qualidade da Orbia Travel. O roteiro anterior foi bloqueado e não pode ser reaproveitado sem correção.

PROBLEMAS ENCONTRADOS:
${issues.map(issue => `- ${issue}`).join('\n')}

PESQUISA VERIFICADA DO DESTINO:
${JSON.stringify(researchBrief)}

CALENDÁRIO VINCULANTE:
${tripCalendar.map(day => `${day.dateISO} = ${day.dateLabel}`).join('\n') || 'Datas não informadas'}

PEDIDO TEMPORAL DO VIAJANTE:
${userMessage || 'Nenhum compromisso adicional informado'}

Reconstrua o roteiro completo com EXATAMENTE ${requestedDays} dia(s). Inclua primeiro os pontos essential da pesquisa e os pratos simbólicos. Cada dia precisa ter uma identidade própria: uma progressão com começo, descoberta e fechamento, não uma lista de lugares.

CONTRATO ESTRUTURAL OBRIGATÓRIO: a ação itinerary/replace deve ter data como um ARRAY. Cada dia precisa usar exatamente os campos {"dayNum":1,"dateISO":"AAAA-MM-DD","dateLabel":"DD-MM-AAAA · dia-da-semana","weekday":"dia-da-semana","dayTitle":"Tema evocativo e específico","dayStory":"Abertura narrativa de 2 a 3 frases explicando o fio condutor e por que essa sequência faz sentido","highlight":"Momento mais marcante e o detalhe que merece atenção","localSecret":"Curiosidade ou dica de insider realmente ligada ao lugar","logistics":"Como ir entre os pontos, com ordem, tempo ou modal","climate_plan":"Alternativa climática concreta e nomeada","activities":[]}. Nunca use day, title, schedule, period, name, description ou notes no lugar deles. Cada atividade usa {"time":"09:00","durationMinutes":90,"category":"attraction|food|transport|experience","title":"Nome específico","desc":"Parágrafo natural com ao menos 110 caracteres, unindo contexto local, motivo da escolha, o que observar/fazer e orientação prática","whyHere":"Por que entra exatamente aqui","practicalNote":"Reserva, acesso, margem ou cuidado útil","verificationStatus":"verified|user_provided|estimate","sourceUrl":"https://fonte quando houver fato atual","location":{"address":"Endereço ou bairro pesquisável"}}.

Em cada dia, inclua uma experiência gastronômica. Cada almoço ou jantar deve trazer exatamente duas opções de restaurantes reais presentes na pesquisa, com nome, endereço ou bairro, prato específico, faixa de preço, justificativa e nota de verificação. Nunca use “restaurante local”, “peixe regional”, “escolha um lugar”, “procure avaliações”, “tempo livre” ou outro enchimento.

Alma não significa empilhar adjetivos. Evite “cidade vibrante”, “experiência inesquecível”, “imperdível”, “encante-se” e frases que poderiam servir para qualquer destino. Use nomes, cenas, hábitos, história, sabores, ritmo e consequências práticas reais. Entregue texto natural para o viajante e, no final, um único bloco JSON de ações com itinerary/replace contendo todos os dias. Não mencione esta revisão nem os problemas encontrados.`;
}

module.exports = {
  VAGUE_PATTERNS,
  buildDestinationResearchPrompt,
  parseDestinationResearchBrief,
  auditItineraryQuality,
  buildQualityRevisionPrompt,
  extractItinerary,
  canonicalizeItineraryData,
  canonicalizeItineraryEnvelope,
  inferRequestedItineraryDays,
  isItineraryCompletionRequest,
  normalize,
  buildTripCalendar,
  extractCalendarCommitments
};
