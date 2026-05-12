// Shared timestamp formatting. Kernel writes everything as ISO 8601 in audit.jsonl /
// runtime.db; UI wants the more compact "YYYY-MM-DD HH:MM:SS" form, optionally without
// fractional seconds.

export type FmtTimestampOptions = {
  /** drop fractional seconds (e.g. `.378Z`) before the trailing Z. */
  stripMillis?: boolean;
};

export function fmtTimestamp(ts: string, opts: FmtTimestampOptions = {}): string {
  let out = ts.replace("T", " ");
  if (opts.stripMillis) out = out.replace(/\.\d+(?=Z?$)/, "");
  return out.replace("Z", "");
}
