"use client";

import { useState } from "react";
import { addAiModelPriceAction } from "@/lib/actions/ai-models";
import { priceConditionProblems } from "@/lib/ai-models/model-edit";
import { useCreditSettings } from "@/hooks/queries/ai-models";
import type { AiModel, AiModelPrice } from "@/lib/ai-models/types";
import { allowanceOptions, allowanceWarning, draftFromCurrent, draftLines, draftToPayload, localDay, minStartDay, previewText, type PriceDraft } from "./price-draft";
import { AddChip } from "./add-chip";
import { PriceLinesEditor } from "./price-lines-editor";
import { PricePairRows } from "./price-pair-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export { previewText } from "./price-draft";

const SAVE_ERROR = "Could not save. Try again.";

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

/** The form body, controlled so it renders on its own (tests) and inside the sheet. */
export function AddPriceForm({
  model,
  current,
  draft,
  onChange,
  minDay,
}: {
  model: AiModel;
  current: AiModelPrice | null;
  draft: PriceDraft;
  onChange: (draft: PriceDraft) => void;
  /** The earliest day the date field allows. */
  minDay: string;
}) {
  const set = (patch: Partial<PriceDraft>) => onChange({ ...draft, ...patch });
  const lines = draftLines(draft);
  const problems = lines ? priceConditionProblems(model, lines) : [];
  const settings = useCreditSettings();
  return (
    <div className="flex flex-col gap-5">
      <Field label="Starts" htmlFor="price-date">
        <Input
          id="price-date"
          type="date"
          min={minDay}
          value={draft.date}
          onChange={(e) => set({ date: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">Today starts now. A later day starts at 00:00 UTC that day.</p>
      </Field>
      <Field label="Lines">
        <PriceLinesEditor lines={draft.lines} onChange={(l) => set({ lines: l })} />
      </Field>
      <Field label="Estimate allowances">
        <PricePairRows
          pairs={draft.estimate}
          onChange={(estimate) => set({ estimate })}
          addLabel="Add allowance"
          keyPlaceholder="Name"
          valuePlaceholder="Amount"
          numeric
          keyOptions={allowanceOptions(model, current)}
          keyWarning={(key) => allowanceWarning(model, key)}
        />
      </Field>
      <Field label="Source" htmlFor="price-source">
        <Input
          id="price-source"
          type="url"
          placeholder="https://"
          value={draft.sourceUrl}
          onChange={(e) => set({ sourceUrl: e.target.value })}
        />
      </Field>
      <Field label="Note" htmlFor="price-note">
        <Textarea id="price-note" value={draft.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
        <p className="text-sm font-medium">{previewText(model, draft, current, settings)}</p>
        {problems.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-warning-text">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AddPriceSheet({ model, current }: { model: AiModel; current: AiModelPrice | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PriceDraft>(() => draftFromCurrent(current, new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeOpen(next: boolean) {
    if (saving) return;
    // Each opening starts again from the price in effect now.
    if (next) {
      setDraft(draftFromCurrent(current, new Date()));
      setError(null);
    }
    setOpen(next);
  }

  const payload = draftToPayload(model.id, draft, new Date(), localDay(new Date()));

  async function save() {
    const now = new Date();
    const checked = draftToPayload(model.id, draft, now, localDay(now));
    if (!checked.ok) return;
    setSaving(true);
    setError(null);
    try {
      const res = await addAiModelPriceAction(checked.input);
      if (res.error) setError(res.error);
      else setOpen(false);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger render={<AddChip label="Add a price" />} />
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-display">Add a price</SheetTitle>
          <SheetDescription>A price is never edited. To change one, add a new price that starts later.</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <AddPriceForm model={model} current={current} draft={draft} onChange={setDraft} minDay={minStartDay(new Date())} />
        </div>
        <SheetFooter>
          {!payload.ok && <p className="text-sm text-muted-foreground">{payload.error}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" disabled={!payload.ok || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save price"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
