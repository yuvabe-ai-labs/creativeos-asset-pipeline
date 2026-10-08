// src/components/script-review/part-composer.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_BODY_MAX } from "@/lib/client-review/constants";
import { errorMessage } from "@/lib/avatars/utils";

/** One text box for a new comment, a reply or an edit. One post per tap; the error stays beside it. */
export function PartComposer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  initial = "",
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  initial?: string;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setBody("");
    } catch (e) {
      setError(errorMessage(e, "Could not post."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={COMMENT_BODY_MAX}
        placeholder={placeholder}
        autoFocus
        className="min-h-16 text-base md:text-sm"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={submit} disabled={busy || !body.trim()}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
