"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { REPLY_CHIP_CLASS } from "@/components/copilot/reply-chip";
import { useCopilotThread, useRefreshCopilotThread, useSendKbTurn } from "@/hooks/queries/copilot-thread";
import { useThreadAttachments, type PendingAttachment } from "@/hooks/use-thread-attachments";
import { KB_TURN_MAX_CHARS } from "@/lib/journey/kb-copilot/constants";
import type { Attachment } from "@/lib/journey/thread/schema";
import { checkSourceFile, deleteSource, SOURCE_ACCEPT, uploadSourceFile } from "@/lib/kb/upload-source";
import { JourneyPanelShell } from "./journey-panel-shell";
import { ThreadComposer } from "./thread-composer";
import { ThreadMessageItem } from "./thread-message";
import { ThreadStatusLines } from "./thread-status-lines";

const WORKING = [{ text: "Working on it…", state: "running" as const }];

/** The brand KB copilot on the Brand KB page (brand KB spec §2): the client's saved thread, with
 *  the brand KB agent behind it. The only file here that knows about the brand KB: the thread
 *  components below it take what is the stage's own as props. */
export function KbCopilot({ clientId, slug }: { clientId: string; slug: string }) {
  const router = useRouter();
  const thread = useCopilotThread(clientId);
  const refreshThread = useRefreshCopilotThread(clientId);
  const turn = useSendKbTurn(clientId);
  const [text, setText] = useState("");

  // A file is a source of the brand KB from the moment it is attached, exactly as if uploaded on
  // the form, so the form and the copilot's own view of the sources are both re-read.
  const sourcesChanged = useCallback(() => {
    router.refresh();
    void refreshThread();
  }, [router, refreshThread]);
  const attachments = useThreadAttachments({
    check: checkSourceFile,
    upload: useCallback(async (file: File) => {
      const attachment = await uploadSourceFile(clientId, file);
      sourcesChanged();
      return attachment;
    }, [clientId, sourcesChanged]),
    discard: useCallback(async (attachment: Attachment) => {
      await deleteSource(clientId, attachment);
      sourcesChanged();
    }, [clientId, sourcesChanged]),
  });

  const state = thread.data;
  const busy = turn.isPending;

  /** `draft` is what to put back in the box if the message cannot be sent. */
  const send = (message: string, files: Attachment[], draft?: { text: string; chips: PendingAttachment[] }) => {
    turn.mutate({ text: message, attachments: files }, {
      onError: (e) => {
        toast.error(e.message);
        if (!draft) return;
        // Nothing the person wrote or attached is lost; whatever they typed since stays.
        setText((now) => now || draft.text);
        attachments.restore(draft.chips);
      },
    });
  };
  const sendFromBox = () => {
    const draft = { text, chips: attachments.items };
    setText("");
    attachments.clear();
    send(text.trim(), attachments.ready, draft);
  };

  const end = useRef<HTMLDivElement>(null);
  const count = state?.messages.length ?? 0;
  const liveCount = state?.live.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count, liveCount, busy]);

  const last = state?.messages[state.messages.length - 1];
  const running = state?.live.some((line) => line.state === "running") ?? false;
  const waiting = !busy && !running && last?.role === "assistant" ? "Your reply" : null;

  return (
    <JourneyPanelShell slug={slug} waiting={waiting} busy={busy}>
      <ScrollArea className="min-h-0 flex-1">
        {thread.isPending && (
          <div className="flex flex-col gap-2 p-4" aria-label="Loading the copilot">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {thread.isError && !state && (
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">The copilot could not be loaded.</p>
            <Button variant="outline" size="sm" onClick={() => thread.refetch()}>Try again</Button>
          </div>
        )}
        {state && (
          <>
            <ol className="flex flex-col gap-4 p-4" aria-live="polite">
              {state.messages.map((m) => <ThreadMessageItem key={m.id} message={m} />)}
              {(busy || state.live.length > 0) && (
                <li><ThreadStatusLines lines={busy ? WORKING : state.live} live /></li>
              )}
            </ol>
            {/* Under the newest message, so the choices sit right below the question they answer. */}
            {!busy && state.suggestions.length > 0 && (
              <div aria-label="Suggestions" className="-mt-1 flex flex-wrap gap-1.5 px-4 pb-4">
                {state.suggestions.map((s) => (
                  <Button key={s} variant="outline" size="xs" className={REPLY_CHIP_CLASS} onClick={() => send(s, [])}>
                    {s}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
        <div ref={end} />
      </ScrollArea>
      <ThreadComposer
        busy={busy || !state}
        placeholder="Answer the copilot, or attach brand documents and images…"
        accept={SOURCE_ACCEPT}
        maxChars={KB_TURN_MAX_CHARS}
        text={text}
        onTextChange={setText}
        attachments={attachments}
        onSend={sendFromBox}
      />
    </JourneyPanelShell>
  );
}
