// src/components/script-review/team/share-link-field.tsx
"use client";

import { Copy } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { absoluteLink, copyLink } from "./copy-link";

/** The link, readable and copyable. The Copy button sits inside the field (CLAUDE.md: InputGroup). */
export function ShareLinkField({ path }: { path: string }) {
  return (
    <InputGroup>
      <InputGroupInput readOnly value={absoluteLink(path)} aria-label="Client link" onFocus={(e) => e.currentTarget.select()} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Copy link" onClick={() => void copyLink(path)}>
          <Copy className="size-3.5" strokeWidth={1.5} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
