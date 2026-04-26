"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Play,
  RefreshCw,
  Activity,
  BarChart3,
  Loader2,
  Send,
  Brain,
  Sparkles,
  Database,
  MessageSquare,
  Zap,
  Clock,
  Target,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  Network,
  FileJson,
  HardDrive,
  Layers,
  X,
  FolderOpen,
  Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type SemRow = { semafor: string; total: number };
type AlertaRow = {
  id: number;
  tipo: string;
  nombre_entidad: string | null;
  periodo: string;
  semafor: string;
  desviacion_pct: number | null;
  texto_alerta: string | null;
  whatsapp_simulado?: number | null;
};
type IndRojoRow = {
  indicador_id: string;
  nombre: string;
  periodo: string;
  meta: number;
  realizado: number;
  desviacion_pct: number;
  semafor: string;
};
type ProyRow = {
  proyecto_id: string;
  nombre: string;
  periodo: string;
  avance_planificado_pct: number;
  avance_real_pct: number;
  desviacion_pct: number;
  semafor: string;
};
type DashboardData = {
  hasData: boolean;
  run?: {
    run_id: string;
    status: string;
    total_indicadores: number;
    total_proyectos: number;
    alertas_generadas: number;
    created_at: string;
  };
  semaforos?: { indicadores: SemRow[]; proyectos: SemRow[] };
  topAlertas?: AlertaRow[];
  indRojos?: IndRojoRow[];
  proyRetra?: ProyRow[];
};

type MockApiFile = { name: string; size: number; records: number };
type SourcesData = {
  fuentes: string[];
  mock_api_files: MockApiFile[];
  run_id: string | null;
  created_at: string | null;
};
type DrillSerie = { periodo: string; semafor: string; meta: number; realizado: number };
type DrillHijo = {
  indicador_id: string;
  nombre: string;
  peso: number;
  ultimo_semafor: string | null;
  ultimo_periodo: string | null;
  meta: number;
  realizado: number;
  desviacion_pct: number;
  serie: DrillSerie[];
};
type DrillData = {
  padre: { indicador_id: string; nombre: string; rollup: string };
  hijos: DrillHijo[];
};

// ── Semaphore helpers ─────────────────────────────────────────────────────────
const semColor = (s: string) => {
  if (s === "rojo")
    return {
      bar: "bg-red-500",
      light: "bg-red-50 dark:bg-red-950/40",
      border: "border-red-200 dark:border-red-800",
      text: "text-red-700 dark:text-red-300",
      badge: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
      dot: "bg-red-500",
      glow: "shadow-red-200 dark:shadow-red-900",
    };
  if (s === "amarillo")
    return {
      bar: "bg-amber-400",
      light: "bg-amber-50 dark:bg-amber-950/40",
      border: "border-amber-200 dark:border-amber-800",
      text: "text-amber-700 dark:text-amber-300",
      badge: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
      dot: "bg-amber-400",
      glow: "shadow-amber-200 dark:shadow-amber-900",
    };
  return {
    bar: "bg-emerald-500",
    light: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-300",
    badge: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100",
    dot: "bg-emerald-500",
    glow: "shadow-emerald-200 dark:shadow-emerald-900",
  };
};

// ── AI Agents Banner ──────────────────────────────────────────────────────────
function AgentsBanner({ run }: { run?: DashboardData["run"] }) {
  const agents = [
    {
      name: "Claude Haiku",
      role: "Agente 1",
      desc: "Detección · Semáforos · Alertas ejecutivas",
      icon: Brain,
      emoji: "🧠",
      accent: "indigo",
      iconBg: "bg-blue-600",
      pillBg: "bg-blue-50 dark:bg-blue-950/50",
      pillText: "text-blue-600 dark:text-blue-400",
      pillBorder: "border-blue-200 dark:border-blue-800",
      glow: "shadow-blue-100 dark:shadow-blue-950",
      tags: ["Rápido", "Detección"],
    },
    {
      name: "Claude Sonnet",
      role: "Agente 2",
      desc: "Chat · Síntesis · Análisis profundo",
      icon: Sparkles,
      emoji: "✨",
      accent: "violet",
      iconBg: "bg-blue-600",
      pillBg: "bg-blue-50 dark:bg-blue-950/50",
      pillText: "text-blue-600 dark:text-blue-400",
      pillBorder: "border-blue-200 dark:border-blue-800",
      glow: "shadow-blue-100 dark:shadow-blue-950",
      tags: ["Potente", "Razonamiento"],
    },
    {
      name: "ChromaDB",
      role: "RAG",
      desc: "sentence-transformers · Búsqueda semántica",
      icon: Database,
      emoji: "🗄️",
      accent: "teal",
      iconBg: "bg-teal-600",
      pillBg: "bg-teal-50 dark:bg-teal-950/50",
      pillText: "text-teal-600 dark:text-teal-400",
      pillBorder: "border-teal-200 dark:border-teal-800",
      glow: "shadow-teal-100 dark:shadow-teal-950",
      tags: ["Vectores", "Semántica"],
    },
    {
      name: "Email / Gmail",
      role: "Notificaciones",
      desc: "Reporte HTML ejecutivo · Alertas + KPIs",
      icon: MessageSquare,
      emoji: "📧",
      accent: "emerald",
      iconBg: "bg-emerald-600",
      pillBg: "bg-emerald-50 dark:bg-emerald-950/50",
      pillText: "text-emerald-600 dark:text-emerald-400",
      pillBorder: "border-emerald-200 dark:border-emerald-800",
      glow: "shadow-emerald-100 dark:shadow-emerald-950",
      tags: ["HTML ejecutivo", "Automático"],
    },
  ];

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-600 shadow-sm">
            <Cpu className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Sistema Multi-LLM</p>
            <p className="text-[10px] text-zinc-400">Pipeline de IA · Orquestación de agentes</p>
          </div>
        </div>
        {run ? (
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 dark:border-emerald-800/60 dark:bg-emerald-950/40">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              Activo · {run.run_id.slice(0, 8)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 dark:border-zinc-700 dark:bg-zinc-800">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            <span className="text-[10px] font-medium text-zinc-400">Sin pipeline activo</span>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-0 lg:grid-cols-4">
        {agents.map((agent, i) => (
          <div
            key={agent.name}
            className={`relative flex flex-col gap-3 p-5 transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 ${
              i < agents.length - 1 ? "border-r border-zinc-100 dark:border-zinc-800" : ""
            } ${i === 1 ? "border-b border-zinc-100 dark:border-zinc-800 lg:border-b-0" : ""}`}
          >
            {/* Icon + role */}
            <div className="flex items-start justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${agent.iconBg} shadow-sm`}>
                <agent.icon className="h-5 w-5 text-white" />
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${agent.pillBg} ${agent.pillText} ${agent.pillBorder}`}>
                {agent.role}
              </span>
            </div>

            {/* Name + desc */}
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50 mb-0.5">{agent.name}</p>
              <p className="text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">{agent.desc}</p>
            </div>

            {/* Tags */}
            <div className="flex gap-1.5 flex-wrap mt-auto">
              {agent.tags.map(tag => (
                <span key={tag} className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, accent, icon: Icon, trend, onClick,
}: {
  label: string; value: string | number; sub?: string;
  accent: string; icon: React.ElementType; trend?: "up" | "down" | "neutral";
  onClick?: () => void;
}) {
  const inner = (
    <>
      {/* Decorative circle */}
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
      <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/5" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest opacity-75">{label}</p>
          <p className="mt-1.5 text-4xl font-extrabold tabular-nums">{value}</p>
          {sub && (
            <div className="mt-1 flex items-center gap-1 opacity-80">
              {trend === "down" && <TrendingDown className="h-3 w-3" />}
              {trend === "up" && <TrendingUp className="h-3 w-3" />}
              <p className="text-xs">{sub}</p>
            </div>
          )}
        </div>
        <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur-sm">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {onClick && (
        <div className="relative mt-3 flex items-center gap-1 opacity-60 hover:opacity-90 transition-opacity text-[10px] font-semibold uppercase tracking-widest">
          <Info className="h-3 w-3" /> Ver detalle
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`relative overflow-hidden rounded-2xl p-5 ${accent} shadow-lg text-left w-full cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all duration-150`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 ${accent} shadow-lg`}>
      {inner}
    </div>
  );
}

// ── KPI Detail Modal ──────────────────────────────────────────────────────────
type ModalKind = "indicadores" | "proyectos" | "alertas" | "salud";

type DetailFull = { hasData: boolean; indRojos?: IndRojoRow[]; proyRetra?: ProyRow[]; topAlertas?: AlertaRow[] };

// ── Semaphore filter + pagination hook ───────────────────────────────────────
type SemFilter = "todos" | "verde" | "amarillo" | "rojo";

function useSemPagination<T extends { semafor: string }>(items: T[], pageSize = 10) {
  const [page, setPage]       = useState(1);
  const [filter, setFilterRaw] = useState<SemFilter>("todos");

  const setFilter = (f: SemFilter) => { setFilterRaw(f); setPage(1); };

  const filtered    = filter === "todos" ? items : items.filter(r => r.semafor === filter);
  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { setPage(1); }, [items.length]);
  const slice       = filtered.slice((page - 1) * pageSize, page * pageSize);

  // counts per color for badge
  const counts = { verde: 0, amarillo: 0, rojo: 0 } as Record<string, number>;
  items.forEach(r => { if (counts[r.semafor] !== undefined) counts[r.semafor]++; });

  return { page, setPage, totalPages, slice, total: filtered.length, pageSize, filter, setFilter, counts, allTotal: items.length };
}

// ── Semaphore filter bar ──────────────────────────────────────────────────────
function SemFilterBar({
  filter, setFilter, counts,
}: {
  filter: SemFilter;
  setFilter: (f: SemFilter) => void;
  counts: Record<string, number>;
}) {
  const opts: { key: SemFilter; label: string; dot: string; active: string; inactive: string }[] = [
    { key: "todos",    label: "Todos",    dot: "bg-zinc-400",    active: "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900",                            inactive: "border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" },
    { key: "verde",    label: "Verde",    dot: "bg-emerald-500", active: "bg-emerald-600 text-white",                                                              inactive: "border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" },
    { key: "amarillo", label: "Amarillo", dot: "bg-amber-400",   active: "bg-amber-500 text-white",                                                                inactive: "border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40" },
    { key: "rojo",     label: "Rojo",     dot: "bg-red-500",     active: "bg-red-600 text-white",                                                                  inactive: "border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {opts.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => setFilter(o.key)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${filter === o.key ? o.active : `bg-white dark:bg-zinc-900 ${o.inactive}`}`}
        >
          <span className={`h-2 w-2 rounded-full ${o.dot}`} />
          {o.label}
          {o.key !== "todos" && (
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${filter === o.key ? "bg-white/25" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"}`}>
              {counts[o.key] ?? 0}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Pagination bar UI ─────────────────────────────────────────────────────────
function PaginationBar({
  page, totalPages, total, pageSize, setPage,
}: {
  page: number; totalPages: number; total: number; pageSize: number;
  setPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  // Build page numbers with ellipsis
  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  const btn = (label: React.ReactNode, target: number, disabled: boolean, active = false) => (
    <button
      key={String(label)}
      type="button"
      disabled={disabled}
      onClick={() => setPage(target)}
      className={`min-w-[28px] h-7 rounded-lg px-2 text-xs font-semibold transition-colors
        ${active
          ? "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-zinc-900"
        }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-between pt-2 pb-1 px-1">
      <span className="text-[11px] text-zinc-400">
        {from}–{to} de <strong className="text-zinc-600 dark:text-zinc-300">{total}</strong>
      </span>
      <div className="flex items-center gap-1">
        {btn("«", 1,         page === 1)}
        {btn("‹", page - 1,  page === 1)}
        {pages.map((p, i) =>
          p === "…"
            ? <span key={`ellipsis-${i}`} className="px-1 text-xs text-zinc-400">…</span>
            : btn(p, p as number, false, p === page)
        )}
        {btn("›", page + 1,  page === totalPages)}
        {btn("»", totalPages, page === totalPages)}
      </div>
    </div>
  );
}

function DetailModal({
  kind,
  data,
  sourcesData,
  onClose,
}: {
  kind: ModalKind;
  data: DashboardData;
  sourcesData: SourcesData | null;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState<DetailFull | null>(null);
  const [loadingFull, setLoadingFull] = useState(true);

  // Fetch unlimited detail data on mount
  useEffect(() => {
    setLoadingFull(true);
    fetch("/api/dashboard/detail")
      .then(r => r.json())
      .then(d => setFull(d as DetailFull))
      .catch(() => setFull(null))
      .finally(() => setLoadingFull(false));
  }, []);

  // Use full data when available, fall back to truncated dashboard data
  const indRojos   = full?.indRojos   ?? data.indRojos   ?? [];
  const proyRetra  = full?.proyRetra  ?? data.proyRetra  ?? [];
  const topAlertas = full?.topAlertas ?? data.topAlertas ?? [];

  // Semaphore filter + pagination per table
  const pgInd  = useSemPagination(indRojos,   10);
  const pgProy = useSemPagination(proyRetra,  10);
  const pgAlt  = useSemPagination(topAlertas, 8);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Determine title / accent
  const META: Record<ModalKind, { title: string; emoji: string; accent: string }> = {
    indicadores: { title: "Indicadores de gestión",      emoji: "📊", accent: "from-blue-600 to-blue-500" },
    proyectos:   { title: "Proyectos estratégicos",       emoji: "🗂️",  accent: "from-blue-600 to-blue-500" },
    alertas:     { title: "Alertas ejecutivas de IA",     emoji: "🚨", accent: "from-rose-600 to-rose-500" },
    salud:       { title: "Salud del portafolio",         emoji: "💚", accent: "from-emerald-600 to-emerald-500" },
  };
  const meta = META[kind];

  // Source files
  const sqliteFile = sourcesData?.fuentes?.find(f => f.endsWith(".db") || f.endsWith(".sqlite")) ?? null;
  const csvFiles   = sourcesData?.fuentes?.filter(f => f.endsWith(".csv")) ?? [];
  const jsonFiles  = sourcesData?.fuentes?.filter(f => f.endsWith(".json")) ?? [];
  const apiFiles   = sourcesData?.mock_api_files ?? [];

  // Semaphore counts for salud view
  const sem = data.semaforos;
  const indSem = Object.fromEntries((sem?.indicadores ?? []).map(r => [r.semafor, Number(r.total)]));
  const proySem = Object.fromEntries((sem?.proyectos ?? []).map(r => [r.semafor, Number(r.total)]));

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 bg-gradient-to-r ${meta.accent} text-white shrink-0`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{meta.emoji}</span>
            <div>
              <p className="text-base font-bold">{meta.title}</p>
              <p className="text-xs opacity-75">Fuente de datos · detalle completo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/20 p-1.5 hover:bg-white/30 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Source chips */}
        <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 self-center mr-1">Fuentes:</span>
          {sqliteFile && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
              <HardDrive className="h-3 w-3" /> {sqliteFile}
            </span>
          )}
          {csvFiles.map(f => (
            <span key={f} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
              <Layers className="h-3 w-3" /> {f}
            </span>
          ))}
          {jsonFiles.map(f => (
            <span key={f} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
              <FileJson className="h-3 w-3" /> {f}
            </span>
          ))}
          {apiFiles.map(f => (
            <span key={f.name} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
              <Network className="h-3 w-3" /> {f.name} ({f.records} reg.)
            </span>
          ))}
          {!sqliteFile && csvFiles.length === 0 && jsonFiles.length === 0 && apiFiles.length === 0 && (
            <span className="text-xs text-zinc-400">Sin información de fuentes</span>
          )}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loadingFull && (
            <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando datos completos…</span>
            </div>
          )}
          {/* ── INDICADORES ── */}
          {kind === "indicadores" && (
            <>
              {/* Semaphore summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { k: "verde",    label: "En verde",    cls: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
                  { k: "amarillo", label: "En amarillo", cls: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
                  { k: "rojo",     label: "En rojo",     cls: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
                ].map(({ k, label, cls }) => (
                  <div key={k} className={`rounded-xl border p-3 text-center ${cls}`}>
                    <p className="text-2xl font-extrabold">{indSem[k] ?? 0}</p>
                    <p className="text-[11px] font-medium mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {/* Worst indicators table */}
              {indRojos.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Indicadores <span className="font-normal text-zinc-400">({pgInd.total} de {pgInd.allTotal})</span>
                    </p>
                  </div>
                  <SemFilterBar filter={pgInd.filter} setFilter={pgInd.setFilter} counts={pgInd.counts} />
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-zinc-50 dark:bg-zinc-800">
                          <tr>
                            {["ID", "Nombre", "Período", "Meta", "Realizado", "Desviación", "Estado"].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {pgInd.slice.map((r, i) => (
                            <tr key={`${r.indicador_id}-${r.periodo}-${i}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                              <td className="px-3 py-2 font-mono text-zinc-400">{r.indicador_id}</td>
                              <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-100 max-w-[160px] truncate">{r.nombre}</td>
                              <td className="px-3 py-2 text-zinc-500">{r.periodo}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{Number(r.meta).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{Number(r.realizado).toLocaleString()}</td>
                              <td className={`px-3 py-2 text-right font-bold tabular-nums ${r.desviacion_pct < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                {r.desviacion_pct > 0 ? "+" : ""}{Number(r.desviacion_pct).toFixed(1)}%
                              </td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${semColor(r.semafor).badge}`}>
                                  {r.semafor}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-zinc-100 dark:border-zinc-800 px-3">
                      <PaginationBar {...pgInd} />
                    </div>
                  </div>
                </div>
              ) : !loadingFull ? (
                <p className="text-center text-sm text-zinc-400 py-6">No hay indicadores con desviación registrada</p>
              ) : null}
            </>
          )}

          {/* ── PROYECTOS ── */}
          {kind === "proyectos" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { k: "verde",    label: "En verde",    cls: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
                  { k: "amarillo", label: "En amarillo", cls: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
                  { k: "rojo",     label: "Atrasados",   cls: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
                ].map(({ k, label, cls }) => (
                  <div key={k} className={`rounded-xl border p-3 text-center ${cls}`}>
                    <p className="text-2xl font-extrabold">{proySem[k] ?? 0}</p>
                    <p className="text-[11px] font-medium mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {proyRetra.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Proyectos <span className="font-normal text-zinc-400">({pgProy.total} de {pgProy.allTotal})</span>
                    </p>
                  </div>
                  <SemFilterBar filter={pgProy.filter} setFilter={pgProy.setFilter} counts={pgProy.counts} />
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-zinc-50 dark:bg-zinc-800">
                          <tr>
                            {["ID", "Nombre", "Período", "Plan %", "Real %", "Desviación", "Estado"].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {pgProy.slice.map((r, i) => (
                            <tr key={`${r.proyecto_id}-${r.periodo}-${i}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                              <td className="px-3 py-2 font-mono text-zinc-400">{r.proyecto_id}</td>
                              <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-100 max-w-[160px] truncate">{r.nombre}</td>
                              <td className="px-3 py-2 text-zinc-500">{r.periodo}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{Number(r.avance_planificado_pct).toFixed(1)}%</td>
                              <td className="px-3 py-2 text-right tabular-nums">{Number(r.avance_real_pct).toFixed(1)}%</td>
                              <td className={`px-3 py-2 text-right font-bold tabular-nums ${r.desviacion_pct < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                {r.desviacion_pct > 0 ? "+" : ""}{Number(r.desviacion_pct).toFixed(1)}%
                              </td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${semColor(r.semafor).badge}`}>
                                  {r.semafor}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-zinc-100 dark:border-zinc-800 px-3">
                      <PaginationBar {...pgProy} />
                    </div>
                  </div>
                </div>
              ) : !loadingFull ? (
                <p className="text-center text-sm text-zinc-400 py-6">No hay proyectos retrasados registrados</p>
              ) : null}
            </>
          )}

          {/* ── ALERTAS ── */}
          {kind === "alertas" && (
            <>
              <p className="text-xs text-zinc-500">Alertas generadas por <strong>Claude Haiku (Agente 1)</strong> durante el último pipeline</p>
              {topAlertas.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-zinc-400">{pgAlt.total} de {pgAlt.allTotal} alertas</p>
                  </div>
                  <SemFilterBar filter={pgAlt.filter} setFilter={pgAlt.setFilter} counts={pgAlt.counts} />
                  {pgAlt.slice.map(a => {
                    const c = semColor(a.semafor);
                    return (
                      <div key={a.id} className={`rounded-xl border p-4 ${c.light} ${c.border}`}>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.badge}`}>{a.semafor}</span>
                          <span className="text-[10px] text-zinc-500">{a.tipo}</span>
                          {a.nombre_entidad && <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-200">{a.nombre_entidad}</span>}
                          <span className="text-[10px] text-zinc-400">{a.periodo}</span>
                          {a.desviacion_pct != null && (
                            <span className={`text-[10px] font-bold ml-auto ${a.desviacion_pct < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600"}`}>
                              {a.desviacion_pct > 0 ? "+" : ""}{Number(a.desviacion_pct).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {a.texto_alerta && (
                          <p className={`text-xs leading-relaxed ${c.text}`}>{a.texto_alerta}</p>
                        )}
                        {a.whatsapp_simulado === 1 && (
                          <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <span>✓ WhatsApp enviado</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <PaginationBar {...pgAlt} />
                </div>
              ) : !loadingFull ? (
                <p className="text-center text-sm text-zinc-400 py-6">No hay alertas generadas aún. Ejecuta el pipeline primero.</p>
              ) : null}
            </>
          )}

          {/* ── SALUD ── */}
          {kind === "salud" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Indicadores</p>
                  <div className="space-y-2">
                    {[
                      { k: "verde",    label: "En verde",    dotCls: "bg-emerald-500" },
                      { k: "amarillo", label: "En amarillo", dotCls: "bg-amber-400" },
                      { k: "rojo",     label: "En rojo",     dotCls: "bg-red-500" },
                    ].map(({ k, label, dotCls }) => {
                      const total = Object.values(indSem).reduce((a, b) => a + b, 0);
                      const val = indSem[k] ?? 0;
                      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                      return (
                        <div key={k} className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotCls}`} />
                          <span className="text-xs text-zinc-600 dark:text-zinc-300 flex-1">{label}</span>
                          <span className="text-xs font-bold tabular-nums text-zinc-800 dark:text-zinc-100">{val}</span>
                          <div className="w-20 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                            <div className={`h-full rounded-full ${dotCls}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-400 w-8 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Proyectos</p>
                  <div className="space-y-2">
                    {[
                      { k: "verde",    label: "En verde",    dotCls: "bg-emerald-500" },
                      { k: "amarillo", label: "En amarillo", dotCls: "bg-amber-400" },
                      { k: "rojo",     label: "Atrasados",   dotCls: "bg-red-500" },
                    ].map(({ k, label, dotCls }) => {
                      const total = Object.values(proySem).reduce((a, b) => a + b, 0);
                      const val = proySem[k] ?? 0;
                      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                      return (
                        <div key={k} className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotCls}`} />
                          <span className="text-xs text-zinc-600 dark:text-zinc-300 flex-1">{label}</span>
                          <span className="text-xs font-bold tabular-nums text-zinc-800 dark:text-zinc-100">{val}</span>
                          <div className="w-20 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                            <div className={`h-full rounded-full ${dotCls}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-400 w-8 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* run meta */}
              {data.run && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 text-xs text-zinc-500 space-y-1">
                  <div className="flex gap-2"><span className="font-semibold text-zinc-700 dark:text-zinc-200 w-32">Run ID:</span><span className="font-mono">{data.run.run_id}</span></div>
                  <div className="flex gap-2"><span className="font-semibold text-zinc-700 dark:text-zinc-200 w-32">Estado:</span><span>{data.run.status}</span></div>
                  <div className="flex gap-2"><span className="font-semibold text-zinc-700 dark:text-zinc-200 w-32">Ejecutado:</span><span>{new Date(data.run.created_at).toLocaleString("es")}</span></div>
                  <div className="flex gap-2"><span className="font-semibold text-zinc-700 dark:text-zinc-200 w-32">Indicadores:</span><span>{data.run.total_indicadores}</span></div>
                  <div className="flex gap-2"><span className="font-semibold text-zinc-700 dark:text-zinc-200 w-32">Proyectos:</span><span>{data.run.total_proyectos}</span></div>
                  <div className="flex gap-2"><span className="font-semibold text-zinc-700 dark:text-zinc-200 w-32">Alertas IA:</span><span>{data.run.alertas_generadas}</span></div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <FolderOpen className="h-3.5 w-3.5" />
            {sourcesData?.fuentes?.length ?? 0} fuente(s) · {sourcesData?.mock_api_files?.length ?? 0} archivo(s) API
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Semaphore chart ───────────────────────────────────────────────────────────
function SemaforoBar({ rows, title, icon: Icon }: { rows: SemRow[]; title: string; icon: React.ElementType }) {
  const map = Object.fromEntries(rows.map((r) => [r.semafor, Number(r.total)]));
  const total = rows.reduce((a, r) => a + Number(r.total), 0) || 1;
  const verde = map.verde ?? 0;
  const amarillo = map.amarillo ?? 0;
  const rojo = map.rojo ?? 0;
  const pct = (n: number) => Math.round((n / total) * 100);
  const healthPct = pct(verde);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3>
            <p className="text-[10px] text-zinc-500">{total} elementos analizados</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{healthPct}%</p>
          <p className="text-[10px] text-zinc-500">cumplimiento</p>
        </div>
      </div>

      {/* Stacked progress */}
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full">
        <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${pct(verde)}%` }} />
        <div className="bg-amber-400 transition-all duration-700" style={{ width: `${pct(amarillo)}%` }} />
        <div className="bg-red-500 transition-all duration-700" style={{ width: `${pct(rojo)}%` }} />
      </div>

      <div className="space-y-2.5">
        {[
          { label: "Verde", val: verde, color: "bg-emerald-500", textColor: "text-emerald-700 dark:text-emerald-400" },
          { label: "Amarillo", val: amarillo, color: "bg-amber-400", textColor: "text-amber-700 dark:text-amber-400" },
          { label: "Rojo", val: rojo, color: "bg-red-500", textColor: "text-red-700 dark:text-red-400" },
        ].map(({ label, val, color, textColor }) => (
          <div key={label} className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
            <span className="w-16 text-xs text-zinc-500">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct(val)}%` }} />
            </div>
            <span className={`w-16 text-right text-xs font-bold tabular-nums ${textColor}`}>
              {val} <span className="font-normal text-zinc-400">({pct(val)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────
function AlertCard({ a }: { a: AlertaRow }) {
  const [open, setOpen] = useState(false);
  const c = semColor(a.semafor);

  return (
    <article className={`rounded-2xl border p-4 ${c.light} ${c.border} transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
              {a.semafor}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
              {a.tipo}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
              {a.periodo}
            </span>
            {a.whatsapp_simulado ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                📱 WA enviado
              </span>
            ) : null}
          </div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm leading-snug">
            {a.nombre_entidad}
          </p>
        </div>
        {a.desviacion_pct != null && (
          <div className={`shrink-0 rounded-xl px-2.5 py-1.5 text-right ${c.light} border ${c.border}`}>
            <div className={`flex items-center gap-0.5 text-sm font-extrabold ${c.text}`}>
              {Number(a.desviacion_pct) < 0
                ? <TrendingDown className="h-3.5 w-3.5" />
                : <TrendingUp className="h-3.5 w-3.5" />}
              {Number(a.desviacion_pct) > 0 ? "+" : ""}{Number(a.desviacion_pct).toFixed(1)}%
            </div>
            <p className="text-[10px] text-zinc-500">desviación</p>
          </div>
        )}
      </div>

      {/* AI Insight toggle */}
      {a.texto_alerta && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${c.border} ${c.light} ${c.text} hover:opacity-90`}
          >
            <div className="flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 shrink-0" />
              Insight ejecutivo · Claude Haiku
            </div>
            {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          </button>
          {open && (
            <div className="mt-2 rounded-xl border border-zinc-200/70 bg-white/80 p-4 text-xs leading-relaxed text-zinc-800 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-200 prose prose-xs max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 mb-2 mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xs font-bold text-zinc-800 dark:text-zinc-100 mb-1.5 mt-3">{children}</h2>,
                  strong: ({ children }) => <strong className="font-semibold text-zinc-900 dark:text-zinc-50">{children}</strong>,
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2">{children}</ol>,
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2">{children}</ul>,
                  li: ({ children }) => <li className="text-zinc-700 dark:text-zinc-300">{children}</li>,
                }}
              >
                {a.texto_alerta}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ── Worst indicators table ─────────────────────────────────────────────────────
function IndRojosTable({ rows }: { rows: IndRojoRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
        <Target className="h-4 w-4 text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Indicadores críticos</p>
          <p className="text-[10px] text-zinc-500">Mayor desviación detectada por IA · orden descendente</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60">
            <tr>
              {["Indicador", "Período", "Meta", "Real", "Desviación", "Estado"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-zinc-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r, i) => {
              const c = semColor(r.semafor);
              return (
                <tr key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="max-w-[180px] truncate px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-200" title={r.nombre}>
                    {r.nombre}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{r.periodo}</td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{Number(r.meta).toLocaleString()}</td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-300">{Number(r.realizado).toLocaleString()}</td>
                  <td className={`px-4 py-2.5 font-bold tabular-nums ${c.text}`}>
                    <span className="flex items-center gap-0.5">
                      <TrendingDown className="h-3 w-3 shrink-0" />
                      {Number(r.desviacion_pct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.badge}`}>{r.semafor}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Projects delayed table ─────────────────────────────────────────────────────
function ProyRetrasadosTable({ rows }: { rows: ProyRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
        <Clock className="h-4 w-4 text-amber-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Proyectos con atraso</p>
          <p className="text-[10px] text-zinc-500">Análisis de avance planificado vs real</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60">
            <tr>
              {["Proyecto", "Período", "Planificado", "Real", "Brecha", "Estado"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-zinc-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r, i) => {
              const c = semColor(r.semafor);
              const brecha = Number(r.avance_real_pct) - Number(r.avance_planificado_pct);
              return (
                <tr key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="max-w-[180px] truncate px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-200" title={r.nombre}>
                    {r.nombre}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{r.periodo}</td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-600">{Number(r.avance_planificado_pct).toFixed(1)}%</td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-600">{Number(r.avance_real_pct).toFixed(1)}%</td>
                  <td className={`px-4 py-2.5 font-bold tabular-nums ${c.text}`}>
                    {brecha > 0 ? "+" : ""}{brecha.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.badge}`}>{r.semafor}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ── Run pipeline button ───────────────────────────────────────────────────────
function RunButton({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<"idle" | "running" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    setStatus("running");
    setMsg("");
    try {
      const res = await fetch("/api/pipeline", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.status === "completed") {
        setStatus("ok");
        setMsg(`run: ${String(data.run_id).slice(0, 8)}…`);
        onDone();
      } else {
        setStatus("err");
        setMsg(data.error || "Falló");
      }
    } catch (e) {
      setStatus("err");
      setMsg(String(e));
    }
    setTimeout(() => setStatus("idle"), 6000);
  }

  const cfg = {
    idle:    { label: "Ejecutar Pipeline",    cls: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200" },
    running: { label: "Procesando pipeline…", cls: "bg-blue-400 text-white cursor-not-allowed" },
    ok:      { label: "✓ Completado",         cls: "bg-emerald-500 text-white" },
    err:     { label: "Error",                cls: "bg-red-500 text-white" },
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={status === "running"}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition-all ${cfg[status].cls}`}
      >
        {status === "running"
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Play className="h-4 w-4" />}
        {cfg[status].label}
      </button>
      {msg && <span className="text-xs text-zinc-500 font-mono">{msg}</span>}
    </div>
  );
}

// ── Pipeline steps visual ─────────────────────────────────────────────────────
function PipelineSteps() {
  const steps = [
    { label: "Ingesta",     icon: Database,      desc: "SQLite · CSV · Excel" },
    { label: "Detección",   icon: Activity,      desc: "Semáforos · Umbrales" },
    { label: "RAG Index",   icon: Network,       desc: "ChromaDB embeddings" },
    { label: "Alertas",     icon: Brain,         desc: "Claude Haiku · Insights" },
    { label: "Síntesis",    icon: Sparkles,      desc: "Claude Sonnet · Resumen" },
    { label: "WhatsApp",    icon: MessageSquare, desc: "Notificación ejecutiva" },
  ];
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-blue-500" />
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pipeline orquestado</p>
        <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          8 fases
        </span>
      </div>
      <div className="flex items-start gap-0 overflow-x-auto pb-1">
        {steps.map((step, i) => (
          <div key={step.label} className="flex shrink-0 items-center">
            <div className="flex flex-col items-center gap-1.5 px-3 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 ring-2 ring-blue-100 dark:bg-blue-950/60 dark:ring-blue-900">
                <step.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">{step.label}</p>
              <p className="text-[9px] text-zinc-400 max-w-[70px] leading-tight">{step.desc}</p>
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center">
                <div className="h-px w-4 bg-blue-200 dark:bg-blue-800" />
                <ArrowUpRight className="h-3 w-3 -rotate-45 text-blue-300 dark:text-blue-700" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sources panel ─────────────────────────────────────────────────────────────
function SourcesPanel({ data }: { data: SourcesData | null }) {
  if (!data) return null;
  const { fuentes, mock_api_files } = data;

  const hasSqlite = fuentes.some((f) => f.includes("sqlite") || f.includes(".db"));
  const hasCsv = fuentes.some((f) => f.includes("csv") || f.includes("CSV"));
  const mockFiles = mock_api_files ?? [];
  const hasMock = mockFiles.length > 0 || fuentes.some((f) => f.includes("mock_api"));

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <Layers className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Fuentes de datos integradas</p>
            <p className="text-[10px] text-zinc-500">Orígenes procesados en el último run del pipeline</p>
          </div>
        </div>
        {data.run_id && (
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-mono text-zinc-500 dark:bg-zinc-800">
            {data.run_id.slice(0, 8)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* SQLite badge */}
        <div className={`flex items-start gap-3 rounded-xl border p-3 ${hasSqlite ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40" : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40 opacity-50"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/60">
            <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">SQLite / MySQL</p>
            <p className="mt-0.5 truncate text-[10px] text-blue-600 dark:text-blue-400">
              {hasSqlite
                ? (fuentes.find((f) => f.includes("sqlite") || f.includes(".db")) ?? "assessment_planeacion.db")
                : "No detectado"}
            </p>
          </div>
        </div>

        {/* CSV badge */}
        <div className={`flex items-start gap-3 rounded-xl border p-3 ${hasCsv ? "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/40" : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40 opacity-50"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-700">
            <HardDrive className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">CSV / Excel</p>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              {hasCsv ? "Archivos CSV procesados" : "No detectado"}
            </p>
          </div>
        </div>

        {/* Mock API badge */}
        <div className={`flex items-start gap-3 rounded-xl border p-3 ${hasMock ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40 opacity-50"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/60">
            <FileJson className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              Mock API
              {mockFiles.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                  {mockFiles.length} archivos
                </span>
              )}
            </p>
            {mockFiles.length > 0 ? (
              <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
                {mockFiles.map((f) => f.name.replace(".json", "")).join(", ")}
              </p>
            ) : (
              <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                {hasMock ? "Mock API integrada" : "No detectado"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drill-down section ────────────────────────────────────────────────────────
function DrilldownSection() {
  const TABS = ["I001", "I004"] as const;
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const [drillData, setDrillData] = useState<DrillData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDrillData(null);
    fetch(`/api/drilldown?indicador=${activeTab}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDrillData(d as DrillData);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header + tabs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60">
            <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Drill-down jerárquico</p>
            <p className="text-[10px] text-zinc-500">Desagregación de indicadores padre → hijos</p>
          </div>
        </div>
        <div className="flex gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-800">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
      {!loading && drillData && (
        <>
          {/* Parent info */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              {drillData.padre.nombre}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
              drillData.padre.rollup === "SUM_CHILDREN"
                ? "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200"
                : "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200"
            }`}>
              {drillData.padre.rollup}
            </span>
            <span className="text-[10px] text-zinc-400">{activeTab}</span>
          </div>

          {/* Children rows */}
          <div className="space-y-3">
            {drillData.hijos.map((hijo) => {
              const c = semColor(hijo.ultimo_semafor ?? "verde");
              const progPct = hijo.meta > 0
                ? Math.min(100, Math.round((hijo.realizado / hijo.meta) * 100))
                : 0;
              const pesoLabel =
                drillData.padre.rollup === "WEIGHTED_AVG"
                  ? `${Math.round(hijo.peso * 100)}%`
                  : "1×";

              return (
                <div
                  key={hijo.indicador_id}
                  className={`rounded-xl border p-3 ${c.light} ${c.border}`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {/* Indicator name */}
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 flex-1 min-w-0 truncate">
                      {hijo.nombre}
                    </span>
                    {/* Weight badge */}
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-mono text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 shrink-0">
                      peso {pesoLabel}
                    </span>
                    {/* Semaphore badge */}
                    {hijo.ultimo_semafor && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${c.badge}`}>
                        {hijo.ultimo_semafor}
                      </span>
                    )}
                    {/* Period */}
                    {hijo.ultimo_periodo && (
                      <span className="text-[10px] text-zinc-400 shrink-0">{hijo.ultimo_periodo}</span>
                    )}
                  </div>

                  {/* Progress bar + numbers */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-700/70 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${c.bar}`}
                        style={{ width: `${progPct}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500 shrink-0">
                      <span>R: <strong className="text-zinc-700 dark:text-zinc-200">{hijo.realizado.toLocaleString()}</strong></span>
                      <span>M: <strong className="text-zinc-700 dark:text-zinc-200">{hijo.meta.toLocaleString()}</strong></span>
                      <span className={`font-bold ${c.text}`}>
                        {hijo.desviacion_pct > 0 ? "+" : ""}{hijo.desviacion_pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {drillData.hijos.length === 0 && (
              <p className="text-center text-sm text-zinc-400 py-6">
                No hay indicadores hijos para {activeTab}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sourcesData, setSourcesData] = useState<SourcesData | null>(null);
  const [activeModal, setActiveModal] = useState<ModalKind | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard");
      setData(await res.json());
    } catch {
      setData({ hasData: false });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => setSourcesData(d as SourcesData))
      .catch(() => setSourcesData(null));
  }, []);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm text-zinc-500">Cargando datos del pipeline…</p>
        </div>
      </div>
    );
  }

  const sem = data.semaforos;
  const indMap = Object.fromEntries((sem?.indicadores ?? []).map((r) => [r.semafor, Number(r.total)]));
  const proyMap = Object.fromEntries((sem?.proyectos ?? []).map((r) => [r.semafor, Number(r.total)]));
  const totalInd = Object.values(indMap).reduce((a, b) => a + b, 0);
  const totalProy = Object.values(proyMap).reduce((a, b) => a + b, 0);
  const healthScore = totalInd > 0
    ? Math.round(((indMap.verde ?? 0) / totalInd) * 100)
    : 0;

  return (
    <div className="min-h-full space-y-5 p-6">
      {/* ── KPI Detail Modal ───────────────────────────────────── */}
      {activeModal && (
        <DetailModal
          kind={activeModal}
          data={data}
          sourcesData={sourcesData}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
            Dashboard Ejecutivo
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Planeación Estratégica · Análisis automático con IA
            {data.run && (
              <>
                {" · "}
                <span className="font-mono text-xs">{new Date(data.run.created_at).toLocaleString("es")}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <RunButton onDone={load} />
        </div>
      </div>

      {/* ── Multi-LLM agents banner ─────────────────────────────── */}
      <AgentsBanner run={data.run} />

      {!data.hasData ? (
        /* ── No data state ──────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            <Activity className="h-8 w-8 text-zinc-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-200">Sin datos aún</p>
            <p className="mt-1 text-sm text-zinc-400">
              Sube archivos en <strong>Datos → Subir</strong> o ejecuta el Pipeline
            </p>
          </div>
          <RunButton onDone={load} />
          <PipelineSteps />
        </div>
      ) : (
        <>
          {/* ── KPI cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="Indicadores"
              value={totalInd}
              sub={`${indMap.rojo ?? 0} en rojo · ${indMap.amarillo ?? 0} en amarillo`}
              accent="bg-gradient-to-br from-blue-600 to-blue-500 text-white"
              icon={BarChart3}
              trend="neutral"
              onClick={() => setActiveModal("indicadores")}
            />
            <MetricCard
              label="Proyectos"
              value={totalProy}
              sub={`${proyMap.rojo ?? 0} atrasados`}
              accent="bg-gradient-to-br from-blue-600 to-blue-500 text-white"
              icon={Activity}
              trend={proyMap.rojo ? "down" : "up"}
              onClick={() => setActiveModal("proyectos")}
            />
            <MetricCard
              label="Alertas IA"
              value={data.run?.alertas_generadas ?? 0}
              sub="Generadas por Claude Haiku"
              accent="bg-gradient-to-br from-rose-600 to-rose-500 text-white"
              icon={AlertTriangle}
              trend="down"
              onClick={() => setActiveModal("alertas")}
            />
            <MetricCard
              label="Salud"
              value={`${healthScore}%`}
              sub={`${indMap.verde ?? 0} indicadores en verde`}
              accent={
                healthScore >= 70
                  ? "bg-gradient-to-br from-emerald-600 to-emerald-500 text-white"
                  : healthScore >= 50
                  ? "bg-gradient-to-br from-amber-500 to-amber-400 text-white"
                  : "bg-gradient-to-br from-red-600 to-red-500 text-white"
              }
              icon={CheckCircle2}
              trend={healthScore >= 70 ? "up" : "down"}
              onClick={() => setActiveModal("salud")}
            />
          </div>

          {/* ── Pipeline visual ──────────────────────────────────── */}
          <PipelineSteps />

          {/* ── Semáforos ────────────────────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2">
            <SemaforoBar title="Indicadores de gestión" rows={sem?.indicadores ?? []} icon={BarChart3} />
            <SemaforoBar title="Proyectos estratégicos" rows={sem?.proyectos ?? []} icon={Activity} />
          </div>

          {/* ── Fuentes de datos ─────────────────────────────────── */}
          <SourcesPanel data={sourcesData} />

          {/* ── Drill-down jerárquico ─────────────────────────────── */}
          <DrilldownSection />

          {/* ── Worst indicators + delayed projects ──────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <IndRojosTable rows={data.indRojos ?? []} />
            <ProyRetrasadosTable rows={data.proyRetra ?? []} />
          </div>

          {/* ── Alertas ejecutivas ────────────────────────────────── */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                  Alertas ejecutivas generadas por IA
                </h2>
                <p className="text-xs text-zinc-500">
                  Claude Haiku analiza cada desviación y genera insight + recomendaciones · Email enviado automáticamente
                </p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                <Brain className="h-3.5 w-3.5" />
                {data.topAlertas?.length ?? 0} alertas
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(data.topAlertas ?? []).map((a) => (
                <AlertCard key={a.id} a={a} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
