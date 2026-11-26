import { TriangleAlert } from "lucide-react";
import { AgencyTag } from "@/components/admin/agencies/agency-tag";
import type { BillingSettings } from "@/lib/billing/catalog";
import type { OfferView } from "@/lib/admin/plans-page";
import { realMarginPct } from "@/lib/billing/pricing";
import type { SettingsDraft } from "./settings-line";

const num = (s: string) => {
  const t = s.replace(/[,\s₹%]/g, "");
  return t && /^\d+(\.\d+)?$/.test(t) && Number(t) > 0 ? Number(t) : null;
};

/** What every shown offer earns now and would earn at the typed rate, before saving. */
export function SettingsMarginPreview({ draft, views, settings }: { draft: SettingsDraft; views: OfferView[]; settings: BillingSettings | null }) {
  const rate = num(draft.inrPerUsd);
  const min = num(draft.minMarginPct);
  const rows = views.flatMap((v) => (v.product.active && v.price ? [{ v, price: v.price }] : []));
  if (rate === null || min === null) return <p className="text-sm text-muted-foreground">The rate and the warning need a number above 0.</p>;
  if (!rows.length) return null;
  const eff = rows.map(({ v, price }) => ({ v, now: settings ? realMarginPct(price, settings.inrPerUsd) : null, next: realMarginPct(price, rate) }));
  const low = eff.filter((e) => e.next < min);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="mb-1 text-sm font-medium">Margins with these settings</p>
        <ul className="flex flex-col text-sm">
          {eff.map((e) => (
            <li key={e.v.product.id} className="flex justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
              <span>{e.v.product.name}</span>
              <span className="tabular-nums">
                {e.now !== null && <span className="text-muted-foreground">{e.now}% → </span>}
                {e.next < min ? <AgencyTag tone="warn">{e.next}%</AgencyTag> : <span className="font-semibold">{e.next}%</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {low.length > 0 && (
        <p className="flex gap-2 rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-sm text-warning-text">
          <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" />
          {low.map((e) => e.v.product.name).join(", ")} would be below {min}%. Their prices stay as they are until you change them.
        </p>
      )}
    </div>
  );
}
