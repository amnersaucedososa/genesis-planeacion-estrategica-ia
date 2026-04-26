/**
 * GET /api/data/info?file=nombre_del_archivo
 * Lee metadata del archivo en Node.js (sin Python).
 * - SQLite .db  → consulta MySQL (datos ya cargados por el pipeline)
 * - CSV / Excel → parsea el archivo directo
 * - JSON        → lee y muestra muestra
 */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAssessmentRoot } from "@/lib/assessmentRoot";
import pool from "@/lib/db";

// ── CSV parser mínimo (sin dependencias externas) ─────────────────────────────
function parseCsv(text: string, maxRows = 8) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (!lines.length) return { columnas: [], filas: 0, muestra: [] };
  const header = lines[0].split(",").map((c) => c.replace(/"/g, "").trim());
  const rows = lines.slice(1, maxRows + 1).map((line) => {
    const vals = line.split(",").map((v) => v.replace(/"/g, "").trim());
    return Object.fromEntries(header.map((h, i) => [h, vals[i] ?? ""]));
  });
  return { columnas: header, filas: lines.length - 1, muestra: rows };
}

// ── SQLite via MySQL (datos ya indexados por el pipeline) ─────────────────────
async function sqliteInfoFromMySQL() {
  const [runs] = await pool.query(
    "SELECT run_id FROM run_logs WHERE status='completed' ORDER BY created_at DESC LIMIT 1"
  ) as unknown[][];
  const run_id = (runs as { run_id: string }[])[0]?.run_id;
  if (!run_id) return null;

  const q = (sql: string) =>
    pool.query(sql, [run_id]).then(([r]) => r as Record<string, unknown>[]);

  const [indDim, indFact, proyDim, proyFact, rels] = await Promise.all([
    q("SELECT indicador_id, nombre, unidad, direccion, nivel FROM indicadores_dim WHERE run_id=? LIMIT 8"),
    q("SELECT indicador_id, periodo, meta, realizado, semafor, desviacion_pct FROM indicadores_fact WHERE run_id=? LIMIT 8"),
    q("SELECT proyecto_id, nombre, responsable, fecha_inicio, fecha_fin_plan FROM proyectos_dim WHERE run_id=? LIMIT 8"),
    q("SELECT proyecto_id, periodo, avance_planificado_pct, avance_real_pct, semafor FROM proyectos_fact WHERE run_id=? LIMIT 8"),
    q("SELECT indicador_id, proyecto_id FROM relacion_indicador_proyecto WHERE run_id=? LIMIT 8"),
  ]);

  const [counts] = await Promise.all([
    pool.query(
      `SELECT
        (SELECT COUNT(*) FROM indicadores_dim WHERE run_id=?) as ind_dim,
        (SELECT COUNT(*) FROM indicadores_fact WHERE run_id=?) as ind_fact,
        (SELECT COUNT(*) FROM proyectos_dim WHERE run_id=?) as proy_dim,
        (SELECT COUNT(*) FROM proyectos_fact WHERE run_id=?) as proy_fact,
        (SELECT COUNT(*) FROM relacion_indicador_proyecto WHERE run_id=?) as rels`,
      [run_id, run_id, run_id, run_id, run_id]
    ).then(([r]) => (r as Record<string, number>[])[0]),
  ]);

  const c = counts as Record<string, number>;
  return {
    tipo: "sqlite",
    run_id,
    tablas: {
      indicadores_dim: {
        columnas: indDim.length ? Object.keys(indDim[0]) : [],
        filas: c.ind_dim ?? 0,
        muestra: indDim,
      },
      indicadores_fact: {
        columnas: indFact.length ? Object.keys(indFact[0]) : [],
        filas: c.ind_fact ?? 0,
        muestra: indFact,
      },
      proyectos_dim: {
        columnas: proyDim.length ? Object.keys(proyDim[0]) : [],
        filas: c.proy_dim ?? 0,
        muestra: proyDim,
      },
      proyectos_fact: {
        columnas: proyFact.length ? Object.keys(proyFact[0]) : [],
        filas: c.proy_fact ?? 0,
        muestra: proyFact,
      },
      relacion_indicador_proyecto: {
        columnas: rels.length ? Object.keys(rels[0]) : [],
        filas: c.rels ?? 0,
        muestra: rels,
      },
    },
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const file = (searchParams.get("file") || "").replace(/\.\./g, "");
  if (!file) return NextResponse.json({ error: "Falta parámetro file" }, { status: 400 });

  const ext = path.extname(file).toLowerCase();
  const root = getAssessmentRoot();

  try {
    // ── SQLite: lee de MySQL (ya procesado) ─────────────────────────────
    if (ext === ".db" || ext === ".sqlite") {
      const info = await sqliteInfoFromMySQL();
      if (!info) return NextResponse.json({ error: "No hay pipeline ejecutado aún" }, { status: 404 });
      return NextResponse.json(info);
    }

    // ── CSV / Excel: lee el archivo directamente ─────────────────────────
    if (ext === ".csv" || ext === ".xlsx" || ext === ".xls") {
      // Busca en data/ primero, luego data/uploads/
      let filePath = path.join(root, "data", file);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(root, "data", "uploads", file);
      }
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
      }

      if (ext === ".csv") {
        const text = fs.readFileSync(filePath, "utf-8");
        return NextResponse.json({ tipo: "csv", ...parseCsv(text) });
      }
      // Excel: sin deps nativas — devolvemos solo metadata
      const stat = fs.statSync(filePath);
      return NextResponse.json({
        tipo: "excel",
        mensaje: "Preview de Excel requiere el pipeline. Sube el archivo para procesarlo.",
        size: stat.size,
      });
    }

    // ── JSON (mock API) ─────────────────────────────────────────────────
    if (ext === ".json") {
      let filePath = path.join(root, "data", "mock_api", file);
      if (!fs.existsSync(filePath)) filePath = path.join(root, "data", file);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
      }
      // Sanitize invalid JSON values (NaN, Infinity) before parsing
      const rawText = fs.readFileSync(filePath, "utf-8")
        .replace(/:\s*NaN\b/g, ": null")
        .replace(/:\s*Infinity\b/g, ": null")
        .replace(/:\s*-Infinity\b/g, ": null");
      const raw = JSON.parse(rawText) as unknown;
      if (Array.isArray(raw) && raw.length > 0) {
        const cols = typeof raw[0] === "object" && raw[0] !== null ? Object.keys(raw[0]) : [];
        return NextResponse.json({
          tipo: "json",
          columnas: cols,
          filas: raw.length,
          muestra: raw.slice(0, 8),
        });
      }
      return NextResponse.json({ tipo: "json", data: raw });
    }

    return NextResponse.json({ error: `Tipo no soportado: ${ext}` }, { status: 400 });
  } catch (err) {
    console.error("[/api/data/info]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
