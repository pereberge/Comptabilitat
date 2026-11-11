export function santIsidrePages(customer='CUSTOMER TEST SA'){
 const item=(text,x,y)=>({text,x,y});
 function page(page,reference,date,start,count,footer,totalCount,farm=true){
  const items=[item('Nº FACTURA',43,730),item('DATA FACTURA',120,730),item('Nº CLIENT',209,730),item(reference,44,710),item(date,132,710),item('C.I.F. CLIENT',42,688),item('A12345678',47,668),item(customer,305,725),item('Camp i secció de crèdit Sant Isidre',295,802),item('NIF: F25003518',295,763),item('Avda. TEST 1',295,792),item('25337 TEST',295,773),item('CODI',109,637),item('DESCRIPCIÓ',228,637),item('IVA',143,632),item('Un.',328,637),item('QUANTITAT',352,637),item('PREU',414,637),item('IMPORT',465,637),item('TOTAL ALB.',515,637)];
  if(farm)items.push(item('GRANJA:',102,617),item('FARM TEST',159,617));
  for(let index=0;index<count;index++){const y=599-index*29;items.push(item(String(start+index).padStart(8,'0'),100,y),item('10',143,y),item('ARTICLE TEST '+(start+index),157,y),item('1,00',371,y),item('1,00000',420,y),item('1,000',470,y));}
  if(footer)items.push(item('BASE IMP.',183,111),item('QUOTA IVA',279,111),item('TOTAL EUR',454,110),item('%',254,111),item(totalCount.toFixed(2).replace('.',','),195,95),item((totalCount/10).toFixed(2).replace('.',','),294,95),item((totalCount*1.1).toFixed(2).replace('.',','),469,93),item('10,00',244,94),item(date.replace('/10/','/12/'),37,62));
  return {page,items};
 }
 return [page(1,'2026-1-TEST-A','17/10/2026',1,19,false),page(2,'2026-1-TEST-A','17/10/2026',20,18,false),page(3,'2026-1-TEST-A','17/10/2026',0,0,true,37),page(4,'2026-1-TEST-B','24/10/2026',101,19,false),page(5,'2026-1-TEST-B','24/10/2026',120,1,true,20,false)];
}
export function santIsidrePdf(customer){
 const pages=santIsidrePages(customer),literal=value=>value.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7e]/g,char=>'\\'+char.charCodeAt(0).toString(8).padStart(3,'0'));
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+pages.map((_,index)=>(4+index*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
 for(const [index,page] of pages.entries()){const content=page.items.map(row=>`BT /F1 8 Tf ${row.x} ${row.y} Td (${literal(row.text)}) Tj ET`).join('\n');objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+index*2)+' 0 R >>','<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'\nendstream');}
 let document='%PDF-1.4\n',offsets=[0];for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(document));document+=(index+1)+' 0 obj\n'+object+'\nendobj\n';}const xref=Buffer.byteLength(document);document+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(document);
}
