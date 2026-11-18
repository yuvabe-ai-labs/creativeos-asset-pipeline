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
