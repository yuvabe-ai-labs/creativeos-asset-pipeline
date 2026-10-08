"use client";

import { useQuery } from "@tanstack/react-query";
import { elevenLabsApi } from "@/lib/elevenlabs/api";

// The client's own voices (D292), for Visualise's voice picker. Keys are built here only.
export const clientVoiceKeys = {
  list: (clientId: string) => ["client-voices", clientId] as const,
};

export function useClientVoices(clientId: string) {
  return useQuery({
    queryKey: clientVoiceKeys.list(clientId),
    queryFn: () => elevenLabsApi.listClientVoices(clientId).then((r) => r.voices),
    enabled: Boolean(clientId),
  });
}
