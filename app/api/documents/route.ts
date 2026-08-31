import { and, count, desc, eq, like, notLike, or, type SQL } from "drizzle-orm";
import { getDb } from "../../../db";
import { companiesBranches, fiscalDocuments } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const branch = url.searchParams.get("branch");
    const owner = url.searchParams.get("owner")?.replace(/\D/g, "");
    const search = url.searchParams.get("search")?.trim();
    const month = normalizeMonth(url.searchParams.get("month"));
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 25)));
    const filters: SQL[] = [];

    filters.push(like(fiscalDocuments.emissionDate, `${month}-%`));
    const receivedInvoicesOnly = or(
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
    if (receivedInvoicesOnly) filters.push(receivedInvoicesOnly);
    if (type && type !== "ALL") filters.push(eq(fiscalDocuments.documentType, type));
    if (status && status !== "ALL") {
      filters.push(eq(fiscalDocuments.reconciliationStatus, status));
    }
    if (branch && branch !== "ALL") {
      filters.push(eq(fiscalDocuments.branchId, Number(branch)));
    }
    if (owner) {
      const ownerFilter = or(
        eq(fiscalDocuments.receiverCnpj, owner),
        like(fiscalDocuments.qiveId, `${owner}:%`),
      );
      if (ownerFilter) filters.push(ownerFilter);
    }
    if (search) {
      const term = `%${search.replaceAll("%", "").replaceAll("_", "")}%`;
      const searchFilter = or(
        like(fiscalDocuments.accessKey, term),
        like(fiscalDocuments.number, term),
        like(fiscalDocuments.emitterName, term),
        like(fiscalDocuments.carrierName, term),
        like(fiscalDocuments.emitterCnpj, term),
        like(fiscalDocuments.receiverCnpj, term),
        like(fiscalDocuments.ownerCnpj, term),
      );
      if (searchFilter) filters.push(searchFilter);
    }

    const where = filters.length ? and(...filters) : undefined;
    const db = getDb();
    const [rows, totalRows] = await Promise.all([
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
          branchName: companiesBranches.branchName,
        })
        .from(fiscalDocuments)
        .leftJoin(companiesBranches, eq(fiscalDocuments.branchId, companiesBranches.id))
        .where(where)
        .orderBy(desc(fiscalDocuments.emissionDate), desc(fiscalDocuments.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ count: count() }).from(fiscalDocuments).where(where),
    ]);

    return Response.json({
      documents: rows,
      total: Number(totalRows[0]?.count ?? 0),
      page,
      limit,
      month,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar documentos." },
      { status: 500 },
    );
  }
}

function normalizeMonth(value: string | null) {
  const fallback = new Date().toISOString().slice(0, 7);
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback;
}
