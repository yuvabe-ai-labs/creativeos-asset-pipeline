"use client";

import { useEffect, useRef, useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImpersonationSessionPage } from "@/lib/db/impersonation-audit";
import type { ImpersonationSession } from "@/lib/auth/impersonation-audit-view";
import { SessionCard } from "./session-card";

const PAGE_SIZES = [10, 20, 50];

export function ImpersonationAudit({
  orgId,
  initial,
}: {
  orgId: string;
  initial: ImpersonationSessionPage;
}) {
  const [sessions, setSessions] = useState<ImpersonationSession[]>(initial.sessions);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Page 1 was already fetched server-side — skip the first effect pass so mount does
  // not immediately re-fetch what we already have.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    void fetch(`/api/admin/orgs/${orgId}/impersonation-sessions?${params}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ImpersonationSessionPage | null) => {
        if (cancelled || !data) return;
        setSessions(data.sessions);
        setTotal(data.total);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);

  function handlePageSizeChange(next: string | null) {
    if (!next) return;
    setPageSize(Number(next));
    setPage(1);
  }

  if (total === 0) {
    return (
      <p className="py-14 text-center text-sm text-muted-foreground">
        No support sessions recorded for this organization.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sessions per page</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger size="sm" className="w-[68px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Pagination page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
      </div>
    </div>
  );
}
