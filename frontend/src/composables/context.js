import { computed, readonly, ref } from 'vue';
import { getContext } from '../services/api.js';
import { api } from '../services/accounting.js';
import { setCompanyId } from '../services/company.js';
import { latestExercise } from '../../../shared/report-periods.js';
const company = ref(null), companies = ref([]), exercises = ref([]), selectedId = ref(''), loading = ref(false), error = ref('');
const selectedExercise = computed(() => exercises.value.find(item => String(item.id) === selectedId.value) ?? null);
async function refresh(companyId, { latest = false } = {}) {
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
    const selected = (latest ? latestExercise(data.exercises) : data.exercises.find(item => String(item.id) === remembered))
      || data.exercises.find(item => item.is_default && item.status === 'open')
      || data.exercises.find(item => item.status === 'open') || data.exercises[0];
    selectExercise(selected ? String(selected.id) : '');
  } catch (cause) {
    error.value = cause.code; company.value = null; exercises.value = []; selectedId.value = ''; setCompanyId('');
  } finally { loading.value = false; }
}
// Company shortcuts always open the latest exercise; routine refresh keeps a manual selection.
async function selectCompany(companyId) {
  if (loading.value) return;
  const requested = String(companyId);
  if (String(company.value?.id) === requested) {
    const latest = latestExercise(exercises.value);
    selectExercise(latest ? String(latest.id) : '');
  } else await refresh(requested, { latest: true });
}
function selectExercise(id) {
  selectedId.value = exercises.value.some(item => String(item.id) === id) ? id : '';
  try { if (company.value) sessionStorage.setItem('exercise:' + company.value.id, selectedId.value); } catch {}
}
function updateExerciseStatus(exerciseId,status) {
  if(!['open','closed'].includes(status))return;
  const exercise=exercises.value.find(row=>String(row.id)===String(exerciseId));if(exercise)exercise.status=status;
}
async function reloadData() {
  const companyId=company.value?.id;if(!companyId)return;
  const [data,list]=await Promise.all([getContext(String(companyId)),api('/companies')]);
  if(company.value?.id!==companyId)return;
  company.value=data.company;companies.value=list;exercises.value=data.exercises;
  if(!data.exercises.some(row=>String(row.id)===selectedId.value))selectExercise(String((data.exercises.find(row=>row.is_default)||data.exercises[0])?.id||''));
}
export function useContext() {
  return { company: readonly(company), companies: readonly(companies), exercises: readonly(exercises), selectedId: readonly(selectedId),
    loading: readonly(loading), error: readonly(error), selectedExercise, refresh, selectCompany, selectExercise,updateExerciseStatus,reloadData };
}
