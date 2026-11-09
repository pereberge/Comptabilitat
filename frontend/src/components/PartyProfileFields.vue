<script setup>
import {useId} from 'vue';
import {partyProfileFields} from '../../../shared/account-party.js';
import {partyText} from '../locales/parties.js';
defineProps({errors:{type:Object,default:()=>({})}});
const validationId=useId();
const profile=defineModel({type:Object,required:true});
</script>
<template><div class="form-grid party-profile-grid"><label v-for="(max,key) in partyProfileFields" :key="key" :class="{'party-profile-wide':key==='address'}">{{ partyText.labels[key] }}<input v-model="profile[key]" :name="'party_'+key" :type="key==='email'?'email':key==='phone'?'tel':'text'" :maxlength="max" :required="key==='name'" :aria-invalid="errors[key]?'true':undefined" :aria-describedby="errors[key]?validationId+'-'+key:undefined"><small v-if="errors[key]" :id="validationId+'-'+key" class="invoice-field-error">{{ errors[key] }}</small></label></div></template>
<style scoped>
.party-profile-wide{grid-column:1/-1}.party-profile-grid{margin:12px 0}
</style>
