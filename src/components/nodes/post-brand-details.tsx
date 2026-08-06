"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { BRAND_DETAIL_FIELDS } from "@/lib/brand-kit/constants";
import type { BrandDetails } from "@/lib/brand-kit/types";

type Props = {
  details: BrandDetails;
  onPatch: (key: keyof BrandDetails, value: string) => void;
};

export function PostBrandDetails({ details, onPatch }: Props) {
  // Local draft so typing is never interrupted by a server round trip. Re-seeded when the
  // client changes underneath us (a different post, a reload) but not on every keystroke.
  // Adjusted during render (not an effect) per the "you might not need an effect" pattern —
  // an effect here would setState synchronously after commit, causing an extra render pass.
  const [draft, setDraft] = useState<BrandDetails>(details);
  const [prevDetails, setPrevDetails] = useState(details);
  if (details !== prevDetails) {
    setPrevDetails(details);
    setDraft(details);
  }

  return (
    <div>
      <p className="text-eyebrow mb-1 !text-[0.6rem]">Details</p>
      <p className="mb-2 text-[0.6rem] text-muted-foreground">
        Used to fill in contact blocks. Saved for this client, on every canvas.
      </p>
      <div className="space-y-2">
        {BRAND_DETAIL_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">{label}</label>
            <Input
              value={draft[key] ?? ""}
              placeholder={placeholder}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              // Saved on blur, not per keystroke: a phone number is 13 characters and
              // 13 PATCHes for one field would be absurd.
              onBlur={(e) => {
                if ((details[key] ?? "") !== e.target.value) onPatch(key, e.target.value);
              }}
              className="h-8 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
