<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { companyTextFields, companyProfileKeys, emptyCompanyProfile, paymentMethods } from '../../../shared/company-profile.js';
import { companyFormats } from '../../../shared/company-formats.js';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { companyTheme } from '../services/company-theme.js';
import { es } from '../locales/es.js';
import { t } from '../locales/companies.js';
import AppIcon from '../components/AppIcon.vue';
import FormDialog from '../components/FormDialog.vue';
import ManagementTabs from '../components/ManagementTabs.vue';

const { company, companies, error, loading, refresh } = useContext();
const route = useRoute(), router = useRouter();
const form = ref(null), busy = ref(false), fileBusy = ref(false), formError = ref(''), pageError = ref('');
const activeTab = ref('fiscal');
const tabs = [
  { id: 'fiscal', fields: [
    { key: 'trade_name', autocomplete: 'organization' }, { key: 'tax_id', code: true },
    { key: 'address', autocomplete: 'street-address', wide: true },
    { key: 'postal_code', autocomplete: 'postal-code' }, { key: 'city', autocomplete: 'address-level2' },
    { key: 'province', autocomplete: 'address-level1' }, { key: 'country', autocomplete: 'country-name' },
  ] },
  { id: 'contact', fields: [
    { key: 'contact_person', autocomplete: 'name' }, { key: 'phone', type: 'tel', autocomplete: 'tel' },
    { key: 'email', type: 'email', autocomplete: 'email' }, { key: 'billing_email', type: 'email' },
    { key: 'website', type: 'url', placeholder: 'https://', wide: true },
  ] },
  { id: 'collections', fields: [
    { key: 'bank_name' }, { key: 'account_holder' }, { key: 'iban', code: true, wide: true },
    { key: 'bic', code: true }, { key: 'payment_method', type: 'select' }, { key: 'payment_terms', wide: true },
  ] },
  { id: 'other', fields: [
    { key: 'journal_source_name', wide: true },
    { key: 'registry_info', type: 'textarea', wide: true }, { key: 'invoice_notes', type: 'textarea', wide: true },
  ] },
];

function changeTab(event, index) {
  let next;
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault(); activeTab.value = tabs[next].id;
  nextTick(() => document.getElementById('company-tab-' + activeTab.value)?.focus());
}

function showInvalid(event) {
  const panel = event.target.closest('[data-company-panel]');
  if (panel) activeTab.value = panel.dataset.companyPanel;
  formError.value = t.checkFields;
  nextTick(() => event.target.focus());
}

async function open(item) {
  if (busy.value) return;
  const year = String(new Date().getFullYear());
  formError.value = ''; pageError.value = ''; activeTab.value = 'fiscal'; busy.value = true;
  try {
    const details = item ? await api('/companies/' + item.id) : null;
    form.value = {
      ...emptyCompanyProfile(), country: details ? details.country : 'España', ...details,
      id: details?.id, name: details?.name || '', business_format: details?.business_format||'general', logo: undefined, preview: details?.logo_url || '',
      exercise: { name: year, start_date: year + '-01-01', end_date: year + '-12-31' },
    };
  } catch (cause) { pageError.value = es.errors[cause.code] || es.unavailable; }
  finally { busy.value = false; }
}

async function chooseLogo(event) {
  const file = event.target.files[0], target = form.value;
  if (!file || !target) return;
  formError.value = '';
  fileBusy.value = true;
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('INVALID_COMPANY_LOGO');
    if (file.size > 2 * 1024 * 1024) throw new Error('LOGO_TOO_LARGE');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('INVALID_COMPANY_LOGO'));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = data;
    await image.decode();
    if (form.value === target) { target.logo = data; target.preview = data; }
  } catch (cause) {
    formError.value = t.errors[cause.message] || t.errors.INVALID_COMPANY_LOGO;
  } finally { fileBusy.value = false; event.target.value = ''; }
}

function removeLogo() {
  form.value.logo = null;
  form.value.preview = '';
  formError.value = '';
}

async function clearEditQuery() {
  if (route.query.editar === undefined) return;
  const { editar, ...query } = route.query;
  await router.replace({ path: route.path, query, hash: route.hash });
}

async function close() {
  if (busy.value || fileBusy.value) return;
  form.value = null;
  await clearEditQuery();
}

watch([() => route.query.editar, () => company.value?.id], ([editing, companyId]) => {
  if (editing === 'actual' && companyId) open({ id: companyId });
}, { immediate: true });

async function save() {
  if (busy.value || fileBusy.value) return;
  busy.value = true;
  formError.value = '';
  try {
    const existingId = form.value.id;
    const body = { name: form.value.name, business_format: form.value.business_format, ...Object.fromEntries(companyProfileKeys.map(key => [key, form.value[key]])) };
    if (form.value.logo !== undefined) body.logo = form.value.logo;
    if (!existingId) body.exercise = form.value.exercise;
    const saved = await api(existingId ? '/companies/' + existingId : '/companies', {
      method: existingId ? 'PATCH' : 'POST', body,
    });
    await clearEditQuery();
    form.value = null;
    await refresh(String(existingId ? company.value?.id || saved.id : saved.id));
  } catch (cause) {
    formError.value = t.errors[cause.code] || es.errors[cause.code] || es.unavailable;
    if (['INVALID_IBAN', 'INVALID_BIC', 'INVALID_PAYMENT_METHOD'].includes(cause.code)) activeTab.value = 'collections';
    else if (['INVALID_COMPANY_EMAIL', 'INVALID_COMPANY_WEBSITE'].includes(cause.code)) activeTab.value = 'contact';
    else if (['INVALID_TAX_ID', 'INVALID_COMPANY_NAME'].includes(cause.code)) activeTab.value = 'fiscal';
  } finally { busy.value = false; }
}
</script>

<template>
  <ManagementTabs />
  <div class="page-heading">
    <div><p class="eyebrow">{{ t.eyebrow }}</p><h1>{{ t.title }}</h1><p class="muted">{{ t.intro }}</p></div>
    <button class="button primary" :disabled="!can('accounting_write')||(loading || busy)" @click="open()"><AppIcon name="building" />{{ t.newCompany }}</button>
  </div>
  <p v-if="error" class="notice error-notice" role="alert">{{ es.errors[error] || es.unavailable }}</p>
  <p v-if="pageError" class="notice error-notice" role="alert">{{ pageError }}</p>
  <div v-if="companies.length" class="companies-grid">
    <article v-for="item in companies" :key="item.id" class="panel company-profile" :style="companyTheme(item.id)" :data-company-id="item.id">
      <div class="company-profile-heading">
        <div class="company-logo"><img v-if="item.logo_url" :src="item.logo_url" alt=""><AppIcon v-else name="building" /></div>
        <h2>{{ item.name }}</h2>
      </div>
      <p class="muted company-format-label">{{ t.businessFormat }}: {{ t.formats[item.business_format||'general'] }}</p>
      <dl v-if="item.tax_id || item.city" class="company-profile-summary"><template v-if="item.tax_id"><dt>{{ t.fields.tax_id }}</dt><dd>{{ item.tax_id }}</dd></template><template v-if="item.city"><dt>{{ t.fields.city }}</dt><dd>{{ item.city }}</dd></template></dl>
      <p v-if="item.id === company?.id" class="badge badge-open"><AppIcon name="check" />{{ t.selected }}</p>
      <div class="actions company-profile-actions">
        <button class="button" :disabled="!can('accounting_write')||(loading || busy)" @click="open(item)" :aria-label="t.updateData + ': ' + item.name">{{ t.updateData }}</button>
        <button v-if="item.id !== company?.id" class="button primary" :disabled="loading || busy" @click="refresh(String(item.id))">{{ t.select }}</button>
      </div>
    </article>
  </div>
  <p v-else-if="!error" class="notice">{{ t.empty }}</p>

  <FormDialog v-if="form" class="company-dialog" :title="form.id ? t.editCompany : t.newCompany" :busy="busy || fileBusy" @close="close">
    <form @submit.prevent="save" @invalid.capture.prevent="showInvalid">
      <p v-if="formError" class="notice error-notice" role="alert">{{ formError }}</p>
      <div class="company-tabs" role="tablist" :aria-label="t.formSections">
        <button v-for="(tab, index) in tabs" :key="tab.id" :id="'company-tab-' + tab.id" type="button" role="tab" :aria-selected="activeTab === tab.id" :aria-controls="'company-panel-' + tab.id" :tabindex="activeTab === tab.id ? 0 : -1" :disabled="busy || fileBusy" @click="activeTab = tab.id" @keydown="changeTab($event, index)">{{ t.tabs[tab.id] }}</button>
      </div>
      <fieldset :disabled="busy || fileBusy">
        <section v-for="tab in tabs" :key="tab.id" v-show="activeTab === tab.id" :id="'company-panel-' + tab.id" role="tabpanel" :aria-labelledby="'company-tab-' + tab.id" :data-company-panel="tab.id">
          <p class="muted company-section-help">{{ t[tab.id + 'Help'] }}</p>
          <label v-if="tab.id === 'fiscal'">{{ t.name }}<input v-model="form.name" name="company_name" maxlength="160" autocomplete="organization" required autofocus></label>
          <label v-if="tab.id === 'fiscal'">{{ t.businessFormat }}<select v-model="form.business_format" name="business_format" :aria-label="t.businessFormat"><option v-for="format in companyFormats" :key="format" :value="format">{{ t.formats[format] }}</option></select><span class="muted company-field-help">{{ t.businessFormatHelp }}</span></label>
          <div class="form-grid company-fields">
            <label v-for="field in tab.fields" :key="field.key" :class="{ 'company-field-wide': field.wide }">{{ t.fields[field.key] }}
              <select v-if="field.type === 'select'" v-model="form[field.key]" :name="field.key"><option value="">{{ t.paymentMethods[''] }}</option><option v-for="method in paymentMethods" :key="method" :value="method">{{ t.paymentMethods[method] }}</option></select>
              <textarea v-else-if="field.type === 'textarea'" v-model="form[field.key]" :name="field.key" :maxlength="companyTextFields[field.key]" rows="3"></textarea>
              <input v-else v-model="form[field.key]" :name="field.key" :type="field.type || 'text'" :maxlength="companyTextFields[field.key] + (field.code ? 16 : 0)" :autocomplete="field.autocomplete || 'off'" :placeholder="field.placeholder" :spellcheck="field.code ? false : undefined" :class="{ 'company-code-field': field.code }" :aria-describedby="field.key === 'iban' ? 'iban-help' : undefined">
              <span v-if="field.key === 'iban'" id="iban-help" class="muted company-field-help">{{ t.ibanHelp }}</span>
            </label>
          </div>
        <template v-if="tab.id === 'other'">
        <section class="company-logo-field" :aria-label="t.logo">
          <p class="field-title">{{ t.logo }}</p>
          <div class="company-logo-editor">
            <div class="company-logo-preview"><img v-if="form.preview" :src="form.preview" :alt="t.preview"><AppIcon v-else name="building" /></div>
            <div class="company-logo-controls">
              <label class="button company-file-label">{{ t.chooseLogo }}<input type="file" accept="image/png,image/jpeg,image/webp" :aria-label="t.chooseLogo" aria-describedby="logo-help" @change="chooseLogo"></label>
              <button v-if="form.preview" type="button" class="button" @click="removeLogo">{{ t.removeLogo }}</button>
              <p class="muted" id="logo-help">{{ t.logoHelp }}</p>
            </div>
          </div>
        </section>
        <section v-if="!form.id" class="company-exercise" :aria-label="t.initialExercise">
          <h3>{{ t.initialExercise }}</h3>
          <p class="muted">{{ t.exerciseHelp }}</p>
          <label>{{ t.exerciseName }}<input v-model="form.exercise.name" name="exercise_name" maxlength="60" required></label>
          <div class="form-grid">
            <label>{{ t.startDate }}<input v-model="form.exercise.start_date" name="start_date" type="date" :max="form.exercise.end_date || '9999-12-31'" min="1000-01-01" required></label>
            <label>{{ t.endDate }}<input v-model="form.exercise.end_date" name="end_date" type="date" :min="form.exercise.start_date || '1000-01-01'" max="9999-12-31" required></label>
          </div>
        </section>
        </template>
        </section>
      </fieldset>
      <div class="actions company-form-actions"><button class="button primary" :disabled="busy || fileBusy">{{ form.id ? t.save : t.create }}</button><button type="button" class="button" :disabled="busy || fileBusy" @click="close">{{ t.cancel }}</button></div>
    </form>
  </FormDialog>
</template>
