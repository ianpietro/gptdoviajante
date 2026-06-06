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
  }

  const { flightNumber, date } = req.body;
  if (!flightNumber) {
    return res.status(400).json({ error: "Flight number is required." });
  }

  // Use Vercel GEMINI_API_KEY
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({ error: "Erro interno: Chave do Gemini não configurada no servidor." });
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

  const queryDateText = date ? ` no dia ${date}` : " hoje (ou data mais recente disponível)";
  
  const prompt = `Encontre os detalhes reais em tempo real do voo ${flightNumber}${queryDateText}.
Consulte os resultados de busca do Google para obter o status atual, horários estimados/reais, aeroportos, portão, terminal e esteira de bagagens.

Retorne APENAS um objeto JSON válido seguindo estritamente esta estrutura:
{
  "flightNumber": "Código do voo digitado, normalizado (ex: AD4132)",
  "airline": "Nome da companhia aérea (ex: Azul, LATAM, GOL)",
  "departureAirport": "Código IATA de 3 letras do aeroporto de partida (ex: GRU)",
  "departureCity": "Nome da cidade de partida (ex: São Paulo)",
  "arrivalAirport": "Código IATA de 3 letras do aeroporto de destino (ex: SDU)",
  "arrivalCity": "Nome da cidade de destino (ex: Rio de Janeiro)",
  "scheduledDeparture": "Horário de partida previsto no fuso de origem no formato HH:MM (ex: 10:15)",
  "scheduledArrival": "Horário de chegada previsto no fuso de destino no formato HH:MM (ex: 11:30)",
  "actualDeparture": "Horário real ou estimado de decolagem no formato HH:MM se disponível, ou null se não decolou ainda ou não encontrado",
  "actualArrival": "Horário real ou estimado de pouso no formato HH:MM se disponível, ou null se não pousou ainda ou não encontrado",
  "terminal": "Terminal de partida (ex: T2) ou null se não disponível",
  "gate": "Portão de embarque (ex: 204) ou null se não disponível",
  "carousel": "Esteira de bagagem na chegada (ex: Esteira 5) ou null se não disponível",
  "status": "Um destes estados de voo exatos: Confirmado, Embarque, Em Voo, Pousou, Atrasado, Cancelado",
  "duration": "Duração estimada do voo formatado (ex: 01h 15m)"
}

Escreva APENAS o JSON puro. Não adicione markdown, não adicione comentários, não adicione tag \`\`\`json. Comece com { e termine com }.`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    tools: [
      {
        googleSearch: {}
      }
    ]
  };

  try {
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error("O serviço do assistente retornou uma resposta vazia.");
    }

    // Safely extract JSON from response
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      throw new Error("Não foi possível processar a resposta dos dados do voo. Tente novamente.");
    }
    
    const jsonStr = text.substring(start, end + 1);
    const flightData = JSON.parse(jsonStr);
    
    // Add timestamp to response
    flightData.lastUpdated = new Date().toISOString();
    
    return res.status(200).json(flightData);

  } catch (err) {
    console.error("Flight tracker function error:", err);
    return res.status(500).json({ error: err.message || "Erro interno ao rastrear voo." });
  }
};
