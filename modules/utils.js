/**
 * GPT do Viajante - Utilitários Compartilhados
 * Funções auxiliares usadas em todas as partes da aplicação
 */

// ============== CÁLCULOS DE SALDO ==============

/**
 * Calcula e retorna lista ordenada de devedores e credores
 */
export function calculateBalances(expenses, participants) {
    const balance = {};
    participants.forEach(p => balance[p.name] = 0);

    expenses.forEach(expense => {
        if (!expense.paidBy || !expense.amount) return;
        
        const amount = parseFloat(expense.amount);
        if (isNaN(amount) || amount <= 0) return;
        
        const participantsList = expense.participants || participants.map(p => p.name);
        const share = amount / participantsList.length;
        
        if (balance[expense.paidBy] !== undefined) {
            balance[expense.paidBy] += amount;
        }
        
        participantsList.forEach(name => {
            if (balance[name] !== undefined) {
                balance[name] -= share;
            }
        });
    });

    // Separar em devedores e credores
    const debtors = [];
    const creditors = [];
    
    Object.entries(balance).forEach(([name, value]) => {
        if (value < -0.01) {
            debtors.push({ name, amount: Math.abs(value) });
        } else if (value > 0.01) {
            creditors.push({ name, amount: value });
        }
    });

    // Ordenar: devedores do maior devedor ao menor, credores do maior credor ao menor
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    return { debtors, creditors };
}

/**
 * Atualiza UI dos saldos compartilhados
 */
export function updateSharedBalances(trip) {
    if (!trip || !trip.expenses || !trip.participants) return;
    
    const { debtors, creditors } = calculateBalances(trip.expenses, trip.participants);
    
    const container = document.getElementById('shared-balances');
    if (!container) return;
    
    let html = '';
    
    if (debtors.length === 0 && creditors.length === 0) {
        html = '<p class="text-sm text-zinc-500">Todos os saldos estão quitados!</p>';
    } else {
        debtors.forEach(debtor => {
            creditors.forEach(creditor => {
                if (debtor.amount > 0 && creditor.amount > 0) {
                    const paymentAmount = Math.min(debtor.amount, creditor.amount);
                    html += `
                        <div class="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg mb-2">
                            <div class="flex items-center gap-2">
                                <span class="text-rose-400">${debtor.name}</span>
                                <span class="text-zinc-500">→</span>
                                <span class="text-emerald-400">${creditor.name}</span>
                            </div>
                            <span class="text-sm font-medium">R$ ${paymentAmount.toFixed(2)}</span>
                        </div>
                    `;
                    debtor.amount -= paymentAmount;
                    creditor.amount -= paymentAmount;
                }
            });
        });
    }
    
    container.innerHTML = html;
}

/**
 * Distribui despesas entre participantes
 */
export function settleDebts(trip) {
    if (!trip || !trip.expenses || !trip.participants) return [];
    
    const { debtors, creditors } = calculateBalances(trip.expenses, trip.participants);
    const settlements = [];
    
    // Copiar arrays para não modificar os originais
    const remainingDebtors = debtors.map(d => ({...d}));
    const remainingCreditors = creditors.map(c => ({...c}));
    
    remainingDebtors.forEach(debtor => {
        while (debtor.amount > 0.01 && remainingCreditors.length > 0) {
            const creditor = remainingCreditors[0];
            const paymentAmount = Math.min(debtor.amount, creditor.amount);
            
            settlements.push({
                from: debtor.name,
                to: creditor.name,
                amount: paymentAmount
            });
            
            debtor.amount -= paymentAmount;
            creditor.amount -= paymentAmount;
            
            if (creditor.amount < 0.01) {
                remainingCreditors.shift();
            }
        }
    });
    
    return settlements;
}

// ============== RENDERIZAÇÃO DE DESPESAS ==============

/**
 * Retorna ícone baseado na categoria da despesa
 */
export function getExpenseIcon(category) {
    const categoryLower = (category || '').toLowerCase();
    
    if (categoryLower.includes('alimentação') || categoryLower.includes('comida') || categoryLower.includes('restaurante')) {
        return '🍽️';
    } else if (categoryLower.includes('hotel') || categoryLower.includes('hospedagem') || categoryLower.includes('acomodação')) {
        return '🏨';
    } else if (categoryLower.includes('transporte') || categoryLower.includes('uber') || categoryLower.includes('táxi') || categoryLower.includes('carro')) {
        return '🚗';
    } else if (categoryLower.includes('passagem') || categoryLower.includes('viagem') || categoryLower.includes('avo')) {
        return '✈️';
    } else if (categoryLower.includes('atividade') || categoryLower.includes('passeio') || categoryLower.includes('tour')) {
        return '🎯';
    } else if (categoryLower.includes('compras') || categoryLower.includes('loja') || categoryLower.includes('mercado')) {
        return '🛍️';
    } else if (categoryLower.includes('bebida') || categoryLower.includes('bar') || categoryLower.includes('cerveja')) {
        return '🍺';
    } else if (categoryLower.includes('farmácia') || categoryLower.includes('remédio') || categoryLower.includes('saúde')) {
        return '💊';
    } else if (categoryLower.includes('guia') || categoryLower.includes('tour')) {
        return '🧑‍💼';
    } else {
        return '💰';
    }
}

/**
 * Renderiza lista de despesas na interface
 */
export function renderExpenses(expenses, participants, showAmount = true) {
    const container = document.getElementById('expenses-list');
    if (!container) return;
    
    if (expenses.length === 0) {
        container.innerHTML = '<p class="text-zinc-500 text-sm">Nenhuma despesa registrada ainda.</p>';
        return;
    }
    
    let html = '';
    
    expenses.forEach(expense => {
        const icon = getExpenseIcon(expense.category);
        const date = new Date(expense.timestamp).toLocaleDateString('pt-BR');
        
        html += `
            <div class="bg-zinc-800/30 p-3 rounded-lg mb-2 border border-zinc-700/50">
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${icon}</span>
                        <div>
                            <p class="text-sm font-medium">${expense.description || 'Despesa'}</p>
                            <p class="text-xs text-zinc-500">${expense.category || 'Outros'} • ${date}</p>
                            <p class="text-xs text-zinc-400">Pago por: ${expense.paidBy}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        ${showAmount ? `<p class="text-sm font-semibold">R$ ${parseFloat(expense.amount).toFixed(2)}</p>` : ''}
                        <div class="flex gap-1 mt-1">
                            <button onclick="editExpense('${expense.id}')" class="text-zinc-500 hover:text-amber-400 transition-colors">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                </svg>
                            </button>
                            <button onclick="deleteExpense('${expense.id}')" class="text-zinc-500 hover:text-rose-400 transition-colors">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============== GERENCIAMENTO DE ANEXOS ==============

/**
 * Limpa o anexo selecionado
 */
export function clearAttachment() {
    const attachmentPreview = document.getElementById('attachment-preview');
    const attachmentInput = document.getElementById('expense-attachment');
    
    if (attachmentPreview) {
        attachmentPreview.classList.add('hidden');
        attachmentPreview.innerHTML = '';
    }
    
    if (attachmentInput) {
        attachmentInput.value = '';
    }
    
    // Limpar também o estado da despesa sendo editada
    if (window.currentExpense) {
        window.currentExpense.attachment = null;
    }
}

// ============== LIGHTBOX ==============

/**
 * Abre lightbox para visualização de imagem
 */
export function openImageLightbox(imageUrl) {
    if (!imageUrl) return;
    
    // Criar overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4';
    overlay.onclick = () => overlay.remove();
    
    // Criar imagem
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'max-w-full max-h-full object-contain rounded-lg';
    img.onclick = (e) => e.stopPropagation();
    
    // Botão de fechar
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.className = 'absolute top-4 right-4 text-white text-2xl hover:text-zinc-300 transition-colors';
    closeBtn.onclick = () => overlay.remove();
    
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    
    // Fechar com ESC
    document.addEventListener('keydown', function closeOnEsc(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
}

// ============== DRAG TO SCROLL ==============

/**
 * Habilita arrastar para scroll em containers de conversa
 */
export function enableDragToScroll(element) {
    if (!element) return;
    
    let isDown = false;
    let startX;
    let scrollLeft;
    
    element.addEventListener('mousedown', (e) => {
        isDown = true;
        element.style.cursor = 'grabbing';
        startX = e.pageX - element.offsetLeft;
        scrollLeft = element.scrollLeft;
    });
    
    element.addEventListener('mouseleave', () => {
        isDown = false;
        element.style.cursor = 'grab';
    });
    
    element.addEventListener('mouseup', () => {
        isDown = false;
        element.style.cursor = 'grab';
    });
    
    element.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - element.offsetLeft;
        const walk = (x - startX) * 2;
        element.scrollLeft = scrollLeft - walk;
    });
}

// ============== UTILITÁRIOS GERAIS ==============

/**
 * Gera ID único
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Formata data para exibição
 */
export function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Escapa HTML para prevenir XSS
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Debounce simples
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}