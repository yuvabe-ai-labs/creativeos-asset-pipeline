"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBillingSettingsAction } from "@/lib/actions/billing-catalog";
import type { BillingSettings } from "@/lib/billing/catalog";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { BillingChangeDialog } from "@/components/admin/billing/billing-change-dialog";

const FIELDS = [
  { key: "inrPerUsd", label: "Rupees to a dollar", hint: "Used to suggest prices and check margins" },
  { key: "planMarginPct", label: "Plan margin %", hint: "Suggested plan prices" },
  { key: "topupMarginPct", label: "Top-up margin %", hint: "Suggested pack prices" },
  { key: "minMarginPct", label: "Minimum margin %", hint: "A price below it shows a warning" },
] as const;

type Draft = Record<(typeof FIELDS)[number]["key"], string>;

const draftFrom = (s: BillingSettings | null): Draft => ({
  inrPerUsd: String(s?.inrPerUsd ?? ""),
  planMarginPct: String(s?.planMarginPct ?? ""),
  topupMarginPct: String(s?.topupMarginPct ?? ""),
  minMarginPct: String(s?.minMarginPct ?? ""),
});

// The pricing settings in force. Change writes a new row, so the history stays (spec §1).
export function SettingsCard({ settings }: { settings: BillingSettings | null }) {
  const [draft, setDraft] = useState<Draft>(draftFrom(settings));
  return (
    <Card className="flex flex-col gap-4 p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-eyebrow">Pricing settings</h2>
          <span className="text-sm text-muted-foreground">
            1,000 credits are $1 of AI cost. Prices are before 18% GST.
            {settings && <> Changed {formatRelativeTime(settings.effectiveFrom)}.</>}
          </span>
        </div>
        <BillingChangeDialog
          trigger={<Button variant="outline" size="sm">Change</Button>}
          title="Change pricing settings"
          description="Saved as a new version. Prices already set don't change; their margins are checked against the new rate."
          saveLabel="Save settings"
          onOpen={() => setDraft(draftFrom(settings))}
          onSubmit={(note) => saveBillingSettingsAction({ ...draft, note })}
        >
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`settings-${f.key}`}>{f.label}</Label>
                <Input
                  id={`settings-${f.key}`}
                  inputMode="decimal"
                  value={draft[f.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </BillingChangeDialog>
      </div>
      {settings ? (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="font-display text-xl font-semibold tracking-tight">
                {f.key === "inrPerUsd" ? `₹${settings.inrPerUsd}` : `${settings[f.key]}%`}
              </dd>
              <dd className="text-xs text-muted-foreground/80">{f.hint}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No pricing settings yet.</p>
      )}
    </Card>
  );
}
