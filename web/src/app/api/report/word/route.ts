import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const maxDuration = 30;

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

  const [semaforosRaw] = await pool.query(
    `SELECT semafor, COUNT(*) as total FROM indicadores_fact WHERE run_id = ?
     GROUP BY semafor`,
    [run_id]
  ) as unknown as [unknown[], unknown];
  const semaforos = semaforosRaw as { semafor: string; total: number }[];

  const semMap = Object.fromEntries(semaforos.map(r => [r.semafor, r.total]));

  const semaforColor = (s: string) => s === 'rojo' ? '#dc2626' : s === 'amarillo' ? '#d97706' : '#16a34a';

  const alertasHTML = alertas.map(a => `
    <h3 style="color:${semaforColor(String(a.semafor))}">🔴 ${String(a.nombre_entidad)} — ${String(a.periodo)}</h3>
    <p><b>Meta:</b> ${a.meta} | <b>Real:</b> ${a.realizado} | <b>Desviación:</b> ${Number(a.desviacion_pct).toFixed(2)}%</p>
    <p><b>Semáforo:</b> <span style="color:${semaforColor(String(a.semafor))}">${String(a.semafor).toUpperCase()}</span></p>
    <p>${String(a.texto_alerta || '')}</p>
    <hr/>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: Calibri, Arial, sans-serif; margin: 40px; color: #1a1a1a; }
  h1 { color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 8px; }
  h2 { color: #374151; margin-top: 30px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th { background: #4f46e5; color: white; padding: 8px 12px; text-align: left; }
  td { border: 1px solid #e5e7eb; padding: 8px 12px; }
  tr:nth-child(even) { background: #f9fafb; }
</style>
</head>
<body>
<h1>⚡ Assessment — Planeación Estratégica</h1>
<p>Reporte ejecutivo generado automáticamente | Run ID: ${run_id}</p>

<h2>📊 Resumen de Semáforos</h2>
<table>
<tr><th>Estado</th><th>Indicadores</th></tr>
<tr><td style="color:#16a34a">🟢 Verde</td><td>${semMap.verde || 0}</td></tr>
<tr><td style="color:#d97706">🟡 Amarillo</td><td>${semMap.amarillo || 0}</td></tr>
<tr><td style="color:#dc2626">🔴 Rojo</td><td>${semMap.rojo || 0}</td></tr>
</table>

<h2>🚨 Alertas Ejecutivas (IA)</h2>
${alertasHTML || '<p>Sin alertas disponibles.</p>'}
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "application/msword",
      "Content-Disposition": `attachment; filename="reporte_${run_id.slice(0,8)}.doc"`,
    },
  });
}
