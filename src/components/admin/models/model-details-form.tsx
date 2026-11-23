"use client";

import { useEffect, useState } from "react";
import { updateAiModelAction } from "@/lib/actions/ai-models";
import { formatRelativeTime } from "@/lib/format/relative-time";
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
      <Label htmlFor={htmlFor} className="text-eyebrow text-[0.7rem] text-muted-foreground/80">
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
  updatedBy,
  updatedAt,
}: {
  model: ModelDetails;
  canGoLive: boolean;
  replacements: Array<{ id: string; label: string }>;
  updatedBy: string | null;
  updatedAt: string;
}) {
  const [saved, setSaved] = useState(model);
  const [label, setLabel] = useState(model.label);
  const [pickerLabel, setPickerLabel] = useState(model.pickerLabel ?? "");
  const [providerLabel, setProviderLabel] = useState(model.providerLabel);
  const [description, setDescription] = useState(model.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(model.sortOrder));
  const [status, setStatus] = useState(model.status);
  const [replacedBy, setReplacedBy] = useState(model.replacedBy ?? NO_REPLACEMENT);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const patch: Record<string, unknown> = {};
  if (label !== saved.label) patch.label = label;
  if (pickerLabel !== (saved.pickerLabel ?? "")) patch.picker_label = pickerLabel.trim() === "" ? null : pickerLabel;
  if (providerLabel !== saved.providerLabel) patch.provider_label = providerLabel;
  if (description !== (saved.description ?? "")) patch.description = description.trim() === "" ? null : description;
  if (sortOrder !== String(saved.sortOrder)) patch.sort_order = Number(sortOrder);
  if (status !== saved.status) patch.status = status;
  if (status === "retired" && replacedBy !== (saved.replacedBy ?? NO_REPLACEMENT)) {
    patch.replaced_by = replacedBy === NO_REPLACEMENT ? null : replacedBy;
  }
  const changed = Object.keys(patch).length > 0;

  async function save() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    const res = await updateAiModelAction(model.id, patch);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSaved({
      ...saved,
      label,
      pickerLabel: pickerLabel.trim() === "" ? null : pickerLabel,
      providerLabel,
      description: description.trim() === "" ? null : description,
      sortOrder: Number(sortOrder),
      status,
      replacedBy: status === "retired" && replacedBy !== NO_REPLACEMENT ? replacedBy : null,
    });
    setJustSaved(true);
  }

  const replacementLabel =
    replacedBy === NO_REPLACEMENT
      ? "No replacement"
      : (replacements.find((r) => r.id === replacedBy)?.label ?? replacedBy);

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
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="model-description">
            <Textarea id="model-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Field label="Status">
          <Select value={status} onValueChange={(v) => v && setStatus(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>{STATUSES.find((s) => s.value === status)?.label ?? status}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} disabled={s.value === "live" && !canGoLive}>
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
            <Select value={replacedBy} onValueChange={(v) => v && setReplacedBy(v)}>
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
        <Button type="button" disabled={!changed || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {justSaved && !saving && <span className="text-xs text-muted-foreground">Saved</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          {updatedBy ? `Last changed by ${updatedBy}` : "Last changed"} {formatRelativeTime(updatedAt)}
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
