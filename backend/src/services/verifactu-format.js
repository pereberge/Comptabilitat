import {createHash} from 'node:crypto';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {cents,decimal} from '../../../shared/money.js';
import {date,fail} from './validation.js';
export const VF_VERSION='0.1.0';
export const VF_ENDPOINT='https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';
export const VF_NS='https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/';
export const digest=value=>createHash('sha256').update(value,'utf8').digest('hex').toUpperCase();
export const fiscalDate=value=>date(value).split('-').reverse().join('-');
export const normalizeNif=value=>String(value||'').replace(/\s/g,'').toUpperCase();
export function validNif(value){
 const nif=normalizeNif(value),letters='TRWAGMYFPDXBNJZSQVHLCKE';
 if(/^\d{8}[A-Z]$/.test(nif))return letters[Number(nif.slice(0,8))%23]===nif[8];
 if(/^[XYZ]\d{7}[A-Z]$/.test(nif))return letters[Number('XYZ'.indexOf(nif[0])+nif.slice(1,8))%23]===nif[8];
 if(!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif))return false;
 let sum=0;for(let i=1;i<=7;i++){const n=Number(nif[i])*(i%2?2:1);sum+=Math.floor(n/10)+n%10;}
 const control=(10-sum%10)%10;
 return /^[ABEH]/.test(nif)?nif[8]===String(control):/^[NPQRSW]/.test(nif)?nif[8]==='JABCDEFGHI'[control]:[String(control),'JABCDEFGHI'[control]].includes(nif[8]);
}
export function madridTimestamp(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(now).map(part=>[part.type,part.value]));
 return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute+':'+parts.second+parts.timeZoneName.replace('GMT','');
}
export function hashInput(payload){
 const keys=payload.kind==='alta'?['IDEmisorFactura','NumSerieFactura','FechaExpedicionFactura','TipoFactura','CuotaTotal','ImporteTotal','Huella','FechaHoraHusoGenRegistro']:['IDEmisorFacturaAnulada','NumSerieFacturaAnulada','FechaExpedicionFacturaAnulada','Huella','FechaHoraHusoGenRegistro'];
 return keys.map(key=>key+'='+String(payload[key]??'').trim()).join('&');
}
export function qrUrl(payload){return 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?'+new URLSearchParams({nif:payload.IDEmisorFactura,numserie:payload.NumSerieFactura,fecha:payload.FechaExpedicionFactura,importe:payload.ImporteTotal});}
export function xmlText(value){const text=String(value);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text))fail('VERIFACTU_INVALID_TEXT');return text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));}
const tag=(key,value)=>'<sf:'+key+'>'+xmlText(value)+'</sf:'+key+'>';
export function recordXml(p){
 const cancelled=p.kind==='anulacion',suffix=cancelled?'Anulada':'';
 const key='<sf:IDFactura>'+tag('IDEmisorFactura'+suffix,p['IDEmisorFactura'+suffix])+tag('NumSerieFactura'+suffix,p['NumSerieFactura'+suffix])+tag('FechaExpedicionFactura'+suffix,p['FechaExpedicionFactura'+suffix])+'</sf:IDFactura>';
 const previous=p.previous?'<sf:RegistroAnterior>'+tag('IDEmisorFactura',p.previous.nif)+tag('NumSerieFactura',p.previous.reference)+tag('FechaExpedicionFactura',p.previous.date)+tag('Huella',p.Huella)+'</sf:RegistroAnterior>':tag('PrimerRegistro','S');
 const system=p.system,software='<sf:SistemaInformatico>'+tag('NombreRazon',system.producer_name)+tag('NIF',system.producer_nif)+tag('NombreSistemaInformatico',system.software_name)+tag('IdSistemaInformatico',system.software_id)+tag('Version',system.version)+tag('NumeroInstalacion',system.installation_id)+tag('TipoUsoPosibleSoloVerifactu','S')+tag('TipoUsoPosibleMultiOT','S')+tag('IndicadorMultiplesOT','S')+'</sf:SistemaInformatico>';
 let content=tag('IDVersion','1.0')+key;
 if(!cancelled){
  content+=tag('NombreRazonEmisor',p.issuer_name)+tag('TipoFactura','F1')+tag('DescripcionOperacion',p.description)+'<sf:Destinatarios><sf:IDDestinatario>'+tag('NombreRazon',p.party_name)+tag('NIF',p.party_nif)+'</sf:IDDestinatario></sf:Destinatarios><sf:Desglose>';
  for(const tax of p.taxes)content+='<sf:DetalleDesglose>'+tag('Impuesto','01')+tag('ClaveRegimen','01')+tag('CalificacionOperacion','S1')+tag('TipoImpositivo',tax.rate)+tag('BaseImponibleOimporteNoSujeto',tax.base)+tag('CuotaRepercutida',tax.tax)+'</sf:DetalleDesglose>';
  content+='</sf:Desglose>'+tag('CuotaTotal',p.CuotaTotal)+tag('ImporteTotal',p.ImporteTotal);
 }
 content+='<sf:Encadenamiento>'+previous+'</sf:Encadenamiento>'+software+tag('FechaHoraHusoGenRegistro',p.FechaHoraHusoGenRegistro)+tag('TipoHuella','01')+tag('Huella',digest(hashInput(p)));
 const type=cancelled?'RegistroAnulacion':'RegistroAlta';return '<sf:'+type+'>'+content+'</sf:'+type+'>';
}
export function envelope(p){return '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sfLR="'+VF_NS+'SuministroLR.xsd" xmlns:sf="'+VF_NS+'SuministroInformacion.xsd"><soapenv:Header/><soapenv:Body><sfLR:RegFactuSistemaFacturacion><sfLR:Cabecera><sf:ObligadoEmision>'+tag('NombreRazon',p.issuer_name)+tag('NIF',p.issuer_nif)+'</sf:ObligadoEmision></sfLR:Cabecera><sfLR:RegistroFactura>'+recordXml(p)+'</sfLR:RegistroFactura></sfLR:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>';}
export function invoicePayload(invoice,settings,previous=null,kind='alta',now=new Date()){
 const issuer=invoice.issuer_snapshot;
 if(!validNif(issuer.tax_id)||!issuer.name?.trim()||issuer.name.length>120)fail('VERIFACTU_ISSUER');
 if(!validNif(settings.producer_nif)||!settings.producer_name?.trim())fail('VERIFACTU_PRODUCER');
 if(!/^[\x20-\x7e]{1,60}$/.test(invoice.reference))fail('VERIFACTU_REFERENCE');
 const previousPayload=previous?.payload,prior=previous?{nif:previousPayload.issuer_nif,reference:previousPayload.NumSerieFactura||previousPayload.NumSerieFacturaAnulada,date:previousPayload.FechaExpedicionFactura||previousPayload.FechaExpedicionFacturaAnulada}:null;
 const p={kind,issuer_name:issuer.name,issuer_nif:normalizeNif(issuer.tax_id),system:{producer_name:settings.producer_name,producer_nif:normalizeNif(settings.producer_nif),software_name:settings.software_name,software_id:settings.software_id,version:settings.version,installation_id:settings.installation_id},previous:prior,Huella:previous?.hash||'',FechaHoraHusoGenRegistro:madridTimestamp(now)};
 const suffix=kind==='anulacion'?'Anulada':'';p['IDEmisorFactura'+suffix]=p.issuer_nif;p['NumSerieFactura'+suffix]=invoice.reference;p['FechaExpedicionFactura'+suffix]=fiscalDate(invoice.invoice_date);
 if(kind==='alta'){
  if(!validNif(invoice.party_tax_id)||!invoice.party_name?.trim()||invoice.party_name.length>120)fail('VERIFACTU_RECIPIENT');
  const taxes=new Map();let base=0n,tax=0n;
  for(const line of invoice.lines){
   const rate=decimal(cents(line.tax_rate));if(!['4.00','10.00','21.00'].includes(rate))fail('VERIFACTU_UNSUPPORTED_TAX');
   const group=taxes.get(rate)||{base:0n,tax:0n};group.base+=cents(line.base);group.tax+=cents(line.tax_amount);taxes.set(rate,group);base+=cents(line.base);tax+=cents(line.tax_amount);
  }
  if(base!==cents(invoice.base_total)||tax!==cents(invoice.tax_total)||base+tax-cents(invoice.withholding_total)!==cents(invoice.total_amount))fail('VERIFACTU_TOTALS');
  const total=decimal(base+tax);if(!/^\d{1,12}\.\d{2}$/.test(total))fail('VERIFACTU_TOTALS');
  Object.assign(p,{TipoFactura:'F1',CuotaTotal:decimal(tax),ImporteTotal:total,party_name:invoice.party_name,party_nif:normalizeNif(invoice.party_tax_id),description:invoice.lines.map(line=>line.description).join('; ').slice(0,500),taxes:[...taxes].map(([rate,row])=>({rate,base:decimal(row.base),tax:decimal(row.tax)}))});
 }
 envelope(p);return p;
}
export function parseResponse(xml,payload){
 if(typeof xml!=='string'||Buffer.byteLength(xml)>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)fail('VERIFACTU_RESPONSE');
 const document=new XMLParser({removeNSPrefix:true,parseTagValue:false,ignoreAttributes:false,processEntities:true}).parse(xml),body=document.Envelope?.Body;
 if(body?.Fault)fail('VERIFACTU_SOAP_FAULT');
 const response=body?.RespuestaRegFactuSistemaFacturacion;if(!response)fail('VERIFACTU_RESPONSE');
 const lines=Array.isArray(response.RespuestaLinea)?response.RespuestaLinea:[response.RespuestaLinea];if(lines.length!==1||!lines[0])fail('VERIFACTU_RESPONSE');
 const line=lines[0],key=line.IDFactura,suffix=payload.kind==='anulacion'?'Anulada':'';
 if(!key||key.IDEmisorFactura!==payload['IDEmisorFactura'+suffix]||key.NumSerieFactura!==payload['NumSerieFactura'+suffix]||key.FechaExpedicionFactura!==payload['FechaExpedicionFactura'+suffix]||line.Operacion?.TipoOperacion!==(payload.kind==='alta'?'Alta':'Anulacion'))fail('VERIFACTU_RESPONSE');
 const statuses={Correcto:'accepted',AceptadoConErrores:'accepted_with_errors',Incorrecto:'rejected'},status=statuses[line.EstadoRegistro];if(!status)fail('VERIFACTU_RESPONSE');
 if(!['Correcto','ParcialmenteCorrecto','Incorrecto'].includes(response.EstadoEnvio)||status!=='rejected'&&(!response.CSV||response.EstadoEnvio==='Incorrecto'))fail('VERIFACTU_RESPONSE');
 const wait=Number(response.TiempoEsperaEnvio);if(!Number.isSafeInteger(wait)||wait<0||wait>999999)fail('VERIFACTU_RESPONSE');
 return {status,csv:String(response.CSV||'').slice(0,200),error_code:String(line.CodigoErrorRegistro||'').slice(0,30),message:String(line.DescripcionErrorRegistro||'').slice(0,1500),wait_seconds:wait,duplicate:!!line.RegistroDuplicado};
}