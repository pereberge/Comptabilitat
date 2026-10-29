<template>
 <nav class="management-tabs portfolio-tabs" aria-label="Apartados de cartera">
  <RouterLink to="/cartera" active-class="" exact-active-class="router-link-active">Recibos y vencimientos</RouterLink>
  <RouterLink to="/cartera/remesas/clientes">Remesas de clientes</RouterLink>
  <RouterLink to="/cartera/remesas/proveedores">Remesas de proveedores</RouterLink>
 </nav>
</template>
<style scoped>
.portfolio-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;padding:0;border:0}
</style>
