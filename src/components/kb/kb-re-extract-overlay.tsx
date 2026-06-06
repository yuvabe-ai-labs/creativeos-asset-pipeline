"use client";

type Props = { visible: boolean };

export function KBReExtractOverlay({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md">
      <div className="flex w-full max-w-xs flex-col items-center gap-5 rounded-2xl border bg-card px-10 py-8 text-center shadow-xl">
        <div className="relative size-14 shrink-0">
          <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
        </div>
        <div>
          <p className="font-semibold">Analyzing brand sources</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            The AI is processing your documents and images. This usually takes 30–60 seconds.
          </p>
        </div>
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-shimmer rounded-full bg-primary" />
        </div>
        <p className="text-xs text-muted-foreground">Don&apos;t close this tab</p>
      </div>
    </div>
  );
}
