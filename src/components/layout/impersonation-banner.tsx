import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getOrgById } from "@/lib/db/organizations";
import { ImpersonationBannerActions } from "./impersonation-banner-actions";

// Server component: resolves impersonation state + the target org's display name, then
// hands off to the client component for the two interactive buttons. Renders nothing
// when not impersonating — no layout shift, no empty bar.
export async function ImpersonationBanner() {
  const state = await resolveImpersonationState();
  if (!state.isImpersonating) return null;

  const org = await getOrgById(state.targetOrgId);
  if (!org) return null; // org deleted mid-session — fail closed, banner just disappears

  return (
    <div className="flex h-9 items-center justify-center gap-3 bg-muted px-4 text-sm text-foreground">
      <span>
        Viewing as <span className="font-semibold">{org.name}</span>
      </span>
      <ImpersonationBannerActions orgId={org.id} elevated={state.elevated} />
    </div>
  );
}
