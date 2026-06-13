"use client";

import { useState } from "react";
import { FileText, Paperclip, Sparkles, ChevronRight, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export type UpstreamNode = {
  id: string;
  label: string;
  type: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

export type ConnectedPreview = {
  nodeId: string;
  label: string;
  type: string;
  text: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

type Props = {
  upstream: UpstreamNode[];
  preview: ConnectedPreview[];
};

export function ConnectedInputsCard({ upstream, preview }: Props) {
  // Sort: shot first (primary context), then script/full-reel, then others.
  const sorted = [...upstream].sort((a, b) => {
    const rank = (t: string) => (t === "shot" ? 0 : t === "script" ? 1 : 2);
    return rank(a.type) - rank(b.type);
  });

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(upstream.filter((u) => u.type === "shot" || u.type === "script").map((u) => u.id)),
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (upstream.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a Shot, Script, File, or Note node to feed this prompt.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {sorted.map((u) => {
        const p = preview.find((c) => c.nodeId === u.id);
        const text = p?.text ?? "";
        const fileUrl = p?.fileUrl ?? u.fileUrl;
        const fileKind = p?.fileKind ?? u.fileKind;
        const useLlm = p?.useLlm ?? u.useLlm;
        const isExpanded = expanded.has(u.id);
        const isImage = u.type === "file" && fileKind === "image" && !!fileUrl;

        return (
          <li key={u.id} className="rounded-lg border border-border overflow-hidden">
            {/* Header row — click anywhere on left side to toggle */}
            <div className="flex items-center gap-1.5 px-2.5 py-2">
              <button
                type="button"
                onClick={() => toggle(u.id)}
                className="flex-1 flex items-center gap-1.5 min-w-0 text-left"
              >
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 text-muted-foreground transition-transform duration-200",
                    isExpanded && "rotate-90",
                  )}
                />
                {/* Micro-thumbnail visible in collapsed state for image files */}
                {isImage && !isExpanded && (
                  <img
                    src={fileUrl}
                    alt=""
                    className="size-5 shrink-0 rounded object-cover border border-border"
                  />
                )}
                <NodeIcon type={u.type} />
                <span className="text-xs font-semibold truncate text-foreground">{u.label}</span>
                {useLlm && (
                  <span className="shrink-0 rounded px-1 py-0.5 text-[0.6rem] font-semibold leading-none bg-primary/10 text-primary">
                    LLM
                  </span>
                )}
              </button>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-3 pb-2.5 space-y-1">
                {isImage ? (
                  <img
                    src={fileUrl}
                    alt={u.label}
                    className="aspect-4/3 w-full rounded-md border border-border object-cover"
                  />
                ) : useLlm && !text.trim() ? (
                  <p className="text-xs text-muted-foreground">
                    Run extraction in this File node first.
                  </p>
                ) : text.trim() ? (
                  u.type === "shot" ? (
                    <CompactShotSummary text={text} />
                  ) : u.type === "script" ? (
                    <CompactScriptSummary text={text} />
                  ) : (
                    <p className="text-xs text-foreground/70 line-clamp-3 leading-relaxed">
                      {text}
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {u.type === "shot"
                      ? "No shot description yet — edit the Shot node."
                      : u.type === "script"
                        ? "Open this Script node and generate content first."
                        : u.type === "file"
                          ? "No file content yet — open this File node and attach a file."
                          : "No output yet — open this node and add content first."}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NodeIcon({ type }: { type: string }) {
  if (type === "shot") return <Clapperboard className="size-3 shrink-0 text-primary" />;
  if (type === "script") return <FileText className="size-3 shrink-0 text-primary" />;
  if (type === "file") return <Paperclip className="size-3 shrink-0 text-primary" />;
  if (type === "prompt") return <Sparkles className="size-3 shrink-0 text-primary" />;
  return <FileText className="size-3 shrink-0 text-muted-foreground" />;
}

function CompactShotSummary({ text }: { text: string }) {
  const descLine = text.split("\n").find((l) => l.startsWith("Shot:"));
  const desc = descLine ? descLine.replace("Shot:", "").trim() : null;
  const durLine = text.split("\n").find((l) => l.startsWith("Duration:"));
  const dur = durLine ? durLine.replace("Duration:", "").trim() : null;
  return (
    <div className="space-y-0.5">
      {desc && <p className="text-xs font-medium text-foreground line-clamp-2 leading-relaxed">{desc}</p>}
      {dur && <p className="text-xs text-muted-foreground">{dur}</p>}
    </div>
  );
}

function CompactScriptSummary({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  const titleLine = lines.find((l) => l.startsWith("Title:"));
  const title = titleLine ? titleLine.replace("Title:", "").trim() : null;
  const shotCount = lines.filter((l) => /^\s+\d+\./.test(l)).length;

  return (
    <div className="space-y-0.5">
      {title && <p className="text-xs font-medium text-foreground truncate">{title}</p>}
      <p className="text-xs text-muted-foreground">
        {shotCount > 0 ? `${shotCount} visual shot${shotCount !== 1 ? "s" : ""}` : "No shots extracted"}
      </p>
    </div>
  );
}
