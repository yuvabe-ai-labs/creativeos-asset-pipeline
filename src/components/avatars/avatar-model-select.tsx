"use client";

import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useImageModels } from "@/hooks/queries/ai-models";
import { isSeedanceFaceModel } from "@/lib/avatars/generation";

// The image models, grouped by provider as in Image Gen. The one model whose faces Seedance
// accepts carries a tag, so the operator sees the consequence before generating (spec §8).
export function AvatarModelSelect({
  id, value, onChange, modelIds,
}: {
  id: string;
  value: string;
  onChange: (modelId: string) => void;
  /** Only these models (Visualise's panels); every image model when absent. */
  modelIds?: readonly string[];
}) {
  const images = useImageModels();
  // Live models, plus the selected one while it is hidden; a retired model is never offered.
  const groups = images.groups(value)
    .map((g) => ({ ...g, models: modelIds ? g.models.filter((m) => modelIds.includes(m.id)) : g.models }))
    .filter((g) => g.models.length > 0);
  return (
    <Select value={value} onValueChange={(v) => { if (typeof v === "string") onChange(v); }}>
      <SelectTrigger id={id} size="sm" className="min-w-44">
        <SelectValue>{images.get(value)?.label ?? "Choose a model"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.provider}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <span className="flex items-center gap-2">
                  {model.label}
                  {isSeedanceFaceModel(model.id) && <Badge variant="outline">Seedance</Badge>}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
