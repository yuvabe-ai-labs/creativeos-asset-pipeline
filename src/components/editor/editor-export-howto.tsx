import type { ExportSummary } from "@/lib/editor/export-run";
import { SEQUENCE_NAME } from "@/lib/editor/sequence-plan";

/** "Open it in Premiere" (Export artboard; D389): Premiere's Import screen ignores the XML, so the
 *  steps say exactly where to drag it. The names are this export's own (D416); exports made
 *  before then fall back to the old fixed names. */
export function EditorExportHowTo({ xmlName = "creativeos-premiere.xml", sequenceName = SEQUENCE_NAME }: { xmlName?: string; sequenceName?: string }) {
  const steps = [
    <>Unzip it somewhere permanent, not a temp folder.</>,
    <>Drag <b className="break-all">{xmlName}</b> into Premiere&apos;s <b>Project panel</b>. Premiere&apos;s Import screen doesn&apos;t read it.</>,
    <>Open the <b>{sequenceName}</b> sequence. If clips show offline, link one to the <b>media</b> folder and Premiere finds the rest.</>,
  ];
  return (
    <div className="flex flex-col gap-3">
      <span className="text-eyebrow text-muted-foreground">Open it in Premiere</span>
      <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm leading-snug">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="grid size-[22px] flex-none place-items-center rounded-full border border-border text-xs font-semibold">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "What you'll see": the sequence's tracks, only those this reel has. */
export function EditorExportTracks({ summary, dubLabel }: { summary: ExportSummary; dubLabel: string | null }) {
  const rows = [
    summary.captions > 0 && { track: "V2", text: `${summary.captions} caption title${summary.captions === 1 ? "" : "s"}`, tone: "bg-primary/60" },
    { track: "V1", text: `${summary.clips} clip${summary.clips === 1 ? "" : "s"}, trimmed`, tone: "bg-chart-2/70" },
    { track: "A1·2", text: "Original sound, linked", tone: "bg-chart-3/70" },
    summary.dubs > 0 && { track: "A3·4", text: `${dubLabel ? `${dubLabel} dub` : "Dub"}, linked`, tone: "bg-chart-4/70" },
  ].filter(Boolean) as Array<{ track: string; text: string; tone: string }>;

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-eyebrow text-muted-foreground">What you&apos;ll see</span>
      <div className="flex flex-col gap-1 rounded-xl bg-foreground p-3 text-xs tabular-nums text-background">
        {rows.map((r) => (
          <div key={r.track} className="flex items-center gap-2">
            <span className="w-[30px] opacity-60">{r.track}</span>
            <span className={`flex h-5 flex-1 items-center rounded px-1.5 ${r.tone}`}>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
