import {parseInputDate,displayInputDate} from './date-input.js';
const defaults=()=>({search:'',pending:false,status:'all',order:'date_desc',from:'',to:'',supplier:''});
function normalize(value={}){
 const result=defaults();
 if(typeof value.search==='string')result.search=value.search.slice(0,200);
 if(['all','active','draft','confirmed','cancelled'].includes(value.status))result.status=value.status;
 if(['date_desc','date_asc','reference_asc','reference_desc'].includes(value.order))result.order=value.order;
 result.pending=value.pending===true&&!['draft','cancelled'].includes(result.status);
 for(const key of ['from','to'])if(typeof value[key]==='string'&&value[key]&&parseInputDate(displayInputDate(value[key]))===value[key])result[key]=value[key];
 if(result.from&&result.to&&result.from>result.to){result.from='';result.to='';}
 if(typeof value.supplier==='string'&&(value.supplier==='unassigned'||/^[1-9]\d{0,9}$/.test(value.supplier)))result.supplier=value.supplier;
 return result;
}
export function createPurchaseFilterStore(storage=()=>globalThis.localStorage){
 function key(user,company,kind){return user!=null&&String(user).length>0&&String(user).length<=200&&/^[1-9]\d{0,9}$/.test(String(company))&&['orders','receipts','invoices'].includes(kind)?'contabilitat:purchase-filters:'+encodeURIComponent(String(user))+':'+company+':'+kind:null;}
 return {
  read(user,company,kind){try{const id=key(user,company,kind),saved=id?JSON.parse(storage().getItem(id)):null;return saved?.version===1?normalize(saved.filters):defaults();}catch{return defaults();}},
  write(user,company,kind,filters){try{const id=key(user,company,kind);if(id)storage().setItem(id,JSON.stringify({version:1,filters:normalize(filters)}));}catch{}},
 };
}
export const purchaseFilters=createPurchaseFilterStore();
