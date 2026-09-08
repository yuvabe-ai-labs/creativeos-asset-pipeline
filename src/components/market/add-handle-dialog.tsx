"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Resolves to the canonical handle, or an error message to show on the field. */
  onAdd: (raw: string) => Promise<{ handle: string } | { error: string }>;
  onAdded: (handle: string) => void;
};

/** One empty field, no prefill (D252): Performance does not read Brand Kit, so the
 *  dialog has a single state rather than two. The server canonicalizes, which is why
 *  the copy invites a URL as readily as a handle. */
export function AddHandleDialog({ open, onClose, onAdd, onAdded }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setValue("");
    setError(null);
    onClose();
  }

  async function save() {
    const raw = value.trim();
    if (!raw || busy) return;
    setBusy(true);
    setError(null);
    const result = await onAdd(raw);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onAdded(result.handle);
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Track a handle</DialogTitle>
          <DialogDescription>
            The client&apos;s own account or a competitor&apos;s — both work the same way.
            Snapshots start from today; history builds as they run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="handle">Instagram handle</Label>
          <Input
            id="handle"
            value={value}
            autoFocus
            placeholder="@handle, or paste a profile link"
            aria-invalid={error !== null}
            aria-describedby={error ? "handle-error" : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
          {error && (
            <p id="handle-error" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!value.trim() || busy}>
            {busy && <Loader2 className="animate-spin" strokeWidth={1.5} />}
            {busy ? "Adding…" : "Track handle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
