"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBillingSettingsAction } from "@/lib/actions/billing-catalog";
import type { BillingSettings } from "@/lib/billing/catalog";
import { BillingChangeDialog } from "@/components/admin/billing/billing-change-dialog";

const FIELDS = [
  { key: "inrPerUsd", label: "Rupees to a dollar" },
  { key: "planMarginPct", label: "Plan margin %" },
  { key: "topupMarginPct", label: "Top-up margin %" },
  { key: "minMarginPct", label: "Warn below margin %" },
] as const;

type Draft = Record<(typeof FIELDS)[number]["key"], string>;

const draftFrom = (s: BillingSettings | null): Draft => ({
  inrPerUsd: String(s?.inrPerUsd ?? ""),
  planMarginPct: String(s?.planMarginPct ?? ""),
  topupMarginPct: String(s?.topupMarginPct ?? ""),
  minMarginPct: String(s?.minMarginPct ?? ""),
});

// The pricing settings as one quiet line above the plans, with Edit (a new version each save).
export function SettingsBar({ settings }: { settings: BillingSettings | null }) {
  const [draft, setDraft] = useState<Draft>(draftFrom(settings));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        {settings ? (
          <>
            <span className="text-foreground">$1 = ₹{settings.inrPerUsd}</span> · plan margin {settings.planMarginPct}% · top-up margin{" "}
            {settings.topupMarginPct}% · warn below {settings.minMarginPct}%
          </>
        ) : (
          "No pricing settings yet."
        )}
      </span>
      <BillingChangeDialog
        trigger={<Button variant="ghost" size="sm">Edit settings</Button>}
        title="Pricing settings"
        description="1,000 credits are $1 of AI cost. The rate and margins suggest prices and check them; prices already set don't change."
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
      </BillingChangeDialog>
    </div>
  );
}
