import {HttpError} from '../middleware/errors.js';
// Opaque IDs are never interpreted as a URL or filesystem path. A future adapter
// will call Gestion's authenticated API after the caller's company is authorized.
export function integrationDocumentReference(invoice){return {companyId:invoice.company_id,sourceSystem:invoice.source_system,documentExternalId:invoice.document_external_id};}
export function createIntegrationDocumentService(provider){return {
 async getFile(reference,authorization){
  if(!authorization?.authenticated||!authorization.allowedCompanyIds?.includes(reference.companyId))throw new HttpError(403,'PERMISSION_DENIED');
  if(!provider)throw new HttpError(501,'INTEGRATION_DOCUMENT_API_UNAVAILABLE');
  return provider.getFile(reference);
 },
};}
