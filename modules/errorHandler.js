/**
 * errorHandler.js — Tratamento centralizado de erros de frontend
 *
 * Captura window.onerror e unhandledrejection globalmente.
 * Registra erros de forma estruturada para observabilidade.
 * Exibe mensagem amigável ao usuário via toast.
 * NUNCA expõe stacktrace ao usuário nem loga secrets.
 */

const IS_DEV = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/**
 * Formata o tipo de erro em categoria legível
 * @param {Error|string} error
 * @returns {string}
 */
function classifyError(error) {
  if (!error) return 'unknown';
  const msg = (error.message || String(error)).toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) return 'network_error';
  if (msg.includes('401') || msg.includes('unauthorized')) return 'auth_error';
  if (msg.includes('403') || msg.includes('forbidden')) return 'permission_error';
  if (msg.includes('429') || msg.includes('rate limit')) return 'rate_limit';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('quota') || msg.includes('limit exceeded')) return 'quota_exceeded';
  return 'runtime_error';
}

/**
 * Registra erro estruturado para observabilidade.
 * Em produção, pode ser enviado para um serviço de monitoramento.
 * @param {Object} entry
 */
function logStructuredError(entry) {
  if (IS_DEV) {
    console.error('[errorHandler]', entry);
    return;
  }
  // Em produção: enviar para endpoint de observabilidade (fire-and-forget)
  // fetch('/api/errors', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(entry),
  //   keepalive: true
  // }).catch(() => {});
}

/**
 * Exibe mensagem amigável ao usuário via toast existente do app.
 * Nunca expõe detalhes técnicos.
 * @param {string} errorType
 */
function showUserFriendlyMessage(errorType) {
  const messages = {
    network_error:    'Sem conexão. Verifique sua internet e tente novamente.',
    auth_error:       'Sua sessão expirou. Faça login novamente.',
    permission_error: 'Você não tem permissão para esta ação.',
    rate_limit:       'Muitas requisições. Aguarde um momento e tente novamente.',
    timeout:          'A requisição demorou demais. Tente novamente.',
    quota_exceeded:   'Limite de uso atingido. Tente mais tarde.',
    runtime_error:    'Algo deu errado. Tente novamente.'
  };

  const msg = messages[errorType] || messages.runtime_error;

  // Usa o toast do app se disponível
  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
    window.showToast(msg, 'error');
    return;
  }

  // Fallback: toast simples
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #c62828; color: #fff; padding: 12px 20px; border-radius: 8px;
    z-index: 99999; font-size: 0.9rem; max-width: 90vw; text-align: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

/**
 * Inicializa o handler global de erros.
 * Deve ser chamado uma vez no início do app (antes do init()).
 * @param {string} appVersion - Versão atual do app (ex: '2.0.0-rc1')
 * @param {string} env - Ambiente atual ('development'|'production')
 */
export function initErrorHandler(appVersion, env) {
  if (typeof window === 'undefined') return;

  window.onerror = function (message, source, lineno, colno, error) {
    const errorType = classifyError(error || message);
    logStructuredError({
      type:        errorType,
      message:     String(message).substring(0, 200), // Limita tamanho, nunca inclui secrets
      source:      source ? source.split('/').pop() : 'unknown', // Só filename, não path completo
      line:        lineno,
      timestamp:   new Date().toISOString(),
      app_version: appVersion,
      env
    });
    showUserFriendlyMessage(errorType);
    return false; // Não suprime o erro no console de dev
  };

  window.onunhandledrejection = function (event) {
    const error = event.reason;
    const errorType = classifyError(error);
    logStructuredError({
      type:        errorType,
      message:     String(error?.message || error).substring(0, 200),
      timestamp:   new Date().toISOString(),
      app_version: appVersion,
      env
    });
    showUserFriendlyMessage(errorType);
  };
}

export default { initErrorHandler };
