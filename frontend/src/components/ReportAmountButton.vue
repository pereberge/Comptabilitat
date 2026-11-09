<script setup>
import {inject} from 'vue';
import {reportAmountDetailKey} from '../services/report-amount-detail.js';
import {reportMoney as money} from '../services/report-format.js';
import {detailText as d} from '../locales/report-amount-detail.js';
const props=defineProps({amount:String,selection:{type:Object,required:true},label:{type:String,default:''},sheet:Object,sheets:Array,euro:Boolean});
const open=inject(reportAmountDetailKey,null);
function show(){open?.({amount:props.amount,selection:props.selection,label:props.label,...(props.sheet?{sheet:props.sheet}:{}),...(props.sheets?{sheets:props.sheets}:{})});}
</script>
<template><button v-if="open&&amount!==null&&amount!==undefined" type="button" class="report-amount-button" :title="d.open+' '+label" :aria-label="d.open+' '+label+': '+money(amount)+(euro?' €':'')" @click.stop.prevent="show">{{ money(amount) }}<template v-if="euro"> €</template></button><span v-else>{{ amount===null?'—':money(amount) }}<template v-if="euro"> €</template></span></template>
<style>.report-amount-button{display:inline;border:0;border-radius:3px;padding:1px 2px;margin:-1px -2px;min-height:0;background:transparent;color:inherit;font:inherit;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;text-decoration:underline;text-decoration-style:dotted;text-decoration-color:#8795a6;text-underline-offset:3px;cursor:pointer}.report-amount-button:hover{color:var(--primary);text-decoration-style:solid}.report-amount-button:focus-visible{outline:2px solid var(--primary);outline-offset:3px}@media print{.report-amount-button{text-decoration:none}}</style>
