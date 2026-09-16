const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  ROUTE_INTELLIGENCE_RELATIVE_PATH,
  resolveRouteIntelligencePath,
  loadRouteIntelligenceSource,
  buildRouteIntelligenceSystemPrompt
} = require('../api/_routeIntelligence');

console.log('🧠 Teste: fonte canônica da inteligência de roteirização');

assert.equal(ROUTE_INTELLIGENCE_RELATIVE_PATH, path.join('docs', 'ai', 'ORBIA_ROUTE_INTELLIGENCE.md'));
assert.ok(fs.existsSync(resolveRouteIntelligencePath()), 'O documento canônico precisa existir no projeto.');

const source = loadRouteIntelligenceSource();
assert.ok(source.length > 10000, 'A fonte canônica não pode estar vazia ou reduzida a um apontamento.');
assert.match(source, /fonte canônica da inteligência usada pelo Orbia para pesquisar, decidir e montar roteiros/i);
assert.match(source, /Orbia é um nome masculino/i);
assert.doesNotMatch(source, /\b(?:a|da|na|pela) Orbia\b/i, 'O documento canônico não pode tratar o Orbia no feminino.');
assert.match(source, /6\.10 Protocolo cognitivo de roteirização/i);
assert.match(source, /6\.15 Auditoria silenciosa de viabilidade/i);
assert.match(source, /6\.20 Separação entre fatos e escolhas editoriais/i);

const prompt = buildRouteIntelligenceSystemPrompt();
assert.match(prompt, /documento abaixo governa COMO pesquisar, raciocinar, selecionar, organizar, escrever e revisar/i);
assert.match(prompt, /não define integração com o aplicativo/i);
assert.match(prompt, /contrato técnico do painel prevalece somente sobre campos e formato de saída/i);

const masterPrompt = fs.readFileSync(path.join(__dirname, '..', 'api', 'prompt_master.txt'), 'utf8');
assert.match(masterPrompt, /REGRA ABSOLUTA DE MARCA: Orbia é um nome masculino/i);

const chatSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'chat.js'), 'utf8');
assert.match(chatSource, /if \(itineraryPlanningRequest\) \{[\s\S]*buildRouteIntelligenceSystemPrompt\(\)/,
  'A fonte canônica deve ser injetada somente no fluxo de criação ou ajuste de roteiro.');

const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
assert.equal(vercelConfig.functions?.['api/chat.js']?.includeFiles, 'docs/ai/ORBIA_ROUTE_INTELLIGENCE.md');

console.log('  ✅ Documento canônico presente, validado e conectado ao fluxo real de roteiros.');
