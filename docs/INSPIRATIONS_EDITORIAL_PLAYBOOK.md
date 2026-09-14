# Playbook Editorial e Arquitetural — Seção Inspirações

Este documento estabelece a diretriz oficial, técnica e editorial para a expansão e produção de novos roteiros na biblioteca de **Inspirações** do CoPiloto de Viagem.

---

## 1. Filosofia Editorial

Uma **Inspiração** não é:
- Um artigo de blog ou texto de entretenimento.
- Uma lista genérica de "10 coisas para fazer".
- Um itinerário engessado ou automático sem inteligência operacional.

Uma **Inspiração** é:
> **Uma viagem operacional completa, bem curada, com dados factuais auditados e estruturados, pronta para ser personalizada e transformada em uma viagem privada pelo usuário sem perder a coerência original do roteiro.**

Roma (`insp_roma_5d_classico`) é o primeiro template oficial publicado (`FIRST_OFFICIAL_INSPIRATION = TRUE`). Destinos futuros devem seguir **os mesmos contratos de dados, regras de integridade e quality gates**, mantendo a identidade e a lógica geográfica específicas de cada cidade.

---

## 2. Hierarquia de Fontes de Dados

Para cada roteiro, as informações operacionais devem ser fundamentadas em quatro níveis hierárquicos:

1. **Fontes Oficiais (Prioridade Máxima):** Páginas oficiais de bilheteria, sites de museus, órgãos governamentais de turismo e operadores de transporte público.
2. **Fontes Geográficas Confiáveis:** Dados de mapeamento espacial (OpenStreetMap, cadastros geográficos municipais).
3. **Fontes Editoriais Confiáveis:** Veículos especializados de jornalismo de viagem (ex: *Melhores Destinos*, *Viaje na Viagem*) usados exclusivamente para obter contexto prático, sequenciamento de bairros e dinâmica real de experiência de viagem.
4. **Julgamento Editorial Interno:** Decisões operacionais tomadas pela equipe de curadoria do CoPiloto.

---

## 3. Diretrizes Rígidas de Copyright e Conteúdo Original

- **PROIBIDO:** Copiar trechos de texto, sintetizar artigos de terceiros por paráfrase direta ou reescrever textos apenas para "evitar detecção de plágio".
- **FLUXO OBRIGATÓRIO:**
  1. Pesquisar em múltiplas fontes independentes.
  2. Extrair fatos operacionais brutos (horários, preços, regras de bilheteria).
  3. Extrair insights de dinâmica (tempo de permanência recomendado, melhores turnos).
  4. Cruzar informações de fontes oficiais com fontes editoriais.
  5. Estruturar a lógica geográfica e operacional do itinerário.
  6. **Escrever 100% do conteúdo do zero**, com tom operacional, direto e autoral.

---

## 4. Classificação Factual da Informação

Todo dado operacional presente nos roteiros deve ser categorizado em uma de quatro classes:

| Classificação | Definição | Exemplo de Aplicação |
| :--- | :--- | :--- |
| **`VERIFIED`** | Dado auditado e confirmado diretamente em fonte oficial/oficializada. | Horário de abertura da atração (ex: 08:00), obrigatoriedade de ingresso antecipado, endereço. |
| **`ESTIMATED`** | Cálculo ou projeção logístico-operacional baseada em premissas. | Tempo estimado de caminhada, tempo de deslocamento em transporte, faixa de custo de refeição. |
| **`EDITORIAL_JUDGMENT`** | Decisão de curadoria e dinâmica recomendada. | Agrupamento de atrativos no mesmo turno, ordem de visitação por bairro, ritmo recomendado. |
| **`NEEDS_REVIEW`** | Informação pendente de confirmação factual. | Se for um fato crítico (ex: atração em reforma), **bloqueia a publicação** do roteiro. |

---

## 5. Tom de Voz e Conteúdo Operacional

- **Estilo:** Direto, conciso, humano, específico e focado na logística do viajante.
- **Instrução Útil (Exemplo Bom):** *"Reserve o ingresso antecipado com horário fixo para o primeiro turno das 08:30 para evitar a fila da bilheteria."*
- **Clichê Proibido (Exemplo Ruim):** *"Conheça um lugar inesquecível, a deslumbrante Cidade Eterna que vai encantar o seu coração."*
- **Vocabulário Banido:** `imperdível`, `encantador`, `Cidade Eterna`, `experiência inesquecível`, `destino dos sonhos`, `não deixe de`, `maravilhoso`, `melhor do mundo`.

---

## 6. Contrato Estrutural dos Dados

### Roteiro (Inspiration)
- `id`, `slug`, `title`, `destination_city`, `country`, `duration_days`, `pace` (`light` | `balanced` | `intense`), `budget_level` (`budget` | `moderate` | `luxury`), `traveler_profiles`, `travel_styles`, `best_for`, `hero_image_url`, `thumbnail_url`, `status` (`draft` | `review` | `published`), `quality_score`, `planning_rationale`, `why_this_works`.

### Dia (Inspiration Day)
- `day_number`, `title`, `summary`, `effort_level` (`low` | `medium` | `high`), `estimated_walk_km`, `estimated_transport_time`, `estimated_daily_cost`, `rain_plan`, `notes`.

### Atividade (Inspiration Activity)
- `name`, `category` (`attraction`, `museum`, `food`, `walk`, `shopping`, `nightlife`, `nature`, `transport`, `hotel`, `experience`, `free_time`, `other`), `description`, `start_time`, `end_time`, `estimated_duration`, `neighborhood`, `address`, `lat`/`lng` (coordenadas reais verificadas), `estimated_cost`, `booking_required`, `booking_priority`, `priority` (`must_do` | `recommended` | `optional`), `flexibility` (`fixed` | `semi_flexible` | `flexible`), `indoor_outdoor`, `operational_notes`, `why_here`.

---

## 7. Quality Gates para Publicação

Nenhum roteiro pode ser alterado para status `published` sem cumprir **100%** dos critérios abaixo:

1. **`quality_score >= 85`** (Calculado pelo `calculateQualityScore` oficial).
2. **`critical_risks = 0`** (Validado pelo `detectTripRisks` do Risk Engine).
3. **`high_risks = 0`** (Validado pelo Risk Engine).
4. **`critical_freshness_issue = 0`** (Fontes verificadas dentro da validade).
5. **`critical_NEEDS_REVIEW = 0`** (Zero pendências factuais críticas).
6. **Logistics Engine:** Execução sem apontamento de inconsistências severas de transporte ou horários sobrepostos.
7. **Coordenadas Geográficas:** 100% dos locais com lat/lng válidas para plotagem de mapa.

---

## 8. Pipeline Oficial de Produção (21 Passos)

1. Selecionar o destino estratégico.
2. Definir a proposta e duração do roteiro.
3. Definir perfil de público e ritmo da viagem.
4. Pesquisar referências operacionais e editoriais.
5. Pesquisar e auditar dados em fontes oficiais.
6. Registrar insights estruturados com nível de confiança.
7. Mapear o agrupamento por bairros e zonas históricas.
8. Estruturar a divisão dos dias.
9. Cadastrar as atividades com horários e durações plausíveis.
10. Classificar a prioridade (`must_do`, `recommended`, `optional`).
11. Classificar a flexibilidade (`fixed`, `semi_flexible`, `flexible`).
12. Adicionar faixas estimadas de custos.
13. Elaborar planos B para chuva e imprevistos.
14. Executar a auditoria factual dos dados.
15. Executar o **Risk Engine** real do produto.
16. Executar o **Logistics Engine** real do produto.
17. Calcular o `QualityScore` oficial.
18. Revisar a redação eliminando clichês turísticos.
19. Mudar o status para `review`.
20. Testar em ambiente de preview administrativo.
21. Alterar para `published` com carimbo de data em `published_at`.

---

## 9. Template de Relatório de Entrega de Novo Roteiro

Todo novo destino submetido para publicação deve entregar o relatório padronizado abaixo:

```ini
DESTINATION = [Nome da Cidade]
DURATION = [X] dias
PROFILE = [Perfis atendidos]
PACE = [light | balanced | intense]

OFFICIAL_SOURCES = [Quantidade de fontes oficiais]
EDITORIAL_SOURCES = [Quantidade de fontes editoriais]
GEOGRAPHIC_SOURCES = [Quantidade de fontes geográficas]

VERIFIED_FACTS = [Qtd de fatos VERIFIED]
ESTIMATED_FACTS = [Qtd de dados ESTIMATED]
EDITORIAL_JUDGMENTS = [Qtd de decisões de curadoria]
NEEDS_REVIEW = 0

QUALITY_SCORE = [Pontuação de 0 a 100]
CRITICAL_RISKS = 0
HIGH_RISKS = 0
LOGISTICS_WARNINGS = [Qtd de alertas informativos]

MAP_VALID_PINS = [Total de pins válidos no mapa]
MAP_MISSING_PINS = 0

STATUS = published
PUBLICATION_ELIGIBLE = YES
PUBLISHED = YES
```
