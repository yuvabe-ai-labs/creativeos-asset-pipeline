"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { ScriptView } from "@/components/scripts/script-view";
import { ScriptEditProvider, type ScriptEdit } from "@/components/scripts/script-edit-context";
import { useScriptSelection } from "@/hooks/use-script-selection";
import { useInlineEdit, useLinkCastAvatar, useMarkFinal, useSetScriptField } from "@/hooks/queries/script-generate";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import { CastAvatarLink } from "./cast-avatar-link";
import { InlineEditPrompt } from "./inline-edit-prompt";
import { MarkFinalBar } from "./mark-final-bar";
import { ScriptNotesPanel } from "./script-notes-panel";

type Undo = { path: string; before: string };

/** The right pane (spec 2 §3): Mark final above, the editable script, the reel's notes beneath. */
export function GenerateScriptPane({ clientId, state, chatBusy }: { clientId: string; state: GenerateState; chatBusy: boolean }) {
  const { script } = state;
  const router = useRouter();
  const setField = useSetScriptField(clientId, script.id);
  const inline = useInlineEdit(clientId, script.id);
  const link = useLinkCastAvatar(clientId, script.id);
  const markFinal = useMarkFinal(clientId, script.id);
  const [undos, setUndos] = useState<Undo[]>([]);
  const pane = useRef<HTMLDivElement>(null);
  const { selection, clear } = useScriptSelection(pane, script.doc !== null);
  const fail = (e: Error) => toast.error(e.message);

  const restore = (u: Undo) =>
    setField.mutate({ path: u.path, value: u.before }, { onSuccess: () => setUndos((s) => s.filter((x) => x !== u)), onError: fail });

  const edit: ScriptEdit = {
    commit: (path, value) => setField.mutate({ path, value }, { onError: fail }),
    busyPath: inline.isPending ? (selection?.path ?? null) : null,
    castControl: (member) => (
      <CastAvatarLink
        member={member}
        avatars={state.avatars}
        pending={link.isPending}
        onChange={(avatarId) => link.mutate({ castId: member.id, avatarId }, { onError: fail })}
      />
    ),
  };

  const runInline = (instruction: string) => {
    if (!selection) return;
    inline.mutate(
      { path: selection.path, selectedText: selection.text, offset: selection.offset, instruction },
      {
        onSuccess: ({ undo }) => {
          setUndos((s) => [...s.slice(-19), undo]);
          clear();
          window.getSelection()?.removeAllRanges();
          // Spec 2 §9: inline edits apply at once, with undo. The copilot's line in the chat says what changed.
          toast("Changed. The copilot says what in the chat.", { action: { label: "Undo", onClick: () => restore(undo) } });
        },
        onError: fail,
      },
    );
  };

  const final = () =>
    markFinal.mutate(undefined, {
      onSuccess: () => { toast.success("Marked final. On to Visualise."); router.refresh(); },
      onError: fail,
    });

  const avatarFaces = Object.fromEntries(state.avatars.map((a) => [a.id, a.front]));

  return (
    <div ref={pane} className="relative flex min-w-0 flex-col gap-6">
      <MarkFinalBar
        openItems={state.openItems}
        canUndo={undos.length > 0}
        onUndo={() => { const last = undos.at(-1); if (last) restore(last); }}
        onMarkFinal={final}
        pending={markFinal.isPending}
        disabled={chatBusy || script.doc === null}
      />
      {script.doc ? (
        <ScriptEditProvider value={edit}>
          <ScriptView
            script={{ id: script.id, clientId: script.clientId, stage: script.stage, doc: script.doc, approvedAt: null, createdAt: script.createdAt, updatedAt: script.updatedAt }}
            avatarFaces={avatarFaces}
          />
          <ScriptNotesPanel notes={script.notes} openItems={state.openItems} />
        </ScriptEditProvider>
      ) : (
        <EmptyState
          title="The draft appears here"
          body="Answer the copilot, or say “take it from here”, then confirm the brief. The script is written here, and you can edit every part of it."
        />
      )}
      {selection && (
        <InlineEditPrompt
          key={`${selection.path}:${selection.offset}:${selection.text}`}
          selection={selection}
          pending={inline.isPending}
          onSubmit={runInline}
          onClose={clear}
        />
      )}
    </div>
  );
}
