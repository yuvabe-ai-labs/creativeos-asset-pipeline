import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

// A loading.tsx wraps its own page AND every route below it (Next 16 loading.md: "wrap the page.js
// file and any children below in a <Suspense> boundary"). In dev, with no prefetch, a navigation
// shows each ancestor's fallback in turn, so a list page's skeleton sitting above other routes drew
// "Loading clients…" then "Loading canvases…" on the way to Scripts. A list page and its skeleton
// therefore live together in a route group, with nothing routed below them.

const APP = join(process.cwd(), "src/app");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(APP).map((f) => relative(APP, f).replace(/\\/g, "/"));

describe("loading boundaries", () => {
  it("no loading.tsx sits above another route's page", () => {
    const offenders = files
      .filter((f) => f.endsWith("loading.tsx"))
      .map((f) => f.slice(0, -"loading.tsx".length))
      .flatMap((dir) => {
        const below = files.filter((f) => f.startsWith(dir) && f.endsWith("page.tsx") && f.slice(dir.length).includes("/"));
        return below.length > 0 ? [`${dir || "(root)/"}loading.tsx wraps ${below.join(", ")}`] : [];
      });
    expect(offenders).toEqual([]);
  });

  it("the scripts library has its own skeleton", () => {
    expect(files.some((f) => /^clients\/\[id\]\/scripts\/(\([^)]+\)\/)?loading\.tsx$/.test(f))).toBe(true);
  });
});
