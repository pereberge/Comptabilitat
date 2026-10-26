const item=(text,x,y,width=20)=>({text,x,y,width});
export function journalPages(company='JOURNAL TEST SL', {split=false}={}) {
  const headers=()=>[
    item('LIBRO DIARIO',240,790),item('3 - '+company,30,765),item('Desde 01/01/2025 hasta 31/12/2025',30,745),
    ...[['Fecha',35.7],['Nº Asiento',73],['Subcuenta',123],['Nombre',172],['Concepto',370.45],['Debe',474],['Haber',521]].map(([text,x])=>item(text,x,720)),
  ];
  const amounts=(debit,credit,y)=>[item(debit,480,y,30),item(credit,535,y,30)];
  const row=(number,date,code,name,description,debit,credit,y)=>[
    item(date,30,y),item(String(number),78,y),item(code,123,y),item(name,172,y),item(description,322,y),
    ...(debit ? [item(debit,480,y,30)] : []),...(credit ? [item(credit,535,y,30)] : []),
  ];
  const first=row(0,'01/01/2025','57200001','BANCO','ASIENTO DE APERTURA','100,00','',680);
  const rest=[
    ...row(0,'01/01/2025','10000000','CAPITAL','ASIENTO DE APERTURA','','100,00',660),
    item('Total Asiento',350,648),...amounts('100,00','100,00',650),
    ...row(4,'01/06/2025','57200001','BANCO ANTIGUO','RECTIFICACION','-1,50','',620),
    ...row(4,'01/06/2025','10000000','CAPITAL','RECTIFICACION','','-1,50',600),
    item('Total Asiento',350,588),...amounts('-1,50','-1,50',590),
    ...row(50,'01/07/2025','57200001','BANCO','OPERACION EXENTA','','',560),
    ...row(50,'01/07/2025','10000000','CAPITAL','OPERACION EXENTA','','',540),
    item('Total Asiento',350,528),
    ...row(196,'31/12/2025','10000000','CAPITAL','ASIENTO DE CIERRE','98,50','',500),
    ...row(196,'31/12/2025','57200001','BANCO','ASIENTO DE CIERRE','','98,50',480),
    item('Total Asiento',350,468),...amounts('98,50','98,50',470),
    item('Total Informe',350,40),...amounts('197,00','197,00',42),
  ];
  if(!split)return [{page:1,items:[...headers(),...first,...rest]}];
  return [
    {page:1,items:[...headers(),...first,item('Total Informe',350,40),...amounts('100,00','0,00',42)]},
    {page:2,items:[...headers(),...amounts('100,00','0,00',695),...rest]},
  ];
}

// Real PDF bytes exercise the same PDF.js/worker path as a user upload.
export function journalPdf(company, options) {
  return journalPagesPdf(journalPages(company,options));
}
export function journalPagesPdf(pages) {
  const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const pageIds=[];
  const literal=value=>value.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7e]/g,char=>'\\'+char.charCodeAt(0).toString(8).padStart(3,'0'));
  for(const page of pages){
    const id=objects.length+1, content=page.items.map(row=>`BT /F1 8 Tf ${row.x} ${row.y} Td (${literal(row.text)}) Tj ET`).join('\n');
    pageIds.push(id);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]=`<< /Type /Pages /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] /Count ${pages.length} >>`;
  let document='%PDF-1.4\n', offsets=[0];
  for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(document));document+=`${index+1} 0 obj\n${object}\nendobj\n`;}
  const xref=Buffer.byteLength(document);
  document+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(document);
}
