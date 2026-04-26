/**
 * GET /api/data
 * Lista todos los archivos de datos subidos:
 *  - Bases de datos SQLite (.db / .sqlite)
 *  - Documentos CSV / Excel
 *  - Mock API JSONs
 * Incluye metadata de tablas para SQLite (via Python script).
 */
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAssessmentRoot } from "@/lib/assessmentRoot";

type FileEntry = {
  name: string;
  tipo: "sqlite" | "csv" | "excel" | "json" | "otro";
  size: number;
  modified: string;
  path: string;
};

function getTipo(fname: string): FileEntry["tipo"] {
  const lower = fname.toLowerCase();
  if (lower.endsWith(".db") || lower.endsWith(".sqlite")) return "sqlite";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".json")) return "json";
  return "otro";
}

async function scanDir(dir: string, base: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  try {
    const names = await fs.readdir(dir);
    for (const name of names) {
      const full = path.join(dir, name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      if (stat.isDirectory()) continue;
      const tipo = getTipo(name);
      if (tipo === "otro") continue;
      entries.push({
        name,
        tipo,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        path: path.relative(base, full),
      });
    }
  } catch {
    // directorio no existe todavía
  }
  return entries;
}

export async function GET() {
  const root = getAssessmentRoot();
  const dataDir = path.join(root, "data");
  const mockDir = path.join(root, "data", "mock_api");

  // Archivos en data/ (SQLite, CSV, Excel)
  const dataFiles = await scanDir(dataDir, root);

  // Archivos en mock_api/ (JSON)
  const mockFiles = await scanDir(mockDir, root);

  // Runs recientes (para mostrar historial)
  let runs: unknown[] = [];
  try {
    const { default: pool } = await import("@/lib/db");
    const [rows] = await pool.query(
      `SELECT run_id, status, total_indicadores, total_proyectos,
              alertas_generadas, created_at, finished_at
       FROM run_logs ORDER BY created_at DESC LIMIT 10`
    ) as unknown[][];
    runs = rows as unknown[];
  } catch {
    // MySQL no disponible
  }

  return NextResponse.json({
    data: {
      bases_datos: dataFiles.filter((f) => f.tipo === "sqlite"),
      documentos: dataFiles.filter((f) => f.tipo === "csv" || f.tipo === "excel"),
      mock_api: mockFiles.filter((f) => f.tipo === "json"),
    },
    runs,
  });
}
