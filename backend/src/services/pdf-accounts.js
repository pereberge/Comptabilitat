import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Adapter for the supplied LISTADO DE SUBCUENTAS report. Coordinates distinguish
// descriptions from tax IDs/addresses, unlike flattening the page into plain text.
export function extractPage(items, page) {
  const text = items.filter(item => typeof item.str === 'string' && item.str.trim()).map(item => ({
    text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width,
  }));
  const codeHeader = text.find(item => item.text === 'Subcuenta');
  const nameHeader = text.find(item => item.text === 'Concepto');
  const taxHeader = text.find(item => item.text === 'NIF / CIF');
  if (!codeHeader || !nameHeader || !taxHeader || !text.some(item => item.text === 'LISTADO DE SUBCUENTAS')) throw new Error('PDF_UNSUPPORTED_LAYOUT');
  const companyLabel = text.find(item => item.text === 'Empresa :');
  const company = companyLabel ? text.filter(item => Math.abs(item.y-companyLabel.y)<2 && item.x>companyLabel.x+40).map(item=>item.text).join(' ') : '';
  const codes = text.filter(item => item.y < codeHeader.y-5 && item.x < codeHeader.x+30);
  const rows = codes.map(item => {
    const description = text.filter(other => Math.abs(other.y-item.y)<2 && other.x>item.x+item.width && other.x<taxHeader.x-20)
      .sort((a,b)=>a.x-b.x).map(other=>other.text).join(' ').trim();
    return { code:item.text, description, page };
  });
  return { company, rows };
}

export async function extractPdf(buffer) {
  if (Buffer.from(buffer).subarray(0,5).toString() !== '%PDF-') throw new Error('PDF_INVALID');
  const task = getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true,verbosity:0});
  try {
    const document = await task.promise;
    if (document.numPages>100) throw new Error('PDF_TOO_MANY_PAGES');
    const rows=[], companies=new Set();
    for(let page=1;page<=document.numPages;page++) {
      const content=await (await document.getPage(page)).getTextContent();
      const extracted=extractPage(content.items,page);
      if(extracted.company)companies.add(extracted.company);
      rows.push(...extracted.rows);
      if(rows.length>5000)throw new Error('PDF_TOO_MANY_ROWS');
    }
    if(companies.size>1)throw new Error('PDF_MULTIPLE_COMPANIES');
    if(!rows.length)throw new Error('PDF_NO_ACCOUNTS');
    return {pages:document.numPages,source_company:[...companies][0]||'',rows};
  } finally { await task.destroy(); }
}
