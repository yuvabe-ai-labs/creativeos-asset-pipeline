// How a copilot message reads in the chat. Messages are stored as plain text, so the question the
// copilot asks is found here: a paragraph whose FIRST sentence ends in "?" (the fixed questions in
// brief.ts all do). A reply that only ends on a question ("…Want it warmer?") stays plain text.

export type MessageParagraph =
  | { kind: "text"; text: string }
  | { kind: "question"; question: string; hint: string };

const QUESTION_FIRST = /^([^.!?]+\?)\s*([\s\S]*)$/;

export function messageParagraphs(content: string): MessageParagraph[] {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text): MessageParagraph => {
      const m = QUESTION_FIRST.exec(text);
      return m ? { kind: "question", question: m[1].trim(), hint: m[2].trim() } : { kind: "text", text };
    });
}

/** A message long enough to show clipped (a pasted script): the message box and the sent bubble
 *  show its first few lines, fading out, never the whole script (paste-a-script spec §3). */
export function isLongText(text: string): boolean {
  return text.length > 600 || text.split("\n").length > 6;
}
