/**
 * GET /api/data/[file]?tabla=indicadores_dim
 * Devuelve las tablas/columnas/muestra de un archivo SQLite o CSV.
 * Llama a Python (pandas_reader) para leer el archivo real.
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getAssessmentRoot } from "@/lib/assessmentRoot";

function runPythonInfo(
  root: string,
  filePath: string
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const script = path.join(root, "pipeline", "file_info_cli.py");
    const py = spawn(process.env.PYTHON_BIN || "python3", [script], {
      cwd: root,
      env: { ...process.env, PYTHONPATH: root, PYTHONUNBUFFERED: "1" },
    });

    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (d) => (stdout += d.toString()));
    py.stderr.on("data", (d) => (stderr += d.toString()));
    py.on("error", (e) => resolve({ ok: false, error: e.message }));
    py.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: stderr.slice(0, 600) });
        return;
      }
      try {
        const lines = stdout.trim().split("\n").filter(Boolean);
        resolve({ ok: true, data: JSON.parse(lines[lines.length - 1]) });
      } catch {
        resolve({ ok: false, error: "JSON inválido del script Python" });
      }
    });

    py.stdin.write(JSON.stringify({ file_path: filePath }));
    py.stdin.end();
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const safeFile = file.replace(/\.\./g, "").replace(/^\//, "");
  const root = getAssessmentRoot();
  const filePath = path.join(root, "data", safeFile);

  const result = await runPythonInfo(root, filePath);
  if (!result.ok) {
    const errMsg = "error" in result ? result.error : "Error desconocido";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
  return NextResponse.json(result.data);
}
