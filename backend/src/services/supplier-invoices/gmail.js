import {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {HttpError} from '../../middleware/errors.js';
import {date,id} from '../validation.js';
import {createSupplierInvoiceService} from './service.js';

const states=new Map(),scope='https://www.googleapis.com/auth/gmail.readonly';
const fail=(code,status=400)=>{throw new HttpError(status,code);};
const digest=value=>createHash('sha256').update(value).digest('hex');
function settings(){
 const clientId=process.env.GMAIL_CLIENT_ID,clientSecret=process.env.GMAIL_CLIENT_SECRET,redirectUri=process.env.GMAIL_REDIRECT_URI;
 if(!clientId||!clientSecret||!redirectUri)fail('GMAIL_NOT_CONFIGURED',503);
 const url=new URL(redirectUri);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))fail('GMAIL_NOT_CONFIGURED',503);
 return {clientId,clientSecret,redirectUri};
}
export function protectGmail(value,identity,decrypt=false){
 const secret=process.env.GMAIL_ENCRYPTION_KEY;
 const key=/^[a-f0-9]{64}$/i.test(secret||'')?Buffer.from(secret,'hex'):Buffer.from(secret||'','base64');
 if(key.length!==32)fail('GMAIL_ENCRYPTION_KEY_INVALID',503);
 try{
  if(decrypt){const data=Buffer.from(value,'base64url');const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAAD(Buffer.from(identity));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString();}
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(identity));const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
 }catch{fail('GMAIL_TOKEN_INVALID',503);}
}
export async function googleRequest(url,options={},transport=fetch){
 let response;try{response=await transport(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{fail('GMAIL_NETWORK_ERROR',503);}
 const body=await response.json().catch(()=>({}));
 if(!response.ok){const error=new HttpError(503,body.error==='invalid_grant'||response.status===401?'GMAIL_REAUTHORIZE':'GMAIL_HTTP_'+response.status);error.retryAfter=response.headers.get('retry-after');throw error;}
 return body;
}
export function pdfParts(payload,result=[]){if(payload?.filename&&(/\.pdf$/i.test(payload.filename)||payload.mimeType==='application/pdf'))result.push(payload);for(const part of payload?.parts||[])pdfParts(part,result);return result;}
export function gmailQuery(start){return 'has:attachment filename:pdf after:'+Math.floor(new Date(date(start)+'T00:00:00Z').getTime()/1000);}
export function createSupplierGmailService(pool,companyId,{actor='local',transport=fetch}={}){
 const request=(url,options)=>googleRequest(url,options,transport),identity=mailboxId=>companyId+':'+mailboxId;
 const inbox=createSupplierInvoiceService(pool,companyId,{actor});
 async function mailbox(mailboxId){const [[row]]=await pool.execute('SELECT * FROM supplier_gmail_mailboxes WHERE company_id=? AND id=?',[companyId,id(mailboxId)]);if(!row)fail('GMAIL_MAILBOX_NOT_FOUND',404);return row;}
 const token=(s,fields)=>request('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:s.clientId,client_secret:s.clientSecret,...fields})});
 async function event(mailboxId,action){await pool.execute('INSERT INTO integration_events(request_id,company_id,actor,action,detail) VALUES (?,?,?,?,?)',[randomUUID(),companyId,actor,action,JSON.stringify({mailbox_id:mailboxId})]);}
 return {
  async list(){const [rows]=await pool.execute('SELECT id,email,start_date,encrypted_token IS NOT NULL AS connected,last_sync_at,last_error,next_sync_at FROM supplier_gmail_mailboxes WHERE company_id=? ORDER BY id',[companyId]);return rows;},
  async save(body){const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('INVALID_COMPANY_EMAIL');const start=date(body.startDate);await pool.execute('INSERT INTO supplier_gmail_mailboxes(company_id,email,start_date) VALUES (?,?,?) ON DUPLICATE KEY UPDATE start_date=VALUES(start_date)',[companyId,email,start]);await event(null,'gmail_configured');return this.list();},
  async authorize(mailboxId){const m=await mailbox(mailboxId),s=settings(),state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
   // A short-lived, single-use state also binds the current company and actor.
   for(const [key,value] of states)if(value.expires<Date.now())states.delete(key);
   states.set(digest(state),{companyId,mailboxId:m.id,actor,verifier,expires:Date.now()+600000});
   const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [key,value] of Object.entries({client_id:s.clientId,redirect_uri:s.redirectUri,response_type:'code',scope,access_type:'offline',prompt:'consent',state,login_hint:m.email,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);
   return {url:url.toString()};
  },
  async complete(body){if(typeof body?.state!=='string'||typeof body.code!=='string'||body.code.length>4096)fail('GMAIL_STATE_INVALID');const key=digest(body.state),state=states.get(key);if(!state||state.companyId!==companyId||state.actor!==actor||state.expires<Date.now())fail('GMAIL_STATE_INVALID');states.delete(key);
   const m=await mailbox(state.mailboxId),s=settings(),grant=await token(s,{grant_type:'authorization_code',code:body.code,redirect_uri:s.redirectUri,code_verifier:state.verifier});
   if(!grant.refresh_token||!String(grant.scope||'').split(' ').includes(scope))fail('GMAIL_REAUTHORIZE');
   const profile=await request('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+grant.access_token}});if(profile.emailAddress?.toLowerCase()!==m.email)fail('GMAIL_ACCOUNT_MISMATCH');
   await pool.execute('UPDATE supplier_gmail_mailboxes SET encrypted_token=?,last_error=NULL,next_sync_at=NULL WHERE company_id=? AND id=?',[protectGmail(grant.refresh_token,identity(m.id)),companyId,m.id]);await event(m.id,'gmail_authorized');return {connected:true};
  },
  async disconnect(mailboxId){const m=await mailbox(mailboxId);const [result]=await pool.execute('UPDATE supplier_gmail_mailboxes SET encrypted_token=NULL WHERE company_id=? AND id=? AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP())',[companyId,m.id]);if(!result.affectedRows)fail('GMAIL_BUSY',409);await event(m.id,'gmail_disconnected');return {connected:false};},
  async sync(mailboxId,exerciseId){
   const m=await mailbox(mailboxId);if(!m.encrypted_token)fail('GMAIL_REAUTHORIZE',409);id(exerciseId);const lease=randomUUID();
   const [claimed]=await pool.execute('UPDATE supplier_gmail_mailboxes SET lease_id=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE company_id=? AND id=? AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP()) AND (next_sync_at IS NULL OR next_sync_at<=UTC_TIMESTAMP())',[lease,companyId,m.id]);if(!claimed.affectedRows)fail('GMAIL_BUSY',409);
   let imported=0,duplicates=0,errors=0;
   try{
    const s=settings(),grant=await token(s,{grant_type:'refresh_token',refresh_token:protectGmail(m.encrypted_token,identity(m.id),true)});
    const client=async(path,params={})=>{const url=new URL('https://gmail.googleapis.com/gmail/v1/users/me/'+path);for(const [key,value]of Object.entries(params))if(value)url.searchParams.set(key,value);return request(url,{headers:{Authorization:'Bearer '+grant.access_token}});};
    let pageToken;
    do{
     const page=await client('messages',{q:gmailQuery(m.start_date),maxResults:'25',pageToken});
     for(const item of page.messages||[]){
      const [renewed]=await pool.execute('UPDATE supplier_gmail_mailboxes SET lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE company_id=? AND id=? AND lease_id=? AND lease_until>UTC_TIMESTAMP()',[companyId,m.id,lease]);if(!renewed.affectedRows)fail('GMAIL_LEASE_LOST',503);
      const mail=await client('messages/'+encodeURIComponent(item.id),{format:'full'});
      for(const part of pdfParts(mail.payload)){
       const partId=String(part.partId||'0');
       const [[seen]]=await pool.execute('SELECT message_id FROM gmail_imports WHERE company_id=? AND mailbox=? AND message_id=? AND part_id=?',[companyId,m.email,item.id,partId]);if(seen){duplicates++;continue;}
       try{
        if(Number(part.body?.size)>10*1024*1024)fail('INVOICE_PDF_TOO_LARGE');
        const attachment=part.body?.attachmentId?await client('messages/'+encodeURIComponent(item.id)+'/attachments/'+encodeURIComponent(part.body.attachmentId)):part.body;
        const bytes=Buffer.from(attachment?.data||'','base64url'),subject=mail.payload?.headers?.find(h=>h.name.toLowerCase()==='subject')?.value||'';
        const result=await inbox.import(bytes,exerciseId,part.filename,{source:'gmail',subject});
        await pool.execute('INSERT IGNORE INTO gmail_imports(company_id,mailbox,message_id,part_id,source_sha256) VALUES (?,?,?,?,?)',[companyId,m.email,item.id,partId,createHash('sha256').update(bytes).digest('hex')]);result.replayed?duplicates++:imported++;
       }catch(error){errors++;await pool.execute('INSERT INTO supplier_invoice_import_errors(company_id,mailbox_id,source_id,error_code) VALUES (?,?,?,?)',[companyId,m.id,(item.id+':'+partId).slice(0,255),error.code||'IMPORT_FAILED']);if(error.code?.startsWith('GMAIL_'))throw error;}
      }
     }
     pageToken=page.nextPageToken;
    }while(pageToken);
    await pool.execute('UPDATE supplier_gmail_mailboxes SET last_sync_at=UTC_TIMESTAMP(),last_error=?,next_sync_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE company_id=? AND id=? AND lease_id=?',[errors?'GMAIL_ATTACHMENT_ERRORS':null,companyId,m.id,lease]);await event(m.id,'gmail_synced');return {imported,duplicates,errors};
   }catch(error){
    const seconds=Math.max(300,Math.min(86400,Number(error.retryAfter)||300));
    await pool.execute('UPDATE supplier_gmail_mailboxes SET last_error=?,next_sync_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE company_id=? AND id=? AND lease_id=?',[error.code||'GMAIL_SYNC_FAILED',seconds,companyId,m.id,lease]);throw error;
   }finally{await pool.execute('UPDATE supplier_gmail_mailboxes SET lease_id=NULL,lease_until=NULL WHERE company_id=? AND id=? AND lease_id=?',[companyId,m.id,lease]);}
  },
 };
}
