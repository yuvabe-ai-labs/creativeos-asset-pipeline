import type { ReactNode } from "react";

/** A whole-list message (no agencies yet, couldn't load, no matches), centred in the card. */
export function AgenciesState({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1.5 px-4 py-14 text-center text-sm text-muted-foreground">
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      <div>{children}</div>
      {actions && <div className="mt-2.5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
