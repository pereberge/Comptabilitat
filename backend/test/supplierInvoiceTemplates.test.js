import test from 'node:test'
import assert from 'node:assert/strict'
import { learnSupplierTemplate, applySupplierTemplate, supplierMatches } from '../src/services/supplier-invoices/supplier-templates.js'
const draft={supplier:{name:'Example SL',taxId:'B12345678',address:'Main Street',email:'office@example.invalid'},invoiceNumber:'A-001',invoiceDate:'2026-11-06',dueDate:'2026-12-06',currency:'EUR',total:'121.00',taxBreakdown:[{taxType:'vat',taxRate:'21.00',taxableBase:'100.00',taxAmount:'21.00'}]}
const sample=`FACTURA
Example SL · CIF B12345678
Identificador: A-001
Emitida el: 06/11/2026
Vence el: 06/12/2026
Neto mercancia: 100,00 EUR
Impuesto 21% cuota 21,00 EUR
Importe a cobrar: 121,00 EUR`
const base=()=>({classification:'invoice',warnings:[],draft:{supplier:{},taxBreakdown:[],withholdings:[],lines:[]}})
test('a reviewed example learns supplier identity and reads new values, never copies old amounts or dates',()=>{
  const template=learnSupplierTemplate(sample,draft)
  assert.ok(template.fields.includes('invoiceNumber'))
  assert.ok(template.fields.includes('invoiceDate'))
  assert.ok(template.fields.includes('total'))
  const next=sample.replace('A-001','A-002').replace('06/11/2026','07/11/2026').replace('06/12/2026','07/12/2026').replace('100,00','200,00').replace('21,00','42,00').replace('121,00','242,00')
  const result=applySupplierTemplate(next,template,base())
  assert.deepEqual(result.draft.supplier,draft.supplier)
  assert.equal(result.draft.invoiceNumber,'A-002')
  assert.equal(result.draft.invoiceDate,'2026-11-07')
  assert.equal(result.draft.dueDate,'2026-12-07')
  assert.equal(result.draft.total,'242.00')
  assert.deepEqual(result.draft.taxBreakdown,[{taxType:'vat',taxableBase:'200.00',taxRate:'21.00',taxAmount:'42.00'}])
})
test('format changes leave missing fields empty and a different supplier does not use the template',()=>{
  const template=learnSupplierTemplate(sample,draft)
  const changed=applySupplierTemplate('FACTURA\nCIF B12345678\nChanged layout',template,base())
  assert.equal(changed.draft.total,undefined)
  assert.equal(changed.draft.invoiceNumber,undefined)
  assert.deepEqual(changed.draft.taxBreakdown,[])
  const initial=base()
  assert.equal(applySupplierTemplate(sample.replace('B12345678','B87654321'),template,initial),initial)
  assert.equal(supplierMatches('XB12345678X',draft.supplier),false)
})
test('shared-line fields use new values in adjacent columns',()=>{
  const text='FACTURA\nCIF B12345678\nFactura A-001 Data 06/11/2026\nTotal 121,00 EUR'
  const template=learnSupplierTemplate(text,draft)
  const result=applySupplierTemplate(text.replace('A-001','A-999').replace('06/11/2026','10/11/2026').replace('121,00','99,00'),template,base())
  assert.equal(result.draft.invoiceNumber,'A-999')
  assert.equal(result.draft.invoiceDate,'2026-11-10')
  assert.equal(result.draft.total,'99.00')
})
test('training rejects scans, missing identity and values absent from the document',()=>{
  assert.throws(()=>learnSupplierTemplate('',draft),{status:422})
  assert.throws(()=>learnSupplierTemplate(sample,{...draft,supplier:{name:'Example'}}),{status:422})
  assert.throws(()=>learnSupplierTemplate('CIF B12345678\nNothing else',draft),{status:422})
})
