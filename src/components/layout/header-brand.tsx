import Link from "next/link";

// The wordmark + static "Yuvabe Studios" eyebrow always show. Org name and credits used to
// render here too (gated on identity having resolved) — both moved into ProfilePopover, see
// docs/superpowers/specs/2026-08-09-profile-popover-header-design.md §5.
export function HeaderBrand() {
  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <span className="font-display text-xl font-semibold tracking-tight">
          Creative<span className="text-primary">OS</span>
        </span>
      </Link>
      <span className="text-eyebrow hidden sm:block">Yuvabe Studios</span>
    </div>
  );
}
