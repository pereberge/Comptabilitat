<script setup>
import { computed,ref } from 'vue';
import { api } from '../services/accounting.js';
import { uploadDocument,documentationError,fileSize } from '../services/documentation.js';
import { useContext } from '../composables/context.js';
import FormDialog from './FormDialog.vue';
import {documentFolders} from '../../../shared/document-folders.js';
const props=defineProps({document:Object,folder:{type:String,default:'general'}}),emit=defineEmits(['close','saved']);
const {company}=useContext();
const title=ref(props.document?.title||''),description=ref(props.document?.description||''),file=ref(null),busy=ref(false),error=ref('');let requestId=crypto.randomUUID();
const folder=ref(props.document?.folder||props.folder);
const formTitle=computed(()=>props.document?'Editar documentación':folder.value==='pending_invoices'?'Añadir factura pendiente':'Añadir documentación');
function changed(){requestId=crypto.randomUUID();}
function selected(event){file.value=event.target.files?.[0]||null;error.value='';requestId=crypto.randomUUID();if(file.value&&!title.value)title.value=file.value.name.replace(/\.[^.]+$/,'');}
async function save(){if(busy.value)return;busy.value=true;error.value='';try{const data={title:title.value,description:description.value,folder:folder.value};const saved=props.document?await api('/documentation/'+props.document.id,{method:'PATCH',body:{...data,version:props.document.version}}):await uploadDocument(file.value,{...data,request_id:requestId});emit('saved',saved);}catch(cause){error.value=documentationError(cause);}finally{busy.value=false;}}
</script>
<template><FormDialog :title="formTitle" class="documentation-form" :busy="busy" @close="emit('close')"><p class="muted">{{ company.name }} · Archivo común de la empresa, disponible desde cualquier ejercicio.</p><p v-if="folder==='pending_invoices'" class="muted">La factura quedará guardada en pendientes para gestionarla cuando te vaya bien.</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
 <form @submit.prevent="save"><fieldset :disabled="busy"><label v-if="!document">Archivo (hasta 10 MB)<input name="documentation_file" type="file" required @change="selected"></label><p v-if="file" class="muted">{{ file.name }} · {{ fileSize(file.size) }}</p><p v-if="document">{{ document.source_name }} · {{ fileSize(document.source_size) }}</p><label>Apartado<select v-model="folder" name="documentation_folder" @change="changed"><option v-for="(label,key) in documentFolders" :key="key" :value="key">{{ label }}</option></select></label><label>Título<input v-model="title" name="documentation_title" maxlength="200" required @input="changed"></label><label>Descripción<textarea v-model="description" name="documentation_description" maxlength="4000" rows="6" placeholder="Contenido, referencia, fecha o palabras que te ayuden a encontrarlo" @input="changed"></textarea></label></fieldset><div class="actions"><button class="button primary" :disabled="busy||(!document&&!file)">{{ busy?'Guardando…':folder==='pending_invoices'?'Guardar factura pendiente':'Guardar documento' }}</button><button type="button" class="button" :disabled="busy" @click="emit('close')">Cancelar</button></div></form>
</FormDialog></template>
