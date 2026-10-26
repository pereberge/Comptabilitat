import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { decimal } from '../../../shared/money.js';

export const normalizeBankText = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const banks = {'2100':'CaixaBank','3058':'Cajamar','0049':'Santander','0081':'Sabadell','0182':'BBVA','1465':'ING','0128':'Bankinter','2080':'Abanca','2103':'Unicaja','2085':'Ibercaja'};
const invalid = code => { throw new Error('BANK_STATEMENT_'+code); };
function checkCurrency(text){const match=String(text).toUpperCase().match(/(?:MONEDA|DIVISA|CURRENCY|CUENTA EN|COMPTE EN)[:\s;]+([A-Z]{3})\b/);if(match&&match[1]!=='EUR')invalid('UNSUPPORTED_CURRENCY');}
export function bankDate(text, year) {
  const months = {GEN:1,ENE:1,JAN:1,FEB:2,MAR:3,ABR:4,APR:4,MAI:5,MAY:5,JUN:6,JUL:7,AGO:8,AUG:8,SET:9,SEP:9,OCT:10,NOV:11,DES:12,DIC:12,DEC:12};
  const value = String(text).trim();
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/), result;
  if (match) result = value;
  else if ((match = value.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}|\d{2}))?$/))) {
    let y = match[3] || year; if(String(y).length === 2)y = '20'+y;
    if(!y)return null;
    result = y+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
  } else if ((match = value.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})$/))) {
    const month = months[normalizeBankText(match[2])]; if(!month)return null;
    result = match[3]+'-'+String(month).padStart(2,'0')+'-'+match[1].padStart(2,'0');
  } else return null;
  const parsed = new Date(result+'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === result ? result : null;
}
function money(text) {
  let value = String(text).trim().replace(/\s|€/g,'');
  if (/^\(.*\)$/.test(value)) value = '-'+value.slice(1,-1);
  if (/^[+-]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(value)) value=value.replaceAll('.','').replace(',','.');
  if (!/^[+-]?\d+\.\d{2}$/.test(value)) return null;
  return BigInt(value.replace('.',''));
}
export function detectBank(text) {
  const candidates = [...String(text).toUpperCase().matchAll(/\bES\d{2}(?:\s?\d){20}\b/g)].map(match=>match[0].replaceAll(' ',''));
  const ibans = [...new Set(candidates)];
  if (ibans.length > 1) invalid('MULTIPLE_ACCOUNTS');
  const iban = ibans[0] || '';
  if (iban) {
    const digits=(iban.slice(4)+iban.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
    if(BigInt(digits)%97n !== 1n)invalid('INVALID_IBAN');
  }
  const code = iban ? iban.slice(4,8) : '';
  const name = banks[code] || Object.values(banks).find(name=>normalizeBankText(text).includes(normalizeBankText(name))) || 'Banco sin identificar';
  return {name,code,iban,iban_masked:iban?'ES•• •••• •••• •••• •••• '+iban.slice(-4):'',detected:name!=='Banco sin identificar'};
}
export function validateBankRows(rows, metadata = {}) {
  if (!rows.length || rows.length > 10000) invalid('NO_MOVEMENTS');
  const valid = candidate => {
    let running = BigInt(candidate[0].balance.replace('.',''))-BigInt(candidate[0].amount.replace('.',''));
    let previous = '';
    for(const row of candidate){
      if(row.date < previous)return false;
      previous=row.date;running+=BigInt(row.amount.replace('.',''));
      if(decimal(running)!==row.balance)return false;
    }return true;
  };
  const ordered = valid(rows) ? rows : valid([...rows].reverse()) ? [...rows].reverse() : null;
  if (!ordered) invalid('BALANCE_MISMATCH');
  const normalized = ordered.map((row,index)=>({...row,id:index+1}));
  return {...metadata,rows:normalized,from:normalized[0].date,to:normalized.at(-1).date,
    initial_balance:decimal(BigInt(normalized[0].balance.replace('.',''))-BigInt(normalized[0].amount.replace('.',''))),
    final_balance:normalized.at(-1).balance};
}
export function parseBankPages(pages) {
  if(!Array.isArray(pages) || !pages.length || pages.length>100)invalid('INVALID_PDF');
  const rows=[], metadata=[];
  for(const [index,page]of pages.entries()){
    const items=page.items.map(item=>({...item,text:(item.text??item.str??'').trim(),x:item.x??item.transform?.[4],y:item.y??item.transform?.[5]})).filter(item=>item.text);
    const header = names => items.find(item=>names.includes(normalizeBankText(item.text)));
    const dateHeader=header(['FECHA','DATA','FECHAOPERACION','DATAOPERACIO']),conceptHeader=header(['CONCEPTO','CONCEPTE','DESCRIPCION','DESCRIPCIO']);
    const amountHeader=header(['IMPORTE','IMPORT']),balanceHeader=header(['SALDO']),debitHeader=header(['DEBE','CARGO','CARGOS']),creditHeader=header(['HABER','ABONO','ABONOS']);
    const valueHeader=header(['FVALOR','FECHAVALOR','DATAVALOR']);
    const extraHeader=header(['MESDADES','MASDATOS']);
    const conceptLeft=valueHeader?valueHeader.x+(valueHeader.width||0)+5:conceptHeader?.x-5;
    if(!dateHeader || !conceptHeader || !balanceHeader || (!amountHeader&&(!debitHeader||!creditHeader)))invalid('UNSUPPORTED_PDF');
    metadata.push(items.filter(item=>item.y>dateHeader.y+4).map(item=>item.text).join(' '));
    const dates=items.map((item,itemIndex)=>({...item,itemIndex,date:bankDate(item.text)}))
      .filter(item=>item.date && item.x<Math.min(dateHeader.x+40,conceptHeader.x-5) && item.y<dateHeader.y-4);
    let monetaryRows=0;
    const closeRight = (item,target) => Math.abs((item.x+(item.width||0))-(target.x+(target.width||0)));
    for(const [i,anchor] of dates.entries()){
      const block=items.slice(anchor.itemIndex,dates[i+1]?.itemIndex??items.length);
      const amounts=items.filter(item=>Math.abs(item.y-anchor.y)<3 && item.x>=conceptHeader.x && money(item.text)!==null);
      const balanceItem=amounts.filter(item=>closeRight(item,balanceHeader)<30).sort((a,b)=>closeRight(a,balanceHeader)-closeRight(b,balanceHeader))[0];
      if(!balanceItem)invalid('MISSING_COLUMNS');
      const others=amounts.filter(item=>item!==balanceItem);
      let movement;
      if(amountHeader){
        if(others.length!==1)invalid('MISSING_COLUMNS');
        movement=money(others[0].text);
      }else{
        let debit=0n,credit=0n;
        for(const item of others){if(closeRight(item,debitHeader)<closeRight(item,creditHeader))debit+=money(item.text);else credit+=money(item.text);}
        movement=credit-debit;
      }
      if(movement===0n)invalid('ZERO_MOVEMENT');
      const valueItem=block.find(item=>item.x>dateHeader.x+40&&item.x<conceptHeader.x&&bankDate(item.text,anchor.date.slice(0,4)));
      let valueDate=valueItem?bankDate(valueItem.text,anchor.date.slice(0,4)):anchor.date;
      // Short value dates close to New Year can belong to the adjacent year.
      if(valueItem && /^\d{2}-\d{2}$/.test(valueItem.text) && Math.abs(new Date(valueDate)-new Date(anchor.date))>180*86400000){
        const y=Number(anchor.date.slice(0,4))+(valueDate>anchor.date?-1:1);valueDate=bankDate(valueItem.text,String(y));
      }
      const amountX = amountHeader?.x ?? Math.min(debitHeader.x,creditHeader.x);
      const concept=block.filter(item=>item.x>=conceptLeft&&item.x<amountX-20 && !amounts.includes(item) && !/^(Firefox|https?:\/\/)/i.test(item.text))
        .sort((a,b)=>(extraHeader?(a.x>=extraHeader.x?1:0)-(b.x>=extraHeader.x?1:0):0)||b.y-a.y||a.x-b.x).map(item=>item.text).join(' ').slice(0,1000);
      if(!concept)invalid('MISSING_COLUMNS');
      rows.push({page:page.page??index+1,date:anchor.date,value_date:valueDate,concept,amount:decimal(movement),balance:decimal(money(balanceItem.text))});monetaryRows++;
    }
    const amountX=amountHeader?.x??Math.min(debitHeader.x,creditHeader.x);
    const tableBalances=items.filter(item=>item.y<dateHeader.y-4&&item.x>amountX&&money(item.text)!==null&&closeRight(item,balanceHeader)<30);
    if(!monetaryRows || tableBalances.length!==monetaryRows)invalid('MISSING_COLUMNS');
  }
  checkCurrency(metadata.join(' '));
  return validateBankRows(rows,{bank:detectBank(metadata.join(' ')),pages:pages.length,format:'pdf',mime:'application/pdf'});
}
export async function extractBankPdf(buffer) {
  const task=getDocument({data:Uint8Array.from(buffer),isEvalSupported:false,useSystemFonts:true,verbosity:0});
  try{
    const pdf=await task.promise;if(pdf.numPages>100)invalid('TOO_MANY_PAGES');
    const pages=[];for(let number=1;number<=pdf.numPages;number++){
      const page=await pdf.getPage(number),content=await page.getTextContent();
      pages.push({page:number,items:content.items.filter(item=>item.str?.trim()).map(item=>({text:item.str,x:item.transform[4],y:item.transform[5],width:item.width}))});
    }
    if(!pages.some(page=>page.items.length))invalid('SCANNED_PDF');
    return parseBankPages(pages);
  }catch(error){if(error.message?.startsWith('BANK_STATEMENT_'))throw error;invalid('INVALID_PDF');}
  finally{await task.destroy();}
}
function csvRows(text, delimiter) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else invalid('INVALID_CSV');}
    else if(c===delimiter&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(cell=>cell.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
    if(rows.length>10030)invalid('NO_MOVEMENTS');
  }
  if(quoted)invalid('INVALID_CSV');row.push(cell);if(row.some(cell=>cell.trim()))rows.push(row);return rows;
}
export function parseBankCsv(buffer) {
  let text;
  try{text=new TextDecoder(buffer[0]===255&&buffer[1]===254?'utf-16le':'utf-8',{fatal:true}).decode(buffer);}
  catch{text=new TextDecoder('windows-1252').decode(buffer);}
  const aliases={date:['FECHA','DATA','FECHAOPERACION','FOPERACION','FECHACONTABLE'],value:['FECHAVALOR','DATAVALOR','FVALOR'],concept:['CONCEPTO','CONCEPTE','DESCRIPCION','DESCRIPCIO','MOVIMIENTO'],amount:['IMPORTE','IMPORT','CANTIDAD'],balance:['SALDO','SALDOCONTABLE'],debit:['DEBE','CARGO','CARGOS'],credit:['HABER','ABONO','ABONOS'],extra:['MASDATOS','MESDADES','DETALLE'],iban:['IBAN','CUENTA','COMPTE'],currency:['MONEDA','DIVISA','CURRENCY']};
  for(const delimiter of [';','\t',',']){
    let table;try{table=csvRows(text.replace(/^\uFEFF/,''),delimiter);}catch{continue;}
    const headerIndex=table.slice(0,30).findIndex(row=>row.some(cell=>aliases.date.includes(normalizeBankText(cell)))&&row.some(cell=>aliases.balance.includes(normalizeBankText(cell))));
    if(headerIndex<0)continue;
    const header=table[headerIndex].map(normalizeBankText),columns=Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,header.findIndex(cell=>names.includes(cell))]));
    checkCurrency(table.slice(0,headerIndex).flat().join(' '));
    if(columns.concept<0||columns.amount<0&&(columns.debit<0||columns.credit<0))invalid('UNSUPPORTED_CSV');
    const rows=[],ibans=[];
    for(const record of table.slice(headerIndex+1)){
      if(record.length!==header.length)invalid('INVALID_CSV');
      if(columns.currency>=0&&!['EUR','€'].includes(record[columns.currency].trim().toUpperCase()))invalid('UNSUPPORTED_CURRENCY');
      const movementDate=bankDate(record[columns.date]),balance=money(record[columns.balance]);
      const credit=columns.credit>=0?money(record[columns.credit]||'0,00'):0n,debit=columns.debit>=0?money(record[columns.debit]||'0,00'):0n;
      const movement=columns.amount>=0?money(record[columns.amount]):credit===null||debit===null?null:credit-debit;
      if(!movementDate||balance===null||movement===null||movement===0n)invalid('INVALID_CSV');
      const valueDate=columns.value>=0?bankDate(record[columns.value]):movementDate;if(!valueDate)invalid('INVALID_CSV');
      const concept=[record[columns.concept],columns.extra>=0?record[columns.extra]:''].filter(Boolean).join(' ').slice(0,1000);if(!concept.trim())invalid('INVALID_CSV');
      if(columns.iban>=0)ibans.push(record[columns.iban]);
      rows.push({page:1,date:movementDate,value_date:valueDate,concept,amount:decimal(movement),balance:decimal(balance)});
    }
    return validateBankRows(rows,{bank:detectBank(table.slice(0,headerIndex).flat().join(' ')+' '+ibans.join(' ')),pages:1,format:'csv',mime:'text/csv'});
  }
  invalid('UNSUPPORTED_CSV');
}
