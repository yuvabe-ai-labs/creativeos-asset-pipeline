import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MAX_PASTE_CHARS } from "@/lib/scripts/copilot/constants";
import { CopilotComposer } from "../copilot-composer";

const html = (text: string) => renderToStaticMarkup(<CopilotComposer busy={false} text={text} onTextChange={() => {}} onSend={() => {}} />);
// The class list holds "disabled:" variants, so look for the attribute itself.
const sendDisabled = (out: string) => /\sdisabled(=|\s|>)/.test(out.match(/<button[^>]*aria-label="Send"[^>]*>/)?.[0] ?? "");

describe("the message box", () => {
  it("sends and shows the usual hint within the paste limit", () => {
    const out = html("a".repeat(MAX_PASTE_CHARS));
    expect(out).toContain("Enter to send · Shift+Enter for a new line");
    expect(sendDisabled(out)).toBe(false);
    expect(out).not.toContain("maxLength");
    expect(out).not.toContain("maxlength");
  });
  it("past the paste limit says so, and cannot be sent (M3)", () => {
    const out = html("a".repeat(MAX_PASTE_CHARS + 1));
    expect(out).toContain("Over 30,000 characters: too long for one message.");
    expect(out).not.toContain("Enter to send");
    expect(sendDisabled(out)).toBe(true);
  });
});
