"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  RefreshCwIcon,
  CheckCircle2Icon,
  CheckIcon,
  ImageIcon,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TEMPORARY: Source files button commented out
  FolderPenIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getModuleStatus } from "@/components/kb/kb-module-card";
import { useImageAnalysisStatus } from "@/hooks/queries/image-analysis";
import { mergeImageAnalysis } from "@/lib/image-analysis/merge";
import { KBImageAnalysisStatus } from "@/components/kb/kb-image-analysis-status";
import { KBFieldCard } from "@/components/kb/kb-field-card";
import { KBSectionNav } from "@/components/kb/kb-section-nav";
import { CopilotTarget } from "@/components/journey/copilot-target";
import { useKbReviewFollow } from "@/hooks/use-kb-review-follow";
import { KBSourcePanel } from "@/components/kb/kb-source-panel";
import { computeReadyStatus } from "@/lib/kb/fill-rate";
import type { TraceableBrandKB, KBField } from "@/lib/kb/schema";
import { setNestedField } from "@/lib/kb/utils";
import { adoptServerKb, changedFields } from "@/lib/kb/review-sync";
import { usePatchKbFields } from "@/hooks/queries/kb";
import {
  markKBReadyAction,
  deleteKBDocumentAction,
  deleteBrandImageAction,
} from "@/lib/actions/kb";
import type { ClientKBDocumentRow, ClientBrandImageRow } from "@/lib/db/types";
import { uploadViaSignedUrl } from "@/lib/uploads/client";
import { kbService } from "@/services/kb.service";
import { useRefreshCopilotThread } from "@/hooks/queries/copilot-thread";
import type { ModuleKey, FieldPath, StagedChanges } from "@/lib/kb/types";
import {
  MODULES,
  FIELD_LABELS,
  COLOUR_FIELD_KEYS,
  DOC_EXTENSIONS,
  IMG_EXTENSIONS,
} from "@/lib/kb/constants";
import {
  getModuleFields,
  getFieldPath,
  buildChangeSummary,
  findNextModuleNeedingReview,
  layoutFieldCards,
} from "@/lib/kb/utils";

/** The header's quiet card-style button (Source files). */
/** Grid-column span on the 6-column card grid (wide screens; cards stack below `lg`). */
const CARD_SPAN = { 2: "lg:col-span-2", 3: "lg:col-span-3", 6: "lg:col-span-6" } as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- TEMPORARY: Source files button commented out
const HEADER_BUTTON =
  "h-auto gap-2 border-border bg-card px-3 py-2 text-muted-foreground shadow-card hover:bg-card hover:text-foreground dark:hover:bg-card";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  clientId: string;
  clientSlug: string;
  versionId: string;
  initialKB: TraceableBrandKB;
  /** Changes whenever the stored KB's document fields change (kbRevision): the copilot filled a
   *  field, or a teammate saved. The screen then takes the stored copy in beside its own draft. */
  kbRevision: string;
  isEditMode: boolean;
  initialDocuments?: ClientKBDocumentRow[];
  initialImages?: ClientBrandImageRow[];
  initialWebsiteUrl?: string | null;
  docIdsAtExtraction?: string[];
  clientName: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function KBOnboardingReviewStep({
  clientId,
  clientSlug,
  versionId,
  initialKB,
  kbRevision,
  isEditMode,
  initialDocuments = [],
  initialImages = [],
  initialWebsiteUrl = null,
  docIdsAtExtraction = [],
  clientName,
}: Props) {
  const router = useRouter();
  // The copilot beside the page shows what it is reading as soon as Save & re-analyze is pressed.
  const refreshCopilot = useRefreshCopilotThread(clientId);

  // KB review state — reset via key={versionId} at the call site (page.tsx).
  // `kb` is the working draft; `savedKB` is the last persisted baseline. Edits
  // buffer into the draft and commit together via Save (like ScriptFocusView),
  // instead of auto-saving every field change.
  const [kb, setKB] = useState<TraceableBrandKB>(initialKB);
  const [savedKB, setSavedKB] = useState<TraceableBrandKB>(initialKB);
  // Save sends only the fields the person changed (never the whole KB), and tells the copilot.
  const saveFields = usePatchKbFields(clientId);
  const saving = saveFields.isPending;
  // The copilot's "what is left" links open a tab by name (?section=compliance).
  const sectionParam = useSearchParams().get("section");
  const linkedModule = MODULES.find((m) => m.key === sectionParam)?.key ?? null;
  const [selectedModule, setSelectedModule] = useState<ModuleKey>(linkedModule ?? "brand_voice");
  const [seenLink, setSeenLink] = useState(linkedModule);
  if (seenLink !== linkedModule) {
    setSeenLink(linkedModule);
    if (linkedModule) setSelectedModule(linkedModule);
  }
  // The page follows the copilot (D520): to the field it asks about or writes, on its own tab.
  const follow = useKbReviewFollow(clientId, setSelectedModule);
  // The stored KB changed under the screen: take it into both copies, keeping what the person has
  // changed and not saved yet. Adjusting state during render, on a change of the prop. A field the
  // copilot just wrote replaces an unsaved edit of it, so Save never writes the old edit back (§3.2).
  const [seenRevision, setSeenRevision] = useState(kbRevision);
  if (seenRevision !== kbRevision) {
    setSeenRevision(kbRevision);
    const next = adoptServerKb(kb, savedKB, initialKB, follow.takeWritten());
    setKB(next.draft);
    setSavedKB(next.saved);
  }
  const [markingReady, setMarkingReady] = useState(false);

  // Document management state
  const [documents, setDocuments] = useState<ClientKBDocumentRow[]>(initialDocuments);
  const [images, setImages] = useState<ClientBrandImageRow[]>(initialImages);
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadingImgs, setUploadingImgs] = useState(false);

  // Staged changes
  const [pendingDocRemovals, setPendingDocRemovals] = useState<Set<string>>(new Set());
  const [pendingImageRemovals, setPendingImageRemovals] = useState<Set<string>>(new Set());
  const [newlyAddedDocIds, setNewlyAddedDocIds] = useState<Set<string>>(new Set());
  const [newlyAddedImageIds, setNewlyAddedImageIds] = useState<Set<string>>(new Set());
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [cancelingChanges, setCancelingChanges] = useState(false);

  // Image Analysis is written by a background run (D312). When the stored section changes, take
  // it into the saved baseline, and into the draft over any unsaved reviews (D318), so it shows
  // without a reload. Other unsaved edits are left as they are. Saving never puts back an older
  // section either: a save sends only the fields the person changed (changedFields).
  const { data: imageAnalysisState } = useImageAnalysisStatus(clientId);
  const storedImageAnalysis = imageAnalysisState?.versionId === versionId ? imageAnalysisState.imageAnalysis : null;
  const storedKey = storedImageAnalysis ? JSON.stringify(storedImageAnalysis) : null;
  const [appliedImageAnalysis, setAppliedImageAnalysis] = useState<string | null>(null);
  // Adjusting state while rendering, on a change of the stored section (react.dev, "You might not
  // need an effect"): the poll returns the same section every time, so this runs once per change.
  if (storedImageAnalysis && storedKey !== appliedImageAnalysis) {
    setAppliedImageAnalysis(storedKey);
    if (JSON.stringify(savedKB.image_analysis) !== storedKey) {
      setSavedKB((prev) => ({ ...prev, image_analysis: storedImageAnalysis }));
      setKB((prev) => ({ ...prev, image_analysis: mergeImageAnalysis(prev.image_analysis, storedImageAnalysis) }));
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isReady = computeReadyStatus(kb);
  // Field by field, not the two copies as text: they can hold the same fields in a different order.
  const dirty = changedFields(kb, savedKB).length > 0;

  const staged: StagedChanges = {
    pendingDocRemovals,
    pendingImageRemovals,
    newlyAddedDocIds,
    newlyAddedImageIds,
  };

  const hasPendingChanges =
    pendingDocRemovals.size > 0 ||
    pendingImageRemovals.size > 0 ||
    newlyAddedDocIds.size > 0 ||
    newlyAddedImageIds.size > 0;

  const committedDocIds = new Set(
    documents.filter((d) => !pendingDocRemovals.has(d.id)).map((d) => d.id),
  );
  const extractedDocIds = new Set(docIdsAtExtraction);
  const docsChangedFromBaseline =
    committedDocIds.size !== extractedDocIds.size ||
    [...committedDocIds].some((id) => !extractedDocIds.has(id)) ||
    [...extractedDocIds].some((id) => !committedDocIds.has(id));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TEMPORARY: Source files button commented out
  const showChangeIndicator = hasPendingChanges || docsChangedFromBaseline;

  const currentFields = getModuleFields(kb, selectedModule);
  const hasNeedsReview = Object.values(currentFields).some((f) => f.status === "needs_review");
  const needsReviewCount = Object.values(currentFields).filter((f) => f.status === "needs_review").length;
  const fieldCount = Object.keys(currentFields).length;
  const fieldCards = layoutFieldCards(currentFields, (key) => COLOUR_FIELD_KEYS.has(key));
  const moduleLabel = MODULES.find((m) => m.key === selectedModule)?.label;
  // The section on screen's own progress: its fields reviewed (approved, edited or rejected) of all.
  const reviewedCount = fieldCount - needsReviewCount;
  const allImageAnalysisNull =
    selectedModule === "image_analysis" &&
    Object.values(currentFields).every((f) => f.value === null);

  // Single footer action — Save while there are unsaved edits, otherwise Mark KB Ready (or
  // its edit-mode/in-flight variants). Referencing handleSave/handleMarkReady here is safe
  // even though they're declared later in this component: both are `function` declarations,
  // which are hoisted within the component's function body.
  type FooterAction = {
    label: string;
    disabled: boolean;
    onClick?: () => void;
    tooltip?: string;
  };
  const footerAction: FooterAction = dirty
    ? { label: saving ? "Saving…" : "Save changes", disabled: saving, onClick: handleSave }
    : isEditMode
      ? { label: "KB is Ready", disabled: true }
      : !isReady
        ? {
            label: "Mark KB Ready",
            disabled: true,
            tooltip: "Approve or reject every field first. Image Analysis can wait.",
          }
        : {
            label: markingReady ? "Saving…" : "Mark KB Ready",
            disabled: markingReady,
            onClick: handleMarkReady,
          };

  // ── Field helpers ─────────────────────────────────────────────────────────

  // Buffers a field change into the draft only. Persisted later by handleSave.
  function patchField(path: FieldPath, patch: Partial<KBField<unknown>>) {
    setKB((prev) =>
      setNestedField(
        prev as unknown as Record<string, unknown>,
        path,
        patch as Record<string, unknown>,
      ) as unknown as TraceableBrandKB,
    );
  }

  async function handleSave() {
    // What is sent is what becomes "saved": an edit made while the save is on its way stays unsaved.
    const sent = kb;
    const patches = changedFields(sent, savedKB);
    try {
      if (patches.length > 0) await saveFields.mutateAsync({ versionId, patches });
      setSavedKB(sent);
      toast.success("Changes saved");
    } catch (e) {
      // The route's own words: a rebuilt KB says to reload. The draft is kept.
      toast.error(e instanceof Error ? e.message : "Failed to save changes");
    }
  }

  /** Puts the draft back to what was last saved. */
  function handleDiscard() {
    setKB(savedKB);
  }

  function handleEdit(module: ModuleKey, fieldKey: string, newValue: string | string[]) {
    patchField(getFieldPath(module, fieldKey), { value: newValue, status: "edited" });
  }

  function handleReject(module: ModuleKey, fieldKey: string) {
    patchField(getFieldPath(module, fieldKey), { status: "rejected" });
  }

  function handleApprove(module: ModuleKey, fieldKey: string) {
    patchField(getFieldPath(module, fieldKey), { status: "approved" });
  }

  function handleApproveAll(module: ModuleKey) {
    const fields = getModuleFields(kb, module);
    let count = 0;
    Object.entries(fields).forEach(([fieldKey, field]) => {
      if (field.status === "needs_review") {
        patchField(getFieldPath(module, fieldKey), { status: "approved" });
        count++;
      }
    });
    if (count > 0) toast.success(`${count} field${count === 1 ? "" : "s"} approved`);

    // The module we just bulk-approved is now ready by definition (every needs_review field
    // was just flipped to approved) — reading it back from `kb` here would race the pending
    // setState above, so treat it as ready directly instead. Every other module's readiness
    // is unaffected by this action, so it's safe to read straight from the current `kb`.
    const readyByModule = Object.fromEntries(
      MODULES.map(({ key }) => [
        key,
        key === module ? true : getModuleStatus(getModuleFields(kb, key)) === "ready",
      ]),
    ) as Record<ModuleKey, boolean>;
    const next = findNextModuleNeedingReview(module, readyByModule);
    if (next) setSelectedModule(next);
  }


  // ── Mark KB ready ─────────────────────────────────────────────────────────

  async function handleMarkReady() {
    setMarkingReady(true);
    try {
      const result = await markKBReadyAction(clientId, versionId, clientSlug);
      if ("error" in result) { toast.error(result.error); return; }
      toast.success("Brand KB is ready!");
      router.push(`/clients/${clientSlug}`);
    } catch {
      toast.error("Failed to mark KB ready");
    } finally {
      setMarkingReady(false);
    }
  }

  // ── Re-extract ────────────────────────────────────────────────────────────

  /** The copilot reads what was just added and removed against the brand KB and answers with a
   *  change card (D517). Nothing is rebuilt and no review is lost. */
  async function proposeChanges(added: string[], removed: string[]) {
    try {
      const { started } = await kbService.propose(clientId, { added, removed });
      if (started) toast.success("Saved. The copilot is reading the changes.");
      void refreshCopilot();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the changes.");
    }
  }

  // ── Staged document management ────────────────────────────────────────────

  function openPanel() { setSourceDrawerOpen(true); }

  function markDocForRemoval(docId: string) {
    setPendingDocRemovals((prev) => new Set(prev).add(docId));
    openPanel();
  }
  function undoDocRemoval(docId: string) {
    setPendingDocRemovals((prev) => { const n = new Set(prev); n.delete(docId); return n; });
  }
  function markImageForRemoval(imageId: string) {
    setPendingImageRemovals((prev) => new Set(prev).add(imageId));
    openPanel();
  }
  function undoImageRemoval(imageId: string) {
    setPendingImageRemovals((prev) => { const n = new Set(prev); n.delete(imageId); return n; });
  }

  async function handleCancelChanges() {
    setCancelingChanges(true);
    try {
      for (const docId of newlyAddedDocIds) {
        try { await deleteKBDocumentAction(clientId, docId); } catch {}
      }
      for (const imageId of newlyAddedImageIds) {
        try { await deleteBrandImageAction(clientId, imageId); } catch {}
      }
      setDocuments((prev) => prev.filter((d) => !newlyAddedDocIds.has(d.id)));
      setImages((prev) => prev.filter((i) => !newlyAddedImageIds.has(i.id)));
      setPendingDocRemovals(new Set());
      setPendingImageRemovals(new Set());
      setNewlyAddedDocIds(new Set());
      setNewlyAddedImageIds(new Set());
    } finally {
      setCancelingChanges(false);
    }
  }

  async function handleSaveChanges() {
    setSavingChanges(true);
    try {
      // Named before they go: the copilot is told which documents were removed.
      const removedNames = documents.filter((d) => pendingDocRemovals.has(d.id)).map((d) => d.filename);
      const addedIds = documents.filter((d) => newlyAddedDocIds.has(d.id) && !pendingDocRemovals.has(d.id)).map((d) => d.id);
      for (const docId of pendingDocRemovals) await deleteKBDocumentAction(clientId, docId);
      for (const imageId of pendingImageRemovals) await deleteBrandImageAction(clientId, imageId);
      setDocuments((prev) => prev.filter((d) => !pendingDocRemovals.has(d.id)));
      setImages((prev) => prev.filter((i) => !pendingImageRemovals.has(i.id)));
      setPendingDocRemovals(new Set());
      setPendingImageRemovals(new Set());
      setNewlyAddedDocIds(new Set());
      setNewlyAddedImageIds(new Set());
      setShowSaveDialog(false);
      void proposeChanges(addedIds, removedNames);
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSavingChanges(false);
    }
  }

  async function uploadFiles(
    files: File[],
    endpoint: string,
    allowedExts: Set<string>,
    onAdded: (item: ClientKBDocumentRow | ClientBrandImageRow) => void,
    trackNewId: (id: string) => void,
    setUploading: (v: boolean) => void,
  ) {
    openPanel();
    setUploading(true);
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedExts.has(ext)) { toast.error(`Unsupported type: .${ext}`); continue; }
      try {
        const json = await uploadViaSignedUrl<{
          document?: ClientKBDocumentRow;
          image?: ClientBrandImageRow;
        }>(file, {
          signEndpoint: `${endpoint}/sign`,
          finalizeEndpoint: `${endpoint}/finalize`,
        });
        const item = json.document ?? json.image;
        if (item) {
          onAdded(item);
          trackNewId(item.id);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
  }

  function handleDocFiles(files: File[]) {
    uploadFiles(
      files,
      `/api/clients/${clientId}/kb/documents`,
      DOC_EXTENSIONS,
      (item) => setDocuments((prev) => [...prev, item as ClientKBDocumentRow]),
      (id) => setNewlyAddedDocIds((prev) => new Set(prev).add(id)),
      setUploadingDocs,
    );
  }

  function handleImgFiles(files: File[]) {
    uploadFiles(
      files,
      `/api/clients/${clientId}/kb/images`,
      IMG_EXTENSIONS,
      (item) => setImages((prev) => [...prev, item as ClientBrandImageRow]),
      (id) => setNewlyAddedImageIds((prev) => new Set(prev).add(id)),
      setUploadingImgs,
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="animate-rise flex min-h-0 flex-1 flex-col">
      {/* Save & Re-analyze dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Save & re-analyze?</DialogTitle>
            <DialogDescription>
              {buildChangeSummary(staged)}. The copilot reads the changes against the brand KB
              and shows what they would change, for you to approve. Nothing is rebuilt and no
              review is lost. Images are studied as usual.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={savingChanges} />}
            >
              Cancel
            </DialogClose>
            <Button onClick={handleSaveChanges} disabled={savingChanges}>
              <RefreshCwIcon
                className={cn("mr-1.5 size-3.5", savingChanges && "animate-spin")}
              />
              {savingChanges ? "Saving…" : "Save & Re-analyze"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Title row (artifact): the page's name and what to do, then its actions pinned to the right
         (they never wrap under the text). The client's name is in the client bar above, so it is not
         repeated here; Brand assets has its own tab there. */}
      <header className="mb-4 flex shrink-0 items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-[-0.01em]">Brand KB</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEditMode
              ? "Your brand KB is live. Add or remove source documents and re-analyze, or edit fields directly."
              : `Review the fields extracted from ${clientName}’s sources, edit anything that’s off, then mark the KB ready.`}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* TEMPORARILY REMOVED: the Source files button. Restore by uncommenting it (and the
              TEMPORARY lint exceptions on FolderPenIcon, HEADER_BUTTON and showChangeIndicator).

          <Button
            type="button"
            variant="ghost"
            onClick={() => setSourceDrawerOpen(true)}
            title="Edit source documents & images"
            className={cn("relative", HEADER_BUTTON)}
          >
            <FolderPenIcon className="size-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Source files</span>
            {showChangeIndicator && (
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-warning ring-2 ring-background" />
            )}
          </Button>
          */}
          {dirty && (
            <Button variant="outline" onClick={handleDiscard} disabled={saving} className="h-auto py-2">
              Discard changes
            </Button>
          )}
          {/* Single dynamic action: "Save changes" while dirty, otherwise Mark KB Ready
             (or its edit-mode/in-flight variants) — see the footerAction derivation above. */}
          {footerAction.tooltip ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-block" />}>
                  <Button disabled={footerAction.disabled} className="h-auto py-2">
                    <CheckCircle2Icon className="size-4" strokeWidth={1.5} />
                    {footerAction.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{footerAction.tooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button onClick={footerAction.onClick} disabled={footerAction.disabled} className="h-auto py-2">
              <CheckCircle2Icon className="size-4" strokeWidth={1.5} />
              {footerAction.label}
            </Button>
          )}
        </div>
      </header>

      {/* Source documents & images — side drawer */}
      <Sheet open={sourceDrawerOpen} onOpenChange={setSourceDrawerOpen}>
        <SheetContent className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border p-5 pr-12">
            <SheetTitle className="font-display text-lg">Source Documents & Images</SheetTitle>
            <SheetDescription>
              Add or remove the documents and images the brand KB is built from, then
              Save &amp; re-analyze. The copilot shows what they would change, for you to approve.
            </SheetDescription>
          </SheetHeader>
          <KBSourcePanel
            clientId={clientId}
            documents={documents}
            images={images}
            staged={staged}
            uploadingDocs={uploadingDocs}
            uploadingImgs={uploadingImgs}
            initialWebsiteUrl={initialWebsiteUrl}
            onMarkDocForRemoval={markDocForRemoval}
            onUndoDocRemoval={undoDocRemoval}
            onMarkImageForRemoval={markImageForRemoval}
            onUndoImageRemoval={undoImageRemoval}
            stateOf={follow.stateOf}
            onDocFiles={handleDocFiles}
            onImgFiles={handleImgFiles}
            onCancelChanges={handleCancelChanges}
            onSaveChanges={() => setShowSaveDialog(true)}
            cancelingChanges={cancelingChanges}
            savingChanges={savingChanges}
          />
        </SheetContent>
      </Sheet>

      {/* The review box (artifact): the section rail on the left, the selected section's cards on the right. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card md:flex-row">
        <KBSectionNav sections={MODULES} value={selectedModule} onChange={setSelectedModule} />

        <div role="tabpanel" aria-label={moduleLabel} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Section header: its title and field count, review progress, approve-all. */}
          <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-2.5">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-base font-semibold">{moduleLabel}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                {fieldCount} {fieldCount === 1 ? "field" : "fields"}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span title="Fields reviewed in this section" className="text-xs text-muted-foreground tabular-nums">
                {reviewedCount} / {fieldCount} reviewed
              </span>
              {/* The generic approve-all only makes sense against visible fields: when the module
                 has no real content (allImageAnalysisNull), the empty state below carries its own
                 "mark reviewed" action instead. */}
              {!allImageAnalysisNull && hasNeedsReview && (
                <Button
                  variant="outline"
                  size="sm"
                  title="Approve every field in this section and go to the next one"
                  onClick={() => handleApproveAll(selectedModule)}
                >
                  <CheckIcon className="size-3.5" strokeWidth={1.5} />
                  Approve all ({needsReviewCount})
                </Button>
              )}
            </div>
          </div>

          {/* Scrolling section body. Keyed by module so it remounts (resets scroll) and slides in on switch. */}
          <div key={selectedModule} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/30">
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.5 }}
              className="space-y-4 p-5"
            >
              {selectedModule === "image_analysis" && <KBImageAnalysisStatus clientId={clientId} />}

              {allImageAnalysisNull ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card py-10 text-center">
                  <ImageIcon className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">No image analysis yet</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      It fills in from the brand&apos;s uploaded images and the ones brought in from its
                      website and social accounts.
                    </p>
                  </div>
                  {hasNeedsReview && (
                    <Button variant="outline" size="sm" onClick={() => handleApproveAll(selectedModule)}>
                      <CheckIcon className="size-3.5" strokeWidth={1.5} />
                      Mark this section reviewed
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-6">
                  {fieldCards.map(({ fieldKey, field, span }) => {
                    const target = follow.fieldTarget(selectedModule, fieldKey);
                    return (
                      // The page follows the copilot (D520): each card is a target it can mark and fill.
                      <CopilotTarget key={fieldKey} id={target} state={follow.stateOf(target)} className={CARD_SPAN[span]}>
                        <KBFieldCard
                          fieldKey={fieldKey}
                          label={FIELD_LABELS[fieldKey] ?? fieldKey}
                          field={field}
                          onEdit={(val) => handleEdit(selectedModule, fieldKey, val)}
                          onApprove={() => handleApprove(selectedModule, fieldKey)}
                          onReject={() => handleReject(selectedModule, fieldKey)}
                        />
                      </CopilotTarget>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
