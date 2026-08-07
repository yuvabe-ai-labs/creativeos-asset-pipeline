import * as simpleIcons from "simple-icons";
import type { IconSource } from "./types";

export type ResolvedSimpleIcon = { hex: string; path: string; title: string };

// simple-icons exports each icon as `si<PascalName>`, e.g. `siInstagram`, `siWhatsapp`.
function simpleIconExportName(name: string): string {
  return `si${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export function resolveSimpleIcon(name: string): ResolvedSimpleIcon | null {
  const key = simpleIconExportName(name) as keyof typeof simpleIcons;
  const icon = simpleIcons[key] as { hex: string; path: string; title: string } | undefined;
  if (!icon) return null;
  return { hex: icon.hex, path: icon.path, title: icon.title };
}

export type ResolvedIconSource =
  | { kind: "lucide"; value: string }
  | { kind: "simple"; value: ResolvedSimpleIcon }
  | { kind: "url"; value: string };

// Resolves an IconSource to whatever its consumer needs to draw it. A lucide icon
// resolves to its plain NAME only — the name -> LucideIcon component lookup stays in
// post-layer-render.tsx, since this module stays free of React/JSX so it's unit-testable
// under plain Vitest (no jsdom in this repo's test config).
export function resolveIconSource(src: IconSource): ResolvedIconSource {
  if (src.kind === "lucide") return { kind: "lucide", value: src.name };
  if (src.kind === "url") return { kind: "url", value: src.url };
  const resolved = resolveSimpleIcon(src.name);
  return { kind: "simple", value: resolved ?? { hex: "000000", path: "", title: src.name } };
}
