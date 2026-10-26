<script setup>
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import {useAccess} from '../composables/access.js';
import {useContext} from '../composables/context.js';
import {fileSize} from '../services/documentation.js';
import {reportDate} from '../services/report-format.js';
import {backupTypes,automaticBackupError,automaticBackupSettings,saveAutomaticBackupSettings,automaticBackupList,runAutomaticBackup,previewBackupDeletion,deleteBackups,downloadAutomaticBackup} from '../services/automatic-backups.js';
import FormDialog from './FormDialog.vue';
const {can}=useAccess(),{company}=useContext();
const schedules=ref([]),original=ref(''),storage=ref(''),running=ref(false),loaded=ref(false),busy=ref(''),error=ref(''),notice=ref('');
const result=ref({copies:[],total:0,page:1,page_size:25}),from=ref(''),to=ref(''),filterTypes=ref(Object.keys(backupTypes)),runType=ref('daily');
const before=ref(''),deleteTypes=ref(['daily']),preview=ref(null),confirmed=ref(false),dialogError=ref('');
let controller=null,runRequest=null;
const fields=()=>schedules.value.map(({frequency,enabled,run_time,weekday,month_day})=>({frequency,enabled,run_time,weekday,month_day}));
const dirty=computed(()=>JSON.stringify(fields())!==original.value);
const pages=computed(()=>Math.max(1,Math.ceil(result.value.total/result.value.page_size)));
const weekdays=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const instant=value=>value?new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
async function readSettings(){const state=await automaticBackupSettings();storage.value=state.directory;running.value=state.worker_running;if(!loaded.value||!dirty.value){schedules.value=state.schedules;original.value=JSON.stringify(fields());}loaded.value=true;}
async function readCopies(page=1){if(!filterTypes.value.length||from.value&&to.value&&from.value>to.value)throw {code:'BACKUP_INVALID_FILTER'};result.value=await automaticBackupList({types:filterTypes.value.join(','),...(from.value?{from:from.value}:{}),...(to.value?{to:to.value}:{}),page});}
async function refresh(page=1){if(busy.value)return;busy.value='loading';error.value='';try{await Promise.all([readSettings(),readCopies(page)]);}catch(cause){error.value=automaticBackupError(cause);}finally{busy.value='';}}
async function save(){busy.value='saving';error.value='';notice.value='';try{const state=await saveAutomaticBackupSettings(fields());schedules.value=state.schedules;original.value=JSON.stringify(fields());notice.value='Programación guardada para '+company.value.name+'.';}catch(cause){error.value=automaticBackupError(cause);}finally{busy.value='';}}
async function run(){if(busy.value)return;busy.value='running';error.value='';notice.value='';if(!runRequest||runRequest.frequency!==runType.value)runRequest={frequency:runType.value,request_id:crypto.randomUUID()};try{await runAutomaticBackup(runRequest);runRequest=null;notice.value='Copia '+backupTypes[runType.value].toLowerCase()+' guardada con todos los ejercicios de '+company.value.name+'.';await readCopies();}catch(cause){if(!['NETWORK_ERROR','BACKUP_BUSY','SERVICE_UNAVAILABLE'].includes(cause.code))runRequest=null;error.value=automaticBackupError(cause);}finally{busy.value='';}}
async function download(copy){busy.value='download';error.value='';controller=new AbortController();try{await downloadAutomaticBackup(copy.id,controller.signal);}catch(cause){if(cause.name!=='AbortError')error.value=automaticBackupError(cause);}finally{busy.value='';}}
async function review(body){busy.value='preview';error.value='';notice.value='';try{preview.value=await previewBackupDeletion(body);confirmed.value=false;dialogError.value='';}catch(cause){error.value=automaticBackupError(cause);}finally{busy.value='';}}
function reviewOlder(){if(!before.value||!deleteTypes.value.length){error.value='Indica una fecha y al menos un tipo para revisar las copias antiguas.';return;}review({before_date:before.value,types:deleteTypes.value});}
async function remove(){if(!confirmed.value||busy.value)return;busy.value='deleting';dialogError.value='';try{const removed=await deleteBackups(preview.value.token);preview.value=null;notice.value=removed.deleted+' copias borradas.'+(removed.pending?' '+removed.pending+' pendientes: el servicio volverá a intentar el borrado.':'');await readCopies();}catch(cause){if(preview.value)dialogError.value=automaticBackupError(cause);else error.value=automaticBackupError(cause);}finally{busy.value='';}}
onMounted(()=>refresh());onBeforeUnmount(()=>controller?.abort());
</script>
<template>
 <section class="panel automatic-backups" aria-labelledby="automatic-backups-title">
  <div class="automatic-heading"><div><h2 id="automatic-backups-title">Copias automáticas</h2><p class="muted">Todas las copias incluyen la empresa completa y todos sus ejercicios.</p></div><button class="button" :disabled="!!busy" @click="refresh(result.page)">Actualizar copias</button></div>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="notice" class="success-note" role="status">{{ notice }}</p>
  <p v-if="!loaded" class="muted">{{ busy?'Cargando programación…':'No se ha podido cargar la programación.' }}</p>
  <template v-else>
   <form @submit.prevent="save">
    <div class="backup-schedules"><fieldset v-for="row in schedules" :key="row.frequency" :disabled="!!busy||!can('accounting_write')" class="backup-schedule">
     <legend>{{ backupTypes[row.frequency] }}</legend>
     <label class="backup-check"><input v-model="row.enabled" type="checkbox" :name="'schedule_'+row.frequency">Activar copia {{ backupTypes[row.frequency].toLowerCase() }}</label>
     <label :for="'backup-time-'+row.frequency">Hora · {{ backupTypes[row.frequency] }}<input :id="'backup-time-'+row.frequency" v-model="row.run_time" type="time" required :disabled="!row.enabled"></label>
     <div v-if="row.frequency==='weekly'" class="backup-field"><label for="backup-weekday">Día de la semana</label><select id="backup-weekday" v-model.number="row.weekday" :disabled="!row.enabled"><option v-for="(day,index) in weekdays" :key="day" :value="index+1">{{ day }}</option></select></div>
     <div v-if="row.frequency==='monthly'" class="backup-field"><label for="backup-month-day">Día del mes</label><select id="backup-month-day" v-model.number="row.month_day" :disabled="!row.enabled"><option v-for="day in 31" :key="day" :value="day">{{ day }}</option></select></div>
     <p v-if="row.frequency==='monthly'" class="muted">Si el mes no tiene ese día, se usa el último día del mes.</p>
     <p class="backup-schedule-state"><strong>{{ row.enabled?'Activada':'Desactivada' }}</strong><span v-if="dirty">Cambios sin guardar</span><span v-else>Próxima: {{ instant(row.next_run_at) }}</span><span>Última automática: {{ instant(row.last_success_at) }}</span></p>
     <p v-if="row.last_error_code" class="error-notice" role="alert">{{ automaticBackupError({code:row.last_error_code}) }} Se reintentará en cinco minutos.</p>
    </fieldset></div>
    <div class="actions"><button class="button primary" :disabled="!!busy||!dirty||!can('accounting_write')">{{ busy==='saving'?'Guardando…':'Guardar programación' }}</button><span v-if="dirty" class="muted">Cambios pendientes de guardar</span></div>
   </form>
   <p class="backup-runtime muted">Horario de Madrid. El servicio de la aplicación debe estar en marcha. Al arrancar, hará una copia pendiente de cada tipo activado. Puedes activar varios tipos a la vez.</p>
   <p v-if="!running" class="notice" role="status">El programador no está en marcha. Inicia el servidor de la aplicación para ejecutar las copias automáticas.</p>
   <details class="backup-storage"><summary>Carpeta de copias en el equipo del servidor</summary><p>{{ storage }}</p><p class="muted">Puedes descargar cada archivo e importarlo desde «Importar datos».</p></details>
   <div class="backup-run actions"><label for="backup-run-type">Tipo de copia<select id="backup-run-type" v-model="runType" :disabled="!!busy"><option v-for="(name,key) in backupTypes" :key="key" :value="key">{{ name }}</option></select></label><button class="button" :disabled="!!busy||!can('accounting_write')" @click="run">{{ busy==='running'?'Creando copia completa…':'Crear copia ahora' }}</button><span class="muted">Se guarda en el servidor con el tipo seleccionado.</span></div>
   <h3>Copias guardadas</h3>
   <form class="backup-filter-fields" @submit.prevent="refresh()">
    <label for="backup-from">Desde<input id="backup-from" v-model="from" type="date" :max="to||undefined"></label><label for="backup-to">Hasta<input id="backup-to" v-model="to" type="date" :min="from||undefined"></label>
    <fieldset class="backup-type-filter"><legend>Tipos que se muestran</legend><label v-for="(name,key) in backupTypes" :key="key" class="backup-check"><input v-model="filterTypes" type="checkbox" :value="key" name="backup_list_type">{{ name }}</label></fieldset>
    <button class="button" :disabled="!!busy||!filterTypes.length">Filtrar copias</button>
   </form>
   <p class="muted" aria-live="polite">{{ result.total }} copias · Empresa: {{ company.name }}</p>
   <div v-if="result.copies.length" class="backup-table-scroll"><table class="backup-archive-table"><thead><tr><th>Fecha · Madrid</th><th>Tipo</th><th>Contenido</th><th>Tamaño</th><th>Acciones</th></tr></thead><tbody><tr v-for="copy in result.copies" :key="copy.id"><td>{{ instant(copy.created_at) }}<span class="backup-cell-detail">{{ copy.trigger_kind==='manual'?'Creada ahora':'Programada' }}</span></td><td>{{ backupTypes[copy.frequency] }}</td><td>Empresa completa<span class="backup-cell-detail">{{ copy.summary.exercises.join(', ') }}</span></td><td>{{ fileSize(copy.size_bytes) }}</td><td><div v-if="copy.status==='ready'" class="actions"><button class="button" :disabled="!!busy" :aria-label="'Descargar '+backupTypes[copy.frequency]+' '+instant(copy.created_at)" @click="download(copy)">Descargar</button><button class="button" :disabled="!!busy||!can('accounting_write')" :aria-label="'Borrar '+backupTypes[copy.frequency]+' '+instant(copy.created_at)" @click="review({ids:[copy.id]})">Borrar</button></div><span v-else>Borrado pendiente</span></td></tr></tbody></table></div>
   <p v-else class="backup-empty">No hay copias guardadas con estos filtros.</p>
   <div v-if="pages>1" class="actions backup-pagination"><button class="button" :disabled="!!busy||result.page===1" @click="refresh(result.page-1)">Anterior</button><span>Página {{ result.page }} de {{ pages }}</span><button class="button" :disabled="!!busy||result.page===pages" @click="refresh(result.page+1)">Siguiente</button></div>
   <div class="backup-cleanup"><h3>Borrar copias antiguas</h3><p class="muted">Se revisan las copias anteriores a la fecha indicada, solo de los tipos marcados.</p>
    <form class="backup-filter-fields" @submit.prevent="reviewOlder"><label for="backup-delete-before">Anteriores al<input id="backup-delete-before" v-model="before" type="date" required :disabled="!!busy||!can('accounting_write')"></label><fieldset class="backup-type-filter" :disabled="!!busy||!can('accounting_write')"><legend>Tipos que se borrarán</legend><label v-for="(name,key) in backupTypes" :key="key" class="backup-check"><input v-model="deleteTypes" type="checkbox" :value="key" name="backup_delete_type">{{ name }}</label></fieldset><button class="button" :disabled="!!busy||!deleteTypes.length||!can('accounting_write')">{{ busy==='preview'?'Revisando…':'Revisar copias para borrar' }}</button></form>
   </div>
  </template>
 </section>
 <FormDialog v-if="preview" class="backup-delete-dialog" title="Revisar borrado de copias" :busy="busy==='deleting'" @close="preview=null">
  <div class="backup-delete-body"><p><strong>{{ company.name }}</strong></p><p>{{ preview.count }} copias · {{ fileSize(preview.total_bytes) }}</p><p v-if="preview.filter.before_date">Anteriores al {{ reportDate(preview.filter.before_date) }} · {{ preview.filter.types.map(type=>backupTypes[type]).join(', ') }}.</p><p v-if="preview.count">Fechas: {{ reportDate(preview.oldest_date) }} — {{ reportDate(preview.newest_date) }}</p><p v-else>No hay copias que coincidan con esta selección.</p>
   <ul v-if="preview.copies.length"><li v-for="copy in preview.copies" :key="copy.id">{{ backupTypes[copy.frequency] }} · {{ instant(copy.created_at) }} · {{ fileSize(copy.size_bytes) }}</li></ul><p v-if="preview.count>20" class="muted">Se muestran las primeras 20 de {{ preview.count }} copias.</p>
   <p v-if="preview.count">El borrado elimina estos archivos del servidor de forma permanente.</p><p v-if="dialogError" class="notice error-notice" role="alert">{{ dialogError }}</p>
  </div>
  <form v-if="preview.count" class="backup-delete-actions" @submit.prevent="remove"><label class="backup-check"><input v-model="confirmed" type="checkbox" :disabled="!!busy">Confirmo borrar las {{ preview.count }} copias revisadas</label><div class="actions"><button class="button" type="button" :disabled="!!busy" @click="preview=null">Cancelar</button><button class="button danger" :disabled="!!busy||!confirmed">{{ busy==='deleting'?'Borrando…':'Borrar '+preview.count+' copias' }}</button></div></form>
 </FormDialog>
</template>
