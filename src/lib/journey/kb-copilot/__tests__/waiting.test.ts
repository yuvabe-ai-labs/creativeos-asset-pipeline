import { describe, expect, it } from "vitest";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import type { KbContext } from "../context";
import { kbWaiting } from "../waiting";

const empty: KbContext = {
  clientName: "Acme", clientSlug: "acme", unreviewed: null, kbStatus: "pending", hasVersion: false, websiteUrl: null, instagram: null, facebook: null,
  documentCount: 0, imageCount: 0, job: null, importing: [], studyingImages: false, importFailed: [], studyFailed: false, importedBefore: [],
};
const ctx = (over: Partial<KbContext>): KbContext => ({ ...empty, ...over });
const inReview = (unreviewed: string[] | null) => ctx({ kbStatus: "in_review", hasVersion: true, unreviewed });
const msg = (over: Partial<ThreadMessage>): ThreadMessage =>
  ({ id: "m", role: "assistant", content: "x", card: null, attachments: [], suggestions: [], createdAt: "", ...over });
const q = (field: string) => msg({ card: { kind: "question", field, label: field } });

describe("kbWaiting", () => {
  it("is the gate card when a built KB has nothing left to review", () => {
    expect(kbWaiting(inReview([]), [])).toEqual({
      kind: "gate", label: "Approve the brand KB", title: "Approve the brand KB",
      opens: "Approving it opens market research.", why: "Only a person can approve it. I never do.", action: "approve-kb",
    });
  });

  it("names what is left, by tab, with a link to each", () => {
    expect(kbWaiting(inReview(["brand_profile.tagline", "compliance.disclaimers", "compliance.content_rules"]), [])).toEqual({
      kind: "task", label: "Review 3 fields", text: "3 fields are still to review on the right.",
      links: [
        { label: "Brand Voice · 1", href: "/clients/acme/kb?section=brand_voice" },
        { label: "Compliance Rules · 2", href: "/clients/acme/kb?section=compliance" },
      ],
    });
  });

  it("says one field in the singular", () => {
    expect(kbWaiting(inReview(["brand_profile.tagline"]), [])).toMatchObject({ label: "Review 1 field", text: "1 field is still to review on the right." });
  });

  it("waits for an answer while its question's field is still unreviewed, and stops once it was reviewed by hand", () => {
    expect(kbWaiting(inReview(["target_audience.age_range"]), [q("target_audience.age_range")])).toEqual({ kind: "reply", label: "Your answer" });
    expect(kbWaiting(inReview(["brand_profile.tagline"]), [q("target_audience.age_range")])?.kind).toBe("task");
  });

  it("still waits for the answer after a note about a save", () => {
    const thread = [q("target_audience.age_range"), msg({ card: { kind: "note" } })];
    expect(kbWaiting(inReview(["target_audience.age_range"]), thread)).toEqual({ kind: "reply", label: "Your answer" });
  });

  it("waits for a reply before a build when the copilot spoke last", () => {
    expect(kbWaiting(empty, [msg({})])).toEqual({ kind: "reply", label: "Your reply" });
    expect(kbWaiting(empty, [msg({ role: "user" })])).toBeNull();
  });

  it("waits for nothing during a build, on an approved KB, or when the count was not read", () => {
    expect(kbWaiting(ctx({ job: { status: "extracting", phaseMessage: null } }), [msg({})])).toBeNull();
    expect(kbWaiting(ctx({ kbStatus: "ready", hasVersion: true }), [msg({})])).toBeNull();
    expect(kbWaiting(inReview(null), [])).toBeNull();
  });
});
