// A truncated or dead link should feel like a closed door, not an error.
export default function ReviewNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-6">
      <p className="text-eyebrow text-muted-foreground">Yuvabe Studios</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">This review link is no longer active</h1>
      <p className="text-sm text-muted-foreground">Ask your contact for a new one.</p>
    </main>
  );
}
