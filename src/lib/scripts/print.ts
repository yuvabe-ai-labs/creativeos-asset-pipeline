import type { ScriptDoc } from "./schema";
import { formatRange, timeShots } from "./timeline";
import { reelLabel } from "./utils";

// Spec 1 §5 — the handoff prints the script in the layout of the team's existing outlines
// (docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md), which the Script
// node's parse already handles, so the parse needs no change. ONE ROW PER SHOT: the parse makes
// one shot per row, so the canvas gets exactly the shots the client approved.

const HEADER_SEP = "   ·   ";

/** A table cell: one line, with pipes escaped so a cell can never split into two. */
function cell(text: string): string {
  return text.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
}

const bold = (text: string) => (text.trim() ? `**${cell(text)}**` : "");

function character(doc: ScriptDoc): string {
  return doc.cast
    .map((c) => (c.description.trim() ? c.description.trim() : `${c.name}.`))
    .join(" ");
}

export function printScript(doc: ScriptDoc): string {
  const { header, context } = doc;
  const label = reelLabel(header.reelNumber);
  const lines: string[] = [];

  lines.push(`**${label ? `${label}  ` : ""}${header.title}**`, "");

  const aspectLength = [header.aspect, header.targetLength].filter((p) => p.trim()).join(", ");
  const facts = [header.region, header.postDate, header.theme, aspectLength].filter((p) => p.trim());
  lines.push(`| ${cell(header.format)} | ${facts.map(cell).join(HEADER_SEP)} |`, "| :---- | :---- |", "");

  if (context.purpose.trim()) lines.push(`**Purpose.**  ${context.purpose.trim()}`, "");
  lines.push(`**Character.**  ${character(doc)}`, "");
  if (context.settingAndCamera.trim()) lines.push(`**Setting and camera.**  ${context.settingAndCamera.trim()}`, "");

  lines.push("| Beat | Visual | VO | On-screen text |", "| :---- | :---- | :---- | :---- |");
  for (const t of timeShots(doc.shots)) {
    const beat = `${t.shot.beat.trim().toUpperCase()} ${formatRange(t.start, t.end)}`.trim();
    lines.push(`| **${cell(beat)}** | ${cell(t.shot.visual)} | ${cell(t.shot.vo)} | ${bold(t.shot.onScreenText)} |`);
  }
  lines.push("");

  if (context.disclaimers.trim()) lines.push(`**Disclaimers.**  ${context.disclaimers.trim()}`, "");
  if (context.watchOuts.length > 0) {
    lines.push("**Watch-outs**", "", ...context.watchOuts.map((w) => `* ${w.trim()}`), "");
  }

  return lines.join("\n").trimEnd() + "\n";
}
