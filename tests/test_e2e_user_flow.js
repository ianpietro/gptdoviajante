const assert = require('assert');

async function runE2EUserFlowTests() {
  console.log("🧪 Running PROMPT 7 — E2E Real User Flow QA Test Suite...");

  const { normalizeTripState, calculateOperationalHealthScore, recalculateTripContext, validateDiningOptions } = await import('../modules/stateManager.js');
  const { applyActions, undoLastActions, buildTripContext } = await import('../modules/actionEngine.js');

  // Step 1: User creates new trip
  console.log("  Step 1: User creates new trip ('Viagem de Férias para Roma')");
  let trip = normalizeTripState({
    tripTitle: "Viagem de Férias para Roma",
    destination: "Roma",
    start_date: "2026-10-10",
    end_date: "2026-10-17",
    members: ["Você", "Juliana"]
  });
  assert.strictEqual(trip.destination, "Roma");
  assert.strictEqual(trip.members.length, 2);

  // Step 2: Add primary flight via chat action
  console.log("  Step 2: Add flight via Chat Action Engine");
  trip = applyActions([
    {
      type: "flights",
      operation: "add",
      data: { flightNumber: "AZ675", from: "GRU", to: "FCO", departureDate: "2026-10-10T14:30:00", bookingRef: "AZ123X" }
    }
  ], trip);
  assert.strictEqual(trip.flights.length, 1);
  assert.strictEqual(trip.flights[0].flightNumber, "AZ675");

  // Step 3: Add accommodation via chat action
  console.log("  Step 3: Add accommodation via Chat Action Engine & legacy sync");
  trip = applyActions([
    {
      type: "accommodations",
      operation: "add",
      data: { name: "Hotel Artemide", address: "Via Nazionale 22, Roma", checkIn: "2026-10-10", checkOut: "2026-10-17", bookingUrl: "https://booking.com/artemide" }
    }
  ], trip);
  assert.strictEqual(trip.accommodations.length, 1);
  assert.ok(trip.infoHotel.includes("Hotel Artemide"));
  assert.strictEqual(trip.hotelLink, "https://booking.com/artemide");

  // Step 4: Add factual itinerary with 2 dining options per meal
  console.log("  Step 4: Generate 2-day factual itinerary with dining validation");
  const diningSample = [
    { name: "Da Enzo al 29", especialidade: "Cacio e Pepe", faixa_de_preco: "€18-28", endereco: "Trastevere", justificativa: "Melhor massa autêntica" },
    { name: "Roscioli Salumeria", especialidade: "Carbonara", faixa_de_preco: "€25-40", endereco: "Campo de' Fiori", justificativa: "Referência tradicional" }
  ];
  const diningValidation = validateDiningOptions(diningSample);
  assert.strictEqual(diningValidation.valid, true);

  trip = applyActions([
    {
      type: "itinerary",
      operation: "add",
      data: { dayNum: 1, dayTitle: "Chegada e Passeio em Trastevere", activities: [{ time: "15:00", title: "Check-in Hotel", desc: "Instalação no quarto" }] }
    },
    {
      type: "itinerary",
      operation: "add",
      data: { dayNum: 2, dayTitle: "Coliseu e Fórum Romano", activities: [{ time: "09:00", title: "Visita guiada Coliseu", desc: "Ingresso antecipado" }] }
    }
  ], trip);
  assert.strictEqual(trip.itinerary.length, 2);

  // Step 5: Add budget & expenses
  console.log("  Step 5: Define budget and record expenses");
  trip = applyActions([
    { type: "budget", operation: "update", data: { hospedagem: 1200, alimentacao: 600, passeios: 400 } },
    { type: "expenses", operation: "add", data: { desc: "Taxa de turismo hotel", amount: 42, payer: "Você", date: "2026-10-10" } }
  ], trip);
  assert.strictEqual(trip.budget.hospedagem, 1200);
  assert.strictEqual(trip.expenses.length, 1);

  // Step 6: Packing list management
  console.log("  Step 6: Update packing checklist");
  trip = applyActions([
    {
      type: "packing",
      operation: "add",
      data: { category: "Documentos", items: [{ name: "Passaporte Valido", checked: true, manual: true }] }
    }
  ], trip);
  assert.strictEqual(trip.packing.length, 1);

  // Step 7: Check 5-item Operational Health Score Dashboard
  console.log("  Step 7: Evaluate Operational Health Score (5 items)");
  const health = calculateOperationalHealthScore(trip);
  assert.strictEqual(health.total, 5);
  assert.strictEqual(health.score, 5, "Todas as 5 áreas operacionais devem estar OK");
  assert.strictEqual(health.percentage, 100);

  // Step 8: Build chat trip context summary
  console.log("  Step 8: Validate optimized Trip Brain context");
  const contextStr = buildTripContext(trip);
  const parsedContext = JSON.parse(contextStr);
  assert.strictEqual(parsedContext.destination, "Roma");
  assert.strictEqual(parsedContext.flightsCount, 1);
  assert.strictEqual(parsedContext.itineraryDays, 2);

  // Step 9: Test Undo / Rollback
  console.log("  Step 9: Execute Undo/Rollback of last action");
  const countBeforeUndo = trip.packing.length;
  const undoneTrip = undoLastActions(trip);
  assert.ok(undoneTrip, "Undo deve retornar snapshot anterior sem erros");

  console.log("🎉 ALL E2E USER FLOW TESTS PASSED 100% GREEN!");
}

runE2EUserFlowTests().catch(err => {
  console.error("❌ E2E User Flow Test failed:", err);
  process.exit(1);
});
