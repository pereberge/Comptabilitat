<script setup>
import {useAccess} from '../composables/access.js';
import { computed,ref,onMounted,watch } from 'vue';
import { useRouter } from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { reportMoney as money,reportDate as date } from '../services/report-format.js';
import { t,exerciseError,entryLabels } from '../locales/exercises.js';
import ManagementTabs from '../components/ManagementTabs.vue';
import StatusBadge from '../components/StatusBadge.vue';
import FormDialog from '../components/FormDialog.vue';
import JournalImportDialog from '../components/JournalImportDialog.vue';
import AnnualOperationDialog from '../components/AnnualOperationDialog.vue';
import AnnualEntryPreview from '../components/AnnualEntryPreview.vue';
import EntryDetail from '../components/EntryDetail.vue';
import ExerciseClearDialog from '../components/ExerciseClearDialog.vue';
import {clearError,downloadExerciseBackup} from '../services/exercise-clear.js';
const {company,selectedId,selectExercise,refresh,updateExerciseStatus,reloadData}=useContext(),router=useRouter();
const rows=ref([]),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),formError=ref(''),form=ref(null),importing=ref(null),operation=ref(null),detailId=ref(null);
const {can}=useAccess();
const clearing=ref(null),backupBusy=ref(null);
const withOpening=ref(false),carry=ref(null),carryLoading=ref(false),carryError=ref('');
let carryGeneration=0;
async function load(){loading.value=true;error.value='';try{rows.value=await api('/exercises');}catch(e){error.value=exerciseError(e);}finally{loading.value=false;}}
onMounted(load);
function previousEnd(start){if(!start)return '';const day=new Date(start+'T00:00:00Z');if(!Number.isFinite(day.getTime()))return '';day.setUTCDate(day.getUTCDate()-1);return day.toISOString().slice(0,10);}
const openingSource=computed(()=>rows.value.find(row=>row.end_date===previousEnd(form.value?.start_date)&&row.status==='closed'));
function open(){
 let year=new Date().getFullYear();if(rows.value.length)year=Math.max(...rows.value.map(row=>Number(row.end_date.slice(0,4))))+1;year=Math.min(year,9999);
 withOpening.value=false;carry.value=null;carryError.value='';form.value={name:String(year),start_date:year+'-01-01',end_date:year+'-12-31',is_default:true};formError.value='';
}
function yearChanged(){const year=form.value.name;if(/^[1-9]\d{3}$/.test(year)){form.value.start_date=year+'-01-01';form.value.end_date=year+'-12-31';}}
watch([withOpening,()=>openingSource.value?.id,()=>form.value?.start_date],async()=>{
 const ticket=++carryGeneration;carry.value=null;carryError.value='';carryLoading.value=false;
 if(!withOpening.value)return;if(!openingSource.value){withOpening.value=false;return;}
 carryLoading.value=true;
 try{const data=await api('/exercises/'+openingSource.value.id+'/carry-forward',{timeoutMs:90000});if(ticket===carryGeneration)carry.value=data;}
 catch(e){if(ticket===carryGeneration)carryError.value=exerciseError(e);}finally{if(ticket===carryGeneration)carryLoading.value=false;}
});
async function save(){
 if(busy.value||(withOpening.value&&(!carry.value||carryLoading.value)))return;busy.value=true;formError.value='';
 try{
  const body={...form.value,...(withOpening.value?{opening_from_exercise_id:openingSource.value.id,opening_preview_hash:carry.value.preview_hash,request_id:carry.value.request_id ||= crypto.randomUUID()}:{})};
  const saved=await api('/exercises',{method:'POST',body,timeoutMs:90000});form.value=null;await refresh(String(company.value.id));selectExercise(String(saved.id));
 }catch(e){formError.value=exerciseError(e);}finally{busy.value=false;}
}
function consult(row,name){selectExercise(String(row.id));router.push({name});}
async function imported(){
 const id=String(importing.value.id);importing.value=null;
 await load();
 try{await reloadData();selectExercise(id);}
 catch{error.value='La importación se ha completado. Recarga la página para actualizar los ejercicios.';}
 notice.value=t.success;
 const row=rows.value.find(item=>String(item.id)===id),openings=row?posted(row,'opening'):[];
 if(openings.length)notice.value+=' Apertura: '+openings.map(entry=>'asiento '+entry.number+(entry.import_id?' (importado)':'')).join(', ')+'.';
}
async function cleared(result){clearing.value=null;updateExerciseStatus(result.exercise_id,result.status);notice.value='Contabilidad del ejercicio '+result.exercise_name+' borrada. El período está vacío y abierto. La copia de seguridad está disponible en su ficha.';await load();}
async function download(clearId){if(backupBusy.value)return;backupBusy.value=clearId;error.value='';try{await downloadExerciseBackup(clearId);}catch(cause){error.value=clearError(cause);}finally{backupBusy.value=null;}}
function posted(row,type){return row.annual_entries.filter(entry=>entry.status==='posted'&&entry.entry_type===type);}
function canOpen(row){return rows.value.some(source=>source.status==='closed'&&source.end_date===previousEnd(row.start_date));}
async function saved(result){
 operation.value=null;notice.value='Operación completada. Puedes consultar los asientos y el historial del ejercicio.';
 const selected=selectedId.value;await load();await refresh(String(company.value.id));selectExercise(selected);
}
</script>
<template>
 <ManagementTabs />
 <div class="page-heading"><div><h1>{{ t.title }}</h1><p class="muted">{{ company.name }} · {{ t.intro }}</p></div><button class="button primary" :disabled="loading||busy||!can('exercise_create')" @click="open">{{ t.newExercise }}</button></div>
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p>
 <p v-if="loading" role="status">Cargando ejercicios…</p><p v-else-if="!rows.length&&!error" class="notice">{{ t.empty }}</p>
 <div class="exercises-grid">
  <article v-for="row in rows" :key="row.id" class="panel exercise-profile" :data-exercise-id="row.id">
   <div class="exercise-heading"><h2>{{ row.name }}</h2><StatusBadge :status="row.status" /><span v-if="String(row.id)===selectedId" class="badge badge-open">{{ t.selected }}</span></div>
   <p>{{ date(row.start_date) }} — {{ date(row.end_date) }}</p><p class="muted">{{ row.entries_count }} {{ t.entries }} · {{ row.lines_count }} {{ t.lines }}</p>
   <div class="annual-status"><p v-for="type in ['opening','regularization','closing']" :key="type"><strong>{{ entryLabels[type] }}:</strong> <template v-if="posted(row,type).length"><button v-for="entry in posted(row,type)" :key="entry.id" class="report-link" @click="detailId=entry.id">asiento {{ entry.number }}{{ entry.import_id?' (importado)':'' }}</button></template><span v-else>Sin asiento vigente</span></p><p v-if="row.annual_entries.some(entry=>entry.status==='cancelled')" class="muted">Hay asientos anulados conservados en el diario.</p></div>
   <div class="actions annual-actions">
    <template v-if="can('exercise_operations')&&row.status==='open'">
     <button v-if="!posted(row,'opening').length" class="button" :disabled="!canOpen(row)" :title="!canOpen(row)?'Primero cierra el ejercicio anterior':''" @click="operation={exercise:row,kind:'opening'}">Generar apertura</button>
     <button v-else class="button" @click="operation={exercise:row,kind:'cancel_opening'}">Anular apertura</button>
     <button class="button" :disabled="!row.entries_count" @click="operation={exercise:row,kind:'closing'}">Generar cierre</button>
    </template>
    <button v-if="can('exercise_operations')&&(row.status==='closed'||posted(row,'closing').length)" class="button" @click="operation={exercise:row,kind:'cancel_closing'}">Anular cierre</button>
    <button class="button" @click="operation={exercise:row,kind:'history'}">Historial de operaciones</button>
   </div>
   <section v-if="row.import" class="exercise-import-summary"><h3>{{ t.imported }}</h3><p>{{ t.source }}: {{ row.import.source_name }}</p><p>{{ row.import.accounts }} {{ t.accounts }} · {{ t.debit }}: {{ money(row.import.debit) }} € · {{ t.credit }}: {{ money(row.import.credit) }} €</p></section>
   <div class="actions">
    <button v-if="String(row.id)!==selectedId" class="button" @click="selectExercise(String(row.id))">{{ t.choose }}</button>
    <button class="button" @click="consult(row,'entries')">{{ t.journal }}</button><button v-if="row.entries_count" class="button" @click="consult(row,'balanceSheet')">{{ t.balance }}</button>
    <RouterLink class="button" :to="{name:'dataBackup',query:{exercise_id:String(row.id)}}">Copia de seguridad / Importar datos</RouterLink>
    <button class="button" :disabled="!can('data_import')||(!!row.entries_count&&!row.import)" :title="row.entries_count&&!row.import?'Vacía el ejercicio para importar un libro diario':''" @click="importing=row">{{ row.import?t.replay:t.import }}</button><button v-if="can('exercise_clear')" class="button clear-danger-outline" @click="clearing=row">Borrar contabilidad del período</button>
   </div>
   <p v-if="row.last_clear&&can('exercise_clear')" class="exercise-clear-backup">Copia del último borrado <button class="button" :disabled="!!backupBusy" @click="download(row.last_clear.id)">{{ backupBusy===row.last_clear.id?'Descargando…':'Descargar copia de seguridad' }}</button></p>
  </article>
 </div>
 <FormDialog v-if="form" class="exercise-dialog" :title="t.newExercise" :busy="busy" @close="form=null">
  <form @submit.prevent="save">
   <p v-if="formError" role="alert" class="notice error-notice">{{ formError }}</p>
   <label>{{ t.name }}<input v-model="form.name" name="exercise_name" maxlength="60" :disabled="busy" required autofocus @input="yearChanged"></label>
   <div class="form-grid"><label>{{ t.start }}<input v-model="form.start_date" name="start_date" type="date" min="1000-01-01" :max="form.end_date||'9999-12-31'" :disabled="busy" required></label><label>{{ t.end }}<input v-model="form.end_date" name="end_date" type="date" :min="form.start_date||'1000-01-01'" max="9999-12-31" :disabled="busy" required></label></div>
   <label class="checkbox-label"><input v-model="form.is_default" type="checkbox" :disabled="busy">{{ t.default }}</label>
   <label class="checkbox-label"><input v-model="withOpening" name="with_opening" type="checkbox" :disabled="busy||!openingSource||!can('exercise_operations')">Crear también el asiento de apertura<template v-if="openingSource"> desde {{ openingSource.name }}</template></label>
   <p v-if="!openingSource" class="muted">Para generar la apertura, debe existir un ejercicio anterior cerrado que termine el día anterior.</p>
   <p v-if="carryLoading" role="status">Calculando los saldos de apertura…</p><p v-if="carryError" role="alert" class="notice error-notice">{{ carryError }}</p>
   <AnnualEntryPreview v-if="withOpening&&carry" :entries="[{entry_type:'opening',lines:carry.lines,totals:carry.totals}]" />
   <p v-if="!withOpening" class="notice">{{ t.emptyHelp }}</p>
   <div class="actions"><button class="button primary" :disabled="busy||(withOpening&&(!carry||carryLoading))">{{ busy?'Guardando…':t.create }}</button><button type="button" class="button" :disabled="busy" @click="form=null">{{ t.cancel }}</button></div>
  </form>
 </FormDialog>
 <ExerciseClearDialog v-if="clearing" :exercise="clearing" @close="clearing=null" @cleared="cleared" />
 <JournalImportDialog v-if="importing" :exercise="importing" @close="importing=null" @imported="imported" />
 <AnnualOperationDialog v-if="operation" :exercise="operation.exercise" :kind="operation.kind" @close="operation=null" @saved="saved" @entry="detailId=$event" />
 <EntryDetail v-if="detailId" :entry-id="detailId" @close="detailId=null" />
</template>
