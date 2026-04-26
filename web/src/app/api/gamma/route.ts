import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { tema } = await req.json() as { tema?: string };
  const gammaKey = process.env.GAMMA_API_KEY;

  // Get latest run data
  const [runsRaw] = await pool.query(
    "SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1"
  ) as unknown as [unknown[], unknown];
  const runs = runsRaw as { run_id: string }[];
  const run_id = runs[0]?.run_id;

  const alertasRaw = run_id ? (await pool.query(
    "SELECT nombre_entidad, periodo, semafor, desviacion_pct, texto_alerta FROM alertas WHERE run_id=? ORDER BY semafor DESC LIMIT 5",
    [run_id]
  ) as unknown as [unknown[], unknown])[0] : [];

  const semRaw = run_id ? (await pool.query(
    "SELECT semafor, COUNT(*) as total FROM indicadores_fact WHERE run_id=? GROUP BY semafor",
    [run_id]
  ) as unknown as [unknown[], unknown])[0] : [];

  const alertas = alertasRaw as Record<string, unknown>[];
  const sem = semRaw as { semafor: string; total: number }[];

  const semMap = Object.fromEntries((sem || []).map(r => [r.semafor, r.total]));

  // Build presentation outline
  const alertLines = (alertas || []).map(a =>
    `- ${a.nombre_entidad} (${a.periodo}): ${String(a.semafor).toUpperCase()} | Desviación: ${Number(a.desviacion_pct).toFixed(1)}%`
  ).join('\n');

  const outline = `# ${tema || 'Assessment de Planeación Estratégica — Resumen Ejecutivo'}

## Contexto del Análisis
- Sistema Multi-LLM automatizado con Claude Sonnet, Google Gemini y modelos locales Ollama
- Análisis de 3 años de datos históricos (2023–2025)
- Pipeline reproducible: SQLite + Mock API → Detección → Alertas IA → Dashboard

## Estado de Indicadores
- 🟢 En meta: ${semMap.verde || 0} indicadores
- 🟡 Alerta: ${semMap.amarillo || 0} indicadores
- 🔴 Críticos: ${semMap.rojo || 0} indicadores

## Alertas Críticas del Período
${alertLines || '- Sin alertas críticas registradas'}

## Arquitectura Multi-LLM
- Agente 1 (Insights): Google Gemini Flash → genera alertas ejecutivas
- Agente 2 (Chat): Claude Sonnet / Ollama → consultas en lenguaje natural + RAG
- RAG: ChromaDB + sentence-transformers para contexto semántico
- Notificaciones: WhatsApp API + Email HTML ejecutivo

## Recomendaciones Estratégicas
- Priorizar indicadores en rojo con mayor desviación
- Implementar revisiones semanales de proyectos atrasados
- Escalar solución con APIs empresariales en producción

## Próximos Pasos
- Integración con sistemas ERP existentes
- Dashboard en tiempo real con alertas push
- Expansión de modelos IA según necesidades institucionales`;

  // If Gamma API key configured → use real API
  if (gammaKey) {
    try {
      const gammaRes = await fetch("https://api.gamma.app/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${gammaKey}`,
        },
        body: JSON.stringify({
          text: outline,
          theme: "professional",
          format: "presentation",
        }),
      });

      if (gammaRes.ok) {
        const gammaData = await gammaRes.json() as { url?: string; id?: string };
        return NextResponse.json({
          ok: true,
          url: gammaData.url,
          source: "gamma-api",
          outline,
        });
      }
    } catch {
      // fall through to manual link
    }
  }

  // Fallback: Gamma.app import URL (works without API key)
  const encoded = encodeURIComponent(outline);
  const gammaUrl = `https://gamma.app/create?text=${encoded.slice(0, 2000)}`;

  return NextResponse.json({
    ok: true,
    url: gammaUrl,
    source: "gamma-import",
    outline,
    instructions: "Abre el enlace en tu navegador para generar la presentación en Gamma.app",
  });
}
