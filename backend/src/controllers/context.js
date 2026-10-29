export function contextController(service) {
  return {
    context: async (req, res) => res.json(await service.getContext(req.companyId)),
    companies: async (req, res) => {const rows=await service.listCompanies();res.json(req.user?.role==='user'?rows.filter(row=>req.user.company_ids.includes(row.id)):rows);},
    company: async (req, res) => res.json(await service.getCompany(req.params.id)),
    createCompany: async (req, res) => res.status(201).json(await service.createCompany(req.body)),
    updateCompany: async (req, res) => res.json(await service.updateCompany(req.params.id, req.body)),
    companyLogo: async (req, res) => {
      const logo = await service.getCompanyLogo(req.params.id);
      res.type(logo.mime_type).set('X-Content-Type-Options', 'nosniff').send(logo.content);
    },
    health: async (req, res) => res.json(await service.health()),
  };
}
