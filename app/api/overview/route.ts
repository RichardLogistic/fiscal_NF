import { and, count, eq, like, notLike, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  companiesBranches,
  fiscalDocuments,
  totvsImports,
} from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const month = normalizeMonth(url.searchParams.get("month"));
    const monthFilter = like(fiscalDocuments.emissionDate, `${month}-%`);
    const receivedInvoicesFilter = or(
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
    );
    const visibleMonthFilter = and(monthFilter, receivedInvoicesFilter);
    const db = getDb();
    const [documentTotals, nfe, cte, nfse, reconciled, divergent, pendingTotvs, branches, imports] =
      await Promise.all([
        db
          .select({
            count: count(),
            gross: sql<number>`coalesce(sum(${fiscalDocuments.grossValue}), 0)`,
            taxes: sql<number>`coalesce(sum(${fiscalDocuments.taxTotal}), 0)`,
            retained: sql<number>`coalesce(sum(${fiscalDocuments.retainedTotal}), 0)`,
            icms: sql<number>`coalesce(sum(${fiscalDocuments.icmsValue}), 0)`,
            iss: sql<number>`coalesce(sum(${fiscalDocuments.issValue}), 0)`,
            ipi: sql<number>`coalesce(sum(${fiscalDocuments.ipiValue}), 0)`,
            pis: sql<number>`coalesce(sum(${fiscalDocuments.pisValue}), 0)`,
            cofins: sql<number>`coalesce(sum(${fiscalDocuments.cofinsValue}), 0)`,
          })
          .from(fiscalDocuments)
          .where(visibleMonthFilter),
        db
          .select({ count: count() })
          .from(fiscalDocuments)
          .where(and(eq(fiscalDocuments.documentType, "NFE"), visibleMonthFilter)),
        db
          .select({ count: count() })
          .from(fiscalDocuments)
          .where(and(eq(fiscalDocuments.documentType, "CTE"), visibleMonthFilter)),
        db
          .select({ count: count() })
          .from(fiscalDocuments)
          .where(and(eq(fiscalDocuments.documentType, "NFSE"), visibleMonthFilter)),
        db
          .select({ count: count() })
          .from(fiscalDocuments)
          .where(and(eq(fiscalDocuments.reconciliationStatus, "RECONCILED"), visibleMonthFilter)),
        db
          .select({ count: count() })
          .from(fiscalDocuments)
          .where(and(eq(fiscalDocuments.reconciliationStatus, "DIVERGENT"), visibleMonthFilter)),
        db
          .select({ count: count() })
          .from(fiscalDocuments)
          .where(and(eq(fiscalDocuments.reconciliationStatus, "NOT_PROCESSED"), visibleMonthFilter)),
        db
          .select({
            id: companiesBranches.id,
            name: companiesBranches.branchName,
            cnpj: companiesBranches.cnpj,
          })
          .from(companiesBranches)
          .where(eq(companiesBranches.status, "ACTIVE")),
        db.select({ count: count() }).from(totvsImports),
      ]);

    const total = Number(documentTotals[0]?.count ?? 0);
    const reconciledCount = Number(reconciled[0]?.count ?? 0);

    return Response.json({
      metrics: {
        totalDocuments: total,
        nfe: Number(nfe[0]?.count ?? 0),
        cte: Number(cte[0]?.count ?? 0),
        nfse: Number(nfse[0]?.count ?? 0),
        grossValue: Number(documentTotals[0]?.gross ?? 0),
        taxTotal: Number(documentTotals[0]?.taxes ?? 0),
        retainedTotal: Number(documentTotals[0]?.retained ?? 0),
        icmsValue: Number(documentTotals[0]?.icms ?? 0),
        issValue: Number(documentTotals[0]?.iss ?? 0),
        ipiValue: Number(documentTotals[0]?.ipi ?? 0),
        pisValue: Number(documentTotals[0]?.pis ?? 0),
        cofinsValue: Number(documentTotals[0]?.cofins ?? 0),
        pendingTotvs: Number(pendingTotvs[0]?.count ?? 0),
        reconciled: reconciledCount,
        divergent: Number(divergent[0]?.count ?? 0),
        reconciliationRate: total ? (reconciledCount / total) * 100 : 0,
        totvsImports: Number(imports[0]?.count ?? 0),
      },
      branches,
      month,
      hasData: total > 0,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar indicadores." },
      { status: 500 },
    );
  }
}

function normalizeMonth(value: string | null) {
  const fallback = new Date().toISOString().slice(0, 7);
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback;
}
