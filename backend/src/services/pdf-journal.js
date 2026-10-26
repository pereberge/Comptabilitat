import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { decimal } from '../../../shared/money.js';
import { parseDiariPages } from './pdf-journal-diari.js';

const moneyPattern = /^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;
const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
const invalid = code => { throw new Error('PDF_JOURNAL_' + code); };
function sourceDate(text) {
  if (!datePattern.test(text)) invalid('INVALID_DATE');
  const [day, month, year] = text.split('/'), value = year + '-' + month + '-' + day;
  const parsed = new Date(value + 'T00:00:00Z');
  if (value < '1000-01-01' || value > '9999-12-31' || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid('INVALID_DATE');
  return value;
}
function sourceAmount(text) {
  if (!moneyPattern.test(text)) invalid('INVALID_AMOUNT');
  return BigInt(text.replace(/\./g, '').replace(',', ''));
}
function normalizedItems(items) {
  return items.filter(item => typeof (item.str ?? item.text) === 'string' && (item.str ?? item.text).trim())
    .map(item => ({ text: (item.str ?? item.text).trim(), x: item.x ?? item.transform[4], y: item.y ?? item.transform[5], width: item.width || 0 }));
}

// Coordinates are part of the LIBRO DIARIO adapter. Never infer Debe/Haber from account codes.
export function parseJournalPages(pages) {
  if(!Array.isArray(pages) || !pages.length || pages.length>300)invalid('INVALID');
  if(pages[0].items.some(item=>(item.str??item.text)?.replace(/\s/g,'')==='DIARI'))return parseDiariPages(pages);
  let sourceCompany, startDate, endDate, current = null, totalDebit = 0n, totalCredit = 0n;
  const entries = [], numbers = new Set(), accountNames = new Map(), codeLengths = new Set();
  for (const [pageIndex, page] of pages.entries()) {
    const items = normalizedItems(page.items), pageNumber = page.page ?? pageIndex + 1;
    const header = text => items.find(item => item.text === text);
    const dateHeader = header('Fecha'), numberHeader = header('Nº Asiento'), codeHeader = header('Subcuenta');
    const conceptHeader = header('Concepto'), debitHeader = header('Debe'), creditHeader = header('Haber');
    if (!header('LIBRO DIARIO') || !header('Nombre') || !dateHeader || !numberHeader || !codeHeader || !conceptHeader || !debitHeader || !creditHeader) invalid('UNSUPPORTED_LAYOUT');
    const heading = items.filter(item => item.y > dateHeader.y + 6);
    const company = heading.find(item => /^\d+\s*-\s*\S/.test(item.text))?.text.replace(/^\d+\s*-\s*/, '').trim();
    const range = heading.map(item => item.text).join(' ').match(/Desde\s+(\d{2}\/\d{2}\/\d{4})\s+hasta\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (!company || company.length>160 || !range) invalid('UNSUPPORTED_LAYOUT');
    const start = sourceDate(range[1]), end = sourceDate(range[2]);
    if (start > end) invalid('INVALID_DATE');
    if (pageIndex && (company !== sourceCompany || start !== startDate || end !== endDate)) invalid('MULTIPLE_CONTEXTS');
    sourceCompany = company; startDate = start; endDate = end;
    const footers = items.filter(item => item.text === 'Total Informe');
    if (footers.length !== 1) invalid('MISSING_REPORT_TOTAL');
    const footer = footers[0], consumed = new Set();
    const amountItems = items.filter(item => moneyPattern.test(item.text) && item.x >= debitHeader.x - 30 && item.y < dateHeader.y - 4);
    const pair = anchor => {
      const amounts = amountItems.filter(item => Math.abs(item.y - anchor.y) < 4);
      if (!amounts.length && anchor.text === 'Total Asiento') return { debit: 0n, credit: 0n };
      if (amounts.length !== 2) invalid('MISSING_TOTAL');
      let debit, credit;
      for (const item of amounts) {
        if (item.x + item.width > creditHeader.x) {
          if (credit !== undefined) invalid('AMBIGUOUS_COLUMNS');
          credit = sourceAmount(item.text);
        } else {
          if (debit !== undefined) invalid('AMBIGUOUS_COLUMNS');
          debit = sourceAmount(item.text);
        }
        consumed.add(item);
      }
      if (debit === undefined || credit === undefined) invalid('AMBIGUOUS_COLUMNS');
      return { debit, credit };
    };
    const rows = items.filter(item => datePattern.test(item.text) && item.x < numberHeader.x - 4 && item.y < dateHeader.y - 4 && item.y > footer.y + 3);
    const subtotals = items.filter(item => item.text === 'Total Asiento');
    const events = [...rows.map(item => ({ kind: 'row', item })), ...subtotals.map(item => ({ kind: 'subtotal', item })), { kind: 'footer', item: footer }]
      .sort((a, b) => b.item.y - a.item.y);
    const before = { debit: totalDebit, credit: totalCredit }, usedCodes = new Set();
    for (const event of events) {
      if (event.kind === 'footer') {
        const expected = pair(event.item);
        if (expected.debit !== totalDebit || expected.credit !== totalCredit) invalid('REPORT_TOTAL_MISMATCH');
        continue;
      }
      if (event.kind === 'subtotal') {
        if (!current) invalid('ORPHAN_TOTAL');
        const expected = pair(event.item);
        if (current.debit !== current.credit) invalid('UNBALANCED_ENTRY');
        if (expected.debit !== current.debit || expected.credit !== current.credit) invalid('ENTRY_TOTAL_MISMATCH');
        if (current.lines.length < 2) invalid('INVALID_ENTRY');
        const concept = current.description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        current.entry_type = concept.startsWith('ASIENTO DE APERTURA') ? 'opening'
          : concept.startsWith('ASIENTO DE CIERRE') ? 'closing' : concept.startsWith('ASIENTO DE REGULARIZACION') ? 'regularization' : 'normal';
        entries.push({ ...current, debit: decimal(current.debit), credit: decimal(current.credit) });
        if(entries.length>5000)invalid('TOO_MANY_ROWS');
        numbers.add(current.number); current = null;
        continue;
      }
      const row = items.filter(item => Math.abs(item.y - event.item.y) < 1.5).sort((a, b) => a.x - b.x);
      const numberItem = row.find(item => /^\d+$/.test(item.text) && item.x >= numberHeader.x - 4 && item.x < codeHeader.x - 4);
      const codeItem = row.find(item => /^[1-9]\d{5,19}$/.test(item.text) && Math.abs(item.x - codeHeader.x) < 4);
      const name = row.filter(item => item.x >= codeHeader.x + 40 && item.x < conceptHeader.x - 50).map(item => item.text).join(' ');
      const description = row.filter(item => item.x >= conceptHeader.x - 50 && item.x < debitHeader.x - 30).map(item => item.text).join(' ');
      const number = Number(numberItem?.text), entryDate = sourceDate(event.item.text);
      if (!numberItem || !Number.isSafeInteger(number) || number < 0 || number > 4294967295 || !codeItem || !name || !description || name.length > 200 || description.length > 200) invalid('INVALID_ROW');
      if (entryDate < startDate || entryDate > endDate) invalid('DATE_OUTSIDE_RANGE');
      if (current && (current.number !== number || current.entry_date !== entryDate)) invalid('MISSING_ENTRY_TOTAL');
      if (!current) {
        if (numbers.has(number)) invalid('DUPLICATE_NUMBER');
        current = { number, entry_date: entryDate, description, lines: [], debit: 0n, credit: 0n };
      }
      let debit = 0n, credit = 0n, debitSeen = false, creditSeen = false;
      for (const amount of amountItems.filter(item => Math.abs(item.y - event.item.y) < 1.5)) {
        if (amount.x + amount.width > creditHeader.x) {
          if (creditSeen) invalid('AMBIGUOUS_COLUMNS');
          credit = sourceAmount(amount.text); creditSeen = true;
        } else {
          if (debitSeen) invalid('AMBIGUOUS_COLUMNS');
          debit = sourceAmount(amount.text); debitSeen = true;
        }
        consumed.add(amount);
      }
      if (debit !== 0n && credit !== 0n) invalid('INVALID_LINE_AMOUNTS');
      if (debit > 999999999999999n || debit < -999999999999999n || credit > 999999999999999n || credit < -999999999999999n) invalid('AMOUNT_LIMIT');
      usedCodes.add(codeItem); codeLengths.add(codeItem.text.length);
      if (!accountNames.has(codeItem.text)) accountNames.set(codeItem.text, name);
      current.lines.push({ code: codeItem.text, account_name: name, description, debit: decimal(debit), credit: decimal(credit), page: pageNumber });
      current.debit += debit; current.credit += credit; totalDebit += debit; totalCredit += credit;
      if (current.lines.length > 1000 || entries.length > 5000) invalid('TOO_MANY_ROWS');
    }
    const codes = items.filter(item => /^[1-9]\d{5,19}$/.test(item.text) && Math.abs(item.x - codeHeader.x) < 4 && item.y < dateHeader.y - 4 && item.y > footer.y + 3);
    if (codes.some(item => !usedCodes.has(item))) invalid('UNREAD_ROW');
    const carry = amountItems.filter(item => !consumed.has(item));
    if (carry.length) {
      if (carry.length !== 2 || !pageIndex || carry.some(item => item.y <= Math.max(footer.y, ...rows.map(row => row.y))) || Math.abs(carry[0].y - carry[1].y) >= 4) invalid('UNREAD_AMOUNT');
      const carried = pair(carry[0]);
      if (carried.debit !== before.debit || carried.credit !== before.credit) invalid('CARRY_MISMATCH');
    }
  }
  if (current || !entries.length) invalid('INCOMPLETE_REPORT');
  if (totalDebit !== totalCredit) invalid('UNBALANCED_REPORT');
  if (codeLengths.size !== 1) invalid('MIXED_ACCOUNT_LENGTHS');
  const lines = entries.reduce((count, entry) => count + entry.lines.length, 0);
  if (lines > 20000) invalid('TOO_MANY_ROWS');
  const allLines = entries.flatMap(entry => entry.lines);
  return { source_company: sourceCompany, start_date: startDate, end_date: endDate, pages: pages.length,
    subaccount_length: [...codeLengths][0], entries, accounts: [...accountNames].map(([code, description]) => ({ code, description })),
    totals: { entries: entries.length, lines, accounts: accountNames.size, debit: decimal(totalDebit), credit: decimal(totalCredit),
      negative_entries: entries.filter(entry => entry.debit.startsWith('-')).length,
      zero_entries: entries.filter(entry => entry.debit === '0.00').length,
      zero_lines: allLines.filter(line => line.debit === '0.00' && line.credit === '0.00').length,
      negative_lines: allLines.filter(line => line.debit.startsWith('-') || line.credit.startsWith('-')).length },
    has_closing: entries.at(-1).entry_type === 'closing' && entries.at(-1).entry_date === endDate };
}

export async function extractJournalPdf(buffer) {
  if (Buffer.from(buffer).subarray(0, 5).toString() !== '%PDF-') invalid('INVALID');
  const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  try {
    const document = await task.promise, pages = [];
    if (document.numPages > 300) invalid('TOO_MANY_PAGES');
    for (let page = 1; page <= document.numPages; page++) pages.push({ page, items: (await (await document.getPage(page)).getTextContent()).items });
    return parseJournalPages(pages);
  } finally { await task.destroy(); }
}
