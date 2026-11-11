import {cents,decimal,signedCents} from '../../../shared/money.js';
const normalize=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export function partialReceiptMatch(receipt,movement){
 const signed=signedCents(movement.amount),payment=signed<0n?-signed:signed,remaining=cents(receipt.remaining_amount);
 if(payment===0n||remaining<=payment||receipt.remittance_id||!['pending','partial'].includes(receipt.status)||receipt.direction!==(signed<0n?'received':'issued')||receipt.invoice_date>movement.date)return null;
 const reference=normalize(receipt.reference).replaceAll(' ',''),concept=normalize(movement.concept);
 const referenceMatches=reference.length>=4&&(normalize(movement.reference).replaceAll(' ','')===reference||concept.replaceAll(' ','').includes(reference));
 const names=normalize(receipt.party_name).split(' ').filter(word=>word.length>=4);
 const partyMatches=names.length>0&&names.every(word=>concept.split(' ').includes(word));
 if(!referenceMatches&&!partyMatches)return null;
 return {partial_payment:true,payment_amount:decimal(payment),remaining_after_payment:decimal(remaining-payment),match_basis:referenceMatches?'Referència coincident; pagament parcial pendent de validar':'Nom del tercer coincident; pagament parcial pendent de validar'};
}
export function reconciliationReceiptPayment(remainingAmount,movementAmount,partial=false){
 const remaining=cents(remainingAmount),signed=signedCents(movementAmount),payment=signed<0n?-signed:signed;
 if(payment===0n||(partial?payment>=remaining:payment!==remaining))throw Error('RECONCILIATION_RECEIPT_CHANGED');
 return decimal(payment);
}
