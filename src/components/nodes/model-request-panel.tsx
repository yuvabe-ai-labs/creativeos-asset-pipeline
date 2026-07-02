"use client";

import { useState } from "react";
import { FileInput, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelRequestRecord } from "@/lib/nodes/model-request";

// Read-only disclosure of the exact request a version sent to the model
// (system + compiled user text + image attachments). Frozen provenance — never
// editable. Safe in read-only sessions (D33).
export function ModelRequestPanel({ request }: { request: ModelRequestRecord }) {
  const [open, setOpen] = useState(false);
  const attachmentCount = request.attachments.length;

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5">
          <FileInput className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Sent to model</span>
        </span>
        <span className="flex items-center gap-2">
          {attachmentCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {attachmentCount} image{attachmentCount === 1 ? "" : "s"}
            </span>
          )}
          <ChevronRight
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")}
            strokeWidth={1.5}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <Field label="System prompt" text={request.systemPrompt} />
          <Field label="Compiled input" text={request.compiledUser} />
          {attachmentCount > 0 && (
            <div>
              <p className="text-eyebrow mb-1">Attachments</p>
              <ul className="space-y-1">
                {request.attachments.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline decoration-dotted underline-offset-2 break-all"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-eyebrow mb-1">{label}</p>
      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground">
        {text || "—"}
      </p>
    </div>
  );
}
