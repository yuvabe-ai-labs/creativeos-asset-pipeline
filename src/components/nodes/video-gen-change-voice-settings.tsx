"use client";

import { useEffect, useState } from "react";
import { Loader2, Pause, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { VideoGenVoicePickerMeta } from "./video-gen-voice-picker-meta";
import { VOICE_CHANGE_MODELS, type VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

type Props = {
  sources: Array<{ id: string; label: string }>;
  sourceId: string | null;
  onSourceChange: (id: string) => void;
  sourceUrl: string | null;
  voice: PickerVoice | null;
  saving: boolean;
  playing: boolean;
  onTogglePreview: () => void;
  settings: VoiceChangeSettings;
  onSettings: (patch: Partial<VoiceChangeSettings>) => void;
  estimatedCredits: number | null;
  applyBlockedReason: string | null;
  submitting: boolean;
  onApply: () => void;
};

function SliderRow({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
      </div>
      {/* Base UI's single-thumb Slider takes/returns a one-element array, not a bare number
          (src/components/ui/slider.tsx normalises `value`/`defaultValue` the same way). */}
      <Slider id={id} min={0} max={100} step={1} value={[value]} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} className="nodrag" />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// D284 — right half of the workspace: source version, chosen voice, every timing-safe setting, Apply.
export function VideoGenChangeVoiceSettings(p: Props) {
  // Seed keeps typing usable (clearing the field, entering multi-digit numbers) — a value bound
  // straight to `settings.seed ?? ""` would round-trip every keystroke through Number(...) and
  // reject a partially-typed or just-cleared value before onSettings could ever store it.
  const [seedText, setSeedText] = useState(p.settings.seed?.toString() ?? "");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeds the local text from the new source's settings, same idiom as use-market.ts's initial fetch
    setSeedText(p.settings.seed?.toString() ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seed on an external settings change (source switch), not on our own keystrokes
  }, [p.sourceId]);

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Source</span>
        <Select value={p.sourceId ?? undefined} onValueChange={(v) => v && p.onSourceChange(String(v))}>
          <SelectTrigger size="sm" className="nodrag" aria-label="Version to change">
            <SelectValue>{p.sources.find((s) => s.id === p.sourceId)?.label ?? "Pick a version"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {p.sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {p.sourceUrl && (
          <video src={p.sourceUrl} controls className="aspect-[9/16] max-h-40 w-fit rounded-lg border border-border bg-muted/20" />
        )}
        <p className="text-xs text-muted-foreground">Always re-voiced from this take&apos;s original audio.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Voice</span>
        {p.voice ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon-sm" className="nodrag shrink-0" aria-label={`${p.playing ? "Stop" : "Play"} preview of ${p.voice.name}`} disabled={!p.voice.previewUrl} onClick={p.onTogglePreview}>
              {p.playing ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
            </Button>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{p.voice.name}</span>
                {p.voice.priceMultiplier > 1 && <Badge variant="secondary">{p.voice.priceMultiplier}×</Badge>}
              </span>
              {p.saving ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" strokeWidth={1.5} /> Adding to your voices…
                </span>
              ) : (
                <VideoGenVoicePickerMeta labels={p.voice.labels} fields={["gender", "language", "accent"]} />
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pick a voice from the list.</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-eyebrow">Settings</span>
        <SliderRow id="vc-stability" label="Stability" value={p.settings.stability} onChange={(v) => p.onSettings({ stability: v })} hint="Lower is more expressive; higher is steadier." />
        <SliderRow id="vc-similarity" label="Similarity" value={p.settings.similarity} onChange={(v) => p.onSettings({ similarity: v })} hint="How closely to match the chosen voice." />
        <SliderRow id="vc-style" label="Style exaggeration" value={p.settings.style} onChange={(v) => p.onSettings({ style: v })} hint="ElevenLabs recommends 0." />
        <div className="flex items-center justify-between">
          <Label htmlFor="vc-boost" className="text-xs font-medium">Speaker boost</Label>
          <Switch id="vc-boost" checked={p.settings.speakerBoost} onCheckedChange={(v) => p.onSettings({ speakerBoost: v })} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="vc-noise" className="text-xs font-medium">Remove background noise</Label>
            <Switch id="vc-noise" checked={p.settings.removeBackgroundNoise} onCheckedChange={(v) => p.onSettings({ removeBackgroundNoise: v })} />
          </div>
          <p className="text-xs text-muted-foreground">Also removes music and ambience.</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-medium">Model</Label>
          <Select value={p.settings.modelId} onValueChange={(v) => v && p.onSettings({ modelId: v as VoiceChangeSettings["modelId"] })}>
            <SelectTrigger size="sm" className="nodrag w-40" aria-label="Model">
              <SelectValue>{VOICE_CHANGE_MODELS.find((m) => m.value === p.settings.modelId)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VOICE_CHANGE_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="vc-seed" className="text-xs font-medium">Seed</Label>
          <Input
            id="vc-seed"
            inputMode="numeric"
            placeholder="Random"
            className="nodrag h-8 w-40"
            value={seedText}
            onChange={(e) => {
              const raw = e.target.value.trim();
              setSeedText(raw);
              const n = Number(raw);
              p.onSettings({ seed: raw === "" || !Number.isInteger(n) || n < 0 || n > 4294967295 ? undefined : n });
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Timing is kept, so lip sync holds. Speed isn&apos;t offered because it would break sync.</p>
      </div>

      <Tooltip>
        <TooltipTrigger render={<span className="block w-full" />}>
          <Button type="button" size="lg" className="w-full" onClick={p.onApply} disabled={Boolean(p.applyBlockedReason) || p.submitting}>
            {p.submitting ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : <Sparkles className="size-4" strokeWidth={1.5} />}
            Change voice
            {!p.submitting && p.estimatedCredits !== null && <EstimatedCreditsLabel credits={p.estimatedCredits} />}
          </Button>
        </TooltipTrigger>
        {p.applyBlockedReason && <TooltipContent side="top">{p.applyBlockedReason}</TooltipContent>}
      </Tooltip>
    </div>
  );
}
