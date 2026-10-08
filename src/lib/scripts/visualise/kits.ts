import type { ScriptDoc, Shot } from "@/lib/scripts/schema";

// D342 — the regional kit a panel is drawn with. The dry run's "South Indian kitchen" came out
// European until the kit was named (parent spec §11.1). The house rules live in the brand KB as
// pasted text for the demo (spec 2 §4.1), so the kits are read from that text until the KB has
// fields for them; matching is by the place and language names a script actually uses.

export type RegionalKit = { region: string; table: string; kitchen: string; wardrobe: string };

const clean = (cell: string) => cell.replace(/\*\*/g, "").replace(/\\/g, "").trim();

function cells(line: string): string[] | null {
  const t = line.trim();
  if (t.startsWith("|")) return t.replace(/^\|/, "").replace(/\|$/, "").split("|").map(clean);
  if (t.includes("\t")) return t.split("\t").map(clean);
  return null;
}

/** The rows of the table under the first "Regional kits" heading, as a markdown table or as
 *  tab-separated rows copied from the document. Everything else in the text is ignored. */
export function parseRegionalKits(text: string): RegionalKit[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /regional kits/i.test(l));
  if (start < 0) return [];
  const kits: RegionalKit[] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    const row = cells(line);
    if (!row || row.length < 4) {
      if (inTable) break; // the table has ended
      continue; // blank lines or a sentence between the heading and the table
    }
    inTable = true;
    const [region, table, kitchen, wardrobe] = row;
    if (/^:?-+:?$/.test(region)) continue; // the markdown separator row
    if (region.toLowerCase() === "region") continue; // the header row
    if (region) kits.push({ region, table, kitchen, wardrobe });
  }
  return kits;
}

/** Every non-empty string in a value, depth first: the KB's text, wherever it was pasted. */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

// Names that point to a kit's region when the script does not name the region itself (Reel 01
// says "Chennai" and "Tamil lilt", never "Tamil Nadu"). Keyed by the kit table's region names.
export const KIT_PLACE_HINTS: Record<string, string[]> = {
  "Tamil Nadu": ["Chennai", "Madurai", "Coimbatore", "Tamil"],
  Kerala: ["Kochi", "Thiruvananthapuram", "Kozhikode", "Malayalam", "Malayali"],
  "Karnataka and Telangana": ["Bengaluru", "Bangalore", "Mysuru", "Hyderabad", "Kannada", "Telugu"],
  "Delhi and Lucknow": ["Delhi", "Lucknow"],
  Punjab: ["Chandigarh", "Amritsar", "Ludhiana", "Punjabi"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Marathi"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Gujarati"],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function namesFor(kit: RegionalKit): string[] {
  const parts = kit.region.split(/\s+and\s+|\s*[,/]\s*/i).map((s) => s.trim()).filter(Boolean);
  return [...new Set([kit.region, ...parts, ...(KIT_PLACE_HINTS[kit.region] ?? [])])];
}

function best(kits: RegionalKit[], text: string): RegionalKit | null {
  let top: RegionalKit | null = null;
  let topScore = 0;
  for (const kit of kits) {
    const score = namesFor(kit).filter((n) => new RegExp(`\\b${escape(n)}\\b`, "i").test(text)).length;
    if (score > topScore) {
      top = kit;
      topScore = score;
    }
  }
  return top;
}

/** The kit for one shot: what the shot and its on-screen people name first (a reel can cross
 *  regions), then the script as a whole. Null when nothing points to a kit. */
export function pickKit(kits: RegionalKit[], doc: ScriptDoc, shot: Shot): RegionalKit | null {
  if (kits.length === 0) return null;
  const onScreen = doc.cast.filter((c) => shot.onScreen.includes(c.id));
  const shotText = [shot.visual, ...onScreen.map((c) => c.description)].join("\n");
  const scriptText = [doc.header.region, doc.context.settingAndCamera, ...doc.cast.map((c) => c.description)].join("\n");
  return best(kits, shotText) ?? best(kits, scriptText);
}
