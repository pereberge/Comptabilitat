<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { computed,onBeforeUnmount,ref } from 'vue';
import { useContext } from '../composables/context.js';
import { backupCounts,backupError,previewDataBackup,restoreDataBackup,discardDataBackup } from '../services/data-backup.js';
import { reportDate as date } from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({scope:[String,Number],scopeName:String}),emit=defineEmits(['close','restored']);
const {company}=useContext(),preview=ref(null),loading=ref(false),busy=ref(false),error=ref(''),confirmed=ref(false),fileName=ref(''),replaceExisting=ref(false),confirmation=ref('');
const hasExisting=computed(()=>Object.values(preview.value?.existing_counts||{}).some(count=>count>0));
const blockers=computed(()=>preview.value?.blockers.filter(blocker=>blocker.code!=='occupied')||[]);
const canRestore=computed(()=>!busy.value&&!loading.value&&preview.value?.ready&&confirmed.value&&(!preview.value.replace_existing||(can('exercise_clear')&&confirmation.value==='96')));
let requestId=crypto.randomUUID(),controller=null,alive=true,currentFile=null;
async function review(){
 if(!currentFile||busy.value)return;
 controller?.abort();if(preview.value)discardDataBackup(preview.value.token).catch(()=>{});
 preview.value=null;confirmed.value=false;confirmation.value='';error.value='';requestId=crypto.randomUUID();loading.value=true;
 const active=new AbortController();controller=active;
 try{const data=await previewDataBackup(currentFile,props.scope,active.signal,replaceExisting.value);if(alive&&controller===active)preview.value=data;else discardDataBackup(data.token).catch(()=>{});}
 catch(cause){if(alive&&controller===active&&cause.name!=='AbortError')error.value=backupError(cause);}
 finally{if(alive&&controller===active)loading.value=false;}
}
function selected(event){const file=event.target.files[0];if(!file)return;currentFile=file;fileName.value=file.name;replaceExisting.value=false;review();}
async function restore(){
 if(!canRestore.value)return;busy.value=true;error.value='';
 try{const result=await restoreDataBackup({token:preview.value.token,request_id:requestId,confirm:true,confirmation:confirmation.value});emit('restored',result);}
 catch(cause){error.value=backupError(cause);}
 finally{busy.value=false;}
}
onBeforeUnmount(()=>{alive=false;controller?.abort();if(preview.value)discardDataBackup(preview.value.token).catch(()=>{});});
</script>
<template><FormDialog title="Importar datos desde una copia de seguridad" class="data-restore-dialog" :busy="busy||loading" @close="emit('close')">
 <div class="data-restore-body" :aria-busy="loading">
  <p class="backup-target"><strong>{{ company.name }}</strong> · {{ scopeName }}</p>
  <label class="backup-file">Copia de seguridad (.json.gz o .json, hasta 100 MB)<input name="data_backup_file" type="file" accept=".gz,.json,application/gzip,application/json" :disabled="busy||loading" @change="selected"></label>
  <p v-if="loading" role="status">Leyendo la copia y comprobando el destino…</p>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <template v-if="preview">
   <p class="muted">{{ fileName }} · Copia del {{ date(preview.created_at.slice(0,10)) }}</p>
   <section v-if="hasExisting||replaceExisting" class="backup-replace-options">
    <p v-if="!can('exercise_clear')" class="notice">Solo el máster puede sustituir los datos existentes. Cambia de usuario para realizar esta operación.</p>
    <p><strong>El destino ya contiene datos.</strong> Puedes sustituir los movimientos de los ejercicios incluidos en el archivo.</p>
    <label v-if="can('exercise_clear')" class="backup-confirm"><input v-model="replaceExisting" name="data_backup_replace" type="checkbox" :disabled="busy||loading" @change="review">Sustituir los datos existentes de estos ejercicios por los de la copia.</label>
    <p v-if="replaceExisting" class="muted">Antes de sustituirlos se guardará una copia de los datos actuales. Podrás descargarla al terminar.</p>
    <details><summary>Datos actuales de los ejercicios de destino</summary><dl class="exercise-clear-counts"><template v-for="(label,key) in backupCounts" :key="key"><template v-if="preview.existing_counts[key]"><dt>{{ label }}</dt><dd>{{ preview.existing_counts[key] }}</dd></template></template></dl></details>
   </section>
   <section class="backup-preview-scope"><h3>{{ preview.source_company.name }}</h3><p v-for="period in preview.exercises" :key="period.start_date">Ejercicio {{ period.name }} · {{ date(period.start_date) }} — {{ date(period.end_date) }} · {{ period.status==='closed'?'Cerrado':'Abierto' }}</p></section>
   <h3>Contenido de la copia</h3>
   <dl class="exercise-clear-counts"><template v-for="(label,key) in backupCounts" :key="key"><template v-if="preview.counts[key]"><dt>{{ label }}</dt><dd>{{ preview.counts[key] }}</dd></template></template></dl>
   <div v-if="blockers.length" class="notice error-notice" role="alert"><ul><li v-for="(blocker,index) in blockers" :key="index">{{ blocker.message }}</li></ul></div>
  </template>
 </div>
 <form class="data-restore-actions" @submit.prevent="restore">
  <template v-if="preview?.ready">
   <label class="backup-confirm"><input v-model="confirmed" name="data_backup_confirm" type="checkbox" :disabled="busy">He revisado la empresa, los ejercicios y los datos que quiero {{ preview.replace_existing?'sustituir':'importar' }}.</label>
   <label v-if="preview.replace_existing" class="backup-replacement-code">Escribe 96 para confirmar la sustitución<input v-model="confirmation" name="data_backup_code" inputmode="numeric" autocomplete="off" maxlength="2" :disabled="busy"></label>
  </template>
  <p v-else class="muted" role="status">{{ loading?'Comprobando el archivo…':preview?'Revisa las opciones y los avisos antes de aceptar.':'Selecciona una copia para revisar los datos.' }}</p>
  <div class="actions"><button class="button primary" :disabled="!canRestore">{{ busy?'Importando datos…':'Aceptar e importar' }}</button><button type="button" class="button" :disabled="busy||loading" @click="emit('close')">Cancelar</button></div>
 </form>
</FormDialog></template>
