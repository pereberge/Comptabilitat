<script setup>
import { computed,onMounted,ref } from 'vue';
import FormDialog from './FormDialog.vue';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { reportMoney as money } from '../services/report-format.js';
import { t,treasuryError } from '../locales/treasury.js';
import {splitInstallments} from '../../../shared/invoice-money.js';
import {cents,decimal} from '../../../shared/money.js';
const props=defineProps({mode:String,receipt:Object,invoice:Object,settlement:Object}),emit=defineEmits(['close','saved']);
const {exercises}=useContext(),busy=ref(false),loading=ref(false),error=ref(''),banks=ref([]);
const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
const sourceDate=props.mode==='reverse'?props.settlement.payment_date:props.mode==='void'?props.invoice.posting_date:props.receipt.invoice_date;
const day=ref(now<sourceDate?sourceDate:now),form=ref({amount:props.receipt?.remaining_amount || '',bank_account_id:'',payment_method:props.receipt?.payment_method || 'transfer',reference:'',notes:['reschedule','split'].includes(props.mode)?props.receipt.notes:'',due_date:props.receipt?.due_date || '',reason:'',request_id:crypto.randomUUID()});
const exercise=computed(()=>exercises.value.find(item=>item.status==='open'&&day.value>=item.start_date&&day.value<=item.end_date));
const needsExercise=computed(()=>['settle','reverse','void'].includes(props.mode));
const count=ref(2),first=ref(props.receipt?.due_date||''),parts=ref([]);
function distribute(){try{parts.value=splitInstallments(props.receipt.remaining_amount,Number(count.value),first.value,1);}catch{parts.value=[];}}
if(props.mode==='split')distribute();
const splitTotal=computed(()=>{try{return decimal(parts.value.reduce((sum,row)=>sum+cents(row.amount),0n));}catch{return null;}});
const validSplit=computed(()=>parts.value.length>=2&&splitTotal.value===props.receipt?.remaining_amount&&parts.value.every(row=>{try{return cents(row.amount)>0n;}catch{return false;}}));
const title=computed(()=>props.mode==='split'?t.splitReceipt:props.mode==='reschedule'?t.reschedule:props.mode==='reverse'?t.reverse:props.mode==='void'?t.voidInvoice:props.receipt.direction==='issued'?t.recordCollection:t.recordPayment);
onMounted(async()=>{if(props.mode!=='settle')return;loading.value=true;try{banks.value=(await api('/accounts?kind=subaccount')).filter(row=>row.code.startsWith('57'));if(banks.value.length===1)form.value.bank_account_id=banks.value[0].id;}catch(cause){error.value=treasuryError(cause);}finally{loading.value=false;}});
async function save(){
 if(busy.value||loading.value||(needsExercise.value&&!exercise.value)||(props.mode==='split'&&!validSplit.value))return;busy.value=true;error.value='';
 try{
  let result;
  if(props.mode==='split')result=await api('/portfolio/receipts/'+props.receipt.id+'/split',{method:'POST',body:{request_id:form.value.request_id,revision:props.receipt.revision,parts:parts.value,payment_method:form.value.payment_method,notes:form.value.notes}});
  else if(props.mode==='reschedule')result=await api('/portfolio/receipts/'+props.receipt.id,{method:'PATCH',body:{revision:props.receipt.revision,due_date:form.value.due_date,payment_method:form.value.payment_method,notes:form.value.notes}});
  else if(props.mode==='settle')result=await api('/portfolio/receipts/'+props.receipt.id+'/settle',{method:'POST',body:{request_id:form.value.request_id,exercise_id:exercise.value.id,payment_date:day.value,amount:form.value.amount,bank_account_id:form.value.bank_account_id,payment_method:form.value.payment_method,reference:form.value.reference,notes:form.value.notes}});
  else result=await api(props.mode==='reverse'?'/portfolio/settlements/'+props.settlement.id+'/reverse':'/invoices/'+props.invoice.id+'/void',{method:'POST',body:{request_id:form.value.request_id,exercise_id:exercise.value.id,date:day.value,reason:form.value.reason}});
  emit('saved',result);
 }catch(cause){error.value=treasuryError(cause);}finally{busy.value=false;}
}
</script>
<template>
 <FormDialog class="portfolio-action-dialog" :title="title" :busy="busy" @close="emit('close')"><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
  <p class="trade-action-context">{{ receipt?receipt.party_name+' · '+receipt.reference:invoice.party_name+' · '+invoice.reference }}<template v-if="receipt"> · {{ t.receipt }} {{ receipt.id }}</template></p>
  <form @submit.prevent="save"><fieldset :disabled="busy||loading">
   <template v-if="mode==='reschedule'"><p class="muted">{{ t.changedDueHelp }}</p><label>{{ t.dueDate }}<input v-model="form.due_date" name="new_due_date" type="date" :min="receipt.invoice_date" max="9999-12-31" required></label></template>
   <template v-else-if="needsExercise"><label>{{ mode==='settle'?t.paymentDate:t.reversalDate }}<input v-model="day" name="payment_date" type="date" :min="sourceDate" max="9999-12-31" required></label><p v-if="exercise" class="muted trade-exercise-hint">{{ t.paymentExercise }}: {{ exercise.name }}</p><p v-else class="notice" role="status">{{ t.noOpenExercise }} <RouterLink to="/ejercicios" @click="emit('close')">{{ t.manageExercises }}</RouterLink></p></template>
   <template v-if="mode==='split'"><p class="muted">{{ t.splitHelp }}</p><p>{{ t.remaining }}: <strong>{{ money(receipt.remaining_amount) }} €</strong></p><div class="filters"><label>{{ t.numberReceipts }}<input v-model.number="count" name="split_count" type="number" min="2" max="60" required></label><label>{{ t.firstDue }}<input v-model="first" name="split_first_date" type="date" :min="receipt.invoice_date" max="9999-12-31" required></label><button type="button" class="button" @click="distribute">{{ t.distribute }}</button></div><div class="table-wrap"><table><thead><tr><th>{{ t.dueDate }}</th><th>{{ t.amount }}</th></tr></thead><tbody><tr v-for="(part,index) in parts" :key="index"><td><input v-model="part.due_date" :aria-label="t.dueDate+' '+(index+1)" type="date" :min="receipt.invoice_date" max="9999-12-31" required></td><td><input v-model="part.amount" :aria-label="t.amount+' '+(index+1)" inputmode="decimal" required></td></tr></tbody></table></div><p>{{ t.totalSplit }}: <strong>{{ splitTotal===null?'—':money(splitTotal) }} €</strong></p><p v-if="!validSplit" class="notice">{{ t.splitMismatch }}</p></template>
   <template v-if="mode==='settle'"><p>{{ t.remaining }}: <strong>{{ money(receipt.remaining_amount) }} €</strong></p><label>{{ t.amount }}<input v-model="form.amount" name="settlement_amount" inputmode="decimal" required></label><label>{{ t.bank }}<select v-model="form.bank_account_id" name="bank_account_id" required><option value="">{{ t.bank }}</option><option v-for="bank in banks" :key="bank.id" :value="bank.id">{{ bank.code }} · {{ bank.description }}</option></select></label><p v-if="!loading&&!banks.length" class="notice">{{ t.noBank }} <RouterLink to="/cuentas" @click="emit('close')">{{ t.manageAccounts }}</RouterLink></p><label>{{ t.movementReference }}<input v-model="form.reference" name="movement_reference" maxlength="100"></label></template>
   <template v-if="['settle','reschedule','split'].includes(mode)"><label>{{ t.paymentMethod }}<select v-model="form.payment_method" name="payment_method"><option v-for="(label,key) in t.methods" :key="key" :value="key">{{ label }}</option></select></label><label>{{ t.notes }}<textarea v-model="form.notes" name="movement_notes" maxlength="500" rows="3"></textarea></label></template>
   <template v-if="mode==='reverse'||mode==='void'"><p class="notice">{{ mode==='reverse'?t.reversalHelp:t.voidHelp }}</p><label>{{ t.reason }}<input v-model="form.reason" name="reversal_reason" maxlength="200" required></label></template>
  </fieldset><div class="actions"><button class="button primary" :disabled="busy||loading||(needsExercise&&!exercise)||(mode==='split'&&!validSplit)">{{ mode==='settle'?title:mode==='reschedule'?t.save:title }}</button><button type="button" class="button" :disabled="busy" @click="emit('close')">{{ t.cancel }}</button></div></form>
 </FormDialog>
</template>
