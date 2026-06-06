"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileTextIcon,
  ImageIcon,
  UploadIcon,
  XIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KBReExtractOverlay } from "@/components/kb/kb-re-extract-overlay";
import type {
  ClientKBDocumentRow,
  ClientBrandImageRow,
} from "@/lib/db/types";
import { KB_DOC_SIZE_LIMIT_BYTES, KB_IMG_SIZE_LIMIT_BYTES } from "@/lib/kb/constants";

const DOC_EXTENSIONS = new Set(["pdf", "docx", "pptx", "md", "txt"]);
const IMG_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const DOC_LIMIT_BYTES = KB_DOC_SIZE_LIMIT_BYTES;
const IMG_LIMIT_BYTES = KB_IMG_SIZE_LIMIT_BYTES;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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
};

export function KBOnboardingUploadStep({
  clientId,
  clientSlug,
  initialDocuments,
  initialImages,
}: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [images, setImages] = useState(initialImages);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadingImgs, setUploadingImgs] = useState(false);
  const [extracting, startExtract] = useTransition();

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
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(endpoint, { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Upload failed");
        } else {
          onAdded(json.document ?? json.image);
          currentBytes += file.size;
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
    startExtract(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/kb/extract`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "Extraction failed");
          return;
        }
        toast.success("KB extracted — review the results below");
        router.refresh();
      } catch {
        toast.error("Extraction failed");
      }
    });
  }

  return (
    <div className="animate-rise space-y-6">
      <KBReExtractOverlay visible={extracting} />
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
            <UploadZone
              label="Add documents"
              accept=".pdf,.docx,.pptx,.md,.txt"
              onFilesSelected={handleDocFiles}
              isUploading={uploadingDocs}
              icon={<UploadIcon className="size-3.5" />}
            />
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
                    <button
                      type="button"
                      onClick={() => removeDoc(doc.id)}
                      className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                      aria-label="Remove"
                    >
                      <XIcon className="size-3.5" />
                    </button>
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
            <UploadZone
              label="Add images"
              accept=".jpg,.jpeg,.png,.webp"
              onFilesSelected={handleImgFiles}
              isUploading={uploadingImgs}
              icon={<UploadIcon className="size-3.5" />}
            />
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
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                      aria-label="Remove"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleExtract}
          disabled={extracting || documents.length === 0 || uploadingDocs || uploadingImgs}
        >
          <SparklesIcon className="mr-1.5 size-4" />
          {extracting ? "Extracting…" : "Extract & Build KB"}
        </Button>
        {documents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Upload at least one document to continue
          </p>
        )}
      </div>
    </div>
  );
}
