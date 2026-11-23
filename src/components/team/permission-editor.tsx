"use client";

import { Check } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PERMISSIONS, isPermission, orderedPermissions, type Permission } from "@/lib/permissions/model";
import { PERMISSION_HINTS, PERMISSION_LABELS } from "@/lib/people/constants";

// D547: the only place permissions are set. The five permissions as toggles, in PERMISSIONS
// order: click to turn one on or off, then the parent saves (Give access, or Save on a member).
// None on is a valid answer (a member who only looks).
export function PermissionEditor({
  value,
  onChange,
  personName,
  disabled = false,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  personName: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        multiple
        variant="outline"
        spacing={2}
        value={orderedPermissions(value)}
        onValueChange={(next) => onChange(orderedPermissions(next.filter(isPermission)))}
        disabled={disabled}
        aria-label={`Permissions for ${personName}`}
        className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {PERMISSIONS.map((p) => (
          <ToggleGroupItem
            key={p}
            value={p}
            aria-label={PERMISSION_LABELS[p]}
            className="group/perm h-auto items-start justify-start gap-2.5 rounded-xl px-3 py-2.5 text-left whitespace-normal data-[pressed]:border-primary/40 data-[pressed]:bg-primary/5"
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-input bg-card group-data-[pressed]/perm:border-primary group-data-[pressed]/perm:bg-primary group-data-[pressed]/perm:text-primary-foreground">
              <Check className="size-3 opacity-0 group-data-[pressed]/perm:opacity-100" strokeWidth={2} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{PERMISSION_LABELS[p]}</span>
              <span className="text-xs font-normal text-muted-foreground">{PERMISSION_HINTS[p]}</span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">
        {`These apply on every client ${personName} is on, and on any client they're added to later. With none, ${personName} can look but not change anything.`}
      </p>
    </div>
  );
}
