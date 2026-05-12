import { RunNav } from "@/components/run-nav";

export const dynamic = "force-dynamic";

export default async function RunLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <RunNav />
      <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
    </div>
  );
}
