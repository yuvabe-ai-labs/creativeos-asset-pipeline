"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  startImpersonation,
  enterElevatedMode,
  endImpersonation,
} from "@/lib/auth/impersonation";

// D140: none of these redirect. A server-side redirect() unmounts the calling client
// component before it can render an acknowledgement, which made all three transitions
// structurally incapable of toasting. Each does its work, revalidates the layout so the
// banner re-renders in its new state, and returns — the client navigates and toasts.

export async function enterImpersonationAction(orgId: string): Promise<void> {
  await requireSuperAdmin();
  await startImpersonation(orgId);
  revalidatePath("/", "layout");
}

export async function enterElevatedModeAction(): Promise<void> {
  await requireSuperAdmin();
  await enterElevatedMode();
  revalidatePath("/", "layout");
}

// Takes no orgId: the parameter only ever existed to build the redirect target, and the
// banner already knows which org to send the operator back to.
export async function exitImpersonationAction(): Promise<void> {
  await endImpersonation();
  revalidatePath("/", "layout");
}
