<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAccess} from '../composables/access.js';
import {useContext} from '../composables/context.js';
import {api} from '../services/accounting.js';
import {documentationError,downloadFile,fileSize,canTransferInvoice,transferDocumentInvoice,documentCompanyMessage,needsCompanyReview} from '../services/documentation.js';
import {documentFolders} from '../../../shared/document-folders.js';
import DocumentationForm from '../components/DocumentationForm.vue';
import FormDialog from '../components/FormDialog.vue';
const {can}=useAccess(),{company,selectedId,selectCompany}=useContext(),router=useRouter(),route=useRoute();
const routeFolder=()=>typeof route.query.folder==='string'&&Object.hasOwn(documentFolders,route.query.folder)?route.query.folder:'general';
const rows=ref([]),folder=ref(routeFolder()),search=ref(''),loading=ref(false),error=ref(''),notice=ref(''),savedDestination=ref(null);
const editing=ref(null),adding=ref(false),removing=ref(null),busy=ref(false),downloading=ref(null);let generation=0;
const invoices=computed(()=>folder.value!=='general');
const addLabel=computed(()=>invoices.value?'Añadir factura pendiente':'Añadir documento');
async function load(){
 const ticket=++generation;loading.value=true;error.value='';
 try{const data=await api('/documentation?'+new URLSearchParams({search:search.value,folder:folder.value}));if(ticket===generation)rows.value=data;}
 catch(cause){if(ticket===generation)error.value=documentationError(cause);}
 finally{if(ticket===generation)loading.value=false;}
}
function selectFolder(value){if(value===folder.value)return;folder.value=value;search.value='';rows.value=[];notice.value='';savedDestination.value=null;void router.replace({query:{...route.query,folder:value}});void load();}
async function saved(row){
 editing.value=null;adding.value=false;search.value='';folder.value=row.folder||'general';
 if(routeFolder()!==folder.value)void router.replace({query:{...route.query,folder:folder.value}});
 savedDestination.value=row.reassigned?{id:row.company_id,name:row.destination_company.name}:null;
 notice.value=row.reassigned?'Factura guardada en las facturas pendientes de '+row.destination_company.name+'.':row.folder==='pending_invoices'?'Factura guardada en pendientes. Puedes abrirla y gestionarla más adelante.':'Documento guardado.';
 await load();
}
async function openDestination(){const target=savedDestination.value;if(!target||busy.value)return;busy.value=true;try{await selectCompany(String(target.id));if(company.value?.id===target.id)await router.push({name:'documentation',query:{folder:'pending_invoices'}});}finally{busy.value=false;}}
async function download(row){if(downloading.value)return;downloading.value=row.id;error.value='';try{await downloadFile('/documentation/'+row.id+'/source',row.source_name);}catch(cause){error.value=documentationError(cause);}finally{downloading.value=null;}}
async function manage(row){
 if(busy.value||!can('accounting_write'))return;busy.value=true;error.value='';
 try{
  const managed=row.folder==='pending_invoices';
  await api('/documentation/'+row.id+'/manage',{method:'POST',body:{version:row.version,managed}});
  notice.value=managed?'Factura marcada como gestionada. La encontrarás en «Facturas gestionadas».':'Factura devuelta a «Facturas pendientes de gestionar».';
  await load();
 }catch(cause){error.value=documentationError(cause);}finally{busy.value=false;}
}
async function toInvoices(row){
 if(busy.value||!can('accounting_write')||!selectedId.value)return;busy.value=true;error.value='';
 try{const result=await transferDocumentInvoice(row,selectedId.value);await router.push({name:'invoices',query:{document_id:String(result.id),exercise_id:String(result.exercise_id)}});}
 catch(cause){error.value=documentationError(cause);}finally{busy.value=false;}
}
async function remove(){if(busy.value||!can('accounting_write'))return;busy.value=true;error.value='';try{await api('/documentation/'+removing.value.id,{method:'DELETE',body:{version:removing.value.version}});removing.value=null;notice.value='Documento borrado.';await load();}catch(cause){error.value=documentationError(cause);removing.value=null;}finally{busy.value=false;}}
watch(()=>company.value?.id,()=>{generation++;rows.value=[];search.value='';notice.value='';savedDestination.value=null;editing.value=null;adding.value=false;removing.value=null;if(company.value?.id)void load();},{immediate:true});
watch(()=>route.query.folder,()=>{const value=routeFolder();if(value!==folder.value){folder.value=value;rows.value=[];search.value='';notice.value='';savedDestination.value=null;void load();}});
onBeforeUnmount(()=>generation++);
</script>
<template>
 <div class="page-heading"><div><h1>Documentación</h1><p class="muted">Archivo de {{ company?.name }}.</p></div><button :disabled="!can('accounting_write')||busy" class="button primary" @click="adding=true">{{ addLabel }}</button></div>
 <nav class="documentation-tabs" aria-label="Apartados de documentación"><button v-for="(label,key) in documentFolders" :key="key" class="button" :class="{primary:folder===key}" :aria-pressed="folder===key" :disabled="busy" @click="selectFolder(key)">{{ label }}</button></nav>
 <section class="documentation-section" :aria-label="documentFolders[folder]">
  <h2>{{ documentFolders[folder] }}</h2>
  <p v-if="folder==='pending_invoices'" class="muted">Guarda aquí las facturas para gestionarlas cuando te vaya bien. Cuando termines, márcalas como gestionadas para conservar el original en su apartado.</p>
  <p v-else-if="folder==='managed_invoices'" class="muted">Facturas que ya has marcado como gestionadas. Puedes volver a dejarlas pendientes si queda algo por revisar.</p>
  <p v-else class="muted">Guarda contratos, justificantes y otros documentos con su descripción.</p>
  <p class="muted">Disponible en todos los ejercicios de esta empresa.</p>
  <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }} <button v-if="savedDestination" class="button" :disabled="busy" @click="openDestination">Abrir documentación de {{ savedDestination.name }}</button></p>
  <form class="filters" @submit.prevent="load"><label>{{ invoices?'Buscar facturas':'Buscar documentación' }}<input v-model="search" type="search" name="documentation_search" maxlength="200" placeholder="Título, descripción o nombre del archivo"></label><button class="button" :disabled="loading||busy">Buscar</button><button v-if="search" type="button" class="button" :disabled="loading||busy" @click="search='';load()">Ver todos</button></form>
  <p v-if="loading" role="status">Cargando documentación…</p>
  <div v-else class="table-wrap panel"><table class="documentation-table"><thead><tr><th>{{ invoices?'Factura':'Documento' }}</th><th>Descripción</th><th>Guardado</th><th>Acciones</th></tr></thead><tbody>
   <tr v-for="row in rows" :key="row.id" :data-documentation-id="row.id"><td><strong>{{ row.title }}</strong><small class="trade-cell-note">{{ row.source_name }} · {{ fileSize(row.source_size) }}</small><p v-if="needsCompanyReview(row.company_check)" class="documentation-owner-warning">{{ documentCompanyMessage(row.company_check) }}</p><small v-else-if="row.company_check?.status==='unknown'" class="trade-cell-note">Empresa sin verificar · revisa el original.</small></td><td class="documentation-description">{{ row.description||'Sin descripción' }}</td><td>{{ new Date(row.created_at).toLocaleDateString('es-ES') }}</td><td><div class="actions">
    <button class="button" :disabled="!!downloading||busy" @click="download(row)">{{ downloading===row.id?'Descargando…':'Abrir / descargar' }}</button>
    <button v-if="needsCompanyReview(row.company_check)" class="button primary" :disabled="!can('accounting_write')||busy" @click="editing=row">Revisar empresa</button>
    <button v-if="row.folder!=='general'&&canTransferInvoice(row)" class="button primary" :disabled="!can('accounting_write')||busy||!selectedId||needsCompanyReview(row.company_check)" @click="toInvoices(row)">{{ busy?'Procesando…':'Pasar a Facturas' }}</button>
    <button v-if="row.folder!=='general'" class="button" :class="{primary:row.folder==='pending_invoices'}" :disabled="!can('accounting_write')||busy||needsCompanyReview(row.company_check)" @click="manage(row)">{{ row.folder==='pending_invoices'?'Marcar gestionada':'Volver a pendientes' }}</button>
    <button :disabled="!can('accounting_write')||busy" class="button" @click="editing=row">Editar</button><button :disabled="!can('accounting_write')||busy" class="button clear-danger" @click="removing=row">Borrar</button>
   </div></td></tr>
   <tr v-if="!rows.length"><td colspan="4" class="empty-cell">{{ search?'No hay documentos que coincidan con la búsqueda.':folder==='pending_invoices'?'No hay facturas pendientes de gestionar. Usa «Añadir factura pendiente» para guardar una.':folder==='managed_invoices'?'Todavía no hay facturas marcadas como gestionadas.':'Todavía no hay documentos. Usa «Añadir documento» para guardar el primero.' }}</td></tr>
  </tbody></table></div>
 </section>
 <DocumentationForm v-if="adding||editing" :document="editing" :folder="invoices?'pending_invoices':'general'" @close="adding=false;editing=null" @saved="saved" />
 <FormDialog v-if="removing" title="Borrar documento" :busy="busy" @close="removing=null"><p>¿Borrar «{{ removing.title }}» y su archivo original de {{ company?.name }}?</p><div class="actions"><button class="button clear-danger" :disabled="busy||!can('accounting_write')" @click="remove">{{ busy?'Borrando…':'Borrar documento' }}</button><button class="button" :disabled="busy" @click="removing=null">Cancelar</button></div></FormDialog>
</template>
<style scoped>.documentation-owner-warning{font-size:12px;color:#a13925;margin-top:8px;max-width:400px;white-space:normal}</style>
