"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroupButton } from "@/components/ui/input-group";
import { CopilotComposer } from "@/components/scripts/generate/copilot-composer";
import { useUploadScriptImage } from "@/hooks/queries/script-assets";
import { errorMessage } from "@/lib/avatars/utils";
import { pictureTarget, pictureUrl, splitTarget } from "@/lib/scripts/copilot/picture-target";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { TurnMessage } from "@/services/script-generate.service";
import type { UploadTarget } from "@/services/script-assets.service";

const ACCEPT = "image/png,image/jpeg,image/webp";
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function uploadTarget(target: string): UploadTarget | null {
  const [kind, id] = splitTarget(target);
  if (kind === "product") return { kind, productId: id };
  if (kind === "location") return { kind, locationId: id };
  return null;
}

/** Piece 5.1 §3.7 (D515) — the message box at Visualise, with a picture. Which product or location
 *  it is for is decided here, before anything uploads (picture-target.ts); when nothing makes it
 *  clear, it asks. It then uploads exactly as the board does, into the script's own folder (never
 *  brand assets), and sends the message with the picture. */
export function CopilotPictureComposer({ clientId, scriptId, doc, busy, text, onTextChange, request, onSend }: {
  clientId: string;
  scriptId: string;
  doc: ScriptDoc;
  busy: boolean;
  text: string;
  onTextChange: (text: string) => void;
  /** The step card's "Attach a picture" on an item: open the picker for it. */
  request: { target: string; n: number } | null;
  onSend: (message: TurnMessage) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ items: { id: string; name: string }[]; text: string } | null>(null);
  const upload = useUploadScriptImage(clientId, scriptId);

  useEffect(() => {
    if (!request) return;
    setPreset(request.target);
    picker.current?.click();
  }, [request]);

  const clear = () => { setFile(null); setPreset(null); setAsking(null); };

  const deliver = async (picked: File, target: string, words: string) => {
    const to = uploadTarget(target);
    if (!to) return;
    try {
      const write = await upload.mutateAsync({ file: picked, target: to });
      const url = pictureUrl(write.doc, target);
      if (!url) throw new Error("The picture did not land.");
      onSend({ text: words, picture: { url, name: picked.name, target } });
      clear();
    } catch (e) {
      toast.error(errorMessage(e, "Could not add the picture"));
    }
  };

  const send = (words: string) => {
    if (!file) { onSend({ text: words }); return; }
    const decided = pictureTarget(doc, words, preset);
    if ("none" in decided) { toast.error("This script has no products or locations to put a picture on yet."); return; }
    if ("ask" in decided) { setAsking({ items: decided.ask, text: words }); return; }
    void deliver(file, decided.target, words);
  };

  const above = asking && file ? (
    <PictureTargetChoice
      items={asking.items}
      onPick={(target) => void deliver(file, target, asking.text)}
      onCancel={() => setAsking(null)}
    />
  ) : file ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
      {file.name}
      <Button size="icon-xs" variant="ghost" aria-label="Remove the picture" onClick={clear}><X strokeWidth={1.5} /></Button>
    </span>
  ) : null;

  return (
    <>
      <CopilotComposer
        busy={busy || upload.isPending}
        text={text}
        onTextChange={onTextChange}
        onSend={send}
        sendEmpty={file !== null}
        above={above}
        attach={(
          <InputGroupButton size="icon-xs" aria-label="Attach a picture" onClick={() => { setPreset(null); picker.current?.click(); }}>
            <ImagePlus strokeWidth={1.5} />
          </InputGroupButton>
        )}
      />
      {/* The picker itself: opened by the button or a step card, never shown. */}
      <Input
        ref={picker}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          e.target.value = "";
          setAsking(null);
          setFile(picked);
        }}
      />
    </>
  );
}

/** "Which is this for?" with one button per product and location. */
export function PictureTargetChoice({ items, onPick, onCancel }: {
  items: { id: string; name: string }[];
  onPick: (target: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2 text-sm">
      <span className="font-medium">Which is this for?</span>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => <Button key={i.id} size="sm" variant="outline" onClick={() => onPick(i.id)}>{upper(i.name)}</Button>)}
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
