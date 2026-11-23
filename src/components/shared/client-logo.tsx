import { cn } from "@/lib/utils";
import { initials } from "@/lib/format/initials";

// A client's logo, or its initials when it has none: the one rendering of "this client's mark",
// used by the home tile, the client header and every ClientMark. The container (its size, border
// and padding) belongs to the caller.
export function ClientLogo({
  name,
  logoUrl,
  alt = "",
  imgClassName,
  initialsClassName,
}: {
  name: string;
  logoUrl: string | null;
  alt?: string;
  imgClassName?: string;
  initialsClassName?: string;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={alt} className={cn("max-h-full max-w-full object-contain", imgClassName)} />;
  }
  return (
    <span aria-hidden={alt === "" ? true : undefined} className={cn("font-display font-semibold text-muted-foreground", initialsClassName)}>
      {initials(name)}
    </span>
  );
}
