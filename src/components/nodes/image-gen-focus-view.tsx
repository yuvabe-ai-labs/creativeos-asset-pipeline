"use client";

// Stub — full implementation in Task 12
export type ImageGenFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  imageUrl: string | null;
  modelId?: string;
  params?: Record<string, unknown>;
  upstream: Array<{ id: string; type: string; fileUrl?: string; fileKind?: string }>;
  onPatch: (patch: Record<string, unknown>) => void;
};

export function ImageGenFocusView(_props: ImageGenFocusViewProps) {
  return null;
}
