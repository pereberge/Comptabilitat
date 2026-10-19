<script setup>
import {computed,ref} from 'vue';
import {useContext} from '../composables/context.js';
import {api} from '../services/accounting.js';
import {previewPdf} from '../services/account-import.js';
import {errorText} from '../locales/accounting.js';
import {imp} from '../locales/account-import.js';
import FormDialog from './FormDialog.vue';
const emit=defineEmits(['close','imported']);
const {company}=useContext();
const file=ref(null),prefix=ref(4),preview=ref(null),busy=ref(false),error=ref(''),confirmed=ref(false),result=ref(null);
const counts=computed(()=>Object.fromEntries(['new','existing','duplicate','invalid'].map(status=>[status,preview.value?.rows.filter(row=>row.status===status).length||0])));
function reset(){preview.value=null;confirmed.value=false;result.value=null;error.value='';}
function selectFile(event){file.value=event.target.files[0]||null;reset();}
function message(e){return imp.errors[e.code]||errorText(e);}
async function inspect(){reset();if(!file.value)return;if(file.value.size>5*1024*1024){error.value=imp.errors.TOO_LARGE;return;}busy.value=true;try{preview.value=await previewPdf(file.value,prefix.value);}catch(e){error.value=message(e);}finally{busy.value=false;}}
async function commit(){busy.value=true;error.value='';try{result.value=await api('/account-import/commit',{method:'POST',body:{token:preview.value.token}});emit('imported');}catch(e){error.value=message(e);}finally{busy.value=false;}}
</script>
<template>
 <FormDialog :title="imp.title" :busy="busy" @close="emit('close')">
  <p class="muted">{{ imp.help }}</p><p><strong>{{ imp.destination }}: {{ company.name }}</strong></p>
  <form class="filters" @submit.prevent="inspect">
   <label>{{ imp.file }}<input type="file" accept="application/pdf,.pdf" :disabled="busy" required @change="selectFile"></label>
   <label>{{ imp.prefix }}<input v-model="prefix" type="number" min="3" :max="company.subaccount_length-1" required :disabled="busy" @input="reset"></label>
   <button class="button" :disabled="busy||!file">{{ imp.preview }}</button>
  </form>
  <p class="muted">{{ imp.split }}</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
  <p v-if="busy" role="status">{{ imp.processing }}</p>
  <template v-if="preview">
   <p>{{ imp.source }}: <strong>{{ preview.source_company || '—' }}</strong> · {{ imp.pages }}: {{ preview.pages }} · {{ imp.records }}: {{ preview.rows.length }}</p>
   <p class="import-summary"><span v-for="status in ['new','existing','duplicate','invalid']" :key="status">{{ imp[status] }}: <strong>{{ counts[status] }}</strong></span></p>
   <details v-if="preview.parents.length"><summary>{{ imp.parents }}: {{ preview.parents.length }}</summary><p>{{ preview.parents.join(', ') }}</p></details>
   <div class="table-wrap import-preview"><table><thead><tr><th>{{ imp.page }}</th><th>{{ imp.code }}</th><th>{{ imp.suffix }}</th><th>{{ imp.description }}</th><th>{{ imp.state }}</th></tr></thead><tbody>
    <tr v-for="(row,index) in preview.rows" :key="index"><td>{{ row.page }}</td><td>{{ row.parent_code }}</td><td>{{ row.suffix }}</td><td>{{ row.description }}<small v-if="row.existing_description&&row.existing_description!==row.description" class="muted">{{ imp.existingDescription }}: {{ row.existing_description }}</small></td><td><strong>{{ imp[row.status] }}</strong><small v-if="row.reason">{{ imp.reasons[row.reason] }}</small></td></tr>
   </tbody></table></div>
   <p class="muted">{{ imp.preserve }}</p>
   <p v-if="counts.invalid" role="alert" class="notice error-notice">{{ imp.invalidRows }}</p>
   <p v-if="result" class="success-note" role="status">{{ imp.imported }}: {{ result.imported }} · {{ imp.skipped }}: {{ result.skipped }}</p>
   <template v-else><label class="import-confirm"><input v-model="confirmed" type="checkbox" :disabled="busy">{{ imp.confirm }}</label><button class="button primary" :disabled="busy||!confirmed||!counts.new||!!counts.invalid" @click="commit">{{ imp.create }} ({{ counts.new }})</button></template>
  </template>
 </FormDialog>
</template>
