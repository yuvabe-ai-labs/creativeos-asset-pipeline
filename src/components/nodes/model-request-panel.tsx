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

      {attachmentCount > 0 && (
        <TabsContent value="attachments">
          <ul className="space-y-1">
            {request.attachments.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline decoration-dotted underline-offset-2 break-all"
                >
                  {url}
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
