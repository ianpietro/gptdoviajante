module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { destination, days, profile } = req.body;

  if (!destination || !days || !profile) {
    return res.status(400).json({ error: "destination, days, and profile are required fields" });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY environment variable is not defined on the server.");
    return res.status(500).json({ error: "Erro interno do servidor: Chave de IA não configurada." });
  }

  // Construct a highly detailed system prompt for premium, non-robotic trip simulation
  const systemPrompt = `Você é o GPT do Viajante, um consultor pessoal de viagens com a experiência de um amigo viajado que também entende de logística, cultura, gastronomia e economia de viagem.
Sua missão é gerar um plano de pré-visualização espetacular e ultra personalizado para o Dia 1 de uma viagem a "${destination}" por ${days} dias, adaptado ao perfil "${profile}".

NÃO seja genérico ou robótico. Evite termos clichês, respostas curtas ou formais. Escreva como um sommelier de viagens: direto, prático, acolhedor e focado em curadoria ativa. Não use travessões (—) para separar explicações. Recomende pontos específicos e DEFENDA suas escolhas com detalhes sensoriais e logísticos reais.

Você deve retornar estritamente um objeto JSON com as chaves indicadas abaixo, sem qualquer texto adicional antes ou depois.

Esquema JSON obrigatório:
{
  "dayTitle": "Título temático e evocativo do Dia 1 (ex: Cores, Sabores e Ladeiras do Pelourinho)",
  "date": "Data por extenso fictícia no formato ideal (ex: Segunda-feira, 12 de Outubro)",
  "hotel": "Sugestão de hotel ou melhor bairro específico para o perfil neste destino",
  "restaurant": "Recomendação de almoço (ex: Casa de Tereza - experimente a moqueca de camarão com coentro fresco)",
  "transport": "Melhor meio de locomoção para as atividades do dia",
  "activities": [
    {
      "time": "Horário sugerido (ex: 09:30)",
      "title": "Título específico e atraente da atividade",
      "desc": "Descrição rica de 3 a 5 linhas. Detalhe a experiência sensorial, explique POR QUE vale a pena e por que escolheu esta atividade, adicione uma dica prática de quem já foi (como evitar filas, melhor ângulo de fotos, etc.) e o valor de entrada se houver."
    },
    {
      "time": "Horário sugerido (ex: 12:00)",
      "title": "Pausa para almoço ou lanche clássico",
      "desc": "Diga onde comer e o prato ideal. Explique o ambiente e por que esse local é autêntico."
    },
    {
      "time": "Horário sugerido (ex: 14:30)",
      "title": "Atividade da tarde",
      "desc": "Mais um passeio incrível com curadoria ativa, dicas práticas específicas do local."
    },
    {
      "time": "Horário sugerido (ex: 18:00 ou 20:00)",
      "title": "Atividade da noite / Jantar e entretenimento",
      "desc": "Experiência de jantar ou passeio noturno que encerra o dia com chave de ouro."
    }
  ],
  "wow": "Descrição curta e inspiradora da experiência mais inesquecível do dia (Momento Wow)",
  "insider": "Segredo local ou dica escondida que apenas moradores sabem sobre o local",
  "logistics": "Explicação prática de como fazer o deslocamento do dia e tempo estimado",
  "budget": {
    "economico": 150,
    "intermediario": 350,
    "conforto": 700
  },
  "budgetAnalysis": "Uma análise de 2 a 3 linhas detalhando a realidade de preços do destino para este perfil (moeda, custos locais de refeição, passeios principais e como economizar lá). Defina os valores diários reais no objeto 'budget' baseado na realidade local (economico = baixo custo/mochilão, intermediario = conforto/custo-benefício, conforto = premium/luxo).",
  "packing": [
    {
      "category": "Documentos & Essenciais",
      "items": ["Item específico 1", "Item específico 2"]
    },
    {
      "category": "Roupas & Acessórios",
      "items": ["Item específico 3", "Item específico 4", "Item específico 5"]
    }
  ]
}

Escreva sempre em português do Brasil, de forma natural e amigável.`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `Gere o JSON estruturado para ${destination} de ${days} dias, perfil ${profile}. CRÍTICO: Não use aspas duplas (") dentro de nenhuma string de texto, se precisar citar algo use aspas simples ('). Não adicione quebras de linha literais dentro das strings do JSON.` }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt + "\n\nREGRAS CRÍTICAS DE ESCAPE JSON:\n1. NUNCA utilize aspas duplas (\") dentro dos textos das strings. Se precisar citar um nome, apelido, gíria ou estabelecimento, use aspas simples (').\n2. NUNCA insira quebras de linha reais/literais dentro dos textos das chaves. O JSON gerado deve ser uma string de linha contínua para cada propriedade." }]
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2500,
          responseMimeType: "application/json"
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

    return res.status(200).json(JSON.parse(aiReply));
  } catch (error) {
    console.error("Simulator error:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao gerar simulação." });
  }
}
