const VAGUE_PATTERNS = /\b(tarde livre|manh[aã] livre|restaurante local|comida local|passeio pela cidade|compras de última hora|tempo livre|peixe regional|culin[aá]ria de fronteira|op[cç][aã]o coberta pr[oó]xima|margem de seguran[cç]a|perto do trajeto de volta)\b|(?:escolha|procure).{0,90}(?:avalia[cç][oõ]es|bem avaliad|funcionamento|opera[cç][aã]o aberta|regi[aã]o central)/i;
const HOLLOW_PROSE_PATTERNS = /\b(cidade vibrante|experi[eê]ncia inesquec[ií]vel|destino encantador|mergulhe na cultura|encante-se|atra[cç][aã]o imperd[ií]vel|algo para todos|explore o melhor)\b/i;
const PRACTICAL_DETAIL_PATTERN = /\b(minut|hor[aá]rio|reserva|ingresso|fila|chegue|saia|abre|fecha|funcionamento|confirm|metr[oô]|[ôo]nibus|uber|t[aá]xi|a p[eé]|caminh|desloc|trajeto|evite|anteced[eê]ncia)/i;
const LOCAL_CONTEXT_PATTERN = /\b(hist[oó]ria|tradi[cç][aã]o|arquitetura|cultura|bairro|vista|luz|aroma|cheiro|som|atmosfera|ritual|morador|s[ií]mbolo|mem[oó]ria|origem|patrim[oô]nio|paisagem)/i;
const RATIONALE_PATTERN = /\b(porque|por isso|vale|escolh|entra no roteiro|faz sentido|permite|melhor hor[aá]rio|conecta|prepara|contrasta|fecha o dia|abre o dia)\b/i;
import { buildTripCalendar } from './calendarEngine.js';

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value, offset) {
  const date = parseDateOnly(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatDatePt(value) {
  const date = parseDateOnly(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date) : '';
}

export function buildItineraryGenerationPrompt({ destination, startDate, endDate, days, climate, pace, budgetStyle, interests }) {
  const interestsText = Array.isArray(interests) && interests.length > 0 ? interests.join(', ') : 'cultura, gastronomia e atrações essenciais';
  const tripCalendar = buildTripCalendar(startDate, endDate, days);
  return `Crie um roteiro completo e personalizado para ${destination}, de ${startDate} a ${endDate}, com EXATAMENTE ${days} dias.

Perfil escolhido pelo viajante:
- Ritmo: ${pace}
- Faixa de orçamento: ${budgetStyle}
- Interesses prioritários: ${interestsText}
- Contexto climático do período: ${climate?.climateLabel || 'clima variável'}
- Regra climática: ${climate?.itineraryGuidance || 'inclua alternativas cobertas quando necessário'}
- Calendário obrigatório da viagem: ${tripCalendar.map(day => `${day.dateISO} = ${day.weekday}`).join(' | ')}

Regras obrigatórias de qualidade:
1. Organize cada dia por proximidade geográfica, evitando vaivém.
2. Inclua os principais pontos turísticos que realmente representam o destino, sem substituir essenciais por atrações genéricas.
3. Inclua em TODOS os dias ao menos uma experiência gastronômica específica. Toda refeição deve trazer restaurant_options com DUAS sugestões reais pelo nome: uma principal e uma alternativa. Para cada uma, informe endereço/bairro pesquisável, prato recomendado, faixa de preço ($, $$ ou $$$), motivo da escolha e uma nota curta para confirmar horário/reserva. Nunca escreva apenas “peixe regional”, “culinária local”, “procure um lugar” ou “escolha após conferir avaliações”.
4. Cada dia precisa ter pelo menos três atividades concretas, cobrindo manhã e tarde e, quando fizer sentido, noite. Nunca use “tempo livre”, “margem para retorno” ou qualquer enchimento vago.
5. Toda atividade deve trazer location.address com um lugar ou endereço pesquisável. Se não houver estabelecimento confiável, prefira um mercado, feira ou bairro gastronômico reconhecido — nunca transfira a curadoria para o viajante.
6. Para atividades externas, considere calor, chuva, frio ou neve e inclua no climate_plan uma alternativa indoor NOMEADA e próxima das atividades daquele dia. “Opção coberta próxima” não é aceitável.
7. Em desc, explique o valor daquela parada, o que fazer/provar e a orientação prática de reserva ou horário. Uma frase genérica não basta.
8. Informe horários realistas e sinalize quando reserva antecipada é recomendada.
9. Retorne a atualização estruturada do itinerary para salvar no painel da viagem.
10. Dê alma a cada dia com uma progressão clara. dayStory apresenta em 2 a 3 frases o fio condutor e o motivo da ordem; highlight registra o momento mais marcante; localSecret traz uma dica ou curiosidade que só faz sentido nesse lugar; logistics explica o deslocamento real entre as paradas.
11. Alma vem de detalhes específicos, não de adjetivos. Evite “cidade vibrante”, “experiência inesquecível”, “imperdível” e qualquer frase copiável para outro destino.
12. Respeite a proporção das preferências. Um show de jazz, uma peça, um restaurante ou uma compra mencionados são compromissos pontuais do roteiro, não o tema da viagem inteira, salvo quando o viajante disser explicitamente que esse é o motivo principal. Equilibre-os com os símbolos, bairros e experiências essenciais do destino.
13. Cada item do array representa uma data real, na ordem exata do calendário acima. Preencha dateISO, dateLabel e weekday exatamente como fornecido. Se o viajante disser “quarta à noite” ou “sábado à tarde”, coloque a atividade na data correspondente e em horário compatível com o turno; nunca conte os dias mentalmente a partir de “Dia 1”.

Formato obrigatório da atualização:
{"actions":[{"type":"itinerary","operation":"replace","data":[{"dayNum":1,"dateISO":"2026-09-23","dateLabel":"23-09-2026 · quarta-feira","weekday":"quarta-feira","dayTitle":"Título específico e evocativo","dayStory":"Abertura narrativa específica que dá sentido à sequência do dia","highlight":"Momento mais marcante e o que notar nele","localSecret":"Dica local ou curiosidade concreta","logistics":"Ordem e forma de deslocamento entre as paradas","climate_plan":"Alternativa coberta nomeada e próxima","activities":[{"time":"12:30","category":"food","title":"Almoço típico","desc":"Parágrafo com contexto local, motivo, experiência e orientação prática","location":{"address":"Bairro ou região da refeição"},"restaurant_options":[{"name":"Nome real do restaurante","address":"Endereço ou bairro pesquisável","dish":"Prato específico a pedir","price_level":"$$","why":"Por que esta casa vale a parada","verification_note":"Confirme horário e reserva no dia"},{"name":"Alternativa real","address":"Endereço pesquisável","dish":"Prato específico","price_level":"$","why":"Por que é uma boa alternativa","verification_note":"Confirme funcionamento"}]}]}]}]}
O array data deve conter exatamente ${days} dias, no mínimo três atividades específicas e uma experiência gastronômica concreta com duas sugestões de restaurante em cada dia.`;
}

export function extractGeneratedItinerary(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (Array.isArray(parsed.itinerary)) return parsed.itinerary;
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const replace = actions.find(action => action?.type === 'itinerary' && action?.operation === 'replace' && Array.isArray(action.data));
  if (replace) return replace.data;
  const additions = actions
    .filter(action => action?.type === 'itinerary' && action?.operation === 'add' && action.data)
    .map(action => action.data);
  return additions.length > 0 ? additions : null;
}

export function validateAndNormalizeItinerary(itinerary, { days, startDate, climatePlan } = {}) {
  if (!Array.isArray(itinerary)) throw new Error('A resposta não trouxe um roteiro estruturado.');
  if (itinerary.length !== days) throw new Error(`O roteiro retornou ${itinerary.length} dias, mas a viagem tem ${days}.`);

  let totalActivities = 0;
  const tripCalendar = buildTripCalendar(startDate, '', days);
  const normalized = itinerary.map((day, index) => {
    const activities = Array.isArray(day?.activities) ? day.activities : [];
    if (activities.length < 3) throw new Error(`O Dia ${index + 1} ficou superficial. São necessárias ao menos três experiências concretas.`);
    totalActivities += activities.length;
    let dayHasFoodExperience = false;
    const safeActivities = activities.map((activity, activityIndex) => {
      if (!activity || typeof activity !== 'object' || !String(activity.title || '').trim()) {
        throw new Error(`Há uma atividade inválida no Dia ${index + 1}.`);
      }
      const title = String(activity.title).trim();
      const desc = String(activity.desc || '').trim();
      if (VAGUE_PATTERNS.test(`${title} ${desc}`)) throw new Error(`O Dia ${index + 1} contém uma sugestão genérica.`);
      if (desc.length < 110) throw new Error(`A atividade “${title}” precisa explicar melhor o lugar, o motivo da escolha e a orientação prática.`);
      if (HOLLOW_PROSE_PATTERNS.test(desc)) throw new Error(`A atividade “${title}” usa uma descrição bonita, mas sem conteúdo local.`);
      const detailDimensions = [PRACTICAL_DETAIL_PATTERN, LOCAL_CONTEXT_PATTERN, RATIONALE_PATTERN].filter(pattern => pattern.test(desc)).length;
      if (detailDimensions < 2) throw new Error(`A atividade “${title}” precisa unir contexto local, motivo e orientação prática.`);
      const address = String(activity.location?.address || '').trim();
      if (address.length < 6 || /endere[cç]o ou regi[aã]o/i.test(address)) {
        throw new Error(`A atividade “${title}” não trouxe um local pesquisável.`);
      }
      const isFoodExperience = activity.category === 'food' || /almo[cç]o|jantar|caf[eé]|mercado|mercato|feira|gastron|culin[aá]ria|comida|prato|restaurante/i.test(`${title} ${desc}`);
      let restaurantOptions = [];
      if (isFoodExperience) {
        dayHasFoodExperience = true;
        const rawOptions = Array.isArray(activity.restaurant_options)
          ? activity.restaurant_options
          : (Array.isArray(activity.restaurantOptions) ? activity.restaurantOptions : []);
        if (rawOptions.length < 2) {
          throw new Error(`A refeição “${title}” precisa indicar dois restaurantes concretos.`);
        }
        restaurantOptions = rawOptions.slice(0, 3).map((option, optionIndex) => {
          const name = String(option?.name || '').trim();
          const restaurantAddress = String(option?.address || '').trim();
          const dish = String(option?.dish || '').trim();
          const priceLevel = String(option?.price_level || option?.priceLevel || '').trim();
          const why = String(option?.why || '').trim();
          if (name.length < 3 || /^(restaurante|op[cç][aã]o|lugar|casa local)$/i.test(name)) {
            throw new Error(`A opção ${optionIndex + 1} de “${title}” não tem nome de restaurante.`);
          }
          if (restaurantAddress.length < 6) throw new Error(`O restaurante “${name}” não tem endereço pesquisável.`);
          if (dish.length < 4) throw new Error(`O restaurante “${name}” não tem prato recomendado.`);
          if (!/^\${1,3}(?:\s|$)/.test(priceLevel)) throw new Error(`O restaurante “${name}” não tem faixa de preço.`);
          if (why.length < 18) throw new Error(`A recomendação de “${name}” precisa explicar por que vale a pena.`);
          return {
            name,
            address: restaurantAddress,
            dish,
            price_level: priceLevel,
            why,
            verification_note: String(option?.verification_note || option?.verificationNote || 'Confirme o horário e a necessidade de reserva antes de sair.').trim()
          };
        });
      }
      return {
        ...activity,
        time: String(activity.time || (activityIndex === 0 ? '09:00' : activityIndex === 1 ? '14:00' : '19:00')),
        title,
        desc,
        location: { ...(activity.location || {}), address },
        ...(isFoodExperience ? { category: 'food', restaurant_options: restaurantOptions } : {})
      };
    });
    if (!dayHasFoodExperience) throw new Error(`O Dia ${index + 1} não inclui uma experiência gastronômica local concreta.`);
    const dayStory = String(day?.dayStory || day?.day_story || '').trim();
    const highlight = String(day?.highlight || '').trim();
    const localSecret = String(day?.localSecret || day?.local_secret || '').trim();
    const logistics = String(day?.logistics || day?.logistica || '').trim();
    if (dayStory.length < 120 || HOLLOW_PROSE_PATTERNS.test(dayStory)) throw new Error(`O Dia ${index + 1} precisa de uma abertura narrativa específica.`);
    if (highlight.length < 70) throw new Error(`O Dia ${index + 1} precisa explicar seu momento mais marcante.`);
    if (localSecret.length < 65) throw new Error(`O Dia ${index + 1} precisa trazer um segredo local concreto.`);
    if (logistics.length < 70 || !PRACTICAL_DETAIL_PATTERN.test(logistics)) throw new Error(`O Dia ${index + 1} precisa explicar a lógica de deslocamento.`);
    const specificClimatePlan = String(day?.climate_plan || '').trim();
    if (specificClimatePlan.length < 20 || VAGUE_PATTERNS.test(specificClimatePlan)) {
      throw new Error(`O Plano B do Dia ${index + 1} precisa indicar uma alternativa coberta específica.`);
    }
    const isoDate = addDays(startDate, index);
    const calendarDay = tripCalendar[index] || {};
    return {
      ...day,
      dayNum: index + 1,
      ...calendarDay,
      dayTitle: String(day.dayTitle || `Dia ${index + 1}`).trim(),
      dayStory,
      highlight,
      localSecret,
      logistics,
      dateISO: calendarDay.dateISO || isoDate,
      date: calendarDay.date || formatDatePt(isoDate),
      climate_plan: specificClimatePlan,
      activities: safeActivities
    };
  });

  if (totalActivities < days * 3) throw new Error('O roteiro ficou curto demais.');
  return normalized;
}
