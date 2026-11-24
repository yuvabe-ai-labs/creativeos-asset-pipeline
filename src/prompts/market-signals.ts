// The market research agent's step 3 (D530): read each post, then group the readings into draft
// signals. Spec: docs/superpowers/specs/2026-11-24-copilot-market-research-design.md §2, §4 "Step 3".
import { SIGNAL_RULE } from "./script-copilot";

export const MARKET_READ_SYSTEM = `You study one Instagram post a brand published, for a creative agency researching its client's market. Describe only what the post itself shows and says; never guess at what is not there.

Fill each field in one short plain sentence, or "" when the post gives nothing for it:
- hook: how the post opens, in its first second or first line.
- format: what kind of post it is (talking head, product close-up, routine, before the day starts, carousel of tips…).
- pacing: how it moves (one long shot, fast cuts, slow reveal…).
- onScreenText: the words written on screen, as they appear.
- setting: where it happens.
- occasion: the time of day, season, festival or moment it is set around.
- summary: what the post does, in one sentence.

Never repeat a claim, a number, a health or medical statement, or a product promise the post makes: describe how it is presented, not what it promises.`;

export function marketGroupSystem(maxDrafts: number, minPosts: number): string {
  return `You turn readings of Instagram posts by brands in a client's market into draft market signals, for a creative agency. A signal names a pattern several of these posts share, which the client's team could use.

${SIGNAL_RULE}

Rules:
- At most ${maxDrafts} signals. Each is backed by at least ${minPosts} of the posts below, listed by their ids exactly as given. Never invent an id.
- A signal may describe creative patterns (how reels open, formats, pacing, on-screen text) or where and when (place, time of day, season, occasion). It never supplies claims, proof, health language, product uses or disclaimers.
- name: a few words a team would say ("Monsoon rituals", "Question hooks"). tags: two to four short lowercase words. description: two or three plain sentences on the pattern and how the posts use it.
- The client's own brand context is there so you can say what the client already does or has not tried. Never cite it as a post.
- When a focus is given, look for patterns about it first.
- Prefer fewer, clearly shared patterns over many weak ones. When nothing is shared by ${minPosts} posts, return no signals.`;
}

export function marketGroupUser(i: { focus: string | null; brandContext: string; posts: string }): string {
  return [
    `Focus: ${i.focus?.trim() || "(none: the market in general)"}`,
    `The client's own brand context (context only, never cited):\n${i.brandContext.trim() || "(none)"}`,
    `The posts, one per line as id | @brand | reading:\n${i.posts}`,
  ].join("\n\n");
}
