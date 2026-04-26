import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST() {
  const tables = [
    "chat_history",
    "alertas",
    "embeddings_meta",
    "relacion_indicador_proyecto",
    "proyectos_fact",
    "proyectos_dim",
    "indicadores_fact",
    "indicadores_dim",
    "uploads",
    "run_logs",
  ];

  const results: Record<string, string> = {};

  for (const table of tables) {
    try {
      await pool.query(`DELETE FROM \`${table}\``);
      results[table] = "ok";
    } catch (e) {
      results[table] = `error: ${String(e)}`;
    }
  }

  // Also clear ChromaDB collections by calling Python
  try {
    const { spawn } = await import("child_process");
    const { getAssessmentRoot } = await import("@/lib/assessmentRoot");
    const root = getAssessmentRoot();
    await new Promise<void>((resolve) => {
      const py = spawn(process.env.PYTHON_BIN || "python3", ["-c", `
import sys; sys.path.insert(0, '${root}')
from dotenv import load_dotenv; load_dotenv('${root}/.env')
try:
    import chromadb
    client = chromadb.PersistentClient(path='${root}/chroma_db')
    for col in client.list_collections():
        client.delete_collection(col.name)
    print('chromadb cleared')
except Exception as e:
    print(f'chromadb error: {e}')
      `], { cwd: root });
      py.on("close", () => resolve());
    });
    results["chromadb"] = "ok";
  } catch {
    results["chromadb"] = "skipped";
  }

  return NextResponse.json({ ok: true, cleared: results });
}
