import { Eye, Unlock } from "lucide-react";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getOrgById } from "@/lib/db/organizations";
import { bannerPresentation } from "@/lib/auth/impersonation-ui";
import { initials } from "@/lib/format/initials";
import { cn } from "@/lib/utils";
import { ImpersonationBannerActions } from "./impersonation-banner-actions";

// Server component: resolves impersonation state + the target org's display name, then
// hands off to the client component for the interactive controls. Renders nothing when
// not impersonating — no layout shift, no empty bar.
//
// Sticky is load-bearing (D139): the header below this is itself sticky, so a
// non-sticky banner scrolled away and left the app looking entirely normal while the
// operator was still writing to a customer's account.
export async function ImpersonationBanner() {
  const state = await resolveImpersonationState();
  if (!state.isImpersonating) return null;

  // An org deleted mid-session is a race startImpersonation's own existence check
  // cannot prevent. Degrade to a placeholder name rather than disappearing, so the
  // operator always keeps a working Exit button instead of being stranded.
  const org = await getOrgById(state.targetOrgId);
  const orgName = org?.name ?? "Organization no longer exists";

  const presentation = bannerPresentation(state.elevated);
  const StateIcon = state.elevated ? Unlock : Eye;

  return (
    <div
      className={cn(
        "sticky top-0 z-50 flex h-11 shrink-0 items-center gap-3 border-b px-6",
        presentation.barClass,
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px]", presentation.ruleClass)}
      />
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-semibold text-white">
        {initials(orgName)}
      </span>
      <span className="text-eyebrow text-neutral-500">{presentation.eyebrow}</span>
      <span className="truncate font-semibold text-neutral-900">{orgName}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-neutral-500">
        <StateIcon className="size-3.5" strokeWidth={1.5} />
        {presentation.stateLabel}
        {state.elevated && (
          <span
            aria-hidden
            className="size-1.5 animate-pulse rounded-full bg-[#ffca2d]"
          />
        )}
      </span>
      <div className="ml-auto shrink-0">
        <ImpersonationBannerActions
          orgId={state.targetOrgId}
          orgName={orgName}
          showEnableEditing={presentation.showEnableEditing}
        />
      </div>
    </div>
  );
}
