"use client";

import { useMemo } from "react";
import type { VideoGenVersionSummary } from "./video-gen-version-history";
import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { useNodeCost } from "@/hooks/use-node-cost";
import { readVoiceMeta } from "@/lib/voice-change/meta";
import { readVoiceChange } from "@/lib/voice-change/record";

type Props = {
  versions: VideoGenVersionSummary[];
  nodeId: string;
  upstreamNodeIds?: string[];
};

type GenStat = {
  vNum: number;
  createdAt: string;
  durationSeconds: number;
  creditsCharged: number | null;
  modelLabel: string;
  voiced: boolean;
  // D284 — set when this version is a voice change; its meta line replaces duration/model
  // with this instead (the credits are already voice-only, so those figures don't apply).
  voiceChangeName: string | null;
};

export function VideoGenUsagePopover({ versions, nodeId, upstreamNodeIds }: Props) {
  const { totalCredits, perGen } = useMemo(() => {
    let totalCredits = 0;
    const perGen: GenStat[] = [];

    const ordered = [...versions].reverse();
    ordered.forEach((v, i) => {
      if (!v.output || !v.modelUsed) return;
      const duration = Number(
        v.paramsUsed?.durationSeconds ?? v.paramsUsed?.duration ?? v.paramsUsed?.seconds ?? 5,
      );
      if (v.creditsCharged !== null && v.creditsCharged !== undefined) {
        totalCredits += v.creditsCharged;
      }
      perGen.push({
        vNum: i + 1,
        createdAt: v.createdAt,
        durationSeconds: duration,
        creditsCharged: v.creditsCharged ?? null,
        modelLabel: v.modelUsed.split(":")[1] ?? v.modelUsed,
        voiced: readVoiceMeta(v.paramsUsed?.voice)?.status === "applied",
        voiceChangeName: readVoiceChange(v.inputsUsed?.voiceChange)?.voiceName ?? null,
      });
    });

    return { totalCredits, perGen: perGen.reverse() };
  }, [versions]);

  const hasUpstream = Boolean(upstreamNodeIds && upstreamNodeIds.length > 0);
  const pipelineTotalCredits = useNodeCost(nodeId, upstreamNodeIds);

  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: formatRelativeTime(g.createdAt),
    meta: g.voiceChangeName
      ? `voice change · ${g.voiceChangeName}`
      : `${g.durationSeconds}s · ${g.modelLabel}${g.voiced ? " · voice" : ""}`,
    credits: g.creditsCharged !== null ? g.creditsCharged.toLocaleString() : "—",
  }));

  return (
    <UsagePopoverShell
      rows={rows}
      totalCredits={`${totalCredits.toLocaleString()} credits`}
      pipelineTotalCredits={
        pipelineTotalCredits !== null && hasUpstream
          ? `${pipelineTotalCredits.toLocaleString()} credits`
          : undefined
      }
      pipelineLoading={hasUpstream && pipelineTotalCredits === null}
    />
  );
}
