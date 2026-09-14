let activeDocumentCategory = "Todos";
let documentSearchQuery = "";

// Attach event listeners for category filters and search
function setupReservationFilters() {
  const categoryBtns = document.querySelectorAll(".category-filters .btn-sub-tab");
  categoryBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      categoryBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      activeDocumentCategory = e.target.dataset.category;
      renderDocuments();
    });
  });

  const searchInput = document.getElementById("documentSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      documentSearchQuery = e.target.value.toLowerCase();
      renderDocuments();
    });
  }

  const openResModalBtn = document.getElementById("openReservationModalBtn");
  if (openResModalBtn) {
    openResModalBtn.addEventListener("click", () => {
      document.getElementById("reservationForm").reset();
      document.getElementById("editReservationId").value = "";
      document.getElementById("reservationModal").classList.remove("hidden");
    });
  }

  const closeResModalBtn = document.getElementById("closeReservationModal");
  if (closeResModalBtn) {
    closeResModalBtn.addEventListener("click", () => {
      document.getElementById("reservationModal").classList.add("hidden");
    });
  }

  const resForm = document.getElementById("reservationForm");
  if (resForm) {
    resForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveReservation();
    });
  }
}

function saveReservation() {
  const idField = document.getElementById("editReservationId").value;
  const type = document.getElementById("resTypeInput").value;
  const title = document.getElementById("resTitleInput").value;
  const provider = document.getElementById("resProviderInput").value;
  const reference = document.getElementById("resReferenceInput").value;
  const start = document.getElementById("resStartDateInput").value;
  const end = document.getElementById("resEndDateInput").value;
  const notes = document.getElementById("resNotesInput").value;

  tripData.reservations = tripData.reservations || [];
  
  if (idField) {
    const res = tripData.reservations.find(r => r.id === idField);
    if (res) {
      res.type = type;
      res.title = title;
      res.provider = provider;
      res.reference = reference;
      res.start_datetime = start;
      res.end_datetime = end;
      res.notes = notes;
    }
  } else {
    const newRes = {
      id: "res_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      trip_id: tripData.id || "temp",
      type: type,
      title: title,
      provider: provider,
      reference: reference,
      start_datetime: start,
      end_datetime: end,
      notes: notes,
      is_favorite: false,
      created_at: new Date().toISOString()
    };
    tripData.reservations.push(newRes);
  }
  
  saveState();
  renderDocuments();
  document.getElementById("reservationModal").classList.add("hidden");
}

function toggleFavoriteReservation(id, isDoc = false) {
  const list = isDoc ? (tripData.documents || []) : (tripData.reservations || []);
  const item = list.find(i => i.id === id);
  if (item) {
    item.is_favorite = !item.is_favorite;
    saveState();
    renderDocuments();
  }
}

function renderDocuments() {
  const container = document.getElementById("documentsList");
  const emptyState = document.getElementById("documentsEmpty");
  if (!container || !emptyState) return;

  const docs = tripData.documents || [];
  const res = tripData.reservations || [];

  let combined = [
    ...docs.map(d => ({ ...d, _isDoc: true })),
    ...res.map(r => ({ ...r, _isDoc: false }))
  ];

  if (activeDocumentCategory !== "Todos") {
    combined = combined.filter(item => {
      const itemType = item.type || item.category || "";
      if (activeDocumentCategory === "Passagem Aérea") return itemType.includes("Passagem") || itemType.includes("Voo");
      if (activeDocumentCategory === "Hospedagem") return itemType.includes("Hospedagem") || itemType.includes("Hotel");
      if (activeDocumentCategory === "Ingresso") return itemType.includes("Ingresso");
      if (activeDocumentCategory === "Seguro Viagem") return itemType.includes("Seguro");
      return itemType.includes("Outros") || (!itemType.includes("Passagem") && !itemType.includes("Voo") && !itemType.includes("Hospedagem") && !itemType.includes("Hotel") && !itemType.includes("Ingresso") && !itemType.includes("Seguro"));
    });
  }

  if (documentSearchQuery) {
    combined = combined.filter(item => {
      const text = `${item.title || item.name || ""} ${item.provider || ""} ${item.reference || ""}`.toLowerCase();
      return text.includes(documentSearchQuery);
    });
  }

  const now = new Date();
  
  if (tripData.start_date && (new Date(tripData.start_date) <= now)) {
    combined.sort((a, b) => {
      const dateA = new Date(a.start_datetime || a.created_at || a.date || 0);
      const dateB = new Date(b.start_datetime || b.created_at || b.date || 0);
      return dateA - dateB;
    });
  } else {
    combined.sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      const typeA = a.type || a.category || "";
      const typeB = b.type || b.category || "";
      return typeA.localeCompare(typeB);
    });
  }

  if (combined.length === 0) {
    emptyState.classList.remove("hidden");
    container.innerHTML = "";
    return;
  }

  emptyState.classList.add("hidden");
  
  container.innerHTML = combined.map(item => {
    const isSupabaseFile = item.file_reference || (item.url && item.url.includes("supabase.co"));
    let blockView = false;
    if (window.isSharedView && isSupabaseFile) {
      blockView = true;
    }

    const title = item.title || item.name || "Sem título";
    const provider = item.provider || (item._isDoc ? "Arquivo" : "Reserva");
    const refCode = item.reference ? `Ref: ${item.reference}` : "";
    const favIcon = item.is_favorite ? '<i class="fa-solid fa-star" style="color: #fbbf24;"></i>' : '<i class="fa-regular fa-star"></i>';
    
    let dateStr = "";
    if (item.start_datetime) {
      const dt = new Date(item.start_datetime);
      dateStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      if (item.end_datetime) {
        const et = new Date(item.end_datetime);
        dateStr += " - " + et.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      }
    } else if (item.date) {
      dateStr = item.date;
    }

    const iconTypeClass = item._isDoc ? (item.type === 'pdf' ? 'fa-file-pdf' : 'fa-file-image') : 'fa-ticket';

    return `
      <div class="glass-panel" style="padding: 16px; display: flex; flex-direction: column; gap: 12px; position: relative;">
        <button onclick="toggleFavoriteReservation('${item.id}', ${item._isDoc})" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; z-index: 10;">
          ${favIcon}
        </button>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: var(--primary);">
            <i class="fa-solid ${iconTypeClass}"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 24px;">${title}</h4>
            <p style="margin: 2px 0 0; font-size: 0.75rem; color: var(--text-muted);">${provider} ${refCode ? '• ' + refCode : ''}</p>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px;">
          <div style="font-size: 0.75rem; color: var(--text-light); font-weight: 600;">
            ${dateStr ? '<i class="fa-regular fa-calendar" style="margin-right: 4px;"></i> ' + dateStr : ''}
          </div>
          <div style="display: flex; gap: 8px;">
            ${blockView ? 
              `<button class="btn btn-secondary btn-sm" disabled style="opacity: 0.5; cursor: not-allowed;" title="Visualização bloqueada em modo compartilhado"><i class="fa-solid fa-lock"></i></button>` 
            : 
              (item._isDoc ? 
                `<button class="btn btn-secondary btn-sm" onclick="viewDocument('${item.id}')"><i class="fa-solid fa-eye"></i></button>`
              : '')
            }
            ${window.isSharedView ? '' : `
              <button class="flight-action-btn delete" style="padding: 6px; font-size: 0.8rem;" onclick="deleteDocumentOrRes('${item.id}', ${item._isDoc})">
                <i class="fa-solid fa-trash"></i>
              </button>
            `}
          </div>
        </div>
        ${!item._isDoc ? `
        <div style="font-size: 0.65rem; color: var(--text-muted); position: absolute; bottom: 12px; left: 16px;">
          <i class="fa-solid fa-cloud-arrow-down"></i> Offline
        </div>
        ` : ''}
      </div>
    `;
  }).join("");
}

function deleteDocumentOrRes(id, isDoc) {
  if (confirm("Deseja excluir este item?")) {
    if (isDoc) {
      deleteDocument(id);
    } else {
      tripData.reservations = tripData.reservations.filter(r => r.id !== id);
      saveState();
      renderDocuments();
    }
  }
}
window.deleteDocumentOrRes = deleteDocumentOrRes;
window.toggleFavoriteReservation = toggleFavoriteReservation;
