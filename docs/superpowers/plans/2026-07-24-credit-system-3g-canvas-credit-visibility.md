# Credit System 3G — Canvas Credit Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make credits visible where the user is actually working, not just in admin. The
Generate button itself shows its cost (disabled while still computing, for image); the header
shows the org's live "used this month" figure, next to the agency name, updating in real time
as anyone in the org generates; hitting the monthly cap shows a clear, actionable message
instead of a raw error string.

**Architecture:** `/api/me` (already the source of `orgName` via `useIdentity()`'s cached
fetch) gains two more additive sibling fields — `creditsUsed`/`monthlyCreditLimit` — read
from the existing `org_credit_usage` view (3A) and `organizations.monthly_credit_limit`. A
new `HeaderCredits` component hydrates from that same cached fetch, then stays live via a
Supabase Realtime subscription on `credit_transactions` INSERTs (RLS already scopes it to
the caller's own org — no explicit filter needed), incrementing a local running total by each
new row's `amount` rather than refetching. The three focus views' separate "Est. N credits"
text (3E) gets folded directly into each Generate button's own label; image's button is also
disabled while its estimate is still in flight. A shared, actionable message replaces the
raw "Monthly credit limit reached" string wherever a 402 reaches the UI.

**Tech Stack:** React (client components, `useState`/`useEffect`), Supabase Realtime
(`postgres_changes`), Next.js route handlers.

## Global Constraints

- **This is a scoped exception to nothing** — the button and header stay on the existing
  shadcn `Button`/typography system (confirmed explicitly with the user: no new color
  treatment, no gradient). Credits are folded into the *existing* button label text and a
  small muted header string, matching this project's "hierarchy from weight/casing/tracking/
  color, not size" design system rule.
- **The Realtime subscription relies on RLS, not an explicit filter.** `credit_transactions`'
  existing "org isolation" `select` policy (migration `0019`) already scopes what an
  authenticated client can see — a `postgres_changes` subscription using the browser client
  (anon key + session, never service role) only ever receives rows the caller's own org
  produced. This mirrors `use-video-gen-status.ts`'s pattern (a working precedent in this
  codebase), simplified because a `HeaderCredits` mount is a page-level singleton — no
  cross-mount channel ref-counting needed, unlike that hook's node-scoped, potentially
  multi-mounted case.
- **`useIdentity()`'s existing "fetch once, cache at module level" architecture is not
  touched.** `creditsUsed`/`monthlyCreditLimit` are added as two more cached sibling fields,
  exactly like `orgName` before them (§ real precedent, not invented). The *live* part (the
  Realtime increment) lives entirely inside `HeaderCredits`'s own local state — layered on
  top of the hydrated value, not baked into the shared cache.
- **A UTC-month-boundary edge case is accepted, not engineered around:** if a browser tab
  stays open across the UTC month rollover, the locally-incremented total could read stale
  until the next full page load re-hydrates from `/api/me`. Same class of accepted staleness
  as every other "known limitation, self-corrects on next real fetch" call already made in
  this design — not worth a periodic re-hydration timer for a monthly boundary.
- No automated tests (matches this repo's established convention for client components,
  route handlers, and this migration's one-line DDL). Verification is `npm run build` +
  `npx tsc --noEmit` (both required — this project's `npm run build` has repeatedly been
  found to miss type errors a full `tsc --noEmit` catches) + `npm test` regression where a
  task touches a file with existing tests.

---

### Task 1: `/api/me` + `useIdentity()` gain `creditsUsed`/`monthlyCreditLimit`

**Files:**
- Modify: `src/lib/db/organizations.ts`
- Modify: `src/app/api/me/route.ts`
- Modify: `src/hooks/use-identity.ts`

**Interfaces:**
- Produces: `getOrgCreditUsage(orgId: string): Promise<number>` (new DB helper).
  `useIdentity()` gains `creditsUsed: number | null` and `monthlyCreditLimit: number | null`
  in its return type — the exact names Task 3's `HeaderCredits` reads.

No test (DB helper is I/O-bound; route handler; client hook — matches this repo's
convention). Verified by `npm run build` + `npx tsc --noEmit`.

- [ ] **Step 1: Add the DB helper**

In `src/lib/db/organizations.ts`, add after `getOrgById`:

```ts
// "Used this month" for the header's live credits display (and, later, any other
// org-scoped usage UI) — reads the same org_credit_usage view (migration 0019) the admin
// Overview tile will use. 0 (not null) when the org has no transactions yet this month —
// the view simply has no row to return in that case.
export async function getOrgCreditUsage(orgId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("org_credit_usage")
    .select("credits_used")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as { credits_used: number } | null)?.credits_used ?? 0;
}
```

- [ ] **Step 2: Extend `/api/me`**

Replace the full contents of `src/app/api/me/route.ts`:

```ts
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { orgRoleToIdentityRole } from "@/lib/dal-logic";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgById, getOrgCreditUsage } from "@/lib/db/organizations";

// Feeds the future useIdentity() swap (Stage 1C). Returns the display name + the frozen
// Identity.role (owner/senior → "senior" so Approve shows). See dal-logic.
export async function GET() {
  const caller = await resolveCallerContext();
  const db = createServerSupabase();
  const [{ data, error }, org, creditsUsed] = await Promise.all([
    db.from("profiles").select("display_name").eq("user_id", caller.userId).maybeSingle(),
    getOrgById(caller.orgId),
    getOrgCreditUsage(caller.orgId),
  ]);
  if (error) return apiError("Failed to load profile.", 500);

  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
    platformRole: caller.platformRole,
    orgName: org?.name ?? null,
    creditsUsed,
    monthlyCreditLimit: org?.monthly_credit_limit ?? null,
  });
}
```

- [ ] **Step 3: Extend `useIdentity()`**

Replace the full contents of `src/hooks/use-identity.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { Identity } from "@/lib/identity";
import type { PlatformRole } from "@/lib/dal-logic";

// Module-level cache + in-flight dedup: multiple components call this hook (the identity
// chip, admin nav link, header brand, plus prompt/image-gen/video-prompt focus views), and
// any of them can mount/remount independently. Without this, each mount fires its own
// /api/me request — observed firing dozens of times per canvas session. Sign-out does a
// full page navigation (redirect()), which tears down this module's state naturally, so no
// manual invalidation is needed.
type FetchResult = {
  identity: Identity | null;
  platformRole: PlatformRole | null;
  orgName: string | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
};

let cachedIdentity: Identity | null = null;
let cachedPlatformRole: PlatformRole | null = null;
let cachedOrgName: string | null = null;
let cachedCreditsUsed: number | null = null;
let cachedMonthlyCreditLimit: number | null = null;
let cachedHydrated = false;
let inFlightFetch: Promise<FetchResult> | null = null;

function fetchIdentity(): Promise<FetchResult> {
  if (!inFlightFetch) {
    inFlightFetch = fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data): FetchResult =>
        data && typeof data.name === "string"
          ? {
              identity: { name: data.name, role: data.role } as Identity,
              platformRole: (data.platformRole as PlatformRole | undefined) ?? null,
              orgName: (data.orgName as string | undefined) ?? null,
              creditsUsed: (data.creditsUsed as number | undefined) ?? null,
              monthlyCreditLimit: (data.monthlyCreditLimit as number | undefined) ?? null,
            }
          : {
              identity: null,
              platformRole: null,
              orgName: null,
              creditsUsed: null,
              monthlyCreditLimit: null,
            },
      )
      .catch(
        (): FetchResult => ({
          identity: null,
          platformRole: null,
          orgName: null,
          creditsUsed: null,
          monthlyCreditLimit: null,
        }),
      );
  }
  return inFlightFetch;
}

// Reads the logged-in user's identity from the session (via /api/me). `identity`/
// `hydrated` are the frozen public API (D53) — `setIdentity` is gone, login owns identity
// now. `platformRole`/`orgName`/`creditsUsed`/`monthlyCreditLimit` are additive sibling
// fields (gate the admin nav link / show the agency name and monthly usage in the header) —
// Identity itself never changes shape. `hydrated` flips true once the fetch resolves; until
// then identity/platformRole/orgName/creditsUsed/monthlyCreditLimit === null means "not
// checked yet", so consumers must wait for `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
  orgName: string | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
} {
  const [identity, setIdentity] = useState<Identity | null>(cachedIdentity);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(cachedPlatformRole);
  const [orgName, setOrgName] = useState<string | null>(cachedOrgName);
  const [creditsUsed, setCreditsUsed] = useState<number | null>(cachedCreditsUsed);
  const [monthlyCreditLimit, setMonthlyCreditLimit] = useState<number | null>(
    cachedMonthlyCreditLimit,
  );
  const [hydrated, setHydrated] = useState(cachedHydrated);

  useEffect(() => {
    if (cachedHydrated) {
      // Already resolved by an earlier mount — sync immediately, no new fetch.
      setIdentity(cachedIdentity);
      setPlatformRole(cachedPlatformRole);
      setOrgName(cachedOrgName);
      setCreditsUsed(cachedCreditsUsed);
      setMonthlyCreditLimit(cachedMonthlyCreditLimit);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    fetchIdentity().then((result) => {
      cachedIdentity = result.identity;
      cachedPlatformRole = result.platformRole;
      cachedOrgName = result.orgName;
      cachedCreditsUsed = result.creditsUsed;
      cachedMonthlyCreditLimit = result.monthlyCreditLimit;
      cachedHydrated = true;
      if (!cancelled) {
        setIdentity(result.identity);
        setPlatformRole(result.platformRole);
        setOrgName(result.orgName);
        setCreditsUsed(result.creditsUsed);
        setMonthlyCreditLimit(result.monthlyCreditLimit);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { identity, hydrated, platformRole, orgName, creditsUsed, monthlyCreditLimit };
}
```

- [ ] **Step 4: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Regression test**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/organizations.ts src/app/api/me/route.ts src/hooks/use-identity.ts
git commit -m "feat(credits): add creditsUsed/monthlyCreditLimit to /api/me and useIdentity"
```

---

### Task 2: Add `credit_transactions` to the Realtime publication

**Files:**
- Create: `supabase/migrations/0022_credit_transactions_realtime.sql`

**Interfaces:**
- Produces: `credit_transactions` in the `supabase_realtime` publication — required before
  Task 3's `postgres_changes` subscription can receive anything.

- [ ] **Step 1: Write the migration file**

```sql
-- Add credit_transactions to the Realtime publication so the header's live "used this
-- month" display (HeaderCredits, sub-plan 3G) can subscribe to new ledger rows. Same
-- defensive pattern as migration 0014's addition of `generations` — safe to run whether or
-- not the table is already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'credit_transactions'
  ) then
    alter publication supabase_realtime add table credit_transactions;
  end if;
end $$;
```

- [ ] **Step 2: Apply the migration**

Run the full contents of `0022_credit_transactions_realtime.sql` in the Supabase dashboard
SQL editor. Expected: no errors.

- [ ] **Step 3: Verify with a read-only query**

Run: `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'credit_transactions';`
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0022_credit_transactions_realtime.sql
git commit -m "feat(db): add credit_transactions to the Realtime publication"
```

---

### Task 3: `HeaderCredits` — live "used this month" in the header

**Files:**
- Create: `src/components/layout/header-credits.tsx`
- Modify: `src/components/layout/header-brand.tsx`

**Interfaces:**
- Consumes: `useIdentity()`'s `hydrated`/`creditsUsed`/`monthlyCreditLimit` (Task 1),
  `createBrowserSupabase` (`@/lib/supabase/client`, existing).
- Produces: `<HeaderCredits />`, rendered inside `HeaderBrand` right after the agency name
  (per the user's explicit placement choice), so it only ever shows where the org name does.

No test (client components). Verified by `npm run build` + `npx tsc --noEmit`, plus manual
browser verification (listed at the end of this plan).

- [ ] **Step 1: Create `HeaderCredits`**

```tsx
// src/components/layout/header-credits.tsx
"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "@/hooks/use-identity";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type CreditTransactionRow = { amount: number };

/**
 * Live "used this month" figure next to the agency name. Hydrates from useIdentity()'s
 * cached /api/me fetch, then stays current via a Realtime subscription on new
 * credit_transactions rows — RLS (migration 0019's "org isolation" policy) already scopes
 * the subscription to the caller's own org, so no explicit org_id filter is needed here.
 * Incrementing locally by each new row's `amount` avoids a refetch round-trip per event;
 * org_credit_usage is itself defined as a plain sum (design spec §3), so this stays exactly
 * correct within a UTC month. A tab left open across the UTC month rollover can read stale
 * until the next full page load — accepted, not engineered around (see plan's Global
 * Constraints).
 */
export function HeaderCredits() {
  const { hydrated, creditsUsed, monthlyCreditLimit } = useIdentity();
  const [liveDelta, setLiveDelta] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel("header-credits")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "credit_transactions" },
        (payload: RealtimePostgresChangesPayload<CreditTransactionRow>) => {
          const row = payload.new as CreditTransactionRow;
          setLiveDelta((d) => d + row.amount);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hydrated]);

  if (!hydrated || creditsUsed === null) return null;
  const used = creditsUsed + liveDelta;

  return (
    <span className="text-sm text-muted-foreground">
      {monthlyCreditLimit === null
        ? `${used.toLocaleString()} credits used`
        : `${used.toLocaleString()} / ${monthlyCreditLimit.toLocaleString()} credits`}
    </span>
  );
}
```

- [ ] **Step 2: Wire it into `HeaderBrand`**

Replace the full contents of `src/components/layout/header-brand.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/hooks/use-identity";
import { HeaderCredits } from "./header-credits";

// The wordmark always shows. The agency name is appended once identity resolves — never on
// /login (no session to reflect there, same reasoning as HeaderActions), and never before
// hydration (avoids a flash of a previous/wrong agency name on first paint). Credits used
// this month (HeaderCredits) sits right after it, same visibility gate.
export function HeaderBrand() {
  const pathname = usePathname();
  const { hydrated, orgName } = useIdentity();
  const showOrgName = pathname !== "/login" && hydrated && orgName;

  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <span className="font-display text-xl font-semibold tracking-tight">
          Creative<span className="text-primary">OS</span>
        </span>
      </Link>
      <span className="text-eyebrow hidden sm:block">Yuvabe Studios</span>
      {showOrgName && (
        <>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-sm font-medium text-muted-foreground">{orgName}</span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <HeaderCredits />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/header-credits.tsx src/components/layout/header-brand.tsx
git commit -m "feat(credits): show live credits-used-this-month in the header"
```

---

### Task 4: Fold the estimate into the video and prompt Generate button labels

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`
- Modify: `src/components/nodes/prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `estimatedCredits` (already computed in both files by sub-plan 3E — no new
  computation, just moved from a separate `<p>` into each button's own label).

No test (client components). Verified by `npm run build` + `npx tsc --noEmit`.

- [ ] **Step 1: Video — remove the separate estimate paragraph, fold into the button**

Replace:

```tsx
                      <Button
                        size="lg"
                        onClick={handleGenerate}
                        disabled={
                          isGenerating ||
                          constraints.disableGenerate ||
                          !editable ||
                          (currentModel?.provider === "kling" &&
                            !Object.values(effectiveImageRoles).includes("start_frame"))
                        }
                      >
                        <Sparkles className="size-4" strokeWidth={1.5} />
                        {isGenerating
                          ? "Generating…"
                          : videoUrl
                            ? "Re-generate"
                            : "Generate"}
                      </Button>
```

with:

```tsx
                      <Button
                        size="lg"
                        onClick={handleGenerate}
                        disabled={
                          isGenerating ||
                          constraints.disableGenerate ||
                          !editable ||
                          (currentModel?.provider === "kling" &&
                            !Object.values(effectiveImageRoles).includes("start_frame"))
                        }
                      >
                        <Sparkles className="size-4" strokeWidth={1.5} />
                        {isGenerating
                          ? "Generating…"
                          : videoUrl
                            ? "Re-generate"
                            : "Generate"}
                        {!isGenerating && estimatedCredits !== null && ` · ${estimatedCredits}`}
                      </Button>
```

Then remove the now-redundant separate paragraph — replace:

```tsx
                {estimatedCredits !== null && (
                  <p className="text-xs text-muted-foreground">
                    Est. {estimatedCredits} credit{estimatedCredits === 1 ? "" : "s"}
                  </p>
                )}
                {lastError && !isGenerating && (
```

with:

```tsx
                {lastError && !isGenerating && (
```

- [ ] **Step 2: Prompt — remove the separate estimate paragraph, fold into the button**

Replace:

```tsx
                    <ShotControlsRow
                      controls={controls ?? DEFAULT_SHOT_CONTROLS}
                      onChange={(next) => onPatch({ controls: next })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Est. {estimatedCredits} credit{estimatedCredits === 1 ? "" : "s"}
                    </p>
                    <Button
                      className="w-full"
                      size="default"
                      onClick={runGenerate}
                      disabled={generating || !editable}
                    >
                      <Sparkles className="size-4" />
                      {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
                    </Button>
```

with:

```tsx
                    <ShotControlsRow
                      controls={controls ?? DEFAULT_SHOT_CONTROLS}
                      onChange={(next) => onPatch({ controls: next })}
                    />
                    <Button
                      className="w-full"
                      size="default"
                      onClick={runGenerate}
                      disabled={generating || !editable}
                    >
                      <Sparkles className="size-4" />
                      {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
                      {!generating && ` · ${estimatedCredits}`}
                    </Button>
```

- [ ] **Step 3: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/video-gen-focus-view.tsx src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(credits): fold the cost estimate into the video/prompt Generate button labels"
```

---

### Task 5: Fold the estimate into the image Generate button; disable while estimating

**Files:**
- Modify: `src/components/nodes/image-gen-output-settings-body.tsx`

**Interfaces:**
- Consumes: the existing `estimatedCredits`/`estimating` props (3E) — no signature change,
  just how they're rendered.

No test (client component). Verified by `npm run build` + `npx tsc --noEmit`.

- [ ] **Step 1: Fold `estimating` into `generateDisabledReason`, and the estimate into the label**

Replace:

```tsx
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const refOverLimit = referenceCount > model.maxReferenceImages;

  // One derived reason drives both the Generate button's disabled state and its
  // tooltip — the button is never disabled without an explanation, and the two
  // can't drift apart.
  const generateDisabledReason: string | null = generating
    ? "A generation is already running."
    : editing
      ? "An edit is already running."
      : !editable
        ? "Another session is editing — this canvas is read-only."
        : !hasPrompt
          ? "Connect a Prompt node to generate."
          : !refValidation.ok
            ? refValidation.violations.length === 1
              ? "A reference image doesn't meet this model's requirements. Try resizing it or switching to a different model."
              : `${refValidation.violations.length} reference images don't meet this model's requirements. Try resizing them or switching to a different model.`
            : null;
```

with:

```tsx
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const refOverLimit = referenceCount > model.maxReferenceImages;

  // One derived reason drives both the Generate button's disabled state and its
  // tooltip — the button is never disabled without an explanation, and the two
  // can't drift apart.
  const generateDisabledReason: string | null = generating
    ? "A generation is already running."
    : editing
      ? "An edit is already running."
      : !editable
        ? "Another session is editing — this canvas is read-only."
        : !hasPrompt
          ? "Connect a Prompt node to generate."
          : !refValidation.ok
            ? refValidation.violations.length === 1
              ? "A reference image doesn't meet this model's requirements. Try resizing it or switching to a different model."
              : `${refValidation.violations.length} reference images don't meet this model's requirements. Try resizing them or switching to a different model.`
            : estimating
              ? "Calculating cost…"
              : null;
```

Then replace:

```tsx
      {showGenerate && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className="mt-5 flex w-full justify-start" />}
            >
              <Button
                className="px-14 py-4 text-sm"
                size="default"
                onClick={onGenerate}
                disabled={Boolean(generateDisabledReason)}
              >
                <Sparkles className="size-4" strokeWidth={1.5} />
                {generating
                  ? "Generating…"
                  : editing
                  ? "Editing…"
                  : hasImage
                  ? "Re-generate"
                  : "Generate"}
              </Button>
            </TooltipTrigger>
            {generateDisabledReason && (
              <TooltipContent side="top" className="max-w-56 text-center">
                {generateDisabledReason}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
      {showGenerate && (estimating || estimatedCredits !== null) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {estimating
            ? "Estimating cost…"
            : `Est. ${estimatedCredits} credit${estimatedCredits === 1 ? "" : "s"}`}
        </p>
      )}
```

with:

```tsx
      {showGenerate && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className="mt-5 flex w-full justify-start" />}
            >
              <Button
                className="px-14 py-4 text-sm"
                size="default"
                onClick={onGenerate}
                disabled={Boolean(generateDisabledReason)}
              >
                <Sparkles className="size-4" strokeWidth={1.5} />
                {generating
                  ? "Generating…"
                  : editing
                  ? "Editing…"
                  : hasImage
                  ? "Re-generate"
                  : "Generate"}
                {!generateDisabledReason && estimatedCredits !== null && ` · ${estimatedCredits}`}
              </Button>
            </TooltipTrigger>
            {generateDisabledReason && (
              <TooltipContent side="top" className="max-w-56 text-center">
                {generateDisabledReason}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
```

- [ ] **Step 2: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/image-gen-output-settings-body.tsx
git commit -m "feat(credits): fold the cost estimate into the image Generate button; disable while estimating"
```

---

### Task 6: Graceful, actionable message when the monthly credit limit is hit

**Files:**
- Modify: `src/lib/credits/units.ts`
- Modify: `src/lib/video-gen/api.ts`
- Modify: `src/components/nodes/video-gen-focus-view.tsx`
- Modify: `src/components/nodes/prompt-focus-view.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

**Interfaces:**
- Produces: `CREDIT_LIMIT_TOAST_MESSAGE: string` (`@/lib/credits/units.ts`) and
  `VideoGenApiError` (`@/lib/video-gen/api.ts`, `extends Error`, carries `status: number`) —
  the exact names all 4 call sites below import.

No test (client-side error-message wiring; `VideoGenApiError` is a plain error class with no
independent logic to unit-test). Verified by `npm run build` + `npx tsc --noEmit` +
`npm test` regression.

- [ ] **Step 1: Add the shared message constant**

In `src/lib/credits/units.ts`, add at the end of the file:

```ts
// Shown wherever a 402 (CreditLimitError, src/lib/db/credit-transactions.ts) reaches the
// UI — every creation route's catch handler swaps in this message instead of the raw
// "Monthly credit limit reached" server string, so the user gets something actionable.
export const CREDIT_LIMIT_TOAST_MESSAGE =
  "Monthly credit limit reached. Contact your admin to increase it, or wait until next month.";
```

- [ ] **Step 2: Preserve the HTTP status in `videoGenApi`'s thrown errors**

Replace:

```ts
async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null);
  throw new Error((body as { error?: string } | null)?.error ?? fallback);
}
```

with:

```ts
// Carries the response status alongside the message so callers can special-case a 402
// (monthly credit limit reached) with a clearer message than the raw server string.
export class VideoGenApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null);
  throw new VideoGenApiError((body as { error?: string } | null)?.error ?? fallback, res.status);
}
```

- [ ] **Step 3: Video — use the graceful message on a 402**

In `src/components/nodes/video-gen-focus-view.tsx`, add to the imports (after the existing
`import { videoGenApi } from "@/lib/video-gen/api";` line, which Task 3 of 3E already
extended with `computeVideoCost`/etc. — add these two on their own line):

```ts
import { VideoGenApiError } from "@/lib/video-gen/api";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
```

Replace:

```ts
  async function doGenerate() {
    setGenerating(true);
    setLastError(null);
    try {
      await videoGenApi.startGeneration(nodeId, {
        modelId,
        params,
        imageRoles: effectiveImageRoles,
        mock: useMock,
      });
      // 202 Accepted — hook's Realtime subscription clears isGenerating on completion
    } catch (e) {
      setGenerating(false);
      const msg = e instanceof Error ? e.message : "Generation failed";
      setLastError(msg);
      toast.error(msg);
    }
  }
```

with:

```ts
  async function doGenerate() {
    setGenerating(true);
    setLastError(null);
    try {
      await videoGenApi.startGeneration(nodeId, {
        modelId,
        params,
        imageRoles: effectiveImageRoles,
        mock: useMock,
      });
      // 202 Accepted — hook's Realtime subscription clears isGenerating on completion
    } catch (e) {
      setGenerating(false);
      const msg =
        e instanceof VideoGenApiError && e.status === 402
          ? CREDIT_LIMIT_TOAST_MESSAGE
          : e instanceof Error
            ? e.message
            : "Generation failed";
      setLastError(msg);
      toast.error(msg, { duration: 6000 });
    }
  }
```

- [ ] **Step 4: Prompt — use the graceful message on a 402**

In `src/components/nodes/prompt-focus-view.tsx`, add to the imports (after the existing
`import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";` line from 3E):

```ts
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
```

Replace:

```ts
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instructionDraft, slices, controls: controls ?? DEFAULT_SHOT_CONTROLS }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
```

with:

```ts
      const res = await fetch(`/api/nodes/${nodeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instructionDraft, slices, controls: controls ?? DEFAULT_SHOT_CONTROLS }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
```

And replace:

```ts
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

with:

```ts
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed", { duration: 6000 });
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

(Only the `runGenerate` function's catch block — the one at line ~319, directly below the
`if (!res.ok)` change above. Do not touch the other 3 `toast.error` call sites in this file
(`handleRestoreVersion`, the save/feedback handlers) — they're unrelated to generation.)

- [ ] **Step 5: Image — use the graceful message on a 402 (both `handleGenerate` and `handleEdit`)**

In `src/components/nodes/image-gen-focus-view.tsx`, add to the imports (after the existing
`import { usdToFinalCredits } from "@/lib/credits/units";`-style import Task 5 of 3E did NOT
actually add to this specific file — add this fresh, after the last existing `@/lib/*`
import line, `import { LeftSection } from "./focus-left-section";` → keep that as the last
line, and insert before it):

```ts
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
```

Replace (in `handleGenerate`):

```ts
      if (!res.ok || !json.imageUrl)
        throw new Error(json.error ?? "Generation failed");
```

with:

```ts
      if (!res.ok || !json.imageUrl)
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
```

Replace (in `handleGenerate`'s catch block):

```ts
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

with:

```ts
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed", { duration: 6000 });
      await fetchVersions();
    } finally {
      setGenerating(false);
    }
  }
```

Replace (in `handleEdit`):

```ts
      if (!res.ok || !json.imageUrl)
        throw new Error(json.error ?? "Edit failed");
```

with:

```ts
      if (!res.ok || !json.imageUrl)
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Edit failed");
```

Replace (in `handleEdit`'s catch block):

```ts
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Edit failed");
      await fetchVersions();
    } finally {
      setEditing(false);
    }
  }
```

with:

```ts
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Edit failed", { duration: 6000 });
      await fetchVersions();
    } finally {
      setEditing(false);
    }
  }
```

- [ ] **Step 6: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 7: Regression test**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/credits/units.ts src/lib/video-gen/api.ts \
  src/components/nodes/video-gen-focus-view.tsx \
  src/components/nodes/prompt-focus-view.tsx \
  src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(credits): show a graceful, actionable message when the monthly credit limit is hit"
```

---

## Self-Review

**1. Spec coverage.** All 5 pieces of the user's request: credit count inside the Generate
button, disabled while estimating (image only — video/prompt are synchronous, never "loading")
— Tasks 4/5. Credits remaining visible in the canvas (header, next to agency name, per
explicit placement choice) — Task 3. Graceful message when credits run out — Task 6.
Realtime — Task 2 (publication) + Task 3 (subscription). The double-fetch bug reported in
the same message was fixed separately, immediately, outside this plan (commit `03208b2`,
already merged) — not duplicated here.

**2. Placeholder scan.** No TBD/TODO. Every task shows exact before/after code, including
full-file replacements for the two small files (`use-identity.ts`, `header-brand.tsx`) where
a partial diff would be harder to apply correctly than the whole file.

**3. Type consistency.** `getOrgCreditUsage(orgId): Promise<number>` (Task 1) matches its one
call site in `/api/me`. `useIdentity()`'s new `creditsUsed`/`monthlyCreditLimit` fields (Task
1) are read with identical names in `HeaderCredits` (Task 3). `CREDIT_LIMIT_TOAST_MESSAGE`
and `VideoGenApiError` (Task 6) are each defined once and imported with matching names at
every one of their 4 call sites across 3 files.

No gaps found.

---

## Manual staging verification checklist (no browser access in this environment)

- [ ] Header shows "N / M credits" (or "N credits used" for an uncapped org) next to the
      agency name, on every page except `/login`
- [ ] Generating an image/video/prompt in one browser tab updates the header's figure live in
      a SECOND tab open to the same org, without a page refresh
- [ ] Each Generate button's label shows its credit estimate; the image button visibly
      disables (with an "Calculating cost…" tooltip) while its estimate is still loading
- [ ] Deliberately exceeding an org's monthly limit (e.g. a test org with a very low cap)
      shows the new graceful toast message, not the raw "Monthly credit limit reached" string,
      on all three generation types

---

Plan complete and saved to `docs/superpowers/plans/2026-07-24-credit-system-3g-canvas-credit-visibility.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
