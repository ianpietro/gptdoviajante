// config.js — Constants and configuration for GPT do Viajante

export const SUPABASE_URL = "https://mfcajxrvylkwijdpknbx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_Mm7c0n4BbiFgmzgq2j-W3A_zf8jQc8v";

export const DB_NAME = "CoPilotoOfflineDocsDB";
export const STORE_NAME = "documents";

export const MAX_OFFLINE_DOCUMENT_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_OFFLINE_DOCUMENT_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

export const BUDGET_THRESHOLDS = { economico: 150, intermediario: 450 };

export const DEFAULT_BUDGET = {
  hospedagem: 0,
  alimentacao: 0,
  passeios: 0,
  compras: 0
};

export const DEFAULT_TRIP_DATA = {
  tripTitle: "Minha Próxima Viagem",
  tripSubtitle: "Planeje sua viagem conversando pelo chat!",
  infoDates: "A definir",
  infoWeather: "A definir",
  infoGroup: "A definir",
  infoHotel: "A definir",
  hotelLink: "",
  targetDate: null,
  budget: { ...DEFAULT_BUDGET },
  packing: [],
  itinerary: [],
  flights: [],
  members: ["Você"],
  expenses: []
};

export const API_ENDPOINTS = {
  SEARCH_FLIGHTS: "/api/search-flights",
  CHAT: "/api/chat",
  VERIFY: "/api/verify",
  FLIGHT: "/api/flight"
};

export const AFFILIATE_CONFIG = {
  civitatisAid: "10433",
  getYourGuidePartnerId: "copilotodeviagem",
  // Template para o buscador de voos (Kiwi.com)
  flightsPartnerUrl: "https://www.kiwi.com/deep?from={origin}&to={destination}&departure={departureDate}&return={returnDate}&affilid=copilotodeviagem"
};

// Entitlement / Quotas
export const FREE_AI_LIMIT = 40;
export const PREMIUM_AI_FAIR_USE_LIMIT = 500;

// Versão central do aplicativo — usada em logs, analytics e service worker
export const APP_VERSION = '3.0.0-rc.28';
export const ORBIA_BUILD = '5452e77';

// Bypass de login ativado para acesso direto ao app sem autenticação
export const BYPASS_LOGIN = true;

// Feature Flags — Centralizadas para Beta Privado
export const FEATURES = {
  multiTrip: true,
  newHome: true,
  tripBrain: true,
  documentWallet: true,
  partnerEngine: true,
  premium: true,
  analytics: true,
  proactiveCopilot: true
};

export const FEATURE_FLAGS = {
  LIVE_WEATHER_ENABLED: true,
  LIVE_FLIGHT_ENABLED: true,
  COLLABORATION_ENABLED: false, // Desativado para Beta Privado até sync multi-user relacional
  PUBLIC_ITINERARIES_ENABLED: true,
  PROGRAMMATIC_SEO_ENABLED: true,
  REFERRAL_ENABLED: true,
  INSPIRATIONS_ENABLED: true,
  INSPIRATIONS_PUBLIC_ENABLED: true,
  INSPIRATIONS_INDEXING_ENABLED: true,
  BETA_MODE: true
};
