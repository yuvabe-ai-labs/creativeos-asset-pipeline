import "server-only";
import { revalidatePath } from "next/cache";
import { setKBStatus } from "@/lib/db/clients";
import { insertCopilotMessages } from "@/lib/db/copilot-messages";
import { listUnreviewedFields } from "@/lib/db/kb";
import { resolveDisplayNames } from "@/lib/db/profiles";
import type { ClientRow } from "@/lib/db/types";
import { approvalMessage } from "@/lib/journey/thread/approval";
import { ONBOARDING } from "@/lib/journey/thread/schema";

// Approving a brand KB: the one way it happens, whoever asks (the page header, the copilot's gate
// card). Only ever reached by a person's own action; the copilot has no tool for it (spec §6). The
// caller has already authorised `client` and resolved who is asking.

export const KB_APPROVED_OPENS = "Market research is now open.";
export const KB_NOT_REVIEWED = "All fields must be reviewed before marking KB ready.";
export const KB_REBUILT = "The brand KB was rebuilt. Reload to see the new one.";

export async function approveKB(input: { client: ClientRow; userId: string; versionId?: string }): Promise<{ ok: true } | { error: string }> {
  const { client, userId } = input;
  const active = client.active_kb_version_id;
  if (!active) return { error: "There is no brand KB to approve yet." };
  // The person approves what they were looking at, never a rebuild they have not seen.
  if (input.versionId && input.versionId !== active) return { error: KB_REBUILT };
  // Approved already (a second press, a teammate a moment earlier): nothing more to do or to say.
  if (client.kb_status === "ready") return { ok: true };
  // Paths only: the KB itself is not downloaded to learn that every field is reviewed.
  if ((await listUnreviewedFields(active)).length > 0) return { error: KB_NOT_REVIEWED };

  await setKBStatus(client.id, "ready");
  revalidatePath(`/clients/${client.slug}`);
  revalidatePath(`/clients/${client.slug}/kb`);

  // Who approved (spec §2.3). Best effort: the approval stands even if the thread cannot be written.
  try {
    const by = (await resolveDisplayNames(client.org_id, [userId])).get(userId) ?? "A teammate";
    await insertCopilotMessages(client.id, ONBOARDING, userId, [
      { ...approvalMessage({ what: "the brand KB", by, byId: userId, opens: KB_APPROVED_OPENS }), createdBy: userId },
    ]);
  } catch (e) {
    console.error("[kb/approve] could not record who approved", e);
  }
  return { ok: true };
}
