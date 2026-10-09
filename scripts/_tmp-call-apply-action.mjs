/**
 * Calls submitApplicationAction over HTTP the same way the browser does:
 * React's own encodeReply builds the Server Action reply body, so the FormData
 * argument is encoded exactly as the client would encode it.
 *
 * Usage: node scripts/_tmp-call-apply-action.mjs <actionId> <email> <file> [slug]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.browser.js";

const [actionId, email, filePath, slug = "senior-oracle-erp-consultant"] = process.argv.slice(2);
const origin = "http://localhost:3000";
const url = `${origin}/jobs/${slug}/apply`;

const payload = new FormData();
payload.set("slug", slug);
payload.set("firstName", "Nadia");
payload.set("lastName", "Okonkwo");
payload.set("email", email);
payload.set("phone", "+1 703 555 0142");
payload.set("location", "Ashburn, VA");
payload.set("linkedinUrl", "https://linkedin.com/in/nadia-okonkwo");
if (filePath !== "none") {
  const bytes = readFileSync(filePath);
  payload.set("resume", new File([bytes], basename(filePath), { type: "application/pdf" }));
}

const body = await encodeReply([payload]);

const res = await fetch(url, {
  method: "POST",
  headers: {
    Origin: origin,
    Accept: "text/x-component",
    "Next-Action": actionId,
  },
  body,
});

console.log("status", res.status);
const text = await res.text();
// The action's return value is the last flight row.
for (const row of text.split("\n")) {
  if (row.includes('"ok"')) console.log("RESULT", row);
}
