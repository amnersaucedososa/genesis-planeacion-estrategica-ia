import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const run_id_param = searchParams.get("run_id");

  // Get latest run_id if not provided
  let run_id = run_id_param;
  if (!run_id) {
    const [rowsRaw] = await pool.query(
      "SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1"
    ) as unknown as [unknown[], unknown];
    run_id = (rowsRaw as { run_id: string }[])[0]?.run_id ?? null;
  }

  if (!run_id) {
    return NextResponse.json({ error: "No hay runs completados" }, { status: 404 });
  }

  // Fetch data
  const [indicadoresRaw] = await pool.query(
    `SELECT f.indicador_id, d.nombre, f.periodo, f.meta, f.realizado, f.semafor, f.desviacion_pct
     FROM indicadores_fact f
     JOIN indicadores_dim d ON d.indicador_id = f.indicador_id AND d.run_id = f.run_id
     WHERE f.run_id = ? ORDER BY f.indicador_id, f.periodo`,
    [run_id]
  ) as unknown as [unknown[], unknown];
  const indicadores = indicadoresRaw as Record<string, unknown>[];

  const [proyectosRaw] = await pool.query(
    `SELECT f.proyecto_id, d.nombre, f.periodo, f.avance_planificado_pct, f.avance_real_pct, f.semafor, f.desviacion_pct
     FROM proyectos_fact f
     JOIN proyectos_dim d ON d.proyecto_id = f.proyecto_id AND d.run_id = f.run_id
     WHERE f.run_id = ? ORDER BY f.proyecto_id, f.periodo`,
    [run_id]
  ) as unknown as [unknown[], unknown];
  const proyectos = proyectosRaw as Record<string, unknown>[];

  const [alertasRaw] = await pool.query(
    "SELECT tipo, nombre_entidad, periodo, semafor, meta, realizado, desviacion_pct, texto_alerta FROM alertas WHERE run_id = ? ORDER BY created_at DESC",
    [run_id]
  ) as unknown as [unknown[], unknown];
  const alertas = alertasRaw as Record<string, unknown>[];

  // Build CSV-based Excel (simple, no external deps)
  // We'll create a multi-sheet workbook as TSV wrapped in Excel XML
  const xmlSheets = (rows: Record<string, unknown>[], sheetName: string): string => {
    if (!rows || rows.length === 0) return `<Worksheet ss:Name="${sheetName}"><Table></Table></Worksheet>`;
    const cols = Object.keys(rows[0]);
    const header = cols.map(c => `<Cell><Data ss:Type="String">${c}</Data></Cell>`).join('');
    const dataRows = rows.map(row =>
      `<Row>${cols.map(c => {
        const val = row[c];
        const type = typeof val === 'number' ? 'Number' : 'String';
        const safe = String(val ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<Cell><Data ss:Type="${type}">${safe}</Data></Cell>`;
      }).join('')}</Row>`
    ).join('');
    return `<Worksheet ss:Name="${sheetName}"><Table><Row>${header}</Row>${dataRows}</Table></Worksheet>`;
  };

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${xmlSheets(indicadores, "Indicadores")}
  ${xmlSheets(proyectos, "Proyectos")}
  ${xmlSheets(alertas, "Alertas IA")}
</Workbook>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": `attachment; filename="reporte_${run_id.slice(0,8)}.xls"`,
    },
  });
}
