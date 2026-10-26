export const item=(text,x,y)=>({text,x,y});
export function farmPages({reference='2026-1-1',tax='A25006107',withFarms=true,invoiceDate='16/01/2026'}={}){
 const items=[item('Nº FACTURA',42,728),item('DATA FACTURA',120,728),item('C.I.F. CLIENT',44,686),item('QUANTITAT',353,635),item('PREU',415,635),item('IMPORT',467,635),item('TOTAL ALB.',515,635),item('CODI',110,635),item('DESCRIPCIÓ',227,635),item(reference,45,709),item(invoiceDate,131,709),item(tax,45,667),item('NIF: F25003518',295,761),item('Cooperativa de prueba',295,800)];
 if(withFarms)items.push(item('GRANJA:',101,610),item('1 Granja A',158,610));
 for(const [index,amount]of ['10,005','20,005'].entries()){
  const y=580-index*60;
  if(index&&withFarms)items.push(item('GRANJA:',101,y+20),item('2 Granja B',158,y+20));
  items.push(item('65000001',99,y),item('10',142,y),item('PINSO TEST',157,y),item('1,00',386,y),item(amount+'00',415,y),item(amount,480,y),item(index?'30,010':'10,005',529,y));
 }
 items.push(item('TOTAL BRUT',46,110),item('BASE IMP.',184,110),item('QUOTA IVA',278,110),item('TOTAL EUR',455,109),item('30,01',71,93),item('30,01',206,93),item('3,00',305,93),item('10,00',243,92),item('33,01',480,92));
 return [{page:1,items}];
}
export function farmPdf(options){
 const rows=farmPages(options)[0].items,literal=value=>value.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7e]/g,char=>'\\'+char.charCodeAt(0).toString(8).padStart(3,'0'));
 const content=rows.map(row=>`BT /F1 8 Tf ${row.x} ${row.y} Td (${literal(row.text)}) Tj ET`).join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R] /Count 1 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
 let document='%PDF-1.4\n',offsets=[0];for(const [index,object]of objects.entries()){offsets.push(Buffer.byteLength(document));document+=`${index+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(document);document+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(document);
}
