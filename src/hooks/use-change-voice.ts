"use client";

import { useState } from "react";
import type { VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";

/** D284 — posts the voice change. Progress/results arrive through the node's normal generation status + versions. */
export function useChangeVoice(nodeId: string) {
  const [submitting, setSubmitting] = useState(false);
  async function apply(body: { baseVersionId: string; voiceId: string; settings: VoiceChangeSettings }): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/voice-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true };
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: json?.error ?? "Voice change failed.", status: res.status };
    } finally {
      setSubmitting(false);
    }
  }
  return { apply, submitting };
}
