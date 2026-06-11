const fetch = require('node-fetch-native' in global ? global.fetch : 'node-fetch');

module.exports = async function handler(req, res) {
  // Cabeçalhos CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // 1. Verificação do Token Secreto (Segurança)
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = req.query.secret;
    if (receivedSecret !== webhookSecret) {
      console.warn("Tentativa de webhook não autorizada: segredo incorreto.");
      return res.status(401).json({ error: "Acesso não autorizado: Token secreto incorreto ou ausente." });
    }
  } else {
    console.warn("AVISO: A variável de ambiente WEBHOOK_SECRET não está definida. O webhook está rodando em modo aberto.");
  }

  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: "Payload vazio" });
  }

  console.info("Payload do Webhook Recebido:", JSON.stringify(payload, null, 2));

  // 2. Extrai o E-mail e o Status dinamicamente com base nos padrões de payload de cada plataforma
  let email = null;
  let status = null;

  // Auto-detecção de plataforma
  if (payload.order_status !== undefined && payload.Customer !== undefined) {
    // KIWIFY
    email = payload.Customer.email;
    status = payload.order_status; // "paid", "refunded", "chargedback"
  } else if (payload.customer !== undefined && payload.status !== undefined) {
    // KIRVANO
    email = payload.customer.email;
    status = payload.status; // "paid", "approved", "refunded"
  } else if (payload.client !== undefined && payload.status !== undefined) {
    // GREENN / GREEN
    email = payload.client.email;
    status = payload.status; // "paid", "refunded"
  } else {
    // Genérico / Fallback (Simulações / testes)
    email = payload.email || payload.buyer_email;
    status = payload.status || payload.order_status;
  }

  if (!email) {
    console.warn("Não foi possível extrair o e-mail do cliente a partir do payload.");
    return res.status(400).json({ error: "E-mail do comprador não encontrado no payload." });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanStatus = status ? status.trim().toLowerCase() : "";

  console.info(`Processando status de acesso: E-mail=${cleanEmail}, Status=${cleanStatus}`);

  // 3. Conecta ao Supabase para inserir/remover a permissão de e-mail
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("As variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY estão faltando no servidor.");
    return res.status(500).json({ error: "Configuração do Supabase ausente no servidor." });
  }

  // Definição de status positivos (liberação) e negativos (revogação) nas plataformas de checkout
  const positiveStatuses = ["paid", "approved", "completed", "pago", "aprovado", "sucesso"];
  const negativeStatuses = ["refunded", "chargedback", "refund", "chargeback", "reembolsado", "cancelado", "recusado"];

  try {
    if (positiveStatuses.includes(cleanStatus)) {
      // Autorizar acesso: insere o e-mail na tabela authorized_emails
      console.info(`Autorizando acesso para o comprador: ${cleanEmail}`);
      const response = await fetch(`${supabaseUrl}/rest/v1/authorized_emails`, {
        method: "POST",
        headers: {
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates" // age como upsert / ignora duplicatas
        },
        body: JSON.stringify({ email: cleanEmail })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha ao inserir e-mail autorizado no Supabase: ${response.status} ${errText}`);
      }

      console.info(`Sucesso: Comprador ${cleanEmail} adicionado ao banco de autorizações.`);
      return res.status(200).json({ status: "sucesso", acao: "autorizado", email: cleanEmail });

    } else if (negativeStatuses.includes(cleanStatus)) {
      // Revogar acesso: deleta o e-mail da tabela authorized_emails
      console.info(`Revogando acesso para o comprador: ${cleanEmail}`);
      const response = await fetch(`${supabaseUrl}/rest/v1/authorized_emails?email=eq.${encodeURIComponent(cleanEmail)}`, {
        method: "DELETE",
        headers: {
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha ao deletar e-mail autorizado do Supabase: ${response.status} ${errText}`);
      }

      console.info(`Sucesso: Acesso do comprador ${cleanEmail} foi revogado.`);
      return res.status(200).json({ status: "sucesso", acao: "revogado", email: cleanEmail });
    } else {
      console.info(`Status do Webhook ${cleanStatus} ignorado (nenhuma ação necessária).`);
      return res.status(200).json({ status: "sucesso", acao: "nenhuma", mensagem: `Status ${cleanStatus} ignorado.` });
    }

  } catch (error) {
    console.error("Erro ao processar o webhook de checkout:", error);
    return res.status(500).json({ error: error.message || "Erro interno no processamento do webhook." });
  }
};
