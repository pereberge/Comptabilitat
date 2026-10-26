<script setup>
import { computed, ref, watch } from 'vue';
import { b } from '../locales/balance-sheet.js';
import { reportMoney as money, reportDate as date } from '../services/report-format.js';
const props=defineProps({data:{type:Object,required:true},ledgerLink:{type:Function,required:true},totalLabels:{type:Array,default:()=>[['assets',b.totalAsset],['equity_liabilities',b.totalEquity],['difference',b.difference]]},showResult:{type:Boolean,default:true},accountDigits:{type:Number,default:0},sideTotals:{type:Boolean,default:false}});
const emit=defineEmits(['select-exercise']);
const expanded=ref(new Set());
watch([()=>props.data.comparison.sections,()=>props.accountDigits],()=>{
 const keys=[];
 function visit(node,depth){if(depth===0||props.accountDigits>0)keys.push('node:'+node.id);node.children.forEach(child=>visit(child,depth+1));}
 props.data.comparison.sections.forEach(node=>visit(node,0));expanded.value=new Set(keys);
},{immediate:true});
const footerLabels=computed(()=>props.sideTotals?props.totalLabels.filter(([key])=>!['assets','equity_liabilities'].includes(key)):props.totalLabels);
const previous=computed(()=>props.data.comparison.previous);
const rows=computed(()=>{
  const result=[];
  function visit(node,depth){
    const key='node:'+node.id;
    result.push({...node,key,kind:'node',label:node.label,depth,expandable:!!(node.children.length || node.accounts.length)});
    if(!expanded.value.has(key))return;
    node.children.forEach(child=>visit(child,depth+1));
    for(const account of node.accounts){
      const accountKey=key+':account:'+account.code;
      result.push({...account,key:accountKey,kind:account.detail_is_subaccount?'subaccount':'account',label:account.code+(account.description?' · '+account.description:''),depth:depth+1,expandable:!!account.subaccounts.length});
      if(expanded.value.has(accountKey))for(const sub of account.subaccounts)result.push({...sub,key:accountKey+':sub:'+sub.id,kind:'subaccount',label:sub.code+' · '+sub.description,depth:depth+2,expandable:false});
    }
  }
  if(props.sideTotals){
    for(const side of ['asset','equity_liabilities']){
      props.data.comparison.sections.filter(node=>node.side===side).forEach(node=>visit(node,0));
      const key=side==='asset'?'assets':'equity_liabilities';
      result.push({...props.data.comparison.totals[key],key:'total:'+side,kind:'total',depth:0,label:side==='asset'?b.totalAsset:b.totalEquity,expandable:false});
    }
  }else props.data.comparison.sections.forEach(node=>visit(node,0));return result;
});
function toggle(key){const next=new Set(expanded.value);next.has(key)?next.delete(key):next.add(key);expanded.value=next;}
function selectPeriod(event,earlier){if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0)emit('select-exercise',earlier?previous.value.exercise.id:props.data.exercise.id);}
function periodLabel(sheet){return sheet.report==='profit_loss'?date(sheet.from)+' — '+date(sheet.to):date(sheet.date);}
</script>
<template>
  <div class="balance-comparison table-wrap panel" role="region" :aria-label="b.comparison" tabindex="0">
    <table>
      <caption>{{ b.comparison }} · {{ data.exercise.name }} / {{ previous.exercise.name }}</caption>
      <thead><tr><th scope="col">{{ b.caption }}</th><th scope="col" class="amount">{{ data.exercise.name }}<small>{{ periodLabel(data) }}</small></th><th scope="col" class="amount">{{ previous.exercise.name }}<small>{{ periodLabel(previous) }}</small></th><th scope="col" class="amount">{{ b.change }}<small>{{ b.changeHelp }}</small></th></tr></thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key" :class="['comparison-'+row.kind,{'comparison-root':row.kind==='node'&&row.depth===0}]">
          <th scope="row" :style="{'--indent':Math.min(row.depth,6)*14+'px'}">
            <button v-if="row.expandable" class="comparison-toggle" :aria-expanded="expanded.has(row.key)" @click="toggle(row.key)"><span aria-hidden="true">{{ expanded.has(row.key)?'−':'+' }}</span>{{ row.label }}</button><span v-else class="comparison-label">{{ row.label }}</span>
          </th>
          <td class="amount"><RouterLink v-if="row.kind==='subaccount'&&row.current_id" :to="ledgerLink({id:row.current_id},data)" :title="b.signed+': '+money(row.current_signed_balance)" @click="selectPeriod($event,false)">{{ money(row.amount) }}</RouterLink><template v-else>{{ money(row.amount) }}</template></td>
          <td class="amount"><RouterLink v-if="row.kind==='subaccount'&&row.previous_id" :to="ledgerLink({id:row.previous_id},previous)" :title="b.signed+': '+money(row.previous_signed_balance)" @click="selectPeriod($event,true)">{{ money(row.previous_amount) }}</RouterLink><template v-else>{{ money(row.previous_amount) }}</template></td>
          <td class="amount">{{ money(row.difference) }}</td>
        </tr>
      </tbody>
      <tfoot><tr v-for="[key,label] in footerLabels" :key="key"><th scope="row">{{ label }}</th><td class="amount">{{ money(data.comparison.totals[key].amount) }}</td><td class="amount">{{ money(data.comparison.totals[key].previous_amount) }}</td><td class="amount">{{ money(data.comparison.totals[key].difference) }}</td></tr><tr v-if="showResult"><th scope="row">{{ data.comparison.generated_result?b.balanceResult:b.result }}</th><td class="amount">{{ money(data.comparison.result.total.amount) }}</td><td class="amount">{{ money(data.comparison.result.total.previous_amount) }}</td><td class="amount">{{ money(data.comparison.result.total.difference) }}</td></tr><tr v-if="showResult&&data.comparison.generated_result" class="comparison-generated-result"><th scope="row">{{ b.generatedResult }}</th><td class="amount">{{ money(data.comparison.generated_result.amount) }}</td><td class="amount">{{ money(data.comparison.generated_result.previous_amount) }}</td><td class="amount">{{ money(data.comparison.generated_result.difference) }}</td></tr></tfoot>
    </table>
  </div>
</template>
<style scoped>
.balance-comparison{margin:22px 0;max-width:100%}.balance-comparison table{min-width:740px}.balance-comparison caption{text-align:left;padding:18px;font-weight:600;color:#304761}.balance-comparison thead th{font-size:13px;padding-top:16px;padding-bottom:16px}.balance-comparison small{display:block;font-size:11px;font-weight:400;margin-top:4px}.balance-comparison th:first-child{width:55%;white-space:normal}.balance-comparison tbody th{background:transparent;font-size:13px;color:inherit;font-weight:400;padding-left:calc(12px + var(--indent));white-space:normal;overflow-wrap:anywhere}.comparison-toggle{display:flex;align-items:baseline;gap:10px;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:0;width:100%;cursor:pointer}.comparison-toggle>span{width:12px;flex-shrink:0;color:#536579}.comparison-label{display:block;padding-left:22px}.balance-comparison .comparison-root{background:#edf3f7;font-weight:700}.balance-comparison .comparison-root th{font-weight:700}.balance-comparison .comparison-account{background:#f8fafc}.balance-comparison .comparison-subaccount{font-size:12px}.balance-comparison tfoot td{font-weight:600;background:#f6f8fb}.balance-comparison tfoot tr:last-child th,.balance-comparison tfoot tr:last-child td{border-top:1px solid #dce4ee}.balance-comparison .comparison-total th,.balance-comparison .comparison-total td{font-weight:700;background:#edf3f7;border-top:2px solid var(--primary)}.balance-comparison .comparison-total th{padding-left:12px}.balance-comparison .comparison-total .comparison-label{padding-left:0}
.balance-comparison td a{color:var(--primary)}
</style>
