import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// D537 — a caller that does not name whom a free feature's Gemini call is for records nothing,
// so every production call of these functions must pass `recordFor`. The modules that define and
// forward them are left out; everything else under src/ and trigger/ is checked.
const CALLS = [
  "structuredCaller", "streamingCaller", "generateStructured", "readImageCard", "briefFront",
  "runKBExtraction", "researchBrandWebsite", "extractKB", "researchWebsite",
];
const DEFINERS = new Set([
  "src/lib/scripts/copilot/model.ts",
  "src/lib/image-analysis/gemini.ts",
  "src/lib/kb/providers/interface.ts",
  "src/lib/kb/providers/gemini.ts",
  "src/lib/kb/providers/openai.ts",
]);
const root = path.resolve(__dirname, "../../../..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Each call's argument text, from its opening parenthesis to the matching close. */
function callArgs(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(String.raw`(?<![\w$])${name}\(`, "g");
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (/(function|async)\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
    let depth = 0;
    let i = m.index + name.length;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    out.push(src.slice(m.index + name.length + 1, i));
  }
  return out;
}

describe("every production caller names whom the cost is recorded for", () => {
  const files = [...sources(path.join(root, "src")), ...sources(path.join(root, "trigger"))]
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .filter((f) => !DEFINERS.has(f));

  it.each(CALLS)("%s", (name) => {
    const calls = files.flatMap((f) => callArgs(readFileSync(path.join(root, f), "utf8"), name).map((args) => ({ f, args })));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => !c.args.includes("recordFor")).map((c) => `${c.f}: ${name}(${c.args.slice(0, 60)}`)).toEqual([]);
  });

  it("the KB build is started with the org it is for", () => {
    const [args] = callArgs(readFileSync(path.join(root, "src/lib/actions/kb.ts"), "utf8"), "trigger");
    expect(args).toContain('"kb-build"');
    expect(args).toContain("orgId");
  });
});
