import type { ChangeCard } from "@/lib/journey/thread/schema";
import { isImageStudyCard } from "./card";

// What the copilot says about a change worked out from documents (D505), word for word.

/** "a.pdf", "a.pdf and b.md", "a.pdf, b.md and c.docx". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const fields = (n: number) => `${n} field${n === 1 ? "" : "s"}`;

/** What a proposal reads: the documents added, or, after a removal only, what was removed. */
export function readingWhat(input: { added: { name: string }[]; removed: string[] }): string {
  return listNames(input.added.length > 0 ? input.added.map((a) => a.name) : input.removed);
}

export const proposalCopy = {
  reading: (what: string) => `Reading ${what}…`,
  couldNotStart: (what: string) => `Could not start reading ${what}.`,
  couldNotRead: (what: string) => `Could not read ${what}.`,
  couldNotReadLine: (what: string) => `Could not read ${what}. Try again from Source files.`,
  wouldChange: (what: string, n: number) => `${what} would change ${fields(n)}.`,
  noLongerSupported: (what: string, n: number) => `Without ${what}, ${fields(n)} ${n === 1 ? "is" : "are"} no longer supported.`,
  nothing: (what: string) => `Read ${what}. Nothing in it changes the brand KB.`,
  nothingAfterRemoval: (what: string) => `Without ${what}, everything in the brand KB is still supported.`,
  /** Where a value came from when no remaining source supports the old one. */
  unsupported: "No remaining source supports it",
};

// ── The card on screen ───────────────────────────────────────────────────────

/** The approve button, counting the fields it will change. */
export function approveLabel(n: number): string {
  return n === 0 ? "Approve" : `Approve ${n} change${n === 1 ? "" : "s"}`;
}

/** A field's value as the card shows it. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.map(String).join(", ");
  const text = String(value).trim();
  return text === "" ? "none" : text;
}

/** What a study of the images says with its change card, and on a card a newer study overtook (piece 2b). */
export const imageStudyCopy = {
  card: (fields: number) =>
    `The new images read differently for ${fields === 1 ? "a field" : `${fields} fields`} you reviewed. Nothing changes until you approve.`,
  superseded: "The images were studied again after this was proposed, so it no longer applies.",
};

export const OUT_OF_DATE_LINE = "Changed by hand since. Approving leaves it as it is.";

/** The footer of a settled card, or null while it is pending. */
export function settledLine(card: ChangeCard): string | null {
  const by = card.decision?.by ?? "a teammate";
  if (card.status === "discarded") return `Discarded by ${by}.`;
  // A newer study retires an image-study card with no decision on it; a card a person decided on
  // after a rebuild has one, and the rebuild is the reason.
  if (card.status === "stale") return isImageStudyCard(card) && !card.decision ? imageStudyCopy.superseded : "The brand KB was rebuilt after this was proposed, so it no longer applies.";
  if (card.status === "applied") {
    const kept = card.decision?.kept.length ?? 0;
    if (kept === 0 && (card.decision?.outOfDate.length ?? 0) > 0) return `Approved by ${by}: nothing changed. The fields were changed by hand since.`;
    return `Approved by ${by}: ${kept} of ${card.fields.length} changed.`;
  }
  return null;
}
