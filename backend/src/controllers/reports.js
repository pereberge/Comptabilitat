export const reportController = {
 balanceSheet: async (req,res) => res.json(await req.reports.balanceSheet(req.query)),
 ledger: async (req,res) => res.json(await req.reports.ledger(req.query)),
 trialBalance: async (req,res) => res.json(await req.reports.trialBalance(req.query)),
};
