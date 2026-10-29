import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {XMLParser} from 'fast-xml-parser';
import {buildSepaXml} from '../src/services/sepa-xml.js';
import {emptySepaMandate,normalizeSepaMandate,isValidCreditorId,sepaIdentifier,sepaText} from '../../shared/sepa.js';
export function sepaFixture(direction='issued'){
 return {direction,requested_date:'2026-12-31',company:{name:'Empresa de prueba',address:'Carrer Major 1',city:'Girona',country:'ES'},bank:{iban:'ES9121000418450200051332',bic:'CAIXESBBXXX',creditor_id:'ES97000B12345674',initiator_id:'B12345674000'},total:'100.01',items:[{receipt_id:12,account_id:7,name:"Pérez & Fills <SL>",reference:'A-303',iban:'DE89370400440532013000',amount:'33.33',mandate:{reference:'MAND-1',signed_on:'2025-01-01',sequence:'RCUR'}},{receipt_id:13,account_id:8,name:'Client dos',reference:'A-304',iban:'FR1420041010050500013M02606',amount:'66.68',mandate:{reference:'MAND-2',signed_on:'2025-01-02',sequence:'OOFF'}}]};
}
test('SEPA profiles validate signed dates, identifiers and creditor MOD97 without inventing mandates',()=>{
 assert.deepEqual(normalizeSepaMandate(emptySepaMandate()),emptySepaMandate());
 assert.throws(()=>normalizeSepaMandate({reference:'REF',signed_on:'2026-02-30'}),/INVALID_SEPA_MANDATE/);
 assert.throws(()=>normalizeSepaMandate({reference:'REF',signed_on:'2026-01-01',sequence:'OTHER'}),/INVALID_SEPA_MANDATE/);
 assert.equal(sepaIdentifier('/REF'),false);assert.equal(sepaIdentifier('REF//1'),false);assert.equal(sepaText('José & Cía <SL>'),'Jose Cia SL');
 assert.equal(isValidCreditorId('DE98ZZZ09999999999'),true);assert.equal(isValidCreditorId('DE98ABC09999999999'),true);assert.equal(isValidCreditorId('DE97ZZZ09999999999'),false);
});
test('SEPA XML keeps exact control totals, dates, mandates and unique transaction identifiers',()=>{
 const parser=new XMLParser({parseTagValue:false}),snapshot=sepaFixture();
 const root=parser.parse(buildSepaXml(snapshot,'M12345678901234567890123456789012')).Document.CstmrDrctDbtInitn;
 assert.equal(root.GrpHdr.CtrlSum,'100.01');assert.equal(root.GrpHdr.NbOfTxs,'2');assert.equal(root.PmtInf.length,2);
 assert.equal(root.PmtInf[0].DrctDbtTxInf.InstdAmt,'33.33');assert.equal(root.PmtInf[0].DrctDbtTxInf.Dbtr.Nm,'Perez Fills SL');assert.equal(root.PmtInf[1].PmtTpInf.SeqTp,'OOFF');
 assert.notEqual(root.PmtInf[0].PmtInfId,root.PmtInf[1].PmtInfId);assert.equal(root.PmtInf[0].ReqdColltnDt,snapshot.requested_date);
 const transfers=parser.parse(buildSepaXml(sepaFixture('received'),'M22345678901234567890123456789012')).Document.CstmrCdtTrfInitn;
 assert.equal(transfers.PmtInf.ReqdExctnDt.Dt,snapshot.requested_date);assert.equal(transfers.PmtInf.CdtTrfTxInf[1].Amt.InstdAmt,'66.68');
});
test('SEPA files group separate receipt execution dates without advancing future installments',()=>{
 for(const direction of ['issued','received']){
  const fixture=sepaFixture(direction);fixture.items.forEach((row,index)=>{row.execution_date=index===0?'2026-12-31':'2027-01-31';row.mandate.sequence='RCUR';});
  const xml=new XMLParser({parseTagValue:false}).parse(buildSepaXml(fixture,'M12345678901234567890123456789012')).Document;
  const root=xml[direction==='issued'?'CstmrDrctDbtInitn':'CstmrCdtTrfInitn'];assert.equal(root.PmtInf.length,2);assert.equal(root.GrpHdr.CtrlSum,'100.01');
  assert.deepEqual(root.PmtInf.map(row=>direction==='issued'?row.ReqdColltnDt:row.ReqdExctnDt.Dt),['2026-12-31','2027-01-31']);
 }
});
test('SEPA collections and transfers validate against published bank XSDs',{skip:process.platform!=='win32'},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'contabilitat-sepa-'));
 try{
  for(const direction of ['issued','received']){
   const fixture=sepaFixture(direction);fixture.bank.creditor_id='DE98ZZZ09999999999';
   fixture.bank.bic='BOFIIE2D'; // The validation fixture imposes BOI's own originating BIC.
   fixture.items.forEach((row,index)=>{row.execution_date=index===0?'2026-12-31':'2027-01-31';});
   await writeFile(join(directory,direction+'.xml'),buildSepaXml(fixture,'M12345678901234567890123456789012'));
   const noBic=sepaFixture(direction);noBic.bank.bic='';noBic.bank.initiator_id='';noBic.bank.creditor_id='DE98ZZZ09999999999';
   await writeFile(join(directory,direction+'-no-bic.xml'),buildSepaXml(noBic,'M22345678901234567890123456789012'));
  }
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../test-support/sepa/validate.ps1',import.meta.url)),'-Directory',directory],{windowsHide:true,encoding:'utf8'});
 }finally{assert.equal(dirname(directory),tmpdir());assert.ok(basename(directory).startsWith('contabilitat-sepa-'));await rm(directory,{recursive:true,force:true});}
});
