<script setup>
import {computed,onBeforeUnmount,ref} from 'vue';
import {purchaseApi,purchaseError,uploadPurchase} from '../services/purchases.js';
const props=defineProps({disabled:Boolean}),emit=defineEmits(['draft','busy']);
const busy=ref(false),error=ref(''),job=ref(null),filename=ref(''),duplicate=ref(false);
const forceOcr=ref(true);
const reconnecting=ref(false);
const selectedProposal=ref(null);
const proposals=computed(()=>job.value?.status==='done'&&Array.isArray(job.value.result?.proposals)?job.value.result.proposals:[]);
let file=null,requestId='',requestForceOcr=false,disposed=false,waitTimer,finishWait;
const controller=new AbortController();
const retryLabel=computed(()=>!job.value?'Tornar a pujar':job.value.status==='error'?'Reintentar reconeixement':job.value.status==='done'?'Obrir proposta':'Tornar a comprovar');
const canRetry=computed(()=>!!error.value&&!!file&&!busy.value&&!props.disabled);
function pause(){return new Promise(resolve=>{finishWait=resolve;waitTimer=setTimeout(()=>{finishWait=null;resolve();},1500);});}
async function complete(){
 const deadline=Date.now()+240000;let failures=0;
 while(!disposed&&['queued','running'].includes(job.value.status)){
  if(Date.now()>deadline)throw {code:'PURCHASE_OCR_PENDING'};
  await pause();if(disposed)return;
  try{const result=await purchaseApi('/ocr/'+job.value.id);if(disposed)return;job.value=result;failures=0;reconnecting.value=false;}
  catch(cause){if(disposed)return;if(!['NETWORK_ERROR','SERVICE_UNAVAILABLE'].includes(cause.code)||++failures>=3)throw cause;reconnecting.value=true;}
 }
 if(disposed)return;
 if(job.value.status==='error')throw {code:job.value.error_code||'PURCHASE_OCR_FAILED'};
 if(job.value.status!=='done'||!Number.isSafeInteger(job.value.purchase_invoice_id)||job.value.purchase_invoice_id<1)throw {code:'PURCHASE_INVALID_RESPONSE'};
 if(proposals.value.length>1&&!selectedProposal.value)return;
 const draft=await purchaseApi('/invoices/'+(selectedProposal.value||job.value.purchase_invoice_id));if(disposed)return;
 emit('draft',draft);file=null;
}
async function run(start){
 if(busy.value||props.disabled||disposed)return;
 busy.value=true;error.value='';reconnecting.value=false;emit('busy',true);
 try{const result=await start();if(disposed)return;job.value=result;duplicate.value ||=result.possible_duplicate===true;await complete();}
 catch(cause){if(!disposed)error.value=purchaseError(cause);}
 finally{if(!disposed){busy.value=false;emit('busy',false);}}
}
async function choose(event){
 const selected=event.target.files?.[0];event.target.value='';if(!selected||busy.value||props.disabled)return;
 error.value='';job.value=null;selectedProposal.value=null;duplicate.value=false;file=null;filename.value=selected.name;
 if(!selected.size||selected.size>10*1024*1024||! /\.(pdf|jpe?g|png)$/i.test(selected.name)){error.value=purchaseError({code:'PURCHASE_INVALID_FILE'});return;}
 file=selected;requestId=crypto.randomUUID();requestForceOcr=forceOcr.value;
 await run(()=>uploadPurchase(file,requestId,{signal:controller.signal,forceOcr:requestForceOcr}));
}
async function retry(){
 if(!canRetry.value)return;
 await run(()=>!job.value?uploadPurchase(file,requestId,{signal:controller.signal,forceOcr:requestForceOcr}):job.value.status==='error'?purchaseApi('/ocr/'+job.value.id+'/retry',{method:'POST'}):Promise.resolve(job.value));
}
async function openProposal(proposal){if(!Number.isSafeInteger(proposal.id)||proposal.id<1)return;selectedProposal.value=proposal.id;await run(()=>Promise.resolve(job.value));}
onBeforeUnmount(()=>{disposed=true;controller.abort();clearTimeout(waitTimer);finishWait?.();emit('busy',false);});
</script>
<template>
 <section class="panel purchase-upload">
  <label>Reconèixer factura PDF, JPG o PNG · màxim 10 MB<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" :disabled="busy||disabled" @change="choose"></label>
  <label><span><input v-model="forceOcr" type="checkbox" :disabled="busy||disabled"> Llegir també amb Tesseract OCR</span></label>
  <p>La lectura es fa localment. Amb Tesseract activat també es llegeix la imatge dels PDF amb text i es comparen les dades. Cap factura es comptabilitza sense la teva revisió.</p>
  <p v-if="busy" role="status">{{ reconnecting?'Reprenent la connexió amb el servidor…':job?.status==='running'?'Llegint el document…':job?.status==='done'?'Obrint la proposta…':'Preparant el reconeixement…' }}</p>
  <p v-if="duplicate" class="notice">Aquest document ja s’havia pujat. Es reutilitza el treball existent.</p>
  <section v-if="proposals.length>1" aria-label="Factures reconegudes"><p>S’han reconegut {{ proposals.length }} factures. Cada proposta té les seves línies i imports; revisa-les per separat.</p><button v-for="proposal in proposals" :key="proposal.id" type="button" class="button" :disabled="busy||disabled" @click="openProposal(proposal)">Obrir proposta {{ proposal.reference||proposal.id }}</button></section>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <button v-if="canRetry" type="button" class="button" @click="retry">{{ retryLabel }}</button>
  <p v-if="error&&filename" class="muted">{{ filename }}</p>
 </section>
</template>
<style scoped>.purchase-upload{padding:20px;margin:20px 0}.purchase-upload p{font-size:13px;line-height:1.6}.purchase-upload label{display:grid;gap:7px;margin:12px 0}</style>
