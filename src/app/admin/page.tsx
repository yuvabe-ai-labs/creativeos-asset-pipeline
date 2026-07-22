import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listOrgsWithClientCount } from "@/lib/db/organizations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizations — Admin" };

export default async function AdminOrgsPage() {
  await requireSuperAdmin();
  const orgs = await listOrgsWithClientCount();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Organizations
        </h1>
        <Button
          nativeButton={false}
          render={<Link href="/admin/orgs/new">+ New org</Link>}
        />
      </div>
      <div className="flex flex-col gap-3">
        {orgs.map((o) => (
          <Card key={o.id} className="p-4 shadow-card">
            <Link href={`/admin/orgs/${o.id}`} className="flex flex-col">
              <span className="font-medium">{o.name}</span>
              <span className="text-xs text-muted-foreground">
                {o.monthly_credit_limit === null
                  ? "Unlimited credits"
                  : `Limit ${o.monthly_credit_limit}`}
                {" · "}
                {o.client_count} client{o.client_count === 1 ? "" : "s"}
              </span>
            </Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
