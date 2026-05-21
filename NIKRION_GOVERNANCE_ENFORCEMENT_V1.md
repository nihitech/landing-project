# NIKRION Governance Enforcement Layer v1

Implemented enforcement:
- Vehicle master create/update/delete now requires Governance Matrix authority or explicit vehicle.modify permission.
- Reports generation now requires management/report authority.
- Critical full lead edits are blocked for sales users and return approval_required response.
- Sales users get Vehicle Status read-only page.
- UI hides vehicle master / organization / reports links depending on /api/governance/me.

Important:
- This is enforcement layer v1. Next layer should connect the lead edit approval modal directly into leads UI.
