import {decimal} from '../../../shared/money.js';
import {amount} from './report-amount.js';
// PGC abbreviated income statement, BOE-A-2007-19884, table #cuentaabreviada.
// Match the real accounting parent. A custom/ambiguous account remains visible for review.
const definitions=[
 ['sales','1. Importe neto de la cifra de negocios.','operating',['700','701','702','703','704','705','706','708','709']],
 ['inventory','2. Variación de existencias de productos terminados y en curso de fabricación.','operating',['6930','71','7930']],
 ['own_work','3. Trabajos realizados por la empresa para su activo.','operating',['73']],
 ['supplies','4. Aprovisionamientos.','operating',['600','601','602','606','607','608','609','61','6931','6932','6933','7931','7932','7933']],
 ['other_income','5. Otros ingresos de explotación.','operating',['740','747','75']],
 ['staff','6. Gastos de personal.','operating',['64','7950','7957']],
 ['other_expenses','7. Otros gastos de explotación.','operating',['62','631','634','636','639','65','694','695','794','7954']],
 ['depreciation','8. Amortización del inmovilizado.','operating',['68']],
 ['grants','9. Imputación de subvenciones de inmovilizado no financiero y otras.','operating',['746']],
 ['provisions','10. Excesos de provisiones.','operating',['7951','7952','7955','7956']],
 ['disposals','11. Deterioro y resultado por enajenaciones del inmovilizado.','operating',['670','671','672','690','691','692','770','771','772','790','791','792']],
 ['exceptional','Otros resultados.','operating',['678','778']],
 ['financial_income','12. Ingresos financieros.','financial',['760','761','762','767','769']],
 ['financial_expenses','13. Gastos financieros.','financial',['660','661','662','664','665','669']],
 ['fair_value','14. Variación de valor razonable en instrumentos financieros.','financial',['663','763']],
 ['exchange','15. Diferencias de cambio.','financial',['668','768']],
 ['financial_disposals','16. Deterioro y resultado por enajenaciones de instrumentos financieros.','financial',['666','667','673','675','696','697','698','699','766','773','775','796','797','798','799']],
 ['tax','17. Impuestos sobre beneficios.','tax',['630','633','638']],
];
export function buildProfitLoss(period) {
 const nodes=definitions.map(([id,label,side,prefixes])=>({id,label,side,prefixes,depth:1,value:0n,children:[],accounts:[]}));
 const unclassified=[],assigned=new Set();let source=0n,unclassifiedTotal=0n;
 for(const row of period.rows){
  if(!/^[67]/.test(row.parent_code||''))continue;
  const debit=amount(row.debit),credit=amount(row.credit),value=credit-debit;
  if(!debit&&!credit)continue;
  const sub={id:row.id,code:row.code,description:row.description,parent_code:row.parent_code,signed_balance:decimal(-value),debit:row.debit,credit:row.credit,amount:decimal(value)};
  source+=value;
  const matches=nodes.filter(node=>node.prefixes.some(prefix=>row.parent_code.startsWith(prefix)));
  if(matches.length!==1||assigned.has(row.id)){unclassified.push({...sub,reason:'UNCLASSIFIED_ACCOUNT'});unclassifiedTotal+=value;continue;}
  assigned.add(row.id);const node=matches[0];node.value+=value;
  let group=node.accounts.find(account=>account.code===row.parent_code);
  if(!group){group={code:row.parent_code,description:row.parent_description||row.parent_code,value:0n,subaccounts:[]};node.accounts.push(group);}
  group.value+=value;group.subaccounts.push(sub);
 }
 const total=side=>nodes.filter(node=>node.side===side).reduce((sum,node)=>sum+node.value,0n);
 const operating=total('operating'),financial=total('financial'),tax=total('tax'),net=operating+financial+tax;
 function serialize({value,prefixes,...node}){return {...node,amount:decimal(value),accounts:node.accounts.map(({value,...account})=>({...account,amount:decimal(value)}))};}
 const sections=[['operating','A) RESULTADO DE EXPLOTACIÓN',operating],['financial','B) RESULTADO FINANCIERO',financial],['tax','IMPUESTOS SOBRE BENEFICIOS',tax]].map(([id,label,value])=>({id,label,depth:0,side:id,amount:decimal(value),accounts:[],children:nodes.filter(node=>node.side===id).map(serialize)}));
 return {...period,rows:undefined,report:'profit_loss',model:'abbreviated',date:period.to,exclude_annual:true,sections,
  source:'https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884#cuentaabreviada',
  totals:{operating:decimal(operating),financial:decimal(financial),before_tax:decimal(operating+financial),net:decimal(net)},result:{total:decimal(net)},
  checks:{complete:!unclassified.length,reconciles:net+unclassifiedTotal===source},
  diagnostic:{unclassified,unclassified_amount:decimal(unclassifiedTotal)},has_activity:period.rows.length>0};
}
