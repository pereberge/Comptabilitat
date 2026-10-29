import {computed,ref} from 'vue';
import {accessError} from '../services/access-errors.js';
const session=ref(null),loading=ref(true),error=ref(''),revision=ref(0);
const user=computed(()=>session.value?.user||null),users=computed(()=>session.value?.users||[]);let refreshPromise,generation=0;
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('contabilitat-access'):null;
function apply(data){if(JSON.stringify(data.user)!==JSON.stringify(session.value?.user))revision.value++;session.value=data;error.value='';}
export function invalidateAccess(){generation++;apply({user:null,users:[],master_setup_required:session.value?.master_setup_required||false});loading.value=false;}
async function request(path,options={}){
 const response=await fetch('/api/access'+path,{...options,headers:{'Content-Type':'application/json'},body:options.body===undefined?undefined:JSON.stringify(options.body)});
 const data=await response.json();if(!response.ok){const cause=Object.assign(new Error(data.error?.code||'SERVICE_UNAVAILABLE'),{code:data.error?.code||'SERVICE_UNAVAILABLE'});if(cause.code==='ACCESS_LOGIN_REQUIRED')invalidateAccess();throw cause;}return data;
}
export function refreshAccess(){
 if(refreshPromise)return refreshPromise;
 const ticket=generation;refreshPromise=(async()=>{try{const data=await request('/session');if(ticket===generation)apply(data);}catch(cause){if(ticket===generation){invalidateAccess();error.value=accessError(cause)||'No s’ha pogut comprovar la sessió.';}}finally{loading.value=false;refreshPromise=null;}})();return refreshPromise;
}
if(channel)channel.onmessage=()=>refreshAccess();
if(typeof window!=='undefined'){window.addEventListener('focus',()=>refreshAccess());setInterval(()=>{if(document.visibilityState==='visible')void refreshAccess();},60000);}
async function changed(path,body){generation++;const data=await request(path,{method:'POST',body});generation++;apply(data);loading.value=false;channel?.postMessage('changed');return data;}
async function admin(path,method,body){const data=await request(path,{method,body});await refreshAccess();channel?.postMessage('changed');return data;}
export function useAccess(){return {session,user,users,loading,error,revision,refresh:refreshAccess,
 can:permission=>user.value?.permissions[permission]===true,
 login:(username,password)=>changed('/login',{username,password}),
 setupMaster:password=>changed('/setup-master',{password}),
 logout:()=>changed('/logout'),
 listUsers:()=>request('/users'),
 createUser:body=>admin('/users','POST',body),
 updateUser:(key,body)=>admin('/users/'+key,'PATCH',body),
 deleteUser:(key,version)=>admin('/users/'+key,'DELETE',{version}),
 changePassword:(current_password,new_password)=>changed('/password',{current_password,new_password}),
 };}
