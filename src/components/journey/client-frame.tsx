"use client";

import type { ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import { useCopilotCollapsed } from "@/hooks/use-copilot-collapsed";
import { frameFor, journeyFoldKey } from "@/lib/journey/frame";
import { cn } from "@/lib/utils";

/** The frame around every client screen (copilot journey spec §4.1): the stage tabs on top and,
 *  on a stage's own page, the copilot's guide on the left. The page itself is untouched.
 *
 *  It knows only the route. `tabs` and `guide` are server-rendered and stream in, so the frame
 *  holds their place (the tab bar's height, the guide's column) and nothing moves when they land. */
export function ClientFrame({ tabs, guide, children }: {
  tabs: ReactNode;
  guide: ReactNode;
  children: ReactNode;
}) {
  const { id: slug } = useParams<{ id: string }>();
  const frame = frameFor(usePathname(), slug);
  const [collapsed] = useCopilotCollapsed(journeyFoldKey(slug));
  if (!frame.tabs) return <>{children}</>;

  // The client bar sits over the page it belongs to. On a stage's page that is the right-hand
  // column: the copilot has the left column to itself, from the top.
  return (
    <>
      {/* data-client-frame: globals.css keeps the scrollbar's space reserved on these screens, so a
          short page and a long one are the same width and nothing shifts sideways between tabs. */}
      <div data-client-frame className={cn("flex flex-1", frame.panel && "mx-auto w-full max-w-[96rem]")}>
        {frame.panel && (
          // Stretched to the page's height, so the guide inside can stick. box-content: the
          // width is the guide's own, with the gutter added around it. Width and left edge match the
          // script copilot (copilot-chat.tsx inside a max-w-[96rem] px-6 page). It starts 1rem
          // under the app header, which is also where it sticks (journey-panel-shell: top-20).
          <div
            className={cn(
              "box-content hidden shrink-0 pb-6 pl-6 pt-4 lg:block",
              "transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              collapsed ? "lg:w-12" : "lg:w-[29rem]",
            )}
          >
            {guide}
          </div>
        )}
        {/* Beside the copilot a page is not centred: every tab's page starts at the same left edge,
            so the copilot and that edge stay put and only what is on the page changes. */}
        <div className={cn("flex min-w-0 flex-1 flex-col", frame.panel && "[&_main]:mx-0")}>
          <div className="h-22 shrink-0">{tabs}</div>
          {children}
        </div>
      </div>
    </>
  );
}
