import { sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, integrationStates } from "../../../../../db/schema";
import { getRequestUser } from "../../../../../lib/identity";
import { getRuntimeEnv } from "../../../../../lib/runtime-env";

export async function POST(request: Request) {
  const runtime = getRuntimeEnv();
  const user = getRequestUser(request);
  if (!runtime.QIVE_API_ID || !runtime.QIVE_API_KEY) {
    return Response.json(
      {
        status: "NOT_CONFIGURED",
        message: "Informe QIVE_API_ID e QIVE_API_KEY nas configurações protegidas.",
      },
      { status: 503 },
    );
  }

  const baseUrl = runtime.QIVE_BASE_URL ?? "https://api.arquivei.com.br";
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/v2/dfe/nfe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-ID": runtime.QIVE_API_ID,
        "X-API-KEY": runtime.QIVE_API_KEY,
        "X-Use-ApiGateway": runtime.QIVE_USE_API_GATEWAY ?? "always",
      },
      body: JSON.stringify({
        fields: ["AccessKey", "EmissionDate"],
        Filters: {},
        Limit: 1,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const message = `Qive respondeu HTTP ${response.status}.`;
      await updateIntegration("ERROR", message, Date.now() - started);
      return Response.json({ status: "ERROR", message }, { status: 502 });
    }

    await updateIntegration("ONLINE", null, Date.now() - started);
    await getDb().insert(auditLogs).values({
      userEmail: user.email,
      action: "TEST_QIVE_CONNECTION",
      entityType: "INTEGRATION",
      entityId: "qive",
      newValue: "ONLINE",
    });

    return Response.json({
      status: "ONLINE",
      message: "Conexão estabelecida com segurança.",
      responseTimeMs: Date.now() - started,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha de conexão.";
    await updateIntegration("ERROR", message, Date.now() - started);
    return Response.json({ status: "ERROR", message }, { status: 502 });
  }
}

async function updateIntegration(status: string, lastError: string | null, duration: number) {
  const db = getDb();
  await db
    .insert(integrationStates)
    .values({
      integrationKey: "qive",
      status,
      lastError,
      averageProcessingMs: duration,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: integrationStates.integrationKey,
      set: {
        status,
        lastError,
        averageProcessingMs: duration,
        errorCount: status === "ERROR" ? sql`${integrationStates.errorCount} + 1` : integrationStates.errorCount,
        updatedAt: new Date().toISOString(),
      },
    });
}
