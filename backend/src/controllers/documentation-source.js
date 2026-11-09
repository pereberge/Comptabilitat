// Detect preview-safe formats from bytes, never from a filename or stored MIME.
export function documentSourceType(content){
 if(!Buffer.isBuffer(content))return 'application/octet-stream';
 if(/^%PDF-[12]\.\d\s/.test(content.subarray(0,16).toString('latin1')))return 'application/pdf';
 if(content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(content[0]===255&&content[1]===216&&content[2]===255)return 'image/jpeg';
 return 'application/octet-stream';
}
export async function documentationSource(req,res){
 const source=await req.documentation.source(req.params.id);
 const mime=documentSourceType(source.content),inline=mime==='application/pdf'&&req.query.download!=='1';
 const filename=encodeURIComponent(source.source_name||'factura.pdf').replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
 res.set('Content-Type',mime).set('X-Content-Type-Options','nosniff')
  .set('Content-Disposition',(inline?'inline':'attachment')+'; filename="'+(mime==='application/pdf'?'factura.pdf':'document')+'"; filename*=UTF-8\'\''+filename)
  .send(source.content);
}
