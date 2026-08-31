import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, userDashboards } from "../../../db/schema";
import { getRequestUser } from "../../../lib/identity";

export const dynamic = "force-dynamic";

const defaultLayout = [
  { id: "freight", type: "kpi", title: "Valor total de fretes", size: "sm" },
  { id: "cte", type: "kpi", title: "CT-e recebidos", size: "sm" },
  { id: "reconciled", type: "kpi", title: "Conciliação", size: "sm" },
  { id: "divergent", type: "kpi", title: "Divergências", size: "sm" },
  { id: "evolution", type: "chart", title: "Evolução mensal de fretes", size: "lg" },
  { id: "carriers", type: "ranking", title: "Transportadoras", size: "md" },
  { id: "ai", type: "insight", title: "Insights da IA", size: "md" },
];

export async function GET(request: Request) {
  try {
    const user = getRequestUser(request);
    const db = getDb();
    const rows = await db
      .select()
      .from(userDashboards)
      .where(eq(userDashboards.userEmail, user.email))
      .orderBy(desc(userDashboards.isDefault), desc(userDashboards.updatedAt))
      .limit(1);

    if (!rows[0]) {
      return Response.json({
        dashboard: {
          id: null,
          name: "Dashboard Gestão",
          layout: defaultLayout,
          filters: {},
          version: 0,
        },
      });
    }

    return Response.json({
      dashboard: {
        id: rows[0].id,
        name: rows[0].name,
        layout: JSON.parse(rows[0].layoutJson),
        filters: JSON.parse(rows[0].globalFiltersJson),
        version: rows[0].version,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao abrir o dashboard." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = getRequestUser(request);
    const payload = (await request.json()) as {
      id?: number | null;
      name?: string;
      layout?: unknown[];
      filters?: Record<string, unknown>;
      version?: number;
    };

    if (!Array.isArray(payload.layout) || payload.layout.length > 30) {
      return Response.json({ error: "Layout inválido." }, { status: 400 });
    }

    const db = getDb();
    const layoutJson = JSON.stringify(payload.layout);
    const filtersJson = JSON.stringify(payload.filters ?? {});

    if (payload.id) {
      const current = await db
        .select()
        .from(userDashboards)
        .where(eq(userDashboards.id, payload.id))
        .limit(1);
      if (!current[0] || current[0].userEmail !== user.email) {
        return Response.json({ error: "Dashboard não localizado." }, { status: 404 });
      }
      if (current[0].version !== payload.version) {
        return Response.json(
          { error: "O dashboard foi atualizado em outra sessão. Recarregue antes de salvar." },
          { status: 409 },
        );
      }

      const [updated] = await db
        .update(userDashboards)
        .set({
          name: payload.name?.trim() || current[0].name,
          layoutJson,
          globalFiltersJson: filtersJson,
          version: current[0].version + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(userDashboards.id, payload.id))
        .returning();

      await db.insert(auditLogs).values({
        userEmail: user.email,
        action: "UPDATE_DASHBOARD",
        entityType: "USER_DASHBOARD",
        entityId: String(payload.id),
        previousValue: current[0].layoutJson,
        newValue: layoutJson,
      });

      return Response.json({ dashboard: { id: updated.id, version: updated.version } });
    }

    const [created] = await db
      .insert(userDashboards)
      .values({
        userEmail: user.email,
        name: payload.name?.trim() || "Meu dashboard",
        isDefault: true,
        layoutJson,
        globalFiltersJson: filtersJson,
      })
      .returning();

    return Response.json({ dashboard: { id: created.id, version: created.version } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar o dashboard." },
      { status: 500 },
    );
  }
}
