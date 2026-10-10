// src/components/script-review/team/copy-link-button.tsx
"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyLink } from "./copy-link";

export function CopyLinkButton({ path }: { path: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => void copyLink(path)}>
      <Copy strokeWidth={1.5} />
      Copy link
    </Button>
  );
}
