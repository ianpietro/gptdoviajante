const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const DEFAULT_CHECKOUT_URL = 'https://pay.kirvano.com/8c50a730-069a-40e8-bed3-078c03089d1d';

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
  const text = String(value ?? '');
  const bytes = [];
  for (const char of text) {
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
    } else {
      current = candidate;
    }
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
  const parts = [0, 2, 4].map(index => parseInt(normalized.slice(index, index + 2), 16) / 255);
  return parts.map(value => value.toFixed(3)).join(' ');
}

function createPage() {
  return { commands: [], links: [], y: PAGE_HEIGHT - MARGIN };
}

function addTextCommand(page, text, x, y, size, bold = false, color = '#344A59') {
  if (!cleanText(text)) return;
  page.commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgbCommand(color)} rg 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${escapePdfText(text)}) Tj ET`);
}

function addRectCommand(page, x, y, width, height, fill, stroke = null) {
  const commands = [`${rgbCommand(fill)} rg`];
  if (stroke) commands.push(`${rgbCommand(stroke)} RG 1 w`);
  commands.push(`${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re ${stroke ? 'B' : 'f'}`);
  page.commands.push(commands.join(' '));
}

function addDocumentHeader(page, pageNumber, title) {
  addTextCommand(page, 'ORBIA TRAVEL', MARGIN, 802, 18, true, '#216F80');
  addTextCommand(page, 'SEU COPILOTO DE VIAGEM', MARGIN, 785, 7.5, true, '#285668');
  addTextCommand(page, cleanText(title), 260, 797, 9, true, '#263E49');
  addRectCommand(page, MARGIN, 773, PAGE_WIDTH - MARGIN * 2, 3, '#ED7542');
  addTextCommand(page, `Página ${pageNumber}`, PAGE_WIDTH - 93, 26, 8, false, '#607985');
  addTextCommand(page, 'copilotodeviagem.com.br', MARGIN, 26, 8, true, '#216F80');
  page.y = 748;
}

function getTripDates(trip) {
  return cleanText(trip.infoDates || [trip.start_date, trip.end_date].filter(Boolean).join(' a ') || 'Datas a definir');
}

export function createItineraryPdf(trip, options = {}) {
  if (!trip || !Array.isArray(trip.itinerary) || trip.itinerary.length === 0) {
    throw new Error('Roteiro vazio: não há dias para exportar.');
  }

  const checkoutUrl = options.checkoutUrl || DEFAULT_CHECKOUT_URL;
  const tripTitle = cleanText(trip.tripTitle || trip.destination || 'Meu roteiro de viagem');
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
    if (page.y - height < 56) newPage();
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

  addRectCommand(page, MARGIN, 623, PAGE_WIDTH - MARGIN * 2, 105, '#344A59');
  addTextCommand(page, 'ROTEIRO DE VIAGEM', MARGIN + 22, 700, 9, true, '#F3B294');
  wrapText(tripTitle, PAGE_WIDTH - MARGIN * 2 - 44, 23).slice(0, 2).forEach((line, index) => {
    addTextCommand(page, line, MARGIN + 22, 671 - index * 28, 23, true, '#FFFFFF');
  });
  addTextCommand(page, getTripDates(trip), MARGIN + 22, 640, 10, false, '#DCE7EA');
  page.y = 596;

  addWrappedText('Seu planejamento organizado para consultar, compartilhar e levar durante a viagem.', { size: 11, color: '#536A79', leading: 16 });
  page.y -= 10;

  trip.itinerary.forEach((day, dayIndex) => {
    const dayNumber = Number(day.dayNum || day.dayNumber || day.day_number) || dayIndex + 1;
    const dayTitle = cleanText(day.dayTitle || day.title || `Programação do dia ${dayNumber}`);
    ensureSpace(86);
    addRectCommand(page, MARGIN, page.y - 29, PAGE_WIDTH - MARGIN * 2, 35, '#EAF1F2');
    addTextCommand(page, `DIA ${dayNumber}`, MARGIN + 12, page.y - 17, 10, true, '#B44B24');
    addTextCommand(page, dayTitle, MARGIN + 72, page.y - 17, 11, true, '#344A59');
    page.y -= 47;

    const activities = Array.isArray(day.activities) ? day.activities : [];
    if (activities.length === 0) {
      addWrappedText('Dia livre para explorar no seu ritmo.', { x: MARGIN + 14, width: PAGE_WIDTH - MARGIN * 2 - 28, size: 9.5, color: '#657C88' });
    }

    activities.forEach((activity, activityIndex) => {
      const time = cleanText(activity.time || activity.start_time || '--:--');
      const title = cleanText(activity.title || activity.name || `Parada ${activityIndex + 1}`);
      const detail = cleanText(activity.desc || activity.description || activity.tip || activity.operational_notes || '');
      const locationSource = activity.location && typeof activity.location === 'object'
        ? activity.location.address
        : activity.location;
      const location = cleanText(locationSource || activity.address || activity.neighborhood || '');
      const titleLines = wrapText(`${time}  ${title}`, PAGE_WIDTH - MARGIN * 2 - 30, 10.5);
      const detailLines = wrapText(detail, PAGE_WIDTH - MARGIN * 2 - 48, 8.5).slice(0, 3);
      const locationLines = wrapText(location ? `Local: ${location}` : '', PAGE_WIDTH - MARGIN * 2 - 48, 8).slice(0, 2);
      const needed = 18 + titleLines.length * 14 + detailLines.length * 11 + locationLines.length * 10;
      ensureSpace(needed);
      addRectCommand(page, MARGIN + 3, page.y - 7, 5, 5, '#E97845');
      titleLines.forEach(line => {
        addTextCommand(page, line, MARGIN + 18, page.y, 10.5, true, '#344A59');
        page.y -= 14;
      });
      detailLines.forEach(line => {
        addTextCommand(page, line, MARGIN + 31, page.y, 8.5, false, '#536A79');
        page.y -= 11;
      });
      locationLines.forEach(line => {
        addTextCommand(page, line, MARGIN + 31, page.y, 8, false, '#758A96');
        page.y -= 10;
      });
      page.y -= 9;
    });
    page.y -= 7;
  });

  ensureSpace(168);
  const ctaTop = page.y;
  addRectCommand(page, MARGIN, ctaTop - 142, PAGE_WIDTH - MARGIN * 2, 142, '#F7FAFA', '#ED7542');
  addTextCommand(page, 'Gostou deste roteiro?', MARGIN + 22, ctaTop - 31, 15, true, '#285668');
  page.y = ctaTop - 53;
  addWrappedText('Crie sua própria viagem com o Orbia Travel: roteiro personalizado, mala inteligente, orçamento e organização em um só lugar.', {
    x: MARGIN + 22,
    width: PAGE_WIDTH - MARGIN * 2 - 44,
    size: 9.5,
    color: '#607985',
    leading: 13
  });
  const buttonY = ctaTop - 123;
  addRectCommand(page, MARGIN + 22, buttonY, 205, 31, '#ED7542');
  addTextCommand(page, 'QUERO PLANEJAR MINHA VIAGEM', MARGIN + 34, buttonY + 11, 8.5, true, '#FFFFFF');
  addTextCommand(page, checkoutUrl, MARGIN + 242, buttonY + 11, 7.2, false, '#607985');
  page.links.push({ x: MARGIN + 22, y: buttonY, width: PAGE_WIDTH - MARGIN * 2 - 44, height: 31, url: checkoutUrl });

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
    const streamLength = encodeWinAnsi(stream).length;
    objects.set(meta.contentId, `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
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

  return {
    bytes: pdfBytes,
    filename: slugifyFilename(`${tripTitle}-Orbia-Travel`),
    pageCount: pages.length
  };
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
