<script setup>
import {computed,ref} from 'vue';
import {b} from '../locales/balance-sheet.js';
import {p,profitLossTotalLabels} from '../locales/profit-loss.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
const props=defineProps({data:{type:Object,required:true},ledgerLink:{type:Function,required:true}});
const emit=defineEmits(['select-exercise']);
const comparison=computed(()=>props.data.comparison.multiple);
const expanded=ref(new Set(comparison.value.sections.map(node=>'node:'+node.id)));
const rows=computed(()=>{
 const result=[];
 function visit(node,depth){
  const key='node:'+node.id;
  result.push({...node,key,kind:'node',label:node.label,depth,expandable:!!(node.children.length||node.accounts.length)});
  if(!expanded.value.has(key))return;
  node.children.forEach(child=>visit(child,depth+1));
  for(const account of node.accounts){
   const accountKey=key+':account:'+account.code;
   result.push({...account,key:accountKey,kind:'account',label:account.code+' · '+account.description,depth:depth+1,expandable:!!account.subaccounts.length});
   if(expanded.value.has(accountKey))for(const sub of account.subaccounts)result.push({...sub,key:accountKey+':sub:'+sub.id,kind:'subaccount',label:sub.code+' · '+sub.description,depth:depth+2,expandable:false});
  }
 }
 comparison.value.sections.forEach(node=>visit(node,0));return result;
});
function toggle(key){const next=new Set(expanded.value);next.has(key)?next.delete(key):next.add(key);expanded.value=next;}
function selectPeriod(event,period){if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0)emit('select-exercise',period.sheet.exercise.id);}
function label(period){return period.sheet?.exercise.name||period.exercise?.name||period.expected_end.slice(0,4);}
</script>
<template>
 <div class="balance-comparison profit-comparison table-wrap panel" role="region" :aria-label="p.threeExercises" tabindex="0">
  <table>
   <caption>{{ p.threeExercises }} · {{ comparison.periods.map(label).join(' / ') }}</caption>
   <thead><tr><th scope="col">{{ b.caption }}</th><th v-for="(period,index) in comparison.periods" :key="index" scope="col" class="amount">{{ label(period) }}<small v-if="period.available">{{ date(period.sheet.from) }} — {{ date(period.sheet.to) }}</small><small v-else>{{ p.unavailable }}</small></th></tr></thead>
   <tbody>
    <tr v-for="row in rows" :key="row.key" :class="['comparison-'+row.kind,{'comparison-root':row.depth===0}]">
     <th scope="row" :style="{'--indent':Math.min(row.depth,6)*14+'px'}"><button v-if="row.expandable" class="comparison-toggle" :aria-expanded="expanded.has(row.key)" @click="toggle(row.key)"><span aria-hidden="true">{{ expanded.has(row.key)?'−':'+' }}</span>{{ row.label }}</button><span v-else class="comparison-label">{{ row.label }}</span></th>
     <td v-for="(period,index) in comparison.periods" :key="index" class="amount"><RouterLink v-if="period.available&&row.kind==='subaccount'&&row.ids[index]" :to="ledgerLink({id:row.ids[index]},period.sheet)" :title="b.signed+': '+money(row.signed_balances[index])" @click="selectPeriod($event,period)">{{ money(row.amounts[index]) }}</RouterLink><template v-else>{{ row.amounts[index]===null?'—':money(row.amounts[index]) }}</template></td>
    </tr>
   </tbody>
   <tfoot><tr v-for="[key,title] in profitLossTotalLabels" :key="key"><th scope="row">{{ title }}</th><td v-for="(value,index) in comparison.totals[key]" :key="index" class="amount">{{ value===null?'—':money(value) }}</td></tr></tfoot>
  </table>
 </div>
</template>
<style scoped>
.balance-comparison{margin:22px 0;max-width:100%}.balance-comparison table{min-width:740px}.balance-comparison caption{text-align:left;padding:18px;font-weight:600;color:#304761}.balance-comparison thead th{font-size:13px;padding-top:16px;padding-bottom:16px}.balance-comparison small{display:block;font-size:11px;font-weight:400;margin-top:4px}.balance-comparison th:first-child{width:55%;white-space:normal}.balance-comparison tbody th{background:transparent;font-size:13px;color:inherit;font-weight:400;padding-left:calc(12px + var(--indent));white-space:normal;overflow-wrap:anywhere}.comparison-toggle{display:flex;align-items:baseline;gap:10px;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:0;width:100%;cursor:pointer}.comparison-toggle>span{width:12px;flex-shrink:0;color:#536579}.comparison-label{display:block;padding-left:22px}.balance-comparison .comparison-root{background:#edf3f7;font-weight:700}.balance-comparison .comparison-root th{font-weight:700}.balance-comparison .comparison-account{background:#f8fafc}.balance-comparison .comparison-subaccount{font-size:12px}.balance-comparison tfoot td{font-weight:600;background:#f6f8fb}.balance-comparison tfoot tr:last-child th,.balance-comparison tfoot tr:last-child td{border-top:1px solid #dce4ee}.balance-comparison td a{color:var(--primary)}
</style>
