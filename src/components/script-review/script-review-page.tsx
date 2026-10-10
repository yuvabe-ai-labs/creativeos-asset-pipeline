// src/components/script-review/script-review-page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { NameGate } from "@/components/client-review/name-gate";
import { useIsServerOrHydrating } from "@/hooks/use-is-server-or-hydrating";
import { useReviewColumn } from "@/hooks/use-review-column";
import { useApproveScript, useEditScriptComment, usePostScriptComment, usePublicScriptReview } from "@/hooks/queries/script-review";
import {
  PREPAINT_SCRIPT, browserStore, clearReviewerName, readReviewerName, saveReviewerName,
} from "@/lib/client-review/reviewer-name";
import type { PublicScriptReview } from "@/lib/script-review/assemble";
import { threadCount } from "@/lib/script-review/column";
import { partKey, versionParts } from "@/lib/script-review/parts";
import { buildThreads, openThreads, placeThreads } from "@/lib/script-review/threads";
import { ApproveReel } from "./approve-reel";
import { CommentsButton } from "./comments-button";
import { FrozenBoard } from "./frozen-board";
import { ReviewColumn } from "./review-column";
import { ReviewSurfaceProvider, type ReviewSurface } from "./review-surface-context";
import { ScopeNote } from "./scope-note";
import { ScriptReviewHeader } from "./script-review-header";

// D356, D358: the client's page. Mobile-first like D309's: the name is asked once (the same stored
// name as the video review), then the shared version, read-only, as the Visualise board, with every
// part's thread one tap away in the Comments column.
export function ScriptReviewPage({ token, initial }: { token: string; initial: PublicScriptReview }) {
  const { data: review } = usePublicScriptReview(token, initial);
  const post = usePostScriptComment(token);
  const edit = useEditScriptComment(token);
  const approve = useApproveScript(token);
  const column = useReviewColumn();
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

      <div className="hidden flex-1 flex-col gap-6 px-4 py-6 group-data-[reviewer=known]/review:flex lg:mx-auto lg:w-full lg:max-w-[96rem] lg:px-6">
        <ReviewSurfaceProvider value={surface}>
          <ScriptReviewHeader
            review={review}
            name={name}
            onChangeName={() => {
              clearReviewerName(browserStore());
              setName(null);
            }}
            action={
              <>
                {approveAction}
                <CommentsButton count={threadCount(placed)} />
              </>
            }
          />
          <ScopeNote scope={version.scope} />
          <FrozenBoard
            version={version}
            stage={review.approval ? "approved" : "in_review"}
            column={<ReviewColumn activity={review.activity} />}
          />
        </ReviewSurfaceProvider>
      </div>
    </div>
  );
}
