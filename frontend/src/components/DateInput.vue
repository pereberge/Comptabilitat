<script setup>
import {ref,watch,onMounted} from 'vue';
import {parseInputDate,displayInputDate} from '../services/date-input.js';
const props=defineProps({modelValue:String,min:String,max:String});
const emit=defineEmits(['update:modelValue']);
const input=ref(null),draft=ref(displayInputDate(props.modelValue));
function validate(){
 const value=parseInputDate(draft.value);
 const message=!draft.value?'':!value?'Introduce una fecha completa: dd/mm/aaaa.':props.min&&value<props.min?'La fecha debe ser igual o posterior a '+displayInputDate(props.min)+'.':props.max&&value>props.max?'La fecha debe ser igual o anterior a '+displayInputDate(props.max)+'.':'';
 input.value?.setCustomValidity(message);return !message;
}
function edited(event){
 draft.value=event.target.value;
 if(validate()&&parseInputDate(draft.value))emit('update:modelValue',parseInputDate(draft.value));
}
function commit(){
 if(!validate())return;
 const value=draft.value?parseInputDate(draft.value):'';
 if(value!==props.modelValue)emit('update:modelValue',value);
 if(value)draft.value=displayInputDate(value);
}
watch(()=>props.modelValue,value=>{if(parseInputDate(draft.value)!==value)draft.value=displayInputDate(value);validate();});
watch([()=>props.min,()=>props.max],validate);
onMounted(validate);
</script>
<template><input ref="input" v-model="draft" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" @input="edited" @change="commit" @blur="commit"></template>
