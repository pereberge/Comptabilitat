import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {XMLValidator} from 'fast-xml-parser';
import {digest,hashInput,invoicePayload,envelope,qrUrl,validNif,madridTimestamp,parseResponse} from '../src/services/verifactu-format.js';
import {fiscalInvoice,fiscalSettings,fiscalResponse} from '../test-support/verifactu-fixture.js';
const error=code=>cause=>cause.code===code;
test('VERI*FACTU matches the three official AEAT hash vectors in order',()=>{
 const first={kind:'alta',IDEmisorFactura:'89890001K',NumSerieFactura:'12345678/G33',FechaExpedicionFactura:'01-01-2024',TipoFactura:'F1',CuotaTotal:'12.35',ImporteTotal:'123.45',Huella:'',FechaHoraHusoGenRegistro:'2024-01-01T19:20:30+01:00'};
 const h1=digest(hashInput(first));assert.equal(h1,'3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
 const second={...first,NumSerieFactura:'12345679/G34',Huella:h1,FechaHoraHusoGenRegistro:'2024-01-01T19:20:35+01:00'},h2=digest(hashInput(second));assert.equal(h2,'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97');
 assert.equal(digest(hashInput({kind:'anulacion',IDEmisorFacturaAnulada:'89890001K',NumSerieFacturaAnulada:'12345679/G34',FechaExpedicionFacturaAnulada:'01-01-2024',Huella:h2,FechaHoraHusoGenRegistro:'2024-01-01T19:20:40+01:00'})),'177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68');
});
test('VERI*FACTU validates national NIF and Madrid daylight-saving timestamps',()=>{
 for(const nif of ['89890001K','B12345674','12345678Z','X1234567L'])assert.equal(validNif(nif),true,nif);
 for(const nif of ['','B12345675','B11111111','89890001J','ESB12345674','../cert.pfx'])assert.equal(validNif(nif),false,nif);
 assert.equal(madridTimestamp(new Date('2026-07-01T00:00:00Z')),'2026-07-01T02:00:00+02:00');assert.equal(madridTimestamp(new Date('2026-12-01T00:00:00Z')),'2026-12-01T01:00:00+01:00');
});
test('VERI*FACTU fiscal totals and QR retain gross consideration before IRPF and encode special characters',()=>{
 const p=invoicePayload(fiscalInvoice({reference:'A& B/1'}),fiscalSettings);assert.equal(p.ImporteTotal,'121.00');assert.equal(p.CuotaTotal,'21.00');const url=new URL(qrUrl(p));assert.equal(url.hostname,'prewww2.aeat.es');assert.equal(url.searchParams.get('numserie'),'A& B/1');assert.equal(url.searchParams.get('importe'),'121.00');assert.equal([...url.searchParams].length,4);
 const xml=envelope(p);assert.equal(XMLValidator.validate(xml),true);assert.ok(xml.includes('Servicio &lt;prueba&gt; &amp; asesoría'));assert.ok(xml.includes('<sf:PrimerRegistro>S</sf:PrimerRegistro>'));assert.ok(!xml.includes('<sf:TipoRectificativa>'));
 assert.throws(()=>invoicePayload(fiscalInvoice({party_tax_id:''}),fiscalSettings),error('VERIFACTU_RECIPIENT'));
 assert.throws(()=>invoicePayload(fiscalInvoice({lines:[{description:'Unsupported',base:'100.00',tax_rate:'0.00',tax_amount:'0.00'}]}),fiscalSettings),error('VERIFACTU_UNSUPPORTED_TAX'));
 assert.throws(()=>invoicePayload(fiscalInvoice({total_amount:'107.00'}),fiscalSettings),error('VERIFACTU_TOTALS'));
});
test('VERI*FACTU distinguishes accepted, accepted with errors, rejected, duplicate and unknown responses',()=>{
 const p=invoicePayload(fiscalInvoice(),fiscalSettings);
 for(const [status,expected]of [['Correcto','accepted'],['AceptadoConErrores','accepted_with_errors'],['Incorrecto','rejected']])assert.equal(parseResponse(fiscalResponse(p,{status}),p).status,expected);
 const duplicate=parseResponse(fiscalResponse(p,{status:'Incorrecto',duplicate:true}),p);assert.equal(duplicate.status,'rejected');assert.equal(duplicate.duplicate,true);
 for(const xml of [fiscalResponse(p).replace('<r:CSV>CSV-TEST</r:CSV>',''),fiscalResponse(p).replace('<r:EstadoEnvio>Correcto</r:EstadoEnvio>','<r:EstadoEnvio>Incorrecto</r:EstadoEnvio>'),fiscalResponse(p,{key:{reference:'ANOTHER'}}),fiscalResponse(p,{operation:'Anulacion'}),fiscalResponse(p,{status:'Unknown'}),'<!DOCTYPE x><x/>','<html>Not AEAT</html>',fiscalResponse(p).slice(0,-20)])assert.throws(()=>parseResponse(xml,p),error('VERIFACTU_RESPONSE'));
});
test('VERI*FACTU alta and cancellation XML validate offline against official AEAT XSD',{skip:process.platform!=='win32'},()=>{
 const directory=mkdtempSync(join(tmpdir(),'contabilitat-vf-xsd-'));
 try{
  const first=invoicePayload(fiscalInvoice(),fiscalSettings,null,'alta',new Date('2026-10-21T10:00:00Z')),previous={payload:first,hash:digest(hashInput(first))};
  const next=invoicePayload(fiscalInvoice({reference:'TEST/2026-2'}),fiscalSettings,previous,'alta',new Date('2026-10-21T10:00:01Z')),cancel=invoicePayload(fiscalInvoice(),fiscalSettings,{payload:next,hash:digest(hashInput(next))},'anulacion',new Date('2026-10-21T10:00:02Z'));
  for(const [name,payload]of [['alta',first],['alta-next',next],['anulacion',cancel]])writeFileSync(join(directory,name+'.xml'),envelope(payload));
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../test-support/verifactu/validate.ps1',import.meta.url)),'-Directory',directory],{encoding:'utf8',timeout:30000});assert.match(output,/Validated: alta.xml/);assert.match(output,/Validated: anulacion.xml/);
 }finally{for(const name of readdirSync(directory))unlinkSync(join(directory,name));rmdirSync(directory);}
});