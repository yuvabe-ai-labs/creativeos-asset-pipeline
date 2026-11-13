"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, MessageSquare, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { CommentList } from "@/components/client-review/comment-list";
import { clientReviewKeys, useNodeClientReview, useUpdateReviewVersion } from "@/hooks/queries/client-reviews";
import type { NodeClientReview } from "@/lib/client-review/wire";
import { ClientReviewEmptyStage } from "./client-review-empty-stage";
import { ClientReviewLinkActions } from "./client-review-link-actions";
import { ClientReviewStage } from "./client-review-stage";
import { ClientReviewUploadDialog } from "./client-review-upload-dialog";
import { ClientReviewVersionColumn } from "./client-review-version-column";
import { EditableField } from "./editable-field";
import { LeftSection } from "./focus-left-section";

// A column's placeholder before the first cut: what will show up there.
const NOTE = "rounded-lg border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-muted-foreground";

// D498 — the Client review node's focus view (replaces the D309 drawer). Header: the viewed
// version's title, its link (copy / open as client) and Upload first / new version. Left: the
// versions. Centre: the video and its Allow download switch. Right: that version's comments; a
// timecode seeks the video. Each column scrolls on its own.
export function ClientReviewFocusView({
  open,
  onOpenChange,
  nodeId,
  title: nodeTitle,
  onCommitTitle,
  viewedVersionNo,
  onViewVersion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  onCommitTitle: (title: string) => void;
  /** The version on screen, null for the newest. Held by the node, so the Client feedback chip
   *  can open a given version (D500). */
  viewedVersionNo: number | null;
  onViewVersion: (versionNo: number | null) => void;
}) {
  const editable = useCanvasEditable();
  const queryClient = useQueryClient();
  const { data, isPending: loading, isError, refetch } = useNodeClientReview(nodeId);
  const updateVersion = useUpdateReviewVersion(nodeId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Fresh comments whenever the view opens (spec §5), and the header chip's canvas total with
  // them, so the two never disagree.
  useEffect(() => {
    if (!open) return;
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["client-review", "canvas"] });
  }, [open, refetch, queryClient]);

  const review = data?.review ?? null;
  const versions = review?.versions ?? [];
  const comments = data?.comments ?? [];
  // The row picked, else the newest version.
  const version = versions.find((v) => v.versionNo === viewedVersionNo) ?? versions[0] ?? null;
  const versionComments = version ? comments.filter((c) => c.versionId === version.id) : [];
  const nextVersionNo = (versions[0]?.versionNo ?? 0) + 1;
  // Each version carries its own name (its file's); the header follows the version on screen.
  const title = version?.title || nodeTitle;

  function seek(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.pause();
  }

  function handleUploaded(next: NodeClientReview, versionNo: number) {
    queryClient.setQueryData(clientReviewKeys.node(nodeId), next);
    void queryClient.invalidateQueries({ queryKey: ["client-review", "canvas"] });
    onViewVersion(versionNo);
  }

  function patchVersion(patch: { allowDownload?: boolean; title?: string }) {
    if (!version) return;
    updateVersion.mutate(
      { versionNo: version.versionNo, patch },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the version.") },
    );
  }

  // Renaming renames the version on screen; the node card shows the newest version's name, so
  // renaming the newest renames the node too. Before any cut, it renames the node.
  function commitTitle(next: string) {
    if (!version) return onCommitTitle(next);
    if (!next.trim()) return;
    patchVersion({ title: next });
    if (version.id === versions[0]?.id) onCommitTitle(next);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-eyebrow text-client-text">Client review</p>
                <SheetTitle className="mt-1 p-0 font-display text-3xl font-semibold tracking-tight">
                  {/* Keyed by version, so switching versions shows that version's name at once. */}
                  <EditableField
                    key={version?.id ?? "node"}
                    value={title}
                    onCommit={commitTitle}
                    placeholder="Untitled cut"
                    className="font-display text-3xl font-semibold tracking-tight"
                  />
                </SheetTitle>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {version && review && (
                  <ClientReviewLinkActions
                    shareToken={review.shareToken}
                    version={version}
                    title={title}
                    editable={editable}
                    savingDownload={updateVersion.isPending}
                    onAllowDownloadChange={(allowDownload) => patchVersion({ allowDownload })}
                  />
                )}
                {editable && data && (
                  <Button size="lg" onClick={() => setUploadOpen(true)}>
                    <Upload className="size-4" strokeWidth={1.5} />
                    {versions.length ? "Upload new version" : "Upload first version"}
                  </Button>
                )}
              </div>
            </header>
          </div>
        </div>

        {/* Three columns at every stage, coloured as the Image Gen focus view: the versions rail on
            the page background, the stage raised and white between faint purple rules, the
            comments faintly sunk. One row the height of the view, so each column scrolls inside
            itself. Empty columns say what will appear. */}
        <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
          <div className="mx-auto grid h-full w-full max-w-7xl lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)]">
            <nav aria-label="Versions" className="min-h-0 border-border px-6 py-6 lg:overflow-y-auto lg:border-r lg:pl-6 lg:pr-4">
              <LeftSection icon={History} label="Versions" badge={String(versions.length)}>
                {version ? (
                  <ClientReviewVersionColumn
                    versions={versions}
                    comments={comments}
                    viewedId={version.id}
                    onView={(id) => onViewVersion(versions.find((v) => v.id === id)?.versionNo ?? null)}
                  />
                ) : (
                  <p className={NOTE}>Each cut you upload shows here as v1, v2, v3, each with its own link.</p>
                )}
              </LeftSection>
            </nav>
            <main className="min-h-0 border-primary/25 bg-card px-6 py-6 panel-raised lg:overflow-y-auto lg:border-x lg:px-10">
              {version ? (
                <ClientReviewStage version={version} videoRef={videoRef} />
              ) : loading ? (
                <p className="py-20 text-center text-sm text-muted-foreground">Loading…</p>
              ) : isError && !data ? (
                <div className="flex flex-col items-center gap-2 py-20">
                  <p className="text-sm text-muted-foreground">Couldn&apos;t load the review.</p>
                  <Button variant="ghost" onClick={() => void refetch()}>Retry</Button>
                </div>
              ) : (
                <ClientReviewEmptyStage editable={editable} onUpload={() => setUploadOpen(true)} />
              )}
            </main>
            <aside className="min-h-0 bg-muted/20 px-6 py-6 lg:overflow-y-auto">
              <LeftSection
                icon={MessageSquare}
                label={version ? `Comments on v${version.versionNo}` : "Comments"}
                badge={version ? String(versionComments.length) : undefined}
              >
                {version ? (
                  <CommentList comments={versionComments} onSeek={seek} />
                ) : (
                  <p className={`${NOTE} text-center`}>
                    The client&apos;s comments show here, for the version they were written on.
                  </p>
                )}
              </LeftSection>
            </aside>
          </div>
        </div>

        <ClientReviewUploadDialog
          nodeId={nodeId}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          nextVersionNo={nextVersionNo}
          onUploaded={handleUploaded}
        />
      </SheetContent>
    </Sheet>
  );
}
