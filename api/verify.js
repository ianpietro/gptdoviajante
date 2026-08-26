const { handleCors } = require('./_utils');

module.exports = async function handler(req, res) {
  // CORS check
  if (!handleCors(req, res)) {
    return res.status(403).json({ error: 'Acesso CORS negado.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ authorized: false, error: 'Acesso não autorizado: Token ausente.' });
  }
  const idToken = authHeader.split('Bearer ')[1];

  let userEmail = null;

  // Verify token with Supabase Auth API
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[verify] SUPABASE_URL or SUPABASE_ANON_KEY not configured.');
    return res.status(500).json({ authorized: false, error: 'Erro interno do servidor: Autenticação não configurada.' });
  }

  try {
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (!verifyRes.ok) {
      return res.status(401).json({ authorized: false, error: 'Token inválido ou expirado.' });
    }

    const user = await verifyRes.json();
    if (!user || !user.email) {
      return res.status(401).json({ authorized: false, error: 'Usuário não encontrado no Supabase.' });
    }
    userEmail = user.email;
  } catch (err) {
    console.error('[verify] Supabase token verification error:', err.message);
    return res.status(500).json({ authorized: false, error: 'Erro na verificação de identidade.' });
  }

  // Verify user entitlement and return plan to the frontend
  const { checkUserEntitlement } = require('./_utils');
  const entitlement = await checkUserEntitlement(userEmail);

  if (!entitlement.allowed) {
    console.warn(`[verify] Access blocked for email: ${userEmail} — reason: ${entitlement.reason}`);
    return res.status(403).json({ authorized: false, error: 'Acesso não autorizado. Entre em contato com o suporte.' });
  }

  return res.status(200).json({
    authorized: true,
    email: userEmail,
    plan: entitlement.plan,
    reason: entitlement.reason
  });
};
