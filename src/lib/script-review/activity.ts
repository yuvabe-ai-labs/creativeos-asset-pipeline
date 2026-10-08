// src/lib/script-review/activity.ts
import { SHARE_SCOPE_PHRASE } from "./constants";
import type { ActivityLine, ScriptComment, ScriptReviewEvent } from "./types";
import { describeChanges, joinWithAnd } from "./version";

const line = (e: ScriptReviewEvent, text: string): ActivityLine => ({ id: e.id, at: e.createdAt, text, links: [] });

/** Spec 4 §7: the review's history, oldest first. Every line comes from rows that are never edited
 *  or removed (events are append-only, comments are never deleted), so history never changes after
 *  the fact. The move into In review is recorded but not shown: §7's list does not include it. */
export function buildActivity(events: ScriptReviewEvent[], comments: ScriptComment[]): ActivityLine[] {
  const lines: ActivityLine[] = [];
  for (const e of events) {
    switch (e.kind) {
      case "moved_to_review":
        break;
      case "moved_back":
        lines.push(line(e, `Moved back to Visualise by ${e.actorName}`));
        break;
      case "reopened":
        lines.push(line(e, `Reopened by ${e.actorName}`));
        break;
      case "approved":
        lines.push(line(e, `Approved by ${e.actorName}`));
        break;
      case "shared": {
        const changed = describeChanges(e.changes);
        if (changed) {
          lines.push({
            id: `${e.id}:changes`,
            at: e.createdAt,
            text: changed,
            links: e.changes.filter((c) => c.change !== "removed").map((c) => ({ label: c.label, part: c.part })),
          });
        }
        const scope = e.scope ? ` · ${SHARE_SCOPE_PHRASE[e.scope]}` : "";
        lines.push(line(e, `${e.versionNumber === 1 ? "Shared" : "Shared again"}, version ${e.versionNumber}${scope}`));
        break;
      }
    }
  }

  // "n comments, by whom": the client's comments on each version, one line, at the last of them.
  const byVersion = new Map<number, ScriptComment[]>();
  for (const c of comments) {
    if (c.authorKind !== "client" || c.parentId !== null) continue;
    byVersion.set(c.versionNumber, [...(byVersion.get(c.versionNumber) ?? []), c]);
  }
  for (const [version, cs] of byVersion) {
    const sorted = [...cs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const names = [...new Set(sorted.map((c) => c.authorName))];
    lines.push({
      id: `comments:${version}`,
      at: sorted[sorted.length - 1].createdAt,
      text: `${sorted.length} ${sorted.length === 1 ? "comment" : "comments"}, by ${joinWithAnd(names)}`,
      links: [],
    });
  }
  // Stable sort: a share's "what changed" line stays just before its "Shared again" line.
  return lines.sort((a, b) => a.at.localeCompare(b.at));
}
