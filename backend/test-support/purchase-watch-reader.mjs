import {readPurchaseDocument} from '../src/services/purchase-document-reader.js';
import {invoicePdf} from './invoice-fixture.js';
console.log('READER_PID '+process.pid);
try{
 const result=await readPurchaseDocument(invoicePdf('WATCH TEST SL','WATCH-001'),{forceOcr:process.argv.includes('--force-ocr')});
 process.stdout.write('READER_RESULT '+JSON.stringify({engine:result.engine,reference:result.reference,verified:result.totals_verified})+'\n',()=>process.exit(0));
}catch(error){process.stderr.write('READER_ERROR '+(error.code||error.message)+'\n',()=>process.exit(1));}
