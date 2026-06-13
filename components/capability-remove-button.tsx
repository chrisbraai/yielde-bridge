"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CapabilityRemoveButton({ name }: { name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setConfirming(false);
      void remove();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => {
        setConfirming(false);
        timerRef.current = null;
      }, 2500);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/library/remove", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "capability", name }),
      });
      if (!res.ok) {
        console.error("capability remove failed", await res.text());
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={confirming ? `Confirm remove ${name}` : `Remove ${name}`}
      title={confirming ? "Click again to confirm" : "Remove"}
      className={
        "w-6 h-6 rounded grid place-items-center text-sm transition-all " +
        (confirming
          ? "text-red-400 bg-red-900/30 border border-red-700/50"
          : "text-zinc-600 hover:text-red-400 hover:bg-zinc-800") +
        (busy ? " opacity-50 cursor-wait" : " cursor-pointer")
      }
    >
      ×
    </button>
  );
}
