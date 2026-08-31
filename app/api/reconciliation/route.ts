import { count, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  fiscalDocuments,
  reconciliations,
  totvsImports,
  totvsRows,
} from "../../../db/schema";
import { getRequestUser } from "../../../lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const [latest, exact, probable, divergent, onlyTotvs] = await Promise.all([
      db.select().from(totvsImports).orderBy(desc(totvsImports.importedAt)).limit(1),
      db.select({ count: count() }).from(reconciliations).where(eq(reconciliations.status, "RECONCILED")),
      db.select({ count: count() }).from(reconciliations).where(eq(reconciliations.status, "PROBABLE")),
      db.select({ count: count() }).from(reconciliations).where(eq(reconciliations.status, "DIVERGENT")),
      db.select({ count: count() }).from(reconciliations).where(eq(reconciliations.status, "ONLY_TOTVS")),
    ]);
    return Response.json({
      latestImport: latest[0] ?? null,
      summary: {
        reconciled: Number(exact[0]?.count ?? 0),
        probable: Number(probable[0]?.count ?? 0),
        divergent: Number(divergent[0]?.count ?? 0),
        onlyTotvs: Number(onlyTotvs[0]?.count ?? 0),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar a conciliação." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = getRequestUser(request);
  try {
    const db = getDb();
    const latest = await db.select().from(totvsImports).orderBy(desc(totvsImports.importedAt)).limit(1);
    if (!latest[0]) {
      return Response.json({ error: "Importe um relatório TOTVS antes de conciliar." }, { status: 409 });
    }

    const [rows, documents] = await Promise.all([
      db.select().from(totvsRows).where(eq(totvsRows.importId, latest[0].id)).limit(25_000),
      db.select().from(fiscalDocuments).limit(25_000),
    ]);

    const accessKeyMap = new Map(documents.filter((d) => d.accessKey).map((d) => [d.accessKey, d]));
    const exactMap = new Map(
      documents
        .filter((d) => d.emitterCnpj && d.number)
        .map((d) => [`${d.emitterCnpj}|${d.number}|${d.series ?? ""}`, d]),
    );
    const byCnpjNumber = new Map(
      documents
        .filter((d) => d.emitterCnpj && d.number)
        .map((d) => [`${d.emitterCnpj}|${d.number}`, d]),
    );

    const results = [];
    for (const row of rows) {
      let document = row.accessKey ? accessKeyMap.get(row.accessKey) : undefined;
      let matchType = document ? "ACCESS_KEY" : "NONE";
      let confidence = document ? 1 : 0;

      if (!document && row.cnpj && row.documentNumber) {
        document = exactMap.get(`${row.cnpj}|${row.documentNumber}|${row.series ?? ""}`);
        if (document) {
          matchType = "CNPJ_NUMBER_SERIES";
          confidence = 0.96;
        }
      }
      if (!document && row.cnpj && row.documentNumber) {
        document = byCnpjNumber.get(`${row.cnpj}|${row.documentNumber}`);
        if (document) {
          matchType = "CNPJ_NUMBER";
          confidence = 0.82;
        }
      }

      const fiscalValue = document?.grossValue ?? document?.freightValue ?? null;
      const totvsValue = row.grossValue ?? row.netValue ?? null;
      const difference = fiscalValue !== null && totvsValue !== null ? totvsValue - fiscalValue : null;
      const status = !document
        ? "ONLY_TOTVS"
        : difference !== null && Math.abs(difference) > 0.01
          ? "DIVERGENT"
          : confidence >= 0.95
            ? "RECONCILED"
            : "PROBABLE";

      const [saved] = await db
        .insert(reconciliations)
        .values({
          documentId: document?.id ?? null,
          totvsRowId: row.id,
          matchType,
          confidence,
          status,
          fiscalValue,
          totvsValue,
          differenceValue: difference,
          evidenceJson: JSON.stringify({
            accessKey: Boolean(document && row.accessKey && document.accessKey === row.accessKey),
            cnpj: Boolean(document && row.cnpj && document.emitterCnpj === row.cnpj),
            number: Boolean(document && row.documentNumber && document.number === row.documentNumber),
            series: Boolean(document && row.series && document.series === row.series),
          }),
          reviewedBy: null,
        })
        .onConflictDoUpdate({
          target: [reconciliations.documentId, reconciliations.totvsRowId],
          set: {
            matchType,
            confidence,
            status,
            fiscalValue,
            totvsValue,
            differenceValue: difference,
            createdAt: new Date().toISOString(),
          },
        })
        .returning();
      results.push(saved);

      if (document) {
        await db
          .update(fiscalDocuments)
          .set({
            reconciliationStatus: status,
            totvsStatus: "FOUND",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(fiscalDocuments.id, document.id));
      }
    }

    const summary = results.reduce(
      (acc, item) => {
        const key = item.status as keyof typeof acc;
        if (key in acc) acc[key] += 1;
        return acc;
      },
      { RECONCILED: 0, PROBABLE: 0, DIVERGENT: 0, ONLY_TOTVS: 0 },
    );

    return Response.json({
      analyzed: rows.length,
      summary,
      message: rows.length
        ? "Confronto concluído. Associações prováveis continuam dependentes de revisão humana."
        : "O relatório importado não possui linhas para conciliar.",
      requestedBy: user.email,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao executar o confronto." },
      { status: 500 },
    );
  }
}
