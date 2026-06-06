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

  // Construct a prompt specifically to generate a Day 1 preview with lock teaser
  const systemPrompt = `Você é o GPT do Viajante, uma Inteligência Artificial consultora de viagens experiente (criada por Ian Capo). 
Sua missão é dar uma demonstração real de como você monta roteiros incríveis.
O usuário quer planejar uma viagem para "${destination}" por ${days} dias, com perfil de grupo "${profile}".

Instruções de Resposta:
1. Comece de forma leve, amigável e animada, validando a escolha do destino (ex: "Paris é sempre uma ótima ideia!" ou "Salvador tem uma energia incrível!").
2. Em seguida, descreva com detalhes práticos e reais APENAS o "Dia 1" dessa viagem. Divida o Dia 1 em turnos (Manhã, Tarde e Noite), incluindo o que visitar, uma recomendação de restaurante local típico e transporte.
3. Termine sua resposta com uma mensagem de transição persuasiva dizendo que o roteiro completo dos outros dias, o gerenciamento de orçamento inteligente e a mala de viagem personalizada já foram gerados com sucesso e estão guardados no painel, aguardando apenas a ativação da conta para serem desbloqueados.
4. Escreva em português brasileiro de forma leve e natural (estilo conversa com amigo experiente). Use negrito para destacar pontos e turnos.
5. Mantenha a resposta concisa, com no máximo 180 a 220 palavras, terminando com o teaser de desbloqueio.`;

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
            parts: [{ text: `Quero planejar uma viagem para ${destination} de ${days} dias, com perfil ${profile}. Monte o Dia 1 e dê o teaser dos outros dias.` }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000
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
  } catch (error) {
    console.error("Simulator error:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao gerar simulação." });
  }
}
