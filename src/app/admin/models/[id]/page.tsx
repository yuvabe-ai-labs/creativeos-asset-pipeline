import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getAdminModel, listAdminModels, listAdminPrices, modelMonthStats } from "@/lib/db/ai-models-admin";
import { listAdminCreditSettings } from "@/lib/db/credit-settings-admin";
import { RUNNABLE_ADAPTER_KEYS } from "@/lib/ai-models/runnable-keys";
import { currentPrice } from "@/lib/ai-models/pricing";
import { creditSettingsAt } from "@/lib/credits/units";
import { groupOfKind } from "@/lib/admin/models-list";
import { monthSummary, settingsPeoplePick, type PickerModel } from "@/lib/admin/model-page";
import { priceTimeline, scheduledNotice } from "@/lib/admin/price-sheet";
import { ModelHeader } from "@/components/admin/models/model-header";
import { ModelProblems } from "@/components/admin/models/model-problems";
import { MonthSummary } from "@/components/admin/models/month-summary";
import { PriceSheet } from "@/components/admin/models/price-sheet";
import { PriceTimeline } from "@/components/admin/models/price-timeline";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Model — Admin" };

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export default async function AdminModelPage({ params }: { params: Promise<{ id: string }> }) {
  const caller = await requireSuperAdmin();
  const id = decodeURIComponent((await params).id);

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const [row, models, priceRows, stats, creditRows] = await Promise.all([
    getAdminModel(id),
    listAdminModels(),
    listAdminPrices(id),
    modelMonthStats(from, to, id),
    listAdminCreditSettings(),
  ]);
  if (!row) notFound();

  const m = row.model;
  const raw = row.raw;
  const kind = m?.kind ?? str(raw.kind) ?? "other";
  const label = m?.label ?? str(raw.label) ?? id;
  const provider = m?.providerLabel ?? str(raw.provider_label) ?? "";
  const status = m?.status ?? str(raw.status) ?? "draft";
  const replacedBy = m ? m.replacedBy : str(raw.replaced_by);
  const adapterKey = m?.adapterKey ?? str(raw.adapter_key) ?? "";
  const canGoLive = (kind !== "image" && kind !== "video") || RUNNABLE_ADAPTER_KEYS.has(adapterKey);

  // The models of this kind in picker order (listAdminModels sorts by sort_order, then id); a row that
  // fails its check still holds its place, by its raw kind.
  const picker: PickerModel[] = models
    .filter((o) => o.raw.kind === kind)
    .map((o) => ({
      id: String(o.raw.id),
      label: o.model?.label ?? str(o.raw.label) ?? String(o.raw.id),
      kind,
      status: o.model?.status ?? str(o.raw.status) ?? "draft",
      broken: !o.model,
    }));
  const live = models.flatMap((o) => (o.model && o.model.status === "live" && o.model.kind === kind && o.model.id !== id ? [o.model] : []));
  const replacements = live.map((o) => ({ id: o.id, label: o.label, provider: o.providerLabel }));
  const replacedByLabel = replacedBy ? (picker.find((p) => p.id === replacedBy)?.label ?? replacedBy) : null;

  // Rows that fail their check are left out of what runs would use; the history still shows them.
  const prices = priceRows.flatMap((p) => (p.price ? [p.price] : []));
  const current = currentPrice({ prices }, id, now);
  const next = prices.filter((p) => new Date(p.effectiveFrom) > now).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] ?? null;
  const liveSettings = creditSettingsAt({ creditSettings: creditRows.flatMap((r) => (r.settings ? [r.settings] : [])) }, now);
  const settings = { marginPercent: liveSettings.marginPercent, roundStep: liveSettings.roundStep };

  const timeline = priceTimeline(
    priceRows.map((p) => ({
      id: p.id,
      effectiveFrom: p.effectiveFrom,
      createdAt: p.createdAt,
      createdBy: p.createdBy,
      createdByName: p.createdByName,
      price: p.price,
      problems: p.problems,
    })),
    { now, provider, callerId: caller.userId },
  );
  const notice = m && next ? scheduledNotice(current, next, now) : null;
  const s = stats[0];
  const month = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 md:px-6 md:py-14">
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/models">Models</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{groupOfKind(kind)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <ModelHeader
        model={{ id, kind, label, provider, status, replacedBy, replacedByLabel, broken: !m }}
        hasPrices={priceRows.length > 0}
        hasLivePrice={current !== null}
        canGoLive={canGoLive}
        runsThisMonth={s?.runs ?? 0}
        otherLive={live.length}
        picker={picker}
        replacements={replacements}
        settings={settingsPeoplePick(m?.params ?? [])}
      />

      {notice && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-[0.8125rem]">
          <CalendarDays aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            <span className="font-semibold">{notice.headline}</span> {notice.when}{" "}
            <span className="text-muted-foreground">({notice.utc})</span>
            {notice.note && <span className="text-muted-foreground"> {notice.note.replace(/\.?$/, ".")}</span>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {m ? <PriceSheet model={{ id, kind: m.kind, label: m.label, params: m.params, providerLabel: m.providerLabel }} current={current} next={next} settings={settings} /> : <ModelProblems problems={row.problems} />}
        <aside aria-label="History and this month" className="flex flex-col gap-6">
          <section aria-labelledby="history-title">
            <h2 id="history-title" className="mb-3 font-display text-base font-semibold tracking-tight">Price history</h2>
            <PriceTimeline modelId={id} timeline={timeline} />
          </section>
          <div className="border-t pt-6">
            <MonthSummary month={month} summary={monthSummary(s)} />
          </div>
        </aside>
      </div>
    </main>
  );
}
