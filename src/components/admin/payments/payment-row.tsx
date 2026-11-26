"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AgencyTag } from "@/components/admin/agencies/agency-tag";
import { AGENCY_WIDE } from "@/components/admin/agencies/agency-row";
import type { AdminPayment } from "@/lib/db/billing-admin-payments";
import type { PaymentStatus } from "@/lib/billing/admin-payments-filters";
import { billingHref } from "@/lib/admin/payments-page";
import { formatIstDate, formatIstTime } from "@/lib/admin/ist";
import { formatRupees } from "@/lib/billing/pricing";
import { initials } from "@/lib/format/initials";
import { cn } from "@/lib/utils";

const WHAT: Record<AdminPayment["kind"], string> = { plan: "First payment", renewal: "Renewal", topup: "Top-up", test: "Test" };
const STATUS: Record<PaymentStatus, { tone: "ok" | "bad" | "plain"; label: string }> = {
  paid: { tone: "ok", label: "Paid" },
  failed: { tone: "bad", label: "Failed" },
  refunded: { tone: "plain", label: "Refunded" },
  created: { tone: "plain", label: "Not finished" },
};

// One payment in the ledger. The agency's name is the row's link to its billing; a click anywhere
// else on the row opens it too, except while selecting text. Amounts include GST.
export function PaymentRow({ payment: p }: { payment: AdminPayment }) {
  const router = useRouter();
  const href = billingHref(p.orgId);
  const at = new Date(p.at);
  const status = STATUS[p.status];

  function onRowClick(e: React.MouseEvent<HTMLTableRowElement>) {
    if ((e.target as HTMLElement).closest("a, button") || window.getSelection()?.toString()) return;
    router.push(href);
  }

  return (
    <tr onClick={onRowClick} className="group cursor-pointer transition-colors duration-200 ease-out hover:bg-muted/60 [&>td]:border-b [&>td]:border-border/60 last:[&>td]:border-b-0">
      <td className="px-3 py-3 align-middle md:px-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div aria-hidden className="hidden size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-[0.7rem] font-semibold text-muted-foreground md:flex">
            {initials(p.orgName)}
          </div>
          <div className="min-w-0">
            <Link href={href} prefetch={false} className="font-medium decoration-muted-foreground/40 underline-offset-[3px] group-hover:underline">
              {p.orgName}
            </Link>
            <div className="text-xs text-muted-foreground">
              {WHAT[p.kind]}
              {p.name ? ` · ${p.name}` : ""}
            </div>
            <div className="text-xs text-muted-foreground md:hidden">
              {formatIstDate(at, false)}, {formatIstTime(at)}
            </div>
          </div>
        </div>
      </td>
      <td className={`${AGENCY_WIDE} px-3.5 py-3 align-middle text-sm whitespace-nowrap`}>
        {formatIstDate(at)}
        <div className="text-xs text-muted-foreground">{formatIstTime(at)}</div>
      </td>
      <td className="px-3 py-3 align-middle md:px-3.5">
        <AgencyTag tone={status.tone}>{status.label}</AgencyTag>
      </td>
      <td className="px-3 py-3 text-right align-middle tabular-nums md:px-3.5">
        <span className={cn(p.status === "paid" ? "font-medium" : "text-muted-foreground", p.status === "refunded" && "line-through")}>{formatRupees(p.totalMinor)}</span>
        <div className="text-xs text-muted-foreground">{p.beforeGstMinor !== null ? `${formatRupees(p.beforeGstMinor)} + GST` : "GST included"}</div>
      </td>
      <td className={`${AGENCY_WIDE} w-px px-3.5 py-3 align-middle`}>
        <ChevronRight aria-hidden strokeWidth={1.5} className="size-4 text-muted-foreground/60 transition-[color,transform] duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-foreground" />
      </td>
    </tr>
  );
}
