import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { ensureAccount } from './account-hierarchy.js';
import { lockCompany } from './subaccounts.js';

const previews=new Map();
const lifetime=15*60*1000;
function extract(buffer) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./pdf-worker.js',import.meta.url),{workerData:buffer,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:192}});
    const timer=setTimeout(()=>finish(new HttpError(400,'PDF_TIMEOUT')),20000);
    let done=false;
    function finish(error,data){if(done)return;done=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(data);}
    worker.once('message',message=>finish(message.error?new HttpError(400,message.error):null,message.data));
    worker.once('error',()=>finish(new HttpError(400,'PDF_INVALID')));
    worker.once('exit',()=>{if(!done)finish(new HttpError(400,'PDF_INVALID'));});
  });
}
export function classifyImport(rows, existing, length, prefixLength) {
  const byCode=new Map(existing.map(row=>[row.code,row])), seen=new Map();
  return rows.map(row=>{
    const result={...row,parent_code:row.code.slice(0,prefixLength),suffix:row.code.slice(prefixLength),status:'new',reason:''};
    if(!/^[1-9]\d*$/.test(row.code)||row.code.length!==length||!row.description||row.description.length>200) return {...result,status:'invalid',reason:'INVALID_ROW'};
    if(seen.has(row.code))return {...result,status:seen.get(row.code)===row.description?'duplicate':'invalid',reason:'DUPLICATE_PDF'};
    seen.set(row.code,row.description);
    const current=byCode.get(row.code);
    if(current) return {...result,status:'existing',reason:current.description===row.description?'ALREADY_EXISTS':'DIFFERENT_DESCRIPTION',existing_description:current.description};
    for(let i=1;i<=prefixLength;i++) {
      const parent=byCode.get(row.code.slice(0,i));
      if(parent&&parent.kind!=='account')return {...result,status:'invalid',reason:'INVALID_PARENT'};
    }
    return result;
  });
}
export function createAccountImportService(pool,companyId) {
  return {
    async preview(buffer,prefix) {
      if(!Buffer.isBuffer(buffer)||buffer.length>5*1024*1024)throw new HttpError(400,'PDF_INVALID');
      for(const [key,value] of previews)if(value.expires<Date.now())previews.delete(key);
      if(previews.size>=20)throw new HttpError(429,'PDF_BUSY');
      const [[company]]=await pool.execute('SELECT id,name,subaccount_length FROM companies WHERE id=?',[companyId]);
      if(!company)throw new HttpError(404,'COMPANY_NOT_FOUND');
      if(!/^[3-9]$|^1[0-9]$/.test(String(prefix))||Number(prefix)>=company.subaccount_length)throw new HttpError(400,'PDF_INVALID_PREFIX');
      const source=await extract(buffer);
      const [existing]=await pool.execute('SELECT code,description,kind FROM accounts WHERE company_id=?',[companyId]);
      const rows=classifyImport(source.rows,existing,company.subaccount_length,Number(prefix));
      const parents=new Set();
      const codes=new Set(existing.map(a=>a.code));
      for(const row of rows.filter(r=>r.status==='new'))for(let i=1;i<=Number(prefix);i++){const code=row.code.slice(0,i);if(!codes.has(code))parents.add(code);}
      const token=randomUUID();
      previews.set(token,{companyId,rows:source.rows,length:company.subaccount_length,prefix:Number(prefix),expires:Date.now()+lifetime});
      return {token,company,source_company:source.source_company,pages:source.pages,rows,parents:[...parents].sort(),expires_in_seconds:lifetime/1000};
    },
    async commit(token) {
      const preview=typeof token==='string'?previews.get(token):null;
      if(!preview||preview.companyId!==companyId||preview.expires<Date.now())throw new HttpError(409,'PDF_PREVIEW_EXPIRED');
      const db=await pool.getConnection();
      try {
        await db.beginTransaction();
        const company=await lockCompany(db,companyId);
        if(preview.result){await db.commit();return preview.result;}
        if(company.subaccount_length!==preview.length)throw new HttpError(409,'PDF_SETTINGS_CHANGED');
        const [existing]=await db.execute('SELECT code,description,kind FROM accounts WHERE company_id=?',[companyId]);
        const rows=classifyImport(preview.rows,existing,preview.length,preview.prefix);
        if(rows.some(row=>row.status==='invalid'))throw new HttpError(400,'PDF_INVALID_ROWS');
        let imported=0;
        for(const row of rows.filter(row=>row.status==='new')) {
          const parent=await ensureAccount(db,companyId,row.parent_code);
          await db.execute("INSERT INTO accounts(company_id,code,description,kind,parent_id) VALUES (?,?,?,'subaccount',?)",[companyId,row.code,row.description,parent.id]);
          imported++;
        }
        await db.commit();
        preview.result={imported,skipped:rows.length-imported};
        return preview.result;
      }catch(error){await db.rollback();throw error;}finally{db.release();}
    },
  };
}
