/* ==========================================================================
   PÁGINA DE VENDAS - COPILOTO DE VIAGEM (Lógica de Interatividade)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  setupFaqAccordion();
  setupPreviewWidgetTabs();
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
// 2. TABS INTERATIVAS DO PREVIEW DO PAINEL (Buenos Aires)
// ==========================================================================
function setupPreviewWidgetTabs() {
  const tabs = document.querySelectorAll(".ppw-tab");
  const contents = document.querySelectorAll(".ppw-content");

  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-ppw");

      // Limpa estados ativos
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));

      // Ativa aba atual
      tab.classList.add("active");

      // Ativa painel correspondente
      const targetId = `ppw${target.charAt(0).toUpperCase() + target.slice(1)}`;
      const activeContent = document.getElementById(targetId);
      if (activeContent) {
        activeContent.classList.add("active");
      }
    });
  });
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


