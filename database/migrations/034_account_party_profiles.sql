ALTER TABLE accounts ADD COLUMN party_profile JSON NULL
-- statement
ALTER TABLE trade_invoices ADD COLUMN party_snapshot JSON NULL
-- statement
UPDATE accounts a JOIN suppliers s ON s.company_id=a.company_id AND s.account_id=a.id
SET a.party_profile=JSON_OBJECT('name',s.legal_name,'tax_id',s.tax_id,'address',s.address,'postal_code',s.postal_code,'city',s.city,'province',s.province,'country',s.country,'contact_person',s.contact_person,'phone',s.phone,'email',s.email)
WHERE a.kind='subaccount' AND LEFT(a.code,3) IN ('400','410') AND a.party_profile IS NULL
-- statement
UPDATE accounts a JOIN trade_invoices i ON i.company_id=a.company_id AND i.party_account_id=a.id
JOIN (SELECT company_id,party_account_id,MAX(id) AS invoice_id FROM trade_invoices GROUP BY company_id,party_account_id) latest ON latest.invoice_id=i.id
SET a.party_profile=JSON_OBJECT('name',i.party_name,'tax_id',i.party_tax_id,'address',i.party_address,'postal_code','','city','','province','','country','','contact_person','','phone','','email',i.party_email)
WHERE a.kind='subaccount' AND LEFT(a.code,3) IN ('400','410','430','440') AND a.party_profile IS NULL
