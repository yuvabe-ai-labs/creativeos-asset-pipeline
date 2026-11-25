"use client";

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import type { ThreadAttachments } from "@/hooks/use-thread-attachments";
import { cn } from "@/lib/utils";
import { ThreadAttachmentChip } from "./thread-attachment-chip";

/** The message box of a copilot thread, the same in every stage. Files are picked, dropped on the
 *  box or pasted, and upload at once. What it accepts and where a file goes is the stage's. The
 *  text and the attachments are held by the stage's panel, which clears them once a message is
 *  really sent and puts them back if it was not. */
export function ThreadComposer({ busy, placeholder, accept, maxChars, text, onTextChange, attachments, onSend }: {
  busy: boolean;
  placeholder: string;
  /** The file picker's accept list. */
  accept: string;
  maxChars: number;
  text: string;
  onTextChange: (text: string) => void;
  attachments: ThreadAttachments;
  onSend: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const tooLong = text.length > maxChars;
  const canSend = !busy && !attachments.busy && !tooLong && (text.trim().length > 0 || attachments.ready.length > 0);

  const send = () => {
    if (canSend) onSend();
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) attachments.add(files);
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    // Only a paste that is a file and nothing else is attached. Copying from a document or a
    // spreadsheet carries a picture of the text as well as the text: that is a paste of text.
    if (files.length === 0 || e.clipboardData.getData("text/plain")) return;
    e.preventDefault();
    attachments.add(files);
  };

  return (
    <div
      className="border-t border-border p-3"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {attachments.items.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.items.map((item) => (
            <ThreadAttachmentChip
              key={item.key}
              name={item.name}
              url={item.attachment?.url ?? null}
              state={item.state}
              error={item.error}
              onRemove={item.state === "uploading" || item.state === "removing" ? undefined : () => attachments.remove(item)}
            />
          ))}
        </div>
      )}
      <InputGroup className={cn(over && "border-primary/50 bg-primary/5")}>
        <InputGroupTextarea
          rows={2}
          value={text}
          placeholder={placeholder}
          className="max-h-36 overflow-y-auto"
          onChange={(e) => onTextChange(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton size="icon-xs" aria-label="Attach files" onClick={() => picker.current?.click()}>
            <Paperclip strokeWidth={1.5} />
          </InputGroupButton>
          <span className="text-xs text-muted-foreground">
            {tooLong ? `Over ${maxChars.toLocaleString("en")} characters: too long for one message.` : "Enter to send · Shift+Enter for a new line"}
          </span>
          <InputGroupButton size="icon-xs" className="ml-auto" aria-label="Send" disabled={!canSend} onClick={send}>
            <ArrowUp strokeWidth={1.5} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {/* The picker itself: opened by the paperclip, never shown. */}
      <Input
        ref={picker}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) attachments.add(files);
        }}
      />
    </div>
  );
}
