// EXPERIMENT (throwaway) — standalone probe route, deliberately outside the canvas.
// No auth, no DB, no Trigger.dev. Delete with the branch.

import { SeedanceLab } from "@/components/lab/seedance-lab";

export const metadata = { title: "Seedance lab" };

export default function SeedanceLabPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 space-y-2">
        <span className="text-eyebrow">Experiment</span>
        <h1 className="font-display text-3xl text-neutral-900">Seedream → Seedance</h1>
        <p className="max-w-2xl text-sm text-neutral-500">
          Probing BytePlus ModelArk API support for human-reference UGC video. Generate a
          presenter with Seedream, then drive it with Seedance 2.5.
        </p>
      </header>

      <SeedanceLab />
    </main>
  );
}
