const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function bankStatementArchiveInfo(row){
 const snapshot=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot||{},source=snapshot.source||{},account=snapshot.account||{};
 const bankName=account.name_by_user||row.bank_name||account.stored_name||row.account_name||'Banc';
 const date=[source.statement_date,source.full_to,source.to].find(validDate)||null;
 const bankFileName=String(bankName).normalize('NFD').replace(/\p{M}/gu,'').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100)||'Banc';
 const extension=row.source_mime?.includes('csv')||/\.csv$/i.test(row.source_name||'')?'csv':'pdf';
 return {bank_name:bankName,statement_date:date,date_origin:validDate(source.statement_date)?source.statement_date_origin||'document':'period_end',
  period_from:source.full_from||source.from||null,period_to:source.full_to||source.to||null,
  archive_name:'Extracte-'+bankFileName+'-'+(date||'sense-data')+'.'+extension};
}
export async function archiveOtherBankStatements(db,companyId,exerciseId,currentId){
 await db.execute(`UPDATE bank_reconciliations SET snapshot=JSON_SET(snapshot,'$.workflow','archived'),version=version+1
  WHERE company_id=? AND exercise_id=? AND id<>? AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.workflow')),'')<>'archived'`,[companyId,exerciseId,currentId]);
}
