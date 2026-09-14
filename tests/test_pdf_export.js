import assert from 'node:assert/strict';
import { createItineraryPdf } from '../modules/pdfExportEnginePremium.js';
import { enrichItineraryWithCalendar } from '../modules/calendarEngine.js';

console.log('Test: download real do roteiro em PDF');

const sampleTrip = {
  tripTitle: 'Viagem para Roma',
  destination: 'Roma',
  start_date: '2026-09-02',
  end_date: '2026-09-07',
  infoDates: '02 a 07 de setembro de 2026',
  itinerary: Array.from({ length: 5 }, (_, dayIndex) => ({
    dayNum: dayIndex + 1,
    dayTitle: `Roma — experiências do dia ${dayIndex + 1}`,
    dayStory: 'A manhã abre entre as camadas antigas de Roma e conduz, sem pressa, até uma mesa que preserva receitas da cidade.',
    highlight: 'O destaque é perceber a mudança da luz sobre as pedras antigas no fim da tarde.',
    localSecret: 'Observe os pequenos bebedouros de rua, os nasoni, usados diariamente pelos romanos.',
    logistics: 'Faça as primeiras paradas a pé e use metrô apenas no trecho mais longo do dia.',
    climate_plan: 'Se chover, troque a caminhada pelo Palazzo Massimo, museu coberto próximo ao metrô.',
    activities: Array.from({ length: 5 }, (_, activityIndex) => ({
      time: `${String(9 + activityIndex * 2).padStart(2, '0')}:00`,
      title: `Parada ${activityIndex + 1} com atração histórica`,
      desc: 'Visita organizada com informações práticas, tempo previsto e uma descrição clara para o viajante.',
      location: { address: 'Centro histórico, Roma', lat: 41.89 + activityIndex * 0.002, lng: 12.48 + dayIndex * 0.002 },
      ...(activityIndex === 2 ? { category: 'food', restaurant_options: [
        { name: 'Armando al Pantheon', address: 'Salita de Crescenzi 31, Roma', dish: 'Amatriciana', price_level: '$$' },
        { name: 'Roscioli', address: 'Via dei Giubbonari 21, Roma', dish: 'Carbonara', price_level: '$$$' }
      ] } : {})
    }))
  }))
};
sampleTrip.itinerary = enrichItineraryWithCalendar(sampleTrip.itinerary, sampleTrip.start_date, sampleTrip.end_date);

const checkoutUrl = 'https://pay.kirvano.com/8c50a730-069a-40e8-bed3-078c03089d1d';
const result = createItineraryPdf(sampleTrip, { checkoutUrl });
const pdfText = new TextDecoder('latin1').decode(result.bytes);

assert.ok(result.bytes.length > 5000, 'PDF deve conter conteúdo real, não um arquivo vazio.');
assert.ok(pdfText.startsWith('%PDF-1.4'), 'Arquivo deve ter assinatura PDF válida.');
assert.ok(pdfText.endsWith('%%EOF'), 'Arquivo deve terminar corretamente.');
assert.ok(pdfText.includes('/Type /Catalog'));
assert.ok(pdfText.includes('/Subtype /Link'), 'CTA deve ser clicável dentro do PDF.');
assert.ok(pdfText.includes(checkoutUrl), 'PDF deve conter o link oficial do produto.');
assert.ok(pdfText.includes('QUERO MEU ORBIA TRAVEL'));
assert.ok(pdfText.includes('02 de set de 2026'));
assert.ok(pdfText.includes('07 de set de 2026'));
assert.ok(pdfText.includes('DIAS PLANEJADOS'));
assert.ok(pdfText.includes('02-09-2026'));
assert.ok(pdfText.includes('PARADAS'));
assert.ok(pdfText.includes('Abrir no mapa'));
assert.ok(pdfText.includes('Onde comer: Armando al Pantheon'));
assert.ok(pdfText.includes('Alternativa: Roscioli'));
assert.ok(pdfText.includes('O FIO DESTE DIA'));
assert.ok(pdfText.includes('DESTAQUE DE HOJE'));
assert.ok(pdfText.includes('SEGREDO LOCAL'));
assert.ok(pdfText.includes('LOGÍSTICA DO DIA'));
assert.ok(pdfText.includes('google.com/maps/search'), 'Endereços devem abrir no mapa.');
assert.ok(!pdfText.includes(`(${checkoutUrl}) Tj`), 'A URL técnica não deve ficar visível no layout.');
assert.deepEqual(result.summary, { days: 5, stops: 25, distance: 4.5 });
assert.ok(result.pageCount >= 2, 'Roteiros longos devem ser paginados automaticamente.');
assert.equal(result.filename, 'viagem-para-roma-orbia-travel.pdf');

const startXref = Number(pdfText.match(/startxref\n(\d+)/)?.[1]);
assert.ok(Number.isFinite(startXref));
assert.equal(pdfText.slice(startXref, startXref + 4), 'xref');

assert.throws(() => createItineraryPdf({ itinerary: [] }), /Roteiro vazio/);

console.log(`  ✅ PDF premium válido com ${result.pageCount} páginas, mapas, QR e CTA clicáveis.`);
