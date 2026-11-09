import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLocalInvoice } from '../src/services/supplier-invoices/local-extraction.js'
const invoice=`FACTURA
Número de factura: F-2026/123
Fecha factura: 06/11/2026
Vencimiento: 06/12/2026
Proveedor: Papereria Exemple SL
NIF proveedor: B12345678
Base imponible: 1.000,00 EUR
IVA 21% 210,00 EUR
TOTAL FACTURA: 1.210,00 EUR`
test('local rules read explicit invoice fields and a single tax breakdown without AI',()=>{
  const result=parseLocalInvoice(invoice)
  assert.equal(result.classification,'invoice')
  assert.equal(result.draft.invoiceNumber,'F-2026/123')
  assert.equal(result.draft.invoiceDate,'2026-11-06')
  assert.equal(result.draft.dueDate,'2026-12-06')
  assert.equal(result.draft.supplier.name,'Papereria Exemple SL')
  assert.equal(result.draft.supplier.taxId,'B12345678')
  assert.equal(result.draft.total,'1210.00')
  assert.deepEqual(result.draft.taxBreakdown,[{taxType:'vat',taxableBase:'1000.00',taxRate:'21',taxAmount:'210.00'}])
})
test('line-separated labels work and ambiguous totals or suppliers remain empty',()=>{
  const result=parseLocalInvoice('Factura\nNº FACTURA\n2026-100\nData\n06/11/2026\nTotal\n100,00 EUR\nTotal factura: 200,00 EUR\nNIF: A12345678\nCliente: Client Exemple')
  assert.equal(result.draft.invoiceNumber,'2026-100')
  assert.equal(result.draft.invoiceDate,'2026-11-06')
  assert.equal(result.draft.total,undefined)
  assert.deepEqual(result.draft.supplier,{})
})
test('multiple invoices never combine invoice headers and totals into one draft',()=>{
  const result=parseLocalInvoice(invoice+'\nNúmero de factura: F-2026/124')
  assert.equal(result.classification,'unknown')
  assert.equal(result.draft.total,undefined)
  assert.equal(result.draft.invoiceNumber,undefined)
})
test('delivery notes, reminders, scans and invalid dates require review',()=>{
  assert.equal(parseLocalInvoice('ALBARÀ 123\nTOTAL: 121,00 EUR').classification,'delivery_note')
  assert.equal(parseLocalInvoice(invoice,{subject:'Recordatori factura vençuda'}).receptionType,'payment_reminder')
  assert.deepEqual(parseLocalInvoice('').draft.supplier,{})
  assert.equal(parseLocalInvoice('FACTURA 123\nFecha factura: 31/02/2026').draft.invoiceDate,undefined)
})
test('numbers support dot decimal and negative totals, without inventing missing taxes',()=>{
  assert.equal(parseLocalInvoice('FACTURA A-10\nTOTAL: -1,234.56 EUR').draft.total,'-1234.56')
  assert.deepEqual(parseLocalInvoice('FACTURA A-10\nTOTAL: 100,00 EUR').draft.taxBreakdown,[])
})
