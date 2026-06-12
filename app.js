/* ==========================================================================
   COPILOTO DE VIAGEM - FRONTEND CONTROLLER (JavaScript)
   ========================================================================= */

import { 
  setupAuthStateListener, 
  checkCurrentUser,
  loginWithGoogle, 
  loginWithEmail, 
  registerWithEmail, 
  logout, 
  getFreshToken,
  isFirebaseConfigured,
  supabase
} from './auth.js';

// App State
let chatHistory = [];
let travelChatHistory = [];
let tripData = {
  tripTitle: "Minha Próxima Viagem",
  tripSubtitle: "Planeje sua viagem conversando pelo chat!",
  infoDates: "A definir",
  infoWeather: "A definir",
  infoGroup: "A definir",
  infoHotel: "A definir",
  hotelLink: "",
  targetDate: null,
  budget: {
    hospedagem: 0,
    alimentacao: 0,
    passeios: 0,
    compras: 0
  },
  budgetAnalysis: "",
  budgetThresholds: { economico: 150, intermediario: 450 },
  packing: [],
  itinerary: [],
  flights: [],
  members: ["Você"],
  expenses: []
};

let countdownInterval = null;
let activeFilter = 'all';
let firebaseIdToken = null;
let currentUser = null;
let authVerificationFailed = false;
let planAttachment = null;
let travelAttachment = null;

let isSharedView = false;
let itineraryViewMode = 'list';
let realtimeChannel = null;

const DB_NAME = "CoPilotoDocsDB";
const STORE_NAME = "documents";

function openDocsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

// Deprecated IndexedDB helpers in favor of Supabase Storage and PostgreSQL syncing
async function saveDocumentFile(docId, base64Data) { return; }
async function getDocumentFile(docId) { return null; }
async function deleteDocumentFile(docId) { return; }

function getDestinationSuffix() {
  if (!tripData.tripTitle) return "";
  let title = tripData.tripTitle;
  
  // Cut at colon or hyphens
  const separators = [":", " - ", " – "];
  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx !== -1) {
      title = title.substring(0, idx).trim();
    }
  }

  // Remove common prefixes
  let dest = title.replace(/viagem\s+para\s+/i, "").replace(/viagem\s+a\s+/i, "").trim();
  
  // If the destination title is too long or contains a comma (e.g. "Something, City, Country")
  if (dest.includes(",")) {
    const parts = dest.split(",").map(p => p.trim());
    const country = parts[parts.length - 1];
    let city = parts[parts.length - 2] || parts[0];
    
    // If the city part has a slash like "Chiado/Bairro Alto", grab the last part
    if (city.includes("/")) {
      city = city.split("/").pop().trim();
    }
    
    // If city is still long, keep last 2 words
    const cityWords = city.split(/\s+/);
    if (cityWords.length > 2) {
      city = cityWords.slice(-2).join(" ");
    }
    
    return `${city}, ${country}`;
  }
  
  return dest;
}

function sanitizeActivityLocation(title, destination) {
  if (!title || !destination) return title;
  if (!title.includes(",")) return title;

  // Normalize destination (lowercase, remove accents)
  const normDest = destination.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Extract words of the destination (longer than 2 chars)
  const destWords = normDest.split(/[^a-z0-9]/).filter(w => w.length > 2);

  // Split the title by comma
  const parts = title.split(",");
  const baseName = parts[0].trim();
  
  let hasMismatch = false;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    // Match pattern for "City - State acronym" (e.g. "Americana - SP")
    const match = part.match(/(.*)-\s*(SP|RJ|MG|RS|SC|PR|DF|BA|PE|CE|GO|MT|MS|AM|PA|AL|AP|ES|MA|PB|PI|RN|RO|RR|SE|TO)\b/i);
    
    if (match) {
      const city = match[1].trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      // If we extracted a city name, check if it mismatches the destination
      if (city.length > 2) {
        const cityWords = city.split(/[^a-z0-9]/).filter(w => w.length > 2);
        const matchesDest = cityWords.some(cw => destWords.some(dw => dw.includes(cw) || cw.includes(dw))) 
                         || destWords.some(dw => city.includes(dw));
        
        if (!matchesDest) {
          hasMismatch = true;
          break;
        }
      }
    }
  }

  // Backup check: if there is no explicit "City - State" pattern, check if mismatch cities are in the title/address
  if (!hasMismatch) {
    const addressPart = parts.slice(1).join(",").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const commonMismatchCities = ["americana", "niteroi", "campinas"];
    for (const city of commonMismatchCities) {
      if (addressPart.includes(city) && !normDest.includes(city)) {
        hasMismatch = true;
        break;
      }
    }
  }

  if (hasMismatch) {
    console.warn(`[Location Sanitizer] Mismatch detected: "${title}" for destination "${destination}". Sanitized to "${baseName}"`);
    return baseName;
  }

  return title;
}

// Helper of asynchronous compression with fallback
async function compressToUrl(jsonData) {
  const cleanData = {
    tripTitle: jsonData.tripTitle,
    tripSubtitle: jsonData.tripSubtitle,
    infoDates: jsonData.infoDates,
    infoWeather: jsonData.infoWeather,
    infoGroup: jsonData.infoGroup,
    infoHotel: jsonData.infoHotel,
    hotelLink: jsonData.hotelLink,
    targetDate: jsonData.targetDate,
    budget: jsonData.budget,
    budgetThresholds: jsonData.budgetThresholds,
    budgetAnalysis: jsonData.budgetAnalysis,
    packing: jsonData.packing,
    itinerary: jsonData.itinerary,
    flights: jsonData.flights || [],
    members: jsonData.members || ["Você"],
    expenses: jsonData.expenses || []
  };

  const string = JSON.stringify(cleanData);
  
  try {
    const stream = new Blob([string]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream("deflate"));
    const response = new Response(compressedStream);
    const buffer = await response.arrayBuffer();
    
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return "c1_" + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (err) {
    console.warn("Fallback to base64 encoding (CompressionStream failed):", err);
    const base64 = btoa(unescape(encodeURIComponent(string)));
    return "f1_" + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
}

// Helper of asynchronous decompression with fallback
async function decompressFromUrl(hash) {
  const version = hash.substring(0, 3);
  let base64 = hash.substring(3).replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }

  if (version === "c1_") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const stream = new Blob([bytes]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream("deflate"));
    const response = new Response(decompressedStream);
    const text = await response.text();
    return JSON.parse(text);
  } else if (version === "f1_") {
    const decoded = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(decoded);
  }
  
  const decoded = decodeURIComponent(escape(atob(hash.replace(/-/g, "+").replace(/_/g, "/"))));
  return JSON.parse(decoded);
}

// Check if URL has shared data parameters
function getSharedDataFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const sharedParam = urlParams.get("shared");
  if (sharedParam) return sharedParam;
  
  const pathParts = window.location.pathname.split("/");
  const vIndex = pathParts.indexOf("v");
  if (vIndex !== -1 && pathParts[vIndex + 1]) {
    return pathParts[vIndex + 1];
  }
  return null;
}

// Configure UI adjustments when in shared view mode
function setupSharedViewUI() {
  const salesBanner = document.getElementById("sharedViewSalesBanner");
  if (salesBanner) salesBanner.classList.remove("hidden");

  const chatBtn = document.querySelector('.bottom-nav-btn[data-tab="chat"]');
  const naViagemBtn = document.querySelector('.bottom-nav-btn[data-tab="naviagem"]');
  if (chatBtn) chatBtn.style.display = 'none';
  if (naViagemBtn) naViagemBtn.style.display = 'none';

  const documentsCard = document.getElementById("documentsCard");
  if (documentsCard) documentsCard.style.display = 'none';

  const shareHeroBtnContainer = document.getElementById("shareTripHeroContainer");
  if (shareHeroBtnContainer) shareHeroBtnContainer.style.display = "none";

  const shareSplitwiseBtn = document.getElementById("shareSplitwiseBtn");
  if (shareSplitwiseBtn) shareSplitwiseBtn.style.display = "none";

  const addExpenseBtn = document.getElementById("openAddExpenseModalBtn");
  if (addExpenseBtn) addExpenseBtn.style.display = "none";

  const addMemberForm = document.getElementById("addMemberForm");
  if (addMemberForm) addMemberForm.style.display = "none";

  const subTabSearchBtn = document.getElementById("subTabSearchBtn");
  if (subTabSearchBtn) subTabSearchBtn.style.display = "none";

  const openAddFlightModalBtn = document.getElementById("openAddFlightModalBtn");
  if (openAddFlightModalBtn) openAddFlightModalBtn.style.display = "none";

  const clearDataBtn = document.getElementById("clearDataBtn");
  if (clearDataBtn) clearDataBtn.style.display = "none";

  const sliders = ["slideHospedagem", "slideAlimentacao", "slidePasseios", "slideCompras"];
  sliders.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  switchTab('roteiro');
}

// Initialize
async function init() {
  // Inicialização do tema (Claro/Escuro)
  const savedTheme = localStorage.getItem("gptViajante_theme");
  if (savedTheme === "light") {
    document.body.classList.add("light-theme");
    const toggleThemeBtn = document.getElementById("toggleThemeBtn");
    if (toggleThemeBtn) {
      toggleThemeBtn.innerHTML = `<i class="fa-solid fa-moon"></i> Tema Escuro`;
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  
  if (urlParams.has("share")) {
    renderSharedSplitwise(urlParams.get("share"));
    return;
  }

  const sharedHash = getSharedDataFromUrl();
  if (sharedHash) {
    if (sharedHash.length === 36 || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sharedHash)) {
      try {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .eq('id', sharedHash)
          .single();
        if (error || !data) throw new Error(error?.message || "Viagem não encontrada.");
        
        tripData = {
          id: data.id,
          tripTitle: data.title,
          tripSubtitle: data.subtitle,
          infoDates: data.dates,
          infoWeather: data.weather,
          infoGroup: data.group_type,
          infoHotel: data.hotel,
          hotelLink: data.hotel_link,
          targetDate: data.target_date,
          budget: data.budget,
          budgetThresholds: data.budget_thresholds,
          budgetAnalysis: data.budget_analysis,
          packing: data.packing,
          itinerary: data.itinerary,
          flights: data.flights,
          members: data.members,
          expenses: data.expenses,
          user_id: data.user_id,
          documents: []
        };

        const { data: docs } = await supabase
          .from('documents')
          .select('*')
          .eq('trip_id', sharedHash);
        if (docs) {
          tripData.documents = docs.map(d => ({
            id: d.id,
            name: d.name,
            category: d.category,
            url: d.file_url,
            type: d.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image",
            date: new Date(d.created_at).toLocaleDateString("pt-BR"),
            size: "Ver anexo"
          }));
        }

        const activeUser = await checkCurrentUser();
        let canEdit = false;
        if (activeUser) {
          currentUser = activeUser;
          const cleanEmail = activeUser.email ? activeUser.email.toLowerCase().trim() : '';
          const isOwner = data.user_id === activeUser.id;
          const isMember = Array.isArray(data.members) && data.members.some(m => {
            if (typeof m === 'string') {
              return m.toLowerCase().trim() === cleanEmail;
            }
            return false;
          });
          
          if (isOwner || isMember) {
            canEdit = true;
          }
        }

        if (canEdit) {
          isSharedView = false;
          console.log("Logged-in owner/collaborator detected. Editing trip collaboratively.");
          localStorage.setItem(getUserStorageKey("gptViajante_tripData"), JSON.stringify(tripData));
          subscribeToTripChanges(tripData.id);
        } else {
          isSharedView = true;
          setupSharedViewUI();
        }

        tripData.flights = tripData.flights || [];
        tripData.members = tripData.members || ["Você"];
        tripData.expenses = tripData.expenses || [];
        tripData.budgetThresholds = tripData.budgetThresholds || { economico: 150, intermediario: 450 };
        
        renderTimeline();
        renderFlights();
        renderSplitwise();
        renderPackingChecklist();
        checkItineraryStatus();
        updateBudget();

        if (canEdit) {
          setupAuthUI();
          setupAuthStateListener(handleUserLoggedIn, handleUserLoggedOut);
        }
        return;
      } catch (err) {
        console.error("Falha ao carregar viagem compartilhada:", err);
        alert("⚠️ Não foi possível carregar a viagem compartilhada. O link pode estar quebrado ou expirado.");
      }
    } else {
      try {
        tripData = await decompressFromUrl(sharedHash);
        isSharedView = true;
        setupSharedViewUI();
        
        tripData.flights = tripData.flights || [];
        tripData.members = tripData.members || ["Você"];
        tripData.expenses = tripData.expenses || [];
        tripData.budgetThresholds = tripData.budgetThresholds || { economico: 150, intermediario: 450 };
        
        renderTimeline();
        renderFlights();
        renderSplitwise();
        renderPackingChecklist();
        checkItineraryStatus();
        updateBudget();
        return;
      } catch (err) {
        console.error("Falha ao carregar viagem compartilhada compactada:", err);
      }
    }
  }
  
  setupAuthUI();
  setupAuthStateListener(handleUserLoggedIn, handleUserLoggedOut);

  enableDragToScroll(document.getElementById("chatMessages"));
  enableDragToScroll(document.getElementById("travelChatMessages"));
  enableDragToScroll(document.getElementById("dashboardContent"));
  
  const shareHeroBtn = document.getElementById("shareTripHeroBtn");
  if (shareHeroBtn) {
    shareHeroBtn.addEventListener("click", async () => {
      try {
        let shareUrl;
        if (tripData.id) {
          shareUrl = `${window.location.origin}/v/${tripData.id}`;
        } else {
          const hash = await compressToUrl(tripData);
          shareUrl = `${window.location.origin}/v/${hash}`;
        }
        
        navigator.clipboard.writeText(shareUrl).then(() => {
          alert("✓ Link de compartilhamento do seu painel copiado para a área de transferência! Envie para seus parceiros de viagem no WhatsApp.");
        }).catch(err => {
          console.error("Failed to copy link:", err);
          prompt("Copie o link abaixo para compartilhar:", shareUrl);
        });
      } catch (err) {
        console.error("Error generating share link:", err);
        alert("⚠️ Ocorreu um erro ao gerar o link de compartilhamento.");
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ==========================================================================
// 1. STATE PERSISTENCE (LocalStorage)
// ==========================================================================
function getUserStorageKey(baseKey) {
  if (currentUser && (currentUser.uid || currentUser.email)) {
    const userIdSuffix = currentUser.uid || currentUser.email.replace(/[^a-zA-Z0-9]/g, "_");
    return `${baseKey}_${userIdSuffix}`;
  }
  return baseKey;
}

let syncTimeout = null;

async function loadState() {
  // Fallback to local storage if user is not logged in or Supabase client isn't fully configured
  if (!currentUser || !currentUser.id) {
    const savedHistory = localStorage.getItem(getUserStorageKey("gptViajante_chatHistory"));
    const savedTravelHistory = localStorage.getItem(getUserStorageKey("gptViajante_travelChatHistory"));
    const savedTrip = localStorage.getItem(getUserStorageKey("gptViajante_tripData"));

    if (savedHistory) {
      chatHistory = JSON.parse(savedHistory);
      renderChatHistory('plan');
    } else {
      chatHistory = [];
    }

    if (savedTravelHistory) {
      travelChatHistory = JSON.parse(savedTravelHistory);
      renderChatHistory('travel');
    } else {
      travelChatHistory = [];
    }

    if (savedTrip) {
      tripData = JSON.parse(savedTrip);
      tripData.budgetAnalysis = tripData.budgetAnalysis || "";
      tripData.budgetThresholds = tripData.budgetThresholds || { economico: 150, intermediario: 450 };
    } else {
      tripData = {
        tripTitle: "Minha Próxima Viagem",
        tripSubtitle: "Planeje sua viagem conversando pelo chat!",
        infoDates: "A definir",
        infoWeather: "A definir",
        infoGroup: "A definir",
        infoHotel: "A definir",
        hotelLink: "",
        targetDate: null,
        budget: {
          hospedagem: 0,
          alimentacao: 0,
          passeios: 0,
          compras: 0
        },
        budgetAnalysis: "",
        budgetThresholds: { economico: 150, intermediario: 450 },
        packing: [],
        itinerary: [],
        flights: [],
        members: ["Você"],
        expenses: []
      };
    }
  } else {
    // Authenticated user: Load from LocalStorage immediately for instant UX first
    const savedHistory = localStorage.getItem(getUserStorageKey("gptViajante_chatHistory"));
    const savedTravelHistory = localStorage.getItem(getUserStorageKey("gptViajante_travelChatHistory"));
    const savedTrip = localStorage.getItem(getUserStorageKey("gptViajante_tripData"));

    if (savedTrip) {
      try {
        tripData = JSON.parse(savedTrip);
        tripData.budgetAnalysis = tripData.budgetAnalysis || "";
        tripData.budgetThresholds = tripData.budgetThresholds || { economico: 150, intermediario: 450 };
        
        // Initial fast render using cache
        renderTimeline();
        renderFlights();
        renderSplitwise();
        renderPackingChecklist();
        checkItineraryStatus();
        updateBudget();
      } catch (e) {
        console.warn("Failed to parse cached tripData:", e);
      }
    }

    if (savedHistory) {
      try {
        chatHistory = JSON.parse(savedHistory);
        renderChatHistory('plan');
      } catch (e) {
        console.warn("Failed to parse cached chatHistory:", e);
      }
    }

    if (savedTravelHistory) {
      try {
        travelChatHistory = JSON.parse(savedTravelHistory);
        renderChatHistory('travel');
      } catch (e) {
        console.warn("Failed to parse cached travelChatHistory:", e);
      }
    }

    // Now query Supabase in the background asynchronously if online
    if (navigator.onLine) {
      setTimeout(async () => {
        try {
          console.log("Syncing state with Supabase in background...");
        
        // 1. Fetch latest trip
        const { data: trips, error: tripErr } = await supabase
          .from('trips')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (tripErr) throw tripErr;

        let activeTrip = null;
        if (trips && trips.length > 0) {
          activeTrip = trips[0];
        } else {
          // Create initial trip for user
          const initialTrip = {
            user_id: currentUser.id,
            title: "Minha Próxima Viagem",
            subtitle: "Planeje sua viagem conversando pelo chat!",
            dates: "A definir",
            weather: "A definir",
            group_type: "A definir",
            hotel: "A definir",
            hotel_link: "",
            target_date: null,
            budget: { hospedagem: 0, alimentacao: 0, passeios: 0, compras: 0 },
            budget_thresholds: { economico: 150, intermediario: 450 },
            budget_analysis: "",
            packing: [],
            itinerary: [],
            flights: [],
            members: ["Você"],
            expenses: []
          };
          const { data: newTrip, error: insertErr } = await supabase
            .from('trips')
            .insert(initialTrip)
            .select()
            .single();

          if (insertErr) throw insertErr;
          activeTrip = newTrip;
        }

        // Map DB schema to front-end tripData structure
        const remoteTripData = {
          id: activeTrip.id,
          tripTitle: activeTrip.title,
          tripSubtitle: activeTrip.subtitle,
          infoDates: activeTrip.dates,
          infoWeather: activeTrip.weather,
          infoGroup: activeTrip.group_type,
          infoHotel: activeTrip.hotel,
          hotelLink: activeTrip.hotel_link,
          targetDate: activeTrip.target_date,
          budget: activeTrip.budget,
          budgetThresholds: activeTrip.budget_thresholds,
          budgetAnalysis: activeTrip.budget_analysis,
          packing: activeTrip.packing,
          itinerary: activeTrip.itinerary,
          flights: activeTrip.flights,
          members: activeTrip.members,
          expenses: activeTrip.expenses,
          documents: []
        };

        // 2. Fetch Chat Histories and Documents in parallel to save HTTP round-trips
        const [chatRes, docsRes] = await Promise.all([
          supabase.from('chat_histories').select('*').eq('trip_id', remoteTripData.id),
          supabase.from('documents').select('*').eq('trip_id', remoteTripData.id)
        ]);

        if (chatRes.error) console.error("Error fetching chats in background:", chatRes.error);
        if (docsRes.error) console.error("Error fetching documents metadata in background:", docsRes.error);

        let remoteChatHistory = [];
        let remoteTravelChatHistory = [];
        
        if (chatRes.data) {
          const planChat = chatRes.data.find(c => c.chat_type === 'plan');
          if (planChat) {
            remoteChatHistory = planChat.messages;
          }
          const travelChat = chatRes.data.find(c => c.chat_type === 'travel');
          if (travelChat) {
            remoteTravelChatHistory = travelChat.messages;
          }
        }

        if (docsRes.data) {
          remoteTripData.documents = docsRes.data.map(d => ({
            id: d.id,
            name: d.name,
            category: d.category,
            url: d.file_url,
            type: d.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image",
            date: new Date(d.created_at).toLocaleDateString("pt-BR"),
            size: "Ver anexo"
          }));
        }

        // Compare and update if data has changed
        const hasTripChanged = JSON.stringify(tripData) !== JSON.stringify(remoteTripData);
        const hasChatChanged = JSON.stringify(chatHistory) !== JSON.stringify(remoteChatHistory);
        const hasTravelChatChanged = JSON.stringify(travelChatHistory) !== JSON.stringify(remoteTravelChatHistory);

        if (hasTripChanged || hasChatChanged || hasTravelChatChanged) {
          console.log("State updated from Supabase, re-rendering UI.");
          tripData = remoteTripData;
          chatHistory = remoteChatHistory;
          travelChatHistory = remoteTravelChatHistory;

          renderTimeline();
          renderFlights();
          renderSplitwise();
          renderPackingChecklist();
          checkItineraryStatus();
          updateBudget();
          
          renderChatHistory('plan');
          renderChatHistory('travel');

          // Save fresh state to LocalStorage
          localStorage.setItem(getUserStorageKey("gptViajante_chatHistory"), JSON.stringify(chatHistory));
          localStorage.setItem(getUserStorageKey("gptViajante_travelChatHistory"), JSON.stringify(travelChatHistory));
          localStorage.setItem(getUserStorageKey("gptViajante_tripData"), JSON.stringify(tripData));
        } else {
          console.log("State is already in sync with Supabase.");
        }
      } catch (err) {
        console.error("Failed to sync state from Supabase in background:", err);
      }
    }, 0);
  } else {
    console.log("Device offline. Skipping background Supabase load sync.");
  }
}

  tripData.flights = tripData.flights || [];
  tripData.members = tripData.members || ["Você"];
  tripData.expenses = tripData.expenses || [];
  tripData.documents = tripData.documents || [];
  
  renderFlights();
  renderSplitwise();
  checkItineraryStatus();
}

async function saveState() {
  localStorage.setItem(getUserStorageKey("gptViajante_chatHistory"), JSON.stringify(chatHistory));
  localStorage.setItem(getUserStorageKey("gptViajante_travelChatHistory"), JSON.stringify(travelChatHistory));
  localStorage.setItem(getUserStorageKey("gptViajante_tripData"), JSON.stringify(tripData));

  if (!currentUser || !currentUser.id) return;
  
  if (!navigator.onLine) {
    console.log("Device offline. State saved locally, skipping Supabase remote sync.");
    return;
  }

  if (syncTimeout) clearTimeout(syncTimeout);
  
  syncTimeout = setTimeout(async () => {
    try {
      const tripToSave = {
        title: tripData.tripTitle || 'Minha Próxima Viagem',
        subtitle: tripData.tripSubtitle || 'Planeje sua viagem conversando pelo chat!',
        dates: tripData.infoDates || 'A definir',
        weather: tripData.infoWeather || 'A definir',
        group_type: tripData.infoGroup || 'A definir',
        hotel: tripData.infoHotel || 'A definir',
        hotel_link: tripData.hotelLink || '',
        target_date: tripData.targetDate || null,
        budget: tripData.budget || {},
        budget_thresholds: tripData.budgetThresholds || { economico: 150, intermediario: 450 },
        budget_analysis: tripData.budgetAnalysis || '',
        packing: tripData.packing || [],
        itinerary: tripData.itinerary || [],
        flights: tripData.flights || [],
        members: tripData.members || ['Você'],
        expenses: tripData.expenses || [],
        updated_at: new Date().toISOString()
      };

      if (tripData.id) {
        const { error } = await supabase
          .from('trips')
          .update(tripToSave)
          .eq('id', tripData.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('trips')
          .insert({ ...tripToSave, user_id: currentUser.id })
          .select()
          .single();
        if (error) throw error;
        tripData.id = data.id;
        localStorage.setItem(getUserStorageKey("gptViajante_tripData"), JSON.stringify(tripData));
      }

      if (tripData.id) {
        const { error: chatErr1 } = await supabase
          .from('chat_histories')
          .upsert({
            trip_id: tripData.id,
            user_id: currentUser.id,
            messages: chatHistory || [],
            chat_type: 'plan',
            updated_at: new Date().toISOString()
          }, { onConflict: 'trip_id,chat_type' });
        
        if (chatErr1) console.error("Error syncing plan chat:", chatErr1);

        const { error: chatErr2 } = await supabase
          .from('chat_histories')
          .upsert({
            trip_id: tripData.id,
            user_id: currentUser.id,
            messages: travelChatHistory || [],
            chat_type: 'travel',
            updated_at: new Date().toISOString()
          }, { onConflict: 'trip_id,chat_type' });

        if (chatErr2) console.error("Error syncing travel chat:", chatErr2);
      }
      
      console.log("Supabase sync completed successfully.");
    } catch (err) {
      console.error("Error syncing state to Supabase:", err);
    }
  }, 1000);
}

// ==========================================================================
// 2. BOTTOM NAVIGATION (ALL SCREEN SIZES)
// ==========================================================================
let travelMode = false;

let lastScrollTop = 0;
const scrollThreshold = 10;

function handleScroll(e) {
  if (window.innerWidth > 768) {
    const appContainer = document.querySelector(".app-container");
    if (appContainer) appContainer.classList.remove("nav-hidden");
    return;
  }

  // If the chat input is focused, keep nav hidden regardless of scroll
  const chatInput = document.getElementById("chatInput");
  if (chatInput && document.activeElement === chatInput) {
    return;
  }

  const scrollTop = e.target.scrollTop;
  const appContainer = document.querySelector(".app-container");
  if (!appContainer) return;

  // Prevent trigger on very small scrolls or negative scroll (iOS bounce)
  if (Math.abs(lastScrollTop - scrollTop) <= scrollThreshold) return;
  if (scrollTop < 0) return;

  if (scrollTop > lastScrollTop) {
    // Scrolling down -> hide nav
    appContainer.classList.add("nav-hidden");
  } else {
    // Scrolling up -> show nav
    appContainer.classList.remove("nav-hidden");
  }
  lastScrollTop = scrollTop;
}

function setupBottomNav() {
  const chatSidebar = document.getElementById('chatSidebar');
  const dashboardContent = document.getElementById('dashboardContent');
  const chatMessages = document.getElementById('chatMessages');

  // Start with chat visible
  chatSidebar.style.display = 'flex';
  dashboardContent.style.display = 'none';

  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Attach scroll listeners to hide/show bottom nav
  if (chatMessages) {
    chatMessages.addEventListener('scroll', handleScroll);
  }
  if (dashboardContent) {
    dashboardContent.addEventListener('scroll', handleScroll);
  }
}

function switchTab(tab) {
  const chatSidebar = document.getElementById('chatSidebar');
  const dashboardContent = document.getElementById('dashboardContent');
  const allBtns = document.querySelectorAll('.bottom-nav-btn');
  const planPanel = document.getElementById('planChatPanel');
  const travelPanel = document.getElementById('travelChatPanel');
  const modeLabel = document.getElementById('chatModeLabel');

  allBtns.forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.bottom-nav-btn[data-tab="${tab}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (tab === 'naviagem') {
    chatSidebar.style.display = 'flex';
    dashboardContent.style.display = 'none';
    if (planPanel) planPanel.classList.add('hidden');
    if (travelPanel) travelPanel.classList.remove('hidden');
    if (modeLabel) modeLabel.textContent = 'Na Viagem';
    setTravelMode(true);
  } else if (tab === 'chat') {
    chatSidebar.style.display = 'flex';
    dashboardContent.style.display = 'none';
    if (planPanel) planPanel.classList.remove('hidden');
    if (travelPanel) travelPanel.classList.add('hidden');
    if (modeLabel) modeLabel.textContent = 'Planejar Roteiro';
    setTravelMode(false);
  } else {
    chatSidebar.style.display = 'none';
    dashboardContent.style.display = 'block';
    setTravelMode(false);
    
    const sectionMap = {
      logistica: 'logisticaSection',
      roteiro: 'itinerarySection',
      orcamento: 'budgetSection',
      mala: 'packingSection'
    };
    
    // Hide all sections first
    Object.values(sectionMap).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    const hero = document.querySelector('.hero');
    const infoSection = document.querySelector('.info-section');
    
    if (tab === 'roteiro') {
      if (hero) hero.classList.remove('hidden');
      if (infoSection) infoSection.classList.remove('hidden');
    } else {
      if (hero) hero.classList.add('hidden');
      if (infoSection) infoSection.classList.add('hidden');
    }

    const targetId = sectionMap[tab];
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) el.classList.remove('hidden');
    }
    
    // Reset scroll to top of the dashboard content
    dashboardContent.scrollTop = 0;
  }
  // Update banner visibility based on the active tab
  checkItineraryStatus();
}

function setTravelMode(active) {
  travelMode = active;
  const badge = document.getElementById('travelModeBadge');
  if (active) {
    if (badge) badge.classList.remove('hidden');
  } else {
    if (badge) badge.classList.add('hidden');
  }
}

// ==========================================================================
// 3b. TUTORIAL MODAL
// ==========================================================================
let currentTutorialSlide = 0;
const TUTORIAL_TOTAL_SLIDES = 8;

function openTutorial() {
  const modal = document.getElementById('tutorialModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  goToSlide(0);
  document.body.style.overflow = 'hidden';
}

function closeTutorial() {
  const modal = document.getElementById('tutorialModal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function goToSlide(n) {
  currentTutorialSlide = Math.max(0, Math.min(n, TUTORIAL_TOTAL_SLIDES - 1));
  
  // Update slides
  document.querySelectorAll('.tutorial-slide').forEach((slide, i) => {
    slide.classList.toggle('active', i === currentTutorialSlide);
  });
  
  // Update dots
  document.querySelectorAll('.tut-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentTutorialSlide);
  });

  // Show/hide finish button on last slide
  const finishBtn = document.getElementById('tutFinish');
  const nextBtn = document.getElementById('tutNext');
  if (finishBtn && nextBtn) {
    if (currentTutorialSlide === TUTORIAL_TOTAL_SLIDES - 1) {
      finishBtn.classList.remove('hidden');
      nextBtn.style.opacity = '0.3';
      nextBtn.style.pointerEvents = 'none';
    } else {
      finishBtn.classList.add('hidden');
      nextBtn.style.opacity = '';
      nextBtn.style.pointerEvents = '';
    }
  }

  const prevBtn = document.getElementById('tutPrev');
  if (prevBtn) {
    prevBtn.style.opacity = currentTutorialSlide === 0 ? '0.3' : '';
    prevBtn.style.pointerEvents = currentTutorialSlide === 0 ? 'none' : '';
  }
}

// Wire tutorial controls (called after DOM is ready)
function setupTutorialListeners() {
  const closeBtn = document.getElementById('tutorialClose');
  const prevBtn = document.getElementById('tutPrev');
  const nextBtn = document.getElementById('tutNext');
  const finishBtn = document.getElementById('tutFinish');
  const overlay = document.getElementById('tutorialModal');
  const card = overlay?.querySelector('.tutorial-card');

  if (closeBtn) closeBtn.addEventListener('click', closeTutorial);
  if (finishBtn) finishBtn.addEventListener('click', closeTutorial);
  if (prevBtn) prevBtn.addEventListener('click', () => goToSlide(currentTutorialSlide - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goToSlide(currentTutorialSlide + 1));

  // Dot navigation
  document.querySelectorAll('.tut-dot').forEach(dot => {
    dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.dot)));
  });

  // Close on overlay click (not on card click)
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (card && !card.contains(e.target)) closeTutorial();
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('tutorialModal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') goToSlide(currentTutorialSlide + 1);
    if (e.key === 'ArrowLeft') goToSlide(currentTutorialSlide - 1);
    if (e.key === 'Escape') closeTutorial();
  });
}

// ==========================================================================
// 3. UI EVENT LISTENERS
// ==========================================================================
function setupUIEventListeners() {
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const toggleSettings = document.getElementById("toggleSettings");
  const settingsPanel = document.getElementById("settingsPanel");
  const clearDataBtn = document.getElementById("clearDataBtn");
  const attachBtn = document.getElementById("attachBtn");
  const closeLightbox = document.getElementById("closeLightbox");
  const lightbox = document.getElementById("galleryLightbox");
  const logoutBtn = document.getElementById("logoutBtn");

  // Autoresize chat textarea
  if (chatInput) {
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = (chatInput.scrollHeight) + "px";
    });

    // Send message on Enter key (without Shift)
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleUserSendMessage();
      }
    });

    // Hide navigation when typing
    chatInput.addEventListener("focus", () => {
      if (window.innerWidth > 768) return;
      const appContainer = document.querySelector(".app-container");
      if (appContainer) appContainer.classList.add("nav-hidden");
    });
    
    chatInput.addEventListener("blur", () => {
      const appContainer = document.querySelector(".app-container");
      if (appContainer) {
        // Small delay to ensure clicks on bottom-nav button elements go through
        setTimeout(() => {
          appContainer.classList.remove("nav-hidden");
        }, 150);
      }
    });

    // Show navigation bar if resizing to desktop
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        const appContainer = document.querySelector(".app-container");
        if (appContainer) appContainer.classList.remove("nav-hidden");
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", handleUserSendMessage);
  }

  // Travel chat input
  const travelChatInput = document.getElementById("travelChatInput");
  const travelSendBtn = document.getElementById("travelSendBtn");

  if (travelChatInput) {
    travelChatInput.addEventListener("input", () => {
      travelChatInput.style.height = "auto";
      travelChatInput.style.height = (travelChatInput.scrollHeight) + "px";
    });
    travelChatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleTravelSendMessage();
      }
    });
    travelChatInput.addEventListener("focus", () => {
      if (window.innerWidth > 768) return;
      const appContainer = document.querySelector(".app-container");
      if (appContainer) appContainer.classList.add("nav-hidden");
    });
    travelChatInput.addEventListener("blur", () => {
      const appContainer = document.querySelector(".app-container");
      if (appContainer) setTimeout(() => appContainer.classList.remove("nav-hidden"), 150);
    });
  }
  if (travelSendBtn) {
    travelSendBtn.addEventListener("click", handleTravelSendMessage);
  }

  // Tutorial button
  const tutorialBtn = document.getElementById("tutorialBtn");
  if (tutorialBtn) {
    tutorialBtn.addEventListener("click", openTutorial);
  }

  // Toggle Settings Panel
  if (toggleSettings && settingsPanel) {
    toggleSettings.addEventListener("click", () => {
      settingsPanel.classList.toggle("hidden");
    });
  }

  // Logout Button
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await logout();
      } catch (err) {
        alert("Erro ao sair: " + err.message);
      }
    });
  }

  // Reset Data
  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", () => {
      if (confirm("Deseja redefinir todo o chat e o painel de viagem? Isso apagará o roteiro atual.")) {
        localStorage.removeItem(getUserStorageKey("gptViajante_chatHistory"));
        localStorage.removeItem(getUserStorageKey("gptViajante_travelChatHistory"));
        localStorage.removeItem(getUserStorageKey("gptViajante_tripData"));
        localStorage.removeItem(getUserStorageKey("gptViajante_packingState"));
        chatHistory = [];
        travelChatHistory = [];
        tripData = {
          tripTitle: "Minha Próxima Viagem",
          tripSubtitle: "Planeje sua viagem conversando pelo chat!",
          infoDates: "A definir",
          infoWeather: "A definir",
          infoGroup: "A definir",
          infoHotel: "A definir",
          hotelLink: "",
          targetDate: null,
          budget: { hospedagem: 0, alimentacao: 0, passeios: 0, compras: 0 },
          packing: [],
          itinerary: [],
          flights: [],
          members: ["Você"],
          expenses: []
        };
        location.reload();
      }
    });
  }

  // Attach Document and Camera Buttons wiring
  const planFileInput = document.getElementById("planFileInput");
  const planCameraInput = document.getElementById("planCameraInput");
  const travelFileInput = document.getElementById("travelFileInput");
  const travelCameraInput = document.getElementById("travelCameraInput");

  const cameraBtn = document.getElementById("cameraBtn");
  const travelAttachBtn = document.getElementById("travelAttachBtn");
  const travelCameraBtn = document.getElementById("travelCameraBtn");

  if (attachBtn && planFileInput) {
    attachBtn.addEventListener("click", () => planFileInput.click());
  }
  if (cameraBtn && planCameraInput) {
    cameraBtn.addEventListener("click", () => planCameraInput.click());
  }
  if (travelAttachBtn && travelFileInput) {
    travelAttachBtn.addEventListener("click", () => travelFileInput.click());
  }
  if (travelCameraBtn && travelCameraInput) {
    travelCameraBtn.addEventListener("click", () => travelCameraInput.click());
  }

  // Handle file selections
  if (planFileInput) planFileInput.addEventListener("change", (e) => handleFileSelect(e, 'plan'));
  if (planCameraInput) planCameraInput.addEventListener("change", (e) => handleFileSelect(e, 'plan'));
  if (travelFileInput) travelFileInput.addEventListener("change", (e) => handleFileSelect(e, 'travel'));
  if (travelCameraInput) travelCameraInput.addEventListener("change", (e) => handleFileSelect(e, 'travel'));

  // Export PDF
  const exportPdfBtn = document.getElementById("exportPdfBtn");
  if (exportPdfBtn) exportPdfBtn.addEventListener("click", exportAsPdf);

  // Close Lightbox
  if (closeLightbox && lightbox) {
    closeLightbox.addEventListener("click", () => { lightbox.style.display = "none"; });
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) lightbox.style.display = "none"; });
  }

  // Open Flight Modal
  const openAddFlightModalBtn = document.getElementById("openAddFlightModalBtn");
  if (openAddFlightModalBtn) {
    openAddFlightModalBtn.addEventListener("click", () => {
      openFlightModal();
    });
  }

  // Close Flight Modal
  const closeFlightModalBtn = document.getElementById("closeFlightModal");
  if (closeFlightModalBtn) {
    closeFlightModalBtn.addEventListener("click", closeFlightModal);
  }
  const cancelFlightModalBtn = document.getElementById("cancelFlightModalBtn");
  if (cancelFlightModalBtn) {
    cancelFlightModalBtn.addEventListener("click", closeFlightModal);
  }

  // Flight search online
  const searchFlightOnlineBtn = document.getElementById("searchFlightOnlineBtn");
  if (searchFlightOnlineBtn) {
    searchFlightOnlineBtn.addEventListener("click", handleSearchFlightOnline);
  }

  // Flight form submission
  const flightForm = document.getElementById("flightForm");
  if (flightForm) {
    flightForm.addEventListener("submit", handleFlightFormSubmit);
  }

  // Flight Sub-tab switching
  const subTabSearchBtn = document.getElementById("subTabSearchBtn");
  const subTabTrackBtn = document.getElementById("subTabTrackBtn");
  const flightSearchSubSection = document.getElementById("flightSearchSubSection");
  const flightTrackSubSection = document.getElementById("flightTrackSubSection");

  if (subTabSearchBtn && subTabTrackBtn) {
    subTabSearchBtn.addEventListener("click", () => {
      subTabSearchBtn.classList.add("active");
      subTabTrackBtn.classList.remove("active");
      if (flightSearchSubSection) flightSearchSubSection.classList.remove("hidden");
      if (flightTrackSubSection) flightTrackSubSection.classList.add("hidden");
    });

    subTabTrackBtn.addEventListener("click", () => {
      subTabTrackBtn.classList.add("active");
      subTabSearchBtn.classList.remove("active");
      if (flightTrackSubSection) flightTrackSubSection.classList.remove("hidden");
      if (flightSearchSubSection) flightSearchSubSection.classList.add("hidden");
    });
  }

  // Flight search form submission
  const flightSearchForm = document.getElementById("flightSearchForm");
  if (flightSearchForm) {
    flightSearchForm.addEventListener("submit", handleFlightSearchSubmit);
  }

  // Initialize Splitwise Event Listeners
  setupSplitwiseListeners();

  // Initialize Documents Event Listeners
  setupDocumentListeners();

  // Webhook/PDF importadores mágicos
  const magicImportPdfBtn = document.getElementById("magicImportPdfBtn");
  const magicImportPdfFileInput = document.getElementById("magicImportPdfFileInput");

  if (magicImportPdfBtn && magicImportPdfFileInput) {
    magicImportPdfBtn.addEventListener("click", () => {
      magicImportPdfFileInput.click();
    });
    magicImportPdfFileInput.addEventListener("change", handleMagicImportPdf);
  }

  // List vs Calendar View Toggle Event Listeners
  const viewToggleList = document.getElementById("viewToggleList");
  const viewToggleCalendar = document.getElementById("viewToggleCalendar");
  if (viewToggleList && viewToggleCalendar) {
    viewToggleList.addEventListener("click", () => {
      itineraryViewMode = 'list';
      viewToggleList.classList.add("active");
      viewToggleCalendar.classList.remove("active");
      renderTimeline();
    });
    viewToggleCalendar.addEventListener("click", () => {
      itineraryViewMode = 'calendar';
      viewToggleCalendar.classList.add("active");
      viewToggleList.classList.remove("active");
      renderTimeline();
    });
  }

  // Text Paste Import Modal Event Listeners
  const openTextImportModalBtn = document.getElementById("openTextImportModalBtn");
  const closeTextImportModalBtn = document.getElementById("closeTextImportModal");
  const cancelTextImportBtn = document.getElementById("cancelTextImportBtn");
  const submitTextImportBtn = document.getElementById("submitTextImportBtn");

  if (openTextImportModalBtn) {
    openTextImportModalBtn.addEventListener("click", openTextImportModal);
  }
  if (closeTextImportModalBtn) {
    closeTextImportModalBtn.addEventListener("click", closeTextImportModal);
  }
  if (cancelTextImportBtn) {
    cancelTextImportBtn.addEventListener("click", closeTextImportModal);
  }
  if (submitTextImportBtn) {
    submitTextImportBtn.addEventListener("click", handleTextPasteImport);
  }

  // Event listener for Save Hotel & Sync button
  const saveHotelBtn = document.getElementById("saveHotelBtn");
  if (saveHotelBtn) {
    saveHotelBtn.addEventListener("click", handleSaveHotelAndSync);
  }

  // Alternador de Tema (Claro/Escuro)
  const toggleThemeBtn = document.getElementById("toggleThemeBtn");
  if (toggleThemeBtn) {
    if (document.body.classList.contains("light-theme")) {
      toggleThemeBtn.innerHTML = `<i class="fa-solid fa-moon"></i> Tema Escuro`;
    } else {
      toggleThemeBtn.innerHTML = `<i class="fa-solid fa-sun"></i> Tema Claro`;
    }

    toggleThemeBtn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-theme");
      if (isLight) {
        localStorage.setItem("gptViajante_theme", "light");
        toggleThemeBtn.innerHTML = `<i class="fa-solid fa-moon"></i> Tema Escuro`;
      } else {
        localStorage.setItem("gptViajante_theme", "dark");
        toggleThemeBtn.innerHTML = `<i class="fa-solid fa-sun"></i> Tema Claro`;
      }
    });
  }
}

async function handleFlightSearchSubmit(e) {
  e.preventDefault();

  const originInput = document.getElementById("flightSearchOrigin");
  const destInput = document.getElementById("flightSearchDest");
  const dateInput = document.getElementById("flightSearchDate");

  if (!originInput || !destInput || !dateInput) return;

  const origin = originInput.value.trim().toUpperCase();
  const destination = destInput.value.trim().toUpperCase();
  const date = dateInput.value;

  const loadingEl = document.getElementById("flightSearchGlobalLoading");
  const errorEl = document.getElementById("flightSearchGlobalError");
  const errorTextEl = document.getElementById("flightSearchGlobalErrorText");
  const resultsContainer = document.getElementById("flightSearchResultsContainer");

  // Show loading, hide error/results
  if (loadingEl) loadingEl.classList.remove("hidden");
  if (errorEl) errorEl.classList.add("hidden");
  if (resultsContainer) resultsContainer.classList.add("hidden");

  try {
    const token = await getFreshToken();
    const response = await fetch("/api/search-flights", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ origin, destination, date })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Erro ao consultar preços de voos.");
    }

    const data = await response.json();

    // Hide loading
    if (loadingEl) loadingEl.classList.add("hidden");

    // Populate Results
    const reqDateEl = document.getElementById("flightSearchReqDate");
    const reqAirlineEl = document.getElementById("flightSearchReqAirline");
    const reqPriceEl = document.getElementById("flightSearchReqPrice");
    const reqStopsEl = document.getElementById("flightSearchReqStops");
    const explanationEl = document.getElementById("flightSearchExplanationText");
    const gridEl = document.getElementById("flightSearchGrid");

    // Format requested date nicely (e.g. DD/MM/YYYY)
    const formattedReqDate = date.split("-").reverse().join("/");
    if (reqDateEl) reqDateEl.textContent = formattedReqDate;

    if (data.requestedFlight) {
      if (reqAirlineEl) reqAirlineEl.textContent = data.requestedFlight.airline || "Companhia Indefinida";
      if (reqPriceEl) reqPriceEl.textContent = data.requestedFlight.price || "Preço sob consulta";
      if (reqStopsEl) {
        const stopsText = data.requestedFlight.stops || "Sem escalas";
        const durationText = data.requestedFlight.duration ? ` • Duração: ${data.requestedFlight.duration}` : "";
        reqStopsEl.textContent = `${stopsText}${durationText}`;
      }
    } else {
      if (reqAirlineEl) reqAirlineEl.textContent = "-";
      if (reqPriceEl) reqPriceEl.textContent = "Preço sob consulta";
      if (reqStopsEl) reqStopsEl.textContent = "-";
    }

    if (explanationEl) {
      explanationEl.textContent = data.naturalExplanation || "Nenhuma recomendação especial encontrada.";
    }

    // Grid details
    if (gridEl) {
      gridEl.innerHTML = "";
      
      const reqPriceVal = data.requestedFlight ? data.requestedFlight.priceValue : null;

      if (data.allCheckedDates && data.allCheckedDates.length > 0) {
        data.allCheckedDates.forEach(item => {
          const itemDateFormatted = item.date.split("-").reverse().join("/");
          const isCheaper = reqPriceVal && item.priceValue && item.priceValue < reqPriceVal;
          const isSameDay = item.date === date;
          
          let cardStyle = "padding: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--border-radius-md); text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center;";
          let badgeHtml = "";
          let priceColor = "white";

          if (isCheaper) {
            cardStyle = "padding: 14px; background: rgba(16, 185, 129, 0.08); border: 1.5px solid #10b981; border-radius: var(--border-radius-md); text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center; position: relative;";
            badgeHtml = `<span style="font-size: 0.62rem; font-weight: 800; background: #10b981; color: white; padding: 2px 6px; border-radius: 10px; margin: 0 auto 4px; text-transform: uppercase;">Mais Barato</span>`;
            priceColor = "#10b981";
          } else if (isSameDay) {
            cardStyle = "padding: 14px; background: rgba(59, 130, 246, 0.08); border: 1.5px solid #3b82f6; border-radius: var(--border-radius-md); text-align: center; display: flex; flex-direction: column; gap: 4px; justify-content: center;";
            badgeHtml = `<span style="font-size: 0.62rem; font-weight: 800; background: #3b82f6; color: white; padding: 2px 6px; border-radius: 10px; margin: 0 auto 4px; text-transform: uppercase;">Solicitado</span>`;
          }

          const card = document.createElement("div");
          card.setAttribute("style", cardStyle);
          card.innerHTML = `
            ${badgeHtml}
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-light);">${itemDateFormatted}</span>
            <span style="font-size: 1.1rem; font-weight: 800; color: ${priceColor};">${item.price || "Sem dados"}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${item.airline || "-"}</span>
          `;
          gridEl.appendChild(card);
        });
      } else {
        gridEl.innerHTML = `<p style="grid-column: 1/-1; text-align: center; font-size: 0.82rem; color: var(--text-muted);">Nenhuma data comparativa encontrada.</p>`;
      }
    }

    // Show Results container
    if (resultsContainer) resultsContainer.classList.remove("hidden");

  } catch (error) {
    if (loadingEl) loadingEl.classList.add("hidden");
    if (errorTextEl) errorTextEl.textContent = error.message;
    if (errorEl) errorEl.classList.remove("hidden");
    console.error("Flight search error:", error);
  }
}


// ==========================================================================
// 4. CHAT SYSTEM & API COMMUNICATION
// ==========================================================================
function renderChatHistory(mode = 'plan') {
  const containerId = mode === 'travel' ? 'travelChatMessages' : 'chatMessages';
  const history = mode === 'travel' ? travelChatHistory : chatHistory;
  const container = document.getElementById(containerId);
  if (!container) return;
  // Keep first default greeting, clear rest
  const firstChild = container.children[0];
  container.innerHTML = "";
  container.appendChild(firstChild);

  history.forEach(msg => {
    // Hide JSON payload block from user in the bubbles
    const cleanContent = stripJsonCodeBlock(msg.content);
    if (cleanContent.trim() || msg.attachment) {
      appendMessageBubble(msg.role, cleanContent, msg.time, mode, msg.attachment);
    }
  });
  if (mode === 'plan') scrollToBottom();
}

function appendMessageBubble(role, text, time, mode = 'plan', attachment = null) {
  const containerId = mode === 'travel' ? 'travelChatMessages' : 'chatMessages';
  const container = document.getElementById(containerId);
  if (!container) return null;
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;
  
  // Format markdown
  const formattedHtml = formatMarkdown(text);
  const displayTime = time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const bubbleClass = (mode === 'travel' && role === 'assistant') ? 'message-bubble travel-bubble' : 'message-bubble';
  
  let attachmentHtml = "";
  if (attachment && attachment.mimeType) {
    if (attachment.mimeType.startsWith("image/")) {
      const imgSrc = attachment.dataUrl || `data:${attachment.mimeType};base64,${attachment.base64}`;
      attachmentHtml = `
        <div class="message-attachment" style="margin-bottom: 8px; max-width: 200px; cursor: pointer;">
          <img src="${imgSrc}" style="width: 100%; max-height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);" onclick="window.openImageLightbox('${imgSrc}')">
        </div>
      `;
    } else {
      // Document or generic file
      attachmentHtml = `
        <div class="message-attachment" style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(255,255,255,0.06); border-radius: 6px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.08);">
          <i class="fa-solid fa-file-lines" style="color: var(--primary);"></i>
          <span style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">${attachment.name || 'documento'}</span>
        </div>
      `;
    }
  }

  msgDiv.innerHTML = `
    <div class="${bubbleClass}">
      ${attachmentHtml}
      ${formattedHtml}
    </div>
    <span class="message-time">${displayTime}</span>
  `;
  container.appendChild(msgDiv);
  return msgDiv;
}

function showTypingIndicator(mode = 'plan') {
  const containerId = mode === 'travel' ? 'travelChatMessages' : 'chatMessages';
  const indicatorId = mode === 'travel' ? 'typingIndicatorTravel' : 'typingIndicator';
  const container = document.getElementById(containerId);
  if (!container) return;
  const msgDiv = document.createElement("div");
  msgDiv.className = "message assistant typing";
  msgDiv.id = indicatorId;
  msgDiv.innerHTML = `
    <div class="message-bubble typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator(mode = 'plan') {
  const indicatorId = mode === 'travel' ? 'typingIndicatorTravel' : 'typingIndicator';
  const indicator = document.getElementById(indicatorId);
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  const container = document.getElementById("chatMessages");
  if (container) container.scrollTop = container.scrollHeight;
}

// Custom Markdown Formatter
function formatMarkdown(text) {
  // Step 1: escape HTML
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Step 2: Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');

  // Step 3: Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Step 4: Italic
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Step 5: Links
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="chat-link">$1 \uD83D\uDD17</a>'
  );

  // Step 6: Tables (lines that start/end with |)
  const tableRegex = /((?:^[ \t]*\|.*\|[ \t]*\n?)+)/gm;
  html = html.replace(tableRegex, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return tableBlock;
    
    // Check if 2nd row is a separator (---|---)
    const isSeparator = (row) => /^[\s|:\-]+$/.test(row);
    
    let headerRow = null;
    let bodyRows = [];
    
    if (rows.length >= 2 && isSeparator(rows[1])) {
      headerRow = rows[0];
      bodyRows = rows.slice(2);
    } else {
      bodyRows = rows;
    }
    
    const parseCells = (row) =>
      row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    
    let tableHtml = '<div class="md-table-wrap"><table class="md-table">';
    
    if (headerRow) {
      const headers = parseCells(headerRow);
      tableHtml += '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
    }
    
    tableHtml += '<tbody>';
    bodyRows.forEach(row => {
      if (isSeparator(row)) return;
      const cells = parseCells(row);
      tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    
    return tableHtml;
  });

  // Step 7: Sub-items with arrow (→ or ->) — render as indented lines
  html = html.replace(/^[ \t]*(?:→|->|&gt;|\u2192)[ \t]+(.*$)/gim,
    '<div class="md-subitem"><span class="md-arrow">&rarr;</span><span>$1</span></div>'
  );

  // Step 8: Bullet points — group consecutive <li> into a single <ul>
  html = html.replace(/^[ \t]*[-*][ \t]+(.*$)/gim, '<li>$1</li>');
  // Wrap consecutive li tags in ul, keeping separation between blocks
  html = html.replace(/(<li>[\s\S]*?<\/li>)((?:\n<li>[\s\S]*?<\/li>)*)/g, (match) => {
    return '<ul class="md-list">' + match + '</ul>';
  });

  // Step 9: Horizontal rules
  html = html.replace(/^---+$/gim, '<hr class="md-hr">');

  // Step 10: Paragraphs — split on double newlines
  const blocks = html.split(/\n{2,}/);
  html = blocks.map(block => {
    const t = block.trim();
    if (!t) return '';
    // Already-wrapped HTML blocks: don't wrap in <p>
    if (/^<(h[1-6]|ul|table|div|hr|p)/.test(t)) return t;
    // Single newlines within a block → <br>
    return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  return html;
}

function stripJsonCodeBlock(text) {
  if (!text) return "";

  // 1. If the entire string is valid JSON, return empty string
  try {
    JSON.parse(text.trim());
    return "";
  } catch (e) {
    // Not a raw JSON string
  }

  // 2. Remove blocks explicitly marked as json/JSON
  let cleaned = text.replace(/```\s*json\s*[\s\S]*?```/gi, "");
  
  // 3. Also remove any code blocks that are valid JSON
  const genericCodeBlockRegex = /```[\s\S]*?```/g;
  const matches = cleaned.match(genericCodeBlockRegex);
  if (matches) {
    for (const block of matches) {
      const contentMatch = block.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (contentMatch) {
        try {
          JSON.parse(contentMatch[1].trim());
          cleaned = cleaned.replace(block, "");
        } catch (e) {
          // Keep it
        }
      }
    }
  }
  return cleaned.trim();
}

function extractJsonFromReply(replyContent) {
  if (!replyContent) return null;

  // 1. Try to find code blocks explicitly marked as json/JSON (case-insensitive, optional spaces)
  const jsonRegex = /```\s*json\s*[\s\S]*?```/i;
  const match = replyContent.match(jsonRegex);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch (e) {
      console.warn("Failed to parse matched JSON block:", e);
    }
  }

  // 2. If no explicit json block, find all code blocks and try to parse them
  const genericCodeBlockRegex = /```[\s\S]*?```/g;
  const allBlocks = replyContent.match(genericCodeBlockRegex);
  if (allBlocks) {
    for (const block of allBlocks) {
      const contentMatch = block.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (contentMatch) {
        const potentialJson = contentMatch[1].trim();
        try {
          return JSON.parse(potentialJson);
        } catch (e) {
          // Keep looking
        }
      }
    }
  }

  // 3. Fallback: try parsing the whole string
  try {
    return JSON.parse(replyContent.trim());
  } catch (e) {
    // No valid JSON
  }

  return null;
}


// Sending and Receiving Message (Planning Chat)
async function handleUserSendMessage() {
  const chatInput = document.getElementById("chatInput");
  const text = chatInput.value.trim();
  
  const currentAttachment = planAttachment;
  if (!text && !currentAttachment) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Clear attachment state and reset UI preview
  clearAttachment('plan');

  // Render user bubble
  const userMsgEl = appendMessageBubble("user", text, timeStr, 'plan', currentAttachment);
  chatInput.value = "";
  chatInput.style.height = "auto";
  
  if (userMsgEl) {
    const container = document.getElementById("chatMessages");
    container.scrollTo({ top: userMsgEl.offsetTop - 10, behavior: "smooth" });
  }

  const userMsgObject = { role: "user", content: text, time: timeStr };
  if (currentAttachment) {
    userMsgObject.attachment = {
      mimeType: currentAttachment.mimeType,
      base64: currentAttachment.base64
    };
  }
  chatHistory.push(userMsgObject);
  saveState();

  if (!navigator.onLine) {
    const replyTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const offlineReply = `📴 **Modo Offline Ativado:** Identifiquei que você está sem conexão com a internet no momento. O assistente de Inteligência Artificial precisa de conexão para processar mensagens e atualizar o roteiro. \n\nNo entanto, **todo o restante do aplicativo está disponível offline!** Você pode visualizar e editar seu cronograma, mala de viagem, logística de voos e controle de gastos. Suas alterações serão guardadas localmente e sincronizadas assim que a internet retornar.`;
    const assistantMsgEl = appendMessageBubble("assistant", offlineReply, replyTime, 'plan');
    if (assistantMsgEl) {
      const container = document.getElementById("chatMessages");
      container.scrollTo({ top: assistantMsgEl.offsetTop - 10, behavior: "smooth" });
    }
    chatHistory.push({ role: "assistant", content: offlineReply, time: replyTime });
    saveState();
    return;
  }

  showTypingIndicator('plan');

  try {
    const token = await getFreshToken();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ 
        messages: chatHistory, 
        travelMode: false,
        tripContext: {
          hotel: tripData.infoHotel,
          hotelLink: tripData.hotelLink,
          flights: tripData.flights,
          budget: tripData.budget,
          dates: tripData.infoDates,
          destination: tripData.tripTitle
        }
      })
    });

    if (response.status === 401 || response.status === 403) {
      const errData = await response.json().catch(() => ({}));
      removeTypingIndicator('plan');
      appendMessageBubble("assistant", `⚠️ **Acesso Não Autorizado:** ${errData.error || "Seu e-mail não está cadastrado."}`, null, 'plan');
      return;
    }
    if (!response.ok) {
      // Read the server's JSON error body before throwing so we can surface it
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro ${response.status} na comunicação com o servidor.`);
    }

    const data = await response.json();
    removeTypingIndicator('plan');
    if (data.error) { appendMessageBubble("assistant", `⚠️ Erro: ${data.error}`, null, 'plan'); return; }

    const replyContent = data.content;
    const parsedData = extractJsonFromReply(replyContent);
    if (parsedData) {
      try { updateDashboardData(parsedData); } catch (err) { console.warn(err); }
    }

    const cleanReply = stripJsonCodeBlock(replyContent);
    const replyTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const assistantMsgEl = appendMessageBubble("assistant", cleanReply, replyTime, 'plan');
    if (assistantMsgEl) {
      const container = document.getElementById("chatMessages");
      container.scrollTo({ top: assistantMsgEl.offsetTop - 10, behavior: "smooth" });
    }
    chatHistory.push({ role: "assistant", content: replyContent, time: replyTime });
    saveState();

  } catch (error) {
    removeTypingIndicator('plan');
    appendMessageBubble("assistant", `❌ ${error.message}`, null, 'plan');
    console.error("Chat error:", error);
  }
}

// Sending and Receiving Message (Travel Chat)
async function handleTravelSendMessage() {
  const input = document.getElementById("travelChatInput");
  const text = input.value.trim();
  
  const currentAttachment = travelAttachment;
  if (!text && !currentAttachment) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Clear attachment state and reset UI preview
  clearAttachment('travel');

  const userMsgEl = appendMessageBubble("user", text, timeStr, 'travel', currentAttachment);
  input.value = "";
  input.style.height = "auto";
  if (userMsgEl) {
    const container = document.getElementById("travelChatMessages");
    container.scrollTo({ top: userMsgEl.offsetTop - 10, behavior: "smooth" });
  }

  const userMsgObject = { role: "user", content: text, time: timeStr };
  if (currentAttachment) {
    userMsgObject.attachment = {
      mimeType: currentAttachment.mimeType,
      base64: currentAttachment.base64
    };
  }
  travelChatHistory.push(userMsgObject);
  saveState();

  if (!navigator.onLine) {
    const replyTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const offlineReply = `📴 **Modo Offline Ativado:** Identifiquei que você está sem conexão com a internet no momento. O assistente de Inteligência Artificial precisa de conexão para responder e atualizar as informações de viagem. \n\nNo entanto, **todo o restante do aplicativo está disponível offline!** Você pode visualizar e editar seu cronograma, mala de viagem, logística de voos e controle de gastos. Suas alterações serão guardadas localmente e sincronizadas assim que a internet retornar.`;
    const assistantMsgEl = appendMessageBubble("assistant", offlineReply, replyTime, 'travel');
    if (assistantMsgEl) {
      const container = document.getElementById("travelChatMessages");
      container.scrollTo({ top: assistantMsgEl.offsetTop - 10, behavior: "smooth" });
    }
    travelChatHistory.push({ role: "assistant", content: offlineReply, time: replyTime });
    saveState();
    return;
  }

  showTypingIndicator('travel');

  try {
    const token = await getFreshToken();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ 
        messages: travelChatHistory, 
        travelMode: true,
        tripContext: {
          hotel: tripData.infoHotel,
          hotelLink: tripData.hotelLink,
          flights: tripData.flights,
          budget: tripData.budget,
          dates: tripData.infoDates,
          destination: tripData.tripTitle
        }
      })
    });

    if (response.status === 401 || response.status === 403) {
      const errData = await response.json().catch(() => ({}));
      removeTypingIndicator('travel');
      appendMessageBubble("assistant", `⚠️ **Acesso Não Autorizado:** ${errData.error || "Seu e-mail não está cadastrado."}`, null, 'travel');
      return;
    }
    if (!response.ok) {
      // Read the server's JSON error body before throwing so we can surface it
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro ${response.status} na comunicação com o servidor.`);
    }

    const data = await response.json();
    removeTypingIndicator('travel');
    if (data.error) { appendMessageBubble("assistant", `⚠️ Erro: ${data.error}`, null, 'travel'); return; }

    const replyContent = data.content;
    const parsedData = extractJsonFromReply(replyContent);
    if (parsedData) {
      try { updateDashboardData(parsedData); } catch (err) { console.warn(err); }
    }

    const cleanReply = stripJsonCodeBlock(replyContent);
    const replyTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const assistantMsgEl = appendMessageBubble("assistant", cleanReply, replyTime, 'travel');
    if (assistantMsgEl) {
      const container = document.getElementById("travelChatMessages");
      container.scrollTo({ top: assistantMsgEl.offsetTop - 10, behavior: "smooth" });
    }
    travelChatHistory.push({ role: "assistant", content: replyContent, time: replyTime });
    saveState();

  } catch (error) {
    removeTypingIndicator('travel');
    appendMessageBubble("assistant", `❌ ${error.message}`, null, 'travel');
    console.error("Travel chat error:", error);
  }
}

// ==========================================================================
// 5. DASHBOARD STATE SYNC & RENDERING
// ==========================================================================
function updateDashboardData(newJson) {
  if (newJson.tripTitle) tripData.tripTitle = newJson.tripTitle;
  if (newJson.tripSubtitle) tripData.tripSubtitle = newJson.tripSubtitle;
  if (newJson.infoDates) tripData.infoDates = newJson.infoDates;
  if (newJson.infoWeather) tripData.infoWeather = newJson.infoWeather;
  if (newJson.infoGroup) tripData.infoGroup = newJson.infoGroup;
  if (newJson.infoHotel) tripData.infoHotel = newJson.infoHotel;
  if (newJson.hotelLink) tripData.hotelLink = newJson.hotelLink;
  if (newJson.targetDate) tripData.targetDate = newJson.targetDate;
  
  if (newJson.budget) {
    tripData.budget.hospedagem = newJson.budget.hospedagem || 0;
    tripData.budget.alimentacao = newJson.budget.alimentacao || 0;
    tripData.budget.passeios = newJson.budget.passeios || 0;
    tripData.budget.compras = newJson.budget.compras || 0;
  }

  if (newJson.budgetAnalysis !== undefined) {
    tripData.budgetAnalysis = newJson.budgetAnalysis;
  }
  if (newJson.budgetThresholds !== undefined) {
    tripData.budgetThresholds = newJson.budgetThresholds;
  }

  if (newJson.packing) tripData.packing = newJson.packing;
  if (newJson.itinerary) tripData.itinerary = newJson.itinerary;
  if (newJson.flights) tripData.flights = newJson.flights;

  // Persist State
  saveState();

  // Re-render
  setupCountdown();
  renderDashboard();
}

function renderDashboard() {
  // 1. Text Info Fields
  document.getElementById("tripTitle").textContent = tripData.tripTitle;
  document.getElementById("tripSubtitle").textContent = tripData.tripSubtitle;
  document.getElementById("infoDates").textContent = tripData.infoDates;
  document.getElementById("infoWeather").textContent = tripData.infoWeather;
  document.getElementById("infoGroup").textContent = tripData.infoGroup;

  // Hotel card — show as clickable link if URL exists
  const infoHotelEl = document.getElementById("infoHotel");
  if (tripData.hotelLink && tripData.hotelLink.startsWith('http')) {
    infoHotelEl.innerHTML = `<a href="${tripData.hotelLink}" target="_blank" rel="noopener noreferrer" class="hotel-link">${tripData.infoHotel} 🔗</a>`;
  } else {
    infoHotelEl.textContent = tripData.infoHotel;
  }

  // Populate hotel input fields in Logistics tab
  const hotelNameInput = document.getElementById("hotelNameInput");
  const hotelLinkInput = document.getElementById("hotelLinkInput");
  if (hotelNameInput) {
    hotelNameInput.value = (tripData.infoHotel && tripData.infoHotel !== "A definir") ? tripData.infoHotel : "";
  }
  if (hotelLinkInput) {
    hotelLinkInput.value = tripData.hotelLink || "";
  }

  // 2. Budget Sliders Setup
  document.getElementById("slideHospedagem").value = tripData.budget.hospedagem;
  document.getElementById("slideAlimentacao").value = tripData.budget.alimentacao;
  document.getElementById("slidePasseios").value = tripData.budget.passeios;
  document.getElementById("slideCompras").value = tripData.budget.compras;
  updateBudget();

  // 3. Render Timeline
  renderTimeline();

  // 4. Render Packing List
  renderPackingChecklist();

  // 4b. Render Documents List
  renderDocuments();

  // 4c. Render Flights List
  renderFlights();

  // 5. Check itinerary state to show banner/nav glow
  checkItineraryStatus();
}

// Timeline dia a dia
function renderTimeline() {
  const container = document.getElementById("timelineContainer");
  const nav = document.getElementById("timelineNav");
  const emptyState = document.getElementById("timelineEmpty");

  if (!tripData.itinerary || tripData.itinerary.length === 0) {
    emptyState.classList.remove("hidden");
    nav.classList.add("hidden");
    container.classList.add("hidden");
    const optBanner = document.getElementById("itineraryOptimizationBanner");
    if (optBanner) optBanner.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  nav.classList.remove("hidden");
  container.classList.remove("hidden");

  // Default to first day on mobile devices to prevent DOM load lags
  if (activeFilter === 'all' && window.innerWidth <= 768 && tripData.itinerary && tripData.itinerary.length > 0) {
    activeFilter = tripData.itinerary[0].dayNum || 1;
  }
  
  const optBanner = document.getElementById("itineraryOptimizationBanner");
  if (optBanner) {
    const hasFlights = tripData.flights && tripData.flights.length > 0;
    const hasHotel = tripData.infoHotel && tripData.infoHotel !== "A definir" && tripData.infoHotel.trim() !== "";
    if (hasFlights && hasHotel) {
      optBanner.classList.add("hidden");
    } else {
      optBanner.classList.remove("hidden");
    }
  }

  // Sanitize activities for location/address mismatches dynamically before rendering
  const destCity = getDestinationSuffix();
  if (destCity && tripData.itinerary && tripData.itinerary.length > 0) {
    tripData.itinerary.forEach(day => {
      if (day.activities && day.activities.length > 0) {
        day.activities.forEach(act => {
          if (act.title) {
            act.title = sanitizeActivityLocation(act.title, destCity);
          }
        });
      }
    });
  }

  // Re-render Nav Tabs
  nav.innerHTML = `<button class="timeline-btn ${activeFilter === 'all' ? 'active' : ''}" onclick="filterTimeline('all')">Todos os Dias</button>`;
  
  container.innerHTML = "";

  // Helper to classify turn
  const getTurnForActivity = (act, idx, total) => {
    if (!act.time || act.time === '--:--') {
      if (total === 1) return 'manha';
      if (total === 2) return idx === 0 ? 'manha' : 'tarde';
      if (idx === 0) return 'manha';
      if (idx === 1) return 'tarde';
      return 'noite';
    }
    const hourPart = parseInt(act.time.split(":")[0]);
    if (isNaN(hourPart)) {
      if (idx === 0) return 'manha';
      if (idx === 1) return 'tarde';
      return 'noite';
    }
    if (hourPart >= 5 && hourPart < 12) return 'manha';
    if (hourPart >= 12 && hourPart < 18) return 'tarde';
    return 'noite';
  };

  // Helper to generate Google Maps link
  const getGoogleMapsRouteLink = (turnActs) => {
    if (!turnActs || turnActs.length === 0) return "#";
    const destSuffix = getDestinationSuffix();
    const locations = turnActs.map(act => {
      let loc = act.title.trim();
      if (destSuffix) loc += `, ${destSuffix}`;
      return encodeURIComponent(loc);
    });

    if (locations.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${locations[0]}`;
    }
    const origin = locations[0];
    const destination = locations[locations.length - 1];
    if (locations.length === 2) {
      return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    }
    const waypoints = locations.slice(1, -1).join("|");
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}`;
  };

  tripData.itinerary.forEach(day => {
    // Add Nav Button
    nav.innerHTML += `<button class="timeline-btn ${activeFilter == day.dayNum ? 'active' : ''}" onclick="filterTimeline(${day.dayNum})">Dia ${day.dayNum}</button>`;

    if (activeFilter !== 'all' && activeFilter != day.dayNum) return;

    // Group activities by turn or render chronologically in calendar view
    let activitiesHtml = "";
    if (day.activities && day.activities.length > 0) {
      if (itineraryViewMode === 'calendar') {
        const parseTime = (timeStr) => {
          if (!timeStr || timeStr === '--:--') return 9999;
          const parts = timeStr.split(':');
          const h = parseInt(parts[0]);
          const m = parseInt(parts[1]);
          if (isNaN(h) || isNaN(m)) return 9999;
          return h * 60 + m;
        };

        const sortedActivities = [...day.activities].sort((a, b) => parseTime(a.time) - parseTime(b.time));
        let calendarActsHtml = "";
        
        sortedActivities.forEach(act => {
          let bookingHtml = "";
          if (act.booking) {
            const platform = act.booking.platform || 'civitatis';
            const text = act.booking.suggestedText || 'Reservar ingresso online';
            let link = '#';
            const query = encodeURIComponent(act.booking.searchQuery || act.title);
            if (platform.toLowerCase() === 'civitatis') {
              link = `https://www.civitatis.com/br/busca/?q=${query}&aid=10433`;
            } else if (platform.toLowerCase() === 'getyourguide') {
              link = `https://www.getyourguide.com/s?q=${query}&partner_id=L9P64H5`;
            } else if (platform.toLowerCase() === 'booking') {
              link = `https://www.booking.com/searchresults.html?ss=${query}&aid=2311224`;
            }
            
            const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
            
            bookingHtml = `
              <div class="affiliate-widget" onclick="event.stopPropagation()">
                <div class="affiliate-header">
                  <h5 class="affiliate-title">
                    <i class="fa-solid fa-ticket" style="color: var(--secondary);"></i>
                    Recomendado para Conforto
                  </h5>
                  <div class="affiliate-badges">
                    <span class="affiliate-badge ${platform.toLowerCase()}">${platformLabel}</span>
                    <span class="affiliate-badge trust"><i class="fa-solid fa-shield-check"></i> Seguro</span>
                  </div>
                </div>
                <p class="affiliate-desc">Evite filas e garanta seu lugar com antecedência através de parceiros oficiais.</p>
                <a href="${link}" target="_blank" class="affiliate-btn ${platform.toLowerCase()}-btn">
                  <i class="fa-solid fa-arrow-up-right-from-square"></i> ${text}
                </a>
                <div class="affiliate-footer">
                  <i class="fa-solid fa-circle-check"></i> Cancelamento grátis disponível • Garantia do menor preço
                </div>
              </div>
            `;
          }

          calendarActsHtml += `
            <div class="calendar-activity-item" onclick="event.stopPropagation()">
              <div class="calendar-time-bullet"></div>
              <div class="calendar-activity-card">
                <div class="calendar-activity-time-label">
                  <i class="fa-regular fa-clock"></i> ${act.time || '--:--'}
                </div>
                <h4>${act.title}</h4>
                <p>${act.desc}</p>
                ${bookingHtml}
              </div>
            </div>
          `;
        });

        activitiesHtml = `
          <div class="calendar-timeline">
            ${calendarActsHtml}
          </div>
        `;
      } else {
        const turns = {
          manha: [],
          tarde: [],
          noite: []
        };

        day.activities.forEach((act, idx) => {
          const turn = getTurnForActivity(act, idx, day.activities.length);
          turns[turn].push(act);
        });

        // Render each turn group
        const turnConfigs = [
          { key: 'manha', label: 'Manhã', icon: 'fa-cloud-sun' },
          { key: 'tarde', label: 'Tarde', icon: 'fa-sun' },
          { key: 'noite', label: 'Noite', icon: 'fa-moon' }
        ];

        turnConfigs.forEach(cfg => {
          const turnActs = turns[cfg.key];
          if (turnActs && turnActs.length > 0) {
            const routeLink = getGoogleMapsRouteLink(turnActs);
            let turnActsHtml = "";
            
            turnActs.forEach(act => {
              let bookingHtml = "";
              if (act.booking) {
                const platform = act.booking.platform || 'civitatis';
                const text = act.booking.suggestedText || 'Reservar ingresso online';
                let link = '#';
                const query = encodeURIComponent(act.booking.searchQuery || act.title);
                if (platform.toLowerCase() === 'civitatis') {
                  link = `https://www.civitatis.com/br/busca/?q=${query}&aid=10433`;
                } else if (platform.toLowerCase() === 'getyourguide') {
                  link = `https://www.getyourguide.com/s?q=${query}&partner_id=L9P64H5`;
                } else if (platform.toLowerCase() === 'booking') {
                  link = `https://www.booking.com/searchresults.html?ss=${query}&aid=2311224`;
                }
                
                const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
                
                bookingHtml = `
                  <div class="affiliate-widget" onclick="event.stopPropagation()">
                    <div class="affiliate-header">
                      <h5 class="affiliate-title">
                        <i class="fa-solid fa-ticket" style="color: var(--secondary);"></i>
                        Recomendado para Conforto
                      </h5>
                      <div class="affiliate-badges">
                        <span class="affiliate-badge ${platform.toLowerCase()}">${platformLabel}</span>
                        <span class="affiliate-badge trust"><i class="fa-solid fa-shield-check"></i> Seguro</span>
                      </div>
                    </div>
                    <p class="affiliate-desc">Evite filas e garanta seu lugar com antecedência através de parceiros oficiais.</p>
                    <a href="${link}" target="_blank" class="affiliate-btn ${platform.toLowerCase()}-btn">
                      <i class="fa-solid fa-arrow-up-right-from-square"></i> ${text}
                    </a>
                    <div class="affiliate-footer">
                      <i class="fa-solid fa-circle-check"></i> Cancelamento grátis disponível • Garantia do menor preço
                    </div>
                  </div>
                `;
              }

              turnActsHtml += `
                <div class="activity-block">
                  <div class="activity-time">${act.time || '--:--'}</div>
                  <div class="activity-details">
                    <h4>${act.title}</h4>
                    <p>${act.desc}</p>
                    ${bookingHtml}
                  </div>
                </div>
              `;
            });

            activitiesHtml += `
              <div class="timeline-turn-group" onclick="event.stopPropagation()">
                <div class="turn-header-row">
                  <h4 class="turn-title"><i class="fa-solid ${cfg.icon}"></i> ${cfg.label}</h4>
                  <a href="${routeLink}" target="_blank" class="btn-turn-route" onclick="event.stopPropagation()"><i class="fa-solid fa-map-location-dot"></i> Veja no mapa</a>
                </div>
                <div class="turn-activities">
                  ${turnActsHtml}
                </div>
              </div>
            `;
          }
        });
      }
    }
    const dayRouteLink = getGoogleMapsRouteLink(day.activities);
    const card = document.createElement("div");
    card.className = "timeline-item";
    card.innerHTML = `
      <div class="timeline-bullet"></div>
      <div class="glass-panel timeline-card" onclick="toggleCard(this)">
        <div class="timeline-header">
          <span class="timeline-day">DIA ${day.dayNum} - ${day.dayTitle || 'Explorações'}</span>
          <span class="timeline-date">${day.date || ''}</span>
        </div>
        <h3><i class="fa-solid fa-compass" style="color: var(--secondary); margin-right: 8px;"></i> Programação Recomendada</h3>
        
        <div class="timeline-expandable">
          ${day.activities && day.activities.length > 0 ? `
          <div style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
            <a href="${dayRouteLink}" target="_blank" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.76rem; background: rgba(59, 130, 246, 0.1); border: 1.5px solid var(--primary); padding: 8px 16px; border-radius: var(--border-radius-md); color: white;" onclick="event.stopPropagation()">
              <i class="fa-solid fa-map-location-dot" style="color: var(--primary);"></i> Ver Rota do Dia Completa no GPS 🗺️
            </a>
          </div>
          ` : ''}
          ${activitiesHtml}
          
          <div class="timeline-footer-details">
            <div class="footer-detail-item">
              <i class="fa-solid fa-bed footer-detail-icon"></i>
              <div class="footer-detail-text">
                <h5>HOSPEDAGEM</h5>
                <p>${day.hotel || tripData.infoHotel || 'N/A'}</p>
              </div>
            </div>
            <div class="footer-detail-item">
              <i class="fa-solid fa-utensils footer-detail-icon"></i>
              <div class="footer-detail-text">
                <h5>REFEIÇÃO</h5>
                <p>${day.restaurant || 'Livre'}</p>
              </div>
            </div>
            <div class="footer-detail-item">
              <i class="fa-solid fa-car footer-detail-icon"></i>
              <div class="footer-detail-text">
                <h5>TRANSPORTE</h5>
                <p>${day.transport || 'Público / Uber'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function toggleCard(cardElement) {
  cardElement.classList.toggle("expanded");
}

window.toggleCard = toggleCard; // Bind to window so HTML onclick finds it
window.switchTab = switchTab; // Bind to window so HTML onclick finds it

function filterTimeline(filter) {
  activeFilter = filter;
  renderTimeline();
  // Scroll to the first visible day card after a short paint delay
  if (filter !== 'all') {
    setTimeout(() => {
      const firstCard = document.querySelector('.timeline-day-card');
      if (firstCard) {
        firstCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  }
}
window.filterTimeline = filterTimeline;

// Budget Conic-gradient calculator
function updateBudget() {
  const slideHospedagem = parseInt(document.getElementById("slideHospedagem").value);
  const slideAlimentacao = parseInt(document.getElementById("slideAlimentacao").value);
  const slidePasseios = parseInt(document.getElementById("slidePasseios").value);
  const slideCompras = parseInt(document.getElementById("slideCompras").value);

  // Update slider label texts
  document.getElementById("labelHospedagem").textContent = `R$ ${slideHospedagem.toLocaleString("pt-BR")}`;
  document.getElementById("labelAlimentacao").textContent = `R$ ${slideAlimentacao.toLocaleString("pt-BR")}`;
  document.getElementById("labelPasseios").textContent = `R$ ${slidePasseios.toLocaleString("pt-BR")}`;
  document.getElementById("labelCompras").textContent = `R$ ${slideCompras.toLocaleString("pt-BR")}`;

  // Sum total
  const total = slideHospedagem + slideAlimentacao + slidePasseios + slideCompras;
  document.getElementById("budgetTotal").textContent = `R$ ${total.toLocaleString("pt-BR")}`;

  // Percentages
  const pctHospedagem = total > 0 ? Math.round((slideHospedagem / total) * 100) : 0;
  const pctAlimentacao = total > 0 ? Math.round((slideAlimentacao / total) * 100) : 0;
  const pctPasseios = total > 0 ? Math.round((slidePasseios / total) * 100) : 0;
  const pctCompras = total > 0 ? 100 - (pctHospedagem + pctAlimentacao + pctPasseios) : 0;

  document.getElementById("pctHospedagem").textContent = `${pctHospedagem}%`;
  document.getElementById("pctAlimentacao").textContent = `${pctAlimentacao}%`;
  document.getElementById("pctPasseios").textContent = `${pctPasseios}%`;
  document.getElementById("pctCompras").textContent = `${pctCompras}%`;

  // Draw conic donut chart
  const deg1 = pctHospedagem;
  const deg2 = deg1 + pctAlimentacao;
  const deg3 = deg2 + pctPasseios;

  const donut = document.getElementById("budgetDonut");
  donut.style.background = `conic-gradient(
    var(--primary) 0% ${deg1}%,
    var(--secondary) ${deg1}% ${deg2}%,
    var(--accent) ${deg2}% ${deg3}%,
    var(--text-muted) ${deg3}% 100%
  )`;

  // Dynamic budget thresholds and daily average calculations
  const thresholds = tripData.budgetThresholds || { economico: 150, intermediario: 450 };
  const limEco = thresholds.economico || 150;
  const limInt = thresholds.intermediario || 450;

  const numDays = (tripData.itinerary && tripData.itinerary.length > 0) ? tripData.itinerary.length : 1;
  const dailyAvg = total / numDays;

  // Budget mode label based on daily average relative to destination thresholds
  const budgetModes = [
    { max: limEco * 0.6,    label: '🔴 Ultra Econômico',  color: '#ef4444' },
    { max: limEco,          label: '🟠 Econômico',         color: '#f97316' },
    { max: limInt,          label: '🟡 Confortável',        color: '#eab308' },
    { max: limInt * 2,      label: '🟢 Premium',            color: '#22c55e' },
    { max: Infinity,        label: '✨ Luxo',            color: '#f59e0b' },
  ];
  const mode = budgetModes.find(m => dailyAvg <= m.max);
  const modeEl = document.getElementById('budgetModeLabel');
  if (modeEl) {
    modeEl.textContent = mode.label;
    modeEl.style.color = mode.color;
    modeEl.style.borderColor = mode.color + '44';
    modeEl.style.background = mode.color + '18';
  }

  // Dynamic budget cost analysis
  const hasItinerary = tripData.itinerary && tripData.itinerary.length > 0;
  const analysisCard = document.getElementById("budgetAnalysisCard");
  
  if (analysisCard) {
    if (hasItinerary) {
      analysisCard.classList.remove("hidden");
      
      const numMembers = tripData.members ? tripData.members.length : 1;
      const groupTotal = total * numMembers;
      
      document.getElementById("budgetDailyAvg").textContent = `R$ ${Math.round(dailyAvg).toLocaleString("pt-BR")} / dia`;
      document.getElementById("budgetDaysCount").textContent = numDays;
      
      document.getElementById("budgetGroupTotal").textContent = `R$ ${Math.round(groupTotal).toLocaleString("pt-BR")}`;
      document.getElementById("budgetGroupCount").textContent = numMembers;
      
      // Handle AI budget analysis display
      const aiAnalysisBlock = document.getElementById("aiBudgetAnalysisBlock");
      const budgetAiAnalysisText = document.getElementById("budgetAiAnalysisText");
      
      if (aiAnalysisBlock && budgetAiAnalysisText) {
        if (tripData.budgetAnalysis) {
          aiAnalysisBlock.style.display = "flex";
          budgetAiAnalysisText.innerHTML = tripData.budgetAnalysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        } else {
          aiAnalysisBlock.style.display = "none";
        }
      }
      
      // Dynamic feedback text based on daily average cost per person relative to local thresholds
      let feedback = "";
      if (total === 0) {
        feedback = "Mova os sliders acima para ver as estimativas diárias e dicas do consultor para a sua viagem.";
      } else if (dailyAvg < limEco) {
        feedback = `Você propôs um estilo **Econômico** (Mochilão) para este destino (menos de R$ ${limEco.toLocaleString("pt-BR")}/dia). Dica do GPT: utilize transporte público e priorize alimentação em pequenos mercados ou feiras locais.`;
      } else if (dailyAvg <= limInt) {
        feedback = `Você propôs um estilo **Intermediário** (Custo-benefício) para este destino (de R$ ${limEco.toLocaleString("pt-BR")}/dia a R$ ${limInt.toLocaleString("pt-BR")}/dia). Esta faixa é super realista para garantir conforto básico sem gastar demais. Dica: mescle refeições em restaurantes locais com lanches simples.`;
      } else {
        feedback = `Você propôs um estilo **Premium / Luxo** para este destino (mais de R$ ${limInt.toLocaleString("pt-BR")}/dia). Excelente para aproveitar passeios exclusivos, gastronomia de alto nível e hotelaria diferenciada. Dica: lembre-se de reservar restaurantes renomados com bastante antecedência!`;
      }
      
      document.getElementById("budgetFeedbackText").innerHTML = feedback.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
    } else {
      analysisCard.classList.add("hidden");
    }
  }

  // Save budget changes in state
  tripData.budget.hospedagem = slideHospedagem;
  tripData.budget.alimentacao = slideAlimentacao;
  tripData.budget.passeios = slidePasseios;
  tripData.budget.compras = slideCompras;
  localStorage.setItem(getUserStorageKey("gptViajante_tripData"), JSON.stringify(tripData));
}
window.updateBudget = updateBudget;

// Packing Checklist
function renderPackingChecklist() {
  const container = document.getElementById("packingContainer");
  const emptyState = document.getElementById("packingEmpty");
  const categoriesDiv = document.getElementById("packingCategories");

  if (!tripData.packing || tripData.packing.length === 0) {
    emptyState.classList.remove("hidden");
    container.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  container.classList.remove("hidden");

  // Set checklist title dynamically
  const titleTextEl = document.getElementById("packingTripTitleText");
  if (titleTextEl) {
    const baseTitle = tripData.tripTitle || "Mala de Viagem";
    let titleParts = [baseTitle];
    if (tripData.infoDates && tripData.infoDates !== "A definir") {
      titleParts.push(tripData.infoDates);
    }
    if (tripData.itinerary && tripData.itinerary.length > 0) {
      titleParts.push(`${tripData.itinerary.length} ${tripData.itinerary.length === 1 ? 'dia' : 'dias'}`);
    }
    titleTextEl.textContent = titleParts.join(" - ");
  }

  categoriesDiv.innerHTML = "";

  // Packing list checkboxes state loaded from LocalStorage
  const savedState = localStorage.getItem(getUserStorageKey("gptViajante_packingState"));
  const checkedItems = savedState ? JSON.parse(savedState) : {};

  tripData.packing.forEach((cat, catIdx) => {
    const catSection = document.createElement("div");
    catSection.className = "packing-category";
    
    // Choose icon based on category name
    let iconClass = "fa-suitcase";
    const catNameLower = cat.category.toLowerCase();
    if (catNameLower.includes("doc") || catNameLower.includes("pass")) iconClass = "fa-passport";
    else if (catNameLower.includes("eletr") || catNameLower.includes("cab")) iconClass = "fa-laptop";
    else if (catNameLower.includes("vest") || catNameLower.includes("roup")) iconClass = "fa-shirt";
    else if (catNameLower.includes("hig") || catNameLower.includes("saud")) iconClass = "fa-kit-medical";

    let itemsHtml = "";
    if (cat.items) {
      cat.items.forEach((item, itemIdx) => {
        const uniqueId = `pack-${catIdx}-${itemIdx}`;
        const isChecked = checkedItems[uniqueId] ? "checked" : "";
        itemsHtml += `
          <label class="packing-item">
            <input type="checkbox" class="packing-checkbox" id="${uniqueId}" ${isChecked} ${isSharedView ? 'disabled' : ''} onchange="saveChecklistState()">
            <span class="packing-item-text">${item}</span>
          </label>
        `;
      });
    }

    catSection.innerHTML = `
      <h3 class="packing-category-header"><i class="fa-solid ${iconClass}" style="color: var(--secondary); margin-right: 8px;"></i> ${cat.category}</h3>
      <div class="packing-list">
        ${itemsHtml}
      </div>
    `;
    categoriesDiv.appendChild(catSection);
  });

  updateChecklistProgress();
}

function saveChecklistState() {
  const checkboxes = document.querySelectorAll(".packing-checkbox");
  const checkedItems = {};

  checkboxes.forEach(cb => {
    checkedItems[cb.id] = cb.checked;
  });

  localStorage.setItem(getUserStorageKey("gptViajante_packingState"), JSON.stringify(checkedItems));
  updateChecklistProgress();
}
window.saveChecklistState = saveChecklistState;

function updateChecklistProgress() {
  const checkboxes = document.querySelectorAll(".packing-checkbox");
  const total = checkboxes.length;
  const checked = document.querySelectorAll(".packing-checkbox:checked").length;

  const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;

  document.getElementById("packingProgressFill").style.width = `${percentage}%`;
  document.getElementById("packingProgressText").innerHTML = `
    <strong>${checked}</strong> de <strong>${total}</strong> itens guardados na mala (${percentage}%)
  `;
}

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function renderDocuments() {
  const container = document.getElementById("documentsList");
  const emptyState = document.getElementById("documentsEmpty");
  if (!container || !emptyState) return;

  const docs = tripData.documents || [];
  if (docs.length === 0) {
    emptyState.classList.remove("hidden");
    container.innerHTML = "";
    return;
  }

  emptyState.classList.add("hidden");
  
  container.innerHTML = docs.map(doc => {
    const iconClass = doc.type === 'pdf' ? 'fa-file-pdf' : 'fa-file-image';
    const typeClass = doc.type === 'pdf' ? 'pdf' : 'image';
    return `
      <div class="document-item">
        <div style="display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1;">
          <div class="doc-type-icon ${typeClass}">
            <i class="fa-solid ${iconClass}"></i>
          </div>
          <div style="min-width: 0;">
            <h4 style="font-size: 0.88rem; font-weight: 700; margin: 0; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${doc.name}</h4>
            <p style="font-size: 0.74rem; color: var(--text-muted); margin: 3px 0 0 0;">
              <span style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-right: 6px; color: var(--text-light); text-transform: uppercase; font-size: 0.65rem;">${doc.category}</span>
              ${doc.size} • ${doc.date}
            </p>
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;">
          <button class="btn btn-secondary btn-sm" style="padding: 6px 12px; font-size: 0.78rem;" onclick="viewDocument('${doc.id}')">
            <i class="fa-solid fa-eye"></i> Ver
          </button>
          ${isSharedView ? '' : `
          <button class="flight-action-btn delete" style="padding: 8px;" onclick="deleteDocument('${doc.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
          `}
        </div>
      </div>
    `;
  }).reverse().join(""); // Show newest first
}

function setupDocumentListeners() {
  const fileInput = document.getElementById("documentFileInput");
  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      alert("⚠️ Arquivo muito grande. O limite máximo de upload é 4MB.");
      fileInput.value = "";
      return;
    }

    if (!currentUser || !currentUser.id) {
      alert("⚠️ Você precisa estar logado para enviar documentos.");
      return;
    }

    if (!tripData.id) {
      alert("⚠️ Você precisa de uma viagem ativa para enviar documentos.");
      return;
    }

    const categorySelect = document.getElementById("documentCategorySelect");
    const category = categorySelect ? categorySelect.value : "Outros";

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `${currentUser.id}/${tripData.id}/${fileName}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('boarding-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('boarding-documents')
        .getPublicUrl(filePath);

      const { data: docData, error: dbErr } = await supabase
        .from('documents')
        .insert({
          trip_id: tripData.id,
          name: file.name,
          category: category,
          file_url: publicUrl
        })
        .select()
        .single();

      if (dbErr) throw dbErr;

      const newDoc = {
        id: docData.id,
        name: docData.name,
        type: file.type.includes("pdf") ? "pdf" : "image",
        category: docData.category,
        url: docData.file_url,
        date: new Date(docData.created_at).toLocaleDateString("pt-BR"),
        size: formatBytes(file.size)
      };

      tripData.documents = tripData.documents || [];
      tripData.documents.push(newDoc);
      renderDocuments();
      
      fileInput.value = "";
      alert("✓ Documento enviado e guardado na nuvem com sucesso!");
    } catch (err) {
      console.error("Error saving document to Supabase:", err);
      alert("⚠️ Ocorreu um erro ao salvar o documento.");
    }
  });
}

async function viewDocument(docId) {
  const doc = tripData.documents.find(d => d.id === docId);
  if (!doc) return;

  if (doc.type === "pdf") {
    const win = window.open();
    if (win) {
      win.document.write(`<iframe src="${doc.url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
    } else {
      const link = document.createElement("a");
      link.href = doc.url;
      link.target = "_blank";
      link.download = doc.name;
      link.click();
    }
  } else {
    if (window.openImageLightbox) {
      window.openImageLightbox(doc.url, doc.name);
    } else {
      const win = window.open();
      win.document.write(`<img src="${doc.url}" style="max-width:100%; max-height:100%; display:block; margin:auto;"/>`);
    }
  }
}

async function deleteDocument(docId) {
  if (!confirm("Tem certeza que deseja excluir permanentemente este documento?")) return;

  try {
    const doc = tripData.documents.find(d => d.id === docId);
    if (!doc) return;

    const { error: dbErr } = await supabase
      .from('documents')
      .delete()
      .eq('id', docId);

    if (dbErr) throw dbErr;

    const urlParts = doc.url.split('/boarding-documents/');
    if (urlParts.length > 1) {
      const filePath = urlParts[1];
      const { error: storageErr } = await supabase.storage
        .from('boarding-documents')
        .remove([filePath]);
      if (storageErr) console.error("Error removing from storage:", storageErr);
    }

    tripData.documents = tripData.documents.filter(d => d.id !== docId);
    renderDocuments();
    localStorage.setItem(getUserStorageKey("gptViajante_tripData"), JSON.stringify(tripData));
  } catch (err) {
    console.error("Error deleting document:", err);
    alert("⚠️ Ocorreu um erro ao excluir o documento.");
  }
}

// Bind to window for HTML click handlers
window.viewDocument = viewDocument;
window.deleteDocument = deleteDocument;
window.renderDocuments = renderDocuments;
window.setupDocumentListeners = setupDocumentListeners;

// Countdown Tick
function setupCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  const countdown = document.getElementById("countdown");
  if (!tripData.targetDate) {
    countdown.classList.add("hidden");
    return;
  }

  const targetTime = new Date(tripData.targetDate).getTime();
  if (isNaN(targetTime)) {
    countdown.classList.add("hidden");
    return;
  }

  countdown.classList.remove("hidden");

  countdownInterval = setInterval(() => {
    const now = new Date().getTime();
    const distance = targetTime - now;

    if (distance < 0) {
      clearInterval(countdownInterval);
      countdown.innerHTML = `
        <div class="glass-panel" style="padding: 16px 40px; border-radius: var(--border-radius-md); text-align: center;">
          <span class="countdown-num" style="color: var(--accent); font-size: 1.6rem; font-weight: 700;">Chegou a hora! ✈️</span>
          <p style="color: white; font-size: 0.9rem; margin-top: 4px;">Aproveite ao máximo a sua viagem!</p>
        </div>
      `;
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    document.getElementById("days").innerText = days.toString().padStart(2, '0');
    document.getElementById("hours").innerText = hours.toString().padStart(2, '0');
    document.getElementById("minutes").innerText = minutes.toString().padStart(2, '0');
    document.getElementById("seconds").innerText = seconds.toString().padStart(2, '0');
  }, 1000);
}

// ==========================================================================
// 6. PDF EXPORT (via browser print dialog)
// ==========================================================================
function exportAsPdf() {
  if (!tripData.itinerary || tripData.itinerary.length === 0) {
    alert("⚠️ Crie primeiro um roteiro conversando pelo chat para poder exportar!");
    return;
  }

  // Expand all timeline cards so they print fully
  document.querySelectorAll('.timeline-card').forEach(card => card.classList.add('expanded'));

  setTimeout(() => {
    window.print();
    // Collapse cards again after print dialog
    setTimeout(() => {
      document.querySelectorAll('.timeline-card').forEach(card => card.classList.remove('expanded'));
    }, 2000);
  }, 300);
}

// ==========================================================================
// 7. FIREBASE AUTH LOGIC & USER INTERFACE HANDLERS
// ==========================================================================
let isRegisterMode = false;

let isUiInitialized = false;

async function handleUserLoggedIn(user, token) {
  currentUser = user;
  firebaseIdToken = token;

  const loginSubmitBtn = document.getElementById("loginSubmitBtn");
  const googleLoginBtn = document.getElementById("googleLoginBtn");

  const cacheKey = `gptViajante_verified_${user.email}`;
  const isCachedVerified = localStorage.getItem(cacheKey) === "true";

  // Transition UI to authenticated dashboard view
  const transitionToApp = () => {
    const userAvatarEl = document.getElementById("userAvatar");
    const userProfileEl = document.getElementById("userProfile");
    const loginScreenEl = document.getElementById("loginScreen");
    const appContainerEl = document.querySelector(".app-container");

    if (userAvatarEl) {
      userAvatarEl.src = user.photoURL || user.user_metadata?.avatar_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150";
    }
    if (userProfileEl) {
      userProfileEl.classList.remove("hidden");
    }
    if (loginScreenEl) {
      loginScreenEl.classList.add("hidden");
    }
    if (appContainerEl) {
      appContainerEl.classList.remove("hidden");
    }
  };

  if (isCachedVerified) {
    // 1. Instant loading path: transition UI immediately using local cache status
    transitionToApp();
    
    // Load state from local storage first (instant), then sync from DB in background
    await loadState();
    if (tripData.id) {
      subscribeToTripChanges(tripData.id);
    }
    if (!isUiInitialized) {
      setupUIEventListeners();
      setupTutorialListeners();
      setupBottomNav();
      isUiInitialized = true;
    }
    setupCountdown();
    renderDashboard();

    // 2. Perform background access token verification
    fetch("/api/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    }).then(async (res) => {
      if (!res.ok) {
        // Access revoked! Clear local cache and force logout
        localStorage.removeItem(cacheKey);
        await logout();
        alert("⚠️ Seu acesso não está cadastrado ou foi revogado.");
      } else {
        localStorage.setItem(cacheKey, "true");
      }
    }).catch(err => {
      console.warn("Background verification failed, keeping cached status:", err);
    });

  } else {
    // 3. First-time login path: synchronous loading state with verifications
    if (loginSubmitBtn) {
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = "Verificando acesso...";
    }
    if (googleLoginBtn) {
      googleLoginBtn.disabled = true;
    }

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Acesso negado.");
      }

      // Cache verified status
      localStorage.setItem(cacheKey, "true");

      transitionToApp();
      await loadState();
      if (tripData.id) {
        subscribeToTripChanges(tripData.id);
      }
      if (!isUiInitialized) {
        setupUIEventListeners();
        setupTutorialListeners();
        setupBottomNav();
        isUiInitialized = true;
      }
      setupCountdown();
      renderDashboard();

    } catch (err) {
      console.error("Authorization check failed:", err);
      let errMsg = err.message || "Seu e-mail não está cadastrado na lista de compradores autorizados.";
      if (errMsg.includes("compradores autorizados") || errMsg.includes("não está cadastrado") || errMsg.includes("Acesso negado")) {
        const emailStr = user && user.email ? ` (<strong>${user.email}</strong>)` : "";
        errMsg = `Seu e-mail${emailStr} não está cadastrado na lista de compradores autorizados. <a href="https://pay.kirvano.com/8c50a730-069a-40e8-bed3-078c03089d1d" target="_blank" style="color: #fff; text-decoration: underline; font-weight: bold; display: block; margin-top: 8px;"><i class="fa-solid fa-cart-shopping"></i> Adquirir Acesso Completo aqui</a>`;
      }
      authVerificationFailed = true;
      showLoginError(errMsg);
      
      // Log out of Supabase to clear session
      try {
        await logout();
      } catch (logoutErr) {
        console.error("Logout error after authorization fail:", logoutErr);
      }
    } finally {
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = isRegisterMode ? "Cadastrar" : "Entrar";
      }
      if (googleLoginBtn) {
        googleLoginBtn.disabled = false;
      }
    }
  }
}

function handleUserLoggedOut() {
  currentUser = null;
  firebaseIdToken = null;

  // Reset in-memory state to prevent leakage between user sessions
  chatHistory = [];
  travelChatHistory = [];
  tripData = {
    tripTitle: "Minha Próxima Viagem",
    tripSubtitle: "Planeje sua viagem conversando pelo chat!",
    infoDates: "A definir",
    infoWeather: "A definir",
    infoGroup: "A definir",
    infoHotel: "A definir",
    hotelLink: "",
    targetDate: null,
    budget: {
      hospedagem: 0,
      alimentacao: 0,
      passeios: 0,
      compras: 0
    },
    packing: [],
    itinerary: [],
    flights: [],
    members: ["Você"],
    expenses: []
  };

  const userProfileEl = document.getElementById("userProfile");
  const loginScreenEl = document.getElementById("loginScreen");
  const appContainerEl = document.querySelector(".app-container");

  if (userProfileEl) {
    userProfileEl.classList.add("hidden");
  }
  if (loginScreenEl) {
    loginScreenEl.classList.remove("hidden");
  }
  if (appContainerEl) {
    appContainerEl.classList.add("hidden");
  }
  
  showLoginFormState();
}

function isInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return (ua.indexOf("FBAN") > -1) || (ua.indexOf("FBAV") > -1) || (ua.indexOf("Instagram") > -1) || (ua.indexOf("WhatsApp") > -1);
}

function setupAuthUI() {
  const googleBtn = document.getElementById("googleLoginBtn");
  const loginForm = document.getElementById("loginForm");
  const toggleLink = document.getElementById("toggleRegisterLink");
  const warningEl = document.getElementById("inAppBrowserWarning");

  if (warningEl && isInAppBrowser()) {
    warningEl.classList.remove("hidden");
  }

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      hideLoginError();
      try {
        await loginWithGoogle();
      } catch (err) {
        showLoginError("Erro com o Google: " + err.message);
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideLoginError();

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      const submitBtn = document.getElementById("loginSubmitBtn");

      submitBtn.disabled = true;
      submitBtn.textContent = isRegisterMode ? "Cadastrando..." : "Entrando...";

      try {
        if (isRegisterMode) {
          await registerWithEmail(email, password);
        } else {
          await loginWithEmail(email, password);
        }
      } catch (err) {
        let errMsg = "Erro de autenticação.";
        if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
          errMsg = `E-mail ou senha incorretos.<br><span style="font-size: 0.76rem; opacity: 0.9; display: block; margin-top: 6px; line-height: 1.35; font-weight: 500;">Se você acabou de comprar o acesso, lembre-se de clicar na aba <strong>"Criar Conta"</strong> no topo para cadastrar sua senha primeiro!</span>`;
        } else if (err.code === "auth/weak-password") {
          errMsg = "A senha deve conter pelo menos 6 caracteres.";
        } else if (err.code === "auth/email-already-in-use") {
          errMsg = "Este e-mail já está em uso.";
        } else {
          errMsg = err.message;
        }
        showLoginError(errMsg);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isRegisterMode ? "Cadastrar" : "Entrar";
      }
    });
  }

  // Tabs for Auth Toggle
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");

  if (tabLogin) {
    tabLogin.addEventListener("click", () => {
      isRegisterMode = false;
      syncAuthMode();
    });
  }
  if (tabRegister) {
    tabRegister.addEventListener("click", () => {
      isRegisterMode = true;
      syncAuthMode();
    });
  }

  if (toggleLink) {
    toggleLink.addEventListener("click", (e) => {
      e.preventDefault();
      isRegisterMode = !isRegisterMode;
      syncAuthMode();
    });
  }
}

function syncAuthMode() {
  const toggleText = document.getElementById("loginToggleText");
  const toggleLink = document.getElementById("toggleRegisterLink");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const title = document.querySelector(".login-header h2");
  const subtitle = document.querySelector(".login-header p");
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");

  if (isRegisterMode) {
    if (title) title.textContent = "Criar Conta";
    if (subtitle) subtitle.textContent = "Cadastre-se para planejar suas viagens";
    if (submitBtn) submitBtn.textContent = "Cadastrar";
    if (toggleText) toggleText.textContent = "Já tem uma conta?";
    if (toggleLink) toggleLink.textContent = "Entrar";
    
    if (tabRegister) {
      tabRegister.classList.add("active");
      tabRegister.style.color = "white";
      tabRegister.style.borderBottomColor = "var(--primary)";
      tabRegister.style.fontWeight = "700";
    }
    if (tabLogin) {
      tabLogin.classList.remove("active");
      tabLogin.style.color = "var(--text-muted)";
      tabLogin.style.borderBottomColor = "transparent";
      tabLogin.style.fontWeight = "600";
    }
  } else {
    if (title) title.textContent = "CoPiloto de Viagem";
    if (subtitle) subtitle.textContent = "Acesse seu painel inteligente de viagem";
    if (submitBtn) submitBtn.textContent = "Entrar";
    if (toggleText) toggleText.textContent = "Não tem uma conta?";
    if (toggleLink) toggleLink.textContent = "Cadastre-se";

    if (tabLogin) {
      tabLogin.classList.add("active");
      tabLogin.style.color = "white";
      tabLogin.style.borderBottomColor = "var(--primary)";
      tabLogin.style.fontWeight = "700";
    }
    if (tabRegister) {
      tabRegister.classList.remove("active");
      tabRegister.style.color = "var(--text-muted)";
      tabRegister.style.borderBottomColor = "transparent";
      tabRegister.style.fontWeight = "600";
    }
  }
  hideLoginError();
}

function showLoginFormState() {
  isRegisterMode = false;
  syncAuthMode();
  
  if (!authVerificationFailed) {
    hideLoginError();
  }
}

function showLoginError(msg) {
  const loginError = document.getElementById("loginError");
  if (loginError) {
    loginError.innerHTML = msg;
    loginError.classList.remove("hidden");
  }
}

function hideLoginError() {
  authVerificationFailed = false;
  const loginError = document.getElementById("loginError");
  if (loginError) {
    loginError.classList.add("hidden");
  }
}

// ==========================================================================
// FLIGHT TRACKER FUNCTIONALITY (STYLING OF FLIGHTY APP)
// ==========================================================================
function getAirlineStyle(airlineName) {
  const name = (airlineName || '').toLowerCase();
  if (name.includes('azul')) {
    return { color: '#0055ff', bg: 'rgba(0, 85, 255, 0.1)' };
  } else if (name.includes('latam')) {
    return { color: '#e5005a', bg: 'rgba(229, 0, 90, 0.1)' };
  } else if (name.includes('gol')) {
    return { color: '#ff6600', bg: 'rgba(255, 102, 0, 0.1)' };
  } else if (name.includes('tap')) {
    return { color: '#3cd070', bg: 'rgba(60, 208, 112, 0.1)' };
  }
  return { color: 'var(--primary)', bg: 'rgba(255, 255, 255, 0.05)' };
}

function renderFlights() {
  const container = document.getElementById("flightsContainer");
  const emptyState = document.getElementById("flightsEmpty");
  
  if (!container) return;
  
  if (!tripData.flights || tripData.flights.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  
  if (emptyState) emptyState.classList.add("hidden");
  
  container.innerHTML = tripData.flights.map((flight, index) => {
    const airlineStyle = getAirlineStyle(flight.airline);
    
    // Calculate progress and countdowns dynamically
    const now = new Date();
    let statusClass = "status-confirmed";
    let statusLabel = flight.status || "Confirmado";
    let progressPercent = 0;
    let countdownText = "";
    
    if (flight.scheduledDeparture && flight.scheduledArrival) {
      try {
        const depParts = flight.scheduledDeparture.split(':');
        const arrParts = flight.scheduledArrival.split(':');
        const depDate = new Date(`${flight.date}T${depParts[0]}:${depParts[1]}:00`);
        const arrDate = new Date(`${flight.date}T${arrParts[0]}:${arrParts[1]}:00`);
        
        const totalDuration = arrDate - depDate;
        
        if (now < depDate) {
          progressPercent = 0;
          const diffMs = depDate - now;
          const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          
          if (diffHrs > 0) {
            countdownText = `Decolagem em ${diffHrs}h ${diffMins}m`;
          } else {
            countdownText = `Decolagem em ${diffMins}m`;
          }
          
          if (statusLabel === "Confirmado") statusClass = "status-confirmed";
          else if (statusLabel === "Embarque") statusClass = "status-boarding";
          else if (statusLabel === "Atrasado") statusClass = "status-delayed";
          else if (statusLabel === "Cancelado") statusClass = "status-cancelled";
        } else if (now >= depDate && now <= arrDate) {
          progressPercent = Math.min(100, Math.max(0, ((now - depDate) / totalDuration) * 100));
          const diffMs = arrDate - now;
          const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          
          if (diffHrs > 0) {
            countdownText = `Restam ${diffHrs}h ${diffMins}m de voo`;
          } else {
            countdownText = `Restam ${diffMins}m de voo`;
          }
          
          if (statusLabel === "Cancelado") {
            statusClass = "status-cancelled";
            progressPercent = 0;
          } else if (statusLabel === "Atrasado") {
            statusClass = "status-delayed";
          } else {
            statusLabel = "Em Voo";
            statusClass = "status-flying";
          }
        } else {
          progressPercent = 100;
          const diffMs = now - arrDate;
          const diffMins = Math.floor(diffMs / (1000 * 60));
          
          if (diffMins < 60) {
            countdownText = `Pousou há ${diffMins} min`;
          } else {
            countdownText = `Pousou às ${flight.scheduledArrival}`;
          }
          
          if (statusLabel === "Cancelado") {
            statusClass = "status-cancelled";
            progressPercent = 0;
          } else {
            statusLabel = "Pousou";
            statusClass = "status-landed";
          }
        }
      } catch (err) {
        console.error("Error calculating flight progress:", err);
      }
    }
    
    // Status custom classes mapping
    if (statusLabel === "Confirmado") statusClass = "status-confirmed";
    else if (statusLabel === "Embarque") statusClass = "status-boarding";
    else if (statusLabel === "Em Voo") statusClass = "status-flying";
    else if (statusLabel === "Pousou") statusClass = "status-landed";
    else if (statusLabel === "Atrasado") statusClass = "status-delayed";
    else if (statusLabel === "Cancelado") statusClass = "status-cancelled";
    
    const terminalMarkup = flight.terminal ? `<div class="flight-info-item"><span class="flight-info-label">Terminal</span><span class="flight-info-value">${flight.terminal}</span></div>` : '<div class="flight-info-item"><span class="flight-info-label">Terminal</span><span class="flight-info-value">-</span></div>';
    const gateMarkup = flight.gate ? `<div class="flight-info-item"><span class="flight-info-label">Portão</span><span class="flight-info-value">${flight.gate}</span></div>` : '<div class="flight-info-item"><span class="flight-info-label">Portão</span><span class="flight-info-value">-</span></div>';
    const carouselMarkup = flight.carousel ? `<div class="flight-info-item"><span class="flight-info-label">Esteira</span><span class="flight-info-value">${flight.carousel}</span></div>` : '<div class="flight-info-item"><span class="flight-info-label">Esteira</span><span class="flight-info-value">-</span></div>';
    
    const isActualTime = flight.actualDeparture && flight.actualDeparture !== flight.scheduledDeparture;
    const depTimeMarkup = isActualTime 
      ? `<span class="flight-time-val delayed">${flight.scheduledDeparture}</span><span class="flight-time-val actual">${flight.actualDeparture}</span>`
      : `<span class="flight-time-val on-time">${flight.scheduledDeparture || '--:--'}</span>`;

    const isActualArrTime = flight.actualArrival && flight.actualArrival !== flight.scheduledArrival;
    const arrTimeMarkup = isActualArrTime 
      ? `<span class="flight-time-val delayed">${flight.scheduledArrival}</span><span class="flight-time-val actual">${flight.actualArrival}</span>`
      : `<span class="flight-time-val on-time">${flight.scheduledArrival || '--:--'}</span>`;

    return `
      <div class="flight-card glass-panel" data-index="${index}">
        ${isSharedView ? '' : `
        <div class="flight-card-actions">
          <button class="flight-action-btn edit" onclick="window.editFlight(${index})"><i class="fa-solid fa-pen"></i></button>
          <button class="flight-action-btn delete" onclick="window.deleteFlight(${index})"><i class="fa-solid fa-trash"></i></button>
        </div>
        `}
        
        <div class="flight-header">
          <div class="flight-airline-info">
            <div class="flight-airline-icon" style="color: ${airlineStyle.color}; background: ${airlineStyle.bg};">
              <i class="fa-solid fa-plane"></i>
            </div>
            <div>
              <div class="flight-number">${flight.flightNumber}</div>
              <div class="flight-airline-name">${flight.airline || 'Companhia Aérea'}</div>
            </div>
          </div>
          <span class="flight-status-badge ${statusClass}">
            <i class="fa-solid ${statusLabel === 'Em Voo' ? 'fa-plane' : statusLabel === 'Pousou' ? 'fa-circle-check' : 'fa-circle-info'}"></i>
            ${statusLabel}
          </span>
        </div>
        
        <div class="flight-route-visual">
          <div class="flight-airport-box">
            <span class="flight-iata">${flight.departureAirport || '---'}</span>
            <span class="flight-city">${flight.departureCity || 'Partida'}</span>
          </div>
          
          <div class="flight-progress-connector">
            <div class="flight-progress-track">
              <div class="flight-progress-fill ${statusLabel === 'Em Voo' ? 'flying' : statusLabel === 'Pousou' ? 'landed' : ''}" style="width: ${progressPercent}%;"></div>
            </div>
            <i class="fa-solid fa-plane flight-progress-plane ${statusLabel === 'Em Voo' ? 'flying' : statusLabel === 'Pousou' ? 'landed' : statusLabel === 'Cancelado' ? 'cancelled' : ''}" style="left: ${progressPercent}%;"></i>
          </div>
          
          <div class="flight-airport-box destination">
            <span class="flight-iata">${flight.arrivalAirport || '---'}</span>
            <span class="flight-city">${flight.arrivalCity || 'Destino'}</span>
          </div>
        </div>
        
        <div class="flight-times-row">
          <div>Partida: ${depTimeMarkup}</div>
          <div style="font-weight: 500; font-size: 0.78rem; opacity: 0.8;">${flight.duration || ''}</div>
          <div style="text-align: right;">Chegada: ${arrTimeMarkup}</div>
        </div>
        
        ${countdownText ? `<div class="flight-countdown-bar ${statusLabel === 'Embarque' ? 'boarding' : statusLabel === 'Em Voo' ? 'flying' : statusLabel === 'Pousou' ? 'landed' : statusLabel === 'Cancelado' ? 'cancelled' : ''}">${countdownText}</div>` : ''}
        
        <div class="flight-info-grid">
          ${terminalMarkup}
          ${gateMarkup}
          ${carouselMarkup}
        </div>
      </div>
    `;
  }).join("");
}

function openFlightModal(index = null) {
  const modal = document.getElementById("flightModal");
  const form = document.getElementById("flightForm");
  const title = document.getElementById("flightModalTitle");
  
  if (!modal || !form) return;
  
  form.reset();
  document.getElementById("editFlightIndex").value = index !== null ? index : "";
  document.getElementById("flightSearchLoading").classList.add("hidden");
  document.getElementById("flightSearchSuccess").classList.add("hidden");
  document.getElementById("flightSearchError").classList.add("hidden");
  
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById("flightDateInput").value = today;
  
  if (index !== null) {
    title.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--primary); margin-right: 8px;"></i> Editar Voo`;
    const flight = tripData.flights[index];
    
    document.getElementById("flightNumberInput").value = flight.flightNumber || "";
    document.getElementById("flightDateInput").value = flight.date || today;
    document.getElementById("flightAirlineInput").value = flight.airline || "";
    document.getElementById("flightStatusInput").value = flight.status || "Confirmado";
    document.getElementById("flightDepAirportInput").value = flight.departureAirport || "";
    document.getElementById("flightDepCityInput").value = flight.departureCity || "";
    document.getElementById("flightArrAirportInput").value = flight.arrivalAirport || "";
    document.getElementById("flightArrCityInput").value = flight.arrivalCity || "";
    document.getElementById("flightDepTimeInput").value = flight.scheduledDeparture || "";
    document.getElementById("flightArrTimeInput").value = flight.scheduledArrival || "";
    document.getElementById("flightTerminalInput").value = flight.terminal || "";
    document.getElementById("flightGateInput").value = flight.gate || "";
    document.getElementById("flightCarouselInput").value = flight.carousel || "";
  } else {
    title.innerHTML = `<i class="fa-solid fa-plane-arrival" style="color: var(--primary); margin-right: 8px;"></i> Adicionar Voo`;
  }
  
  modal.classList.remove("hidden");
}

function closeFlightModal() {
  const modal = document.getElementById("flightModal");
  if (modal) modal.classList.add("hidden");
}

async function handleSearchFlightOnline() {
  const flightNumber = document.getElementById("flightNumberInput").value.trim().toUpperCase();
  const date = document.getElementById("flightDateInput").value;
  
  if (!flightNumber) {
    alert("Por favor, digite o número do voo.");
    return;
  }
  
  const loadingEl = document.getElementById("flightSearchLoading");
  const successEl = document.getElementById("flightSearchSuccess");
  const errorEl = document.getElementById("flightSearchError");
  const searchBtn = document.getElementById("searchFlightOnlineBtn");
  const submitBtn = document.getElementById("submitFlightModalBtn");
  
  loadingEl.classList.remove("hidden");
  successEl.classList.add("hidden");
  errorEl.classList.add("hidden");
  searchBtn.disabled = true;
  submitBtn.disabled = true;
  
  try {
    const token = await getFreshToken();
    const response = await fetch("/api/flight", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ flightNumber, date })
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Voo não encontrado.");
    }
    
    const flightData = await response.json();
    
    // Populate form fields
    document.getElementById("flightAirlineInput").value = flightData.airline || "";
    document.getElementById("flightStatusInput").value = flightData.status || "Confirmado";
    document.getElementById("flightDepAirportInput").value = flightData.departureAirport || "";
    document.getElementById("flightDepCityInput").value = flightData.departureCity || "";
    document.getElementById("flightArrAirportInput").value = flightData.arrivalAirport || "";
    document.getElementById("flightArrCityInput").value = flightData.arrivalCity || "";
    document.getElementById("flightDepTimeInput").value = flightData.scheduledDeparture || "";
    document.getElementById("flightArrTimeInput").value = flightData.scheduledArrival || "";
    document.getElementById("flightTerminalInput").value = flightData.terminal || "";
    document.getElementById("flightGateInput").value = flightData.gate || "";
    document.getElementById("flightCarouselInput").value = flightData.carousel || "";
    
    successEl.classList.remove("hidden");
  } catch (err) {
    console.error("Search flight failed:", err);
    errorEl.classList.remove("hidden");
  } finally {
    loadingEl.classList.add("hidden");
    searchBtn.disabled = false;
    submitBtn.disabled = false;
  }
}

async function handleFlightFormSubmit(e) {
  e.preventDefault();
  
  const flightNumber = document.getElementById("flightNumberInput").value.trim().toUpperCase();
  const date = document.getElementById("flightDateInput").value;
  let airline = document.getElementById("flightAirlineInput").value.trim();
  const status = document.getElementById("flightStatusInput").value;
  let departureAirport = document.getElementById("flightDepAirportInput").value.trim().toUpperCase();
  let departureCity = document.getElementById("flightDepCityInput").value.trim();
  let arrivalAirport = document.getElementById("flightArrAirportInput").value.trim().toUpperCase();
  let arrivalCity = document.getElementById("flightArrCityInput").value.trim();
  let scheduledDeparture = document.getElementById("flightDepTimeInput").value.trim();
  let scheduledArrival = document.getElementById("flightArrTimeInput").value.trim();
  let terminal = document.getElementById("flightTerminalInput").value.trim();
  let gate = document.getElementById("flightGateInput").value.trim();
  let carousel = document.getElementById("flightCarouselInput").value.trim();

  // If manual details are mostly blank, try to search them online first before saving
  if (!departureAirport && !arrivalAirport && flightNumber) {
    try {
      const submitBtn = document.getElementById("submitFlightModalBtn");
      const origText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Buscando dados do voo...";
      
      await handleSearchFlightOnline();
      
      submitBtn.disabled = false;
      submitBtn.textContent = origText;

      // Re-read values from inputs
      airline = document.getElementById("flightAirlineInput").value.trim();
      departureAirport = document.getElementById("flightDepAirportInput").value.trim().toUpperCase();
      departureCity = document.getElementById("flightDepCityInput").value.trim();
      arrivalAirport = document.getElementById("flightArrAirportInput").value.trim().toUpperCase();
      arrivalCity = document.getElementById("flightArrCityInput").value.trim();
      scheduledDeparture = document.getElementById("flightDepTimeInput").value.trim();
      scheduledArrival = document.getElementById("flightArrTimeInput").value.trim();
      terminal = document.getElementById("flightTerminalInput").value.trim();
      gate = document.getElementById("flightGateInput").value.trim();
      carousel = document.getElementById("flightCarouselInput").value.trim();
    } catch (searchErr) {
      console.warn("Auto-search failed on form submit, continuing with blank values:", searchErr);
    }
  }
  
  const editIndexVal = document.getElementById("editFlightIndex").value;
  
  const flightData = {
    flightNumber,
    date,
    airline,
    status,
    departureAirport,
    departureCity,
    arrivalAirport,
    arrivalCity,
    scheduledDeparture,
    scheduledArrival,
    terminal,
    gate,
    carousel,
    duration: calculateDuration(scheduledDeparture, scheduledArrival)
  };
  
  if (editIndexVal !== "") {
    // Update existing
    const index = parseInt(editIndexVal);
    tripData.flights[index] = flightData;
  } else {
    // Create new
    tripData.flights.push(flightData);
  }
  
  saveState();
  closeFlightModal();
  renderFlights();
  triggerAiLogisticsSync();
}

function calculateDuration(dep, arr) {
  if (!dep || !arr) return "";
  try {
    const depParts = dep.split(':');
    const arrParts = arr.split(':');
    let diffMins = (parseInt(arrParts[0]) * 60 + parseInt(arrParts[1])) - (parseInt(depParts[0]) * 60 + parseInt(depParts[1]));
    
    if (diffMins < 0) diffMins += 24 * 60;
    
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
  } catch (err) {
    return "";
  }
}

function deleteFlight(index) {
  if (confirm("Tem certeza que deseja remover este voo do seu rastreador?")) {
    tripData.flights.splice(index, 1);
    saveState();
    renderFlights();
    triggerAiLogisticsSync();
  }
}

// Expose functions to global scope for module onclick actions
window.editFlight = openFlightModal;
window.deleteFlight = deleteFlight;

// Periodic updater for flights
setInterval(() => {
  if (tripData.flights && tripData.flights.length > 0) {
    renderFlights();
  }
}, 30000); // every 30 seconds

// Forward wheel/scroll events on document/margins to the active container inside the simulated app
document.addEventListener('wheel', (e) => {
  // Check if a modal is open
  const openModalCard = document.querySelector('.modal-overlay:not(.hidden) .modal-card');
  if (openModalCard) {
    if (!e.composedPath().includes(openModalCard)) {
      openModalCard.scrollTop += e.deltaY;
      e.preventDefault();
    }
    return;
  }

  const chatSidebar = document.getElementById('chatSidebar');
  const dashboardContent = document.getElementById('dashboardContent');
  const sharedSplitwise = document.getElementById('sharedSplitwiseContainer');
  const appContainer = document.querySelector(".app-container");
  
  let targetContainer = null;
  if (sharedSplitwise && !sharedSplitwise.classList.contains('hidden')) {
    targetContainer = sharedSplitwise;
  } else if (appContainer && !appContainer.classList.contains('hidden')) {
    if (chatSidebar && chatSidebar.style.display !== 'none') {
      targetContainer = document.getElementById('chatMessages');
    } else if (dashboardContent && dashboardContent.style.display !== 'none') {
      targetContainer = dashboardContent;
    }
  }
  
  if (targetContainer) {
    if (!e.composedPath().includes(targetContainer)) {
      targetContainer.scrollTop += e.deltaY;
      e.preventDefault();
    }
  }
}, { passive: false });


// ==========================================================================
// SPLITWISE (DIVISÃO DE DESPESAS) SYSTEM
// ==========================================================================

function setupSplitwiseListeners() {
  const subTabMyBudgetBtn = document.getElementById("subTabMyBudgetBtn");
  const subTabSplitwiseBtn = document.getElementById("subTabSplitwiseBtn");
  const myBudgetPanel = document.getElementById("myBudgetPanel");
  const splitwisePanel = document.getElementById("splitwisePanel");
  const addMemberForm = document.getElementById("addMemberForm");
  const openAddExpenseModalBtn = document.getElementById("openAddExpenseModalBtn");
  const closeExpenseModalBtn = document.getElementById("closeExpenseModal");
  const cancelExpenseModalBtn = document.getElementById("cancelExpenseModalBtn");
  const expenseForm = document.getElementById("expenseForm");

  if (subTabMyBudgetBtn && subTabSplitwiseBtn && myBudgetPanel && splitwisePanel) {
    subTabMyBudgetBtn.addEventListener("click", () => {
      subTabMyBudgetBtn.classList.add("active");
      subTabSplitwiseBtn.classList.remove("active");
      myBudgetPanel.classList.remove("hidden");
      splitwisePanel.classList.add("hidden");
    });

    subTabSplitwiseBtn.addEventListener("click", () => {
      subTabSplitwiseBtn.classList.add("active");
      subTabMyBudgetBtn.classList.remove("active");
      splitwisePanel.classList.remove("hidden");
      myBudgetPanel.classList.add("hidden");
      renderSplitwise();
    });
  }

  if (addMemberForm) {
    addMemberForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("newMemberNameInput");
      const name = input.value.trim();
      if (!name) return;
      
      if (tripData.members.some(m => m.toLowerCase() === name.toLowerCase())) {
        alert("Já existe um participante com esse nome no grupo.");
        return;
      }
      
      tripData.members.push(name);
      input.value = "";
      saveState();
      renderSplitwise();
    });
  }

  if (openAddExpenseModalBtn) {
    openAddExpenseModalBtn.addEventListener("click", () => {
      openExpenseModal();
    });
  }

  if (closeExpenseModalBtn) {
    closeExpenseModalBtn.addEventListener("click", closeExpenseModal);
  }
  if (cancelExpenseModalBtn) {
    cancelExpenseModalBtn.addEventListener("click", closeExpenseModal);
  }

  if (expenseForm) {
    expenseForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleExpenseFormSubmit();
    });
  }

  const btnSplitEqual = document.getElementById("btnSplitEqual");
  const btnSplitCustom = document.getElementById("btnSplitCustom");
  const customSharesWrapper = document.getElementById("customSharesWrapper");
  const amountInput = document.getElementById("expenseAmountInput");
  
  if (btnSplitEqual && btnSplitCustom && customSharesWrapper) {
    btnSplitEqual.addEventListener("click", () => {
      btnSplitEqual.classList.add("active");
      btnSplitEqual.style.background = "var(--primary)";
      btnSplitEqual.style.color = "white";
      
      btnSplitCustom.classList.remove("active");
      btnSplitCustom.style.background = "transparent";
      btnSplitCustom.style.color = "var(--text-muted)";
      
      customSharesWrapper.classList.add("hidden");
    });
    
    btnSplitCustom.addEventListener("click", () => {
      btnSplitCustom.classList.add("active");
      btnSplitCustom.style.background = "var(--primary)";
      btnSplitCustom.style.color = "white";
      
      btnSplitEqual.classList.remove("active");
      btnSplitEqual.style.background = "transparent";
      btnSplitEqual.style.color = "var(--text-muted)";
      
      customSharesWrapper.classList.remove("hidden");
      updateCustomSharesInputs();
    });
  }
  
  if (amountInput) {
    amountInput.addEventListener("input", () => {
      const total = parseFloat(amountInput.value) || 0;
      const targetEl = document.getElementById("customSharesTotalTarget");
      if (targetEl) targetEl.textContent = total.toFixed(2);
      if (customSharesWrapper && !customSharesWrapper.classList.contains("hidden")) {
        updateCustomSharesInputs();
      }
    });
  }

  const shareSplitwiseBtn = document.getElementById("shareSplitwiseBtn");
  if (shareSplitwiseBtn) {
    shareSplitwiseBtn.addEventListener("click", () => {
      shareSplitwise();
    });
  }
}

function openExpenseModal() {
  const modal = document.getElementById("expenseModal");
  if (!modal) return;

  document.getElementById("editExpenseIndex").value = "";
  document.getElementById("expenseDescInput").value = "";
  document.getElementById("expenseAmountInput").value = "";
  document.getElementById("expenseModalTitle").innerHTML = '<i class="fa-solid fa-receipt" style="color: var(--primary); margin-right: 8px;"></i> Adicionar Despesa';

  const payerSelect = document.getElementById("expensePayerSelect");
  if (payerSelect) {
    payerSelect.innerHTML = tripData.members.map(m => `<option value="${m}">${m}</option>`).join("");
  }

  const checklist = document.getElementById("expenseParticipantsChecklist");
  if (checklist) {
    checklist.innerHTML = tripData.members.map((m, idx) => `
      <label style="display: flex; align-items: center; gap: 8px; font-size: 0.88rem; color: var(--text-light); cursor: pointer; user-select: none;">
        <input type="checkbox" name="expenseParticipant" value="${m}" checked style="accent-color: var(--primary); width: 16px; height: 16px;">
        <span>${m}</span>
      </label>
    `).join("");

    checklist.querySelectorAll('input[name="expenseParticipant"]').forEach(cb => {
      cb.addEventListener("change", () => {
        const customSharesWrapper = document.getElementById("customSharesWrapper");
        if (customSharesWrapper && !customSharesWrapper.classList.contains("hidden")) {
          updateCustomSharesInputs();
        }
      });
    });
  }

  const btnSplitEqual = document.getElementById("btnSplitEqual");
  const btnSplitCustom = document.getElementById("btnSplitCustom");
  const customSharesWrapper = document.getElementById("customSharesWrapper");
  
  if (btnSplitEqual && btnSplitCustom && customSharesWrapper) {
    btnSplitEqual.classList.add("active");
    btnSplitEqual.style.background = "var(--primary)";
    btnSplitEqual.style.color = "white";
    
    btnSplitCustom.classList.remove("active");
    btnSplitCustom.style.background = "transparent";
    btnSplitCustom.style.color = "var(--text-muted)";
    
    customSharesWrapper.classList.add("hidden");
  }

  modal.classList.remove("hidden");
}

function closeExpenseModal() {
  const modal = document.getElementById("expenseModal");
  if (modal) modal.classList.add("hidden");
}

function handleExpenseFormSubmit() {
  const desc = document.getElementById("expenseDescInput").value.trim();
  const amount = parseFloat(document.getElementById("expenseAmountInput").value);
  const payer = document.getElementById("expensePayerSelect").value;
  
  const checkboxes = document.querySelectorAll('input[name="expenseParticipant"]:checked');
  const participants = Array.from(checkboxes).map(cb => cb.value);

  if (!desc || isNaN(amount) || amount <= 0 || !payer || participants.length === 0) {
    alert("Por favor, preencha todos os campos obrigatórios e selecione pelo menos um participante.");
    return;
  }

  const isCustom = document.getElementById("btnSplitCustom").classList.contains("active");
  let customShares = null;
  
  if (isCustom) {
    customShares = {};
    const shareInputs = document.querySelectorAll('.custom-share-input');
    let sum = 0;
    shareInputs.forEach(inp => {
      const name = inp.dataset.name;
      const shareVal = parseFloat(inp.value) || 0;
      customShares[name] = shareVal;
      sum += shareVal;
    });
    
    if (Math.abs(sum - amount) > 0.01) {
      alert(`Erro: A soma dos valores individuais (R$ ${sum.toFixed(2)}) não é igual ao valor total da despesa (R$ ${amount.toFixed(2)}).`);
      return;
    }
  }

  const expense = {
    desc,
    amount,
    payer,
    participants,
    date: new Date().toLocaleDateString("pt-BR"),
    customShares: customShares
  };

  tripData.expenses.push(expense);
  saveState();
  closeExpenseModal();
  renderSplitwise();
}

function deleteExpense(index) {
  if (confirm("Tem certeza que deseja remover esta despesa?")) {
    tripData.expenses.splice(index, 1);
    saveState();
    renderSplitwise();
  }
}

function removeMember(index) {
  const member = tripData.members[index];
  if (member === "Você") {
    alert("Você não pode remover o participante principal ('Você').");
    return;
  }

  const isInvolved = tripData.expenses.some(exp => 
    exp.payer === member || exp.participants.includes(member)
  );

  if (isInvolved) {
    alert(`Não é possível remover ${member} pois ele(a) está envolvido(a) em despesas cadastradas. Remova ou edite as despesas primeiro.`);
    return;
  }

  if (confirm(`Tem certeza que deseja remover ${member} do grupo?`)) {
    tripData.members.splice(index, 1);
    saveState();
    renderSplitwise();
  }
}

function settleDebt(debtor, creditor, amount) {
  if (confirm(`Confirmar que ${debtor} pagou R$ ${amount.toFixed(2)} para ${creditor}?`)) {
    const expense = {
      desc: `Reembolso: ${debtor} ➔ ${creditor}`,
      amount: amount,
      payer: debtor,
      participants: [creditor],
      date: new Date().toLocaleDateString("pt-BR"),
      isReimbursement: true
    };

    tripData.expenses.push(expense);
    saveState();
    renderSplitwise();
  }
}

function renderSplitwise() {
  // 1. Members
  const membersList = document.getElementById("membersList");
  if (membersList) {
    membersList.innerHTML = tripData.members.map((m, idx) => {
      const isMain = m === "Você";
      return `
        <div class="member-chip">
          <i class="fa-solid fa-user-tag" style="font-size: 0.75rem; opacity: 0.8; color: ${isMain ? 'var(--primary)' : 'var(--text-muted)'}"></i>
          <span>${m}</span>
          ${isMain || isSharedView ? '' : `<i class="fa-solid fa-xmark remove-member" onclick="removeMember(${idx})"></i>`}
        </div>
      `;
    }).join("");
  }

  // 2. Balances Board calculation
  const balances = {};
  tripData.members.forEach(m => { balances[m] = 0; });
  
  tripData.expenses.forEach(exp => {
    const amount = exp.amount;
    const payer = exp.payer;
    const participants = exp.participants;
    
    if (balances[payer] !== undefined) {
      balances[payer] += amount;
    }
    
    if (exp.customShares) {
      // Custom split
      Object.keys(exp.customShares).forEach(p => {
        const share = exp.customShares[p];
        if (balances[p] !== undefined) {
          balances[p] -= share;
        }
      });
    } else {
      // Equal split
      const share = amount / participants.length;
      participants.forEach(p => {
        if (balances[p] !== undefined) {
          balances[p] -= share;
        }
      });
    }
  });

  const debtors = [];
  const creditors = [];
  
  Object.keys(balances).forEach(m => {
    const bal = balances[m];
    if (bal < -0.01) {
      debtors.push({ name: m, balance: bal });
    } else if (bal > 0.01) {
      creditors.push({ name: m, balance: bal });
    }
  });

  debtors.sort((a, b) => a.balance - b.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  const transactions = [];
  const tempDebtors = debtors.map(d => ({ ...d }));
  const tempCreditors = creditors.map(c => ({ ...c }));
  
  let dIdx = 0;
  let cIdx = 0;
  
  while (dIdx < tempDebtors.length && cIdx < tempCreditors.length) {
    const debtor = tempDebtors[dIdx];
    const creditor = tempCreditors[cIdx];
    
    const debtVal = Math.min(-debtor.balance, creditor.balance);
    
    transactions.push({
      from: debtor.name,
      to: creditor.name,
      amount: debtVal
    });
    
    debtor.balance += debtVal;
    creditor.balance -= debtVal;
    
    if (Math.abs(debtor.balance) < 0.01) {
      dIdx++;
    }
    if (Math.abs(creditor.balance) < 0.01) {
      cIdx++;
    }
  }

  const balancesEmpty = document.getElementById("splitwiseBalancesEmpty");
  const balancesList = document.getElementById("splitwiseBalancesList");
  
  if (balancesList && balancesEmpty) {
    if (transactions.length === 0) {
      balancesEmpty.style.display = "block";
      balancesList.innerHTML = "";
    } else {
      balancesEmpty.style.display = "none";
      balancesList.innerHTML = transactions.map(t => {
        const isYouDebtor = t.from === "Você";
        const isYouCreditor = t.to === "Você";
        let textPrefix = "";
        
        if (isYouDebtor) {
          textPrefix = `Você deve <strong class="balance-type-debt">R$ ${t.amount.toFixed(2)}</strong> a <strong>${t.to}</strong>`;
        } else if (isYouCreditor) {
          textPrefix = `<strong>${t.from}</strong> deve <strong class="balance-type-credit">R$ ${t.amount.toFixed(2)}</strong> a você`;
        } else {
          textPrefix = `<strong>${t.from}</strong> deve <strong>R$ ${t.amount.toFixed(2)}</strong> a <strong>${t.to}</strong>`;
        }

        return `
          <div class="balance-item">
            <span class="balance-text">${textPrefix}</span>
            ${isSharedView ? '' : `
            <button class="btn btn-secondary btn-sm" style="padding: 6px 12px; font-size: 0.78rem;" onclick="settleDebt('${t.from}', '${t.to}', ${t.amount})">
              <i class="fa-solid fa-check"></i> Quitar
            </button>
            `}
          </div>
        `;
      }).join("");
    }
  }

  // 3. Expense history list
  const expensesEmpty = document.getElementById("splitwiseExpensesEmpty");
  const expensesList = document.getElementById("splitwiseExpensesList");
  
  if (expensesList && expensesEmpty) {
    if (tripData.expenses.length === 0) {
      expensesEmpty.style.display = "block";
      expensesList.innerHTML = "";
    } else {
      expensesEmpty.style.display = "none";
      expensesList.innerHTML = tripData.expenses.map((exp, idx) => {
        const isReimbursement = exp.isReimbursement || false;
        
        let iconClass = "fa-solid fa-receipt";
        if (isReimbursement) iconClass = "fa-solid fa-hand-holding-dollar";
        else if (exp.desc.toLowerCase().includes("jantar") || exp.desc.toLowerCase().includes("comida") || exp.desc.toLowerCase().includes("restaurante")) iconClass = "fa-solid fa-utensils";
        else if (exp.desc.toLowerCase().includes("gasolina") || exp.desc.toLowerCase().includes("pedágio") || exp.desc.toLowerCase().includes("uber") || exp.desc.toLowerCase().includes("transporte")) iconClass = "fa-solid fa-car";
        else if (exp.desc.toLowerCase().includes("hotel") || exp.desc.toLowerCase().includes("hospedagem") || exp.desc.toLowerCase().includes("airbnb")) iconClass = "fa-solid fa-hotel";
        else if (exp.desc.toLowerCase().includes("ingresso") || exp.desc.toLowerCase().includes("show") || exp.desc.toLowerCase().includes("museu") || exp.desc.toLowerCase().includes("passeio")) iconClass = "fa-solid fa-ticket";
        
        const payeeText = exp.payer === "Você" ? "Você pagou" : `${exp.payer} pagou`;
        const splitText = isReimbursement 
          ? `Reembolso direto para ${exp.participants[0]}` 
          : (exp.customShares ? `Divisão personalizada (${exp.participants.length} pessoas)` : `Dividido entre ${exp.participants.length} pessoas`);

        let detailsSpan = "";
        if (exp.payer === "Você") {
          const shareSelf = exp.customShares 
            ? (exp.customShares["Você"] || 0) 
            : (exp.participants.includes("Você") ? (exp.amount / exp.participants.length) : 0);
          detailsSpan = `<span class="balance-type-credit">Emprestou R$ ${(exp.amount - shareSelf).toFixed(2)}</span>`;
        } else {
          const shareSelf = exp.customShares
            ? (exp.customShares["Você"] || 0)
            : (exp.participants.includes("Você") ? (exp.amount / exp.participants.length) : 0);
          
          if (shareSelf > 0) {
            detailsSpan = `<span class="balance-type-debt">Sua parte: R$ ${shareSelf.toFixed(2)}</span>`;
          } else {
            detailsSpan = `<span class="balance-type-debt" style="opacity: 0.6">Não participa</span>`;
          }
        }

        return `
          <div class="expense-item">
            <div class="expense-left">
              <div class="expense-icon" style="background: ${isReimbursement ? 'rgba(74, 222, 128, 0.12)' : 'rgba(56, 189, 248, 0.12)'}; color: ${isReimbursement ? '#4ade80' : '#38bdf8'}">
                <i class="${iconClass}"></i>
              </div>
              <div class="expense-info">
                <h4>${exp.desc}</h4>
                <p>${payeeText} • ${splitText} • ${exp.date}</p>
              </div>
            </div>
            <div class="expense-right">
              <div class="expense-val">
                <span class="expense-amount">R$ ${exp.amount.toFixed(2)}</span>
                <div class="expense-details">
                  ${detailsSpan}
                </div>
              </div>
              ${isSharedView ? '' : `
              <button class="flight-action-btn delete" onclick="deleteExpense(${idx})" style="padding: 6px;"><i class="fa-solid fa-trash"></i></button>
              `}
            </div>
          </div>
        `;
      }).reverse().join("");
    }
  }
}

// Expose functions to global scope
window.removeMember = removeMember;
window.deleteExpense = deleteExpense;
window.settleDebt = settleDebt;
window.setupSplitwiseListeners = setupSplitwiseListeners;
window.renderSplitwise = renderSplitwise;
window.openExpenseModal = openExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.shareSplitwise = shareSplitwise;
window.renderSharedSplitwise = renderSharedSplitwise;
window.checkItineraryStatus = checkItineraryStatus;

function updateCustomSharesInputs() {
  const checklist = document.getElementById("expenseParticipantsChecklist");
  const listContainer = document.getElementById("customSharesList");
  const amountInput = document.getElementById("expenseAmountInput");
  const total = parseFloat(amountInput.value) || 0;
  
  if (!checklist || !listContainer) return;
  
  const checkedCheckboxes = checklist.querySelectorAll('input[name="expenseParticipant"]:checked');
  const count = checkedCheckboxes.length;
  
  if (count === 0) {
    listContainer.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 10px 0;">Selecione pelo menos um participante.</div>`;
    updateCustomSharesSum();
    return;
  }
  
  // Calculate default share
  const baseShare = Math.floor((total / count) * 100) / 100;
  const remainder = parseFloat((total - (baseShare * count)).toFixed(2));
  
  listContainer.innerHTML = Array.from(checkedCheckboxes).map((cb, idx) => {
    const name = cb.value;
    const shareVal = (idx === 0) ? (baseShare + remainder) : baseShare;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <span style="font-size: 0.85rem; color: var(--text-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">${name}</span>
        <input type="number" step="0.01" min="0" placeholder="0.00" class="custom-share-input" data-name="${name}" value="${shareVal.toFixed(2)}" style="width: 100px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); padding: 6px 8px; color: white; outline: none; font-size: 0.85rem; text-align: right;">
      </div>
    `;
  }).join("");
  
  listContainer.querySelectorAll('.custom-share-input').forEach(inp => {
    inp.addEventListener('input', updateCustomSharesSum);
  });
  
  updateCustomSharesSum();
}

function updateCustomSharesSum() {
  const inputs = document.querySelectorAll('.custom-share-input');
  const amountInput = document.getElementById("expenseAmountInput");
  const totalTarget = parseFloat(amountInput.value) || 0;
  
  let sum = 0;
  inputs.forEach(inp => {
    sum += parseFloat(inp.value) || 0;
  });
  
  const sumEl = document.getElementById("customSharesSum");
  if (sumEl) sumEl.textContent = sum.toFixed(2);
  
  const validationMsg = document.getElementById("customSharesValidationMsg");
  if (validationMsg) {
    if (Math.abs(sum - totalTarget) > 0.01) {
      validationMsg.style.display = "block";
      validationMsg.textContent = `⚠️ A soma das partes (R$ ${sum.toFixed(2)}) deve ser igual a R$ ${totalTarget.toFixed(2)}.`;
    } else {
      validationMsg.style.display = "none";
    }
  }
}

function shareSplitwise() {
  const shareData = {
    members: tripData.members,
    expenses: tripData.expenses
  };
  const jsonStr = JSON.stringify(shareData);
  const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
  
  const shareUrl = `${window.location.origin}${window.location.pathname}?share=${base64}`;
  
  navigator.clipboard.writeText(shareUrl).then(() => {
    alert("✓ Link de divisão de despesas copiado para a área de transferência! Envie para quem você quer compartilhar o controle de gastos.");
  }).catch(err => {
    console.error("Failed to copy link:", err);
    prompt("Copie o link abaixo para compartilhar:", shareUrl);
  });
}

function renderSharedSplitwise(shareParam) {
  const container = document.getElementById("sharedSplitwiseContainer");
  const loginScreen = document.getElementById("loginScreen");
  const appContainer = document.querySelector(".app-container");
  
  if (loginScreen) loginScreen.classList.add("hidden");
  if (appContainer) appContainer.classList.add("hidden");
  if (container) {
    container.classList.remove("hidden");
    enableDragToScroll(container);
  }
  
  let sharedData = null;
  try {
    const decoded = decodeURIComponent(escape(atob(shareParam)));
    sharedData = JSON.parse(decoded);
  } catch (err) {
    console.error("Failed to decode shared data:", err);
    if (container) {
      container.innerHTML = `
        <div class="glass-panel" style="max-width: 500px; padding: 30px; text-align: center; color: white;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; color: #ef4444; margin-bottom: 16px;"></i>
          <h2>Link Inválido</h2>
          <p style="color: var(--text-light); font-size: 0.9rem; margin-top: 10px;">Este link de compartilhamento parece estar corrompido ou incompleto. Por favor, solicite um novo link.</p>
          <a href="/" class="btn btn-primary" style="margin-top: 20px; display: inline-block; text-decoration: none;">Ir para Página Inicial</a>
        </div>
      `;
    }
    return;
  }
  
  const members = sharedData.members || [];
  const expenses = sharedData.expenses || [];
  
  const membersList = document.getElementById("sharedMembersList");
  if (membersList) {
    membersList.innerHTML = members.map(m => `
      <div class="member-chip" style="cursor: default;">
        <i class="fa-solid fa-user-tag" style="font-size: 0.75rem; opacity: 0.8; color: ${m === "Você" ? 'var(--primary)' : 'var(--text-muted)'}"></i>
        <span>${m}</span>
      </div>
    `).join("");
  }
  
  const balances = {};
  members.forEach(m => { balances[m] = 0; });
  
  expenses.forEach(exp => {
    const amount = exp.amount;
    const payer = exp.payer;
    const participants = exp.participants;
    
    if (balances[payer] !== undefined) {
      balances[payer] += amount;
    }
    
    if (exp.customShares) {
      Object.keys(exp.customShares).forEach(p => {
        const share = exp.customShares[p];
        if (balances[p] !== undefined) {
          balances[p] -= share;
        }
      });
    } else {
      const share = amount / participants.length;
      participants.forEach(p => {
        if (balances[p] !== undefined) {
          balances[p] -= share;
        }
      });
    }
  });

  const debtors = [];
  const creditors = [];
  Object.keys(balances).forEach(m => {
    const bal = balances[m];
    if (bal < -0.01) {
      debtors.push({ name: m, balance: bal });
    } else if (bal > 0.01) {
      creditors.push({ name: m, balance: bal });
    }
  });

  debtors.sort((a, b) => a.balance - b.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  const transactions = [];
  const tempDebtors = debtors.map(d => ({ ...d }));
  const tempCreditors = creditors.map(c => ({ ...c }));
  
  let dIdx = 0;
  let cIdx = 0;
  while (dIdx < tempDebtors.length && cIdx < tempCreditors.length) {
    const debtor = tempDebtors[dIdx];
    const creditor = tempCreditors[cIdx];
    const debtVal = Math.min(-debtor.balance, creditor.balance);
    
    transactions.push({
      from: debtor.name,
      to: creditor.name,
      amount: debtVal
    });
    
    debtor.balance += debtVal;
    creditor.balance -= debtVal;
    
    if (Math.abs(debtor.balance) < 0.01) dIdx++;
    if (Math.abs(creditor.balance) < 0.01) cIdx++;
  }

  const balancesEmpty = document.getElementById("sharedBalancesEmpty");
  const balancesList = document.getElementById("sharedBalancesList");
  if (balancesList && balancesEmpty) {
    if (transactions.length === 0) {
      balancesEmpty.style.display = "block";
      balancesList.innerHTML = "";
    } else {
      balancesEmpty.style.display = "none";
      balancesList.innerHTML = transactions.map(t => {
        const isYouDebtor = t.from === "Você";
        const isYouCreditor = t.to === "Você";
        let textPrefix = "";
        
        if (isYouDebtor) {
          textPrefix = `Você deve <strong class="balance-type-debt">R$ ${t.amount.toFixed(2)}</strong> a <strong>${t.to}</strong>`;
        } else if (isYouCreditor) {
          textPrefix = `<strong>${t.from}</strong> deve <strong class="balance-type-credit">R$ ${t.amount.toFixed(2)}</strong> a você`;
        } else {
          textPrefix = `<strong>${t.from}</strong> deve <strong>R$ ${t.amount.toFixed(2)}</strong> a <strong>${t.to}</strong>`;
        }

        return `
          <div class="balance-item" style="justify-content: center; padding: 10px 14px;">
            <span class="balance-text" style="font-size: 0.85rem; text-align: center;">${textPrefix}</span>
          </div>
        `;
      }).join("");
    }
  }

  const expensesEmpty = document.getElementById("sharedExpensesEmpty");
  const expensesList = document.getElementById("sharedExpensesList");
  if (expensesList && expensesEmpty) {
    if (expenses.length === 0) {
      expensesEmpty.style.display = "block";
      expensesList.innerHTML = "";
    } else {
      expensesEmpty.style.display = "none";
      expensesList.innerHTML = expenses.map(exp => {
        const isReimbursement = exp.isReimbursement || false;
        let iconClass = "fa-solid fa-receipt";
        if (isReimbursement) iconClass = "fa-solid fa-hand-holding-dollar";
        else if (exp.desc.toLowerCase().includes("jantar") || exp.desc.toLowerCase().includes("comida") || exp.desc.toLowerCase().includes("restaurante")) iconClass = "fa-solid fa-utensils";
        else if (exp.desc.toLowerCase().includes("gasolina") || exp.desc.toLowerCase().includes("pedágio") || exp.desc.toLowerCase().includes("uber") || exp.desc.toLowerCase().includes("transporte")) iconClass = "fa-solid fa-car";
        else if (exp.desc.toLowerCase().includes("hotel") || exp.desc.toLowerCase().includes("hospedagem") || exp.desc.toLowerCase().includes("airbnb")) iconClass = "fa-solid fa-hotel";
        else if (exp.desc.toLowerCase().includes("ingresso") || exp.desc.toLowerCase().includes("show") || exp.desc.toLowerCase().includes("museu") || exp.desc.toLowerCase().includes("passeio")) iconClass = "fa-solid fa-ticket";
        
        const payeeText = exp.payer === "Você" ? "Você pagou" : `${exp.payer} pagou`;
        const splitText = isReimbursement 
          ? `Reembolso direto para ${exp.participants[0]}` 
          : (exp.customShares ? `Divisão personalizada (${exp.participants.length} pessoas)` : `Dividido entre ${exp.participants.length} pessoas`);

        let detailsSpan = "";
        if (exp.payer === "Você") {
          const shareSelf = exp.customShares 
            ? (exp.customShares["Você"] || 0) 
            : (exp.participants.includes("Você") ? (exp.amount / exp.participants.length) : 0);
          detailsSpan = `<span class="balance-type-credit">Emprestou R$ ${(exp.amount - shareSelf).toFixed(2)}</span>`;
        } else {
          const shareSelf = exp.customShares
            ? (exp.customShares["Você"] || 0)
            : (exp.participants.includes("Você") ? (exp.amount / exp.participants.length) : 0);
          
          if (shareSelf > 0) {
            detailsSpan = `<span class="balance-type-debt">Sua parte: R$ ${shareSelf.toFixed(2)}</span>`;
          } else {
            detailsSpan = `<span class="balance-type-debt" style="opacity: 0.6">Não participa</span>`;
          }
        }

        return `
          <div class="expense-item" style="cursor: default;">
            <div class="expense-left">
              <div class="expense-icon" style="background: ${isReimbursement ? 'rgba(74, 222, 128, 0.12)' : 'rgba(56, 189, 248, 0.12)'}; color: ${isReimbursement ? '#4ade80' : '#38bdf8'}">
                <i class="${iconClass}"></i>
              </div>
              <div class="expense-info">
                <h4>${exp.desc}</h4>
                <p>${payeeText} • ${splitText} • ${exp.date}</p>
              </div>
            </div>
            <div class="expense-right" style="padding-right: 0;">
              <div class="expense-val">
                <span class="expense-amount">R$ ${exp.amount.toFixed(2)}</span>
                <div class="expense-details">
                  ${detailsSpan}
                </div>
              </div>
            </div>
          </div>
        `;
      }).reverse().join("");
    }
  }
}

function checkItineraryStatus() {
  const chatBtn = document.querySelector('.bottom-nav-btn[data-tab="chat"]');
  const bannerHero = document.getElementById("noItineraryBannerHero");
  const bannerGlobal = document.getElementById("noItineraryBannerGlobal");
  const hasItinerary = tripData.itinerary && tripData.itinerary.length > 0;
  
  // Detect current active tab
  const activeBtn = document.querySelector('.bottom-nav-btn.active');
  const activeTab = activeBtn ? activeBtn.dataset.tab : 'roteiro';
  
  if (!hasItinerary) {
    if (chatBtn) chatBtn.classList.add("pulse-glow");
    
    // In planning chat / travel chat tabs, we hide both dashboard banners
    if (activeTab === 'chat' || activeTab === 'naviagem') {
      if (bannerHero) bannerHero.classList.add("hidden");
      if (bannerGlobal) bannerGlobal.classList.add("hidden");
    } else if (activeTab === 'roteiro') {
      // Show hero banner, hide global banner
      if (bannerHero) bannerHero.classList.remove("hidden");
      if (bannerGlobal) bannerGlobal.classList.add("hidden");
    } else {
      // On other dashboard tabs (voos, orcamento, mala), show the compact global banner
      if (bannerHero) bannerHero.classList.add("hidden");
      if (bannerGlobal) bannerGlobal.classList.remove("hidden");
    }
  } else {
    if (chatBtn) chatBtn.classList.remove("pulse-glow");
    if (bannerHero) bannerHero.classList.add("hidden");
    if (bannerGlobal) bannerGlobal.classList.add("hidden");
  }
}

// ==========================================================================
// 7. MULTIMODAL ATTACHMENTS & IMAGE COMPRESSION HELPERS
// ==========================================================================
function compressImage(dataUrl, callback) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    const maxDim = 800;
    let width = img.width;
    let height = img.height;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    
    const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
    callback(compressedDataUrl);
  };
  img.src = dataUrl;
}

function handleFileSelect(e, mode) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const baseDataUrl = evt.target.result;
    
    const processFile = (dataUrlToUse) => {
      const base64Str = dataUrlToUse.split(',')[1];
      const attachment = {
        name: file.name,
        mimeType: file.type || "image/jpeg",
        base64: base64Str,
        dataUrl: dataUrlToUse
      };
      
      if (mode === 'plan') {
        planAttachment = attachment;
      } else {
        travelAttachment = attachment;
      }
      renderAttachmentPreview(mode);
    };

    if (file.type && file.type.startsWith("image/")) {
      compressImage(baseDataUrl, (compressedDataUrl) => {
        processFile(compressedDataUrl);
      });
    } else {
      processFile(baseDataUrl);
    }
  };
  reader.readAsDataURL(file);
}

function renderAttachmentPreview(mode) {
  const previewId = mode === 'plan' ? 'planAttachmentPreview' : 'travelAttachmentPreview';
  const container = document.getElementById(previewId);
  if (!container) return;

  const attachment = mode === 'plan' ? planAttachment : travelAttachment;
  
  if (!attachment) {
    container.innerHTML = "";
    container.style.display = "none";
    container.classList.add("hidden");
    return;
  }

  let previewHtml = "";
  if (attachment.mimeType.startsWith("image/")) {
    previewHtml = `
      <img src="${attachment.dataUrl}" style="width: 38px; height: 38px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
    `;
  } else {
    previewHtml = `
      <div style="width: 38px; height: 38px; border-radius: 6px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center;">
        <i class="fa-solid fa-file-lines" style="color: var(--primary); font-size: 1.1rem;"></i>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
      ${previewHtml}
      <div style="flex: 1; min-width: 0; text-align: left;">
        <span style="font-size: 0.8rem; font-weight: 600; color: white; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${attachment.name}</span>
        <span style="font-size: 0.68rem; color: var(--text-muted); display: block;">Pronto para enviar</span>
      </div>
      <button onclick="window.clearAttachment('${mode}')" style="background: none; border: none; padding: 6px; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='var(--text-muted)'">
        <i class="fa-solid fa-xmark" style="font-size: 1.1rem;"></i>
      </button>
    </div>
  `;
  container.style.display = "flex";
  container.classList.remove("hidden");
}

function clearAttachment(mode) {
  if (mode === 'plan') {
    planAttachment = null;
    const fInput = document.getElementById("planFileInput");
    const cInput = document.getElementById("planCameraInput");
    if (fInput) fInput.value = "";
    if (cInput) cInput.value = "";
  } else {
    travelAttachment = null;
    const fInput = document.getElementById("travelFileInput");
    const cInput = document.getElementById("travelCameraInput");
    if (fInput) fInput.value = "";
    if (cInput) cInput.value = "";
  }
  renderAttachmentPreview(mode);
}

function openImageLightbox(src, caption = "") {
  const lightbox = document.getElementById("galleryLightbox");
  const img = document.getElementById("lightboxImg");
  const cap = document.getElementById("lightboxCaption");
  if (lightbox && img) {
    img.src = src;
    if (cap) cap.textContent = caption || "Anexo";
    lightbox.style.display = "flex";
  }
}

function enableDragToScroll(el) {
  if (!el) return;

  let isDragging = false;
  let startX, startY;
  let scrollLeft, scrollTop;
  let mouseDownX, mouseDownY;
  let preventClick = false;

  el.style.cursor = 'grab';

  const onMouseDown = (e) => {
    // Avoid dragging when clicking interactive elements or forms
    const interactive = e.target.closest('button, input, textarea, a, select, option, label, .clickable, [onclick]');
    if (interactive) return;

    mouseDownX = e.pageX;
    mouseDownY = e.pageY;
    startX = e.pageX;
    startY = e.pageY;
    scrollLeft = el.scrollLeft;
    scrollTop = el.scrollTop;
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    const dx = e.pageX - mouseDownX;
    const dy = e.pageY - mouseDownY;

    if (!isDragging) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging = true;
        preventClick = true;
        el.style.cursor = 'grabbing';
        el.style.userSelect = 'none';
        el.style.scrollBehavior = 'auto';
        el.classList.add('active-dragging');
      }
    }

    if (isDragging) {
      el.scrollTop = scrollTop - dy;
      el.scrollLeft = scrollLeft - dx;
    }
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (isDragging) {
      el.style.cursor = 'grab';
      el.style.removeProperty('user-select');
      el.style.removeProperty('scroll-behavior');
      el.classList.remove('active-dragging');
      
      // Delay resetting dragging state to block click events from firing immediately
      setTimeout(() => {
        isDragging = false;
        preventClick = false;
      }, 50);
    } else {
      isDragging = false;
      preventClick = false;
    }
  };

  el.addEventListener('mousedown', onMouseDown);

  // Prevent click events when dragging occurred
  el.addEventListener('click', (e) => {
    if (preventClick) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

// Bind helpers to global window scope
window.clearAttachment = clearAttachment;
window.openImageLightbox = openImageLightbox;
window.enableDragToScroll = enableDragToScroll;

async function handleMagicImportPdf(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    alert("⚠️ Por favor, selecione apenas arquivos PDF.");
    return;
  }

  const btn = document.getElementById("magicImportPdfBtn");
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Lendo PDF...`;
  btn.disabled = true;

  try {
    // 1. Extração de texto usando PDF.js
    const pdfText = await extractTextFromPdf(file);
    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error("Não foi possível extrair nenhum texto legível deste PDF. Certifique-se de que não é um arquivo digitalizado protegido ou em formato de imagem pura.");
    }

    // 2. Chamada à nossa nova API do Gemini
    const token = await getFreshToken();
    const response = await fetch("/api/parse-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ text: pdfText })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro do servidor (${response.status}) ao analisar o arquivo.`);
    }

    const result = await response.json();
    if (!result || !result.type) {
      throw new Error("Estrutura de resposta inválida da inteligência artificial.");
    }

    // 3. Aplicação dos dados estruturados
    if (result.type === "flight") {
      const flightData = result.data;
      if (!tripData.flights) tripData.flights = [];
      tripData.flights.push(flightData);
      saveState();
      renderFlights();
      alert("✓ Passagem aérea importada e cadastrada com sucesso! Veja as informações no painel 'Seus Voos'.");
      triggerAiLogisticsSync();
    } else if (result.type === "hotel") {
      const hotelData = result.data;
      tripData.infoHotel = hotelData.hotel;
      if (hotelData.hotelLink) tripData.hotelLink = hotelData.hotelLink;
      if (hotelData.dates) tripData.infoDates = hotelData.dates;
      
      // Atualiza a data de início para contagem regressiva se informada
      if (hotelData.checkInDate) {
        tripData.targetDate = `${hotelData.checkInDate}T12:00:00`;
      }
      
      saveState();
      renderDashboard();
      alert("✓ Hospedagem e hotel atualizados com sucesso!");
      triggerAiLogisticsSync();
    } else {
      throw new Error("Não foi possível identificar o tipo de comprovante (voo ou hotel) neste PDF.");
    }

  } catch (err) {
    console.error("Erro na importação mágica de PDF:", err);
    alert(`⚠️ Falha na importação: ${err.message}`);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    e.target.value = ""; // limpa o input para novos uploads
  }
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  
  // Acessa a biblioteca PDF.js importada via CDN
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  
  // Limita a leitura às primeiras 3 páginas (geralmente suficiente para bilhetes e vouchers)
  const maxPages = Math.min(pdf.numPages, 3);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(" ");
    text += pageText + "\n";
  }
  return text;
}

// ==========================================================================
/* Realtime sync changes listener using Supabase postgres changes channel */
// ==========================================================================
function subscribeToTripChanges(tripId) {
  if (!tripId || !supabase || !isFirebaseConfigured()) return;
  
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }
  
  console.log(`Subscribing to realtime updates for trip ID: ${tripId}`);
  
  realtimeChannel = supabase
    .channel(`trip-changes-${tripId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'trips',
        filter: `id=eq.${tripId}`
      },
      (payload) => {
        console.log('Realtime trip update received:', payload);
        const updatedTrip = payload.new;
        if (updatedTrip) {
          const remoteUpdatedAt = new Date(updatedTrip.updated_at).getTime();
          const localUpdatedAt = tripData.updatedAt ? new Date(tripData.updatedAt).getTime() : 0;
          
          if (remoteUpdatedAt > localUpdatedAt) {
            console.log("Remote changes are newer. Syncing and re-rendering...");
            
            tripData.tripTitle = updatedTrip.title;
            tripData.tripSubtitle = updatedTrip.subtitle;
            tripData.infoDates = updatedTrip.dates;
            tripData.infoWeather = updatedTrip.weather;
            tripData.infoGroup = updatedTrip.group_type;
            tripData.infoHotel = updatedTrip.hotel;
            tripData.hotelLink = updatedTrip.hotel_link;
            tripData.targetDate = updatedTrip.target_date;
            tripData.budget = updatedTrip.budget || {};
            tripData.budgetThresholds = updatedTrip.budget_thresholds || { economico: 150, intermediario: 450 };
            tripData.budgetAnalysis = updatedTrip.budget_analysis || '';
            tripData.packing = updatedTrip.packing || [];
            tripData.itinerary = updatedTrip.itinerary || [];
            tripData.flights = updatedTrip.flights || [];
            tripData.members = updatedTrip.members || ['Você'];
            tripData.expenses = updatedTrip.expenses || [];
            tripData.updatedAt = updatedTrip.updated_at;
            
            // Re-render
            renderTimeline();
            renderFlights();
            renderSplitwise();
            renderPackingChecklist();
            checkItineraryStatus();
            updateBudget();
            renderDashboard();
            
            // Save locally
            localStorage.setItem(getUserStorageKey("gptViajante_tripData"), JSON.stringify(tripData));
          }
        }
      }
    )
    .subscribe();
}

// Open/Close Text Import Modal
function openTextImportModal() {
  const modal = document.getElementById("textImportModal");
  if (modal) {
    const textarea = document.getElementById("textImportArea");
    if (textarea) textarea.value = "";
    modal.showModal();
    
    // Fallback for browsers without closedby support
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const clickHandler = (event) => {
        if (event.target !== modal) return;
        const rect = modal.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (isDialogContent) return;
        modal.close();
        modal.removeEventListener('click', clickHandler);
      };
      modal.addEventListener('click', clickHandler);
    }
  }
}

function closeTextImportModal() {
  const modal = document.getElementById("textImportModal");
  if (modal) modal.close();
}

// Handle Paste Text Import
async function handleTextPasteImport() {
  const textarea = document.getElementById("textImportArea");
  if (!textarea) return;
  const text = textarea.value.trim();
  
  if (!text) {
    alert("⚠️ Por favor, cole o texto do e-mail ou comprovante antes de processar.");
    return;
  }
  
  const btn = document.getElementById("submitTextImportBtn");
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processando...`;
  btn.disabled = true;
  
  try {
    const token = await getFreshToken();
    const response = await fetch("/api/parse-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ text: text })
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro do servidor (${response.status}) ao analisar o texto.`);
    }
    
    const result = await response.json();
    if (!result || !result.type) {
      throw new Error("Estrutura de resposta inválida da inteligência artificial.");
    }
    
    if (result.type === "flight") {
      const flightData = result.data;
      if (!tripData.flights) tripData.flights = [];
      tripData.flights.push(flightData);
      saveState();
      renderFlights();
      alert("✓ Passagem aérea importada e cadastrada com sucesso! Veja as informações no painel 'Seus Voos'.");
      closeTextImportModal();
      triggerAiLogisticsSync();
    } else if (result.type === "hotel") {
      const hotelData = result.data;
      tripData.infoHotel = hotelData.hotel;
      if (hotelData.hotelLink) tripData.hotelLink = hotelData.hotelLink;
      if (hotelData.dates) tripData.infoDates = hotelData.dates;
      
      if (hotelData.checkInDate) {
        tripData.targetDate = `${hotelData.checkInDate}T12:00:00`;
      }
      
      saveState();
      renderDashboard();
      alert("✓ Hospedagem e hotel atualizados com sucesso!");
      closeTextImportModal();
      triggerAiLogisticsSync();
    } else {
      throw new Error("Não foi possível identificar o tipo de comprovante (voo ou hotel) neste texto.");
    }
  } catch (err) {
    console.error("Erro no processamento de texto:", err);
    alert(`⚠️ Falha no processamento: ${err.message}`);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

async function handleSaveHotelAndSync() {
  const hotelName = document.getElementById("hotelNameInput").value.trim();
  const hotelLink = document.getElementById("hotelLinkInput").value.trim();
  
  tripData.infoHotel = hotelName || "A definir";
  tripData.hotelLink = hotelLink || "";
  
  saveState();
  renderDashboard();
  
  await triggerAiLogisticsSync();
}

async function triggerAiLogisticsSync() {
  if (!navigator.onLine) {
    alert("📴 Modo Offline: Os dados de logística foram salvos localmente, mas a sincronização com a IA requer conexão com a internet.");
    return;
  }

  const loader = document.getElementById("globalIntegrationLoader");
  if (loader) {
    loader.classList.remove("hidden");
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const hotelDesc = (tripData.infoHotel && tripData.infoHotel !== "A definir") ? `${tripData.infoHotel} (Link: ${tripData.hotelLink || 'não informado'})` : 'Não definido';
  const flightsDesc = tripData.flights && tripData.flights.length > 0 ? JSON.stringify(tripData.flights) : 'Nenhum voo cadastrado';
  
  const text = `[Ação Automática de Logística]: As informações de voos ou hospedagem foram atualizadas. Por favor, reavalie e adapte todo o roteiro (itinerary), a lista de malas (packing) e o orçamento (budget) com base nas novas informações de logística. Hospedagem cadastrada: ${hotelDesc}. Voos cadastrados: ${flightsDesc}. Retorne o JSON atualizado com as modificações correspondentes no cronograma, mala de viagem e orçamento.`;

  // Push user command to history to keep context in sync
  const userMsgObject = { role: "user", content: text, time: timeStr };
  chatHistory.push(userMsgObject);
  saveState();

  try {
    const token = await getFreshToken();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ 
        messages: chatHistory, 
        travelMode: false,
        tripContext: {
          hotel: tripData.infoHotel,
          hotelLink: tripData.hotelLink,
          flights: tripData.flights,
          budget: tripData.budget,
          dates: tripData.infoDates,
          destination: tripData.tripTitle
        }
      })
    });

    if (response.status === 401 || response.status === 403) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Acesso Não Autorizado: ${errData.error || "Seu e-mail não está cadastrado."}`);
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro ${response.status} na comunicação com o servidor.`);
    }

    const data = await response.json();
    if (data.error) { 
      throw new Error(data.error); 
    }

    const replyContent = data.content;
    const parsedData = extractJsonFromReply(replyContent);
    if (parsedData) {
      try { 
        updateDashboardData(parsedData); 
      } catch (err) { 
        console.warn("Failed updating dashboard from sync response:", err); 
      }
    }

    const cleanReply = stripJsonCodeBlock(replyContent);
    const replyTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Append the assistant's response bubble to the chat
    const assistantMsgEl = appendMessageBubble("assistant", cleanReply, replyTime, 'plan');
    if (assistantMsgEl) {
      const container = document.getElementById("chatMessages");
      if (container) {
        container.scrollTo({ top: assistantMsgEl.offsetTop - 10, behavior: "smooth" });
      }
    }
    chatHistory.push({ role: "assistant", content: replyContent, time: replyTime });
    saveState();

  } catch (error) {
    console.error("AI Logistics Sync error:", error);
    alert(`⚠️ Falha na sincronização da IA: ${error.message}. As alterações de voo/hospedagem foram mantidas localmente.`);
  } finally {
    if (loader) {
      loader.classList.add("hidden");
    }
  }
}

// Expose functions globally
window.openTextImportModal = openTextImportModal;
window.closeTextImportModal = closeTextImportModal;
window.handleTextPasteImport = handleTextPasteImport;
window.subscribeToTripChanges = subscribeToTripChanges;
window.handleSaveHotelAndSync = handleSaveHotelAndSync;
window.triggerAiLogisticsSync = triggerAiLogisticsSync;



