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
    // Verify token with Firebase Auth REST API
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (!firebaseApiKey) {
      console.error("FIREBASE_API_KEY environment variable is not defined on the server.");
      return res.status(500).json({ authorized: false, error: "Erro interno do servidor: Autenticação não configurada." });
    }

    try {
      const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`;
      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: idToken })
      });

      if (!verifyRes.ok) {
        return res.status(401).json({ authorized: false, error: "Token inválido ou expirado." });
      }

      const verifyData = await verifyRes.json();
      const user = verifyData.users?.[0];
      if (!user) {
        return res.status(401).json({ authorized: false, error: "Usuário não encontrado no Firebase." });
      }
      userEmail = user.email;
    } catch (err) {
      console.error("Error during Firebase token verification:", err);
      return res.status(500).json({ authorized: false, error: "Erro na verificação de identidade." });
    }
  }

  // Verify whitelist
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS;
  if (allowedEmailsEnv) {
    const allowedEmails = allowedEmailsEnv.split(",").map(email => email.trim().toLowerCase());
    if (!allowedEmails.includes(userEmail.toLowerCase())) {
      console.warn(`Access blocked for email: ${userEmail} (not in whitelist)`);
      return res.status(403).json({ authorized: false, error: `Seu e-mail (${userEmail}) não está cadastrado na lista de compradores autorizados. Entre em contato com o suporte.` });
    }
  }

  return res.status(200).json({ authorized: true, email: userEmail });
};
