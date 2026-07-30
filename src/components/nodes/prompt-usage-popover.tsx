"use client";

import { useMemo } from "react";
import type { VersionSummary } from "./prompt-version-history";
import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";

type Props = { versions: VersionSummary[] };

type GenStat = {
  vNum: number;
  createdAt: string;
  creditsCharged: number | null;
};

export function UsagePopover({ versions }: Props) {
  const { totalCredits, perGen } = useMemo(() => {
    let totalCredits = 0;
    const perGen: GenStat[] = [];

    versions.forEach((v, i) => {
      if (v.creditsCharged !== null && v.creditsCharged !== undefined) {
        totalCredits += v.creditsCharged;
      }
      perGen.push({
        vNum: versions.length - i,
        createdAt: v.createdAt,
        creditsCharged: v.creditsCharged ?? null,
      });
    });

    return { totalCredits, perGen };
  }, [versions]);

  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: formatRelativeTime(g.createdAt),
    credits: g.creditsCharged !== null ? g.creditsCharged.toLocaleString() : "—",
  }));

  return (
    <UsagePopoverShell
      rows={rows}
      totalCredits={`${totalCredits.toLocaleString()} credits`}
    />
  );
}
