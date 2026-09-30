"use client";

import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  engineConfig,
  SEEDANCE_MODELS,
  type BenchSettings,
  type Engine,
} from "@/lib/ugc/constants";

type Props = {
  engine: Engine;
  settings: BenchSettings;
  onChange: (s: BenchSettings) => void;
  pendingCount: number;
  onRunAll: () => void;
};

function Pick<T extends string>(props: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Select value={props.value} onValueChange={(v) => v && props.onChange(v as T)}>
      <SelectTrigger size="sm" className="w-auto">
        <SelectValue>{props.options.find((o) => o.value === props.value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {props.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SettingsBar({ engine, settings, onChange, pendingCount, onRunAll }: Props) {
  const set = (patch: Partial<BenchSettings>) => onChange({ ...settings, ...patch });
  const cfg = engineConfig(engine);
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-background/95 py-3 backdrop-blur">
      <span className="text-eyebrow">Seedream</span>
      <Badge variant="secondary">seedream-5-0 · 2K</Badge>
      <span className="text-eyebrow ml-4">{cfg.label}</span>
      {engine === "seedance" && (
        <Pick
          value={settings.model}
          options={SEEDANCE_MODELS.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(model) => set({ model })}
        />
      )}
      <Pick
        value={settings.resolution}
        options={cfg.resolutions.map((r) => ({ value: r, label: r }))}
        onChange={(resolution) => set({ resolution })}
      />
      <Pick
        value={String(settings.duration)}
        options={cfg.durations.map((d) => ({ value: String(d), label: `${d}s` }))}
        onChange={(d) => set({ duration: Number(d) })}
      />
      <Pick
        value={settings.ratio}
        options={cfg.ratios.map((r) => ({ value: r, label: r }))}
        onChange={(ratio) => set({ ratio })}
      />
      <Button className="ml-auto" onClick={onRunAll} disabled={pendingCount === 0}>
        <Play className="size-4" strokeWidth={1.5} />
        Run all ({pendingCount})
      </Button>
    </div>
  );
}
