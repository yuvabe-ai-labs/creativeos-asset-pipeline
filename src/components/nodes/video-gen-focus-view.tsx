"use client";

type ImageRole = "start_frame" | "end_frame" | "reference";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  videoUrl: string | null;
  modelId?: string;
  params?: Record<string, unknown>;
  imageRoles: Record<string, ImageRole>;
  onPatch: (patch: Record<string, unknown>) => void;
};

export function VideoGenFocusView({ open, onOpenChange }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => onOpenChange(false)}>
      <div className="rounded-xl bg-white p-8 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">Video Gen focus view — coming soon</p>
        <button onClick={() => onOpenChange(false)} className="mt-4 text-xs text-neutral-500 hover:text-neutral-800">Close</button>
      </div>
    </div>
  );
}
