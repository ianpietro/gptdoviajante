import { evaluateDayRouteQuality } from './logisticsEngine.js';
import { buildGoogleMapsSearchUrl } from './mapContextEngine.js';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const CONTENT_BOTTOM = 56;
const FINAL_CTA_HEIGHT = 170;
const DEFAULT_CHECKOUT_URL = 'https://pay.kirvano.com/8c50a730-069a-40e8-bed3-078c03089d1d';

// QR Code do checkout oficial, local para funcionar até sem conexão.
const PRODUCT_QR = [
  '111111100100001000111101001111111',
  '100000100111100110101110001000001',
  '101110101001000100110111101011101',
  '101110101000100100101011101011101',
  '101110101101000101000001001011101',
  '100000101000011001001100101000001',
  '111111101010101010101010101111111',
  '000000001010001110010111100000000',
  '101111100101110001000010101111100',
  '001110000110011010111111001101111',
  '100011101111111100000110110010100',
  '101011001110110100111101000011110',
  '000111111010001100110001100011011',
  '101101010001100001011111011100111',
  '000100101001000100000000011000110',
  '101011001000100010000100011010100',
  '010010111010000111110011110111001',
  '111110011001100001110111111101101',
  '111010100000000111001000000110100',
  '000010010011000111111110100111100',
  '110101101001000101111001110111000',
  '111100010011111101010101101101101',
  '100011111101110001001010100000010',
  '100100000101101110011100100100100',
  '100101100010001011100011111111010',
  '000000001101000000011001100010111',
  '111111100101100111100111101010100',
  '100000101000111001111111100011111',
  '101110101100000100111000111111000',
  '101110101100000011110111110010011',
  '101110101001000100100100101101100',
  '100000100111011100100111010011100',
  '111111101011000101000010110100010'
];

const WIN_ANSI = new Map([
  ['€', 128], ['‚', 130], ['ƒ', 131], ['„', 132], ['…', 133], ['†', 134], ['‡', 135],
  ['ˆ', 136], ['‰', 137], ['Š', 138], ['‹', 139], ['Œ', 140], ['Ž', 142], ['‘', 145],
  ['’', 146], ['“', 147], ['”', 148], ['•', 149], ['–', 150], ['—', 151], ['˜', 152],
  ['™', 153], ['š', 154], ['›', 155], ['œ', 156], ['ž', 158], ['Ÿ', 159]
]);

function cleanText(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function encodeWinAnsi(value) {
  const bytes = [];
  for (const char of String(value ?? '')) {
    const code = char.charCodeAt(0);
    if (code <= 255) bytes.push(code);
    else if (WIN_ANSI.has(char)) bytes.push(WIN_ANSI.get(char));
    else bytes.push(63);
  }
  return Uint8Array.from(bytes);
}

function escapePdfText(value) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function escapePdfUrl(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(value, maxWidth, fontSize = 10) {
  const text = cleanText(value);
  if (!text) return [];
  const maxChars = Math.max(12, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = text.split(' ');
  const lines = [];
  let current = '';
  words.forEach(word => {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
      current = '';
      return;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else current = candidate;
  });
  if (current) lines.push(current);
  return lines;
}

function slugifyFilename(value) {
  const slug = cleanText(value || 'roteiro-veroa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return `${slug || 'roteiro-veroa'}.pdf`;
}

function rgbCommand(hex) {
  const normalized = String(hex).replace('#', '');
  return [0, 2, 4]
    .map(index => parseInt(normalized.slice(index, index + 2), 16) / 255)
    .map(value => value.toFixed(3))
    .join(' ');
}

function createPage() {
  return { commands: [], links: [], y: PAGE_HEIGHT - MARGIN };
}

function addTextCommand(page, text, x, y, size, bold = false, color = '#344A59') {
  if (!cleanText(text)) return;
  page.commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgbCommand(color)} rg 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${escapePdfText(text)}) Tj ET`);
}

function addRectCommand(page, x, y, width, height, fill, stroke = null, strokeWidth = 1) {
  const commands = [`${rgbCommand(fill)} rg`];
  if (stroke) commands.push(`${rgbCommand(stroke)} RG ${strokeWidth} w`);
  commands.push(`${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re ${stroke ? 'B' : 'f'}`);
  page.commands.push(commands.join(' '));
}

function addLineCommand(page, points, color, width) {
  if (!points.length) return;
  const [first, ...rest] = points;
  page.commands.push(`q 1 J 1 j ${rgbCommand(color)} RG ${width} w ${first[0]} ${first[1]} m ${rest.map(point => `${point[0]} ${point[1]} l`).join(' ')} S Q`);
}

function addVMark(page, x, y, scale = 1) {
  addLineCommand(page, [[x, y + 23 * scale], [x + 12 * scale, y], [x + 24 * scale, y + 23 * scale]], '#91C8C4', 5 * scale);
  addLineCommand(page, [[x + 8 * scale, y + 23 * scale], [x + 13 * scale, y + 13 * scale]], '#FFFFFF', 3 * scale);
}

function addQrCode(page, x, y, size) {
  const quiet = 4;
  const dimension = PRODUCT_QR.length + quiet * 2;
  const moduleSize = size / dimension;
  addRectCommand(page, x, y, size, size, '#FFFFFF');
  PRODUCT_QR.forEach((row, rowIndex) => {
    [...row].forEach((cell, columnIndex) => {
      if (cell !== '1') return;
      addRectCommand(
        page,
        x + (columnIndex + quiet) * moduleSize,
        y + (PRODUCT_QR.length - rowIndex - 1 + quiet) * moduleSize,
        moduleSize + 0.08,
        moduleSize + 0.08,
        '#162A36'
      );
    });
  });
}

function addDocumentHeader(page, pageNumber, title) {
  addVMark(page, MARGIN, 783, 0.72);
  addTextCommand(page, 'ORBIA TRAVEL', MARGIN + 28, 802, 18, true, '#216F80');
  addTextCommand(page, 'SEU COPILOTO DE VIAGEM', MARGIN + 28, 785, 7.5, true, '#285668');
  addTextCommand(page, cleanText(title), 290, 797, 8.5, true, '#263E49');
  addRectCommand(page, MARGIN, 773, PAGE_WIDTH - MARGIN * 2, 3, '#ED7542');
  addTextCommand(page, `Página ${pageNumber}`, PAGE_WIDTH - 93, 26, 8, false, '#607985');
  addTextCommand(page, 'Orbia Travel • Seu copiloto de viagem', MARGIN, 26, 8, true, '#607985');
  page.y = 748;
}

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDate(value) {
  const date = parseDateOnly(value);
  if (!date) return cleanText(value);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(date)
    .replace('.', '');
}

function getTripDates(trip) {
  const start = trip.start_date || trip.startDate;
  const end = trip.end_date || trip.endDate;
  if (start && end) return `${formatDate(start)} — ${formatDate(end)}`;
  if (start) return `A partir de ${formatDate(start)}`;
  return cleanText(trip.infoDates || trip.dates || 'Datas a definir');
}

function getLocation(activity) {
  const source = activity.location && typeof activity.location === 'object'
    ? activity.location.address
    : activity.location;
  return cleanText(source || activity.address || activity.neighborhood || '');
}

function createMapUrl(activity, destination) {
  const location = getLocation(activity);
  const title = cleanText(activity.title || activity.name || '');
  return buildGoogleMapsSearchUrl([location || title], destination);
}

function getActivityLayout(activity) {
  const time = cleanText(activity.time || activity.start_time || '--:--');
  const title = cleanText(activity.title || activity.name || 'Parada');
  const detail = cleanText(activity.desc || activity.description || activity.tip || activity.operational_notes || '');
  const location = getLocation(activity);
  const titleLines = wrapText(`${time}  ${title}`, PAGE_WIDTH - MARGIN * 2 - 30, 10.5);
  const detailLines = wrapText(detail, PAGE_WIDTH - MARGIN * 2 - 48, 8.5).slice(0, 1);
  const locationLines = wrapText(location ? `Abrir no mapa: ${location}` : '', PAGE_WIDTH - MARGIN * 2 - 48, 8).slice(0, 2);
  const restaurantLines = (Array.isArray(activity.restaurant_options) ? activity.restaurant_options : [])
    .slice(0, 2)
    .flatMap((option, index) => wrapText(
      `${index === 0 ? 'Onde comer' : 'Alternativa'}: ${cleanText(option.name)} • ${cleanText(option.dish)} • ${cleanText(option.price_level)} • ${cleanText(option.address)}`,
      PAGE_WIDTH - MARGIN * 2 - 48,
      8
    ).slice(0, 2));
  return {
    titleLines,
    detailLines,
    locationLines,
    restaurantLines,
    height: titleLines.length * 14 + detailLines.length * 11 + restaurantLines.length * 10 + locationLines.length * 10 + 9
  };
}

function estimateDayHeight(day) {
  const activities = Array.isArray(day.activities) ? day.activities : [];
  const narrativeFields = [day.dayStory, day.highlight, day.localSecret, day.logistics, day.climate_plan].filter(Boolean);
  const narrativeHeight = narrativeFields.reduce((sum, value) =>
    sum + 18 + wrapText(cleanText(value), PAGE_WIDTH - MARGIN * 2 - 44, 8.5).slice(0, 5).length * 11, 0);
  return 54 + narrativeHeight + (activities.length ? activities.reduce((sum, activity) => sum + getActivityLayout(activity).height, 0) : 26);
}

function getTripSummary(trip) {
  const activities = trip.itinerary.flatMap(day => Array.isArray(day.activities) ? day.activities : []);
  const totalDistance = trip.itinerary.reduce((sum, day) => {
    const quality = evaluateDayRouteQuality(Array.isArray(day.activities) ? day.activities : []);
    return sum + quality.totalDistanceKm;
  }, 0);
  return {
    days: trip.itinerary.length,
    stops: activities.length,
    distance: Math.round(totalDistance * 10) / 10
  };
}

export function createItineraryPdf(trip, options = {}) {
  if (!trip || !Array.isArray(trip.itinerary) || trip.itinerary.length === 0) {
    throw new Error('Roteiro vazio: não há dias para exportar.');
  }

  const checkoutUrl = options.checkoutUrl || DEFAULT_CHECKOUT_URL;
  const tripTitle = cleanText(trip.tripTitle || trip.destination || 'Meu roteiro de viagem');
  const destination = cleanText(trip.destination || tripTitle.replace(/^Viagem para\s+/i, ''));
  const summary = getTripSummary(trip);
  const pages = [];
  let page = createPage();
  pages.push(page);
  addDocumentHeader(page, pages.length, tripTitle);

  const newPage = () => {
    page = createPage();
    pages.push(page);
    addDocumentHeader(page, pages.length, tripTitle);
  };

  const ensureSpace = height => {
    if (page.y - height >= CONTENT_BOTTOM) return false;
    newPage();
    return true;
  };

  const addWrappedText = (text, { x = MARGIN, width = PAGE_WIDTH - MARGIN * 2, size = 10, bold = false, color = '#344A59', leading = size + 4 } = {}) => {
    const lines = wrapText(text, width, size);
    lines.forEach(line => {
      ensureSpace(leading + 2);
      addTextCommand(page, line, x, page.y, size, bold, color);
      page.y -= leading;
    });
    return lines.length;
  };

  const addNarrativeBlock = (label, text, accent = '#B44B24') => {
    const content = cleanText(text);
    if (!content) return;
    ensureSpace(42);
    addTextCommand(page, label.toUpperCase(), MARGIN + 18, page.y, 7.5, true, accent);
    page.y -= 13;
    addWrappedText(content, { x: MARGIN + 18, width: PAGE_WIDTH - MARGIN * 2 - 36, size: 8.5, color: '#536A79', leading: 11 });
    page.y -= 6;
  };

  addRectCommand(page, MARGIN, 611, PAGE_WIDTH - MARGIN * 2, 117, '#344A59', '#E97845', 1.2);
  addVMark(page, PAGE_WIDTH - 102, 661, 1.55);
  addTextCommand(page, 'ROTEIRO PERSONALIZADO', MARGIN + 22, 700, 9, true, '#F3B294');
  wrapText(tripTitle, 385, 23).slice(0, 2).forEach((line, index) => {
    addTextCommand(page, line, MARGIN + 22, 672 - index * 28, 23, true, '#FFFFFF');
  });
  addTextCommand(page, getTripDates(trip), MARGIN + 22, 629, 10, true, '#DCE7EA');

  const statY = 552;
  const statWidth = 157;
  const stats = [
    [`${summary.days}`, summary.days === 1 ? 'DIA PLANEJADO' : 'DIAS PLANEJADOS'],
    [`${summary.stops}`, summary.stops === 1 ? 'PARADA' : 'PARADAS'],
    [summary.distance > 0 ? `${summary.distance.toLocaleString('pt-BR')} km` : 'Organizada', summary.distance > 0 ? 'DE DESLOCAMENTO' : 'ROTA INTELIGENTE']
  ];
  stats.forEach(([value, label], index) => {
    const x = MARGIN + index * (statWidth + 14);
    addRectCommand(page, x, statY, statWidth, 45, '#F1F6F6', '#D6E1E3');
    addTextCommand(page, value, x + 12, statY + 25, 13, true, '#B44B24');
    addTextCommand(page, label, x + 12, statY + 10, 7.2, true, '#536A79');
  });
  page.y = 526;
  addWrappedText('Seu planejamento organizado para consultar, compartilhar e levar durante toda a viagem.', { size: 10, color: '#536A79', leading: 14 });
  page.y -= 7;

  trip.itinerary.forEach((day, dayIndex) => {
    const dayNumber = Number(day.dayNum || day.dayNumber || day.day_number) || dayIndex + 1;
    const dayTitle = cleanText(day.dayTitle || day.title || `Programação do dia ${dayNumber}`);
    const estimatedHeight = estimateDayHeight(day);
    const isLastDay = dayIndex === trip.itinerary.length - 1;
    const availableHeight = page.y - CONTENT_BOTTOM;
    const freshPageCapacity = 748 - CONTENT_BOTTOM;
    const lastDayWithCta = estimatedHeight + FINAL_CTA_HEIGHT + 22;
    if (isLastDay && lastDayWithCta <= freshPageCapacity && lastDayWithCta > availableHeight) newPage();
    else {
      const firstActivity = Array.isArray(day.activities) ? day.activities[0] : null;
      ensureSpace(54 + (firstActivity ? getActivityLayout(firstActivity).height : 26));
    }

    addRectCommand(page, MARGIN, page.y - 29, PAGE_WIDTH - MARGIN * 2, 35, '#EAF1F2');
    addRectCommand(page, MARGIN, page.y - 29, 5, 35, '#E97845');
    const calendarHeading = cleanText(day.dateLabel || (day.date && day.weekday ? `${day.date} · ${day.weekday}` : `Dia ${dayNumber}`));
    addTextCommand(page, calendarHeading.toUpperCase(), MARGIN + 15, page.y - 17, 8.5, true, '#B44B24');
    addTextCommand(page, dayTitle, MARGIN + 205, page.y - 17, 10, true, '#344A59');
    page.y -= 47;

    addNarrativeBlock('O fio deste dia', day.dayStory || day.day_story);

    const activities = Array.isArray(day.activities) ? day.activities : [];
    if (activities.length === 0) {
      addWrappedText('Dia livre para explorar no seu ritmo.', { x: MARGIN + 14, width: PAGE_WIDTH - MARGIN * 2 - 28, size: 9.5, color: '#657C88' });
    }

    activities.forEach(activity => {
      const layout = getActivityLayout(activity);
      if (page.y - layout.height < CONTENT_BOTTOM) {
        newPage();
        addRectCommand(page, MARGIN, page.y - 23, PAGE_WIDTH - MARGIN * 2, 29, '#F6F9F9');
        addTextCommand(page, `${calendarHeading.toUpperCase()} • CONTINUAÇÃO`, MARGIN + 14, page.y - 13, 8, true, '#758A96');
        page.y -= 36;
      }
      addRectCommand(page, MARGIN + 3, page.y - 7, 6, 6, '#E97845');
      layout.titleLines.forEach(line => {
        addTextCommand(page, line, MARGIN + 18, page.y, 10.5, true, '#344A59');
        page.y -= 14;
      });
      layout.detailLines.forEach(line => {
        addTextCommand(page, line, MARGIN + 31, page.y, 8.5, false, '#536A79');
        page.y -= 11;
      });
      layout.restaurantLines.forEach(line => {
        addTextCommand(page, line, MARGIN + 31, page.y, 8, true, '#B44B24');
        page.y -= 10;
      });
      const mapUrl = createMapUrl(activity, destination);
      if (layout.locationLines.length && mapUrl) {
        const linkTop = page.y + 3;
        layout.locationLines.forEach(line => {
          addTextCommand(page, line, MARGIN + 31, page.y, 8, true, '#B44B24');
          page.y -= 10;
        });
        page.links.push({ x: MARGIN + 27, y: page.y - 1, width: PAGE_WIDTH - MARGIN * 2 - 48, height: linkTop - page.y + 5, url: mapUrl });
      }
      page.y -= 9;
    });
    addNarrativeBlock('Destaque de hoje', day.highlight, '#B44B24');
    addNarrativeBlock('Segredo local', day.localSecret || day.local_secret, '#187365');
    addNarrativeBlock('Logística do dia', day.logistics || day.logistica, '#285668');
    addNarrativeBlock('Plano B para o clima', day.climate_plan || day.climatePlan, '#B44B24');
    page.y -= 7;
  });

  const ctaHeight = FINAL_CTA_HEIGHT;
  ensureSpace(ctaHeight + 10);
  const ctaTop = page.y;
  addRectCommand(page, MARGIN, ctaTop - ctaHeight, PAGE_WIDTH - MARGIN * 2, ctaHeight, '#162A36', '#E97845', 1.2);
  addTextCommand(page, 'PLANEJE A SUA PRÓXIMA VIAGEM', MARGIN + 22, ctaTop - 27, 8, true, '#F3B294');
  addTextCommand(page, 'Sua viagem inteira.', MARGIN + 22, ctaTop - 53, 17, true, '#FFFFFF');
  addTextCommand(page, 'Sob controle.', MARGIN + 22, ctaTop - 75, 17, true, '#FFFFFF');
  wrapText('Roteiro personalizado, mala inteligente, orçamento e documentos em um só lugar.', 305, 9).slice(0, 3).forEach((line, index) => {
    addTextCommand(page, line, MARGIN + 22, ctaTop - 96 - index * 12, 9, false, '#DCE7EA');
  });
  const buttonY = ctaTop - 152;
  addRectCommand(page, MARGIN + 22, buttonY, 188, 30, '#ED7542');
  addTextCommand(page, 'QUERO MEU ORBIA TRAVEL >', MARGIN + 28, buttonY + 10.5, 9, true, '#FFFFFF');

  const qrSize = 88;
  const qrX = PAGE_WIDTH - MARGIN - qrSize - 25;
  const qrY = ctaTop - 119;
  addQrCode(page, qrX, qrY, qrSize);
  addTextCommand(page, 'APONTE A CÂMERA', qrX + 8, qrY - 13, 7, true, '#F3B294');
  page.links.push({ x: MARGIN + 22, y: buttonY, width: 188, height: 30, url: checkoutUrl });
  page.links.push({ x: qrX, y: qrY, width: qrSize, height: qrSize, url: checkoutUrl });

  const pageMeta = [];
  let nextId = 5;
  pages.forEach(currentPage => {
    const contentId = nextId++;
    const pageId = nextId++;
    const annotationIds = currentPage.links.map(() => nextId++);
    pageMeta.push({ contentId, pageId, annotationIds });
  });

  const objects = new Map();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageMeta.map(meta => `${meta.pageId} 0 R`).join(' ')}] >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  pages.forEach((currentPage, index) => {
    const meta = pageMeta[index];
    const stream = currentPage.commands.join('\n');
    objects.set(meta.contentId, `<< /Length ${encodeWinAnsi(stream).length} >>\nstream\n${stream}\nendstream`);
    const annotations = meta.annotationIds.length ? ` /Annots [${meta.annotationIds.map(id => `${id} 0 R`).join(' ')}]` : '';
    objects.set(meta.pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${meta.contentId} 0 R${annotations} >>`);
    currentPage.links.forEach((link, linkIndex) => {
      objects.set(meta.annotationIds[linkIndex], `<< /Type /Annot /Subtype /Link /Rect [${link.x} ${link.y} ${link.x + link.width} ${link.y + link.height}] /Border [0 0 0] /A << /S /URI /URI (${escapePdfUrl(link.url)}) >> >>`);
    });
  });

  const maxId = Math.max(...objects.keys());
  const chunks = [];
  const offsets = new Array(maxId + 1).fill(0);
  let byteOffset = 0;
  const append = value => {
    const bytes = encodeWinAnsi(value);
    chunks.push(bytes);
    byteOffset += bytes.length;
  };

  append('%PDF-1.4\n%âãÏÓ\n');
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = byteOffset;
    append(`${id} 0 obj\n${objects.get(id)}\nendobj\n`);
  }
  const xrefOffset = byteOffset;
  append(`xref\n0 ${maxId + 1}\n`);
  append('0000000000 65535 f \n');
  for (let id = 1; id <= maxId; id += 1) append(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const totalLength = chunks.reduce((sum, bytes) => sum + bytes.length, 0);
  const pdfBytes = new Uint8Array(totalLength);
  let cursor = 0;
  chunks.forEach(bytes => {
    pdfBytes.set(bytes, cursor);
    cursor += bytes.length;
  });

  return { bytes: pdfBytes, filename: slugifyFilename(`${tripTitle}-Orbia-Travel`), pageCount: pages.length, summary };
}

export function downloadItineraryPdf(trip, options = {}) {
  const result = createItineraryPdf(trip, options);
  const blob = new Blob([result.bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
}

export { DEFAULT_CHECKOUT_URL };
