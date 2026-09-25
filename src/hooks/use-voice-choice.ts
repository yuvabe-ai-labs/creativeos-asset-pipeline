"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

/**
 * D284 — which voice the workspace will apply. `voiceId` persists on the node; `voice` is the full
 * PickerVoice (resolved via the single-voice route, or taken straight from the clicked row). A
 * Library pick is selected instantly and saved to the account in the background; Apply waits on
 * `saving`. A refused save reverts to the previous voice with a toast.
 */
export function useVoiceChoice(voiceId: string | null, onVoiceIdChange: (id: string | null) => void, enabled: boolean) {
  const [voice, setVoice] = useState<PickerVoice | null>(null);
  const [saving, setSaving] = useState(false);
  const pickReq = useRef(0);

  // Resolve a stored id (e.g. reopening the workspace) — only when we don't already hold it.
  useEffect(() => {
    if (!enabled || !voiceId || voice?.voiceId === voiceId || saving) return;
    let cancelled = false;
    fetch(`/api/elevenlabs/voices/${encodeURIComponent(voiceId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { voice?: PickerVoice } | null;
        if (cancelled) return;
        if (res.ok && json?.voice) setVoice(json.voice);
        else if (res.status === 404) onVoiceIdChange(null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [enabled, voiceId, voice?.voiceId, saving, onVoiceIdChange]);

  const choose = useCallback(
    async (next: PickerVoice) => {
      if (saving) return;
      const previous = { id: voiceId, voice };
      setVoice(next);
      onVoiceIdChange(next.voiceId);
      if (next.source === "account") return;
      const myReq = ++pickReq.current;
      setSaving(true);
      try {
        const saved = await elevenLabsApi.saveVoice({
          publicOwnerId: next.publicOwnerId ?? "",
          voiceId: next.voiceId,
          name: next.name,
        });
        if (myReq !== pickReq.current) return;
        setVoice(saved);
        if (saved.voiceId !== next.voiceId) onVoiceIdChange(saved.voiceId);
      } catch (e) {
        if (myReq !== pickReq.current) return;
        setVoice(previous.voice);
        onVoiceIdChange(previous.id);
        toast.error(`Couldn't use "${next.name}": ${e instanceof Error ? e.message : "Could not save this voice."}`);
      } finally {
        if (myReq === pickReq.current) setSaving(false);
      }
    },
    [saving, voiceId, voice, onVoiceIdChange],
  );

  return { voice: voiceId ? voice : null, saving, choose };
}
