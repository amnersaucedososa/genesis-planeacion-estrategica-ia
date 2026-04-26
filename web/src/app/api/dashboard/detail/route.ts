import { NextResponse } from "next/server";
import pool from "@/lib/db";

// Returns full (unlimited) data for the KPI detail modal
export async function GET() {
  try {
    const [runs] = await pool.query(
      "SELECT * FROM run_logs ORDER BY created_at DESC LIMIT 1"
    ) as any[];
    const ultimoRun = runs[0] || null;
    if (!ultimoRun) return NextResponse.json({ hasData: false });

    const run_id = ultimoRun.run_id;

    const [indRojos] = await pool.query(
      `SELECT f.indicador_id, d.nombre, f.periodo,
              f.meta, f.realizado, f.desviacion_pct, f.semafor
       FROM indicadores_fact f
       JOIN indicadores_dim d ON d.indicador_id = f.indicador_id AND d.run_id = f.run_id
       WHERE f.run_id = ?
       ORDER BY CASE f.semafor WHEN 'rojo' THEN 1 WHEN 'amarillo' THEN 2 ELSE 3 END,
                ABS(f.desviacion_pct) DESC`,
      [run_id]
    ) as any[];

    const [proyRetra] = await pool.query(
      `SELECT f.proyecto_id, d.nombre, f.periodo,
              f.avance_planificado_pct, f.avance_real_pct, f.desviacion_pct, f.semafor
       FROM proyectos_fact f
       JOIN proyectos_dim d ON d.proyecto_id = f.proyecto_id AND d.run_id = f.run_id
       WHERE f.run_id = ?
       ORDER BY CASE f.semafor WHEN 'rojo' THEN 1 WHEN 'amarillo' THEN 2 ELSE 3 END,
                f.desviacion_pct ASC`,
      [run_id]
    ) as any[];

    const [topAlertas] = await pool.query(
      `SELECT a.*, ABS(a.desviacion_pct) as desv_abs
       FROM alertas a
       WHERE a.run_id = ?
       ORDER BY CASE a.semafor WHEN 'rojo' THEN 1 WHEN 'amarillo' THEN 2 ELSE 3 END,
                ABS(a.desviacion_pct) DESC`,
      [run_id]
    ) as any[];

    return NextResponse.json({ hasData: true, indRojos, proyRetra, topAlertas });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error en dashboard/detail" }, { status: 500 });
  }
}
