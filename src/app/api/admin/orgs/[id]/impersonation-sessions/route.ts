import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listImpersonationSessionPage } from "@/lib/db/impersonation-audit";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";

const PAGE_SIZES = [10, 20, 50];

// GET /api/admin/orgs/:id/impersonation-sessions — on-demand page fetch for the Support
// activity tab (src/components/admin/impersonation-audit/). Super-admin only, mirroring
// the sibling generations route.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSuperAdmin();
  const { id: orgId } = await params;
  const url = new URL(req.url);

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const rawPageSize = Number(url.searchParams.get("pageSize") ?? 20) || 20;
  const pageSize = PAGE_SIZES.includes(rawPageSize) ? rawPageSize : 20;

  return withTryCatch("Failed to load support activity.", async () => {
    const result = await listImpersonationSessionPage(orgId, { page, pageSize });
    return apiOk(result);
  });
}
