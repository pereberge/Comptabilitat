import {computed,ref} from 'vue';
import {accessError} from '../services/access-errors.js';
const session=ref(null),loading=ref(true),error=ref(''),revision=ref(0);
const user=computed(()=>session.value?.user),users=computed(()=>session.value?.users||[]);
let refreshPromise;
async function request(path,options={}){
 const response=await fetch('/api/access'+path,{...options,headers:{'Content-Type':'application/json'},body:options.body===undefined?undefined:JSON.stringify(options.body)});
 const data=await response.json();if(!response.ok){const cause=new Error(data.error?.code||'SERVICE_UNAVAILABLE');cause.code=cause.message;throw cause;}return data;
}
function apply(data){if(JSON.stringify(data.user)!==JSON.stringify(session.value?.user))revision.value++;session.value=data;error.value='';}
export function refreshAccess(){
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{try{apply(await request('/session'));}catch(cause){session.value=null;error.value=accessError(cause)||'No se han podido cargar los permisos. Vuelve a intentarlo.';}finally{loading.value=false;refreshPromise=null;}})();return refreshPromise;
}
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('contabilitat-access'):null;
if(channel)channel.onmessage=()=>refreshAccess();
if(typeof window!=='undefined')window.addEventListener('focus',()=>refreshAccess());
async function changed(path,body){const data=await request(path,{method:'POST',body});apply(data);channel?.postMessage('changed');return data;}
export function useAccess(){return {session,user,users,loading,error,revision,refresh:refreshAccess,
 can:permission=>user.value?.permissions[permission]===true,
 switchUser:(key,password,setup=false)=>changed(setup?'/setup-master':'/switch',setup?{password}:{key,password}),
 listUsers:()=>request('/users'),
 async updateUser(key,body){const data=await request('/users/'+key,{method:'PATCH',body});await refreshAccess();channel?.postMessage('changed');return data;},
 changePassword:(current_password,new_password)=>changed('/password',{current_password,new_password}),
 };}
