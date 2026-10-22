/** A canvas's page. `addScriptId` asks the canvas to add that approved script once it can edit
 *  (AddScriptFromUrl reads it, then removes it from the URL). */
export function canvasHref(clientSlug: string, canvasSlug: string, addScriptId?: string): string {
  const base = `/clients/${clientSlug}/canvases/${canvasSlug}`;
  return addScriptId ? `${base}?addScript=${encodeURIComponent(addScriptId)}` : base;
}
