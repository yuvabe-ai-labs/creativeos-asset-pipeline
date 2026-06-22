"use client";

import { Settings2 } from "lucide-react";
import {
  videoGenClientModelMap,
} from "@/lib/video-gen/client-models";

// Used by VideoGenFocusView (wired in Task 6 of the refactor).

type Props = {
  modelId: string;
  params: Record<string, unknown>;
  onModelChange: (modelId: string) => void;
  onParamChange: (name: string, value: unknown) => void;
};

export function VideoGenParamsPanel({ modelId, params, onModelChange, onParamChange }: Props) {
  const model = videoGenClientModelMap[modelId];
  const visibleParams = model?.params.filter((p) => p.visible) ?? [];

  return (
    <>
      {/* Model selector */}
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <Settings2 className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Model</span>
        </div>
        <select
          value={modelId}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {Object.values(videoGenClientModelMap).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.providerLabel})
            </option>
          ))}
        </select>
      </div>

      {/* Parameters */}
      {visibleParams.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Settings2 className="size-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow">Parameters</span>
          </div>
          <div className="space-y-3">
            {visibleParams.map((spec) => {
              const isOn = Boolean(params[spec.name] ?? spec.defaultValue);
              return (
                <div key={spec.name}>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {spec.label}
                  </label>
                  {spec.component === "select" &&
                    spec.constraints.type === "select" && (
                      <select
                        value={String(params[spec.name] ?? spec.defaultValue)}
                        onChange={(e) => onParamChange(spec.name, e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {spec.constraints.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                  {spec.component === "toggle" && (
                    <button
                      type="button"
                      onClick={() =>
                        onParamChange(
                          spec.name,
                          !isOn,
                        )
                      }
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        isOn
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span
                        className={`size-2 rounded-full ${
                          isOn
                            ? "bg-primary"
                            : "bg-muted-foreground/40"
                        }`}
                      />
                      {isOn ? "On" : "Off"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
