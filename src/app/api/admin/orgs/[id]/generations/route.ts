import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  listGenerationsForOrgPage,
  isGenerationsPageSize,
  type GenerationsPageSize,
} from "@/lib/db/generations";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";

// GET /api/admin/orgs/:id/generations — on-demand page fetch for the admin generations
// table (src/components/admin/generations-table.tsx). Super-admin only.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSuperAdmin();
  const { id: orgId } = await params;
  const url = new URL(req.url);

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const rawPageSize = Number(url.searchParams.get("pageSize") ?? 20) || 20;
  const pageSize: GenerationsPageSize = isGenerationsPageSize(rawPageSize) ? rawPageSize : 20;
  const query = url.searchParams.get("query") ?? undefined;
  const rawSort = url.searchParams.get("sort");
  const sort = rawSort === "name" ? "name" : "recent";

  return withTryCatch("Failed to load generations.", async () => {
    const result = await listGenerationsForOrgPage(orgId, { page, pageSize, query, sort });
    return apiOk(result);
  });
}
