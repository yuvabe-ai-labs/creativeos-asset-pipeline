import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { fieldLabel, parseFieldPath, readField, writeField } from "../fields";
import { EMPTY_NOTES } from "../schema";

const doc = scriptDocSchema.parse(reel01);
const notes = { brief: "Brief", confirmations: [{ id: "c1", text: "Sun 11 Oct is day one", confirmed: false }] };
const write = (path: string, value: string, d = doc) => writeField(d, notes, parseFieldPath(path)!, value);

describe("parseFieldPath", () => {
  it("reads every kind of path", () => {
    expect(parseFieldPath("header.title")).toEqual({ kind: "header", field: "title" });
    expect(parseFieldPath("header.reelNumber")).toEqual({ kind: "reelNumber" });
    expect(parseFieldPath("context.watchOuts.2")).toEqual({ kind: "watchOut", index: 2 });
    expect(parseFieldPath("cast.meenakshi.description")).toEqual({ kind: "cast", castId: "meenakshi", field: "description" });
    expect(parseFieldPath("shots.s03.lengthSeconds")).toEqual({ kind: "shot", shotId: "s03", field: "lengthSeconds" });
    expect(parseFieldPath("notes.brief")).toEqual({ kind: "notes" });
    expect(parseFieldPath("notes.confirm.c1")).toEqual({ kind: "confirm", itemId: "c1" });
  });

  it("rejects anything else", () => {
    for (const p of ["", "header", "header.id", "shots.s03", "shots.s03.id", "shots.s03.onScreen", "cast.x.isLead", "context.watchOuts.x", "doc.title"]) {
      expect(parseFieldPath(p)).toBeNull();
    }
  });
});

describe("readField / writeField", () => {
  it("reads and writes a shot field by id, leaving every other shot untouched", () => {
    expect(readField(doc, notes, parseFieldPath("shots.s03.vo")!)).toBe(doc.shots[2].vo);
    const out = write("shots.s03.vo", "  New line.  ");
    if ("error" in out) throw new Error(out.error);
    expect(out.doc!.shots[2].vo).toBe("New line.");
    expect(out.doc!.shots.filter((_, i) => i !== 2)).toEqual(doc.shots.filter((_, i) => i !== 2));
    expect(out.doc!.shots[2].id).toBe("s03");
  });

  it("parses a length in seconds, accepting a trailing s, and refuses nonsense", () => {
    const out = write("shots.s01.lengthSeconds", "3.5s");
    expect("doc" in out && out.doc!.shots[0].lengthSeconds).toBe(3.5);
    expect(write("shots.s01.lengthSeconds", "zero")).toEqual({ error: "A shot's length is a number of seconds, from 0.1 to 60." });
    expect(write("shots.s01.lengthSeconds", "0")).toHaveProperty("error");
    expect(write("shots.s01.lengthSeconds", "61")).toHaveProperty("error");
  });

  it("sets and clears the reel number", () => {
    const set = write("header.reelNumber", "4");
    expect("doc" in set && set.doc!.header.reelNumber).toBe(4);
    const cleared = write("header.reelNumber", " ");
    expect("doc" in cleared && cleared.doc!.header.reelNumber).toBeNull();
    expect(write("header.reelNumber", "four")).toEqual({ error: "The reel number is a whole number." });
  });

  it("removes a watch-out typed empty, appends one typed at the end, and refuses an index past it", () => {
    const out = write("context.watchOuts.0", "");
    expect("doc" in out && out.doc!.context.watchOuts).toEqual(doc.context.watchOuts.slice(1));
    const n = doc.context.watchOuts.length;
    const added = write(`context.watchOuts.${n}`, "New watch-out.");
    expect("doc" in added && added.doc!.context.watchOuts).toEqual([...doc.context.watchOuts, "New watch-out."]);
    const empty = write(`context.watchOuts.${n}`, " ");
    expect("doc" in empty && empty.doc!.context.watchOuts).toEqual(doc.context.watchOuts);
    expect(write("context.watchOuts.9", "x")).toEqual({ error: "That watch-out is gone." });
  });

  it("refuses a title typed empty, an unknown shot, and any script field before the draft", () => {
    expect(write("header.title", "  ")).toHaveProperty("error");
    expect(write("shots.nope.vo", "x")).toEqual({ error: "That shot is gone." });
    expect(writeField(null, EMPTY_NOTES, parseFieldPath("header.title")!, "x")).toEqual({ error: "There's no draft yet." });
  });

  it("writes the notes and confirms an item, with or without a draft", () => {
    const brief = writeField(null, notes, parseFieldPath("notes.brief")!, "New brief");
    expect("notes" in brief && brief.notes.brief).toBe("New brief");
    const confirm = writeField(null, notes, parseFieldPath("notes.confirm.c1")!, "yes");
    expect("notes" in confirm && confirm.notes.confirmations[0].confirmed).toBe(true);
    expect(writeField(null, notes, parseFieldPath("notes.confirm.c9")!, "yes")).toEqual({ error: "That item is gone." });
  });
});

describe("fieldLabel", () => {
  it("names the part in the person's words", () => {
    expect(fieldLabel(doc, parseFieldPath("shots.s03.vo")!)).toBe("S3 VO");
    expect(fieldLabel(doc, parseFieldPath("context.settingAndCamera")!)).toBe("Setting and camera");
    expect(fieldLabel(doc, parseFieldPath("cast.meenakshi.description")!)).toBe("Meenakshi's description");
    expect(fieldLabel(doc, parseFieldPath("notes.brief")!)).toBe("the reel's notes");
  });
});
