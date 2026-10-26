// Rebuild from a locally downloaded consolidated BOE document, then review the diff.
// Usage: node scripts/build-balance-map.mjs path/to/BOE-A-2007-19884.html
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync(process.argv[2], 'utf8');
const clean = value => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const models = {};
for (const [model, anchor] of [['normal','balance'],['abbreviated','balanceabreviado-2']]) {
  const start = html.indexOf(`id="${anchor}"`);
  if (start < 0) throw new Error('Missing BOE balance table');
  const block = html.slice(start, html.indexOf('<blockquote', start));
  const nodes = [], stack = [];
  let side = 'asset', equity = false, last;
  for (const match of block.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => clean(m[1]));
    if (cells.length < 2) continue;
    const [codes, label] = cells;
    if (label === 'PATRIMONIO NETO Y PASIVO') { side = 'equity_liabilities'; stack.length = 0; continue; }
    if (!label) { if (codes && last) last.rules.push(...rules(codes)); continue; }
    if (/^(TOTAL|ACTIVO$)/.test(label)) continue;
    let depth;
    if (/^[ABC]\)/.test(label)) { depth = 0; equity = side !== 'asset' && label.startsWith('A)'); }
    else if (/^A-[123]\)/.test(label)) depth = 1;
    else if (/^[IVX]+\./.test(label)) depth = equity ? 2 : 1;
    else if (/^\d+\./.test(label)) depth = equity ? 3 : 2;
    else continue;
    while (stack.length && stack.at(-1).depth >= depth) stack.pop();
    last = { id: `${side}-${nodes.length+1}`, parent_id: stack.at(-1)?.id || null, side, depth, label, rules: rules(codes) };
    nodes.push(last); stack.push(last);
  }
  // PGC balance preparation rule 6: research activated must have its own caption.
  if (model === 'normal') {
    const intangible = nodes.find(n => n.label.startsWith('I. Inmovilizado intangible'));
    nodes.splice(nodes.indexOf(intangible)+1, 0, {id:'asset-research',parent_id:intangible.id,side:'asset',depth:2,label:'Investigación',rules:rules('200,(2800),(2900)')});
    const thirdParty = nodes.find(n=>n.side==='asset' && n.label.startsWith('V. Inversiones financieras a largo plazo'));
    nodes.find(n=>n.parent_id===thirdParty.id && n.label==='5. Otros activos financieros.').rules.push(...rules('257'));
  }
  // Pending retentions/payments on account remain current tax assets in interim reports.
  // The BOE annual table does not list 473; its account movements settle against 6300/4709.
  const currentTax=nodes.find(n=>n.side==='asset' && n.label===(model==='normal'?'5. Activos por impuesto corriente.':'3. Otros deudores.'));
  if(!currentTax)throw new Error('Missing current tax caption');
  currentTax.rules.push(...rules('473'));
  // Imported 2400 identifies related-party equity, but not group/associate versus other related party.
  // Keep its known non-current asset nature visible without assuming the missing four-digit detail.
  const noncurrent=nodes.find(n=>n.label==='A) ACTIVO NO CORRIENTE');
  const investment=nodes.findIndex(n=>n.side==='asset'&&n.label.startsWith('V. Inversiones financieras a largo plazo'));
  if(!noncurrent||investment<0)throw new Error('Missing non-current investment captions');
  nodes.splice(investment,0,{id:'asset-linked-participations',parent_id:noncurrent.id,side:'asset',depth:1,label:'Participaciones a largo plazo en partes vinculadas sin desglose',rules:[{prefix:'2400',corrector:false,review:true}]});
  // Generic imported material amortization has no reliable split by asset class.
  if(model==='normal')nodes.find(n=>n.side==='asset'&&n.label==='II. Inmovilizado material.').rules.push({prefix:'2810',corrector:true,review:true});
  models[model] = nodes;
}
function rules(text) {
  return [...text.matchAll(/\(?\s*\d+\s*\)?/g)].map(([value]) => ({prefix:value.replace(/\D/g,''),corrector:value.includes('(')}));
}
writeFileSync(new URL('../backend/src/services/pgc-balance-map.json',import.meta.url), JSON.stringify({version:'PGC-1514-2007-consolidated-2026-10-23-v3',source:'https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884',models},null,2)+'\n');
