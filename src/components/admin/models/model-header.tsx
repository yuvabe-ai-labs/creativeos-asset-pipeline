"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { updateAiModelAction } from "@/lib/actions/ai-models";
import { STATUS_TEXT, statusChange, statusPatch, type PickerModel, type SettingRow } from "@/lib/admin/model-page";
import { ChangePricesButton } from "@/components/admin/models/change-prices-button";
import { ModelName } from "@/components/admin/models/model-name";
import { ModelOrderPopover } from "@/components/admin/models/model-order-popover";
import { ModelSettingsPopover } from "@/components/admin/models/model-settings-popover";
import { ModelStatusMenu } from "@/components/admin/models/model-status-menu";
import { ModelStatusPending, type ReplacementOption } from "@/components/admin/models/model-status-pending";

const SAVE_ERROR = "Could not save. Try again.";

export type HeaderModel = {
  id: string;
  kind: string;
  label: string;
  provider: string;
  status: string;
  replacedBy: string | null;
  /** The saved replacement's name when it is no longer live, so it can still be named. */
  replacedByLabel: string | null;
  /** Fails its check (D547): no price actions; name, status and order still try to save. */
  broken: boolean;
};

function Dot() {
  return <span aria-hidden className="size-[3px] rounded-full bg-border" />;
}

/** The model page's header strip: name, Change prices, status, maker, picker order and settings people pick. */
export function ModelHeader({
  model,
  hasPrices,
  hasLivePrice,
  priceStarts = null,
  canGoLive,
  runsThisMonth,
  otherLive,
  picker,
  replacements,
  settings,
  onChangePrices,
  changingPrices = false,
}: {
  model: HeaderModel;
  /** Any price row, scheduled ones included: "Change prices" rather than "Add prices". */
  hasPrices: boolean;
  /** A price live now (passing its check), so the model can go live. */
  hasLivePrice: boolean;
  /** No live price, but one is scheduled: its start date ("3 Dec 2026"), for the go-live guard. */
  priceStarts?: string | null;
  canGoLive: boolean;
  runsThisMonth: number;
  otherLive: number;
  picker: PickerModel[];
  replacements: ReplacementOption[];
  settings: SettingRow[];
  onChangePrices?: () => void;
  /** While the change-prices flow is open, its edit bar holds the actions, so the button is hidden. */
  changingPrices?: boolean;
}) {
  const [status, setStatus] = useState(model.status);
  const [savedReplacement, setSavedReplacement] = useState(model.replacedBy);
  const [pending, setPending] = useState<{ to: string; replacement: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const statusTrigger = useRef<HTMLButtonElement>(null);
  /** Closes the pending change and puts focus back on the status badge it came from. */
  function closePending() {
    setPending(null);
    statusTrigger.current?.focus();
  }
  const replacementName = (id: string | null) =>
    replacements.find((r) => r.id === id)?.label ?? (id !== null && id === model.replacedBy ? model.replacedByLabel : null);

  const change = pending
    ? statusChange({
        label: model.label,
        kind: model.kind,
        from: status,
        to: pending.to,
        savedReplacement,
        replacement: pending.replacement,
        otherLive,
        hasPrice: hasLivePrice,
        priceStarts,
        canGoLive,
        runsThisMonth,
      })
    : null;

  function pick(to: string) {
    // Picking the status it has closes the box, except Retired, where it changes the replacement.
    if (to === status && to !== "retired") return closePending();
    setPending({ to, replacement: to === "retired" ? savedReplacement : null });
  }

  async function save() {
    if (!pending || !change?.canSave) return;
    setSaving(true);
    let error: string | undefined;
    try {
      error = (await updateAiModelAction(model.id, statusPatch(pending.to, pending.replacement))).error;
    } catch {
      error = SAVE_ERROR;
    }
    setSaving(false);
    if (error) return void toast.error(error);
    const from = status;
    setStatus(pending.to);
    setSavedReplacement(pending.to === "retired" ? pending.replacement : null);
    closePending();
    toast.success(
      from !== pending.to
        ? `${model.label} is now ${(STATUS_TEXT[pending.to] ?? pending.to).toLowerCase()}.`
        : `${model.label} now points to ${replacementName(pending.replacement) ?? "its replacement"}.`,
    );
  }

  const replacedBy = status === "retired" ? replacementName(savedReplacement) : null;

  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <ModelName id={model.id} label={model.label} />
        </div>
        {!model.broken && model.kind !== "scrape" && !changingPrices && <ChangePricesButton hasPrices={hasPrices} onStart={onChangePrices} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[0.8125rem]">
        <ModelStatusMenu status={status} onPick={pick} triggerRef={statusTrigger} />
        <Dot />
        <span className="text-muted-foreground">Made by {model.provider}</span>
        <Dot />
        <ModelOrderPopover id={model.id} models={picker} />
        {settings.length > 0 && (
          <>
            <Dot />
            <ModelSettingsPopover rows={settings} />
          </>
        )}
        {status === "retired" && (
          <>
            <Dot />
            <span className={replacedBy ? "text-muted-foreground" : "text-destructive-text"}>
              {replacedBy
                ? `Replaced by ${replacedBy}${replacements.some((r) => r.id === savedReplacement) ? "" : " (no longer live)"}`
                : "No replacement"}
            </span>
          </>
        )}
      </div>
      {pending && change && (
        <ModelStatusPending
          key={pending.to}
          change={change}
          replacement={pending.replacement}
          replacements={replacements}
          saving={saving}
          onReplacement={(id) => setPending({ ...pending, replacement: id })}
          onSave={() => void save()}
          onCancel={closePending}
        />
      )}
    </header>
  );
}
