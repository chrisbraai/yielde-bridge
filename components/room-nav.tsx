"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ROOMS = [
  { href: "/day", label: "Day" },
  { href: "/configure", label: "Configure" },
  { href: "/run", label: "Run" },
  { href: "/inspect", label: "Inspect" },
  { href: "/library", label: "Library" },
] as const;

export function RoomNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-mono font-semibold text-zinc-100 tracking-tight">
            <span className="text-blue-500">◆</span> Yielde Bridge
          </Link>
          <nav className="flex items-center gap-1">
            {ROOMS.map((room) => {
              const active = pathname === room.href || pathname.startsWith(room.href + "/");
              return (
                <Link
                  key={room.href}
                  href={room.href}
                  className={
                    "px-3 py-1.5 text-sm rounded-md transition-colors " +
                    (active
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900")
                  }
                >
                  {room.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="font-mono">chris</span>
          <span className="text-zinc-700">·</span>
          <span className="font-mono text-xs">localhost:3030</span>
        </div>
      </div>
    </header>
  );
}
