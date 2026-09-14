// Curadoria mínima de destinos usada para impedir roteiros genéricos ou
// culturalmente vazios. As fichas devem ser baseadas em fontes oficiais.

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const DESTINATIONS = {
  'campo grande ms': {
    name: 'Campo Grande, MS',
    aliases: ['campo grande', 'campo grande ms', 'campo grande mato grosso do sul'],
    verifiedAt: '2026-09-11',
    sources: [
      'Prefeitura de Campo Grande / Visit Campo Grande',
      'Fundação de Turismo de Mato Grosso do Sul',
      'Bioparque Pantanal',
      'Observatório de Turismo de Campo Grande — Gastronomia Regional e Pantaneira'
    ],
    criticalCoverage: [
      { label: 'Bioparque Pantanal', aliases: ['bioparque pantanal'] },
      { label: 'Feira Central', aliases: ['feira central', 'feirona'] },
      { label: 'sobá', aliases: ['soba'] }
    ],
    identityCoverage: [
      { label: 'tereré', aliases: ['terere'] },
      { label: 'chipa ou sopa paraguaia', aliases: ['chipa', 'sopa paraguaia'] },
      { label: 'gastronomia pantaneira', aliases: ['pintado', 'pacu', 'carne seca', 'churrasco com mandioca', 'arroz carreteiro'] }
    ],
    forbiddenPatterns: [
      { label: 'estabelecimento possivelmente inventado', pattern: /\b(?:restaurante|churrascaria|cafe)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}]+/giu },
      { label: 'atividade vaga usada como enchimento', pattern: /\b(?:tarde livre|ultimos momentos|compras de ultima hora|restaurante local|padaria local|alguma feira|uma fazenda|churrascaria rural|peixe regional|culinaria de fronteira|margem de seguranca|perto do trajeto de volta)\b/giu },
      { label: 'curadoria transferida ao viajante', pattern: /(?:escolha|procure).{0,90}(?:avaliacoes|bem avaliad|funcionamento|operacao aberta|regiao central)/giu },
      { label: 'estrutura não confirmada no Parque do Prosa', pattern: /\b(?:restaurante do parque|bicicleta|alugue uma bicicleta|pedalando)\b/giu },
      { label: 'prato sem vínculo cultural confirmado', pattern: /\bpaje\b/giu }
    ],
    repetitionLimits: [
      { label: 'Parque das Nações Indígenas repetido como atração', aliases: ['parque das nacoes indigenas'], maxMentions: 3 }
    ],
    brief: `
CURADORIA LOCAL OBRIGATÓRIA — CAMPO GRANDE, MS

Este roteiro só pode ser considerado bom se mostrar a identidade real da Cidade Morena.

Essenciais turísticos:
- Bioparque Pantanal: atração indispensável e um dos grandes símbolos turísticos atuais da cidade. A entrada é gratuita, mas a visita exige agendamento pelo site oficial. O roteiro deve alertar o viajante a reservar, nunca vender ingresso.
- Parque das Nações Indígenas: combine com o Bioparque pela proximidade, preferencialmente no fim da tarde. Não use o parque duas vezes apenas para preencher dias.
- Feira Central e Turística: experiência noturna obrigatória para cultura, gastronomia e imigração japonesa/okinawana.
- Museu das Culturas Dom Bosco, Mercadão Municipal Antônio Valente, Morada dos Baís, Casa do Artesão e circuito histórico central são opções autênticas para distribuir nos demais dias.

Arquitetura recomendada para cinco dias:
- Dia 1: Museu das Culturas Dom Bosco, Bioparque Pantanal, Parque das Nações no fim da tarde e Feira Central com sobá à noite.
- Dia 2: Morada dos Baís, Casa do Artesão, Mercadão Municipal e caminhada pelo centro histórico.
- Dia 3: Parque Estadual do Prosa somente com acesso confirmado; complemente com Parque do Sóter ou Lago do Amor, sem inventar serviços dentro das unidades ambientais.
- Dia 4: Museu José Antônio Pereira, Comunidade Tia Eva/Igreja São Benedito e cultura regional. Use apenas horários que o viajante deverá confirmar.
- Dia 5: Praça das Araras, Orla Morena e uma experiência gastronômica regional diferente, como chipa, sopa paraguaia, peixe regional ou churrasco com mandioca.

Precisão dos lugares:
- Praça das Araras é uma praça urbana marcada pelas esculturas de araras. Não prometa observação de aves no local.
- Orla Morena é um corredor urbano de lazer implantado no antigo traçado ferroviário. Não descreva o local como margem de lago.

Identidade gastronômica obrigatória:
- Sobá de Campo Grande na Feira Central. É patrimônio cultural imaterial municipal e não pode faltar.
- Tereré, hábito profundamente ligado ao cotidiano sul-mato-grossense.
- Inclua ao menos uma experiência entre chipa e sopa paraguaia.
- Quando couber ao perfil, inclua peixe regional, como pintado ou pacu, ou churrasco com mandioca.
- Para peixe pantaneiro, estão confirmados pela curadoria oficial: Casa do Peixe (Rua Doutor João Rosa Pires, 1030, Centro), com peixe a urucum e moqueca; e Pioneiros, com costelinha de pacu, pintado a urucum e pacu assado. Informe o prato concreto e peça ao viajante apenas para confirmar o horário atual — nunca para descobrir sozinho onde comer.

Regras contra alucinação e enchimento:
- Não invente restaurante, café, aluguel de bicicleta, estrutura ou serviço. Se o estabelecimento não estiver confirmado, use Feira Central, Mercadão Municipal ou outro equipamento gastronômico verificado — nunca “escolha um lugar bem avaliado”.
- Os locais gastronômicos confirmados nesta ficha são Feira Central, Mercadão Municipal Antônio Valente, Casa do Peixe e Pioneiros.
- Não sugira “restaurante do Parque Estadual do Prosa” nem aluguel de bicicleta no parque sem confirmação oficial.
- Não trate shopping, “últimos momentos” ou “preparação para a volta” como atração principal em um roteiro de cinco dias.
- Não use nomes vagos ou incorretos de museus quando houver um equipamento oficial conhecido.
- Cada dia precisa ter uma razão clara, bairros próximos e pelo menos uma experiência que só faria sentido em Campo Grande.
`
  }
};

function getDestinationKnowledge(tripContext = {}) {
  const destination = normalize(
    typeof tripContext === 'string'
      ? tripContext
      : (tripContext.destination || tripContext.tripTitle || tripContext.title || '')
  );
  return Object.values(DESTINATIONS).find(profile => profile.aliases.some(alias => destination.includes(normalize(alias)))) || null;
}

function countOccurrences(text, phrase) {
  let count = 0;
  let cursor = 0;
  while ((cursor = text.indexOf(phrase, cursor)) !== -1) {
    count += 1;
    cursor += phrase.length;
  }
  return count;
}

function auditDestinationCoverage(text, profile) {
  if (!profile) return { passed: true, missingCritical: [], identityCount: 0, qualityIssues: [] };
  const normalized = normalize(text);
  const missingCritical = profile.criticalCoverage
    .filter(item => !item.aliases.some(alias => normalized.includes(normalize(alias))))
    .map(item => item.label);
  const identityCount = profile.identityCoverage
    .filter(item => item.aliases.some(alias => normalized.includes(normalize(alias))))
    .length;
  const qualityIssues = [];
  (profile.forbiddenPatterns || []).forEach(rule => {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(String(text || ''))) qualityIssues.push(rule.label);
  });
  (profile.repetitionLimits || []).forEach(rule => {
    const mentions = Math.max(...rule.aliases.map(alias => countOccurrences(normalized, normalize(alias))));
    if (mentions > rule.maxMentions) qualityIssues.push(rule.label);
  });
  return {
    passed: missingCritical.length === 0 && identityCount >= 2 && qualityIssues.length === 0,
    missingCritical,
    identityCount,
    qualityIssues
  };
}

function isItineraryCreationRequest(message = '') {
  const value = normalize(message);
  return /(crie|criar|monte|montar|planeje|planejar|roteiro|itinerario)/.test(value) &&
    /(dia|dias|viagem|roteiro|itinerario)/.test(value);
}

function buildCuratedItineraryResponse(profile, requestedDays = 5) {
  if (!profile || profile.name !== 'Campo Grande, MS') return null;

  const days = [
    {
      dayNum: 1,
      dayTitle: 'Pantanal, cultura e o sobá da cidade',
      climate_plan: 'Se chover forte, amplie a visita ao Museu das Culturas Dom Bosco e mantenha o Bioparque Pantanal somente se o acesso estiver normal.',
      activities: [
        { time: '09:00', title: 'Museu das Culturas Dom Bosco', desc: 'Comece pela história natural e pelas culturas indígenas de Mato Grosso do Sul.', location: { address: 'Museu das Culturas Dom Bosco, Campo Grande, MS' } },
        { time: '14:00', title: 'Bioparque Pantanal', desc: 'Visite o complexo de água doce com agendamento gratuito feito antecipadamente no site oficial.', location: { address: 'Bioparque Pantanal, Campo Grande, MS' } },
        { time: '17:00', title: 'Parque das Nações Indígenas', desc: 'Aproveite a proximidade para caminhar no fim da tarde, sem repetir o parque nos outros dias.', location: { address: 'Parque das Nações Indígenas, Campo Grande, MS' } },
        { time: '19:30', category: 'food', title: 'Sobá na Feira Central e Turística', desc: 'Jante o sobá de Campo Grande e entenda como a receita okinawana se tornou patrimônio cultural da cidade.', location: { address: 'Feira Central e Turística, Rua 14 de Julho, 3351, Campo Grande, MS' }, restaurant_options: [
          { name: 'Barraca da Sandra', address: 'Feira Central, Box 12, Rua 14 de Julho, 3351', dish: 'Sobá tradicional', price_level: '$', why: 'Opção tradicional dentro da Feirona, no cenário cultural original do prato.', verification_note: 'Confirme o funcionamento do box no dia.' },
          { name: 'Massa Sobaria', address: 'Rua Pernambuco, 1398, Campo Grande, MS', dish: 'Sobá e espetinho', price_level: '$', why: 'Alternativa especializada em sobá fora da feira, citada na pesquisa gastronômica municipal.', verification_note: 'Confirme o horário atual antes de sair.' }
        ] }
      ]
    },
    {
      dayNum: 2,
      dayTitle: 'Centro histórico e sabores do Mercadão',
      climate_plan: 'Em caso de chuva, concentre o circuito na Morada dos Baís, Casa do Artesão e Mercadão Municipal Antônio Valente.',
      activities: [
        { time: '09:00', title: 'Morada dos Baís', desc: 'Conheça um dos edifícios históricos mais reconhecíveis da cidade e confira a programação cultural do dia.', location: { address: 'Morada dos Baís, Campo Grande, MS' } },
        { time: '10:30', title: 'Casa do Artesão', desc: 'Veja peças regionais e artesanato ligado à identidade sul-mato-grossense.', location: { address: 'Casa do Artesão, Campo Grande, MS' } },
        { time: '12:30', category: 'food', title: 'Chipa, sopa paraguaia e tereré no Centro', desc: 'Faça uma pausa para sabores que mostram a influência paraguaia e o hábito cotidiano do tereré em Campo Grande.', location: { address: 'Centro, Campo Grande, MS' }, restaurant_options: [
          { name: 'Mercadão Municipal Antônio Valente', address: 'Rua Sete de Setembro, 65, Centro, Campo Grande, MS', dish: 'Chipa, sopa paraguaia e erva de tereré', price_level: '$', why: 'É uma parada turística histórica para provar e comprar produtos regionais no Centro.', verification_note: 'Confirme o horário do mercado para o dia da visita.' },
          { name: 'Hong Kong Restaurante', address: 'Rua João Rosa Pires, 761, Amambaí, Campo Grande, MS', dish: 'Sobá campo-grandense', price_level: '$$', why: 'Casa listada pela pesquisa gastronômica municipal entre as que servem o prato típico.', verification_note: 'Confirme horário e disponibilidade do sobá.' }
        ] },
        { time: '15:30', title: 'Circuito histórico central', desc: 'Caminhe pelo entorno da Avenida Calógeras e da Rua 14 de Julho, observando o patrimônio urbano e o comércio tradicional.', location: { address: 'Centro de Campo Grande, MS' } },
        { time: '18:00', title: 'Praça Ary Coelho ao entardecer', desc: 'Termine no tradicional ponto de encontro do Centro e observe o coreto, a pérgula e a estátua de Ary Coelho.', location: { address: 'Praça Ary Coelho, Campo Grande, MS' } }
      ]
    },
    {
      dayNum: 3,
      dayTitle: 'Áreas verdes da Cidade Morena',
      climate_plan: 'Se os parques estiverem inviáveis, troque o trecho externo pelo MARCO — Museu de Arte Contemporânea de Mato Grosso do Sul.',
      activities: [
        { time: '08:30', title: 'Parque Estadual do Prosa', desc: 'Faça a visita somente com acesso e regras confirmados previamente nos canais oficiais da unidade.', location: { address: 'Parque Estadual do Prosa, Campo Grande, MS' } },
        { time: '11:00', title: 'Parque do Sóter', desc: 'Caminhe com calma e aproveite uma área de lazer urbana diferente do roteiro do primeiro dia.', location: { address: 'Parque do Sóter, Campo Grande, MS' } },
        { time: '13:30', category: 'food', title: 'Peixes pantaneiros no Centro', desc: 'Reserve o almoço para pintado, pacu ou caldo de piranha, sabores de água doce associados à mesa sul-mato-grossense.', location: { address: 'Centro e Jardim dos Estados, Campo Grande, MS' }, restaurant_options: [
          { name: 'Casa do Peixe', address: 'Rua Doutor João Rosa Pires, 1030, Centro, Campo Grande, MS', dish: 'Peixe ao urucum ou costela de pacu', price_level: '$$', why: 'Casa tradicional desde 1983, especializada em pescados e localizada em frente à Praça das Araras.', verification_note: 'Confirme horário e reserva, especialmente no jantar.' },
          { name: 'Pioneiros Restaurante & Choperia', address: 'Rua Euclides da Cunha, 479, Jardim dos Estados, Campo Grande, MS', dish: 'Pacu assado ou pintado a urucum', price_level: '$$', why: 'A pesquisa gastronômica municipal relaciona a casa a vários preparos de pacu e pintado.', verification_note: 'Confirme o prato e o horário atual.' }
        ] },
        { time: '16:30', title: 'Lago do Amor', desc: 'Feche o circuito de natureza com uma parada curta e contemplativa.', location: { address: 'Lago do Amor, Campo Grande, MS' } },
        { time: '18:00', title: 'Pôr do sol no entorno da UFMS', desc: 'Aproveite a proximidade do Lago do Amor para encerrar o dia observando a paisagem do campus, sem atravessar novamente a cidade.', location: { address: 'Universidade Federal de Mato Grosso do Sul, Campo Grande, MS' } }
      ]
    },
    {
      dayNum: 4,
      dayTitle: 'Origens, memória e cultura afro-brasileira',
      climate_plan: 'Se chover, mantenha o Museu José Antônio Pereira e substitua o trecho aberto por uma visita mais longa à Morada dos Baís.',
      activities: [
        { time: '09:00', title: 'Museu José Antônio Pereira', desc: 'Conheça a memória ligada à formação de Campo Grande; confirme previamente o horário de visitação.', location: { address: 'Museu José Antônio Pereira, Campo Grande, MS' } },
        { time: '14:00', title: 'Comunidade Tia Eva e Igreja São Benedito', desc: 'Aproxime-se de uma referência essencial da história e da cultura afro-brasileira da cidade, respeitando os horários e atividades da comunidade.', location: { address: 'Comunidade Tia Eva, Campo Grande, MS' } },
        { time: '17:30', category: 'food', title: 'Sabores de fronteira e sobá', desc: 'Compare a influência paraguaia da chipa e da sopa paraguaia com a tradição okinawana do sobá campo-grandense.', location: { address: 'Centro, Campo Grande, MS' }, restaurant_options: [
          { name: 'Mercadão Municipal Antônio Valente', address: 'Rua Sete de Setembro, 65, Centro, Campo Grande, MS', dish: 'Chipa e sopa paraguaia', price_level: '$', why: 'O mercado reúne ingredientes e preparos ligados à cultura de fronteira da cidade.', verification_note: 'Confirme se o mercado estará aberto no fim da tarde.' },
          { name: 'Massa Sobaria', address: 'Rua Pernambuco, 1398, Campo Grande, MS', dish: 'Sobá tradicional', price_level: '$', why: 'Alternativa especializada no prato que se tornou patrimônio imaterial de Campo Grande.', verification_note: 'Confirme o horário atual antes de sair.' }
        ] }
      ]
    },
    {
      dayNum: 5,
      dayTitle: 'Arte urbana e despedida campo-grandense',
      climate_plan: 'Se chover, substitua Praça das Araras e Orla Morena pela Esplanada Ferroviária e pelo Armazém Cultural Helena Meirelles.',
      activities: [
        { time: '09:00', title: 'Praça das Araras', desc: 'Observe as grandes esculturas de araras que marcam a praça e rendem uma parada fotográfica curta.', location: { address: 'Praça das Araras, Campo Grande, MS' } },
        { time: '10:30', title: 'Orla Morena', desc: 'Passeie pelo corredor urbano de lazer criado no antigo traçado ferroviário; o local não é uma orla de lago.', location: { address: 'Orla Morena, Campo Grande, MS' } },
        { time: '12:30', category: 'food', title: 'Último almoço com sabor pantaneiro', desc: 'Feche a viagem com um preparo de peixe de água doce e acompanhamentos regionais, sem repetir uma refeição genérica.', location: { address: 'Jardim dos Estados ou Centro, Campo Grande, MS' }, restaurant_options: [
          { name: 'Pioneiros Restaurante & Choperia', address: 'Rua Euclides da Cunha, 479, Jardim dos Estados, Campo Grande, MS', dish: 'Pacu assado ou pintado a urucum', price_level: '$$', why: 'Reúne diferentes preparos de peixes pantaneiros documentados na pesquisa gastronômica municipal.', verification_note: 'Confirme horário, prato disponível e reserva.' },
          { name: 'Casa do Peixe', address: 'Rua Doutor João Rosa Pires, 1030, Centro, Campo Grande, MS', dish: 'Rodízio de peixes com costela de pacu', price_level: '$$', why: 'É uma alternativa tradicional, com cardápio próprio dedicado a pescados desde 1983.', verification_note: 'Confirme o horário e a modalidade do rodízio.' }
        ] },
        { time: '15:00', title: 'Horto Florestal e história do Anhanduí', desc: 'Caminhe pelo Parque Florestal Antônio de Albuquerque, área verde histórica de 1912 ligada às nascentes formadoras do rio Anhanduí.', location: { address: 'Horto Florestal, Campo Grande, MS' } }
      ]
    }
  ];

  const safeDays = Math.max(1, Math.min(days.length, Number(requestedDays) || 5));
  const selectedDays = days.slice(0, safeDays);
  const sections = selectedDays.map(day => {
    const items = day.activities.map(item => {
      const restaurants = Array.isArray(item.restaurant_options) && item.restaurant_options.length
        ? `\n${item.restaurant_options.map((option, index) => `  - **${index === 0 ? 'Principal' : 'Alternativa'} — ${option.name}:** ${option.dish} · ${option.price_level} · ${option.address}. ${option.why} ${option.verification_note}`).join('\n')}`
        : '';
      return `- **${item.time} · ${item.title}:** ${item.desc}${restaurants}`;
    }).join('\n');
    return `### Dia ${day.dayNum} — ${day.dayTitle}\n${items}`;
  }).join('\n\n');
  const envelope = { actions: [{ type: 'itinerary', operation: 'replace', index: 0, data: selectedDays }] };
  return `Montei ${safeDays === 1 ? 'um dia completo' : `${safeDays} dias completos`} com deslocamentos coerentes, endereços pesquisáveis e experiências que têm a cara de Campo Grande. Antes de sair, confirme horários atuais e faça o agendamento gratuito do Bioparque Pantanal.\n\n${sections}\n\n\`\`\`json\n${JSON.stringify(envelope)}\n\`\`\``;
}

module.exports = { getDestinationKnowledge, auditDestinationCoverage, isItineraryCreationRequest, buildCuratedItineraryResponse, normalize };
