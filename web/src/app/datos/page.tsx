"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  FileText,
  FileJson,
  ChevronRight,
  ChevronDown,
  Upload,
  RefreshCw,
  Table,
  Loader2,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  Zap,
  MessageSquare,
  X,
} from "lucide-react";
import { ChatPanel } from "@/components/FloatingChat";

// ── Types ────────────────────────────────────────────────────────────────────

type FileEntry = {
  name: string;
  tipo: "sqlite" | "csv" | "excel" | "json" | "otro";
  size: number;
  modified: string;
  path: string;
};

type DataPayload = {
  data: {
    bases_datos: FileEntry[];
    documentos: FileEntry[];
    mock_api: FileEntry[];
  };
  runs: RunRow[];
};

type RunRow = {
  run_id: string;
  status: string;
  total_indicadores: number;
  total_proyectos: number;
  alertas_generadas: number;
  created_at: string;
};

type TableInfo = {
  columnas: string[];
  filas: number;
  muestra: Record<string, unknown>[];
};

type SqliteInfo = {
  tipo: "sqlite";
  run_id?: string;
  tablas: Record<string, TableInfo>;
};

type CsvInfo = {
  tipo: "csv";
  columnas: string[];
  filas: number;
  muestra: Record<string, unknown>[];
};

type FileInfo =
  | SqliteInfo
  | CsvInfo
  | { tipo: "json"; columnas?: string[]; filas?: number; muestra?: unknown[] }
  | { tipo: "excel"; mensaje: string; size: number };

// ── Tab system ────────────────────────────────────────────────────────────────

type Tab =
  | { id: "chat"; type: "chat"; label: string }
  | { id: string; type: "file"; label: string; entry: FileEntry; info: FileInfo | null; loading: boolean };

// ── Helpers ──────────────────────────────────────────────────────────────────

function FileIcon({ tipo, size = 4 }: { tipo: FileEntry["tipo"]; size?: number }) {
  const cls = `h-${size} w-${size} shrink-0`;
  if (tipo === "sqlite") return <Database className={`${cls} text-blue-500`} />;
  if (tipo === "json") return <FileJson className={`${cls} text-amber-500`} />;
  if (tipo === "excel" || tipo === "csv") return <Table className={`${cls} text-emerald-500`} />;
  return <FileText className={`${cls} text-zinc-400`} />;
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ── Upload Zone ───────────────────────────────────────────────────────────────

type UploadState = "idle" | "busy" | "ok" | "error";

function UploadZone({ onDone, compact = false }: { onDone: () => void; compact?: boolean }) {
  const [state, setState] = useState<UploadState>("idle");
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setState("busy"); setMsg("");
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setState("error"); setMsg(data.details || data.error || "Error"); return; }
      setState("ok");
      setMsg(`run_id: ${String(data.run_id ?? "").slice(0, 8)}… · alertas: ${data.alertas ?? "—"}`);
      onDone();
    } catch (e) { setState("error"); setMsg(String(e)); }
  }, [onDone]);

  if (compact) {
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(Array.from(e.dataTransfer.files)); }}
        className="rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 p-3 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {state === "busy" ? (
          <div className="flex items-center justify-center gap-2 text-xs text-indigo-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />Procesando…</div>
        ) : state === "ok" ? (
          <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{msg}</div>
        ) : state === "error" ? (
          <div className="flex items-center justify-center gap-1.5 text-xs text-red-500"><AlertCircle className="h-3.5 w-3.5" /><span className="truncate max-w-[160px]">{msg}</span></div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600">
            <Upload className="h-3.5 w-3.5" />Subir archivo
            <input type="file" multiple className="hidden" onChange={(e) => e.target.files && upload(Array.from(e.target.files))} />
          </label>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); upload(Array.from(e.dataTransfer.files)); }}
      onClick={() => state === "idle" && inputRef.current?.click()}
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
        state === "busy" ? "border-indigo-300 bg-indigo-50/50"
        : state === "ok" ? "border-emerald-300 bg-emerald-50"
        : state === "error" ? "border-red-300 bg-red-50"
        : "border-zinc-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-zinc-700 dark:bg-zinc-900"
      }`}
    >
      <input ref={inputRef} type="file" multiple className="hidden" accept=".db,.sqlite,.csv,.xlsx,.xls"
        onChange={(e) => e.target.files && upload(Array.from(e.target.files))} />
      {state === "busy" && <><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div><p className="font-semibold text-indigo-700">Ejecutando pipeline…</p></>}
      {state === "ok" && <><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100"><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div><p className="font-semibold text-emerald-700">¡Pipeline completado!</p><p className="text-sm text-emerald-600 font-mono">{msg}</p><button type="button" onClick={(e) => { e.stopPropagation(); setState("idle"); }} className="rounded-lg border border-emerald-300 px-4 py-1.5 text-sm text-emerald-700 hover:bg-emerald-100">Subir otro</button></>}
      {state === "error" && <><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100"><AlertCircle className="h-8 w-8 text-red-600" /></div><p className="font-semibold text-red-700">Error procesando</p><p className="max-w-sm text-sm text-red-500">{msg}</p><button type="button" onClick={(e) => { e.stopPropagation(); setState("idle"); }} className="rounded-lg border border-red-300 px-4 py-1.5 text-sm text-red-700 hover:bg-red-100">Intentar de nuevo</button></>}
      {state === "idle" && (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 transition-all group-hover:bg-indigo-100"><CloudUpload className="h-8 w-8 text-indigo-500 group-hover:text-indigo-600" /></div>
          <div><p className="text-base font-semibold text-zinc-800 dark:text-zinc-100">Arrastra tus archivos aquí</p><p className="mt-1 text-sm text-zinc-500">o <span className="font-medium text-indigo-600 group-hover:underline">haz clic para seleccionar</span></p></div>
          <div className="flex items-center gap-2">{[".db / .sqlite", ".csv", ".xlsx"].map((e) => <span key={e} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-mono text-zinc-500">{e}</span>)}</div>
          <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2 text-xs text-indigo-600"><Zap className="h-3.5 w-3.5 shrink-0" />El archivo se procesa automáticamente: ingesta → semáforos → RAG → alertas</div>
        </>
      )}
    </div>
  );
}

// ── Sidebar tree ──────────────────────────────────────────────────────────────

function TreeItem({ entry, active, onSelect }: { entry: FileEntry; active: boolean; onSelect: (e: FileEntry) => void }) {
  return (
    <button type="button" onClick={() => onSelect(entry)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        active ? "bg-indigo-600 text-white" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}>
      <FileIcon tipo={entry.tipo} />
      <span className="truncate flex-1">{entry.name}</span>
      <span className={`text-xs tabular-nums ${active ? "text-indigo-200" : "text-zinc-400"}`}>{fmt(entry.size)}</span>
    </button>
  );
}

function SideSection({ title, icon, items, activePath, onSelect }: {
  title: string; icon: React.ReactNode; items: FileEntry[];
  activePath?: string; onSelect: (e: FileEntry) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}<span>{title}</span>
        <span className="ml-auto text-[10px] font-normal text-zinc-400">{items.length}</span>
      </button>
      {open && (
        <div className="mt-0.5 pl-2 space-y-0.5">
          {items.length === 0
            ? <p className="px-2 py-1 text-xs text-zinc-400 italic">Sin archivos</p>
            : items.map((e) => <TreeItem key={e.path} entry={e} active={activePath === e.path} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

// ── Table Preview ─────────────────────────────────────────────────────────────

function TablePreview({ info, tableName }: { info: TableInfo; tableName: string }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Table className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">{tableName}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs tabular-nums text-zinc-500 dark:bg-zinc-800">{info.filas.toLocaleString()} filas</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs tabular-nums text-zinc-500 dark:bg-zinc-800">{info.columnas.length} cols</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>{info.columnas.map((c) => <th key={c} className="px-3 py-2.5 text-left font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap border-b border-zinc-200 dark:border-zinc-700">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
            {info.muestra.map((row, i) => (
              <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                {info.columnas.map((c) => <td key={c} className="max-w-[220px] truncate px-3 py-2 text-zinc-700 dark:text-zinc-300" title={String(row[c] ?? "")}>{String(row[c] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── File Detail ───────────────────────────────────────────────────────────────

function FileDetail({ entry, info }: { entry: FileEntry; info: FileInfo | null }) {
  const [activeTable, setActiveTable] = useState<string | null>(null);

  useEffect(() => {
    if (info?.tipo === "sqlite") {
      setActiveTable(Object.keys((info as SqliteInfo).tablas)[0] ?? null);
    }
  }, [info]);

  if (!info) return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>;

  if (info.tipo === "sqlite") {
    const sqlite = info as SqliteInfo;
    const tablas = Object.entries(sqlite.tablas);
    const current = activeTable ? sqlite.tablas[activeTable] : null;
    return (
      <div className="flex h-full flex-col gap-4">
        {sqlite.run_id && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400">
            <Database className="h-3.5 w-3.5 shrink-0" />run_id: <span className="font-mono">{sqlite.run_id}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 pb-3 dark:border-zinc-700">
          {tablas.map(([name, tbl]) => (
            <button key={name} type="button" onClick={() => setActiveTable(name)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeTable === name ? "bg-indigo-600 text-white shadow-sm" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}>
              {name}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${activeTable === name ? "bg-indigo-500 text-indigo-100" : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700"}`}>{tbl.filas}</span>
            </button>
          ))}
        </div>
        {current && activeTable && <TablePreview info={current} tableName={activeTable} />}
      </div>
    );
  }

  if (info.tipo === "csv" || info.tipo === "json") {
    const cols = (info as CsvInfo).columnas ?? [];
    const muestra = (info as CsvInfo).muestra ?? [];
    const filas = (info as CsvInfo).filas ?? 0;
    return <TablePreview info={{ columnas: cols, filas, muestra: muestra as Record<string, unknown>[] }} tableName={entry.name} />;
  }

  if (info.tipo === "excel") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Table className="h-10 w-10 text-emerald-400" />
        <p className="font-medium text-zinc-700 dark:text-zinc-300">Archivo Excel detectado</p>
        <p className="max-w-sm text-sm text-zinc-500">{(info as { tipo: "excel"; mensaje: string }).mensaje}</p>
      </div>
    );
  }
  return <p className="text-sm text-zinc-500">Vista previa no disponible.</p>;
}

// ── Run History ───────────────────────────────────────────────────────────────

function RunHistory({ runs }: { runs: RunRow[] }) {
  if (!runs.length) return null;
  return (
    <div className="mt-6 w-full max-w-2xl mx-auto">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Últimas ejecuciones del pipeline</h3>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>{["Run ID", "Estado", "Indicadores", "Proyectos", "Alertas", "Fecha"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium text-zinc-500">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {runs.map((r) => (
              <tr key={r.run_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <td className="px-3 py-2 font-mono text-zinc-600">{r.run_id.slice(0, 8)}…</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "completed" ? "bg-emerald-100 text-emerald-800" : r.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{r.status}</span>
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{r.total_indicadores ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{r.total_proyectos ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{r.alertas_generadas ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-500">{new Date(r.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DatosPage() {
  const [payload, setPayload] = useState<DataPayload | null>(null);
  const [sideView, setSideView] = useState<"explorar" | "subir">("explorar");
  const [tabs, setTabs] = useState<Tab[]>([{ id: "chat", type: "chat", label: "Chat IA" }]);
  const [activeTabId, setActiveTabId] = useState<string>("chat");

  const fetchData = useCallback(async () => {
    try { const res = await fetch("/api/data"); setPayload(await res.json()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Open file in new tab (or switch to existing) ──────────────────────────
  const openFile = useCallback(async (entry: FileEntry) => {
    const existing = tabs.find((t) => t.type === "file" && t.id === entry.path);
    if (existing) { setActiveTabId(existing.id); return; }

    const newTab: Tab = { id: entry.path, type: "file", label: entry.name, entry, info: null, loading: true };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(entry.path);

    try {
      const res = await fetch(`/api/data/info?file=${encodeURIComponent(entry.name)}`);
      const json = await res.json() as FileInfo;
      setTabs((prev) => prev.map((t) => t.id === entry.path && t.type === "file" ? { ...t, info: json, loading: false } : t));
    } catch {
      setTabs((prev) => prev.map((t) => t.id === entry.path && t.type === "file" ? { ...t, loading: false } : t));
    }
  }, [tabs]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = filtered[Math.max(0, idx - 1)];
        setActiveTabId(next?.id ?? "chat");
      }
      return filtered;
    });
  }, [activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const activeFilePaths = tabs.filter((t) => t.type === "file").map((t) => t.id);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Explorador de Datos</span>
          <button type="button" onClick={fetchData} title="Actualizar" className="rounded p-0.5 text-zinc-400 hover:text-zinc-700">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800">
          {(["explorar", "subir"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setSideView(t)}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${sideView === t ? "border-b-2 border-indigo-600 text-indigo-700 dark:text-indigo-400" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>
              {t === "explorar" ? <Database className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
              {t === "explorar" ? "Archivos" : "Subir"}
            </button>
          ))}
        </div>

        {sideView === "explorar" ? (
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            <SideSection title="Bases de datos" icon={<Database className="h-3 w-3" />}
              items={payload?.data.bases_datos ?? []} activePath={activeTab?.type === "file" ? activeTab.id : undefined} onSelect={openFile} />
            <SideSection title="Documentos" icon={<FileText className="h-3 w-3" />}
              items={payload?.data.documentos ?? []} activePath={activeTab?.type === "file" ? activeTab.id : undefined} onSelect={openFile} />
            <SideSection title="Mock API" icon={<FileJson className="h-3 w-3" />}
              items={payload?.data.mock_api ?? []} activePath={activeTab?.type === "file" ? activeTab.id : undefined} onSelect={openFile} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3">
            <UploadZone compact onDone={fetchData} />
          </div>
        )}
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-900">

        {/* ── Tab bar ── */}
        <div className="flex items-end gap-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 overflow-x-auto shrink-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div key={tab.id}
                className={`group relative flex items-center gap-1.5 border-r border-zinc-200 dark:border-zinc-800 px-3 py-2.5 cursor-pointer select-none transition-colors shrink-0 ${
                  isActive
                    ? "bg-zinc-50 dark:bg-zinc-900 border-b-2 border-b-indigo-600 text-zinc-900 dark:text-zinc-50"
                    : "bg-white dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.type === "chat"
                  ? <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-indigo-600" : "text-zinc-400"}`} />
                  : <FileIcon tipo={tab.entry.tipo} size={3} />}
                <span className="text-xs font-medium truncate max-w-[140px]">
                  {tab.label}
                </span>
                {tab.type === "file" && tab.loading && <Loader2 className="h-3 w-3 animate-spin text-zinc-400 shrink-0" />}
                {tab.type === "file" && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className="ml-0.5 rounded p-0.5 text-zinc-300 hover:bg-red-100 hover:text-red-500 dark:text-zinc-600 dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-hidden">
          {/* Chat tab — always mounted so session is preserved */}
          <div className={`h-full ${activeTab?.id === "chat" ? "block" : "hidden"}`}>
            <ChatPanel embedded />
          </div>

          {/* File tabs */}
          {tabs.filter((t): t is Extract<Tab, { type: "file" }> => t.type === "file").map((tab) => (
            <div key={tab.id} className={`h-full overflow-auto p-6 ${activeTab?.id === tab.id ? "block" : "hidden"}`}>
              {tab.loading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                    <p className="text-sm text-zinc-500">Cargando {tab.label}…</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
                      <FileIcon tipo={tab.entry.tipo} size={5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">{tab.entry.name}</h2>
                      <p className="text-xs text-zinc-500">{fmt(tab.entry.size)} · {new Date(tab.entry.modified).toLocaleString("es")}</p>
                    </div>
                    <button type="button" onClick={() => closeTab(tab.id)}
                      className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:border-red-200 hover:text-red-500 transition-colors">
                      <X className="h-3 w-3" />Cerrar
                    </button>
                  </div>
                  <FileDetail entry={tab.entry} info={tab.info} />
                  {!tab.info && <RunHistory runs={payload?.runs ?? []} />}
                </>
              )}
            </div>
          ))}

          {/* No file open + chat not active: shouldn't happen, but fallback */}
          {activeTab?.type !== "chat" && tabs.filter((t) => t.type === "file").length === 0 && (
            <div className="hidden" />
          )}
        </div>
      </main>
    </div>
  );
}
