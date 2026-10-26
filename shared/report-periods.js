// Financial statements open on the latest dated exercise, independently of remembered selection.
export function latestExercise(exercises) {
 return exercises.reduce((latest,exercise)=>!latest||exercise.end_date>latest.end_date||exercise.end_date===latest.end_date&&(exercise.start_date>latest.start_date||exercise.start_date===latest.start_date&&Number(exercise.id)>Number(latest.id))?exercise:latest,null);
}
// Prefer December within the exercise; short exercises without December use their own end date.
export function reportDefaultCutoff(exercise) {
 return exerciseMonths(exercise).findLast(month=>month.value.endsWith('-12'))?.to||exercise?.end_date||'';
}

// Calendar months clipped to the actual fiscal exercise, including short exercises.
export function exerciseMonths(exercise) {
 if(!exercise)return [];
 const result=[],[firstYear,firstMonth]=exercise.start_date.split('-').map(Number),[lastYear,lastMonth]=exercise.end_date.split('-').map(Number);
 for(let index=firstYear*12+firstMonth-1;index<=lastYear*12+lastMonth-1;index++){
  const year=Math.floor(index/12),number=index%12+1,month=String(year).padStart(4,'0')+'-'+String(number).padStart(2,'0');
  const last=new Date(Date.UTC(year,number,0)).toISOString().slice(0,10);
  result.push({value:month,label:new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z')),from:month+'-01'<exercise.start_date?exercise.start_date:month+'-01',to:last>exercise.end_date?exercise.end_date:last});
 }
 return result;
}
export function previousYearDate(value) {
 const [year,month,day]=value.split('-').map(Number),previous=year-1;
 const last=new Date(Date.UTC(previous,month,0)).getUTCDate();
 return String(previous).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(Math.min(day,last)).padStart(2,'0');
}
// A selected whole month compares to the whole month in the previous year.
export function previousYearCutoff(value) {
 const previous=previousYearDate(value),[year,month,day]=value.split('-').map(Number);
 if(day!==new Date(Date.UTC(year,month,0)).getUTCDate())return previous;
 return previous.slice(0,8)+String(new Date(Date.UTC(year-1,month,0)).getUTCDate()).padStart(2,'0');
}
export function previousExerciseEnd(start) {
 const day=new Date(start+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-1);
 return day.toISOString().slice(0,10);
}
