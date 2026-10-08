"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LIKENESS_CONSENT_STATEMENT } from "@/lib/avatars/constants";
import type { Avatar } from "@/lib/avatars/schema";
import { formatDate } from "@/lib/kb/utils";

type Props = {
  /** Two Specific people on one Visualise page must not share an id. */
  id?: string;
  avatar: Avatar;
  confirming: boolean;
  onConfirm: () => void;
};

// D289 — an uploaded front is a real person: the operator ticks the statement themselves and
// the server records who and when. Consent is one-way here — once confirmed there is no
// untick, only replacing the front image clears it (see `frontChangePatch`).
export function AvatarLikenessConsent({ id = "likeness-consent", avatar, confirming, onConfirm }: Props) {
  const [ticked, setTicked] = useState(false);

  if (avatar.likenessConsentAt) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Check className="size-4 text-primary" strokeWidth={1.5} />
        <span>Permission confirmed · {formatDate(avatar.likenessConsentAt)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={id}
          checked={ticked}
          onCheckedChange={(checked) => setTicked(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor={id} className="cursor-pointer font-normal">
          {LIKENESS_CONSENT_STATEMENT}
        </Label>
      </div>
      <Button size="sm" className="self-start" disabled={!ticked || confirming} onClick={onConfirm}>
        {confirming ? "Confirming…" : "Confirm"}
      </Button>
    </div>
  );
}
