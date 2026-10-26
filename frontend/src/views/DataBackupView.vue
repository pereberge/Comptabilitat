<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { computed,onBeforeUnmount,ref } from 'vue';
import { useRoute } from 'vue-router';
import { useContext } from '../composables/context.js';
import { backupError,downloadDataBackup } from '../services/data-backup.js';
import { reportDate as date } from '../services/report-format.js';
import { fileSize } from '../services/documentation.js';
import AutomaticBackups from '../components/AutomaticBackups.vue';
import DataRestoreDialog from '../components/DataRestoreDialog.vue';
import { downloadExerciseBackup } from '../services/exercise-clear.js';
const {company,exercises,selectedId,reloadData,selectExercise}=useContext();
const requested=String(useRoute().query.exercise_id||'');
const initialId=exercises.value.some(row=>String(row.id)===requested)?requested:selectedId.value;
const previousCopies=ref([]);
const selectedIds=ref(initialId?[initialId]:exercises.value.map(row=>String(row.id))),busy=ref(false),restoring=ref(false),error=ref(''),notice=ref('');let controller=null;
const periods=computed(()=>exercises.value.filter(row=>selectedIds.value.includes(String(row.id))));
const allSelected=computed(()=>exercises.value.length>0&&periods.value.length===exercises.value.length);
const scope=computed(()=>allSelected.value?'all':periods.value.map(row=>row.id).join(','));
const scopeName=computed(()=>!periods.value.length?'Ningún ejercicio seleccionado':allSelected.value?'Todos los ejercicios ('+periods.value.length+')':(periods.value.length===1?'Ejercicio ':'Ejercicios ')+periods.value.map(row=>row.name).join(', '));
function toggleAll(event){selectedIds.value=event.target.checked?exercises.value.map(row=>String(row.id)):[];notice.value='';error.value='';}
async function download(){
 if(busy.value)return;busy.value=true;error.value='';notice.value='';controller=new AbortController();
 try{const saved=await downloadDataBackup(scope.value,controller.signal);notice.value='Copia descargada: '+saved.name+' · '+fileSize(saved.size);}
 catch(cause){if(cause.name!=='AbortError')error.value=backupError(cause);}
 finally{busy.value=false;}
}
async function restored(result){
 restoring.value=false;previousCopies.value=result.backups||[];
 notice.value='Datos importados correctamente. Se han recuperado '+result.counts.journal_entries+' asientos y '+result.counts.trade_invoices+' facturas.'+(result.fiscal_restored?' Cadena VERI*FACTU recuperada; revisa su configuración y reactiva las pruebas antes de emitir nuevas facturas.':'');
 try{await reloadData();selectedIds.value=result.exercise_ids.map(String);if(result.exercise_ids.length===1)selectExercise(String(result.exercise_ids[0]));}
 catch{error.value='La importación se ha completado. Recarga la página para actualizar la empresa y los ejercicios.';}
}
async function downloadPrevious(copy){try{await downloadExerciseBackup(copy.clear_id);}catch{error.value='No se ha podido descargar la copia previa. Puedes volver a intentarlo desde Ejercicios.';}}
onBeforeUnmount(()=>controller?.abort());
</script>
<template>
 <div class="page-heading"><div><h1>Copias de seguridad</h1><p class="muted">Exporta y recupera los datos de {{ company.name }} por empresa y ejercicio.</p></div></div>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="notice" class="success-note" role="status">{{ notice }}</p>
 <section v-if="previousCopies.length" class="backup-previous-copies"><p>Se ha guardado una copia de los datos anteriores a la sustitución.</p><div class="actions"><button v-for="copy in previousCopies" :key="copy.clear_id" class="button" @click="downloadPrevious(copy)">Descargar copia anterior · {{ copy.exercise_name }}</button></div></section>
 <section class="panel backup-panel">
  <h2>{{ company.name }}</h2>
  <p class="muted">Para trabajar con otra empresa, selecciónala en la barra superior.</p>
  <fieldset class="backup-scope" :disabled="busy">
   <legend>Ejercicios incluidos</legend>
   <label class="backup-select-all"><input name="backup_all" type="checkbox" :checked="allSelected" :indeterminate.prop="periods.length>0&&!allSelected" @change="toggleAll">Seleccionar todos ({{ exercises.length }})</label>
   <div class="backup-exercise-options">
    <label v-for="period in exercises" :key="period.id" class="backup-exercise-option" :class="{'is-selected':selectedIds.includes(String(period.id))}"><input v-model="selectedIds" name="backup_exercise" type="checkbox" :value="String(period.id)" @change="notice='';error=''"><span><strong>Ejercicio {{ period.name }}</strong><span class="backup-exercise-dates">{{ date(period.start_date) }} — {{ date(period.end_date) }}</span><span class="backup-exercise-status">{{ period.status==='closed'?'Cerrado':'Abierto' }}</span></span></label>
   </div>
  </fieldset>
  <p class="backup-periods" role="status">{{ scopeName }}</p>
  <div class="actions backup-actions"><button class="button primary" :disabled="busy||!periods.length" @click="download">{{ busy?'Preparando copia…':'Hacer copia de seguridad' }}</button><button class="button" :disabled="busy||!periods.length||!can('data_import')" @click="restoring=true;error='';notice=''">Importar datos</button></div>
  <p class="muted">La copia incluye el plan de cuentas, los asientos, las facturas, la cartera y los documentos originales. También incluye los datos comunes de la empresa.</p>
  <p class="muted">La importación comprueba el archivo y muestra un resumen. Si el destino ya contiene datos, puedes confirmar su sustitución con una copia previa de seguridad. Los movimientos de los demás ejercicios se conservan.</p>
 </section>
 <AutomaticBackups />
 <DataRestoreDialog v-if="restoring" :scope="scope" :scope-name="scopeName" @close="restoring=false" @restored="restored" />
</template>
