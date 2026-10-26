<script setup>
import { onBeforeUnmount, ref } from 'vue';
import FormDialog from './FormDialog.vue';
import { previewBankStatement, analyzeBankStatement, saveBankStatement, discardBankStatement, bankImportError } from '../services/bank-import.js';
import { reportMoney as money, reportDate as date } from '../services/report-format.js';
import { bankDayNumber } from '../../../shared/bank-reconciliation.js';
const props=defineProps({exercise:Object,company:Object});
const emit=defineEmits(['close','imported']);
const file=ref(null),preview=ref(null),analysis=ref(null),account=ref(''),bankName=ref(''),busy=ref(false),error=ref('');
function discard(){if(preview.value?.token)discardBankStatement(preview.value.token);}
onBeforeUnmount(discard);
function choose(event){discard();file.value=event.target.files[0]||null;preview.value=null;analysis.value=null;error.value='';}
async function review(){
 if(!file.value||busy.value)return;discard();busy.value=true;error.value='';analysis.value=null;preview.value=null;
 try{if(file.value.size>5*1024*1024)throw{code:'BANK_STATEMENT_TOO_LARGE'};
  preview.value=await previewBankStatement(file.value,props.exercise.id);account.value=preview.value.detected_account_id?String(preview.value.detected_account_id):'new';bankName.value='';
 }catch(e){error.value=bankImportError(e);}finally{busy.value=false;}
}
async function analyze(){
 busy.value=true;error.value='';analysis.value=null;
 try{analysis.value=await analyzeBankStatement({token:preview.value.token,...(account.value==='new'?{create_account:true,bank_name:bankName.value}:{account_id:account.value})});}
 catch(e){error.value=bankImportError(e);}finally{busy.value=false;}
}
async function save(){
 busy.value=true;error.value='';
 try{emit('imported',await saveBankStatement(analysis.value.token));}catch(e){error.value=bankImportError(e);}finally{busy.value=false;}
}
</script>
<template>
 <FormDialog class="bank-import-dialog" title="Subir extracto y conciliar" :busy="busy" @close="emit('close')">
  <p class="bank-upload-context"><strong>{{ company.name }}</strong> · Ejercicio {{ exercise.name }}</p>
  <p class="muted">Sube un PDF con texto o un CSV del banco (máximo 5 MB). Detectamos el banco, el IBAN y los movimientos; revisa la subcuenta antes de guardar. Buscamos saldos iguales con menos de 10 días naturales de diferencia entre el extracto y el mayor (de 0 a 9 días).</p>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <form @submit.prevent="review"><label>Extracto bancario<input type="file" name="bank_statement" accept=".pdf,.csv,application/pdf,text/csv" :disabled="busy" required @change="choose"></label><button class="button" :disabled="busy||!file">{{ busy&&!preview?'Leyendo extracto…':'Detectar banco y movimientos' }}</button></form>
  <section v-if="preview" class="bank-upload-preview">
   <h3>{{ preview.bank.name }}</h3><p>{{ preview.bank.iban_masked || 'IBAN no indicado en el archivo' }}</p>
   <p>{{ preview.rows }} movimientos · {{ date(preview.from) }} a {{ date(preview.to) }}.</p>
   <p><strong>{{ preview.selected_rows }} movimientos del ejercicio {{ exercise.name }}</strong> · Saldo final: {{ money(preview.final_balance) }} €.</p>
   <p v-if="preview.already_imported" class="notice">Este extracto ya está guardado en el ejercicio. Se abrirá el informe existente.</p>
   <p v-if="preview.account_reason==='saved_iban'" class="success-note">Subcuenta reconocida por el IBAN guardado.</p>
   <p v-else-if="preview.account_reason==='same_document'" class="success-note">Subcuenta reconocida por el extracto ya guardado.</p>
   <p v-else-if="preview.account_reason==='account_name'" class="notice">Subcuenta sugerida por el nombre del banco. Confirma que corresponde a este IBAN.</p>
   <form @submit.prevent="analyze">
    <label>Subcuenta de esta cuenta bancaria<select v-model="account" name="bank_account" :disabled="busy||preview.already_imported" @change="analysis=null"><option v-for="item in preview.accounts" :key="item.id" :value="String(item.id)">{{ item.code }} · {{ item.description }}</option><option value="new">Crear una subcuenta nueva para este banco</option></select></label>
    <label v-if="account==='new'&&!preview.bank.detected">Nombre del banco<input v-model="bankName" name="bank_name" required maxlength="120" :disabled="busy" @input="analysis=null"></label>
    <button class="button primary" :disabled="busy">{{ busy?'Preparando…':'Preparar conciliación' }}</button>
   </form>
  </section>
  <section v-if="analysis" class="bank-upload-preview" aria-live="polite">
   <h3>{{ analysis.account.code }} · {{ analysis.account.description }}</h3>
   <p v-if="analysis.new_account" class="muted">Se creará esta subcuenta al guardar. No se crea ningún asiento de apertura.</p>
   <p v-if="analysis.snapshot.scope.last_matching_date">Punto de partida: {{ date(analysis.snapshot.scope.last_matching_date) }} · {{ money(analysis.snapshot.scope.last_matching_balance) }} €. Margen de 0,03 € y hasta 10 días antes o después.</p>
   <p v-else class="notice">No hay una fecha con saldo coincidente. Se muestran el saldo inicial y las diferencias pendientes.</p>
   <p v-if="analysis.snapshot.scope.last_matching_book_date && analysis.snapshot.scope.last_matching_book_date!==analysis.snapshot.scope.last_matching_date" class="notice">Saldo comparable en el mayor el {{ date(analysis.snapshot.scope.last_matching_book_date) }} · {{ Math.abs(bankDayNumber(analysis.snapshot.scope.last_matching_book_date)-bankDayNumber(analysis.snapshot.scope.last_matching_date)) }} días de diferencia. El mayor se revisa a partir de su propia fecha de corte.</p>
   <p v-if="analysis.snapshot.scope.balance_match_difference&&analysis.snapshot.scope.balance_match_difference!=='0.00'" class="muted">Diferencia en el saldo de partida: {{ money(analysis.snapshot.scope.balance_match_difference) }} €. Los saldos originales se conservan.</p>
   <p v-if="analysis.snapshot.scope.last_matching_date" class="muted">{{ analysis.snapshot.scope.last_matching_date===analysis.snapshot.source.to?'El saldo coincide al final del extracto. No hay movimientos posteriores que revisar.':'Solo se revisan movimientos posteriores a esa fecha, hasta el '+date(analysis.snapshot.source.to)+'.' }}</p>
   <p v-else class="muted">Solo se revisan movimientos del {{ date(analysis.snapshot.source.from) }} al {{ date(analysis.snapshot.source.to) }}. Los apuntes anteriores se usan para calcular el saldo inicial.</p>
   <p>{{ analysis.snapshot.scope.matched_movements.length }} movimientos con coincidencia · {{ analysis.snapshot.scope.bank_pending.length }} pendientes · {{ analysis.snapshot.proposals.length }} propuestas de asientos.</p>
   <p v-if="analysis.snapshot.pending_invoice_matches?.length"><strong>{{ analysis.snapshot.pending_invoice_matches.length }} movimientos con posibles facturas pendientes de Documentación.</strong> Podrás abrirlas o pasarlas a Facturas desde la conciliación guardada.</p>
   <p v-if="analysis.snapshot.unresolved.length"><strong>{{ analysis.snapshot.unresolved.length }} movimientos necesitan justificante o contrapartida.</strong></p>
   <p>Saldo contable a {{ date(analysis.snapshot.scope.book_balance_date||analysis.snapshot.source.to) }}: {{ money(analysis.snapshot.current_book_balance) }} € · Banco a {{ date(analysis.snapshot.source.to) }}: {{ money(analysis.snapshot.bank_balance) }} €.</p>
   <p>Saldo bancario anterior al tramo: {{ money(analysis.snapshot.scope.period_opening_balance) }} € · Saldo contable anterior: {{ money(analysis.snapshot.scope.book_opening_balance) }} €.</p>
   <p>Diferencia después de las propuestas disponibles: <strong>{{ money(analysis.snapshot.unresolved_difference_book_minus_bank) }} €</strong>.</p>
   <details v-if="analysis.snapshot.unresolved.length"><summary>Ver comprobaciones pendientes</summary><p v-for="row in analysis.snapshot.unresolved.slice(0,5)" :key="row.movement_id">{{ date(row.date) }} · {{ row.concept }} · {{ money(row.amount) }} €: {{ row.reason }}</p><p v-if="analysis.snapshot.unresolved.length>5" class="muted">El informe completo mostrará todos los movimientos.</p></details>
   <p class="notice">Se guarda el extracto con su informe. Los asientos quedan pendientes de validar y no se contabilizan automáticamente.</p>
   <div class="actions"><button class="button primary" :disabled="busy" @click="save">{{ busy?'Guardando…':preview.already_imported?'Abrir informe guardado':'Guardar conciliación' }}</button></div>
  </section>
 </FormDialog>
</template>
<style scoped>
.bank-upload-context{margin-bottom:12px}.bank-import-dialog .muted{line-height:1.6}.bank-import-dialog form{margin:18px 0}.bank-import-dialog .notice{display:block;line-height:1.6;margin:14px 0}.bank-upload-preview{border-top:1px solid #dce4ee;margin-top:22px;padding-top:20px}.bank-upload-preview h3{margin-bottom:10px}.bank-upload-preview p{margin:10px 0;line-height:1.6}.bank-upload-preview select{width:100%;max-width:100%;min-width:0}.bank-upload-preview details{padding:12px;background:#f7f9fc;margin:16px 0}.bank-upload-preview summary{cursor:pointer}.bank-upload-preview .actions{margin-top:16px}
</style>
