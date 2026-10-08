// src/components/script-review/script-review-page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { NameGate } from "@/components/client-review/name-gate";
import { ScriptView } from "@/components/scripts/script-view";
import type { ScriptViewSlots } from "@/components/scripts/script-view-slots";
import { useIsServerOrHydrating } from "@/hooks/use-is-server-or-hydrating";
import { useReviewColumn } from "@/hooks/use-review-column";
import { useApproveScript, useEditScriptComment, usePostScriptComment, usePublicScriptReview } from "@/hooks/queries/script-review";
import {
  PREPAINT_SCRIPT, browserStore, clearReviewerName, readReviewerName, saveReviewerName,
} from "@/lib/client-review/reviewer-name";
import type { PublicScriptReview } from "@/lib/script-review/assemble";
import { scopeIncludes } from "@/lib/script-review/constants";
import { partKey, versionParts } from "@/lib/script-review/parts";
import { buildThreads, openThreads, placeThreads } from "@/lib/script-review/threads";
import { ActivityList } from "./activity-list";
import { ApproveReel } from "./approve-reel";
import { CastReviewSlot } from "./cast-review-slot";
import { CommentsColumn } from "./comments-column";
import { PartComments } from "./part-comments";
import { ReviewSurfaceProvider, type ReviewSurface } from "./review-surface-context";
import { ScopeNote } from "./scope-note";
import { ScriptReviewHeader } from "./script-review-header";
import { ShotReviewSlot } from "./shot-review-slot";

// D355: the client's page. Mobile-first like D309's: the name is asked once (the same stored name as
// the video review), then the shared version, read-only, with comments beside every part.
export function ScriptReviewPage({ token, initial }: { token: string; initial: PublicScriptReview }) {
  const { data: review } = usePublicScriptReview(token, initial);
  const post = usePostScriptComment(token);
  const edit = useEditScriptComment(token);
  const approve = useApproveScript(token);
  const [name, setName] = useState<string | null>(null);
  const serverPass = useIsServerOrHydrating();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration sync from localStorage, as D309's page
    setName(readReviewerName(browserStore()));
  }, []);

  const { version } = review;
  const threads = useMemo(() => buildThreads(review.comments), [review.comments]);
  const placed = useMemo(() => placeThreads(threads, version.doc, review.removedShots), [threads, version.doc, review.removedShots]);
  const commentable = useMemo(
    () => new Map(review.commentsOpen ? versionParts(version).map((p) => [partKey(p), p] as const) : []),
    [review.commentsOpen, version],
  );

  function typedName(): string {
    if (!name) throw new Error("Enter your name first.");
    return name;
  }

  const column = useReviewColumn();
  const surface: ReviewSurface = {
    ...column,
    mode: "client",
    doc: version.doc,
    placed,
    commentable,
    onPost: review.commentsOpen
      ? async (part, body) => {
          await post.mutateAsync({ authorName: typedName(), body, part, versionNumber: version.number });
        }
      : undefined,
    onEdit: review.commentsOpen
      ? async (commentId, body) => {
          await edit.mutateAsync({ commentId, editorName: typedName(), body });
        }
      : undefined,
  };

  const showAvatars = scopeIncludes(version.scope, "avatars");
  const showPanels = scopeIncludes(version.scope, "panels");
  const avatarFaces = Object.fromEntries(
    showAvatars ? Object.values(version.visuals.avatars).map((a) => [a.avatarId, a.views.front]) : [],
  );
  const slots: ScriptViewSlots = {
    context: <PartComments part={{ kind: "context" }} />,
    castMember: (m) => <CastReviewSlot member={m} avatar={showAvatars ? version.visuals.avatars[m.id] : undefined} />,
    shot: (s) => <ShotReviewSlot shot={s} panel={showPanels ? version.visuals.panels[s.id] : undefined} />,
  };
  const approveAction = review.canApprove ? (
    <ApproveReel
      openThreads={openThreads(threads)}
      onApprove={async () => {
        await approve.mutateAsync({ approverName: typedName(), versionNumber: version.number });
      }}
    />
  ) : null;

  return (
    <div data-reviewer={name ? "known" : "unknown"} suppressHydrationWarning className="group/review flex min-h-dvh flex-col">
      {serverPass && <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />}

      <div className="group-data-[reviewer=known]/review:hidden">
        <NameGate
          title={version.doc.header.title}
          blurb="Read the reel and leave comments for the team."
          onSubmit={(n) => setName(saveReviewerName(browserStore(), n))}
        />
      </div>

      <div className="hidden flex-1 flex-col gap-6 px-4 py-6 group-data-[reviewer=known]/review:flex lg:mx-auto lg:w-full lg:max-w-6xl lg:px-6">
        <ScriptReviewHeader
          review={review}
          name={name}
          onChangeName={() => {
            clearReviewerName(browserStore());
            setName(null);
          }}
          action={approveAction}
        />
        <ScopeNote scope={version.scope} />
        <ReviewSurfaceProvider value={surface}>
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
            <ScriptView
              script={{ doc: version.doc, stage: review.approval ? "approved" : "in_review" }}
              avatarFaces={avatarFaces}
              slots={slots}
            />
            <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto">
              <CommentsColumn />
              <ActivityList lines={review.activity} />
            </aside>
          </div>
        </ReviewSurfaceProvider>
      </div>
    </div>
  );
}
