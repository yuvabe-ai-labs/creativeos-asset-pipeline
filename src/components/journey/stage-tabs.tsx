"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, CircleDot, Lock } from "lucide-react";
import { frameFor, JOURNEY_TABS } from "@/lib/journey/frame";
import type { JourneyState, StageState } from "@/lib/journey/stages";
import { cn } from "@/lib/utils";

const STATE_WORD: Record<StageState, string> = {
  approved: "approved",
  in_progress: "in progress",
  open: "open",
  locked: "locked",
};

function StageIcon({ state }: { state: StageState }) {
  if (state === "approved") return <Check className="size-4 text-success-text" strokeWidth={1.5} aria-hidden />;
  if (state === "locked") return <Lock className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />;
  return <CircleDot className="size-4 text-primary" strokeWidth={1.5} aria-hidden />;
}

/** The client's sections across the top of every client screen. The three stage tabs show where
 *  the client is (approved, in progress, locked); a locked tab still opens, and its page says why. */
export function StageTabs({ slug, name, state }: { slug: string; name: string; state: JourneyState }) {
  const active = frameFor(usePathname(), slug).tab;
  return (
    <nav
      aria-label="Client sections"
      className="flex h-12 shrink-0 items-stretch gap-6 overflow-x-auto border-b border-border bg-background px-6"
    >
      <Link href={`/clients/${slug}`} className="flex shrink-0 items-center text-sm font-semibold hover:text-primary">
        {name}
      </Link>
      <ul className="flex items-stretch gap-1">
        {JOURNEY_TABS.map((tab) => {
          const stage = tab.stage ? state[tab.id as keyof JourneyState] : null;
          return (
            <li key={tab.id} className="flex">
              <Link
                href={tab.href(slug)}
                aria-current={active === tab.id ? "page" : undefined}
                aria-label={stage ? `${tab.label}, ${STATE_WORD[stage]}` : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  active === tab.id ? "border-primary" : "border-transparent hover:border-border",
                  stage === "locked" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {stage && <StageIcon state={stage} />}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
