import { asc, count, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, portalUsers } from "../../../db/schema";
import { getRequestUser } from "../../../lib/identity";
import { getRuntimeEnv } from "../../../lib/runtime-env";

export const dynamic = "force-dynamic";

const allowedRoles = new Set(["ADMINISTRATOR", "FISCAL", "FINANCIAL", "AUDITOR", "READER"]);
const allowedStatuses = new Set(["ACTIVE", "INACTIVE"]);

async function ensurePortalUsersStorage() {
  const d1 = getRuntimeEnv().DB;
  if (!d1) throw new Error("Banco de dados indisponível.");
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS portal_users (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      role text DEFAULT 'READER' NOT NULL,
      branch_scope_json text DEFAULT '["ALL"]' NOT NULL,
      status text DEFAULT 'ACTIVE' NOT NULL,
      last_access_at text,
      created_by text NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS portal_users_email_idx ON portal_users (email)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS portal_users_status_idx ON portal_users (status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS portal_users_role_idx ON portal_users (role)"),
  ]);
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeBranches(value: unknown) {
  if (!Array.isArray(value)) return ["ALL"];
  const items = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
  return items.length ? Array.from(new Set(items)) : ["ALL"];
}

function toClientUser(row: typeof portalUsers.$inferSelect) {
  let branches: string[] = ["ALL"];
  try {
    const parsed = JSON.parse(row.branchScopeJson);
    if (Array.isArray(parsed) && parsed.length) branches = parsed.map(String);
  } catch {
    branches = ["ALL"];
  }
  return { ...row, branches };
}

async function requireAdministrator(request: Request) {
  await ensurePortalUsersStorage();
  const identity = getRequestUser(request);
  const db = getDb();
  const current = await db
    .select()
    .from(portalUsers)
    .where(eq(portalUsers.email, normalizeEmail(identity.email)))
    .limit(1);

  if (!current[0] || current[0].status !== "ACTIVE" || current[0].role !== "ADMINISTRATOR") {
    return { identity, db, current: null };
  }
  return { identity, db, current: current[0] };
}

export async function GET(request: Request) {
  try {
    await ensurePortalUsersStorage();
    const identity = getRequestUser(request);
    const db = getDb();
    const email = normalizeEmail(identity.email);
    let current = await db.select().from(portalUsers).where(eq(portalUsers.email, email)).limit(1);

    if (!current[0]) {
      const totals = await db.select({ value: count() }).from(portalUsers);
      if (Number(totals[0]?.value ?? 0) === 0) {
        const [created] = await db.insert(portalUsers).values({
          name: identity.name || email.split("@")[0],
          email,
          role: "ADMINISTRATOR",
          branchScopeJson: JSON.stringify(["ALL"]),
          status: "ACTIVE",
          lastAccessAt: new Date().toISOString(),
          createdBy: email,
        }).returning();
        current = [created];
      } else {
        return Response.json({ error: "Seu perfil ainda não foi cadastrado na gestão de usuários." }, { status: 403 });
      }
    }

    if (current[0].status !== "ACTIVE") {
      return Response.json({ error: "Seu perfil está inativo." }, { status: 403 });
    }

    const now = new Date().toISOString();
    await db.update(portalUsers).set({ lastAccessAt: now }).where(eq(portalUsers.id, current[0].id));
    const users = current[0].role === "ADMINISTRATOR"
      ? await db.select().from(portalUsers).orderBy(asc(portalUsers.name))
      : [current[0]];

    return Response.json({
      users: users.map(toClientUser),
      currentUser: toClientUser({ ...current[0], lastAccessAt: now }),
      canManage: current[0].role === "ADMINISTRATOR",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar os usuários." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { identity, db, current } = await requireAdministrator(request);
    if (!current) return Response.json({ error: "Somente administradores podem cadastrar usuários." }, { status: 403 });

    const payload = (await request.json()) as Record<string, unknown>;
    const name = String(payload.name ?? "").trim();
    const email = normalizeEmail(payload.email);
    const role = String(payload.role ?? "READER").toUpperCase();
    const status = String(payload.status ?? "ACTIVE").toUpperCase();
    const branches = normalizeBranches(payload.branches);

    if (name.length < 3) return Response.json({ error: "Informe o nome completo." }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
    if (!allowedRoles.has(role)) return Response.json({ error: "Perfil de acesso inválido." }, { status: 400 });
    if (!allowedStatuses.has(status)) return Response.json({ error: "Status inválido." }, { status: 400 });

    const duplicate = await db.select({ id: portalUsers.id }).from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
    if (duplicate[0]) return Response.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });

    const [created] = await db.insert(portalUsers).values({
      name,
      email,
      role,
      status,
      branchScopeJson: JSON.stringify(branches),
      createdBy: normalizeEmail(identity.email),
    }).returning();

    await db.insert(auditLogs).values({
      userEmail: normalizeEmail(identity.email),
      action: "CREATE_USER",
      entityType: "PORTAL_USER",
      entityId: String(created.id),
      newValue: JSON.stringify({ email, role, status, branches }),
    });

    return Response.json({ user: toClientUser(created) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao cadastrar o usuário." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { identity, db, current } = await requireAdministrator(request);
    if (!current) return Response.json({ error: "Somente administradores podem editar usuários." }, { status: 403 });

    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Usuário inválido." }, { status: 400 });
    const existing = await db.select().from(portalUsers).where(eq(portalUsers.id, id)).limit(1);
    if (!existing[0]) return Response.json({ error: "Usuário não localizado." }, { status: 404 });

    const name = String(payload.name ?? existing[0].name).trim();
    const email = normalizeEmail(payload.email ?? existing[0].email);
    const role = String(payload.role ?? existing[0].role).toUpperCase();
    const status = String(payload.status ?? existing[0].status).toUpperCase();
    const branches = payload.branches === undefined ? normalizeBranches(JSON.parse(existing[0].branchScopeJson)) : normalizeBranches(payload.branches);

    if (name.length < 3) return Response.json({ error: "Informe o nome completo." }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
    if (!allowedRoles.has(role) || !allowedStatuses.has(status)) return Response.json({ error: "Perfil ou status inválido." }, { status: 400 });
    if (existing[0].email === normalizeEmail(identity.email) && (role !== "ADMINISTRATOR" || status !== "ACTIVE")) {
      return Response.json({ error: "O administrador atual não pode remover o próprio acesso." }, { status: 400 });
    }

    const duplicate = await db.select({ id: portalUsers.id }).from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
    if (duplicate[0] && duplicate[0].id !== id) return Response.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });

    const previousValue = JSON.stringify(toClientUser(existing[0]));
    const [updated] = await db.update(portalUsers).set({
      name,
      email,
      role,
      status,
      branchScopeJson: JSON.stringify(branches),
      updatedAt: new Date().toISOString(),
    }).where(eq(portalUsers.id, id)).returning();

    await db.insert(auditLogs).values({
      userEmail: normalizeEmail(identity.email),
      action: "UPDATE_USER",
      entityType: "PORTAL_USER",
      entityId: String(id),
      previousValue,
      newValue: JSON.stringify(toClientUser(updated)),
    });

    return Response.json({ user: toClientUser(updated) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar o usuário." },
      { status: 500 },
    );
  }
}
