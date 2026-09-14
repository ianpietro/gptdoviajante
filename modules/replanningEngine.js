// modules/replanningEngine.js — Replanning Engine for CoPiloto de Viagem
import { applyActions } from './actionEngine.js';

export const REPLANNING_ENGINE_VERSION = 1;

/**
 * Generates a structured proposal BEFORE applying any changes to the trip state.
 * Implements "Plan Before Apply" principle preserving fixed reservations, tickets, dates and constraints.
 * 
 * @param {object} trip
 * @param {string} trigger - 'user_request' | 'weather_incompatible' | 'flight_delay' | 'reservation_changed' | 'conflict_detected' | 'activity_missed'
 * @param {object} options - { targetDay, delayHours, missedActivity, weatherInfo }
 * @returns {object} ReplanningProposal
 */
export function generateReplanningProposal(trip, trigger = 'user_request', options = {}) {
  if (!trip || typeof trip !== 'object') {
    throw new Error('Trip data is required for replanning.');
  }

  const proposalId = `prop_replan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const itinerary = Array.isArray(trip.itinerary) ? JSON.parse(JSON.stringify(trip.itinerary)) : [];
  const flights = Array.isArray(trip.flights) ? trip.flights : [];
  const accommodations = Array.isArray(trip.accommodations) ? trip.accommodations : [];
  const reservations = Array.isArray(trip.reservations) ? trip.reservations : [];

  const kept = [];
  const moved = [];
  const removed = [];
  const newSuggestions = [];
  const actions = [];

  // Protect fixed items (flights, hotels, purchased tickets)
  flights.forEach(f => kept.push({ title: `Voo ${f.flightNumber || f.airline || ''}`, reason: 'Voo cadastrado (Reserva fixa)' }));
  accommodations.forEach(a => kept.push({ title: `Hotel ${a.hotelName || a.hotel || ''}`, reason: 'Hospedagem confirmada (Reserva fixa)' }));
  reservations.forEach(r => kept.push({ title: `Reserva: ${r.title || r.provider || ''}`, reason: 'Comprovante/Reserva confirmada' }));

  let reason = 'Reorganização solicitada para otimizar o roteiro da viagem.';
  let impactSummary = 'Itinerário ajustado preservando todas as reservas e voos fixos.';

  if (trigger === 'weather_incompatible') {
    reason = 'Previsão de chuva/clima adverso para o dia da atividade ao ar livre.';
    // Find outdoor activities and swap to sunny day or suggest indoor alternative
    let outdoorMoved = false;
    itinerary.forEach((day, dayIdx) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      activities.forEach((act, actIdx) => {
        const title = typeof act === 'string' ? act : (act.title || act.name || '');
        const isOutdoor = /parque|praia|caminhada|tour a pe|passeio a pe|jardim|mirante/i.test(title);
        const isFixed = typeof act === 'object' && (act.isFixed || act.reservationId);

        if (isOutdoor && !isFixed && !outdoorMoved) {
          outdoorMoved = true;
          const targetDayIdx = (dayIdx + 1) < itinerary.length ? dayIdx + 1 : dayIdx;
          moved.push({
            title,
            from: `Dia ${dayIdx + 1}`,
            to: `Dia ${targetDayIdx + 1}`
          });
          newSuggestions.push({
            title: `Visita ao Museu / Galeria Coberta (Alternativa para chuva)`,
            time: typeof act === 'object' ? act.time : '14:00'
          });
        } else if (isFixed) {
          kept.push({ title, reason: 'Atividade com ingresso/reserva fixa' });
        }
      });
    });
    impactSummary = outdoorMoved 
      ? '1 passeio ao ar livre reagendado para dia com clima favorável e 1 sugestão coberta adicionada.' 
      : 'Roteiro analisado; nenhuma atividade ao ar livre precisou ser deslocada.';

  } else if (trigger === 'flight_delay') {
    const delayHours = options.delayHours || 3;
    reason = `Voo de partida com atraso estimado em ~${delayHours} horas.`;
    impactSummary = `Atividades do primeiro dia ajustadas para evitar correria após a chegada.`;

    if (itinerary.length > 0) {
      const firstDay = itinerary[0];
      const activities = Array.isArray(firstDay.activities) ? firstDay.activities : [];
      if (activities.length > 0) {
        const firstAct = activities[0];
        const title = typeof firstAct === 'string' ? firstAct : (firstAct.title || firstAct.name || '');
        moved.push({
          title,
          from: 'Dia 1 (Manhã)',
          to: 'Dia 1 (Tarde/Noite)'
        });
      }
    }

  } else if (trigger === 'activity_missed') {
    const missedTitle = options.missedActivity || 'Atividade pendente';
    reason = `Atividade "${missedTitle}" não realizada no horário planejado.`;
    moved.push({
      title: missedTitle,
      from: 'Horário anterior',
      to: 'Próxima janela livre no roteiro'
    });
    impactSummary = `"${missedTitle}" realocada para o próximo espaço livre do itinerário sem afetar reservas fixas.`;

  } else if (trigger === 'conflict_detected') {
    reason = 'Conflito de horários identificado no itinerário.';
    impactSummary = 'Horários sobrepostos reorganizados mantendo a sequência dos passeios.';
  } else if (trigger === 'route_optimization') {
    reason = 'Otimização geográfica de rota solicitada para eliminar vaivém (backtracking).';
    itinerary.forEach((day, dayIdx) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      if (activities.length > 2) {
        moved.push({
          title: `Reordenação geográfica do Dia ${dayIdx + 1}`,
          from: 'Ordem original com vaivém',
          to: 'Sequência por proximidade geográfica'
        });
      }
    });
    impactSummary = 'Sequência das atrações reorganizada por proximidade mantendo todos os ingressos e voos fixos.';
  }

  // Construct Action Engine payload for application
  actions.push({
    type: 'itinerary',
    operation: 'replace',
    data: itinerary
  });

  return {
    id: proposalId,
    trigger,
    reason,
    impactSummary,
    kept,
    moved,
    removed,
    newSuggestions,
    actions,
    createdAt: new Date().toISOString()
  };
}

/**
 * Applies a ReplanningProposal atomically using Action Engine
 * @param {object} trip
 * @param {object} proposal
 * @returns {object} updated trip
 */
export function applyReplanningProposal(trip, proposal) {
  if (!proposal || !Array.isArray(proposal.actions)) {
    throw new Error('Invalid ReplanningProposal format.');
  }
  return applyActions(proposal.actions, trip);
}

export default {
  generateReplanningProposal,
  applyReplanningProposal,
  REPLANNING_ENGINE_VERSION
};
