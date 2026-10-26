<script setup>
import {computed,onMounted,ref,watch} from 'vue';
import {useAccess} from '../composables/access.js';
import {accessError} from '../services/access-errors.js';
import {editablePermissions} from '../../../shared/access-permissions.js';
const {user,users,can,listUsers,updateUser,changePassword}=useAccess();
const profiles=ref([]),busy=ref(false),loading=ref(false),error=ref(''),notice=ref('');
const current=ref(''),password=ref(''),repeat=ref('');
const rows=computed(()=>can('users_manage')?profiles.value:users.value);
async function load(){if(!can('users_manage'))return;loading.value=true;try{profiles.value=await listUsers();}catch(cause){error.value=accessError(cause)||'No se han podido cargar los usuarios.';}finally{loading.value=false;}}
onMounted(load);
watch(()=>can('users_manage'),()=>{profiles.value=[];load();});
async function save(profile){
 busy.value=true;error.value='';notice.value='';
 try{const body={name:profile.name};if(profile.role==='user')body.permissions=Object.fromEntries(editablePermissions.map(item=>[item.key,profile.permissions[item.key]]));profiles.value=await updateUser(profile.key,body);notice.value='Usuario y permisos guardados.';}
 catch(cause){error.value=accessError(cause)||'No se han podido guardar los permisos.';}finally{busy.value=false;}
}
async function updatePassword(){
 error.value='';notice.value='';if(password.value!==repeat.value){error.value='Las contraseñas no coinciden.';return;}busy.value=true;
 try{await changePassword(current.value,password.value);notice.value='Contraseña actualizada. Las demás sesiones de máster se han cerrado.';}
 catch(cause){error.value=accessError(cause)||'No se ha podido cambiar la contraseña.';}finally{busy.value=false;current.value='';password.value='';repeat.value='';}
}
</script>
<template>
 <div class="page-heading"><div><h1>Usuarios y permisos</h1><p class="muted">Dos perfiles para todas las empresas. Cambia de usuario desde la barra superior.</p></div></div>
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p>
 <p v-if="!can('users_manage')" class="notice access-note">Selecciona el máster e introduce su contraseña para modificar los nombres y los permisos. Las acciones con código 96 están reservadas al máster: borrar facturas y recibos, vaciar ejercicios y sustituir datos al restaurar copias.</p>
 <p v-if="loading" role="status">Cargando usuarios…</p>
 <div class="access-profiles">
  <section v-for="profile in rows" :key="profile.key" class="panel access-profile" :data-user-key="profile.key">
   <div class="access-profile-heading"><h2>{{ profile.name }}</h2><span class="badge" :class="profile.role==='master'?'badge-open':'badge-closed'">{{ profile.role==='master'?'Máster':'Usuario' }}{{ user.key===profile.key?' · Activo':'' }}</span></div>
   <form v-if="can('users_manage')" class="access-form" @submit.prevent="save(profile)">
    <label>Nombre<input v-model="profile.name" :name="profile.key+'_name'" maxlength="60" required :disabled="busy"></label>
    <fieldset :disabled="busy||profile.role==='master'"><legend>Permisos</legend>
     <label v-for="item in editablePermissions" :key="item.key" class="access-permission"><input v-model="profile.permissions[item.key]" :name="item.key" type="checkbox"><span><strong>{{ item.label }}</strong><small>{{ item.help }}</small></span></label>
     <label class="access-permission"><input type="checkbox" :checked="profile.role==='master'" disabled><span><strong>Acciones con código 96</strong><small>Exclusivo del máster: borrar facturas y recibos, vaciar ejercicios y sustituir datos al restaurar copias.</small></span></label>
     <label class="access-permission"><input type="checkbox" :checked="profile.role==='master'" disabled><span><strong>Gestionar usuarios y permisos</strong><small>Exclusivo del máster.</small></span></label>
    </fieldset>
    <p v-if="profile.role==='master'" class="muted">El máster conserva todos los permisos.</p>
    <button class="button primary" :disabled="busy">Guardar {{ profile.role==='master'?'nombre':'usuario y permisos' }}</button>
   </form>
   <template v-else><p class="muted">{{ profile.role==='master'?'Acceso con contraseña. Dispone de todos los permisos.':'Permisos configurados por el máster.' }}</p><ul v-if="profile.key===user.key"><li v-for="item in editablePermissions" :key="item.key">{{ item.label }}: {{ can(item.key)?'Permitido':'No permitido' }}</li></ul></template>
  </section>
 </div>
 <section v-if="can('users_manage')" class="panel access-password"><h2>Cambiar contraseña del máster</h2>
  <form class="access-form" @submit.prevent="updatePassword"><label>Contraseña actual<input v-model="current" name="current_password" type="password" autocomplete="current-password" maxlength="128" :disabled="busy" required></label><label>Nueva contraseña<input v-model="password" name="new_password" type="password" autocomplete="new-password" minlength="8" maxlength="128" :disabled="busy" required></label><label>Repetir nueva contraseña<input v-model="repeat" name="new_password_repeat" type="password" autocomplete="new-password" minlength="8" maxlength="128" :disabled="busy" required></label><button class="button" :disabled="busy">Cambiar contraseña</button></form>
 </section>
</template>
