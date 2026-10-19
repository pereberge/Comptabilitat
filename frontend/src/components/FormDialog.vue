<script setup>
import { onMounted, ref } from 'vue';
import { t } from '../locales/accounting.js';
defineProps({title:String,busy:Boolean});
const emit=defineEmits(['close']);
const dialog=ref(null);
onMounted(()=>dialog.value.showModal());
</script>
<template><dialog ref="dialog" class="form-dialog" :aria-label="title" @cancel.prevent="!busy && emit('close')"><div class="dialog-heading"><h2>{{ title }}</h2><button type="button" class="button" :disabled="busy" @click="emit('close')">{{ t.close }}</button></div><slot /></dialog></template>
