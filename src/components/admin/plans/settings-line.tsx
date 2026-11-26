"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBillingSettingsAction } from "@/lib/actions/billing-catalog";
import type { BillingSettings } from "@/lib/billing/catalog";
import type { OfferView } from "@/lib/admin/plans-page";
import { BillingChangeDialog } from "@/components/admin/billing/billing-change-dialog";
import { SettingsMarginPreview } from "./settings-margin-preview";

const FIELDS = [
  { key: "inrPerUsd", label: "Rupees to a dollar" },
  { key: "planMarginPct", label: "Plan margin %" },
  { key: "topupMarginPct", label: "Top-up margin %" },
  { key: "minMarginPct", label: "Warn below margin %" },
] as const;

export type SettingsDraft = Record<(typeof FIELDS)[number]["key"], string>;

const draftFrom = (s: BillingSettings | null): SettingsDraft => ({
  inrPerUsd: String(s?.inrPerUsd ?? ""),
  planMarginPct: String(s?.planMarginPct ?? ""),
  topupMarginPct: String(s?.topupMarginPct ?? ""),
  minMarginPct: String(s?.minMarginPct ?? ""),
});

const plain = (n: number) => n.toLocaleString("en-IN");

// The pricing settings as one sentence under the title, with Change (a new version each save, D592).
// The dialog shows what each shown offer would earn with the typed values; prices never change.
export function SettingsLine({ settings, views }: { settings: BillingSettings | null; views: OfferView[] }) {
  const [draft, setDraft] = useState<SettingsDraft>(draftFrom(settings));
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground">
      <SlidersHorizontal aria-hidden strokeWidth={1.5} className="size-3.5" />
      {settings ? (
        <span>
          Prices are checked at <span className="font-medium text-foreground">₹{plain(settings.inrPerUsd)} to a dollar</span>. Suggested at{" "}
          <span className="font-medium text-foreground">{settings.planMarginPct}%</span> for plans and{" "}
          <span className="font-medium text-foreground">{settings.topupMarginPct}%</span> for top-ups, with a warning below{" "}
          <span className="font-medium text-foreground">{settings.minMarginPct}%</span>.
        </span>
      ) : (
        <span>No pricing settings yet, so margins can&apos;t be checked.</span>
      )}
      <BillingChangeDialog
        trigger={
          <Button variant="link" size="xs" className="h-auto px-0">
            {settings ? "Change" : "Add settings"}
          </Button>
        }
        title="Pricing settings"
        description="1,000 credits are $1 of what we pay. The rate and margins suggest prices and check them. Prices already set don't change."
        saveLabel="Save settings"
        onOpen={() => setDraft(draftFrom(settings))}
        onSubmit={(note) => saveBillingSettingsAction({ ...draft, note })}
      >
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`settings-${f.key}`}>{f.label}</Label>
              <Input id={`settings-${f.key}`} inputMode="decimal" value={draft[f.key]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <SettingsMarginPreview draft={draft} views={views} settings={settings} />
      </BillingChangeDialog>
    </div>
  );
}
