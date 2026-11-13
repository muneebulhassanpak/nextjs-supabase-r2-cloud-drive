import { connection } from "next/server";

import { checkHealth } from "@/server/services/health";

/** Database and storage check, used after every deploy and by the e2e smoke test. */
export async function GET() {
  await connection();
  const report = await checkHealth();
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
