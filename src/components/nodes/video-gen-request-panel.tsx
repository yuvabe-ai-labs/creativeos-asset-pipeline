"use client";

import { Image as ImageIcon, PencilLine, SlidersHorizontal } from "lucide-react";
import {
  videoGenClientModelMap,
  resolveVideoModelId,
} from "@/lib/video-gen/client-models";
import {
  describeAllVersionParams,
  type VersionParamEntry,
} from "@/lib/generations/version-params";
import { LeftSection } from "./focus-left-section";
import type { VideoGenVersionSummary } from "./video-gen-version-history";

type ImageRole = "start_frame" | "end_frame" | "reference";

const ROLE_LABEL: Record<ImageRole, string> = {
  start_frame: "Start",
  end_frame: "End",
  reference: "Ref",
};

/**
 * The stored object's filename, for labelling an image the way the rail does ("mother.png").
 *
 * The raw URL is never rendered as text: it is a ~120-character unbreakable string, and since
 * the pane's column is a flex item, that string's min-content width overrides the column's
 * `w-[54%]` and squeezes the video column beside it. The full URL stays on the link's href.
 */
function fileLabel(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : url;
  } catch {
    return url;
  }
}

/**
 * The images the request carried, in the order the provider receives them: first frame, last
 * frame, then references. Built from the roles frozen on the version rather than from the
 * node's current connections — the operator may have rewired the canvas since.
 */
function requestImages(
  inputs: VideoGenVersionSummary["inputsUsed"],
): Array<{ role: ImageRole; url: string }> {
  const images: Array<{ role: ImageRole; url: string }> = [];
  if (inputs?.startFrameUrl) images.push({ role: "start_frame", url: inputs.startFrameUrl });
  if (inputs?.endFrameUrl) images.push({ role: "end_frame", url: inputs.endFrameUrl });
  for (const url of inputs?.referenceUrls ?? []) images.push({ role: "reference", url });
  return images;
}

/**
 * Duration is stored as a bare count of seconds (Kling's slider stores 6, Veo's select "6"), so
 * the row appends the unit rather than reporting a naked number. Veo's spec already carries the
 * unit in its label ("Duration (s)"); that half is dropped here so both models read "Duration 6s".
 */
function durationDisplay(p: VersionParamEntry): { label: string; value: string } {
  const value = p.value || "None";
  if (p.name !== "duration" || value === "None") return { label: p.label, value };
  return { label: p.label.replace(/\s*\(s\)$/i, ""), value: `${value}s` };
}

/**
 * Read-only view of what a video generation actually sent: the resolved prompt, the images by
 * role, and the settings — all frozen into node_versions at generate time (D22, never edited).
 * Rendered inside the "Sent to model" rail pane, which supplies no heading of its own.
 *
 * Everything here reports what the version RECORDED. A field the version never carried is left
 * out rather than shown empty: Kling has no aspect ratio (it infers one from the input frame),
 * and a row reading "Aspect ratio —" would claim a value was sent when none was.
 */
export function VideoGenRequestPanel({ version }: { version: VideoGenVersionSummary }) {
  const model = version.modelUsed
    ? videoGenClientModelMap[resolveVideoModelId(version.modelUsed)]
    : undefined;
  const images = requestImages(version.inputsUsed);
  const params = describeAllVersionParams(model?.params, version.paramsUsed);
  const prompt = version.inputsUsed?.prompt?.trim() ?? "";

  return (
    <div className="flex flex-col gap-8 px-6 py-5">
      <LeftSection icon={PencilLine} label="Prompt">
        {prompt ? (
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-relaxed text-foreground shadow-card">
            {prompt}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No prompt recorded for this version.
          </p>
        )}
      </LeftSection>

      {images.length > 0 && (
        <LeftSection icon={ImageIcon} label="Images" badge={String(images.length)}>
          <ul className="flex flex-col gap-2">
            {images.map(({ role, url }, i) => (
              <li
                key={`${role}-${i}-${url}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 shadow-card"
              >
                <img
                  src={url}
                  alt=""
                  className="size-12 shrink-0 rounded-md border border-border object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className={
                      role === "start_frame"
                        ? "w-fit rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary"
                        : "w-fit rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] font-semibold text-muted-foreground"
                    }
                  >
                    {ROLE_LABEL[role]}
                  </span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    title={url}
                    className="truncate text-xs text-primary underline decoration-dotted underline-offset-2"
                  >
                    {fileLabel(url)}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </LeftSection>
      )}

      <LeftSection icon={SlidersHorizontal} label="Settings">
        <dl className="flex flex-col gap-px overflow-hidden rounded-lg border border-border bg-border shadow-card">
          <ParamRow
            label="Model"
            value={model?.label ?? version.modelUsed ?? "—"}
            note={model?.providerLabel}
          />
          {params.map((p) =>
            p.longForm ? (
              <div key={p.name} className="flex flex-col gap-1 bg-card px-3 py-2.5">
                <dt className="text-eyebrow text-muted-foreground">{p.label}</dt>
                <dd className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {p.value.trim() || "None"}
                </dd>
              </div>
            ) : (
              <ParamRow key={p.name} {...durationDisplay(p)} />
            ),
          )}
        </dl>
      </LeftSection>
    </div>
  );
}

function ParamRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-card px-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-2 text-sm font-medium text-foreground">
        {note && <span className="text-xs font-normal text-muted-foreground">{note}</span>}
        <span>{value}</span>
      </dd>
    </div>
  );
}
