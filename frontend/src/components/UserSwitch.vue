<script setup>
import {ref} from 'vue';
import {useAccess} from '../composables/access.js';
import {accessError} from '../services/access-errors.js';
import FormDialog from './FormDialog.vue';
const {user,users,session,loading,switchUser}=useAccess();
const dialog=ref(false),busy=ref(false),error=ref(''),password=ref(''),repeat=ref(''),setup=ref(false);
function close(){dialog.value=false;password.value='';repeat.value='';error.value='';}
async function select(event){
 const key=event.target.value;event.target.value=user.value?.key||'user';if(key===user.value?.key)return;
 error.value='';if(key==='master'){setup.value=!!session.value.master_setup_required;password.value='';repeat.value='';dialog.value=true;return;}
 busy.value=true;try{await switchUser('user');}catch(cause){error.value=accessError(cause)||'No se ha podido cambiar de usuario.';}finally{busy.value=false;}
}
async function enter(){
 if(busy.value)return;if(setup.value&&password.value!==repeat.value){error.value='Las contraseñas no coinciden.';return;}
 busy.value=true;error.value='';try{await switchUser('master',password.value,setup.value);close();}catch(cause){error.value=accessError(cause)||'No se ha podido entrar como máster.';password.value='';repeat.value='';}finally{busy.value=false;}
}
</script>
<template>
 <div class="user-switch"><label for="active-user">Usuario</label><select id="active-user" :value="user?.key||'user'" :disabled="loading||busy||!user" @change="select"><option v-for="item in users" :key="item.key" :value="item.key">{{ item.name }}{{ item.role==='master'&&!['master','máster'].includes(item.name.toLowerCase())?' · Máster':'' }}</option></select><RouterLink to="/usuarios">Permisos</RouterLink><span v-if="error&&!dialog" role="alert">{{ error }}</span></div>
 <FormDialog v-if="dialog" class="access-dialog" :title="setup?'Definir contraseña del máster':'Entrar como máster'" :busy="busy" @close="close">
  <form class="access-form" @submit.prevent="enter">
   <p class="muted">{{ setup?'Crea la contraseña que usarás para acceder al máster y gestionar los permisos.':'Introduce la contraseña para cambiar al perfil máster.' }}</p>
   <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
   <label>{{ setup?'Nueva contraseña':'Contraseña' }}<input v-model="password" name="master_password" type="password" :autocomplete="setup?'new-password':'current-password'" :minlength="setup?8:undefined" maxlength="128" :disabled="busy" required autofocus></label>
   <label v-if="setup">Repetir contraseña<input v-model="repeat" name="master_password_repeat" type="password" autocomplete="new-password" minlength="8" maxlength="128" :disabled="busy" required></label>
   <p v-if="setup" class="muted">Entre 8 y 128 caracteres.</p>
   <div class="actions"><button type="button" class="button" :disabled="busy" @click="close">Cancelar</button><button class="button primary" :disabled="busy">{{ busy?'Comprobando…':setup?'Guardar y entrar':'Entrar como máster' }}</button></div>
  </form>
 </FormDialog>
</template>
