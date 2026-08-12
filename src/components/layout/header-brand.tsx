import Link from "next/link";

// Just the wordmark. The org name, the credits pill and the static "Yuvabe Studios" eyebrow
// all used to render here — all three now live in ProfilePopover, where "which workspace am
// I in" is answered once instead of competing with the brand mark. See
// docs/superpowers/specs/2026-08-09-profile-popover-header-design.md §5.
export function HeaderBrand() {
  return (
    <Link href="/" className="flex items-center">
      <span className="font-display text-xl font-semibold tracking-tight">
        Creative<span className="text-primary">OS</span>
      </span>
    </Link>
  );
}
