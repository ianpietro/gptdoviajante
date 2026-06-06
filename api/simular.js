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
  const systemPrompt = `Você é o GPT do Viajante, um consultor pessoal de viagens experiente criado por Ian Capo.
Sua missão no simulador é dar uma demonstração real, idêntica ao que o produto entrega no painel do cliente, mas apresentando APENAS o Dia 1.

O usuário quer ir para "${destination}" por ${days} dias, com perfil de grupo "${profile}".

Instruções de Resposta:
1. Comece de forma amigável e animada, validando a escolha do destino.
2. Apresente o "DIA 1" estruturado exatamente assim:

**DIA 1: [Título temático e evocativo do dia]**
🏨 Hospedagem sugerida no melhor bairro para o perfil.

🌅 MANHÃ (aprox. 08h–12h)
- [Atividade principal com horário sugerido]
  → Por que vale: [1-2 frases explicando o diferencial]
  → Dica prática: [algo que só quem foi sabe]
  → Entrada: [gratuito ou valor aproximado]
- [Pausa gastronômica recomendada]
  → Nome do lugar, o que pedir e preço médio.

🌇 TARDE (aprox. 12h–18h)
- [Atividade principal]
  → Por que vale: [explicação]
  → Dica prática: [dica]
  → Entrada: [preço]
- [Pausa gastronômica]
  → Nome do lugar e o que pedir.

🌙 NOITE (aprox. 18h–22h+)
- [Atividade principal ou sugestão de jantar]
  → Por que vale: [explicação]
  → Dica prática: [dica]
  → Entrada: [preço]

⭐ MOMENTO WOW DO DIA:
[A experiência mais marcante do dia]

💡 DICA DE INSIDER:
[A dica secreta sobre o local]

🚗 LOGÍSTICA:
[Como se deslocar entre os pontos do dia]

3. Logo em seguida, adicione uma frase persuasiva dizendo que o roteiro completo dos outros dias, a mala inteligente e a planilha de gastos reativa foram gerados e estão salvos no painel, bastando ativar a conta para desbloquear.
4. Escreva em português brasileiro natural, direto, amigável e caloroso. Não use travessões (—) de forma alguma.`;

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
