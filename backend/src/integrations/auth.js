import {createHash,timingSafeEqual} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
export const receivedInvoiceScope='invoices:received:write';
export function integrationClients(value='[]'){
 let clients;try{clients=JSON.parse(value);}catch{throw new Error('INTEGRATION_CONFIG_INVALID');}
 if(!Array.isArray(clients)||clients.length>100)throw new Error('INTEGRATION_CONFIG_INVALID');
 const ids=new Set(),hashes=new Set();
 return clients.map(client=>{
  if(!client||Object.keys(client).some(key=>!['clientId','sourceSystem','tokenSha256','scopes','enabled'].includes(key))||! /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(client.clientId||'')||! /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(client.sourceSystem||'')||! /^[a-f0-9]{64}$/.test(client.tokenSha256||'')||!Array.isArray(client.scopes)||client.scopes.some(scope=>scope!==receivedInvoiceScope)||ids.has(client.clientId)||hashes.has(client.tokenSha256)||client.enabled!==undefined&&typeof client.enabled!=='boolean')throw new Error('INTEGRATION_CONFIG_INVALID');
  ids.add(client.clientId);hashes.add(client.tokenSha256);return {...client,enabled:client.enabled!==false};
 });
}
export function authenticateIntegration(req,clients,{production=false}={}){
 if(production&&!req.secure)throw new HttpError(426,'INTEGRATION_HTTPS_REQUIRED');
 if(!clients.length)throw new HttpError(503,'INTEGRATION_NOT_CONFIGURED');
 const match=/^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(req.get('Authorization')||'');
 if(!match)throw new HttpError(401,'INTEGRATION_UNAUTHORIZED');
 const actual=createHash('sha256').update(match[1]).digest();let authenticated;
 for(const client of clients)if(timingSafeEqual(actual,Buffer.from(client.tokenSha256,'hex'))&&client.enabled)authenticated=client;
 if(!authenticated)throw new HttpError(401,'INTEGRATION_UNAUTHORIZED');
 if(!authenticated.scopes.includes(receivedInvoiceScope))throw new HttpError(403,'INTEGRATION_SCOPE_REQUIRED');
 return authenticated;
}
