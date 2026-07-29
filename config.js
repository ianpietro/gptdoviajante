// config.js — Constants and configuration for GPT do Viajante

export const SUPABASE_URL = "https://mfcajxrvylkwijdpknbx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_Mm7c0n4BbiFgmzgq2j-W3A_zf8jQc8v";

export const DB_NAME = "CoPilotoDocsDB";
export const STORE_NAME = "documents";

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

