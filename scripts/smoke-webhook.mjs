import { createHmac } from "node:crypto";

const SECRET = process.env.SMOKE_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("set SMOKE_WEBHOOK_SECRET before running this smoke test");
  process.exit(1);
}
const URL = "http://localhost:3030/api/webhooks/smoke-test";

async function post(body, signature, label) {
  const headers = { "content-type": "application/json" };
  if (signature) headers["x-signature"] = `sha256=${signature}`;
  const res = await fetch(URL, { method: "POST", headers, body });
  const text = await res.text();
  console.log(`${label}: ${res.status}`, text);
  return res.status;
}

const goodBody = JSON.stringify({ smoke: "phase-3", at: new Date().toISOString() });
const goodSig = createHmac("sha256", SECRET).update(goodBody).digest("hex");

console.log("--- 1) signed correctly ---");
await post(goodBody, goodSig, "signed");

console.log("--- 2) tampered body ---");
await post(JSON.stringify({ smoke: "tampered" }), goodSig, "tampered");

console.log("--- 3) missing signature ---");
await post(goodBody, null, "no-sig");

console.log("--- 4) unknown slug ---");
const res = await fetch("http://localhost:3030/api/webhooks/no-such-slug", {
  method: "POST",
  headers: { "content-type": "application/json", "x-signature": `sha256=${goodSig}` },
  body: goodBody,
});
console.log("unknown-slug:", res.status, await res.text());
