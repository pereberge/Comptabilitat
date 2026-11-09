export function parseInputDate(value){
 const text=String(value||'').trim(),match=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
 if(!match)return null;
 const iso=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
 const date=new Date(iso+'T00:00:00Z');
 return iso>='1000-01-01'&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;
}
export function displayInputDate(value){return /^(\d{4})-(\d{2})-(\d{2})$/.test(value||'')?value.split('-').reverse().join('/'):'';}
