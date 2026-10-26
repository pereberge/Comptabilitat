export const companyFormats=Object.freeze(['general','pig_production']);
const capabilities=Object.freeze({general:Object.freeze(['journal_libro_diario']),pig_production:Object.freeze(['journal_libro_diario','journal_diari_ca','pig_production'])});
export const companyHasCapability=(company,capability)=>(capabilities[company?.business_format||'general']||[]).includes(capability);
