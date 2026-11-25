import { Lock } from "lucide-react";

/** One row of the settings list: a name on the left, the value and its why on the right. */
export function SettingRow({ label, labelFor, children }: { label: string; labelFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 border-b py-4 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[150px_minmax(0,1fr)] md:gap-4">
      {labelFor ? (
        <label htmlFor={labelFor} className="text-sm font-medium">{label}</label>
      ) : (
        <span className="text-sm font-medium">{label}</span>
      )}
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Why({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Lock aria-hidden strokeWidth={1.5} className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** The two settings that can't be changed here, each with why: the credit rate and rounding up. */
export function LockedSettings() {
  return (
    <>
      <SettingRow label="Credit rate">
        <p className="text-sm">
          <span className="font-semibold">$0.001 per credit</span>
          <span className="text-muted-foreground">, so $1 is 1,000 credits</span>
        </p>
        <Why>Fixed here. It sets what the credits agencies already hold are worth, so it changes only with plan prices.</Why>
      </SettingRow>
      <SettingRow label="Rounding">
        <p className="text-sm font-semibold">Always up</p>
        <Why>So a run never charges below what it costs us.</Why>
      </SettingRow>
    </>
  );
}
