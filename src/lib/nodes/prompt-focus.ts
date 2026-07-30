import type { ApprovalStatus } from "@/lib/approval";

export type ApprovalPillTone = "neutral" | "positive" | "warning";
export type ApprovalPill = { label: string; tone: ApprovalPillTone };

// Header status pill (read-only): reflects the active version's approval flag (D29).
export function describeApprovalPill(status: ApprovalStatus): ApprovalPill {
  switch (status) {
    case "approved":
      return { label: "Approved", tone: "positive" };
    case "changes_requested":
      return { label: "Needs changes", tone: "warning" };
    case "pending":
    default:
      return { label: "Pending review", tone: "neutral" };
  }
}

export type VersionChip = {
  id: string;
  label: string; // "v3"
  isActive: boolean;
  isError: boolean;
  disabled: boolean; // active OR error OR restoring
};

// Compact chip model, newest-first (index 0 = highest generation number), mirroring the
// numbering PromptVersionHistory uses (genNumber = total - index). Structural input type keeps
// this lib module free of a component dependency; VersionSummary[] satisfies it.
export function buildVersionChips(
  versions: { id: string; error: string | null }[],
  activeVersionId: string | null,
  restoring: boolean,
): VersionChip[] {
  const total = versions.length;
  return versions.map((v, i) => {
    const isActive = v.id === activeVersionId;
    const isError = !!v.error;
    return {
      id: v.id,
      label: `v${total - i}`,
      isActive,
      isError,
      disabled: isActive || isError || restoring,
    };
  });
}
