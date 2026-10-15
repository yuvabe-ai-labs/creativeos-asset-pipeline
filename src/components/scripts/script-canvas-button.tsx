"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NewCanvasDialog } from "@/components/canvases/new-canvas-dialog";
import { canvasHref } from "@/lib/canvases/paths";

/** D372 — an approved script's next step: make its canvas (the script lands on it, parsing), or
 *  open the one it already has. One canvas per script. */
export function ScriptCanvasButton({ clientId, clientSlug, script, canvas }: {
  clientId: string;
  clientSlug: string;
  script: { id: string; title: string };
  canvas: { slug: string } | null;
}) {
  if (canvas) {
    return (
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={canvasHref(clientSlug, canvas.slug)} />}>
        Open canvas
      </Button>
    );
  }
  return <NewCanvasDialog clientId={clientId} clientSlug={clientSlug} fromScript={script} trigger={<Button size="sm">Create canvas</Button>} />;
}
