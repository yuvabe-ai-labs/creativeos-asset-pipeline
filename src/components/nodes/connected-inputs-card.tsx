"use client";

import { Link2, PencilLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type UpstreamNode = {
  id: string;
  label: string;
  type: string;
  fileUrl?: string;
  fileKind?: string;
};

export type ConnectedPreview = {
  nodeId: string;
  label: string;
  type: string;
  text: string;
  fileUrl?: string;
  fileKind?: string;
};

function ContextCard({
  icon: Icon,
  label,
  badge,
  children,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-primary" />
          <span className="text-eyebrow">{label}</span>
        </div>
        {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

type Props = {
  upstream: UpstreamNode[];
  preview: ConnectedPreview[];
  onEditUpstream: (nodeId: string) => void;
};

export function ConnectedInputsCard({ upstream, preview, onEditUpstream }: Props) {
  return (
    <ContextCard
      icon={Link2}
      label="Connected · Inputs"
      badge={`${upstream.length} input${upstream.length === 1 ? "" : "s"}`}
    >
      {upstream.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Connect a Script, File, or Note node to feed this prompt.
        </p>
      ) : (
        <ul className="space-y-2">
          {upstream.map((u) => {
            const p = preview.find((c) => c.nodeId === u.id);
            const text = p?.text ?? "";
            const fileUrl = p?.fileUrl ?? u.fileUrl;
            const fileKind = p?.fileKind ?? u.fileKind;

            return (
              <li key={u.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{u.label}</span>
                  <button
                    type="button"
                    onClick={() => onEditUpstream(u.id)}
                    title={`Edit ${u.label} node`}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <PencilLine className="size-3" />
                    Edit
                  </button>
                </div>

                {u.type === "file" && fileKind === "image" && fileUrl ? (
                  // Image file: show thumbnail
                  <img
                    src={fileUrl}
                    alt={u.label}
                    className="mt-2 h-32 w-full rounded-md border border-border object-cover"
                  />
                ) : text.trim() ? (
                  u.type === "script" ? (
                    // Script: compact structured summary
                    <ScriptSummary text={text} />
                  ) : (
                    <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/70">
                      {text}
                    </pre>
                  )
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {u.type === "script"
                      ? "Open this Script node and generate content first."
                      : u.type === "file"
                        ? "No file content yet — open this File node and attach a file."
                        : "No output yet — open this node and add content first."}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ContextCard>
  );
}

// Compact script summary: title prominent, then a quick shot count line.
function ScriptSummary({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  const titleLine = lines.find((l) => l.startsWith("Title:"));
  const title = titleLine ? titleLine.replace("Title:", "").trim() : null;
  const shotCount = lines.filter((l) => /^\s+\d+\./.test(l)).length;
  const rest = lines.filter((l) => l !== titleLine && !/^\s+\d+\./.test(l));

  return (
    <div className="mt-1.5 space-y-1">
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      {shotCount > 0 && (
        <p className="text-xs text-muted-foreground">{shotCount} visual shot{shotCount !== 1 ? "s" : ""}</p>
      )}
      {rest.slice(0, 3).map((line, i) => (
        <p key={i} className="text-xs text-foreground/70 truncate">{line}</p>
      ))}
    </div>
  );
}
