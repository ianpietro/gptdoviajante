const fetch = global.fetch || require('node-fetch');
const { checkUserAccess, handleCors } = require('./_utils');
const { routeAIRequest } = require('./_aiRouter');

module.exports = async function handler(req, res) {
  // CORS check
  if (!handleCors(req, res)) {
    return res.status(403).json({ error: 'Acesso CORS negado.' });
  }

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
  let userId = null;

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
      userId = user.id;
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
  const { text, content, base64, type, mimeType, tripId } = req.body;
  const documentText = String(text || content || '').trim();
  const attachment = base64 ? {
    base64,
    mimeType: mimeType || (type === 'pdf' ? 'application/pdf' : 'image/jpeg')
  } : null;
  if (!documentText && !attachment) {
    return res.status(400).json({ error: "O texto ou arquivo do documento é obrigatório." });
  }

  const systemPrompt = `Você é o assistente de inteligência artificial de bordo do CoPiloto de Viagem.
Sua tarefa é analisar o texto bruto extraído de um comprovante de reserva (passagem aérea, hospedagem, ingresso, aluguel de carro, seguro viagem, etc.) e estruturar os dados estritamente em formato JSON.

Campos obrigatórios no JSON de retorno:
1. "type": "flight" | "hotel" | "ticket" | "other"
2. "document_type": "flight_ticket" | "hotel_reservation" | "activity_ticket" | "car_rental" | "insurance" | "generic"
3. "provider": Nome da empresa/airline/hotel/plataforma (Ex: Air France, Booking.com, Civitatis)
4. "traveler_names": Array contendo nomes dos viajantes encontrados no documento
5. "booking_reference": Código localizador ou referência da reserva
6. "start_date": Data de início da reserva/evento no formato YYYY-MM-DD
7. "end_date": Data de término se aplicável (check-out, etc.) no formato YYYY-MM-DD
8. "departure_datetime": Decolagem do voo no formato YYYY-MM-DDTHH:MM:SS se disponível
9. "arrival_datetime": Pouso do voo no formato YYYY-MM-DDTHH:MM:SS se disponível
10. "origin": Origem da viagem ou voo (Ex: GIG ou Rio de Janeiro)
11. "destination": Destino da viagem ou voo (Ex: CDG ou Paris)
12. "flight_number": Código do voo se aplicável (Ex: AF443)
13. "hotel_name": Nome do hotel ou acomodação se aplicável
14. "checkin": Data de check-in YYYY-MM-DD se aplicável
15. "checkout": Data de check-out YYYY-MM-DD se aplicável
16. "currency": Moeda (Ex: BRL, USD, EUR)
17. "total_amount": Valor total pago se encontrado (numérico)
18. "address": Endereço do hotel ou evento
19. "activity_name": Nome da atividade ou ingresso se aplicável
20. "ticket_date": Data do ingresso YYYY-MM-DD se aplicável
21. "confidence": Nível de certeza da extração (0.0 a 1.0) baseado na clareza dos dados encontrados

Para manter compatibilidade retroativa com a versão anterior do frontend, você DEVE preencher a propriedade "data" com os seguintes formatos baseados no tipo:

Se type for "flight", preencha "data" assim:
{
  "flightNumber": "flight_number",
  "date": "start_date",
  "airline": "provider",
  "status": "Confirmado",
  "departureAirport": "Código IATA da origem se encontrado",
  "departureCity": "Cidade de origem",
  "arrivalAirport": "Código IATA do destino se encontrado",
  "arrivalCity": "Cidade de destino",
  "scheduledDeparture": "Horário HH:MM",
  "scheduledArrival": "Horário HH:MM",
  "terminal": "Terminal se encontrado",
  "gate": "Portão se encontrado",
  "carousel": "Esteira se encontrada",
  "duration": "Duração no formato XXh XXm se encontrada"
}

Se type for "hotel", preencha "data" assim:
{
  "hotel": "hotel_name",
  "hotelLink": "",
  "dates": "Período legível por humano (Ex: 12 a 15 de Outubro)",
  "checkInDate": "checkin",
  "checkOutDate": "checkout"
}

Retorne APENAS o objeto JSON puro. Não use markdown, não adicione explicações, não inclua o bloco de código \`\`\`json.`;

  try {
    const result = await routeAIRequest({
      task: 'document_parse',
      messages: [{ role: 'user', content: documentText ? `Analise o texto a seguir e extraia os dados:\n\n${documentText}` : 'Analise o documento anexo e extraia os dados.', attachment }],
      systemPrompt,
      responseMimeType: 'application/json',
      temperature: 0.1,
      isSystemTask: true,
      userId,
      tripId: tripId || null,
      userMessage: 'Extrair dados de documento'
    });
    const parsedJson = JSON.parse(result.reply);
    return res.status(200).json(parsedJson);

  } catch (error) {
    console.error("Erro ao analisar comprovante:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar e extrair dados do documento." });
  }
};
