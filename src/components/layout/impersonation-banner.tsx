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
  if (!org) {
    // org deleted mid-session (a race — startImpersonation's own existence check can't
    // prevent this) — degrade instead of disappearing, so the operator always has a
    // working Exit button rather than being stuck impersonating with no visible way out.
    return (
      <div className="flex h-9 items-center justify-center gap-3 bg-muted px-4 text-sm text-foreground">
        <span>Viewing as (organization no longer exists)</span>
        <ImpersonationBannerActions orgId={state.targetOrgId} elevated={state.elevated} />
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center justify-center gap-3 bg-muted px-4 text-sm text-foreground">
      <span>
        Viewing as <span className="font-semibold">{org.name}</span>
      </span>
      <ImpersonationBannerActions orgId={org.id} elevated={state.elevated} />
    </div>
  );
}
