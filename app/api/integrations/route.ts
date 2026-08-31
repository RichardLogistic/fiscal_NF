import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { integrationStates } from "../../../db/schema";
import { getRuntimeEnv } from "../../../lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtime = getRuntimeEnv();
    let states: Array<typeof integrationStates.$inferSelect> = [];
    try {
      const db = getDb();
      states = await db
        .select()
        .from(integrationStates)
        .orderBy(asc(integrationStates.integrationKey));
    } catch {
      states = [];
    }
    const stateMap = new Map(states.map((item) => [item.integrationKey, item]));
    const qiveConfigured = Boolean(
      (runtime.QIVE_API_ID && runtime.QIVE_API_KEY) || runtime.QIVE_LEGACY_API_TOKEN,
    );

    return Response.json({
      integrations: [
        {
          key: "qive",
          name: "Qive / Arquivei",
          description: "Captura de NF-e, CT-e e NFS-e",
          status: qiveConfigured ? stateMap.get("qive")?.status ?? "READY" : "NOT_CONFIGURED",
          lastSyncAt: stateMap.get("qive")?.lastSyncAt ?? null,
          receivedCount: stateMap.get("qive")?.receivedCount ?? 0,
          errorCount: stateMap.get("qive")?.errorCount ?? 0,
        },
        {
          key: "totvs-file",
          name: "Relatório TOTVS",
          description: "Conciliação por XLSX, XLS ou CSV",
          status: "AVAILABLE",
          lastSyncAt: stateMap.get("totvs-file")?.lastSyncAt ?? null,
          receivedCount: stateMap.get("totvs-file")?.receivedCount ?? 0,
          errorCount: stateMap.get("totvs-file")?.errorCount ?? 0,
        },
        {
          key: "totvs-api",
          name: "TOTVS automático",
          description: "Camada preparada para API ou serviço da TI",
          status: "NOT_CONFIGURED",
          lastSyncAt: null,
          receivedCount: 0,
          errorCount: 0,
        },
        {
          key: "database",
          name: "Base Carmak",
          description: "Persistência fiscal e trilha de auditoria",
          status: "ONLINE",
          lastSyncAt: new Date().toISOString(),
          receivedCount: 0,
          errorCount: 0,
        },
        {
          key: "ai",
          name: "IA Carmak",
          description: "Análises e explicações em linguagem natural",
          status: runtime.OPENAI_API_KEY ? "READY" : "ASSISTED_MODE",
          lastSyncAt: null,
          receivedCount: 0,
          errorCount: 0,
        },
      ],
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar integrações." },
      { status: 500 },
    );
  }
}
