export function contextController(service) {
  return {
    context: async (req, res) => res.json(await service.getContext(req.companyId)),
    companies: async (req, res) => res.json(await service.listCompanies()),
    health: async (req, res) => res.json(await service.health()),
  };
}
