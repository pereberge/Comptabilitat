<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import FormDialog from './FormDialog.vue';
import {api} from '../services/accounting.js';
import {companyHeaders} from '../services/company.js';
import {downloadFile,fileSize} from '../services/documentation.js';
import {reportDate as date} from '../services/report-format.js';
import {t,bankStatementArchiveError} from '../locales/bank-statements.js';
const props=defineProps({rows:{type:Array,default:()=>[]},activeId:Number,busy:Boolean,canDelete:Boolean});
const emit=defineEmits(['deleted']);
const search=ref(''),page=ref(1),working=ref(false),error=ref(''),selected=ref(null),removing=ref(null),url=ref(''),text=ref('');
let controller,disposed=false;
const normalize=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('ca');
const shownDate=value=>value?date(value):'—';
const filtered=computed(()=>props.rows.filter(row=>normalize([row.bank_name,row.account_code,row.source_name,row.archive_name,row.statement_date,shownDate(row.statement_date),row.period_from,row.period_to].join(' ')).includes(normalize(search.value))));
const pages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/10))),visible=computed(()=>filtered.value.slice((page.value-1)*10,page.value*10));
const disabled=computed(()=>props.busy||working.value);
watch(search,()=>{page.value=1;});watch(pages,value=>{if(page.value>value)page.value=value;});
function close(){controller?.abort();if(url.value)URL.revokeObjectURL(url.value);url.value='';text.value='';selected.value=null;}
onBeforeUnmount(()=>{disposed=true;close();});
async function consult(row){
 if(disabled.value)return;error.value='';close();selected.value=row;working.value=true;controller=new AbortController();
 const timer=setTimeout(()=>controller?.abort(),30000);
 try{
  const response=await fetch('/api/bank-reconciliations/'+row.id+'/source',{headers:companyHeaders(),signal:controller.signal});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw{code:data.error?.code};}
  const bytes=new Uint8Array(await response.arrayBuffer());if(disposed)return;
  if(row.source_mime==='application/pdf')url.value=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  else{try{text.value=new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':'utf-8',{fatal:true}).decode(bytes);}catch{text.value=new TextDecoder('windows-1252').decode(bytes);}}
 }catch(cause){if(!disposed){error.value=bankStatementArchiveError(cause);close();}}
 finally{clearTimeout(timer);if(!disposed)working.value=false;}
}
async function download(row){if(disabled.value)return;error.value='';working.value=true;try{await downloadFile('/bank-reconciliations/'+row.id+'/source',row.archive_name);}catch(cause){if(!disposed)error.value=bankStatementArchiveError(cause);}finally{if(!disposed)working.value=false;}}
async function remove(){
 if(disabled.value||!props.canDelete||!removing.value)return;working.value=true;error.value='';
 try{const result=await api('/bank-reconciliations/'+removing.value.id,{method:'DELETE',body:{version:removing.value.version}});if(!disposed){removing.value=null;emit('deleted',result);}}
 catch(cause){if(!disposed)error.value=bankStatementArchiveError(cause);}finally{if(!disposed)working.value=false;}
}
</script>
<template>
 <section class="panel bank-statement-archive" aria-labelledby="bank-statement-archive-title">
  <header><h2 id="bank-statement-archive-title">{{ t.title }} <span class="muted">({{ rows.length }})</span></h2><p class="muted">{{ t.help }}</p><p class="muted">{{ t.dateHelp }}</p></header>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <label v-if="rows.length" class="bank-archive-search">{{ t.search }}<input v-model="search" type="search" name="bank_archive_search"></label>
  <p v-if="!rows.length" class="muted bank-archive-empty">{{ t.empty }}</p><p v-else-if="!filtered.length" class="muted bank-archive-empty">{{ t.noMatches }}</p>
  <div v-else class="table-wrap"><table><thead><tr><th>{{ t.bank }}</th><th>{{ t.date }}</th><th>{{ t.period }}</th><th>{{ t.file }}</th><th>{{ t.actions }}</th></tr></thead><tbody>
   <tr v-for="row in visible" :key="row.id" :data-archive-id="row.id"><td :data-label="t.bank"><strong>{{ row.bank_name }}</strong><small>{{ row.account_code }}</small><span v-if="row.id===activeId" class="badge badge-open">{{ t.current }}</span></td><td :data-label="t.date" :title="row.date_origin==='document'?t.documentDate:t.periodDate">{{ shownDate(row.statement_date) }}</td><td :data-label="t.period">{{ shownDate(row.period_from) }} — {{ shownDate(row.period_to) }}</td><td :data-label="t.file" class="bank-archive-name">{{ row.archive_name }}<small>{{ t.original }}: {{ row.source_name }} · {{ fileSize(row.source_size||0) }}</small></td><td :data-label="t.actions"><div class="actions"><button type="button" class="button" :disabled="disabled" @click="consult(row)">{{ t.consult }}</button><button type="button" class="button" :disabled="disabled" @click="download(row)">{{ t.download }}</button><button type="button" class="button bank-archive-delete" :disabled="disabled||!canDelete" @click="error='';removing=row">{{ t.remove }}</button></div></td></tr>
  </tbody></table></div>
  <nav v-if="pages>1" class="bank-archive-pagination" :aria-label="t.pagination"><button type="button" class="button" :disabled="page===1" @click="page--">{{ t.previous }}</button><span>{{ t.page }} {{ page }} / {{ pages }}</span><button type="button" class="button" :disabled="page===pages" @click="page++">{{ t.next }}</button></nav>
  <FormDialog v-if="selected" class="bank-archive-preview" :title="selected.archive_name" :busy="working" @close="close"><p>{{ selected.bank_name }} · {{ shownDate(selected.statement_date) }}</p><p v-if="working" role="status">{{ t.loading }}</p><iframe v-else-if="url" :src="url" :title="selected.archive_name" referrerpolicy="no-referrer"></iframe><pre v-else>{{ text }}</pre><button type="button" class="button" :disabled="disabled" @click="download(selected)">{{ t.download }}</button></FormDialog>
  <FormDialog v-if="removing" class="bank-archive-confirm" :title="t.removeTitle" :busy="working" @close="removing=null"><p><strong>{{ removing.archive_name }}</strong></p><p>{{ t.removeHelp }}</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><div class="actions"><button type="button" class="button bank-archive-delete" :disabled="disabled" @click="remove">{{ t.confirmRemove }}</button><button type="button" class="button" :disabled="disabled" @click="removing=null">{{ t.cancel }}</button></div></FormDialog>
 </section>
</template>
<style scoped>
.bank-statement-archive{margin:26px 0;padding:20px;min-width:0}.bank-statement-archive h2{font-size:20px;margin:0 0 10px}.bank-statement-archive header p{font-size:13px;line-height:1.6;margin:6px 0}.bank-archive-search{display:block;max-width:520px;margin:18px 0;font-size:13px}.bank-archive-search input{width:100%;margin-top:7px}.bank-statement-archive td{vertical-align:top}.bank-statement-archive td small{display:block;color:#65748a;margin-top:7px;font-size:11px}.bank-statement-archive .badge{margin-top:7px}.bank-archive-name{overflow-wrap:anywhere;max-width:330px}.bank-statement-archive .actions{flex-wrap:wrap;gap:7px}.bank-statement-archive .actions .button{font-size:12px;white-space:normal}.bank-archive-delete{color:#9f2f29;border-color:#d9aaa6}.bank-archive-pagination{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:18px}.bank-archive-empty{padding:18px 0}.form-dialog.bank-archive-preview{width:min(1050px,95vw)}.bank-archive-preview>p,.bank-archive-confirm>p{margin:18px 0;line-height:1.6;overflow-wrap:anywhere}.bank-archive-preview iframe{display:block;width:100%;height:65vh;border:1px solid #dce3ec;margin:18px 0}.bank-archive-preview pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:60vh;overflow:auto;background:#f6f8fa;border:1px solid #dce3ec;padding:16px;margin:18px 0;font-size:13px}.bank-archive-confirm .actions{margin-top:22px}.bank-archive-preview :deep(.dialog-heading h2){overflow-wrap:anywhere}@media(max-width:850px){.bank-statement-archive{padding:16px}.bank-statement-archive table,.bank-statement-archive tbody,.bank-statement-archive tr,.bank-statement-archive td{display:block;width:100%}.bank-statement-archive thead{display:none}.bank-statement-archive tr{border:1px solid #e0e6ed;border-radius:8px;padding:12px;margin:14px 0}.bank-statement-archive td{border:0;padding:8px 0;max-width:none}.bank-statement-archive td::before{content:attr(data-label);display:block;font-size:11px;color:#65748a;font-weight:600;margin-bottom:5px}.bank-statement-archive .table-wrap{overflow:visible}.bank-archive-preview iframe{height:60vh}}
</style>
