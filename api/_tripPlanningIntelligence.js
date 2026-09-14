// Planning intelligence for itinerary creation and follow-up edits.
// It keeps user commitments authoritative, gives research a precise brief and
// rejects outputs that silently drop, move or fabricate important facts.

const { extractItinerary, normalize, extractCalendarCommitments } = require('./_itineraryQuality');

const MUTATION_VERBS = /\b(inclua|incluir|adicione|adicionar|coloque|colocar|mova|mover|troque|trocar|altere|alterar|ajuste|ajustar|remova|remover|retire|retirar|encaixe|encaixar|reserve|reservar|refa[cç]a|reorganize|atualize)\b/i;
const ITINERARY_SIGNALS = /\b(roteiro|itiner[aá]rio|cronograma|programa[cç][aã]o|dia|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|manh[aã]|tarde|noite|check.?in|check.?out|almo[cç]o|jantar|caf[eé]|show|jazz|teatro|com[eé]dia|museu|passeio|descanso|atra[cç][aã]o|restaurante)\b/i;
const PLACEHOLDER_PATTERNS = /\b(rua dos jazz|bar de jazz em|restaurante local|hotel local|airbnb em [a-zà-ÿ ]+$|atra[cç][aã]o local|local a definir|endere[cç]o a definir|ponto tur[ií]stico|escolha um lugar|procure um restaurante)\b/i;

function isItineraryMutationRequest(message = '', tripContext = {}) {
  const text = String(message || '');
  const hasExistingItinerary = Array.isArray(tripContext?.itinerary) && tripContext.itinerary.length > 0;
  return MUTATION_VERBS.test(text) && ITINERARY_SIGNALS.test(text) && (hasExistingItinerary || /roteiro|itiner[aá]rio|cronograma/i.test(text));
}

function getConversationUserText(messages = []) {
  return messages.filter(item => item?.role === 'user').map(item => String(item.content || '')).join('\n');
}

function buildConstraintExtractionPrompt({ messages = [], tripContext = {}, tripCalendar = [] } = {}) {
  return `Extraia o contrato real desta viagem. A saída será usada para impedir que o roteiro esqueça ou mova pedidos do viajante.

REGRAS:
- Use como fatos somente mensagens do usuário, reservas e estado atual. Nunca transforme uma sugestão anterior do assistente em desejo do usuário.
- Uma informação mais recente do usuário substitui a anterior quando houver conflito.
- Preserve compromissos com data, dia da semana, horário ou período exatamente como foram pedidos.
- Diferencie chegada, guarda de bagagem, check-in, descanso, deslocamento local, evento, refeição com pessoas e retorno.
- Não invente endereço, horário, perfil, evento, companhia, preço ou preferência.
- Se algo não foi informado, use null ou lista vazia. Não faça perguntas nesta etapa.

CALENDÁRIO OFICIAL:
${tripCalendar.map(day => `${day.dateISO} = ${day.dateLabel}`).join('\n') || 'não disponível'}
DATA DE HOJE PARA INTERPRETAR ANOS OMITIDOS: ${new Date().toISOString().slice(0, 10)}

ESTADO ATUAL DA VIAGEM:
${JSON.stringify(tripContext)}

MENSAGENS DO VIAJANTE:
${getConversationUserText(messages)}

Retorne SOMENTE JSON válido:
{
  "destination":"cidade/região explicitamente pedida ou null",
  "dates":{"start":"AAAA-MM-DD ou null","end":"AAAA-MM-DD ou null"},
  "tripPurpose":"objetivo explicitamente informado ou null",
  "travelerProfile":{"count":null,"composition":null,"notes":[]},
  "hardConstraints":[{"label":"descrição curta e fiel","type":"arrival|departure|luggage|checkin|checkout|event|activity|meal|rest|transport|other","dateISO":null,"weekday":null,"startTime":null,"endTime":null,"period":null,"location":null,"source":"user|reservation|existing_state","mustPreserve":true}],
  "softPreferences":[],
  "logistics":{"arrival":null,"departure":null,"accommodation":null,"luggageStops":[],"localTransport":[]},
  "pacing":{"restWindows":[],"notes":[]},
  "mealsWithPeople":[],
  "avoid":[],
  "openQuestions":[]
}`;
}

function parseJsonCandidates(text = '') {
  const source = String(text || '').trim();
  return [
    ...[...source.matchAll(/```\s*json\s*([\s\S]*?)```/gi)].map(match => match[1]),
    source.match(/\{[\s\S]*\}/)?.[0], source
  ].filter(Boolean);
}

function parsePlanningBrief(text = '', tripCalendar = []) {
  for (const candidate of parseJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object') continue;
      const validDates = new Set(tripCalendar.map(day => day.dateISO));
      const hardConstraints = (Array.isArray(parsed.hardConstraints) ? parsed.hardConstraints : [])
        .filter(item => item && String(item.label || '').trim())
        .map((item, index) => ({
          id: String(item.id || `constraint-${index + 1}`),
          label: String(item.label).trim(),
          type: String(item.type || 'other'),
          dateISO: validDates.has(item.dateISO) ? item.dateISO : (item.dateISO || null),
          weekday: item.weekday || null,
          startTime: item.startTime || null,
          endTime: item.endTime || null,
          period: item.period || null,
          location: item.location || null,
          source: ['user', 'reservation', 'existing_state'].includes(item.source) ? item.source : 'user',
          mustPreserve: item.mustPreserve !== false
        }));
      return {
        destination: parsed.destination || null,
        dates: {
          start: parsed.dates?.start || parsed.startDate || null,
          end: parsed.dates?.end || parsed.endDate || null
        },
        tripPurpose: parsed.tripPurpose || null,
        travelerProfile: parsed.travelerProfile || { count: null, composition: null, notes: [] },
        hardConstraints,
        softPreferences: Array.isArray(parsed.softPreferences) ? parsed.softPreferences : [],
        logistics: parsed.logistics || {},
        pacing: parsed.pacing || {},
        mealsWithPeople: Array.isArray(parsed.mealsWithPeople) ? parsed.mealsWithPeople : [],
        avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
        openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : []
      };
    } catch (_) {}
  }
  return null;
}

function mergeDeterministicCommitments(planningBrief = {}, messages = [], tripCalendar = []) {
  const merged = { ...planningBrief, hardConstraints: [...(planningBrief.hardConstraints || [])] };
  const userText = getConversationUserText(messages);
  for (const commitment of extractCalendarCommitments(userText)) {
    const tokens = relevantTokens(commitment.activity);
    const captured = merged.hardConstraints.find(item => {
      const existing = normalize(item?.label || '');
      return tokens.length && tokens.every(token => existing.includes(token));
    });
    const calendarDay = tripCalendar.find(day => normalize(day.weekday).startsWith(commitment.weekday));
    if (captured) {
      if (!captured.dateISO && calendarDay?.dateISO) captured.dateISO = calendarDay.dateISO;
      if (!captured.weekday && calendarDay?.weekday) captured.weekday = calendarDay.weekday;
      if (!captured.period && commitment.period) captured.period = commitment.period;
      continue;
    }
    merged.hardConstraints.push({
      id: `calendar-${merged.hardConstraints.length + 1}`,
      label: commitment.activity,
      type: 'activity',
      dateISO: calendarDay?.dateISO || null,
      weekday: calendarDay?.weekday || commitment.weekday,
      startTime: null,
      endTime: null,
      period: commitment.period || null,
      location: null,
      source: 'user',
      mustPreserve: true
    });
  }
  return merged;
}

function sanitizePlanningBriefAgainstSources(planningBrief = {}, messages = [], tripContext = {}) {
  const source = normalize(`${getConversationUserText(messages)} ${JSON.stringify(tripContext || {})}`);
  const sourceSupports = value => {
    const tokens = relevantTokens(value);
    if (!tokens.length) return false;
    const evidence = tokens.filter(token => source.includes(token));
    const minimum = tokens.length === 1 ? 1 : Math.max(2, Math.ceil(tokens.length * 0.65));
    return evidence.length >= minimum;
  };
  const scrub = value => {
    if (typeof value === 'string') return sourceSupports(value) ? value : null;
    if (Array.isArray(value)) return value.map(scrub).filter(item => item !== null && item !== undefined &&
      (!Array.isArray(item) || item.length) && (typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)])
        .filter(([, item]) => item !== null && item !== undefined && (!Array.isArray(item) || item.length) &&
          (typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length)));
    }
    return null;
  };
  const clean = {
    destination: sourceSupports(planningBrief.destination) ? planningBrief.destination : null,
    dates: {
      start: planningBrief.dates?.start && source.includes(normalize(planningBrief.dates.start)) ? planningBrief.dates.start : null,
      end: planningBrief.dates?.end && source.includes(normalize(planningBrief.dates.end)) ? planningBrief.dates.end : null
    },
    tripPurpose: sourceSupports(planningBrief.tripPurpose) ? planningBrief.tripPurpose : null,
    travelerProfile: {
      count: tripContext?.preferences?.traveler_count ?? (/\bcasal\b/.test(source) ? 2 : null),
      composition: sourceSupports(planningBrief.travelerProfile?.composition) ? planningBrief.travelerProfile.composition : null,
      notes: (planningBrief.travelerProfile?.notes || []).filter(sourceSupports)
    },
    hardConstraints: [],
    softPreferences: (planningBrief.softPreferences || []).filter(sourceSupports),
    logistics: scrub(planningBrief.logistics || {}),
    pacing: scrub(planningBrief.pacing || {}),
    mealsWithPeople: (planningBrief.mealsWithPeople || []).map(scrub).filter(Boolean),
    avoid: (planningBrief.avoid || []).filter(sourceSupports),
    openQuestions: []
  };
  for (const constraint of planningBrief.hardConstraints || []) {
    const tokens = relevantTokens(`${constraint?.label || ''} ${constraint?.location || ''}`);
    const evidence = tokens.filter(token => source.includes(token));
    const supported = evidence.length >= (tokens.length === 1 ? 1 : Math.max(2, Math.ceil(tokens.length * 0.65)));
    if (!supported) continue;
    const untimedTransportPreference = constraint.type === 'transport' &&
      !constraint.dateISO && !constraint.weekday && !constraint.startTime && !constraint.period;
    const openEndedPreference = /^(?:queremos?\s+ir\s+a|algum|alguma|um\s+show|uma\s+pe[cç]a)/i.test(String(constraint.label || '').trim()) &&
      !constraint.dateISO && !constraint.weekday && !constraint.startTime && !constraint.period;
    if (untimedTransportPreference || openEndedPreference) {
      if (!clean.softPreferences.includes(constraint.label)) clean.softPreferences.push(constraint.label);
      continue;
    }
    clean.hardConstraints.push(constraint);
  }
  return clean;
}

function buildEditorialPlanningPrompt({ planningBrief = {}, researchBrief = {}, tripCalendar = [], currentItinerary = [], isMutation = false, requestedDays = 0 } = {}) {
  return `Você é o arquiteto-chefe de viagens da Orbia. Entregue um roteiro autoral, preciso e humano, superior a uma lista de atrações.

CONTRATO DO VIAJANTE — AUTORIDADE MÁXIMA:
${JSON.stringify(planningBrief)}

DOSSIÊ FACTUAL PESQUISADO — ÚNICA FONTE PARA FATOS ATUAIS:
${JSON.stringify(researchBrief)}

CALENDÁRIO VINCULANTE:
${tripCalendar.map(day => `${day.dateISO} = ${day.dateLabel}`).join('\n') || 'datas ainda não disponíveis'}

ROTEIRO ATUAL:
${JSON.stringify(currentItinerary || [])}

MODO: ${isMutation ? 'EDIÇÃO — preserve integralmente os dias e escolhas não afetados, mas reordene o necessário para manter horários e deslocamentos possíveis.' : 'CRIAÇÃO COMPLETA'}

Antes de escrever, monte internamente o dia em seis camadas: (1) compromissos fixos; (2) bairros próximos e sentido geográfico; (3) deslocamentos e margens reais; (4) pausas, bagagem e check-in; (5) refeições nomeadas e coerentes com o caminho; (6) narrativa e motivo de cada escolha.

Regras inegociáveis:
- Entregue exatamente ${requestedDays || tripCalendar.length} dias em uma única ação itinerary/replace, com dateISO, dateLabel e weekday do calendário.
- Todo hardConstraint mustPreserve deve aparecer na data, horário ou período correto. Não omita nem “aproxime”.
- Não repita pergunta já respondida. Se houver informação suficiente, decida e entregue.
- Não invente endereço, restaurante, evento, horário, preço ou tempo de trajeto. Fatos do usuário usam verificationStatus "user_provided"; fatos pesquisados usam "verified" e sourceUrl; estimativas de deslocamento usam "estimate" e uma nota clara.
- Eventos, programação, horários de funcionamento e tarifas só entram quando constarem no dossiê. Sem confirmação, apresente uma alternativa verificada e diga objetivamente o que precisa ser reconfirmado.
- Dias de chegada, despedida, família ou descanso podem ter menos paradas. Não preencha por preencher: explique o ritmo no dayStory.
- Cada atividade precisa dizer por que está ali, o que viver/observar, duração sugerida e orientação prática. Agrupe por bairro; evite zigue-zague.
- Refeições devem ter duas casas reais próximas quando a pesquisa oferecer opções, com prato, faixa de preço, endereço e motivo da recomendação.
- A escrita deve ter cenas, identidade local e consequência prática, sem clichês turísticos.

Cada atividade deve aceitar também: "durationMinutes", "whyHere", "practicalNote", "verificationStatus" e "sourceUrl". A mensagem visível deve resumir o raciocínio, as escolhas fortes e eventuais pontos a confirmar — nunca despejar JSON ao usuário.`;
}

function hourMatchesPeriod(time, period) {
  if (!period) return true;
  const hour = Number(String(time || '').match(/^(\d{1,2})/)?.[1]);
  if (!Number.isFinite(hour)) return false;
  const normalized = normalize(period);
  if (normalized === 'manha') return hour >= 5 && hour < 12;
  if (normalized === 'tarde') return hour >= 12 && hour < 18;
  if (normalized === 'noite') return hour >= 18 || hour < 5;
  return true;
}

function relevantTokens(value = '') {
  const ignored = new Set(['inclua', 'adicione', 'coloque', 'para', 'depois', 'antes', 'leve', 'uma', 'algum', 'alguma', 'com', 'sem', 'das', 'dos', 'pelo', 'pela', 'horas', 'hora']);
  return normalize(value).split(' ').filter(token => token.length > 2 && !ignored.has(token));
}

function fallbackTime(item, position = 0) {
  if (item?.startTime) return String(item.startTime).slice(0, 5);
  const period = normalize(item?.period || '');
  if (period === 'manha') return '09:30';
  if (period === 'tarde') return '15:00';
  if (period === 'noite') return '20:30';
  return ['09:30', '12:30', '15:30', '19:30'][position % 4];
}

function researchedActivity(item = {}, time = '09:30') {
  const name = item.name || 'Experiência pesquisada';
  const reason = item.reason || item.why || `Esta parada ajuda a compreender uma parte concreta da identidade do destino.`;
  const practical = item.verification_note || 'Confirme o horário oficial e a necessidade de ingresso antes de sair.';
  return {
    time,
    durationMinutes: 90,
    category: 'attraction',
    title: name,
    desc: `${reason} Ela entra nesta sequência porque combina com as outras paradas do mesmo eixo e evita deslocamentos desnecessários. ${practical}`,
    whyHere: `Foi posicionada neste bloco por proximidade e pela contribuição específica ao tema do dia.`,
    practicalNote: practical,
    verificationStatus: item.sourceUrl ? 'verified' : 'estimate',
    sourceUrl: item.sourceUrl || '',
    location: { address: item.location || `${name}, destino` }
  };
}

function constraintActivity(item = {}, time = '15:00') {
  const practical = item.type === 'meal'
    ? 'Confirme diretamente o horário, o endereço e a duração com a pessoa anfitriã antes do dia.'
    : 'Mantenha uma margem de deslocamento e confirme os detalhes que ainda não foram informados.';
  return {
    time,
    durationMinutes: item.type === 'rest' ? 75 : 90,
    category: item.type === 'transport' ? 'transport' : 'experience',
    title: item.label,
    desc: `Este é um compromisso informado pelo viajante e, por isso, foi protegido no roteiro sem trocar sua data ou período. ${practical} O restante do dia foi organizado ao redor dele.`,
    whyHere: `O horário e a posição respeitam exatamente o compromisso informado pelo viajante.`,
    practicalNote: practical,
    verificationStatus: 'user_provided',
    sourceUrl: '',
    location: { address: item.location || 'Endereço específico a confirmar com o viajante' }
  };
}

function restaurantOption(item = {}) {
  return {
    name: item.name || '',
    address: item.location || '',
    dish: item.dish || '',
    price_level: item.price_level || '$$',
    why: item.why || 'Casa incluída por sua relação concreta com a gastronomia do destino e pela localização no percurso.',
    verification_note: item.verification_note || 'Confirme horário e necessidade de reserva.',
    sourceUrl: item.sourceUrl || ''
  };
}

function buildGroundedItineraryFallback({ planningBrief = {}, researchBrief = {}, tripCalendar = [] } = {}) {
  if (!tripCalendar.length || !(researchBrief.mustSee || []).length || (researchBrief.restaurants || []).length < 2) return null;
  const days = tripCalendar.map((calendarDay, index) => ({
    ...calendarDay,
    dayTitle: index === 0 ? 'Chegada com ritmo e primeiras descobertas' : `Um recorte de ${researchBrief.destination} sem pressa`,
    dayStory: '', highlight: '', localSecret: '', logistics: '', climate_plan: '', activities: []
  }));
  const calendarIndex = new Map(days.map((day, index) => [day.dateISO, index]));
  for (const constraint of planningBrief.hardConstraints || []) {
    const weekdayDay = constraint.weekday && days.find(day => normalize(day.weekday).startsWith(normalize(constraint.weekday).replace(' feira', '')));
    const index = calendarIndex.has(constraint.dateISO) ? calendarIndex.get(constraint.dateISO)
      : (weekdayDay ? days.indexOf(weekdayDay) : 0);
    days[Math.max(0, index)].activities.push(constraintActivity(constraint, fallbackTime(constraint, days[index]?.activities?.length || 0)));
  }
  const researchedItems = [...(researchBrief.mustSee || []), ...(researchBrief.events || []).map(event => ({
    ...event,
    reason: event.verification_note || `Programação pesquisada para o período da viagem.`,
    name: event.name || event.venue,
    location: event.location || event.venue
  }))];
  researchedItems.forEach((item, index) => {
    const eventDay = item.dateISO && calendarIndex.has(item.dateISO) ? calendarIndex.get(item.dateISO) : null;
    const targetIndex = eventDay ?? (index % days.length);
    const already = days.some(day => day.activities.some(activity => normalize(activity.title).includes(normalize(item.name))));
    if (!already) days[targetIndex].activities.push(researchedActivity(item, item.startTime || fallbackTime({ period: index % 2 ? 'tarde' : 'manha' }, index)));
  });
  const restaurants = researchBrief.restaurants || [];
  days.forEach((day, index) => {
    const first = restaurants[(index * 2) % restaurants.length];
    const second = restaurants[(index * 2 + 1) % restaurants.length] || restaurants[(index + 1) % restaurants.length];
    const mealTitle = first?.dish ? `Sabores de ${researchBrief.destination}: ${first.dish}` : `Mesa escolhida no caminho do dia`;
    day.activities.push({
      time: '12:30', durationMinutes: 75, category: 'food', title: mealTitle,
      desc: `${first?.why || 'A refeição foi escolhida por sua ligação com o destino.'} Ela entra aqui porque mantém a pausa principal próxima ao eixo visitado. Confirme horário e reserva antes de sair.`,
      whyHere: 'A pausa foi colocada entre os blocos do dia para evitar deslocamento extra e proteger o ritmo da viagem.',
      practicalNote: first?.verification_note || 'Confirme horário e necessidade de reserva.',
      verificationStatus: first?.sourceUrl ? 'verified' : 'estimate', sourceUrl: first?.sourceUrl || '',
      location: { address: first?.location || `${first?.name || 'Restaurante pesquisado'}, ${researchBrief.destination}` },
      restaurant_options: [restaurantOption(first), restaurantOption(second)]
    });
    while (day.activities.length < 3) {
      const extra = researchBrief.indoorAlternatives?.[(index + day.activities.length) % Math.max(1, researchBrief.indoorAlternatives?.length || 0)];
      if (!extra) break;
      day.activities.push(researchedActivity({ ...extra, reason: extra.why }, '16:00'));
    }
    day.activities.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const names = day.activities.slice(0, 3).map(item => item.title).join(', ');
    day.dayTitle = day.activities[0]?.title && day.activities[1]?.title
      ? `${day.activities[0].title} e ${day.activities[1].title}` : day.dayTitle;
    day.dayStory = `Este dia foi desenhado como uma pequena história: começa em ${day.activities[0]?.title || researchBrief.destination}, ganha outra camada em ${day.activities[1]?.title || 'uma descoberta local'} e respeita as pausas necessárias. A ordem privilegia compromissos do viajante, proximidade e tempo para viver cada lugar.`;
    day.highlight = `O ponto alto é perceber a ligação entre ${names || researchBrief.destination}, sem transformar o dia em uma corrida de atrações ou atravessar a cidade sem propósito.`;
    const localWarning = researchBrief.localWarnings?.[index % Math.max(1, researchBrief.localWarnings.length)];
    day.localSecret = localWarning ? `Atenção local: ${localWarning} Considere esse cuidado ao definir o horário e o deslocamento do dia.` : `Observe os hábitos e detalhes do bairro entre uma parada e outra; o roteiro reserva tempo para essa leitura local.`;
    day.logistics = `Siga a ordem apresentada, confirme os horários e use ${planningBrief.softPreferences?.join(' e ') || 'o modal mais coerente'} nos trechos indicados. Reserve margem entre as paradas e evite cruzar a cidade nos horários de pico.`;
    const indoor = researchBrief.indoorAlternatives?.[index % Math.max(1, researchBrief.indoorAlternatives?.length || 0)];
    day.climate_plan = indoor ? `Com chuva ou calor forte, substitua a parte externa por ${indoor.name}, em ${indoor.location}, preservando o tema do dia.` : `Se o clima mudar, reduza o trecho externo e mantenha as atividades cobertas já nomeadas neste dia.`;
  });
  return JSON.stringify({
    message: `Montei uma versão completa usando somente compromissos informados e locais pesquisados para ${researchBrief.destination}. Os horários atuais ainda devem ser reconfirmados antes da viagem.`,
    actions: [{ type: 'itinerary', operation: 'replace', data: days }]
  });
}

function auditConstraintCoverage(text, planningBrief = {}, tripCalendar = []) {
  const itinerary = extractItinerary(text);
  const issues = [];
  if (!itinerary) return { passed: false, issues: ['roteiro estruturado ausente'], covered: 0, total: 0 };
  const constraints = (planningBrief.hardConstraints || []).filter(item => item?.mustPreserve !== false);
  let covered = 0;
  for (const constraint of constraints) {
    const tokens = relevantTokens(constraint.label);
    let foundDay = null;
    let foundActivity = null;
    for (const day of itinerary) {
      const activity = (day.activities || []).find(item => {
        const haystack = normalize(`${item?.title || ''} ${item?.desc || ''} ${item?.location?.address || ''}`);
        const identityTokens = tokens.filter(token => !/^\d+$/.test(token));
        return identityTokens.length > 0 && identityTokens.filter(token => haystack.includes(token)).length >= Math.min(2, identityTokens.length);
      });
      if (activity) { foundDay = day; foundActivity = activity; break; }
    }
    if (!foundActivity) {
      issues.push(`compromisso ausente: ${constraint.label}`);
      continue;
    }
    const expectedByWeekday = constraint.weekday && tripCalendar.find(day => normalize(day.weekday).startsWith(normalize(constraint.weekday).replace(' feira', '')));
    const expectedDate = constraint.dateISO || expectedByWeekday?.dateISO;
    if (expectedDate && foundDay.dateISO !== expectedDate) issues.push(`compromisso em data errada: ${constraint.label}`);
    else if (constraint.startTime && String(foundActivity.time || '').slice(0, 5) !== String(constraint.startTime).slice(0, 5)) {
      issues.push(`compromisso em horário errado: ${constraint.label}`);
    } else if (!hourMatchesPeriod(foundActivity.time, constraint.period)) {
      issues.push(`compromisso em período errado: ${constraint.label}`);
    } else covered += 1;
  }
  return { passed: issues.length === 0, issues, covered, total: constraints.length };
}

function auditFactualGrounding(text, researchBrief = {}, planningBrief = {}) {
  const itinerary = extractItinerary(text);
  if (!itinerary) return { passed: false, issues: ['roteiro estruturado ausente'] };
  const issues = [];
  const allowed = normalize(JSON.stringify({ researchBrief, planningBrief }));
  for (const day of itinerary) {
    for (const activity of day.activities || []) {
      const combined = `${activity?.title || ''} ${activity?.desc || ''} ${activity?.location?.address || ''}`;
      if (PLACEHOLDER_PATTERNS.test(combined)) issues.push(`local genérico ou aparentemente inventado: ${activity?.title || 'atividade sem nome'}`);
      const claimsLiveFact = /evento|show|concerto|pe[cç]a|com[eé]dia|funcionamento|abre|fecha|ingresso|tarifa/i.test(combined);
      if (claimsLiveFact && activity?.verificationStatus !== 'user_provided') {
        if (activity?.verificationStatus !== 'verified' || !/^https?:\/\//i.test(String(activity?.sourceUrl || ''))) {
          issues.push(`fato atual sem fonte verificável: ${activity?.title || 'atividade sem nome'}`);
        }
      }
      const exactAddress = String(activity?.location?.address || '');
      if (/\b\d{1,5}\b/.test(exactAddress) && !allowed.includes(normalize(exactAddress)) && activity?.verificationStatus !== 'user_provided') {
        issues.push(`endereço não consta no dossiê nem foi informado pelo usuário: ${exactAddress}`);
      }
    }
  }
  return { passed: issues.length === 0, issues: [...new Set(issues)] };
}

function auditItineraryPreservation(text, currentItinerary = [], userMessage = '') {
  const itinerary = extractItinerary(text);
  if (!itinerary) return { passed: false, issues: ['roteiro estruturado ausente'] };
  const issues = [];
  const request = normalize(userMessage);
  const explicitlyRemoves = /\b(remova|remover|retire|retirar|exclua|excluir|cancele|cancelar)\b/.test(request);
  for (const oldDay of currentItinerary || []) {
    for (const oldActivity of oldDay?.activities || []) {
      const oldTitle = String(oldActivity?.title || oldActivity?.name || '').trim();
      if (!oldTitle) continue;
      const titleTokens = relevantTokens(oldTitle);
      const targetedForRemoval = explicitlyRemoves && titleTokens.some(token => request.includes(token));
      if (targetedForRemoval) continue;
      let foundDay = null;
      const found = itinerary.some(day => {
        const activityFound = (day.activities || []).some(activity => {
          const candidate = normalize(activity?.title || '');
          return titleTokens.length && titleTokens.every(token => candidate.includes(token));
        });
        if (activityFound) foundDay = day;
        return activityFound;
      });
      if (!found) issues.push(`atividade anterior perdida durante o ajuste: ${oldTitle}`);
      else if (oldDay?.dateISO && foundDay?.dateISO !== oldDay.dateISO && !titleTokens.some(token => request.includes(token))) {
        issues.push(`atividade anterior mudou de data sem pedido: ${oldTitle}`);
      }
    }
  }
  return { passed: issues.length === 0, issues: [...new Set(issues)] };
}

module.exports = {
  isItineraryMutationRequest,
  buildConstraintExtractionPrompt,
  parsePlanningBrief,
  mergeDeterministicCommitments,
  sanitizePlanningBriefAgainstSources,
  buildEditorialPlanningPrompt,
  auditConstraintCoverage,
  auditFactualGrounding,
  auditItineraryPreservation,
  buildGroundedItineraryFallback,
  PLACEHOLDER_PATTERNS
};
