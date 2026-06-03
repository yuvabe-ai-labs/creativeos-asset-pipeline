import type { ReactNode } from "react";

// Renders a parsed reel object as readable sections. Falls back to raw JSON if
// the shape doesn't look like a reel (e.g. an older/odd parse).
type Reel = {
  type?: string;
  duration?: string;
  strategic_objective?: string;
  visual_script?: {
    shots?: { description?: string; duration?: string }[];
    execution_refinement?: string;
  };
  on_screen_text?: { intro?: string; body?: string[]; outro?: string };
  voiceover?: string;
  music_sound?: string;
  caption?: string;
  cta?: string;
  thumbnail_hook?: string;
  qc_notes?: string[];
  product_links?: string[];
};

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function ReelOutput({ data }: { data: Record<string, unknown> }) {
  const r = data as Reel;
  const looksLikeReel =
    r.strategic_objective !== undefined ||
    r.visual_script !== undefined ||
    r.on_screen_text !== undefined;

  if (!looksLikeReel) {
    return (
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  const shots = r.visual_script?.shots ?? [];
  const body = r.on_screen_text?.body ?? [];
  const meta = [r.type, r.duration].filter(Boolean).join(" · ");
  const ost = r.on_screen_text;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
      {meta && <p className="text-eyebrow">{meta}</p>}

      {r.strategic_objective && (
        <Section label="Objective">{r.strategic_objective}</Section>
      )}

      {shots.length > 0 && (
        <Section label="Visual script">
          <ol className="space-y-1">
            {shots.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span>
                  {s.description}
                  {s.duration ? (
                    <span className="text-muted-foreground"> ({s.duration})</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(ost?.intro || body.length > 0 || ost?.outro) && (
        <Section label="On-screen text">
          {ost?.intro && (
            <p>
              <span className="text-muted-foreground">Intro: </span>
              {ost.intro}
            </p>
          )}
          {body.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {ost?.outro && (
            <p>
              <span className="text-muted-foreground">Outro: </span>
              {ost.outro}
            </p>
          )}
        </Section>
      )}

      {r.voiceover && r.voiceover.toLowerCase() !== "no voiceover" && (
        <Section label="Voiceover">{r.voiceover}</Section>
      )}
      {r.music_sound && <Section label="Music & sound">{r.music_sound}</Section>}
      {r.caption && <Section label="Caption">{r.caption}</Section>}

      {(r.cta || r.thumbnail_hook) && (
        <Section label="CTA">
          {r.cta && <p>{r.cta}</p>}
          {r.thumbnail_hook && (
            <p className="text-muted-foreground">Hook: {r.thumbnail_hook}</p>
          )}
        </Section>
      )}

      {(r.qc_notes?.length ?? 0) > 0 && (
        <Section label="QC notes">
          <ul className="list-disc space-y-0.5 pl-4">
            {r.qc_notes!.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
