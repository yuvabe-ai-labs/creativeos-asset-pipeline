"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useKBJobStatus } from "@/components/kb/use-kb-job-status";
import { useCanvasStore } from "./canvas-store-provider";
import type { ClientKBJobRow } from "@/lib/db/types";

const NON_TERMINAL = new Set(["queued", "researching", "extracting", "finalizing"]);

type Props = {
  clientId: string;
  initialJob: ClientKBJobRow | null;
  hasActiveKB: boolean;
};

export function CanvasKBStatus({ clientId, initialJob, hasActiveKB }: Props) {
  const job = useKBJobStatus(clientId, initialJob);
  const setKbStatus = useCanvasStore((s) => s.setKbStatus);
  const setKbJustReady = useCanvasStore((s) => s.setKbJustReady);
  // Initialize from initialJob so we don't fire the toast on mount when the job
  // is already succeeded (e.g. user navigated away mid-build and came back).
  const prevStatus = useRef<string | null>(initialJob?.status ?? null);

  useEffect(() => {
    // Treat a succeeded job + no active KB version as 'none' — the webhook
    // graduation may still be in flight. The second effect sets 'ready' when
    // the Realtime event fires.
    if (hasActiveKB && (!job || !NON_TERMINAL.has(job.status))) {
      setKbStatus("ready");
    } else if (job && NON_TERMINAL.has(job.status)) {
      setKbStatus("building");
    } else {
      setKbStatus("none");
    }
  }, [job, hasActiveKB, setKbStatus]);

  useEffect(() => {
    if (!job) return;
    if (prevStatus.current !== "succeeded" && job.status === "succeeded") {
      toast.success("Brand KB is ready! Your brand context is now active.", {
        icon: <CheckCircle2 className="size-4 text-green-500" />,
        duration: 4000,
      });
      setKbStatus("ready");
      setKbJustReady(true);
      const timer = setTimeout(() => setKbJustReady(false), 2500);
      prevStatus.current = job.status;
      return () => clearTimeout(timer);
    }
    prevStatus.current = job.status;
  }, [job, setKbStatus, setKbJustReady]);

  return null;
}

export function CanvasKBBadge() {
  const kbStatus = useCanvasStore((s) => s.kbStatus);
  if (kbStatus !== "building") return null;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
      <span className="size-2 animate-spin rounded-full border border-current border-t-transparent" />
      KB building…
    </div>
  );
}
