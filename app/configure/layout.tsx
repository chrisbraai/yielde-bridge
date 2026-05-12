import { ConfigureNav } from "@/components/configure-nav";

export const dynamic = "force-dynamic";

export default async function ConfigureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <ConfigureNav />
      <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
    </div>
  );
}
