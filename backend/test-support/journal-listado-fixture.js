const item=(text,x,y,width=20)=>({text,x,y,width,fontSize:6.6});
export function listadoPages(company='LISTADO TEST SL'){
 const headers=page=>[
  item('LISTADO DEL DIARIO',225,796),item('EMPRESA: '+company,100,783),item('DE FECHA: 01/01/2026',301,783),item('A FECHA: 31/12/2026',405,783),
  ...[['CUENTA',25.5],['NOMBRE',80.7],['CONCEPTO',264],['DEBE',474.2],['HABER',538.7]].map(([text,x])=>item(text,x,764)),item(String(page),565,13),
 ];
 const heading=(number,date,description,y)=>[item(date,23.2,y),{...item('13:03:27',67.4,y),fontSize:2},item(String(number),83,y,42),item(description,156,y)];
 const amounts=(debit,credit,y)=>[item(debit,455,y,37),item(credit,527,y-.95,37)];
 const line=(code,name,description,debit,credit,y)=>[item(code,23.2,y),item(name,80.7,y),item(description,264,y-.05),...amounts(debit,credit,y),item('\u00a8',571.3,y-1.05)];
 const total=(text,debit,credit,y)=>[item(text,380,y),...amounts(debit,credit,y)];
 return [
  {page:1,items:[...headers(1),...heading(2026000000,'01/01/2026','APERTURA',744),...line('5720000001','BANCO','APERTURA','100,00','0,00',724)]},
  {page:2,items:[...headers(2),...line('1000000000','CAPITAL','APERTURA','0,00','100,00',744),...total('Total asiento:','100,00','100,00',724),
   ...heading(2026000040,'02/01/2026','RECTIFICACION',704),item('FACTURA',156,694),
   ...line('5720000001','BANCO ANTIGUO','RECTIFICACION','-1,50','0,00',674),...amounts('0,00','0,00',654),item('\u00a8',571.3,652.95),
   ...line('1000000000','CAPITAL','RECTIFICACION','0,00','-1,50',634),...total('Total asiento:','-1,50','-1,50',614),
   ...heading(2026000042,'03/01/2026','OPERACION EXENTA',594),...line('5720000001','BANCO','EXENTA','0,00','0,00',574),...line('1000000000','CAPITAL','EXENTA','0,00','0,00',554),...total('Total asiento:','0,00','0,00',534),
   ...total('Total general:','98,50','98,50',60),...amounts('999,99','333,33',40),
  ]},
 ];
}
