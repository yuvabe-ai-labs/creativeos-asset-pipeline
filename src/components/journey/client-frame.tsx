"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { ClientRow } from "@/lib/db/types";
import { frameFor } from "@/lib/journey/frame";
import { guideFor } from "@/lib/journey/guide";
import type { JourneyState } from "@/lib/journey/stages";
import { JourneyPanel } from "./journey-panel";
import { StageTabs } from "./stage-tabs";

/** The frame around every client screen (copilot journey spec §4.1): the stage tabs on top and,
 *  on a stage's own page, the copilot's guide on the left. The page itself is untouched. Stage
 *  state comes from the server layout, so the frame makes no requests of its own. */
export function ClientFrame({ client, state, children }: {
  client: { id: string; slug: string; name: string; kbStatus: ClientRow["kb_status"] };
  state: JourneyState;
  children: ReactNode;
}) {
  const frame = frameFor(usePathname(), client.slug);
  if (!frame.tabs) return <>{children}</>;

  return (
    <>
      <StageTabs slug={client.slug} name={client.name} state={state} active={frame.tab} />
      {frame.panel ? (
        // The row stretches, so the panel's column is as tall as the page and the panel can stick.
        <div className="flex flex-1">
          <div className="hidden shrink-0 pb-6 pl-6 pt-6 lg:block">
            <JourneyPanel
              clientId={client.id}
              guide={guideFor({ section: frame.panel, state, kbStatus: client.kbStatus, slug: client.slug })}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      ) : (
        children
      )}
    </>
  );
}
