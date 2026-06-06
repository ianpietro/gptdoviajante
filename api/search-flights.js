const path = require("path");

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

  const { origin, destination, date } = req.body;
  if (!origin || !destination || !date) {
    return res.status(400).json({ error: "Origin, destination, and date are required." });
  }

  // Use Vercel GEMINI_API_KEY
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({ error: "Erro interno: Chave do Gemini não configurada no servidor." });
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

  const queryDate = new Date(date);
  const getOffsetDateStr = (offset) => {
    const d = new Date(queryDate);
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  };

  const dateRequestedStr = date;
  const dateMinus2 = getOffsetDateStr(-2);
  const dateMinus1 = getOffsetDateStr(-1);
  const datePlus1 = getOffsetDateStr(1);
  const datePlus2 = getOffsetDateStr(2);

  const prompt = `Você DEVE realizar pesquisas no Google Search para encontrar voos reais de ida (só ida) de ${origin} para ${destination}.
Para obter os preços reais corretos, faça pesquisas individuais usando termos do Google Flights para cada uma das datas abaixo:
1. Data ${dateMinus2}: pesquisa "Google Flights ${origin} ${destination} ${dateMinus2}" ou "voos de ${origin} para ${destination} no dia ${dateMinus2}"
2. Data ${dateMinus1}: pesquisa "Google Flights ${origin} ${destination} ${dateMinus1}" ou "voos de ${origin} para ${destination} no dia ${dateMinus1}"
3. Data ${dateRequestedStr}: pesquisa "Google Flights ${origin} ${destination} ${dateRequestedStr}" ou "voos de ${origin} para ${destination} no dia ${dateRequestedStr}"
4. Data ${datePlus1}: pesquisa "Google Flights ${origin} ${destination} ${datePlus1}" ou "voos de ${origin} para ${destination} no dia ${datePlus1}"
5. Data ${datePlus2}: pesquisa "Google Flights ${origin} ${destination} ${datePlus2}" ou "voos de ${origin} para ${destination} no dia ${datePlus2}"

Analise os resultados do Google Search de cada pesquisa. Como esta rota é muito comum, sempre existem voos diários e preços reais listados pelas companhias aéreas (Azul, GOL, LATAM, etc.).
Você NÃO deve retornar 'Não encontrado' a menos que realmente não haja voos de nenhuma companhia aérea. Se houver variação de preços ou pacotes na busca, use o menor preço disponível.

Retorne APENAS um objeto JSON válido seguindo estritamente esta estrutura:
{
  "requestedDate": "${dateRequestedStr}",
  "origin": "${origin}",
  "destination": "${destination}",
  "requestedFlight": {
    "price": "Preço formatado encontrado (ex: R$ 1.500)",
    "priceValue": 1500 (número inteiro aproximado, ou null se indisponível),
    "airline": "Companhia aérea (ex: Azul)",
    "stops": "Conexões (ex: Direto ou 1 parada)",
    "duration": "Duração (ex: 3h 20m)"
  },
  "allCheckedDates": [
    {
      "date": "${dateMinus2}",
      "price": "Preço formatado encontrado (ex: R$ 1.200) ou 'Não encontrado'",
      "priceValue": 1200 (número inteiro ou null),
      "airline": "Companhia aérea ou null"
    },
    {
      "date": "${dateMinus1}",
      "price": "Preço formatado encontrado (ex: R$ 1.350) ou 'Não encontrado'",
      "priceValue": 1350 (número inteiro ou null),
      "airline": "Companhia aérea ou null"
    },
    {
      "date": "${dateRequestedStr}",
      "price": "Preço formatado encontrado (ex: R$ 1.500) ou 'Não encontrado'",
      "priceValue": 1500 (número inteiro ou null),
      "airline": "Companhia aérea ou null"
    },
    {
      "date": "${datePlus1}",
      "price": "Preço formatado encontrado (ex: R$ 1.600) ou 'Não encontrado'",
      "priceValue": 1600 (número inteiro ou null),
      "airline": "Companhia aérea ou null"
    },
    {
      "date": "${datePlus2}",
      "price": "Preço formatado encontrado (ex: R$ 1.400) ou 'Não encontrado'",
      "priceValue": 1400 (número inteiro ou null),
      "airline": "Companhia aérea ou null"
    }
  ],
  "naturalExplanation": "Uma explicação amigável e natural em português, comparando os preços das datas. Se houver algum dia mais barato, aponte-o de forma clara e natural indicando a economia potencial. Exemplo: 'O voo na data solicitada (dia 5) custa R$ 1.500 pela Azul. No entanto, se você puder viajar no dia 3 (dois dias antes), você economiza R$ 300, pois há um voo pela Azul por R$ 1.200!'"
}

Escreva APENAS o JSON puro. Não adicione markdown, não adicione comentários, não adicione tag \`\`\`json. Comece com { e termine com }.;`;

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
      throw new Error("Não foi possível processar a resposta da pesquisa de voos. Tente novamente.");
    }
    
    const jsonStr = text.substring(start, end + 1);
    const flightSearchResults = JSON.parse(jsonStr);
    
    return res.status(200).json(flightSearchResults);

  } catch (err) {
    console.error("Flight search function error:", err);
    return res.status(500).json({ error: err.message || "Erro interno ao pesquisar voos." });
  }
};
