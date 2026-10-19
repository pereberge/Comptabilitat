export function accountingController(service) {
 return {
  accounts:async(req,res)=>res.json(await (req.accounting || service).listAccounts(req.query)),
  account:async(req,res)=>res.json(await (req.accounting || service).getAccount(req.params.id)),
  createAccount:async(req,res)=>res.status(201).json(await (req.accounting || service).createAccount(req.body)),
  updateAccount:async(req,res)=>res.json(await (req.accounting || service).updateAccount(req.params.id,req.body)),
  nextCode:async(req,res)=>res.json(await (req.accounting || service).nextCode(req.params.id)),
  entries:async(req,res)=>res.json(await (req.accounting || service).listEntries(req.query)),
  entry:async(req,res)=>res.json(await (req.accounting || service).getEntry(req.params.id)),
  createEntry:async(req,res)=>res.status(201).json(await (req.accounting || service).createEntry(req.body)),
 };
}
