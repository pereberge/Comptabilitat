import {HttpError} from '../../middleware/errors.js';
const fail=(message,status=422)=>new HttpError(status,'SUPPLIER_TEMPLATE_UNAVAILABLE');

const clean = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const compact = value => clean(value).toUpperCase().replace(/[^A-Z0-9]/g,'')
const get = (obj,path) => path.split('.').reduce((v,k)=>v?.[k],obj)
const set = (obj,path,value) => { const parts=path.split('.');let target=obj;for(const [i,key] of parts.slice(0,-1).entries())target=target[key]??=(/^\d+$/.test(parts[i+1])?[]:{});target[parts.at(-1)]=value }
const scalarFields = {invoiceNumber:'number',invoiceDate:'date',dueDate:'date',total:'money'}
const patterns = {number:'[A-Za-z0-9][A-Za-z0-9/_.\\-]{0,59}',date:'[0-9]{1,4}[/.\\-][0-9]{1,2}[/.\\-][0-9]{2,4}',money:'-?[0-9][0-9., \\t]{0,35}',rate:'[0-9]{1,2}(?:[.,][0-9]{1,2})?'}
function parse(value,type) {
  value=String(value).trim()
  if(type==='number')return /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,59}$/.test(value)?value:null
  if(type==='date') {
    const m=value.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
    if(!m)return null
    const iso=m[1].length===4?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:`${m[3].length===2?'20'+m[3]:m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    return !Number.isNaN(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:null
  }
  let number=value.replace(/\s/g,'')
  if(number.includes(',')&&number.includes('.'))number=number.lastIndexOf(',')>number.lastIndexOf('.')?number.replace(/\./g,'').replace(',','.'):number.replace(/,/g,'')
  else number=number.replace(',','.')
  if(!/^-?\d+(?:\.\d{1,2})?$/.test(number))return null
  const negative=number.startsWith('-'),[integer,fraction='']=number.replace(/^-/,'').split('.')
  return (negative?'-':'')+(integer.replace(/^0+(?=\d)/,'')||'0')+'.'+fraction.padEnd(2,'0')
}
function variants(value,type) {
  if(type==='date') {
    const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if(!m)return []
    return [value,...['/','-','.'].flatMap(s=>[`${m[3]}${s}${m[2]}${s}${m[1]}`,`${Number(m[3])}${s}${Number(m[2])}${s}${m[1]}`,`${m[3]}${s}${m[2]}${s}${m[1].slice(-2)}`])]
  }
  if(type==='money'||type==='rate') {
    const n=parse(value,type)
    if(n===null)return []
    const [integer,fraction]=n.split('.'),grouped=separator=>integer.replace(/\B(?=(\d{3})+(?!\d))/g,separator)
    return [...new Set([String(value),n,n.replace('.',','),grouped('.')+','+fraction,grouped(',')+'.'+fraction,...(type==='rate'?[n.replace(/\.00$/,'')]:[])])]
  }
  return [String(value)]
}
function fieldList(draft) {
  const fields=Object.entries(scalarFields).map(([path,type])=>({path,type,value:get(draft,path)}))
  for(const [index,tax] of (draft.taxBreakdown||[]).slice(0,8).entries())for(const key of ['taxableBase','taxRate','taxAmount'])fields.push({path:`taxBreakdown.${index}.${key}`,type:key==='taxRate'?'rate':'money',value:tax[key]})
  return fields.filter(f=>f.value!==undefined&&f.value!==null&&f.value!=='')
}
function anchor(text,fields) {
  // Generalize other reviewed values so their next value does not break the label.
  const tokens=[]
  for(const f of fields)for(const variant of variants(f.value,f.type))if(variant)tokens.push({text:clean(variant),type:f.type})
  tokens.sort((a,b)=>b.text.length-a.text.length)
  let result='',position=0
  while(position<text.length) {
    const token=tokens.find(t=>text.startsWith(t.text,position)&&!/[A-Za-z0-9]/.test(text[position-1]||'')&&!/[A-Za-z0-9]/.test(text[position+t.text.length]||''))
    if(token){result+=`(?:${patterns[token.type]})`;position+=token.text.length}
    else if(/[ \t]/.test(text[position])){while(/[ \t]/.test(text[position]||'')&&position<text.length)position++;result+='[ \\t]*'}
    else {result+=escape(text[position]);position++}
  }
  return result
}
function readRule(text,rule) {
  const matches=[...text.matchAll(new RegExp(rule.pattern,'gim'))].map(m=>parse(m[1],rule.type)).filter(v=>v!==null)
  const unique=[...new Set(matches)]
  return unique.length===1?unique[0]:null
}
export function supplierMatches(text,supplier) {
  const tax=compact(supplier.taxId)
  // Match a full identity token, not a substring of another fiscal identifier.
  const fiscal=clean(text).toUpperCase().replace(/([A-Z])[- .](?=\d{7,8}\b)/g,'$1')
  return tax.length>=5&&new RegExp(`(?:^|[^A-Z0-9])(?:ES)?${escape(tax)}(?:$|[^A-Z0-9])`,'m').test(fiscal)
}
export function learnSupplierTemplate(text,draft) {
  if(!draft?.supplier?.name||!draft.supplier.taxId)throw fail('Completa el nom i el NIF del proveïdor abans de recordar-ne el format.',422)
  if(typeof draft.supplier.name!=='string'||draft.supplier.name.length>200||typeof draft.supplier.taxId!=='string'||draft.supplier.taxId.length>32||!Array.isArray(draft.taxBreakdown||[])||(draft.taxBreakdown||[]).length>8)throw fail('Les dades del proveïdor o dels impostos no són vàlides per recordar el format.',422)
  if(fieldList(draft).some(f=>!['string','number'].includes(typeof f.value)||String(f.value).length>100))throw fail('Revisa els camps abans de recordar el format.',422)
  if(!supplierMatches(text,draft.supplier))throw fail('No s’ha pogut localitzar el NIF del proveïdor dins del PDF. Cal text llegible per recordar aquest format.',422)
  const source=clean(text),lines=source.split(/\r?\n/).map(s=>s.trim()),fields=fieldList(draft),rules=[]
  for(const f of fields) {
    const candidates=[]
    for(const variant of variants(f.value,f.type))for(let index=0;index<lines.length;index++) {
      const line=lines[index]
      if(line.length>1000)continue
      let at=-1
      while((at=line.indexOf(clean(variant),at+1))!==-1) {
        if(/[A-Za-z0-9]/.test(line[at-1]||'')||/[A-Za-z0-9]/.test(line[at+clean(variant).length]||''))continue
        let prefix=line.slice(0,at),suffix=line.slice(at+clean(variant).length),previous=''
        if(f.type==='rate'&&!/^\s*%/.test(suffix)&&!/(?:tipus|tipo|rate)\s*[:=]?\s*$/i.test(prefix))continue
        if(!/[A-Za-z]/.test(prefix+suffix)&&index>0&&/[A-Za-z]/.test(lines[index-1])&&lines[index-1].length<120)previous=anchor(lines[index-1],fields)+'[ \\t]*\\r?\\n'
        if(!previous&&!/[A-Za-z]/.test(prefix+suffix))continue
        const rule={path:f.path,type:f.type,pattern:'^[ \\t]*'+previous+anchor(prefix,fields)+`(${patterns[f.type]})`+anchor(suffix,fields)+'[ \\t]*$'}
        if(readRule(source,rule)===parse(f.value,f.type))candidates.push(rule)
      }
    }
    // Prefer the line with an explicit field label when values are repeated.
    const label=f.path==='invoiceNumber'?/factura|invoice/i:f.path.toLowerCase().includes('date')?/data|fecha|date|venc/i:f.path==='total'?/total/i:f.path.endsWith('taxableBase')?/base/i:/iva|vat|impost|cuota|quota/i
    candidates.sort((a,b)=>Number(label.test(b.pattern))-Number(label.test(a.pattern)))
    if(candidates.length)rules.push(candidates[0])
  }
  if(!rules.some(r=>Object.hasOwn(scalarFields,r.path)))throw fail('No s’han pogut associar els camps revisats al text del PDF. Aquest format necessita una regla específica.',422)
  const supplier=Object.fromEntries(['name','taxId','address','email'].filter(k=>draft.supplier[k]).map(k=>[k,String(draft.supplier[k])]))
  return {supplier,currency:draft.currency||null,rules,taxTypes:(draft.taxBreakdown||[]).slice(0,8).map(t=>Object.fromEntries(['taxType','exemptionReason'].filter(k=>t[k]!==undefined).map(k=>[k,t[k]]))),fields:rules.map(r=>r.path)}
}
export function applySupplierTemplate(text,template,base) {
  if(!supplierMatches(text,template.supplier))return base
  const source=clean(text),draft=structuredClone(base.draft),matched=[]
  draft.supplier={...template.supplier}
  if(template.currency)draft.currency=template.currency
  // Tax rows are reconstructed from this document, never copied from the example.
  const taxes=[]
  for(const rule of template.rules) {
    const value=readRule(source,rule)
    if(value===null)continue
    if(rule.path.startsWith('taxBreakdown.'))set({taxBreakdown:taxes},rule.path,value)
    else set(draft,rule.path,value)
    matched.push(rule.path)
  }
  if(taxes.length)draft.taxBreakdown=taxes.flatMap((tax,i)=>tax&&tax.taxableBase!==undefined&&tax.taxAmount!==undefined&&tax.taxRate!==undefined?[{...template.taxTypes[i],...tax}]:[])
  return {...base,draft,templateSupplier:template.supplier.name,templateFields:matched,warnings:[...base.warnings,`Format recordat de ${template.supplier.name}. ${matched.length} camps identificats. Revisa les dades abans de validar.`,...(matched.length<template.rules.length?['Alguns camps no coincideixen amb el format recordat i requereixen revisió manual.']:[])]}
}
