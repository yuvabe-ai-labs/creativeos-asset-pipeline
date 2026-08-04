"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { startImpersonation, enterElevatedMode, endImpersonation } from "@/lib/auth/impersonation";

export async function enterImpersonationAction(orgId: string): Promise<void> {
  await requireSuperAdmin();
  await startImpersonation(orgId);
  redirect("/");
}

// No redirect — stays on whatever page the operator was viewing (D81's "stays elevated
// for the rest of the session" call means this is a one-time toggle, not a per-page one).
export async function enterElevatedModeAction(): Promise<void> {
  await requireSuperAdmin();
  await enterElevatedMode();
  revalidatePath("/", "layout"); // refresh the banner's "Elevated" badge everywhere
}

export async function exitImpersonationAction(orgId: string): Promise<void> {
  await endImpersonation();
  redirect(`/admin/orgs/${orgId}`);
}
