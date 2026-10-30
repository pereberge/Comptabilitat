import {corporateAmount} from '../../../shared/corporate-tax.js';
import {decimal} from '../../../shared/money.js';
export async function readCorporateTaxSettlement(db,companyId,model){
 const [accounts]=await db.execute("SELECT a.id,a.code,a.description,p.code AS parent_code FROM accounts a JOIN accounts p ON p.company_id=a.company_id AND p.id=a.parent_id WHERE a.company_id=? AND a.kind='subaccount' AND (p.code LIKE '6300%' OR p.code LIKE '473%' OR p.code LIKE '4752%' OR p.code LIKE '4709%') ORDER BY a.code",[companyId]);
 const issues=[],lines=[],required=[];
 const choose=prefix=>{const matches=accounts.filter(row=>row.parent_code.startsWith(prefix));required.push({prefix,candidates:matches});if(matches.length!==1){issues.push(matches.length?'CORPORATE_TAX_AMBIGUOUS_ACCOUNT':'CORPORATE_TAX_MISSING_ACCOUNT');return {id:null,code:prefix,description:'Subcuenta pendiente de '+prefix};}return matches[0];};
 const add=(account,value)=>{if(!value)return;lines.push({account_id:account.id,code:account.code,description:account.description,debit:decimal(value>0n?value:0n),credit:decimal(value<0n?-value:0n)});};
 const liquid=corporateAmount(model.summary.liquid_quota),credits=corporateAmount(model.summary.credits),result=liquid-credits;
 if(model.provisional)issues.push('CORPORATE_TAX_REVIEW_REQUIRED');
 if(model.exercise.status!=='open')issues.push('CORPORATE_TAX_EXERCISE_CLOSED');
 if(model.source.settlements.length)issues.push('CORPORATE_TAX_SETTLEMENT_EXISTS');
 else{
  if(liquid)add(choose('6300'),liquid);
  if(credits)add(choose('473'),-credits);
  if(result>0n)add(choose('4752'),-result);else if(result<0n)add(choose('4709'),-result);
 }
 const debit=lines.reduce((sum,row)=>sum+corporateAmount(row.debit),0n),credit=lines.reduce((sum,row)=>sum+corporateAmount(row.credit),0n);
 return {date:model.period.to,description:'Liquidación IS · Modelo 200 · '+model.period.year,lines,required_accounts:required,issues:[...new Set(issues)],totals:{debit:decimal(debit),credit:decimal(credit)},ready:!issues.length&&lines.length>=2&&debit===credit,existing:model.source.settlements,empty:!liquid&&!credits};
}
