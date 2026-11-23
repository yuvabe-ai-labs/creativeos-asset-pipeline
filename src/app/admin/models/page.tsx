import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  listAdminModels,
  listAdminPrices,
  modelMonthStats,
} from "@/lib/db/ai-models-admin";
import { currentPrice } from "@/lib/ai-models/pricing";
import type { AiModel, AiModelPrice } from "@/lib/ai-models/types";
import { ModelsTable, type ModelListRow } from "@/components/admin/models/models-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Models — Admin" };

function priceSummary(price: AiModelPrice | null): string | null {
  if (!price || price.lines.length === 0) return null;
  const shown = price.lines.slice(0, 2).map((l) => `$${l.unit_usd} / ${l.meter.replace(/_/g, " ")}`);
  const more = price.lines.length - shown.length;
  return more > 0 ? `${shown.join(", ")} +${more} more` : shown.join(", ");
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export default async function AdminModelsPage() {
  await requireSuperAdmin();

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const [models, prices, stats] = await Promise.all([
    listAdminModels(),
    listAdminPrices(),
    modelMonthStats(from, to),
  ]);

  const catalog = {
    models: models.flatMap((m) => (m.model ? [m.model as AiModel] : [])),
    prices: prices.flatMap((p) => (p.price ? [p.price] : [])),
  };
  const statsById = new Map(stats.map((s) => [s.modelId, s]));

  const rows: ModelListRow[] = models.map((m) => {
    const id = m.model?.id ?? str(m.raw.id) ?? "";
    const s = statsById.get(id);
    return {
      id,
      label: m.model?.label ?? str(m.raw.label) ?? id,
      provider: m.model?.provider ?? str(m.raw.provider) ?? "",
      kind: m.model?.kind ?? str(m.raw.kind) ?? "other",
      status: m.model?.status ?? str(m.raw.status) ?? "unknown",
      problems: m.problems,
      priceSummary: m.model ? priceSummary(currentPrice(catalog, id, now)) : null,
      runs: s?.runs ?? 0,
      costUsd: s?.costUsd ?? 0,
      unpriced: s?.unpriced ?? 0,
    };
  });

  const month = now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">Runs and cost for {month}</p>
      </div>
      <ModelsTable rows={rows} />
    </main>
  );
}
