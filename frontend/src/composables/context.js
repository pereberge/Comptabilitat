import { computed, readonly, ref } from 'vue';
import { getContext } from '../services/api.js';
import { api } from '../services/accounting.js';
import { setCompanyId } from '../services/company.js';
const company = ref(null), companies = ref([]), exercises = ref([]), selectedId = ref(''), loading = ref(false), error = ref('');
const selectedExercise = computed(() => exercises.value.find(item => String(item.id) === selectedId.value) ?? null);
async function refresh(companyId) {
  if (loading.value) return;
  loading.value = true; error.value = '';
  try {
    companies.value = await api('/companies');
    let requested = typeof companyId === 'string' ? companyId : String(company.value?.id || '');
    try { requested ||= sessionStorage.getItem('company') || ''; } catch {}
    if (requested && !companies.value.some(item => String(item.id) === requested)) requested = '';
    const data = await getContext(requested);
    setCompanyId(data.company.id);
    company.value = data.company; exercises.value = data.exercises;
    let remembered = '';
    try { remembered = sessionStorage.getItem('exercise:' + data.company.id) || ''; sessionStorage.setItem('company', String(data.company.id)); } catch {}
    const selected = data.exercises.find(item => String(item.id) === remembered)
      || data.exercises.find(item => item.is_default && item.status === 'open')
      || data.exercises.find(item => item.status === 'open') || data.exercises[0];
    selectExercise(selected ? String(selected.id) : '');
  } catch (cause) {
    error.value = cause.code; company.value = null; exercises.value = []; selectedId.value = ''; setCompanyId('');
  } finally { loading.value = false; }
}
function selectExercise(id) {
  selectedId.value = exercises.value.some(item => String(item.id) === id) ? id : '';
  try { if (company.value) sessionStorage.setItem('exercise:' + company.value.id, selectedId.value); } catch {}
}
export function useContext() {
  return { company: readonly(company), companies: readonly(companies), exercises: readonly(exercises), selectedId: readonly(selectedId),
    loading: readonly(loading), error: readonly(error), selectedExercise, refresh, selectExercise };
}
