export const accountImportController = {
 preview:async(req,res)=>res.json(await req.accountImport.preview(req.body,req.query.prefix_length||'4')),
 commit:async(req,res)=>res.json(await req.accountImport.commit(req.body?.token)),
};
