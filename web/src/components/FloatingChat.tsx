"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { DynChartData } from "@/app/api/chat/stream/route";
import {
  MessageSquare, X, Send, Loader2, Bot, Maximize2, Minimize2,
  BarChart3, Volume2, Image, FileText, Table, FileType2,
  Mail, Smartphone, Presentation, Trash2, ChevronDown,
  Zap, CheckCircle2, AlertCircle, Database, Square,
  ChevronRight, Copy, Check, AtSign, FileJson, Grid3x3,
  BrainCircuit, Search, Download, ZoomIn,
} from "lucide-react";

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Strip <think>...</think> reasoning blocks from streamed text */
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^\s+/, "");
}

/**
 * Limpia el texto antes de enviarlo a TTS:
 * - Elimina código, markdown, emojis y rellenos de intro
 * - Resultado directo y conciso para que el audio vaya al grano
 */
function cleanTextForTTS(raw: string): string {
  let t = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")   // bloques <think>
    .replace(/```[\s\S]*?```/g, "")               // bloques de código
    .replace(/`[^`]+`/g, "")                      // código inline
    .replace(/^#{1,6}\s+/gm, "")                  // encabezados markdown
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")   // negrita / cursiva
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, "$1")      // cursiva _
    .replace(/^[\s]*[-•*]\s+/gm, "")              // viñetas
    .replace(/^\d+\.\s+/gm, "")                   // listas numeradas
    .replace(/^\s*---+\s*$/gm, "")                // líneas horizontales
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")      // links markdown → solo texto
    .replace(/\|/g, " ")                           // pipes de tablas
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Eliminar frases de relleno al inicio ("Claro, aquí está…", "Por supuesto…", etc.)
  t = t.replace(
    /^(Claro[,!.]?\s*|Por supuesto[,!.]?\s*|Aquí (está|te presento|tienes|les presento)[,!.]?\s*|Con gusto[,!.]?\s*|Entendido[,!.]?\s*|A continuación[,!.]?\s*|Te presento[,!.]?\s*|Cómo no[,!.]?\s*)/i,
    ""
  );

  return t.slice(0, 900); // máx 900 chars — conciso para el demo
}

// ── Chat persistence (localStorage) ──────────────────────────────────────────

const CHAT_STORAGE_KEY = "assessment_chat_v2";

function saveChatHistory(msgs: Msg[], sid: string | null) {
  try {
    // Blob URLs de audio no sobreviven reload → quitamos el media para esos mensajes
    const serializable = msgs.slice(-80).map(m =>
      m.media?.type === "audio" ? { ...m, media: undefined } : m
    );
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ msgs: serializable, sid }));
  } catch { /* storage lleno o unavailable */ }
}

function loadChatHistory(): { msgs: Msg[]; sid: string | null } {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return { msgs: [], sid: null };
    return JSON.parse(raw) as { msgs: Msg[]; sid: string | null };
  } catch {
    return { msgs: [], sid: null };
  }
}

/**
 * Genera sugerencias de seguimiento dinámicas basadas en lo que respondió la IA
 * y en el modo activo (chat normal vs agente).
 */
function buildFollowUpSuggestions(aiText: string, userText: string, agentMode: boolean): string[] {
  const t = (aiText + " " + userText).toLowerCase();
  const pool: string[] = [];

  // Contexto: indicadores / semáforos
  if (/rojo|crítico|desviaci/.test(t))
    pool.push("¿Cuál indicador tiene mayor desviación?", "Genera gráfica de semáforos");
  if (/indicad|kpi|meta|realizado/.test(t))
    pool.push("Muéstrame la tendencia histórica", "¿Cuántos indicadores están en verde?");
  if (/tendencia|históric|período|periodo/.test(t))
    pool.push("Compara con el período anterior", "Crea un audio con este análisis");
  if (/semáfor|semafor|verde|amarillo/.test(t))
    pool.push("¿Qué indicadores mejoraron este mes?", "Genera infografía del resumen");

  // Contexto: proyectos
  if (/proyecto|avance|retraso|planif/.test(t))
    pool.push("¿Qué proyectos necesitan atención inmediata?", "Genera gráfica de proyectos");
  if (/retraso|atras|delayed/.test(t))
    pool.push("¿Quién es el responsable de los proyectos atrasados?");
  if (/avance|progreso/.test(t))
    pool.push("Compara avance real vs planificado de todos");

  // Contexto: alertas / notificaciones
  if (/alerta|notif|crítico/.test(t))
    pool.push("Envía estas alertas por WhatsApp", "Envía reporte por email");
  if (/whatsapp|email|correo/.test(t))
    pool.push("¿Qué canales de notificación están activos?");

  // Contexto: audio / imagen / presentación
  if (/audio|voz|narrac/.test(t))
    pool.push("Genera una infografía de este análisis");
  if (/imagen|infogr|visual/.test(t))
    pool.push("Crea una presentación con estos datos");
  if (/presentac|diapositiv/.test(t))
    pool.push("Crea un audio ejecutivo de esto");

  // Siempre ofrecer algunas acciones de seguimiento relevantes
  const agentExtras = [
    "Envía el resumen completo por WhatsApp",
    "Genera un reporte ejecutivo en PDF",
    "Crea un audio del análisis",
  ];
  const chatExtras = [
    "Dame más detalles sobre esto",
    "¿Qué acción recomiendas tomar?",
    "Muéstrame los datos completos",
  ];
  pool.push(...(agentMode ? agentExtras : chatExtras));

  // Deduplicar y retornar máximo 5
  return [...new Set(pool)].slice(0, 5);
}

/** Descarga un archivo desde una URL (imagen o audio) */
async function downloadMedia(url: string, filename: string) {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    // Si es cross-origin o data URL, abrir en nueva pestaña
    window.open(url, "_blank");
  }
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

type LightboxState = { url: string; name: string };

function Lightbox({ item, onClose }: { item: LightboxState; onClose: () => void }) {
  // Cerrar con ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Panel — no cierra al hacer clic en la imagen */}
      <div
        className="relative flex max-h-[92vh] max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
          <span className="truncate text-xs font-medium text-zinc-300 max-w-[300px]">{item.name}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void downloadMedia(item.url, item.name)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 active:scale-95 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Imagen */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.name}
          className="max-h-[80vh] max-w-[88vw] object-contain"
          style={{ background: "radial-gradient(circle, #1e293b 0%, #0f172a 100%)" }}
        />
      </div>
    </div>
  );
}

/** Detect if the user's message is requesting a media artifact */
function detectMediaIntent(text: string): "audio" | "image" | "presentation" | null {
  const t = text.toLowerCase();
  if (/(crea|genera|haz|hacer|necesito|dame|quiero).*(audio|voz|narraci|narrar|escuchar|podcast)|(audio|voz|narrac).*(del?|sobre|acerca|de |trend|indicad|proyecto)/.test(t)) return "audio";
  if (/(crea|genera|haz|hacer|dame|quiero|necesito).*(infogr|imagen|foto|visual|grafico|ilustrac)|(infogr|imagen|visual|ilustrac)/.test(t)) return "image";
  if (/(crea|genera|haz|hacer|dame|quiero).*(presentac|diapositiv|slide|deck)|(presentac).*(del?|sobre|acerca)/.test(t)) return "presentation";
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ToolStep = {
  name:   string;
  desc:   string;
  status: "running" | "done" | "error";
  sql?:   string;
  rows?:  unknown[];
  cols?:  string[];
  chartPath?: string;
  error?: string;
  // Gamma presentation progress
  gammaElapsed?: number;
  gammaTotal?:   number;
};

type Msg = {
  id:       string;
  rol:      "user" | "assistant";
  text:     string;
  done:     boolean;
  steps:    ToolStep[];
  charts:    string[];
  gammaUrl?: string;
  infographicUrl?: string;   // generada por create_infographic (gpt-image-2)
  dynCharts?: DynChartData[];
  provider?: string;
  model?:    string;
  tokens?:   number;
  isAgent?:  boolean;
  media?:    { type: "audio"; url: string } | { type: "image"; url: string } | { type: "link"; url: string; label: string } | { type: "download"; url: string; filename: string; label: string };
};

type DataFileItem = {
  name:     string;
  tipo:     "sqlite" | "csv" | "excel" | "json" | "otro";
  category: "Base de datos" | "Documentos" | "Mock API";
  size?:    number;
};

type AttachedFile = DataFileItem & {
  loading?:  boolean;
  columnas?: string[];
  filas?:    number;
  muestra?:  unknown[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  claude:            { label: "🧠 Claude",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "anthropic-sonnet":{ label: "🧠 Claude",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  ollama:            { label: "🦙 Ollama",  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  "ollama-local":    { label: "🦙 Ollama",  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  gemini:            { label: "✨ Gemini",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  openai:            { label: "🤖 OpenAI",  color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
};

const TOOL_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  query_database:         { icon: Database,     label: "Consultando base de datos", color: "text-blue-500" },
  generate_chart:         { icon: BarChart3,    label: "Generando gráfica",         color: "text-emerald-500" },
  generate_dynamic_chart: { icon: BarChart3,    label: "Generando gráfica",         color: "text-emerald-500" },
  send_whatsapp:          { icon: Smartphone,   label: "Enviando WhatsApp",         color: "text-green-500" },
  send_email:             { icon: Mail,         label: "Enviando correo",           color: "text-amber-500" },
  create_presentation:    { icon: Presentation, label: "Presentación Gamma.app",   color: "text-blue-600" },
  create_infographic:     { icon: Image,        label: "Generando infografía",      color: "text-rose-500" },
};

// Sugerencias iniciales (chat vacío) — se muestran solo cuando no hay mensajes
const STARTER_CHAT = [
  "¿Qué indicadores están en rojo en el último período?",
  "¿Cuáles proyectos tienen mayor retraso en avance?",
  "Dame un resumen ejecutivo del portafolio estratégico",
  "¿Cuántos indicadores hay en verde, amarillo y rojo?",
  "¿Qué alertas ejecutivas se generaron en el último análisis?",
  "Muéstrame los indicadores del área Digital",
  "¿Cuál es el estado de Onboarding Digital 2.0?",
];

const STARTER_AGENT = [
  "Hazme una gráfica de barras: avance real vs planificado de proyectos",
  "Grafica la tendencia histórica del indicador I001 en 2025",
  "Muéstrame la distribución de semáforos en una dona",
  "Hazme una presentación del estado del portafolio estratégico 2025",
  "Hazme una presentación sobre los proyectos de Onboarding Digital y la desviación en I002",
  "Genera una alerta ejecutiva para los indicadores en rojo",
  "Envía el reporte de indicadores críticos por correo",
  "Crea un audio con el resumen ejecutivo del período actual",
];

// Frases de ayuda para pedir presentaciones (mostradas al usuario como tip)
const PRESENTATION_TIPS = [
  "Hazme una presentación de…",
  "Crea una presentación sobre…",
  "Genera slides de…",
  "Dame en una presentación…",
  "Pon esto en una presentación",
];

// ── File icon ─────────────────────────────────────────────────────────────────

function FileTypeIcon({ tipo, cls = "h-3.5 w-3.5" }: { tipo: DataFileItem["tipo"]; cls?: string }) {
  if (tipo === "sqlite") return <Database className={`${cls} text-blue-500`} />;
  if (tipo === "json")   return <FileJson className={`${cls} text-amber-500`} />;
  if (tipo === "csv" || tipo === "excel") return <Table className={`${cls} text-emerald-500`} />;
  return <FileText className={`${cls} text-zinc-400`} />;
}

// ── Mini components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="rounded p-1 text-zinc-400 hover:text-zinc-600 transition-colors">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ── Dynamic chart renderer ────────────────────────────────────────────────────
const DEFAULT_COLORS = ["#3b82f6","#f97316","#22c55e","#ef4444","#eab308","#8b5cf6","#06b6d4","#ec4899"];

function DynamicChart({ cfg }: { cfg: DynChartData }) {
  const colors = cfg.series.map((s, i) => s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
  const pieColors = (cfg.pieData ?? []).map((p, i) => p.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]);

  const sharedProps = { width: "100%" as const, height: 260 };
  const tickStyle   = { fontSize: 10, fill: "#6b7280" };
  const tooltipStyle: React.CSSProperties = { background: "#1f2937", border: "none", borderRadius: 8, fontSize: 12, color: "#f9fafb" };

  // Truncate long X labels
  const truncate = (val: unknown) => {
    const s = String(val ?? "");
    return s.length > 14 ? s.slice(0, 13) + "…" : s;
  };

  if (cfg.type === "pie" || cfg.type === "donut") {
    const data = cfg.pieData ?? [];
    return (
      <div className="w-full">
        <ResponsiveContainer {...sharedProps}>
          <PieChart>
            <Pie
              data={data} cx="50%" cy="50%"
              innerRadius={cfg.type === "donut" ? 55 : 0}
              outerRadius={95}
              dataKey="value" nameKey="name"
              label={({ name, percent }) => `${String(name).slice(0,10)} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const allData = cfg.series[0]?.data ?? [];
  const seriesNames = cfg.series.map(s => s.name);

  // Merge all series into one data array keyed by xKey
  const mergedData: Record<string, unknown>[] = allData.map((row, i) => {
    const merged: Record<string, unknown> = { [cfg.xKey ?? "x"]: row[cfg.xKey ?? "x"] };
    cfg.series.forEach(s => { merged[s.name] = s.data[i]?.[s.name] ?? null; });
    return merged;
  });

  const xKey = cfg.xKey ?? "x";

  if (cfg.type === "bar") {
    return (
      <ResponsiveContainer {...sharedProps}>
        <BarChart data={mergedData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />
          <XAxis dataKey={xKey} tick={{ ...tickStyle, angle: -30, textAnchor: "end" }} tickFormatter={truncate} interval={0} />
          <YAxis tick={tickStyle} width={40} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {seriesNames.map((name, i) => (
            <Bar key={name} dataKey={name} fill={colors[i % colors.length]} radius={[3,3,0,0]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (cfg.type === "area") {
    return (
      <ResponsiveContainer {...sharedProps}>
        <AreaChart data={mergedData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />
          <XAxis dataKey={xKey} tick={tickStyle} tickFormatter={truncate} />
          <YAxis tick={tickStyle} width={40} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {seriesNames.map((name, i) => (
            <Area key={name} type="monotone" dataKey={name} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.15} strokeWidth={2} dot={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Default: line
  return (
    <ResponsiveContainer {...sharedProps}>
      <LineChart data={mergedData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} />
        <XAxis dataKey={xKey} tick={tickStyle} tickFormatter={truncate} />
        <YAxis tick={tickStyle} width={40} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {seriesNames.map((name, i) => (
          <Line key={name} type="monotone" dataKey={name} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function SQLBlock({ sql }: { sql: string }) {
  return (
    <div className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-700">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
        <span className="text-[10px] font-mono text-zinc-500">SQL</span>
        <CopyButton text={sql} />
      </div>
      <pre className="px-3 py-2 text-[11px] font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">{sql}</pre>
    </div>
  );
}

function DataTable({ rows, cols }: { rows: unknown[]; cols: string[] }) {
  if (!rows.length) return <p className="text-xs text-zinc-400 mt-1">Sin resultados</p>;
  const data = rows as Record<string, unknown>[];
  return (
    <div className="mt-1.5 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
      <table className="w-full">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-800">
            {cols.map(c => <th key={c} className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 15).map((row, i) => (
            <tr key={i} className={`border-t border-zinc-100 dark:border-zinc-800 ${i % 2 === 0 ? "" : "bg-zinc-50/50 dark:bg-zinc-800/30"}`}>
              {cols.map(c => {
                const val = row[c];
                const isColor = c.toLowerCase() === "color";
                return (
                  <td key={c} className="px-3 py-1.5 whitespace-nowrap">
                    {isColor ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${val === "rojo" ? "bg-red-100 text-red-700" : val === "amarillo" ? "bg-amber-100 text-amber-700" : val === "verde" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${val === "rojo" ? "bg-red-500" : val === "amarillo" ? "bg-amber-500" : val === "verde" ? "bg-emerald-500" : "bg-zinc-400"}`} />
                        {String(val ?? "—")}
                      </span>
                    ) : (
                      <span className={typeof val === "number" ? "font-mono text-zinc-700 dark:text-zinc-300" : "text-zinc-600 dark:text-zinc-400"}>
                        {val !== null && val !== undefined ? String(val) : "—"}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 15 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-400">
          Mostrando 15 de {data.length} filas
        </div>
      )}
    </div>
  );
}

// ── Gamma embedded presentation viewer ───────────────────────────────────────
function GammaEmbed({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false);

  // Gamma embed: https://gamma.app/docs/{id} → https://gamma.app/embed/{id}
  const embedUrl = url.replace("gamma.app/docs/", "gamma.app/embed/");

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 flex items-center gap-2">
        <span className="text-base leading-none">🎯</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-white leading-tight">¡Presentación lista en Gamma.app!</p>
          <p className="text-[9px] text-blue-200 leading-tight truncate">{url}</p>
        </div>
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5 border-b border-blue-100 dark:border-blue-900/50">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-[11px] font-semibold text-white shadow transition-colors"
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {expanded ? "Ocultar" : "Ver aquí"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-700 px-3 py-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          Abrir en pestaña <ChevronRight className="h-3 w-3" />
        </a>
      </div>

      {/* Iframe */}
      {expanded && (
        <div className="relative bg-zinc-900" style={{ height: "520px" }}>
          <iframe
            src={embedUrl}
            title="Presentación Gamma"
            className="w-full h-full border-0"
            allow="fullscreen"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}

function GammaProgressCard({ step }: { step: ToolStep }) {
  const elapsed = step.gammaElapsed ?? 0;
  const total   = step.gammaTotal   ?? 120;
  const pct     = Math.min(98, Math.round((elapsed / total) * 100));
  const remaining = Math.max(0, total - elapsed);

  if (step.status === "error") {
    return (
      <div className="mt-1.5 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          <span className="text-xs font-medium text-red-700 dark:text-red-400">Error al generar la presentación</span>
        </div>
        {step.error && <p className="mt-1 text-[10px] text-red-500 dark:text-red-400">{step.error}</p>}
      </div>
    );
  }

  if (step.status === "done") {
    return (
      <div className="mt-1.5 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Presentación generada — abre el enlace abajo</span>
        </div>
      </div>
    );
  }

  // status === "running" — mostrar preloader animado con barra de progreso
  return (
    <div className="mt-1.5 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/60 dark:border-blue-800/50 dark:from-blue-950/40 dark:to-blue-900/20 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-sm text-base">
          🎯
          {/* Ping animado */}
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-blue-800 dark:text-blue-200 leading-tight">
            Generando presentación en Gamma.app…
          </p>
          <p className="text-[10px] text-blue-600/80 dark:text-blue-400 leading-tight mt-0.5">
            {elapsed > 0
              ? `${elapsed}s transcurridos · ~${remaining}s restantes`
              : "Iniciando generación…"}
          </p>
        </div>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-[1200ms] ease-out"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-blue-500 dark:text-blue-400">
            La presentación se abrirá automáticamente al finalizar
          </p>
          <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">{pct}%</span>
        </div>
      </div>

      {/* Pasos del proceso */}
      <div className="flex items-center gap-3 pt-0.5">
        {[
          { label: "Analizando contenido", done: elapsed >= 5  },
          { label: "Creando slides",        done: elapsed >= 25 },
          { label: "Finalizando diseño",    done: elapsed >= 55 },
        ].map(({ label, done }) => (
          <div key={label} className="flex items-center gap-1">
            {done
              ? <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
              : <span className="h-2.5 w-2.5 rounded-full border border-blue-300 dark:border-blue-700" />}
            <span className={`text-[9px] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-blue-400 dark:text-blue-500"}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolCard({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[step.name] ?? { icon: Database, label: step.name, color: "text-zinc-500" };
  const Icon = meta.icon;

  // Card especial para presentación Gamma
  if (step.name === "create_presentation") {
    return <GammaProgressCard step={step} />;
  }

  return (
    <div className={`mt-1.5 rounded-xl border text-xs overflow-hidden transition-all ${step.status === "done" ? "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50" : step.status === "error" ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20" : "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20"}`}>
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {step.status === "running" ? <Loader2 className={`h-3.5 w-3.5 shrink-0 animate-spin ${meta.color}`} /> : step.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
        <Icon className={`h-3 w-3 shrink-0 ${meta.color}`} />
        <span className="font-medium text-zinc-700 dark:text-zinc-300 flex-1">{meta.label}</span>
        <span className="text-zinc-400 truncate max-w-[140px]">{step.desc}</span>
        {(step.rows || step.chartPath || step.error) && <ChevronRight className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />}
        {step.rows && <span className="ml-1 rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">{step.rows.length} filas</span>}
      </button>
      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 pb-3 pt-2">
          {step.sql && <SQLBlock sql={step.sql} />}
          {step.error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{step.error}</p>}
          {step.rows && step.cols && <DataTable rows={step.rows} cols={step.cols} />}
          {step.chartPath && (
            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.chartPath} alt="Gráfica" className="max-h-56 w-full object-contain bg-white" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Agent Mode Modal ──────────────────────────────────────────────────────────

const AGENT_FEATURES = [
  { icon: Database,      color: "text-blue-500 bg-blue-50",  title: "Consulta SQL directa",     desc: "Lee la base de datos en tiempo real para responder con datos exactos." },
  { icon: BrainCircuit,  color: "text-blue-500 bg-blue-50",  title: "Razonamiento encadenado",  desc: "Analiza, planifica y ejecuta múltiples pasos para resolver preguntas complejas." },
  { icon: BarChart3,     color: "text-emerald-500 bg-emerald-50", title: "Genera gráficas",          desc: "Crea visualizaciones automáticas de indicadores y proyectos." },
  { icon: Smartphone,    color: "text-green-500 bg-green-50",    title: "Envía WhatsApp",           desc: "Manda alertas y resúmenes al número configurado." },
  { icon: Mail,          color: "text-amber-500 bg-amber-50",    title: "Envía Email",              desc: "Despacha el reporte ejecutivo por correo al destinatario configurado." },
  { icon: Search,        color: "text-rose-500 bg-rose-50",      title: "Acciones autónomas",       desc: "Ejecuta acciones sin pedir confirmación. Úsalo solo cuando confíes en el resultado." },
];

function AgentModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Modo Agente Autónomo</p>
              <p className="text-[11px] text-white/70">El agente actúa por su cuenta — sin confirmar cada paso</p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-zinc-500 uppercase tracking-widest">¿Qué puede hacer?</p>
          <div className="space-y-2.5">
            {AGENT_FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${f.color}`}>
                  <f.icon className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{f.title}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 dark:border-amber-800/40 dark:bg-amber-950/20">
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              ⚠️ El agente puede enviar mensajes y generar archivos automáticamente.
              Puedes cancelar cualquier respuesta con el botón <strong>■ Detener</strong>.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-zinc-100 dark:border-zinc-800 px-5 py-3.5">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition-all">
            Activar Modo Agente
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mention picker ─────────────────────────────────────────────────────────────

function MentionPicker({ files, query, onSelect, onClose }: {
  files: DataFileItem[]; query: string; onSelect: (f: DataFileItem) => void; onClose: () => void;
}) {
  const filtered = query
    ? files.filter(f => f.name.toLowerCase().includes(query) || f.category.toLowerCase().includes(query))
    : files;

  const grouped = filtered.reduce<Record<string, DataFileItem[]>>((acc, f) => {
    (acc[f.category] = acc[f.category] ?? []).push(f); return acc;
  }, {});

  if (!filtered.length) return null;

  return (
    <div className="mb-2 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        <div className="flex items-center gap-1.5">
          <AtSign className="h-3 w-3 text-blue-500" />
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Adjuntar archivo</span>
          {query && <span className="text-[10px] text-blue-500 font-mono">{query}</span>}
        </div>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-50/60 dark:bg-zinc-800/30">{cat}</p>
            {items.map(f => (
              <button key={f.name} type="button" onClick={() => onSelect(f)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors group">
                <FileTypeIcon tipo={f.tipo} />
                <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">{f.name}</span>
                <span className="text-[9px] text-zinc-400 uppercase">{f.tipo}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Attachment card ────────────────────────────────────────────────────────────

function AttachCard({ att, onRemove }: { att: AttachedFile; onRemove: (name: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 group">
      <FileTypeIcon tipo={att.tipo} cls="h-3 w-3 shrink-0" />
      <span className="font-medium truncate max-w-[110px]">{att.name}</span>
      {att.loading
        ? <Loader2 className="h-3 w-3 animate-spin text-blue-400 shrink-0" />
        : att.filas
          ? <span className="text-blue-400 tabular-nums text-[9px]">{att.filas.toLocaleString()}f</span>
          : null}
      <button type="button" onClick={() => onRemove(att.name)}
        className="ml-0.5 text-blue-300 hover:text-red-500 dark:text-blue-600 dark:hover:text-red-400 transition-colors">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

export function ChatPanel({ onClose, expanded, onToggleExpand, embedded = false }: {
  onClose?: () => void; expanded?: boolean; onToggleExpand?: () => void;
  embedded?: boolean;
}) {
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [input,        setInput]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [messages,     setMessages]     = useState<Msg[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [provider,     setProvider]     = useState<string>("claude");
  const [agentMode,    setAgentMode]    = useState(false);
  const [mediaLoading, setMediaLoading] = useState<string | null>(null);
  const [showActions,    setShowActions]    = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [lightbox,       setLightbox]       = useState<LightboxState | null>(null);

  // @ mention + attachments
  const [dataFiles,    setDataFiles]    = useState<DataFileItem[]>([]);
  const [attachments,  setAttachments]  = useState<AttachedFile[]>([]);
  const [showMention,  setShowMention]  = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  const bottomRef       = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const abortRef        = useRef<AbortController | null>(null);
  const pendingMediaRef = useRef<"audio" | "image" | "presentation" | null>(null);
  const accTextRef      = useRef<string>("");   // accumulates streamed text for auto-media
  const userMsgRef      = useRef<string>("");   // stores current user message for image prompt

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Cargar historial desde localStorage (solo en el cliente, una vez) ──────
  useEffect(() => {
    const { msgs, sid } = loadChatHistory();
    if (msgs.length > 0) setMessages(msgs);
    if (sid) setSessionId(sid);
    setHistoryLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guardar historial cada vez que cambia (solo después del load inicial) ──
  useEffect(() => {
    if (!historyLoaded) return;
    saveChatHistory(messages, sessionId);
  }, [messages, sessionId, historyLoaded]);

  // Load provider from settings
  useEffect(() => {
    fetch("/api/settings").then(r => r.json())
      .then((d: { chat_provider?: string }) => { if (d.chat_provider) setProvider(d.chat_provider); })
      .catch(() => {});
  }, []);

  // Load file list for @ mentions
  useEffect(() => {
    fetch("/api/data").then(r => r.json())
      .then((d: { data?: { bases_datos?: Array<{name: string; tipo: string; size?: number}>; documentos?: Array<{name: string; tipo: string; size?: number}>; mock_api?: Array<{name: string; tipo: string; size?: number}> } }) => {
        const all: DataFileItem[] = [
          ...(d.data?.bases_datos ?? []).map(f => ({ name: f.name, tipo: f.tipo as DataFileItem["tipo"], category: "Base de datos" as const, size: f.size })),
          ...(d.data?.documentos  ?? []).map(f => ({ name: f.name, tipo: f.tipo as DataFileItem["tipo"], category: "Documentos"   as const, size: f.size })),
          ...(d.data?.mock_api    ?? []).map(f => ({ name: f.name, tipo: f.tipo as DataFileItem["tipo"], category: "Mock API"     as const, size: f.size })),
        ];
        setDataFiles(all);
      })
      .catch(() => {});
  }, []);

  const addMsg = useCallback((msg: Msg) => setMessages(m => [...m, msg]), []);
  const addSystemMsg = useCallback((text: string, media?: Msg["media"]) => {
    addMsg({ id: uuidv4(), rol: "assistant", text, done: true, steps: [], charts: [], media });
  }, [addMsg]);

  // ── @ mention handlers ──────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setShowMention(true);
    } else {
      setShowMention(false);
      setMentionQuery("");
    }
  };

  const triggerAt = () => {
    setInput(prev => prev + "@");
    setShowMention(true);
    setMentionQuery("");
    textareaRef.current?.focus();
  };

  const attachFile = async (file: DataFileItem) => {
    setShowMention(false);
    setMentionQuery("");
    // Remove @query from input
    setInput(prev => prev.replace(/@\w*$/, "").trimEnd());
    if (attachments.some(a => a.name === file.name)) return;

    const placeholder: AttachedFile = { ...file, loading: true };
    setAttachments(prev => [...prev, placeholder]);

    try {
      const res = await fetch(`/api/data/info?file=${encodeURIComponent(file.name)}`);
      const info = await res.json() as Record<string, unknown>;
      setAttachments(prev => prev.map(a => a.name === file.name ? {
        ...a,
        loading: false,
        columnas: (info.columnas as string[] | undefined) ?? [],
        filas:    (info.filas   as number  | undefined),
        muestra:  (info.muestra as unknown[] | undefined),
      } : a));
    } catch {
      setAttachments(prev => prev.filter(a => a.name !== file.name));
    }
    textareaRef.current?.focus();
  };

  const removeAttachment = (name: string) => setAttachments(prev => prev.filter(a => a.name !== name));

  // ── Streaming send ──────────────────────────────────────────────────────────
  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    // Detect media intent to auto-trigger after AI responds
    pendingMediaRef.current = detectMediaIntent(text);
    userMsgRef.current = text;
    accTextRef.current = "";
    setInput("");
    setShowMention(false);
    setAttachments([]);   // limpiar tarjetas de archivo al enviar
    setLoading(true);

    addMsg({ id: uuidv4(), rol: "user", text, done: true, steps: [], charts: [] });

    const historial = messages.slice(-10).map(x => ({ role: x.rol === "user" ? "user" : "assistant", content: x.text }));
    const msgId = uuidv4();
    addMsg({ id: msgId, rol: "assistant", text: "", done: false, steps: [], charts: [], gammaUrl: undefined, isAgent: agentMode });

    const updateMsg = (updater: (m: Msg) => Msg) => setMessages(msgs => msgs.map(m => m.id === msgId ? updater(m) : m));

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregunta: text,
          session_id: sessionId,
          historial,
          agent_mode: agentMode,
          attachments: attachments.map(a => ({
            name: a.name, tipo: a.tipo, category: a.category,
            columnas: a.columnas, filas: a.filas, muestra: a.muestra?.slice(0, 15),
          })),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) { updateMsg(m => ({ ...m, text: "❌ Error al conectar con el agente.", done: true })); return; }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as {
              t: string; d?: string; n?: string; desc?: string; sql?: string;
              rows?: unknown[]; cols?: string[]; ok?: boolean; error?: string;
              chartPath?: string; gammaUrl?: string; imageUrl?: string;
              chartData?: DynChartData;
              elapsed?: number; total?: number;
              tokens?: number; provider?: string; model?: string; session_id?: string;
            };
            if (ev.t === "text") {
              const chunk = ev.d ?? "";
              accTextRef.current += chunk;
              updateMsg(m => ({ ...m, text: m.text + chunk }));
            }
            if (ev.t === "tool_start") updateMsg(m => ({ ...m, steps: [...m.steps, { name: ev.n!, desc: ev.desc!, status: "running", sql: ev.sql }] }));
            if (ev.t === "chart_data" && ev.chartData) {
              updateMsg(m => ({ ...m, dynCharts: [...(m.dynCharts ?? []), ev.chartData!] }));
            }
            if (ev.t === "gamma_progress") {
              updateMsg(m => ({
                ...m,
                steps: m.steps.map(s =>
                  s.name === "create_presentation" && s.status === "running"
                    ? { ...s, gammaElapsed: ev.elapsed ?? 0, gammaTotal: ev.total ?? 120 }
                    : s
                ),
              }));
            }
            if (ev.t === "tool_done") updateMsg(m => ({
              ...m,
              steps: m.steps.map(s => s.name === ev.n && s.status === "running" ? { ...s, status: ev.ok ? "done" : "error", rows: ev.rows, cols: ev.cols, chartPath: ev.chartPath, gammaUrl: ev.gammaUrl, error: ev.error } : s),
              charts:         ev.chartPath  ? [...m.charts, ev.chartPath] : m.charts,
              gammaUrl:       ev.gammaUrl  ? ev.gammaUrl  : m.gammaUrl,
              infographicUrl: ev.imageUrl  ? ev.imageUrl  : m.infographicUrl,
            }));
            if (ev.t === "done") {
              if (ev.session_id) setSessionId(ev.session_id);
              updateMsg(m => ({ ...m, done: true, provider: ev.provider, model: ev.model, tokens: ev.tokens }));
              // Auto-trigger media if user requested it
              const intent = pendingMediaRef.current;
              if (intent) {
                pendingMediaRef.current = null;
                const capturedText = accTextRef.current;
                const capturedUserMsg = userMsgRef.current;
                setTimeout(() => {
                  if (intent === "audio") {
                    // handleAudio uses lastAssistantText from state — trigger via event
                    void (async () => {
                      try {
                        const ttsText = cleanTextForTTS(capturedText);
                        const res = await fetch("/api/media/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: ttsText, session_id: sessionId }) });
                        const json = await res.json() as { ok?: boolean; audio?: string; mime?: string; error?: string };
                        if (!json.ok || !json.audio) { addSystemMsg(`❌ Error TTS: ${json.error}`); return; }
                        const bin = atob(json.audio); const bytes = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                        const url = URL.createObjectURL(new Blob([bytes], { type: json.mime ?? "audio/mpeg" }));
                        addSystemMsg("🎙️ Audio de tu consulta listo:", { type: "audio", url });
                      } catch (e) { addSystemMsg(`❌ Error TTS: ${e}`); }
                    })();
                  }
                  // infografía y presentación se manejan server-side via create_infographic / create_presentation
                }, 600);
              }
            }
          } catch { /* ignore */ }
        }
      }
      updateMsg(m => ({ ...m, done: true }));
    } catch (e) {
      if ((e as Error).name !== "AbortError") updateMsg(m => ({ ...m, text: m.text || `❌ Error: ${String(e)}`, done: true }));
    } finally {
      setLoading(false);
    }
  }

  // ── Media handlers ──────────────────────────────────────────────────────────
  const lastAssistantText = messages.filter(m => m.rol === "assistant").slice(-1)[0]?.text || "";

  const handleAudio = useCallback(async () => {
    if (!lastAssistantText) return;
    setMediaLoading("audio");
    try {
      const ttsText = cleanTextForTTS(lastAssistantText);
      const res  = await fetch("/api/media/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: ttsText, session_id: sessionId }) });
      const json = await res.json() as { ok?: boolean; audio?: string; mime?: string; error?: string };
      if (!json.ok || !json.audio) { addSystemMsg(`❌ Error TTS: ${json.error}`); return; }
      const bin = atob(json.audio); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: json.mime ?? "audio/mpeg" }));
      addSystemMsg("🎙️ Audio generado", { type: "audio", url });
    } catch (e) { addSystemMsg(`Error TTS: ${e}`); }
    finally { setMediaLoading(null); }
  }, [lastAssistantText, addSystemMsg]);

  const handleImage = useCallback(async (customPrompt?: string) => {
    // Build prompt from: custom → user message context → last AI response → default
    const basePrompt = customPrompt
      || (userMsgRef.current ? `Infografía ejecutiva profesional de: ${userMsgRef.current}` : null)
      || (lastAssistantText ? `Infografía ejecutiva de: ${lastAssistantText.slice(0, 300)}` : null)
      || "Infografía ejecutiva de KPIs estratégicos de planeación";
    setMediaLoading("image");
    addSystemMsg(`🎨 Generando imagen: "${basePrompt.slice(0, 60)}…"`);
    try {
      const res  = await fetch("/api/media/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: basePrompt, session_id: sessionId }) });
      const data = await res.json() as { ok?: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) { addSystemMsg(`❌ ${data.error}`); return; }
      addSystemMsg("🖼️ Imagen generada:", { type: "image", url: data.url });
    } catch (e) { addSystemMsg(`Error: ${e}`); }
    finally { setMediaLoading(null); }
  }, [addSystemMsg, lastAssistantText]);

  const handleGamma = useCallback(async () => {
    setMediaLoading("gamma");
    try {
      const res  = await fetch("/api/gamma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema: "Assessment Planeación Estratégica" }) });
      const data = await res.json() as { ok?: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) { addSystemMsg(`❌ Error Gamma: ${data.error}`); return; }
      addSystemMsg("🎯 Presentación lista", { type: "link", url: data.url, label: "Abrir en Gamma.app" });
    } catch (e) { addSystemMsg(`Error: ${e}`); }
    finally { setMediaLoading(null); }
  }, [addSystemMsg]);

  const handleWA = useCallback(async () => {
    setMediaLoading("wa");
    try {
      const res  = await fetch("/api/settings/test-wa", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      addSystemMsg(data.ok ? "✅ WhatsApp enviado." : `❌ Error WA: ${data.error}`);
    } catch (e) { addSystemMsg(`Error: ${e}`); }
    finally { setMediaLoading(null); }
  }, [addSystemMsg]);

  const clearChat = () => {
    setMessages([]);
    setSessionId(null);
    setAttachments([]);
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
  };

  const ACTIONS = [
    { id: "chart", icon: BarChart3,    label: "Gráfica",   color: "text-blue-500",  fn: () => { setInput("Genera una gráfica de semáforos"); textareaRef.current?.focus(); } },
    { id: "audio", icon: Volume2,      label: "Audio",     color: "text-blue-500",  fn: handleAudio },
    { id: "image", icon: Image,        label: "Imagen",    color: "text-rose-500",    fn: () => void handleImage() },
    { id: "pdf",   icon: FileText,     label: "PDF",       color: "text-red-500",     fn: () => window.open("/api/report/pdf",   "_blank") },
    { id: "excel", icon: Table,        label: "Excel",     color: "text-emerald-600", fn: () => window.open("/api/report/excel", "_blank") },
    { id: "word",  icon: FileType2,    label: "Word",      color: "text-blue-600",    fn: () => window.open("/api/report/word",  "_blank") },
    { id: "wa",    icon: Smartphone,   label: "WhatsApp",  color: "text-emerald-500", fn: handleWA },
    { id: "email", icon: Mail,         label: "Email",     color: "text-amber-500",   fn: () => { setInput("Envía el resumen por email"); textareaRef.current?.focus(); } },
    { id: "gamma", icon: Presentation, label: "Presentación", color: "text-blue-500",  fn: () => { setInput("Hazme una presentación del estado del portafolio estratégico 2025"); textareaRef.current?.focus(); } },
  ];

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <>
    {/* ── Lightbox global ── */}
    {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}

    {showAgentModal && (
      <AgentModal
        onConfirm={() => { setAgentMode(true); setShowAgentModal(false); }}
        onCancel={() => setShowAgentModal(false)}
      />
    )}
    <div className={`flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-900 ${embedded ? "" : "rounded-2xl shadow-2xl ring-1 ring-zinc-200/80 dark:ring-zinc-700"}`}>

      {/* ── Header ── */}
      <div className={`flex items-center gap-2 px-3 py-2 shrink-0 transition-all ${agentMode ? "bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500" : "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600"}`}>
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 shrink-0 ring-1 ring-white/20">
          {agentMode ? <Zap className="h-3.5 w-3.5 text-white" /> : <Bot className="h-3.5 w-3.5 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white leading-none">{agentMode ? "Modo Agente" : "Agente IA"}</p>
          <p className="text-[9px] text-white/60 mt-0.5 leading-none">{agentMode ? "Autónomo · Multi-herramienta" : "Streaming · SQL directo · RAG"}</p>
        </div>
        {!embedded && onToggleExpand && (
          <button type="button" onClick={onToggleExpand} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        )}
        {!embedded && onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-4 text-center">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${agentMode ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-blue-500 to-blue-600"}`}>
              {agentMode ? <Zap className="h-6 w-6 text-white" /> : <Bot className="h-6 w-6 text-white" />}
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{agentMode ? "Agente Autónomo IA" : "Asistente de Datos IA"}</p>
              <p className="text-xs text-zinc-400 mt-0.5 max-w-[240px]">{agentMode ? "Ejecuto acciones automáticamente con acceso real a tu base de datos" : "Consulta tu BD en tiempo real. Usa @ para adjuntar un archivo específico"}</p>
            </div>
            <div className="w-full space-y-1 max-w-xs">
              {(agentMode ? STARTER_AGENT : STARTER_CHAT).map(q => (
                <button key={q} type="button" onClick={() => void send(q)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition-all ${agentMode ? "border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400" : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, msgIdx) => {
          // Chips dinámicos: calcular fuera del JSX para evitar IIFE en render
          const isLastDone = msg.rol === "assistant" && msg.done && !loading
            && msgIdx === messages.length - 1 && !!msg.text;
          const prevUser = isLastDone
            ? [...messages].slice(0, msgIdx).reverse().find(m => m.rol === "user")
            : undefined;
          const followUps = isLastDone
            ? buildFollowUpSuggestions(msg.text, prevUser?.text ?? "", agentMode)
            : [];

          return (
          // Wrapper columna: burbuja arriba, chips abajo
          <div key={msg.id} className="flex flex-col">
            {/* ── Fila: avatar + burbuja ── */}
            <div className={`flex gap-2 ${msg.rol === "user" ? "justify-end" : "justify-start"}`}>
            {msg.rol === "assistant" && (
              <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${msg.isAgent ? "bg-amber-100 dark:bg-amber-900/50" : "bg-blue-100 dark:bg-blue-900/50"}`}>
                {msg.isAgent ? <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> : <Bot className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
              </div>
            )}
            <div className={`max-w-[88%] ${msg.rol === "user" ? "rounded-2xl rounded-tr-sm bg-blue-600 px-3.5 py-2.5 text-white" : "min-w-[60%]"}`}>
              {msg.rol === "user" ? (
                <p className="text-sm leading-relaxed">{msg.text}</p>
              ) : (
                <div className={`rounded-2xl rounded-tl-sm px-3.5 py-2.5 ${msg.isAgent ? "bg-amber-50 ring-1 ring-amber-100 dark:bg-amber-950/20 dark:ring-amber-900/40" : "bg-zinc-50 ring-1 ring-zinc-100 dark:bg-zinc-800 dark:ring-zinc-700/50"}`}>
                  {(() => {
                    // Cuando hay una presentación en progreso/lista, ocultar las tarjetas
                    // de query_database intermedias para no saturar el UI.
                    // En su lugar mostramos un mini badge de "datos preparados".
                    const hasPresentation = msg.steps.some(s => s.name === "create_presentation");
                    const dbSteps = msg.steps.filter(s => s.name === "query_database");
                    const otherSteps = msg.steps.filter(s => s.name !== "query_database");

                    if (hasPresentation && dbSteps.length > 0) {
                      const allDbDone = dbSteps.every(s => s.status === "done");
                      return (
                        <>
                          {/* Badge compacto de preparación de datos */}
                          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100/70 dark:bg-zinc-800/60 px-2.5 py-1.5">
                            <Database className="h-3 w-3 shrink-0 text-blue-500" />
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                              {allDbDone
                                ? `${dbSteps.length} consultas ejecutadas — datos listos`
                                : `Consultando base de datos…`}
                            </span>
                            {allDbDone
                              ? <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-auto" />
                              : <Loader2 className="h-3 w-3 animate-spin text-blue-400 ml-auto" />}
                          </div>
                          {otherSteps.map((step, i) => <ToolCard key={i} step={step} />)}
                        </>
                      );
                    }
                    return msg.steps.map((step, i) => <ToolCard key={i} step={step} />);
                  })()}
                  {msg.text && (
                    <div className="mt-1.5 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Párrafo
                          p: ({ children }) => <p className="leading-relaxed text-sm text-zinc-700 dark:text-zinc-300">{children}</p>,
                          // Negrita
                          strong: ({ children }) => <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>,
                          // Listas
                          ul: ({ children }) => <ul className="ml-4 space-y-0.5 list-disc text-sm text-zinc-700 dark:text-zinc-300">{children}</ul>,
                          ol: ({ children }) => <ol className="ml-4 space-y-0.5 list-decimal text-sm text-zinc-700 dark:text-zinc-300">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          // Títulos
                          h1: ({ children }) => <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50 mt-3 mb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 mt-2.5 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-200 mt-2 mb-0.5 uppercase tracking-wide">{children}</h3>,
                          // Código inline
                          code: ({ children, className }) => {
                            const isBlock = className?.includes("language-");
                            if (isBlock) return (
                              <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-700 overflow-hidden">
                                <pre className="px-3 py-2.5 text-[11px] font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">{children}</pre>
                              </div>
                            );
                            return <code className="rounded px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono text-blue-600 dark:text-blue-400">{children}</code>;
                          },
                          pre: ({ children }) => <>{children}</>,
                          // Blockquote
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-2 border-blue-300 dark:border-blue-700 pl-3 text-zinc-500 dark:text-zinc-400 italic text-sm">{children}</blockquote>
                          ),
                          // HR
                          hr: () => <hr className="border-zinc-200 dark:border-zinc-700" />,
                          // ── TABLA ─────────────────────────────────────────
                          table: ({ children }) => (
                            <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
                              <table className="min-w-full text-xs">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-zinc-50 dark:bg-zinc-800">{children}</thead>
                          ),
                          tbody: ({ children }) => (
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">{children}</tbody>
                          ),
                          tr: ({ children }) => (
                            <tr className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors">{children}</tr>
                          ),
                          th: ({ children }) => (
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 whitespace-nowrap border-b border-zinc-200 dark:border-zinc-700">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => {
                            const text = String(children ?? "");
                            // Color badges for semafor values
                            const lower = text.toLowerCase();
                            if (lower === "rojo" || lower === "🔴")
                              return <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Rojo</span></td>;
                            if (lower === "amarillo" || lower === "🟡")
                              return <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Amarillo</span></td>;
                            if (lower === "verde" || lower === "🟢")
                              return <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Verde</span></td>;
                            // Negative % in red, positive in green
                            if (text.includes("%")) {
                              const num = parseFloat(text);
                              if (!isNaN(num)) {
                                const color = num < 0 ? "text-red-600 dark:text-red-400" : num > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500";
                                return <td className={`px-3 py-2 whitespace-nowrap font-mono font-bold ${color}`}>{text}</td>;
                              }
                            }
                            return <td className="px-3 py-2 whitespace-nowrap text-zinc-700 dark:text-zinc-300 max-w-[200px] truncate" title={text}>{children}</td>;
                          },
                        }}
                      >
                        {stripThink(msg.text)}
                      </ReactMarkdown>
                    </div>
                  )}
                  {!msg.done && <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-blue-500 ml-0.5 align-middle" />}

                  {/* ── Dynamic charts (recharts) ── */}
                  {(msg.dynCharts ?? []).map((cfg, i) => (
                    <div key={i} className="mt-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 overflow-hidden">
                      <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 mb-2 text-center">{cfg.title}</p>
                      {cfg.subtitle && <p className="text-[10px] text-zinc-400 text-center mb-2">{cfg.subtitle}</p>}
                      <DynamicChart cfg={cfg} />
                    </div>
                  ))}

                  {msg.charts.map((cp, i) => (
                    <div key={i} className="group mt-2 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 relative cursor-zoom-in"
                      onClick={() => setLightbox({ url: cp, name: `grafica-${i + 1}.png` })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cp} alt="Gráfica" className="max-h-56 w-full object-contain bg-white transition-opacity group-hover:opacity-90" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="rounded-full bg-black/50 p-2"><ZoomIn className="h-5 w-5 text-white" /></div>
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); void downloadMedia(cp, `grafica-${i + 1}.png`); }}
                        className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
                        <Download className="h-3 w-3" /> Descargar
                      </button>
                    </div>
                  ))}
                  {/* ── Infografía gpt-image-2 ── */}
                  {msg.infographicUrl && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      {/* Header */}
                      <div className="flex items-center justify-between bg-zinc-800 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded bg-rose-500/20 text-xs">🖼️</div>
                          <span className="text-[11px] font-semibold text-zinc-200">Infografía generada con gpt-image-2</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void downloadMedia(msg.infographicUrl!, "infografia-genesis.png")}
                          className="flex items-center gap-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 px-2 py-1 text-[10px] font-medium text-zinc-300 transition-colors"
                        >
                          <Download className="h-3 w-3" /> Descargar
                        </button>
                      </div>
                      {/* Image — click to lightbox */}
                      <div
                        className="group relative cursor-zoom-in bg-zinc-950"
                        onClick={() => setLightbox({ url: msg.infographicUrl!, name: "infografia-genesis.png" })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.infographicUrl}
                          alt="Infografía ejecutiva"
                          className="w-full object-contain max-h-80 transition-opacity group-hover:opacity-90"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="rounded-full bg-black/60 p-2.5">
                            <ZoomIn className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Gamma presentation embed ── */}
                  {msg.gammaUrl && (
                    <GammaEmbed url={msg.gammaUrl} />
                  )}

                  {msg.media?.type === "audio" && (
                    <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-zinc-400">🎙️ Audio</p>
                        <button
                          type="button"
                          onClick={() => void downloadMedia(msg.media!.url, "audio-respuesta.mp3")}
                          className="flex items-center gap-1 rounded-lg bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/40 dark:hover:text-blue-300 transition-colors"
                        >
                          <Download className="h-3 w-3" /> Descargar
                        </button>
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls className="w-full h-8" src={msg.media.url} />
                    </div>
                  )}
                  {msg.media?.type === "image" && (
                    <div
                      className="group mt-2 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 relative cursor-zoom-in"
                      onClick={() => setLightbox({ url: (msg.media as { type: "image"; url: string }).url, name: "infografia.png" })}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.media.url}
                        alt="Infografía"
                        className="max-h-64 w-full object-contain bg-white transition-opacity group-hover:opacity-90"
                      />
                      {/* Zoom overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="rounded-full bg-black/50 p-2"><ZoomIn className="h-5 w-5 text-white" /></div>
                      </div>
                      {/* Download button */}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); void downloadMedia((msg.media as { type: "image"; url: string }).url, "infografia.png"); }}
                        className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                      >
                        <Download className="h-3 w-3" /> Descargar
                      </button>
                    </div>
                  )}
                  {msg.media?.type === "link" && (
                    <a href={msg.media.url} target="_blank" rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                      <Presentation className="h-3.5 w-3.5" />{msg.media.label}
                    </a>
                  )}
                  {msg.done && (msg.provider || msg.tokens) && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap border-t border-zinc-100/80 dark:border-zinc-700/50 pt-1.5">
                      {msg.provider && (() => {
                        const meta = PROVIDER_META[msg.provider] ?? { label: msg.provider, color: "bg-zinc-100 text-zinc-500" };
                        return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${meta.color}`}>{meta.label}</span>;
                      })()}
                      {msg.model && <span className="font-mono text-[9px] text-zinc-400 truncate max-w-[130px]">{msg.model}</span>}
                      {msg.tokens ? <span className="text-[9px] text-zinc-400">{msg.tokens.toLocaleString()} tok</span> : null}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>{/* /fila avatar+burbuja */}

            {/* ── Chips de seguimiento — debajo de la burbuja ── */}
            {followUps.length > 0 && (
              <div className="mt-2 pl-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Continúa preguntando
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {followUps.map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => void send(chip)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all hover:scale-[1.02] active:scale-95 shadow-sm ${
                        agentMode
                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-400 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                          : "border-zinc-200 bg-white text-zinc-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-blue-950/30 dark:hover:border-blue-700 dark:hover:text-blue-400"
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>/* /wrapper columna */
          );
        })}

        {loading && messages[messages.length - 1]?.rol !== "assistant" && (
          <div className="flex gap-2 justify-start">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-zinc-50 ring-1 ring-zinc-100 px-4 py-3 dark:bg-zinc-800 dark:ring-zinc-700/50">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Composer ── */}
      <div className="shrink-0 border-t border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-950 px-3 pb-3 pt-2">

        {/* @ Mention picker */}
        {showMention && (
          <MentionPicker
            files={dataFiles}
            query={mentionQuery}
            onSelect={(f) => void attachFile(f)}
            onClose={() => setShowMention(false)}
          />
        )}

        {/* Attachment cards */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map(att => <AttachCard key={att.name} att={att} onRemove={removeAttachment} />)}
          </div>
        )}

        {/* Composer card */}
        <div className={`rounded-2xl border transition-all focus-within:shadow-sm ${
          agentMode
            ? "border-amber-200 dark:border-amber-800/60 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100 dark:focus-within:ring-amber-900/30"
            : "border-zinc-200 dark:border-zinc-700 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/30"
        } bg-white dark:bg-zinc-900`}>

          {/* Actions panel (slides in when showActions) */}
          {showActions && (
            <div className="border-b border-zinc-100 dark:border-zinc-800 px-2 pt-2 pb-1.5 space-y-1.5">
              <div className="grid grid-cols-5 gap-1">
                {ACTIONS.map(({ id, icon: Icon, label, color, fn }) => (
                  <button key={id} type="button"
                    disabled={mediaLoading === id}
                    onClick={() => { fn(); setShowActions(false); }}
                    className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors disabled:opacity-40">
                    {mediaLoading === id
                      ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                      : <Icon className={`h-4 w-4 ${color}`} />}
                    <span className="text-[9px] font-medium">{label}</span>
                  </button>
                ))}
              </div>
              {/* Tip: cómo pedir presentaciones */}
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 px-2.5 py-1.5">
                <p className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 mb-1">💡 Para generar presentaciones escribe:</p>
                <div className="flex flex-wrap gap-1">
                  {PRESENTATION_TIPS.map(tip => (
                    <button key={tip} type="button"
                      onClick={() => { setInput(tip + " "); setShowActions(false); textareaRef.current?.focus(); }}
                      className="rounded-full border border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-900 px-2 py-0.5 text-[9px] text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors">
                      {tip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } if (e.key === "Escape") setShowMention(false); }}
            placeholder={agentMode ? "Dime qué hacer… usa @ para adjuntar datos" : "Consulta tu base de datos con IA… usa @ para adjuntar un archivo"}
            rows={2}
            className="w-full resize-none rounded-t-2xl bg-transparent px-4 pt-3 pb-2 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none"
            style={{ maxHeight: "120px", overflowY: "auto" }}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center gap-0.5 px-2 pb-2 border-t border-zinc-100 dark:border-zinc-800 pt-1.5">

            {/* Limpiar chat */}
            <button type="button" onClick={clearChat} title="Limpiar conversación"
              className="flex items-center justify-center rounded-lg p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>

            {/* @ attach */}
            <button type="button" onClick={triggerAt} title="Adjuntar archivo (@)"
              className={`flex items-center justify-center rounded-lg p-1.5 transition-colors ${showMention ? "text-blue-600 bg-blue-50 dark:bg-blue-950/30" : "text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"}`}>
              <AtSign className="h-4 w-4" />
            </button>

            {/* Robot — Agent mode toggle */}
            <button type="button"
              onClick={() => agentMode ? setAgentMode(false) : setShowAgentModal(true)}
              title={agentMode ? "Modo Agente ACTIVO — click para desactivar" : "Activar Modo Agente"}
              className={`flex items-center gap-1 rounded-lg p-1.5 transition-all ${
                agentMode
                  ? "text-amber-500 bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800"
                  : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}>
              <Bot className="h-4 w-4" />
              {agentMode && <span className="text-[10px] font-bold leading-none">ON</span>}
            </button>

            {/* Acciones toggle */}
            <button type="button" onClick={() => setShowActions(v => !v)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showActions
                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:hover:border-zinc-600 dark:hover:text-zinc-300"
              }`}>
              <Grid3x3 className="h-3 w-3" />
              <span>Acciones</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${showActions ? "rotate-180" : ""}`} />
            </button>

            <div className="flex-1" />

            {/* Stop / Send */}
            {loading ? (
              <button type="button" onClick={() => { abortRef.current?.abort(); setLoading(false); }}
                className="ml-1 flex h-8 items-center gap-1.5 rounded-xl bg-red-500 px-3 text-xs font-bold text-white shadow-sm shadow-red-500/20 hover:bg-red-600 active:scale-95 transition-all">
                <Square className="h-3 w-3 fill-white" />
                Detener
              </button>
            ) : (
              <button type="button" onClick={() => void send()} disabled={!input.trim()}
                className={`ml-1 flex h-8 w-8 items-center justify-center rounded-xl text-white transition-all disabled:opacity-40 active:scale-95 ${
                  agentMode
                    ? "bg-gradient-to-br from-amber-500 to-orange-500 shadow-sm shadow-amber-500/20"
                    : "bg-gradient-to-br from-blue-600 to-blue-600 shadow-sm shadow-blue-500/20"
                } hover:opacity-90`}>
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-zinc-400">La IA puede cometer errores. Revisa las respuestas.</p>
      </div>
    </div>
    </>
  );
}

// ── Floating wrapper ──────────────────────────────────────────────────────────

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function FloatingChat() {
  const [open,     setOpen]     = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { if (!open) setExpanded(false); }, [open]);

  const width  = expanded ? "640px" : "380px";
  const height = expanded ? "720px" : "560px";

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-5 z-50 transition-all duration-300" style={{ width, height }}>
          <ChatPanel onClose={() => setOpen(false)} expanded={expanded} onToggleExpand={() => setExpanded(v => !v)} />
        </div>
      )}
      <button type="button" onClick={() => setOpen(v => !v)}
        className="fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-600 text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-105 hover:shadow-xl active:scale-95"
        style={{ width: "52px", height: "52px" }}
        title="Abrir chat IA">
        {open ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
      </button>
    </>
  );
}
