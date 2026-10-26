import {journalPagesPdf} from './journal-fixture.js';
const item=(text,x,y,width=20)=>({text,x,y,width});
export function diariPages(company='DIARI TEST SL',{split=false,merged=false}={}){
 const headers=page=>[
  item(company+' -2026-',111.72,799.2),item('D I A R I',504.72,781.08),item('EUR',537.96,801.84),item('Pàgina '+page,528.6,762.6),
  ...[['Data',47.88],['Apunt Descripció',89.64],['Subcompte',248.16],['Descripció subcompte',311.88],['Deure',479.88],['Haver',541.44]].map(([text,x])=>item(text,x,746.4)),
 ];
 const pair=(debit,credit,y)=>[item(debit,470,y,32),item(credit,530,y,32)];
 const footer=(debit,credit)=>[item('Ròssec:',311.88,42.84),...pair(debit,credit,44.04)];
 const row=(number,date,parent,suffix,name,description,debit,credit,y,combined=false)=>[
  item(date,47.88,y),item(String(number)+(description?' '+description:'')+(combined?parent:''),106.08,y-0.12,combined?152.44:120),
  ...(combined?[]:[item(parent,243.12,y-0.12,15.4)]),item('.',271.32,y-0.12,1.92),item(suffix,274.32,y-0.12,15.4),item(name,312.12,y-0.12,80),
  ...(debit?[item(debit,470,y-0.12,32)]:[]),...(credit?[item(credit,530,y-0.12,32)]:[]),
 ];
 const total=(journal,reference,debit,credit,y)=>[
  item('Diari:',47.88,y,23),item(journal,79.44,y-0.48,12),item('Referència:',119.88,y,49.2),item(reference,183.72,y-0.48,18),item("Suma de l'assentament:",311.88,y,103),...pair(debit,credit,y+1.2),
 ];
 const opening=row(1,'01/01/2026','5720','0001','BANCO','Obertura comptable.','100,00','',700);
 const rest=[
  ...row(2,'01/01/2026','1000','0001','CAPITAL','Obertura comptable.','','100,00',680),...total('01','1','100,00','100,00',660),
  ...row(1,'01/02/2026','5720','0001','BANCO','','-1,50','',620),...row(3,'01/02/2026','7000','0001','VENTAS','','','-1,50',600),...total('D1','1','-1,50','-1,50',580),
  ...row(1,'01/03/2026','5720','0001','BANCO','VENTA','12,34','',540,merged),...row(2,'01/03/2026','7000','0001','VENTAS','VENTA','','12,34',520),...total('S1','7','12,34','12,34',500),
  ...row(1,'01/04/2026','5720','0001','BANCO','SIN IMPORTE','','',460),...row(2,'01/04/2026','7000','0001','VENTAS','SIN IMPORTE','','',440),...total('D1','9','0,00','0,00',420),
  ...footer('110,84','110,84'),
 ];
 return split?[{page:1,items:[...headers(1),...opening,...footer('100,00','0,00')]},{page:2,items:[...headers(2),...rest]}]:[{page:1,items:[...headers(1),...opening,...rest]}];
}
export const diariPdf=(company,options)=>journalPagesPdf(diariPages(company,options));
