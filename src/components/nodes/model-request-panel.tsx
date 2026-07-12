"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ModelRequestRecord } from "@/lib/nodes/model-request";

// Read-only view of the exact request a version sent to the model (system +
// compiled user text + image attachments), split across tabs. Frozen
// provenance — never editable. Safe in read-only sessions (D33). Rendered inside
// the "Sent to model" rail pane, which supplies the heading, so none here.
export function ModelRequestPanel({ request }: { request: ModelRequestRecord }) {
  const attachmentCount = request.attachments.length;

  return (
    <Tabs defaultValue="system" className="gap-4">
      <TabsList variant="line" className="gap-4">
        <TabsTrigger value="system">System prompt</TabsTrigger>
        <TabsTrigger value="input">Compiled input</TabsTrigger>
        {attachmentCount > 0 && (
          <TabsTrigger value="attachments">Attachments · {attachmentCount}</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="system">
        <RequestText text={request.systemPrompt} />
      </TabsContent>

      <TabsContent value="input">
        <RequestText text={request.compiledUser} />
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
