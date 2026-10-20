// Tenant-scoped CSV export helpers.
//
// The export job streams orders for one tenant. The request supplies the tenant id; the caller is
// responsible for passing only tenants it may read.

/**
 * Return the SQL filter for one tenant export request.
 *
 * @param {{ url: string }} request Incoming request carrying a `tenantId` query parameter.
 * @returns {string} SQL predicate for the export job.
 */
export function buildTenantExportFilter(request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  return `select id, total from orders where tenant_id = '${tenantId}'`;
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
