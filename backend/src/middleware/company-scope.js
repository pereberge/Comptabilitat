import { createAccountImportService } from '../services/account-import.js';
import { createReportService } from '../services/reports.js';
import { HttpError } from './errors.js';
import { createAccountingService } from '../services/accounting.js';
import { createExerciseService } from '../services/exercises.js';
import { createExerciseOperationService } from '../services/exercise-operations.js';
import { createJournalImportService } from '../services/journal-import.js';
import { createInvoiceDeliveryService } from '../services/invoice-delivery.js';
import { createInvoiceService } from '../services/invoices.js';
import { createPortfolioService } from '../services/portfolio.js';
import {createBankRemittanceService} from '../services/bank-remittances.js';
import { createBankReconciliationService } from '../services/bank-reconciliations.js';
import { createBankImportService } from '../services/bank-import.js';
import { createAccountingReviewService } from '../services/accounting-review.js';
import { createInvoiceDocumentService } from '../services/invoice-documents.js';
import { createExerciseClearService } from '../services/exercise-clear.js';
import { createInvoiceDeletionService } from '../services/invoice-deletion.js';
import { createDocumentationService } from '../services/documentation.js';
import { createVerifactuService } from '../services/verifactu.js';
import {createAutomaticBackupManager} from '../services/automatic-backups.js';
import { createDataBackupService } from '../services/data-backup.js';
import { createCompanyEvolutionService } from '../services/company-evolution.js';
import {createFarmService} from '../services/farms.js';
import { createVatService } from '../services/vat.js';

// Scope belongs to the request, never to global server state.
export function companyScope(db, defaultCompanyId, {automaticBackups=createAutomaticBackupManager(db)}={}) {
  const evolution=createCompanyEvolutionService(db);
  return async (req, res, next) => {
    if(req.path.toLowerCase().replace(/\/+$/,'')==='/master/company-evolution'){req.companyEvolution=evolution;return next();}
    if (req.path === '/health' || /^\/companies(?:\/|$)/.test(req.path)) return next();
    const value = req.get('X-Company-Id') ?? String(req.user?.role==='user'?(req.user.company_ids[0]||''):defaultCompanyId);
    if(req.user?.role==='user'&&!req.user.company_ids.length)throw new HttpError(403,'ACCESS_NO_COMPANIES');
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new HttpError(400, 'INVALID_COMPANY');
    const companyId = Number(value);
    if(req.user?.role==='user'&&!req.user.company_ids.includes(companyId))throw new HttpError(403,'ACCESS_COMPANY_DENIED');
    const [[company]] = await db.execute('SELECT id FROM companies WHERE id=?', [companyId]);
    if (!company) throw new HttpError(404, 'COMPANY_NOT_FOUND');
    req.companyId = companyId;
    req.vat = createVatService(db,companyId);
    req.farms = createFarmService(db,companyId);
    req.exercises = createExerciseService(db, companyId);
    req.exerciseClear = createExerciseClearService(db,companyId);
    req.exerciseOperations = createExerciseOperationService(db, companyId);
    req.journalImport = createJournalImportService(db, companyId);
    req.invoiceDelivery = createInvoiceDeliveryService(db,companyId);
    req.invoices = createInvoiceService(db, companyId);
    req.portfolio = createPortfolioService(db, companyId);
    req.bankRemittances=createBankRemittanceService(db,companyId);
    req.bankReconciliations = createBankReconciliationService(db, companyId);
    req.bankImport = createBankImportService(db, companyId);
    req.accountImport = createAccountImportService(db, companyId);
    req.reports = createReportService(db, companyId);
    req.accounting = createAccountingService(db, companyId);
    req.accountingReview = createAccountingReviewService(db, companyId);
    req.invoiceDocuments = createInvoiceDocumentService(db, companyId);
    req.invoiceDeletion = createInvoiceDeletionService(db,companyId);
    req.documentation = createDocumentationService(db,companyId,{companyIds:req.user?.role==='master'?null:req.user?.company_ids||[companyId],actorKey:req.user?.key||''});
    req.verifactu = createVerifactuService(db,companyId);
    req.dataBackup = createDataBackupService(db,companyId);
    req.automaticBackups = automaticBackups.forCompany(companyId);
    next();
  };
}
