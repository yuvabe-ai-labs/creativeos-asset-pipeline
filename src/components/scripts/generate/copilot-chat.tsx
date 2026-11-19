"use client";

import { useEffect, useRef, useState } from "react";
import { JourneyPanelShell } from "@/components/journey/journey-panel-shell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCopilotCollapsed } from "@/hooks/use-copilot-collapsed";
import { scriptFoldKey } from "@/lib/journey/frame";
import { SCRIPT_STAGE_LABEL, type ScriptStage } from "@/lib/scripts/constants";
import type { CopilotAvatar, ScriptMessage } from "@/lib/scripts/copilot/schema";
import type { Suggestion } from "@/lib/scripts/copilot/suggestions";
import type { ScriptWaiting } from "@/lib/scripts/copilot/waiting";
import { CopilotChatMessage, type ChatActions } from "./copilot-chat-message";
import { CopilotComposer } from "./copilot-composer";
import { CopilotSuggestions } from "./copilot-suggestions";
import { CopilotThinking } from "./copilot-thinking";

/** The script's copilot panel, kept with the script and shown at every stage (scripting-panel spec
 *  §3.2), in the same shell as the client's panel. At Generate it is the live chat; after it, the
 *  saved thread read-only (`live: null`), folded until opened, with what the script is waiting on. */
export function CopilotChat({ client, scriptId, stage, messages, avatars, waiting, live }: {
  client: { name: string; slug: string };
  scriptId: string;
  stage: ScriptStage;
  messages: ScriptMessage[];
  avatars: CopilotAvatar[];
  waiting: ScriptWaiting | null;
  /** Generate only: the composer, the suggestions and the cards' buttons. null is read-only. */
  live: { actions: ChatActions; suggestions: Suggestion[] } | null;
}) {
  const generate = stage === "generate";
  const foldKey = scriptFoldKey(scriptId, stage);
  const busy = live?.actions.busy ?? false;
  // The shell owns the fold; read here only so the thread scrolls when it unfolds (same store).
  const [collapsed] = useCopilotCollapsed(foldKey, !generate);
  const end = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  // Follow the conversation: scroll to the newest message, or the working line, when either appears,
  // and again when the copilot unfolds (a hidden scroll area does not keep its place).
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, busy, collapsed]);
  // A question or a card already in the thread says what it waits on; the foot says the rest.
  const foot = waiting && (waiting.kind === "task" || waiting.kind === "client") ? waiting : null;

  return (
    <JourneyPanelShell
      foldKey={foldKey}
      foldedByDefault={!generate}
      waitingLine={waiting?.line ?? null}
      busy={busy}
      back={{ label: client.name, href: `/clients/${client.slug}/scripts` }}
      placement="page"
      narrow={generate ? "stacked" : "hidden"}
    >
      <ScrollArea className="min-h-0 flex-1">
        <ol className="flex flex-col gap-4 p-4" aria-live="polite">
          {messages.map((m) => <CopilotChatMessage key={m.id} message={m} actions={live?.actions ?? null} avatars={avatars} />)}
          {busy && (
            <li>
              <CopilotThinking writing={live?.actions.writing} />
            </li>
          )}
        </ol>
        {/* Under the newest message, so the options sit right below the question they answer. Hidden
            while the copilot works: the thinking line stands in their place. */}
        {live && !busy && <CopilotSuggestions suggestions={live.suggestions} onSend={live.actions.send} onFill={setText} onLink={live.actions.link} />}
        <div ref={end} />
      </ScrollArea>
      {foot && (
        <div aria-label="Waiting" className="flex flex-col gap-1 border-t border-border px-4 py-3">
          {!generate && <p className="text-eyebrow text-muted-foreground">{SCRIPT_STAGE_LABEL[stage]}</p>}
          <p className="text-sm">{foot.line}</p>
        </div>
      )}
      {live && <CopilotComposer busy={busy} text={text} onTextChange={setText} onSend={live.actions.send} />}
    </JourneyPanelShell>
  );
}
