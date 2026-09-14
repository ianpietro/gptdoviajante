// api/inspiracoes.js — Serverless Handler for Inspirations SEO & Public View Pages
const { 
  INSPIRATIONS_DATA, 
  getInspirations, 
  getInspirationBySlug,
  validateInspirationWithRealEngines 
} = require('../modules/inspirationsEngine.js');
const { FEATURE_FLAGS } = require('../config.js');

module.exports = async function handler(req, res) {
  const slugQuery = req.query.slug || req.query.destination || '';
  
  if (slugQuery) {
    // Render Single Inspiration Detailed View
    const insp = getInspirationBySlug(slugQuery.toLowerCase()) || INSPIRATIONS_DATA[0];
    const html = renderSingleInspirationHtml(insp);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (typeof res.send === 'function') return res.status(200).send(html);
    res.statusCode = 200;
    return res.end(html);
  }

  // Render Inspirations Library Listing View
  const search = req.query.search || '';
  const category = req.query.category || '';
  const list = getInspirations({ search, category });
  const html = renderInspirationsListHtml(list, { search, category });
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (typeof res.send === 'function') return res.status(200).send(html);
  res.statusCode = 200;
  return res.end(html);
};

function renderSingleInspirationHtml(insp) {
  const validation = validateInspirationWithRealEngines(insp);
  const isIndexable = (
    insp.status === 'published' &&
    validation.qualityScore >= 85 &&
    !validation.publicationBlocked &&
    FEATURE_FLAGS?.INSPIRATIONS_INDEXING_ENABLED !== false
  );

  const robotsTag = isIndexable ? 'index, follow' : 'noindex, nofollow';

  const cloneCtaUrl = `/app.html?action=clone_inspiration&id=${encodeURIComponent(insp.id)}`;

  const schemaJsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    "name": insp.title,
    "description": insp.short_description,
    "touristType": insp.traveler_profiles,
    "offers": {
      "@type": "Offer",
      "price": insp.estimated_budget_min,
      "priceCurrency": insp.currency
    },
    "itinerary": (insp.itinerary || []).map(day => ({
      "@type": "ItemList",
      "name": `Dia ${day.day_number}: ${day.title}`,
      "description": day.summary,
      "itemListElement": (day.activities || []).map((act, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "item": {
          "@type": "TouristAttraction",
          "name": act.name,
          "description": act.description
        }
      }))
    }))
  };

  const paceLabelMap = { light: 'Leve', balanced: 'Equilibrado', intense: 'Intenso' };
  const paceLabel = paceLabelMap[insp.pace] || 'Equilibrado';

  const budgetLabelMap = { budget: '€ (Econômico)', moderate: '€€ (Moderado)', luxury: '€€€ (Luxo)' };
  const budgetLabel = budgetLabelMap[insp.budget_level] || '€€ (Moderado)';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${insp.title} — Orbia Travel Inspirações</title>
  <meta name="description" content="${insp.short_description}">
  <meta name="robots" content="${robotsTag}">
  <link rel="canonical" href="https://copilotodeviagem.com.br/inspiracoes/${insp.slug}">
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Sora:wght@600;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  
  <script type="application/ld+json">${JSON.stringify(schemaJsonLd)}</script>

  <style>
    :root {
      --bg: #F7F5F0;
      --surface: #FFFFFF;
      --text-main: #111827;
      --text-secondary: #334155;
      --text-muted: #475569;
      --primary: #c85a32;
      --accent: #10b981;
      --border: rgba(17, 24, 39, 0.08);
    }
    * { box-sizing: border-box; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg); color: var(--text-main); margin: 0; padding: 0; }
    .topbar { position: sticky; top: 0; background: rgba(255,255,255,0.95); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; z-index: 100; }
    .brand-link { text-decoration: none; color: var(--text-main); font-weight: 800; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; }
    .btn-cta { background: var(--accent); color: #fff; text-decoration: none; padding: 10px 22px; border-radius: 50px; font-weight: 700; font-size: 0.9rem; }
    .container { max-width: 1000px; margin: 0 auto; padding: 32px 20px 60px; }
    .hero-banner { background: #111827; color: #F8FAFC; border-radius: 24px; padding: 36px 28px; margin-bottom: 32px; position: relative; overflow: hidden; }
    .hero-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(200, 90, 50, 0.2); color: #FDBA74; border: 1px solid rgba(200, 90, 50, 0.4); border-radius: 50px; padding: 4px 12px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; }
    .hero-title { font-size: 2.1rem; font-weight: 800; margin: 0 0 10px; color: #FFFFFF; letter-spacing: -0.02em; }
    .hero-subtitle { font-size: 1.05rem; color: #CBD5E1; margin: 0 0 24px; max-width: 720px; }
    .meta-pills { display: flex; gap: 10px; flex-wrap: wrap; }
    .meta-pill { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); padding: 8px 14px; border-radius: 12px; font-size: 0.82rem; color: #E2E8F0; font-weight: 600; }
    .for-who-card { background: #FFFFFF; border: 1px solid var(--border); border-radius: 20px; padding: 24px; margin-bottom: 32px; box-shadow: 0 4px 14px rgba(0,0,0,0.03); }
    .for-who-title { font-size: 1.15rem; font-weight: 800; margin: 0 0 14px; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
    .for-who-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; }
    .for-who-item { font-size: 0.88rem; color: var(--text-secondary); display: flex; align-items: center; gap: 10px; }
    .for-who-item i { color: var(--accent); font-size: 1rem; }
    .day-card { background: #FFFFFF; border: 1px solid var(--border); border-radius: 20px; padding: 24px; margin-bottom: 24px; }
    .day-header { border-bottom: 1px solid var(--border); padding-bottom: 14px; margin-bottom: 18px; }
    .day-num { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; background: rgba(200,90,50,0.1); color: var(--primary); padding: 3px 8px; border-radius: 6px; }
    .day-title { font-size: 1.2rem; font-weight: 800; margin: 6px 0 2px; }
    .day-summary { font-size: 0.85rem; color: var(--text-muted); }
    .activity-row { background: #FCFBF8; border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 12px; display: grid; grid-template-columns: 70px 1fr; gap: 14px; }
    .activity-time { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; font-weight: 700; color: var(--primary); background: rgba(200,90,50,0.08); padding: 4px; border-radius: 6px; text-align: center; height: fit-content; }
    .act-title { font-size: 1rem; font-weight: 800; margin: 0 0 6px; }
    .act-desc { font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 8px; }
    .act-badge { font-size: 0.68rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-right: 6px; text-transform: uppercase; }
    .badge-must { background: #fee2e2; color: #991b1b; }
    .badge-fixed { background: #e0f2fe; color: #075985; }
    .badge-booking { background: #fef3c7; color: #92400e; }
    .bottom-cta { text-align: center; background: #FFFFFF; border: 2px solid var(--accent); border-radius: 24px; padding: 36px 20px; margin-top: 40px; }
  </style>
</head>
<body>
  <header class="topbar">
    <a href="/inspiracoes" class="brand-link">
      <i class="fa-solid fa-compass" style="color: var(--primary);"></i> CoPiloto Inspirações
    </a>
    <a href="${cloneCtaUrl}" class="btn-cta">
      ✨ Personalizar este Roteiro
    </a>
  </header>

  <main class="container">
    <section class="hero-banner">
      ${insp.copilot_pick ? `<div class="hero-badge"><i class="fa-solid fa-star"></i> Escolha do CoPiloto</div>` : ''}
      <h1 class="hero-title">${insp.title}</h1>
      <p class="hero-subtitle">${insp.short_description}</p>
      
      <div class="meta-pills">
        <div class="meta-pill"><i class="fa-regular fa-calendar"></i> ${insp.duration_days} Dias de Viagem</div>
        <div class="meta-pill"><i class="fa-solid fa-gauge-high"></i> Ritmo ${paceLabel}</div>
        <div class="meta-pill"><i class="fa-solid fa-wallet"></i> ${budgetLabel}</div>
        <div class="meta-pill"><i class="fa-solid fa-location-dot"></i> ${insp.destination_city}, ${insp.country}</div>
      </div>
    </section>

    <!-- Para Quem É -->
    <section class="for-who-card">
      <h2 class="for-who-title"><i class="fa-solid fa-user-check" style="color: var(--primary);"></i> Este roteiro funciona bem para você se:</h2>
      <ul class="for-who-list">
        ${(insp.best_for || []).map(item => `
          <li class="for-who-item"><i class="fa-solid fa-circle-check"></i> <span>${item}</span></li>
        `).join('')}
      </ul>
    </section>

    <!-- Itinerário Dia a Dia -->
    <section class="itinerary-wrapper">
      ${(insp.itinerary || []).map(day => `
        <article class="day-card">
          <header class="day-header">
            <span class="day-num">DIA ${day.day_number}</span>
            <h3 class="day-title">${day.title}</h3>
            <span class="day-summary">${day.summary}</span>
          </header>
          
          <div class="activities-list">
            ${(day.activities || []).map(act => `
              <div class="activity-row">
                <div class="activity-time">${act.start_time || '09:00'}</div>
                <div>
                  <h4 class="act-title">${act.name}</h4>
                  <p class="act-desc">${act.description}</p>
                  <div>
                    ${act.priority === 'must_do' ? `<span class="act-badge badge-must">Essencial</span>` : ''}
                    ${act.flexibility === 'fixed' ? `<span class="act-badge badge-fixed">Horário Fixo</span>` : ''}
                    ${act.booking_required ? `<span class="act-badge badge-booking">Reserva Importante</span>` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </article>
      `).join('')}
    </section>

    <!-- CTA Final -->
    <section class="bottom-cta">
      <h2 style="font-size: 1.6rem; margin: 0 0 10px;">Transforme este Roteiro na Sua Viagem Privada</h2>
      <p style="color: var(--text-muted); margin-bottom: 24px;">Abra no CoPiloto de Viagem para ajustar os horários, adicionar suas reservas e levar no celular.</p>
      <a href="${cloneCtaUrl}" class="btn-cta" style="padding: 14px 32px; font-size: 1.05rem;">
        ✨ Personalizar Tudo no CoPiloto
      </a>
    </section>
  </main>
</body>
</html>`;
}

function renderInspirationsListHtml(list, { search, category }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inspirações para sua próxima viagem | CoPiloto de Viagem</title>
  <meta name="description" content="Explore roteiros prontos e personalize tudo para o seu jeito de viajar.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  
  <style>
    :root { --bg: #F7F5F0; --surface: #FFFFFF; --text-main: #111827; --primary: #c85a32; --accent: #10b981; --border: rgba(17,24,39,0.08); }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg); color: var(--text-main); margin: 0; padding: 0; }
    .topbar { background: #FFFFFF; border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 20px; }
    .header-title { font-size: 2.2rem; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.02em; }
    .header-subtitle { font-size: 1.05rem; color: #475569; margin: 0 0 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }
    .card { background: #FFFFFF; border: 1px solid var(--border); border-radius: 20px; overflow: hidden; display: flex; flex-direction: column; }
    .card-img { height: 180px; width: 100%; object-fit: cover; }
    .card-body { padding: 20px; flex: 1; display: flex; flex-direction: column; }
    .card-title { font-size: 1.2rem; font-weight: 800; margin: 0 0 6px; }
    .card-desc { font-size: 0.85rem; color: #475569; margin: 0 0 16px; flex: 1; }
    .card-meta { font-size: 0.78rem; color: var(--primary); font-weight: 700; margin-bottom: 16px; }
    .card-actions { display: flex; gap: 10px; }
    .btn { flex: 1; padding: 10px; border-radius: 50px; text-align: center; text-decoration: none; font-weight: 700; font-size: 0.85rem; }
    .btn-sec { background: var(--bg); color: var(--text-main); border: 1px solid var(--border); }
    .btn-pri { background: var(--accent); color: #fff; }
  </style>
</head>
<body>
  <header class="topbar">
    <a href="/" style="text-decoration:none; color:inherit; font-weight:800; font-size:1.1rem; display:flex; align-items:center; gap:8px;">
      <i class="fa-solid fa-compass" style="color:var(--primary);"></i> CoPiloto de Viagem
    </a>
  </header>

  <main class="container">
    <h1 class="header-title">Inspirações para sua próxima viagem</h1>
    <p class="header-subtitle">Explore roteiros prontos e personalize tudo para o seu jeito de viajar.</p>

    <div class="grid">
      ${list.map(item => `
        <article class="card">
          <img src="${item.hero_image_url}" alt="${item.title}" class="card-img">
          <div class="card-body">
            <h2 class="card-title">${item.title}</h2>
            <p class="card-desc">${item.short_description}</p>
            <div class="card-meta">
              <i class="fa-regular fa-calendar"></i> ${item.duration_days} dias · ${item.pace === 'light' ? 'Leve' : item.pace === 'intense' ? 'Intenso' : 'Equilibrado'}
            </div>
            <div class="card-actions">
              <a href="/inspiracoes/${item.slug}" class="btn btn-sec">Ver Roteiro</a>
              <a href="/app.html?action=clone_inspiration&id=${encodeURIComponent(item.id)}" class="btn btn-pri">Personalizar</a>
            </div>
          </div>
        </article>
      `).join('')}
    </div>
  </main>
</body>
</html>`;
}
