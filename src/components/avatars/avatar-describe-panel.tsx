"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AVATAR_ATTRIBUTES, AVATAR_BATCH_DEFAULT, AVATAR_BATCH_MAX, AVATAR_DEFAULT_FRONT_MODEL_ID,
  AVATAR_DESCRIPTION_MAX, AVATAR_FRONT_ASPECT, AVATAR_STYLES,
  type AvatarAttributes, type AvatarStyleId,
} from "@/lib/avatars/constants";
import { estimateAvatarImageCredits, isSeedanceFaceModel } from "@/lib/avatars/generation";
import type { GenerateFrontInput } from "@/hooks/use-avatar-generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarModelSelect } from "./avatar-model-select";

const ATTRIBUTE_LABELS: Record<keyof typeof AVATAR_ATTRIBUTES, string> = {
  gender: "Gender", age: "Age", ethnicity: "Ethnicity",
};
const ANY = "any";

// The composer of the Look step: what the character is, the settings, and Generate with its
// credit cost. Framing is fixed (facing camera, waist-up, plain background) and is not a field.
export function AvatarDescribePanel({
  busy, onGenerate,
}: { busy: boolean; onGenerate: (input: GenerateFrontInput) => void }) {
  const [description, setDescription] = useState("");
  const [attributes, setAttributes] = useState<AvatarAttributes>({});
  const [styleId, setStyleId] = useState<AvatarStyleId>(AVATAR_STYLES[0].id);
  const [modelId, setModelId] = useState(AVATAR_DEFAULT_FRONT_MODEL_ID);
  const [count, setCount] = useState(AVATAR_BATCH_DEFAULT);

  const perImage = estimateAvatarImageCredits({ modelId, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0 });
  const canGenerate = description.trim().length > 0 && perImage !== null && !busy;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-description">Describe the character</Label>
        <Textarea
          id="avatar-description"
          value={description}
          maxLength={AVATAR_DESCRIPTION_MAX}
          rows={3}
          placeholder="Appearance, clothing, hair, and anything that makes them recognisable"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(AVATAR_ATTRIBUTES) as (keyof typeof AVATAR_ATTRIBUTES)[]).map((key) => (
          <Select
            key={key}
            value={attributes[key] ?? ANY}
            onValueChange={(v) => {
              if (typeof v !== "string") return;
              setAttributes((prev) => ({ ...prev, [key]: v === ANY ? undefined : v }));
            }}
          >
            <SelectTrigger size="sm" aria-label={ATTRIBUTE_LABELS[key]}>
              <SelectValue>
                <span className="text-muted-foreground">{ATTRIBUTE_LABELS[key]}</span>{" "}
                {attributes[key] ?? "Any"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any</SelectItem>
              {AVATAR_ATTRIBUTES[key].map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <AvatarModelSelect id="avatar-front-model" value={modelId} onChange={setModelId} />
        <Select value={styleId} onValueChange={(v) => { if (typeof v === "string") setStyleId(v as AvatarStyleId); }}>
          <SelectTrigger size="sm" aria-label="Style">
            <SelectValue>{AVATAR_STYLES.find((s) => s.id === styleId)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {AVATAR_STYLES.map((style) => (
              <SelectItem key={style.id} value={style.id}>{style.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-lg border">
          <Button
            variant="ghost" size="icon-sm" aria-label="Fewer images"
            disabled={count <= 1} onClick={() => setCount((c) => Math.max(1, c - 1))}
          >
            <Minus className="size-3.5" strokeWidth={1.5} />
          </Button>
          <span className="w-10 text-center text-sm tabular-nums" aria-live="polite">
            {count}<span className="text-muted-foreground">/{AVATAR_BATCH_MAX}</span>
          </span>
          <Button
            variant="ghost" size="icon-sm" aria-label="More images"
            disabled={count >= AVATAR_BATCH_MAX} onClick={() => setCount((c) => Math.min(AVATAR_BATCH_MAX, c + 1))}
          >
            <Plus className="size-3.5" strokeWidth={1.5} />
          </Button>
        </div>

        <Button
          className="ml-auto"
          disabled={!canGenerate}
          onClick={() => onGenerate({ description, attributes, styleId, modelId, count })}
        >
          {busy ? "Generating…" : "Generate"}
          <AvatarCreditCost credits={perImage === null ? null : perImage * count} />
        </Button>
      </div>

      {!isSeedanceFaceModel(modelId) && (
        <p className="text-xs text-muted-foreground">
          Seedance only accepts faces made with Seedream 5.0 Lite. An avatar generated on this
          model will not run on Seedance.
        </p>
      )}
    </div>
  );
}
