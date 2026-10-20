// Tenant-scoped CSV export helpers.
//
// The export job streams orders for one tenant. The request supplies the tenant id; the caller is
// responsible for passing only tenants it may read.

/**
 * Return the SQL filter for one tenant export request.
 *
 * @param {{ url: string }} request Incoming request carrying a `tenantId` query parameter.
 * @param {string[]} memberships Tenants the caller may export.
 * @returns {{ text: string, values: string[] }} Parameterized SQL predicate for the export job.
 */
export function buildTenantExportFilter(request, memberships) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId || !Array.isArray(memberships) || !memberships.includes(tenantId)) {
    throw new Error("forbidden");
  }
  return { text: "select id, total from orders where tenant_id = $1", values: [tenantId] };
}

/**
 * Render one CSV row.
 *
 * @param {{ id: string, total: number }} order
 * @returns {string}
 */
export function formatExportRow(order) {
  return `${order.id},${order.total}`;
}
