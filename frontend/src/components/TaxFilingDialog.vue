<script setup>
import {computed,onBeforeUnmount,ref} from 'vue';
import {reportMoney as money} from '../services/report-format.js';
import {requestVatFiling} from '../services/vat-filing.js';
import {tax} from '../locales/tax.js';
import {errorText} from '../locales/accounting.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({model:{type:Object,required:true}}),emit=defineEmits(['close']);
const form=ref({type:props.model.filing.default_type,iban:props.model.filing.default_iban,redeme:false,voluntary_sii:false,annual_exempt:false,no_activity:false,confirmed:false});
const busy=ref(false),error=ref(''),prepared=ref(null),controller=new AbortController();let disposed=false;
const lastPeriod=computed(()=>['4T','12'].includes(props.model.period.code));
const types=computed(()=>props.model.result_kind==='pay'?[['I','Ingreso · completar el pago en la AEAT'],['U','Domiciliación del ingreso']]:props.model.result_kind==='credit'?[['C','A compensar'],['D','Solicitud de devolución']]:[['N','Resultado cero / sin actividad']]);
const needsBank=computed(()=>['U','D'].includes(form.value.type));
const localIssue=computed(()=>lastPeriod.value&&(form.value.annual_exempt||form.value.redeme||form.value.voluntary_sii)?tax.errors.VAT_FILING_ANNUAL_INFORMATION:form.value.type==='D'&&!lastPeriod.value&&!form.value.redeme?tax.errors.VAT_FILING_REFUND_PERIOD:form.value.redeme&&props.model.period.frequency!=='monthly'?tax.errors.VAT_FILING_REDEME_PERIOD:'');
function clearPrepared(){if(prepared.value)URL.revokeObjectURL(prepared.value.url);prepared.value=null;}
async function generate(){
 if(busy.value||localIssue.value)return;busy.value=true;error.value='';clearPrepared();
 try{
  const file=await requestVatFiling(props.model,{...form.value},controller.signal);if(disposed)return;
  prepared.value={filename:file.filename,url:URL.createObjectURL(file.blob)};
  const anchor=document.createElement('a');anchor.href=prepared.value.url;anchor.download=file.filename;anchor.click();
 }catch(cause){if(!disposed)error.value=tax.errors[cause.code]||errorText(cause);}
 finally{if(!disposed)busy.value=false;}
}
onBeforeUnmount(()=>{disposed=true;controller.abort();clearPrepared();});
</script>
<template>
 <FormDialog class="tax-filing-dialog" title="Archivo de presentación · Modelo 303" :busy="busy" @close="emit('close')">
  <form class="tax-filing-form" @submit.prevent="generate" @input="clearPrepared" @change="clearPrepared">
   <div class="tax-filing-summary"><strong>{{ model.company.name }}</strong><span>NIF {{ model.company.tax_id }} · {{ model.period.year }} · {{ model.period.code }}</span><span>Resultado: <strong>{{ money(model.result) }} €</strong></span></div>
   <p class="muted">El archivo corresponde a la empresa y al período del modelo abierto. Usa el formato oficial {{ model.period.year }} para importarlo en Pre303.</p>
   <label>Tipo de declaración<select v-model="form.type" aria-label="Tipo de declaración" :disabled="busy" required><option v-for="[value,label] in types" :key="value" :value="value">{{ label }}</option></select></label>
   <label v-if="needsBank">IBAN español para {{ form.type==='U'?'domiciliación':'devolución' }}<input v-model="form.iban" name="filing_iban" autocomplete="off" maxlength="34" :disabled="busy" required><small>Revisa que la cuenta corresponda a la operación elegida.</small></label>
   <fieldset><legend>Datos censales de IVA</legend><label class="checkbox-label"><input v-model="form.redeme" type="checkbox" :disabled="busy">Inscrito en el Registro de devolución mensual (REDEME)</label><label class="checkbox-label"><input v-model="form.voluntary_sii" type="checkbox" :disabled="busy">Acogido voluntariamente al SII</label><label v-if="lastPeriod">¿Exonerado de presentar el resumen anual, modelo 390?<select v-model="form.annual_exempt" aria-label="Exonerado del modelo 390" :disabled="busy"><option :value="false">No · presentaré el modelo 390</option><option :value="true">Sí · debo incluir la información anual en el 303</option></select></label></fieldset>
   <label v-if="form.type==='N'" class="checkbox-label"><input v-model="form.no_activity" type="checkbox" :disabled="busy">Sin actividad: no se han devengado ni soportado cuotas de IVA</label>
   <p class="muted">Declaración original del régimen general, tributación al Estado al 100 %, sin criterio de caja, concurso, recargo de equivalencia ni prorrata especial. Los datos censales se contrastan con los registrados en la AEAT.</p>
   <label class="checkbox-label"><input v-model="form.confirmed" type="checkbox" :disabled="busy" required>Confirmo estos datos censales y la opción de resultado y pago seleccionada.</label>
   <p v-if="localIssue||error" class="notice error-notice" role="alert">{{ localIssue||error }}</p>
   <div v-if="prepared" class="notice" role="status"><strong>Archivo preparado: {{ prepared.filename }}</strong><p>Impórtalo en Pre303, valida la declaración y completa la firma y el envío en la AEAT.</p><a class="button" :href="prepared.url" :download="prepared.filename">Descargar de nuevo el archivo .303</a></div>
   <div class="actions"><button class="button primary" :disabled="busy||!!localIssue">{{ busy?'Preparando archivo…':'Generar y descargar .303' }}</button><a class="button" href="https://sede.agenciatributaria.gob.es/Sede/iva/presentar-declaracion-iva-modelo-303.html" target="_blank" rel="noopener noreferrer">Abrir presentación en la AEAT ↗</a></div>
  </form>
 </FormDialog>
</template>
