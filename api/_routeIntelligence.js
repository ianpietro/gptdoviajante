const fs = require('fs');
const path = require('path');

const ROUTE_INTELLIGENCE_RELATIVE_PATH = path.join('docs', 'ai', 'ORBIA_ROUTE_INTELLIGENCE.md');
const REQUIRED_MARKERS = [
  'Versão 1.1',
  'Motor de roteirização operacional',
  'Protocolo cognitivo de roteirização',
  'Auditoria silenciosa de viabilidade',
  'Separação entre fatos e escolhas editoriais'
];

let cachedSource = null;

function resolveRouteIntelligencePath() {
  const candidates = [
    path.join(process.cwd(), ROUTE_INTELLIGENCE_RELATIVE_PATH),
    path.join(__dirname, '..', ROUTE_INTELLIGENCE_RELATIVE_PATH)
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function loadRouteIntelligenceSource() {
  if (cachedSource) return cachedSource;
  const sourcePath = resolveRouteIntelligencePath();
  let source = '';
  try {
    source = fs.readFileSync(sourcePath, 'utf8').trim();
  } catch (error) {
    const wrapped = new Error(`Fonte canônica de roteirização indisponível: ${ROUTE_INTELLIGENCE_RELATIVE_PATH}`);
    wrapped.code = 'ROUTE_INTELLIGENCE_UNAVAILABLE';
    wrapped.cause = error;
    throw wrapped;
  }

  const missingMarkers = REQUIRED_MARKERS.filter(marker => !source.includes(marker));
  if (source.length < 10000 || missingMarkers.length > 0) {
    const error = new Error(`Fonte canônica de roteirização inválida ou incompleta: ${missingMarkers.join(', ') || 'conteúdo insuficiente'}`);
    error.code = 'ROUTE_INTELLIGENCE_INVALID';
    throw error;
  }
  cachedSource = source;
  return cachedSource;
}

function buildRouteIntelligenceSystemPrompt() {
  return `
======================================================================
FONTE CANÔNICA DA INTELIGÊNCIA DE ROTEIRIZAÇÃO — ORBIA TRAVEL v1.1
======================================================================

O documento abaixo governa COMO pesquisar, raciocinar, selecionar, organizar, escrever e revisar qualquer roteiro. Ele não define integração com o aplicativo nem substitui o contrato técnico de serialização. Em caso de conflito sobre qualidade, curadoria, pesquisa, ritmo, logística ou segurança do roteiro, este documento prevalece. O contrato técnico do painel prevalece somente sobre campos e formato de saída.

${loadRouteIntelligenceSource()}

======================================================================
FIM DA FONTE CANÔNICA DA INTELIGÊNCIA DE ROTEIRIZAÇÃO
======================================================================`;
}

module.exports = {
  ROUTE_INTELLIGENCE_RELATIVE_PATH,
  resolveRouteIntelligencePath,
  loadRouteIntelligenceSource,
  buildRouteIntelligenceSystemPrompt
};
