import { describe, it, expect } from "vitest";
import { printScript } from "../print";
import { scriptDocSchema, type ScriptDoc } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const doc = scriptDocSchema.parse(reel01);
const tableRows = (text: string) =>
  text.split("\n").filter((l) => l.startsWith("| **") && !l.startsWith("| **Beat"));

describe("printScript", () => {
  const text = printScript(doc);

  it("opens with the reel's title line and header row", () => {
    expect(text.startsWith("**Reel 01  Golu starts today**\n")).toBe(true);
    expect(text).toContain(
      "| UGC | South   ·   Sun 11 Oct (first day of Navratri)   ·   Navratri / Golu   ·   9:16, 45 to 55 sec   ·   AI-generated |",
    );
  });

  it("prints the three sections the outlines use, with the cast as Character", () => {
    expect(text).toContain("**Purpose.**  Open the series on the first morning of Golu");
    expect(text).toContain(
      "**Character.**  Meenakshi, 54, Chennai. Cotton saree in the kitchen, silk with a zari border for guests. Glass bangles, kumkum pottu, reading glasses on a chain. Easy, amused English with a Tamil lilt. Her husband, 58, in a veshti.",
    );
    expect(text).toContain("**Setting and camera.**  Chennai flat with a Golu");
  });

  it("prints the outlines' table header and one row per shot", () => {
    expect(text).toContain("| Beat | Visual | VO | On-screen text |\n| :---- | :---- | :---- | :---- |");
    const rows = tableRows(text);
    expect(rows).toHaveLength(14);
    expect(rows[0]).toBe("| **HOOK 0-3s** | First morning of Golu. Early light in the hall. Meenakshi straightens the last doll on the steps. | Golu starts today. | **Golu starts today.** |");
    expect(rows[8]).toContain("| **BODY 33-35.5s** |");
  });

  it("leaves an empty on-screen text cell empty, not bold markers", () => {
    const blank: ScriptDoc = structuredClone(doc);
    blank.shots[1] = { ...blank.shots[1], onScreenText: "" };
    expect(tableRows(printScript(blank))[1].endsWith("| Nine nights of guests, and the kitchen doesn't close. |  |")).toBe(true);
  });

  it("carries a beat's card onto both of its split shots", () => {
    const rows = tableRows(text);
    expect(rows[0].endsWith("| **Golu starts today.** |")).toBe(true);
    expect(rows[1].endsWith("| **Golu starts today.** |")).toBe(true);
  });

  it("prints disclaimers and watch-outs after the table", () => {
    const table = text.indexOf("| Beat |");
    expect(text.indexOf("**Disclaimers.**  D3 applies")).toBeGreaterThan(table);
    expect(text).toContain("**Watch-outs**\n\n* Post Sun 11 Oct");
    expect(text).toContain("* Sundal on the Golu tray, no mithai.");
  });

  it("keeps four cells when text holds a pipe or a line break", () => {
    const tricky: ScriptDoc = structuredClone(doc);
    tricky.shots[0] = { ...tricky.shots[0], visual: "Left | right\nnext line", vo: "A | B" };
    const row = tableRows(printScript(tricky))[0];
    expect(row).toBe("| **HOOK 0-3s** | Left \\| right next line | A \\| B | **Golu starts today.** |");
    expect(row.split(/(?<!\\)\|/).length).toBe(6); // 4 cells between 5 pipes
  });

  it("omits empty sections and a missing reel number", () => {
    const bare: ScriptDoc = structuredClone(doc);
    bare.header = { ...bare.header, reelNumber: null };
    bare.context = { ...bare.context, disclaimers: "", watchOuts: [] };
    const out = printScript(bare);
    expect(out.startsWith("**Golu starts today**\n")).toBe(true);
    expect(out).not.toContain("**Disclaimers.**");
    expect(out).not.toContain("**Watch-outs**");
  });

  it("prints a cast member with no description by name", () => {
    const named: ScriptDoc = structuredClone(doc);
    named.cast[1] = { ...named.cast[1], description: "" };
    expect(printScript(named)).toContain("a Tamil lilt. Meenakshi's husband.");
  });
});
