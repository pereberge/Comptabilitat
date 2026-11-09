const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
const unique = values => [...new Set(values)]
const one = values => { const all=unique(values); return all.length===1?all[0]:undefined }
const amount = value => {
  let s=value.replace(/\s/g,'')
  if(s.includes(',')&&s.includes('.')) s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'')
  else if(s.includes(','))s=s.replace(',','.')
  if(!/^-?\d+\.\d{2}$/.test(s))return undefined
  return s
}
const date = value => {
  const m=value.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if(!m)return undefined
  const iso=m[1].length===4?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:`${m[3].length===2?'20'+m[3]:m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return !Number.isNaN(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:undefined
}
export function parseLocalInvoice(text,context={}) {
  const rawLines=normalized(String(text||'')).split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  const lines=rawLines.map((line,index)=>/^(?:(?:numero|num\.?|n[.º°o]*)\s*(?:de\s+)?factura|factura|data|fecha|data factura|fecha factura|venciment|vencimiento|base imposable|base imponible|total(?:\s+(?:factura|eur))?)\s*[:#]?$/i.test(line)&&rawLines[index+1]?`${line} ${rawLines[index+1]}`:line)
  const draft={supplier:{},taxBreakdown:[],withholdings:[],lines:[]}, warnings=['Lectura local sense IA. Revisa totes les dades amb el PDF; els camps no identificats queden buits.']
  const numbers=unique(lines.flatMap(line=>[...line.matchAll(/(?:\b(?:numero|num\.?|n[º°o.]?)\s*(?:de\s+)?factura|\bfactura\s*(?:n[º°o.]?|numero|num\.?)?)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9/_.\-]{0,59})\s*$/gi)].map(m=>m[1])).filter(n=>/\d/.test(n)&&!/^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/.test(n)))
  const reminder=/recordatori|recordatorio|reminder|reclamacio[n]? de pagament|reclamacion de pago/i.test(normalized(context.subject||''))
  const delivery=lines.some(line=>/^(albara[n]?|delivery note|nota de entrega)\b/i.test(line))
  const invoice=lines.some(line=>/\bfactura\b|\binvoice\b/i.test(line))
  if(numbers.length>1) {
    warnings.push('Hi ha diversos números de factura. Separa o revisa manualment els documents abans d’introduir imports.')
    return {classification:'unknown',receptionType:reminder?'payment_reminder':'unknown',warnings,draft,documentTitle:null}
  }
  if(numbers.length===1)draft.invoiceNumber=numbers[0]
  const labelled=(pattern,convert)=>one(lines.flatMap(line=>{const m=line.match(pattern);const value=m&&convert(m[1]);return value?[value]:[]}))
  const invoiceDate=labelled(/^(?:data|fecha|date)(?:\s+(?:de\s+)?(?:factura|emissio[n]?|emision))?\s*[:\-]?\s*(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4})\s*$/i,date)
  const dueDate=labelled(/^(?:venciment|vencimiento|data de venciment|fecha de vencimiento|due date)\s*[:\-]?\s*(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4})\s*$/i,date)
  if(invoiceDate)draft.invoiceDate=invoiceDate
  if(dueDate)draft.dueDate=dueDate
  const money='(-?[0-9][0-9., ]*[.,][0-9]{2})'
  const total=labelled(new RegExp('^(?:total(?:\\s+(?:factura|a pagar|eur|euros))?|import total|importe total)\\s*[:=]?\\s*'+money+'\\s*(?:€|EUR|euros)?$','i'),amount)
  if(total)draft.total=total
  const name=one(String(text||'').split(/\r?\n/).map(line=>line.match(/^\s*(?:prove[iï]dor|proveedor|emissor|emisor|supplier)\s*:\s*(.{2,200})$/i)?.[1]?.trim()).filter(Boolean))
  if(name)draft.supplier.name=name
  // Never treat the customer's unlabelled NIF as the supplier's identity.
  const taxId=labelled(/^(?:NIF|CIF|VAT)\s+(?:del?\s+)?(?:proveidor|proveedor|emissor|emisor|supplier)\s*:\s*([A-Z0-9\-]{5,32})\s*$/i,v=>v.toUpperCase())
  if(taxId)draft.supplier.taxId=taxId
  if(/\bEUR\b|€/i.test(text))draft.currency='EUR'
  const base=labelled(new RegExp('^(?:base imposable|base imponible|base taxable|taxable base)\\s*[:=]?\\s*'+money+'\\s*(?:€|EUR)?$','i'),amount)
  const taxRows=lines.map(line=>line.match(new RegExp('^(?:IVA|VAT)\\s*[:]?\\s*([0-9]{1,2}(?:[.,][0-9]{1,2})?)\\s*%\\s*[:=]?\\s*'+money+'\\s*(?:€|EUR)?$','i'))).filter(Boolean)
  if(base&&taxRows.length===1) {
    const taxAmount=amount(taxRows[0][2]),rate=taxRows[0][1].replace(',','.')
    if(taxAmount)draft.taxBreakdown=[{taxType:'vat',taxableBase:base,taxRate:rate,taxAmount}]
  }
  if(!draft.taxBreakdown.length)warnings.push('No s’ha pogut identificar un desglossament fiscal únic. Introdueix les bases i els impostos manualment.')
  return {classification:delivery?'delivery_note':invoice?'invoice':'unknown',documentTitle:delivery?'Albarà':invoice?'Factura':null,receptionType:reminder?'payment_reminder':'unknown',warnings,draft}
}
