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
  const prevStatus = useRef<string | null>(null);

  useEffect(() => {
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
      setTimeout(() => setKbJustReady(false), 2500);
    }
    prevStatus.current = job.status;
  }, [job?.status, setKbStatus, setKbJustReady]);

  return null;
}

export function CanvasKBBadge() {
  const kbStatus = useCanvasStore((s) => s.kbStatus);
  if (kbStatus !== "building") return null;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-500 shadow-sm">
      <span className="size-2 animate-spin rounded-full border border-current border-t-transparent" />
      KB building…
    </div>
  );
}
