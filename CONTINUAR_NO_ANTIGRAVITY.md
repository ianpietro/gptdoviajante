# Continuidade do VEROA no Antigravity

## Onde continuar

- Projeto: `/Users/iancapo/antigravity/gpt do viajante`
- Prévia local: `http://localhost:7832/app.html?v=2.2.0-rc.19`
- Idioma atual: português do Brasil
- Preserve todas as alterações existentes. O projeto tem trabalho não relacionado ainda não consolidado.

## Estado atual do produto

O VEROA está na versão `2.2.0-rc.19`.

Já foi implementado:

- identidade visual coerente com azul mineral, branco e laranja;
- navegação inferior em português: Hoje, Inspirações, Roteiro, Orçamento, Mala, Carteira e VEROA;
- seleção global da viagem ativa na aba Hoje;
- calendário para definir datas;
- adaptação de clima, mala e orçamento após definir datas;
- geração e regeneração automática de roteiro;
- roteiro com validação de qualidade e rejeição de respostas vagas;
- duas sugestões reais de restaurante por refeição, com prato, preço, endereço, justificativa e mapa;
- exportação premium do roteiro em PDF com CTA do produto;
- tutorial guiado de oito etapas, responsivo e com atalhos para as áreas do aplicativo;
- testes de interface em desktop e celular.

## Próximo problema a resolver

O chat responde ao pedido de atualização de hospedagem, mas o endereço informado não chega às outras abas.

Exemplo de pedido que precisa funcionar:

> Minha hospedagem é o Hotel Exemplo, na Rua Exemplo, 123, Roma. Atualize a viagem.

Resultado esperado:

1. O chat confirma a alteração.
2. A hospedagem é salva na viagem ativa.
3. Nome, endereço, link, check-in e check-out são preservados quando informados.
4. A aba Carteira mostra a hospedagem atualizada.
5. A aba Hoje mostra o nome e/ou endereço correto.
6. O Roteiro usa a hospedagem como origem logística.
7. Mala, orçamento e alertas recebem o novo contexto quando aplicável.
8. A informação continua correta depois de recarregar a página.

## Diagnóstico já realizado

A causa principal está na comunicação entre o formato de ações da IA e o estado da viagem:

- `api/chat.js` aceita apenas `itinerary`, `packing`, `expenses`, `flights`, `reservations`, `budget` e `preferences`.
- `modules/actionEngine.js` possui a mesma lista e não aceita `accommodations`.
- O estado já possui `tripData.accommodations`, `tripData.infoHotel` e `tripData.hotelLink`, mas não existe uma ação completa para atualizá-los pelo chat.
- Quando a IA devolve hospedagem como ação, ela é rejeitada ou não aplicada.
- O formulário manual da Carteira altera apenas `infoHotel` e `hotelLink`; ainda não preserva endereço estruturado.

Arquivos principais:

- `api/chat.js`
- `api/prompt_master.txt`
- `modules/actionEngine.js`
- `modules/stateManager.js`
- `app.js`
- `app.html`
- `tests/test_state.js`

## Implementação recomendada

1. Adicionar `accommodations` aos tipos de ação aceitos no servidor e no navegador.
2. Definir um formato único:

```json
{
  "type": "accommodations",
  "operation": "add|update|replace|delete",
  "index": 0,
  "data": {
    "name": "Nome da hospedagem",
    "address": "Endereço completo",
    "bookingUrl": "https://...",
    "checkIn": "AAAA-MM-DD",
    "checkOut": "AAAA-MM-DD",
    "confirmationCode": "opcional",
    "notes": "opcional"
  }
}
```

3. Ao aplicar a ação, sincronizar automaticamente:

- `tripData.accommodations`;
- `tripData.infoHotel` com nome e endereço legíveis;
- `tripData.hotelLink` com `bookingUrl`, quando existir.

4. Atualizar o prompt da IA para sempre gerar essa ação quando o usuário informar ou alterar hotel, pousada, hostel, Airbnb ou endereço de hospedagem.
5. Atualizar o resumo enviado ao chat com a hospedagem estruturada atual.
6. Renderizar nome, endereço e botão de mapa na aba Carteira.
7. Criar testes unitários e um teste de navegador que simule a resposta da IA e comprove persistência após recarregar.
8. Subir a próxima versão como `2.2.0-rc.20` e atualizar o cache do service worker.

## Prompt para continuar

Use este pedido no Antigravity:

> Continue o desenvolvimento do VEROA a partir de `CONTINUAR_NO_ANTIGRAVITY.md`. Resolva primeiro a integração do chat com hospedagem: quando o usuário informar nome ou endereço da hospedagem, salve uma ação estruturada em `accommodations`, sincronize a viagem ativa e atualize Hoje, Carteira, Roteiro e demais contextos. Preserve as mudanças existentes, implemente testes unitários e valide no navegador em desktop e celular. Quando terminar, disponibilize a versão `2.2.0-rc.20` na porta local.

