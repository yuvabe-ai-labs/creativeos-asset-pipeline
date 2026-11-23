import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  displayNames,
  getAdminModel,
  listAdminModels,
  listAdminPrices,
  modelMonthStats,
  type AdminPriceRow,
} from "@/lib/db/ai-models-admin";
import { RUNNABLE_ADAPTER_KEYS } from "@/lib/ai-models/runnable-keys";
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";
import { ModelDetailsForm } from "@/components/admin/models/model-details-form";
import { ModelMonthStats } from "@/components/admin/models/model-month-stats";
import { ModelDefinition } from "@/components/admin/models/model-definition";
import { PriceHistory, type PriceHistoryRow } from "@/components/admin/models/price-history";
import { AddPriceSheet } from "@/components/admin/models/add-price-sheet";
import { currentPriceRow } from "@/components/admin/models/price-draft";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Model — Admin" };

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Only the fields the history renders; the raw row stays on the server. */
const toHistoryRow = (r: AdminPriceRow): PriceHistoryRow => ({
  id: r.id,
  price: r.price,
  problems: r.problems,
  effectiveFrom: r.effectiveFrom,
  createdAt: r.createdAt,
  createdByName: r.createdByName,
});

export default async function AdminModelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const id = decodeURIComponent((await params).id);

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const [row, models, prices, stats] = await Promise.all([
    getAdminModel(id),
    listAdminModels(),
    listAdminPrices(id),
    modelMonthStats(from, to, id),
  ]);
  if (!row) notFound();

  // Price rows carry their own createdByName (listAdminPrices); only the model's editor is left.
  const names = await displayNames(row.updatedBy ? [row.updatedBy] : []);

  const m = row.model;
  const raw = row.raw;
  const kind = m?.kind ?? str(raw.kind) ?? "other";
  const label = m?.label ?? str(raw.label) ?? id;
  const adapterKey = m?.adapterKey ?? str(raw.adapter_key) ?? "";
  const canGoLive = (kind !== "image" && kind !== "video") || RUNNABLE_ADAPTER_KEYS.has(adapterKey);
  const replacements = models.flatMap((o) =>
    o.model && o.model.status === "live" && o.model.kind === kind && o.model.id !== id
      ? [{ id: o.model.id, label: o.model.label }]
      : [],
  );
  // A saved replacement that has since left live is still named, so the admin sees why.
  const replacedBy = m ? m.replacedBy : str(raw.replaced_by);
  const staleRow = replacedBy && !replacements.some((r) => r.id === replacedBy)
    ? models.find((o) => o.raw.id === replacedBy)
    : undefined;
  const staleReplacement = replacedBy && staleRow
    ? { id: replacedBy, label: staleRow.model?.label ?? str(staleRow.raw.label) ?? replacedBy }
    : null;
  const s = stats[0];
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const current = currentPriceRow(prices, now);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin">Admin</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/models">Models</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{label}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{id}</p>
      </div>

      <div className="flex flex-col gap-6">
        {row.problems.length > 0 && (
          <Card className="px-2">
            <CardHeader>
              <CardTitle>This row fails its check</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <ul className="list-disc pl-5 text-sm">
                {row.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">The app leaves this model out until it is fixed.</p>
            </CardContent>
          </Card>
        )}

        <ModelDetailsForm
          model={{
            id,
            kind,
            label,
            pickerLabel: m ? m.pickerLabel : str(raw.picker_label),
            providerLabel: m?.providerLabel ?? str(raw.provider_label) ?? "",
            description: m ? m.description : str(raw.description),
            status: m?.status ?? str(raw.status) ?? "draft",
            replacedBy,
            sortOrder: m?.sortOrder ?? (typeof raw.sort_order === "number" ? raw.sort_order : 0),
          }}
          canGoLive={canGoLive}
          replacements={replacements}
          staleReplacement={staleReplacement}
          updatedBy={row.updatedBy ? (names.get(row.updatedBy) ?? null) : null}
          updatedAt={m?.updatedAt ?? str(raw.updated_at) ?? ""}
        />

        <ModelMonthStats
          month={month}
          runs={s?.runs ?? 0}
          costUsd={s?.costUsd ?? 0}
          credits={s?.credits ?? 0}
          unpriced={s?.unpriced ?? 0}
        />

        <section id="prices" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">Prices</h2>
            {m && <AddPriceSheet model={m} current={current?.price ?? null} />}
          </div>
          <PriceHistory modelId={id} prices={prices.map(toHistoryRow)} now={now.toISOString()} />
        </section>

        <ModelDefinition
          params={m ? m.params : list<ParamSpec>(raw.params)}
          rules={m ? m.rules : list<ConstraintRule>(raw.rules)}
          capabilities={
            m
              ? m.capabilities
              : typeof raw.capabilities === "object" && raw.capabilities !== null
                ? (raw.capabilities as Record<string, unknown>)
                : {}
          }
        />
      </div>
    </main>
  );
}
