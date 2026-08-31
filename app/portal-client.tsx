"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CloudCog,
  Database,
  FileCheck2,
  FileClock,
  FileSpreadsheet,
  FileText,
  Filter,
  GripVertical,
  History,
  LayoutDashboard,
  LoaderCircle,
  Maximize2,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Truck,
  UploadCloud,
  UserPlus,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Metrics = {
  totalDocuments: number;
  nfe: number;
  cte: number;
  nfse: number;
  grossValue: number;
  taxTotal: number;
  retainedTotal: number;
  icmsValue: number;
  issValue: number;
  ipiValue: number;
  pisValue: number;
  cofinsValue: number;
  pendingTotvs: number;
  reconciled: number;
  divergent: number;
  reconciliationRate: number;
  totvsImports: number;
};

type Branch = { id: number; name: string; cnpj: string };
type Widget = { id: string; type: string; title: string; size: "sm" | "md" | "lg" };
type DashboardState = { id: number | null; name: string; layout: Widget[]; filters: Record<string, unknown>; version: number };
type Integration = {
  key: string;
  name: string;
  description: string;
  status: string;
  lastSyncAt: string | null;
  receivedCount: number;
  errorCount: number;
};
type ImportRecord = {
  id: number;
  fileName: string;
  status: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  importedBy: string;
  importedAt: string;
};
type FiscalDocument = {
  id: number;
  qiveId: string | null;
  type: string;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  emissionDate: string | null;
  emitterName: string | null;
  emitterCnpj: string | null;
  receiverName: string | null;
  receiverCnpj: string | null;
  ownerCnpj: string | null;
  ownerRole: string | null;
  carrierName: string | null;
  grossValue: number | null;
  freightValue: number | null;
  icmsValue: number | null;
  icmsStValue: number | null;
  ipiValue: number | null;
  pisValue: number | null;
  cofinsValue: number | null;
  issValue: number | null;
  inssRetainedValue: number | null;
  irrfRetainedValue: number | null;
  csllRetainedValue: number | null;
  pisRetainedValue: number | null;
  cofinsRetainedValue: number | null;
  issRetainedValue: number | null;
  retainedTotal: number | null;
  taxTotal: number | null;
  fiscalStatus: string;
  totvsStatus: string;
  reconciliationStatus: string;
  branchName: string | null;
};

type RetentionMetrics = {
  documentCount: number;
  retainedTotal: number;
  irrf: number;
  inss: number;
  csll: number;
  pis: number;
  cofins: number;
  iss: number;
};

type RetentionState = { metrics: RetentionMetrics; documents: FiscalDocument[] };
type AuditEvent = {
  id: number;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  source: string;
  createdAt: string;
};

type PortalUser = {
  id: number;
  name: string;
  email: string;
  role: "ADMINISTRATOR" | "FISCAL" | "FINANCIAL" | "AUDITOR" | "READER";
  branches: string[];
  status: "ACTIVE" | "INACTIVE";
  lastAccessAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const QIVE_DOCUMENT_TYPES = ["NFE", "CTE", "NFSE"] as const;
const QIVE_TYPE_LABELS: Record<(typeof QIVE_DOCUMENT_TYPES)[number], string> = {
  NFE: "NF-e",
  CTE: "CT-e",
  NFSE: "NFS-e",
};

const emptyMetrics: Metrics = {
  totalDocuments: 0,
  nfe: 0,
  cte: 0,
  nfse: 0,
  grossValue: 0,
  taxTotal: 0,
  retainedTotal: 0,
  icmsValue: 0,
  issValue: 0,
  ipiValue: 0,
  pisValue: 0,
  cofinsValue: 0,
  pendingTotvs: 0,
  reconciled: 0,
  divergent: 0,
  reconciliationRate: 0,
  totvsImports: 0,
};

const emptyRetentions: RetentionState = {
  metrics: { documentCount: 0, retainedTotal: 0, irrf: 0, inss: 0, csll: 0, pis: 0, cofins: 0, iss: 0 },
  documents: [],
};

const knownCarmakBranches: Branch[] = [
  { id: -1, name: "São Leopoldo/RS", cnpj: "94534237000104" },
  { id: -2, name: "Camaçari/BA", cnpj: "94534237000287" },
  { id: -3, name: "Horizontina/RS", cnpj: "94534237000368" },
  { id: -4, name: "Panambi/RS", cnpj: "94534237000449" },
  { id: -5, name: "Itajaí/SC", cnpj: "94534237000520" },
  { id: -6, name: "Sumaré/SP", cnpj: "94534237000600" },
  { id: -7, name: "Chapecó/SC", cnpj: "94534237000791" },
];

const userRoleLabels: Record<PortalUser["role"], string> = {
  ADMINISTRATOR: "Administrador",
  FISCAL: "Fiscal",
  FINANCIAL: "Financeiro",
  AUDITOR: "Auditoria",
  READER: "Consulta",
};

const defaultWidgets: Widget[] = [
  { id: "documents", type: "kpi", title: "Documentos fiscais", size: "sm" },
  { id: "gross", type: "kpi", title: "Valor fiscal dos documentos", size: "sm" },
  { id: "retained", type: "kpi", title: "Retenções identificadas", size: "sm" },
  { id: "reconciled", type: "kpi", title: "Conciliação fiscal", size: "sm" },
  { id: "taxmix", type: "chart", title: "Composição dos tributos", size: "lg" },
  { id: "doctypes", type: "ranking", title: "Documentos por tipo", size: "md" },
  { id: "ai", type: "insight", title: "Insights fiscais da IA", size: "md" },
];

const widgetLibrary: Array<Widget & { description: string }> = [
  { id: "documents", type: "kpi", title: "Documentos fiscais", size: "sm", description: "Total de documentos recebidos" },
  { id: "nfe", type: "kpi", title: "NF-e recebidas", size: "sm", description: "Quantidade de notas de produto" },
  { id: "cte", type: "kpi", title: "CT-e recebidos", size: "sm", description: "Documentos fiscais de transporte" },
  { id: "nfse", type: "kpi", title: "NFS-e recebidas", size: "sm", description: "Quantidade de notas de serviço" },
  { id: "gross", type: "kpi", title: "Valor fiscal total", size: "sm", description: "Somatório bruto dos documentos" },
  { id: "taxes", type: "kpi", title: "Tributos informados", size: "sm", description: "Valores tributários extraídos dos documentos" },
  { id: "retained", type: "kpi", title: "Retenções identificadas", size: "sm", description: "IRRF, CSLL, INSS, PIS, COFINS e ISS" },
  { id: "pending", type: "kpi", title: "Pendências TOTVS", size: "sm", description: "Documentos ainda não conciliados" },
  { id: "totvs", type: "kpi", title: "Importações TOTVS", size: "sm", description: "Arquivos processados" },
  { id: "taxmix", type: "chart", title: "Composição dos tributos", size: "lg", description: "ICMS, ISS, IPI, PIS e COFINS" },
  { id: "doctypes", type: "ranking", title: "Documentos por tipo", size: "md", description: "Distribuição entre NF-e, CT-e e NFS-e" },
  { id: "ai", type: "insight", title: "Insights fiscais da IA", size: "md", description: "Retenções, pendências e anomalias fiscais" },
];

function normalizeFiscalDashboard(value: DashboardState): DashboardState {
  const legacyLayout = value.layout?.some((widget) => ["freight", "evolution", "carriers"].includes(widget.id));
  const replacements: Record<string, Widget> = {
    freight: { id: "gross", type: "kpi", title: "Valor fiscal dos documentos", size: "sm" },
    evolution: { id: "taxmix", type: "chart", title: "Composição dos tributos", size: "lg" },
    carriers: { id: "doctypes", type: "ranking", title: "Documentos por tipo", size: "md" },
  };
  const normalized = (value.layout?.length ? value.layout : defaultWidgets).map((widget) => {
    if (legacyLayout && widget.id === "cte") return { id: "documents", type: "kpi", title: "Documentos fiscais", size: "sm" } as Widget;
    return replacements[widget.id] ?? widget;
  });
  if (legacyLayout && !normalized.some((widget) => widget.id === "retained")) {
    normalized.splice(2, 0, { id: "retained", type: "kpi", title: "Retenções identificadas", size: "sm" });
  }
  const unique = normalized.filter((widget, index, items) => items.findIndex((item) => item.id === widget.id) === index);
  return {
    ...value,
    name: value.name === "Dashboard Gestão" ? "Dashboard Fiscal Corporativo" : value.name,
    layout: unique.length ? unique : defaultWidgets,
  };
}

const navigation: Array<{ label: string; items: Array<{ id: string; label: string; icon: LucideIcon }> }> = [
  {
    label: "VISÃO CORPORATIVA",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "DOCUMENTOS FISCAIS",
    items: [
      { id: "documents", label: "Central Fiscal", icon: FileText },
      { id: "nfe", label: "NF-e", icon: ReceiptText },
      { id: "cte", label: "CT-e", icon: Truck },
      { id: "nfse", label: "NFS-e", icon: FileCheck2 },
      { id: "retentions", label: "Retenções", icon: WalletCards },
      { id: "reform", label: "IBS / CBS / IS", icon: CircleDollarSign },
    ],
  },
  {
    label: "CONCILIAÇÃO",
    items: [
      { id: "totvs", label: "Confronto TOTVS", icon: FileSpreadsheet },
      { id: "divergences", label: "Divergências", icon: AlertTriangle },
      { id: "pending", label: "Pendências", icon: FileClock },
    ],
  },
  {
    label: "GESTÃO",
    items: [
      { id: "reports", label: "Relatórios", icon: BarChart3 },
      { id: "ai", label: "IA Carmak", icon: Bot },
      { id: "integrations", label: "Integrações", icon: CloudCog },
      { id: "users", label: "Usuários", icon: Users },
      { id: "audit", label: "Auditoria", icon: ShieldCheck },
    ],
  },
];

export default function PortalClient({ displayName, email }: { displayName: string; email: string }) {
  const [active, setActive] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [dashboard, setDashboard] = useState<DashboardState>({
    id: null,
    name: "Dashboard Fiscal Corporativo",
    layout: defaultWidgets,
    filters: {},
    version: 0,
  });
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [editDashboard, setEditDashboard] = useState(false);
  const [widgetModal, setWidgetModal] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [syncingQive, setSyncingQive] = useState(false);
  const [nextSyncAt, setNextSyncAt] = useState<string | null>(null);
  const syncInFlight = useRef(false);

  const refreshData = useCallback(async (month: string) => {
    setLoading(true);
    const monthQuery = new URLSearchParams({ month }).toString();
    const [overviewResult, dashboardResult, integrationsResult, importsResult] =
      await Promise.allSettled([
        fetch(`/api/overview?${monthQuery}`, { cache: "no-store" }).then(readJson),
        fetch("/api/dashboard", { cache: "no-store" }).then(readJson),
        fetch("/api/integrations", { cache: "no-store" }).then(readJson),
        fetch("/api/totvs/import", { cache: "no-store" }).then(readJson),
      ]);

    if (overviewResult.status === "fulfilled") {
      setMetrics(overviewResult.value.metrics ?? emptyMetrics);
      setBranches(overviewResult.value.branches ?? []);
    }
    if (dashboardResult.status === "fulfilled" && dashboardResult.value.dashboard) {
      setDashboard(normalizeFiscalDashboard(dashboardResult.value.dashboard));
    }
    if (integrationsResult.status === "fulfilled") setIntegrations(integrationsResult.value.integrations ?? []);
    if (importsResult.status === "fulfilled") setImports(importsResult.value.imports ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDark(window.localStorage.getItem("carmak-theme") === "dark");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshData(selectedMonth), 0);
    return () => window.clearTimeout(timeout);
  }, [refreshData, selectedMonth]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.localStorage.setItem("carmak-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const qiveIntegration = integrations.find((item) => item.key === "qive");
  const qiveConfigured = Boolean(
    qiveIntegration && qiveIntegration.status !== "NOT_CONFIGURED",
  );
  const qiveLastSyncAt = qiveIntegration?.lastSyncAt ?? null;

  const syncSelectedMonth = useCallback(async (automatic: boolean, notifyUser: boolean) => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncingQive(true);
    let processed = 0;
    const failures: string[] = [];
    try {
      for (const type of QIVE_DOCUMENT_TYPES) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 60_000);
        try {
          const data = await fetch("/api/integrations/qive/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ month: selectedMonth, type, automatic }),
            signal: controller.signal,
          }).then(readJson);
          processed += Number(data.processed ?? 0);
          if (data.status === "COMPLETED_WITH_ERRORS") failures.push(QIVE_TYPE_LABELS[type]);
        } catch {
          failures.push(QIVE_TYPE_LABELS[type]);
        } finally {
          window.clearTimeout(timeout);
          await refreshData(selectedMonth);
        }
      }
      setNextSyncAt(new Date(Date.now() + AUTO_SYNC_INTERVAL_MS).toISOString());
      if (notifyUser) {
        setToast(failures.length
          ? `Atualização parcial: ${processed} documentos processados. Verifique ${failures.join(", ")}.`
          : `${processed} documentos foram incorporados ou atualizados.`);
      }
    } finally {
      await refreshData(selectedMonth);
      syncInFlight.current = false;
      setSyncingQive(false);
    }
  }, [refreshData, selectedMonth]);

  useEffect(() => {
    if (!qiveConfigured) {
      const reset = window.setTimeout(() => setNextSyncAt(null), 0);
      return () => window.clearTimeout(reset);
    }
    const lastSyncTime = qiveLastSyncAt ? Date.parse(qiveLastSyncAt) : Number.NaN;
    const initialDelay = Number.isFinite(lastSyncTime)
      ? Math.max(0, lastSyncTime + AUTO_SYNC_INTERVAL_MS - Date.now())
      : 0;
    const initial = window.setTimeout(() => {
      setNextSyncAt(new Date(Date.now() + AUTO_SYNC_INTERVAL_MS).toISOString());
      void syncSelectedMonth(true, false);
    }, initialDelay);
    const nextRun = new Date(Date.now() + initialDelay).toISOString();
    const nextSyncState = window.setTimeout(() => setNextSyncAt(nextRun), 0);
    const interval = window.setInterval(() => {
      void syncSelectedMonth(true, false);
    }, AUTO_SYNC_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(nextSyncState);
      window.clearInterval(interval);
    };
  }, [qiveConfigured, qiveLastSyncAt, syncSelectedMonth]);

  function navigate(id: string) {
    setActive(id);
    setMobileMenu(false);
  }

  async function saveDashboard() {
    try {
      const response = await fetch("/api/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dashboard),
      });
      const data = await readJson(response);
      setDashboard((current) => ({ ...current, id: data.dashboard.id, version: data.dashboard.version }));
      setEditDashboard(false);
      setToast("Dashboard personalizado salvo.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Não foi possível salvar o dashboard.");
    }
  }

  function reorderWidgets(sourceId: string, targetId: string) {
    if (!editDashboard || sourceId === targetId) return;
    setDashboard((current) => {
      const sourceIndex = current.layout.findIndex((item) => item.id === sourceId);
      const targetIndex = current.layout.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current.layout];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...current, layout: next };
    });
  }

  function addWidget(widget: Widget) {
    setDashboard((current) => {
      if (current.layout.some((item) => item.id === widget.id)) return current;
      return { ...current, layout: [...current.layout, widget] };
    });
    setWidgetModal(false);
    setEditDashboard(true);
  }

  function removeWidget(id: string) {
    setDashboard((current) => ({ ...current, layout: current.layout.filter((item) => item.id !== id) }));
  }

  return (
    <div className="portal-shell">
      <Sidebar
        active={active}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileMenu}
        onNavigate={navigate}
        onCollapse={() => setSidebarCollapsed((value) => !value)}
        onCloseMobile={() => setMobileMenu(false)}
      />
      <div className={`portal-main ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
        <Topbar
          displayName={displayName}
          email={email}
          dark={dark}
          onTheme={() => setDark((value) => !value)}
          onMenu={() => setMobileMenu(true)}
          onAi={() => setAiOpen(true)}
        />
        <main className="content-area">
          {active === "dashboard" && (
            <DashboardView
              loading={loading}
              metrics={metrics}
              branches={branches}
              dashboard={dashboard}
              qiveConfigured={qiveConfigured}
              edit={editDashboard}
              onToggleEdit={() => setEditDashboard((value) => !value)}
              onSave={saveDashboard}
              onOpenLibrary={() => setWidgetModal(true)}
              onRemove={removeWidget}
              onReorder={reorderWidgets}
              onIntegrations={() => navigate("integrations")}
              onAi={() => setAiOpen(true)}
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              syncing={syncingQive}
              lastSyncAt={qiveIntegration?.lastSyncAt ?? null}
              nextSyncAt={nextSyncAt}
              onRefresh={() => void syncSelectedMonth(false, true)}
            />
          )}
          {(active === "documents" || active === "nfe" || active === "cte" || active === "nfse") && (
            <DocumentsView
              active={active}
              branches={branches}
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              syncing={syncingQive}
              nextSyncAt={nextSyncAt}
              onRefresh={() => void syncSelectedMonth(false, true)}
            />
          )}
          {active === "totvs" && (
            <TotvsView imports={imports} onImported={() => void refreshData(selectedMonth)} onToast={setToast} />
          )}
          {active === "integrations" && (
            <IntegrationsView
              integrations={integrations}
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              syncing={syncingQive}
              nextSyncAt={nextSyncAt}
              onRefresh={() => void refreshData(selectedMonth)}
              onSync={() => void syncSelectedMonth(false, true)}
              onToast={setToast}
            />
          )}
          {active === "reports" && <ReportsView hasData={metrics.totalDocuments > 0} month={selectedMonth} />}
          {active === "retentions" && (
            <RetentionsView
              month={selectedMonth}
              syncing={syncingQive}
              onMonthChange={setSelectedMonth}
              onRefresh={() => void syncSelectedMonth(false, true)}
            />
          )}
          {active === "reform" && (
            <ReformView
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
            />
          )}
          {active === "divergences" && (
            <ReconciliationQueueView
              mode="DIVERGENT"
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
            />
          )}
          {active === "pending" && (
            <ReconciliationQueueView
              mode="NOT_PROCESSED"
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
            />
          )}
          {active === "ai" && <AiWorkspaceView />}
          {active === "users" && (
            <UsersView currentEmail={email} onToast={setToast} />
          )}
          {active === "audit" && (
            <AuditView />
          )}
        </main>
      </div>
      <AiDrawer open={aiOpen} onClose={() => setAiOpen(false)} />
      {widgetModal && (
        <WidgetLibrary
          current={dashboard.layout}
          onAdd={addWidget}
          onClose={() => setWidgetModal(false)}
        />
      )}
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function Sidebar({ active, collapsed, mobileOpen, onNavigate, onCollapse, onCloseMobile }: {
  active: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: (id: string) => void;
  onCollapse: () => void;
  onCloseMobile: () => void;
}) {
  return (
    <>
      {mobileOpen && <button className="mobile-overlay" onClick={onCloseMobile} aria-label="Fechar menu" />}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-identity">
            <img className="brand-logo" src="/carmak-logo.png" alt="Carmak" />
            {!collapsed && <span>Portal Fiscal</span>}
          </div>
          <button className="icon-button sidebar-mobile-close" onClick={onCloseMobile} aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <div className="company-chip">
          <Building2 size={17} />
          {!collapsed && <div><strong>Grupo Carmak</strong><span>Ambiente corporativo</span></div>}
        </div>
        <nav className="navigation" aria-label="Navegação principal">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              {!collapsed && <p>{group.label}</p>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${active === item.id ? "active" : ""}`}
                    onClick={() => onNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={19} strokeWidth={1.9} />
                    {!collapsed && <span>{item.label}</span>}
                    {!collapsed && active === item.id && <span className="active-dot" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button className="collapse-button" onClick={onCollapse} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Recolher menu</span>}
        </button>
      </aside>
    </>
  );
}

function Topbar({ displayName, email, dark, onTheme, onMenu, onAi }: {
  displayName: string;
  email: string;
  dark: boolean;
  onTheme: () => void;
  onMenu: () => void;
  onAi: () => void;
}) {
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <header className="topbar">
      <button className="icon-button mobile-menu-button" onClick={onMenu} aria-label="Abrir menu"><Menu size={21} /></button>
      <div className="global-search">
        <Search size={18} />
        <input aria-label="Busca global" placeholder="Buscar chave, documento, fornecedor, CNPJ ou tributo..." />
        <span>Ctrl K</span>
      </div>
      <div className="topbar-actions">
        <button className="ai-quick-button" onClick={onAi}><Sparkles size={16} />Pergunte à IA</button>
        <button className="icon-button" onClick={onTheme} aria-label="Alternar tema">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
        <button className="icon-button notification-button" aria-label="Notificações"><Bell size={19} /><span /></button>
        <div className="profile">
          <div className="avatar">{initials || "CM"}</div>
          <div className="profile-copy"><strong>{displayName}</strong><span>{email}</span></div>
          <ChevronDown size={16} />
        </div>
      </div>
    </header>
  );
}

function DashboardView({ loading, metrics, branches, dashboard, qiveConfigured, edit, onToggleEdit, onSave, onOpenLibrary, onRemove, onReorder, onIntegrations, onAi, month, onMonthChange, syncing, lastSyncAt, nextSyncAt, onRefresh }: {
  loading: boolean;
  metrics: Metrics;
  branches: Branch[];
  dashboard: DashboardState;
  qiveConfigured: boolean;
  edit: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
  onOpenLibrary: () => void;
  onRemove: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onIntegrations: () => void;
  onAi: () => void;
  month: string;
  onMonthChange: (month: string) => void;
  syncing: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  onRefresh: () => void;
}) {
  const dragged = useRef<string | null>(null);
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">VISÃO CORPORATIVA</p>
          <h1>{dashboard.name}</h1>
          <span>Documentos, tributos, retenções, conciliação e riscos fiscais em uma única visão.</span>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={onRefresh} disabled={syncing}><RefreshCw size={16} className={syncing ? "spinning" : ""} />{syncing ? "Sincronizando" : "Sincronizar mês"}</button>
          {edit ? (
            <>
              <button className="button secondary" onClick={onOpenLibrary}><Plus size={16} />Adicionar indicador</button>
              <button className="button primary" onClick={onSave}><Check size={17} />Salvar layout</button>
            </>
          ) : (
            <button className="button primary" onClick={onToggleEdit}><Pencil size={16} />Personalizar</button>
          )}
        </div>
      </section>
      <section className="filter-strip">
        <div className="filter-title"><Filter size={16} /><span>Filtros globais</span></div>
        <MonthField month={month} onChange={onMonthChange} />
        <label><span>Filial</span><select defaultValue="ALL"><option value="ALL">Todas as filiais</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label><span>Documento</span><select defaultValue="ALL"><option value="ALL">Todos os documentos</option><option value="NFE">NF-e</option><option value="CTE">CT-e</option><option value="NFSE">NFS-e</option></select></label>
        <AutomationChip syncing={syncing} lastSyncAt={lastSyncAt} nextSyncAt={nextSyncAt} />
      </section>
      {!qiveConfigured && (
        <section className="integration-banner">
          <div className="banner-icon"><CloudCog size={22} /></div>
          <div><strong>Integração Qive/Arquivei não configurada</strong><span>Conecte a conta para sincronizar NF-e, CT-e e NFS-e de todos os CNPJs autorizados.</span></div>
          <button onClick={onIntegrations}>Configurar integração <ArrowRight size={16} /></button>
        </section>
      )}
      {edit && <div className="edit-hint"><GripVertical size={17} /><span>Arraste os cards para reorganizar. Use os controles de cada widget para remover ou redimensionar.</span><button onClick={onToggleEdit}>Cancelar</button></div>}
      <section className={`dashboard-grid ${edit ? "editing" : ""}`}>
        {dashboard.layout.map((widget) => (
          <div
            key={widget.id}
            className={`widget-shell widget-${widget.size}`}
            draggable={edit}
            onDragStart={() => { dragged.current = widget.id; }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => { if (dragged.current) onReorder(dragged.current, widget.id); dragged.current = null; }}
          >
            {edit && <div className="widget-controls"><span><GripVertical size={15} />Mover</span><button onClick={() => onRemove(widget.id)} aria-label={`Remover ${widget.title}`}><Trash2 size={15} /></button></div>}
            <WidgetContent widget={widget} metrics={metrics} loading={loading} onAi={onAi} />
          </div>
        ))}
      </section>
    </>
  );
}

function MonthField({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <label className="month-field">
      <span>Competência</span>
      <div><CalendarDays size={14} /><select value={month} onChange={(event) => onChange(event.target.value)}>{monthOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    </label>
  );
}

function AutomationChip({ syncing, lastSyncAt, nextSyncAt }: { syncing: boolean; lastSyncAt: string | null; nextSyncAt: string | null }) {
  return (
    <div className="automation-chip">
      <RefreshCw size={15} className={syncing ? "spinning" : ""} />
      <div>
        <strong>{syncing ? "Atualizando competência" : "Atualização automática ativa"}</strong>
        <span>{syncing ? "Buscando NF-e, CT-e e NFS-e" : lastSyncAt ? `Última ${formatDateTime(lastSyncAt)} · Próxima ${nextSyncAt ? formatTime(nextSyncAt) : "em 15 min"}` : "Ao abrir e a cada 15 minutos"}</span>
      </div>
    </div>
  );
}

function WidgetContent({ widget, metrics, loading, onAi }: { widget: Widget; metrics: Metrics; loading: boolean; onAi: () => void }) {
  const kpis: Record<string, { value: string; detail: string; icon: LucideIcon; tone: string }> = {
    documents: { value: formatNumber(metrics.totalDocuments), detail: `${metrics.nfe} NF-e · ${metrics.cte} CT-e · ${metrics.nfse} NFS-e`, icon: FileText, tone: "green" },
    cte: { value: formatNumber(metrics.cte), detail: "Documentos fiscais de transporte", icon: Truck, tone: "blue" },
    reconciled: { value: `${metrics.reconciliationRate.toFixed(1).replace(".", ",")}%`, detail: `${metrics.reconciled} documentos conciliados`, icon: CheckCircle2, tone: "green" },
    divergent: { value: formatNumber(metrics.divergent), detail: metrics.divergent ? "Requerem conferência" : "Nenhuma divergência identificada", icon: AlertTriangle, tone: "amber" },
    nfe: { value: formatNumber(metrics.nfe), detail: "Notas de produto", icon: ReceiptText, tone: "blue" },
    nfse: { value: formatNumber(metrics.nfse), detail: "Notas de serviço", icon: FileCheck2, tone: "purple" },
    gross: { value: formatCurrency(metrics.grossValue), detail: "Valor bruto dos documentos", icon: WalletCards, tone: "green" },
    taxes: { value: formatCurrency(metrics.taxTotal), detail: "Tributos informados nos documentos", icon: CircleDollarSign, tone: "blue" },
    retained: { value: formatCurrency(metrics.retainedTotal), detail: "Retenções fiscais identificadas", icon: WalletCards, tone: "purple" },
    pending: { value: formatNumber(metrics.pendingTotvs), detail: "Aguardando conciliação TOTVS", icon: FileClock, tone: "amber" },
    totvs: { value: formatNumber(metrics.totvsImports), detail: "Relatórios processados", icon: FileSpreadsheet, tone: "blue" },
  };
  if (kpis[widget.id]) {
    const item = kpis[widget.id];
    const Icon = item.icon;
    return (
      <article className="kpi-card">
        <div className={`kpi-icon ${item.tone}`}><Icon size={20} /></div>
        <button className="widget-menu" aria-label="Opções do indicador"><MoreHorizontal size={18} /></button>
        <p>{widget.title}</p>
        <strong>{loading ? <span className="value-skeleton" /> : item.value}</strong>
        <span className="kpi-detail">{item.detail}</span>
      </article>
    );
  }
  if (widget.id === "taxmix" || widget.id === "evolution") {
    return (
      <article className="chart-card">
        <WidgetHeader title="Composição dos tributos" subtitle="Valores extraídos dos documentos da competência" />
        <TaxCompositionChart metrics={metrics} />
      </article>
    );
  }
  if (widget.id === "doctypes" || widget.id === "carriers") {
    return (
      <article className="ranking-card">
        <WidgetHeader title="Documentos por tipo" subtitle="Distribuição fiscal da competência" />
        <DocumentTypeDistribution metrics={metrics} />
      </article>
    );
  }
  return (
    <article className="insight-card">
      <div className="insight-title"><span><Sparkles size={17} />{widget.title}</span><small>ANÁLISE ASSISTIDA</small></div>
      <div className="insight-empty"><Bot size={29} /><div><strong>{metrics.totalDocuments ? "Análise fiscal disponível" : "Aguardando dados"}</strong><span>{metrics.totalDocuments ? "Pergunte sobre tributos, retenções, pendências e divergências." : "Sincronize documentos ou importe o relatório TOTVS para gerar insights fiscais."}</span></div></div>
      <button onClick={onAi}>Abrir IA Carmak <ArrowRight size={15} /></button>
    </article>
  );
}

function WidgetHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="widget-header"><div><strong>{title}</strong><span>{subtitle}</span></div><button aria-label="Expandir widget"><Maximize2 size={16} /></button></header>;
}

function TaxCompositionChart({ metrics }: { metrics: Metrics }) {
  const taxes = [["ICMS", metrics.icmsValue], ["ISS", metrics.issValue], ["IPI", metrics.ipiValue], ["PIS", metrics.pisValue], ["COFINS", metrics.cofinsValue]] as const;
  const max = Math.max(...taxes.map(([, value]) => value), 1);
  if (!metrics.totalDocuments) return <div className="compact-empty"><CircleDollarSign size={28} /><strong>Sem tributos para consolidar</strong><span>Os valores serão exibidos após a sincronização dos documentos fiscais.</span></div>;
  return <div className="tax-composition-chart">{taxes.map(([label, value]) => <div key={label}><header><span>{label}</span><strong>{formatCurrency(value)}</strong></header><div><i style={{ width: `${Math.max(2, (value / max) * 100)}%` }} /></div></div>)}</div>;
}

function DocumentTypeDistribution({ metrics }: { metrics: Metrics }) {
  const items = [["NF-e", metrics.nfe, ReceiptText], ["CT-e", metrics.cte, Truck], ["NFS-e", metrics.nfse, FileCheck2]] as const;
  const total = Math.max(metrics.totalDocuments, 1);
  return <div className="document-type-list">{items.map(([label, value, Icon]) => <div key={label}><div className="document-type-icon"><Icon size={17} /></div><div><header><strong>{label}</strong><span>{formatNumber(value)}</span></header><div><i style={{ width: `${(value / total) * 100}%` }} /></div><small>{((value / total) * 100).toFixed(1).replace(".", ",")}% do total</small></div></div>)}</div>;
}

function DocumentsView({ active, branches, month, onMonthChange, syncing, nextSyncAt, onRefresh }: {
  active: string;
  branches: Branch[];
  month: string;
  onMonthChange: (month: string) => void;
  syncing: boolean;
  nextSyncAt: string | null;
  onRefresh: () => void;
}) {
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [ownerCnpj, setOwnerCnpj] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [expandedDocumentId, setExpandedDocumentId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<FiscalDocument | null>(null);
  const pageSize = 20;
  const titles: Record<string, [string, string]> = {
    documents: ["Central Fiscal", "Consulta integrada de NF-e, CT-e e NFS-e com tributos, retenções, filial e conciliação TOTVS."],
    nfe: ["Notas fiscais eletrônicas recebidas", "Somente NF-e recebidas por um CNPJ Carmak; emissões da Carmak são excluídas."],
    cte: ["Conhecimentos de transporte", "Documentos fiscais de transporte, tomador, tributos e vínculos com NF-e e TOTVS."],
    nfse: ["Notas fiscais de serviço recebidas", "Somente NFS-e recebidas por um CNPJ Carmak; emissões da Carmak são excluídas."],
  };
  const [title, description] = titles[active] ?? titles.documents;
  const expectedType = active === "documents" ? "ALL" : active.toUpperCase();
  const branchOptions = [...new Map(
    [...knownCarmakBranches, ...branches].map((branch) => [branch.cnpj.replace(/\D/g, ""), branch]),
  ).values()];

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      const query = new URLSearchParams({
        month,
        type: expectedType,
        page: String(page),
        limit: String(pageSize),
        status,
        ...(ownerCnpj !== "ALL" ? { owner: ownerCnpj } : {}),
        ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
      });
      try {
        const data = await fetch(`/api/documents?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        }).then(readJson);
        setDocuments(data.documents ?? []);
        setTotal(Number(data.total ?? 0));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDocuments([]);
          setTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, searchTerm.trim() ? 280 : 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [expectedType, month, ownerCnpj, page, searchTerm, status, syncing]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const identifiedCnpjs = new Set(documents.map(carmakCnpjForDocument).filter(Boolean)).size;
  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">DOCUMENTOS FISCAIS</p><h1>{title}</h1><span>{description}</span></div>
        <div className="heading-actions"><button className="button secondary" onClick={onRefresh} disabled={syncing}><RefreshCw size={16} className={syncing ? "spinning" : ""} />{syncing ? "Sincronizando" : "Sincronizar mês"}</button><button className="button primary"><FileSpreadsheet size={16} />Exportar</button></div>
      </section>
      <section className="document-summary-row">
        <div><span>Total localizado</span><strong>{formatNumber(total)}</strong></div>
        <div><span>Exibidos nesta página</span><strong>{formatNumber(documents.length)}</strong></div>
        <div><span>Com retenção nesta página</span><strong>{formatNumber(documents.filter((item) => (item.retainedTotal ?? 0) > 0).length)}</strong></div>
        <div><span>CNPJs Carmak identificados</span><strong>{formatNumber(identifiedCnpjs)}</strong></div>
      </section>
      <section className="table-panel">
        <div className="table-toolbar">
          <div className="table-search"><Search size={17} /><input value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} placeholder="Buscar número, chave, emitente ou CNPJ" /></div>
          <div className="month-toolbar"><CalendarDays size={15} /><select aria-label="Competência dos documentos" value={month} onChange={(event) => { onMonthChange(event.target.value); setPage(1); }}>{monthOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <select aria-label="CNPJ Carmak" value={ownerCnpj} onChange={(event) => { setOwnerCnpj(event.target.value); setPage(1); }}><option value="ALL">Todos os CNPJs Carmak</option>{branchOptions.map((branch) => <option key={branch.cnpj} value={branch.cnpj.replace(/\D/g, "")}>{branch.name} · {formatCnpj(branch.cnpj)}</option>)}</select>
          <select aria-label="Status do documento" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">Todos os status</option><option value="RECONCILED">Conciliado</option><option value="DIVERGENT">Divergente</option><option value="NOT_PROCESSED">Não processado</option></select>
          <span className="table-auto-status"><i className={syncing ? "spinning-dot" : ""} />{syncing ? "Atualizando" : `Incremental · ${nextSyncAt ? formatTime(nextSyncAt) : "15 min"}`}</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Documento</th><th>Emissão</th><th>Emitente / Transportadora</th><th>CNPJ Carmak / Filial</th><th>Valor</th><th>Impostos / Retenções</th><th>Fiscal</th><th>TOTVS</th><th /></tr></thead>
            <tbody>
              {documents.map((document) => {
                const carmakCnpj = carmakCnpjForDocument(document);
                return (
                  <Fragment key={document.id}>
                    <tr onClick={() => setSelectedDocument(document)}>
                      <td><div className="doc-cell"><span>{document.type}</span><div><strong>{document.number ?? "Sem número"}</strong><small>{document.accessKey ? maskKey(document.accessKey) : "Chave não informada"}</small></div></div></td>
                      <td>{formatDate(document.emissionDate)}</td>
                      <td><strong className="table-main-text">{document.carrierName ?? document.emitterName ?? "Não identificado"}</strong><small>{formatCnpj(document.emitterCnpj)}</small></td>
                      <td><div className="branch-cnpj-cell"><strong>{document.branchName ?? branchNameFromCnpj(carmakCnpj)}</strong><small>{formatCnpj(carmakCnpj)}</small></div></td>
                      <td>{formatCurrency(document.freightValue ?? document.grossValue ?? 0)}</td>
                      <td><div className="tax-cell"><strong>{formatCurrency(document.taxTotal ?? 0)}</strong><small>{formatCurrency(document.retainedTotal ?? 0)} retidos</small></div></td>
                      <td><StatusBadge status={document.fiscalStatus} /></td>
                      <td><StatusBadge status={document.reconciliationStatus} /></td>
                      <td><button className="icon-button" aria-label="Ver impostos e retenções" onClick={(event) => { event.stopPropagation(); setExpandedDocumentId((current) => current === document.id ? null : document.id); }}>{expandedDocumentId === document.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button></td>
                    </tr>
                    {expandedDocumentId === document.id && <tr className="tax-detail-row"><td colSpan={9}><TaxBreakdown document={document} /></td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!loading && !documents.length && <div className="table-empty"><FileText size={34} /><strong>Nenhum documento localizado</strong><span>Ajuste os filtros ou sincronize a competência selecionada.</span></div>}
          {loading && <div className="table-empty"><LoaderCircle className="spinning" size={30} /><strong>Buscando documentos</strong><span>A consulta traz somente 20 registros por página.</span></div>}
        </div>
        <footer className="table-footer"><span>Exibindo {documents.length} de {formatNumber(total)} documentos</span><div><button aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /></button><button className="current" disabled>{page} / {totalPages}</button><button aria-label="Próxima página" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight size={16} /></button></div></footer>
      </section>
      {selectedDocument && <DocumentDrawer document={selectedDocument} onClose={() => setSelectedDocument(null)} />}
    </>
  );
}

function TaxBreakdown({ document }: { document: FiscalDocument }) {
  const taxes = [
    ["ICMS", document.icmsValue],
    ["ICMS-ST", document.icmsStValue],
    ["IPI", document.ipiValue],
    ["PIS", document.pisValue],
    ["COFINS", document.cofinsValue],
    ["ISS", document.issValue],
  ] as const;
  const retained = [
    ["INSS/CP", document.inssRetainedValue],
    ["IRRF", document.irrfRetainedValue],
    ["CSLL", document.csllRetainedValue],
    ["PIS retido", document.pisRetainedValue],
    ["COFINS retido", document.cofinsRetainedValue],
    ["ISS retido", document.issRetainedValue],
  ] as const;
  return (
    <div className="tax-detail-panel">
      <div className="tax-detail-heading"><div><strong>Impostos e retenções do documento</strong><span>Valores identificados no conteúdo fiscal original recebido pela Qive.</span></div><div><span>Total de tributos</span><strong>{formatCurrency(document.taxTotal ?? 0)}</strong></div><div><span>Total retido</span><strong>{formatCurrency(document.retainedTotal ?? 0)}</strong></div></div>
      <div className="tax-detail-groups">
        <div><p>IMPOSTOS</p><div className="tax-breakdown">{taxes.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatCurrency(value ?? 0)}</strong></div>)}</div></div>
        <div><p>RETENÇÕES</p><div className="tax-breakdown">{retained.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatCurrency(value ?? 0)}</strong></div>)}</div></div>
      </div>
    </div>
  );
}

function DocumentDrawer({ document, onClose }: { document: FiscalDocument; onClose: () => void }) {
  const [tab, setTab] = useState("Resumo");
  const tabs = ["Resumo", "Participantes", "Itens/Serviços", "Tributos", "Retenções", "IBS/CBS", "Relacionados", "TOTVS", "Histórico", "XML/JSON"];
  const taxes = [
    ["ICMS", document.icmsValue], ["ICMS-ST", document.icmsStValue], ["IPI", document.ipiValue],
    ["PIS", document.pisValue], ["COFINS", document.cofinsValue], ["ISS", document.issValue],
  ] as const;
  const retentions = [
    ["IRRF", document.irrfRetainedValue], ["CSLL", document.csllRetainedValue], ["INSS/CP", document.inssRetainedValue],
    ["PIS retido", document.pisRetainedValue], ["COFINS retido", document.cofinsRetainedValue], ["ISS retido", document.issRetainedValue],
  ] as const;
  function content() {
    if (tab === "Resumo") return <div className="document-detail-grid"><Detail label="Documento" value={`${document.type} ${document.number ?? "Sem número"}`} /><Detail label="Série" value={document.series ?? "Não informada"} /><Detail label="Emissão" value={formatDate(document.emissionDate)} /><Detail label="Filial Carmak" value={document.branchName ?? branchNameFromCnpj(carmakCnpjForDocument(document))} /><Detail label="Valor bruto" value={formatCurrency(document.grossValue ?? document.freightValue ?? 0)} /><Detail label="Tributos / retenções" value={`${formatCurrency(document.taxTotal ?? 0)} / ${formatCurrency(document.retainedTotal ?? 0)}`} /><Detail label="Situação fiscal" value={document.fiscalStatus} /><Detail label="Conciliação" value={document.reconciliationStatus} /></div>;
    if (tab === "Participantes") return <div className="document-detail-grid"><Detail label="Emitente / Prestador" value={document.emitterName ?? "Não identificado"} helper={formatCnpj(document.emitterCnpj)} /><Detail label="Destinatário / Tomador" value={document.receiverName ?? "Carmak"} helper={formatCnpj(document.receiverCnpj)} /><Detail label="Transportadora" value={document.carrierName ?? "Não informada"} /><Detail label="CNPJ Carmak relacionado" value={formatCnpj(carmakCnpjForDocument(document))} /></div>;
    if (tab === "Tributos") return <div className="drawer-tax-grid">{taxes.map(([label, value]) => <Detail key={label} label={label} value={formatCurrency(value ?? 0)} />)}</div>;
    if (tab === "Retenções") return <><div className="drawer-tax-grid">{retentions.map(([label, value]) => <Detail key={label} label={label} value={formatCurrency(value ?? 0)} />)}</div><div className="drawer-total"><span>Total retido preservado do documento</span><strong>{formatCurrency(document.retainedTotal ?? 0)}</strong></div></>;
    if (tab === "IBS/CBS") return <div className="detail-note"><CircleDollarSign size={28} /><div><strong>Estrutura de transição preparada</strong><span>IBS, CBS, IS, CST e cClassTrib serão exibidos quando estiverem presentes no documento. Os tributos atuais permanecem preservados.</span></div></div>;
    if (tab === "TOTVS") return <div className="document-detail-grid"><Detail label="Situação TOTVS" value={document.totvsStatus} /><Detail label="Resultado da conciliação" value={document.reconciliationStatus} /><Detail label="Critério prioritário" value={document.accessKey ? "Chave de acesso" : "CNPJ + documento + série"} /><Detail label="Revisão humana" value={document.reconciliationStatus === "PROBABLE" ? "Obrigatória" : "Conforme status"} /></div>;
    if (tab === "XML/JSON") return <div className="detail-note"><ShieldCheck size={28} /><div><strong>Documento original protegido</strong><span>O XML/JSON bruto permanece imutável no backend. A visualização pública não expõe credenciais, tokens ou o conteúdo integral por padrão.</span></div></div>;
    return <div className="drawer-empty"><FileText size={31} /><strong>{tab}</strong><span>Nenhuma informação estruturada disponível neste documento.</span></div>;
  }
  return <><button className="drawer-overlay visible" onClick={onClose} aria-label="Fechar detalhamento" /><aside className="document-drawer" aria-label="Detalhamento do documento"><header><div><p className="eyebrow">DETALHAMENTO FISCAL</p><h2>{document.type} {document.number ?? "Sem número"}</h2><span>{document.accessKey ? maskKey(document.accessKey) : "Chave não informada"}</span></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header><nav>{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav><div className="document-drawer-content">{content()}</div><footer><button className="button secondary" onClick={onClose}>Fechar</button><button className="button primary"><Sparkles size={16} />Analisar com IA</button></footer></aside></>;
}

function Detail({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className="document-detail"><span>{label}</span><strong>{value}</strong>{helper && <small>{helper}</small>}</div>;
}

function RetentionsView({ month, syncing, onMonthChange, onRefresh }: {
  month: string;
  syncing: boolean;
  onMonthChange: (month: string) => void;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<RetentionState>(emptyRetentions);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/retentions?limit=50&month=${month}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(readJson)
        .then((result) => setData({
          metrics: result.metrics ?? emptyRetentions.metrics,
          documents: result.documents ?? [],
        }))
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) setData(emptyRetentions);
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [month, syncing]);
  const { metrics, documents } = data;
  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">FISCAL</p><h1>Retenções e impostos</h1><span>IRRF, CSLL, INSS/CP, PIS, COFINS e ISS retidos conforme o documento fiscal.</span></div>
        <div className="heading-actions"><button className="button secondary" onClick={onRefresh} disabled={syncing}><RefreshCw size={16} className={syncing ? "spinning" : ""} />{syncing ? "Sincronizando" : "Sincronizar mês"}</button><button className="button primary"><FileSpreadsheet size={16} />Exportar</button></div>
      </section>
      <section className="document-summary-row retention-summary-row">
        <div><span>Documentos com retenção</span><strong>{formatNumber(metrics.documentCount)}</strong></div>
        <div><span>Total retido</span><strong>{formatCurrency(metrics.retainedTotal)}</strong></div>
        <div><span>IRRF + CSLL</span><strong>{formatCurrency(metrics.irrf + metrics.csll)}</strong></div>
        <div><span>INSS/CP</span><strong>{formatCurrency(metrics.inss)}</strong></div>
      </section>
      <section className="table-panel retention-table">
        <div className="table-toolbar">
          <div className="table-search"><Search size={17} /><input placeholder="Buscar documento ou prestador" /></div>
          <div className="month-toolbar"><CalendarDays size={15} /><select aria-label="Competência das retenções" value={month} onChange={(event) => onMonthChange(event.target.value)}>{monthOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <span className="table-auto-status"><i className={syncing ? "spinning-dot" : ""} />{syncing ? "Atualizando" : "Valores do documento fiscal"}</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Documento</th><th>Emissão</th><th>Prestador / Emitente</th><th>IRRF</th><th>CSLL</th><th>INSS/CP</th><th>PIS / COFINS</th><th>ISS</th><th>Total retido</th></tr></thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td><div className="doc-cell"><span>{document.type}</span><div><strong>{document.number ?? "Sem número"}</strong><small>{document.accessKey ? maskKey(document.accessKey) : "Chave não informada"}</small></div></div></td>
                  <td>{formatDate(document.emissionDate)}</td>
                  <td><strong className="table-main-text">{document.emitterName ?? document.carrierName ?? "Não identificado"}</strong><small>{formatCnpj(document.emitterCnpj)}</small></td>
                  <td>{formatCurrency(document.irrfRetainedValue ?? 0)}</td>
                  <td>{formatCurrency(document.csllRetainedValue ?? 0)}</td>
                  <td>{formatCurrency(document.inssRetainedValue ?? 0)}</td>
                  <td>{formatCurrency((document.pisRetainedValue ?? 0) + (document.cofinsRetainedValue ?? 0))}</td>
                  <td>{formatCurrency(document.issRetainedValue ?? 0)}</td>
                  <td><strong className="retention-positive">{formatCurrency(document.retainedTotal ?? 0)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !documents.length && <div className="table-empty"><WalletCards size={34} /><strong>Nenhuma retenção identificada</strong><span>Sincronize a competência para capturar os valores informados nas notas fiscais.</span></div>}
          {loading && <div className="table-empty"><LoaderCircle className="spinning" size={30} /><strong>Carregando retenções</strong></div>}
        </div>
        <footer className="table-footer"><span>{formatNumber(metrics.documentCount)} documentos com retenção em {formatMonthShort(month)}</span><span>PIS/COFINS: {formatCurrency(metrics.pis + metrics.cofins)} · ISS: {formatCurrency(metrics.iss)}</span></footer>
      </section>
    </>
  );
}

function TotvsView({ imports, onImported, onToast }: { imports: ImportRecord[]; onImported: () => void; onToast: (value: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<{ id: number; totalRows: number; acceptedRows: number; rejectedRows: number; mapping: Record<string, string> } | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const data = await fetch("/api/totvs/import", { method: "POST", body }).then(readJson);
      setLastResult(data.import);
      onToast("Relatório TOTVS importado e armazenado com rastreabilidade.");
      onImported();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Falha ao importar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function reconcile() {
    setReconciling(true);
    try {
      const data = await fetch("/api/reconciliation", { method: "POST" }).then(readJson);
      onToast(data.message ?? "Confronto concluído.");
      onImported();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Falha ao executar o confronto.");
    } finally {
      setReconciling(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">CONCILIAÇÃO</p><h1>Confronto TOTVS</h1><span>Importe o relatório do Protheus e compare com os documentos fiscais.</span></div>
        <div className="heading-actions"><button className="button secondary"><History size={16} />Histórico</button><button className="button primary" onClick={reconcile} disabled={reconciling || !imports.length}>{reconciling ? <LoaderCircle size={16} className="spinning" /> : <FileCheck2 size={16} />}Executar confronto</button></div>
      </section>
      <section className="process-steps">
        <div className="active"><span>1</span><div><strong>Carregar arquivo</strong><small>XLSX, XLS ou CSV</small></div></div><ArrowRight size={18} />
        <div className={lastResult ? "active" : ""}><span>2</span><div><strong>Mapear colunas</strong><small>Correspondência automática</small></div></div><ArrowRight size={18} />
        <div><span>3</span><div><strong>Conferir</strong><small>Validar antes do vínculo</small></div></div><ArrowRight size={18} />
        <div><span>4</span><div><strong>Conciliar</strong><small>Resultado auditável</small></div></div>
      </section>
      <div className="totvs-layout">
        <section className="upload-card">
          <header><div className="section-icon"><UploadCloud size={21} /></div><div><strong>Importar relatório TOTVS</strong><span>O arquivo original será preservado para auditoria.</span></div></header>
          <button className={`drop-zone ${file ? "has-file" : ""}`} onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} hidden />
            {file ? <><FileSpreadsheet size={38} /><strong>{file.name}</strong><span>{formatFileSize(file.size)} · pronto para validar</span><small>Escolher outro arquivo</small></> : <><UploadCloud size={40} /><strong>Selecione ou arraste o relatório</strong><span>XLSX, XLS ou CSV · máximo de 20 MB</span><small>Escolher arquivo</small></>}
          </button>
          <div className="upload-rules"><div><CheckCircle2 size={16} /><span>Detecção automática de cabeçalhos</span></div><div><CheckCircle2 size={16} /><span>Proteção contra arquivo duplicado</span></div><div><CheckCircle2 size={16} /><span>Até 25.000 linhas por importação</span></div></div>
          <button className="button primary full" disabled={!file || uploading} onClick={upload}>{uploading ? <LoaderCircle size={17} className="spinning" /> : <ArrowRight size={17} />}Validar e continuar</button>
        </section>
        <section className="mapping-card">
          <header><div><p className="eyebrow">MAPEAMENTO</p><strong>Colunas identificadas</strong></div>{lastResult && <StatusBadge status="VALIDATED" />}</header>
          {lastResult ? <div className="mapping-list">{Object.entries(lastResult.mapping).filter(([, column]) => column).map(([field, column]) => <div key={field}><span>{column}</span><ArrowRight size={15} /><strong>{fieldLabels[field] ?? field}</strong></div>)}</div> : <div className="mapping-empty"><Boxes size={34} /><strong>Aguardando arquivo</strong><span>As colunas do relatório serão relacionadas aos campos Carmak antes da importação.</span></div>}
          {lastResult && <footer><div><span>Linhas</span><strong>{lastResult.totalRows}</strong></div><div><span>Aceitas</span><strong>{lastResult.acceptedRows}</strong></div><div><span>Rejeitadas</span><strong>{lastResult.rejectedRows}</strong></div></footer>}
        </section>
      </div>
      <section className="history-panel">
        <header><div><strong>Importações recentes</strong><span>Arquivos preservados com usuário, data e resultado.</span></div><button>Ver histórico completo <ArrowRight size={15} /></button></header>
        {imports.length ? <div className="import-list">{imports.map((item) => <div key={item.id}><div className="file-icon"><FileSpreadsheet size={20} /></div><div className="import-name"><strong>{item.fileName}</strong><span>{formatDateTime(item.importedAt)} · {item.importedBy}</span></div><div><span>Linhas</span><strong>{item.totalRows}</strong></div><StatusBadge status={item.status} /><button className="icon-button"><ChevronRight size={18} /></button></div>)}</div> : <div className="history-empty"><FileClock size={28} /><span>Nenhum relatório TOTVS importado.</span></div>}
      </section>
    </>
  );
}

const fieldLabels: Record<string, string> = { accessKey: "Chave de acesso", documentNumber: "Número do documento", series: "Série", cnpj: "CNPJ", supplierName: "Fornecedor / Transportadora", grossValue: "Valor bruto", netValue: "Valor líquido", emissionDate: "Data de emissão", dueDate: "Vencimento", invoiceNumber: "Fatura", titleNumber: "Título TOTVS", costCenter: "Centro de custo", branchCode: "Filial" };

function IntegrationsView({ integrations, month, onMonthChange, syncing, nextSyncAt, onRefresh, onSync, onToast }: {
  integrations: Integration[];
  month: string;
  onMonthChange: (month: string) => void;
  syncing: boolean;
  nextSyncAt: string | null;
  onRefresh: () => void;
  onSync: () => void;
  onToast: (value: string) => void;
}) {
  const [testing, setTesting] = useState(false);
  async function testQive() {
    setTesting(true);
    try {
      const data = await fetch("/api/integrations/qive/test", { method: "POST" }).then(readJson);
      onToast(data.message);
      onRefresh();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Não foi possível testar a conexão.");
    } finally {
      setTesting(false);
    }
  }
  return (
    <>
      <section className="page-heading"><div><p className="eyebrow">GESTÃO</p><h1>Integrações</h1><span>Saúde, sincronização e rastreabilidade dos serviços do portal.</span></div><div className="heading-actions"><button className="button secondary" onClick={onRefresh}><RefreshCw size={16} />Atualizar status</button><button className="button primary" onClick={testQive} disabled={testing}>{testing ? <LoaderCircle className="spinning" size={16} /> : <CloudCog size={16} />}Testar Qive</button></div></section>
      <section className="automation-panel">
        <div className="automation-icon"><RefreshCw size={21} className={syncing ? "spinning" : ""} /></div>
        <div className="automation-copy"><strong>Atualização mensal automática</strong><span>A competência selecionada é buscada ao abrir o portal e novamente a cada 15 minutos enquanto ele estiver aberto.</span></div>
        <MonthField month={month} onChange={onMonthChange} />
        <div className="automation-next"><span>Próxima atualização</span><strong>{syncing ? "Em andamento" : nextSyncAt ? formatDateTime(nextSyncAt) : "Após validar a Qive"}</strong></div>
        <button className="button primary" onClick={onSync} disabled={syncing}>{syncing ? <LoaderCircle className="spinning" size={16} /> : <RefreshCw size={16} />}{syncing ? "Sincronizando" : "Sincronizar agora"}</button>
      </section>
      <section className="integration-overview"><div><Database size={22} /><div><span>Base Carmak</span><strong>Operacional</strong></div></div><div><FileText size={22} /><div><span>Documentos processados</span><strong>{formatNumber(integrations.reduce((sum, item) => sum + item.receivedCount, 0))}</strong></div></div><div><AlertTriangle size={22} /><div><span>Erros registrados</span><strong>{formatNumber(integrations.reduce((sum, item) => sum + item.errorCount, 0))}</strong></div></div></section>
      <section className="integration-grid">{integrations.map((item) => <article key={item.key}><header><div className="integration-logo">{integrationIcon(item.key)}</div><StatusBadge status={item.status} /></header><h2>{item.name}</h2><p>{item.description}</p><div className="integration-meta"><div><span>Última atividade</span><strong>{item.lastSyncAt ? formatDateTime(item.lastSyncAt) : "Ainda não executada"}</strong></div><div><span>Registros</span><strong>{formatNumber(item.receivedCount)}</strong></div></div><footer><button onClick={item.key === "qive" ? onSync : undefined} disabled={item.key === "qive" && syncing}>{item.key === "qive" && syncing ? <LoaderCircle className="spinning" size={15} /> : null}{item.key === "qive" ? (item.status === "NOT_CONFIGURED" ? "Validar configuração" : `Sincronizar ${formatMonthShort(month)}`) : "Ver detalhes"}<ArrowRight size={15} /></button></footer></article>)}</section>
      <section className="security-note"><ShieldCheck size={22} /><div><strong>Credenciais protegidas</strong><span>Chaves e tokens permanecem no backend e nunca são enviados ao navegador ou apresentados nesta tela.</span></div></section>
    </>
  );
}

function ReportsView({ hasData, month }: { hasData: boolean; month: string }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const reports = [
    { id: "fiscal", title: "Documentos fiscais", text: "NF-e, CT-e e NFS-e por período, filial e CNPJ.", icon: FileText },
    { id: "branches", title: "Tributos por filial", text: "ICMS, ISS, IPI, PIS e COFINS consolidados por unidade Carmak.", icon: Building2 },
    { id: "financial", title: "Conciliação financeira", text: "Faturas, títulos, pagamentos e documentos sem lançamento.", icon: WalletCards },
    { id: "audit", title: "Auditoria", text: "Divergências, duplicidades e falhas de integração.", icon: ShieldCheck },
    { id: "tax", title: "Retenções e tributos", text: "IRRF, CSLL, INSS, ISS, IBS, CBS e IS.", icon: CircleDollarSign },
    { id: "custom", title: "Relatório customizado", text: "Escolha métricas, dimensões, filtros e ordenação.", icon: Settings2 },
  ];
  async function exportReport(reportId: string, format: "xlsx" | "csv" | "pdf") {
    setExporting(`${reportId}-${format}`);
    try {
      if (format === "pdf") {
        window.print();
        return;
      }
      const query = new URLSearchParams({ month, type: "ALL", status: reportId === "audit" ? "DIVERGENT" : "ALL", page: "1", limit: "100" });
      const data = await fetch(`/api/documents?${query}`, { cache: "no-store" }).then(readJson);
      const rows = (data.documents ?? []).map((document: FiscalDocument) => ({
        Tipo: document.type,
        Documento: document.number ?? "",
        Serie: document.series ?? "",
        Emissao: document.emissionDate ?? "",
        Participante: document.carrierName ?? document.emitterName ?? "",
        CNPJ: document.emitterCnpj ?? "",
        Filial: document.branchName ?? branchNameFromCnpj(carmakCnpjForDocument(document)),
        Valor_bruto: document.grossValue ?? 0,
        ICMS: document.icmsValue ?? 0,
        ISS: document.issValue ?? 0,
        IPI: document.ipiValue ?? 0,
        PIS: document.pisValue ?? 0,
        COFINS: document.cofinsValue ?? 0,
        Tributos: document.taxTotal ?? 0,
        Retencoes: document.retainedTotal ?? 0,
        TOTVS: document.totvsStatus,
        Conciliacao: document.reconciliationStatus,
      }));
      if (format === "csv") {
        const columns = Object.keys(rows[0] ?? { Documento: "" });
        const csv = "\ufeff" + [columns, ...rows.map((row: Record<string, unknown>) => columns.map((column) => row[column]))]
          .map((line) => line.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";"))
          .join("\n");
        downloadBlob(csv, `relatorio_carmak_${reportId}_${month}.csv`, "text/csv;charset=utf-8");
      } else {
        const XLSX = await import("xlsx");
        const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Informacao: "Nenhum registro localizado" }]);
        sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1:A1" };
        sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "Relatório Carmak");
        XLSX.writeFile(workbook, `relatorio_carmak_${reportId}_${month}.xlsx`);
      }
    } finally {
      setExporting(null);
    }
  }
  return (
    <><section className="page-heading"><div><p className="eyebrow">ANÁLISES</p><h1>Central de relatórios</h1><span>Consultas auditáveis com exportação real conforme a competência selecionada.</span></div><div className="heading-actions"><button className="button primary"><Plus size={16} />Novo relatório</button></div></section><section className="report-grid">{reports.map((report) => { const Icon = report.icon; return <article key={report.title}><div className="report-icon"><Icon size={22} /></div><h2>{report.title}</h2><p>{report.text}</p><div className="report-export-actions"><button disabled={!hasData || Boolean(exporting)} onClick={() => void exportReport(report.id, "xlsx")}>XLSX</button><button disabled={!hasData || Boolean(exporting)} onClick={() => void exportReport(report.id, "csv")}>CSV</button><button disabled={!hasData || Boolean(exporting)} onClick={() => void exportReport(report.id, "pdf")}>PDF</button></div><button disabled={!hasData} onClick={() => void exportReport(report.id, "xlsx")}>{exporting?.startsWith(report.id) ? <LoaderCircle size={15} className="spinning" /> : null}Gerar relatório <ArrowRight size={15} /></button></article>; })}</section>{!hasData && <section className="data-notice"><Database size={20} /><span>Os relatórios serão habilitados quando houver documentos sincronizados ou dados importados.</span></section>}</>
  );
}

function ReformView({ month, onMonthChange }: { month: string; onMonthChange: (value: string) => void }) {
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/documents?month=${month}&type=ALL&status=ALL&page=1&limit=100`, { cache: "no-store", signal: controller.signal })
      .then(readJson).then((data) => setDocuments(data.documents ?? [])).catch(() => setDocuments([])).finally(() => setLoading(false));
    return () => controller.abort();
  }, [month]);
  const currentTax = documents.reduce((sum, item) => sum + (item.icmsValue ?? 0) + (item.issValue ?? 0) + (item.ipiValue ?? 0) + (item.pisValue ?? 0) + (item.cofinsValue ?? 0), 0);
  return <><section className="page-heading"><div><p className="eyebrow">REFORMA TRIBUTÁRIA</p><h1>IBS, CBS e Imposto Seletivo</h1><span>Coexistência dos tributos atuais e do novo modelo conforme os documentos recebidos.</span></div><div className="heading-actions"><MonthField month={month} onChange={onMonthChange} /><button className="button primary"><FileSpreadsheet size={16} />Exportar</button></div></section><section className="document-summary-row"><div><span>Documentos analisados</span><strong>{loading ? "—" : formatNumber(documents.length)}</strong></div><div><span>Tributos atuais informados</span><strong>{formatCurrency(currentTax)}</strong></div><div><span>Com IBS/CBS estruturado</span><strong>0</strong></div><div><span>Inconsistências</span><strong>0</strong></div></section><section className="reform-grid"><article><h2>Tributos atuais</h2><p>ICMS, ISS, IPI, PIS e COFINS continuam sendo apresentados com os valores originais.</p><StatusBadge status={documents.length ? "AVAILABLE" : "NOT_PROCESSED"} /></article><article><h2>Novo modelo</h2><p>Campos para IBS, CBS, IS, CST e cClassTrib estão preparados para preenchimento quando disponíveis.</p><StatusBadge status="NOT_PROCESSED" /></article><article><h2>Regra de coexistência</h2><p>O portal não substitui nem recalcula automaticamente tributos originais durante a transição.</p><StatusBadge status="VALIDATED" /></article></section><section className="table-panel reform-table"><div className="table-toolbar"><span className="table-auto-status"><i />Valores do documento fiscal original</span></div><div className="table-scroll"><table><thead><tr><th>Documento</th><th>Emissão</th><th>Filial</th><th>ICMS</th><th>ISS</th><th>PIS</th><th>COFINS</th><th>IBS</th><th>CBS</th></tr></thead><tbody>{documents.slice(0, 25).map((document) => <tr key={document.id}><td><div className="doc-cell"><span>{document.type}</span><div><strong>{document.number ?? "Sem número"}</strong><small>{document.series ?? "Sem série"}</small></div></div></td><td>{formatDate(document.emissionDate)}</td><td>{document.branchName ?? branchNameFromCnpj(carmakCnpjForDocument(document))}</td><td>{formatCurrency(document.icmsValue ?? 0)}</td><td>{formatCurrency(document.issValue ?? 0)}</td><td>{formatCurrency(document.pisValue ?? 0)}</td><td>{formatCurrency(document.cofinsValue ?? 0)}</td><td><StatusBadge status="NOT_PROCESSED" /></td><td><StatusBadge status="NOT_PROCESSED" /></td></tr>)}</tbody></table>{!loading && !documents.length && <div className="table-empty"><CircleDollarSign size={34} /><strong>Nenhum documento na competência</strong><span>Sincronize a Qive para analisar a transição tributária.</span></div>}</div></section></>;
}

function ReconciliationQueueView({ mode, month, onMonthChange }: { mode: "DIVERGENT" | "NOT_PROCESSED"; month: string; onMonthChange: (value: string) => void }) {
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FiscalDocument | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/documents?month=${month}&type=ALL&status=${mode}&page=1&limit=100`, { cache: "no-store", signal: controller.signal })
        .then(readJson).then((data) => { setDocuments(data.documents ?? []); setTotal(Number(data.total ?? 0)); }).catch(() => { setDocuments([]); setTotal(0); }).finally(() => setLoading(false));
    }, 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [mode, month]);
  const divergent = mode === "DIVERGENT";
  const totalValue = documents.reduce((sum, document) => sum + (document.grossValue ?? document.freightValue ?? 0), 0);
  return <><section className="page-heading"><div><p className="eyebrow">CONCILIAÇÃO</p><h1>{divergent ? "Central de divergências" : "Pendências de conciliação"}</h1><span>{divergent ? "Diferenças entre os documentos fiscais e os lançamentos TOTVS." : "Documentos aguardando vínculo, importação ou processamento no TOTVS."}</span></div><div className="heading-actions"><MonthField month={month} onChange={onMonthChange} /><button className="button primary"><FileSpreadsheet size={16} />Exportar</button></div></section><section className="document-summary-row"><div><span>{divergent ? "Divergências" : "Pendências"}</span><strong>{formatNumber(total)}</strong></div><div><span>Valor em análise</span><strong>{formatCurrency(totalValue)}</strong></div><div><span>Documentos exibidos</span><strong>{formatNumber(documents.length)}</strong></div><div><span>Revisão humana</span><strong>{total ? "Necessária" : "Em dia"}</strong></div></section><section className="table-panel"><div className="table-scroll"><table><thead><tr><th>Documento</th><th>Emissão</th><th>Participante</th><th>Filial</th><th>Valor fiscal</th><th>Retenções</th><th>Situação TOTVS</th><th>Status</th><th /></tr></thead><tbody>{documents.map((document) => <tr key={document.id} onClick={() => setSelected(document)}><td><div className="doc-cell"><span>{document.type}</span><div><strong>{document.number ?? "Sem número"}</strong><small>{document.accessKey ? maskKey(document.accessKey) : "Chave não informada"}</small></div></div></td><td>{formatDate(document.emissionDate)}</td><td><strong className="table-main-text">{document.carrierName ?? document.emitterName ?? "Não identificado"}</strong><small>{formatCnpj(document.emitterCnpj)}</small></td><td>{document.branchName ?? branchNameFromCnpj(carmakCnpjForDocument(document))}</td><td>{formatCurrency(document.grossValue ?? document.freightValue ?? 0)}</td><td>{formatCurrency(document.retainedTotal ?? 0)}</td><td><StatusBadge status={document.totvsStatus} /></td><td><StatusBadge status={document.reconciliationStatus} /></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table>{!loading && !documents.length && <div className="table-empty"><CheckCircle2 size={34} /><strong>Nenhum registro localizado</strong><span>Não há {divergent ? "divergências" : "pendências"} nesta competência.</span></div>}{loading && <div className="table-empty"><LoaderCircle className="spinning" size={30} /><strong>Carregando conciliação</strong></div>}</div></section>{selected && <DocumentDrawer document={selected} onClose={() => setSelected(null)} />}</>;
}

function AiWorkspaceView() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string; detail?: string; sources?: string[] }>>([{ role: "assistant", text: "Posso analisar documentos fiscais, tributos, retenções, pendências e divergências com base nos dados reais permitidos para o seu usuário." }]);
  const prompts = ["Quais CT-es ainda não foram encontrados no TOTVS?", "Quais NFS-e possuem retenções?", "Quais documentos apresentam divergência?", "Qual é o valor financeiro das pendências?", "Quais documentos possuem IBS ou CBS?", "Resuma as divergências do período."];
  async function ask(value?: string) {
    const text = (value ?? question).trim();
    if (!text || loading) return;
    setMessages((current) => [...current, { role: "user", text }]); setQuestion(""); setLoading(true);
    try { const data = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) }).then(readJson); setMessages((current) => [...current, { role: "assistant", text: data.answer, detail: data.detail, sources: data.sources }]); }
    catch (error) { setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "Não foi possível concluir a análise." }]); }
    finally { setLoading(false); }
  }
  return <><section className="page-heading"><div><p className="eyebrow">INTELIGÊNCIA ASSISTIDA</p><h1>IA Carmak</h1><span>Copiloto fiscal e financeiro com respostas baseadas nos documentos e na conciliação.</span></div></section><section className="ai-workspace"><aside><h2>Perguntas sugeridas</h2><p>A IA não inventa dados nem altera documentos.</p>{prompts.map((prompt) => <button key={prompt} onClick={() => void ask(prompt)}>{prompt}<ArrowRight size={15} /></button>)}</aside><div className="ai-workspace-chat"><div className="ai-workspace-messages">{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><div>{message.role === "assistant" && <Bot size={17} />}<p>{message.text}</p></div>{message.detail && <span>{message.detail}</span>}{message.sources?.length ? <small>Fontes: {message.sources.join(" · ")}</small> : null}</div>)}{loading && <div className="chat-message assistant"><div><LoaderCircle className="spinning" size={17} /><p>Analisando evidências...</p></div></div>}</div><footer><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Pergunte sobre documentos, tributos, retenções ou divergências..." onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} /><button onClick={() => void ask()} disabled={!question.trim() || loading}><ArrowDownRight size={19} /></button></footer></div></section></>;
}

function UsersView({ currentEmail, onToast }: { currentEmail: string; onToast: (message: string) => void }) {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PortalUser | null>(null);
  const normalizedCurrentEmail = currentEmail.toLowerCase();

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetch("/api/users", { cache: "no-store" }).then(readJson);
      setUsers(data.users ?? []);
      setCanManage(Boolean(data.canManage));
    } catch (error) {
      setUsers([]);
      onToast(error instanceof Error ? error.message : "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadUsers]);

  const filtered = users.filter((user) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term);
    return matchesSearch && (roleFilter === "ALL" || user.role === roleFilter) && (statusFilter === "ALL" || user.status === statusFilter);
  });
  const activeCount = users.filter((user) => user.status === "ACTIVE").length;
  const adminCount = users.filter((user) => user.role === "ADMINISTRATOR" && user.status === "ACTIVE").length;
  const branchCoverage = new Set(users.flatMap((user) => user.branches.includes("ALL") ? knownCarmakBranches.map((branch) => branch.name) : user.branches)).size;

  async function saveUser(payload: { id?: number; name: string; email: string; role: PortalUser["role"]; status: PortalUser["status"]; branches: string[] }) {
    const response = await fetch("/api/users", {
      method: payload.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await readJson(response);
    await loadUsers();
    setModalOpen(false);
    setEditing(null);
    onToast(payload.id ? "Usuário atualizado com sucesso." : "Usuário cadastrado com sucesso.");
  }

  async function toggleStatus(user: PortalUser) {
    try {
      await saveUser({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        branches: user.branches,
      });
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Não foi possível alterar o status.");
    }
  }

  return <>
    <section className="page-heading">
      <div><p className="eyebrow">GOVERNANÇA</p><h1>Gestão de usuários</h1><span>Perfis, filiais permitidas e situação de acesso ao ambiente fiscal.</span></div>
      <div className="heading-actions"><button className="button primary" disabled={!canManage} onClick={() => { setEditing(null); setModalOpen(true); }}><UserPlus size={16} />Novo usuário</button></div>
    </section>
    <section className="document-summary-row">
      <div><span>Usuários cadastrados</span><strong>{formatNumber(users.length)}</strong></div>
      <div><span>Usuários ativos</span><strong>{formatNumber(activeCount)}</strong></div>
      <div><span>Administradores</span><strong>{formatNumber(adminCount)}</strong></div>
      <div><span>Filiais cobertas</span><strong>{formatNumber(branchCoverage)}</strong></div>
    </section>
    <section className="user-access-note"><ShieldCheck size={20} /><div><strong>Controle em duas camadas</strong><span>O perfil abaixo define o escopo fiscal dentro do portal. A entrada no endereço corporativo permanece protegida pelo compartilhamento seguro do site.</span></div></section>
    <section className="table-panel users-panel">
      <div className="table-toolbar">
        <div className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" /></div>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrar por perfil"><option value="ALL">Todos os perfis</option>{Object.entries(userRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status"><option value="ALL">Todos os status</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select>
        <span className="table-auto-status"><i />{formatNumber(filtered.length)} exibidos</span>
      </div>
      <div className="table-scroll"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Escopo de filiais</th><th>Status</th><th>Último acesso</th><th /></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><div className="user-cell"><span>{initialsFromName(user.name)}</span><div><strong>{user.name}{user.email === normalizedCurrentEmail ? " (você)" : ""}</strong><small>{user.email}</small></div></div></td><td><span className={`role-pill role-${user.role.toLowerCase()}`}>{userRoleLabels[user.role]}</span></td><td><strong className="table-main-text">{formatBranchScope(user.branches)}</strong><small>{user.branches.includes("ALL") ? "Acesso corporativo" : `${user.branches.length} ${user.branches.length === 1 ? "filial" : "filiais"}`}</small></td><td><StatusBadge status={user.status} /></td><td>{user.lastAccessAt ? formatDateTime(user.lastAccessAt) : "Ainda não acessou"}</td><td><div className="user-row-actions"><button disabled={!canManage} onClick={() => { setEditing(user); setModalOpen(true); }} aria-label={`Editar ${user.name}`}><Pencil size={15} /></button><button disabled={!canManage || user.email === normalizedCurrentEmail} onClick={() => void toggleStatus(user)}>{user.status === "ACTIVE" ? "Desativar" : "Reativar"}</button></div></td></tr>)}</tbody></table>{loading && <div className="table-empty"><LoaderCircle className="spinning" size={30} /><strong>Carregando usuários</strong></div>}{!loading && !filtered.length && <div className="table-empty"><Users size={34} /><strong>Nenhum usuário localizado</strong><span>Ajuste os filtros ou cadastre um novo usuário.</span></div>}</div>
    </section>
    {modalOpen && <UserModal user={editing} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={saveUser} />}
  </>;
}

function UserModal({ user, onClose, onSave }: { user: PortalUser | null; onClose: () => void; onSave: (payload: { id?: number; name: string; email: string; role: PortalUser["role"]; status: PortalUser["status"]; branches: string[] }) => Promise<void> }) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<PortalUser["role"]>(user?.role ?? "READER");
  const [status, setStatus] = useState<PortalUser["status"]>(user?.status ?? "ACTIVE");
  const [branches, setBranches] = useState<string[]>(user?.branches?.length ? user.branches : ["ALL"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleBranch(branch: string) {
    setBranches((current) => {
      if (branch === "ALL") return ["ALL"];
      const withoutAll = current.filter((item) => item !== "ALL");
      if (withoutAll.includes(branch)) {
        const next = withoutAll.filter((item) => item !== branch);
        return next.length ? next : ["ALL"];
      }
      return [...withoutAll, branch];
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ id: user?.id, name, email, role, status, branches });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-overlay"><form className="user-modal" onSubmit={(event) => void submit(event)}><header><div><p className="eyebrow">GESTÃO DE ACESSO</p><h2>{user ? "Editar usuário" : "Cadastrar usuário"}</h2><span>Defina o perfil funcional e as filiais que poderão ser consultadas.</span></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header><div className="user-form-grid"><label><span>Nome completo</span><input value={name} onChange={(event) => setName(event.target.value)} required minLength={3} placeholder="Nome do colaborador" /></label><label><span>E-mail corporativo</span><input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" placeholder="nome@carmak.com.br" /></label><label><span>Perfil de acesso</span><select value={role} onChange={(event) => setRole(event.target.value as PortalUser["role"])}>{Object.entries(userRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>{roleDescription(role)}</small></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as PortalUser["status"])}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select><small>Usuários inativos permanecem no histórico de auditoria.</small></label></div><fieldset className="branch-selector"><legend>Filiais permitidas</legend><label className={branches.includes("ALL") ? "selected" : ""}><input type="checkbox" checked={branches.includes("ALL")} onChange={() => toggleBranch("ALL")} /><span><strong>Todas as filiais</strong><small>Visão corporativa completa</small></span></label>{knownCarmakBranches.map((branch) => <label key={branch.cnpj} className={branches.includes(branch.name) ? "selected" : ""}><input type="checkbox" checked={branches.includes(branch.name)} onChange={() => toggleBranch(branch.name)} /><span><strong>{branch.name}</strong><small>{formatCnpj(branch.cnpj)}</small></span></label>)}</fieldset>{error && <div className="form-error"><AlertTriangle size={15} />{error}</div>}<footer><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="spinning" /> : <Check size={16} />}{saving ? "Salvando" : "Salvar usuário"}</button></footer></form></div>;
}

function AuditView() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); void fetch("/api/audit?limit=100", { cache: "no-store", signal: controller.signal }).then(readJson).then((data) => setEvents(data.events ?? [])).catch(() => setEvents([])).finally(() => setLoading(false)); return () => controller.abort(); }, []);
  return <><section className="page-heading"><div><p className="eyebrow">GOVERNANÇA</p><h1>Auditoria e rastreabilidade</h1><span>Alterações, importações, sincronizações e testes registrados por usuário e data/hora.</span></div><div className="heading-actions"><button className="button primary" onClick={() => window.print()}><FileSpreadsheet size={16} />Imprimir auditoria</button></div></section><section className="document-summary-row"><div><span>Eventos carregados</span><strong>{formatNumber(events.length)}</strong></div><div><span>Usuários identificados</span><strong>{formatNumber(new Set(events.map((event) => event.userEmail)).size)}</strong></div><div><span>Fontes</span><strong>{formatNumber(new Set(events.map((event) => event.source)).size)}</strong></div><div><span>Documento original</span><strong>Imutável</strong></div></section><section className="audit-layout"><div className="audit-timeline">{events.map((event) => <article key={event.id}><i /><div><header><strong>{event.action.replaceAll("_", " ")}</strong><StatusBadge status="VALIDATED" /></header><p>{event.entityType}{event.entityId ? ` · ${event.entityId}` : ""}</p><span>{formatDateTime(event.createdAt)} · {event.userEmail} · {event.source}</span>{event.reason && <small>Motivo: {event.reason}</small>}</div></article>)}{!loading && !events.length && <div className="table-empty"><History size={34} /><strong>Nenhum evento registrado</strong><span>As próximas ações auditáveis aparecerão aqui.</span></div>}{loading && <div className="table-empty"><LoaderCircle className="spinning" size={30} /><strong>Carregando auditoria</strong></div>}</div><aside className="audit-policy"><ShieldCheck size={29} /><h2>Política de integridade</h2><p>O XML/JSON original permanece imutável. Ajustes manuais são registrados separadamente com usuário, data, motivo e valores anterior e novo.</p><div><span>Credenciais no frontend</span><strong>Nunca</strong></div><div><span>Alterações sem auditoria</span><strong>Bloqueadas</strong></div><div><span>IA aprova documentos</span><strong>Não permitido</strong></div></aside></section></>;
}

function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string; detail?: string; sources?: string[] }>>([
    { role: "assistant", text: "Olá. Posso analisar documentos, pendências, divergências e custos dentro do seu escopo de acesso." },
  ]);
  const examples = ["Quais documentos estão pendentes no TOTVS?", "Quais NFS-e possuem retenções?", "Existem divergências tributárias?"];
  async function ask(value?: string) {
    const nextQuestion = (value ?? question).trim();
    if (!nextQuestion) return;
    setMessages((current) => [...current, { role: "user", text: nextQuestion }]);
    setQuestion("");
    setLoading(true);
    try {
      const data = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: nextQuestion }) }).then(readJson);
      setMessages((current) => [...current, { role: "assistant", text: data.answer, detail: data.detail, sources: data.sources }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "Não foi possível concluir a análise." }]);
    } finally {
      setLoading(false);
    }
  }
  return (
    <><button className={`drawer-overlay ${open ? "visible" : ""}`} onClick={onClose} aria-label="Fechar IA" /><aside className={`ai-drawer ${open ? "open" : ""}`} aria-hidden={!open}><header><div className="ai-avatar"><Sparkles size={20} /></div><div><strong>IA Carmak</strong><span><i />Assistente fiscal e financeiro</span></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header><div className="ai-scope"><ShieldCheck size={15} />Respostas limitadas às suas permissões e aos dados reais do portal.</div><div className="chat-messages">{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><div>{message.role === "assistant" && <Bot size={17} />}<p>{message.text}</p></div>{message.detail && <span>{message.detail}</span>}{message.sources?.length ? <small>Fontes: {message.sources.join(" · ")}</small> : null}</div>)}{loading && <div className="chat-message assistant"><div><Bot size={17} /><p><LoaderCircle size={17} className="spinning" />Analisando evidências...</p></div></div>}</div><div className="ai-examples">{examples.map((example) => <button key={example} onClick={() => ask(example)}>{example}</button>)}</div><footer><div><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Pergunte sobre documentos, tributos ou divergências..." onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} /><button onClick={() => ask()} disabled={loading || !question.trim()}><ArrowDownRight size={18} /></button></div><span>A IA não aprova nem altera registros automaticamente.</span></footer></aside></>
  );
}

function WidgetLibrary({ current, onAdd, onClose }: { current: Widget[]; onAdd: (widget: Widget) => void; onClose: () => void }) {
  return <div className="modal-overlay"><section className="widget-library-modal"><header><div><p className="eyebrow">PERSONALIZAÇÃO</p><h2>Adicionar indicador</h2><span>Escolha os componentes que deseja acompanhar.</span></div><button className="icon-button" onClick={onClose}><X size={19} /></button></header><div className="library-search"><Search size={17} /><input placeholder="Buscar indicador" /></div><div className="widget-library-grid">{widgetLibrary.map((widget) => { const added = current.some((item) => item.id === widget.id); return <button key={widget.id} disabled={added} onClick={() => onAdd(widget)}><div className="mini-widget-icon"><BarChart3 size={19} /></div><div><strong>{widget.title}</strong><span>{widget.description}</span></div>{added ? <Check size={18} /> : <Plus size={18} />}</button>; })}</div></section></div>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const map: Record<string, { label: string; tone: string }> = {
    ONLINE: { label: "Online", tone: "success" }, ACTIVE: { label: "Ativo", tone: "success" }, READY: { label: "Pronto", tone: "success" }, AVAILABLE: { label: "Disponível", tone: "success" }, VALIDATED: { label: "Validado", tone: "success" }, IMPORTED: { label: "Importado", tone: "success" }, RECONCILED: { label: "Conciliado", tone: "success" }, AUTHORIZED: { label: "Autorizado", tone: "success" }, RECEIVED: { label: "Recebido", tone: "success" },
    IMPORTED_WITH_WARNINGS: { label: "Com ressalvas", tone: "warning" }, PROBABLE: { label: "Provável", tone: "warning" }, PENDING: { label: "Pendente", tone: "warning" }, ASSISTED_MODE: { label: "Modo assistido", tone: "warning" },
    ERROR: { label: "Erro", tone: "danger" }, DIVERGENT: { label: "Divergente", tone: "danger" },
    INACTIVE: { label: "Inativo", tone: "neutral" }, NOT_CONFIGURED: { label: "Não configurado", tone: "neutral" }, NOT_PROCESSED: { label: "Não processado", tone: "neutral" }, ONLY_TOTVS: { label: "Somente TOTVS", tone: "neutral" },
  };
  const item = map[normalized] ?? { label: status.replaceAll("_", " "), tone: "neutral" };
  return <span className={`status-badge ${item.tone}`}><i />{item.label}</span>;
}

function integrationIcon(key: string) {
  if (key === "qive") return <FileText size={22} />;
  if (key.startsWith("totvs")) return <FileSpreadsheet size={22} />;
  if (key === "database") return <Database size={22} />;
  return <Bot size={22} />;
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? data.message ?? "A solicitação não pôde ser concluída.");
  return data;
}

function downloadBlob(content: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0); }
function formatNumber(value: number) { return new Intl.NumberFormat("pt-BR").format(value || 0); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(value)) : "—"; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function currentMonthValue() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function monthOptions() { const now = new Date(); return Array.from({ length: 24 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - index, 1); const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date); return { value, label: label.charAt(0).toUpperCase() + label.slice(1) }; }); }
function formatMonthShort(value: string) { const [year, month] = value.split("-").map(Number); return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1))).replace(" de ", "/"); }
function formatCnpj(value: string | null) { if (!value || value.length !== 14) return value ?? "CNPJ não informado"; return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); }
function initialsFromName(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "US"; }
function formatBranchScope(branches: string[]) { if (branches.includes("ALL")) return "Todas as filiais"; if (!branches.length) return "Sem filial definida"; if (branches.length <= 2) return branches.join(" · "); return `${branches.slice(0, 2).join(" · ")} +${branches.length - 2}`; }
function roleDescription(role: PortalUser["role"]) {
  const descriptions: Record<PortalUser["role"], string> = {
    ADMINISTRATOR: "Gerencia usuários, configurações e todos os módulos fiscais.",
    FISCAL: "Consulta documentos, tributos, retenções e executa análises fiscais.",
    FINANCIAL: "Acessa conciliação, pendências, relatórios e informações financeiras.",
    AUDITOR: "Consulta documentos, evidências e trilhas de auditoria sem alterar registros.",
    READER: "Acesso somente para consulta dos dados permitidos.",
  };
  return descriptions[role];
}
function carmakCnpjForDocument(document: FiscalDocument) {
  if (document.receiverCnpj?.startsWith("94534237")) return document.receiverCnpj;
  const nfseReceiver = document.qiveId?.split(":")[0]?.replace(/\D/g, "") ?? "";
  return nfseReceiver.startsWith("94534237") ? nfseReceiver : null;
}
function branchNameFromCnpj(value: string | null) { const digits = value?.replace(/\D/g, "") ?? ""; return knownCarmakBranches.find((branch) => branch.cnpj === digits)?.name ?? "CNPJ Carmak"; }
function maskKey(value: string) { return value.length > 16 ? `${value.slice(0, 8)}••••••••${value.slice(-8)}` : value; }
function formatFileSize(value: number) { return value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(value / 1024))} KB`; }
