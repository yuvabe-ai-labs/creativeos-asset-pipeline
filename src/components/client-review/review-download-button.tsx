import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** D472 — saves the cut. A link, so the browser's own download handles a large file on any phone. */
export function ReviewDownloadButton({ token, className }: { token: string; className?: string }) {
  return (
    <Button
      variant="outline"
      nativeButton={false}
      className={className}
      render={<a href={`/api/r/${encodeURIComponent(token)}/download`} download />}
    >
      <Download className="size-4" strokeWidth={1.5} />
      Download video
    </Button>
  );
}
