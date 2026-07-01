"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Identity } from "@/lib/identity";

// Shared name + role form. Used both by the blocking app-start gate and the switchable chip.
export function IdentityDialog({
  open,
  initial,
  dismissable,
  onSubmit,
  onOpenChange,
}: {
  open: boolean;
  initial?: Identity | null;
  dismissable?: boolean;
  onSubmit: (id: Identity) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<Identity["role"]>(initial?.role ?? "designer");
  const valid = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={dismissable ? onOpenChange : undefined}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Who are you?</DialogTitle>
          <DialogDescription>
            Used to record who generated and who approved each output.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select value={role} onValueChange={(v) => setRole(v as Identity["role"])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="senior">Senior designer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="w-full"
            disabled={!valid}
            onClick={() => onSubmit({ name: name.trim(), role })}
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
