"use client";

import type { ScriptHeader } from "@/lib/scripts/schema";
import { HEADER_LABEL } from "@/lib/scripts/copilot/fields";
import { ScriptText } from "./script-text";

const FIELDS = ["format", "region", "postDate", "theme", "aspect", "targetLength", "production"] as const;

/** In the Generate workspace the header line opens into its fields so each can be typed (spec 2 §7). */
export function ScriptHeaderFields({ header }: { header: ScriptHeader }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div className="flex gap-2">
        <dt className="w-28 shrink-0 text-muted-foreground">Reel number</dt>
        <dd><ScriptText path="header.reelNumber" value={header.reelNumber === null ? "" : String(header.reelNumber)} multiline={false} /></dd>
      </div>
      {FIELDS.map((f) => (
        <div key={f} className="flex gap-2">
          <dt className="w-28 shrink-0 text-muted-foreground">{HEADER_LABEL[f]}</dt>
          <dd className="min-w-0"><ScriptText path={`header.${f}`} value={header[f]} multiline={false} /></dd>
        </div>
      ))}
    </dl>
  );
}
