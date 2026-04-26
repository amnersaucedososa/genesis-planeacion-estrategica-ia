import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import pool from "@/lib/db";
import { getAssessmentRoot } from "@/lib/assessmentRoot";

export async function GET() {
  try {
    // Get most recent run_logs entry
    const [runs] = (await pool.query(
      "SELECT run_id, fuentes_usadas, created_at FROM run_logs ORDER BY created_at DESC LIMIT 1"
    )) as unknown as [
      Array<{ run_id: string; fuentes_usadas: string | null; created_at: string }>
    ];
    const run = runs[0] ?? null;

    let fuentes: string[] = [];
    if (run?.fuentes_usadas) {
      try {
        const parsed = JSON.parse(run.fuentes_usadas);
        fuentes = Array.isArray(parsed) ? parsed : [String(parsed)];
      } catch {
        fuentes = [String(run.fuentes_usadas)];
      }
    }

    // Scan data/mock_api/ folder
    const assessmentRoot = getAssessmentRoot();
    const mockApiDir = path.join(assessmentRoot, "data", "mock_api");

    const mockApiFiles: Array<{ name: string; size: number; records: number }> =
      [];

    if (fs.existsSync(mockApiDir)) {
      const files = fs.readdirSync(mockApiDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = path.join(mockApiDir, file);
        const stat = fs.statSync(filePath);
        let records = 0;
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(content);
          records = Array.isArray(parsed)
            ? parsed.length
            : typeof parsed === "object" && parsed !== null
            ? Object.keys(parsed).length
            : 0;
        } catch {
          records = 0;
        }
        mockApiFiles.push({ name: file, size: stat.size, records });
      }
    }

    return NextResponse.json({
      fuentes,
      mock_api_files: mockApiFiles,
      run_id: run?.run_id ?? null,
      created_at: run?.created_at ?? null,
    });
  } catch (err) {
    console.error("sources error:", err);
    return NextResponse.json(
      { error: "Error al obtener fuentes" },
      { status: 500 }
    );
  }
}
