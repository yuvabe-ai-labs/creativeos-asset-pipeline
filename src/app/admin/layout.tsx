import { AdminSectionNav } from "@/components/admin/admin-section-nav";

// No requireSuperAdmin here: each page checks it, and a layout guard would resolve the caller
// twice per request.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-6 pt-8">
        <AdminSectionNav />
      </div>
      {children}
    </>
  );
}
