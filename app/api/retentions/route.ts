import { and, count, desc, eq, gt, like, notLike, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { fiscalDocuments } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const month = normalizeMonth(url.searchParams.get("month"));
    const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 50)));
    const where = and(
      like(fiscalDocuments.emissionDate, `${month}-%`),
      gt(fiscalDocuments.retainedTotal, 0),
      or(
        eq(fiscalDocuments.documentType, "CTE"),
        and(
          eq(fiscalDocuments.documentType, "NFE"),
          or(
            eq(fiscalDocuments.ownerRole, "receiver"),
            eq(fiscalDocuments.ownerRole, "received"),
          ),
          like(fiscalDocuments.receiverCnpj, "94534237%"),
          notLike(fiscalDocuments.emitterCnpj, "94534237%"),
          notLike(fiscalDocuments.accessKey, "______94534237%"),
        ),
        and(
          eq(fiscalDocuments.documentType, "NFSE"),
          or(
            and(
              like(fiscalDocuments.receiverCnpj, "94534237%"),
              notLike(fiscalDocuments.emitterCnpj, "94534237%"),
            ),
            and(
              like(fiscalDocuments.qiveId, "94534237%:%"),
              notLike(fiscalDocuments.qiveId, "%:94534237%"),
            ),
          ),
        ),
      ),
    );
    const db = getDb();
    const [documents, totals] = await Promise.all([
      db
        .select({
          id: fiscalDocuments.id,
          qiveId: fiscalDocuments.qiveId,
          type: fiscalDocuments.documentType,
          number: fiscalDocuments.number,
          series: fiscalDocuments.series,
          accessKey: fiscalDocuments.accessKey,
          emissionDate: fiscalDocuments.emissionDate,
          emitterName: fiscalDocuments.emitterName,
          emitterCnpj: fiscalDocuments.emitterCnpj,
          receiverName: fiscalDocuments.receiverName,
          receiverCnpj: fiscalDocuments.receiverCnpj,
          ownerCnpj: fiscalDocuments.ownerCnpj,
          ownerRole: fiscalDocuments.ownerRole,
          carrierName: fiscalDocuments.carrierName,
          grossValue: fiscalDocuments.grossValue,
          freightValue: fiscalDocuments.freightValue,
          icmsValue: fiscalDocuments.icmsValue,
          icmsStValue: fiscalDocuments.icmsStValue,
          ipiValue: fiscalDocuments.ipiValue,
          pisValue: fiscalDocuments.pisValue,
          cofinsValue: fiscalDocuments.cofinsValue,
          issValue: fiscalDocuments.issValue,
          inssRetainedValue: fiscalDocuments.inssRetainedValue,
          irrfRetainedValue: fiscalDocuments.irrfRetainedValue,
          csllRetainedValue: fiscalDocuments.csllRetainedValue,
          pisRetainedValue: fiscalDocuments.pisRetainedValue,
          cofinsRetainedValue: fiscalDocuments.cofinsRetainedValue,
          issRetainedValue: fiscalDocuments.issRetainedValue,
          retainedTotal: fiscalDocuments.retainedTotal,
          taxTotal: fiscalDocuments.taxTotal,
          fiscalStatus: fiscalDocuments.fiscalStatus,
          totvsStatus: fiscalDocuments.totvsStatus,
          reconciliationStatus: fiscalDocuments.reconciliationStatus,
          branchName: sql<string | null>`null`,
        })
        .from(fiscalDocuments)
        .where(where)
        .orderBy(desc(fiscalDocuments.emissionDate), desc(fiscalDocuments.id))
        .limit(limit),
      db
        .select({
          documentCount: count(),
          retainedTotal: sql<number>`coalesce(sum(${fiscalDocuments.retainedTotal}), 0)`,
          irrf: sql<number>`coalesce(sum(${fiscalDocuments.irrfRetainedValue}), 0)`,
          inss: sql<number>`coalesce(sum(${fiscalDocuments.inssRetainedValue}), 0)`,
          csll: sql<number>`coalesce(sum(${fiscalDocuments.csllRetainedValue}), 0)`,
          pis: sql<number>`coalesce(sum(${fiscalDocuments.pisRetainedValue}), 0)`,
          cofins: sql<number>`coalesce(sum(${fiscalDocuments.cofinsRetainedValue}), 0)`,
          iss: sql<number>`coalesce(sum(${fiscalDocuments.issRetainedValue}), 0)`,
        })
        .from(fiscalDocuments)
        .where(where),
    ]);

    const metrics = totals[0];
    return Response.json({
      month,
      metrics: {
        documentCount: Number(metrics?.documentCount ?? 0),
        retainedTotal: Number(metrics?.retainedTotal ?? 0),
        irrf: Number(metrics?.irrf ?? 0),
        inss: Number(metrics?.inss ?? 0),
        csll: Number(metrics?.csll ?? 0),
        pis: Number(metrics?.pis ?? 0),
        cofins: Number(metrics?.cofins ?? 0),
        iss: Number(metrics?.iss ?? 0),
      },
      documents,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar retenções." },
      { status: 500 },
    );
  }
}

function normalizeMonth(value: string | null) {
  const fallback = new Date().toISOString().slice(0, 7);
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback;
}
