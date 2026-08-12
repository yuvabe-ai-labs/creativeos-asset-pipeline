"use client";

import { Eye, Unlock } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/format/initials";
import type { ImpersonationSession } from "@/lib/auth/impersonation-audit-view";
import { SessionEntryRow } from "./session-entry-row";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function durationLabel(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "In progress";
  const minutes = Math.max(
    1,
    Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// A collapsed card still has to answer "did anything happen here" — hence the counts.
function summarize(session: ImpersonationSession): string {
  const generations = session.entries.filter((e) => e.kind === "generation").length;
  const actions = session.entries.filter((e) => e.kind === "action").length;
  const parts: string[] = [];
  if (generations) parts.push(`${generations} generation${generations === 1 ? "" : "s"}`);
  if (actions) parts.push(`${actions} action${actions === 1 ? "" : "s"}`);
  if (session.quietCount) parts.push(`${session.quietCount} quiet writes`);
  return parts.length ? parts.join(" · ") : "No changes recorded";
}

// Every session is the same Card as the Overview tab's — the state signal lives in the
// badge, never in the card's own surface. Tinting the card would be a large colour fill,
// which the design system reserves for nothing at all.
export function SessionCard({ session }: { session: ImpersonationSession }) {
  const StateIcon = session.elevated ? Unlock : Eye;

  return (
    <Card className="gap-0 py-0 shadow-card">
      <Accordion>
        <AccordionItem value={session.id}>
          <AccordionTrigger className="px-5 py-4">
            <div className="flex w-full items-center gap-3 text-left">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                {initials(session.operatorName)}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-foreground">
                  {session.operatorName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {summarize(session)}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {formatDay(session.startedAt)}, {formatTime(session.startedAt)} ·{" "}
                  {durationLabel(session.startedAt, session.endedAt)}
                </span>
                <Badge variant={session.elevated ? "destructive" : "default"}>
                  <StateIcon className="mr-1.5 size-3" strokeWidth={1.5} />
                  {session.elevated ? "Editing" : "Read-only"}
                </Badge>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-4">
            <ul className="ml-3 border-l border-border pl-4">
              {session.entries.map((entry, i) => (
                <SessionEntryRow key={`${entry.kind}-${entry.at}-${i}`} entry={entry} />
              ))}
              {session.quietCount > 0 && (
                <li className="flex items-baseline gap-3 py-1.5 text-sm text-muted-foreground/70">
                  <span className="w-12 shrink-0" />
                  <span>
                    {session.quietCount} quiet writes (autosaves, upload handshakes)
                  </span>
                </li>
              )}
              {session.endedAt && (
                <li className="flex items-baseline gap-3 py-1.5">
                  <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatTime(session.endedAt)}
                  </span>
                  <span className="text-sm text-muted-foreground">Exited</span>
                </li>
              )}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
