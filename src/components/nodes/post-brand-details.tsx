"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { BRAND_DETAIL_FIELDS } from "@/lib/brand-kit/constants";
import type { BrandDetails } from "@/lib/brand-kit/types";

type Props = {
  details: BrandDetails;
  onPatch: (key: keyof BrandDetails, value: string) => void;
};

/**
 * One field, owning its own draft.
 *
 * The draft has to be per-field, not one object shared across all seven. `details` gets a new
 * object identity twice per save — once optimistically, once when the PATCH resolves — so a
 * shared draft re-seeded on identity would wipe whatever you had started typing in the NEXT
 * field a few hundred milliseconds after you left the previous one. Comparing this field's own
 * incoming value survives that: saving Phone does not change Email's value, so Email's draft is
 * left alone.
 */
function DetailField({
  value, label, placeholder, onCommit,
}: {
  value: string;
  label: string;
  placeholder: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [lastSeen, setLastSeen] = useState(value);
  // Adjusted during render rather than in an effect — an effect would setState after commit
  // and cost an extra render pass for something derivable here.
  if (value !== lastSeen) {
    setLastSeen(value);
    setDraft(value);
  }

  return (
    <div>
      <label className="text-eyebrow mb-1 block !text-[0.6rem]">{label}</label>
      <Input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        // Saved on blur, not per keystroke: a phone number is 13 characters and 13 PATCHes
        // for one field would be absurd.
        onBlur={() => { if (draft !== value) onCommit(draft); }}
        className="h-8 text-xs"
      />
    </div>
  );
}

export function PostBrandDetails({ details, onPatch }: Props) {
  return (
    <div>
      <p className="mb-2 text-[0.6rem] text-muted-foreground">
        Used to fill in contact blocks. Saved for this client, on every canvas.
      </p>
      <div className="space-y-2">
        {BRAND_DETAIL_FIELDS.map(({ key, label, placeholder }) => (
          <DetailField
            key={key}
            value={details[key] ?? ""}
            label={label}
            placeholder={placeholder}
            onCommit={(next) => onPatch(key, next)}
          />
        ))}
      </div>
    </div>
  );
}
