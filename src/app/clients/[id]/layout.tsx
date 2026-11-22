import { Suspense, type ReactNode } from "react";
import { loadFrameClient } from "@/lib/journey/load";
import { ClientFrame } from "@/components/journey/client-frame";
import { FrameTabs } from "@/components/journey/frame-tabs";
import { FrameGuide } from "@/components/journey/frame-guide";

// The frame around every client screen (copilot journey spec §4.1, D506). The layout itself does
// not wait for data: a layout that awaits blocks navigation and hides every loading.tsx under it
// (node_modules/next/dist/docs/.../file-conventions/layout.md, "Uncached and runtime data"). The
// tabs and the guide each stream in behind their own Suspense boundary, from one shared read.
export default function ClientLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const frame = params.then(({ id }) => loadFrameClient(id)); // `id` is the client slug

  return (
    <ClientFrame
      tabs={<Suspense fallback={null}><FrameTabs frame={frame} /></Suspense>}
      guide={<Suspense fallback={null}><FrameGuide frame={frame} /></Suspense>}
    >
      {children}
    </ClientFrame>
  );
}
