import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type Props = {
  client: { slug: string; name: string };
  /** The editor's own crumb ("New avatar" / "Edit avatar"); omitted on the gallery. */
  current?: string;
};

export function AvatarBreadcrumb({ client, current }: Props) {
  return (
    <Breadcrumb className="animate-rise shrink-0">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href="/">Clients</Link>} />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          {current ? (
            <BreadcrumbLink render={<Link href={`/clients/${client.slug}/avatar`}>Avatars</Link>} />
          ) : (
            <BreadcrumbPage>Avatars</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {current && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{current}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
