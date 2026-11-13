import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isAction } from "./model";

// D496/D504: every API handler names its action through a chokepoint or withAccess, or is on this
// list with a reason. Extend the list only with a one-line reason.
const ALLOWLIST: Record<string, string> = {
  "admin/orgs/[id]/generations": "super admin (requireSuperAdmin)",
  "admin/orgs/[id]/impersonation-sessions": "super admin (requireSuperAdmin)",
  "image-proxy": "signed in; proxies a public image URL, no agency data",
  me: "signed in; the caller's own identity and access",
  "r/[token]": "share token, no account (withShareToken)",
  "r/[token]/comments": "share token, no account (withShareToken)",
  "r/[token]/comments/[commentId]": "share token, no account (withShareToken)",
  "r/[token]/download": "share token, no account (withShareToken)",
  "r/s/[token]": "share token, no account (withScriptShareToken)",
  "r/s/[token]/approve": "share token, no account (withScriptShareToken)",
  "r/s/[token]/comments": "share token, no account (withScriptShareToken)",
  "r/s/[token]/comments/[commentId]": "share token, no account (withScriptShareToken)",
  "webhooks/generation": "shared secret (isAuthorizedWebhook)",
  "webhooks/kb-build": "shared secret (isAuthorizedWebhook)",
};

const API_ROOT = join(process.cwd(), "src/app/api");
const HANDLER_RE = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const GUARDED_RE = /\b(withClient|withCanvas|withNode|withMoodboard|withAccess)\s*\([^]*?need:\s*"([a-z_.]+)"/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === "route.ts" ? [p] : [];
  });
}

function routeKey(file: string): string {
  return relative(API_ROOT, file).split(sep).join("/").replace(/\/route\.ts$/, "").replace(/^route\.ts$/, "");
}

describe("every API handler declares an action (D496, D504)", () => {
  const files = routeFiles(API_ROOT);

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThanOrEqual(150);
  });

  for (const file of files) {
    const key = routeKey(file);
    if (ALLOWLIST[key]) continue;
    const src = readFileSync(file, "utf8");
    const starts = [...src.matchAll(HANDLER_RE)].map((m) => ({ method: m[1], index: m.index! }));
    for (let i = 0; i < starts.length; i++) {
      const { method, index } = starts[i];
      const seg = src.slice(index, i + 1 < starts.length ? starts[i + 1].index : src.length);
      it(`${method} /api/${key}`, () => {
        const m = seg.match(GUARDED_RE);
        expect(m, "calls a chokepoint or withAccess with { need }").not.toBeNull();
        expect(isAction(m![2]), `"${m![2]}" is one of the ten actions`).toBe(true);
      });
    }
  }

  it("allowlist entries all exist", () => {
    const keys = new Set(files.map(routeKey));
    for (const k of Object.keys(ALLOWLIST)) expect(keys.has(k), k).toBe(true);
  });
});
