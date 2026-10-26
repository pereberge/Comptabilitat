<script setup>
import {computed,ref,watch} from 'vue';
import {reportMoney as money} from '../services/report-format.js';
import {evolution as e} from '../locales/company-evolution.js';
const props=defineProps({years:{type:Array,required:true},metric:{type:String,required:true},label:String,color:String});
const active=ref(null),width=720,height=230,left=80,right=24,top=20,bottom=38;
const values=computed(()=>props.years.filter(year=>year[props.metric]!==null));
const geometry=computed(()=>{
 const data=values.value.map(year=>Number(year[props.metric])),low=Math.min(0,...data),high=Math.max(0,...data),min=low===high?low-1:low,max=low===high?high+1:high,span=max-min;
 const start=Date.parse(props.years[0]?.start_date||'2000-01-01'),end=Date.parse(props.years.at(-1)?.start_date||'2000-01-01');
 const points=props.years.map((year,index)=>({...year,index,x:end===start?(left+width-right)/2:left+(Date.parse(year.start_date)-start)/(end-start)*(width-left-right),y:year[props.metric]===null?null:top+(max-Number(year[props.metric]))/span*(height-top-bottom)}));
 let path='',connected=false;
 for(const point of points){if(point.y===null){connected=false;continue;}path+=(connected?' L ':' M ')+point.x+' '+point.y;connected=true;}
 return {points,path,zero:top+max/span*(height-top-bottom),ticks:[max,(max+min)/2,min]};
});
const selected=computed(()=>geometry.value.points.find(point=>point.exercise_id===active.value&&point.y!==null)||geometry.value.points.findLast(point=>point.y!==null));
const labels=computed(()=>geometry.value.points.filter((point,index)=>index===0||index===props.years.length-1||index%Math.max(1,Math.ceil(props.years.length/5))===0));
const compact=value=>new Intl.NumberFormat('es-ES',{notation:'compact',maximumFractionDigits:1}).format(value);
watch([()=>props.years,()=>props.metric],()=>active.value=null);
</script>
<template>
 <figure class="evolution-chart" :style="{'--chart-color':color||'var(--primary)'}">
  <template v-if="values.length">
   <svg :viewBox="'0 0 '+width+' '+height" role="group" :aria-label="label">
    <g v-for="(tick,index) in geometry.ticks" :key="index"><line :x1="left" :x2="width-right" :y1="top+index*(height-top-bottom)/2" :y2="top+index*(height-top-bottom)/2" class="chart-grid" /><text :x="left-12" :y="top+index*(height-top-bottom)/2+4" text-anchor="end">{{ compact(tick) }} €</text></g>
    <line :x1="left" :x2="width-right" :y1="geometry.zero" :y2="geometry.zero" class="chart-zero" />
    <path :d="geometry.path" class="chart-line" />
    <g v-for="point in geometry.points.filter(point=>point.y!==null)" :key="point.exercise_id"><circle :cx="point.x" :cy="point.y" :r="selected?.exercise_id===point.exercise_id?6:4" tabindex="0" role="button" :aria-label="point.name+' · '+label+': '+money(point[metric])+' euros'" :aria-pressed="selected?.exercise_id===point.exercise_id" @mouseenter="active=point.exercise_id" @focus="active=point.exercise_id" @click="active=point.exercise_id" @keydown.enter.prevent="active=point.exercise_id" @keydown.space.prevent="active=point.exercise_id"><title>{{ point.name }} · {{ money(point[metric]) }} €</title></circle></g>
    <text v-for="point in labels" :key="point.exercise_id" :x="point.x" :y="height-10" text-anchor="middle">{{ point.name }}</text>
   </svg>
   <figcaption><p v-if="selected" class="chart-value" aria-live="polite">{{ selected.name }} · {{ label }} <strong>{{ money(selected[metric]) }} €</strong></p><p class="muted">{{ e.chartHelp }}</p></figcaption>
  </template>
  <p v-else class="empty-cell">{{ e.emptyChart }}</p>
 </figure>
</template>
<style scoped>
.evolution-chart{margin:0;padding:12px 20px 18px;min-width:0}.evolution-chart svg{display:block;width:100%;height:auto;max-height:280px;overflow:visible}.evolution-chart text{font:12px system-ui,sans-serif;fill:#63738a}.chart-grid{stroke:#e6ebf1;stroke-width:1}.chart-zero{stroke:#b4c0cf;stroke-width:1}.chart-line{fill:none;stroke:var(--chart-color);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.evolution-chart circle{fill:#fff;stroke:var(--chart-color);stroke-width:3;cursor:pointer}.evolution-chart circle[aria-pressed=true]{fill:var(--chart-color)}figcaption{padding:10px 0 0;font-size:12px}.chart-value{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:5px}.chart-value strong{font-size:18px;color:var(--chart-color);font-variant-numeric:tabular-nums}figcaption .muted{font-size:11px}
</style>
