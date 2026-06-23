# Guia de Criativos & Produção de Anúncios — CoPiloto de Viagem

Este guia descreve a estratégia por trás dos 3 carrosséis criados para anúncios e fornece o passo a passo completo de como personalizar os textos e exportar os slides como imagens PNG perfeitas de alta resolução direto do seu navegador Chrome.

---

## 🎯 Estratégia de Copywriting dos Criativos

Cada carrossel foi planejado para atacar uma dor específica do público-alvo, utilizando a estrutura clássica de criativos de alta conversão:

### Carrossel 1: Dor vs. Solução (Tema Cyberpunk/Dark)
* **Objetivo:** Conectar com pessoas estressadas com o planejamento manual de viagens.
* **Ganchos (Hooks):** Provocar o cansaço mental de pesquisar em dezenas de sites.
* **Slides:**
  1. **Gancho:** Planejar uma viagem inteira cansa só de pensar?
  2. **Agitação da Dor:** O ciclo infinito (hotel lotado, rotas longas, contas manuais).
  3. **Apresentação:** O CoPiloto de Viagem faz o trabalho duro.
  4. **Passo a Passo:** Escolha destino ➔ Defina estilo ➔ IA gera tudo.
  5. **Contraste/Valor:** Tabela comparativa (Método Tradicional: 15h vs. CoPiloto: 30s).
  6. **CTA:** Botão e instrução clara para acessar (ou comentar para receber o link).

### Carrossel 2: Controle Financeiro (Tema Glassmorphism Teal)
* **Objetivo:** Capturar o público que tem medo de estourar o orçamento e gastar mais do que o esperado.
* **Ganchos (Hooks):** Foco no cálculo exato e visibilidade financeira.
* **Slides:**
  1. **Gancho:** Como saber o custo exato da viagem antes de sair de casa.
  2. **A Dor Invisível:** O erro de planejar apenas passagem e hotel (esquecendo alimentação e passeios).
  3. **Solução:** Ajuste dinâmico através dos Sliders Inteligentes da IA.
  4. **Benefícios:** Previsão diária, detalhamento por categorias e divisão no grupo.
  5. **CTA:** Direcionamento direto para simular o orçamento grátis.

### Carrossel 3: Roteiro Pronto para Imprimir (Tema Clean Editorial Light)
* **Objetivo:** Capturar viajantes ultra-organizados que preferem roteiros impressos ou PDFs limpos de leitura rápida.
* **Ganchos (Hooks):** Valorizar a diagramação profissional e a ausência de anúncios poluídos.
* **Slides:**
  1. **Gancho:** Seu roteiro perfeito de viagem pronto para imprimir.
  2. **A Dor:** Por que imprimir sites comuns falha (anúncios, quebras de página ruins, links longos de mapas).
  3. **Solução:** Diagramação inteligente do CoPiloto (uma página por dia, turno preservado).
  4. **Benefícios:** Layout limpo e sem propagandas focado na experiência offline.
  5. **CTA:** Acesse e gere o PDF com 1 clique.

---

## 🛠️ Como Produzir e Exportar as Imagens (O "Hack" de Exportação)

Usando a interface do **Creative Studio** que criamos, você não precisa de Figma ou Canva. Siga as instruções abaixo para editar e exportar cada slide em segundos:

### 1. Inicialização
Abra o arquivo `marketing_creatives/index.html` em seu navegador Google Chrome. 
*(Você pode fazer isso clicando duas vezes no arquivo no seu gerenciador de arquivos ou arrastando o arquivo para dentro de uma aba aberta do Chrome).*

### 2. Edição de Conteúdo (Copy)
Todos os textos dos slides possuem o atributo `contenteditable`. Isso significa que você pode:
* **Dar dois cliques** sobre qualquer palavra, título, número ou chamada.
* **Escrever o texto que desejar** diretamente na tela para testar variações de ganchos ou ofertas.
* O design se ajustará automaticamente às novas dimensões dos seus textos.

### 3. Ajuste de Tamanho (Formato)
Na barra lateral esquerda, você pode alternar entre:
* **Retrato (1080x1350):** O melhor formato para anúncios no feed do Instagram e Facebook (ocupa mais espaço vertical na tela do celular).
* **Quadrado (1080x1080):** O clássico formato quadrado.

### 4. O Hack de Exportação (Captura em Alta Resolução)
Para extrair um slide como PNG perfeito de 1080x1350 (ou 1080x1080):

1. **Abra as ferramentas de desenvolvedor (DevTools):**
   * Pressione `Cmd+Option+I` (Mac) ou `F12` / `Ctrl+Shift+I` (Windows).
2. **Selecione o Slide:**
   * Clique no ícone de seleção de elemento do DevTools (no topo esquerdo da janela do DevTools, atalho `Cmd+Shift+C` ou `Ctrl+Shift+C`).
   * Clique sobre o slide que você quer exportar. No código HTML do DevTools, certifique-se de que a tag `<div class="slide ...">` (com a classe `slide`) está selecionada.
3. **Comando de Captura:**
   * Abra a paleta de comandos do Chrome pressionando `Cmd+Shift+P` (Mac) ou `Ctrl+Shift+P` (Windows).
   * Digite `Capture node screenshot` (Capturar captura de tela de nó).
   * Pressione `Enter`.
4. **Pronto!**
   * O Chrome fará o download instantâneo de um arquivo PNG com a resolução pixel-perfect de **1080x1350** ou **1080x1080**, com todos os estilos, gradientes e fontes perfeitamente renderizados e com o fundo transparente nos cantos arredondados (se houver).

---

## 🎨 Como customizar cores e estilos

Se você quiser alterar a identidade visual dos criativos para combinar com um teste específico de marca:
* Abra o arquivo `marketing_creatives/style.css`.
* No bloco `:root`, você encontrará as variáveis globais de fontes.
* Nas seções `.theme-dark`, `.theme-teal` e `.theme-light`, você pode trocar os valores de `background` (gradientes) ou `color` (cores de texto).
* Por exemplo, para trocar a cor azul neon do Tema 1 por rosa neon, altere a propriedade `.theme-dark .slide-brand` para `color: #ff007f` e mude os gradientes correspondentes no CSS.
