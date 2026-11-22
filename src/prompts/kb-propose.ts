// Copilot journey piece 2.3 (D517): reading new or remaining brand documents against the brand KB
// as it stands, for a change card. Only what changes comes back; nothing is rewritten.
import { kbExtractPrompt } from "./kb-extract";

export type ProposeFieldLine = { path: string; title: string; value: unknown };

const valueText = (value: unknown) =>
  value === null || value === undefined || (Array.isArray(value) && value.length === 0) ? "(empty)" : Array.isArray(value) ? value.join(", ") : String(value);

export function kbProposeSystem(input: { fields: ProposeFieldLine[]; added: string[]; removed: string[]; remaining?: string[] }): string {
  const lines = input.fields.map((f) => `${f.path} | ${f.title} | ${valueText(f.value).replace(/\s+/g, " ")}`).join("\n");
  const tasks = [
    ...(input.added.length > 0
      ? [`New documents were added: ${input.added.join(", ")}. Return each field whose value these documents state differently from the value above, with the new value and the file name of the document that states it. A list field's value is the whole new list: keep the items that still hold and add or remove what the document says.`]
      : []),
    ...(input.removed.length > 0
      ? [`These documents were removed: ${input.removed.join(", ")}. The documents given are the ones that remain: ${(input.remaining ?? []).join(", ")}. Return each field whose current value none of them supports any more: value null if nothing supports any value, or the value they do support with the file name of the document that states it, and document "" when the value is null.`]
      : []),
  ];
  return `You keep one brand's knowledge base current. A person has already reviewed it. You never rewrite it: you say which fields the documents change, and a person approves each one.

The brand KB now, one field per line, as path | name | value:
${lines}

${tasks.join("\n\n")}

Rules:
- Only what the documents state for this brand. Never infer, never guess, never reword a value that still holds.
- A field the documents agree with, or do not mention, is not returned.
- Use the paths exactly as listed. Never return any other path.
- "document" is the exact file name of the document the value comes from.
- Return an empty list when nothing changes.`;
}

export const kbProposePrompt = {
  id: "kb-propose",
  version: "1.0.0",
  model: kbExtractPrompt.model,
} as const;
