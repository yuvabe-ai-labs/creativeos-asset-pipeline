"use client";

import { useEffect, useState } from "react";
import { updateAiModelAction } from "@/lib/actions/ai-models";
import { formatRelativeTime } from "@/lib/format/relative-time";
import {
  buildModelPatch,
  isStatusDisabled,
  parseSortOrder,
  replacementText,
  runSave,
} from "./model-details-patch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ModelDetails = {
  id: string;
  kind: string;
  label: string;
  pickerLabel: string | null;
  providerLabel: string;
  description: string | null;
  status: string;
  replacedBy: string | null;
  sortOrder: number;
};

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "live", label: "Live" },
  { value: "hidden", label: "Hidden" },
  { value: "retired", label: "Retired" },
];
const NO_REPLACEMENT = "none";

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-eyebrow">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function ModelDetailsForm({
  model,
  canGoLive,
  replacements,
  staleReplacement = null,
  updatedBy,
  updatedAt,
}: {
  model: ModelDetails;
  canGoLive: boolean;
  replacements: Array<{ id: string; label: string }>;
  /** The saved replacement when it is no longer live, so it can still be named. */
  staleReplacement?: { id: string; label: string } | null;
  updatedBy: string | null;
  updatedAt: string;
}) {
  const [saved, setSaved] = useState(model);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [label, setLabel] = useState(model.label);
  const [pickerLabel, setPickerLabel] = useState(model.pickerLabel ?? "");
  const [providerLabel, setProviderLabel] = useState(model.providerLabel);
  const [description, setDescription] = useState(model.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(model.sortOrder));
  const [status, setStatus] = useState(model.status);
  const [replacedBy, setReplacedBy] = useState<string | null>(model.replacedBy);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const draft = { label, pickerLabel, providerLabel, description, sortOrder, status, replacedBy };
  const patch = buildModelPatch(saved, draft);
  const orderOk = parseSortOrder(sortOrder) !== null;
  const changed = Object.keys(patch).length > 0;

  function changeStatus(next: string) {
    setStatus(next);
    if (next !== "retired") setReplacedBy(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    let res: { error?: string };
    try {
      res = await runSave(() => updateAiModelAction(model.id, patch));
    } finally {
      setSaving(false);
    }
    if (res.error) {
      setError(res.error);
      return;
    }
    const next = {
      ...saved,
      label: label.trim(),
      pickerLabel: pickerLabel.trim() === "" ? null : pickerLabel.trim(),
      providerLabel: providerLabel.trim(),
      description: description.trim() === "" ? null : description.trim(),
      sortOrder: parseSortOrder(sortOrder) ?? saved.sortOrder,
      status,
      replacedBy: status === "retired" ? replacedBy : null,
    };
    setSaved(next);
    setLabel(next.label);
    setPickerLabel(next.pickerLabel ?? "");
    setProviderLabel(next.providerLabel);
    setDescription(next.description ?? "");
    setReplacedBy(next.replacedBy);
    setSavedAt(new Date().toISOString());
    setJustSaved(true);
  }

  const replacementLabel = replacementText(replacedBy, replacements, staleReplacement);

  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <h2 className="text-eyebrow mb-4 text-[0.7rem] text-muted-foreground/80">Details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="model-label">
          <Input id="model-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Name in the picker" htmlFor="model-picker-label">
          <Input id="model-picker-label" value={pickerLabel} onChange={(e) => setPickerLabel(e.target.value)} />
        </Field>
        <Field label="Provider name" htmlFor="model-provider-label">
          <Input id="model-provider-label" value={providerLabel} onChange={(e) => setProviderLabel(e.target.value)} />
        </Field>
        <Field label="Sort order" htmlFor="model-sort-order">
          <Input
            id="model-sort-order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            aria-invalid={!orderOk}
          />
          {!orderOk && <p className="text-xs text-destructive">Order must be a whole number.</p>}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="model-description">
            <Textarea id="model-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Field label="Status">
          <Select value={status} onValueChange={(v) => v && changeStatus(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>{STATUSES.find((s) => s.value === status)?.label ?? status}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} disabled={isStatusDisabled(s.value, canGoLive)}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!canGoLive && (
            <p className="text-xs text-muted-foreground">
              This build has no code to run this model, so it can&apos;t go live.
            </p>
          )}
        </Field>
        {status === "retired" && (
          <Field label="Replaced by">
            <Select value={replacedBy ?? NO_REPLACEMENT} onValueChange={(v) => v && setReplacedBy(v === NO_REPLACEMENT ? null : v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{replacementLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_REPLACEMENT}>No replacement</SelectItem>
                {replacements.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <Button type="button" disabled={!changed || !orderOk || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {justSaved && !saving && <span className="text-xs text-muted-foreground">Saved</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          {savedAt ? "Last changed" : updatedBy ? `Last changed by ${updatedBy}` : "Last changed"} {savedAt ? "just now" : formatRelativeTime(updatedAt)}
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
