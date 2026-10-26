import { parentPort, workerData } from 'node:worker_threads';
import { extractJournalPdf } from './pdf-journal.js';
try { parentPort.postMessage({type:'journal-result',data:await extractJournalPdf(workerData)}); }
catch (error) { parentPort.postMessage({type:'journal-result',error:error.message?.startsWith('PDF_JOURNAL_') ? error.message : 'PDF_JOURNAL_INVALID'}); }
