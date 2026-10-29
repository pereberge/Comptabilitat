<script setup>
import {partyProfileFields} from '../../../shared/account-party.js';
import {partyText} from '../locales/parties.js';
const profile=defineModel({type:Object,required:true});
</script>
<template><div class="form-grid party-profile-grid"><label v-for="(max,key) in partyProfileFields" :key="key" :class="{'party-profile-wide':key==='address'}">{{ partyText.labels[key] }}<input v-model="profile[key]" :name="'party_'+key" :type="key==='email'?'email':key==='phone'?'tel':'text'" :maxlength="max" :required="key==='name'"></label></div></template>
<style scoped>
.party-profile-wide{grid-column:1/-1}.party-profile-grid{margin:12px 0}
</style>
