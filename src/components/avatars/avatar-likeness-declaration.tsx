"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/kb/utils";
import { LIKENESS_STATEMENTS, PERSON_TYPE_LABELS } from "@/lib/avatars/constants";
import type { Avatar, PersonType } from "@/lib/avatars/schema";

const ANSWERS: { value: PersonType; label: string }[] = [
  { value: "specific", label: "Yes, a real person" },
  { value: "generic", label: "No, a fictional character" },
];

// D288 — shown for an uploaded front image. The operator says whether it is a real person and
// ticks the matching statement; the server records who confirmed it and when.
export function AvatarLikenessDeclaration({
  avatar, onDeclare,
}: { avatar: Avatar; onDeclare: (personType: PersonType) => void }) {
  const confirmed = Boolean(avatar.personType && avatar.likenessConfirmedAt);
  const [editing, setEditing] = useState(!confirmed);
  const [answer, setAnswer] = useState<PersonType | null>(avatar.personType);
  const [ticked, setTicked] = useState(false);

  if (confirmed && !editing && avatar.personType && avatar.likenessConfirmedAt) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <Check className="size-4 text-primary" strokeWidth={1.5} />
          {PERSON_TYPE_LABELS[avatar.personType]} · confirmed {formatDate(avatar.likenessConfirmedAt)}
        </span>
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <p className="text-sm font-medium">Is this a real person?</p>
      <div className="flex flex-wrap gap-2">
        {ANSWERS.map((a) => (
          <Button
            key={a.value}
            variant="outline"
            size="sm"
            aria-pressed={answer === a.value}
            onClick={() => {
              setAnswer(a.value);
              setTicked(false);
            }}
            className={cn(
              answer === a.value &&
                "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary",
            )}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {answer && (
        <>
          <div className="flex items-start gap-2">
            <Checkbox
              id="avatar-likeness-tick"
              checked={ticked}
              onCheckedChange={(v) => setTicked(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="avatar-likeness-tick" className="text-sm font-normal leading-snug">
              {LIKENESS_STATEMENTS[answer]}
            </Label>
          </div>
          <Button
            size="sm"
            className="self-start"
            disabled={!ticked}
            onClick={() => {
              onDeclare(answer);
              setEditing(false);
              setTicked(false);
            }}
          >
            Confirm
          </Button>
        </>
      )}
    </div>
  );
}
