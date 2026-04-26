import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const maxDuration = 30;

// PDF generado como HTML imprimible (sin deps pesadas como puppeteer)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let run_id = searchParams.get("run_id");

  if (!run_id) {
    const [rowsRaw] = await pool.query(
      "SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1"
    ) as unknown as [unknown[], unknown];
    run_id = (rowsRaw as { run_id: string }[])[0]?.run_id ?? null;
  }
  if (!run_id) return NextResponse.json({ error: "No hay runs" }, { status: 404 });

  const [alertasRaw] = await pool.query(
    "SELECT tipo, nombre_entidad, periodo, semafor, meta, realizado, desviacion_pct, texto_alerta FROM alertas WHERE run_id = ? ORDER BY semafor DESC LIMIT 10",
    [run_id]
  ) as unknown as [unknown[], unknown];
  const alertas = alertasRaw as Record<string, unknown>[];

  const [indStatsRaw] = await pool.query(
    "SELECT semafor, COUNT(*) as total FROM indicadores_fact WHERE run_id=? GROUP BY semafor",
    [run_id]
  ) as unknown as [unknown[], unknown];
  const indStats = indStatsRaw as { semafor: string; total: number }[];

  const [projStatsRaw] = await pool.query(
    "SELECT semafor, COUNT(*) as total FROM proyectos_fact WHERE run_id=? GROUP BY semafor",
    [run_id]
  ) as unknown as [unknown[], unknown];
  const projStats = projStatsRaw as { semafor: string; total: number }[];

  const sem = Object.fromEntries(indStats.map(r => [r.semafor, r.total]));
  const proy = Object.fromEntries(projStats.map(r => [r.semafor, r.total]));

  const colorMap: Record<string, string> = { rojo: '#dc2626', amarillo: '#d97706', verde: '#16a34a' };

  const alertasHTML = alertas.map(a => `
    <div style="border-left:4px solid ${colorMap[String(a.semafor)] || '#999'};padding:12px 16px;margin:12px 0;background:#fafafa;border-radius:0 8px 8px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong style="font-size:14px">${String(a.nombre_entidad)}</strong>
        <span style="background:${colorMap[String(a.semafor)] || '#999'};color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;">${String(a.semafor).toUpperCase()}</span>
      </div>
      <p style="margin:4px 0;font-size:12px;color:#555">Período: ${a.periodo} | Meta: ${a.meta} | Real: ${a.realizado} | Desviación: ${Number(a.desviacion_pct).toFixed(2)}%</p>
      <p style="margin:4px 0;font-size:12px;color:#333">${String(a.texto_alerta || '').slice(0, 300)}</p>
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Reporte Ejecutivo — Assessment</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Arial, sans-serif; color: #111; margin: 0; padding: 0; }
  .header { background: linear-gradient(135deg,#4f46e5,#7c3aed); color:white; padding:24px 32px; }
  .header h1 { margin:0;font-size:22px;font-weight:800; }
  .header p { margin:4px 0 0;opacity:.8;font-size:12px; }
  .section { padding: 20px 32px; }
  .kpis { display:flex;gap:12px;margin:16px 0; }
  .kpi { flex:1;border-radius:12px;padding:16px;text-align:center;color:white; }
  .kpi .num { font-size:28px;font-weight:800;display:block; }
  .kpi .lbl { font-size:11px;opacity:.85; }
  h2 { font-size:15px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:6px; }
  .footer { text-align:center;padding:16px;font-size:10px;color:#9ca3af;border-top:1px solid #f3f4f6; }
</style>
</head>
<body>
<div class="header">
  <h1>⚡ Assessment — Planeación Estratégica</h1>
  <p>Reporte Ejecutivo Automatizado | Run: ${run_id} | ${new Date().toLocaleDateString('es-GT')}</p>
</div>

<div class="section">
  <h2>📊 KPIs del Período</h2>
  <div class="kpis">
    <div class="kpi" style="background:#4f46e5">
      <span class="num">${(sem.verde||0)+(sem.amarillo||0)+(sem.rojo||0)}</span>
      <span class="lbl">Indicadores</span>
    </div>
    <div class="kpi" style="background:#7c3aed">
      <span class="num">${(proy.verde||0)+(proy.amarillo||0)+(proy.rojo||0)}</span>
      <span class="lbl">Proyectos</span>
    </div>
    <div class="kpi" style="background:#dc2626">
      <span class="num">${sem.rojo||0}</span>
      <span class="lbl">Indicadores 🔴</span>
    </div>
    <div class="kpi" style="background:#16a34a">
      <span class="num">${sem.verde||0}</span>
      <span class="lbl">Indicadores 🟢</span>
    </div>
  </div>

  <h2>🚨 Alertas Ejecutivas (Generadas por IA)</h2>
  ${alertasHTML || '<p style="color:#9ca3af">Sin alertas disponibles para este run.</p>'}
</div>

<div class="footer">
  Generado automáticamente por Assessment IA — Multi-LLM (Claude Sonnet + Google Gemini + Ollama) + RAG (ChromaDB)
</div>
</body>
</html>`;

  // Return as HTML that browser can print to PDF
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="reporte_${run_id.slice(0,8)}.html"`,
      "X-Report-Type": "pdf-printable",
    },
  });
}
