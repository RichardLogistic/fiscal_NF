import { desc, eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getDb } from "../../../../db";
import {
  auditLogs,
  integrationStates,
  totvsImports,
  totvsRows,
} from "../../../../db/schema";
import { getRequestUser } from "../../../../lib/identity";
import { getRuntimeEnv } from "../../../../lib/runtime-env";

export const dynamic = "force-dynamic";

type RawRow = Record<string, unknown>;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ROWS = 25_000;
const ALLOWED_EXTENSIONS = ["xlsx", "xls", "csv"];

const fieldMatchers: Record<string, string[]> = {
  accessKey: ["chavedeacesso", "chave", "accesskey", "chavecte", "chavenfe"],
  documentNumber: ["documento", "numerodocumento", "numdocumento", "numero", "notafiscal", "cte"],
  series: ["serie"],
  cnpj: ["cnpj", "cnpjfornecedor", "cnpjtransportadora"],
  supplierName: ["fornecedor", "transportadora", "razaosocial", "nomefornecedor"],
  grossValue: ["valordocumento", "vlrdocumento", "valorbruto", "vlbruto"],
  netValue: ["valorliquido", "vlrliquido", "vlliquido"],
  emissionDate: ["emissao", "dataemissao", "dtemissao"],
  dueDate: ["vencimento", "datavencimento", "dtvencimento"],
  invoiceNumber: ["fatura", "numerofatura", "numfatura"],
  titleNumber: ["titulo", "numerotitulo", "numtitulo"],
  costCenter: ["centrodecusto", "ccusto"],
  branchCode: ["filial", "codigofilial", "empresafilial"],
};

export async function GET() {
  try {
    const db = getDb();
    const imports = await db
      .select({
        id: totvsImports.id,
        fileName: totvsImports.fileName,
        status: totvsImports.status,
        totalRows: totvsImports.totalRows,
        acceptedRows: totvsImports.acceptedRows,
        rejectedRows: totvsImports.rejectedRows,
        importedBy: totvsImports.importedBy,
        importedAt: totvsImports.importedAt,
      })
      .from(totvsImports)
      .orderBy(desc(totvsImports.importedAt))
      .limit(12);
    return Response.json({ imports });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar importações." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = getRequestUser(request);
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Selecione um arquivo." }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return Response.json({ error: "Formato inválido. Use XLSX, XLS ou CSV." }, { status: 415 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "O arquivo deve possuir até 20 MB." }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    const hash = await sha256(bytes);
    const db = getDb();
    const duplicate = await db
      .select({ id: totvsImports.id, fileName: totvsImports.fileName })
      .from(totvsImports)
      .where(eq(totvsImports.fileHash, hash))
      .limit(1);
    if (duplicate[0]) {
      return Response.json(
        { error: `Este arquivo já foi importado como ${duplicate[0].fileName}.` },
        { status: 409 },
      );
    }

    const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return Response.json({ error: "A planilha não possui abas legíveis." }, { status: 422 });
    }
    const rows = XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[firstSheetName], {
      defval: "",
      raw: false,
    });
    if (rows.length > MAX_ROWS) {
      return Response.json(
        { error: `O arquivo possui mais de ${MAX_ROWS.toLocaleString("pt-BR")} linhas.` },
        { status: 413 },
      );
    }

    const columns = rows[0] ? Object.keys(rows[0]) : [];
    if (!columns.length) {
      return Response.json({ error: "Nenhuma coluna foi identificada." }, { status: 422 });
    }
    const mapping = inferMapping(columns);
    const storageKey = `totvs/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const runtime = getRuntimeEnv();
    if (!runtime.BUCKET) {
      return Response.json({ error: "Armazenamento de documentos indisponível." }, { status: 503 });
    }
    await runtime.BUCKET.put(storageKey, bytes, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { originalName: file.name, importedBy: user.email, sha256: hash },
    });

    const normalized = rows.map((row, index) => normalizeRow(row, mapping, index + 2));
    const accepted = normalized.filter((row) => row.validationStatus === "VALID");
    const rejected = normalized.length - accepted.length;
    const [createdImport] = await db
      .insert(totvsImports)
      .values({
        fileName: file.name,
        storageKey,
        fileHash: hash,
        fileSize: file.size,
        status: rejected ? "IMPORTED_WITH_WARNINGS" : "IMPORTED",
        totalRows: normalized.length,
        acceptedRows: accepted.length,
        rejectedRows: rejected,
        columnsJson: JSON.stringify(columns),
        mappingJson: JSON.stringify(mapping),
        importedBy: user.email,
      })
      .returning();

    for (let index = 0; index < normalized.length; index += 25) {
      const chunk = normalized.slice(index, index + 25).map((row) => ({
        importId: createdImport.id,
        ...row,
      }));
      if (chunk.length) await db.insert(totvsRows).values(chunk);
    }

    await db
      .insert(integrationStates)
      .values({
        integrationKey: "totvs-file",
        status: "ONLINE",
        lastSyncAt: new Date().toISOString(),
        receivedCount: normalized.length,
      })
      .onConflictDoUpdate({
        target: integrationStates.integrationKey,
        set: {
          status: "ONLINE",
          lastSyncAt: new Date().toISOString(),
          receivedCount: sql`${integrationStates.receivedCount} + ${normalized.length}`,
          updatedAt: new Date().toISOString(),
        },
      });

    await db.insert(auditLogs).values({
      userEmail: user.email,
      action: "IMPORT_TOTVS_FILE",
      entityType: "TOTVS_IMPORT",
      entityId: String(createdImport.id),
      newValue: JSON.stringify({ fileName: file.name, rows: normalized.length, hash }),
    });

    return Response.json(
      {
        import: {
          id: createdImport.id,
          fileName: file.name,
          totalRows: normalized.length,
          acceptedRows: accepted.length,
          rejectedRows: rejected,
          columns,
          mapping,
          preview: normalized.slice(0, 5).map((row) => JSON.parse(row.rawJson)),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao importar o relatório." },
      { status: 500 },
    );
  }
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inferMapping(columns: string[]) {
  const normalizedColumns = columns.map((column) => ({ column, normalized: normalize(column) }));
  return Object.fromEntries(
    Object.entries(fieldMatchers).map(([field, candidates]) => [
      field,
      normalizedColumns.find((item) => candidates.includes(item.normalized))?.column ?? "",
    ]),
  ) as Record<string, string>;
}

function valueFrom(row: RawRow, mapping: Record<string, string>, key: string) {
  const column = mapping[key];
  return column ? row[column] : "";
}

function normalizeRow(row: RawRow, mapping: Record<string, string>, rowNumber: number) {
  const accessKey = cleanDigits(valueFrom(row, mapping, "accessKey"));
  const documentNumber = cleanText(valueFrom(row, mapping, "documentNumber"));
  const cnpj = cleanDigits(valueFrom(row, mapping, "cnpj"));
  const isValid = Boolean(accessKey || documentNumber || cnpj);

  return {
    rowNumber,
    accessKey: accessKey || null,
    documentNumber: documentNumber || null,
    series: cleanText(valueFrom(row, mapping, "series")) || null,
    cnpj: cnpj || null,
    supplierName: cleanText(valueFrom(row, mapping, "supplierName")) || null,
    grossValue: parseBrazilianNumber(valueFrom(row, mapping, "grossValue")),
    netValue: parseBrazilianNumber(valueFrom(row, mapping, "netValue")),
    emissionDate: parseDate(valueFrom(row, mapping, "emissionDate")),
    dueDate: parseDate(valueFrom(row, mapping, "dueDate")),
    invoiceNumber: cleanText(valueFrom(row, mapping, "invoiceNumber")) || null,
    titleNumber: cleanText(valueFrom(row, mapping, "titleNumber")) || null,
    costCenter: cleanText(valueFrom(row, mapping, "costCenter")) || null,
    branchCode: cleanText(valueFrom(row, mapping, "branchCode")) || null,
    rawJson: JSON.stringify(row),
    validationStatus: isValid ? "VALID" : "REJECTED",
    validationMessage: isValid ? null : "Linha sem chave, documento ou CNPJ para conciliação.",
  };
}

function cleanDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function cleanText(value: unknown) {
  return String(value ?? "").trim().slice(0, 240);
}

function parseBrazilianNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim().replace(/R\$\s?/g, "").replace(/\s/g, "");
  if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value ?? "").trim();
  if (!text) return null;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]))).toISOString();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
}
