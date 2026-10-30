<template>
 <nav class="tax-tabs tax-controls" aria-label="Modelos de Hacienda">
  <RouterLink to="/hacienda" :class="{selected:$route.name==='tax'}">IVA · Modelo 303</RouterLink>
  <RouterLink to="/hacienda/sociedades" :class="{selected:$route.name==='corporateTax'}">Sociedades · Modelo 200</RouterLink>
  <RouterLink to="/hacienda/pagos-fraccionados" :class="{selected:$route.name==='installmentTax'}">Pagos fraccionados · Modelo 202</RouterLink>
 </nav>
</template>
<style scoped>
.tax-tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #dbe3e8;padding-bottom:10px}.tax-tabs a{padding:10px 16px;border-radius:6px;font-weight:600;color:#56677b;text-decoration:none;font-size:13px}.tax-tabs a:hover{background:#edf2f5}.tax-tabs a.selected{background:#e5f1eb;color:#285b4b}
</style>
