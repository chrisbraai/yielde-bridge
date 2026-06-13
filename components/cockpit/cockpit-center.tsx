"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The CENTER zone is the cockpit's stage. It shows the BuildShip hero (metrics — the conscience of
// the screen) by default, and flips to the advisor chat slot when Chris toggles it. The toggle
// itself lives far away in the bottom AdvisorRail, so this client component owns the mode via React
// context and exposes both a <CockpitCenter/> stage and a <ChatToggle/> control that share it.
//
// IMPORTANT integration seam: this component is mode-agnostic about WHAT the chat is. The server
// page passes a `chat` ReactNode (currently a placeholder). The orchestrator swaps that placeholder
// for the real <AdvisorChat/> with NO changes to this file — see app/cockpit/page.tsx.

type CenterMode = "build" | "chat";

const CenterCtx = createContext<{
  mode: CenterMode;
  setMode: (m: CenterMode) => void;
} | null>(null);

function useCenter() {
  const ctx = useContext(CenterCtx);
  if (!ctx) throw new Error("Cockpit center controls must be used within <CenterProvider>");
  return ctx;
}

/** Wraps the whole cockpit body so both the stage and the bottom-rail toggle share one mode. */
export function CenterProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<CenterMode>("build");
  return <CenterCtx.Provider value={{ mode, setMode }}>{children}</CenterCtx.Provider>;
}

/**
 * The center stage. Renders `hero` (BuildShip metrics) in "build" mode and `chat` (the advisor
 * slot) in "chat" mode. Both are server-rendered ReactNodes passed down as props — this client
 * boundary only decides which one is visible, so the hero keeps its zero-JS server markup.
 */
export function CockpitCenter({
  hero,
  chat,
}: {
  hero: ReactNode;
  chat: ReactNode;
}) {
  const { mode } = useCenter();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {mode === "build" ? hero : chat}
    </div>
  );
}

/**
 * The `[ chat ▸ ]` / `[ ◂ metrics ]` toggle. Lives in the bottom AdvisorRail; flips the shared
 * center mode. Calm by default, accent when chat is live.
 */
export function ChatToggle() {
  const { mode, setMode } = useCenter();
  const toChat = mode === "build";
  return (
    <button
      type="button"
      onClick={() => setMode(toChat ? "chat" : "build")}
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors " +
        (toChat
          ? "border-blue-700/50 bg-blue-900/20 text-blue-300 hover:bg-blue-900/35"
          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800")
      }
      title={toChat ? "open the advisor chat in the center stage" : "return to build/ship metrics"}
    >
      {toChat ? (
        <>
          <span className="text-zinc-500">[</span> chat{" "}
          <span aria-hidden>▸</span> <span className="text-zinc-500">]</span>
        </>
      ) : (
        <>
          <span className="text-zinc-500">[</span> <span aria-hidden>◂</span> metrics{" "}
          <span className="text-zinc-500">]</span>
        </>
      )}
    </button>
  );
}
