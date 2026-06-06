"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCwIcon, CheckCircle2Icon, CheckIcon, ImageIcon } from "lucide-react";
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
import { KBModuleCard } from "@/components/kb/kb-module-card";
import { KBFieldRow } from "@/components/kb/kb-field-row";
import { KBSourcePanel } from "@/components/kb/kb-source-panel";
import { KBReExtractOverlay } from "@/components/kb/kb-re-extract-overlay";
import { computeReadyStatus } from "@/lib/kb/fill-rate";
import type { TraceableBrandKB, KBField } from "@/lib/kb/schema";
import { setNestedField } from "@/lib/kb/utils";
import {
  patchKBFieldAction,
  markKBReadyAction,
  deleteKBDocumentAction,
  deleteBrandImageAction,
} from "@/lib/actions/kb";
import type { ClientKBDocumentRow, ClientBrandImageRow } from "@/lib/db/types";
import type { ModuleKey, FieldPath, StagedChanges } from "@/lib/kb/types";
import { MODULES, FIELD_LABELS, DOC_EXTENSIONS, IMG_EXTENSIONS } from "@/lib/kb/constants";
import { getModuleFields, getFieldPath, buildChangeSummary } from "@/lib/kb/utils";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  clientId: string;
  clientSlug: string;
  versionId: string;
  initialKB: TraceableBrandKB;
  isEditMode: boolean;
  initialDocuments?: ClientKBDocumentRow[];
  initialImages?: ClientBrandImageRow[];
  docIdsAtExtraction?: string[];
};

// ── Component ─────────────────────────────────────────────────────────────────

export function KBOnboardingReviewStep({
  clientId,
  clientSlug,
  versionId,
  initialKB,
  isEditMode,
  initialDocuments = [],
  initialImages = [],
  docIdsAtExtraction = [],
}: Props) {
  const router = useRouter();

  // KB review state — reset via key={versionId} at the call site (page.tsx)
  const [kb, setKB] = useState<TraceableBrandKB>(initialKB);
  const [selectedModule, setSelectedModule] = useState<ModuleKey>("brand_voice");
  const [reanalyzingFields, setReanalyzingFields] = useState<Set<string>>(new Set());
  const [markingReady, setMarkingReady] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);

  // Document management state
  const [documents, setDocuments] = useState<ClientKBDocumentRow[]>(initialDocuments);
  const [images, setImages] = useState<ClientBrandImageRow[]>(initialImages);
  const [docPanelOpen, setDocPanelOpen] = useState(false);
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const isReady = computeReadyStatus(kb);

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
  const showChangeIndicator = hasPendingChanges || docsChangedFromBaseline;

  const currentFields = getModuleFields(kb, selectedModule);
  const hasNeedsReview = Object.values(currentFields).some((f) => f.status === "needs_review");
  const needsReviewCount = Object.values(currentFields).filter((f) => f.status === "needs_review").length;
  const allImageAnalysisNull =
    selectedModule === "image_analysis" &&
    Object.values(currentFields).every((f) => f.value === null);

  // ── Field helpers ─────────────────────────────────────────────────────────

  function patchField(path: FieldPath, patch: Partial<KBField<unknown>>) {
    setKB((prev) =>
      setNestedField(
        prev as unknown as Record<string, unknown>,
        path,
        patch as Record<string, unknown>,
      ) as unknown as TraceableBrandKB,
    );
    patchKBFieldAction(versionId, path, patch as Record<string, unknown>).catch(() =>
      toast.error("Failed to save field update"),
    );
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
  }

  async function handleReanalyzeField(module: ModuleKey, fieldKey: string, comment: string) {
    const key = `${module}:${fieldKey}`;
    setReanalyzingFields((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/clients/${clientId}/kb/re-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, module, fieldKey, comment }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Re-analysis failed"); return; }
      patchField(getFieldPath(module, fieldKey), {
        value: json.field.value,
        confidence: json.field.confidence,
        evidence_type: json.field.evidence_type,
        status: "needs_review",
      });
      toast.success(`${FIELD_LABELS[fieldKey] ?? fieldKey} updated — review the new value`);
    } catch {
      toast.error("Re-analysis failed");
    } finally {
      setReanalyzingFields((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
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

  async function fireReExtract() {
    setReExtracting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/kb/re-extract`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Re-extract failed");
        setReExtracting(false);
        return;
      }
      // Keep reExtracting=true so the overlay persists during navigation.
      // The component remounts via key={versionId} in page.tsx once the new version arrives.
      router.refresh();
    } catch {
      toast.error("Re-extract failed");
      setReExtracting(false);
    }
  }

  // ── Staged document management ────────────────────────────────────────────

  function openPanel() { if (!docPanelOpen) setDocPanelOpen(true); }

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
      for (const docId of pendingDocRemovals) await deleteKBDocumentAction(clientId, docId);
      for (const imageId of pendingImageRemovals) await deleteBrandImageAction(clientId, imageId);
      setDocuments((prev) => prev.filter((d) => !pendingDocRemovals.has(d.id)));
      setImages((prev) => prev.filter((i) => !pendingImageRemovals.has(i.id)));
      setPendingDocRemovals(new Set());
      setPendingImageRemovals(new Set());
      setNewlyAddedDocIds(new Set());
      setNewlyAddedImageIds(new Set());
      setShowSaveDialog(false);
      fireReExtract();
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
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(endpoint, { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Upload failed");
        } else {
          const item = json.document ?? json.image;
          onAdded(item);
          trackNewId(item.id);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
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
    <div className="animate-rise">
      {/* Save & Re-analyze dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Save & Re-analyze KB?</DialogTitle>
            <DialogDescription>
              {buildChangeSummary(staged)}. The AI will reprocess all sources and rebuild
              the knowledge base. Any existing review progress will be reset.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={savingChanges || reExtracting} />}
            >
              Cancel
            </DialogClose>
            <Button onClick={handleSaveChanges} disabled={savingChanges || reExtracting}>
              <RefreshCwIcon
                className={cn("mr-1.5 size-3.5", (savingChanges || reExtracting) && "animate-spin")}
              />
              {savingChanges || reExtracting ? "Saving…" : "Save & Re-analyze"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KBReExtractOverlay visible={reExtracting} />

      {/* Source documents & images panel — always visible */}
      <KBSourcePanel
        clientId={clientId}
        documents={documents}
        images={images}
        staged={staged}
        docPanelOpen={docPanelOpen}
        uploadingDocs={uploadingDocs}
        uploadingImgs={uploadingImgs}
        showChangeIndicator={showChangeIndicator}
        onTogglePanel={() => setDocPanelOpen((v) => !v)}
        onMarkDocForRemoval={markDocForRemoval}
        onUndoDocRemoval={undoDocRemoval}
        onMarkImageForRemoval={markImageForRemoval}
        onUndoImageRemoval={undoImageRemoval}
        onDocFiles={handleDocFiles}
        onImgFiles={handleImgFiles}
        onCancelChanges={handleCancelChanges}
        onSaveChanges={() => setShowSaveDialog(true)}
        cancelingChanges={cancelingChanges}
        savingChanges={savingChanges}
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left — module cards */}
        <div className="space-y-2">
          {MODULES.map(({ key, label }) => (
            <KBModuleCard
              key={key}
              label={label}
              fields={getModuleFields(kb, key)}
              isSelected={selectedModule === key}
              onClick={() => setSelectedModule(key)}
            />
          ))}

          <div className="pt-2">
            <Button
              className="w-full"
              onClick={handleMarkReady}
              disabled={!isReady || markingReady || isEditMode}
            >
              <CheckCircle2Icon className="mr-1.5 size-4" />
              {markingReady
                ? "Saving…"
                : isEditMode
                  ? "KB is Ready"
                  : isReady
                    ? "Mark KB Ready"
                    : "Review all fields first"}
            </Button>
            {!isReady && !isEditMode && (
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                Approve or reject every extracted field to continue
              </p>
            )}
          </div>
        </div>

        {/* Right — module detail */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">
              {MODULES.find((m) => m.key === selectedModule)?.label}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {Object.values(currentFields).filter((f) => f.status !== "needs_review").length}
                {" / "}
                {Object.values(currentFields).length} reviewed
              </span>
              {hasNeedsReview && (
                <button
                  type="button"
                  onClick={() => handleApproveAll(selectedModule)}
                  className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <CheckIcon className="size-3.5" />
                  Approve All ({needsReviewCount})
                </button>
              )}
            </div>
          </div>

          {allImageAnalysisNull ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
              <ImageIcon className="size-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  No brand images were analyzed
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Upload images in the Source Documents & Images panel above.
                </p>
              </div>
            </div>
          ) : (
            <div key={selectedModule} className="space-y-3">
              {Object.entries(currentFields).map(([fieldKey, field]) => (
                <KBFieldRow
                  key={fieldKey}
                  fieldKey={fieldKey}
                  label={FIELD_LABELS[fieldKey] ?? fieldKey}
                  field={field}
                  isReanalyzing={reanalyzingFields.has(`${selectedModule}:${fieldKey}`)}
                  onEdit={(val) => handleEdit(selectedModule, fieldKey, val)}
                  onApprove={() => handleApprove(selectedModule, fieldKey)}
                  onReject={() => handleReject(selectedModule, fieldKey)}
                  onReanalyze={(comment) => handleReanalyzeField(selectedModule, fieldKey, comment)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
