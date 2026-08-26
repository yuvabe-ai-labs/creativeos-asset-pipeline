"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateMemberRoleAction } from "@/lib/actions/admin";
import { ORG_ROLES } from "@/lib/orgs/org-schema";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// R1.3. Optimistic, with a revert on failure.
//
// The revert is not defensive boilerplate — the expected failure here is migration 0012's
// org_memberships_last_owner trigger refusing to demote an org's final owner (R1.4). That
// is a rule the operator needs to SEE enforced: without the snap-back they would be left
// believing the change stuck, and the roster would silently disagree with the database.
export function MemberRoleSelect({
  orgId,
  userId,
  role,
}: {
  orgId: string;
  userId: string;
  role: string;
}) {
  const [value, setValue] = useState(role);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    const res = await updateMemberRoleAction(orgId, userId, next);
    setSaving(false);
    if (res?.error) {
      setValue(previous);
      toast.error("Couldn't change role", { description: res.error });
    }
  }

  return (
    <Select
      value={value}
      // Base UI's onValueChange is (string | null); ignore a null clear rather than
      // sending it to the server, since a member always has exactly one role.
      onValueChange={(v) => {
        if (v) void change(v);
      }}
      disabled={saving}
    >
      <SelectTrigger size="sm" className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ORG_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
