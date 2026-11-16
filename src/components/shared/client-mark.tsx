import { cn } from "@/lib/utils";
import { ClientLogo } from "./client-logo";

const SIZES = {
  xs: "size-6 rounded-md p-0.5 text-[0.55rem]",
  sm: "size-9 rounded-lg p-1 text-xs",
  md: "size-12 rounded-xl p-1.5 text-sm",
} as const;

// A client's logo (or initials) on a small white tile: the people screens' client marker, in
// a ClientStack, the client filter, the person panel and the Members header (md).
export function ClientMark({
  name,
  logoUrl,
  size = "xs",
  className,
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center overflow-hidden border bg-card", SIZES[size], className)}
      title={name}
    >
      <ClientLogo name={name} logoUrl={logoUrl} initialsClassName="leading-none tracking-tight" />
    </span>
  );
}
