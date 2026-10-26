<script setup>
import { b } from '../locales/balance-sheet.js';
import { reportMoney as money } from '../services/report-format.js';
defineProps({node:{type:Object,required:true},ledgerLink:{type:Function,required:true},accountDigits:{type:Number,default:0}});
</script>
<template>
 <details class="balance-node" :class="{'balance-section':node.depth===0}" :open="node.depth===0||accountDigits>0">
  <summary><span>{{ node.label }}</span><strong class="amount">{{ money(node.amount) }} €</strong></summary>
  <div class="balance-children">
   <BalanceSheetNode v-for="child in node.children" :key="child.id" :node="child" :account-digits="accountDigits" :ledger-link="ledgerLink" />
   <template v-for="account in node.accounts" :key="account.code">
   <div v-if="account.detail_is_subaccount" class="balance-subaccount"><RouterLink :to="ledgerLink(account)">{{ account.code }}{{ account.description?' · '+account.description:'' }}</RouterLink><span class="amount" :title="b.signed+': '+money(account.signed_balance)">{{ money(account.amount) }} €</span></div>
   <details v-else class="balance-account">
    <summary><span>{{ account.code }}{{ account.description?' · '+account.description:'' }}</span><span class="amount">{{ money(account.amount) }} €</span></summary>
    <div v-for="sub in account.subaccounts" :key="sub.id" class="balance-subaccount">
     <RouterLink :to="ledgerLink(sub)">{{ sub.code }} · {{ sub.description }}</RouterLink>
     <span class="amount" :title="b.signed+': '+money(sub.signed_balance)">{{ money(sub.amount) }} €</span>
    </div>
   </details>
   </template>
   <p v-if="!node.children.length&&!node.accounts.length" class="muted balance-empty">{{ b.empty }}</p>
  </div>
 </details>
</template>
<style>
.balance-node summary,.balance-account summary{display:flex;justify-content:space-between;gap:1rem;cursor:pointer;padding:.8rem .65rem;list-style:none;align-items:baseline}
.balance-node summary::before,.balance-account summary::before{content:'+';flex-shrink:0;color:#536579}
.balance-node[open]>summary::before,.balance-account[open]>summary::before{content:'−'}
.balance-node summary>span:first-of-type,.balance-account summary>span:first-of-type{flex:1;min-width:0;overflow-wrap:anywhere}
.balance-node .amount,.balance-account .amount,.balance-subaccount .amount{white-space:nowrap;font-variant-numeric:tabular-nums;text-align:right}
.balance-node{border-bottom:1px solid #e2e8ef}.balance-section>summary{background:#edf3f7;font-weight:700;border-radius:6px}
.balance-children{padding-left:.7rem}.balance-account{font-size:.9rem}.balance-subaccount{display:flex;justify-content:space-between;gap:1rem;padding:.6rem .65rem .6rem 1.5rem;align-items:baseline}
.balance-subaccount a{overflow-wrap:anywhere}.balance-empty{padding:.5rem;font-size:.85rem}
@media(max-width:520px){.balance-node summary,.balance-account summary{gap:.4rem;padding:.7rem .3rem}.balance-children{padding-left:.3rem}.balance-subaccount{flex-wrap:wrap;padding-left:.6rem}}
</style>
