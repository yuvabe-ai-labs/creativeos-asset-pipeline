// src/components/script-review/voice-sample-button.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Plays a voice sample without a native audio control (CLAUDE.md: shadcn controls only). */
export function VoiceSampleButton({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const ref = audio;
    return () => ref.current?.pause();
  }, []);

  function toggle() {
    if (!audio.current) {
      audio.current = new Audio(url);
      audio.current.addEventListener("ended", () => setPlaying(false));
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
      return;
    }
    audio.current.play().then(() => setPlaying(true), () => setPlaying(false));
  }

  return (
    <Button variant="outline" size="xs" onClick={toggle}>
      {playing ? <Pause strokeWidth={1.5} /> : <Play strokeWidth={1.5} />}
      {playing ? "Pause" : "Play sample"}
    </Button>
  );
}
