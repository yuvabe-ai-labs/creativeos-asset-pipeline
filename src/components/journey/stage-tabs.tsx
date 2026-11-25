"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronRight, CircleDot, Lock } from "lucide-react";
import { frameFor, JOURNEY_TABS, type Frame } from "@/lib/journey/frame";
import type { JourneyState, StageState } from "@/lib/journey/stages";
import { cn } from "@/lib/utils";

const STATE_WORD: Record<StageState, string> = {
  approved: "approved",
  in_progress: "in progress",
  open: "open",
  locked: "locked",
};

/** The width of the page under the bar, so the client's name and tabs start at the same left edge
 *  as the page's own content, wherever that page centres itself. Each matches its page's <main>. */
function pageWidth(frame: Frame): string {
  // Beside the copilot every page starts at the same left edge (client-frame.tsx), and so does this.
  if (frame.panel) return "";
  // With no copilot beside it a page centres itself, and the bar centres at that page's width: the
  // canvases list is the narrower one, a page inside a tab (an avatar's studio) the wider.
  return frame.tab === "canvases" ? "mx-auto max-w-4xl" : "mx-auto max-w-6xl";
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "approved") return <Check className="size-4 text-success-text" strokeWidth={1.5} aria-hidden />;
  if (state === "locked") return <Lock className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />;
  return <CircleDot className="size-4 text-primary" strokeWidth={1.5} aria-hidden />;
}

/** The client bar across the top of every client screen: whose screen this is, then that client's
 *  sections as tabs under the name. It is the one navigation here, so the pages under it draw no
 *  "Clients › client › section" trail of their own. The three stage tabs show where the client is
 *  (approved, in progress, locked); a locked tab still opens, and its page says why.
 *
 *  Two rows of 2.75rem: client-frame.tsx holds that height (h-22) while this streams in. */
export function StageTabs({ slug, name, state }: { slug: string; name: string; state: JourneyState }) {
  const frame = frameFor(usePathname(), slug);
  const active = frame.tab;
  return (
    <nav aria-label="Client sections" className="shrink-0 border-b border-border bg-background">
      <div className={cn("w-full px-6", pageWidth(frame))}>
      {/* The way back to every client, then the client: the name leads, the tabs belong to it. */}
      <div className="flex h-11 items-end gap-1.5 pb-1.5">
        <Link href="/" className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground">
          Clients
        </Link>
        <ChevronRight className="mb-1 size-3.5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <Link href={`/clients/${slug}`} className="font-display text-lg font-medium leading-6 tracking-[-0.01em] transition-colors duration-200 hover:text-primary">
          {name}
        </Link>
      </div>
      {/* A tab is as wide as its label, so the first one, and its underline, start exactly under
          the row above and at the page's own left edge. */}
      <ul className="flex h-11 items-stretch gap-7 overflow-x-auto">
        {JOURNEY_TABS.map((tab) => {
          const stage = tab.stage ? state[tab.id as keyof JourneyState] : null;
          return (
            <li key={tab.id} className="flex">
              <Link
                href={tab.href(slug)}
                aria-current={active === tab.id ? "page" : undefined}
                aria-label={stage ? `${tab.label}, ${STATE_WORD[stage]}` : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 text-sm font-medium transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
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
      </div>
    </nav>
  );
}
