const empty=()=>({company_id:'',exercise_id:'',route:''});
const validId=value=>typeof value==='string'&&/^[1-9]\d{0,9}$/.test(value);
export function workspacePath(value){
 return typeof value==='string'&&value.length<=8000&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\u0000-\u001f]/.test(value)?value:'';
}
export function createWorkspaceStore(storage=()=>globalThis.localStorage){
 let user='',state=empty();
 const key=()=> 'contabilitat:workspace:'+encodeURIComponent(user);
 function activate(userKey){
  user=typeof userKey==='string'?userKey:'';state=empty();
  if(user)try{
   const saved=JSON.parse(storage().getItem(key()));
   if(saved&&saved.version===1)state={company_id:validId(saved.company_id)?saved.company_id:'',exercise_id:validId(saved.exercise_id)?saved.exercise_id:'',route:workspacePath(saved.route)};
  }catch{}
  return read();
 }
 function read(){return {...state};}
 function remember(patch){
  if(!user)return;
  state={...state,...patch};
  state={company_id:validId(state.company_id)?state.company_id:'',exercise_id:validId(state.exercise_id)?state.exercise_id:'',route:workspacePath(state.route)};
  try{storage().setItem(key(),JSON.stringify({version:1,...state}));}catch{}
 }
 return {activate,read,remember};
}
export const workspace=createWorkspaceStore();
