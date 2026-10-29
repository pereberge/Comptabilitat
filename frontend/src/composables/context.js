import { computed, readonly, ref } from 'vue';
import { getContext } from '../services/api.js';
import { api } from '../services/accounting.js';
import { setCompanyId } from '../services/company.js';
import { latestExercise } from '../../../shared/report-periods.js';
import {workspace} from '../services/workspace-state.js';
const company = ref(null), companies = ref([]), exercises = ref([]), selectedId = ref(''), loading = ref(false), error = ref('');
let generation=0;
const selectedExercise = computed(() => exercises.value.find(item => String(item.id) === selectedId.value) ?? null);
async function refresh(companyId, { latest = false,exerciseId='' } = {}) {
  const ticket=++generation;
  const previousCompanyId=company.value?.id,previousExerciseId=selectedId.value;
  const remembered=workspace.read();
  loading.value = true; error.value = '';
  try {
    const list=await api('/companies');if(ticket!==generation)return;companies.value=list;
    if(!list.length){company.value=null;exercises.value=[];selectedId.value='';setCompanyId('');return;}
    let requested = typeof companyId === 'string' ? companyId : String(company.value?.id || '');
    requested ||= remembered.company_id;
    try { requested ||= sessionStorage.getItem('company') || ''; } catch {}
    if (requested && !companies.value.some(item => String(item.id) === requested)) requested = '';
    requested ||= String(list[0].id);
    const data = await getContext(requested);
    if(ticket!==generation)return;
    setCompanyId(data.company.id);
    company.value = data.company; exercises.value = data.exercises;
    try { sessionStorage.setItem('company', String(data.company.id)); } catch {}
    const sameCompany=String(previousCompanyId)===String(data.company.id);
    let rememberedExercise=remembered.company_id===String(data.company.id)?remembered.exercise_id:'';
    if(!remembered.company_id)try{rememberedExercise=sessionStorage.getItem('exercise:'+data.company.id)||'';}catch{}
    const selected = data.exercises.find(item=>String(item.id)===String(exerciseId))
      || (!latest&&data.exercises.find(item=>String(item.id)===(sameCompany?previousExerciseId:rememberedExercise)))
      || latestExercise(data.exercises);
    selectExercise(selected ? String(selected.id) : '');
  } catch (cause) {
    if(ticket===generation){error.value = cause.code; company.value = null; exercises.value = []; selectedId.value = ''; setCompanyId('');}
  } finally { if(ticket===generation)loading.value = false; }
}
function clear({forget=false}={}){generation++;company.value=null;companies.value=[];exercises.value=[];selectedId.value='';error.value='';loading.value=false;setCompanyId('');if(forget)try{sessionStorage.removeItem('company');for(const key of Object.keys(sessionStorage))if(key.startsWith('exercise:'))sessionStorage.removeItem(key);}catch{}}
// Reopening resumes the saved exercise; deliberately switching companies opens the latest one.
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
  if(company.value)workspace.remember({company_id:String(company.value.id),exercise_id:selectedId.value});
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
  if(!data.exercises.some(row=>String(row.id)===selectedId.value))selectExercise(String(latestExercise(data.exercises)?.id||''));
}
export function useContext() {
  return { company: readonly(company), companies: readonly(companies), exercises: readonly(exercises), selectedId: readonly(selectedId),
    loading: readonly(loading), error: readonly(error), selectedExercise, refresh, clear,selectCompany, selectExercise,updateExerciseStatus,reloadData };
}
