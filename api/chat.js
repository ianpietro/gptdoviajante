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
    console.info("Bypassing Firebase Auth verification (local unconfigured mode)");
    userEmail = "teste@viajante.com";
  } else {
    // Verify token with Firebase Auth REST API
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (!firebaseApiKey) {
      console.error("FIREBASE_API_KEY environment variable is not defined on the server.");
      return res.status(500).json({ error: "Erro interno do servidor: Autenticação não configurada." });
    }

    try {
      const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`;
      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: idToken })
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json().catch(() => ({}));
        console.error("Firebase token verification failed:", errData);
        return res.status(401).json({ error: "Token inválido ou expirado. Faça login novamente." });
      }

      const verifyData = await verifyRes.json();
      const user = verifyData.users?.[0];
      if (!user) {
        return res.status(401).json({ error: "Usuário não encontrado no Firebase." });
      }
      userEmail = user.email;
    } catch (err) {
      console.error("Error during Firebase token verification:", err);
      return res.status(500).json({ error: "Erro na verificação de identidade." });
    }
  }

  // Verify whitelist
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS;
  if (allowedEmailsEnv) {
    const allowedEmails = allowedEmailsEnv.split(",").map(email => email.trim().toLowerCase());
    if (!allowedEmails.includes(userEmail.toLowerCase())) {
      console.warn(`Access blocked for email: ${userEmail} (not in whitelist)`);
      return res.status(403).json({ error: "Seu e-mail não está cadastrado na lista de compradores autorizados. Entre em contato com o suporte." });
    }
  } else {
    console.warn("WARNING: ALLOWED_EMAILS environment variable is not defined. Access granted to all authenticated users.");
  }

  const { messages, provider = "gemini", apiKey, travelMode } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  // Load System Prompt from prompt_master.txt
  let systemPrompt = "";
  try {
    const promptPath = path.join(process.cwd(), 'api', 'prompt_master.txt');
    systemPrompt = fs.readFileSync(promptPath, 'utf8');
  } catch (err) {
    console.error("Error reading prompt_master.txt:", err);
    // Minimal fallback system instructions
    systemPrompt = "Você é o GPT do Viajante, um assistente virtual consultor de viagens.";
  }

  // Inject dynamic JSON structure instructions into system prompt
  const jsonInstructions = `
\n\n
======================================================================
INSTRUÇÃO TÉCNICA OBRIGATÓRIA (INVISÍVEL AO USUÁRIO):
Sempre que você criar ou atualizar o roteiro, o orçamento ou a checklist de malas, você DEVE gerar no final da sua resposta um único bloco de código JSON demarcado exatamente com \`\`\`json e contendo a estrutura de dados correspondente para atualizar a interface do usuário. Não invente chaves adicionais e preencha tudo em português.

Estrutura do JSON:
{
  "tripTitle": "Título da Viagem (Ex: Viagem para Salvador)",
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
      "date": "Data por extenso (Ex: Segunda-feira, 12 de Outubro)",
      "hotel": "Hotel do dia",
      "restaurant": "Restaurante recomendado do dia",
      "transport": "Transporte recomendado do dia",
      "activities": [
        {
          "time": "Horário (Ex: 10:00)",
          "title": "Título da atividade",
          "desc": "Descrição detalhada"
        }
      ]
    }
  ]
}
Seja cirúrgico e preencha os dados de forma consistente com o texto da sua conversa.
======================================================================
`;

  // Travel Mode System Prompt
  const travelModeSystemPrompt = `
🧭 VOCÊ É O GUIA DE VIAGEM EM TEMPO REAL (MODO NA VIAGEM)

Sua missão é atuar como o guia local de bolso do usuário, que está atualmente no destino de viagem dele. 
Você deve ser extremamente prestativo, informativo e focar exclusivamente na experiência presencial do viajante no destino.

Diretrizes de Comportamento:
1. **Modo Guia Local Presencial**: Fale como um amigo local experiente que está caminhando junto com o usuário. Use comandos como "Olhe para o seu lado...", "Se você caminhar mais 50 metros...", "À sua direita, você verá...".
2. **Linguagem Sensorial e Imersiva**: Descreva o lugar usando detalhes sensoriais (a luz do sol nas fachadas, o cheiro de comida típica no ar, o som das ruas).
3. **Histórias e Curiosidades**: Conte narrativas interessantes, lendas urbanas ou curiosidades históricas sobre os pontos turísticos onde o usuário está.
4. **Dicas Práticas Imediatas**: Recomende os melhores pratos locais, as portinhas escondidas, o melhor horário para visitar um ponto turístico, e como evitar armadilhas de turistas.
5. **Apoio Logístico e Prático**: Se o usuário pedir, ajude com direções, traduções rápidas de frases úteis, telefones de emergência locais ou informações sobre transporte público local.
6. **Pergunte a Localização**: Se o usuário pedir sugestões ou roteiros do dia, comece perguntando exatamente onde ele está localizado ou o que tem por perto no momento para personalizar o tour.
7. **NÃO GERE JSON**: Em nenhuma hipótese gere blocos de código JSON ou tente atualizar a interface do usuário (não envie roteiros dia-a-dia estruturados, checklists de mala ou orçamentos). Foque 100% na conversa fluida, natural e narrativa.
`;

  let fullSystemPrompt = "";
  if (travelMode) {
    fullSystemPrompt = travelModeSystemPrompt;
  } else {
    fullSystemPrompt = systemPrompt + jsonInstructions;
  }

  try {
    if (provider === "gemini") {
      // 1. GEMINI INTEGRATION (Using Google AI Studio key)
      // Key hierarchy: request body key -> env variable
      const keyToUse = apiKey || process.env.GEMINI_API_KEY;

      if (!keyToUse) {
        return res.status(400).json({ error: "Gemini API Key não configurada no servidor Vercel. Por favor, configure a variável de ambiente GEMINI_API_KEY." });
      }

      // Convert ChatGPT messages to Gemini roles and support multimodal inlineData
      const geminiMessages = messages.map(msg => {
        let role = msg.role;
        if (role === "assistant") role = "model";
        
        const parts = [];
        if (msg.attachment && msg.attachment.mimeType && msg.attachment.base64) {
          parts.push({
            inlineData: {
              mimeType: msg.attachment.mimeType,
              data: msg.attachment.base64
            }
          });
        }
        parts.push({ text: msg.content });

        return {
          role: role,
          parts: parts
        };
      });

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keyToUse}`;
      
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: fullSystemPrompt }]
          },
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Gemini API returned status ${response.status}`);
      }

      const resData = await response.json();
      const aiReply = resData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!aiReply) {
        throw new Error("Resposta vazia da API do Gemini.");
      }

      return res.status(200).json({ content: aiReply });

    } else {
      // 2. OPENAI INTEGRATION
      const keyToUse = apiKey || process.env.OPENAI_API_KEY;

      if (!keyToUse) {
        return res.status(400).json({ error: "OpenAI API Key não configurada no servidor Vercel. Por favor, configure a variável de ambiente OPENAI_API_KEY." });
      }

      const openAiMessages = [
        { role: "system", content: fullSystemPrompt },
        ...messages.map(msg => {
          let content = msg.content;
          if (msg.attachment && msg.attachment.mimeType && msg.attachment.mimeType.startsWith("image/") && msg.attachment.base64) {
            content = [
              { type: "text", text: msg.content },
              {
                type: "image_url",
                image_url: {
                  url: `data:${msg.attachment.mimeType};base64,${msg.attachment.base64}`
                }
              }
            ];
          }
          return {
            role: msg.role,
            content: content
          };
        })
      ];

      const openaiUrl = "https://api.openai.com/v1/chat/completions";

      const response = await fetch(openaiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${keyToUse}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: openAiMessages,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `OpenAI API returned status ${response.status}`);
      }

      const resData = await response.json();
      const aiReply = resData.choices?.[0]?.message?.content;

      if (!aiReply) {
        throw new Error("Resposta vazia da API da OpenAI.");
      }

      return res.status(200).json({ content: aiReply });
    }
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: error.message || "Erro interno do servidor." });
  }
}
