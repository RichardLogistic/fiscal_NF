import { and, eq, like, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import {
  auditLogs,
  fiscalDocuments,
  integrationStates,
} from "../../../../../db/schema";
import { getRequestUser } from "../../../../../lib/identity";
import { getRuntimeEnv } from "../../../../../lib/runtime-env";

type DocumentKind = "NFE" | "CTE" | "NFSE";
type ApiRecord = Record<string, unknown>;

const searchEndpoints: Record<DocumentKind, { path: string; fields: string[] }> = {
  NFE: { path: "/v2/dfe/nfe", fields: ["Document", "AccessKey", "EmissionDate", "Owner", "OwnerRole", "Receiver", "Emitter", "Number", "Status"] },
  CTE: { path: "/v1/dfe/cte", fields: ["Document", "AccessKey", "EmissionDate"] },
  NFSE: { path: "/v1/dfe/nfse", fields: ["document"] },
};

const PARSER_VERSION = "carmak-fiscal-1.5.0";

export async function POST(request: Request) {
  const runtime = getRuntimeEnv();
  const user = getRequestUser(request);
  if (!runtime.QIVE_API_ID || !runtime.QIVE_API_KEY) {
    return Response.json(
      { error: "Integração não configurada. Informe QIVE_API_ID e QIVE_API_KEY." },
      { status: 503 },
    );
  }
  if (!runtime.BUCKET) {
    return Response.json({ error: "Armazenamento fiscal indisponível." }, { status: 503 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    type?: DocumentKind;
    month?: string;
    automatic?: boolean;
  };
  const month = normalizeMonth(payload.month);
  if (!month) {
    return Response.json({ error: "Competência inválida. Use o formato AAAA-MM." }, { status: 400 });
  }
  const types: DocumentKind[] = payload.type ? [payload.type] : ["NFE", "CTE", "NFSE"];
  const baseUrl = runtime.QIVE_BASE_URL ?? "https://api.arquivei.com.br";
  const results = await Promise.all(
    types.map((type) =>
      syncMonth(type, month, baseUrl, runtime, user.email, Boolean(payload.automatic)),
    ),
  );

  const received = results.reduce((sum, item) => sum + item.received, 0);
  const processed = results.reduce((sum, item) => sum + item.processed, 0);
  const hasError = results.some((item) => item.status === "ERROR");
  const db = getDb();
  const monthStateKeys = ["NFE", "CTE", "NFSE"].map(
    (type) => `qive-${type.toLowerCase()}-${month}`,
  );
  const [allStates, documentCount] = await Promise.all([
    db.select({ key: integrationStates.integrationKey, status: integrationStates.status })
      .from(integrationStates),
    db.select({ count: sql<number>`count(*)` }).from(fiscalDocuments),
  ]);
  const monthStates = allStates.filter((state) => monthStateKeys.includes(state.key));
  const failedTypes = monthStates
    .filter((state) => state.status === "ERROR")
    .map((state) => state.key.split("-")[1]?.toUpperCase())
    .filter(Boolean);
  const allTypesOnline = monthStateKeys.every((key) =>
    monthStates.some((state) => state.key === key && state.status === "ONLINE"),
  );
  const aggregateStatus = failedTypes.length
    ? "ERROR"
    : allTypesOnline ? "ONLINE" : "SYNCING";
  const updatedAt = new Date().toISOString();
  await db
    .insert(integrationStates)
    .values({
      integrationKey: "qive",
      status: aggregateStatus,
      lastSyncAt: updatedAt,
      receivedCount: Number(documentCount[0]?.count ?? 0),
      errorCount: failedTypes.length,
      lastError: failedTypes.length ? `Falha na atualização de ${failedTypes.join(", ")}.` : null,
    })
    .onConflictDoUpdate({
      target: integrationStates.integrationKey,
      set: {
        status: aggregateStatus,
        lastSyncAt: updatedAt,
        receivedCount: Number(documentCount[0]?.count ?? 0),
        errorCount: failedTypes.length,
        lastError: failedTypes.length ? `Falha na atualização de ${failedTypes.join(", ")}.` : null,
        updatedAt,
      },
    });
  return Response.json({
    status: hasError ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
    received,
    processed,
    month,
    results,
    message: received
      ? processed
        ? `${processed} documentos novos ou alterados em ${received} consultados de ${formatMonthLabel(month)}.`
        : `${received} documentos de ${formatMonthLabel(month)} conferidos; a base já estava atualizada.`
      : `Nenhum documento foi localizado em ${formatMonthLabel(month)}.`,
  });
}

async function syncMonth(
  type: DocumentKind,
  month: string,
  baseUrl: string,
  runtime: ReturnType<typeof getRuntimeEnv>,
  userEmail: string,
  automatic: boolean,
) {
  const db = getDb();
  const stateKey = `qive-${type.toLowerCase()}-${month}`;
  const endpoint = searchEndpoints[type];
  const url = new URL(`${baseUrl}${endpoint.path}`);
  const range = monthRange(month);

  const started = Date.now();
  try {
    const items: ApiRecord[] = [];
    const seenPaginators = new Set<string>();
    let paginator: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-ID": runtime.QIVE_API_ID!,
          "X-API-KEY": runtime.QIVE_API_KEY!,
          "X-Use-ApiGateway": runtime.QIVE_USE_API_GATEWAY ?? "always",
        },
        body: JSON.stringify({
          filters: {
            EmissionDate: {
              From: range.from,
              To: range.to,
            },
          },
          fields: endpoint.fields,
          Limit: 500,
          ...(paginator ? { paginator } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as ApiRecord;
      const pageItems = extractItems(body);
      items.push(...(
        type === "CTE"
          ? pageItems
          : pageItems.filter((item) => isReceivedInvoice(type, item))
      ));
      const nextPaginator = extractPaginator(body);
      if (!nextPaginator || !pageItems.length || seenPaginators.has(nextPaginator)) break;
      seenPaginators.add(nextPaginator);
      paginator = nextPaginator;
    }
    const prepared = await Promise.all(items.map((item) => prepareDocument(type, item)));
    const existing = await db
      .select({
        accessKey: fiscalDocuments.accessKey,
        originalHash: fiscalDocuments.originalHash,
        parserVersion: fiscalDocuments.parserVersion,
      })
      .from(fiscalDocuments)
      .where(and(
        eq(fiscalDocuments.documentType, type),
        like(fiscalDocuments.emissionDate, `${month}-%`),
      ));
    const existingByAccessKey = new Map(existing.flatMap((row) => row.accessKey ? [[row.accessKey, row] as const] : []));
    const existingByHash = new Map(existing.flatMap((row) => row.originalHash ? [[row.originalHash, row] as const] : []));
    const uniqueByIdentity = new Map<string, typeof prepared[number]>();
    for (const entry of prepared) {
      uniqueByIdentity.set(entry.normalized.accessKey ?? entry.hash, entry);
    }
    const uniquePrepared = [...uniqueByIdentity.values()];
    const changed = uniquePrepared.filter((entry) => {
      const current = entry.normalized.accessKey
        ? existingByAccessKey.get(entry.normalized.accessKey)
        : existingByHash.get(entry.hash);
      return !current || current.originalHash !== entry.hash || current.parserVersion !== PARSER_VERSION;
    });

    for (const batch of chunks(changed, 40)) {
      const queries = batch.map((entry) => {
        const updatedAt = new Date().toISOString();
        return db
          .insert(fiscalDocuments)
          .values({
            ...entry.normalized,
            originalStorageKey: entry.storageKey,
            originalHash: entry.hash,
            normalizedJson: JSON.stringify(entry.normalized),
            parserVersion: PARSER_VERSION,
            source: "QIVE_ADVANCED_SEARCH",
            updatedAt,
          })
          .onConflictDoUpdate({
            target: entry.normalized.accessKey
              ? fiscalDocuments.accessKey
              : fiscalDocuments.originalHash,
            set: {
              ...entry.normalized,
              normalizedJson: JSON.stringify(entry.normalized),
              originalStorageKey: entry.storageKey,
              originalHash: entry.hash,
              parserVersion: PARSER_VERSION,
              updatedAt,
            },
          });
      });
      if (queries.length) await db.batch(queries as [typeof queries[number], ...Array<typeof queries[number]>]);
    }
    const processed = changed.length;

    for (const batch of chunks(changed, 48)) {
      await Promise.all(
        batch.map((entry) =>
          runtime.BUCKET!.put(entry.storageKey, entry.original, {
            httpMetadata: { contentType: "application/json; charset=utf-8" },
            customMetadata: { source: "QIVE", type, sha256: entry.hash },
          }),
        ),
      );
    }

    await db
      .insert(integrationStates)
      .values({
        integrationKey: stateKey,
        status: "ONLINE",
        lastSyncAt: new Date().toISOString(),
        receivedCount: items.length,
        averageProcessingMs: Date.now() - started,
      })
      .onConflictDoUpdate({
        target: integrationStates.integrationKey,
        set: {
          status: "ONLINE",
          lastSyncAt: new Date().toISOString(),
          receivedCount: items.length,
          averageProcessingMs: Date.now() - started,
          lastError: null,
          updatedAt: new Date().toISOString(),
        },
      });
    await db.insert(auditLogs).values({
      userEmail,
      action: automatic ? "AUTO_SYNC_QIVE_MONTH" : "SYNC_QIVE_MONTH",
      entityType: "INTEGRATION",
      entityId: stateKey,
      newValue: JSON.stringify({ month, received: items.length, processed }),
    });
    return { type, month, received: items.length, processed, status: "ONLINE", durationMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronização.";
    await db
      .insert(integrationStates)
      .values({ integrationKey: stateKey, status: "ERROR", lastError: message, errorCount: 1 })
      .onConflictDoUpdate({
        target: integrationStates.integrationKey,
        set: {
          status: "ERROR",
          lastError: message,
          errorCount: sql`${integrationStates.errorCount} + 1`,
          updatedAt: new Date().toISOString(),
        },
      });
    return { type, month, received: 0, processed: 0, status: "ERROR", error: message };
  }
}

function extractItems(body: ApiRecord): ApiRecord[] {
  const candidates = [body.data, body.Data, body.nfes, body.Nfes, body.ctes, body.Ctes, body.nfses, body.Nfses];
  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

function extractPaginator(body: ApiRecord) {
  const page = record(first(body.page, body.Page));
  return text(first(body.Paginator, body.paginator, page.next, page.Next));
}

function isReceivedInvoice(type: "NFE" | "NFSE", item: ApiRecord) {
  const document = parseDocument(first(item.Document, item.document)) ?? item;
  const xml = text(document.__xml);
  const qiveId = text(first(item.id, item.Id, item.QiveId, item.qive_id));
  const nfseIdentity = type === "NFSE" ? parseNfseIdentity(qiveId) : null;
  const accessKey = digits(first(
    item.AccessKey,
    item.access_key,
    item.chave,
    findValueDeep(document, ["AccessKey", "access_key", "chave", "chNFe"]),
    xmlValue(xml, ["chNFe", "chave"]),
  ));
  const documentReceiver = findRecordDeep(document, [
    "dest",
    "Receiver",
    "destinatario",
    "tomador",
    "customer",
  ]);
  const documentEmitter = findRecordDeep(document, [
    "emit",
    "Emitter",
    "emitente",
    "prestador",
    "provider",
  ]);
  const receiver = Object.keys(documentReceiver).length
    ? documentReceiver
    : record(first(item.Receiver, item.receiver));
  const emitter = Object.keys(documentEmitter).length
    ? documentEmitter
    : record(first(item.Emitter, item.emitter));
  const receiverCnpj = digits(first(
    nfseIdentity?.receiverCnpj,
    findValueDeep(receiver, ["ReceiverCnpj", "CNPJ", "cnpj", "TaxId"]),
    xmlSectionValue(xml, ["dest", "tomador"], ["CNPJ", "cnpj"]),
    item.ReceiverCnpj,
    typeof item.Receiver === "string" ? item.Receiver : null,
  ));
  const emitterCnpj = digits(first(
    type === "NFE" && accessKey.length === 44 ? accessKey.slice(6, 20) : null,
    nfseIdentity?.emitterCnpj,
    findValueDeep(emitter, ["EmitterCnpj", "CNPJ", "cnpj", "TaxId"]),
    xmlSectionValue(xml, ["emit", "prestador"], ["CNPJ", "cnpj"]),
    item.EmitterCnpj,
    typeof item.Emitter === "string" ? item.Emitter : null,
  ));
  const ownerRole = text(first(item.OwnerRole, item.ownerRole))?.toLowerCase();
  const isReceivedRole = type === "NFSE" || ownerRole === "receiver" || ownerRole === "received";
  return isReceivedRole
    && receiverCnpj.startsWith("94534237")
    && emitterCnpj.length === 14
    && !emitterCnpj.startsWith("94534237");
}

function normalizeDocument(type: DocumentKind, item: ApiRecord) {
  const document = parseDocument(first(item.Document, item.document)) ?? item;
  const xml = text(document.__xml);
  const qiveId = text(first(item.id, item.Id, item.QiveId, item.qive_id));
  const nfseIdentity = type === "NFSE" ? parseNfseIdentity(qiveId) : null;
  const accessKey = digits(first(
    item.AccessKey,
    item.access_key,
    item.chave,
    findValueDeep(document, ["AccessKey", "access_key", "chave", "chNFe", "chCTe"]),
    xmlValue(xml, ["chNFe", "chCTe", "chave"]),
  ));
  const documentEmitter = findRecordDeep(document, ["emit", "Emitter", "emitente", "prestador", "provider"]);
  const documentReceiver = findRecordDeep(document, ["dest", "Receiver", "destinatario", "tomador", "toma3", "toma4", "customer"]);
  const emitter = Object.keys(documentEmitter).length
    ? documentEmitter
    : record(first(item.Emitter, item.emitter));
  const receiver = Object.keys(documentReceiver).length
    ? documentReceiver
    : record(first(item.Receiver, item.receiver));
  const owner = record(first(item.OwnerDetails, item.ownerDetails, item.Owner, item.owner));
  const ownerRole = text(first(item.OwnerRole, item.ownerRole, findValueDeep(document, ["OwnerRole", "ownerRole"])))
    ?.toLowerCase() ?? null;
  const normalizedOwnerRole = ownerRole ?? (
    nfseIdentity?.receiverCnpj.startsWith("94534237") ? "received" : null
  );
  const carrier = record(first(
    item.Carrier,
    item.carrier,
    item.Transporter,
    findRecordDeep(document, ["transporta", "transportadora", "carrier", "transporter"]),
    item.Emitter,
    emitter,
  ));
  const values = record(first(
    item.Values,
    item.values,
    item.Total,
    findRecordDeep(document, ["ICMSTot", "vPrest", "total", "valores", "valoresNfse"]),
  ));
  const icmsTotals = record(first(
    item.Taxes,
    item.taxes,
    findRecordDeep(document, ["ICMSTot", "ICMSTotal", "impostosTotais"]),
  ));
  const serviceTotals = record(findRecordDeep(document, [
    "ValoresNfse",
    "Valores",
    "ISSQNtot",
    "servicoValores",
  ]));
  const retainedTaxes = record(findRecordDeep(document, [
    "retTrib",
    "TributosRetidos",
    "Retencoes",
    "RetencoesFederais",
  ]));
  const derivedSeries = accessKey.length === 44 ? trimLeadingZeros(accessKey.slice(22, 25)) : null;
  const derivedNumber = accessKey.length === 44 ? trimLeadingZeros(accessKey.slice(25, 34)) : null;
  const icmsValue = number(first(
    item.IcmsValue,
    item.ICMSValue,
    findValueDeep(icmsTotals, ["vICMS", "ValorIcms", "icmsValue"]),
    xmlSectionValue(xml, ["ICMSTot"], ["vICMS"]),
  ));
  const icmsStValue = number(first(
    item.IcmsStValue,
    item.ICMSSTValue,
    findValueDeep(icmsTotals, ["vST", "vICMSST", "ValorIcmsSt", "icmsStValue"]),
    xmlSectionValue(xml, ["ICMSTot"], ["vST", "vICMSST"]),
  ));
  const ipiValue = number(first(
    item.IpiValue,
    item.IPIValue,
    findValueDeep(icmsTotals, ["vIPI", "ValorIpi", "ipiValue"]),
    xmlSectionValue(xml, ["ICMSTot"], ["vIPI"]),
  ));
  const pisValue = number(first(
    item.PisValue,
    item.PISValue,
    findValueDeep(icmsTotals, ["vPIS", "pisValue"]),
    xmlSectionValue(xml, ["ICMSTot"], ["vPIS"]),
  ));
  const cofinsValue = number(first(
    item.CofinsValue,
    item.COFINSValue,
    findValueDeep(icmsTotals, ["vCOFINS", "cofinsValue"]),
    xmlSectionValue(xml, ["ICMSTot"], ["vCOFINS"]),
  ));
  const issValue = number(first(
    item.IssValue,
    item.ISSValue,
    findValueDeep(serviceTotals, ["vISS", "vISSQN", "ValorIss", "issValue"]),
    xmlSectionValue(xml, ["ISSQNtot", "Valores"], ["vISS", "vISSQN", "ValorIss"]),
  ));
  const inssRetainedValue = number(first(
    item.InssRetainedValue,
    findValueDeep(retainedTaxes, ["vRetPrev", "vRetCP", "ValorInss", "inssRetainedValue"]),
    type === "NFSE" ? findValueDeep(serviceTotals, ["ValorInss", "vRetPrev", "vRetCP"]) : null,
    findValueDeep(document, ["vRetPrev", "vRetCP", "ValorInss", "inssRetainedValue"]),
    xmlSectionValue(xml, ["retTrib", "Valores", "tribFed"], ["vRetPrev", "vRetCP", "ValorInss"]),
    xmlValue(xml, ["vRetPrev", "vRetCP", "ValorInss"]),
  ));
  const irrfRetainedValue = number(first(
    item.IrrfRetainedValue,
    findValueDeep(retainedTaxes, ["vIRRF", "vRetIRRF", "ValorIr", "ValorIrrf", "irrfRetainedValue"]),
    type === "NFSE" ? findValueDeep(serviceTotals, ["ValorIr", "ValorIrrf", "vIRRF", "vRetIRRF"]) : null,
    findValueDeep(document, ["vIRRF", "vRetIRRF", "ValorIr", "ValorIrrf", "irrfRetainedValue"]),
    xmlSectionValue(xml, ["retTrib", "Valores", "tribFed"], ["vIRRF", "vRetIRRF", "ValorIr", "ValorIrrf"]),
    xmlValue(xml, ["vIRRF", "vRetIRRF", "ValorIr", "ValorIrrf"]),
  ));
  const csllRetainedValue = number(first(
    item.CsllRetainedValue,
    findValueDeep(retainedTaxes, ["vRetCSLL", "ValorCsll", "csllRetainedValue"]),
    type === "NFSE" ? findValueDeep(serviceTotals, ["ValorCsll", "vRetCSLL"]) : null,
    findValueDeep(document, ["vRetCSLL", "ValorCsll", "csllRetainedValue"]),
    xmlSectionValue(xml, ["retTrib", "Valores", "tribFed"], ["vRetCSLL", "ValorCsll"]),
    xmlValue(xml, ["vRetCSLL", "ValorCsll"]),
  ));
  const pisRetainedValue = number(first(
    item.PisRetainedValue,
    findValueDeep(retainedTaxes, ["vRetPIS", "ValorPis", "pisRetainedValue"]),
    type === "NFSE" ? findValueDeep(serviceTotals, ["ValorPis", "vRetPIS"]) : null,
    findValueDeep(document, ["vRetPIS", "ValorPis", "pisRetainedValue"]),
    xmlSectionValue(xml, ["retTrib", "Valores", "tribFed"], ["vRetPIS", "ValorPis"]),
    xmlValue(xml, ["vRetPIS", "ValorPis"]),
  ));
  const cofinsRetainedValue = number(first(
    item.CofinsRetainedValue,
    findValueDeep(retainedTaxes, ["vRetCOFINS", "ValorCofins", "cofinsRetainedValue"]),
    type === "NFSE" ? findValueDeep(serviceTotals, ["ValorCofins", "vRetCOFINS"]) : null,
    findValueDeep(document, ["vRetCOFINS", "ValorCofins", "cofinsRetainedValue"]),
    xmlSectionValue(xml, ["retTrib", "Valores", "tribFed"], ["vRetCOFINS", "ValorCofins"]),
    xmlValue(xml, ["vRetCOFINS", "ValorCofins"]),
  ));
  const explicitIssRetained = number(first(
    item.IssRetainedValue,
    findValueDeep(retainedTaxes, ["ValorIssRetido", "vISSRetido", "vISSQNRetido", "issRetainedValue"]),
    findValueDeep(serviceTotals, ["ValorIssRetido", "vISSRetido", "vISSQNRetido"]),
    findValueDeep(document, ["ValorIssRetido", "vISSRetido", "vISSQNRetido", "issRetainedValue"]),
    xmlSectionValue(xml, ["retTrib", "Valores", "tribMun"], ["ValorIssRetido", "vISSRetido", "vISSQNRetido"]),
    xmlValue(xml, ["ValorIssRetido", "vISSRetido", "vISSQNRetido"]),
  ));
  const issWasRetained = booleanValue(first(
    item.IssRetained,
    findValueDeep(serviceTotals, ["IssRetido", "issRetido"]),
    xmlSectionValue(xml, ["Valores", "InfNfse"], ["IssRetido"]),
  ));
  const issRetainedValue = explicitIssRetained ?? (issWasRetained ? issValue : null);
  const retainedTotal = sumAmounts([
    inssRetainedValue,
    irrfRetainedValue,
    csllRetainedValue,
    pisRetainedValue,
    cofinsRetainedValue,
    issRetainedValue,
  ]);
  const taxTotal = sumAmounts([
    icmsValue,
    icmsStValue,
    ipiValue,
    pisValue,
    cofinsValue,
    issValue,
  ]);
  const taxes = {
    icmsValue,
    icmsStValue,
    ipiValue,
    pisValue,
    cofinsValue,
    issValue,
    inssRetainedValue,
    irrfRetainedValue,
    csllRetainedValue,
    pisRetainedValue,
    cofinsRetainedValue,
    issRetainedValue,
    retainedTotal,
    taxTotal,
  };

  return {
    documentType: type,
    qiveId,
    accessKey: accessKey || null,
    number: text(first(
      item.Number,
      item.DocumentNumber,
      item.NfeNumber,
      item.CteNumber,
      findValueDeep(document, ["nNF", "nCT", "numero", "number", "numeroNfse"]),
      xmlValue(xml, ["nNF", "nCT", "numero", "numeroNfse"]),
      derivedNumber,
    )),
    series: text(first(
      item.Series,
      item.DocumentSeries,
      findValueDeep(document, ["serie", "Series", "seriePrestacao"]),
      xmlValue(xml, ["serie", "seriePrestacao"]),
      derivedSeries,
    )),
    emissionDate: normalizeEmissionDate(first(
      item.EmissionDate,
      item.emission_date,
      findValueDeep(document, ["dhEmi", "dEmi", "dataEmissao", "emissionDate"]),
      xmlValue(xml, ["dhEmi", "dEmi", "dataEmissao"]),
    )),
    emitterName: text(first(
      findValueDeep(emitter, ["EmitterName", "xNome", "nome", "name", "razaoSocial", "CorporateName"]),
      xmlSectionValue(xml, ["emit", "prestador"], ["xNome", "razaoSocial", "nome"]),
      item.EmitterName,
    )),
    emitterCnpj: digits(first(
      accessKey.length === 44 ? accessKey.slice(6, 20) : null,
      nfseIdentity?.emitterCnpj,
      findValueDeep(emitter, ["EmitterCnpj", "CNPJ", "cnpj", "TaxId"]),
      xmlSectionValue(xml, ["emit", "prestador"], ["CNPJ", "cnpj"]),
      item.EmitterCnpj,
    )) || null,
    receiverName: text(first(
      findValueDeep(receiver, ["ReceiverName", "xNome", "nome", "name", "razaoSocial", "CorporateName"]),
      xmlSectionValue(xml, ["dest", "tomador"], ["xNome", "razaoSocial", "nome"]),
      item.ReceiverName,
      nfseIdentity?.receiverCnpj.startsWith("94534237") ? "CARMAK REVENDA E LOCACAO DE MAQUINAS E VEICULOS LTDA" : null,
    )),
    receiverCnpj: digits(first(
      nfseIdentity?.receiverCnpj,
      findValueDeep(receiver, ["ReceiverCnpj", "CNPJ", "cnpj", "TaxId"]),
      xmlSectionValue(xml, ["dest", "tomador"], ["CNPJ", "cnpj"]),
      item.ReceiverCnpj,
    )) || null,
    ownerCnpj: digits(first(
      typeof item.Owner === "string" ? item.Owner : null,
      typeof item.owner === "string" ? item.owner : null,
      item.OwnerCnpj,
      findValueDeep(owner, ["OwnerCnpj", "CNPJ", "cnpj", "TaxId"]),
      nfseIdentity?.receiverCnpj,
      ownerRole === "receiver"
        ? findValueDeep(receiver, ["ReceiverCnpj", "CNPJ", "cnpj", "TaxId"])
        : null,
    )) || null,
    ownerRole: normalizedOwnerRole,
    takerName: type === "CTE" ? text(first(
      item.TakerName,
      findValueDeep(receiver, ["TakerName", "xNome", "nome", "name", "ReceiverName"]),
      xmlSectionValue(xml, ["toma3", "toma4", "tomador"], ["xNome", "nome"]),
    )) : null,
    takerCnpj: type === "CTE" ? digits(first(
      item.TakerCnpj,
      findValueDeep(receiver, ["TakerCnpj", "CNPJ", "cnpj", "ReceiverCnpj"]),
      xmlSectionValue(xml, ["toma3", "toma4", "tomador"], ["CNPJ", "cnpj"]),
    )) || null : null,
    carrierName: type === "CTE" ? text(first(
      item.CarrierName,
      item.EmitterName,
      findValueDeep(carrier, ["CarrierName", "EmitterName", "xNome", "nome", "name", "CorporateName"]),
      xmlSectionValue(xml, ["emit", "transporta"], ["xNome", "nome"]),
    )) : null,
    carrierCnpj: type === "CTE" ? digits(first(
      item.CarrierCnpj,
      item.EmitterCnpj,
      findValueDeep(carrier, ["CarrierCnpj", "EmitterCnpj", "CNPJ", "cnpj", "TaxId"]),
      xmlSectionValue(xml, ["emit", "transporta"], ["CNPJ", "cnpj"]),
      accessKey.length === 44 ? accessKey.slice(6, 20) : null,
    )) || null : null,
    grossValue: number(first(
      item.TotalValue,
      item.GrossValue,
      item.Value,
      findValueDeep(values, ["vNF", "vTPrest", "valorTotal", "TotalValue", "valorServicos", "valor"]),
      findValueDeep(document, ["vNF", "vTPrest", "valorTotal", "totalValue", "valorServicos"]),
      xmlValue(xml, ["vNF", "vTPrest", "valorTotal", "valorServicos"]),
    )),
    netValue: number(first(
      item.NetValue,
      findValueDeep(values, ["valorLiquido", "netValue", "NetValue", "valorLiquidoNfse"]),
      xmlValue(xml, ["valorLiquido", "valorLiquidoNfse"]),
    )),
    freightValue: type === "CTE" ? number(first(
      item.FreightValue,
      item.TotalValue,
      findValueDeep(values, ["vTPrest", "TotalValue", "valorPrestacao", "valorFrete"]),
      findValueDeep(document, ["vTPrest", "valorPrestacao", "valorFrete"]),
      xmlValue(xml, ["vTPrest", "valorPrestacao", "valorFrete"]),
    )) : null,
    weightKg: type === "CTE" ? number(first(
      item.Weight,
      item.WeightKg,
      findValueDeep(document, ["qCarga", "peso", "pesoBruto", "weight", "WeightKg"]),
      xmlValue(xml, ["qCarga", "peso", "pesoBruto"]),
    )) : null,
    ...taxes,
    taxesJson: JSON.stringify(taxes),
    fiscalStatus: text(first(
      item.Status,
      item.status,
      findValueDeep(document, ["Status", "status", "cStat"]),
      xmlValue(xml, ["cStat"]),
    )) || "RECEIVED",
  };
}

async function prepareDocument(type: DocumentKind, item: ApiRecord) {
  const normalized = normalizeDocument(type, item);
  const original = JSON.stringify(item);
  const hash = await sha256(new TextEncoder().encode(original));
  return {
    normalized,
    original,
    hash,
    storageKey: `qive/${type.toLowerCase()}/${normalized.accessKey ?? hash}.json`,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function normalizeMonth(value: unknown): string | null {
  const input = String(value ?? "").trim() || new Date().toISOString().slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(input) ? input : null;
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: `${month}-01 00:00:00`,
    to: `${month}-${String(lastDay).padStart(2, "0")} 23:59:59`,
  };
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function normalizeEmissionDate(value: unknown): string | null {
  const input = text(value);
  if (!input) return null;
  const brazilian = input.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}${brazilian[4]}`;
  return input;
}

function first(...values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function parseDocument(value: unknown): ApiRecord | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input) return null;

  const direct = parseJsonRecord(input);
  if (direct) return direct;
  if (input.startsWith("<")) return { __xml: input };

  try {
    const bytes = Uint8Array.from(atob(input.replace(/\s/g, "")), (character) => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes).trim();
    const parsed = parseJsonRecord(decoded);
    if (parsed) return parsed;
    if (decoded.startsWith("<")) return { __xml: decoded };
  } catch {
    // Nem todo campo Document em integrações antigas é Base64.
  }
  return null;
}

function parseNfseIdentity(value: string | null) {
  const [receiver, emitter] = value?.split(":") ?? [];
  const receiverCnpj = digits(receiver);
  const emitterCnpj = digits(emitter);
  if (receiverCnpj.length !== 14 || emitterCnpj.length !== 14) return null;
  return { receiverCnpj, emitterCnpj };
}

function parseJsonRecord(value: string): ApiRecord | null {
  if (!value.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function findRecordDeep(root: unknown, names: string[]): ApiRecord {
  const value = findDeep(root, names, isRecord);
  return isRecord(value) ? value : {};
}

function findValueDeep(root: unknown, names: string[]): unknown {
  return findDeep(root, names, (value) =>
    value !== null && value !== undefined && value !== "" && !isRecord(value) && !Array.isArray(value),
  );
}

function findDeep(
  root: unknown,
  names: string[],
  accept: (value: unknown) => boolean,
): unknown {
  const targets = new Set(names.map(normalizeKey));
  const queue: unknown[] = [root];
  let visited = 0;
  while (queue.length && visited < 5_000) {
    const current = queue.shift();
    visited += 1;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [key, value] of Object.entries(current)) {
      if (targets.has(normalizeKey(key)) && accept(value)) return value;
      if (isRecord(value) || Array.isArray(value)) queue.push(value);
    }
  }
  return undefined;
}

function normalizeKey(value: string) {
  return value.split(":").at(-1)!.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function xmlSectionValue(xml: string | null, sections: string[], tags: string[]) {
  if (!xml) return null;
  for (const section of sections) {
    const pattern = new RegExp(
      `<(?:\\w+:)?${escapeRegex(section)}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${escapeRegex(section)}>`,
      "i",
    );
    const match = xml.match(pattern);
    const value = xmlValue(match?.[1] ?? null, tags);
    if (value) return value;
  }
  return null;
}

function xmlValue(xml: string | null, tags: string[]) {
  if (!xml) return null;
  for (const tag of tags) {
    const pattern = new RegExp(
      `<(?:\\w+:)?${escapeRegex(tag)}\\b[^>]*>([^<]*)<\\/(?:\\w+:)?${escapeRegex(tag)}>`,
      "i",
    );
    const match = xml.match(pattern);
    if (match?.[1]) return decodeXmlEntities(match[1].trim());
  }
  return null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function trimLeadingZeros(value: string) {
  return value.replace(/^0+(?=\d)/, "");
}

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown): ApiRecord {
  return isRecord(value) ? value : {};
}
function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, 240) : null;
}
function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}
function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const input = String(value ?? "").trim();
  if (!input) return null;
  const parsed = Number(input.includes(",") ? input.replace(/\./g, "").replace(",", ".") : input);
  return Number.isFinite(parsed) ? parsed : null;
}
function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "sim", "yes", "s"].includes(normalized);
}
function sumAmounts(values: Array<number | null>) {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return valid.length
    ? Number(valid.reduce((sum, value) => sum + value, 0).toFixed(2))
    : 0;
}
async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
}
