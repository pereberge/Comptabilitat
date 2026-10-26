<script setup>
import { reportMoney as money } from '../services/report-format.js';
defineProps({entries:{type:Array,default:()=>[]}});
const labels={opening:'Apertura',regularization:'Regularización',closing:'Cierre'};
</script>
<template>
 <section v-for="entry in entries" :key="entry.entry_type" class="annual-entry-preview">
  <h3>{{ labels[entry.entry_type] }}</h3>
  <p>{{ entry.totals.lines }} líneas · Debe: <strong>{{ money(entry.totals.debit) }} €</strong> · Haber: <strong>{{ money(entry.totals.credit) }} €</strong></p>
  <details><summary>Ver subcuentas e importes</summary><div class="table-wrap annual-lines"><table><thead><tr><th>Subcuenta</th><th>Descripción</th><th class="amount">Debe</th><th class="amount">Haber</th></tr></thead>
   <tbody><tr v-for="line in entry.lines" :key="line.code"><td class="account-code">{{ line.code }}</td><td>{{ line.account_name }}</td><td class="amount">{{ money(line.debit) }}</td><td class="amount">{{ money(line.credit) }}</td></tr></tbody>
  </table></div></details>
 </section>
</template>

