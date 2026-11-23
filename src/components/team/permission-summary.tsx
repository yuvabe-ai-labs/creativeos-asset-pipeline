import { orderedPermissions, type Permission } from "@/lib/permissions/model";
import { EVERY_PERMISSION_LABEL, NO_PERMISSIONS_LABEL, NOT_SET_LABEL, PERMISSION_LABELS } from "@/lib/people/constants";

const CHIP = "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";

// A person's permissions, read-only, in PERMISSIONS order: "Everything" for the owner, "Can look"
// (muted) when they have none, "Not set yet" while they wait for access. Edited only in the person panel's PermissionEditor (D547).
export function PermissionSummary({
  permissions,
  owner = false,
  waiting = false,
}: {
  permissions: readonly Permission[];
  owner?: boolean;
  waiting?: boolean;
}) {
  if (waiting) return <span className="text-sm text-muted-foreground">{NOT_SET_LABEL}</span>;
  if (owner) return <span className={`${CHIP} border-primary/25 text-primary`}>{EVERY_PERMISSION_LABEL}</span>;
  if (permissions.length === 0) return <span className={`${CHIP} border-dashed text-muted-foreground`}>{NO_PERMISSIONS_LABEL}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {orderedPermissions(permissions).map((p) => (
        <span key={p} className={`${CHIP} bg-card text-foreground/80`}>{PERMISSION_LABELS[p]}</span>
      ))}
    </span>
  );
}
