import https from 'node:https';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createSecureContext} from 'node:tls';
import {VF_ENDPOINT} from './verifactu-format.js';
import {HttpError} from '../middleware/errors.js';
export function credentialsForCompany(companyId){
 const directory=process.env.VERIFACTU_CERT_DIR;if(!directory)return null;
 try{const pfx=readFileSync(resolve(directory,String(companyId)+'.pfx')),passphrase=process.env['VERIFACTU_PFX_PASSWORD_'+companyId]||'';createSecureContext({pfx,passphrase,minVersion:'TLSv1.2'});return {pfx,passphrase};}
 catch(error){if(error.code==='ENOENT')return null;throw new HttpError(400,'VERIFACTU_CERTIFICATE_INVALID');}
}
export function sendToAeat(xml,credentials){
 return new Promise((resolve,reject)=>{
  const request=https.request(VF_ENDPOINT,{method:'POST',...credentials,minVersion:'TLSv1.2',rejectUnauthorized:true,headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'""','Content-Length':Buffer.byteLength(xml)}},response=>{
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){response.destroy();reject(new HttpError(502,'VERIFACTU_RESPONSE'));}else chunks.push(chunk);});response.on('error',()=>reject(new HttpError(502,'VERIFACTU_NETWORK')));response.on('end',()=>{const body=Buffer.concat(chunks).toString('utf8');if(response.statusCode!==200)reject(new HttpError(502,'VERIFACTU_HTTP'));else resolve(body);});
  });
  request.setTimeout(30000,()=>request.destroy());request.on('error',()=>reject(new HttpError(502,'VERIFACTU_NETWORK')));request.end(xml);
 });
}