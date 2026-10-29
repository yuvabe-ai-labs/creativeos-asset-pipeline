import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import reel06 from "@/lib/scripts/fixtures/reel-06.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { IMPORT_REPLY_PREFIX } from "../constants";
import { avatarFits, cleanSuggestions, suggestionsFor } from "../suggestions";
import { clientTermsIn } from "../client-terms";
import { fillToFinal } from "../fill-to-final";
import { EMPTY_BRIEF, EMPTY_NOTES, type Angle, type Brief, type GenerateState } from "../schema";

const given = (value: string) => ({ value, status: "given" as const });
type Msg = GenerateState["messages"][number];
const msg = (role: "user" | "assistant", content: string, suggestions: string[] = []): Msg => ({ id: `m-${content}`, role, content, card: null, suggestions, createdAt: "t" });
const state = (over: { brief?: Brief; doc?: unknown; notes?: GenerateState["script"]["notes"]; stage?: "generate" | "visualise"; messages?: Msg[] } = {}): GenerateState => {
  const doc = over.doc ? scriptDocSchema.parse(over.doc) : null;
  const notes = over.notes ?? EMPTY_NOTES;
  return {
    script: { id: "s1", clientId: "c1", stage: over.stage ?? "generate", doc, brief: over.brief ?? EMPTY_BRIEF, notes, docVersion: 1, createdAt: "t", updatedAt: "t" },
    messages: over.messages ?? [], openItems: fillToFinal(doc, notes),
    avatars: [
      { id: "a1", name: "Meenakshi", story: "", front: null, specific: false },
      { id: "a2", name: "James", story: "", front: null, specific: false },
      { id: "a3", name: "James", story: "", front: null, specific: true },
    ],
    formats: ["UGC", "UGC review first", "Founder-led"],
  };
};
const labels = (s: GenerateState) => suggestionsFor(s).map((x) => x.label);
const angle = { id: "A", hook: "h", situation: "s", productMoment: "", supportingCast: "", reviewTheme: "", proof: "", format: "", occasion: "", postDate: "", lead: "", leadAvatarId: null, signalIds: [], fromSignals: "" } as Angle;

describe("suggestionsFor", () => {
  const withAngles = { ...EMPTY_BRIEF, format: given("UGC"), occasion: given("x"), lead: given("y"), angles: [angle] };
  const card = { title: "t", reelNumber: 4, lines: [], cast: [], beats: [], toConfirm: [] };

  it("offers the shared format menu and 'take it from here' when the copilot asks the format", () => {
    expect(labels(state())).toEqual(["UGC", "UGC review first", "Founder-led", "Take it from here"]);
    expect(suggestionsFor(state()).every((s) => s.send)).toBe(true);
  });

  it("offers the occasions the copilot suggested for this brand, then 'You pick'", () => {
    const asked = { ...EMPTY_BRIEF, format: given("UGC") };
    const reply = msg("assistant", "What's the occasion?", ["Diwali: a new home for the festival"]);
    expect(labels(state({ brief: asked, messages: [msg("user", "UGC"), reply] }))).toEqual(["Diwali: a new home for the festival", "You pick"]);
    expect(labels(state({ brief: asked }))).toEqual(["You pick"]);
  });

  it("offers the client's avatars as leads", () => {
    expect(labels(state({ brief: { ...EMPTY_BRIEF, format: given("UGC"), occasion: given("Onam") } }))).toEqual(["Meenakshi", "James · AI", "James · Specific", "Cast it for me"]);
  });

  it("puts Specific avatars first for a Founder-led reel, and each lead chip carries its avatar", () => {
    const s = suggestionsFor(state({ brief: { ...EMPTY_BRIEF, format: given("Founder-led"), occasion: given("Navratri") } }));
    expect(s.map((x) => x.label)).toEqual(["James · Specific", "Meenakshi", "James · AI", "Cast it for me"]);
    expect(s[0]).toEqual({ label: "James · Specific", text: "James", send: true, leadAvatarId: "a3" });
    expect(s[3].leadAvatarId).toBeUndefined();
  });

  it("offers the copilot's own replies while angles are showing, and Write it first on the card", () => {
    expect(labels(state({ brief: withAngles, messages: [msg("assistant", "Here are three angles.", ["Blend A and C"])] }))).toEqual(["Blend A and C"]);
    const confirm = { ...withAngles, narrative: given("A"), card, phase: "confirm" as const };
    expect(labels(state({ brief: confirm, messages: [msg("assistant", "Here's the brief.", ["Set it at the site office"])] }))).toEqual(["Write it", "Set it at the site office"]);
  });

  it("after the draft: fills the box for the real review, never sends review text, then the copilot's edits", () => {
    const s = suggestionsFor(state({ doc: reel01, messages: [msg("assistant", "The first draft is in.", ["Shorten the hook"])] }));
    expect(s[0]).toEqual({ label: "Paste the cleared review", text: "Here's the cleared review: \"", send: false });
    expect(s.slice(1).map((x) => x.label)).toEqual(["Shorten the hook"]);
  });

  it("offers to confirm an open item, and no fixed edits when the copilot suggested none", () => {
    const notes = { brief: "", confirmations: [{ id: "c1", text: "Sat 14 Nov is the launch", confirmed: false }] };
    expect(suggestionsFor(state({ doc: reel06, notes }))[0]).toEqual({ label: "Confirm: Sat 14 Nov is the launch", text: "Yes, confirmed: Sat 14 Nov is the launch", send: true });
    expect(labels(state({ doc: reel06 }))).toEqual([]);
  });

  it("keeps the copilot's edits after an inline edit, but not past the person's next message", () => {
    const edited = [msg("assistant", "Done.", ["Shorten the hook"]), msg("assistant", "Changed shot 2.")];
    expect(labels(state({ doc: reel06, messages: edited }))).toEqual(["Shorten the hook"]);
    expect(labels(state({ doc: reel06, messages: [...edited, msg("user", "thanks")] }))).toEqual([]);
  });

  it("never offers a fixed chip that names one client", () => {
    const states = [
      state(), state({ brief: { ...EMPTY_BRIEF, format: given("UGC") } }), state({ brief: withAngles }),
      state({ brief: { ...withAngles, narrative: given("A"), card, phase: "confirm" } }), state({ doc: reel01 }), state({ doc: reel06 }),
    ];
    expect(clientTermsIn(states.flatMap(labels).join("\n"))).toEqual([]);
  });

  it("offers nothing once the script has left Generate", () => {
    expect(suggestionsFor(state({ doc: reel06, stage: "visualise" }))).toEqual([]);
  });
});

describe("cleanSuggestions", () => {
  it("trims, drops empty, too long, repeated and already-offered chips, and keeps four", () => {
    expect(cleanSuggestions(["  A ", "a", "", "x".repeat(81), "B", "You pick", "C", "D", "E"], ["You pick"])).toEqual(["A", "B", "C", "D"]);
  });
});

describe("after an import (paste-a-script §4.3)", () => {
  const unlinked = { ...reel01, cast: reel01.cast.map((c) => ({ ...c, avatarId: null })) };
  const importReply = msg("assistant", `${IMPORT_REPLY_PREFIX}Reel 01 · 9 shots · 50s.`);
  const imported = () => ({ ...state({ brief: { ...EMPTY_BRIEF, phase: "written", imported: true }, doc: unlinked }), messages: [importReply] });

  it("offers the client's avatars for the lead, a fitting one first; a tap links, it never sends", () => {
    const base = imported();
    const [a1, a2, a3] = base.avatars;
    const s = { ...base, avatars: [a2, a3, a1] };
    const lead = s.script.doc!.cast.find((c) => c.isLead)!;
    const chips = suggestionsFor(s).filter((x) => x.link);
    expect(chips[0]).toEqual({ label: `${lead.name} as ${lead.name}`, text: "", send: false, link: { castId: lead.id, avatarId: "a1" } });
    expect(chips).toHaveLength(3);
  });

  it("asks nothing once everyone is linked, and nothing for a script the copilot wrote", () => {
    const linked = { ...reel01, cast: reel01.cast.map((c) => ({ ...c, avatarId: "6f1c2b1e-0000-4000-8000-0000000000aa" })) };
    expect(suggestionsFor({ ...state({ brief: { ...EMPTY_BRIEF, imported: true }, doc: linked }), messages: [importReply] }).some((x) => x.link)).toBe(false);
    expect(suggestionsFor({ ...state({ doc: unlinked }), messages: [importReply] }).some((x) => x.link)).toBe(false);
  });

  it("shows the link chips only while the import reply is the newest message (I3)", () => {
    const base = imported();
    expect(suggestionsFor(base).some((x) => x.link)).toBe(true);
    expect(suggestionsFor({ ...base, messages: [importReply, msg("user", "Make the hook punchier")] }).some((x) => x.link)).toBe(false);
    expect(suggestionsFor({ ...base, messages: [importReply, msg("assistant", "Done, the hook is punchier.")] }).some((x) => x.link)).toBe(false);
    expect(suggestionsFor({ ...base, messages: [] }).some((x) => x.link)).toBe(false);
  });
});

describe("avatarFits", () => {
  const rhea = { name: "Rhea", description: "27, Bengaluru, a product designer." };
  it("fits on a whole-word name match either way, case aside", () => {
    expect(avatarFits(rhea, { id: "a", name: "rhea", story: "", front: null, specific: false })).toBe(true);
    expect(avatarFits(rhea, { id: "a", name: "Priya", story: "Plays Rhea in the UGC reels", front: null, specific: false })).toBe(true);
    expect(avatarFits(rhea, { id: "a", name: "Rheana", story: "", front: null, specific: false })).toBe(false);
  });
});
