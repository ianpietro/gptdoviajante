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
  btnSimulate.addEventListener("click", () => {
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
              <span class="sim-detail-line">→ <strong>Dica prática:</strong> Reserve a mesa com antecedência para garantir a melhor vista na janela.</span>
            </div>
            
            <div class="sim-turn-extra" style="border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px; margin-top: 8px;">
              ⭐ <strong>MOMENTO WOW DO DIA:</strong> Ver o entardecer do principal mirante de ${destination} com vista panorâmica.<br>
              💡 <strong>DICA DE INSIDER:</strong> Fuja dos táxis na saída do aeroporto, use o aplicativo oficial do local que economiza até 40% do trajeto.<br>
              🚗 <strong>LOGÍSTICA:</strong> Deslocamento a pé pelas atrações da tarde. Uber para o restaurante noturno (aprox. 15 minutos).
            </div>
          </div>
        </div>
        <div class="sim-day-card blurred">
          <div class="sim-day-card-header">
            <strong>DIA 2: Exploração Cultural & Dicas de Segurança</strong>
            <i class="fa-solid fa-lock lock-icon-inline"></i>
          </div>
        </div>
        <div class="sim-day-card blurred">
          <div class="sim-day-card-header">
            <strong>DIA 3: Rota Secreta de ${destination} & Experiência Wow</strong>
            <i class="fa-solid fa-lock lock-icon-inline"></i>
          </div>
        </div>
      `;
    }

    // Configura os itens de malas dinâmicos baseados no destino
    const simTabMala = document.getElementById("simTabMala");
    if (simTabMala) {
      const isWarm = ["bahia", "salvador", "fortaleza", "rio", "recife", "natal", "praia", "nordeste"].some(v => destination.toLowerCase().includes(v));
      const clothingTip = isWarm ? "Roupas leves e roupa de banho para praia" : "Roupas versáteis e casaco leve para as noites";
      
      simTabMala.innerHTML = `
        <div class="sim-packing-list">
          <div class="sim-pack-item"><i class="fa-solid fa-square-check"></i> Documentos da viagem e reservas para ${destination}</div>
          <div class="sim-pack-item"><i class="fa-solid fa-square-check"></i> ${clothingTip}</div>
          <div class="sim-pack-item blurred-item"><i class="fa-solid fa-lock"></i> Itens de higiene recomendados para o clima local</div>
          <div class="sim-pack-item blurred-item"><i class="fa-solid fa-lock"></i> Calçados ideais para as atividades do roteiro</div>
        </div>
      `;
    }

    setupSimTabs();
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
