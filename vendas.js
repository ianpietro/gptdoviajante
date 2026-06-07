/* ==========================================================================
   PÁGINA DE VENDAS - GPT DO VIAJANTE (Lógica de Interatividade)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  setupFaqAccordion();
  setupItinerarySimulator();
  setupScrollAnimationFallback();
});

// ==========================================================================
// 1. FAQ ACCORDION (Perguntas Frequentes)
// ==========================================================================
function setupFaqAccordion() {
  const faqItems = document.querySelectorAll(".faq-item");

  faqItems.forEach(item => {
    const question = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");

    question.addEventListener("click", () => {
      const isActive = item.classList.contains("active");

      // Fecha todos os outros acordeões
      faqItems.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove("active");
          otherItem.querySelector(".faq-answer").style.maxHeight = null;
        }
      });

      // Alterna o estado do acordeão atual
      if (isActive) {
        item.classList.remove("active");
        answer.style.maxHeight = null;
      } else {
        item.classList.add("active");
        answer.style.maxHeight = answer.scrollHeight + "px";
      }
    });
  });
}

// ==========================================================================
// 2. SIMULADOR INTERATIVO DE ROTEIRO
// ==========================================================================
function setupItinerarySimulator() {
  const slider = document.getElementById("simDays");
  const sliderLabel = document.getElementById("simDaysLabel");
  const btnSimulate = document.getElementById("btnSimulate");
  
  const formState = document.getElementById("simFormState");
  const chatState = document.getElementById("simChatState");

  if (!slider || !btnSimulate) return;

  // Atualiza o contador de dias quando move o slider
  slider.addEventListener("input", (e) => {
    const val = e.target.value;
    sliderLabel.textContent = `${val} ${val == 1 ? 'Dia' : 'Dias'}`;
  });

  // Ação de Simular Roteiro
  btnSimulate.addEventListener("click", async () => {
    const destination = document.getElementById("simDest").value.trim() || "Salvador";
    const days = parseInt(slider.value, 10);
    const profileSelect = document.getElementById("simProfile");
    const profileText = profileSelect.options[profileSelect.selectedIndex].text.split(" (")[0];

    // Transição de estado: Formulário -> Pré-visualização
    formState.classList.add("hidden");
    chatState.classList.remove("hidden");

    // Preenche as metainformações da viagem
    document.getElementById("simMetaDest").textContent = destination;
    document.getElementById("simMetaDays").textContent = `${days} ${days === 1 ? 'Dia' : 'Dias'}`;
    document.getElementById("simMetaProfile").textContent = profileText;

    // Calcula estimativa de custos dinâmica
    const ecoVal = days * 120;
    const confVal = days * 320;
    const premVal = days * 780;

    document.getElementById("simBudgetValueEco").textContent = `R$ ${ecoVal.toLocaleString("pt-BR")}`;
    document.getElementById("simBudgetValueConf").textContent = `R$ ${confVal.toLocaleString("pt-BR")}`;
    document.getElementById("simBudgetValuePrem").textContent = `R$ ${premVal.toLocaleString("pt-BR")}`;

    // Configura os textos dinâmicos do Dia 1 para parecer ultra personalizado
    const simTabRoteiro = document.getElementById("simTabRoteiro");
    if (simTabRoteiro) {
      simTabRoteiro.innerHTML = `
        <div class="sim-day-card">
          <div class="sim-day-card-header">
            <strong>DIA 1: Primeiro Contato com ${destination}</strong>
          </div>
          <div class="sim-day-turns" style="display: flex; flex-direction: column; gap: 14px;">
            <div class="sim-turn">
              🌅 <strong>MANHÃ (aprox. 08h–12h)</strong><br>
              Chegada e reconhecimento dos arredores da hospedagem.<br>
              <span class="sim-detail-line">→ <strong>Por que vale:</strong> Se situar no destino e fazer o check-in sem pressa para carregar baterias.</span><br>
              <span class="sim-detail-line">→ <strong>Dica prática:</strong> Garanta o chip de internet e o cartão de transporte local direto no saguão de desembarque.</span><br>
              <span class="sim-detail-line">→ <strong>Entrada:</strong> Gratuito</span>
            </div>
            
            <div class="sim-turn">
              🌇 <strong>TARDE (aprox. 12h–18h)</strong><br>
              Caminhada guiada pelo centro histórico de ${destination}.<br>
              <span class="sim-detail-line">→ <strong>Por que vale:</strong> Conectar com a essência cultural e ver os marcos históricos mais emblemáticos do local de perto.</span><br>
              <span class="sim-detail-line">→ <strong>Dica prática:</strong> Vá com calçado confortável, pois as ruas centrais são de paralelepípedo antigo.</span><br>
              <span class="sim-detail-line">→ <strong>Entrada:</strong> Gratuito</span>
            </div>
            
            <div class="sim-turn">
              🍔 <strong>Pausa Gastronômica Recomendada</strong><br>
              Restaurante local tradicional de ${destination}.<br>
              <span class="sim-detail-line">→ <strong>Indicação:</strong> Peça o prato assinatura da casa para começar a viagem com o pé direito.</span><br>
              <span class="sim-detail-line">→ <strong>Preço médio:</strong> R$ 45 a R$ 60 por pessoa</span><br>
              <div class="sim-restaurant-links" style="margin-top: 8px; display: flex; gap: 8px;">
                <a href="https://tripadvisor.com" target="_blank" class="sim-restaurant-link-btn" style="padding: 4px 8px; font-size: 0.7rem; background: #00af87; color: white; border-radius: 4px; text-decoration: none;"><i class="fa-solid fa-map-location-dot"></i> TripAdvisor</a>
                <a href="https://google.com/maps" target="_blank" class="sim-restaurant-link-btn" style="padding: 4px 8px; font-size: 0.7rem; background: #4285f4; color: white; border-radius: 4px; text-decoration: none;"><i class="fa-solid fa-location-dot"></i> Google Maps</a>
              </div>
            </div>

            <div class="sim-turn">
              🌙 <strong>NOITE (aprox. 18h–22h+)</strong><br>
              Jantar panorâmico ou caminhada por mirante iluminado.<br>
              <span class="sim-detail-line">→ <strong>Por que vale:</strong> Ver a silhueta da cidade acesa com atmosfera local vibrante e romântica.</span><br>
        <div style="text-align: center; padding: 50px 20px;">
          <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.6rem; color: var(--primary); margin-bottom: 12px; display: inline-block;"></i>
          <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin: 0;">Consultando Inteligência de Viagem...<br><span style="font-size: 0.72rem; opacity: 0.8; display: block; margin-top: 4px;">Gerando roteiro exclusivo para ${destination}</span></p>
        </div>
      `;
    }

    // Configura os itens de malas e abas enquanto carrega
    setupSimTabs();

    try {
      const response = await fetch("/api/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, days, profile: profileText })
      });

      if (!response.ok) throw new Error("Erro na simulação.");
      const data = await response.json();

      // Renderiza o Dia 1 dinamicamente com os dados retornados pela IA
      if (simTabRoteiro) {
        let activitiesHtml = "";
        if (data.activities && Array.isArray(data.activities)) {
          data.activities.forEach(act => {
            const isFood = /almoço|jantar|almoço|almoço|jantar|restaurante|comer|café|culinária|gastronomia/i.test(act.title + " " + act.desc);
            let foodLinks = "";
            if (isFood) {
              foodLinks = `
                <div class="sim-restaurant-links" style="margin-top: 8px; display: flex; gap: 8px;">
                  <a href="https://www.tripadvisor.com.br/Search?q=${encodeURIComponent(act.title + ' ' + destination)}" target="_blank" class="sim-restaurant-link-btn" style="padding: 4px 8px; font-size: 0.7rem; background: #00af87; color: white; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-map-location-dot"></i> TripAdvisor</a>
                  <a href="https://www.google.com/maps/search/${encodeURIComponent(act.title + ' ' + destination)}" target="_blank" class="sim-restaurant-link-btn" style="padding: 4px 8px; font-size: 0.7rem; background: #4285f4; color: white; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-location-dot"></i> Google Maps</a>
                </div>
              `;
            }

            activitiesHtml += `
              <div class="sim-turn" style="border-bottom: 1px dashed rgba(255,255,255,0.06); padding-bottom: 12px; margin-bottom: 12px;">
                <span style="font-family: var(--font-heading); font-weight: 700; color: var(--accent); font-size: 0.8rem; display: block; margin-bottom: 3px;">
                  <i class="fa-regular fa-clock"></i> ${act.time || '09:00'} — ${act.title}
                </span>
                <p style="font-size: 0.78rem; color: var(--text-light); line-height: 1.45; margin: 0;">${act.desc}</p>
                ${foodLinks}
              </div>
            `;
          });
        }

        simTabRoteiro.innerHTML = `
          <div class="sim-day-card">
            <div class="sim-day-card-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 12px;">
              <strong>DIA 1: ${data.dayTitle || 'Chegada & Reconhecimento'}</strong>
              <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500;">${data.date || ''}</span>
            </div>
            
            <div class="sim-day-turns" style="display: flex; flex-direction: column; text-align: left;">
              ${activitiesHtml}
              
              <!-- Footer Details exactly like in the product -->
              <div class="timeline-footer-details" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                <div class="footer-detail-item" style="display: flex; gap: 6px;">
                  <i class="fa-solid fa-bed" style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;"></i>
                  <div class="footer-detail-text">
                    <h5 style="font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">HOSPEDAGEM</h5>
                    <p style="font-size: 0.72rem; color: var(--text-main); font-weight: 500; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${data.hotel || ''}">${data.hotel || 'Pelo perfil'}</p>
                  </div>
                </div>
                <div class="footer-detail-item" style="display: flex; gap: 6px;">
                  <i class="fa-solid fa-utensils" style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;"></i>
                  <div class="footer-detail-text">
                    <h5 style="font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">REFEIÇÃO</h5>
                    <p style="font-size: 0.72rem; color: var(--text-main); font-weight: 500; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${data.restaurant || ''}">${data.restaurant || 'Livre'}</p>
                  </div>
                </div>
                <div class="footer-detail-item" style="display: flex; gap: 6px;">
                  <i class="fa-solid fa-car" style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;"></i>
                  <div class="footer-detail-text">
                    <h5 style="font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">TRANSPORTE</h5>
                    <p style="font-size: 0.72rem; color: var(--text-main); font-weight: 500; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${data.transport || ''}">${data.transport || 'Público'}</p>
                  </div>
                </div>
              </div>

              <!-- Extra sections for WoW moment, Insider and Logistics -->
              <div class="sim-turn-extra" style="border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 10px; margin-top: 12px; font-size: 0.74rem; color: var(--text-light); line-height: 1.45; text-align: left; display: flex; flex-direction: column; gap: 6px;">
                <div>⭐ <strong>MOMENTO WOW:</strong> ${data.wow}</div>
                <div>💡 <strong>SEGREDOS DE INSIDER:</strong> ${data.insider}</div>
                <div>🚗 <strong>LOGÍSTICA:</strong> ${data.logistics}</div>
              </div>
            </div>
          </div>
          
          <div class="sim-day-card blurred" style="margin-top: 8px;">
            <div class="sim-day-card-header">
              <strong>DIA 2: Roteiro Avançado & Dicas de Segurança</strong>
              <i class="fa-solid fa-lock lock-icon-inline"></i>
            </div>
          </div>
          <div class="sim-day-card blurred">
            <div class="sim-day-card-header">
              <strong>DIA 3: Rota Secreta & Experiência Gastronômica</strong>
              <i class="fa-solid fa-lock lock-icon-inline"></i>
            </div>
          </div>
        `;
      }

      // Preenche os custos reais gerados pela inteligência da IA
      if (data.budget) {
        const ecoVal = data.budget.economico * days;
        const confVal = data.budget.intermediario * days;
        const premVal = data.budget.conforto * days;

        document.getElementById("simBudgetValueEco").textContent = `R$ ${ecoVal.toLocaleString("pt-BR")}`;
        document.getElementById("simBudgetValueConf").textContent = `R$ ${confVal.toLocaleString("pt-BR")}`;
        document.getElementById("simBudgetValuePrem").textContent = `R$ ${premVal.toLocaleString("pt-BR")}`;
      }

      // Insere a análise financeira personalizada feita pela IA
      const simBudgetDesc = document.querySelector(".sim-budget-desc");
      if (simBudgetDesc && data.budgetAnalysis) {
        simBudgetDesc.innerHTML = `<strong>Análise de Custo Real:</strong> ${data.budgetAnalysis}<br><span style="font-size: 0.68rem; opacity: 0.7; margin-top: 6px; display: block;">Estimativa total calculada para ${days} dias.</span>`;
      }

      // Preenche a mala dinâmica baseada na IA
      const simTabMala = document.getElementById("simTabMala");
      if (simTabMala && data.packing && Array.isArray(data.packing)) {
        let packingHtml = `<div class="sim-packing-list">`;
        
        // Loop over the first category and show its items as checked
        const firstCat = data.packing[0];
        if (firstCat && firstCat.items) {
          firstCat.items.forEach(item => {
            packingHtml += `<div class="sim-pack-item"><i class="fa-solid fa-square-check"></i> ${item} (${firstCat.category})</div>`;
          });
        }
        
        // Add blurred items for other categories
        packingHtml += `
          <div class="sim-pack-item blurred-item"><i class="fa-solid fa-lock"></i> Itens de higiene e remédios para ${destination}</div>
          <div class="sim-pack-item blurred-item"><i class="fa-solid fa-lock"></i> Roupas específicas recomendadas para o clima local</div>
        </div>`;
        
        simTabMala.innerHTML = packingHtml;
      }

    } catch (err) {
      console.error("Simulation request failed:", err);
      // Fallback estático estruturado caso dê erro para não quebrar a página
      if (simTabRoteiro) {
        simTabRoteiro.innerHTML = `
          <div class="sim-day-card">
            <div class="sim-day-card-header">
              <strong>DIA 1: Primeiro Contato com ${destination}</strong>
            </div>
            <div class="sim-day-turns" style="display: flex; flex-direction: column; gap: 14px; text-align: left;">
              <div class="sim-turn">
                🌅 <strong>MANHÃ (aprox. 08h–12h)</strong><br>
                Chegada e reconhecimento dos arredores da hospedagem.<br>
                <span class="sim-detail-line">→ <strong>Por que vale:</strong> Se situar no destino e fazer o check-in sem pressa para carregar baterias.</span><br>
                <span class="sim-detail-line">→ <strong>Dica prática:</strong> Garanta o chip de internet e o cartão de transporte local direto no saguão de desembarque.</span><br>
                <span class="sim-detail-line">→ <strong>Entrada:</strong> Gratuito</span>
              </div>
              
              <div class="sim-turn">
                🌇 <strong>TARDE (aprox. 12h–18h)</strong><br>
                Caminhada guiada pelo centro histórico de ${destination}.<br>
                <span class="sim-detail-line">→ <strong>Por que vale:</strong> Conectar com a essência cultural e ver os marcos históricos mais emblemáticos do local de perto.</span><br>
                <span class="sim-detail-line">→ <strong>Dica prática:</strong> Vá com calçado confortável, pois as ruas centrais são de paralelepípedo antigo.</span><br>
                <span class="sim-detail-line">→ <strong>Entrada:</strong> Gratuito</span>
              </div>
              
              <div class="sim-turn-extra" style="border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px; margin-top: 8px; font-size: 0.76rem; color: var(--text-light); line-height: 1.5; text-align: left;">
                ⭐ <strong>MOMENTO WOW DO DIA:</strong> Ver o entardecer do principal mirante de ${destination}.<br>
                💡 <strong>DICA DE INSIDER:</strong> Fuja dos táxis credenciados no aeroporto, peça carro de aplicativo para economizar.<br>
                🚗 <strong>LOGÍSTICA:</strong> Deslocamentos a pé e por metrô no centro.
              </div>
            </div>
          </div>
          <div class="sim-day-card blurred">
            <div class="sim-day-card-header">
              <strong>DIA 2: Exploração Cultural & Dicas de Segurança</strong>
              <i class="fa-solid fa-lock lock-icon-inline"></i>
            </div>
          </div>
        `;
      }
    }
  });

  // Configura a troca de abas no simulador
  function setupSimTabs() {
    const tabs = document.querySelectorAll(".sim-tab");
    const contents = document.querySelectorAll(".sim-tab-content");

    tabs.forEach(tab => {
      // Remover event listeners anteriores clonando o elemento se necessário, ou limpando
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);
      
      newTab.addEventListener("click", () => {
        const target = newTab.dataset.simTab;

        // Limpar estados ativos
        document.querySelectorAll(".sim-tab").forEach(t => t.classList.remove("active"));
        contents.forEach(c => c.classList.remove("active"));

        // Ativar aba clicada
        newTab.classList.add("active");
        
        if (target === "roteiro") {
          document.getElementById("simTabRoteiro").classList.add("active");
        } else if (target === "orcamento") {
          document.getElementById("simTabOrcamento").classList.add("active");
        } else if (target === "mala") {
          document.getElementById("simTabMala").classList.add("active");
        }
      });
    });
  }
}

// ==========================================================================
// 3. FALLBACK DE ANIMAÇÃO DE SCROLL (Intersection Observer)
// ==========================================================================
function setupScrollAnimationFallback() {
  // Se o navegador já suporta Scroll-driven animations nativas, não precisa do fallback JS
  if (CSS.supports('(animation-timeline: view()) and (animation-range: entry)')) {
    return;
  }

  // Elementos a revelar no scroll
  const targets = document.querySelectorAll(
    ".pain-card, .feature-item, .step-card, .testimonial-card, .faq-item, #priceCard"
  );

  // Aplica estilos iniciais de animação via classe auxiliar
  targets.forEach(target => {
    target.style.opacity = "0";
    target.style.transform = "translateY(30px)";
    target.style.transition = "opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
  });

  const observerOptions = {
    root: null,
    rootMargin: "0px",
    threshold: 0.15 // Dispara quando 15% do elemento estiver visível
  };

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target;
        target.style.opacity = "1";
        target.style.transform = "translateY(0)";
        obs.unobserve(target); // Para de observar após revelar
      }
    });
  }, observerOptions);

  targets.forEach(target => {
    observer.observe(target);
  });
}
