"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Tiny live-updating engine for the cockpit. Every `intervalMs` it calls router.refresh(), which
// re-runs the server page (force-dynamic) and reconciles the fresh RSC payload into the existing
// tree — no full reload, no scroll jump. Chris fullscreens this; it must stay current on its own.
//
// React 19 purity: nothing impure runs during render. `now` lives in state and is updated only
// inside effects (never synchronously in the effect body — we let the first tick land), matching
// the documented pattern in webhook-tail-live.tsx.

type Props = {
  /** how often to re-run the server page, in ms */
  intervalMs?: number;
};

export function AutoRefresh({ intervalMs = 45_000 }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(0); // 0 = "not yet measured" sentinel (avoids Date.now() in render)
  const [lastRefresh, setLastRefresh] = useState(0);

  // Periodic server-page refresh.
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      setLastRefresh(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  // 1Hz clock so we can show a calm "synced Ns ago" without an impure render.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsAgo =
    lastRefresh > 0 && now > 0 ? Math.max(0, Math.floor((now - lastRefresh) / 1000)) : null;

  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] text-zinc-600"
      title={`auto-refreshing every ${Math.round(intervalMs / 1000)}s`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      live{secondsAgo !== null ? ` · synced ${secondsAgo}s ago` : ""}
    </span>
  );
}
