import {cents,decimal} from '../../../shared/money.js';
import {sepaText} from '../../../shared/sepa.js';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const tag=(name,value)=>'<'+name+'>'+escape(value)+'</'+name+'>';
const name=value=>tag('Nm',sepaText(value));
const account=iban=>'<Id>'+tag('IBAN',iban)+'</Id>';
const agent=bic=>'<FinInstnId>'+(bic?tag('BICFI',bic):'<Othr><Id>NOTPROVIDED</Id></Othr>')+'</FinInstnId>';
const address=party=>party.country&&party.address?'<PstlAdr>'+(party.city?tag('TwnNm',sepaText(party.city,35)):'')+tag('Ctry',party.country)+tag('AdrLine',sepaText(party.address,70))+'</PstlAdr>':'';
const identification=value=>'<Id><OrgId><Othr>'+tag('Id',value)+'</Othr></OrgId></Id>';
export function buildSepaXml(snapshot,messageId,createdAt=new Date().toISOString()){
 const {direction,bank,company,items,requested_date}=snapshot,collection=direction==='issued';
 const namespace='urn:iso:std:iso:20022:tech:xsd:'+(collection?'pain.008.001.08':'pain.001.001.09');
 const total=decimal(items.reduce((sum,row)=>sum+cents(row.amount),0n));
 const initiating=name(company.name)+(bank.initiator_id?identification(bank.initiator_id):'');
 const header='<GrpHdr>'+tag('MsgId',messageId)+tag('CreDtTm',createdAt)+tag('NbOfTxs',items.length)+tag('CtrlSum',total)+'<InitgPty>'+initiating+'</InitgPty></GrpHdr>';
 const grouped=new Map();
 for(const row of items){const key=(row.execution_date||requested_date)+'|'+(collection?row.mandate.sequence:'');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
 const groups=[...grouped.values()];
 const blocks=groups.map((rows,index)=>{
  const sum=decimal(rows.reduce((value,row)=>value+cents(row.amount),0n)),paymentId=messageId.slice(0,30)+'-'+(index+1),executionDate=rows[0].execution_date||requested_date;
  const common=tag('PmtInfId',paymentId)+tag('PmtMtd',collection?'DD':'TRF')+tag('BtchBookg','true')+tag('NbOfTxs',rows.length)+tag('CtrlSum',sum)+'<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl>'+(collection?'<LclInstrm><Cd>CORE</Cd></LclInstrm>'+tag('SeqTp',rows[0].mandate.sequence):'')+'</PmtTpInf>';
  const own=collection?tag('ReqdColltnDt',executionDate)+'<Cdtr>'+name(company.name)+address(company)+'</Cdtr><CdtrAcct>'+account(bank.iban)+'</CdtrAcct><CdtrAgt>'+agent(bank.bic)+'</CdtrAgt><ChrgBr>SLEV</ChrgBr><CdtrSchmeId><Id><PrvtId><Othr>'+tag('Id',bank.creditor_id)+'<SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>':'<ReqdExctnDt>'+tag('Dt',executionDate)+'</ReqdExctnDt><Dbtr>'+name(company.name)+address(company)+'</Dbtr><DbtrAcct>'+account(bank.iban)+'</DbtrAcct><DbtrAgt>'+agent(bank.bic)+'</DbtrAgt><ChrgBr>SLEV</ChrgBr>';
  const transactions=rows.map(row=>{
   const identifier='<PmtId>'+tag('EndToEndId',('R'+row.receipt_id+'-'+messageId.slice(1,21)).slice(0,35))+'</PmtId>',amount='<InstdAmt Ccy="EUR">'+row.amount+'</InstdAmt>',remittance='<RmtInf>'+tag('Ustrd',sepaText('Factura '+row.reference+' - Recibo '+row.receipt_id,140))+'</RmtInf>';
   if(collection)return '<DrctDbtTxInf>'+identifier+amount+'<DrctDbtTx><MndtRltdInf>'+tag('MndtId',row.mandate.reference)+tag('DtOfSgntr',row.mandate.signed_on)+'<AmdmntInd>false</AmdmntInd></MndtRltdInf></DrctDbtTx><DbtrAgt>'+agent('')+'</DbtrAgt><Dbtr>'+name(row.name)+address(row)+'</Dbtr><DbtrAcct>'+account(row.iban)+'</DbtrAcct>'+remittance+'</DrctDbtTxInf>';
   return '<CdtTrfTxInf>'+identifier+'<Amt>'+amount+'</Amt><Cdtr>'+name(row.name)+address(row)+'</Cdtr><CdtrAcct>'+account(row.iban)+'</CdtrAcct>'+remittance+'</CdtTrfTxInf>';
  }).join('');
  return '<PmtInf>'+common+own+transactions+'</PmtInf>';
 }).join('');
 const root=collection?'CstmrDrctDbtInitn':'CstmrCdtTrfInitn';
 return '<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="'+namespace+'"><'+root+'>'+header+blocks+'</'+root+'></Document>\n';
}
