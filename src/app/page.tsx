export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center dark:bg-zinc-950">
      <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium uppercase tracking-widest text-zinc-500 dark:border-zinc-800">
        Increment 1A · skeleton
      </span>
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        CreativeOS
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Canvas-based asset generation for reel production. The Next.js skeleton is
        running — next we add pages and in-memory state.
      </p>
    </main>
  );
}
