export const treasuryBackupTables={
 treasury_receipt_accounts:{key:['receipt_id'],refs:{receipt_id:'portfolio_receipts',bank_account_id:'accounts'}},
 treasury_plans:{key:['request_id'],refs:{bank_account_id:'accounts',linked_receipt_id:'portfolio_receipts'}},
};
