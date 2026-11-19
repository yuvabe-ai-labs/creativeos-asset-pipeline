"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CopilotText } from "@/components/copilot/copilot-text";
import { REPLY_CHIP_CLASS } from "@/components/copilot/reply-chip";
import { useCopilotThread, useDecideChange, useRecordCopilotActivity, useRefreshCopilotThread, useSendKbTurn } from "@/hooks/queries/copilot-thread";
import { kbTarget } from "@/lib/journey/kb-copilot/targets";
import { useApproveKb } from "@/hooks/queries/kb";
import { useTurnLines } from "@/hooks/queries/copilot-traces";
import { useCopilotDeveloper } from "@/hooks/use-copilot-developer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APPROVE_KB_ACTION } from "@/lib/journey/kb-copilot/waiting";
import { useThreadAttachments, type PendingAttachment } from "@/hooks/use-thread-attachments";
import { KB_TURN_MAX_CHARS } from "@/lib/journey/kb-copilot/constants";
import type { Attachment } from "@/lib/journey/thread/schema";
import { checkSourceFile, deleteSource, SOURCE_ACCEPT, uploadSourceFile } from "@/lib/kb/upload-source";
import { JourneyPanelShell } from "./journey-panel-shell";
import { ThreadComposer } from "./thread-composer";
import { ThreadMessageItem } from "./thread-message";
import { ThreadStatusLines } from "./thread-status-lines";
import { ThreadWaiting } from "./thread-waiting";
import { DeveloperSwitch } from "./traces/developer-switch";
import { ReplyTrace } from "./traces/reply-trace";
import { TurnList } from "./traces/turn-list";

/** What the line says while the copilot is thinking, before or between the steps it names. */
const WORKING = "Working on it…";

/** The brand KB copilot on the Brand KB page (brand KB spec §2): the client's saved thread, with
 *  the brand KB agent behind it. The only file here that knows about the brand KB: the thread
 *  components below it take what is the stage's own as props. */
export function KbCopilot({ clientId, slug }: { clientId: string; slug: string }) {
  const router = useRouter();
  const thread = useCopilotThread(clientId);
  const refreshThread = useRefreshCopilotThread(clientId);
  const turn = useSendKbTurn(clientId);
  const recordActivity = useRecordCopilotActivity(clientId);
  const [text, setText] = useState("");
  // Approving is the person's own action (spec §6): the gate card's button, never the copilot.
  const approve = useApproveKb(clientId);
  // A change card is settled by a person only (spec §2.4), from its own buttons.
  const decide = useDecideChange(clientId);
  const change = {
    busy: decide.isPending,
    onDecide: (messageId: string, body: Parameters<typeof decide.mutate>[0]["body"]) =>
      decide.mutate({ messageId, body }, { onError: (e) => toast.error(e.message) }),
  };
  const onGate = (action: string) => {
    if (action === APPROVE_KB_ACTION) approve.mutate(undefined, { onError: (e) => toast.error(e.message) });
  };

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
      // The file lands in the form's source list (D508).
      recordActivity({ type: "written", target: kbTarget.source(attachment.id), move: true });
      return attachment;
    }, [clientId, sourcesChanged, recordActivity]),
    discard: useCallback(async (attachment: Attachment) => {
      // Never sent, so never studied: removing it starts no study either.
      await deleteSource(clientId, attachment, { studyLater: true });
      sourcesChanged();
    }, [clientId, sourcesChanged]),
  });

  const state = thread.data;
  const busy = turn.isPending;

  // The developer switch (turn traces, D509). Off, nothing below is read or shown. On, one read of
  // the lines, and each reply finds its own by id in a map built once per list.
  const [developer, setDeveloper] = useCopilotDeveloper();
  const [view, setView] = useState<"chat" | "turns">("chat");
  const turnLines = useTurnLines(clientId, developer);
  const lineByMessage = useMemo(
    () => new Map((turnLines.data ?? []).flatMap((l) => (l.messageId ? [[l.messageId, l] as const] : []))),
    [turnLines.data],
  );
  const traceOf = (messageId: string) => {
    const line = developer ? lineByMessage.get(messageId) : undefined;
    return line ? <ReplyTrace clientId={clientId} line={line} /> : undefined;
  };

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

  // What the turn in flight is doing: the reply so far, or the step it is on.
  const draft = turn.progress.text;
  const step = turn.progress.step;
  const working = useMemo(() => [{ text: step ?? WORKING, state: "running" as const }], [step]);

  const end = useRef<HTMLDivElement>(null);
  const count = state?.messages.length ?? 0;
  const liveCount = state?.live.length ?? 0;
  const waitingKind = state?.waiting?.kind ?? null;
  // The view follows the reply as it grows, as it follows a new message.
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count, liveCount, busy, waitingKind, draft.length, step]);

  // What the person is waited on comes from the server, worked out from the brand KB as stored.
  const waiting = busy ? null : (state?.waiting?.label ?? null);

  return (
    <JourneyPanelShell slug={slug} waiting={waiting} busy={busy} actions={<DeveloperSwitch checked={developer} onChange={setDeveloper} />}>
      {developer && (
        <Tabs value={view} onValueChange={(v) => setView(v as "chat" | "turns")} className="border-b border-border px-4 py-2">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="turns">Turns</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {developer && view === "turns" ? <TurnList clientId={clientId} /> : (
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
              {state.messages.map((m) => <ThreadMessageItem key={m.id} message={m} change={change} footer={traceOf(m.id)} />)}
              {/* While a turn runs (D502): the reply as it is being written, in the place the stored
                  message will take, or else a line naming what the copilot is doing. The words are
                  not read out piece by piece; the stored message is announced once it lands. */}
              {busy && draft && (
                <li className="flex flex-col items-start gap-2" aria-live="off"><CopilotText content={draft} /></li>
              )}
              {busy && !draft && <li><ThreadStatusLines lines={working} live /></li>}
              {!busy && state.live.length > 0 && <li><ThreadStatusLines lines={state.live} live /></li>}
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
            {!busy && <ThreadWaiting waiting={state.waiting} onGate={onGate} gateBusy={approve.isPending} />}
          </>
        )}
        <div ref={end} />
      </ScrollArea>
      )}
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
