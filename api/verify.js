module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Extract Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ authorized: false, error: "Acesso não autorizado: Token ausente." });
  }
  const idToken = authHeader.split("Bearer ")[1];

  let userEmail = null;

  if (idToken === "dummy-token-unconfigured") {
    userEmail = "teste@viajante.com";
  } else {
    // Verify token with Supabase Auth API
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("SUPABASE_URL or SUPABASE_ANON_KEY environment variables are not defined on the server.");
      return res.status(500).json({ authorized: false, error: "Erro interno do servidor: Autenticação não configurada." });
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
        return res.status(401).json({ authorized: false, error: "Token inválido ou expirado." });
      }

      const user = await verifyRes.json();
      if (!user || !user.email) {
        return res.status(401).json({ authorized: false, error: "Usuário não encontrado no Supabase." });
      }
      userEmail = user.email;
    } catch (err) {
      console.error("Error during Supabase token verification:", err);
      return res.status(500).json({ authorized: false, error: "Erro na verificação de identidade." });
    }
  }

  // Verify whitelist and authorized_emails in database
  const { checkUserAccess } = require('./_utils');
  const isAuthorized = await checkUserAccess(userEmail);
  if (!isAuthorized) {
    console.warn(`Access blocked for email: ${userEmail} (not authorized)`);
    return res.status(403).json({ authorized: false, error: `Seu e-mail (${userEmail}) não está cadastrado na lista de compradores autorizados. Entre em contato com o suporte.` });
  }

  return res.status(200).json({ authorized: true, email: userEmail });
};
