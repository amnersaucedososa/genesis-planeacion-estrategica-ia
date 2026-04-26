"use client";

import React, { useEffect, useState } from "react";
import {
  BrainCircuit, RefreshCw, Zap, MessageSquare, Bot, User,
  BarChart3, Clock, ChevronDown, ChevronRight,
} from "lucide-react";

type ChatLog = {
  id: number;
  run_id: string | null;
  session_id: string;
  rol: "user" | "assistant";
  proveedor: string | null;
  modelo: string | null;
  contenido: string;
  tokens_usados: number;
  grafica_path: string | null;
  chunks_usados: string | null;
  created_at: string;
};

const PROVIDER_META: Record<string, { label: string; emoji: string; bg: string; text: string; bar: string }> = {
  claude:  { label: "Claude",  emoji: "🧠", bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-700 dark:text-blue-300",   bar: "bg-blue-400" },
  gemini:  { label: "Gemini",  emoji: "✨", bg: "bg-blue-100 dark:bg-blue-900/30",       text: "text-blue-700 dark:text-blue-300",       bar: "bg-blue-400"   },
  ollama:  { label: "Ollama",  emoji: "🦙", bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-400"},
  openai:  { label: "OpenAI",  emoji: "🤖", bg: "bg-rose-100 dark:bg-rose-900/30",       text: "text-rose-700 dark:text-rose-300",       bar: "bg-rose-400"   },
};

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" });
}

export default function AIAuditPage() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "user" | "assistant">("all");
  const [totalTokens, setTotalTokens] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-logs");
      const data = await res.json() as { data: ChatLog[]; total_tokens: number };
      setLogs(data.data || []);
      setTotalTokens(data.total_tokens || 0);
    } catch { /* */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? logs : logs.filter(l => l.rol === filter);
  const sessions  = [...new Set(logs.map(l => l.session_id))].length;
  const graficas  = logs.filter(l => l.grafica_path).length;
  const avgTokens = logs.filter(l => l.tokens_usados > 0).length
    ? Math.round(totalTokens / logs.filter(l => l.tokens_usados > 0).length)
    : 0;

  const porProveedor = logs
    .filter(l => l.rol === "assistant" && l.proveedor)
    .reduce<Record<string, number>>((acc, l) => {
      const p = l.proveedor!;
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">

      {/* ── Top bar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/50">
            <BrainCircuit className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">Auditoría IA</h1>
            <p className="text-xs text-zinc-400">Historial de consultas · Tokens consumidos · Sesiones · Modelos LLM</p>
          </div>
        </div>
        <button type="button" onClick={load}
          className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-blue-500" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="shrink-0 grid grid-cols-5 gap-3 px-6 pt-4">
        {[
          { label: "Mensajes totales",   value: logs.length,                                         icon: MessageSquare, color: "text-blue-500",  bar: "bg-blue-500"  },
          { label: "Preguntas usuario",  value: logs.filter(l => l.rol === "user").length,            icon: User,          color: "text-blue-500",  bar: "bg-blue-500"  },
          { label: "Respuestas IA",      value: logs.filter(l => l.rol === "assistant").length,       icon: Bot,           color: "text-blue-500",    bar: "bg-blue-500"    },
          { label: "Tokens consumidos",  value: totalTokens.toLocaleString(),                        icon: Zap,           color: "text-amber-500",   bar: "bg-amber-500"   },
          { label: "Gráficas generadas", value: graficas,                                            icon: BarChart3,     color: "text-emerald-500", bar: "bg-emerald-500" },
        ].map(({ label, value, icon: Icon, color, bar }) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-zinc-400">{label}</p>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 mb-2">{value}</p>
            <div className="h-1 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className={`h-1 rounded-full ${bar}`}
                style={{ width: logs.length ? `${Math.min(100, Math.round((Number(String(value).replace(/,/g, "")) / Math.max(logs.length, 1)) * 100))}%` : "0%" }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Contenido principal ── */}
      <div className="flex flex-1 gap-4 overflow-hidden px-6 py-4">

        {/* ── Tabla principal ── */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">

          {/* Toolbar */}
          <div className="flex shrink-0 items-center gap-3 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <BrainCircuit className="h-4 w-4 text-zinc-400" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Consultas al agente IA
            </p>
            <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {filtered.length}
            </span>
            <div className="ml-auto flex gap-1.5">
              {([
                { id: "all",       label: "Todos",         count: logs.length },
                { id: "user",      label: "Preguntas",     count: logs.filter(l => l.rol === "user").length },
                { id: "assistant", label: "Respuestas IA", count: logs.filter(l => l.rol === "assistant").length },
              ] as const).map(f => (
                <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    filter === f.id
                      ? "bg-blue-600 text-white"
                      : "border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}>
                  {f.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${filter === f.id ? "bg-white/20" : "bg-zinc-200 dark:bg-zinc-700"}`}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Tabla con scroll */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-8">
                <BrainCircuit className="h-10 w-10 text-zinc-200 dark:text-zinc-700" />
                <p className="text-sm font-medium text-zinc-400">Sin consultas registradas</p>
                <p className="text-xs text-zinc-300 dark:text-zinc-600">Abre el chat y haz una pregunta al agente IA</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                {/* Sticky header */}
                <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/80 backdrop-blur">
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="w-8 px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400" />
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Tipo</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Pregunta / Respuesta</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Motor IA</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Modelo</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Tokens</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Sesión</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {filtered.map(log => {
                    const isOpen  = expanded === log.id;
                    const isUser  = log.rol === "user";
                    const meta    = log.proveedor
                      ? (PROVIDER_META[log.proveedor] ?? { label: log.proveedor, emoji: "🤖", bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400", bar: "bg-zinc-400" })
                      : null;

                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          onClick={() => setExpanded(isOpen ? null : log.id)}
                          className={`cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${isOpen ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                        >
                          {/* Expand chevron */}
                          <td className="pl-4 pr-1 py-3 text-zinc-300 dark:text-zinc-600">
                            {isOpen
                              ? <ChevronDown className="h-3.5 w-3.5 text-blue-400" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                          </td>

                          {/* Tipo */}
                          <td className="px-4 py-3">
                            <div className={`flex items-center gap-1.5 ${isUser ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-blue-100 dark:bg-blue-900/50" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                                {isUser
                                  ? <User className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                  : <Bot  className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />}
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
                                {isUser ? "Usuario" : "Agente IA"}
                              </span>
                            </div>
                          </td>

                          {/* Contenido */}
                          <td className="px-4 py-3 max-w-xs xl:max-w-sm 2xl:max-w-md">
                            <p className="line-clamp-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                              {log.contenido}
                            </p>
                            {log.grafica_path && (
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400">
                                <BarChart3 className="h-2.5 w-2.5" /> Gráfica
                              </span>
                            )}
                          </td>

                          {/* Motor IA */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {meta ? (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.bg} ${meta.text}`}>
                                {meta.emoji} {meta.label}
                              </span>
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600">—</span>
                            )}
                          </td>

                          {/* Modelo */}
                          <td className="px-4 py-3">
                            {log.modelo ? (
                              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                {log.modelo}
                              </span>
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600">—</span>
                            )}
                          </td>

                          {/* Tokens */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {log.tokens_usados > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400">
                                <Zap className="h-2.5 w-2.5" />
                                {log.tokens_usados.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600">—</span>
                            )}
                          </td>

                          {/* Sesión */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                              #{log.session_id.slice(0, 8)}
                            </span>
                          </td>

                          {/* Hora */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                              <Clock className="h-3 w-3 shrink-0" />
                              {fmt(log.created_at)}
                            </span>
                          </td>
                        </tr>

                        {/* Fila expandida */}
                        {isOpen && (
                          <tr className="bg-blue-50/30 dark:bg-blue-950/10">
                            <td colSpan={8} className="px-12 pb-4 pt-2">
                              <div className="rounded-xl border border-blue-100 bg-white p-4 dark:border-blue-900/30 dark:bg-zinc-900">
                                <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                                  {log.contenido}
                                </p>
                                {log.grafica_path && (
                                  <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={log.grafica_path} alt="Gráfica generada" className="max-h-64 w-full object-contain bg-white" />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Panel derecho: resumen ── */}
        <div className="flex w-60 shrink-0 flex-col gap-3">

          {/* Resumen estadístico */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Resumen</p>
            <div className="space-y-3">
              {[
                { label: "Sesiones únicas",     value: sessions,              color: "text-blue-600" },
                { label: "Tokens promedio/msg",  value: avgTokens.toLocaleString(), color: "text-amber-600" },
                { label: "Con gráfica",          value: graficas,              color: "text-emerald-600" },
                { label: "Tasa respuesta IA",
                  value: logs.filter(l => l.rol === "assistant").length
                    ? `${Math.round(logs.filter(l => l.rol === "assistant").length / Math.max(logs.filter(l => l.rol === "user").length, 1) * 100)}%`
                    : "—",
                  color: "text-blue-600" },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">{r.label}</span>
                  <span className={`text-xs font-bold ${r.color}`}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* Motores usados */}
            {Object.keys(porProveedor).length > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Motores usados</p>
                <div className="space-y-2">
                  {Object.entries(porProveedor).sort((a, b) => b[1] - a[1]).map(([p, count]) => {
                    const meta = PROVIDER_META[p] ?? { label: p, emoji: "🤖", bg: "bg-zinc-100", text: "text-zinc-600", bar: "bg-zinc-400" };
                    const total = logs.filter(l => l.rol === "assistant").length;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={p}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-zinc-500">{meta.emoji} {meta.label}</span>
                          <span className={`text-[10px] font-bold ${meta.text}`}>{count} · {pct}%</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div className={`h-1 rounded-full ${meta.bar} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sesiones recientes */}
          <div className="flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Sesiones recientes</p>
            </div>
            <div className="overflow-y-auto p-3 space-y-1.5" style={{ maxHeight: "calc(100% - 44px)" }}>
              {[...new Set(logs.map(l => l.session_id))].slice(0, 15).map(sid => {
                const msgs   = logs.filter(l => l.session_id === sid);
                const tokens = msgs.reduce((a, m) => a + (m.tokens_usados || 0), 0);
                const last   = msgs[0];
                return (
                  <div key={sid}
                    className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <p className="font-mono text-[10px] text-zinc-400">#{sid.slice(0, 8)}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-zinc-500">{msgs.length} msgs</span>
                      {tokens > 0 && <span className="text-[10px] text-amber-500 font-semibold">{tokens.toLocaleString()} tok</span>}
                    </div>
                    {last && (
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {new Date(last.created_at).toLocaleDateString("es-GT")}
                      </p>
                    )}
                  </div>
                );
              })}
              {sessions === 0 && (
                <p className="text-center text-xs text-zinc-300 dark:text-zinc-600 py-4">Sin sesiones aún</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
