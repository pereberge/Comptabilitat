<script setup>
import { computed,onBeforeUnmount,ref,watch } from 'vue';
import { api } from '../services/accounting.js';
import { uploadDocument,documentationError,fileSize,previewDocumentCompany,needsCompanyReview } from '../services/documentation.js';
import { useContext } from '../composables/context.js';
import FormDialog from './FormDialog.vue';
import DocumentCompanyCheck from './DocumentCompanyCheck.vue';
import {documentFolders} from '../../../shared/document-folders.js';
const props=defineProps({document:Object,folder:{type:String,default:'general'}}),emit=defineEmits(['close','saved']);
const {company}=useContext();
const title=ref(props.document?.title||''),description=ref(props.document?.description||''),file=ref(null),busy=ref(false),error=ref('');let requestId=crypto.randomUUID();
const folder=ref(props.document?.folder||props.folder);
const check=ref(null),checking=ref(false),target=ref(''),confirmed=ref(false);let checkGeneration=0;
const destination=computed(()=>check.value&&[check.value.current_company,...check.value.matches].find(row=>String(row.id)===target.value));
const companyReady=computed(()=>folder.value!=='pending_invoices'||!!check.value&&!!target.value&&(!needsCompanyReview(check.value)||target.value!==String(company.value.id)||confirmed.value));
const saveLabel=computed(()=>folder.value==='pending_invoices'&&destination.value?.id!==company.value.id&&destination.value?((props.document?'Trasladar a ':'Guardar en ')+destination.value.name):folder.value==='pending_invoices'?'Guardar factura pendiente':'Guardar documento');
const formTitle=computed(()=>props.document?'Editar documentación':folder.value==='pending_invoices'?'Añadir factura pendiente':'Añadir documentación');
function changed(){requestId=crypto.randomUUID();}
function selected(event){file.value=event.target.files?.[0]||null;error.value='';requestId=crypto.randomUUID();if(file.value&&!title.value)title.value=file.value.name.replace(/\.[^.]+$/,'');}
async function checkCompany(){
 const ticket=++checkGeneration;check.value=null;confirmed.value=false;target.value='';checking.value=false;error.value='';
 if(folder.value!=='pending_invoices'||(!file.value&&!props.document))return;
 checking.value=true;
 try{const result=props.document?await api('/documentation/'+props.document.id+'/company-check',{method:'POST',timeoutMs:90000,body:{version:props.document.version}}):await previewDocumentCompany(file.value);if(ticket!==checkGeneration)return;check.value=result;target.value=result.suggested_company_id?String(result.suggested_company_id):'';}
 catch(cause){if(ticket===checkGeneration)error.value=documentationError(cause);}finally{if(ticket===checkGeneration)checking.value=false;}
}
watch([file,folder],checkCompany,{immediate:true});onBeforeUnmount(()=>checkGeneration++);
async function save(){if(busy.value||checking.value||!companyReady.value)return;busy.value=true;error.value='';try{const data={title:title.value,description:description.value,folder:folder.value,...(folder.value==='pending_invoices'?{target_company_id:Number(target.value),company_preview_hash:check.value.preview_hash,company_preview_token:check.value.token,confirm_company_mismatch:confirmed.value}:{})};const saved=props.document?await api('/documentation/'+props.document.id,{method:'PATCH',timeoutMs:90000,body:{...data,version:props.document.version}}):await uploadDocument(file.value,{...data,request_id:requestId});emit('saved',saved);}catch(cause){error.value=documentationError(cause);}finally{busy.value=false;}}
</script>
<template><FormDialog :title="formTitle" class="documentation-form" :busy="busy" @close="emit('close')"><p class="muted">{{ company.name }} · Archivo común de la empresa, disponible desde cualquier ejercicio.</p><p v-if="folder==='pending_invoices'" class="muted">La factura quedará guardada en pendientes para gestionarla cuando te vaya bien.</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
 <form @submit.prevent="save"><fieldset :disabled="busy||checking"><label v-if="!document">Archivo (hasta 10 MB)<input name="documentation_file" type="file" required @change="selected"></label><p v-if="file" class="muted">{{ file.name }} · {{ fileSize(file.size) }}</p><p v-if="document">{{ document.source_name }} · {{ fileSize(document.source_size) }}</p><label>Apartado<select v-model="folder" name="documentation_folder" @change="changed"><option v-for="(label,key) in documentFolders" :key="key" :value="key">{{ label }}</option></select></label><DocumentCompanyCheck v-if="folder==='pending_invoices'&&(file||document)" :check="check" :checking="checking" v-model:target="target" v-model:confirmed="confirmed" /><button v-if="folder==='pending_invoices'&&(file||document)" type="button" class="button" :disabled="busy||checking" @click="checkCompany">Volver a comprobar la empresa</button><label>Título<input v-model="title" name="documentation_title" maxlength="200" required @input="changed"></label><label>Descripción<textarea v-model="description" name="documentation_description" maxlength="4000" rows="6" placeholder="Contenido, referencia, fecha o palabras que te ayuden a encontrarlo" @input="changed"></textarea></label></fieldset><div class="actions"><button class="button primary" :disabled="busy||checking||!companyReady||(!document&&!file)">{{ busy?'Guardando…':saveLabel }}</button><button type="button" class="button" :disabled="busy" @click="emit('close')">Cancelar</button></div></form>
</FormDialog></template>
