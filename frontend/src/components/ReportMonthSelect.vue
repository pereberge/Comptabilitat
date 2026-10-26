<script setup>
import {computed} from 'vue';
const props=defineProps({modelValue:{type:String,default:''},months:{type:Array,required:true},label:{type:String,required:true},ariaLabel:{type:String,required:true}});
const emit=defineEmits(['update:modelValue']);
const selected=computed(()=>props.months.find(month=>month.value===props.modelValue));
const formatter=new Intl.DateTimeFormat('es-ES',{month:'short',timeZone:'UTC'});
const monthLabel=computed(()=>selected.value?formatter.format(new Date(selected.value.value+'-01T00:00:00Z')).replace(/\.$/,''):'—');
</script>
<template>
 <label class="report-month-field"><span class="report-month-label">{{ label }}</span>
  <span class="report-month-box" :title="selected?.label">
   <span class="report-month-name" aria-hidden="true">{{ monthLabel }}</span>
   <span class="report-month-year" aria-hidden="true">{{ selected?.value.slice(0,4)||'—' }}</span>
   <svg class="report-month-arrow" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
   <select :value="modelValue" :aria-label="ariaLabel" required @change="emit('update:modelValue',$event.target.value)"><option v-if="!selected" value="" disabled>Selecciona un mes</option><option v-for="month in months" :key="month.value" :value="month.value">{{ month.label }}</option></select>
  </span>
 </label>
</template>
<style scoped>
.report-month-field{gap:4px;font-size:11px;line-height:1.25}.report-month-label{text-align:center;color:#65748a}.report-month-box{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:64px;height:64px;border:1px solid #cbd5e1;border-radius:0;background:#fff;color:#23354c}.report-month-name{font-size:14px;font-weight:600;text-transform:capitalize;line-height:1.1}.report-month-year{font-size:13px;font-variant-numeric:tabular-nums;line-height:1.1;color:#65748a}.report-month-arrow{position:absolute;right:4px;bottom:5px;width:10px;height:10px;color:#7b8ba1}.report-month-box select{position:absolute;inset:0;opacity:0;width:100%;height:100%;min-height:0;padding:0;cursor:pointer}.report-month-box:hover{border-color:var(--primary)}.report-month-box:focus-within{outline:3px solid var(--primary-focus);outline-offset:2px;border-color:var(--primary)}
@media(max-width:520px){.report-month-box{width:52px;height:52px;gap:3px}.report-month-name{font-size:13px}.report-month-year{font-size:12px}.report-month-field{font-size:10px}.report-month-arrow{right:3px;bottom:4px;width:8px;height:8px}}
</style>
