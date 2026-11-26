import { Skeleton } from "@/components/ui/skeleton";
import { AgenciesTableHead } from "@/components/admin/agencies/agencies-table-head";
import { AGENCY_WIDE, AGENCY_WIDEST } from "@/components/admin/agencies/agency-row";

const ROWS = 6;

// Mirrors Admin › Agencies (src/app/admin/(agencies)/page.tsx): the title and Add an agency, the
// search and chips, then the table with its real headers and a footer saying it is loading.
export function AgenciesListSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <Skeleton className="h-10 w-full rounded-lg md:max-w-md md:flex-1" />
        <div className="flex flex-wrap gap-1.5">
          {[44, 110, 104, 74, 116, 104].map((w, i) => (
            <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="rounded-xl border bg-card shadow-card">
        <table aria-busy="true" className="w-full border-separate border-spacing-0">
          <AgenciesTableHead />
          <tbody>
            {Array.from({ length: ROWS }, (_, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-lg" />
                    <div className="grid flex-1 gap-2">
                      <Skeleton className="h-2.5 w-28" />
                      <Skeleton className="h-2.5 w-40 max-w-full" />
                    </div>
                  </div>
                </td>
                <td className={`${AGENCY_WIDE} px-3.5 py-3`}><Skeleton className="h-2.5 w-28" /></td>
                <td className={`${AGENCY_WIDE} px-3.5 py-3`}><Skeleton className="h-2.5 w-16" /></td>
                <td className={`${AGENCY_WIDE} px-3.5 py-3`}><Skeleton className="h-2.5 w-36" /></td>
                <td className={`${AGENCY_WIDEST} px-3.5 py-3`}><Skeleton className="h-2.5 w-16" /></td>
                <td className="w-px px-3.5 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t px-4 py-3 text-[0.8rem] text-muted-foreground">Loading agencies</div>
      </div>
    </main>
  );
}
