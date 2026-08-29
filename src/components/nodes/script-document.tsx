"use client";

import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { looksLikeReelScript, type ReelScript } from "@/lib/nodes/reel-script";
import { describeShotGrouping } from "@/lib/nodes/group-shots";
import { Button } from "@/components/ui/button";
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
  // Indexed to match `shots` — entry i describes shot i.
  const grouping = describeShotGrouping(shots);
  const body = script.on_screen_text?.body ?? [];
  const qc = script.qc_notes ?? [];
  const links = script.product_links ?? [];

  return (
    <div className="grid max-w-[78ch] gap-12 text-sm">
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
                <div className="flex flex-wrap items-center gap-x-2">
                  <EditableField
                    value={shot.duration ?? ""}
                    onCommit={set(["visual_script", "shots", i, "duration"])}
                    readOnly={readOnly}
                    placeholder="duration"
                    className="text-xs text-muted-foreground"
                  />
                  {/* D200 — whether fan-out will generate this shot with others or on its own,
                      read from the SAME grouping function fan-out uses so the list cannot promise
                      something else. Plain muted text on the duration's own line: it is a note
                      about the shot, not a control, and a badge here competed with the writing. */}
                  {grouping[i] && (
                    <span
                      title={
                        grouping[i].multishot
                          ? "Generated as one clip with cuts, together with the other shots in its group"
                          : "Generated on its own as a single continuous take"
                      }
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      · {grouping[i].multishot ? "Multishot" : "Single"}
                    </span>
                  )}
                </div>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  aria-label="Remove shot"
                  onClick={() => onRemoveItem?.(["visual_script", "shots"], i)}
                  className="nodrag h-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ol>
        {!readOnly && (
          <Button
            variant="ghost"
            onClick={() => onAddItem?.(["visual_script", "shots"], { description: "", duration: "" })}
            className="nodrag mt-3 h-auto rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
          >
            <Plus className="size-4" /> Add shot
          </Button>
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
                <Button
                  variant="ghost"
                  aria-label="Remove line"
                  onClick={() => onRemoveItem?.(["on_screen_text", "body"], i)}
                  className="nodrag h-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              variant="ghost"
              onClick={() => onAddItem?.(["on_screen_text", "body"], "")}
              className="nodrag mt-3 h-auto rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
            >
              <Plus className="size-4" /> Add line
            </Button>
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
                <Button
                  variant="ghost"
                  aria-label="Remove note"
                  onClick={() => onRemoveItem?.(["qc_notes"], i)}
                  className="nodrag h-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <Button
            variant="ghost"
            onClick={() => onAddItem?.(["qc_notes"], "")}
            className="nodrag mt-3 h-auto rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
          >
            <Plus className="size-4" /> Add note
          </Button>
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
                <Button
                  variant="ghost"
                  aria-label="Remove link"
                  onClick={() => onRemoveItem?.(["product_links"], i)}
                  className="nodrag h-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <Button
            variant="ghost"
            onClick={() => onAddItem?.(["product_links"], "")}
            className="nodrag mt-3 h-auto rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
          >
            <Plus className="size-4" /> Add link
          </Button>
        )}
      </Section>
    </div>
  );
}
