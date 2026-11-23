import { AdminSectionNav } from "@/components/admin/admin-section-nav";

// No requireSuperAdmin here: each page checks it, and a layout guard would resolve the caller
// twice per request.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminSectionNav />
      {children}
    </>
  );
}
