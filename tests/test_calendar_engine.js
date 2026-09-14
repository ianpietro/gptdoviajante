import assert from 'node:assert/strict';
import { buildTripCalendar, enrichItineraryWithCalendar, extractCalendarCommitments, alignTripToCalendarCommitments } from '../modules/calendarEngine.js';

console.log('📆 Teste: calendário real e compromissos por dia da semana');

const calendar = buildTripCalendar('2026-09-23', '2026-09-27');
assert.deepEqual(calendar.map(day => [day.dateISO, day.weekday]), [
  ['2026-09-23', 'quarta-feira'],
  ['2026-09-24', 'quinta-feira'],
  ['2026-09-25', 'sexta-feira'],
  ['2026-09-26', 'sábado'],
  ['2026-09-27', 'domingo']
]);

const commitments = extractCalendarCommitments('inclua JazzB na quarta à noite e Bourbon Street Jazz sábado de tarde');
assert.equal(commitments.length, 2);
assert.deepEqual(commitments.map(item => [item.activity, item.weekdayKey, item.period]), [
  ['JazzB', 'quarta', 'noite'],
  ['Bourbon Street Jazz', 'sabado', 'tarde']
]);

const trip = {
  start_date: '2026-09-23', end_date: '2026-09-27',
  itinerary: [
    { activities: [] }, { activities: [{ title: 'JazzB', time: '15:00' }] }, { activities: [] },
    { activities: [] }, { activities: [{ title: 'Bourbon Street Jazz Club', time: '20:00' }] }
  ]
};
const aligned = alignTripToCalendarCommitments(trip, 'inclua JazzB na quarta à noite e Bourbon Street Jazz sábado de tarde');
assert.equal(aligned.itinerary[0].activities[0].title, 'JazzB');
assert.equal(aligned.itinerary[0].activities[0].time, '20:30');
assert.equal(aligned.itinerary[3].activities[0].title, 'Bourbon Street Jazz Club');
assert.equal(aligned.itinerary[3].activities[0].time, '15:00');
assert.equal(aligned.itinerary[0].dateLabel, '23-09-2026 · quarta-feira');

const enriched = enrichItineraryWithCalendar([{ activities: [] }], '2026-09-23', '2026-09-23');
assert.equal(enriched[0].weekday, 'quarta-feira');

console.log('  ✅ Datas, dias da semana e turnos vinculantes validados.');
