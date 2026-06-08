"use client";

import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { looksLikeReelScript, type ReelScript } from "@/lib/nodes/reel-script";
import { EditableField } from "./editable-field";

type Path = (string | number)[];

type ScriptDocumentProps = {
  script: ReelScript;
  readOnly?: boolean;
  onChange?: (path: Path, value: unknown) => void;
  onAddItem?: (path: Path, item: unknown) => void;
  onRemoveItem?: (path: Path, index: number) => void;
};

// Each section is laid out as an editorial gutter: the label sits in a left
// column (stacking above the content on narrow widths), with a short purple
// kicker rule as a sparing wayfinding accent. Hierarchy comes from this layout,
// not from type size — per the design system.
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5 sm:grid-cols-[160px_1fr] sm:gap-x-10">
      <div className="self-start sm:sticky sm:top-2">
        <div className="mb-2 h-0.5 w-6 rounded-full bg-primary/70" aria-hidden />
        <span className="text-eyebrow">{label}</span>
      </div>
      <div className="leading-relaxed">{children}</div>
    </section>
  );
}

// Renders a parsed reel script as a sequence of editable sections. In readOnly
// mode every field is plain text. If the data doesn't look like a reel script,
// falls back to read-only raw JSON.
export function ScriptDocument({
  script,
  readOnly = false,
  onChange,
  onAddItem,
  onRemoveItem,
}: ScriptDocumentProps) {
  if (!looksLikeReelScript(script as Record<string, unknown>)) {
    return (
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
        {JSON.stringify(script, null, 2)}
      </pre>
    );
  }

  const set = (path: Path) => (v: string) => onChange?.(path, v);
  const shots = script.visual_script?.shots ?? [];
  const body = script.on_screen_text?.body ?? [];
  const qc = script.qc_notes ?? [];
  const links = script.product_links ?? [];

  return (
    <div className="grid gap-12 text-sm">
      <EditableField
        value={script.title ?? ""}
        onCommit={set(["title"])}
        readOnly={readOnly}
        placeholder="Untitled script"
        className="font-display text-2xl font-medium"
      />

      <p className="text-eyebrow">
        {[script.type, script.duration].filter(Boolean).join(" · ") || "—"}
      </p>

      <Section label="Schedule">
        <div className="grid grid-cols-2 gap-2">
          {(["date", "post_time", "category", "theme"] as const).map((k) => (
            <EditableField
              key={k}
              value={script.schedule?.[k] ?? ""}
              onCommit={set(["schedule", k])}
              readOnly={readOnly}
              placeholder={k}
            />
          ))}
        </div>
      </Section>

      <Section label="Objective">
        <EditableField
          value={script.strategic_objective ?? ""}
          onCommit={set(["strategic_objective"])}
          readOnly={readOnly}
          multiline
          placeholder="Add objective…"
        />
      </Section>

      <Section label="Production type">
        <EditableField
          value={script.ai_production_type ?? ""}
          onCommit={set(["ai_production_type"])}
          readOnly={readOnly}
          placeholder="Add production type…"
        />
      </Section>

      <Section label="Visual script">
        <ol className="grid gap-3">
          {shots.map((shot, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="pt-1 text-muted-foreground">{i + 1}.</span>
              <div className="flex-1">
                <EditableField
                  value={shot.description ?? ""}
                  onCommit={set(["visual_script", "shots", i, "description"])}
                  readOnly={readOnly}
                  multiline
                  placeholder="Shot description…"
                />
                <EditableField
                  value={shot.duration ?? ""}
                  onCommit={set(["visual_script", "shots", i, "duration"])}
                  readOnly={readOnly}
                  placeholder="duration"
                  className="text-xs text-muted-foreground"
                />
              </div>
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove shot"
                  onClick={() => onRemoveItem?.(["visual_script", "shots"], i)}
                  className="nodrag rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddItem?.(["visual_script", "shots"], { description: "", duration: "" })}
            className="nodrag mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 hover:border-primary/60"
          >
            <Plus className="size-4" /> Add shot
          </button>
        )}
        <div className="mt-3">
          <span className="text-xs text-muted-foreground">Execution</span>
          <EditableField
            value={script.visual_script?.execution_refinement ?? ""}
            onCommit={set(["visual_script", "execution_refinement"])}
            readOnly={readOnly}
            multiline
            placeholder="Add execution notes…"
          />
        </div>
      </Section>

      <Section label="On-screen text">
        <div className="grid gap-2">
          <EditableField
            value={script.on_screen_text?.intro ?? ""}
            onCommit={set(["on_screen_text", "intro"])}
            readOnly={readOnly}
            placeholder="Intro…"
          />
          {body.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <EditableField
                value={body[i] ?? ""}
                onCommit={set(["on_screen_text", "body", i])}
                readOnly={readOnly}
                placeholder="Line…"
                className="flex-1"
              />
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => onRemoveItem?.(["on_screen_text", "body"], i)}
                  className="nodrag rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onAddItem?.(["on_screen_text", "body"], "")}
              className="nodrag mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 hover:border-primary/60"
            >
              <Plus className="size-4" /> Add line
            </button>
          )}
          <EditableField
            value={script.on_screen_text?.outro ?? ""}
            onCommit={set(["on_screen_text", "outro"])}
            readOnly={readOnly}
            placeholder="Outro…"
          />
        </div>
      </Section>

      <Section label="Voiceover">
        <EditableField
          value={script.voiceover ?? ""}
          onCommit={set(["voiceover"])}
          readOnly={readOnly}
          multiline
          placeholder="Add voiceover…"
        />
      </Section>

      <Section label="Music & sound">
        <EditableField
          value={script.music_sound ?? ""}
          onCommit={set(["music_sound"])}
          readOnly={readOnly}
          multiline
          placeholder="Add music & sound…"
        />
      </Section>

      <Section label="Caption">
        <EditableField
          value={script.caption ?? ""}
          onCommit={set(["caption"])}
          readOnly={readOnly}
          multiline
          placeholder="Add caption…"
        />
      </Section>

      <Section label="CTA">
        <EditableField
          value={script.cta ?? ""}
          onCommit={set(["cta"])}
          readOnly={readOnly}
          placeholder="Add CTA…"
        />
        <EditableField
          value={script.thumbnail_hook ?? ""}
          onCommit={set(["thumbnail_hook"])}
          readOnly={readOnly}
          placeholder="Thumbnail hook…"
          className="text-muted-foreground"
        />
      </Section>

      <Section label="QC notes">
        <ul className="grid gap-2">
          {qc.map((_, i) => (
            <li key={i} className="flex items-center gap-2">
              <EditableField
                value={qc[i] ?? ""}
                onCommit={set(["qc_notes", i])}
                readOnly={readOnly}
                placeholder="Note…"
                className="flex-1"
              />
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove note"
                  onClick={() => onRemoveItem?.(["qc_notes"], i)}
                  className="nodrag rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddItem?.(["qc_notes"], "")}
            className="nodrag mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 hover:border-primary/60"
          >
            <Plus className="size-4" /> Add note
          </button>
        )}
      </Section>

      <Section label="Product links">
        <ul className="grid gap-2">
          {links.map((_, i) => (
            <li key={i} className="flex items-center gap-2">
              <EditableField
                value={links[i] ?? ""}
                onCommit={set(["product_links", i])}
                readOnly={readOnly}
                placeholder="https://…"
                className="flex-1"
              />
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Remove link"
                  onClick={() => onRemoveItem?.(["product_links"], i)}
                  className="nodrag rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddItem?.(["product_links"], "")}
            className="nodrag mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 hover:border-primary/60"
          >
            <Plus className="size-4" /> Add link
          </button>
        )}
      </Section>
    </div>
  );
}
