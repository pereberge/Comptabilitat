<script setup>
import {onBeforeUnmount,ref} from 'vue';
import FormDialog from './FormDialog.vue';
import {previewBankStatement,analyzeBankStatement,saveBankStatement,discardBankStatement,bankImportError} from '../services/bank-import.js';
const props=defineProps({exercise:Object,company:Object}),emit=defineEmits(['close','imported']);
const preview=ref(null),account=ref(''),bankName=ref(''),busy=ref(false),error=ref(''),status=ref('');let token='',prepared=false,disposed=false;
function discard(){const previous=token;token='';if(previous)void discardBankStatement(previous);}
onBeforeUnmount(()=>{disposed=true;discard();});
async function openList(){
 if(!prepared){status.value='Buscant el saldo de partida i preparant els moviments…';await analyzeBankStatement({token,...(account.value==='new'?{create_account:true,bank_name:bankName.value}:{account_id:account.value}),replace_current:true});prepared=true;}
 status.value='Obrint el llistat…';const result=await saveBankStatement(token);token='';if(!disposed)emit('imported',result);
}
async function choose(event){
 const file=event.target.files?.[0];if(!file)return;discard();preview.value=null;prepared=false;error.value='';busy.value=true;status.value='Llegint l’extracte…';
 try{
  if(!file.size||file.size>5*1024*1024)throw{code:'BANK_STATEMENT_TOO_LARGE'};
  const result=await previewBankStatement(file,props.exercise.id);token=result.token;if(disposed){discard();return;}preview.value=result;
  if(result.detected_account_id){account.value=String(result.detected_account_id);await openList();}
  else if(result.accounts.length===1&&!result.bank.detected){account.value=String(result.accounts[0].id);await openList();}
  else if(!result.accounts.length&&result.bank.detected){account.value='new';await openList();}
  else account.value=result.accounts.length?'':'new';
 }catch(cause){if(cause.code==='RECONCILIATION_LEDGER_CHANGED')prepared=false;error.value=bankImportError(cause);}finally{busy.value=false;}
}
async function continueList(){if(busy.value||!account.value)return;busy.value=true;error.value='';try{await openList();}catch(cause){if(cause.code==='RECONCILIATION_LEDGER_CHANGED')prepared=false;error.value=bankImportError(cause);}finally{busy.value=false;}}
</script>
<template><FormDialog title="Pujar extracte" class="bank-import-dialog" :busy="busy" @close="emit('close')"><p><strong>{{ company.name }}</strong> · {{ exercise.name }}</p><p class="muted">Tria el PDF o CSV del banc. S’obrirà directament el llistat amb el saldo de partida: marge de 0,03 € i fins a 10 dies abans o després.</p><label>Extracte bancari · màxim 5 MB<input type="file" name="bank_statement" accept=".pdf,.csv,application/pdf,text/csv" :disabled="busy" @change="choose"></label><p v-if="busy" class="notice" role="status">{{ status }}</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><form v-if="preview&&!busy" @submit.prevent="continueList"><label>A quin banc correspon?<select v-model="account" name="bank_account" required @change="prepared=false"><option disabled value="">Tria el banc</option><option v-for="row in preview.accounts" :key="row.id" :value="String(row.id)">{{ row.code }} · {{ row.description }}</option><option value="new">Afegir un banc nou</option></select></label><label v-if="account==='new'&&!preview.bank.detected">Nom del banc<input v-model="bankName" name="bank_name" maxlength="120" required></label><button class="button primary" :disabled="!account">Obrir llistat</button></form></FormDialog></template>
<style scoped>.bank-import-dialog>p,.bank-import-dialog>label,.bank-import-dialog form{display:block;margin:18px 0;line-height:1.6}.bank-import-dialog form>label{display:block;margin-bottom:18px}.bank-import-dialog input,.bank-import-dialog select{width:100%}</style>
