import { LibraryNav } from "@/components/library-nav";

export const dynamic = "force-dynamic";

export default async function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <LibraryNav />
      <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
    </div>
  );
}
