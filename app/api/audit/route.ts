import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs } from "../../../db/schema";
import { getRequestUser } from "../../../lib/identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  try {
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") ?? 100)));
    const events = await getDb()
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit);

    return Response.json({
      events,
      limit,
      requestedBy: user.email,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar a auditoria." },
      { status: 500 },
    );
  }
}
