"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { withAction } from "@/lib/actions/with-action";

// Open-coding label write: set the active version's decision (pass/fail) + note in place.
// A label annotates an attempt — it is NOT a new attempt, so no new version (mirrors D18
// folding edits into the active version). First writer of node_versions.decision/note.
export async function setVersionLabelAction(
  versionId: string,
  label: { decision: "pass" | "fail" | null; note: string | null },
) {
  return withAction("setVersionLabelAction", async () => {
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("node_versions")
      .update({ decision: label.decision, note: label.note })
      .eq("id", versionId);
    if (error) throw error;
  });
}
