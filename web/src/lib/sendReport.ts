/**
 * Genera y envía el reporte HTML ejecutivo por correo al finalizar el pipeline.
 * Usa nodemailer con las credenciales SMTP guardadas en app_config.
 */
import nodemailer from "nodemailer";
import pool from "./db";
import { getConfig } from "./settings";

// ── Types ─────────────────────────────────────────────────────────────────────
type AlertRow = {
  id: number;
  tipo: string;
  nombre_entidad: string;
  periodo: string;
  semafor: "verde" | "amarillo" | "rojo";
  desviacion_pct: number | null;
  texto_alerta: string | null;
};
type SemRow = { semafor: string; total: number };

// ── Color helpers ─────────────────────────────────────────────────────────────
const SEM_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  rojo:     { bg: "#FEE2E2", text: "#991B1B", label: "ROJO" },
  amarillo: { bg: "#FEF9C3", text: "#92400E", label: "AMARILLO" },
  verde:    { bg: "#D1FAE5", text: "#065F46", label: "VERDE" },
};

function semBadge(s: string) {
  const c = SEM_COLORS[s] ?? SEM_COLORS.verde;
  return `<span style="
    display:inline-block;background:${c.bg};color:${c.text};
    font-size:10px;font-weight:700;letter-spacing:.05em;
    padding:2px 8px;border-radius:99px;text-transform:uppercase;
  ">${c.label}</span>`;
}

function semDot(s: string) {
  const colors: Record<string, string> = { rojo: "#EF4444", amarillo: "#F59E0B", verde: "#10B981" };
  const c = colors[s] ?? "#10B981";
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};vertical-align:middle;margin-right:4px;"></span>`;
}

// ── Build HTML email ──────────────────────────────────────────────────────────
function buildEmailHtml(opts: {
  run_id: string;
  created_at: string;
  total_indicadores: number;
  total_proyectos: number;
  alertas_generadas: number;
  semIndicadores: SemRow[];
  semProyectos: SemRow[];
  alertas: AlertRow[];
}) {
  const {
    run_id, created_at, total_indicadores, total_proyectos,
    alertas_generadas, semIndicadores, semProyectos, alertas,
  } = opts;

  const indMap = Object.fromEntries(semIndicadores.map((r) => [r.semafor, Number(r.total)]));
  const proyMap = Object.fromEntries(semProyectos.map((r) => [r.semafor, Number(r.total)]));
  const healthScore = total_indicadores > 0
    ? Math.round(((indMap.verde ?? 0) / total_indicadores) * 100)
    : 0;

  const healthColor = healthScore >= 70 ? "#059669" : healthScore >= 50 ? "#D97706" : "#DC2626";

  const now = new Date(created_at).toLocaleString("es-GT", {
    dateStyle: "full", timeStyle: "short",
  });

  const semBar = (rows: SemRow[]) => {
    const total = rows.reduce((a, r) => a + Number(r.total), 0) || 1;
    const map = Object.fromEntries(rows.map((r) => [r.semafor, Number(r.total)]));
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">
        ${(["verde","amarillo","rojo"] as const).map((s) => {
          const val = map[s] ?? 0;
          const pct = Math.round((val / total) * 100);
          const c = SEM_COLORS[s];
          return `<tr>
            <td width="80" style="font-size:11px;color:#6B7280;padding:3px 0">${s.charAt(0).toUpperCase() + s.slice(1)}</td>
            <td>
              <div style="background:#F3F4F6;border-radius:99px;height:8px;overflow:hidden">
                <div style="background:${s === "verde" ? "#10B981" : s === "amarillo" ? "#F59E0B" : "#EF4444"};height:8px;width:${pct}%;border-radius:99px"></div>
              </div>
            </td>
            <td width="60" style="text-align:right;font-size:11px;font-weight:700;color:${c.text};padding:3px 0 3px 8px">${val} (${pct}%)</td>
          </tr>`;
        }).join("")}
      </table>`;
  };

  const alertCards = alertas
    .slice(0, 6)
    .map((a) => {
      const c = SEM_COLORS[a.semafor] ?? SEM_COLORS.verde;
      const preview = (a.texto_alerta ?? "")
        .replace(/#{1,3}\s*/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .slice(0, 300)
        .trim();
      return `
      <div style="border:1px solid ${a.semafor === "rojo" ? "#FECACA" : a.semafor === "amarillo" ? "#FDE68A" : "#A7F3D0"};
                  border-radius:12px;padding:16px;margin-bottom:12px;background:${c.bg}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;gap:8px">
          <div>
            ${semBadge(a.semafor)}
            <span style="font-size:10px;color:#6B7280;margin-left:6px">${a.tipo} · ${a.periodo}</span>
            <p style="margin:6px 0 0;font-size:14px;font-weight:700;color:#111827">${a.nombre_entidad}</p>
          </div>
          ${a.desviacion_pct != null
            ? `<div style="text-align:right;flex-shrink:0">
                <p style="font-size:18px;font-weight:800;color:${c.text};margin:0">${Number(a.desviacion_pct) > 0 ? "+" : ""}${Number(a.desviacion_pct).toFixed(1)}%</p>
                <p style="font-size:10px;color:#9CA3AF;margin:2px 0 0">desviación</p>
               </div>`
            : ""}
        </div>
        ${preview ? `<p style="font-size:12px;color:#374151;margin:0;line-height:1.6">${preview}${a.texto_alerta && a.texto_alerta.length > 300 ? "…" : ""}</p>` : ""}
        ${a.texto_alerta
          ? `<p style="font-size:11px;color:#6B7280;margin:8px 0 0">
               💡 <em>Análisis generado por Claude Haiku</em>
             </p>`
          : ""}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">

<div style="max-width:640px;margin:32px auto;padding:0 16px">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);border-radius:16px 16px 0 0;padding:32px;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.15);padding:6px 16px;border-radius:99px;margin-bottom:16px">
      <span style="font-size:13px;font-weight:700;color:white;letter-spacing:.05em">⚡ ASSESSMENT · PLANEACIÓN ESTRATÉGICA</span>
    </div>
    <h1 style="margin:0;font-size:26px;font-weight:800;color:white">Reporte Ejecutivo</h1>
    <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,.75)">${now}</p>
    <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,.5);font-family:monospace">run: ${run_id.slice(0, 8)}…</p>
  </div>

  <!-- AI AGENTS STRIP -->
  <div style="background:#1E1B4B;padding:12px 24px;display:flex;gap:0;justify-content:center">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="text-align:center;padding:4px 8px;border-right:1px solid rgba(255,255,255,.1)">
          <p style="margin:0;font-size:11px;font-weight:700;color:#A5B4FC">🧠 Agente 1</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(255,255,255,.5)">Claude Haiku</p>
        </td>
        <td style="text-align:center;padding:4px 8px;border-right:1px solid rgba(255,255,255,.1)">
          <p style="margin:0;font-size:11px;font-weight:700;color:#C4B5FD">✨ Agente 2</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(255,255,255,.5)">Claude Sonnet</p>
        </td>
        <td style="text-align:center;padding:4px 8px;border-right:1px solid rgba(255,255,255,.1)">
          <p style="margin:0;font-size:11px;font-weight:700;color:#6EE7B7">🗄️ RAG</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(255,255,255,.5)">ChromaDB</p>
        </td>
        <td style="text-align:center;padding:4px 8px">
          <p style="margin:0;font-size:11px;font-weight:700;color:#6EE7B7">📱 WhatsApp</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(255,255,255,.5)">Notificado</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- KPI CARDS -->
  <div style="background:white;padding:24px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">
    <table width="100%" cellpadding="0" cellspacing="8">
      <tr>
        <td width="25%" style="background:linear-gradient(135deg,#2563EB,#3B82F6);border-radius:12px;padding:16px;text-align:center">
          <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.05em">Indicadores</p>
          <p style="margin:4px 0;font-size:28px;font-weight:800;color:white">${total_indicadores}</p>
        </td>
        <td width="25%" style="background:linear-gradient(135deg,#7C3AED,#8B5CF6);border-radius:12px;padding:16px;text-align:center">
          <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.05em">Proyectos</p>
          <p style="margin:4px 0;font-size:28px;font-weight:800;color:white">${total_proyectos}</p>
        </td>
        <td width="25%" style="background:linear-gradient(135deg,#DC2626,#EF4444);border-radius:12px;padding:16px;text-align:center">
          <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.05em">Alertas IA</p>
          <p style="margin:4px 0;font-size:28px;font-weight:800;color:white">${alertas_generadas}</p>
        </td>
        <td width="25%" style="background:${healthScore >= 70 ? "linear-gradient(135deg,#059669,#10B981)" : healthScore >= 50 ? "linear-gradient(135deg,#D97706,#F59E0B)" : "linear-gradient(135deg,#DC2626,#EF4444)"};border-radius:12px;padding:16px;text-align:center">
          <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.05em">Salud</p>
          <p style="margin:4px 0;font-size:28px;font-weight:800;color:white">${healthScore}%</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- SEMAPHORES -->
  <div style="background:white;padding:0 24px 24px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">
    <table width="100%" cellpadding="0" cellspacing="16">
      <tr>
        <td width="50%" style="vertical-align:top;padding-right:12px">
          <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px">
            <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111827">📊 Indicadores de gestión</p>
            ${semBar(semIndicadores)}
          </div>
        </td>
        <td width="50%" style="vertical-align:top;padding-left:12px">
          <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px">
            <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111827">🎯 Proyectos estratégicos</p>
            ${semBar(semProyectos)}
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- ALERTS -->
  <div style="background:white;padding:0 24px 24px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">
    <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#111827">
      🚨 Alertas ejecutivas generadas por IA
    </h2>
    ${alertCards || '<p style="color:#6B7280;font-size:13px">No hay alertas críticas en este período.</p>'}
  </div>

  <!-- FOOTER -->
  <div style="background:#F3F4F6;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;padding:20px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">
      Generado automáticamente por <strong style="color:#6B7280">Assessment · Planeación Estratégica</strong><br>
      Sistema Multi-LLM: Claude Haiku + Claude Sonnet · RAG: ChromaDB · Embeddings locales
    </p>
  </div>

</div>
</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function sendReportEmail(runId: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getConfig();
  if (!cfg.email_to || !cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
    return { ok: false, error: "Email no configurado" };
  }

  try {
    // Fetch run data
    const [runsRaw] = await pool.query(
      "SELECT * FROM run_logs WHERE run_id = ?", [runId]
    ) as unknown as [Record<string, unknown>[], unknown];
    const run = runsRaw[0];
    if (!run) return { ok: false, error: "run_id no encontrado" };

    const [semIndRaw] = await pool.query(
      "SELECT semafor, COUNT(*) as total FROM indicadores_fact WHERE run_id=? GROUP BY semafor", [runId]
    ) as unknown as [SemRow[], unknown];
    const [semProyRaw] = await pool.query(
      "SELECT semafor, COUNT(*) as total FROM proyectos_fact WHERE run_id=? GROUP BY semafor", [runId]
    ) as unknown as [SemRow[], unknown];
    const [alertasRaw] = await pool.query(
      `SELECT id, tipo, nombre_entidad, periodo, semafor, desviacion_pct, texto_alerta
       FROM alertas WHERE run_id=? AND semafor IN ('rojo','amarillo')
       ORDER BY CASE semafor WHEN 'rojo' THEN 1 ELSE 2 END, ABS(desviacion_pct) DESC
       LIMIT 6`, [runId]
    ) as unknown as [AlertRow[], unknown];

    const html = buildEmailHtml({
      run_id:              runId,
      created_at:          String(run.created_at ?? new Date().toISOString()),
      total_indicadores:   Number(run.total_indicadores ?? 0),
      total_proyectos:     Number(run.total_proyectos ?? 0),
      alertas_generadas:   Number(run.alertas_generadas ?? 0),
      semIndicadores:      semIndRaw,
      semProyectos:        semProyRaw,
      alertas:             alertasRaw,
    });

    const transporter = nodemailer.createTransport({
      host:   cfg.smtp_host,
      port:   parseInt(cfg.smtp_port || "587"),
      secure: cfg.smtp_tls === "1" && parseInt(cfg.smtp_port || "587") === 465,
      auth:   { user: cfg.smtp_user, pass: cfg.smtp_pass },
      tls:    { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from:    cfg.email_from || cfg.smtp_user,
      to:      cfg.email_to,
      subject: `📊 Reporte Ejecutivo · Assessment · run ${runId.slice(0, 8)}`,
      html,
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
