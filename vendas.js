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
  const chatArea = document.getElementById("simChatArea");
  const lockOverlay = document.getElementById("simLockOverlay");

  if (!slider || !btnSimulate) return;

  // Atualiza o contador de dias quando move o slider
  slider.addEventListener("input", (e) => {
    const val = e.target.value;
    sliderLabel.textContent = `${val} ${val == 1 ? 'Dia' : 'Dias'}`;
  });

  // Ação de Simular Roteiro
  btnSimulate.addEventListener("click", () => {
    const destination = document.getElementById("simDest").value.trim() || "Nova York";
    const days = slider.value;
    const profileSelect = document.getElementById("simProfile");
    const profileText = profileSelect.options[profileSelect.selectedIndex].text.split(" (")[0];

    // Transição de estado: Formulário -> Chat
    formState.classList.add("hidden");
    chatState.classList.remove("hidden");

    // Inicia a sequência de mensagens simuladas
    runSimulationSequence(destination, days, profileText);
  });

  async function runSimulationSequence(dest, days, profile) {
    // 1. Mensagem do Usuário
    appendSimMessage("user", `Quero planejar uma viagem para <strong>${dest}</strong> por <strong>${days} ${days == 1 ? 'dia' : 'dias'}</strong> no estilo <strong>${profile}</strong>. Pode montar o roteiro?`);

    // 2. Typing indicator (loader) da IA
    const loader = appendSimLoader("Consultando Inteligência de Viagem...");

    try {
      // 3. Chamar API real do simulador
      const response = await fetch("/api/simular", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ destination: dest, days: days, profile: profile })
      });

      if (!response.ok) {
        throw new Error("Erro na resposta do simulador backend.");
      }

      const data = await response.json();
      loader.remove();

      // Formatar Markdown simples (negritos e quebras de linha)
      const formattedContent = data.content
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");

      // 4. Mostrar resposta real da IA
      appendSimMessage("assistant", formattedContent);

    } catch (err) {
      console.warn("Simulação com IA real falhou, usando fallback estático:", err);
      
      // Fallback estático caso a rede ou a chave falhem
      setTimeout(() => {
        loader.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Processando informações de destinos e clima...</span>`;
        
        setTimeout(() => {
          loader.remove();
          appendSimMessage("assistant", `🌍 <strong>Análise concluída para ${dest}!</strong><br>
          Identifiquei a melhor logística para <strong>${profile}</strong>. Vou estruturar seus ${days} dias divididos em turnos equilibrados (Manhã, Tarde e Noite) para evitar correria e garantir uma experiência incrível.`);
          
          setTimeout(() => {
            const loader2 = appendSimLoader("Construindo atrações, gastronomia e mala recomendada...");
            
            setTimeout(() => {
              loader2.remove();
              appendSimMessage("assistant", `🗓️ <strong>Roteiro Sob Medida: ${dest} (${days} Dias)</strong><br><br>
              <strong>Dia 1: Chegada, Check-in & Primeiro Contato</strong><br>
              • <strong>Manhã:</strong> Chegada no aeroporto, transporte sugerido por aplicativo/metrô até o hotel. Check-in e descanso.<br>
              • <strong>Tarde:</strong> Passeio a pé leve pela praça central ou parque próximo para aclimatação física.<br>
              • <strong>Noite:</strong> Jantar de boas-vindas em restaurante tradicional fora do radar turístico comum.`);
              
              // Exibe o overlay de bloqueio com o CTA de compra
              lockOverlay.classList.remove("hidden");
              chatArea.scrollTop = chatArea.scrollHeight;
            }, 2500);

          }, 1000);

        }, 2000);

      }, 800);
      return;
    }

    // Exibe o overlay de bloqueio com o CTA de compra
    lockOverlay.classList.remove("hidden");
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function appendSimMessage(sender, htmlContent) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `sim-msg ${sender}`;
    msgDiv.innerHTML = `
      <div class="sim-msg-bubble">
        <p>${htmlContent}</p>
      </div>
    `;
    chatArea.appendChild(msgDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function appendSimLoader(loadingText) {
    const loaderDiv = document.createElement("div");
    loaderDiv.className = "sim-loading-bubble";
    loaderDiv.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>${loadingText}</span>`;
    chatArea.appendChild(loaderDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
    return loaderDiv;
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
