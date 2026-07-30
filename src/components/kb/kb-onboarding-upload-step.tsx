"use client";

import { useState, useTransition, useEffect, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileTextIcon,
  ImageIcon,
  UploadIcon,
  XIcon,
  SparklesIcon,
  LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ClientKBDocumentRow,
  ClientBrandImageRow,
  ClientKBJobRow,
} from "@/lib/db/types";
import {
  KB_DOC_SIZE_LIMIT_BYTES,
  KB_IMG_SIZE_LIMIT_BYTES,
  KB_JOB_NON_TERMINAL,
  DOC_EXTENSIONS,
  IMG_EXTENSIONS,
} from "@/lib/kb/constants";
import { formatBytes } from "@/lib/kb/utils";
import { uploadViaSignedUrl } from "@/lib/uploads/client";
import { startKBBuildJob } from "@/lib/actions/kb";
import { useKBJobStatus } from "./use-kb-job-status";

const NON_TERMINAL = KB_JOB_NON_TERMINAL;
const DOC_LIMIT_BYTES = KB_DOC_SIZE_LIMIT_BYTES;
const IMG_LIMIT_BYTES = KB_IMG_SIZE_LIMIT_BYTES;

type UploadZoneProps = {
  label: string;
  accept: string;
  onFilesSelected: (files: File[]) => void;
  isUploading: boolean;
  icon: React.ReactNode;
};

function UploadZone({ label, accept, onFilesSelected, isUploading, icon }: UploadZoneProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) onFilesSelected(files);
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
      {isUploading ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <span className="size-3.5">{icon}</span>
      )}
      {isUploading ? "Uploading…" : label}
      <input
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={isUploading}
      />
    </label>
  );
}

type Props = {
  clientId: string;
  clientSlug: string;
  initialDocuments: ClientKBDocumentRow[];
  initialImages: ClientBrandImageRow[];
  initialWebsiteUrl: string | null;
  initialJob: ClientKBJobRow | null;
};

export function KBOnboardingUploadStep({
  clientId,
  clientSlug,
  initialDocuments,
  initialImages,
  initialWebsiteUrl,
  initialJob,
}: Props) {
  const router = useRouter();
  const job = useKBJobStatus(clientId, initialJob);
  const isRunning = job !== null && NON_TERMINAL.has(job.status);

  const [documents, setDocuments] = useState(initialDocuments);
  const [images, setImages] = useState(initialImages);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadingImgs, setUploadingImgs] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl ?? "");
  const [starting, startStartTransition] = useTransition();

  // Auto-redirect to client page when job succeeds
  useEffect(() => {
    if (job?.status === "succeeded") {
      router.push(`/clients/${clientSlug}/kb`);
    }
    if (job?.status === "failed") {
      toast.error(job.error ?? "KB build failed");
    }
  }, [job?.status, job?.error, clientSlug, router]);

  const docTotalBytes = documents.reduce((s, d) => s + (d.size_bytes ?? 0), 0);
  const imgTotalBytes = images.reduce((s, i) => s + (i.size_bytes ?? 0), 0);

  async function uploadFiles(
    files: File[],
    endpoint: string,
    allowedExts: Set<string>,
    limitBytes: number,
    currentBytes: number,
    onAdded: (item: ClientKBDocumentRow | ClientBrandImageRow) => void,
    setUploading: (v: boolean) => void,
  ) {
    setUploading(true);
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedExts.has(ext)) {
        toast.error(`Unsupported type: .${ext}`);
        continue;
      }
      if (currentBytes + file.size > limitBytes) {
        toast.error(`Adding this file would exceed the ${formatBytes(limitBytes)} limit`);
        continue;
      }
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
          currentBytes += file.size;
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
      DOC_LIMIT_BYTES,
      docTotalBytes,
      (item) => setDocuments((prev) => [...prev, item as ClientKBDocumentRow]),
      setUploadingDocs,
    );
  }

  function handleImgFiles(files: File[]) {
    uploadFiles(
      files,
      `/api/clients/${clientId}/kb/images`,
      IMG_EXTENSIONS,
      IMG_LIMIT_BYTES,
      imgTotalBytes,
      (item) => setImages((prev) => [...prev, item as ClientBrandImageRow]),
      setUploadingImgs,
    );
  }

  async function removeDoc(docId: string) {
    const res = await fetch(
      `/api/clients/${clientId}/kb/documents?docId=${docId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } else {
      toast.error("Failed to remove document");
    }
  }

  async function removeImage(imageId: string) {
    const res = await fetch(
      `/api/clients/${clientId}/kb/images?imageId=${imageId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setImages((prev) => prev.filter((i) => i.id !== imageId));
    } else {
      toast.error("Failed to remove image");
    }
  }

  function handleExtract() {
    startStartTransition(async () => {
      try {
        if (websiteUrl.trim()) {
          await fetch(`/api/clients/${clientId}/website-url`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ websiteUrl: websiteUrl.trim() }),
          });
        }
        await startKBBuildJob(clientId);
        // Don't redirect here — the useEffect above will redirect when the
        // Realtime event fires with status 'succeeded'.
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to start build.";
        toast.error(msg);
      }
    });
  }

  return (
    <div className="animate-rise space-y-6">
      {/* Brand website URL */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="size-4 text-muted-foreground" />
          <Label htmlFor="website-url" className="text-sm font-medium">
            Brand website <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
        </div>
        <Input
          id="website-url"
          className="mt-2"
          placeholder="https://yourbrand.com"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          disabled={isRunning}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          We&apos;ll research the site and add it as a knowledge source.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Documents panel */}
        <Card className="p-0 overflow-hidden">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Brand Documents</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatBytes(docTotalBytes)} / {formatBytes(DOC_LIMIT_BYTES)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              PDF · DOCX · PPTX · MD · TXT
            </p>
          </div>
          <div className="p-3 space-y-2">
            {!isRunning && (
              <UploadZone
                label="Add documents"
                accept=".pdf,.docx,.pptx,.md,.txt"
                onFilesSelected={handleDocFiles}
                isUploading={uploadingDocs}
                icon={<UploadIcon className="size-3.5" />}
              />
            )}
            {documents.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No documents uploaded yet
              </p>
            ) : (
              <ul className="space-y-1">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 group"
                  >
                    <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{doc.filename}</span>
                    {doc.size_bytes && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatBytes(doc.size_bytes)}
                      </span>
                    )}
                    {!isRunning && (
                      <button
                        type="button"
                        onClick={() => removeDoc(doc.id)}
                        className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                        aria-label="Remove"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Images panel */}
        <Card className="p-0 overflow-hidden">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Brand Images</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatBytes(imgTotalBytes)} / {formatBytes(IMG_LIMIT_BYTES)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              JPG · PNG · WebP
            </p>
          </div>
          <div className="p-3 space-y-2">
            {!isRunning && (
              <UploadZone
                label="Add images"
                accept=".jpg,.jpeg,.png,.webp"
                onFilesSelected={handleImgFiles}
                isUploading={uploadingImgs}
                icon={<UploadIcon className="size-3.5" />}
              />
            )}
            {images.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No images uploaded yet
              </p>
            ) : (
              <ul className="space-y-1">
                {images.map((img) => (
                  <li
                    key={img.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 group"
                  >
                    <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{img.filename}</span>
                    {img.size_bytes && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatBytes(img.size_bytes)}
                      </span>
                    )}
                    {!isRunning && (
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                        aria-label="Remove"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Bottom action area */}
      {isRunning ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {job?.phase_message ?? "Building knowledge base…"}
            </p>
            <p className="text-xs text-muted-foreground">
              This usually takes 60–120 seconds. We&apos;ll bring you to the review step when it&apos;s done.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            onClick={handleExtract}
            disabled={starting || (documents.length === 0 && !websiteUrl.trim()) || uploadingDocs || uploadingImgs}
          >
            <SparklesIcon className="mr-1.5 size-4" />
            {starting ? "Starting…" : "Extract & Build KB"}
          </Button>
          {documents.length === 0 && !websiteUrl.trim() && (
            <p className="text-sm text-muted-foreground">
              Add a website or upload a document to continue
            </p>
          )}
        </div>
      )}
    </div>
  );
}
