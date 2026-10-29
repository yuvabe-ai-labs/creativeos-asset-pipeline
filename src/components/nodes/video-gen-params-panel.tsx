"use client";

import {
  ArrowUpRight,
  Crop,
  Gauge,
  LayoutGrid,
  Link2,
  Settings2,
  Timer,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  videoGenClientModelMap,
  resolveVideoModelId,
} from "@/lib/video-gen/client-models";
import { ParamControl } from "./param-controls";
import { Button } from "@/components/ui/button";
import { ParamChipGroup } from "./param-chip-group";
import { FieldLabel } from "./field-label";
import type { ParamSpec } from "@/lib/image-gen/types";

const PARAM_ICONS: Record<string, LucideIcon> = {
  aspect_ratio:        Crop,
  audio:               Volume2,
  duration:            Timer,
  seconds:             Timer,
  size:                LayoutGrid,
  mode:                Gauge,
  cfg_scale:           Settings2,
  negative_prompt:     Settings2,
};

type ParamGroup = ParamSpec["group"];

/** Whether a model has any visible params in a group — drives showing the Advanced section. */
export function hasParamsInGroup(modelId: string, group: ParamGroup): boolean {
  const model = videoGenClientModelMap[resolveVideoModelId(modelId)];
  return (model?.params ?? []).some((p: ParamSpec) => p.visible && p.group === group);
}

type Props = {
  modelId: string;
  params: Record<string, unknown>;
  onParamChange: (name: string, value: unknown) => void;
  lockedParams?: Record<string, unknown>;
  lockedParamReasons?: Record<string, string>;
  /** Params another node decides (D429): shown as a value in place of the control, with the note
   *  behind the field's (i). With `onOpen`, the value opens the node that decides it (D431).
   *  E.g. duration on the multishot lane, which is the shots' total. */
  fixedParams?: Record<string, { value: string; note: string; onOpen?: () => void }>;
  /** Which param group to render. */
  group?: ParamGroup;
};

/** A value set elsewhere, sized like the chips beside it so the row stays aligned. With `onOpen`
 *  it is a button to the node that sets it; the arrow says it goes somewhere. */
function FixedParamValue({ value, onOpen }: { value: string; onOpen?: () => void }) {
  const content = (
    <>
      <Link2 className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <span className="tabular-nums">{value}</span>
    </>
  );
  if (!onOpen) {
    return (
      <div className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 text-[0.8rem] font-medium text-foreground">
        {content}
      </div>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onOpen}
      className="nodrag group/fixed bg-muted/40 font-medium hover:border-primary/40 hover:bg-primary/5"
    >
      {content}
      <ArrowUpRight
        className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/fixed:text-primary"
        strokeWidth={1.5}
      />
    </Button>
  );
}

export function VideoGenParamsPanel({
  modelId,
  params,
  onParamChange,
  lockedParams = {},
  lockedParamReasons = {},
  fixedParams = {},
  group = "primary",
}: Props) {
  const model = videoGenClientModelMap[resolveVideoModelId(modelId)];
  const visibleParams = (model?.params ?? [])
    .filter((p: ParamSpec) => p.visible && p.group === group)
    .sort((a: ParamSpec, b: ParamSpec) => a.order - b.order);

  function renderParamRow(spec: ParamSpec) {
    const fixed = fixedParams[spec.name];
    if (fixed) {
      return (
        <div key={spec.name} className="space-y-3">
          <FieldLabel icon={PARAM_ICONS[spec.name] ?? Settings2} label={spec.label} info={fixed.note} />
          <FixedParamValue value={fixed.value} onOpen={fixed.onOpen} />
        </div>
      );
    }

    const isLocked = spec.name in lockedParams;
    const reason = lockedParamReasons[spec.name];

    const control =
      spec.constraints.type === "select" ? (
        <ParamChipGroup
          options={spec.constraints.options.map((o) => ({ value: o, label: o }))}
          value={String(
            (isLocked ? lockedParams[spec.name] : params[spec.name]) ?? spec.defaultValue ?? "",
          )}
          onValueChange={(v) => onParamChange(spec.name, v)}
          disabled={isLocked}
        />
      ) : (
        <ParamControl
          spec={spec}
          value={(isLocked ? lockedParams[spec.name] : params[spec.name]) ?? spec.defaultValue}
          onChange={(v) => onParamChange(spec.name, v)}
          disabled={isLocked}
        />
      );

    // Uniform cell: a FieldLabel (icon + name) above the control, so every stacked param row —
    // chip select, slider, or textarea — shares the same label weight and spacing.
    return (
      <div key={spec.name} className="space-y-3">
        {/* The spec's own note (e.g. what Kling's Audio adds to the price, BUG-011) sits behind the
            label's (i): always one hover away, without a paragraph under every control (D431). */}
        <FieldLabel
          icon={PARAM_ICONS[spec.name] ?? Settings2}
          label={spec.label}
          info={spec.description}
        />
        {isLocked && reason ? (
          <Tooltip>
            <TooltipTrigger render={<div className="w-full" />}>{control}</TooltipTrigger>
            <TooltipContent side="top">{reason}</TooltipContent>
          </Tooltip>
        ) : (
          control
        )}
      </div>
    );
  }

  // ── This group's params. The model picker no longer lives here: it governs every control
  // below it, so it sits above the shot spine (see VideoGenModelPicker) rather than reading as
  // one output setting among many. ──
  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Params — the first two compact controls share the top row (Resolution + Duration,
            same placement for both Kling and Veo); any remaining controls stack below, with a
            textarea (Negative Prompt) always spanning full width. */}
        {(() => {
          const pairable = (spec: ParamSpec) => spec.constraints.type !== "textarea";
          const canPair =
            visibleParams.length >= 2 &&
            pairable(visibleParams[0]) &&
            pairable(visibleParams[1]);
          const rowParams = canPair ? visibleParams.slice(0, 2) : [];
          const stackParams = canPair ? visibleParams.slice(2) : visibleParams;
          return (
            <div className="space-y-4 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-4">
              {rowParams.length > 0 && (
                // Compact control (Mode / Aspect Ratio) sizes to its content; the slider
                // beside it (Duration) fills the rest of the row — no dead half-column gap.
                <div className="grid grid-cols-[auto_1fr] items-start gap-x-6 gap-y-4">
                  {rowParams.map(renderParamRow)}
                </div>
              )}
              {stackParams.map(renderParamRow)}
            </div>
          );
        })()}

      </div>
    </TooltipProvider>
  );
}
