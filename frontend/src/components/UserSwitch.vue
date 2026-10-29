<script setup>
import {ref} from 'vue';
import {useAccess} from '../composables/access.js';
import {accessError} from '../services/access-errors.js';
import FormDialog from './FormDialog.vue';
import {normalizePassword} from '../../../shared/access-passwords.js';
const {user,can,logout,changePassword}=useAccess();
const dialog=ref(false),busy=ref(false),error=ref(''),notice=ref(''),current=ref(''),password=ref(''),repeat=ref('');
function close(){dialog.value=false;current.value='';password.value='';repeat.value='';error.value='';}
async function exit(){if(busy.value)return;busy.value=true;error.value='';try{await logout();}catch(cause){error.value=accessError(cause)||'No s’ha pogut tancar la sessió.';}finally{busy.value=false;}}
async function savePassword(){if(busy.value)return;if(normalizePassword(password.value)!==normalizePassword(repeat.value)){error.value='Les contrasenyes no coincideixen.';return;}busy.value=true;error.value='';try{await changePassword(current.value,password.value);close();notice.value='Contrasenya actualitzada.';}catch(cause){error.value=accessError(cause)||'No s’ha pogut canviar la contrasenya.';}finally{busy.value=false;}}
</script>
<template><div class="user-switch"><strong>{{ user?.name }}</strong><span class="muted">{{ user?.role==='master'?'Màster':user?.username }}</span><RouterLink v-if="can('users_manage')" to="/usuarios">Usuaris</RouterLink><button class="button" :disabled="busy" @click="dialog=true;error='';notice=''">Contrasenya</button><button class="button" :disabled="busy" @click="exit">Tancar sessió</button><span v-if="notice" role="status">{{ notice }}</span><span v-if="error&&!dialog" role="alert">{{ error }}</span></div><FormDialog v-if="dialog" title="Canviar la contrasenya" class="access-dialog" :busy="busy" @close="close"><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><form class="access-form" @submit.prevent="savePassword"><label>Contrasenya actual<input v-model="current" name="current_password" type="password" autocomplete="current-password" required :disabled="busy"></label><label>Contrasenya nova<input v-model="password" name="new_password" type="password" autocomplete="new-password" minlength="1" maxlength="128" required :disabled="busy"></label><label>Repetir contrasenya<input v-model="repeat" name="new_password_repeat" type="password" autocomplete="new-password" minlength="1" maxlength="128" required :disabled="busy"></label><button class="button primary" :disabled="busy">Guardar contrasenya</button></form></FormDialog></template>
