"use client";

import React, { useEffect, useState } from "react";
import {
  Activity, CheckCircle2, XCircle, Clock, RefreshCw,
  Database, ChevronDown, ChevronUp, Layers, AlertTriangle,
  Timer, Calendar,
} from "lucide-react";

type RunLog = {
  id: number;
  run_id: string;
  status: "running" | "completed" | "failed";
  total_indicadores: number;
  total_proyectos: number;
  alertas_generadas: number;
  fuentes_usadas: string | null;
  error_msg: string | null;
  created_at: string;
  finished_at: string | null;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Completado
    </span>
  );
  if (status === "failed") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
      <XCircle className="h-3 w-3" /> Fallido
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
      <Clock className="h-3 w-3 animate-spin" /> En proceso
    </span>
  );
}

function duration(start: string, end: string | null): string {
  if (!end) return "—";
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function FuentesBadges({ raw }: { raw: string | null }) {
  try {
    const arr = JSON.parse(raw || "[]") as string[];
    if (!arr.length) return <span className="text-xs text-zinc-400">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {arr.map((f, i) => {
          const [tipo] = f.split(":");
          const colors: Record<string, string> = {
            sqlite: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800",
            csv: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800",
            mock_api: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
          };
          return (
            <span key={i} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors[tipo] || "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
              {f.length > 30 ? f.slice(0, 30) + "…" : f}
            </span>
          );
        })}
      </div>
    );
  } catch { return <span className="text-xs text-zinc-400">—</span>; }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/audit");
      const data = await res.json() as { data: RunLog[] };
      setLogs(data.data || []);
    } catch { /* */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const completed = logs.filter(l => l.status === "completed").length;
  const failed    = logs.filter(l => l.status === "failed").length;
  const running   = logs.filter(l => l.status === "running").length;
  const totalAlerts = logs.reduce((a, l) => a + (l.alertas_generadas || 0), 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/50">
            <Activity className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">Auditoría del Pipeline</h1>
            <p className="text-xs text-zinc-400">Trazabilidad completa · run_id · Fuentes · Duración</p>
          </div>
        </div>
        <button type="button" onClick={load}
          className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-indigo-500" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-5 gap-3 px-6 pt-4 pb-0">
        {[
          { label: "Total runs",    value: logs.length,   icon: Database,    bar: "bg-indigo-500",  text: "text-indigo-600 dark:text-indigo-400" },
          { label: "Completados",   value: completed,     icon: CheckCircle2, bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
          { label: "Fallidos",      value: failed,        icon: XCircle,     bar: "bg-red-500",     text: "text-red-600 dark:text-red-400" },
          { label: "En proceso",    value: running,       icon: Clock,       bar: "bg-amber-500",   text: "text-amber-600 dark:text-amber-400" },
          { label: "Total alertas", value: totalAlerts,   icon: AlertTriangle, bar: "bg-rose-500",  text: "text-rose-600 dark:text-rose-400" },
        ].map(({ label, value, icon: Icon, bar, text }) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-zinc-400">{label}</p>
              <Icon className={`h-4 w-4 ${text}`} />
            </div>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 mb-2">{value}</p>
            <div className="h-1 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className={`h-1 rounded-full ${bar} transition-all`}
                style={{ width: logs.length ? `${Math.round((value / logs.length) * 100)}%` : "0%" }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabla + detalle ───────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 overflow-hidden px-6 py-4">

        {/* Tabla */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {/* Header tabla */}
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
            <Layers className="h-4 w-4 text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Ejecuciones del pipeline</p>
            <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-800">
              {logs.length} runs
            </span>
          </div>

          {/* Tabla scrollable */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                  {["", "run_id", "Estado", "Indicadores", "Proyectos", "Alertas IA", "Duración", "Fecha"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-16 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Cargando ejecuciones…
                  </td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-16 text-center">
                    <Database className="h-8 w-8 mx-auto mb-3 text-zinc-300" />
                    <p className="text-sm text-zinc-400">Sin ejecuciones registradas.</p>
                    <p className="text-xs text-zinc-300 mt-1">Ejecuta el pipeline desde el Dashboard primero.</p>
                  </td></tr>
                ) : logs.map(log => {
                  const isSelected = selected === log.run_id;
                  return (
                    <React.Fragment key={log.run_id}>
                      <tr
                        onClick={() => setSelected(isSelected ? null : log.run_id)}
                        className={`cursor-pointer border-b border-zinc-50 transition-all dark:border-zinc-800/50 ${
                          isSelected
                            ? "bg-indigo-50 dark:bg-indigo-950/30"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        }`}>
                        <td className="pl-4 pr-1 py-3.5">
                          {isSelected
                            ? <ChevronUp className="h-3.5 w-3.5 text-indigo-500" />
                            : <ChevronDown className="h-3.5 w-3.5 text-zinc-300" />}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs text-zinc-500">{log.run_id.slice(0, 8)}</span>
                          <span className="text-zinc-300">…</span>
                        </td>
                        <td className="px-4 py-3.5"><StatusBadge status={log.status} /></td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="font-bold text-zinc-800 dark:text-zinc-100">{log.total_indicadores}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="font-bold text-zinc-800 dark:text-zinc-100">{log.total_proyectos}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`font-bold ${log.alertas_generadas > 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-400"}`}>
                            {log.alertas_generadas}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="flex items-center gap-1 text-xs text-zinc-500">
                            <Timer className="h-3 w-3" />
                            {duration(log.created_at, log.finished_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="flex items-center gap-1 text-xs text-zinc-400">
                            <Calendar className="h-3 w-3" />
                            {new Date(log.created_at).toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </td>
                      </tr>

                      {/* Row expandida inline */}
                      {isSelected && (() => {
                        const log_ = logs.find(l => l.run_id === log.run_id)!;
                        return (
                          <tr className="bg-indigo-50/70 dark:bg-indigo-950/20">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-3 gap-4 text-xs">
                                <div>
                                  <p className="font-semibold text-zinc-500 mb-1.5 uppercase tracking-widest text-[10px]">Run ID completo</p>
                                  <p className="font-mono text-zinc-700 dark:text-zinc-300 break-all">{log_.run_id}</p>
                                </div>
                                <div>
                                  <p className="font-semibold text-zinc-500 mb-1.5 uppercase tracking-widest text-[10px]">Fuentes de datos</p>
                                  <FuentesBadges raw={log_.fuentes_usadas} />
                                </div>
                                <div>
                                  <p className="font-semibold text-zinc-500 mb-1.5 uppercase tracking-widest text-[10px]">Timestamps</p>
                                  <p className="text-zinc-600 dark:text-zinc-400">▶ {new Date(log_.created_at).toLocaleString("es-GT")}</p>
                                  <p className="text-zinc-600 dark:text-zinc-400">■ {log_.finished_at ? new Date(log_.finished_at).toLocaleString("es-GT") : "En curso…"}</p>
                                </div>
                                {log_.error_msg && (
                                  <div className="col-span-3">
                                    <p className="font-semibold text-red-500 mb-1.5 uppercase tracking-widest text-[10px]">Error</p>
                                    <pre className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400 whitespace-pre-wrap text-[11px] font-mono overflow-auto max-h-32">
                                      {log_.error_msg}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
