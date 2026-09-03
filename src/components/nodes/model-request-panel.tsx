"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ModelRequestRecord } from "@/lib/nodes/model-request";

// Split the compiled user text into its labelled blocks ("Brand context:\n…",
// "Instruction:\n…", …) so the Compiled input tab shows real sections instead of
// one wall of text. A block whose first line ends with ":" becomes a titled group.
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

// Read-only view of the exact request a version sent to the model (system +
// compiled user text + image attachments), split across tabs. Frozen
// provenance — never editable. Safe in read-only sessions (D33). Rendered inside
// the "Sent to model" rail pane, which supplies the heading, so none here.
export function ModelRequestPanel({ request }: { request: ModelRequestRecord }) {
  const attachmentCount = request.attachments.length;
  const inputBlocks = splitBlocks(request.compiledUser);

  return (
    <Tabs defaultValue="system" className="gap-4">
      <TabsList variant="line" className="gap-4">
        <TabsTrigger value="system">System prompt</TabsTrigger>
        <TabsTrigger value="input">Compiled input</TabsTrigger>
        {attachmentCount > 0 && (
          <TabsTrigger value="attachments">Attachments · {attachmentCount}</TabsTrigger>
        )}
        {request.effectiveInstruction && (
          <TabsTrigger value="instruction">Effective instruction</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="system">
        <RequestText text={request.systemPrompt} />
      </TabsContent>

      {/* Sectioned rather than one blob — the compiled text arrives as labelled
          blocks, so keep them visually separate. */}
      <TabsContent value="input">
        {inputBlocks.length === 0 ? (
          <RequestText text="" />
        ) : (
          <div className="max-h-[60vh] space-y-2.5 overflow-y-auto">
            {inputBlocks.map((b, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-card"
              >
                {b.label && <p className="text-eyebrow mb-1 text-muted-foreground">{b.label}</p>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {b.body || "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* The pictures, not their URLs. A storage URL is 200 characters of bucket path and says
          nothing about which reference it is — and identifying the attachments is the entire
          reason to open this tab. Each thumbnail still opens the original in a new tab, so the
          URL remains one click away for anyone who needs it. */}
      {attachmentCount > 0 && (
        <TabsContent value="attachments">
          <ul className="flex flex-wrap gap-3">
            {request.attachments.map((url, i) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={url}
                  className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-1.5 shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Attachment ${i + 1}`}
                    className="size-32 rounded-lg object-cover"
                  />
                  <span className="text-eyebrow px-0.5 text-muted-foreground transition-colors group-hover:text-primary">
                    Attachment {i + 1}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </TabsContent>
      )}

      {request.effectiveInstruction && (
        <TabsContent value="instruction">
          <p className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm italic leading-relaxed text-foreground">
            {request.effectiveInstruction}
          </p>
        </TabsContent>
      )}
    </Tabs>
  );
}

function RequestText({ text }: { text: string }) {
  return (
    <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground">
      {text || "—"}
    </p>
  );
}
