/**
 * POST /api/chat/stream
 *
 * Multi-provider streaming chat con tool use:
 *   · Claude   → Anthropic SDK con tool use nativo (ReAct loop)
 *   · Ollama   → Pre-fetch de datos + plain chat (más confiable que tool calling)
 *
 * Estrategia Ollama: en lugar de depender del tool calling de Ollama (poco confiable),
 * pre-cargamos los datos relevantes desde MySQL y los inyectamos en el contexto.
 * Ollama solo necesita interpretar/resumir los datos reales.
 */
import Anthropic from "@anthropic-ai/sdk";
import pool from "@/lib/db";
import { getConfig } from "@/lib/settings";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { spawn } from "child_process";
import { getAssessmentRoot } from "@/lib/assessmentRoot";
import nodemailer from "nodemailer";

export const maxDuration = 300;

// ─── AI Log writer ────────────────────────────────────────────────────────────
async function logChat(row: {
  session_id:    string;
  rol:           "user" | "assistant";
  contenido:     string;
  proveedor?:    string | null;
  modelo?:       string | null;
  tokens_usados?: number;
  grafica_path?: string | null;
  chunks_usados?: string | null;
}) {
  try {
    await pool.query(
      `INSERT INTO chat_history
         (session_id, rol, proveedor, modelo, contenido, tokens_usados, grafica_path, chunks_usados)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.session_id,
        row.rol,
        row.proveedor  ?? null,
        row.modelo     ?? null,
        row.contenido  ?? "",
        row.tokens_usados ?? 0,
        row.grafica_path  ?? null,
        row.chunks_usados ?? null,
      ]
    );
  } catch (e) {
    // Nunca crashear el stream por un fallo de log
    console.error("[ai-log] error insertando en chat_history:", e);
  }
}

// ─── DB Schema ────────────────────────────────────────────────────────────────
const DB_SCHEMA = `MySQL — filtrar SIEMPRE por último run:
RUN_FILTER = (SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1)

TABLAS:
indicadores_dim:  indicador_id, nombre, unidad, direccion, run_id
indicadores_fact: indicador_id, periodo, meta, realizado, semafor('verde'|'amarillo'|'rojo'), desviacion_pct, run_id
proyectos_dim:    proyecto_id, nombre, responsable, fecha_inicio, fecha_fin_plan, run_id
proyectos_fact:   proyecto_id, periodo, avance_planificado_pct, avance_real_pct, semafor, desviacion_pct, run_id
alertas:          id, entidad_id, nombre_entidad, periodo, semafor, meta, realizado, desviacion_pct, texto_alerta, created_at
run_logs:         run_id, status, total_indicadores, total_proyectos, alertas_generadas, created_at

JOIN indicadores: indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
JOIN proyectos:   proyectos_dim d ON d.proyecto_id=f.proyecto_id AND d.run_id=f.run_id
NOTA: 'nombre' SOLO en *_dim, NUNCA en *_fact.`;

// ─── Tools (Claude) ───────────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: "query_database",
    description: "Consulta MySQL con SQL. SIEMPRE úsala cuando pregunten por datos reales.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql:         { type: "string", description: "SELECT SQL válido. Solo SELECT, max 50 filas." },
        descripcion: { type: "string", description: "Descripción breve de qué consultas." },
      },
      required: ["sql", "descripcion"],
    },
  },
  {
    name: "generate_chart",
    description: "Genera gráfica PNG. Úsala cuando pidan gráfica o visualización.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo:         { type: "string", enum: ["semaforos", "proyectos", "indicador"] },
        indicador_id: { type: "string", description: "ID del indicador si tipo=indicador (ej: I001)" },
      },
      required: ["tipo"],
    },
  },
  {
    name: "send_whatsapp",
    description: "Envía mensaje WhatsApp al número configurado.",
    input_schema: {
      type: "object" as const,
      properties: { mensaje: { type: "string" } },
      required: ["mensaje"],
    },
  },
  {
    name: "send_email",
    description: "Envía reporte/análisis ejecutivo por correo electrónico. Úsala SOLO si el usuario pide explícitamente enviar por email/correo.",
    input_schema: {
      type: "object" as const,
      properties: {
        asunto:    { type: "string", description: "Asunto del correo, ej: 'Tendencia histórica de indicadores'" },
        contenido: { type: "string", description: "Cuerpo del reporte con el análisis completo generado" },
        to:        { type: "string", description: "Email del destinatario si el usuario lo especificó, ej: 'usuario@gmail.com'" },
      },
      required: ["asunto", "contenido"],
    },
  },
  {
    name: "generate_dynamic_chart",
    description: "Genera una gráfica interactiva (línea, barra, área, pastel) consultando la BD y renderizándola en el chat. Úsala cuando el usuario pida cualquier gráfica, tendencia, evolución, comparación visual, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo:        { type: "string", enum: ["line","bar","area","pie","donut"], description: "Tipo de gráfica: line para tendencias, bar para comparaciones, pie/donut para distribución" },
        titulo:      { type: "string", description: "Título descriptivo de la gráfica" },
        sql:         { type: "string", description: "SQL SELECT para obtener los datos. Usa columnas claras: periodo, valor, meta, nombre, etc." },
        x_key:       { type: "string", description: "Nombre de la columna que va en el eje X (ej: 'periodo', 'nombre')" },
        series_keys: { type: "string", description: "Columnas numéricas separadas por coma para las series (ej: 'realizado,meta')" },
        colores:     { type: "string", description: "Colores hex separados por coma para cada serie (ej: '#3b82f6,#f97316')" },
      },
      required: ["tipo", "titulo", "sql", "x_key"],
    },
  },
  {
    name: "create_presentation",
    description: "Crea una presentación ejecutiva en Gamma.app. Úsala cuando el usuario pida 'hazme una presentación', 'crea slides', 'genera una presentación' o similar.",
    input_schema: {
      type: "object" as const,
      properties: {
        contenido: { type: "string", description: "Contenido en markdown para la presentación: título, secciones, datos clave, tablas y recomendaciones" },
        titulo:    { type: "string", description: "Título de la presentación" },
      },
      required: ["contenido"],
    },
  },
  {
    name: "create_infographic",
    description: "Genera una infografía visual de alta calidad con datos reales de la BD usando gpt-image-2. Úsala cuando el usuario pida 'hazme una infografía', 'crea una imagen visual', 'genera un visual', 'infografía de proyectos', 'imagen de indicadores' o similar.",
    input_schema: {
      type: "object" as const,
      properties: {
        tema:    { type: "string", enum: ["proyectos_atrasados", "indicadores_criticos", "semaforos", "resumen_ejecutivo"], description: "Tema de la infografía según el contexto" },
        titulo:  { type: "string", description: "Título de la infografía, ej: 'Proyectos Atrasados — Dic 2025'" },
        periodo: { type: "string", description: "Período a mostrar, ej: '2025-12'. Opcional — usa el último disponible si no se especifica." },
      },
      required: ["tema", "titulo"],
    },
  },
];

// ─── Dynamic chart type (shared with FloatingChat) ───────────────────────────
export type DynSeries = { name: string; color?: string; data: Record<string, unknown>[] };
export type DynChartData = {
  type:      "line" | "bar" | "area" | "pie" | "donut";
  title:     string;
  subtitle?: string;
  xKey?:     string;           // key in data objects used as X axis
  series:    DynSeries[];      // for line/bar/area: array of series
  pieData?:  { name: string; value: number; color?: string }[]; // for pie/donut
};

// ─── SSE types ────────────────────────────────────────────────────────────────
type SSEEvent =
  | { t: "text";        d: string }
  | { t: "tool_start";  n: string; desc: string; sql?: string }
  | { t: "tool_done";   n: string; rows?: unknown[]; cols?: string[]; ok: boolean; error?: string; chartPath?: string; gammaUrl?: string; imageUrl?: string }
  | { t: "chart_data";    chartData: DynChartData }
  | { t: "gamma_progress"; elapsed: number; total: number }
  | { t: "done";          tokens: number; provider: string; model: string; session_id: string };

type AttachmentCtx = { name: string; tipo: string; category: string; columnas?: string[]; filas?: number; muestra?: unknown[] };

// ─── DB helpers ───────────────────────────────────────────────────────────────
function isReadOnly(sql: string): boolean {
  return sql.trim().toUpperCase().startsWith("SELECT") &&
    !/(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|GRANT|REVOKE)\s/.test(sql.toUpperCase());
}

async function execQueryDb(sql: string, desc = "") {
  if (!isReadOnly(sql)) return { ok: false, rows: [] as Record<string,unknown>[], cols: [] as string[], error: "Solo SELECT" };
  try {
    const trimmed = sql.trim().replace(/;\s*$/, "");
    // Only append LIMIT 50 if the query doesn't already have one
    const safeSql = /\bLIMIT\s+\d+/i.test(trimmed) ? trimmed : trimmed + " LIMIT 50";
    const [rows] = (await pool.query(safeSql)) as unknown[][];
    const arr = rows as Record<string, unknown>[];
    return { ok: true, rows: arr, cols: arr.length > 0 ? Object.keys(arr[0]) : [] };
  } catch (e) {
    return { ok: false, rows: [] as Record<string,unknown>[], cols: [] as string[], error: String(e) };
  }
}

async function execGenerateChart(tipo: string, indicador_id?: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  return new Promise((resolve) => {
    const root = getAssessmentRoot();
    const script = path.join(root, "pipeline", "chart_cli.py");
    // Use venv Python if available (has matplotlib), fallback to PYTHON_BIN or python3
    const venvPython = path.join(root, "venv", "bin", "python3");
    const pythonBin  = process.env.PYTHON_BIN || venvPython;
    const py = spawn(pythonBin, [script], {
      cwd: root, env: { ...process.env, PYTHONPATH: root, PYTHONUNBUFFERED: "1" },
    });
    let out = "";
    py.stdout.on("data", (d) => (out += d.toString()));
    py.on("error", (e) => resolve({ ok: false, error: e.message }));
    py.on("close", (code) => {
      if (code !== 0) return resolve({ ok: false, error: "chart_cli falló" });
      try {
        const data = JSON.parse(out.trim().split("\n").pop() || "{}") as { path?: string };
        resolve({ ok: true, path: data.path });
      } catch { resolve({ ok: false, error: "JSON inválido" }); }
    });
    py.stdin.write(JSON.stringify({ tipo, indicador_id }));
    py.stdin.end();
  });
}

async function execSendWA(mensaje: string) {
  try {
    const cfg = await getConfig();
    const res = await fetch(cfg.wa_url || "http://161.97.129.17:3001/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: cfg.wa_number, message: mensaje }),
    });
    return { ok: res.ok };
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function execSendEmail(asunto: string, contenido = "", toOverride?: string) {
  try {
    const cfg = await getConfig();

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
      return { ok: false, error: "SMTP no configurado — ve a Configuración y completa los campos de correo." };
    }

    const recipient = toOverride || cfg.email_to;
    if (!recipient) {
      return { ok: false, error: "No hay destinatario configurado. Especifica un correo o configúralo en Ajustes." };
    }

    const transporter = nodemailer.createTransport({
      host:   cfg.smtp_host,
      port:   parseInt(cfg.smtp_port || "587"),
      secure: cfg.smtp_tls === "1" && parseInt(cfg.smtp_port || "587") === 465,
      auth:   { user: cfg.smtp_user, pass: cfg.smtp_pass },
      tls:    { rejectUnauthorized: false },
    });

    // Génesis brand colors
    const G_ORANGE = "#F47920";   // primary orange
    const G_BLUE   = "#003F8A";   // deep blue
    const G_LIGHT  = "#EBF3FC";   // light blue tint

    // Convertir texto plano → HTML enriquecido con marca Génesis
    let inList = false;
    const htmlLines: string[] = [];

    const closeList = () => { if (inList) { htmlLines.push("</ul>"); inList = false; } };

    for (const raw of (contenido ?? "").split("\n")) {
      const l = raw.trim();

      // Markdown table row  |col|col|
      if (l.startsWith("|") && l.endsWith("|")) {
        closeList();
        const cells = l.split("|").slice(1, -1).map(c => c.trim());
        const isSep = cells.every(c => /^:?-+:?$/.test(c));
        if (isSep) continue;                       // skip separator row
        const isHeader = htmlLines[htmlLines.length - 1]?.includes("<thead");
        if (!isHeader && !htmlLines.some(h => h.includes("<table"))) {
          // open table
          htmlLines.push(`<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:13px">`);
          htmlLines.push(`<thead>`);
          htmlLines.push(`<tr>${cells.map(c => `<th style="background:${G_BLUE};color:#fff;padding:8px 12px;text-align:left;font-weight:600;border:1px solid #cce0f5">${c}</th>`).join("")}</tr>`);
          htmlLines.push(`</thead><tbody>`);
        } else if (!htmlLines.some(h => h.includes("<tbody"))) {
          // first data row after header — open tbody
          htmlLines.push(`</thead><tbody>`);
          htmlLines.push(`<tr>${cells.map((c,i) => `<td style="padding:7px 12px;border:1px solid #e5e7eb;background:${i===0?"#f9fbff":"#fff"};color:#1f2937">${c}</td>`).join("")}</tr>`);
        } else {
          const rowIdx = htmlLines.filter(h => h.includes("<tr")).length;
          const bg = rowIdx % 2 === 0 ? "#f0f7ff" : "#ffffff";
          htmlLines.push(`<tr>${cells.map((c,i) => `<td style="padding:7px 12px;border:1px solid #e5e7eb;background:${i===0?G_LIGHT:bg};color:#1f2937">${c}</td>`).join("")}</tr>`);
        }
        continue;
      }

      // close open table
      if (htmlLines.some(h => h.includes("<tbody")) && !l.startsWith("|")) {
        htmlLines.push("</tbody></table>");
        // remove the tracking flag
        const idx = htmlLines.findIndex(h => h.includes("<table"));
        if (idx !== -1) htmlLines[idx] = htmlLines[idx]; // no-op, just for clarity
      }

      if (l.startsWith("#### ")) { closeList(); htmlLines.push(`<h4 style="color:${G_BLUE};font-size:14px;margin:18px 0 5px;border-left:3px solid ${G_ORANGE};padding-left:10px">${l.slice(5)}</h4>`); continue; }
      if (l.startsWith("### "))  { closeList(); htmlLines.push(`<h3 style="color:${G_BLUE};font-size:15px;margin:20px 0 6px;border-left:4px solid ${G_ORANGE};padding-left:10px">${l.slice(4)}</h3>`); continue; }
      if (l.startsWith("## "))   { closeList(); htmlLines.push(`<h2 style="color:${G_BLUE};font-size:17px;margin:22px 0 8px;padding-bottom:5px;border-bottom:2px solid ${G_ORANGE}">${l.slice(3)}</h2>`); continue; }
      if (l.startsWith("# "))    { closeList(); htmlLines.push(`<h1 style="color:${G_BLUE};font-size:20px;margin:24px 0 10px">${l.slice(2)}</h1>`); continue; }

      // Bold standalone line
      if (/^\*\*[^*]+\*\*$/.test(l)) { closeList(); htmlLines.push(`<p style="font-weight:700;color:${G_BLUE};margin:8px 0">${l.replace(/\*\*/g,"")}</p>`); continue; }

      // Bullet list
      if (l.startsWith("- ") || l.startsWith("• ")) {
        if (!inList) { htmlLines.push(`<ul style="margin:6px 0;padding-left:20px">`); inList = true; }
        const txt = l.slice(2).replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${G_BLUE}">$1</strong>`);
        htmlLines.push(`<li style="color:#374151;margin:3px 0;line-height:1.6">${txt}</li>`);
        continue;
      }

      closeList();
      if (l === "") { htmlLines.push("<br/>"); continue; }

      // Inline bold
      const styled = l.replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${G_BLUE}">$1</strong>`);
      htmlLines.push(`<p style="color:#374151;margin:4px 0;line-height:1.7;font-size:14px">${styled}</p>`);
    }
    closeList();
    if (htmlLines.some(h => h.includes("<tbody"))) htmlLines.push("</tbody></table>");

    const htmlBody = htmlLines.join("\n") || "<p style='color:#374151'>Reporte generado por Agente IA de Génesis Empresarial.</p>";

    await transporter.sendMail({
      from:    cfg.email_from || cfg.smtp_user,
      to:      recipient,
      subject: asunto || "📊 Génesis Empresarial · Reporte Ejecutivo IA",
      html: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,${G_BLUE} 0%,#005bb5 100%);padding:28px 32px;text-align:center">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding-bottom:12px">
            <img src="https://static.wixstatic.com/media/647a9c_4488143641fb494a9d11ed2b687bcc8d~mv2.jpg"
                 width="60" height="60"
                 style="border-radius:10px;border:3px solid rgba(255,255,255,0.3);object-fit:cover"
                 alt="Génesis Empresarial"/>
          </td>
        </tr>
        <tr>
          <td align="center">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px">
              Fundación Génesis Empresarial
            </h1>
            <p style="color:rgba(255,255,255,0.80);margin:6px 0 0;font-size:13px">
              📊 Planeación Estratégica · Reporte generado por Agente IA
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ORANGE ACCENT BAR -->
  <tr><td style="background:${G_ORANGE};height:4px"></td></tr>

  <!-- META CHIPS -->
  <tr>
    <td style="background:#ffffff;padding:14px 32px;border-bottom:1px solid #e5e7eb">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:${G_LIGHT};border:1px solid #bfdbfe;border-radius:20px;padding:4px 14px;font-size:11px;color:${G_BLUE};font-weight:600;margin-right:8px">
            🤖 Agente IA — Ollama / Claude
          </td>
          <td width="8"></td>
          <td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:20px;padding:4px 14px;font-size:11px;color:#9a3412;font-weight:600">
            📅 ${new Date().toLocaleString("es-GT", { dateStyle:"long", timeStyle:"short" })}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="background:#ffffff;padding:28px 32px">
      ${htmlBody}
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:${G_BLUE};padding:20px 32px;text-align:center">
      <p style="color:rgba(255,255,255,0.70);font-size:11px;margin:0;line-height:1.8">
        Este reporte fue generado automáticamente por el Sistema de Planeación Estratégica IA.<br/>
        <strong style="color:${G_ORANGE}">Fundación Génesis Empresarial</strong> ·
        <a href="https://www.genesisempresarial.org" style="color:rgba(255,255,255,0.60);text-decoration:none">
          genesisempresarial.org
        </a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`,
    });

    return { ok: true, to: recipient };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function execGenerateDynamicChart(input: {
  tipo: string; titulo: string; sql: string; x_key: string;
  series_keys?: string; colores?: string;
}, send: (ev: SSEEvent) => void): Promise<string> {
  // 1. Query the DB
  const r = await execQueryDb(input.sql, "Datos para gráfica");
  if (!r.ok || r.rows.length === 0) {
    send({ t: "tool_done", n: "generate_dynamic_chart", ok: false, error: r.error || "Sin datos" });
    return `Error al obtener datos: ${r.error || "Sin resultados"}`;
  }

  const rows = r.rows as Record<string, unknown>[];
  const tipo = (input.tipo || "bar") as DynChartData["type"];
  const colors = (input.colores || "#3b82f6,#f97316,#22c55e,#ef4444,#eab308").split(",").map(c => c.trim());
  const seriesKeys = (input.series_keys || "").split(",").map(k => k.trim()).filter(Boolean);

  let chartData: DynChartData;

  if (tipo === "pie" || tipo === "donut") {
    // For pie: use first two columns as name/value
    const nameKey = input.x_key || Object.keys(rows[0])[0];
    const valKey  = seriesKeys[0] || Object.keys(rows[0]).find(k => k !== nameKey) || Object.keys(rows[0])[1];
    chartData = {
      type: tipo, title: input.titulo,
      series: [],
      pieData: rows.map((row, i) => ({
        name:  String(row[nameKey] ?? ""),
        value: Number(row[valKey]  ?? 0),
        color: colors[i % colors.length],
      })),
    };
  } else {
    // For line/bar/area: build series from seriesKeys
    const keys = seriesKeys.length > 0 ? seriesKeys : Object.keys(rows[0]).filter(k => k !== input.x_key && typeof rows[0][k] === "number");
    chartData = {
      type: tipo, title: input.titulo, xKey: input.x_key,
      series: keys.map((key, i) => ({
        name:  key,
        color: colors[i % colors.length],
        data:  rows.map(row => ({ [input.x_key]: row[input.x_key], [key]: Number(row[key] ?? 0) })),
      })),
    };
  }

  send({ t: "chart_data", chartData });
  send({ t: "tool_done", n: "generate_dynamic_chart", ok: true });
  return `Gráfica "${input.titulo}" generada con ${rows.length} puntos de datos.`;
}

// ─── Build rich Spanish presentation content from real DB data ───────────────
async function buildPresentationFromDB(
  pregunta: string,
  send: (ev: SSEEvent) => void,
  aiAnalysis?: string,          // análisis generado por la IA — se embebe en la presentación
): Promise<string> {
  const q   = pregunta.toLowerCase();
  const RUN = `(SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1)`;
  const hoy = new Date().toLocaleDateString("es-GT", { year: "numeric", month: "long", day: "numeric" });

  // Detectar IDs de indicadores y proyectos mencionados en la pregunta
  const indicadorIds = [...new Set((pregunta.match(/\bI0\d{2}[A-Z]?\b/gi) ?? []).map(s => s.toUpperCase()))];
  const proyectoIds  = [...new Set((pregunta.match(/\bP0\d{2}[A-Z]?\b/gi) ?? []).map(s => s.toUpperCase()))];
  const mentionsOnboarding = /onboarding|digital.*2\.0|p002/i.test(pregunta);

  send({ t: "tool_start", n: "query_database", desc: "Construyendo contenido de presentación desde BD" });

  const lines: string[] = [
    `# ${
      /tendencia|históric|histor/i.test(q) ? "Tendencia Histórica de Indicadores de Gestión" :
      /proyecto/i.test(q)                  ? "Estado del Portafolio de Proyectos Estratégicos" :
      /indicad|kpi|semáf/i.test(q)         ? "Indicadores Críticos de Gestión" :
      /alerta/i.test(q)                    ? "Alertas Ejecutivas del Sistema" :
      "Resumen Ejecutivo — Planeación Estratégica"
    }`,
    ``,
    `**Fundación Génesis Empresarial | Guatemala | ${hoy}**`,
    `*Sistema de Planeación Estratégica con IA Multi-LLM*`,
    ``,
    `---`,
    ``,
  ];

  // ── 1. Resumen general siempre incluido ──────────────────────────────────
  const rSum = await execQueryDb(
    `SELECT
      (SELECT COUNT(*) FROM indicadores_fact WHERE run_id=${RUN} AND semafor='rojo')     AS ind_rojo,
      (SELECT COUNT(*) FROM indicadores_fact WHERE run_id=${RUN} AND semafor='amarillo') AS ind_amarillo,
      (SELECT COUNT(*) FROM indicadores_fact WHERE run_id=${RUN} AND semafor='verde')    AS ind_verde,
      (SELECT COUNT(*) FROM proyectos_fact   WHERE run_id=${RUN} AND semafor='rojo')     AS proy_rojo,
      (SELECT COUNT(*) FROM proyectos_fact   WHERE run_id=${RUN} AND semafor='amarillo') AS proy_amarillo,
      (SELECT COUNT(*) FROM proyectos_fact   WHERE run_id=${RUN} AND semafor='verde')    AS proy_verde,
      (SELECT COUNT(*) FROM alertas          WHERE run_id=${RUN})                        AS alertas_total`,
    "resumen",
  );
  if (rSum.ok && rSum.rows.length > 0) {
    const d = rSum.rows[0];
    lines.push(`## Resumen del Portafolio`);
    lines.push(``);
    lines.push(`| Entidad       | 🟢 Verde | 🟡 Amarillo | 🔴 Rojo |`);
    lines.push(`|---------------|----------|-------------|---------|`);
    lines.push(`| **Indicadores** | ${d.ind_verde} | ${d.ind_amarillo} | ${d.ind_rojo} |`);
    lines.push(`| **Proyectos**   | ${d.proy_verde} | ${d.proy_amarillo} | ${d.proy_rojo} |`);
    lines.push(``);
    lines.push(`> Total de alertas ejecutivas generadas: **${d.alertas_total}**`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }
  send({ t: "tool_done", n: "query_database", ok: rSum.ok, rows: rSum.rows, cols: rSum.cols });

  // ── 1b. Análisis específico de indicadores/proyectos mencionados ─────────
  if (indicadorIds.length > 0 || proyectoIds.length > 0 || mentionsOnboarding) {
    const iIds = indicadorIds.length > 0 ? indicadorIds : [];
    const pIds = proyectoIds.length > 0  ? proyectoIds  : (mentionsOnboarding ? ["P002"] : []);

    if (iIds.length > 0) {
      send({ t: "tool_start", n: "query_database", desc: `Detalle de indicadores: ${iIds.join(", ")}` });
      const iSql = `SELECT d.indicador_id, d.nombre, d.unidad, d.direccion,
                           f.periodo, f.meta, f.realizado,
                           ROUND(f.desviacion_pct,1) AS desv, f.semafor
                    FROM indicadores_fact f
                    JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
                    WHERE f.run_id=${RUN} AND f.indicador_id IN (${iIds.map(x => `'${x}'`).join(",")})
                    ORDER BY d.indicador_id, f.periodo`;
      const rI = await execQueryDb(iSql, "indicadores específicos");
      send({ t: "tool_done", n: "query_database", ok: rI.ok, rows: rI.rows, cols: rI.cols });
      if (rI.ok && rI.rows.length > 0) {
        const grupos: Record<string, typeof rI.rows> = {};
        for (const row of rI.rows) { const k = String(row.indicador_id); (grupos[k] ??= []).push(row); }
        lines.push(`## Detalle de Indicadores Analizados`);
        lines.push(``);
        for (const [id, rows] of Object.entries(grupos)) {
          const nombre = String(rows[0].nombre);
          lines.push(`### ${id} — ${nombre} (${rows[0].unidad})`);
          lines.push(``);
          lines.push(`| Período | Meta | Realizado | Desviación | Estado |`);
          lines.push(`|---------|------|-----------|------------|--------|`);
          for (const r of rows) {
            const badge = r.semafor === "rojo" ? "🔴" : r.semafor === "amarillo" ? "🟡" : "🟢";
            const desv  = Number(r.desv);
            lines.push(`| ${r.periodo} | ${r.meta} | ${r.realizado} | ${desv >= 0 ? "+" : ""}${desv}% | ${badge} ${r.semafor} |`);
          }
          lines.push(``);
        }
        lines.push(`---`);
        lines.push(``);
      }
    }

    if (pIds.length > 0) {
      send({ t: "tool_start", n: "query_database", desc: `Detalle de proyectos: ${pIds.join(", ")}` });
      const pSql = `SELECT d.proyecto_id, d.nombre, d.area_responsable, d.descripcion,
                           f.periodo,
                           ROUND(f.avance_planificado_pct,1) AS planificado,
                           ROUND(f.avance_real_pct,1) AS real_pct,
                           f.semafor,
                           ROUND(f.avance_real_pct - f.avance_planificado_pct,1) AS dif
                    FROM proyectos_fact f
                    JOIN proyectos_dim d ON d.proyecto_id=f.proyecto_id AND d.run_id=f.run_id
                    WHERE f.run_id=${RUN} AND d.proyecto_id IN (${pIds.map(x => `'${x}'`).join(",")})
                    ORDER BY d.proyecto_id, f.periodo`;
      const rP = await execQueryDb(pSql, "proyectos específicos");
      send({ t: "tool_done", n: "query_database", ok: rP.ok, rows: rP.rows, cols: rP.cols });
      if (rP.ok && rP.rows.length > 0) {
        const grupos: Record<string, typeof rP.rows> = {};
        for (const row of rP.rows) { const k = String(row.proyecto_id); (grupos[k] ??= []).push(row); }
        lines.push(`## Detalle de Proyectos Relacionados`);
        lines.push(``);
        for (const [id, rows] of Object.entries(grupos)) {
          lines.push(`### ${id} — ${String(rows[0].nombre)}`);
          if (rows[0].descripcion) lines.push(`*${rows[0].descripcion}*`);
          lines.push(`**Área:** ${rows[0].area_responsable}`);
          lines.push(``);
          lines.push(`| Período | Planificado | Real | Diferencia | Estado |`);
          lines.push(`|---------|-------------|------|------------|--------|`);
          for (const r of rows) {
            const badge = r.semafor === "rojo" ? "🔴" : r.semafor === "amarillo" ? "🟡" : "🟢";
            const dif   = Number(r.dif);
            lines.push(`| ${r.periodo} | ${r.planificado}% | ${r.real_pct}% | ${dif >= 0 ? "+" : ""}${dif}% | ${badge} ${r.semafor} |`);
          }
          lines.push(``);
        }
        lines.push(`---`);
        lines.push(``);
      }
    }
  }

  // ── 1c. Análisis generado por la IA ──────────────────────────────────────
  if (aiAnalysis && aiAnalysis.trim().length > 100) {
    const cleanAnalysis = aiAnalysis
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^\s+/, "")
      .trim();
    lines.push(`## Análisis Ejecutivo`);
    lines.push(``);
    lines.push(cleanAnalysis);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // ── 2. Tendencia histórica ───────────────────────────────────────────────
  if (/tendencia|históric|histor|evoluc|período|period|2023|2024|2025/i.test(q)) {
    send({ t: "tool_start", n: "query_database", desc: "Tendencia histórica de indicadores" });
    // Agrupar por periodo: promedio realizado vs meta de todos los indicadores
    const rTrend = await execQueryDb(
      `SELECT f.periodo,
              ROUND(AVG(CASE WHEN d.direccion='higher_is_better' THEN f.realizado/NULLIF(f.meta,0)*100 ELSE f.meta/NULLIF(f.realizado,0)*100 END), 1) AS cumplimiento_pct,
              SUM(CASE WHEN f.semafor='verde' THEN 1 ELSE 0 END)    AS verde,
              SUM(CASE WHEN f.semafor='amarillo' THEN 1 ELSE 0 END) AS amarillo,
              SUM(CASE WHEN f.semafor='rojo' THEN 1 ELSE 0 END)     AS rojo
       FROM indicadores_fact f
       JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
       WHERE f.run_id=${RUN}
       GROUP BY f.periodo ORDER BY f.periodo`,
      "tendencia",
    );
    send({ t: "tool_done", n: "query_database", ok: rTrend.ok, rows: rTrend.rows, cols: rTrend.cols });
    if (rTrend.ok && rTrend.rows.length > 0) {
      lines.push(`## Tendencia Histórica — Cumplimiento por Período`);
      lines.push(``);
      lines.push(`| Período | % Cumplimiento | 🟢 Verde | 🟡 Amarillo | 🔴 Rojo |`);
      lines.push(`|---------|---------------|----------|-------------|---------|`);
      for (const r of rTrend.rows) {
        lines.push(`| ${r.periodo} | ${r.cumplimiento_pct}% | ${r.verde} | ${r.amarillo} | ${r.rojo} |`);
      }
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }

    // Indicadores con mejor y peor tendencia
    send({ t: "tool_start", n: "query_database", desc: "Indicadores con mejor y peor tendencia" });
    const rInd = await execQueryDb(
      `SELECT d.indicador_id, d.nombre, d.unidad,
              MIN(f.periodo) AS primer_periodo, MAX(f.periodo) AS ultimo_periodo,
              ROUND(AVG(f.desviacion_pct), 1) AS desv_promedio,
              SUM(CASE WHEN f.semafor='verde' THEN 1 ELSE 0 END) AS meses_verde,
              SUM(CASE WHEN f.semafor='rojo'  THEN 1 ELSE 0 END) AS meses_rojo,
              COUNT(*) AS total_periodos
       FROM indicadores_fact f
       JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
       WHERE f.run_id=${RUN} AND d.parent_indicator_id IS NULL
       GROUP BY d.indicador_id, d.nombre, d.unidad
       ORDER BY desv_promedio DESC`,
      "desempeño por indicador",
    );
    send({ t: "tool_done", n: "query_database", ok: rInd.ok, rows: rInd.rows, cols: rInd.cols });
    if (rInd.ok && rInd.rows.length > 0) {
      lines.push(`## Desempeño por Indicador (Resumen 2023–2025)`);
      lines.push(``);
      lines.push(`| ID | Indicador | Unidad | Desv. Promedio | Meses Verde | Meses Rojo |`);
      lines.push(`|----|-----------|--------|----------------|-------------|------------|`);
      for (const r of rInd.rows) {
        const desv = Number(r.desv_promedio);
        lines.push(`| ${r.indicador_id} | ${r.nombre} | ${r.unidad} | ${desv > 0 ? "+" : ""}${desv}% | ${r.meses_verde} | ${r.meses_rojo} |`);
      }
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
  }

  // ── 3. Proyectos ────────────────────────────────────────────────────────
  if (/proyecto|portafolio|cartera|obra|avance|planif/i.test(q) || !/tendencia|históric/i.test(q)) {
    send({ t: "tool_start", n: "query_database", desc: "Estado de proyectos estratégicos" });
    const rProy = await execQueryDb(
      `SELECT d.proyecto_id, d.nombre, d.area_responsable,
              ROUND(f.avance_planificado_pct, 1) AS planificado,
              ROUND(f.avance_real_pct, 1)        AS real_pct,
              f.semafor,
              ROUND(f.avance_real_pct - f.avance_planificado_pct, 1) AS diferencia
       FROM proyectos_fact f
       JOIN proyectos_dim d ON d.proyecto_id=f.proyecto_id AND d.run_id=f.run_id
       WHERE f.run_id=${RUN}
       ORDER BY FIELD(f.semafor,'rojo','amarillo','verde'), diferencia ASC`,
      "proyectos",
    );
    send({ t: "tool_done", n: "query_database", ok: rProy.ok, rows: rProy.rows, cols: rProy.cols });
    if (rProy.ok && rProy.rows.length > 0) {
      lines.push(`## Estado del Portafolio de Proyectos Estratégicos`);
      lines.push(``);
      lines.push(`| Proyecto | Área | Planificado | Real | Diferencia | Estado |`);
      lines.push(`|----------|------|-------------|------|------------|--------|`);
      for (const r of rProy.rows) {
        const badge = r.semafor === "rojo" ? "🔴 Atrasado" : r.semafor === "amarillo" ? "🟡 En riesgo" : "🟢 Al día";
        const dif   = Number(r.diferencia);
        lines.push(`| **${r.nombre}** | ${r.area_responsable} | ${r.planificado}% | ${r.real_pct}% | ${dif >= 0 ? "+" : ""}${dif}% | ${badge} |`);
      }
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
  }

  // ── 4. Indicadores críticos ──────────────────────────────────────────────
  {
    send({ t: "tool_start", n: "query_database", desc: "Indicadores críticos (rojo/amarillo)" });
    const rCrit = await execQueryDb(
      `SELECT d.indicador_id, d.nombre, d.unidad, d.direccion,
              f.periodo, f.meta, f.realizado,
              ROUND(f.desviacion_pct, 1) AS desviacion_pct, f.semafor
       FROM indicadores_fact f
       JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
       WHERE f.run_id=${RUN} AND f.semafor IN ('rojo','amarillo') AND d.parent_indicator_id IS NULL
       ORDER BY FIELD(f.semafor,'rojo','amarillo'), ABS(f.desviacion_pct) DESC`,
      "indicadores críticos",
    );
    send({ t: "tool_done", n: "query_database", ok: rCrit.ok, rows: rCrit.rows, cols: rCrit.cols });
    if (rCrit.ok && rCrit.rows.length > 0) {
      lines.push(`## Indicadores Críticos — Acción Requerida`);
      lines.push(``);
      lines.push(`| ID | Indicador | Período | Meta | Realizado | Desviación | Estado |`);
      lines.push(`|----|-----------|---------|------|-----------|------------|--------|`);
      for (const r of rCrit.rows) {
        const badge = r.semafor === "rojo" ? "🔴 Rojo" : "🟡 Amarillo";
        const desv  = Number(r.desviacion_pct);
        lines.push(`| ${r.indicador_id} | ${r.nombre} | ${r.periodo} | ${r.meta} ${r.unidad} | ${r.realizado} ${r.unidad} | ${desv > 0 ? "+" : ""}${desv}% | ${badge} |`);
      }
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
  }

  // ── 5. Alertas recientes ─────────────────────────────────────────────────
  {
    send({ t: "tool_start", n: "query_database", desc: "Alertas ejecutivas recientes" });
    const rAlert = await execQueryDb(
      `SELECT nombre_entidad, periodo, semafor,
              ROUND(desviacion_pct, 1) AS desviacion_pct,
              LEFT(texto_alerta, 250)  AS resumen
       FROM alertas
       ORDER BY created_at DESC LIMIT 5`,
      "alertas",
    );
    send({ t: "tool_done", n: "query_database", ok: rAlert.ok, rows: rAlert.rows, cols: rAlert.cols });
    if (rAlert.ok && rAlert.rows.length > 0) {
      lines.push(`## Alertas Ejecutivas Recientes`);
      lines.push(``);
      for (const r of rAlert.rows) {
        const badge = r.semafor === "rojo" ? "🔴" : r.semafor === "amarillo" ? "🟡" : "🟢";
        lines.push(`### ${badge} ${r.nombre_entidad} — ${r.periodo}`);
        lines.push(``);
        lines.push(`> Desviación: **${Number(r.desviacion_pct) > 0 ? "+" : ""}${r.desviacion_pct}%**`);
        lines.push(``);
        lines.push(String(r.resumen ?? ""));
        lines.push(``);
      }
      lines.push(`---`);
      lines.push(``);
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  lines.push(`## Notas Metodológicas`);
  lines.push(``);
  lines.push(`- **Umbrales**: Verde ≥ meta | Amarillo desviación ≤ 5% | Rojo desviación > 5%`);
  lines.push(`- **Dirección**: "higher is better" (clientes, retención) y "lower is better" (mora, tiempo de desembolso)`);
  lines.push(`- **Fuente**: Base de datos MySQL del sistema de planeación estratégica de Génesis Empresarial`);
  lines.push(`- **Generado**: ${hoy} · Sistema Multi-LLM (Claude + DeepSeek)`);

  return lines.join("\n");
}

async function execCreatePresentation(
  contenido: string,
  session_id: string,
  send: (ev: SSEEvent) => void,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const apiKey = process.env.GAMMA_API_KEY;
    if (!apiKey) return { ok: false, error: "GAMMA_API_KEY no configurada en .env.local" };

    // 1. Iniciar generación directamente (sin self-HTTP-call)
    // textMode "preserve" → Gamma respeta el contenido en español sin reescribirlo
    // textOptions.language "es-419" → español latinoamericano para cualquier texto generado por Gamma
    const startRes = await fetch("https://public-api.gamma.app/v1.0/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({
        inputText:   contenido,
        textMode:    "preserve",
        format:      "presentation",
        numCards:    10,
        textOptions: { language: "es-419" },
      }),
    });
    if (!startRes.ok) {
      const err = await startRes.text();
      return { ok: false, error: `Gamma API ${startRes.status}: ${err.slice(0, 200)}` };
    }
    const { generationId } = await startRes.json() as { generationId: string };

    // 2. Polling — hasta 120 s (stream tiene maxDuration=300)
    const TOTAL_SECS = 120;
    const startTime  = Date.now();
    const deadline   = startTime + TOTAL_SECS * 1000;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 5000));
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      // Enviar progreso al cliente para animar el preloader
      send({ t: "gamma_progress", elapsed, total: TOTAL_SECS });

      const pollRes = await fetch(`https://public-api.gamma.app/v1.0/generations/${generationId}`, {
        headers: { "X-API-KEY": apiKey },
      });
      const data = await pollRes.json() as { status: string; gammaUrl?: string };
      if (data.status === "completed") {
        void import("@/lib/aiLog").then(m => m.logAiAction({
          session_id, rol: "assistant",
          contenido: `[Presentación Gamma] ${contenido.slice(0, 100)}…`,
          proveedor: "gamma", modelo: "gamma-ai",
        }));
        return { ok: true, url: data.gammaUrl };
      }
      if (data.status === "failed") return { ok: false, error: "Gamma falló al generar la presentación" };
    }
    return { ok: false, error: "Tiempo de espera agotado — intenta de nuevo" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── Infographic prompt builder ───────────────────────────────────────────────
function buildInfographicImagePrompt(
  titulo: string, tema: string,
  dataDesc: string, stats: string, period: string,
): string {
  const baseStyle = `
VISUAL STYLE:
- Background: dark navy #0d1117
- Header bar: solid blue #003F8A, full width
- Card backgrounds: dark gray #1e293b with 1px border #334155
- Status colors: RED badge #ef4444 = delayed/critical, YELLOW badge #eab308 = at risk, GREEN badge #22c55e = on track
- Accent: orange #F47920 for subtitles and highlights
- Typography: Inter/Helvetica, clean sans-serif, NO decorative fonts
- All text in white or light gray (#94a3b8), no dark text on dark background
- High contrast, sharp edges, no blur, photorealistic UI dashboard screenshot`.trim();

  if (/proyecto/i.test(tema)) {
    return `Design a professional executive infographic dashboard. Make it look like a real software dashboard screenshot, NOT an illustration.

TITLE: "${titulo}"
COMPANY: Génesis Empresarial — Fundación de Microfinanzas, Guatemala
PERIOD: ${period}

${baseStyle}

EXACT LAYOUT (1536x1024px, horizontal):
1. TOP HEADER BAR (full width, 80px tall): Left side shows "Génesis Empresarial" in white bold 18px. Center shows "${titulo}" in white bold 24px. Right shows "${period}" in orange #F47920 bold.

2. SUMMARY STATS ROW (3 equal cards, 120px tall each):
   Card 1: Large red number centered + "Atrasados" label below in gray
   Card 2: Large yellow number centered + "En Riesgo" label below
   Card 3: Large green number centered + "Al Día" label below
   Numbers from: ${stats}

3. PROJECT CARDS GRID (2 columns, fills remaining space):
${dataDesc}
   Each card: project name bold white top-left, colored status badge (pill shape) top-right, thin progress bar below name (gray background = planned %, colored fill = real %), percentage numbers at bar ends in small text.

4. FOOTER (dark strip, 40px): "Fundación Génesis Empresarial · Planeación Estratégica IA · ${period}" in small #94a3b8 text centered.

QUALITY: Ultra-sharp dashboard screenshot. No photos. No gradients on cards. Pure flat UI design with subtle card shadows.`;
  }

  if (/indicad/i.test(tema)) {
    return `Design a professional executive KPI dashboard infographic. Photorealistic UI screenshot, NOT an illustration.

TITLE: "${titulo}"
COMPANY: Génesis Empresarial, Guatemala
PERIOD: ${period}

${baseStyle}

EXACT LAYOUT (1536x1024px, horizontal):
1. HEADER BAR (blue #003F8A, 80px): "Génesis Empresarial" left, "${titulo}" center bold white 24px, "${period}" right in orange.

2. KPI SUMMARY ROW: 2 large metric cards showing — ${stats}

3. INDICATOR CARDS (2-column grid):
${dataDesc}
   Each card: indicator name bold white, "META: X" in gray, "REAL: Y" in large white number, deviation % in colored bold (red if negative, green if positive), status badge pill right-aligned.

4. FOOTER: "Génesis Empresarial · Indicadores de Gestión · ${period}" small gray text.

QUALITY: High-contrast dark dashboard. Clean flat cards. Sharp text. Corporate executive aesthetic.`;
  }

  // resumen_ejecutivo / semaforos / default
  return `Design a professional executive summary dashboard infographic. Photorealistic dark UI screenshot.

TITLE: "${titulo}"
COMPANY: Génesis Empresarial — Planeación Estratégica IA, Guatemala
PERIOD: ${period}

${baseStyle}

LAYOUT (1536x1024px):
1. HEADER: Blue bar, company name left, title center in bold white, period right in orange.
2. MAIN CONTENT — show this data as KPI cards with traffic-light status indicators (🔴🟡🟢):
${dataDesc}
3. Use large bold numbers for KPIs, colored status badges, thin separator lines.
4. FOOTER: "Fundación Génesis Empresarial · ${period}" in small gray text.

STYLE: Dark navy executive dashboard. No photos, no gradients. Ultra-sharp, clean, corporate.`;
}

// ─── Infographic executor (gpt-image-2 + DALL-E 3 fallback) ──────────────────
async function execCreateInfographic(
  tema: string, titulo: string, periodo: string | undefined,
  send: (ev: SSEEvent) => void, session_id: string,
): Promise<{ ok: boolean; imageUrl?: string; error?: string }> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { ok: false, error: "OPENAI_API_KEY no configurada en .env.local" };

    const RUN = `(SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1)`;
    let dataDesc = "";
    let stats    = "";

    // ── Query real data depending on tema ────────────────────────────────────
    if (/proyecto/i.test(tema)) {
      send({ t: "tool_start", n: "query_database", desc: "Proyectos para infografía" });
      const r = await execQueryDb(
        `SELECT d.nombre,
                ROUND(f.avance_planificado_pct,0) AS planificado,
                ROUND(f.avance_real_pct,0)         AS real_pct,
                f.semafor,
                ROUND(f.avance_real_pct - f.avance_planificado_pct, 0) AS diferencia
         FROM proyectos_fact f
         JOIN proyectos_dim d ON d.proyecto_id=f.proyecto_id AND d.run_id=f.run_id
         WHERE f.run_id=${RUN}
         ORDER BY f.desviacion_pct ASC LIMIT 6`,
        "proyectos infografía",
      );
      send({ t: "tool_done", n: "query_database", ok: r.ok, rows: r.rows, cols: r.cols });
      if (r.ok && r.rows.length > 0) {
        const rojo = r.rows.filter(x => x.semafor === "rojo").length;
        const amar = r.rows.filter(x => x.semafor === "amarillo").length;
        const verd = r.rows.filter(x => x.semafor === "verde").length;
        stats    = `${rojo} atrasados, ${amar} en riesgo, ${verd} al día`;
        dataDesc = r.rows.map(x =>
          `- ${String(x.nombre).slice(0, 30)}: ${x.real_pct}% real vs ${x.planificado}% planificado [${x.semafor === "rojo" ? "ATRASADO" : x.semafor === "amarillo" ? "EN RIESGO" : "AL DÍA"}]`
        ).join("\n");
      }
    } else if (/indicad/i.test(tema)) {
      send({ t: "tool_start", n: "query_database", desc: "Indicadores críticos para infografía" });
      const r = await execQueryDb(
        `SELECT d.nombre, f.semafor,
                ROUND(f.meta,1) AS meta, ROUND(f.realizado,1) AS realizado,
                ROUND(f.desviacion_pct,1) AS desv
         FROM indicadores_fact f
         JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
         WHERE f.run_id=${RUN} AND f.semafor IN ('rojo','amarillo')
         ORDER BY FIELD(f.semafor,'rojo','amarillo'), ABS(f.desviacion_pct) DESC LIMIT 8`,
        "indicadores infografía",
      );
      send({ t: "tool_done", n: "query_database", ok: r.ok, rows: r.rows, cols: r.cols });
      if (r.ok && r.rows.length > 0) {
        const rojo = r.rows.filter(x => x.semafor === "rojo").length;
        const amar = r.rows.filter(x => x.semafor === "amarillo").length;
        stats    = `${rojo} en rojo, ${amar} en amarillo`;
        dataDesc = r.rows.map(x =>
          `- ${String(x.nombre).slice(0, 28)}: meta ${x.meta} / real ${x.realizado} (${Number(x.desv) > 0 ? "+" : ""}${x.desv}%) — ${String(x.semafor).toUpperCase()}`
        ).join("\n");
      }
    } else {
      // resumen_ejecutivo / semaforos
      send({ t: "tool_start", n: "query_database", desc: "Resumen general para infografía" });
      const r = await execQueryDb(
        `SELECT
          (SELECT COUNT(*) FROM indicadores_fact WHERE run_id=${RUN} AND semafor='rojo')     AS ind_rojo,
          (SELECT COUNT(*) FROM indicadores_fact WHERE run_id=${RUN} AND semafor='amarillo') AS ind_amarillo,
          (SELECT COUNT(*) FROM indicadores_fact WHERE run_id=${RUN} AND semafor='verde')    AS ind_verde,
          (SELECT COUNT(*) FROM proyectos_fact   WHERE run_id=${RUN} AND semafor='rojo')     AS proy_rojo,
          (SELECT COUNT(*) FROM proyectos_fact   WHERE run_id=${RUN} AND semafor='amarillo') AS proy_amarillo,
          (SELECT COUNT(*) FROM proyectos_fact   WHERE run_id=${RUN} AND semafor='verde')    AS proy_verde`,
        "resumen infografía",
      );
      send({ t: "tool_done", n: "query_database", ok: r.ok, rows: r.rows, cols: r.cols });
      if (r.ok && r.rows.length > 0) {
        const d = r.rows[0];
        stats    = `Indicadores: ${d.ind_verde} verde / ${d.ind_amarillo} amarillo / ${d.ind_rojo} rojo | Proyectos: ${d.proy_verde} verde / ${d.proy_amarillo} amarillo / ${d.proy_rojo} rojo`;
        dataDesc = stats;
      }
    }

    const period = periodo ?? new Date().toLocaleDateString("es-GT", { year: "numeric", month: "long" });
    const prompt = buildInfographicImagePrompt(titulo, tema, dataDesc, stats, period);

    // ── Call gpt-image-2 → fallback DALL-E 3 ─────────────────────────────────
    const tryGenerate = async (model: string, extraBody: Record<string, unknown> = {}): Promise<string | null> => {
      const body: Record<string, unknown> = { model, prompt, n: 1, size: "1536x1024", ...extraBody };
      if (model !== "gpt-image-2") body.response_format = "url";

      const res  = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { data?: { url?: string; b64_json?: string }[]; error?: { message: string } };
      if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
      const item = data.data?.[0];
      if (item?.url)       return item.url;
      if (item?.b64_json)  return `data:image/png;base64,${item.b64_json}`;
      return null;
    };

    let imageUrl: string | null = null;
    try {
      imageUrl = await tryGenerate("gpt-image-2", { quality: "high" });
    } catch {
      // Auto-fallback to DALL-E 3 (1792x1024 landscape)
      try {
        imageUrl = await tryGenerate("dall-e-3", { size: "1792x1024" });
      } catch (e2) {
        return { ok: false, error: String(e2) };
      }
    }

    if (!imageUrl) return { ok: false, error: "Sin imagen en respuesta de OpenAI" };

    void import("@/lib/aiLog").then(m => m.logAiAction({
      session_id, rol: "assistant",
      contenido: `[Infografía gpt-image-2] ${titulo} · ${tema}`,
      proveedor: "openai", modelo: "gpt-image-2",
    }));

    return { ok: true, imageUrl };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function executeTool(name: string, input: Record<string, unknown>, send: (ev: SSEEvent) => void, session_id = ""): Promise<string> {
  const descField = (input.descripcion as string) || (input.tipo as string) || name;
  send({ t: "tool_start", n: name, desc: descField, sql: name === "query_database" ? input.sql as string : undefined });

  if (name === "query_database") {
    const r = await execQueryDb(input.sql as string || "", descField);
    send({ t: "tool_done", n: name, ok: r.ok, rows: r.rows, cols: r.cols, error: r.error });
    return r.ok ? `Resultado (${r.rows.length} filas):\n${JSON.stringify(r.rows.slice(0, 15))}` : `Error: ${r.error}`;
  }
  if (name === "generate_chart") {
    const r = await execGenerateChart(input.tipo as string || "semaforos", input.indicador_id as string | undefined);
    const chartPath = r.path ? `/api/charts/${path.basename(r.path)}` : undefined;
    send({ t: "tool_done", n: name, ok: r.ok, chartPath, error: r.error });
    return r.ok ? `Gráfica generada: ${chartPath}` : `Error: ${r.error}`;
  }
  if (name === "send_whatsapp") {
    const r = await execSendWA(input.mensaje as string || "");
    send({ t: "tool_done", n: name, ok: r.ok, error: r.error });
    return r.ok ? "WhatsApp enviado." : `Error: ${r.error}`;
  }
  if (name === "send_email") {
    const r = await execSendEmail(
      input.asunto    as string || "Reporte Assessment",
      input.contenido as string || "",
      input.to        as string | undefined,
    );
    send({ t: "tool_done", n: name, ok: r.ok, error: r.error });
    return r.ok ? `Email enviado a ${(r as { to?: string }).to ?? "destinatario"}.` : `Error: ${r.error}`;
  }
  if (name === "generate_dynamic_chart") {
    send({ t: "tool_start", n: name, desc: `Gráfica ${input.tipo || "bar"}: ${input.titulo || ""}` });
    const result = await execGenerateDynamicChart(input as Parameters<typeof execGenerateDynamicChart>[0], send);
    return result;
  }
  if (name === "create_presentation") {
    // Siempre construir desde la BD para garantizar datos reales en español
    send({ t: "tool_start", n: name, desc: "Preparando presentación con datos reales…" });
    const pregunta    = (input.titulo as string) || "resumen ejecutivo";
    const aiAnalysis  = input.contenido as string | undefined;   // contenido generado por Claude
    const contenido   = await buildPresentationFromDB(pregunta, send, aiAnalysis);
    const r = await execCreatePresentation(contenido, session_id, send);
    send({ t: "tool_done", n: name, ok: r.ok, gammaUrl: r.url, error: r.error });
    return r.ok ? `Presentación creada: ${r.url}` : `Error: ${r.error}`;
  }
  if (name === "create_infographic") {
    const tema    = (input.tema    as string) || "resumen_ejecutivo";
    const titulo  = (input.titulo  as string) || "Infografía Ejecutiva";
    const periodo = input.periodo as string | undefined;
    send({ t: "tool_start", n: name, desc: `Generando infografía: ${titulo}` });
    const r = await execCreateInfographic(tema, titulo, periodo, send, session_id);
    send({ t: "tool_done", n: name, ok: r.ok, imageUrl: r.imageUrl, error: r.error });
    return r.ok ? `Infografía generada con éxito.` : `Error: ${r.error}`;
  }
  send({ t: "tool_done", n: name, ok: false, error: "Herramienta desconocida" });
  return "Error: herramienta desconocida";
}

// ─── System prompts ───────────────────────────────────────────────────────────

const FORMAT_RULES = `
IDIOMA — REGLA ABSOLUTA:
• Responde SIEMPRE en español. Sin excepciones. Nunca uses inglés.
• Si la pregunta está en inglés, responde igualmente en español.
• Tono ejecutivo y profesional, orientado a directivos de Génesis Empresarial.

FORMATO DE RESPUESTA — OBLIGATORIO:
• Usa SOLO texto narrativo y tablas Markdown (| col | col |).
• PROHIBIDO: JSON, bloques \`\`\`json, \`\`\`python, \`\`\`javascript, ni ninguna estructura de código.
• PROHIBIDO: campos como "chart_type", "data", "colors", "labels" o similares.
• PROHIBIDO: responder con objetos {}, arrays [] o cualquier código técnico.
• Si hay datos numéricos, preséntalo en tabla Markdown o en párrafo narrativo.
• Las gráficas las genera el sistema automáticamente — tú solo analiza con texto.`;

function buildSystemPrompt(agentMode: boolean, attachments?: AttachmentCtx[]): string {
  let p = `Eres el asistente experto de análisis de datos de Fundación Génesis Empresarial (Guatemala).
Formas parte del sistema de Planeación Estratégica con IA — Assessment Técnico Multi-LLM.
Tu rol es el "Agente 2 — Chat con los datos": responder consultas en lenguaje natural sobre indicadores y proyectos.

IMPORTANTE: Siempre responde en ESPAÑOL. Nunca en inglés. Sin excepciones.
Contexto del proyecto: indicadores de gestión 2023–2025, proyectos estratégicos, alertas ejecutivas y semáforos de Génesis Empresarial.

${DB_SCHEMA}
${FORMAT_RULES}

INSTRUCCIONES DE ANÁLISIS:
- SIEMPRE consulta la BD con query_database antes de responder sobre datos.
- Usa nombres de columna EXACTOS. 'nombre' SOLO en *_dim, NUNCA en *_fact.
- Para proyectos: siempre JOIN proyectos_dim para obtener el nombre.
- Para gráficas: usa generate_dynamic_chart — consulta la BD, define tipo, x_key y series_keys apropiados.
- Nunca inventes datos — si no tienes resultado de BD, dilo.
- Cuando menciones indicadores, usa siempre su nombre completo además del ID (ej: "I001 — Crecimiento de Clientes").
- Contexto de umbrales: Verde ≥ meta; Amarillo desviación ≤ 5%; Rojo desviación > 5% (ajustado por dirección del indicador).`;

  if (agentMode) {
    p += `\n\n═══ MODO AGENTE ═══
Tienes acceso a herramientas avanzadas que puedes encadenar sin pedir confirmación.

FLUJO CORRECTO:
1. Siempre consulta primero la BD con query_database para obtener datos reales.
2. Genera gráficas con generate_dynamic_chart si el usuario las pide (tipo line para tendencias, bar para comparaciones, pie/donut para distribución).
3. Analiza los datos y responde con texto narrativo.
4. Si el usuario EXPLÍCITAMENTE pide "envía por WhatsApp/email/correo", ENTONCES ejecuta send_whatsapp o send_email — pasando un resumen ejecutivo como mensaje, NO la pregunta del usuario.

REGLAS CRÍTICAS para send_whatsapp / send_email:
• SOLO las uses cuando el usuario diga explícitamente: "envía", "manda", "comparte", "notifica".
• Si el usuario solo hace una pregunta o pide análisis/gráfica → NO envíes nada automáticamente.
• El contenido del mensaje debe ser el ANÁLISIS/RESUMEN, nunca la pregunta del usuario.
• Ejemplo: "Dame el indicador con más desviación" → solo query_database + texto. NO WA, NO email.
• Ejemplo: "Envía el resumen por WhatsApp" → query_database → analiza → send_whatsapp con el resumen.
• Para send_email: siempre incluye el campo "contenido" con el análisis completo. Si el usuario mencionó un email (ej: "mándalo a user@gmail.com"), ponlo en el campo "to".`;
  }

  if (attachments?.length) {
    const blocks = attachments.map(a => {
      let s = `\n📎 [${a.name}] — ${a.tipo} · ${a.category}`;
      if (a.filas)            s += ` · ${a.filas.toLocaleString()} filas`;
      if (a.columnas?.length) s += `\nColumnas: ${a.columnas.join(", ")}`;
      if (a.muestra?.length)  s += `\nMuestra:\n${a.muestra.slice(0, 6).map(r => JSON.stringify(r)).join("\n")}`;
      return s;
    }).join("\n");
    p += `\n\n═══ ARCHIVOS ADJUNTOS ═══\n${blocks}\nCruza estos datos con la BD cuando sea relevante.`;
  }

  return p;
}

/**
 * Limpia la respuesta de Ollama eliminando:
 * - Bloques de código JSON/Python/JS (```json ... ```)
 * - Objetos JSON puros que el modelo generó en lugar de texto
 * - Bloques <think>...</think>
 */
function cleanOllamaResponse(text: string): string {
  let clean = text;

  // 1. Eliminar bloques <think>
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // 2. Eliminar bloques de código ```json, ```javascript, ```python, ```
  clean = clean.replace(/```(?:json|javascript|python|js|ts|typescript|yaml|xml|html|css|sql)?\s*[\s\S]*?```/gi, "");

  // 3. Eliminar objetos JSON sueltos que contengan claves típicas de charts
  //    (chart_type, chart_data, data, labels, colors, title + array/object pattern)
  clean = clean.replace(/\{[\s\S]*?"(?:chart_type|chart_data|labels|colors|datasets|series)"[\s\S]*?\}/g, "");

  // 4. Si queda una línea que sea solo { o [ o }, limpiarla
  clean = clean.replace(/^\s*[{}\[\]]\s*$/gm, "");

  // 5. Colapsar múltiples líneas en blanco consecutivas
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();

  return clean;
}

// ─── CLAUDE: full tool-use ReAct loop ────────────────────────────────────────
async function runClaude(
  messages: Anthropic.MessageParam[], systemPrompt: string,
  apiKey: string, model: string, send: (ev: SSEEvent) => void,
  session_id = "",
): Promise<number> {
  const anthropic = new Anthropic({ apiKey });
  let totalTokens = 0;

  for (let iter = 0; iter < 8; iter++) {
    const stream = anthropic.messages.stream({
      model, max_tokens: 4096, system: systemPrompt, tools: TOOLS, messages,
    });

    let blockType = "", toolName = "", toolId = "", toolInput = "";
    const toolUses: { id: string; name: string; input: string }[] = [];

    for await (const ev of stream) {
      if (ev.type === "content_block_start") {
        if (ev.content_block.type === "text")     { blockType = "text"; }
        if (ev.content_block.type === "tool_use") {
          blockType = "tool"; toolName = ev.content_block.name;
          toolId = ev.content_block.id; toolInput = "";
        }
      }
      if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta" && blockType === "text") send({ t: "text", d: ev.delta.text });
        if (ev.delta.type === "input_json_delta") toolInput += ev.delta.partial_json;
      }
      if (ev.type === "content_block_stop" && blockType === "tool") {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(toolInput || "{}") as Record<string, unknown>; } catch { /* */ }
        const descField = (parsed.descripcion as string) || (parsed.tipo as string) || toolName;
        send({ t: "tool_start", n: toolName, desc: descField, sql: toolName === "query_database" ? parsed.sql as string : undefined });
        toolUses.push({ id: toolId, name: toolName, input: toolInput });
      }
      if (ev.type === "message_delta") totalTokens += ev.usage?.output_tokens || 0;
    }

    const finalMsg = await stream.finalMessage();
    totalTokens += finalMsg.usage?.input_tokens || 0;
    if (finalMsg.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tu.input || "{}") as Record<string, unknown>; } catch { /* */ }
      const content = await executeTool(tu.name, input, send, session_id);
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content });
    }

    messages = [
      ...messages,
      { role: "assistant", content: finalMsg.content },
      { role: "user",      content: toolResults },
    ];
  }

  return totalTokens;
}

// ─── OLLAMA: pre-fetch strategy ───────────────────────────────────────────────
// En lugar de depender del tool calling de Ollama (poco confiable con muchos modelos),
// pre-cargamos los datos directamente desde MySQL e inyectamos en el contexto.
// Ollama solo necesita interpretar datos ya disponibles → respuestas confiables.

const RUN_FILTER = `(SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1)`;

async function prefetchOllamaContext(question: string, send: (ev: SSEEvent) => void): Promise<string> {
  const q = question.toLowerCase();
  const parts: string[] = [];

  // Extraer período específico si se menciona (ej: 2025-12)
  const periodoMatch = question.match(/\b(\d{4}-\d{2})\b/);
  const periodoFiltro = periodoMatch ? periodoMatch[1] : null;
  // Condición de período: si el usuario menciona uno → filtramos por ese período,
  // si no → usamos el run_id más reciente
  const periodoCond = periodoFiltro
    ? `f.periodo = '${periodoFiltro}'`
    : `f.run_id = ${RUN_FILTER}`;

  // Indicadores (cuando pregunten por indicadores, semáforos, KPIs, metas, etc.)
  if (/(indicad|semáf|semaf|rojo|amarillo|verde|kpi|meta|realizado|desviaci|tendencia|distribuc|dona|donut|I0\d\d|i00)/.test(q)) {
    const desc = periodoFiltro
      ? `Indicadores del período ${periodoFiltro}`
      : "Indicadores críticos del período actual";
    send({ t: "tool_start", n: "query_database", desc });

    // Buscar indicador específico si hay ID
    const idMatch = question.match(/\bI0\d{2}[A-Z]?\b/i);
    let sql: string;
    if (idMatch) {
      sql = `SELECT d.indicador_id, d.nombre, d.unidad, f.periodo, f.meta, f.realizado, f.semafor, ROUND(f.desviacion_pct,2) as desviacion_pct
             FROM indicadores_fact f JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
             WHERE ${periodoCond} AND f.indicador_id='${idMatch[0].toUpperCase()}'
             ORDER BY f.periodo DESC LIMIT 36`;
    } else {
      sql = `SELECT d.indicador_id, d.nombre, d.unidad, f.periodo, f.meta, f.realizado, f.semafor, ROUND(f.desviacion_pct,2) as desviacion_pct
             FROM indicadores_fact f JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
             WHERE ${periodoCond}
             ORDER BY FIELD(f.semafor,'rojo','amarillo','verde'), ABS(f.desviacion_pct) DESC LIMIT 30`;
    }

    const r = await execQueryDb(sql, "indicadores");
    send({ t: "tool_done", n: "query_database", ok: r.ok, rows: r.rows, cols: r.cols, error: r.error });
    if (r.ok && r.rows.length > 0) {
      const periodoLabel = periodoFiltro ? ` (período ${periodoFiltro})` : "";
      parts.push(`INDICADORES${periodoLabel} (datos reales MySQL):\n${JSON.stringify(r.rows)}`);
    } else if (periodoFiltro) {
      parts.push(`NOTA: No se encontraron indicadores para el período ${periodoFiltro} en la base de datos.`);
    }
  }

  // Proyectos
  if (/(proyecto|atras|retraso|avance|planif|entreg|obra|progres|P0\d\d)/.test(q)) {
    const desc = periodoFiltro ? `Proyectos del período ${periodoFiltro}` : "Estado de proyectos";
    send({ t: "tool_start", n: "query_database", desc });
    const proyPeriodoCond = periodoFiltro
      ? `f.periodo = '${periodoFiltro}'`
      : `f.run_id = ${RUN_FILTER}`;
    const sql = `SELECT d.proyecto_id, d.nombre, d.responsable, f.periodo,
                   ROUND(f.avance_planificado_pct,1) as planificado_pct,
                   ROUND(f.avance_real_pct,1) as real_pct,
                   f.semafor, ROUND(f.desviacion_pct,2) as desviacion_pct
                 FROM proyectos_fact f JOIN proyectos_dim d ON d.proyecto_id=f.proyecto_id AND d.run_id=f.run_id
                 WHERE ${proyPeriodoCond}
                 ORDER BY FIELD(f.semafor,'rojo','amarillo','verde'), f.desviacion_pct ASC LIMIT 20`;
    const r = await execQueryDb(sql, "proyectos");
    send({ t: "tool_done", n: "query_database", ok: r.ok, rows: r.rows, cols: r.cols, error: r.error });
    if (r.ok && r.rows.length > 0) {
      const periodoLabel = periodoFiltro ? ` (período ${periodoFiltro})` : "";
      parts.push(`PROYECTOS${periodoLabel} (datos reales MySQL):\n${JSON.stringify(r.rows)}`);
    } else if (periodoFiltro) {
      parts.push(`NOTA: No se encontraron proyectos para el período ${periodoFiltro} en la base de datos.`);
    }
  }

  // Alertas
  if (/(alert|critic|urgent|incidencia)/.test(q)) {
    send({ t: "tool_start", n: "query_database", desc: "Alertas ejecutivas recientes" });
    const sql = `SELECT nombre_entidad, periodo, semafor, ROUND(desviacion_pct,2) as desviacion_pct,
                   LEFT(texto_alerta, 300) as resumen_alerta
                 FROM alertas ORDER BY created_at DESC LIMIT 8`;
    const r = await execQueryDb(sql, "alertas");
    send({ t: "tool_done", n: "query_database", ok: r.ok, rows: r.rows, cols: r.cols, error: r.error });
    if (r.ok && r.rows.length > 0) parts.push(`ALERTAS EJECUTIVAS:\n${JSON.stringify(r.rows)}`);
  }

  // Resumen general si no hubo match específico
  if (parts.length === 0) {
    const resumenDesc = periodoFiltro
      ? `Resumen del dashboard — período ${periodoFiltro}`
      : "Resumen general del dashboard";
    send({ t: "tool_start", n: "query_database", desc: resumenDesc });
    // Condiciones para el resumen: si hay período → filtrar por período en todas las tablas de hechos
    const indCond  = periodoFiltro ? `periodo = '${periodoFiltro}'` : `run_id = ${RUN_FILTER}`;
    const proyCond = periodoFiltro ? `periodo = '${periodoFiltro}'` : `run_id = ${RUN_FILTER}`;
    const sql = `SELECT
      (SELECT COUNT(*) FROM indicadores_fact WHERE ${indCond}  AND semafor='rojo')     as ind_rojo,
      (SELECT COUNT(*) FROM indicadores_fact WHERE ${indCond}  AND semafor='amarillo') as ind_amarillo,
      (SELECT COUNT(*) FROM indicadores_fact WHERE ${indCond}  AND semafor='verde')    as ind_verde,
      (SELECT COUNT(*) FROM proyectos_fact   WHERE ${proyCond} AND semafor='rojo')     as proy_rojo,
      (SELECT COUNT(*) FROM proyectos_fact   WHERE ${proyCond} AND semafor='amarillo') as proy_amarillo,
      (SELECT COUNT(*) FROM proyectos_fact   WHERE ${proyCond} AND semafor='verde')    as proy_verde`;
    const r = await execQueryDb(sql, "resumen");
    send({ t: "tool_done", n: "query_database", ok: r.ok, rows: r.rows, cols: r.cols, error: r.error });
    if (r.ok && r.rows.length > 0) {
      const label = periodoFiltro ? `RESUMEN DEL DASHBOARD (período ${periodoFiltro})` : "RESUMEN DEL DASHBOARD";
      parts.push(`${label}:\n${JSON.stringify(r.rows[0])}`);
    }

    // Also fetch most critical indicators
    const rInd = await execQueryDb(
      `SELECT d.nombre, f.indicador_id, f.semafor, ROUND(f.desviacion_pct,2) as desv
       FROM indicadores_fact f JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
       WHERE ${periodoCond} AND f.semafor IN ('rojo','amarillo')
       ORDER BY FIELD(f.semafor,'rojo','amarillo'), ABS(f.desviacion_pct) DESC LIMIT 10`,
      ""
    );
    if (rInd.ok && rInd.rows.length > 0) parts.push(`INDICADORES CRÍTICOS:\n${JSON.stringify(rInd.rows)}`);
  }

  return parts.join("\n\n");
}

type OAIMsg = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };

async function runOllama(
  question: string,
  historial: OAIMsg[],
  systemPrompt: string,
  ollamaUrl: string,
  model: string,
  send: (ev: SSEEvent) => void,
  session_id = "",
): Promise<number> {

  // Step 1: Auto-generate chart if the question asks for one
  const wantsChart = /(gráfica|grafica|chart|visual|diagrama|semáforo dashboard|resumen visual|dona|donut)/.test(question.toLowerCase());
  if (wantsChart) {
    const q2 = question.toLowerCase();
    // Extraer período específico si se menciona (ej: 2025-12)
    const periodoMatch = question.match(/\b(\d{4}-\d{2})\b/);
    const periodoFiltro = periodoMatch ? periodoMatch[1] : null;
    // Determine chart type and SQL based on question
    let chartInput: Parameters<typeof execGenerateDynamicChart>[0];

    if (/(tendencia|histór|histórico|evoluci|tiempo|mensual|anual|período)/.test(q2)) {
      // Historical trend: line chart
      const idMatch = question.match(/\bI0\d{2}[A-Z]?\b/i);
      const sql = idMatch
        ? `SELECT f.periodo, d.nombre, f.meta, f.realizado, f.desviacion_pct
           FROM indicadores_fact f
           JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
           WHERE f.indicador_id='${idMatch[0].toUpperCase()}' ORDER BY f.periodo LIMIT 24`
        : `SELECT f.periodo, AVG(f.realizado) as realizado, AVG(f.meta) as meta
           FROM indicadores_fact f WHERE f.semafor='rojo'
           GROUP BY f.periodo ORDER BY f.periodo LIMIT 18`;
      chartInput = { tipo:"line", titulo:"Tendencia histórica de indicadores", sql, x_key:"periodo", series_keys:"realizado,meta", colores:"#3b82f6,#f97316" };
    } else if (/(proyecto|avance|planificado)/.test(q2)) {
      const sql = `SELECT d.nombre, f.avance_planificado_pct as planificado, f.avance_real_pct as real_pct
                   FROM proyectos_fact f JOIN proyectos_dim d ON d.proyecto_id=f.proyecto_id AND d.run_id=f.run_id
                   WHERE f.run_id=(SELECT run_id FROM run_logs ORDER BY created_at DESC LIMIT 1)
                   ORDER BY f.desviacion_pct ASC LIMIT 10`;
      chartInput = { tipo:"bar", titulo:"Avance de proyectos: planificado vs real", sql, x_key:"nombre", series_keys:"planificado,real_pct", colores:"#3b82f6,#22c55e" };
    } else if (/(semáforo|semafor|distribución|distribucion|pastel|pie|donut|dona)/.test(q2)) {
      // Detectar si pide semáforos de indicadores o proyectos
      const esProyecto = /(proyecto|proyectos)/.test(q2);
      const tabla = esProyecto ? "proyectos_fact" : "indicadores_fact";
      const titulo = `Distribución de semáforos — ${esProyecto ? "Proyectos" : "Indicadores"}${periodoFiltro ? ` (${periodoFiltro})` : ""}`;
      const periodoClause = periodoFiltro
        ? `AND periodo = '${periodoFiltro}'`
        : `AND run_id=(SELECT run_id FROM run_logs ORDER BY created_at DESC LIMIT 1)`;
      const sql = `SELECT semafor as name, COUNT(*) as value FROM ${tabla}
                   WHERE 1=1 ${periodoClause} GROUP BY semafor ORDER BY FIELD(semafor,'verde','amarillo','rojo')`;
      chartInput = { tipo:"donut", titulo, sql, x_key:"name", colores:"#22c55e,#eab308,#ef4444" };
    } else {
      // Default: top indicators bar
      const sql = `SELECT d.nombre, f.meta, f.realizado, f.desviacion_pct
                   FROM indicadores_fact f JOIN indicadores_dim d ON d.indicador_id=f.indicador_id AND d.run_id=f.run_id
                   WHERE f.run_id=(SELECT run_id FROM run_logs ORDER BY created_at DESC LIMIT 1) AND f.semafor='rojo'
                   ORDER BY ABS(f.desviacion_pct) DESC LIMIT 8`;
      chartInput = { tipo:"bar", titulo:"Indicadores críticos — mayor desviación", sql, x_key:"nombre", series_keys:"meta,realizado", colores:"#f97316,#3b82f6" };
    }

    send({ t: "tool_start", n: "generate_dynamic_chart", desc: chartInput.titulo });
    await execGenerateDynamicChart(chartInput, send);
  }

  // Detectar intención de envío / presentación SÓLO cuando el usuario lo pide explícitamente
  const q = question.toLowerCase();
  const wantsWA = /(envía|envia|manda|comparte|notifica)\s.{0,30}(whatsapp|wh?a\b)/.test(q)
               || /(por|via|al)\s+(whatsapp|wh?a\b)/.test(q);
  const wantsEmail = !wantsWA && (
    /(envía|envia|manda|comparte)\s.{0,30}(email|correo|mail)/.test(q)
    || /(por|via|al)\s+(correo|email|mail)/.test(q)
  );
  const wantsPresentation =
    /(hazme|crea|genera|haz|hacer|generar)\s.{0,40}(presentaci[oó]n|slides|diapositivas|ppt|gamma)/.test(q)
    || /presentaci[oó]n\s+(sobre|de|del|ejecutiva|con|los|las)/.test(q)
    || /(dame|pon|ponme|ponlo|muestra|muestr[ea]lo|sube|lleva)\s.{0,25}(en|a)\s+(una?\s+)?(presentaci[oó]n|slides|diapositivas|gamma)/.test(q)
    || /en\s+una?\s+(presentaci[oó]n|slides|diapositivas)/.test(q)
    || /(presentaci[oó]n|slides)\s+(de|sobre|con|los|las|para|ejecutiva)/.test(q);
  const wantsInfographic  = /(hazme|crea|genera|haz|hacer|generar)\s.{0,30}(infograf[ií]a|imagen|visual|poster|reporte visual)/.test(q)
                          || /infograf[ií]a\s+(de|sobre|con)/.test(q);
  // Extraer email del destinatario si el usuario lo escribió en el mensaje
  const emailMatch = question.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const emailTo = emailMatch?.[0] ?? undefined;

  // Step 2: Pre-fetch relevant data from MySQL
  const dataContext = await prefetchOllamaContext(question, send);

  // Step 3: Build enriched user message with real data injected
  const enrichedQuestion = dataContext
    ? `${question}\n\n════════════════════════\nDATOS REALES DE LA BASE DE DATOS (MySQL):\n${dataContext}\n════════════════════════\n\nINSTRUCCIÓN OBLIGATORIA: Responde ÚNICAMENTE en español, con texto narrativo ejecutivo y tablas Markdown.\nEste es un sistema de planeación estratégica de Génesis Empresarial (Guatemala).\nNO generes JSON, bloques de código ni estructuras técnicas. Solo análisis en español.`
    : `${question}\n\nResponde en español, tono ejecutivo, como asistente de planeación estratégica de Génesis Empresarial.`;

  // Step 4: Send to Ollama — plain chat, no tool calling needed
  const msgs: OAIMsg[] = [
    { role: "system", content: systemPrompt },
    ...historial.slice(-6),
    { role: "user", content: enrichedQuestion },
  ];

  let fullResponse = "";
  let totalTokens  = 0;

  try {
    const res = await fetch(`${ollamaUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer ollama" },
      body: JSON.stringify({
        model,
        messages: msgs,
        stream: true,
        num_ctx: 16384,
        num_predict: 2048,
        options: { temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(300_000),   // 5 minutos — suficiente para modelos lentos
    });

    if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string | null } }>;
            usage?: { total_tokens?: number };
          };
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) fullResponse += content;
          if (chunk.usage?.total_tokens) totalTokens += chunk.usage.total_tokens;
        } catch { /* ignore malformed SSE chunk */ }
      }
    }
  } catch (err) {
    const isTimeout = err instanceof Error &&
      (err.name === "TimeoutError" || err.message.includes("timeout") || err.message.includes("aborted"));

    if (fullResponse.trim().length > 80) {
      // Tenemos respuesta parcial útil — la enviamos con una nota al final
      fullResponse += "\n\n*(Respuesta parcial — el modelo tardó más de lo esperado.)*";
    } else if (isTimeout) {
      // Sin respuesta parcial útil — mensaje amigable
      fullResponse = "El modelo está tardando más de lo habitual en responder. "
        + "Puedes intentar de nuevo con una pregunta más corta, o cambiar el proveedor de IA a **Claude** en Configuración para respuestas más rápidas.";
    } else {
      // Otro error de red
      fullResponse = "Hubo un problema de conexión con el servidor de IA. "
        + "Verifica que Ollama esté activo o cambia el proveedor en Configuración.";
    }
  }

  // Limpiar JSON/código y enviar al frontend en chunks
  const cleaned = cleanOllamaResponse(fullResponse);
  const CHUNK = 80;
  for (let i = 0; i < cleaned.length; i += CHUNK) {
    send({ t: "text", d: cleaned.slice(i, i + CHUNK) });
  }

  // Ejecutar WA/email DESPUÉS de tener el análisis — usar el resumen generado como contenido
  if (wantsWA && cleaned.length > 20) {
    const summary = `📊 *Reporte Assessment — ${new Date().toLocaleDateString("es-GT")}*\n\n${cleaned.replace(/[*#_`|]/g, "").slice(0, 1200)}`;
    send({ t: "tool_start", n: "send_whatsapp", desc: "Enviando resumen ejecutivo" });
    const r = await execSendWA(summary);
    send({ t: "tool_done", n: "send_whatsapp", ok: r.ok, error: r.error });
    const statusMsg = r.ok ? "\n\n✅ Resumen enviado por WhatsApp." : `\n\n❌ Error enviando WhatsApp: ${r.error}`;
    send({ t: "text", d: statusMsg });
  }
  if (wantsEmail && cleaned.length > 20) {
    const dest = emailTo ? ` a ${emailTo}` : "";
    send({ t: "tool_start", n: "send_email", desc: `Enviando reporte${dest}` });
    const r = await execSendEmail(
      `📊 Assessment · Reporte Ejecutivo — ${new Date().toLocaleDateString("es-GT")}`,
      cleaned,   // el análisis completo como cuerpo del email
      emailTo,
    );
    send({ t: "tool_done", n: "send_email", ok: r.ok, error: r.error });
    const to = (r as { to?: string }).to;
    const statusMsg = r.ok
      ? `\n\n✅ Reporte enviado por correo${to ? ` a **${to}**` : ""}.`
      : `\n\n❌ Error enviando email: ${r.error}`;
    send({ t: "text", d: statusMsg });
  }
  if (wantsPresentation && cleaned.length > 50) {
    send({ t: "tool_start", n: "create_presentation", desc: "Preparando presentación con datos reales…" });
    // Pasar el análisis de la IA para enriquecer el contenido de la presentación
    const contenidoDB = await buildPresentationFromDB(question, send, cleaned);
    const r = await execCreatePresentation(contenidoDB, session_id, send);
    send({ t: "tool_done", n: "create_presentation", ok: r.ok, gammaUrl: r.url, error: r.error });
    const statusMsg = r.ok
      ? `\n\n🎯 Presentación lista en Gamma.app`
      : `\n\n❌ Error creando presentación: ${r.error}`;
    send({ t: "text", d: statusMsg });
  }
  if (wantsInfographic) {
    // Detectar tema automáticamente
    const tema = /proyecto/i.test(q) ? "proyectos_atrasados"
               : /indicad/i.test(q)  ? "indicadores_criticos"
               : /semáf|semafor/i.test(q) ? "semaforos"
               : "resumen_ejecutivo";
    const titulo = /proyecto/i.test(q)     ? "Estado de Proyectos Estratégicos"
                 : /indicad/i.test(q)       ? "Indicadores Críticos de Gestión"
                 : /semáf|semafor/i.test(q) ? "Distribución de Semáforos"
                 : "Resumen Ejecutivo — Planeación Estratégica";
    const r = await execCreateInfographic(tema, titulo, undefined, send, session_id);
    send({ t: "tool_done", n: "create_infographic", ok: r.ok, imageUrl: r.imageUrl, error: r.error });
    const statusMsg = r.ok
      ? `\n\n🖼️ Infografía generada con éxito.`
      : `\n\n❌ Error creando infografía: ${r.error}`;
    send({ t: "text", d: statusMsg });
  }

  return totalTokens;
}

// ─── Main route ───────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const body = await req.json() as {
    pregunta:     string;
    historial?:   { role: string; content: string }[];
    session_id?:  string;
    agent_mode?:  boolean;
    attachments?: AttachmentCtx[];
  };

  const pregunta    = (body.pregunta || "").trim();
  const historial   = body.historial  || [];
  const session_id  = body.session_id || uuidv4();
  const agentMode   = body.agent_mode === true;
  const attachments = body.attachments || [];

  if (!pregunta) return new Response(JSON.stringify({ error: "Pregunta requerida" }), { status: 400 });

  const cfg = await getConfig();
  const provider = (cfg.chat_provider || process.env.CHAT_PROVIDER || "claude").toLowerCase();
  const isOllama = provider === "ollama";
  const isClaude = provider === "claude" || provider === "anthropic";

  const claudeModel = cfg.claude_model  || process.env.ANTHROPIC_MODEL_SONNET || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const ollamaModel = cfg.ollama_model  || process.env.OLLAMA_MODEL  || "llama3.2";
  const ollamaUrl   = (cfg.ollama_base_url || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const apiKey      = process.env.ANTHROPIC_API_KEY;

  if (isClaude && !apiKey) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }), { status: 400 });
  if (!isClaude && !isOllama) return new Response(
    JSON.stringify({ error: `Proveedor "${provider}" no soportado. Usa Claude u Ollama en Configuración.` }),
    { status: 400 }
  );

  const encoder      = new TextEncoder();
  const systemPrompt = buildSystemPrompt(agentMode, attachments);
  const activeModel  = isClaude ? claudeModel : ollamaModel;
  const activeProvider = isClaude ? "claude" : "ollama";

  const readable = new ReadableStream({
    async start(controller) {
      const send = (ev: SSEEvent) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`)); } catch { /* closed */ }
      };

      // ── Interceptor para recolectar texto y gráficas para el log ──────────
      let logText   = "";
      let logCharts: string[] = [];
      const loggingSend = (ev: SSEEvent) => {
        send(ev);
        if (ev.t === "text")      logText += ev.d ?? "";
        if (ev.t === "tool_done" && ev.chartPath) logCharts.push(ev.chartPath);
      };

      try {
        let tokens = 0;

        // Registrar la pregunta del usuario ANTES de procesar
        await logChat({ session_id, rol: "user", contenido: pregunta });

        if (isClaude) {
          const messages: Anthropic.MessageParam[] = [
            ...historial.slice(-10).map(h => ({
              role: (h.role === "user" ? "user" : "assistant") as "user" | "assistant",
              content: h.content,
            })),
            { role: "user", content: pregunta },
          ];
          tokens = await runClaude(messages, systemPrompt, apiKey!, claudeModel, loggingSend, session_id);

        } else if (isOllama) {
          const msgs: OAIMsg[] = historial.slice(-6).map(h => ({
            role: h.role === "user" ? "user" : "assistant",
            content: h.content,
          }));
          tokens = await runOllama(pregunta, msgs, systemPrompt, ollamaUrl, ollamaModel, loggingSend, session_id);
        }

        // Registrar respuesta de la IA
        await logChat({
          session_id,
          rol:           "assistant",
          contenido:     logText.trim(),
          proveedor:     activeProvider,
          modelo:        activeModel,
          tokens_usados: tokens,
          grafica_path:  logCharts.length > 0 ? logCharts[0] : null,
          chunks_usados: logCharts.length > 1 ? JSON.stringify(logCharts) : null,
        });

        send({ t: "done", tokens, provider: activeProvider, model: activeModel, session_id });

      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        const isAbort   = e.name === "AbortError";
        const isTimeout = e.name === "TimeoutError" || e.message.includes("timeout") || e.message.includes("aborted");

        let friendlyMsg: string;
        if (isAbort) {
          friendlyMsg = "La consulta fue cancelada.";
        } else if (isTimeout) {
          friendlyMsg = "El servidor de IA tardó demasiado. Intenta de nuevo o simplifica la pregunta.";
        } else if (e.message.includes("ANTHROPIC") || e.message.includes("401") || e.message.includes("403")) {
          friendlyMsg = "Error de autenticación con la API. Verifica la clave en Configuración.";
        } else if (e.message.includes("ECONNREFUSED") || e.message.includes("fetch")) {
          friendlyMsg = "No se pudo conectar con el servidor de IA. Verifica que esté activo.";
        } else {
          friendlyMsg = "Ocurrió un error inesperado. Intenta de nuevo.";
        }

        send({ t: "text", d: friendlyMsg });
        // Loguear el error como respuesta de la IA (para que quede en auditoría)
        if (!isAbort) {
          await logChat({
            session_id,
            rol:       "assistant",
            contenido: `[ERROR] ${friendlyMsg}`,
            proveedor: activeProvider,
            modelo:    activeModel,
            tokens_usados: 0,
          });
        }
        send({ t: "done", tokens: 0, provider: activeProvider, model: activeModel, session_id });
      }

      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
