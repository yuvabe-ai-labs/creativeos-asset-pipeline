"use client";

import { Link2 } from "lucide-react";
import type { UpstreamImage } from "@/lib/video-gen/api";

// Used by VideoGenFocusView (wired in Task 6 of the refactor).

type ImageRole = "start_frame" | "end_frame" | "reference";

const ROLES: ImageRole[] = ["start_frame", "end_frame", "reference"];
const ROLE_LABELS: Record<ImageRole, string> = {
  start_frame: "Start",
  end_frame: "End",
  reference: "Ref",
};

type Props = {
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  onRoleChange: (imageId: string, role: ImageRole) => void;
};

export function VideoGenImageRoles({ images, imageRoles, onRoleChange }: Props) {
  if (images.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Link2 className="size-3.5 text-primary" strokeWidth={1.5} />
        <span className="text-eyebrow">Image Inputs</span>
      </div>
      <ul className="space-y-1.5">
        {images.map((img) => {
          const role: ImageRole =
            imageRoles[img.id] ?? (img.type === "image-gen" ? "start_frame" : "reference");
          return (
            <li
              key={img.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2"
            >
              <div className="size-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.imageUrl} alt="" className="size-full object-cover" />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {img.type}
              </span>
              <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                {ROLES.map((r, i) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onRoleChange(img.id, r)}
                    className={[
                      "px-2 py-0.5 text-[0.65rem] font-medium transition-colors",
                      i > 0 ? "border-l border-border" : "",
                      role === r
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
