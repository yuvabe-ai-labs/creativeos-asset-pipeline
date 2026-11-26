"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { AgencyRow as Row } from "@/lib/admin/agencies-list";
import { initials } from "@/lib/format/initials";
import { AgencyTag } from "./agency-tag";
import { AgencyCreditsCell } from "./agency-credits-cell";
import { AgencyFixButton } from "./agency-fix-button";

/** Cells hidden on a phone (the first cell stacks them instead) and below ~1100px. */
export const AGENCY_WIDE = "hidden md:table-cell";
export const AGENCY_WIDEST = "hidden min-[1100px]:table-cell";

// One agency. The name is the row's link (Tab reaches it, Enter opens it, ↑ ↓ move between rows);
// a click anywhere else on the row opens it too, except on a button or while selecting text.
export function AgencyRow({ row }: { row: Row }) {
  const router = useRouter();
  const { issue, fix, billing, credits, activity } = row;

  function onRowClick(e: React.MouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    // A dialog opened from the row is portalled out of it; its clicks still bubble here.
    if (!e.currentTarget.contains(target) || target.closest("a, button, [role='dialog']")) return;
    if (window.getSelection()?.toString()) return;
    router.push(row.href);
  }

  return (
    <tr
      onClick={onRowClick}
      className="group cursor-pointer border-b border-border/60 transition-colors duration-200 ease-out last:border-b-0 hover:bg-muted/60 has-[[data-agency-link]:focus-visible]:bg-muted/60 has-[[data-agency-link]:focus-visible]:shadow-[inset_2px_0_0_var(--primary)]"
    >
      <td className="px-3 py-3 align-middle md:px-3.5">
        <div className="flex min-w-0 items-start gap-3 md:min-w-52 md:items-center">
          <div aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-[0.7rem] font-semibold text-muted-foreground">
            {initials(row.name)}
          </div>
          <div className="min-w-0">
            <Link
              href={row.href}
              data-agency-link
              className="rounded-sm font-medium text-foreground decoration-muted-foreground/40 underline-offset-[3px] outline-none group-hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {row.name}
            </Link>
            <div className="max-w-60 truncate text-xs text-muted-foreground max-md:max-w-none max-md:whitespace-normal max-md:[overflow-wrap:anywhere]">
              {row.ownerLine}
            </div>
            {/* On a phone the other columns stack here. */}
            <div className="mt-2 grid justify-items-start gap-1.5 md:hidden">
              {issue && (
                <>
                  <AgencyTag tone={issue.tone}>{issue.label}</AgencyTag>
                  <span className="text-xs text-muted-foreground">{issue.note}</span>
                </>
              )}
              <span className="text-xs text-muted-foreground">
                {billing.line} · {credits.line}
              </span>
              {fix && <AgencyFixButton fix={fix} orgId={row.id} orgName={row.name} />}
            </div>
          </div>
        </div>
      </td>
      <td className={`${AGENCY_WIDE} min-w-44 px-3.5 py-3 align-middle`}>
        {issue && (
          <>
            <AgencyTag tone={issue.tone}>{issue.label}</AgencyTag>
            <div className="mt-1 text-xs text-muted-foreground">{issue.note}</div>
          </>
        )}
      </td>
      <td className={`${AGENCY_WIDE} px-3.5 py-3 align-middle`}>
        <AgencyTag tone={billing.tone} dot={billing.tone === "ok" || billing.tone === "bad"}>
          {billing.label}
        </AgencyTag>
        <div className="mt-1 text-xs text-muted-foreground">{billing.note}</div>
      </td>
      <td className={`${AGENCY_WIDE} px-3.5 py-3 align-middle`}>
        <AgencyCreditsCell credits={credits} />
      </td>
      <td className={`${AGENCY_WIDEST} px-3.5 py-3 align-middle text-sm`}>
        {activity.lastActive}
        <div className="text-xs text-muted-foreground">{activity.size}</div>
      </td>
      <td className="w-px px-3 py-3 align-middle md:px-3.5">
        <div className="flex items-center justify-end gap-2.5">
          {fix && (
            <div className="hidden md:block">
              <AgencyFixButton fix={fix} orgId={row.id} orgName={row.name} />
            </div>
          )}
          <ChevronRight
            aria-hidden
            strokeWidth={1.5}
            className="size-4 text-muted-foreground/60 transition-[color,transform] duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-foreground group-has-[[data-agency-link]:focus-visible]:translate-x-0.5 group-has-[[data-agency-link]:focus-visible]:text-foreground"
          />
        </div>
      </td>
    </tr>
  );
}
