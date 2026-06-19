const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Extract Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Acesso não autorizado: Token ausente." });
  }
  const idToken = authHeader.split("Bearer ")[1];

  let userEmail = null;

  if (idToken === "dummy-token-unconfigured") {
    console.info("Bypassing Supabase Auth verification (local unconfigured mode)");
    userEmail = "teste@viajante.com";
  } else {
    // Verify token with Supabase Auth API
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("SUPABASE_URL or SUPABASE_ANON_KEY is not defined on the server.");
      return res.status(500).json({ error: "Erro interno do servidor: Autenticação não configurada." });
    }

    try {
      const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: "GET",
        headers: {
          "apikey": supabaseAnonKey,
          "Authorization": `Bearer ${idToken}`
        }
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json().catch(() => ({}));
        console.error("Supabase token verification failed:", errData);
        return res.status(401).json({ error: "Token inválido ou expirado. Faça login novamente." });
      }

      const user = await verifyRes.json();
      if (!user || !user.email) {
        return res.status(401).json({ error: "Usuário não encontrado no Supabase." });
      }
      userEmail = user.email;
    } catch (err) {
      console.error("Error during Supabase token verification:", err);
      return res.status(500).json({ error: "Erro na verificação de identidade." });
    }
  }

  // Verify whitelist and authorized_emails in database
  const { checkUserAccess } = require('./_utils');
  const isAuthorized = await checkUserAccess(userEmail);
  if (!isAuthorized) {
    console.warn(`Access blocked for email: ${userEmail} (not authorized)`);
    return res.status(403).json({ error: "Seu e-mail não está cadastrado na lista de compradores autorizados. Entre em contato com o suporte." });
  }

  let messages = req.body.messages;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  const { provider = "gemini", apiKey, travelMode, tripContext } = req.body;

  // Optimize chat history by stripping older assistant JSON blocks to save tokens and prevent rate limits (TPM)
  let foundLatestJson = false;
  const optimizedMessages = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    let content = msg.content;
    if (msg.role === "assistant" && typeof content === "string") {
      const hasJsonBlock = /```\s*json\s*[\s\S]*?```/i.test(content);
      if (hasJsonBlock) {
        if (!foundLatestJson) {
          foundLatestJson = true; // Keep the latest state JSON block
        } else {
          // Remove older JSON blocks to save thousands of tokens per turn
          content = content.replace(/```\s*json\s*[\s\S]*?```/gi, "").trim();
        }
      }
    }
    optimizedMessages.unshift({ ...msg, content });
  }
  messages = optimizedMessages;

  // Load System Prompt from prompt_master.txt
  let systemPrompt = "";
  try {
    const promptPath = path.join(process.cwd(), 'api', 'prompt_master.txt');
    systemPrompt = fs.readFileSync(promptPath, 'utf8');
  } catch (err) {
    console.error("Error reading prompt_master.txt:", err);
    // Minimal fallback system instructions
    systemPrompt = "Você é o CoPiloto de Viagem, um painel interativo e inteligente de viagens.";
  }

  // Inject dynamic JSON structure instructions into system prompt
  const jsonInstructions = `
\n\n
======================================================================
INSTRUÇÃO TÉCNICA OBRIGATÓRIA (INVISÍVEL AO USUÁRIO):
Sempre que você criar ou atualizar o roteiro, o orçamento, a checklist de malas ou voos, você DEVE gerar no final da sua resposta um único bloco de código JSON demarcado exatamente com \`\`\`json e contendo a estrutura de dados correspondente para atualizar a interface do usuário. Não invente chaves adicionais e preencha tudo em português.

⚠️ REGRA ABSOLUTA DE EXPERIÊNCIA DO USUÁRIO: JAMAIS mencione JSON, bloco de código, dados técnicos, estrutura de dados, ou qualquer termo técnico no texto conversacional da sua resposta. O usuário não sabe e não precisa saber que existe um JSON. Sua resposta deve ser 100% natural e amigável, como se fosse uma conversa. O bloco \`\`\`json deve aparecer silenciosamente ao final, sem nenhuma referência a ele no texto. Exemplos do que NUNCA dizer: "O JSON abaixo reflete...", "Vou atualizar os dados técnicos...", "O bloco de código garante...", "As informações foram sincronizadas via JSON...". Em vez disso, fale diretamente sobre a viagem: "Seu roteiro está pronto!", "Atualizei tudo para o dia 15!", "Aqui está a programação completa!".

Estrutura do JSON:
{
  "tripTitle": "Título da Viagem — deve ser estritamente curto no formato 'Cidade, País' ou 'Cidade' (Ex: Salvador, Brasil ou Lisboa, Portugal)",
  "tripSubtitle": "Subtítulo da Viagem",
  "infoDates": "Período (Ex: 12 a 15 de Outubro)",
  "infoWeather": "Clima Médio (Ex: 24°C a 30°C)",
  "infoGroup": "Tipo de Grupo (Ex: Casal)",
  "infoHotel": "Hotel Principal (Ex: Bourbon Resort)",
  "hotelLink": "URL da reserva do hotel se fornecida pelo usuário (Ex: https://booking.com/...)",
  "targetDate": "Data de início no formato ISO 8601 (Ex: 2026-10-12T10:00:00) para contagem regressiva",
  "budget": {
    "hospedagem": 1800,
    "alimentacao": 600,
    "passeios": 850,
    "compras": 400
  },
  "budgetThresholds": {
    "economico": 150,
    "intermediario": 450
  },
  "budgetAnalysis": "Análise personalizada sobre o custo da viagem baseada nas particularidades e valores locais reais do destino (ex: preços médios de refeições locais em restaurantes típicos, custo de transporte público ou passes locais, passeios principais, taxa de câmbio se aplicável, etc., tudo adaptado ao perfil do usuário). IMPORTANTE: no objeto 'budgetThresholds' acima, defina limites de gastos diários reais por pessoa (em R$) para este destino específico para classificar as faixas de custo: 'economico' (limite diário máximo de custo mochilão/baixo custo no destino) e 'intermediario' (limite diário máximo de custo conforto/custo-benefício no destino; acima disso será premium/luxo). Ajuste estes valores de acordo com a realidade de preços do local.",
  "packing": [
    {
      "category": "Nome da Categoria (Ex: Documentos & Essenciais)",
      "items": ["Item 1", "Item 2", "Item 3"]
    }
  ],
  "itinerary": [
    {
      "dayNum": 1,
      "dayTitle": "Título do Dia",
      "city": "Cidade onde o dia acontece (Ex: Lisboa, Roma, Juiz de Fora). OBRIGATÓRIO e CRÍTICO para links de mapa.",
      "date": "Data por extenso (Ex: Segunda-feira, 12 de Outubro)",
      "hotel": "Hotel do dia",
      "restaurant": "Restaurante recomendado do dia",
      "transport": "Transporte recomendado do dia",
      "activities": [
        {
          "time": "Horário (Ex: 10:00)",
          "title": "Título da atividade (APENAS o nome do local, sem endereço ou cidade)",
          "desc": "Descrição detalhada",
          "booking": {
            "platform": "Plataforma sugerida (ex: Civitatis ou GetYourGuide ou Booking)",
            "suggestedText": "Texto de ação para o botão de reserva (ex: Ingressos Coliseu ou Reservar Show de Tango)",
            "searchQuery": "Termo de busca ideal para encontrar essa atração específica no parceiro (ex: Coliseu Tour Guiado Roma)"
          }
        }
      ]
    }
  ],
  "flights": [
    {
      "flightNumber": "Número do Voo (Ex: LA8112)",
      "date": "Data do Voo no formato YYYY-MM-DD (Ex: 2026-10-12)",
      "airline": "Companhia Aérea (Ex: LATAM)",
      "status": "Status do Voo (Ex: Confirmado)",
      "departureAirport": "Aeroporto de Origem (Ex: GRU)",
      "departureCity": "Cidade de Origem (Ex: São Paulo)",
      "arrivalAirport": "Aeroporto de Destino (Ex: LIS)",
      "arrivalCity": "Cidade de Destino (Ex: Lisboa)",
      "scheduledDeparture": "Horário de Decolagem no formato HH:MM (Ex: 18:00)",
      "scheduledArrival": "Horário de Pouso no formato HH:MM (Ex: 06:00)",
      "terminal": "Terminal se houver (Ex: 3)",
      "gate": "Portão se houver (Ex: 302)",
      "carousel": "Esteira se houver (Ex: 4)",
      "duration": "Duração do voo no formato XXh XXm (Ex: 09h 00m)"
    }
  ]
}
Adicione o objeto 'booking' apenas quando a atividade envolver passeios pagos, atrações icônicas, tours, shows ou transportes/reservas que façam sentido comprar com antecedência.
Seja cirúrgico e preencha os dados de forma consistente com o texto da sua conversa. Se o usuário fornecer ou alterar informações de voos no chat, lembre-se de refletir no campo 'flights' no JSON.

⚠️ REGRA CRÍTICA DE SEGURANÇA DE ENDEREÇOS E MAPAS:
1. O campo 'city' de cada dia do itinerário é OBRIGATÓRIO e deve conter APENAS a cidade onde as atividades daquele dia ocorrem (ex: "Lisboa", "Porto", "Juiz de Fora"). Nunca deixe vazio.
2. Os títulos das atividades ('title') devem conter APENAS o nome do local/atração, sem endereço, bairro ou cidade. Ex: "Torre de Belém" e NÃO "Torre de Belém, Lisboa" ou "Torre de Belém, Belém, Lisboa".
3. Todas as atrações devem estar ESTRITAMENTE na cidade definida no campo 'city' do dia. Nunca coloque no título ou endereço de uma atividade o nome de outra cidade ou estado.
4. NUNCA invente endereços. Se não souber o local exato, coloque apenas o nome do estabelecimento.
5. NOMES DE RESTAURANTES E ESTABELECIMENTOS: use SEMPRE o nome próprio real e pesquisável do local (ex: "Restaurante Sabor Mineiro", "Churrascaria do Vale"). JAMAIS use nomes genéricos sozinhos como "Churrasqueira", "Restaurante", "Padaria", "Lanchonete" — esses não são nomes de lugares e não podem ser encontrados no Google Maps. Se sugerir um restaurante, ele deve existir realmente na cidade. Se não tiver certeza do nome exato, descreva no campo 'desc' e use no 'title' o nome mais específico possível.
======================================================================
`;

  // Travel Mode System Prompt
  const travelModeSystemPrompt = `
🧭 MODO NA VIAGEM: GUIA LOCAL EM TEMPO REAL

Você é o CoPiloto de Viagem no modo de campo. O usuário está no destino agora, com o celular na mão, e você é o amigo local que está do lado dele — não um guia turístico recitando roteiro decorado, não um chatbot de call center.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  LEI ABSOLUTA DE TOM DE VOZ
(Vale em 100% das respostas, em qualquer assunto, a qualquer momento, sem exceção)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Não importa se você está descrevendo uma rua, respondendo uma dúvida rápida, indicando um restaurante ou contando uma história: o tom é sempre o mesmo. É o papo de um amigo que sabe muito mas não precisa mostrar que sabe. Direto, quente, sem frescura e sem robô.

Isso não é uma sugestão de estilo. É a única forma que você tem de responder.

NUNCA faça:
- Comece uma resposta com "Claro!", "Com certeza!", "Absolutamente!", "Ótima pergunta!", "Entendido!", "Olá!" isolado ou qualquer enchimento que não diz nada. Vá direto ao ponto.
- Use linguagem formal: "senhor", "prezado", "informo que", "neste sentido", "cabe ressaltar", "portanto", "sendo assim".
- Use travessões (—) para separar ideias. Use vírgula, ponto ou reescreva a frase.
- Explique o óbvio de forma cansativa. Se o usuário já entendeu, não repete.
- Escreva em "modo relatório": blocos enormes, bullet points pra tudo, tom corporativo.
- Encerre com "Espero ter ajudado!" ou "Qualquer dúvida, estou à disposição!" ou variações disso.
- Use travessões (—) pra separar qualquer coisa.

SEMPRE faça:
- Use contrações naturais do português falado: "tá", "pra", "pro", "né", "a gente", "que nem".
- Varie o ritmo. Às vezes uma frase curta e direta é o que o momento pede. Às vezes um parágrafo rico e sensorial faz mais sentido.
- Termine sempre com um gancho, de forma natural. "Quer ir pra próxima parada?" "Tem algum lugar específico que você quer conhecer hoje?"
- Fale com a pessoa, não para ela.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺️  COMO SE COMPORTAR NO MODO NA VIAGEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você é o amigo local que está caminhando junto. Não o guia que lê do script. Isso significa:

1. PRESENÇA FÍSICA: Fale como se você estivesse lá. "Olha à sua direita...", "Se você andar mais uns 50 metros...", "Esse cheiro que você tá sentindo provavelmente é..." — detalhes sensoriais que criam presença real: luz, som, cheiro, textura, temperatura.

2. HISTÓRIAS, NÃO DESCRIÇÕES: Não descreva o lugar, conte o que aconteceu lá. A lenda urbana, o fato histórico que ninguém menciona, o motivo pelo qual aquela estátua está de costas pra cidade. Isso é o que transforma turismo em memória.

3. CURADORIA PRÁTICA: A portinha escondida, o ângulo certo da foto, o horário em que o lugar fica vazio, o prato que você pede sem nem olhar o cardápio. Seja o amigo que já esteve lá antes.

4. ANTES DE SUGERIR, PERGUNTE ONDE ELE ESTÁ: Se o usuário pedir "o que fazer", "o que tem por aqui", "pra onde ir agora", pergunte primeiro onde ele está neste momento. A resposta muda completamente dependendo da esquina.

5. APOIO IMEDIATO: Direções, frases úteis no idioma local, número de emergência, como chamar um táxi, como reclamar a bagagem perdida — responda na hora, sem enrolação.

6. SEM JSON, SEM INTERFACE: Neste modo você não atualiza roteiro, orçamento, mala nem logística. Sem blocos de código JSON. Foco 100% na conversa presencial e fluida. O usuário está no campo, não no computador.
`;


  let contextInstructions = "";
  if (tripContext) {
    contextInstructions = `
\n\n
======================================================================
DADOS ATUAIS DA VIAGEM CADASTRADOS NA INTERFACE (DADOS DE CONTEXTO REAL):
Sempre use e considere estes dados como verdade absoluta. Se houver voos ou hotéis reais preenchidos aqui, use-os na logística de partida/roteiro.
- Hotel Principal: ${tripContext.hotel || 'Não informado'}
- Link do Hotel: ${tripContext.hotelLink || 'Não informado'}
- Voos Cadastrados pelo Usuário: ${tripContext.flights && tripContext.flights.length > 0 ? JSON.stringify(tripContext.flights) : 'Nenhum voo cadastrado'}
- Orçamento Sincronizado: ${JSON.stringify(tripContext.budget || {})}
- Período/Datas: ${tripContext.dates || 'Não definido'}
- Destino Atual: ${tripContext.destination || 'Não definido'}
======================================================================
`;
  }

  let fullSystemPrompt = "";
  if (travelMode) {
    fullSystemPrompt = travelModeSystemPrompt + contextInstructions;
  } else {
    fullSystemPrompt = systemPrompt + jsonInstructions + contextInstructions;
  }

  // ── Helper: call Gemini ────────────────────────────────────────────────────
  // ── Helper: call Gemini ────────────────────────────────────────────────────
  async function callGemini(geminiKey, modelName = "gemini-2.5-flash") {
    const geminiMessages = messages.map(msg => {
      let role = msg.role === "assistant" ? "model" : msg.role;
      const parts = [];
      if (msg.attachment && msg.attachment.mimeType && msg.attachment.base64) {
        parts.push({ inlineData: { mimeType: msg.attachment.mimeType, data: msg.attachment.base64 } });
      }
      parts.push({ text: msg.content });
      return { role, parts };
    });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
    const requestBody = {
      systemInstruction: { parts: [{ text: fullSystemPrompt }] },
      contents: geminiMessages,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95
      }
    };

    // Add thinkingConfig only for models supporting thinking (like gemini-2.5-flash)
    if (modelName.includes("2.5") || modelName.includes("2.0-flash-thinking")) {
      requestBody.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API returned status ${response.status}`);
    }

    const resData = await response.json();
    // Skip thought parts (thought: true) — grab first real text part
    const parts = resData.candidates?.[0]?.content?.parts || [];
    const aiReply = parts.find(p => !p.thought)?.text;
    if (!aiReply) throw new Error("Resposta vazia da API do Gemini.");
    return aiReply;
  }

  // ── Helper: call OpenAI ────────────────────────────────────────────────────
  async function callOpenAI(openaiKey) {
    const openAiMessages = [
      { role: "system", content: fullSystemPrompt },
      ...messages.map(msg => {
        let content = msg.content;
        if (msg.attachment && msg.attachment.mimeType && msg.attachment.mimeType.startsWith("image/") && msg.attachment.base64) {
          content = [
            { type: "text", text: msg.content },
            { type: "image_url", image_url: { url: `data:${msg.attachment.mimeType};base64,${msg.attachment.base64}` } }
          ];
        }
        return { role: msg.role, content };
      })
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: openAiMessages, temperature: 0.7 })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenAI API returned status ${response.status}`);
    }

    const resData = await response.json();
    const aiReply = resData.choices?.[0]?.message?.content;
    if (!aiReply) throw new Error("Resposta vazia da API da OpenAI.");
    return aiReply;
  }

  // ── Main call: Gemini first, automatic OpenAI fallback ────────────────────
  try {
    const geminiKey = apiKey || process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    let aiReply = null;

    if (geminiKey) {
      const geminiModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-pro-latest", "gemini-flash-latest"];
      let lastGeminiErr = null;

      for (const model of geminiModels) {
        try {
          aiReply = await callGemini(geminiKey, model);
          break; // Success!
        } catch (geminiErr) {
          lastGeminiErr = geminiErr;
          console.warn(`Gemini model ${model} failed (${geminiErr.message}). Trying next model…`);
        }
      }

      if (!aiReply) {
        console.warn(`All Gemini models failed. Trying OpenAI fallback…`);
        if (!openaiKey) {
          // No fallback available — surface the last Gemini error directly
          throw lastGeminiErr;
        }
        aiReply = await callOpenAI(openaiKey);
      }
    } else if (openaiKey) {
      // Gemini key not configured — go straight to OpenAI
      aiReply = await callOpenAI(openaiKey);
    } else {
      return res.status(500).json({ error: "Nenhuma chave de API configurada no servidor (GEMINI_API_KEY ou OPENAI_API_KEY)." });
    }

    return res.status(200).json({ content: aiReply });

  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: error.message || "Erro interno do servidor." });
  }
}
