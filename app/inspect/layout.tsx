import { InspectNav } from "@/components/inspect-nav";

export const dynamic = "force-dynamic";

export default async function InspectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <InspectNav />
      <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
    </div>
  );
}
