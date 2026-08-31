import { count, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { fiscalDocuments, reconciliations } from "../../../db/schema";
import { getRequestUser } from "../../../lib/identity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = getRequestUser(request);
  try {
    const payload = (await request.json()) as { question?: string };
    const question = payload.question?.trim() ?? "";
    if (question.length < 3 || question.length > 500) {
      return Response.json({ error: "Digite uma pergunta entre 3 e 500 caracteres." }, { status: 400 });
    }

    const db = getDb();
    const [documents, nfses, ctes, pending, divergent, retainedDocuments, fiscalTotals] = await Promise.all([
      db.select({ count: count() }).from(fiscalDocuments),
      db.select({ count: count() }).from(fiscalDocuments).where(eq(fiscalDocuments.documentType, "NFSE")),
      db.select({ count: count() }).from(fiscalDocuments).where(eq(fiscalDocuments.documentType, "CTE")),
      db.select({ count: count() }).from(fiscalDocuments).where(eq(fiscalDocuments.reconciliationStatus, "NOT_PROCESSED")),
      db.select({ count: count() }).from(reconciliations).where(eq(reconciliations.status, "DIVERGENT")),
      db.select({ count: count() }).from(fiscalDocuments).where(gt(fiscalDocuments.retainedTotal, 0)),
      db.select({
        taxes: sql<number>`coalesce(sum(${fiscalDocuments.taxTotal}), 0)`,
        retained: sql<number>`coalesce(sum(${fiscalDocuments.retainedTotal}), 0)`,
        gross: sql<number>`coalesce(sum(${fiscalDocuments.grossValue}), 0)`,
      }).from(fiscalDocuments),
    ]);

    const total = Number(documents[0]?.count ?? 0);
    if (!total) {
      return Response.json({
        answer: "Não há dados suficientes para concluir.",
        detail: "Sincronize documentos da Qive/Arquivei ou importe um relatório TOTVS para iniciar a análise.",
        sources: [],
        confidence: "insufficient",
        userScope: user.email,
      });
    }

    const normalized = question.toLocaleLowerCase("pt-BR");
    let answer = `Foram localizados ${total.toLocaleString("pt-BR")} documentos no escopo permitido.`;
    if (normalized.includes("diverg")) {
      answer = `${Number(divergent[0]?.count ?? 0).toLocaleString("pt-BR")} conciliações estão classificadas como divergentes.`;
    } else if (normalized.includes("reten")) {
      answer = `${Number(retainedDocuments[0]?.count ?? 0).toLocaleString("pt-BR")} documentos possuem retenções, totalizando ${formatCurrency(Number(fiscalTotals[0]?.retained ?? 0))}.`;
    } else if (normalized.includes("tribut") || normalized.includes("impost") || normalized.includes("icms") || normalized.includes("iss") || normalized.includes("ibs") || normalized.includes("cbs")) {
      answer = `Os documentos registram ${formatCurrency(Number(fiscalTotals[0]?.taxes ?? 0))} em tributos informados sobre uma base documental bruta de ${formatCurrency(Number(fiscalTotals[0]?.gross ?? 0))}.`;
    } else if (normalized.includes("pend") || normalized.includes("totvs")) {
      answer = `${Number(pending[0]?.count ?? 0).toLocaleString("pt-BR")} documentos ainda não foram processados na conciliação com o TOTVS.`;
    } else if (normalized.includes("nfse") || normalized.includes("nfs-e")) {
      answer = `Há ${Number(nfses[0]?.count ?? 0).toLocaleString("pt-BR")} NFS-e no escopo fiscal permitido.`;
    } else if (normalized.includes("cte") || normalized.includes("ct-e")) {
      answer = `Há ${Number(ctes[0]?.count ?? 0).toLocaleString("pt-BR")} CT-es no escopo fiscal permitido.`;
    }

    return Response.json({
      answer,
      detail: "A resposta considera somente os registros visíveis no seu escopo atual.",
      sources: ["Banco interno Carmak", "Cálculo do portal"],
      confidence: "evidence-based",
      userScope: user.email,
    });
  } catch (error) {
    console.error("Falha interna na consulta assistida", error);
    return Response.json({
      answer: "Não há dados suficientes para concluir.",
      detail: "A base fiscal não respondeu à consulta neste momento. Tente novamente após atualizar as integrações.",
      sources: [],
      confidence: "insufficient",
      userScope: user.email,
    });
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
