// modules/riskEngine.js — Conflict & Risk Engine for CoPiloto de Viagem

export const RISK_ENGINE_VERSION = 1;

/**
 * Calculates time in minutes from HH:MM string
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Normalizes date string to YYYY-MM-DD
 */
function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const slice = dateStr.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(slice)) return slice;
  return null;
}

/**
 * Generates deterministic hash fingerprint for risk items
 */
function generateRiskId(type, key) {
  const raw = `${type}:${key}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `risk_${type.toLowerCase()}_${(hash >>> 0).toString(36)}`;
}

/**
 * Detects operational conflicts and risks in a trip state
 * @param {object} trip
 * @param {object} options
 * @returns {Array<object>}
 */
export function detectTripRisks(trip, options = {}) {
  if (!trip || typeof trip !== 'object' || trip.status === 'completed' || trip.status === 'archived') {
    return [];
  }

  const risks = [];
  const itinerary = Array.isArray(trip.itinerary) ? trip.itinerary : [];
  const flights = Array.isArray(trip.flights) ? trip.flights : [];
  const reservations = Array.isArray(trip.reservations) ? trip.reservations : [];
  const accommodations = Array.isArray(trip.accommodations) ? trip.accommodations : [];
  const expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
  const budget = trip.budget || {};

  const tripStartDate = parseDateString(trip.start_date || (typeof trip.targetDate === 'string' ? trip.targetDate : ''));
  const tripEndDate = parseDateString(trip.end_date);

  // 1. SCHEDULE_CONFLICT & INSUFFICIENT_TRANSFER_TIME
  itinerary.forEach((day, dayIdx) => {
    const dayDate = parseDateString(day.date || day.day);
    const activities = Array.isArray(day.activities) ? day.activities : [];
    
    // Sort activities by time if possible
    const timedActivities = activities.map((act, actIdx) => {
      const title = typeof act === 'string' ? act : (act.title || act.name || `Atividade ${actIdx + 1}`);
      const timeStr = typeof act === 'object' ? act.time : null;
      const minutes = parseTimeToMinutes(timeStr);
      const durationMins = (typeof act === 'object' && act.durationMins) ? Number(act.durationMins) : 60;
      const isFixed = typeof act === 'object' && (act.isFixed || act.reservationId || act.ticketId);
      const location = typeof act === 'object' ? act.location : null;
      return { title, timeStr, minutes, durationMins, isFixed, location, original: act, index: actIdx };
    }).filter(a => a.minutes !== null);

    timedActivities.sort((a, b) => a.minutes - b.minutes);

    for (let i = 0; i < timedActivities.length - 1; i++) {
      const current = timedActivities[i];
      const next = timedActivities[i + 1];
      const currentEnd = current.minutes + current.durationMins;

      // Overlap detection
      if (currentEnd > next.minutes) {
        risks.push({
          riskId: generateRiskId('SCHEDULE_CONFLICT', `${dayDate || dayIdx}:${current.title}:${next.title}`),
          type: 'SCHEDULE_CONFLICT',
          severity: (current.isFixed || next.isFixed) ? 'critical' : 'high',
          title: 'Sobreposição de horários no itinerário',
          description: `As atividades "${current.title}" (${current.timeStr}) e "${next.title}" (${next.timeStr}) estão sobrepostas.`,
          evidence: [
            `"${current.title}" das ${current.timeStr} até ~${Math.floor(currentEnd/60)}:${String(currentEnd%60).padStart(2,'0')}`,
            `"${next.title}" inicia às ${next.timeStr}`
          ],
          confidence: 1.0,
          recommendedAction: 'Reorganizar horários',
          actionPayload: { targetTab: 'roteiro', dayIndex: dayIdx, dayDate },
          dismissible: true
        });
      } else if (next.minutes - currentEnd < 15) {
        // Insufficient transfer time (< 15 mins gap)
        risks.push({
          riskId: generateRiskId('INSUFFICIENT_TRANSFER_TIME', `${dayDate || dayIdx}:${current.title}:${next.title}`),
          type: 'INSUFFICIENT_TRANSFER_TIME',
          severity: 'medium',
          title: 'Tempo curto entre atividades',
          description: `Há menos de 15 minutos entre "${current.title}" e "${next.title}". Pode não haver tempo suficiente para deslocamento.`,
          evidence: [`Termina às ~${Math.floor(currentEnd/60)}:${String(currentEnd%60).padStart(2,'0')} e a próxima começa às ${next.timeStr}`],
          confidence: 0.9,
          recommendedAction: 'Dar mais tempo',
          actionPayload: { targetTab: 'roteiro', dayIndex: dayIdx, dayDate },
          dismissible: true
        });
      }

      // GEOGRAPHIC_INCOMPATIBILITY (e.g. Paris vs Versailles if specified in locations)
      if (current.location && next.location) {
        const loc1 = (typeof current.location === 'string' ? current.location : (current.location.address || '')).toLowerCase();
        const loc2 = (typeof next.location === 'string' ? next.location : (next.location.address || '')).toLowerCase();
        if ((loc1.includes('paris') && loc2.includes('versailles')) || (loc1.includes('versailles') && loc2.includes('paris'))) {
          if (next.minutes - currentEnd < 60) {
            risks.push({
              riskId: generateRiskId('GEOGRAPHIC_INCOMPATIBILITY', `${dayDate || dayIdx}:${current.title}:${next.title}`),
              type: 'GEOGRAPHIC_INCOMPATIBILITY',
              severity: 'high',
              title: 'Deslocamento incompatível entre cidades/locais',
              description: `"${current.title}" em ${current.location} e "${next.title}" em ${next.location} exigem transporte de média distância.`,
              evidence: [`Distância considerável entre ${current.location} e ${next.location} com menos de 60 min de intervalo`],
              confidence: 0.95,
              recommendedAction: 'Ajustar dia ou transporte',
              actionPayload: { targetTab: 'roteiro', dayIndex: dayIdx },
              dismissible: true
            });
          }
        }
      }
    }
  });

  // 2. ACTIVITY_BEFORE_ARRIVAL & ACTIVITY_AFTER_DEPARTURE
  if (flights.length > 0 && itinerary.length > 0) {
    const arrivalFlight = flights.find(f => f.type === 'arrival' || f.direction === 'inbound') || flights[0];
    const departureFlight = flights.find(f => f.type === 'departure' || f.direction === 'outbound') || flights[flights.length - 1];

    const arrivalDate = parseDateString(arrivalFlight.date || arrivalFlight.departureDate);
    const arrivalTime = parseTimeToMinutes(arrivalFlight.scheduledArrival || arrivalFlight.arrivalTime || '12:00');

    if (arrivalDate && arrivalTime !== null) {
      itinerary.forEach((day, dayIdx) => {
        const dayDate = parseDateString(day.date || day.day);
        if (dayDate === arrivalDate) {
          (day.activities || []).forEach(act => {
            const timeStr = typeof act === 'object' ? act.time : null;
            const actMins = parseTimeToMinutes(timeStr);
            const title = typeof act === 'string' ? act : (act.title || act.name);
            if (actMins !== null && actMins < arrivalTime + 60) { // 1h buffer after landing
              risks.push({
                riskId: generateRiskId('ACTIVITY_BEFORE_ARRIVAL', `${arrivalDate}:${title}`),
                type: 'ACTIVITY_BEFORE_ARRIVAL',
                severity: 'critical',
                title: 'Atividade antes da chegada do voo',
                description: `A atividade "${title}" está agendada para ${timeStr}, mas o voo ${arrivalFlight.flightNumber || ''} chega às ${arrivalFlight.scheduledArrival || '12:00'}.`,
                evidence: [`Voo chega às ${arrivalFlight.scheduledArrival || '12:00'}, atividade marcada para ${timeStr}`],
                confidence: 1.0,
                recommendedAction: 'Mover atividade para mais tarde',
                actionPayload: { targetTab: 'roteiro', dayIndex: dayIdx },
                dismissible: true
              });
            }
          });
        }
      });
    }

    const departureDate = parseDateString(departureFlight.date || departureFlight.departureDate);
    const departureTime = parseTimeToMinutes(departureFlight.scheduledDeparture || departureFlight.departureTime || '18:00');

    if (departureDate && departureTime !== null) {
      itinerary.forEach((day, dayIdx) => {
        const dayDate = parseDateString(day.date || day.day);
        if (dayDate === departureDate) {
          (day.activities || []).forEach(act => {
            const timeStr = typeof act === 'object' ? act.time : null;
            const actMins = parseTimeToMinutes(timeStr);
            const title = typeof act === 'string' ? act : (act.title || act.name);
            if (actMins !== null && actMins > departureTime - 120) { // Must leave for airport 2h before
              risks.push({
                riskId: generateRiskId('ACTIVITY_AFTER_DEPARTURE', `${departureDate}:${title}`),
                type: 'ACTIVITY_AFTER_DEPARTURE',
                severity: 'high',
                title: 'Atividade conflitante com horário de voo de retorno',
                description: `A atividade "${title}" em ${timeStr} é muito próxima ou posterior ao voo de retorno (${departureFlight.scheduledDeparture || '18:00'}).`,
                evidence: [`Voo decolando às ${departureFlight.scheduledDeparture || '18:00'}, atividade agendada em ${timeStr}`],
                confidence: 0.95,
                recommendedAction: 'Remover ou antecipar atividade',
                actionPayload: { targetTab: 'roteiro', dayIndex: dayIdx },
                dismissible: true
              });
            }
          });
        }
      });
    }
  }

  // 3. DUPLICATE_RESERVATION
  const seenReservations = new Map();
  reservations.forEach(res => {
    const key = `${res.provider || ''}:${res.bookingRef || res.reference || res.title}`.toLowerCase();
    if (key.length > 3 && seenReservations.has(key)) {
      risks.push({
        riskId: generateRiskId('DUPLICATE_RESERVATION', key),
        type: 'DUPLICATE_RESERVATION',
        severity: 'high',
        title: 'Reserva em duplicidade detectada',
        description: `Encontramos duas reservas similares para "${res.title || res.provider}".`,
        evidence: [`Código/Título idêntico: ${res.bookingRef || res.title}`],
        confidence: 0.9,
        recommendedAction: 'Verificar reservas',
        actionPayload: { targetTab: 'logistica' },
        dismissible: true
      });
    } else if (key.length > 3) {
      seenReservations.set(key, res);
    }
  });

  // 4. HOTEL_GAP & HOTEL_ENDS_EARLY
  if (tripStartDate && tripEndDate) {
    const startDay = Math.floor(Date.parse(tripStartDate) / 86400000);
    const endDay = Math.floor(Date.parse(tripEndDate) / 86400000);

    if (endDay > startDay) {
      const totalNights = endDay - startDay;
      const coveredNights = new Array(totalNights).fill(false);

      accommodations.forEach(acc => {
        const inDate = parseDateString(acc.checkInDate || acc.checkin || acc.startDate);
        const outDate = parseDateString(acc.checkOutDate || acc.checkout || acc.endDate);
        if (inDate && outDate) {
          const inDay = Math.floor(Date.parse(inDate) / 86400000);
          const outDay = Math.floor(Date.parse(outDate) / 86400000);
          for (let d = inDay; d < outDay; d++) {
            const offset = d - startDay;
            if (offset >= 0 && offset < totalNights) {
              coveredNights[offset] = true;
            }
          }
        }
      });

      const missingNights = coveredNights.filter(c => !c).length;
      if (accommodations.length > 0 && missingNights > 0) {
        const lastCoveredIndex = coveredNights.lastIndexOf(true);
        if (lastCoveredIndex >= 0 && lastCoveredIndex < totalNights - 1) {
          risks.push({
            riskId: generateRiskId('HOTEL_ENDS_EARLY', `${tripStartDate}:${tripEndDate}`),
            type: 'HOTEL_ENDS_EARLY',
            severity: 'critical',
            title: 'Hospedagem termina antes do fim da viagem',
            description: `Seu último check-out é antes da data final da viagem (${tripEndDate}).`,
            evidence: [`Falta hospedagem para as últimas ${totalNights - 1 - lastCoveredIndex} noite(s)`],
            confidence: 1.0,
            recommendedAction: 'Adicionar hotel',
            actionPayload: { targetTab: 'logistica' },
            dismissible: true
          });
        } else {
          risks.push({
            riskId: generateRiskId('HOTEL_GAP', `${tripStartDate}:${tripEndDate}`),
            type: 'HOTEL_GAP',
            severity: 'critical',
            title: 'Noites sem hospedagem cadastrada',
            description: `Há ${missingNights} noite(s) de viagem sem hotel confirmado.`,
            evidence: [`${missingNights} de ${totalNights} noites não têm cobertura de hotel`],
            confidence: 0.95,
            recommendedAction: 'Reservar hospedagem',
            actionPayload: { targetTab: 'logistica' },
            dismissible: true
          });
        }
      }
    }
  }

  // 5. SHORT_FLIGHT_CONNECTION
  for (let i = 0; i < flights.length - 1; i++) {
    const f1 = flights[i];
    const f2 = flights[i + 1];
    const date1 = parseDateString(f1.date || f1.departureDate);
    const date2 = parseDateString(f2.date || f2.departureDate);
    if (date1 === date2 && f1.scheduledArrival && f2.scheduledDeparture) {
      const arr = parseTimeToMinutes(f1.scheduledArrival);
      const dep = parseTimeToMinutes(f2.scheduledDeparture);
      if (arr !== null && dep !== null && dep > arr && dep - arr < 50) {
        risks.push({
          riskId: generateRiskId('SHORT_FLIGHT_CONNECTION', `${f1.flightNumber}:${f2.flightNumber}`),
          type: 'SHORT_FLIGHT_CONNECTION',
          severity: 'critical',
          title: 'Conexão de voo muito curta',
          description: `O tempo de conexão entre o voo ${f1.flightNumber} e ${f2.flightNumber} é de apenas ${dep - arr} minutos.`,
          evidence: [`Chegada: ${f1.scheduledArrival}, Partida da conexão: ${f2.scheduledDeparture}`],
          confidence: 1.0,
          recommendedAction: 'Verificar voos',
          actionPayload: { targetTab: 'logistica' },
          dismissible: true
        });
      }
    }
  }

  // 6. BUDGET_OVERRUN
  const totalBudget = Object.values(budget).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const totalSpent = expenses.reduce((sum, exp) => sum + (Number(exp.amount || exp.valor) || 0), 0);
  if (totalBudget > 0 && totalSpent > totalBudget * 0.9) {
    const percent = Math.round((totalSpent / totalBudget) * 100);
    risks.push({
      riskId: generateRiskId('BUDGET_OVERRUN', `${totalSpent}:${totalBudget}`),
      type: 'BUDGET_OVERRUN',
      severity: percent >= 100 ? 'critical' : 'high',
      title: percent >= 100 ? 'Orçamento estourado!' : 'Orçamento quase esgotado',
      description: `Você já gastou ${percent}% do orçamento planejado para esta viagem.`,
      evidence: [`Gasto total: R$ ${totalSpent} / Orçamento: R$ ${totalBudget}`],
      confidence: 1.0,
      recommendedAction: 'Ajustar orçamento',
      actionPayload: { targetTab: 'orcamento' },
      dismissible: true
    });
  }

  // Sort risks by severity weight
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  return risks.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
}

export default { detectTripRisks, RISK_ENGINE_VERSION };
