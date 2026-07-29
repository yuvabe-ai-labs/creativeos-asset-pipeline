// Secondary meta text beside a primary Generate/Re-generate button label. Deliberately
// smaller and softer than the button's own text — "Est. N credits" is an annotation on
// the action, not a second call to action competing with it for attention. Pre-generation
// cost is always an estimate, never the exact charge (real vendor/token cost can differ
// at settlement) — every Generate button showing this figure must say so.
export function EstimatedCreditsLabel({ credits }: { credits: number }) {
  return (
    <span className="ml-1 text-[0.7rem] font-normal opacity-75">
      Est. {credits.toLocaleString()} credits
    </span>
  );
}
