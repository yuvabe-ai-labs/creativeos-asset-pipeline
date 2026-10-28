// Brand-neutral spec §2.1 — words that belong to one client and must never sit in anything every
// client gets: the copilot's shared instructions, the format menu, a fixed chip. Collected from the
// leaks found on 28 Oct 2026 (Jackfruit 365, CHUPPS). Tests and the writer probe check against it.

export const CLIENT_TERMS: readonly string[] = [
  "jackfruit", "kerala", "piravi", "golu", "onam", "meal", "lunch", "breakfast", "spoon", "tablespoon",
  "flour", "batter", "dosa", "onion", "garlic", "amazon", "medication", "diabet", "blood sugar",
  "nine-beat", "nine beats", "chupps", "v-straps", "home and kit",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = CLIENT_TERMS.map((term) => [term, new RegExp(`\\b${escapeRe(term)}`, "i")] as const);

/** The client terms found in `text`, case-insensitive, matched from the start of a word: "spoons"
 *  and "diabetic" count, "oatmeal" does not. */
export function clientTermsIn(text: string): string[] {
  return MATCHERS.filter(([, re]) => re.test(text)).map(([term]) => term);
}
