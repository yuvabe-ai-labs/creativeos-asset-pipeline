"use client";

import { useCallback, useRef, useState } from "react";
import type { Attachment } from "@/lib/journey/thread/schema";

export type PendingAttachment = {
  key: string; name: string;
  /** "removing": taking back a file that was already stored. */
  state: "uploading" | "ready" | "failed" | "removing";
  attachment: Attachment | null;
  /** Why it was refused or failed, ready to show. */
  error: string | null;
};

/** Files being attached to the next message in a copilot thread. Each uploads the moment it is
 *  chosen. What a file must be and where it goes is the stage's: `check` returns the reason a file
 *  is refused (or null), `upload` stores it and returns what the message will carry, and `discard`
 *  takes a stored file back when the person removes it before sending. */
export function useThreadAttachments(input: {
  check: (file: File) => string | null;
  upload: (file: File) => Promise<Attachment>;
  discard: (attachment: Attachment) => Promise<void>;
}) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const next = useRef(0);
  const { check, upload, discard } = input;

  const patch = useCallback((key: string, change: Partial<PendingAttachment>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);
  const drop = useCallback((key: string) => setItems((prev) => prev.filter((item) => item.key !== key)), []);

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

  /** Removing a file that is already stored takes it back, so a file the person removed is never
   *  left behind as a source. If that fails the chip stays and says the file is still saved. */
  const remove = useCallback((item: PendingAttachment) => {
    if (!item.attachment) return drop(item.key);
    patch(item.key, { state: "removing", error: null });
    discard(item.attachment).then(
      () => drop(item.key),
      () => patch(item.key, { state: "ready", error: "Could not remove it. It is still saved as a source." }),
    );
  }, [discard, drop, patch]);

  /** After a message is sent: the chips go, the files stay (they went with the message). */
  const clear = useCallback(() => setItems([]), []);
  /** Puts chips back when the message they went with could not be sent. */
  const restore = useCallback((back: PendingAttachment[]) => setItems((prev) => [...back, ...prev]), []);

  return {
    items, add, remove, clear, restore,
    /** True while a file is going up or being taken back: the message waits for it. */
    busy: items.some((item) => item.state === "uploading" || item.state === "removing"),
    ready: items.flatMap((item) => (item.attachment && item.state === "ready" ? [item.attachment] : [])),
  };
}

export type ThreadAttachments = ReturnType<typeof useThreadAttachments>;
