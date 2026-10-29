<script setup>
import {computed,onMounted,ref} from 'vue';
import {useAccess} from '../composables/access.js';
import {api} from '../services/accounting.js';
import {accessError} from '../services/access-errors.js';
import {editablePermissions} from '../../../shared/access-permissions.js';
import FormDialog from '../components/FormDialog.vue';
import {normalizePassword} from '../../../shared/access-passwords.js';
const {can,listUsers,createUser,updateUser,deleteUser}=useAccess();
const profiles=ref([]),companies=ref([]),loading=ref(false),busy=ref(false),error=ref(''),notice=ref('');
const editor=ref(null),removing=ref(null),formError=ref(''),search=ref(''),changingPassword=ref(false);
const availableCompanies=computed(()=>companies.value.filter(company=>(company.name+' '+(company.tax_id||'')).toLocaleLowerCase().includes(search.value.toLocaleLowerCase())));
const companyNames=computed(()=>new Map(companies.value.map(company=>[company.id,company.name])));
async function load(){
 if(!can('users_manage'))return;loading.value=true;error.value='';
 try{[profiles.value,companies.value]=await Promise.all([listUsers(),api('/companies')]);}
 catch(cause){error.value=accessError(cause)||'No s’han pogut carregar els usuaris.';}finally{loading.value=false;}
}
onMounted(load);
function open(profile){
 formError.value='';search.value='';notice.value='';changingPassword.value=false;
 editor.value=profile?{...profile,email:profile.email||'',permissions:{...profile.permissions},company_ids:[...(profile.company_ids||[])],password:'',repeat:''}:{key:null,username:'',name:'',email:'',role:'user',active:true,password:'',repeat:'',password_set:false,company_ids:[],permissions:Object.fromEntries(editablePermissions.map(item=>[item.key,item.key==='accounting_write']))};
}
function close(){editor.value=null;removing.value=null;formError.value='';changingPassword.value=false;}
function cancelPasswordChange(){changingPassword.value=false;editor.value.password='';editor.value.repeat='';formError.value='';}
async function save(){
 if(busy.value)return;formError.value='';const profile=editor.value;
 const writesPassword=!profile.key||changingPassword.value;
 if(writesPassword&&normalizePassword(profile.password)!==normalizePassword(profile.repeat)){formError.value='Les contrasenyes no coincideixen.';return;}
 busy.value=true;
 try{
  let body={name:profile.name,email:profile.email,version:profile.version};
  if(profile.role!=='master'){
   body={username:profile.username,name:profile.name,email:profile.email,active:profile.active,permissions:Object.fromEntries(editablePermissions.map(item=>[item.key,profile.permissions[item.key]])),company_ids:profile.company_ids};
   if(writesPassword&&profile.password)body.password=profile.password;
   if(profile.key)body.version=profile.version;
  }
  if(profile.key)await updateUser(profile.key,body);else await createUser(body);
  close();notice.value=profile.key?'Usuari actualitzat.':'Usuari creat.';await load();
 }catch(cause){formError.value=accessError(cause)||'No s’ha pogut guardar l’usuari.';}finally{busy.value=false;}
}
async function remove(){
 if(busy.value)return;busy.value=true;formError.value='';
 try{await deleteUser(removing.value.key,removing.value.version);close();notice.value='Usuari eliminat.';await load();}
 catch(cause){formError.value=accessError(cause)||'No s’ha pogut eliminar l’usuari.';}finally{busy.value=false;}
}
</script>
<template>
 <div class="page-heading"><div><h1>Gestió d’usuaris</h1><p class="muted">Cada usuari accedeix només a les empreses que li assignis. El màster pot gestionar tots els usuaris i empreses.</p></div><button v-if="can('users_manage')" class="button primary" :disabled="loading||busy" @click="open()">Nou usuari</button></div>
 <p v-if="error" role="alert" class="notice error-notice">{{ error }} <button class="button" @click="load">Tornar a provar</button></p>
 <p v-if="notice" role="status" class="success-note">{{ notice }}</p>
 <p v-if="!can('users_manage')" class="notice access-note">Només el màster pot gestionar els usuaris.</p>
 <p v-else-if="loading" role="status">Carregant usuaris…</p>
 <template v-else>
  <p class="notice access-note">Només el màster pot esborrar apunts comptables, factures i rebuts, buidar exercicis o substituir dades en restaurar una còpia.</p>
  <div class="table-wrap users-table-wrap"><table class="users-table"><thead><tr><th>Usuari</th><th>Perfil</th><th>Estat</th><th>Empreses assignades</th><th>Accions</th></tr></thead><tbody>
   <tr v-for="profile in profiles" :key="profile.key" :data-user-key="profile.key"><td><strong>{{ profile.name }}</strong><small>{{ profile.username }}</small><small v-if="profile.email">{{ profile.email }}</small></td><td>{{ profile.role==='master'?'Màster':'Usuari' }}</td><td>{{ !profile.active?'Desactivat':!profile.password_set?'Cal definir una contrasenya':'Actiu' }}</td><td>{{ profile.role==='master'?'Totes les empreses':profile.company_ids.length?profile.company_ids.map(id=>companyNames.get(id)||id).join(', '):'Cap empresa assignada' }}</td><td><div class="actions"><button class="button" :aria-label="'Editar '+profile.username" @click="open(profile)">Editar</button><button v-if="profile.role!=='master'" class="button danger" :aria-label="'Eliminar '+profile.username" @click="removing=profile;formError=''">Eliminar</button></div></td></tr>
  </tbody></table></div>
 </template>
 <FormDialog v-if="editor" class="user-editor" :title="editor.key?'Editar usuari':'Nou usuari'" :busy="busy" @close="close">
  <p v-if="formError" role="alert" class="notice error-notice">{{ formError }}</p>
  <form class="access-form" @submit.prevent="save">
   <label>Nom<input v-model="editor.name" name="name" autocomplete="off" maxlength="60" required :disabled="busy"></label>
   <label>Correu electrònic (opcional)<input v-model="editor.email" name="email" type="email" autocomplete="email" maxlength="254" :disabled="busy"></label>
   <label>Usuari d’accés<input v-model="editor.username" name="username" autocomplete="off" minlength="3" maxlength="80" pattern="[a-zA-Z0-9][a-zA-Z0-9._@+\-]{2,79}" required :disabled="busy||editor.role==='master'"><small v-if="editor.role!=='master'">Lletres sense accents, números, punts, guions o correu electrònic. S’utilitza per iniciar sessió.</small></label>
   <p v-if="editor.role==='master'" class="notice">El màster té accés a totes les empreses i tots els permisos. Pots canviar la seva contrasenya des de la barra superior.</p>
   <template v-else>
    <div v-if="editor.key"><button v-if="!changingPassword" type="button" class="button" :disabled="busy" @click="changingPassword=true">{{ editor.password_set?'Canviar contrasenya':'Definir contrasenya' }}</button><button v-else type="button" class="button" :disabled="busy" @click="cancelPasswordChange">Cancel·lar canvi de contrasenya</button></div>
    <template v-if="!editor.key||changingPassword">
     <label>{{ editor.key?'Contrasenya nova':'Contrasenya' }}<input v-model="editor.password" name="password" type="password" autocomplete="new-password" minlength="1" maxlength="128" required :disabled="busy"><small>{{ editor.key?'Canviar-la tanca totes les sessions de l’usuari.':'Entre 1 i 128 caràcters. No distingeix majúscules i minúscules.' }}</small></label>
     <label>Repetir contrasenya<input v-model="editor.repeat" name="repeat_password" type="password" autocomplete="new-password" maxlength="128" required :disabled="busy"></label>
    </template>
    <label class="access-permission"><input v-model="editor.active" name="active" type="checkbox" :disabled="busy"><span>Usuari actiu<small>Desactivar-lo impedeix iniciar sessió i tanca les sessions obertes.</small></span></label>
    <fieldset :disabled="busy"><legend>Empreses a què pot accedir ({{ editor.company_ids.length }})</legend>
     <input v-model="search" class="company-search" type="search" aria-label="Buscar empresa" placeholder="Buscar empresa">
     <div class="user-companies"><label v-for="company in availableCompanies" :key="company.id" class="user-company"><input v-model="editor.company_ids" type="checkbox" :value="company.id" :aria-label="'Accés a '+company.name"><span>{{ company.name }}<small v-if="company.tax_id"> · {{ company.tax_id }}</small></span></label><p v-if="!availableCompanies.length" class="muted">No s’han trobat empreses.</p></div>
     <small class="muted">Sense empreses assignades, l’usuari pot iniciar sessió però no veu dades comptables.</small>
    </fieldset>
    <fieldset :disabled="busy"><legend>Permisos a les empreses assignades</legend><label v-for="item in editablePermissions" :key="item.key" class="access-permission"><input v-model="editor.permissions[item.key]" :name="item.key" type="checkbox"><span><strong>{{ item.label }}</strong><small>{{ item.help }}</small></span></label></fieldset>
   </template>
   <div class="form-actions"><button class="button" type="button" :disabled="busy" @click="close">Cancel·lar</button><button class="button primary" :disabled="busy">{{ busy?'Guardant…':'Guardar usuari' }}</button></div>
  </form>
 </FormDialog>
 <FormDialog v-if="removing" title="Eliminar usuari" :busy="busy" @close="close"><p>Vols eliminar l’usuari <strong>{{ removing.name }} ({{ removing.username }})</strong>? Es tancaran les seves sessions. Les dades comptables de les empreses es conserven.</p><p v-if="formError" role="alert" class="notice error-notice">{{ formError }}</p><div class="form-actions"><button class="button" :disabled="busy" @click="close">Cancel·lar</button><button class="button danger" :disabled="busy" @click="remove">Eliminar usuari</button></div></FormDialog>
</template>
