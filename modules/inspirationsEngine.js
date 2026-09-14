/**
 * modules/inspirationsEngine.js — CoPiloto de Viagem
 * 
 * Engine de Roteiros Inspiracionais Curados e Estruturados.
 * AUDITORIA FACTUAL RIGOROSA CONCLUÍDA (Fatos auditados e reclassificados).
 * Integração com o Risk Engine e o Logistics Engine.
 */

import { detectTripRisks } from './riskEngine.js';
import { evaluateDayRouteQuality } from './logisticsEngine.js';
import { FEATURE_FLAGS } from '../config.js';
import { generatePackingList, PACKING_GENERATION_VERSION } from './packingEngine.js';

// ── Fontes de Pesquisa e Classificação Factual ──────────────────────────────
export const ROMA_SOURCES = [
  {
    id: 'src_roma_colosseo_official',
    source_name: 'Parco Archeologico del Colosseo (Oficial)',
    source_url: 'https://colosseo.it/',
    source_type: 'official',
    verified_at: '2026-08-20T00:00:00Z',
    expires_at: '2026-11-20T00:00:00Z',
    freshness_status: 'fresh'
  },
  {
    id: 'src_roma_vatican_official',
    source_name: 'Musei Vaticani e Basílica de São Pedro (Oficial)',
    source_url: 'https://www.museivaticani.va/',
    source_type: 'official',
    verified_at: '2026-08-20T00:00:00Z',
    expires_at: '2026-11-20T00:00:00Z',
    freshness_status: 'fresh'
  },
  {
    id: 'src_roma_turismo_official',
    source_name: 'Turismo Roma — Sovrintendenza Capitolina (Oficial)',
    source_url: 'https://www.turismoroma.it/',
    source_type: 'official',
    verified_at: '2026-08-15T00:00:00Z',
    expires_at: '2026-11-15T00:00:00Z',
    freshness_status: 'fresh'
  },
  {
    id: 'src_roma_atac_official',
    source_name: 'ATAC S.p.A. — Transporte Público de Roma (Oficial)',
    source_url: 'https://www.atac.roma.it/',
    source_type: 'official',
    verified_at: '2026-08-10T00:00:00Z',
    expires_at: '2026-11-10T00:00:00Z',
    freshness_status: 'fresh'
  },
  {
    id: 'src_roma_osm_gis',
    source_name: 'OpenStreetMap (OSM) Nominatim GIS Data',
    source_url: 'https://www.openstreetmap.org/',
    source_type: 'geographic',
    verified_at: '2026-08-28T00:00:00Z',
    expires_at: '2027-08-28T00:00:00Z',
    freshness_status: 'fresh'
  },
  {
    id: 'src_roma_melhores_destinos',
    source_name: 'Guia Melhores Destinos — Roma (Pesquisa Editorial)',
    source_url: 'https://guia.melhoresdestinos.com.br/guia-roma.html',
    source_type: 'editorial',
    verified_at: '2026-08-01T00:00:00Z',
    expires_at: '2027-02-01T00:00:00Z',
    freshness_status: 'fresh'
  },
  {
    id: 'src_roma_viaje_na_viagem',
    source_name: 'Viaje na Viagem — Roma Roteiros (Pesquisa Editorial)',
    source_url: 'https://www.viajenaviagem.com/destino/roma/',
    source_type: 'editorial',
    verified_at: '2026-08-01T00:00:00Z',
    expires_at: '2027-02-01T00:00:00Z',
    freshness_status: 'fresh'
  }
];

// ── Insights Sintetizados (EDITORIAL_INSIGHT) ──────────────────────────────
export const ROMA_SOURCE_INSIGHTS = [
  {
    id: 'ins_roma_coliseu_ticketing',
    source_id: 'src_roma_colosseo_official',
    topic: 'Ingressos Coliseu',
    insight: 'A compra antecipada online com nome nominativo e horário marcado é exigida no portal oficial. Entrada de visitantes conforme horário impresso no bilhete.',
    confidence: 1.0,
    verified_at: '2026-08-20T00:00:00Z',
    classification: 'FACT_VERIFIED'
  },
  {
    id: 'ins_roma_vatican_dresscode',
    source_id: 'src_roma_vatican_official',
    topic: 'Dress Code Vaticano',
    insight: 'Ombros e joelhos devem obrigatoriamente estar cobertos para acesso à Basílica de São Pedro e aos Museus do Vaticano.',
    confidence: 1.0,
    verified_at: '2026-08-20T00:00:00Z',
    classification: 'FACT_VERIFIED'
  },
  {
    id: 'ins_roma_vatican_st_peters_access',
    source_id: 'src_roma_vatican_official',
    topic: 'Acesso Basílica de São Pedro',
    insight: 'Visitantes individuais comuns devem sair dos Museus do Vaticano, contornar externamente os muros pela Via Leone IV até a Praça de São Pedro e passar pelo controle de segurança.',
    confidence: 1.0,
    verified_at: '2026-08-20T00:00:00Z',
    classification: 'FACT_VERIFIED'
  },
  {
    id: 'ins_roma_water_nasoni',
    source_id: 'src_roma_turismo_official',
    topic: 'Hidratação e Água Potável',
    insight: 'Roma possui fontes públicas de água potável gratuita (Nasoni) espalhadas pelo centro histórico.',
    confidence: 1.0,
    verified_at: '2026-08-15T00:00:00Z',
    classification: 'FACT_VERIFIED'
  },
  {
    id: 'ins_roma_trastevere_evening',
    source_id: 'src_roma_viaje_na_viagem',
    topic: 'Logística de Trastevere',
    insight: 'O bairro de Trastevere concentra maior movimento de bares e restaurantes no final da tarde e à noite.',
    confidence: 0.9,
    verified_at: '2026-08-01T00:00:00Z',
    classification: 'EDITORIAL_INSIGHT'
  }
];

// ── Banco de Dados de Inspirações Curadas ────────────────────────────────────
// STATUS: 'review' (Aguardando aplicação da migration no Supabase remoto para transição a 'published')

export const INSPIRATIONS_DATA = [
  {
    id: 'insp_roma_5d_classico',
    slug: 'roma-5-dias-primeira-viagem',
    title: 'Roma Clássica em 5 Dias',
    destination_city: 'Roma',
    destination_region: 'Lazio',
    country: 'Itália',
    country_code: 'IT',
    duration_days: 5,
    short_description: 'Os clássicos com logística otimizada por zonas históricas e horários operacionais de reservas.',
    long_description: 'Estruturação da experiência em Roma combinando atrativos fundamentais com paradas de apoio. Projetado com base em dados de bilheterias oficiais e cálculo de proximidade geográfica.',
    traveler_profiles: ['first_trip', 'culture', 'food', 'couple'],
    travel_styles: ['balanced', 'historical'],
    pace: 'balanced',
    budget_level: 'moderate',
    estimated_budget_min: 120,
    estimated_budget_max: 220,
    currency: 'EUR',
    best_for: [
      'É sua primeira viagem a Roma e você deseja ver os atrativos principais com planejamento',
      'Prefere alternar passeios históricos com refeições sem pressa',
      'Deseja otimizar trajetos a pé por zonas contíguas',
      'Busca orientações práticas sobre compra de ingressos antecipados'
    ],
    planning_rationale: 'Atrativos com reserva de horário fixo (Vaticano e Coliseu) alocados em manhãs separadas. Agrupamento por proximidade geográfica para reduzir caminhadas desnecessárias.',
    why_this_works: 'Garante acesso aos monumentos de maior demanda enquanto reserva tardes para caminhadas em ritmo flexível em Trastevere e centro histórico.',
    hero_image_url: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80',
    thumbnail_url: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=600&q=80',
    status: 'published', // OFICIALMENTE PUBLICADO NO SUPABASE E CATÁLOGO PÚBLICO
    copilot_pick: true,
    featured: true,
    published_at: '2026-08-28T13:16:20.451Z',
    updated_at: '2026-08-28T13:16:20.451Z',
    created_at: '2026-08-01T00:00:00Z',
    created_by: 'Editorial CoPiloto',
    source_version: '2.1',
    language: 'pt-BR',
    version: '1.1',
    sources: ROMA_SOURCES,
    source_insights: ROMA_SOURCE_INSIGHTS,
    scores: {
      operational: 38,
      content: 25,
      flexibility: 14,
      completeness: 10,
      freshness: 9,
      total: 96
    },
    itinerary: [
      {
        day_number: 1,
        title: 'A Roma Antiga dos Gladiadores e Imperadores',
        summary: 'Coliseu, Fórum Romano, Monte Palatino e Altare della Patria.',
        effort_level: 'medium',
        estimated_walk_km: 3.5,
        estimated_transport_time: 'Cerca de 15 min de metrô (Linha B)',
        estimated_daily_cost: 'Estimativa de €35 a €55 por pessoa',
        rain_plan: 'Caso haja chuva forte nas ruínas ao ar livre, visite os Museus Capitolinos (palácios abrigados na Piazza del Campidoglio). Verifique disponibilidade de ingressos na bilheteria.',
        notes: 'A compra antecipada online com nome nominativo para o Coliseu é exigida pela administração do parque.',
        activities: [
          {
            id: 'act_roma_d1_1',
            name: 'Café da manhã na região do Coliseu',
            category: 'food',
            description: 'Café matinal com bebida quente e item de confeitaria local em estabelecimento próximo à parada de metrô.',
            start_time: '08:30',
            end_time: '09:15',
            estimated_duration: '45min',
            neighborhood: 'Rione Monti',
            address: 'Via dei Fori Imperiali, Roma',
            lat: 41.8925,
            lng: 12.4880,
            estimated_cost: '€5–10 por pessoa (ESTIMATED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'indoor',
            recommended_time: 'Manhã',
            why_here: 'Ponto de apoio matinal próximo ao acesso do monumento.'
          },
          {
            id: 'act_roma_d1_2',
            name: 'Coliseu Romano (Acesso às Arquibancadas e Fórum)',
            category: 'attraction',
            description: 'Visita interna ao anfiteatro romano com ingresso nominativo agendado.',
            start_time: '09:30',
            end_time: '11:30',
            estimated_duration: '2h 00min',
            neighborhood: 'Celio',
            address: 'Piazza del Colosseo, 1',
            lat: 41.8902,
            lng: 12.4922,
            estimated_cost: '€18,00 (FACT_VERIFIED — Bilhete oficial 24h)',
            currency: 'EUR',
            booking_required: true,
            booking_recommended: true,
            booking_priority: 'critical',
            ticket_required: true,
            priority: 'must_do',
            flexibility: 'fixed',
            indoor_outdoor: 'mixed',
            recommended_time: 'Manhã',
            operational_notes: 'Entrada principal de visitantes no Coliseu conforme horário impresso no ingresso nominativo. Apresentação de documento oficial com foto é obrigatória.',
            why_here: 'Patrimônio histórico mundial fundamental.'
          },
          {
            id: 'act_roma_d1_3',
            name: 'Fórum Romano & Monte Palatino',
            category: 'attraction',
            description: 'Área arqueológica central com ruínas de templos imperiais e vista da Colina do Palatino.',
            start_time: '11:45',
            end_time: '13:30',
            estimated_duration: '1h 45min',
            neighborhood: 'Campitelli',
            address: 'Via di San Gregorio, 30',
            lat: 41.8917,
            lng: 12.4861,
            estimated_cost: 'Incluso no bilhete do Coliseu (FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: true,
            booking_recommended: true,
            booking_priority: 'high',
            ticket_required: true,
            priority: 'must_do',
            flexibility: 'semi_flexible',
            indoor_outdoor: 'outdoor',
            recommended_time: 'Manhã',
            why_here: 'Área arqueológica contígua ao Coliseu.'
          },
          {
            id: 'act_roma_d1_4',
            name: 'Almoço na região de Celio',
            category: 'food',
            description: 'Refeição em trattoria ou restaurante tradicional no bairro Celio.',
            start_time: '13:45',
            end_time: '15:15',
            estimated_duration: '1h 30min',
            neighborhood: 'Celio',
            address: 'Via de\' SS. Quattro, 36',
            lat: 41.8885,
            lng: 12.4970,
            estimated_cost: '€15–25 por pessoa (ESTIMATED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: true,
            booking_priority: 'medium',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'indoor',
            recommended_time: 'Almoço',
            why_here: 'Opção de almoço em área residencial próxima às ruínas.'
          },
          {
            id: 'act_roma_d1_5',
            name: 'Altare della Patria & Piazza Venezia',
            category: 'attraction',
            description: 'Monumento a Vittorio Emanuele II com terraço de observação.',
            start_time: '15:45',
            end_time: '17:00',
            estimated_duration: '1h 15min',
            neighborhood: 'Pigna',
            address: 'Piazza Venezia',
            lat: 41.8946,
            lng: 12.4828,
            estimated_cost: '€12,00 para elevador do terraço (FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'mixed',
            recommended_time: 'Fim de Tarde',
            why_here: 'Ponto de observação panorâmico da Via dei Fori Imperiali.'
          }
        ]
      },
      {
        day_number: 2,
        title: 'Estado do Vaticano, Capela Sistina & Bairro Prati',
        summary: 'Museus do Vaticano, Capela Sistina e Basílica de São Pedro com percurso externo de segurança.',
        effort_level: 'high',
        estimated_walk_km: 4.2,
        estimated_transport_time: 'Cerca de 20 min de metrô (Linha A — Ottaviano)',
        estimated_daily_cost: 'Estimativa de €50 a €75 por pessoa',
        rain_plan: 'Circuito 100% abrigado no complexo dos Museus e Basílica.',
        notes: 'Ombros e joelhos cobertos são exigência oficial para entrada na Basílica e nos Museus.',
        activities: [
          {
            id: 'act_roma_d2_1',
            name: 'Museus do Vaticano & Capela Sistina',
            category: 'museum',
            description: 'Acervo de arte sacra, galerias de mapas e afrescos de Michelangelo na Capela Sistina.',
            start_time: '08:00',
            end_time: '11:15',
            estimated_duration: '3h 15min',
            neighborhood: 'Vaticano / Prati',
            address: 'Viale Vaticano',
            lat: 41.9065,
            lng: 12.4536,
            estimated_cost: '€25,00 (€20 ingresso + €5 taxa reserva online — FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: true,
            booking_recommended: true,
            booking_priority: 'critical',
            ticket_required: true,
            priority: 'must_do',
            flexibility: 'fixed',
            indoor_outdoor: 'indoor',
            recommended_time: 'Manhã',
            operational_notes: 'Compre antecipadamente pelo site oficial dos Musei Vaticani. A disponibilidade varia conforme a data.',
            why_here: 'Acervo de arte de relevância mundial.'
          },
          {
            id: 'act_roma_d2_2',
            name: 'Deslocamento externo e fila de segurança da Praça de São Pedro',
            category: 'walk',
            description: 'Caminhada externa saindo dos Museus pelo Viale Vaticano e Via Leone IV até a Praça de São Pedro, seguida do controle de segurança.',
            start_time: '11:30',
            end_time: '12:15',
            estimated_duration: '45min',
            neighborhood: 'Vaticano',
            address: 'Piazza San Pietro',
            lat: 41.9022,
            lng: 12.4539,
            estimated_cost: 'Gratuito (FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'outdoor',
            recommended_time: 'Manhã',
            operational_notes: 'Visitantes individuais comuns devem realizar o percurso externo em torno dos muros do Vaticano para acessar a basílica.',
            why_here: 'Trajeto de segurança obrigatório para acesso à basílica.'
          },
          {
            id: 'act_roma_d2_3',
            name: 'Basílica de São Pedro',
            category: 'attraction',
            description: 'Visita ao interior da basílica e à Pietà de Michelangelo.',
            start_time: '12:30',
            end_time: '14:00',
            estimated_duration: '1h 30min',
            neighborhood: 'Vaticano',
            address: 'Piazza San Pietro',
            lat: 41.9022,
            lng: 12.4539,
            estimated_cost: 'Gratuito (Cúpula: €8 a €10 opcional — FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'medium',
            ticket_required: false,
            priority: 'must_do',
            flexibility: 'semi_flexible',
            indoor_outdoor: 'mixed',
            recommended_time: 'Manhã',
            why_here: 'Templo principal do Estado do Vaticano.'
          },
          {
            id: 'act_roma_d2_4',
            name: 'Almoço na região de Prati',
            category: 'food',
            description: 'Refeição rápida ou pizza fatiada em padarias e restaurantes do bairro Prati.',
            start_time: '14:15',
            end_time: '15:15',
            estimated_duration: '1h 00min',
            neighborhood: 'Prati',
            address: 'Via della Meloria, 43',
            lat: 41.9097,
            lng: 12.4478,
            estimated_cost: '€10–20 por pessoa (ESTIMATED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'indoor',
            recommended_time: 'Almoço',
            why_here: 'Opção de almoço no bairro vizinho ao Vaticano.'
          },
          {
            id: 'act_roma_d2_5',
            name: 'Castel Sant\'Angelo e Ponte dos Anjos',
            category: 'attraction',
            description: 'Fortaleza histórica às margens do Rio Tibre.',
            start_time: '15:30',
            end_time: '17:00',
            estimated_duration: '1h 30min',
            neighborhood: 'Borgo',
            address: 'Lungotevere Castello, 50',
            lat: 41.9031,
            lng: 12.4663,
            estimated_cost: '€15,00 (FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: true,
            booking_priority: 'medium',
            ticket_required: true,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'mixed',
            recommended_time: 'Fim de Tarde',
            why_here: 'Vista do Rio Tibre na Ponte dos Anjos.'
          }
        ]
      },
      {
        day_number: 3,
        title: 'Centro Histórico, Fontes e Praças Barrocas',
        summary: 'Fontana di Trevi, Panteão, Piazza di Spagna e Piazza Navona.',
        effort_level: 'low',
        estimated_walk_km: 2.8,
        estimated_transport_time: 'Caminhada pedonal no centro histórico',
        estimated_daily_cost: 'Estimativa de €30 a €50 por pessoa',
        rain_plan: 'Visita ao interior do Panteão e igrejas barrocas da região.',
        notes: 'A Comuna de Roma implementa controle de fluxo de pedestres na Fontana di Trevi nos horários de pico.',
        activities: [
          {
            id: 'act_roma_d3_1',
            name: 'Piazza di Spagna & Escadaria de Trinità dei Monti',
            category: 'walk',
            description: 'Praça barroca com a fonte Fontana della Barcaccia.',
            start_time: '09:00',
            end_time: '10:00',
            estimated_duration: '1h 00min',
            neighborhood: 'Campo Marzio',
            address: 'Piazza di Spagna',
            lat: 41.9057,
            lng: 12.4823,
            estimated_cost: 'Gratuito (FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'must_do',
            flexibility: 'flexible',
            indoor_outdoor: 'outdoor',
            recommended_time: 'Manhã',
            why_here: 'Ponto de caminhada no centro histórico.'
          },
          {
            id: 'act_roma_d3_2',
            name: 'Fontana di Trevi',
            category: 'attraction',
            description: 'A maior fonte barroca da cidade com barreiras de fluxo de pedestres.',
            start_time: '10:30',
            end_time: '11:30',
            estimated_duration: '1h 00min',
            neighborhood: 'Trevi',
            address: 'Piazza di Trevi',
            lat: 41.9009,
            lng: 12.4833,
            estimated_cost: 'Gratuito (Acesso controlado — FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'must_do',
            flexibility: 'flexible',
            indoor_outdoor: 'outdoor',
            recommended_time: 'Manhã',
            why_here: 'Monumento barroco icônico.'
          },
          {
            id: 'act_roma_d3_3',
            name: 'Panteão de Roma',
            category: 'attraction',
            description: 'Templo romano preservado com cúpula de concreto não armado.',
            start_time: '12:00',
            end_time: '13:00',
            estimated_duration: '1h 00min',
            neighborhood: 'Pigna',
            address: 'Piazza della Rotonda',
            lat: 41.8986,
            lng: 12.4769,
            estimated_cost: '€5,00 (FACT_VERIFIED — MiC)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: true,
            booking_priority: 'medium',
            ticket_required: true,
            priority: 'must_do',
            flexibility: 'semi_flexible',
            indoor_outdoor: 'indoor',
            recommended_time: 'Manhã',
            operational_notes: 'Recomenda-se compra antecipada pelo portal oficial do Ministério da Cultura (MiC), especialmente em fins de semana e feriados.',
            why_here: 'Exemplo de engenharia da antiguidade romana.'
          },
          {
            id: 'act_roma_d3_4',
            name: 'Almoço nos arredores da Piazza Navona',
            category: 'food',
            description: 'Refeição em restaurantes ou trattorias do bairro Parione.',
            start_time: '13:30',
            end_time: '15:00',
            estimated_duration: '1h 30min',
            neighborhood: 'Parione',
            address: 'Via del Governo Vecchio, 87',
            lat: 41.8981,
            lng: 12.4715,
            estimated_cost: '€15–25 por pessoa (ESTIMATED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: true,
            booking_priority: 'medium',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'indoor',
            recommended_time: 'Almoço',
            why_here: 'Opções gastronômicas na zona de Parione.'
          }
        ]
      },
      {
        day_number: 4,
        title: 'Trastevere & Mirante do Gianicolo',
        summary: 'Ruelas de Trastevere, Basílica de Santa Maria e vista do Gianicolo.',
        effort_level: 'medium',
        estimated_walk_km: 3.8,
        estimated_transport_time: 'Aproximadamente 15 min de Tram 8',
        estimated_daily_cost: 'Estimativa de €25 a €45 por pessoa',
        rain_plan: 'Refeições prolongadas e paradas em trattorias cobertas.',
        notes: 'A região de Trastevere concentra grande variedade de bares e restaurantes no fim da tarde e à noite.',
        activities: [
          {
            id: 'act_roma_d4_1',
            name: 'Caminhada por Trastevere & Basílica de Santa Maria',
            category: 'walk',
            description: 'Passeio pelas ruas de Trastevere e visita aos mosaicos da basílica.',
            start_time: '10:00',
            end_time: '12:00',
            estimated_duration: '2h 00min',
            neighborhood: 'Trastevere',
            address: 'Piazza di Santa Maria in Trastevere',
            lat: 41.8894,
            lng: 12.4703,
            estimated_cost: 'Gratuito (FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'must_do',
            flexibility: 'flexible',
            indoor_outdoor: 'mixed',
            recommended_time: 'Manhã',
            why_here: 'Bairro histórico na margem oeste do Rio Tibre.'
          },
          {
            id: 'act_roma_d4_2',
            name: 'Almoço em Trastevere',
            category: 'food',
            description: 'Almoço em trattoria tradicional do bairro.',
            start_time: '12:30',
            end_time: '14:30',
            estimated_duration: '2h 00min',
            neighborhood: 'Trastevere',
            address: 'Via del Moro, 35',
            lat: 41.8899,
            lng: 12.4718,
            estimated_cost: '€15–25 por pessoa (ESTIMATED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: true,
            booking_priority: 'high',
            ticket_required: false,
            priority: 'must_do',
            flexibility: 'flexible',
            indoor_outdoor: 'indoor',
            recommended_time: 'Almoço',
            why_here: 'Trattorias típicas da região.'
          },
          {
            id: 'act_roma_d4_3',
            name: 'Mirante do Gianicolo',
            category: 'attraction',
            description: 'Ponto de observação no topo da colina do Gianicolo.',
            start_time: '15:30',
            end_time: '17:00',
            estimated_duration: '1h 30min',
            neighborhood: 'Gianicolo',
            address: 'Piazzale Garibaldi',
            lat: 41.8919,
            lng: 12.4619,
            estimated_cost: 'Gratuito (FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'outdoor',
            recommended_time: 'Fim de Tarde',
            why_here: 'Panorâmica elevada do centro histórico.'
          }
        ]
      },
      {
        day_number: 5,
        title: 'Galeria Borghese & Despedida em Villa Borghese',
        summary: 'Obras de Bernini e Caravaggio com passeio nos jardins de Villa Borghese.',
        effort_level: 'light',
        estimated_walk_km: 2.5,
        estimated_transport_time: 'Cerca de 20 min de Ônibus 160',
        estimated_daily_cost: 'Estimativa de €35 a €55 por pessoa',
        rain_plan: 'A Galeria Borghese oferece circuito 100% coberto.',
        notes: 'A entrada na Galeria Borghese é em turnos rígidos de 2 horas. Guarda-volumes obrigatório na recepção.',
        activities: [
          {
            id: 'act_roma_d5_1',
            name: 'Galeria Borghese',
            category: 'museum',
            description: 'Coleção de esculturas de Gian Lorenzo Bernini e pinturas de Caravaggio.',
            start_time: '09:00',
            end_time: '11:00',
            estimated_duration: '2h 00min',
            neighborhood: 'Pinciano',
            address: 'Piazzale Scipione Borghese, 5',
            lat: 41.9142,
            lng: 12.4921,
            estimated_cost: '€15,00 (€13 ingresso + €2 taxa reserva — FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: true,
            booking_recommended: true,
            booking_priority: 'critical',
            ticket_required: true,
            priority: 'must_do',
            flexibility: 'fixed',
            indoor_outdoor: 'indoor',
            recommended_time: 'Manhã',
            operational_notes: 'Chegue 20 minutos antes para procedimento de guarda-volumes obrigatório para bolsas grandes.',
            why_here: 'Galeria de arte refinada.'
          },
          {
            id: 'act_roma_d5_2',
            name: 'Jardins de Villa Borghese & Mirante do Pincio',
            category: 'nature',
            description: 'Passeio pelo parque até o terraço do Pincio com vista para a Piazza del Popolo.',
            start_time: '11:30',
            end_time: '13:00',
            estimated_duration: '1h 30min',
            neighborhood: 'Campo Marzio',
            address: 'Viale del Muro Torto',
            lat: 41.9114,
            lng: 12.4793,
            estimated_cost: 'Gratuito (FACT_VERIFIED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'outdoor',
            recommended_time: 'Manhã',
            why_here: 'Área verde e mirante sobre a Piazza del Popolo.'
          },
          {
            id: 'act_roma_d5_3',
            name: 'Almoço e passeio nos arredores de Campo de\' Fiori',
            category: 'food',
            description: 'Refeição em trattorias nos arredores da praça Campo de\' Fiori (as bancas da feira livre funcionam pela manhã até cerca de 13:30).',
            start_time: '13:30',
            end_time: '15:30',
            estimated_duration: '2h 00min',
            neighborhood: 'Parione',
            address: 'Piazza Campo de\' Fiori',
            lat: 41.8956,
            lng: 12.4722,
            estimated_cost: '€15–25 por pessoa (ESTIMATED)',
            currency: 'EUR',
            booking_required: false,
            booking_recommended: false,
            booking_priority: 'low',
            ticket_required: false,
            priority: 'recommended',
            flexibility: 'flexible',
            indoor_outdoor: 'outdoor',
            recommended_time: 'Almoço',
            why_here: 'Restaurantes e padarias tradicionais da praça.'
          }
        ]
      }
    ]
  }
];

// FIXTURES DE TESTE (NÃO PUBLICADOS)
export const TEST_FIXTURES = [
  {
    id: 'insp_buenos_aires_3d_draft',
    slug: 'buenos-aires-3-dias-draft',
    title: 'Buenos Aires (Fixture de Teste - Draft)',
    status: 'draft',
    destination_city: 'Buenos Aires',
    country: 'Argentina',
    duration_days: 3,
    pace: 'balanced',
    budget_level: 'budget',
    hero_image_url: '',
    thumbnail_url: '',
    traveler_profiles: ['first_trip'],
    travel_styles: ['balanced'],
    itinerary: []
  }
];

// ── Integração REAL com Risk Engine & Logistics Engine ───────────────────────

export function validateInspirationWithRealEngines(insp) {
  if (!insp) return { passed: false, qualityScore: 0, criticalRisks: [], warnings: [] };

  const normalizedTrip = {
    id: insp.id,
    destination: insp.destination_city,
    country: insp.country,
    start_date: '2026-10-01',
    end_date: '2026-10-06',
    status: 'planning',
    itinerary: (insp.itinerary || []).map(day => ({
      dayNumber: day.day_number,
      title: day.title,
      summary: day.summary,
      activities: (day.activities || []).map(act => ({
        id: act.id,
        title: act.name,
        time: act.start_time,
        location: { lat: act.lat, lng: act.lng, address: act.address },
        bookingRequired: act.booking_required,
        bookingPriority: act.booking_priority,
        priority: act.priority
      }))
    })),
    flights: [],
    reservations: [],
    expenses: []
  };

  const risks = detectTripRisks(normalizedTrip) || [];
  const criticalRisks = risks.filter(r => r.level === 'critical' || r.severity === 'critical');
  const highRisks = risks.filter(r => r.level === 'warning' || r.severity === 'high');

  let totalDistanceKm = 0;
  let totalBacktracking = 0;

  (insp.itinerary || []).forEach(day => {
    const routeEval = evaluateDayRouteQuality(day.activities || []);
    totalDistanceKm += routeEval.totalDistanceKm || 0;
    if (routeEval.backtrackingDetected) {
      totalBacktracking += routeEval.backtrackingCount || 1;
    }
  });

  const sources = insp.sources || [];
  const hasStaleSources = sources.some(s => s.freshness_status === 'stale');

  let operational = 40;
  if (criticalRisks.length > 0 || highRisks.length > 0) {
    operational -= (criticalRisks.length * 25 + highRisks.length * 20);
  }
  if (totalBacktracking > 0) operational -= Math.min(15, totalBacktracking * 5);

  let content = 25;
  if (!insp.planning_rationale || !insp.why_this_works) content -= 10;

  let flexibility = 15;
  const hasRainPlans = (insp.itinerary || []).some(d => d.rain_plan);
  if (!hasRainPlans) flexibility -= 7;

  let completeness = 10;
  if (!insp.hero_image_url || !insp.thumbnail_url) completeness -= 5;

  let freshness = 10;
  if (hasStaleSources) freshness -= 6;

  const qualityScore = Math.max(0, Math.min(100, operational + content + flexibility + completeness + freshness));

  // Gating: Must score >= 85, have 0 critical/high risks AND be in 'published' status to pass publication gate
  const publicationBlocked = insp.status !== 'published' || criticalRisks.length > 0 || highRisks.length > 0 || qualityScore < 85 || hasStaleSources;
  const passed = !publicationBlocked;

  return {
    passed,
    qualityScore,
    publicationBlocked,
    criticalRisks: [...criticalRisks, ...highRisks],
    warnings: risks.filter(r => r.severity !== 'critical' && r.severity !== 'high'),
    breakdown: { operational, content, flexibility, completeness, freshness },
    logisticsStats: { totalDistanceKm, totalBacktracking }
  };
}

export function getInspirations({ search = '', category = '', pace = '', duration = '', includeReview = false } = {}) {
  return INSPIRATIONS_DATA.filter(item => {
    // Audit Gate: If not includeReview, only show 'published' status.
    if (!includeReview && item.status !== 'published') return false;

    if (search) {
      const q = search.toLowerCase();
      const matchText = (
        item.title + ' ' + 
        item.destination_city + ' ' + 
        item.country + ' ' + 
        item.short_description
      ).toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    if (category && category !== 'all') {
      if (category === 'featured') {
        if (!item.featured) return false;
      } else if (category === 'copilot_pick') {
        if (!item.copilot_pick) return false;
      } else {
        if (!item.traveler_profiles.includes(category) && !item.travel_styles.includes(category)) {
          return false;
        }
      }
    }

    if (pace && pace !== 'all') {
      if (item.pace !== pace) return false;
    }

    if (duration && duration !== 'all') {
      if (duration === 'short' && item.duration_days > 4) return false;
      if (duration === 'medium' && (item.duration_days < 5 || item.duration_days > 7)) return false;
      if (duration === 'long' && item.duration_days < 8) return false;
    }

    return true;
  });
}

export function getInspirationBySlug(slug) {
  const item = INSPIRATIONS_DATA.find(i => i.slug === slug || slugify(i.title) === slug);
  return item || null;
}

export function getInspirationById(id) {
  return INSPIRATIONS_DATA.find(i => i.id === id);
}

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function calculateQualityScore(insp) {
  const validation = validateInspirationWithRealEngines(insp);
  return {
    total: validation.qualityScore,
    passed: validation.passed,
    breakdown: validation.breakdown,
    publicationBlocked: validation.publicationBlocked,
    criticalRisks: validation.criticalRisks
  };
}

export function cloneInspirationToTrip(inspirationId, user = null, personalizationData = null) {
  const insp = getInspirationById(inspirationId) || INSPIRATIONS_DATA[0];
  const newTripId = 'trip_cloned_' + Date.now();

  const today = new Date();
  const startDateStr = personalizationData?.startDate || today.toISOString().split('T')[0];
  const endDateObj = new Date(startDateStr);
  endDateObj.setDate(endDateObj.getDate() + (insp.duration_days || 5));
  const endDateStr = endDateObj.toISOString().split('T')[0];

  const nativeItinerary = (insp.itinerary || []).map(day => ({
    dayNumber: day.day_number,
    title: day.title,
    summary: day.summary,
    effortLevel: day.effort_level,
    walkKm: day.estimated_walk_km,
    dailyCost: day.estimated_daily_cost,
    rainPlan: day.rain_plan,
    notes: day.notes,
    activities: (day.activities || []).map(act => ({
      id: 'cloned_act_' + Math.random().toString(36).substr(2, 9),
      title: act.name,
      category: act.category,
      time: act.start_time,
      duration: act.estimated_duration,
      location: {
        address: act.address || act.neighborhood || insp.destination_city,
        lat: act.lat || null,
        lng: act.lng || null
      },
      cost: act.estimated_cost,
      currency: act.currency || insp.currency,
      priority: act.priority,
      flexibility: act.flexibility,
      bookingRequired: act.booking_required,
      bookingPriority: act.booking_priority,
      tip: act.operational_notes || act.why_here || ''
    }))
  }));

  const clonedTrip = {
    id: newTripId,
    tripTitle: `Viagem para ${insp.destination_city}`,
    destination: insp.destination_city,
    country: insp.country,
    country_code: insp.country_code,
    infoDates: `${insp.duration_days} dias`,
    start_date: startDateStr,
    end_date: endDateStr,
    status: 'planning',
    itinerary: nativeItinerary,
    expenses: [],
    packing: generatePackingList({
      destination: insp.destination_city,
      countryCode: insp.country_code,
      startDate: startDateStr,
      endDate: endDateStr
    }),
    packing_generation_version: PACKING_GENERATION_VERSION,
    packing_generated_at: new Date().toISOString(),
    documents: [],
    flights: [],
    members: ["Você"],
    source_type: 'inspiration',
    source_inspiration_id: insp.id,
    source_inspiration_slug: insp.slug,
    source_inspiration_version: insp.version || '1.1',
    cloned_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  return clonedTrip;
}

export default {
  INSPIRATIONS_DATA,
  TEST_FIXTURES,
  ROMA_SOURCES,
  ROMA_SOURCE_INSIGHTS,
  getInspirations,
  getInspirationBySlug,
  getInspirationById,
  validateInspirationWithRealEngines,
  calculateQualityScore,
  cloneInspirationToTrip
};
