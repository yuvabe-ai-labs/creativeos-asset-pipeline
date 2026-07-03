"use client";

import { useState, type ReactNode } from "react";
import { FileInput, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { ModelRequestRecord } from "@/lib/nodes/model-request";

// Split the compiled user text into its labelled blocks ("Brand context:\n…",
// "Instruction:\n…", …) so the drawer can show real sections instead of one wall
// of text. A block whose first line ends with ":" becomes a titled group.
function splitBlocks(text: string): { label: string | null; body: string }[] {
  return text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const nl = seg.indexOf("\n");
      const firstLine = (nl === -1 ? seg : seg.slice(0, nl)).trimEnd();
      if (firstLine.endsWith(":") && firstLine.length <= 80) {
        return { label: firstLine.slice(0, -1), body: (nl === -1 ? "" : seg.slice(nl + 1)).trim() };
      }
      return { label: null, body: seg };
    });
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-eyebrow mb-2 text-primary">{label}</h3>
      {children}
    </section>
  );
}

// The exact request a version sent to the model. A "Sent to model" trigger opens
// a right-side drawer with sectioned, readable content. Frozen provenance —
// read-only. Safe in read-only sessions (D33).
export function ModelRequestPanel({ request }: { request: ModelRequestRecord }) {
  const [open, setOpen] = useState(false);
  const attachmentCount = request.attachments.length;
  const inputBlocks = splitBlocks(request.compiledUser);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-card transition-colors hover:border-primary/40"
      >
        <span className="flex items-center gap-1.5">
          <FileInput className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Sent to model</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {attachmentCount > 0 && <span>{attachmentCount} image{attachmentCount === 1 ? "" : "s"}</span>}
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" style={{ width: "92vw", maxWidth: "44rem" }}>
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-1.5">
              <FileInput className="size-4 text-primary" strokeWidth={1.5} /> Sent to the model
            </SheetTitle>
            <SheetDescription>The exact request that produced this version — read-only.</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
            <Section label="System prompt">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                  {request.systemPrompt || "—"}
                </p>
              </div>
            </Section>

            <Section label="Compiled input">
              <div className="space-y-2.5">
                {inputBlocks.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                {inputBlocks.map((b, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-card">
                    {b.label && (
                      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        {b.label}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{b.body || "—"}</p>
                  </div>
                ))}
              </div>
            </Section>

            {attachmentCount > 0 && (
              <Section label={`Attachments (${attachmentCount})`}>
                <div className="grid grid-cols-2 gap-2">
                  {request.attachments.map((u) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="" className="w-full rounded-lg border border-border object-cover" />
                  ))}
                </div>
              </Section>
            )}

            {request.effectiveInstruction && (
              <Section label="Effective instruction">
                <p className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs italic leading-relaxed text-foreground">
                  {request.effectiveInstruction}
                </p>
              </Section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
