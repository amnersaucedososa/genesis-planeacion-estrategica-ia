import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    // Ultimo run
    const [runs] = await pool.query(
      "SELECT * FROM run_logs ORDER BY created_at DESC LIMIT 1"
    ) as any[];
    const ultimoRun = runs[0] || null;

    if (!ultimoRun) {
      return NextResponse.json({ hasData: false });
    }

    const run_id = ultimoRun.run_id;

    // Resumen semaforos indicadores
    const [semIndicadores] = await pool.query(
      `SELECT semafor, COUNT(*) as total
       FROM indicadores_fact WHERE run_id = ?
       GROUP BY semafor`,
      [run_id]
    ) as any[];

    // Resumen semaforos proyectos
    const [semProyectos] = await pool.query(
      `SELECT semafor, COUNT(*) as total
       FROM proyectos_fact WHERE run_id = ?
       GROUP BY semafor`,
      [run_id]
    ) as any[];

    // Top alertas rojas
    const [topAlertas] = await pool.query(
      `SELECT a.*,
       ABS(a.desviacion_pct) as desv_abs
       FROM alertas a
       WHERE a.run_id = ? AND a.semafor IN ('rojo','amarillo')
       ORDER BY CASE a.semafor WHEN 'rojo' THEN 1 ELSE 2 END,
                ABS(a.desviacion_pct) DESC
       LIMIT 8`,
      [run_id]
    ) as any[];

    // Indicadores con mas periodos en rojo
    const [indRojos] = await pool.query(
      `SELECT f.indicador_id, d.nombre, f.periodo,
              f.meta, f.realizado, f.desviacion_pct, f.semafor
       FROM indicadores_fact f
       JOIN indicadores_dim d ON d.indicador_id = f.indicador_id AND d.run_id = f.run_id
       WHERE f.run_id = ? AND f.semafor = 'rojo'
       ORDER BY ABS(f.desviacion_pct) DESC
       LIMIT 5`,
      [run_id]
    ) as any[];

    // Proyectos atrasados
    const [proyRetra] = await pool.query(
      `SELECT f.proyecto_id, d.nombre, f.periodo,
              f.avance_planificado_pct, f.avance_real_pct, f.desviacion_pct, f.semafor
       FROM proyectos_fact f
       JOIN proyectos_dim d ON d.proyecto_id = f.proyecto_id AND d.run_id = f.run_id
       WHERE f.run_id = ? AND f.semafor IN ('rojo','amarillo')
       ORDER BY f.desviacion_pct ASC
       LIMIT 5`,
      [run_id]
    ) as any[];

    return NextResponse.json({
      hasData: true,
      run: ultimoRun,
      semaforos: {
        indicadores: semIndicadores,
        proyectos: semProyectos,
      },
      topAlertas,
      indRojos,
      proyRetra,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error en dashboard" }, { status: 500 });
  }
}
