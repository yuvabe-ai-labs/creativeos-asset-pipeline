"use client";

import { useCallback, useRef, useState } from "react";
import type { Attachment } from "@/lib/journey/thread/schema";

export type PendingAttachment = {
  key: string; name: string;
  state: "uploading" | "ready" | "failed";
  attachment: Attachment | null;
  /** Why it was refused or failed, ready to show. */
  error: string | null;
};

/** Files being attached to the next message in a copilot thread. Each uploads the moment it is
 *  chosen. What a file must be and where it goes is the stage's: `check` returns the reason a file
 *  is refused (or null), `upload` stores it and returns what the message will carry. */
export function useThreadAttachments(input: {
  check: (file: File) => string | null;
  upload: (file: File) => Promise<Attachment>;
}) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const next = useRef(0);
  const { check, upload } = input;

  const patch = useCallback((key: string, change: Partial<PendingAttachment>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const add = useCallback((files: File[]) => {
    for (const file of files) {
      const key = `a${next.current++}`;
      const refused = check(file);
      if (refused) {
        setItems((prev) => [...prev, { key, name: file.name, state: "failed", attachment: null, error: refused }]);
        continue;
      }
      setItems((prev) => [...prev, { key, name: file.name, state: "uploading", attachment: null, error: null }]);
      upload(file).then(
        (attachment) => patch(key, { state: "ready", attachment }),
        (e: unknown) => patch(key, { state: "failed", error: e instanceof Error ? e.message : `Failed to upload ${file.name}` }),
      );
    }
  }, [check, upload, patch]);

  const remove = useCallback((key: string) => setItems((prev) => prev.filter((item) => item.key !== key)), []);
  const clear = useCallback(() => setItems([]), []);

  return {
    items, add, remove, clear,
    uploading: items.some((item) => item.state === "uploading"),
    ready: items.flatMap((item) => (item.attachment ? [item.attachment] : [])),
  };
}

export type ThreadAttachments = ReturnType<typeof useThreadAttachments>;
