// The shared format menu, offered to every client (brand-neutral spec §3.1). A format's beats are a
// starting point: the copilot leaves out or adapts a beat that doesn't fit the brand and lists the
// beats on the confirmation card. What goes inside each beat comes from the brand, never from here.

export type FormatBeat = { label: string; does: string };
export type ScriptFormat = { name: string; beats: FormatBeat[]; realPersonLead: boolean };

const HOOK: FormatBeat = { label: "HOOK", does: "the lead's moment, a line to camera" };
const INTRO: FormatBeat = { label: "INTRO", does: "the situation or the problem" };
const REVIEW: FormatBeat = { label: "REVIEW", does: "a real customer review, only for brands that use them" };
const PROOF: FormatBeat = { label: "PROOF", does: "the brand's proof, from its KB" };
const OUTRO: FormatBeat = { label: "OUTRO", does: "where to find it, and any disclaimers" };
const UGC_MIDDLE: FormatBeat[] = [
  { label: "STORY", does: "the product or service enters the lead's life" },
  { label: "STEP", does: "how it is used or experienced" },
];
const UGC_END: FormatBeat[] = [
  { label: "BODY", does: "what stays the same in the lead's life" },
  { label: "PAYOFF", does: "the moment it pays off" },
  PROOF,
  OUTRO,
];
const TOPIC = (n: number): FormatBeat => ({ label: `TOPIC ${n}`, does: "a point about this reel's topic, labelled for it" });

export const SCRIPT_FORMATS: readonly ScriptFormat[] = [
  { name: "UGC", beats: [HOOK, INTRO, ...UGC_MIDDLE, REVIEW, ...UGC_END], realPersonLead: false },
  { name: "UGC review first", beats: [HOOK, REVIEW, INTRO, ...UGC_MIDDLE, ...UGC_END], realPersonLead: false },
  { name: "Founder-led", beats: [HOOK, INTRO, TOPIC(1), TOPIC(2), TOPIC(3), TOPIC(4), TOPIC(5), PROOF, OUTRO], realPersonLead: true },
];

/** The menu format named inside a free-typed answer ("like a UGC"); the longest name wins, so
 *  "UGC review first" is not read as "UGC". */
export function formatFor(text: string): ScriptFormat | undefined {
  // Words only, so "UGC, review first" and "founder led" match their menu names.
  const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const t = words(text);
  return [...SCRIPT_FORMATS]
    .sort((a, b) => b.name.length - a.name.length)
    .find((f) => t.includes(words(f.name)));
}

/** The menu as the copilot reads it, with the chosen format marked. */
export function renderFormatMenu(chosen: string): string {
  const picked = formatFor(chosen);
  const lines = SCRIPT_FORMATS.map((f) => [
    `${f.name}${f === picked ? " (chosen)" : ""}:`,
    ...f.beats.map((b) => `- ${b.label}: ${b.does}`),
  ].join("\n"));
  lines.push("A beat that doesn't fit this brand is left out or adapted, and the confirmation card lists the beats.");
  if (chosen.trim() && !picked) lines.push("The chosen format is not on the menu: shape its beats from the person's description.");
  return lines.join("\n\n");
}
