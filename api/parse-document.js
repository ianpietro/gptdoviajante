const fetch = require('node-fetch-native' in global ? global.fetch : 'node-fetch');
const { checkUserAccess } = require('./_utils');

module.exports = async function handler(req, res) {
  // Cabeçalhos CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // 1. Validação de Autenticação do Supabase
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Acesso não autorizado: Token ausente." });
  }
  const idToken = authHeader.split("Bearer ")[1];

  let userEmail = null;

  if (idToken === "dummy-token-unconfigured") {
    userEmail = "teste@viajante.com";
  } else {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("SUPABASE_URL ou SUPABASE_ANON_KEY não configuradas no servidor.");
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
        return res.status(401).json({ error: "Sessão expirada. Por favor, faça login novamente." });
      }

      const user = await verifyRes.json();
      if (!user || !user.email) {
        return res.status(401).json({ error: "Usuário não encontrado." });
      }
      userEmail = user.email;
    } catch (err) {
      console.error("Erro na verificação de identidade:", err);
      return res.status(500).json({ error: "Erro interno na verificação de sessão." });
    }
  }

  // 2. Validação de Acesso (Compra Aprovada)
  const isAuthorized = await checkUserAccess(userEmail);
  if (!isAuthorized) {
    return res.status(403).json({ error: "Acesso negado: Seu e-mail não está na lista de compradores autorizados." });
  }

  // 3. Extração do Texto do Documento
  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "O texto extraído do documento é obrigatório." });
  }

  // 4. Chamada da API do Gemini para Estruturar os Dados
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("Chave de API do Gemini não configurada.");
    return res.status(500).json({ error: "Erro de configuração de IA no servidor." });
  }

  const systemPrompt = `Você é o assistente de inteligência artificial de bordo do CoPiloto de Viagem.
Sua tarefa é analisar o texto bruto extraído de um comprovante de reserva (passagem aérea ou hospedagem) e estruturar os dados estritamente em formato JSON.

Regras de Negócio:
1. Analise o texto fornecido e determine se é uma Passagem Aérea (Voo) ou uma Hospedagem (Hotel/Airbnb).
2. Se for uma Passagem Aérea (Voo), retorne um JSON com a chave "type": "flight" e os dados correspondentes:
{
  "type": "flight",
  "data": {
    "flightNumber": "Código do voo (Ex: G3 1234 ou LA 8112)",
    "date": "Data do voo no formato YYYY-MM-DD (Ex: 2026-10-12)",
    "airline": "Nome da companhia aérea (Ex: GOL, LATAM, Azul)",
    "status": "Confirmado",
    "departureAirport": "Código IATA do aeroporto de origem (Ex: GRU)",
    "departureCity": "Cidade de origem (Ex: São Paulo)",
    "arrivalAirport": "Código IATA do aeroporto de destino (Ex: LIS)",
    "arrivalCity": "Cidade de destino (Ex: Lisboa)",
    "scheduledDeparture": "Horário de decolagem HH:MM (Ex: 18:00)",
    "scheduledArrival": "Horário de pouso HH:MM (Ex: 06:00)",
    "terminal": "Terminal se encontrado (Ex: 3)",
    "gate": "Portão se encontrado (Ex: 302)",
    "carousel": "Esteira se encontrada (Ex: 4)",
    "duration": "Duração estimada do voo no formato XXh XXm (Ex: 09h 00m)"
  }
}

3. Se for uma Hospedagem (Hotel/Airbnb), retorne um JSON com a chave "type": "hotel" e os dados correspondentes:
{
  "type": "hotel",
  "data": {
    "hotel": "Nome do Hotel ou Airbnb (Ex: Bourbon Resort ou Apartamento Centro)",
    "hotelLink": "",
    "dates": "Período (Ex: 12 a 15 de Outubro)",
    "checkInDate": "Data de Check-in YYYY-MM-DD (Ex: 2026-10-12)",
    "checkOutDate": "Data de Check-out YYYY-MM-DD (Ex: 2026-10-15)"
  }
}

4. Retorne APENAS o objeto JSON puro. Não use markdown, não adicione explicações, não inclua o bloco de código \`\`\`json. Retorne estritamente o objeto JSON pronto para parse.`;

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
            parts: [{ text: `Analise o texto a seguir e extraia os dados:\n\n${text}` }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          temperature: 0.1, // temperatura baixa para extrações exatas
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API retornou erro ${response.status}`);
    }

    const resData = await response.json();
    const aiReply = resData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiReply) {
      throw new Error("Resposta de extração vazia do Gemini.");
    }

    let cleanReply = aiReply.trim();
    if (cleanReply.startsWith("```")) {
      cleanReply = cleanReply.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const parsedJson = JSON.parse(cleanReply);
    return res.status(200).json(parsedJson);

  } catch (error) {
    console.error("Erro ao analisar comprovante:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar e extrair dados do documento." });
  }
};
