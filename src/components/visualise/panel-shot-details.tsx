import type { Shot } from "@/lib/scripts/schema";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-eyebrow">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

// D465 — the whole shot in the panel view: the sheet's tile shows only the action and the spoken
// line, so the on-screen text and who is on screen live here.
export function PanelShotDetails({ shot, castNames }: { shot: Shot; castNames: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Action">{shot.visual}</Field>
      {shot.vo && <Field label="Spoken">“{shot.vo}”</Field>}
      {shot.onScreenText && <Field label="On-screen text">{shot.onScreenText}</Field>}
      <Field label="On screen">{castNames.length > 0 ? castNames.join(", ") : "Nobody (B-roll)"}</Field>
    </div>
  );
}
