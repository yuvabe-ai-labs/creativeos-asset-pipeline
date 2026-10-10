"use client";

import { useShotPresenter } from "@/hooks/use-shot-presenter";

// D299 — on a prompt card, a small face when the script's presenter is in this shot, so the
// canvas shows which shots carry the presenter without opening each one.
export function PresenterFace({ promptNodeId }: { promptNodeId: string }) {
  const presenter = useShotPresenter(promptNodeId);
  if (!presenter?.inShot || !presenter.avatar.front) return null;
  const label = `Avatar: ${presenter.avatar.name || "Unnamed"} — in this shot`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a storage URL, sized by CSS
    <img
      src={presenter.avatar.front.url}
      alt={label}
      title={label}
      className="size-4 shrink-0 rounded-full object-cover ring-1 ring-border"
    />
  );
}
