import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAssessmentRoot } from "@/lib/assessmentRoot";
import { sendReportEmail } from "@/lib/sendReport";

export const maxDuration = 300;

export async function POST(req: Request): Promise<NextResponse> {
  const form = await req.formData();
  const files = form.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ error: "No se recibieron archivos (campo: files)" }, { status: 400 });
  }

  const root = getAssessmentRoot();
  const uploadId = randomUUID();
  const uploadDir = path.join(root, "data", "uploads", uploadId);
  await fs.mkdir(uploadDir, { recursive: true });

  let sqlitePath: string | null = null;

  for (const file of files) {
    if (!file || typeof file.arrayBuffer !== "function") continue;
    const name = file.name || "archivo";
    const buf = Buffer.from(await file.arrayBuffer());
    const dest = path.join(uploadDir, name);
    await fs.writeFile(dest, buf);
    if (name.toLowerCase().endsWith(".db") || name.toLowerCase().endsWith(".sqlite")) {
      sqlitePath = dest;
    }
  }

  const args = ["pipeline/run.py", "--data-dir", uploadDir];
  if (sqlitePath) {
    args.push("--sqlite", sqlitePath);
  }

  return new Promise<NextResponse>((resolve) => {
    const py = spawn(process.env.PYTHON_BIN || "python3", args, {
      cwd: root,
      env: {
        ...process.env,
        PYTHONPATH: root,
        PYTHONUNBUFFERED: "1",
      },
    });

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    py.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    py.on("error", (err) => {
      resolve(
        NextResponse.json(
          { error: "No se pudo ejecutar Python", details: err.message },
          { status: 500 }
        )
      );
    });
    py.on("close", (code) => {
      if (code !== 0) {
        resolve(
          NextResponse.json(
            {
              error: "Pipeline falló",
              details: stderr.slice(0, 1200) || stdout.slice(0, 500),
              code,
            },
            { status: 500 }
          )
        );
        return;
      }
      const lines = stdout.trim().split("\n").filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";
      try {
        const result = JSON.parse(lastLine);
        // Enviar reporte por email en background
        if (result.run_id) {
          sendReportEmail(result.run_id).catch((e) =>
            console.warn("[email report upload]", e)
          );
        }
        resolve(NextResponse.json({ ...result, upload_dir: uploadDir }));
      } catch {
        resolve(
          NextResponse.json({
            status: "completed",
            raw: stdout.slice(0, 400),
            upload_dir: uploadDir,
          })
        );
      }
    });
  });
}
