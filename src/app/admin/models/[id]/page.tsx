import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  displayNames,
  getAdminModel,
  listAdminModels,
  listAdminPrices,
  modelMonthStats,
} from "@/lib/db/ai-models-admin";
import { RUNNABLE_ADAPTER_KEYS } from "@/lib/ai-models/runnable-keys";
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";
import { ModelDetailsForm } from "@/components/admin/models/model-details-form";
import { ModelMonthStats } from "@/components/admin/models/model-month-stats";
import { ModelDefinition } from "@/components/admin/models/model-definition";
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

  const names = await displayNames([
    ...new Set(
      [row.updatedBy, ...prices.map((p) => p.createdBy)].filter((v): v is string => !!v),
    ),
  ]);

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
  const s = stats[0];
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const priceCount = prices.length;

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
            replacedBy: m ? m.replacedBy : str(raw.replaced_by),
            sortOrder: m?.sortOrder ?? (typeof raw.sort_order === "number" ? raw.sort_order : 0),
          }}
          canGoLive={canGoLive}
          replacements={replacements}
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

        {/* Task 6 fills the prices section: `prices` and `names` are loaded for it. */}
        <div id="prices" data-price-count={priceCount} />

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
