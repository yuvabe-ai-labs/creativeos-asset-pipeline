import type { ReactNode } from "react";

// The people screens' page box: Team, a client's Members and Admin's agency page share it.
export const PAGE_CONTAINER = "mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6";

// One header for the people screens: breadcrumb, then the title (with an optional mark and
// eyebrow before it) and its summary line, the primary action on the right.
export function PageHeader({
  breadcrumb,
  leading,
  eyebrow,
  title,
  subtitle,
  actions,
  as: Heading = "h1",
}: {
  breadcrumb?: ReactNode;
  /** A mark before the title (the client's logo). */
  leading?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** h2 when the header sits inside another page (Admin's Clients tab). */
  as?: "h1" | "h2";
}) {
  return (
    <header className="flex flex-col gap-6">
      {breadcrumb}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="flex min-w-0 flex-col">
            {eyebrow && <span className="text-eyebrow text-[0.65rem] text-muted-foreground">{eyebrow}</span>}
            <Heading className="font-display truncate text-2xl font-semibold tracking-tight">{title}</Heading>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
    </header>
  );
}
