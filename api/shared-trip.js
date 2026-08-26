const fetch = global.fetch || require('node-fetch');
const { handleCors } = require('./_utils');

module.exports = async function handler(req, res) {
  if (!handleCors(req, res)) {
    return res.status(403).json({ error: 'Acesso CORS negado.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'ID da viagem é obrigatório.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Serviço de banco não configurado no backend.' });
  }

  // Verifica se é UUID válido
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    return res.status(400).json({ error: 'ID da viagem inválido.' });
  }

  try {
    // Consulta no Supabase usando service_role (ignora RLS)
    const fetchUrl = `${supabaseUrl}/rest/v1/trips?id=eq.${encodeURIComponent(id)}&select=*`;
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Accept': 'application/vnd.pgrst.object+json' // Retorna objeto em vez de array
      }
    });

    if (!response.ok) {
      return res.status(404).json({ error: 'Viagem não encontrada.' });
    }

    const trip = await response.json();
    if (!trip) {
      return res.status(404).json({ error: 'Viagem não encontrada.' });
    }

    // Normalizar e extrair sharing
    const sharing = trip.sharing || {
      enabled: false,
      itinerary: true,
      reservations: true,
      flights: true,
      accommodations: true,
      budget: false,
      expenses: false,
      members: false,
      packing: false,
      documents: false
    };

    // Bloqueio se sharing desabilitado
    if (sharing.enabled === false) {
      return res.status(403).json({ error: 'Esta viagem é privada.', code: 'TRIP_PRIVATE' });
    }

    // Sanitização de dados baseada em privacidade granular no Backend
    const sanitized = {
      id: trip.id,
      title: trip.title,
      subtitle: trip.subtitle,
      dates: trip.dates,
      weather: trip.weather,
      group_type: trip.group_type,
      target_date: trip.target_date,
      created_at: trip.created_at,
      updated_at: trip.updated_at,
      sharing: sharing,
      user_id: trip.user_id
    };

    if (sharing.itinerary) {
      sanitized.itinerary = trip.itinerary;
    } else {
      sanitized.itinerary = [];
    }

    if (sharing.flights) {
      sanitized.flights = trip.flights;
    } else {
      sanitized.flights = [];
    }

    if (sharing.accommodations) {
      sanitized.hotel = trip.hotel;
      sanitized.hotel_link = trip.hotel_link;
    } else {
      sanitized.hotel = "Privado";
      sanitized.hotel_link = "";
    }

    if (sharing.reservations) {
      sanitized.reservations = trip.reservations || [];
    } else {
      sanitized.reservations = [];
    }

    if (sharing.budget) {
      sanitized.budget = trip.budget;
      sanitized.budget_thresholds = trip.budget_thresholds;
      sanitized.budget_analysis = trip.budget_analysis;
    } else {
      sanitized.budget = { hospedagem: 0, alimentacao: 0, passeios: 0, compras: 0 };
      sanitized.budget_thresholds = { economico: 150, intermediario: 450 };
      sanitized.budget_analysis = "";
    }

    if (sharing.expenses) {
      sanitized.expenses = trip.expenses;
    } else {
      sanitized.expenses = [];
    }

    // Mascara e-mails dos membros no backend
    if (sharing.members) {
      sanitized.members = (trip.members || []).map(m => {
        if (typeof m === 'string' && m.includes('@')) {
          const [user, domain] = m.split('@');
          return user.length > 2 ? `${user.substring(0, 2)}**@${domain}` : `**@${domain}`;
        }
        return m;
      });
    } else {
      sanitized.members = ["Viajante"];
    }

    // Mala de viagem
    if (sharing.packing) {
      sanitized.packing = trip.packing;
    } else {
      sanitized.packing = [];
    }

    // Documentos anexos são sempre privados por design
    sanitized.documents = [];

    return res.status(200).json(sanitized);

  } catch (err) {
    console.error('[shared-trip] Exception:', err.message);
    return res.status(500).json({ error: 'Erro ao processar requisição da viagem.' });
  }
};
