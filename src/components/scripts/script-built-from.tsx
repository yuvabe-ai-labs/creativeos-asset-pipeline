"use client";

import { toast } from "sonner";
import { useGenerateState, useSetBuiltFrom } from "@/hooks/queries/script-generate";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import { BuiltFromLine } from "./built-from-line";

/** A script's "Built from" line wired to its copilot state (D531): read from the script's own
 *  query, so a pick in the chat shows here at once, and saved on its route. Editable while the
 *  script is written or drawn; read-only from In review. */
export function ScriptBuiltFrom({ clientId, initialState, signals, busy = false }: {
  clientId: string;
  initialState: GenerateState;
  /** The client's signals by name, loaded once by the page (no request per signal). */
  signals: { id: string; name: string }[];
  busy?: boolean;
}) {
  const { data: state } = useGenerateState(clientId, initialState.script.id, initialState);
  const save = useSetBuiltFrom(clientId, initialState.script.id);
  const { stage, brief } = state.script;
  const editable = stage === "generate" || stage === "visualise";
  return (
    <BuiltFromLine
      signals={signals}
      chosen={brief.signalIds}
      editable={editable}
      busy={busy || save.isPending}
      onChange={(ids) => save.mutate(ids, { onError: (e) => toast.error(e.message) })}
    />
  );
}
