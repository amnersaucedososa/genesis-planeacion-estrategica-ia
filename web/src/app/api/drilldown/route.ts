import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// Hardcoded rollup weights (not stored in MySQL)
const ROLLUP_CONFIG: Record<
  string,
  { method: string; children: Record<string, number> }
> = {
  I001: {
    method: "SUM_CHILDREN",
    children: { I001A: 1.0, I001B: 1.0, I001C: 1.0 },
  },
  I004: {
    method: "WEIGHTED_AVG",
    children: { I004A: 0.45, I004B: 0.55 },
  },
};

export async function GET(req: NextRequest) {
  const indicadorId = req.nextUrl.searchParams.get("indicador");
  if (!indicadorId) {
    return NextResponse.json(
      { error: "Falta parámetro indicador" },
      { status: 400 }
    );
  }

  try {
    // Get most recent completed run_id
    const [runs] = (await pool.query(
      "SELECT run_id FROM run_logs ORDER BY created_at DESC LIMIT 1"
    )) as unknown as [Array<{ run_id: string }>];
    const run_id = runs[0]?.run_id;
    if (!run_id) {
      return NextResponse.json({ error: "Sin datos de pipeline" }, { status: 404 });
    }

    // Get parent indicator info
    const [padreRows] = (await pool.query(
      `SELECT indicador_id, nombre, unidad, direccion, padre_id, nivel, activo
       FROM indicadores_dim
       WHERE indicador_id = ? AND run_id = ?
       LIMIT 1`,
      [indicadorId, run_id]
    )) as unknown as [Array<Record<string, unknown>>];
    const padre = padreRows[0];
    if (!padre) {
      return NextResponse.json(
        { error: `Indicador ${indicadorId} no encontrado` },
        { status: 404 }
      );
    }

    // Get children from dim table
    const [hijosRows] = (await pool.query(
      `SELECT indicador_id, nombre, unidad, direccion, nivel, activo
       FROM indicadores_dim
       WHERE padre_id = ? AND run_id = ?
       ORDER BY indicador_id`,
      [indicadorId, run_id]
    )) as unknown as [Array<Record<string, unknown>>];

    const rollupCfg = ROLLUP_CONFIG[indicadorId] ?? {
      method: "DEFAULT",
      children: {},
    };

    // For each child, get their last 3 periods of fact data
    const hijosConDatos = await Promise.all(
      hijosRows.map(async (hijo) => {
        const hijoId = hijo.indicador_id as string;

        const [serieRows] = (await pool.query(
          `SELECT periodo, semafor, meta, realizado, desviacion_pct
           FROM indicadores_fact
           WHERE indicador_id = ? AND run_id = ?
           ORDER BY periodo DESC
           LIMIT 3`,
          [hijoId, run_id]
        )) as unknown as [
          Array<{
            periodo: string;
            semafor: string;
            meta: number | null;
            realizado: number | null;
            desviacion_pct: number | null;
          }>
        ];

        // Reverse so oldest first
        const serie = [...serieRows].reverse();
        const ultimo = serieRows[0] ?? null;

        const meta = ultimo ? Number(ultimo.meta ?? 0) : 0;
        const realizado = ultimo ? Number(ultimo.realizado ?? 0) : 0;
        const desviacion_pct =
          ultimo?.desviacion_pct != null
            ? Number(ultimo.desviacion_pct)
            : meta > 0
            ? Math.round(((realizado - meta) / meta) * 1000) / 10
            : 0;

        return {
          indicador_id: hijoId,
          nombre: hijo.nombre as string,
          peso: rollupCfg.children[hijoId] ?? 1.0,
          ultimo_semafor: ultimo?.semafor ?? null,
          ultimo_periodo: ultimo?.periodo ?? null,
          meta,
          realizado,
          desviacion_pct,
          serie: serie.map((s) => ({
            periodo: s.periodo,
            semafor: s.semafor,
            meta: Number(s.meta ?? 0),
            realizado: Number(s.realizado ?? 0),
          })),
        };
      })
    );

    return NextResponse.json({
      padre: {
        indicador_id: padre.indicador_id as string,
        nombre: padre.nombre as string,
        rollup: rollupCfg.method,
      },
      hijos: hijosConDatos,
    });
  } catch (err) {
    console.error("drilldown error:", err);
    return NextResponse.json(
      { error: "Error al obtener drill-down" },
      { status: 500 }
    );
  }
}
