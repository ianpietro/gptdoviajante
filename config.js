// config.js — Constants and configuration for GPT do Viajante

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
