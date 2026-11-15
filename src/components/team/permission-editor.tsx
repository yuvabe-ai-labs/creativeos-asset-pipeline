"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERMISSIONS, orderedPermissions, type Permission } from "@/lib/permissions/model";
import { PERMISSION_LABELS } from "@/lib/people/constants";

// D509: the only place permissions are set. Chips with ×, then "Choose a permission" and Add;
// none to start, and none is a valid answer (a member who only looks). The options are the five
// permissions in PERMISSIONS order. The parent saves (Give access, or Save on a member).
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
  const [choice, setChoice] = useState<Permission | null>(null);
  const held = orderedPermissions(value);
  const remaining = PERMISSIONS.filter((p) => !held.includes(p));
  const items = remaining.map((p) => ({ value: p, label: PERMISSION_LABELS[p] }));

  function add() {
    if (!choice) return;
    onChange(orderedPermissions([...held, choice]));
    setChoice(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {held.map((p) => (
          <Badge key={p} variant="outline" className="gap-0.5 py-0 pr-0.5 pl-2 text-sm font-medium">
            {PERMISSION_LABELS[p]}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 rounded-full text-muted-foreground"
              aria-label={`Remove ${PERMISSION_LABELS[p]}`}
              disabled={disabled}
              onClick={() => onChange(held.filter((h) => h !== p))}
            >
              <X className="size-3" strokeWidth={1.5} />
            </Button>
          </Badge>
        ))}
        {remaining.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Select
              items={items}
              value={choice}
              onValueChange={(v) => setChoice((v as Permission | null) ?? null)}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Choose a permission">
                <SelectValue placeholder="Choose a permission" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-dashed border-primary/40 text-primary hover:bg-primary/5"
              disabled={disabled || !choice}
              onClick={add}
            >
              <Plus className="size-3.5" strokeWidth={1.5} />
              Add
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {`These apply on every client ${personName} is on, and on any client they're added to later. With none, ${personName} can look but not change anything.`}
      </p>
    </div>
  );
}
