export function invoicePages(customer='INVOICE TEST SL',reference='SUP-2026-1',options={}){
 return [{page:1,items:[
 'Proveedor: '+(options.supplierName||'Electric Supplies SL'),'CIF proveedor: '+(options.supplierTaxId??'B11111111'),'Cliente: '+customer,'CIF cliente: '+(options.customerTaxId??'B12345674'),
 'Numero factura: '+reference,'Fecha factura: 15/10/2026','Fecha vencimiento: 22/10/2026',
 'Concepto: Suministro','Base imponible: 16,33','IVA 21 %','Cuota IVA: 3,43','Total factura: 19,76',
 ].map((text,index)=>({text,x:35,y:780-index*24}))}];
}
export function invoicePdf(customer,reference,options={}){
 const rows=invoicePages(customer,reference,options)[0].items;
 const literal=value=>value.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7e]/g,char=>'\\'+char.charCodeAt(0).toString(8).padStart(3,'0'));
 const content=rows.map(row=>`BT /F1 10 Tf ${row.x} ${row.y} Td (${literal(row.text)}) Tj ET`).join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R] /Count 1 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
 let document='%PDF-1.4\n',offsets=[0];for(const [index,object]of objects.entries()){offsets.push(Buffer.byteLength(document));document+=`${index+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(document);document+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(document);
}
